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
import { readingSections, readingViewOfSection } from "./obsidianInternals.ts";
import { keepWrapped, keepWrapsBeside, refreshReadingWrap } from "./readingWrap.ts";
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
  timer: number;
  frame: number;
  sections: Map<HTMLElement, { snapshotId: string; range: SourceCoverage }>;
  stopEnvironment: () => void;
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

  const stop = (reader: Reader): void => {
    const win = reader.view.containerEl.win;
    win.clearTimeout(reader.timer); win.cancelAnimationFrame(reader.frame);
    reader.stopEnvironment(); reader.projection.dispose(); reader.sections.clear();
    readers.delete(reader.view);
  };

  const confirm = (reader: Reader): void => {
    if (!alive(reader) || reader.frame) return;
    reader.frame = reader.view.containerEl.win.requestAnimationFrame(() => {
      reader.frame = 0;
      if (!alive(reader) || !reader.projection.observeHost(reader.view.getViewData())) return;
      const connected = [...reader.sections].filter(([el]) => el.isConnected && reader.view.containerEl.contains(el));
      reader.projection.viewportChanged(connected.map(([, record]) => record.range));
      const token = reader.projection.token()!;
      for (const [el, record] of connected) {
        if (record.snapshotId !== token.snapshotId) continue;
        reader.projection.installed(token, [record.range]);
        const reading = readingSections(plugin.app, el);
        const section = reading?.sections.find(item => item.el === el);
        const media = Array.from(el.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video"));
        const ready = media.every(item => item.instanceOf(HTMLImageElement) ? item.complete : item.readyState > 0)
          && Array.from(el.querySelectorAll<HTMLElement>(".vml-layout")).every(layoutIsRendered);
        if (section?.computed && el.getBoundingClientRect().width > 0 && ready && el.doc.fonts.status === "loaded") {
          reader.projection.measured(token, [record.range]);
        }
      }
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
      reader.view.previewMode.rerender(true);
    }
    confirm(reader);
  };

  const getReader = (view: MarkdownView): Reader => {
    const previous = readers.get(view);
    if (previous?.file === view.file) return previous;
    if (previous) stop(previous);
    const parsed = parse(view, view.getViewData());
    const reader: Reader = { view, file: view.file!, parsed, projection: new ViewProjection(), requested: null,
      needsRender: false, timer: 0, frame: 0, sections: new Map(), stopEnvironment: () => {} };
    reader.projection.request(parsed.snapshot);
    reader.projection.observeHost(view.getViewData());
    readers.set(view, reader);
    reader.stopEnvironment = watchEnvironment(view.previewMode.containerEl, () => {
      if (!alive(reader)) return;
      reader.projection.environmentChanged();
      const section = [...reader.sections.keys()].find(el => el.isConnected);
      if (section) refreshReadingWrap(plugin.app, section);
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
    reader.needsRender ||= isStale(reader.parsed.drawn, next.drawn);
    reader.parsed = next;
    reader.requested = null;
    reader.projection.request(next.snapshot);
    wake(reader);
  };

  const draw = (reader: Reader, el: HTMLElement, info: MarkdownSectionInformation, ctx: MarkdownPostProcessorContext): void => {
    const { blocks, lines, offsets, refs, wrapped, snapshot } = reader.parsed;
    const opening = blocks.find(block => info.lineStart === block.openLine && info.lineEnd === block.openLine);
    const block = opening && hasSideText(opening) ? opening
      : blocks.find(candidate => info.lineStart > candidate.openLine && info.lineEnd < candidate.closeLine);
    if (block && isDrawable(block)) {
      let rows: number[] | undefined;
      if (hasSideText(block) && block !== opening) el.empty();
      else {
        rows = hasSideText(block) ? undefined : block.rows.flatMap((row, index) => row.line >= info.lineStart && row.line <= info.lineEnd ? [index] : []);
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
    const reading = readingSections(plugin.app, el);
    if (reading) for (const section of reading.sections) section.el.toggleClass(WRAPPING, wrapped);
    if (wrapped) keepWrapsBeside(plugin.app, el);
    const from = offsets[info.lineStart] ?? snapshot.text.length;
    const to = offsets[info.lineEnd + 1] ?? snapshot.text.length;
    const record = { snapshotId: snapshot.id, range: { from, to } };
    reader.sections.set(el, record);
    const lifecycle = new MarkdownRenderChild(el);
    ctx.addChild(lifecycle);
    lifecycle.register(() => { if (reader.sections.get(el) === record) reader.sections.delete(el); });
    confirm(reader);
  };

  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const info = ctx.getSectionInfo(el);
    if (!info) return renderPrintLayouts(plugin.app, el, ctx);
    const process = (): boolean => {
      const view = readingViewOfSection(plugin.app, el);
      if (!view?.file || view.file.path !== ctx.sourcePath) return false;
      const text = sectionNoteText(plugin.app, ctx, info, el);
      if (text !== view.getViewData()) return true;
      const reader = getReader(view);
      if (text !== reader.parsed.snapshot.text) return true;
      draw(reader, el, info, ctx);
      return true;
    };
    if (!process()) {
      const child = new MarkdownRenderChild(el);
      ctx.addChild(child);
      const unwatch = el.onNodeInserted(() => { if (process()) unwatch(); });
      child.register(unwatch);
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
      const sources = plugin.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
        .filter((view): view is MarkdownView => view instanceof MarkdownView && view.file === file && view.getMode() === "source");
      if (sources.some(view => view.editor.getValue() !== data)) { for (const reader of currentReaders(file)) wake(reader); return; }
      if (!data.includes("<!-- vml") && ![...readers.values()].some(reader => reader.file === file)) return;
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
        const reader = getReader(leaf.view); reader.needsRender = true; wake(reader);
      }
    }
  });
  plugin.register(() => { unloaded = true; for (const reader of readers.values()) stop(reader); });
}

function numbersOf(refs: RefContext | undefined): string { return refs ? `${refs.language} ${refs.index.signature}` : ""; }
