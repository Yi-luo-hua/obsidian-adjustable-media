import assert from "node:assert/strict";
import { test } from "node:test";
import * as plain from "../src/layout/plainEmbed.ts";
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
