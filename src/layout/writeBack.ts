import { MarkdownView, editorInfoField, type App, type Editor, type TFile } from "obsidian";
import type { EditorView } from "@codemirror/view";

import { applyEditsToEditor, applyEditsToText, type BlockEdit, type EditFailure } from "./edits.ts";
import { applyEditsToView } from "./editorTransaction.ts";

export type WriteResult = { ok: true } | EditFailure;

export interface WriteOptions {
  editor?: Editor;
  view?: EditorView;
  typing?: boolean;
}

/** Explicit onboarding action: create a fresh example folder, never modify an existing note. */
export async function writeExampleNote(
  app: App,
  name: string,
  text: string,
  assets: readonly { name: string; data: Uint8Array<ArrayBuffer> }[],
  folderName: string,
): Promise<TFile> {
  let folder = folderName;
  for (let suffix = 2; app.vault.getAbstractFileByPath(folder); suffix++) folder = `${folderName} ${suffix}`;
  await app.vault.createFolder(folder);
  await app.vault.createFolder(`${folder}/assets`);
  for (const asset of assets) await app.vault.createBinary(`${folder}/assets/${asset.name}`, asset.data.buffer);
  return app.vault.create(`${folder}/${name}.md`, text);
}

/**
 * The only place layout changes are written to a note (docs/DESIGN.md, section 3).
 *
 * If the note is being edited (source or live preview) in some pane, the change goes through that
 * editor as one transaction: unsaved typing is kept and the change can be undone. Otherwise the
 * file is rewritten atomically with vault.process. Either way the target block is validated first
 * and nothing is written on mismatch.
 *
 * A view in reading mode still has an editor, but changing it only updates the hidden buffer: the
 * note is neither saved nor re-rendered (docs/DESIGN.md, section 4). Reading mode therefore
 * writes the file, and Obsidian reloads the view from it.
 *
 * The originating view is used when given, including when the note is open in several panes.
 * Layout gestures and text input use CodeMirror without scrolling to the note's distant cursor.
 * Text input groups as typing; each layout gesture is its own undo step.
 */
export async function writeBlockEdits(
  app: App,
  file: TFile,
  edits: readonly BlockEdit[],
  options: WriteOptions = {},
): Promise<WriteResult> {
  if (edits.length === 0) {
    return { ok: true };
  }
  if (options.view) {
    // A modal may outlive the pane that opened it. Matching text in a different note is not consent
    // to edit that note, and a hidden reading-mode editor does not save its buffer.
    const info = options.view.state.field(editorInfoField, false);
    const origin = app.workspace.getLeavesOfType("markdown").some((leaf) => leaf.view instanceof MarkdownView
      && leaf.view.file?.path === file.path && leaf.view.getMode() === "source" && leaf.view.editor === info?.editor);
    if (info?.file?.path !== file.path || !options.view.dom.isConnected || !origin) {
      return { ok: false, reason: "not-found" };
    }
    const result = applyEditsToView(options.view, edits, options.typing);
    if (result.ok && !options.typing) {
      // A pointer gesture can leave focus on the body. Restore keyboard undo to this pane without
      // moving its selection; focus() in CodeMirror preserves the scroll position.
      options.view.focus();
    }
    return result;
  }
  if (options.editor) {
    return applyEditsToEditor(options.editor, edits);
  }

  const view = app.workspace.getLeavesOfType("markdown")
    .map((leaf) => leaf.view)
    .find((candidate): candidate is MarkdownView => candidate instanceof MarkdownView
      && candidate.file?.path === file.path
      && candidate.getMode() === "source");
  if (view) {
    return applyEditsToEditor(view.editor, edits);
  }

  let result: WriteResult = { ok: true };
  await app.vault.process(file, (data) => {
    const applied = applyEditsToText(data, edits);
    result = applied.ok ? { ok: true } : applied;
    return applied.ok ? applied.text : data;
  });
  return result;
}
