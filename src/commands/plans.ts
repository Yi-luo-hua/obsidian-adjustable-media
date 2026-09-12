import type { EditorLike } from "../editor/editorLike.ts";
import { findV2Blocks, serializeBlock, type V2Block } from "../format/v2.ts";
import { planWrap } from "../input/insertion.ts";
import { isEditable, type LineChange } from "../layout/edits.ts";
import { metaFromModel, modelFromBlock, rowEmbeds } from "../layout/model.ts";

/** Wraps the non-blank lines of a selection (whole lines) in one layout block. */
export function planWrapSelection(lines: readonly string[], fromLine: number, toLine: number): LineChange | null {
  const targets: number[] = [];
  for (let line = Math.min(fromLine, toLine); line <= Math.max(fromLine, toLine); line += 1) {
    if ((lines[line] ?? "").trim() !== "") {
      targets.push(line);
    }
  }
  return planWrap(lines, targets, { mergeWithPrevious: false });
}

export function blockAt(lines: readonly string[], line: number): V2Block | null {
  return findV2Blocks(lines).find((block) => block.openLine <= line && line <= block.closeLine) ?? null;
}

/** Merges the block around `line` with the next one, when only blank lines separate them. */
export function planMergeWithNext(lines: readonly string[], line: number): LineChange | null {
  const blocks = findV2Blocks(lines);
  const index = blocks.findIndex((block) => block.openLine <= line && line <= block.closeLine);
  const current = blocks[index];
  const next = blocks[index + 1];
  if (index < 0 || !current || !next || !isEditable(current) || !isEditable(next)) {
    return null;
  }
  for (let between = current.closeLine + 1; between < next.openLine; between += 1) {
    if ((lines[between] ?? "").trim() !== "") {
      return null;
    }
  }

  const first = modelFromBlock(current);
  const merged = { rows: [...first.rows, ...modelFromBlock(next).rows], extra: first.extra };
  return { from: current.openLine, to: next.closeLine, replacement: serializeBlock(metaFromModel(merged), rowEmbeds(merged)) };
}

/** Applies a line change planned from the editor's current content, as one undo step. */
export function applyLineChange(editor: EditorLike, change: LineChange): void {
  const lastLine = editor.getLine(change.to);
  editor.transaction({
    changes: [{ from: { line: change.from, ch: 0 }, to: { line: change.to, ch: lastLine.length }, text: change.replacement.join("\n") }],
  });
}
