import { MarkdownRenderChild, MarkdownView, TFile, type MarkdownPostProcessorContext, type MarkdownSectionInformation, type Plugin } from "obsidian";

import { hasSideText, isDrawable, type V2Block } from "../format/v2.ts";
import { documentSnapshot, type DocumentSnapshot } from "../layout/documentSnapshot.ts";
import { drawnFrom, isStale, type Drawn } from "../layout/drawn.ts";
import { effectiveWrapSkip } from "../layout/floatOrder.ts";
import { modelFromBlock } from "../layout/model.ts";
import { ViewProjection, type SourceCoverage } from "../layout/viewProjection.ts";
import { layoutIsRendered, renderLayout } from "./layoutView.ts";
import { refContextOf, type RefContext } from "./crossrefView.ts";
import { blockWarning } from "./messages.ts";
import { sectionNoteText } from "./noteText.ts";
import { readingSectionsOfView, readingViewOfSection } from "./obsidianInternals.ts";
import { keepWrapped, keepWrapsBeside, refreshReadingMedia, refreshReadingWrap } from "./readingWrap.ts";
import { renderPrintLayouts } from "./printView.ts";
import { watchEnvironment } from "./viewEnvironment.ts";

const WRAPPING = "vml-rv-wrapping";

interface Parsed {
  snapshot: DocumentSnapshot;
  lines: string[];
  offsets: number[];
  blocks: V2Block[];
  drawn: Drawn;
  wrapped: boolean;
  refs: RefContext | undefined;
}

interface Reader {
  view: MarkdownView;
  file: TFile;
  projection: ViewProjection;
  parsed: Parsed;
  requested: string | null;
  needsRender: boolean;
  markedWrapping: boolean | null;
  timer: number;
  frame: number;
  sections: Map<HTMLElement, InstalledSection>;
  pendingSections: Map<HTMLElement, () => boolean>;
  stopEnvironment: () => void;
}

interface InstalledSection {
  snapshotId: string;
  range: SourceCoverage;
  source: string;
  sourcePath: string;
  drawn: Drawn;
  layoutKey: string;
  context: MarkdownPostProcessorContext;
}

