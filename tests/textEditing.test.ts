import assert from "node:assert/strict";
import { test } from "node:test";
import { ChangeSet, Text } from "@codemirror/state";
import * as format from "../src/format/v2.ts";
import * as edits from "../src/layout/edits.ts";
import * as model from "../src/layout/model.ts";
import * as projections from "../src/layout/viewProjection.ts";
import * as identity from "../src/layout/blockIdentity.ts";
import * as snapshots from "../src/layout/documentSnapshot.ts";
import { mockedModule } from "./support/mockedModule.ts";

type Handler = (event: { isComposing?: boolean }) => boolean | void;

interface Harness {
  type(text: string): void;
  compose(value: string | boolean): void;
  switchSide(side: format.TextSide): void;
  press(label: string): void;
  leave(): void;
  enter(): void;
  key(key: string, modifiers?: string[]): boolean | void;
  /** Changes the note in its editor, as one transaction: lines `from` up to `to` (exclusive) become `lines`. */
  edit(from: number, to: number, lines: string[]): void;
  /** Undoes the last edit, as the editor's history does. */
  undo(): void;
  /** The editor goes on to show another note (Obsidian reuses it), here one with `lines`. */
  switchTo(lines: string[]): void;
  /** The note closes: its editor is emptied. */
  close(): void;
  /** The note is opened again, in a new buffer, reading `lines`. */
  open(lines: string[]): void;
  /** Whether the layout's element stays for block `index` of the note as it is now (its widget's updateDOM). */
  keeps(index?: number): boolean;
  /** The layout's element goes away (its widget's destroy). */
  abort(): void;
  /** Types in the left column of block `index` of the note as it is now. */
  reopen(index?: number): void;
  /** What the column's editor started with or holds now. */
  editorText(): string;
  notices: string[];
  written: string[][];
  executed: string[];
  scopes: { pushed: number; popped: number };
  redraws: number;
  destroyed(): boolean;
}

const BLOCK = ["<!-- vml -->", "Left text", "![[a.png]]", "<!-- /vml -->"];
const TWO = [...BLOCK, "", ...BLOCK];

/**
 * One text column session on the left column of block `index` of a note reading `lines`, the column's
 * editor and the page stubbed. The note's editor is modelled as live preview has it: each change is a
 * new state with its own document snapshot, identities carried through the change.
 */
