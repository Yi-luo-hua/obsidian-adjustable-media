import assert from "node:assert/strict";
import { test } from "node:test";
import * as plain from "../src/layout/plainEmbed.ts";
import { trackPointer } from "../src/view/pointer.ts";
import { mockedModule } from "./support/mockedModule.ts";

test("standalone grips follow source ownership, including a diagram that becomes list content", async () => {
  let changed!: () => void;
  class Observer {
    constructor(callback: () => void) { changed = callback; }
    observe(): void {}
    disconnect(): void {}
  }
  class Diagram {
    line: number;
    grip: { parentElement: Diagram; isConnected: boolean; addEventListener(): void; remove(): void } | null = null;
    constructor(line: number) { this.line = line; }
    closest(): null { return null; }
    matches(): boolean { return true; }
    querySelector(selector: string): unknown { return selector === "svg" ? {} : this.grip; }
    addClass(): void {}
    removeClass(): void {}
    createEl() {
      const grip = { parentElement: this, isConnected: true, addEventListener() {}, remove: () => { grip.isConnected = false; this.grip = null; } };
      this.grip = grip;
      return grip;
    }
  }
  const graph = ["```mermaid", "flowchart LR", "A-->B", "```"];
  let lines = ["<!-- vml -->", "![[photo.png]]", "<!-- /vml -->", "", "- item", "", ...graph.map(line => "  " + line), "", ...graph];
  const list = new Diagram(6), standalone = new Diagram(11), diagrams = [list, standalone];
  const contentDOM = { ownerDocument: { defaultView: { MutationObserver: Observer } }, querySelectorAll: () => diagrams,
    addEventListener() {}, removeEventListener() {} };
  const view = { contentDOM, dom: { querySelector: () => ({}) },
    posAtDOM: (diagram: Diagram) => lines.slice(0, diagram.line).reduce((pos, line) => pos + line.length + 1, 0),
    state: { doc: { toString: () => lines.join("\n"), lineAt(pos: number) {
      let from = 0;
      for (let index = 0; index < lines.length; index++) {
        if (pos <= from + lines[index].length) return { number: index + 1, from };
        from += lines[index].length + 1;
      }
      throw new Error("Position outside document");
    } } },
  };
  const module = await mockedModule<{ plainMediaDrag(app: unknown): (view: unknown) => { destroy(): void } }>(new URL("../src/view/plainDrag.ts", import.meta.url), {
    obsidian: { setIcon() {} }, "@codemirror/view": { ViewPlugin: { define: (factory: unknown) => factory } },
    "../layout/edits.ts": {}, "../layout/model.ts": {}, "../layout/plainEmbed.ts": plain,
    "./dragGhost.ts": {}, "./interactions.ts": {}, "./messages.ts": { t: () => "Drag" }, "./pointer.ts": {}, "./windows.ts": {},
  });
  const plugin = module.plainMediaDrag({})(view);
  assert.equal(list.grip, null, "a list diagram has no unusable drag grip");
  assert.ok(standalone.grip, "a complete top-level diagram keeps its grip");
  lines = [...lines.slice(0, 11), "- another item", "", ...graph.map(line => "  " + line)];
  standalone.line = 13;
  changed();
  assert.equal(standalone.grip, null, "an old grip disappears when the diagram becomes list content");
  lines = [...lines.slice(0, 11), ...graph]; standalone.line = 11;
  changed(); assert.ok(standalone.grip);
  plugin.destroy(); assert.equal(standalone.grip, null);
});

