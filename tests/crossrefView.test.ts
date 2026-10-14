import test from "node:test";
import assert from "node:assert/strict";

import * as crossref from "../src/markdown/crossref.ts";
import { mockedModule } from "./support/mockedModule.ts";

/** Model the host replacing a reference on mousedown when its selection enters the source. */
async function referenceClick(unresolved = false, button = 0, mode = "source", targetDrawn = true) {
  const listeners = new Map<string, (event: unknown) => void>();
  let drawn = true;
  let cursor = 0;
  let jumps = 0;
  let hiddenJumps = 0;
  const sourceScrolls: number[] = [];
  const readingScrolls: number[] = [];
  const visibleRoot = { querySelector: () => targetDrawn ? { scrollIntoView() { jumps++; } } : null };
  const ref = {
    dataset: { vmlRef: "fig:gpt2" },
    hasClass: () => unresolved,
    closest: () => drawn ? ref : null,
  };
  class MarkdownView {
    containerEl = {
      contains: (element: unknown) => element === ref,
      querySelector: () => ({ scrollIntoView() { hiddenJumps++; } }),
      win: { setTimeout(callback: () => void) { targetDrawn = true; callback(); } },
    };
    editor = { cm: {
      dom: visibleRoot,
      state: { doc: { lines: 1, line: () => ({ from: 0 }) } },
      dispatch: ({ effects }: { effects: number }) => sourceScrolls.push(effects),
    } };
    previewMode = { containerEl: visibleRoot };
    getMode() { return mode; }
    setEphemeralState({ line }: { line: number }) { readingScrolls.push(line); }
    getViewData() { return "GPT-2 {#fig:gpt2}"; }
  }
  const view = new MarkdownView();
  const module = await mockedModule<{ registerCrossrefs(plugin: unknown): void }>(new URL("../src/view/crossrefView.ts", import.meta.url), {
    obsidian: { MarkdownView },
    "@codemirror/state": {},
    "@codemirror/view": { WidgetType: class {}, EditorView: { scrollIntoView: (pos: number) => pos } },
    "../markdown/crossref.ts": crossref,
    "../markdown/lineContext.ts": {},
    "../layout/changeScan.ts": {},
    "./math.ts": {},
    "./noteText.ts": {},
    "./messages.ts": {},
    "./windows.ts": {
      onEveryDocument: (_plugin: unknown, watch: (doc: unknown) => void) => watch({}),
      eventElement: () => ref,
    },
  }, { CSS: { escape: (id: string) => id } });
  module.registerCrossrefs({
    app: { workspace: { getLeavesOfType: () => [{ view }] } },
    registerMarkdownPostProcessor() {},
    registerDomEvent(_doc: unknown, type: string, listener: (event: unknown) => void, options: { capture: boolean }) {
      assert.equal(options.capture, true);
      listeners.set(type, listener);
    },
  });
  const event = () => ({
    button, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
  });
  const down = event();
  listeners.get("mousedown")?.(down);
  if (!down.stopped) {
    cursor = 10;
    drawn = false;
  }
  const click = event();
  listeners.get("click")?.(click);
  return { down, click, cursor, jumps, hiddenJumps, sourceScrolls, readingScrolls };
}

test("clicking a reference survives the host mousedown and jumps without moving the cursor", async () => {
  const { down, click, cursor, jumps, hiddenJumps } = await referenceClick();
  assert.equal(down.defaultPrevented, true);
  assert.equal(click.defaultPrevented, true);
  assert.equal(cursor, 0);
  assert.equal(jumps, 1);
  assert.equal(hiddenJumps, 0);
});

test("reading mode scrolls its visible target instead of a label retained by the hidden editor", async () => {
  const { jumps, hiddenJumps } = await referenceClick(false, 0, "preview");
  assert.equal(jumps, 1);
  assert.equal(hiddenJumps, 0);
});

for (const mode of ["source", "preview"]) {
  test(`${mode} mode renders an offscreen target by line before centering its label`, async () => {
    const { jumps, hiddenJumps, sourceScrolls, readingScrolls, cursor } = await referenceClick(false, 0, mode, false);
    assert.equal(jumps, 1);
    assert.equal(hiddenJumps, 0);
    assert.equal(cursor, 0);
    assert.deepEqual(sourceScrolls, mode === "source" ? [0] : []);
    assert.deepEqual(readingScrolls, mode === "preview" ? [0] : []);
  });
}

test("unresolved references keep normal source selection and never jump", async () => {
  const { down, cursor, jumps } = await referenceClick(true);
  assert.equal(down.defaultPrevented, false);
  assert.equal(cursor, 10);
  assert.equal(jumps, 0);
});

test("right mouse presses keep the host context menu behavior", async () => {
  const { down, jumps } = await referenceClick(false, 2);
  assert.equal(down.defaultPrevented, false);
  assert.equal(down.stopped, false);
  assert.equal(jumps, 0);
});
