import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";
import * as format from "../src/format/v2.ts";

async function harness() {
  const frames = new Map<number, () => void>(), events = new Map<string, Set<() => void>>();
  let id = 0, mutation = (): void => {}, nativeScrolled = (): void => {};
  class Observer {
    constructor(callback: () => void) { mutation = callback; }
    observe() {} disconnect() {}
  }
  const win = { MutationObserver: Observer,
    requestAnimationFrame(callback: () => void) { frames.set(++id, callback); return id; },
    cancelAnimationFrame(key: number) { frames.delete(key); } };
  const container = { win,
    addEventListener(name: string, callback: () => void) { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(callback); },
    removeEventListener(name: string, callback: () => void) { events.get(name)?.delete(callback); } };
  const surface = (base: number) => {
    const scroller = { scrollTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: 600 }) };
    const node = { data: "Unique visible text anchor", get length() { return this.data.length; },
      get textContent() { return this.data; }, parentElement: { closest: () => null }, ownerDocument: {} };
    const result = { base, scroller, root: { clientWidth: 700, doc: {} } };
    const doc = {
      createTreeWalker() { let read = false; return { nextNode: () => read ? null : (read = true, node) }; },
      createRange() { return { setStart() {}, setEnd() {}, getBoundingClientRect: () => ({ top: result.base - scroller.scrollTop }) }; },
    };
    node.ownerDocument = doc; result.root.doc = doc;
    return result;
  };
  const source = surface(120), reading = surface(300);
  class View {
    file = {};
    mode = "source";
    text = '<!-- vml -->\nUnique visible text anchor\n<!-- /vml -->';
    hints: unknown[] = [];
    containerEl = container;
    contentEl = { querySelector: (selector: string) => selector === ".cm-content" ? source.root : source.scroller };
    previewMode = { containerEl: { addClass() {}, removeClass() {}, querySelector: (selector: string) => selector === ".markdown-preview-sizer" ? reading.root : reading.scroller } };
    getMode() { return this.mode; }
    getViewData() { return this.text; }
    setEphemeralState(state: unknown) { this.hints.push(state); }
  }
  const view = new View(), cleanups: Array<() => void> = [];
  const workspace = { getLeavesOfType: () => [{ view }], on: () => undefined, onLayoutReady: (callback: () => void) => callback() };
  const module = await mockedModule<{ registerModeScroll: (plugin: unknown) => void }>(new URL("../src/view/modeScroll.ts", import.meta.url), {
    obsidian: { MarkdownView: View }, "../format/v2.ts": format, "./obsidianInternals.ts": {
      scrollReadingToLine: () => false, afterReadingScroll: (_view: unknown, callback: () => void) => { nativeScrolled = callback; return () => {}; },
    },
  }, { NodeFilter: { SHOW_TEXT: 4 } });
  module.registerModeScroll({ app: { workspace }, registerEvent() {}, register(callback: () => void) { cleanups.push(callback); } });
  const frame = (): void => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  const event = (name: string): void => { for (const callback of events.get(name) ?? []) callback(); };
  frame();
  return { view, source, reading, frame, event, mutate: () => mutation(), nativeScroll: () => nativeScrolled(),
    stop() { cleanups.forEach(callback => callback()); }, events };
}

test("mode switches preserve visible text offset and settle later rendering changes", async () => {
  const h = await harness();
  h.view.mode = "preview"; h.mutate(); h.frame();
  assert.equal(h.reading.scroller.scrollTop, 180);
  h.reading.base = 360; h.mutate(); h.frame();
  assert.equal(h.reading.scroller.scrollTop, 240);
  h.stop();
});

test("a late native reading scroll settles before another frame or mutation callback", async () => {
  const h = await harness();
  h.view.mode = "preview"; h.mutate(); h.frame();
  h.reading.scroller.scrollTop = 90;
  h.nativeScroll();
  assert.equal(h.reading.scroller.scrollTop, 180);
  h.event("wheel");
  h.reading.scroller.scrollTop = 90; h.nativeScroll();
  assert.equal(h.reading.scroller.scrollTop, 90);
  h.stop();
});

test("user scrolling releases the old anchor and the return trip preserves the new position", async () => {
  const h = await harness();
  h.view.mode = "preview"; h.mutate(); h.frame();
  h.event("wheel"); h.reading.scroller.scrollTop = 240; h.event("scroll"); h.frame();
  h.mutate(); h.frame();
  assert.equal(h.reading.scroller.scrollTop, 240);
  h.view.mode = "source"; h.mutate(); h.frame();
  assert.equal(h.source.scroller.scrollTop, 60);
  h.stop();
  assert.ok([...h.events.values()].every(listeners => listeners.size === 0));
});

test("a changed note cannot restore an anchor from an older source snapshot", async () => {
  const h = await harness();
  h.view.mode = "preview"; h.view.text = "Different contents"; h.mutate(); h.frame();
  assert.equal(h.reading.scroller.scrollTop, 0);
  assert.deepEqual(h.view.hints, []);
  h.stop();
});
