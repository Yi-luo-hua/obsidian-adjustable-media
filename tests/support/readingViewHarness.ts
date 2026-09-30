import { mockedModule } from "./mockedModule.ts";

import * as format from "../../src/format/v2.ts";
import * as snapshots from "../../src/layout/documentSnapshot.ts";
import * as drawn from "../../src/layout/drawn.ts";
import * as floatOrder from "../../src/layout/floatOrder.ts";
import * as model from "../../src/layout/model.ts";
import * as projections from "../../src/layout/viewProjection.ts";

interface ElementStub {
  isConnected: boolean;
  empty(): void;
  toggleClass(name: string, enabled: boolean): void;
  onNodeInserted(callback: () => void): () => void;
  querySelectorAll(): never[];
}

interface SectionContext {
  sourcePath: string;
  getSectionInfo(): { text: string; lineStart: number; lineEnd: number };
  addChild(child: RenderChild): void;
}

type PostProcessor = (el: ElementStub, context: SectionContext) => void;
type Listener = (...args: unknown[]) => void;

class RenderChild {
  cleanups: Array<() => void> = [];
  register(cleanup: () => void): void { this.cleanups.push(cleanup); }
}

class FileStub { path = "note.md"; }
class ViewStub {}

/** Run the actual adapter; mock only Obsidian and DOM integrations, not source/queue logic. */
export async function readingViewHarness(initialText: string, startup = true) {
  const file = new FileStub();
  let hostText = initialText;
  let diskText = initialText;
  let rerenders = 0;
  const renders: string[] = [];
  let processor: PostProcessor;
  let onReady: () => void;
  const timers = new Map<number, () => void>();
  const frames = new Map<number, () => void>();
  const elements = new Set<ElementStub>();
  const sections: Array<{ el: ElementStub; computed: boolean; rendered: boolean }> = [];
  const counts = { observers: 0, environments: 0, scrollListeners: 0, sectionLookups: 0, classWrites: 0 };
  let scroll = (): void => {};
  class ObserverStub {
    constructor() { counts.observers++; }
    observe(): void {} disconnect(): void {}
  }
  let timerId = 0;
  const listeners = new Map<string, Listener>();
  const cleanups: Array<() => void> = [];
  const win = {
    clearTimeout(id: number) { timers.delete(id); },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    requestAnimationFrame(callback: () => void) { frames.set(++timerId, callback); return timerId; },
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
    MutationObserver: ObserverStub,
  };
  const container = { win, isConnected: true, clientWidth: 720, doc: { fonts: { status: "loaded" } },
    contains(el: ElementStub) { return elements.has(el); },
    addEventListener(name: string, callback: () => void) { if (name === "scroll") { counts.scrollListeners++; scroll = callback; } },
    removeEventListener() {} };
  const reader = Object.assign(new ViewStub(), { file, containerEl: container,
    getMode: () => "preview", getViewData: () => hostText,
    previewMode: { containerEl: container, rerender() { rerenders++; } } });
  const sourceView = Object.assign(new ViewStub(), { file, getMode: () => "source",
    editor: { getValue: () => diskText } });
  const leaves = [{ view: reader }];
  const on = (name: string, callback: Listener): void => { listeners.set(name, callback); };
  const app = {
    workspace: { getLeavesOfType: () => leaves, on, onLayoutReady(callback: () => void) { onReady = callback; } },
    vault: { on, cachedRead: () => Promise.resolve(diskText) },
    metadataCache: { on },
  };
  const plugin = { app,
    registerMarkdownPostProcessor(callback: PostProcessor) { processor = callback; },
    registerEvent() {}, register(callback: () => void) { cleanups.push(callback); } };
  const modules: Record<string, unknown> = {
    obsidian: { MarkdownView: ViewStub, MarkdownRenderChild: RenderChild, TFile: FileStub },
    "../format/v2.ts": format,
    "../layout/documentSnapshot.ts": snapshots,
    "../layout/drawn.ts": drawn,
    "../layout/floatOrder.ts": floatOrder,
    "../layout/model.ts": model,
    "../layout/viewProjection.ts": projections,
    "./layoutView.ts": { renderLayout(_el: ElementStub, options: { model: model.LayoutModel }) {
      renders.push(options.model.rows.flatMap(row => row.items.map(item => item.embed.raw)).join(" ")); return {};
    }, layoutIsRendered: () => true },
    "./crossrefView.ts": { refContextOf: () => undefined },
    "./messages.ts": { blockWarning: () => undefined },
    "./noteText.ts": { sectionNoteText: (_app: unknown, _ctx: unknown, info: { text: string }) => info.text },
    "./obsidianInternals.ts": { readingViewOfSection: () => reader,
      readingSectionsOfView() { counts.sectionLookups++; return { sections, sizer: container }; } },
    "./readingWrap.ts": { keepWrapped: () => () => {}, keepWrapsBeside() {}, refreshReadingWrap() {}, refreshReadingMedia() {} },
    "./printView.ts": { renderPrintLayouts() {} },
    "./viewEnvironment.ts": { watchEnvironment: () => { counts.environments++; return () => {}; } },
  };
  const module = await mockedModule<{ registerReadingView(plugin: unknown): void }>(new URL("../../src/view/readingView.ts", import.meta.url), modules);
  module.registerReadingView(plugin);
  if (startup) onReady!();
  return {
    get rerenders() { return rerenders; },
    renders,
    counts,
    scroll() { scroll(); },
    frame() { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(); },
    setHost(text: string) { hostText = text; },
    edit(text: string) {
      diskText = text;
      listeners.get("editor-change")!(sourceView.editor, sourceView);
    },
    async diskChange(text: string) {
      diskText = text;
      listeners.get("modify")!(file);
      await Promise.resolve();
    },
    tick() {
      const callbacks = [...timers.values()]; timers.clear();
      for (const callback of callbacks) callback();
    },
    section(text: string, lineStart = 1, lineEnd = lineStart) {
      let wrapping = false;
      const children: RenderChild[] = [];
      const inserted = new Set<() => void>();
      const el: ElementStub = { isConnected: true, empty() {}, querySelectorAll: () => [],
        toggleClass(_name, enabled) { counts.classWrites++; wrapping = enabled; },
        onNodeInserted(callback) { inserted.add(callback); return () => inserted.delete(callback); } };
      elements.add(el);
      sections.push({ el, computed: true, rendered: true });
      const process = (sourceText: string): void => {
        processor!(el, { sourcePath: file.path, getSectionInfo: () => ({ text: sourceText, lineStart, lineEnd }),
          addChild(child) { children.push(child); } });
      };
      process(text);
      return { get wrapping() { return wrapping; }, get watchers() { return inserted.size; },
        reprocess: process,
        unloadChild(index: number) { for (const cleanup of children[index].cleanups) cleanup(); },
        insert() { for (const callback of [...inserted]) callback(); },
        dispose() { el.isConnected = false; for (const child of children) for (const cleanup of child.cleanups) cleanup(); } };
    },
    dispose() { for (const cleanup of cleanups) cleanup(); },
  };
}
