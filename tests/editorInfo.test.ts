import assert from "node:assert/strict";
import { test } from "node:test";
import * as editorInfo from "../src/editor/editorInfo.ts";
import * as paragraphBreaks from "../src/markdown/paragraphBreaks.ts";
import { mockedModule } from "./support/mockedModule.ts";

test("editor lookup tolerates the host getter before its edit mode exists and retries after initialization", () => {
  const editor = {};
  let editMode: { editor: object } | undefined;
  const info = { get editor() { return editMode!.editor; } };
  assert.throws(() => info.editor, /reading 'editor'/);
  assert.equal(editorInfo.editorOfInfo(info), undefined);
  editMode = { editor };
  assert.equal(editorInfo.editorOfInfo(info), editor);
  assert.equal(editorInfo.editorOfInfo({ editor }), editor);
  assert.equal(editorInfo.editorOfInfo(undefined), undefined);
});

test("file ownership skips an initializing Markdown view without losing another pane or Canvas owner", async () => {
  class MarkdownView {
    file: object | null = null;
    editMode?: { editor: object };
    get editor() { return this.editMode!.editor; }
    getMode() { return "source"; }
  }
  const pending = new MarkdownView();
  const ready = new MarkdownView();
  const file = { path: "note.md" }, editor = {}, canvasBuffer = {}, canvasFile = { path: "board.canvas" };
  ready.file = file;
  ready.editMode = { editor };
  const adapter = await mockedModule<{ fileOfEditor(app: unknown, editor: object | undefined): object | null }>(
    new URL("../src/view/obsidianInternals.ts", import.meta.url), {
      obsidian: { MarkdownView }, "../editor/editorInfo.ts": editorInfo, "../markdown/paragraphBreaks.ts": paragraphBreaks,
      "./canvas.ts": { canvasEditor: (_app: unknown, buffer: object) => buffer === canvasBuffer ? { file: canvasFile } : null },
    });
  const app = { workspace: { getLeavesOfType: () => [{ view: pending }, { view: ready }] } };
  assert.equal(adapter.fileOfEditor(app, editor), file);
  assert.equal(adapter.fileOfEditor(app, canvasBuffer), canvasFile);
  assert.equal(adapter.fileOfEditor(app, {}), null);
  assert.equal(adapter.fileOfEditor(app, undefined), null);
});
