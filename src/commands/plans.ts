import type { EditorLike } from "../editor/editorLike.ts";
import { findV2Blocks, hasSideText, serializeBlock, type V2Block } from "../format/v2.ts";
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

/**
 * Merges the block around `line` with the next one, when only blank lines separate them. Blocks with
 * text beside their media are not merged: the text of one would end up between rows of the other.
 */
export function planMergeWithNext(lines: readonly string[], line: number): LineChange | null {
  const blocks = findV2Blocks(lines);
  const index = blocks.findIndex((block) => block.openLine <= line && line <= block.closeLine);
  const current = blocks[index];
  const next = blocks[index + 1];
  const mergeable = (block: V2Block | undefined): block is V2Block => block !== undefined && isEditable(block) && !hasSideText(block);
  if (index < 0 || !mergeable(current) || !mergeable(next)) {
    return null;
  }
  for (let between = current.closeLine + 1; between < next.openLine; between += 1) {
    if ((lines[between] ?? "").trim() !== "") {
      return null;
    }
  }

  const first = modelFromBlock(current);
  const merged = { ...first, rows: [...first.rows, ...modelFromBlock(next).rows] };
  return { from: current.openLine, to: next.closeLine, replacement: serializeBlock(metaFromModel(merged), rowEmbeds(merged)) };
}

/** Applies a line change planned from the editor's current content, as one undo step. */
export function applyLineChange(editor: EditorLike, change: LineChange): void {
  const lastLine = editor.getLine(change.to);
  editor.transaction({
    changes: [{ from: { line: change.from, ch: 0 }, to: { line: change.to, ch: lastLine.length }, text: change.replacement.join("\n") }],
  });
}
