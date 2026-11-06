import assert from "node:assert/strict";
import { test } from "node:test";
import * as state from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { mockedModule } from "./support/mockedModule.ts";
import { hangingPrefix } from "../src/markdown/columnStyle.ts";

for (const { kind, text, width } of [
  { kind: ".HyperMD-list-line", text: "    - List text wraps", width: 59.6666666667 },
  { kind: ".HyperMD-quote", text: "> 2. Quoted list wraps", width: 34.5916666667 },
]) test(`${kind} continuations use the exact prefix width and release it when layouts disappear`, async () => {
  let enabled = true;
  const requests: Array<{ read(view: unknown): unknown; write(widths: unknown, view: unknown): void }> = [];
  class Element {
    win = { getComputedStyle: () => ({ borderLeftWidth: "0", paddingLeft: "30", textIndent: "-30" }) };
    instanceOf(type: unknown) { return type === Element; }
    closest(selector: string) { return selector.split(",").some(value => [kind, ".cm-line"].includes(value.trim())) ? this : null; }
    getBoundingClientRect() { return { left: 40 }; }
  }
  const node = new Element(), line = { text, from: 0, to: text.length };
  const view = { state: { doc: { lineAt: () => line } }, visibleRanges: [{ from: 0, to: 21 }],
    domAtPos: () => ({ node }), coordsAtPos: (at: number) => ({ left: at === 0 ? 40 : 40 + width, top: 0, bottom: 24 }),
    requestMeasure(request: typeof requests[number]) { requests.push(request); }, dispatch() {} };
  const module = await mockedModule<{ nativeListHanging(enabled: () => boolean): { create(view: unknown): {
    decorations: typeof Decoration.none; update(update: unknown): void; destroy(): void;
  } } }>(new URL("../src/view/hangingIndent.ts", import.meta.url), {
    "@codemirror/state": state, "@codemirror/view": { Decoration, ViewPlugin: { fromClass: (Type: new (view: unknown) => unknown) => ({ create: (view: unknown) => new Type(view) }) } },
    "../markdown/columnStyle.ts": { hangingPrefix },
  }, { HTMLElement: Element, queueMicrotask });
  const plugin = module.nativeListHanging(() => enabled).create(view);
  const flush = () => { for (const request of requests.splice(0)) request.write(request.read(view), view); };
  flush();
  let spec: { class?: string; attributes?: Record<string, string> } = {};
  plugin.decorations.between(0, 0, (_from, _to, value) => { spec = value.spec as typeof spec; });
  assert.equal(spec.class, "vml-list-hanging");
  assert.ok(Math.abs(parseFloat(spec.attributes!["style"].split(":")[1]) - width) < 1e-8);
  enabled = false;
  plugin.update({ docChanged: false, selectionSet: false, viewportChanged: false, geometryChanged: true }); flush();
  assert.equal(plugin.decorations.size, 0);
  plugin.destroy();
});
