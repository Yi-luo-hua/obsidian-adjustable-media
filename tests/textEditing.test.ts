import assert from "node:assert/strict";
import { test } from "node:test";
import * as format from "../src/format/v2.ts";
import * as edits from "../src/layout/edits.ts";
import * as model from "../src/layout/model.ts";
import * as projections from "../src/layout/viewProjection.ts";
import { mockedModule } from "./support/mockedModule.ts";

type Handler = (event: { isComposing?: boolean }) => boolean | void;

interface Harness {
  type(text: string): void;
  leave(): void;
  enter(): void;
  key(key: string, modifiers?: string[]): boolean | void;
  /** Whether the layout's element stays for the block after a change to the note (its widget's updateDOM). */
  keeps(lines: string[]): boolean;
  /** The layout's element goes away (its widget's destroy). */
  abort(): void;
  /** Types in the column again; with `lines`, the block reads so by then. */
  reopen(lines?: string[]): void;
  /** What the column's editor started with or holds now. */
  editorText(): string;
  notices: string[];
  written: string[][];
  executed: string[];
  scopes: { pushed: number; popped: number };
  redraws: number;
  destroyed(): boolean;
}

/** One text column session on a block with left text, the editor and the page stubbed. */
async function session(): Promise<Harness> {
  const notices: string[] = [];
  const written: string[][] = [];
  const executed: string[] = [];
  const scopes = { pushed: 0, popped: 0 };
  let redraws = 0;
  const handlers: Array<{ modifiers: string[]; key: string; run: Handler }> = [];
  class Scope { register(modifiers: string[], key: string, run: Handler) { handlers.push({ modifiers, key, run }); } }
  class Notice { constructor(message: string) { notices.push(message); } }

  let text = "";
  let destroyed = false;
  let onUpdate: (update: { docChanged: boolean }) => void = () => {};
  const listeners = new Map<string, () => void>();
  const content = {
    doc: { activeElement: null as unknown },
    win: { setTimeout: (run: () => void) => run() },
    addEventListener: (name: string, run: () => void) => listeners.set(name, run),
    blur: () => listeners.get("focusout")?.(),
  };
  const editor = {
    state: { doc: { toString: () => text } },
    composing: false, compositionStarted: false, contentDOM: content,
    dom: { addEventListener() {} }, focus() {}, destroy() { destroyed = true; },
  };
  const element = (): object => ({
    empty() {}, removeClass() {}, addClass() {}, toggleClass() {}, addEventListener() {},
    createDiv: () => element(),
  });

  const module = await mockedModule<{ startTextEdit(host: unknown, side: string, point: null): void; keepWhileEditing(el: unknown, block: unknown): boolean; stopTextEdit(el: unknown): void }>(new URL("../src/view/textEditing.ts", import.meta.url), {
    obsidian: { Notice, Scope }, "../format/v2.ts": format, "../layout/edits.ts": edits, "../layout/model.ts": model,
    "../layout/viewProjection.ts": projections,
    "./columnEditor.ts": { createColumnEditor: (options: { text: string; onUpdate: typeof onUpdate }) => { text = options.text; onUpdate = options.onUpdate; return editor; } },
    "./interactions.ts": { commitEdits: (_app: unknown, _path: string, planned: edits.BlockEdit[]) => { written.push(planned[0]?.replacement ?? []); return Promise.resolve(true); } },
    "./linkSuggest.ts": { closeLinkSuggest: () => false },
    "./messages.ts": { t: (key: string) => key },
    "./obsidianInternals.ts": { commandHotkeys: (_app: unknown, _id: string, keys: unknown) => keys, executeCommand: (_app: unknown, id: string) => { executed.push(id); return true; } },
  });
  const [block] = format.findV2Blocks(["<!-- vml -->", "Left text", "![[a.png]]", "<!-- /vml -->"]);
  assert.ok(block);
  const host: { context: { block: format.V2Block; model: model.LayoutModel } } & Record<string, unknown> = {
    el: {}, root: { querySelector: () => element() }, app: { keymap: { pushScope: () => scopes.pushed++, popScope: () => scopes.popped++ } },
    sourcePath: "note.md", editor: {}, view: {}, context: { block, model: model.modelFromBlock(block) },
    redraw: () => { redraws++; return host; },
  };
  module.startTextEdit(host, "left", null);

  // Keys go to the scope pushed last: the latest session's.
  const key = (name: string, modifiers: string[] = []): boolean | void => [...handlers].reverse()
    .find((handler) => handler.key === name && handler.modifiers.join() === modifiers.join())?.run({ isComposing: false });
  return {
    type(next) { text = next; onUpdate({ docChanged: true }); },
    leave() { content.doc.activeElement = null; listeners.get("focusout")?.(); },
    enter() { content.doc.activeElement = content; listeners.get("focusin")?.(); },
    key, notices, written, executed, scopes,
    keeps(lines) { return module.keepWhileEditing(host.el, format.findV2Blocks(lines)[0]); },
    abort() { module.stopTextEdit(host.el); },
    reopen(lines) {
      const [next] = lines ? format.findV2Blocks(lines) : [host.context.block];
      assert.ok(next);
      host.context = { block: next, model: model.modelFromBlock(next) };
      destroyed = false;
      module.startTextEdit(host, "left", null);
    },
    editorText: () => text,
    get redraws() { return redraws; },
    destroyed: () => destroyed,
  };
}