async function session(lines: string[] = BLOCK, index = 0): Promise<Harness> {
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
  const buttons = new Map<string, { disabled: boolean; listeners: Map<string, () => void> }>();
  const element = (): object => ({
    empty() {}, removeClass() {}, addClass() {}, toggleClass() {}, addEventListener() {},
    createDiv: () => element(),
    createEl: (_tag: string, options: { text: string }) => {
      const button = { disabled: false, listeners: new Map<string, () => void>(),
        addEventListener: (name: string, run: (event: { stopPropagation(): void }) => void) =>
          button.listeners.set(name, () => run({ stopPropagation() {} })) };
      buttons.set(options.text, button);
      return button;
    },
  });

  const module = await mockedModule<{ startTextEdit(host: unknown, side: string, point: null): void; keepWhileEditing(el: unknown, block: unknown): boolean; stopTextEdit(el: unknown): void }>(new URL("../src/view/textEditing.ts", import.meta.url), {
    obsidian: { Notice, Scope }, "../format/v2.ts": format, "../layout/edits.ts": edits, "../layout/model.ts": model,
    "../layout/viewProjection.ts": projections, "../layout/blockIdentity.ts": identity, "../layout/documentSnapshot.ts": snapshots,
    "./columnEditor.ts": { createColumnEditor: (options: { text: string; onUpdate: typeof onUpdate }) => { text = options.text; onUpdate = options.onUpdate; destroyed = false; return editor; } },
    "./interactions.ts": { commitEdits: (_app: unknown, _path: string, planned: edits.BlockEdit[]) => { written.push(planned[0]?.replacement ?? []); return Promise.resolve(true); } },
    "./linkSuggest.ts": { closeLinkSuggest: () => false },
    "./messages.ts": { t: (key: string) => key },
    "./obsidianInternals.ts": { commandHotkeys: (_app: unknown, _id: string, keys: unknown) => keys, executeCommand: (_app: unknown, id: string) => { executed.push(id); return true; } },
  });

  // The note's editor: its current text, snapshot and state, as live preview's field keeps them.
  const file = { path: "note.md" };
  let origin = { file, branch: {}, path: file.path };
  let doc = Text.of(lines);
  let snapshot: snapshots.DocumentSnapshot | null = null;
  const history: Array<{ changes: ChangeSet; before: Text }> = [];
  const view = { state: {} as object };
  const commit = (next: Text, changes?: ChangeSet): void => {
    const source = next.toString();
    snapshot = source.includes("<!-- vml") ? snapshots.documentSnapshot(source, origin, snapshot ?? undefined, changes) : null;
    doc = next;
    view.state = { doc: { toString: () => source } };
    snapshots.rememberDocumentSnapshot(view.state as never, snapshot);
  };
  const change = (from: number, to: number, insert: string): void => {
    const changes = ChangeSet.of({ from, to, insert }, doc.length);
    history.push({ changes, before: doc });
    commit(changes.apply(doc), changes);
  };
  const lineStart = (line: number): number => line < doc.lines ? doc.line(line + 1).from : doc.length;
  const blockAt = (at: number): format.V2Block => {
    const ref = snapshot?.blocks[at];
    assert.ok(ref, `block ${at} in the note`);
    return ref.block;
  };
  commit(doc);

  const host: { context: { block: format.V2Block; model: model.LayoutModel } } & Record<string, unknown> = {
    el: {}, root: { querySelector: () => element() }, app: { keymap: { pushScope: () => scopes.pushed++, popScope: () => scopes.popped++ } },
    sourcePath: file.path, editor: {}, view, context: { block: blockAt(index), model: model.modelFromBlock(blockAt(index)) },
    redraw: () => { redraws++; return host; },
  };
  module.startTextEdit(host, "left", null);

  // Keys go to the scope pushed last: the latest session's.
  const key = (name: string, modifiers: string[] = []): boolean | void => [...handlers].reverse()
    .find((handler) => handler.key === name && handler.modifiers.join() === modifiers.join())?.run({ isComposing: false });
  return {
    type(next) { text = next; onUpdate({ docChanged: true }); },
    compose(next) { editor.composing = typeof next === "string" || next; editor.compositionStarted = editor.composing; if (typeof next === "string") { text = next; onUpdate({ docChanged: true }); } },
    switchSide(side) { module.startTextEdit(host, side, null); },
    press(label) { const button = buttons.get(label); assert.ok(button); if (!button.disabled) button.listeners.get("click")?.(); },
    leave() { content.doc.activeElement = null; listeners.get("focusout")?.(); },
    enter() { content.doc.activeElement = content; listeners.get("focusin")?.(); },
    key, notices, written, executed, scopes,
    edit(from, to, replacement) {
      // Whole lines with their line breaks; at the end of the note, the break before them instead.
      const end = to < doc.lines ? lineStart(to) : doc.length;
      const insert = replacement.map((line) => `${line}\n`).join("");
      if (to >= doc.lines && from > 0 && replacement.length === 0) change(lineStart(from) - 1, end, "");
      else change(lineStart(from), end, to >= doc.lines && insert.endsWith("\n") ? insert.slice(0, -1) : insert);
    },
    undo() {
      const last = history.pop();
      assert.ok(last);
      const inverse = last.changes.invert(last.before);
      commit(inverse.apply(doc), inverse);
    },
    switchTo(other) {
      origin = { file: { path: "other.md" }, branch: {}, path: "other.md" };
      snapshot = null;
      commit(Text.of(other));
    },
    close() { change(0, doc.length, ""); },
    open(source) {
      origin = { file, branch: {}, path: file.path };
      snapshot = null;
      history.length = 0;
      commit(Text.of(source));
    },
    keeps(at = 0) { return module.keepWhileEditing(host.el, blockAt(at)); },
    abort() { module.stopTextEdit(host.el); },
    reopen(at = 0) {
      const next = blockAt(at);
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

test("switching columns finishes pending text before opening the other side", async () => {
  const editor = await session(["<!-- vml -->", "Left text", "![[a.png]]", "Right text", "<!-- /vml -->"]);
  editor.compose("Composed left text");
  assert.deepEqual(editor.written, []);
  editor.switchSide("right");
  assert.deepEqual(editor.written, [["Composed left text"]]);
  assert.equal(editor.editorText(), "Right text");
  assert.equal(editor.redraws, 1);
  assert.equal(editor.destroyed(), false);
});

test("switching columns does not discard text that cannot be written", async () => {
  const editor = await session(["<!-- vml -->", "Left text", "![[a.png]]", "Right text", "<!-- /vml -->"]);
  editor.type("```js");
  editor.switchSide("right");
  assert.deepEqual(editor.written, []);
  assert.equal(editor.editorText(), "```js");
  assert.equal(editor.destroyed(), false);
  assert.equal(editor.redraws, 0);
  assert.deepEqual(editor.notices, ["textKeptOpen"]);
});

test("Done waits for an IME candidate, then saves the confirmed input and closes", async () => {
  const editor = await session();
  editor.compose(true);
  editor.type("组字中");
  editor.press("textDone");
  assert.deepEqual(editor.written, []);
  assert.equal(editor.destroyed(), false);
  assert.deepEqual(editor.notices, ["textFinishComposition"]);
  editor.compose(false);
  editor.press("textDone");
  assert.deepEqual(editor.written, [["组字中"]]);
  assert.equal(editor.destroyed(), true);
  assert.equal(editor.redraws, 1);
});

test("the visible discard action drops an invalid draft without writing or reopening it", async () => {
  const editor = await session();
  editor.press("textDiscardDraft");
  assert.equal(editor.destroyed(), false);
  editor.type("```js");
  editor.press("textDone");
  assert.equal(editor.destroyed(), false);
  assert.deepEqual(editor.written, []);
  editor.press("textDiscardDraft");
  assert.equal(editor.destroyed(), true);
  assert.equal(editor.redraws, 1);
  editor.reopen();
  assert.equal(editor.editorText(), "Left text");
  assert.deepEqual(editor.written, []);
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
  editor.edit(0, 0, ["A line added above"]);
  assert.equal(editor.keeps(), true);
  assert.equal(editor.destroyed(), false);
  // Changed elsewhere, the block is drawn anew from the note.
  editor.edit(3, 4, ["![[b.png]]"]);
  assert.equal(editor.keeps(), false);
});

test("while typing text that is saved, the element stays for the block holding exactly that text", async () => {
  const editor = await session();
  editor.type("Typed text");
  editor.edit(1, 2, ["Typed text"]);
  assert.equal(editor.keeps(), true);
  editor.edit(1, 2, ["Other text"]);
  assert.equal(editor.keeps(), false);
});

test("an identical block left after this one is deleted does not take its editor", async () => {
  const editor = await session(TWO, 0);
  editor.type("```js");
  editor.leave();
  // Block A deleted: CodeMirror offers its element to block B, which reads just like A did.
  editor.edit(0, 5, []);
  assert.equal(editor.keeps(), false);
});

test("a draft comes back when the note is closed and opened again", async () => {
  const editor = await session();
  editor.type("```js");
  editor.close();
  editor.abort();
  assert.deepEqual(editor.notices, ["textDraftSaved"]);
  editor.open(BLOCK);
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

test("a draft comes back after its block is deleted and the deletion undone", async () => {
  const editor = await session();
  editor.type("```js");
  // The note's only layout goes: the note has no snapshot any more.
  editor.edit(0, 4, ["Only text now"]);
  editor.abort();
  assert.deepEqual(editor.notices, ["textDraftSaved"]);
  editor.undo();
  editor.reopen();
  assert.equal(editor.editorText(), "```js");
});

test("a draft comes back after its column is changed elsewhere and the change undone, not before", async () => {
  const editor = await session();
  editor.type("```js");
  editor.edit(1, 2, ["Changed elsewhere"]);
  assert.equal(editor.keeps(), false);
  editor.abort();
  assert.deepEqual(editor.notices, ["textDraftSaved"]);
  // Writing the draft over the change made elsewhere would undo it: not restored.
  editor.reopen();
  assert.equal(editor.editorText(), "Changed elsewhere");
  editor.abort();
  editor.undo();
  editor.reopen();
  assert.equal(editor.editorText(), "```js");
});

test("text that was saved leaves no draft behind", async () => {
  const editor = await session();
  editor.type("Saved text");
  editor.edit(1, 2, ["Saved text"]);
  editor.close();
  editor.abort();
  assert.deepEqual(editor.notices, []);
  editor.open(["<!-- vml -->", "Saved text", "![[a.png]]", "<!-- /vml -->"]);
  editor.reopen();
  assert.equal(editor.editorText(), "Saved text");
});

test("a draft is not kept when identical blocks leave no telling where it belongs", async () => {
  const editor = await session(TWO, 0);
  editor.type("```js");
  editor.close();
  editor.abort();
  assert.deepEqual(editor.notices, ["textDraftNotKept"]);
  editor.open(TWO);
  editor.reopen(1);
  assert.equal(editor.editorText(), "Left text");
});

test("a draft is not kept when its block is deleted and an identical one is left", async () => {
  const editor = await session(TWO, 0);
  editor.type("```js");
  editor.edit(0, 5, []);
  editor.abort();
  assert.deepEqual(editor.notices, ["textDraftNotKept"]);
  editor.reopen();
  assert.equal(editor.editorText(), "Left text");
});

test("a draft is judged by its own note, not the one its editor goes on to show", async () => {
  const editor = await session(TWO, 0);
  editor.type("```js");
  // Obsidian reuses the editor for another note, with a layout of its own, before the widget goes.
  editor.switchTo(["<!-- vml -->", "Another note", "![[c.png]]", "<!-- /vml -->"]);
  editor.abort();
  assert.deepEqual(editor.notices, ["textDraftNotKept"]);
  // Back in the first note, block A deleted: B must not get A's draft.
  editor.open(TWO);
  editor.edit(0, 5, []);
  editor.reopen();
  assert.equal(editor.editorText(), "Left text");
});

test("a draft is kept for a block alone in its note when the editor goes on to another note", async () => {
  const editor = await session();
  editor.type("```js");
  editor.switchTo(["Another note"]);
  editor.abort();
  assert.deepEqual(editor.notices, ["textDraftSaved"]);
  editor.open(BLOCK);
  editor.reopen();
  assert.equal(editor.editorText(), "```js");
});

test("a kept draft waits while the note has identical blocks, and comes back once one is left", async () => {
  const editor = await session();
  editor.type("```js");
  editor.close();
  editor.abort();
  assert.deepEqual(editor.notices, ["textDraftSaved"]);
  // A copy of the block was pasted meanwhile: neither copy takes the draft.
  editor.open(TWO);
  editor.reopen(1);
  assert.equal(editor.editorText(), "Left text");
  assert.equal(editor.notices.at(-1), "textDraftAmbiguous");
  editor.abort();
  // The copy gone again, the draft comes back.
  editor.edit(4, 9, []);
  editor.reopen();
  assert.equal(editor.editorText(), "```js");
  assert.equal(editor.notices.at(-1), "textDraftRestored");
});