/** Each reader waits for its own host and confirms only sections actually installed in that pane. */
export function registerReadingView(plugin: Plugin): void {
  const readers = new Map<MarkdownView, Reader>();
  const generations = new WeakMap<TFile, number>();
  let unloaded = false;

  const parse = (view: MarkdownView, text: string, previous?: DocumentSnapshot): Parsed => {
    const snapshot = documentSnapshot(text, { file: view.file!, branch: view, path: view.file!.path }, previous);
    const lines = [...snapshot.lines];
    let offset = 0;
    const offsets = lines.map(line => { const start = offset; offset += line.length + 1; return start; });
    const blocks = snapshot.blocks.map(ref => ref.block);
    const refs = blocks.length > 0 ? refContextOf(text) : undefined;
    return { snapshot, lines, offsets, blocks, refs, drawn: drawnFrom(blocks, numbersOf(refs), lines),
      wrapped: blocks.some(block => isDrawable(block) && modelFromBlock(block).wrap !== null) };
  };

  const alive = (reader: Reader): boolean => !unloaded && readers.get(reader.view) === reader
    && reader.view.file === reader.file && reader.view.getMode() === "preview" && reader.view.containerEl.isConnected;

  const markWrapping = (reader: Reader, wrapped: boolean): void => {
    if (reader.markedWrapping === wrapped) return;
    const reading = readingSectionsOfView(reader.view);
    if (!reading) return;
    for (const section of reading.sections) section.el.toggleClass(WRAPPING, wrapped);
    reader.markedWrapping = wrapped;
  };

  const stop = (reader: Reader): void => {
    if (reader.markedWrapping) markWrapping(reader, false);
    const win = reader.view.containerEl.win;
    win.clearTimeout(reader.timer); win.cancelAnimationFrame(reader.frame);
    reader.stopEnvironment(); reader.projection.dispose(); reader.sections.clear(); reader.pendingSections.clear();
    readers.delete(reader.view);
  };

  const confirm = (reader: Reader): void => {
    if (!alive(reader) || reader.frame) return;
    reader.frame = reader.view.containerEl.win.requestAnimationFrame(() => {
      reader.frame = 0;
      if (!alive(reader) || !reader.projection.observeHost(reader.view.getViewData())) return;
      const connected = [...reader.sections].filter(([el]) => el.isConnected && reader.view.containerEl.contains(el));
      for (const [el, record] of connected) {
        if (record.snapshotId === reader.parsed.snapshot.id) continue;
        // The host can retain a section without calling its postprocessors again. Its current
        // section info supplies the new position, including when identical sections move.
        const info = record.context.getSectionInfo(el);
        if (!info || sectionNoteText(plugin.app, record.context, info, el) !== reader.parsed.snapshot.text
          || record.sourcePath !== reader.parsed.snapshot.origin.path
          || isStale(record.drawn, reader.parsed.drawn)
          || record.source !== sectionSource(reader.parsed, info)) continue;
        if (record.layoutKey !== sectionLayoutKey(reader.parsed, info)) {
          // A retained image can now be another row, with different height/caption settings.
          // Ask the host to reinstall it; never confirm the old row's DOM as the new row.
          if (reader.requested !== reader.parsed.snapshot.id) { reader.needsRender = true; wake(reader); }
          continue;
        }
        record.snapshotId = reader.parsed.snapshot.id;
        record.range = sectionRange(reader.parsed, info);
      }
      reader.projection.viewportChanged(connected.map(([, record]) => record.range));
      const token = reader.projection.token()!;
      const reading = readingSectionsOfView(reader.view);
      const byElement = new Map(reading?.sections.map(section => [section.el, section]));
      const installed = connected.filter(([, record]) => record.snapshotId === token.snapshotId);
      reader.projection.installed(token, installed.map(([, record]) => record.range));
      const measured: SourceCoverage[] = [];
      const visible = reader.view.previewMode.containerEl.clientWidth > 0 && reader.view.containerEl.doc.fonts.status === "loaded";
      for (const [el, record] of installed) {
        const section = byElement.get(el);
        const media = Array.from(el.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video"));
        const ready = media.every(item => item.instanceOf(HTMLImageElement) ? item.complete : item.readyState > 0)
          && Array.from(el.querySelectorAll<HTMLElement>(".vml-layout")).every(layoutIsRendered);
        if (visible && section?.computed && section.rendered && section.shown !== false && ready) measured.push(record.range);
      }
      reader.projection.measured(token, measured);
    });
  };

  const wake = (reader: Reader): void => {
    if (!alive(reader)) { stop(reader); return; }
    const win = reader.view.containerEl.win;
    win.clearTimeout(reader.timer); reader.timer = 0;
    if (!reader.projection.observeHost(reader.view.getViewData())) {
      reader.timer = win.setTimeout(() => wake(reader), 150);
      return;
    }
    if (reader.needsRender && reader.requested !== reader.parsed.snapshot.id) {
      reader.requested = reader.parsed.snapshot.id;
      reader.needsRender = false;
      reader.view.previewMode.rerender(true);
    }
    for (const process of [...reader.pendingSections.values()]) process();
    if (!reader.parsed.snapshot.text.includes("<!-- vml")) { stop(reader); return; }
    confirm(reader);
  };

  const getReader = (view: MarkdownView): Reader => {
    const previous = readers.get(view);
    if (previous?.file === view.file) return previous;
    if (previous) stop(previous);
    const parsed = parse(view, view.getViewData());
    const reader: Reader = { view, file: view.file!, parsed, projection: new ViewProjection(), requested: null,
      needsRender: false, markedWrapping: null, timer: 0, frame: 0, sections: new Map(), pendingSections: new Map(), stopEnvironment: () => {} };
    reader.projection.request(parsed.snapshot);
    reader.projection.observeHost(view.getViewData());
    readers.set(view, reader);
    reader.stopEnvironment = watchEnvironment(view.previewMode.containerEl, () => {
      if (!alive(reader)) return;
      reader.projection.environmentChanged();
      const section = [...reader.sections.keys()].find(el => el.isConnected);
      if (section) refreshReadingWrap(plugin.app, section);
      confirm(reader);
    }, media => {
      for (const section of reader.sections.keys()) if (section.contains(media)) { refreshReadingMedia(section, media); break; }
      confirm(reader);
    });
    const scroll = (): void => confirm(reader);
    const mutation = new (view.containerEl.win as Window & typeof window).MutationObserver(scroll);
    mutation.observe(view.previewMode.containerEl, { childList: true, subtree: true });
    view.previewMode.containerEl.addEventListener("scroll", scroll, true);
    const stopEnvironment = reader.stopEnvironment;
    reader.stopEnvironment = () => { stopEnvironment(); mutation.disconnect(); view.previewMode.containerEl.removeEventListener("scroll", scroll, true); };
    return reader;
  };

  const desire = (reader: Reader, text: string): void => {
    if (text === reader.parsed.snapshot.text && reader.file.path === reader.parsed.snapshot.origin.path) { wake(reader); return; }
    const next = parse(reader.view, text, reader.parsed.snapshot);
    reader.needsRender ||= isStale(reader.parsed.drawn, next.drawn)
      || reader.parsed.snapshot.origin.path !== next.snapshot.origin.path;
    reader.parsed = next;
    reader.requested = null;
    reader.projection.request(next.snapshot);
    wake(reader);
  };

  const draw = (reader: Reader, el: HTMLElement, info: MarkdownSectionInformation, ctx: MarkdownPostProcessorContext): void => {
    const { blocks, lines, refs, wrapped, snapshot } = reader.parsed;
    const block = sectionBlock(blocks, info);
    const opening = block?.openLine === info.lineStart && info.lineStart === info.lineEnd;
    if (block && isDrawable(block)) {
      let rows: number[] | undefined;
      if (hasSideText(block) && !opening) el.empty();
      else {
        rows = hasSideText(block) ? undefined : sectionRows(block, info);
        if (rows === undefined || rows.length > 0) {
          const child = new MarkdownRenderChild(el);
          ctx.addChild(child);
          el.empty();
          const model = modelFromBlock(block);
          const root = renderLayout(el, { app: plugin.app, sourcePath: ctx.sourcePath, model,
            effectiveSkip: effectiveWrapSkip(lines, blocks, blocks.indexOf(block)), rowIndices: rows,
            editable: false, warning: blockWarning(block), component: child, refs });
          if (model.wrap !== null) child.register(keepWrapped(plugin.app, el, root, model.wrap));
        }
      }
    }
    el.toggleClass(WRAPPING, wrapped);
    markWrapping(reader, wrapped);
    if (wrapped) keepWrapsBeside(plugin.app, el);
    const record: InstalledSection = { snapshotId: snapshot.id, range: sectionRange(reader.parsed, info),
      source: sectionSource(reader.parsed, info), sourcePath: ctx.sourcePath, drawn: reader.parsed.drawn,
      layoutKey: sectionLayoutKey(reader.parsed, info), context: ctx };
    reader.sections.set(el, record);
    const lifecycle = new MarkdownRenderChild(el);
    ctx.addChild(lifecycle);
    lifecycle.register(() => { if (reader.sections.get(el) === record) reader.sections.delete(el); });
    confirm(reader);
  };

  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const info = ctx.getSectionInfo(el);
    if (!info) return renderPrintLayouts(plugin.app, el, ctx);
    let waitingReader: Reader | null = null;
    let unwatch = (): void => {};
    const finish = (): void => {
      if (waitingReader?.pendingSections.get(el) === process) waitingReader.pendingSections.delete(el);
      waitingReader = null;
      unwatch();
    };
    const process = (): boolean => {
      const view = readingViewOfSection(plugin.app, el);
      if (!view?.file || view.file.path !== ctx.sourcePath) return false;
      const text = sectionNoteText(plugin.app, ctx, info, el);
      if (!text.includes("<!-- vml") && !readers.has(view)) return true;
      const reader = getReader(view);
      if (text !== view.getViewData() || text !== reader.parsed.snapshot.text) {
        if (waitingReader?.pendingSections.get(el) === process) waitingReader.pendingSections.delete(el);
        waitingReader = reader;
        reader.pendingSections.set(el, process);
        return false;
      }
      finish();
      draw(reader, el, info, ctx);
      return true;
    };
    if (!process()) {
      const child = new MarkdownRenderChild(el);
      ctx.addChild(child);
      unwatch = el.onNodeInserted(process);
      child.register(finish);
    }
  });

  const currentReaders = (file: TFile): Reader[] => {
    const result: Reader[] = [];
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file === file && view.getMode() === "preview") result.push(getReader(view));
    }
    return result;
  };

  plugin.registerEvent(plugin.app.workspace.on("editor-change", (editor, view) => {
    if (!(view instanceof MarkdownView) || !view.file) return;
    generations.set(view.file, (generations.get(view.file) ?? 0) + 1);
    const text = editor.getValue();
    if (!text.includes("<!-- vml") && ![...readers.values()].some(reader => reader.file === view.file)) return;
    for (const reader of currentReaders(view.file)) desire(reader, text);
  }));

  const diskChanged = (file: TFile): void => {
    if (!plugin.app.workspace.getLeavesOfType("markdown").some(leaf => leaf.view instanceof MarkdownView && leaf.view.file === file && leaf.view.getMode() === "preview")) return;
    const generation = (generations.get(file) ?? 0) + 1;
    generations.set(file, generation);
    void plugin.app.vault.cachedRead(file).then(data => {
      if (unloaded || generations.get(file) !== generation) return;
      if (!data.includes("<!-- vml") && ![...readers.values()].some(reader => reader.file === file)) return;
      const sources = plugin.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
        .filter((view): view is MarkdownView => view instanceof MarkdownView && view.file === file && view.getMode() === "source");
      if (sources.some(view => view.editor.getValue() !== data)) { for (const reader of currentReaders(file)) wake(reader); return; }
      for (const reader of currentReaders(file)) desire(reader, data);
    }).catch((error: unknown) => {
      if (!unloaded && plugin.app.vault.getAbstractFileByPath(file.path) === file) console.error("Adjustable Media: reading source could not be read", error);
    });
  };
  plugin.registerEvent(plugin.app.vault.on("modify", file => { if (file instanceof TFile) diskChanged(file); }));
  plugin.registerEvent(plugin.app.metadataCache.on("changed", file => diskChanged(file)));
  plugin.registerEvent(plugin.app.vault.on("rename", file => { for (const reader of readers.values()) if (reader.file === file) desire(reader, reader.view.getViewData()); }));
  plugin.registerEvent(plugin.app.vault.on("delete", file => { for (const reader of readers.values()) if (reader.file === file) stop(reader); }));
  const layoutChanged = (): void => {
    for (const reader of readers.values()) { if (!alive(reader)) stop(reader); else wake(reader); }
  };
  plugin.registerEvent(plugin.app.workspace.on("layout-change", layoutChanged));
  plugin.registerEvent(plugin.app.workspace.on("file-open", layoutChanged));
  plugin.app.workspace.onLayoutReady(() => {
    if (unloaded) return;
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.getMode() === "preview") {
        if (!leaf.view.getViewData().includes("<!-- vml")) continue;
        const reader = getReader(leaf.view);
        if (reader.parsed.blocks.some(isDrawable)) { reader.needsRender = true; wake(reader); }
      }
    }
  });
  plugin.register(() => { unloaded = true; for (const reader of readers.values()) stop(reader); });
}