test("text that can be saved is written as typed, and leaving the editor draws the layout again", async () => {
  const editor = await session();
  editor.type("New left text");
  assert.deepEqual(editor.written, [["New left text"]]);
  editor.leave();
  assert.equal(editor.destroyed(), true);
  assert.equal(editor.redraws, 1);
  assert.deepEqual(editor.notices, []);
});

test("unsaved text keeps the editor open when the focus leaves it", async () => {
  const editor = await session();
  // A code fence would change what the block is: nothing is written, the frame turns red.
  editor.type("```js");
  assert.deepEqual(editor.written, []);
  editor.leave();
  assert.equal(editor.destroyed(), false);
  assert.equal(editor.redraws, 0);
  assert.deepEqual(editor.notices, ["textKeptOpen"]);
  assert.equal(editor.scopes.popped, 1, "Obsidian's hotkeys work again while the focus is elsewhere");
  editor.enter();
  assert.equal(editor.scopes.pushed, 2);
  // Fixed, it is written and leaving ends the typing as usual.
  editor.type("Fixed text");
  assert.deepEqual(editor.written, [["Fixed text"]]);
  editor.leave();
  assert.equal(editor.destroyed(), true);
});

test("Esc gives unsaved text up only when pressed twice with nothing typed between", async () => {
  const editor = await session();
  editor.type("```js");
  assert.equal(editor.key("Escape"), false);
  assert.deepEqual(editor.notices, ["textUnsavedEsc"]);
  assert.equal(editor.destroyed(), false);
  // Typing again asks again.
  editor.type("```python");
  editor.key("Escape");
  assert.equal(editor.destroyed(), false);
  assert.deepEqual(editor.notices, ["textUnsavedEsc", "textUnsavedEsc"]);
  editor.key("Escape");
  assert.equal(editor.destroyed(), true);
  assert.equal(editor.redraws, 1);
  assert.deepEqual(editor.written, []);
});

test("the command palette, quick switcher and settings still open while a column is typed in", async () => {
  const editor = await session();
  assert.equal(editor.key("P", ["Mod"]), false);
  editor.key("O", ["Mod"]);
  editor.key(",", ["Mod"]);
  assert.deepEqual(editor.executed, ["command-palette:open", "switcher:open", "app:open-settings"]);
  // Editor commands still do not reach the note's editor: the scope has nothing else.
  assert.equal(editor.key("B", ["Mod"]), undefined);
});

test("unsaved text survives the layout moving, but not the layout changing", async () => {
  const editor = await session();
  editor.type("```js");
  editor.leave();
  // A line added above the block moves it: its element, and the unsaved text in it, stay.
  assert.equal(editor.keeps(["A line added above", "<!-- vml -->", "Left text", "![[a.png]]", "<!-- /vml -->"]), true);
  assert.equal(editor.destroyed(), false);
  // Changed elsewhere, the block is drawn anew from the note.
  assert.equal(editor.keeps(["<!-- vml -->", "Left text", "![[b.png]]", "<!-- /vml -->"]), false);
  assert.equal(editor.keeps(["<!-- vml -->", "Other left text", "![[a.png]]", "<!-- /vml -->"]), false);
});

test("while typing text that is saved, the element stays for the block holding exactly that text", async () => {
  const editor = await session();
  editor.type("Typed text");
  assert.equal(editor.keeps(["<!-- vml -->", "Typed text", "![[a.png]]", "<!-- /vml -->"]), true);
  assert.equal(editor.keeps(["<!-- vml -->", "Left text", "![[a.png]]", "<!-- /vml -->"]), false);
});

test("a draft that could not be saved comes back when the same column is typed in again", async () => {
  const editor = await session();
  editor.type("```js");
  // The layout's element goes away: switching to reading view, another note, or a redraw.
  editor.abort();
  assert.equal(editor.destroyed(), true);
  assert.deepEqual(editor.notices, ["textDraftSaved"]);
  editor.reopen();
  assert.equal(editor.editorText(), "```js");
  assert.deepEqual(editor.notices, ["textDraftSaved", "textDraftRestored"]);
  assert.deepEqual(editor.written, [], "a restored draft is not written while it still cannot be");
  // Restored once: given up with Esc twice, it is gone for good.
  editor.key("Escape");
  editor.key("Escape");
  editor.reopen();
  assert.equal(editor.editorText(), "Left text");
});

test("a draft does not come back once its column has changed elsewhere, or to another block", async () => {
  const editor = await session();
  editor.type("```js");
  editor.abort();
  // The column was changed elsewhere meanwhile: writing the draft would undo that change.
  editor.reopen(["<!-- vml -->", "Changed elsewhere", "![[a.png]]", "<!-- /vml -->"]);
  assert.equal(editor.editorText(), "Changed elsewhere");
  editor.abort();
  // Another block that looks the same but for its media is not the one the draft was typed for.
  editor.reopen(["<!-- vml -->", "Left text", "![[other.png]]", "<!-- /vml -->"]);
  assert.equal(editor.editorText(), "Left text");
  editor.abort();
  // Back to exactly what it was typed for (an undo, say), it comes back.
  editor.reopen(["<!-- vml -->", "Left text", "![[a.png]]", "<!-- /vml -->"]);
  assert.equal(editor.editorText(), "```js");
});

test("text that was saved leaves no draft behind", async () => {
  const editor = await session();
  editor.type("Saved text");
  editor.abort();
  assert.deepEqual(editor.notices, []);
  editor.reopen(["<!-- vml -->", "Saved text", "![[a.png]]", "<!-- /vml -->"]);
  assert.equal(editor.editorText(), "Saved text");
});