async function touchHarness() {
  const events = new Map<string, Set<(event: unknown) => void>>(), contentEvents = new Map<string, (event: unknown) => void>();
  const timers = new Map<number, () => void>(); let timerId = 0, created = 0, removed = 0, prevented = false;
  const win = { MutationObserver: class { observe() {} disconnect() {} },
    setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id: number) { timers.delete(id); } };
  const doc = { body: { addClass() {}, removeClass() {} },
    addEventListener(name: string, callback: (event: unknown) => void) { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(callback); },
    removeEventListener(name: string, callback: (event: unknown) => void) { events.get(name)?.delete(callback); } };
  const diagram = { ownerDocument: doc, win, captured: false,
    closest(selector: string) { return selector === ".mermaid" ? this : selector === ".workspace-leaf" ? {} : null; },
    matches: () => true, instanceOf: () => false, contains: (node: unknown) => node === diagram,
    querySelector: (selector: string) => selector === "svg" ? {} : null,
    createEl: () => ({ isConnected: true, parentElement: diagram, addEventListener() {}, remove() {} }),
    addClass() {}, removeClass() {}, addEventListener() {}, removeEventListener() {},
    setPointerCapture() { this.captured = true; }, hasPointerCapture() { return this.captured; }, releasePointerCapture() { this.captured = false; },
  };
  const lines = ["<!-- vml -->", "![[photo.png]]", "<!-- /vml -->", "", "```mermaid", "flowchart LR", "A-->B", "```"];
  const contentDOM = { ownerDocument: { defaultView: win }, querySelectorAll: () => [diagram],
    addEventListener: (name: string, callback: (event: unknown) => void) => contentEvents.set(name, callback), removeEventListener() {} };
  const view = { contentDOM, dom: { querySelector: () => ({}) }, posAtDOM: () => 0,
    state: { field: () => ({ file: { path: "note.md" } }), doc: { toString: () => lines.join("\n"), lineAt: () => ({ number: 5, from: 0 }) } } };
  const module = await mockedModule<{ plainMediaDrag(app: unknown): (view: unknown) => { destroy(): void } }>(new URL("../src/view/plainDrag.ts", import.meta.url), {
    obsidian: { setIcon() {} }, "@codemirror/view": { ViewPlugin: { define: (factory: unknown) => factory } },
    "../layout/edits.ts": {}, "../layout/model.ts": {}, "../layout/plainEmbed.ts": plain,
    "./dragGhost.ts": { createDragGhost: () => { created++; return { move() {}, remove() { removed++; } }; } },
    "./interactions.ts": { DRAG_THRESHOLD: 6, clearDropIndicators() {}, findDrop: () => null, swallowNextClick() {} },
    "./messages.ts": { t: () => "Drag" }, "./pointer.ts": { trackPointer }, "./windows.ts": { eventElement: (event: { target: unknown }) => event.target },
  }, { HTMLImageElement: class {} });
  const plugin = module.plainMediaDrag({})(view);
  const fire = (type: string, x = 100, y = 100): boolean => {
    prevented = false;
    const event = { pointerType: "touch", pointerId: 1, button: 0, clientX: x, clientY: y, target: diagram, touches: [{}],
      preventDefault() { prevented = true; }, stopPropagation() {} };
    if (type === "pointerdown") contentEvents.get(type)!(event);
    else [...events.get(type) ?? []].forEach(callback => callback(event));
    return prevented;
  };
  return { fire, destroy: () => plugin.destroy(), advance() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
    state: () => ({ created, removed, timers: timers.size, listeners: [...events.values()].reduce((sum, callbacks) => sum + callbacks.size, 0), captured: diagram.captured }) };
}

test("holding a diagram body starts a whole-diagram preview, blocks native pan, and cleans up on release", async () => {
  const host = await touchHarness();
  assert.equal(host.fire("pointerdown"), false, "a body touch initially retains native scrolling");
  assert.equal(host.fire("touchmove"), false);
  host.advance(); assert.equal(host.state().created, 1);
  assert.equal(host.fire("touchmove"), true, "after holding, movement belongs to the drag");
  assert.equal(host.fire("contextmenu"), true);
  host.fire("pointermove", 140, 100); host.fire("pointerup", 140, 100);
  assert.deepEqual(host.state(), { created: 1, removed: 1, timers: 0, listeners: 0, captured: false });
});

test("a quick diagram swipe cancels the hold and leaves page scrolling native", async () => {
  const host = await touchHarness(); host.fire("pointerdown"); host.fire("pointermove", 100, 110); host.advance();
  assert.equal(host.fire("touchmove"), false);
  assert.deepEqual(host.state(), { created: 0, removed: 0, timers: 0, listeners: 0, captured: false });
});

test("cancelling a diagram hold removes both its timer and active preview without a late start", async () => {
  for (const held of [false, true]) {
    const host = await touchHarness(); host.fire("pointerdown"); if (held) host.advance();
    host.fire("pointercancel"); host.advance();
    assert.deepEqual(host.state(), { created: held ? 1 : 0, removed: held ? 1 : 0, timers: 0, listeners: 0, captured: false });
  }
});

test("destroying the pane aborts a pending or active diagram hold without a late preview", async () => {
  for (const held of [false, true]) {
    const host = await touchHarness(); host.fire("pointerdown"); if (held) host.advance();
    host.destroy(); host.advance();
    assert.deepEqual(host.state(), { created: held ? 1 : 0, removed: held ? 1 : 0, timers: 0, listeners: 0, captured: false });
  }
});