function numbersOf(refs: RefContext | undefined): string { return refs ? `${refs.language} ${refs.index.signature}` : ""; }

function sectionSource(parsed: Parsed, info: MarkdownSectionInformation): string {
  return parsed.lines.slice(info.lineStart, info.lineEnd + 1).join("\n");
}

function sectionRange(parsed: Parsed, info: MarkdownSectionInformation): SourceCoverage {
  return { from: parsed.offsets[info.lineStart] ?? parsed.snapshot.text.length,
    to: parsed.offsets[info.lineEnd + 1] ?? parsed.snapshot.text.length };
}

function sectionBlock(blocks: readonly V2Block[], info: MarkdownSectionInformation): V2Block | undefined {
  const opening = blocks.find(block => info.lineStart === block.openLine && info.lineEnd === block.openLine);
  return opening && hasSideText(opening) ? opening
    : blocks.find(block => info.lineStart > block.openLine && info.lineEnd < block.closeLine);
}

function sectionRows(block: V2Block, info: MarkdownSectionInformation): number[] {
  return block.rows.flatMap((row, index) => row.line >= info.lineStart && row.line <= info.lineEnd ? [index] : []);
}

function sectionLayoutKey(parsed: Parsed, info: MarkdownSectionInformation): string {
  const block = sectionBlock(parsed.blocks, info);
  if (!block || !isDrawable(block)) return "";
  const rows = hasSideText(block) ? info.lineStart === block.openLine ? "columns" : "hidden" : sectionRows(block, info);
  return JSON.stringify([block.lines[0], rows, effectiveWrapSkip(parsed.lines, parsed.blocks, parsed.blocks.indexOf(block))]);
}
