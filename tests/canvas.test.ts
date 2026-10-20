import assert from "node:assert/strict";
import { test } from "node:test";
import type { App, Editor, TFile } from "obsidian";
import { EditorState, StateField, type TransactionSpec } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import * as canvas from "../src/view/canvas.ts";
import * as edits from "../src/layout/edits.ts";
import * as transactions from "../src/layout/editorTransaction.ts";
import * as identity from "../src/layout/blockIdentity.ts";
import * as snapshots from "../src/layout/documentSnapshot.ts";
import { mockedModule } from "./support/mockedModule.ts";

function harness() {
  const file = { path: "Folder/board.canvas", extension: "canvas" } as TFile;
  let rerenders = 0;
  const node = (id: string) => {
    const editor = {} as Editor;
    const info = { editor, file: null as TFile | null };
    const infoField = StateField.define({ create: () => info, update: value => value });
    let state = EditorState.create({ doc: "Before\n\nContent\n\nAfter", extensions: [infoField, history()] });
    const view = { get state() { return state; }, dom: { isConnected: true },
      dispatch(spec: TransactionSpec) { state = state.update(spec).state; }, focus() {} };
    const child = { file: null as TFile | null, text: state.doc.toString(), editor,
      editMode: { cm: view }, containerEl: { isConnected: true }, getMode: () => "source",
      previewMode: { containerEl: {}, renderer: { rerender() { rerenders++; } } } };
    return { id, isEditing: true, nodeEl: { isConnected: true }, child, infoField, info, view };
  };
  const first = node("one"), second = node("two");
  const owner = { file, canvas: { readonly: false, nodes: new Map([[first.id, first], [second.id, second]]) } };
  let diskWrites = 0;
  const app = { workspace: { getLeavesOfType: (type: string) => type === "canvas" ? [{ view: owner }] : [] },
    vault: { process() { diskWrites++; throw new Error("Canvas JSON must never be treated as Markdown"); } } } as unknown as App;
  return { app, file, owner, first, second, rerenders: () => rerenders, diskWrites: () => diskWrites };
}

test("Canvas source ownership is by card editor, including its detached initialization buffer", () => {
  const h = harness();
  assert.equal(canvas.canvasEditor(h.app, h.first.child.editor)?.view, h.first.view);
  assert.equal(canvas.canvasEditor(h.app, h.second.child.editor)?.view, h.second.view);
  h.first.view.dom.isConnected = false;
  assert.equal(canvas.canvasEditor(h.app, h.first.child.editor), null);
  assert.equal(canvas.canvasEditor(h.app, h.first.child.editor, false)?.file, h.file);
  h.first.view.dom.isConnected = true;
  const markdown = { path: "Folder/card.md" } as TFile;
  h.first.child.file = markdown;
  assert.equal(canvas.canvasEditor(h.app, h.first.child.editor)?.file, markdown);
});

test("Canvas cannot write through a readonly, closed, replaced or removed card", () => {
  const h = harness(), editor = h.first.child.editor;
  h.owner.canvas.readonly = true;
  assert.equal(canvas.canvasEditor(h.app, editor), null);
  h.owner.canvas.readonly = false;
  h.first.isEditing = false;
  assert.equal(canvas.canvasEditor(h.app, editor), null);
  h.first.isEditing = true;
  h.first.nodeEl.isConnected = false;
  assert.equal(canvas.canvasEditor(h.app, editor), null);
  h.first.nodeEl.isConnected = true;
  h.first.child.editor = {} as Editor;
  assert.equal(canvas.canvasEditor(h.app, editor), null);
  h.owner.canvas.nodes.delete(h.first.id);
  assert.equal(canvas.canvasEditor(h.app, h.first.child.editor), null);
});

test("Canvas preview ownership stays separate for equal text, and expires when its card is replaced", () => {
  const h = harness();
  const [first, second] = canvas.canvasPreviewHosts(h.app);
  assert.notEqual(first, second);
  assert.equal(first, canvas.canvasPreviewHosts(h.app)[0]);
  assert.equal(first.file, h.file);
  assert.equal(first.getMode(), "preview", "the separate preview can prepare while the editor is still active");
  first.previewMode.rerender(true);
  assert.equal(h.rerenders(), 1);
  h.first.child.text = "Changed";
  assert.equal(first.getViewData(), "Changed");
  assert.notEqual(first.getViewData(), second.getViewData());
  h.owner.canvas.nodes.set(h.first.id, { ...h.first });
  assert.equal(first.file, null);
});

test("Canvas writes only the originating buffer, with one-step undo and no JSON fallback", async () => {
  const h = harness();
  const writer = await mockedModule<{ writeBlockEdits: (app: App, file: TFile, edits: edits.BlockEdit[], options?: object) => Promise<{ ok: boolean }> }>(
    new URL("../src/layout/writeBack.ts", import.meta.url), {
      obsidian: { MarkdownView: class {}, Platform: { isMobileApp: false }, editorInfoField: h.first.infoField },
      "@codemirror/view": {}, "../view/canvas.ts": canvas,
      "./edits.ts": edits, "./editorTransaction.ts": transactions,
      "./blockIdentity.ts": identity, "./documentSnapshot.ts": snapshots,
    });
  const before = h.first.view.state.doc.toString();
  const edit: edits.BlockEdit = { anchorLine: 2, anchorLines: ["Content"], start: 0, end: 0, replacement: ["<!-- vml -->", "Content", "<!-- /vml -->"] };
  assert.equal((await writer.writeBlockEdits(h.app, h.file, [edit], { editor: h.first.child.editor })).ok, true);
  assert.ok(h.first.view.state.doc.toString().includes("<!-- vml -->"));
  assert.equal(h.second.view.state.doc.toString(), before);
  assert.equal(undo(h.first.view), true);
  assert.equal(h.first.view.state.doc.toString(), before);
  assert.equal((await writer.writeBlockEdits(h.app, h.file, [edit])).ok, false);
  h.owner.canvas.nodes.delete(h.first.id);
  assert.equal((await writer.writeBlockEdits(h.app, h.file, [edit], { view: h.first.view })).ok, false);
  assert.equal(h.diskWrites(), 0);
});
