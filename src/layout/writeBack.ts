import { MarkdownView, type App, type Editor, type TFile } from "obsidian";

import { applyEditsToEditor, applyEditsToText, type BlockEdit, type EditFailure } from "./edits.ts";

export type WriteResult = { ok: true } | EditFailure;

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
 * `editor`, when given, is the editor the change is made in: text typed right in a layout goes into
 * the editor it is typed in, also when the note is open in several panes.
 */
export async function writeBlockEdits(app: App, file: TFile, edits: readonly BlockEdit[], editor?: Editor): Promise<WriteResult> {
  if (edits.length === 0) {
    return { ok: true };
  }
  if (editor) {
    return applyEditsToEditor(editor, edits);
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
