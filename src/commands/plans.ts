import type { EditorLike } from "../editor/editorLike.ts";
import { findV2Blocks, hasSideText, readEmbedRow, serializeBlock, type V2Block, type V2Meta } from "../format/v2.ts";
import { planWrap } from "../input/insertion.ts";
import { isEditable, wrapLines, type LineChange } from "../layout/edits.ts";
import { metaFromModel, modelFromBlock, rowEmbeds } from "../layout/model.ts";
import { scanMarkdownLines } from "../markdown/lineContext.ts";

/**
 * Wraps the non-blank lines of a selection (whole lines) in one layout block. Media lines alone are
 * gathered into rows (planWrap). Lines with text are wrapped as they are, blank lines between them
 * included: text alone makes a text block, text before or after the media makes text columns beside
 * them, and text between rows of media makes a block of text with the media as figures in it. Code,
 * math and comments go in as text. Nothing is planned unless the lines lie outside any block and the
 * new block reads back as one that can be edited, with exactly these lines in it: a code fence the
 * selection only starts, for one, would take the closing comment in.
 */
export function planWrapSelection(lines: readonly string[], fromLine: number, toLine: number): LineChange | null {
  const targets: number[] = [];
  for (let line = Math.min(fromLine, toLine); line <= Math.max(fromLine, toLine); line += 1) {
    if ((lines[line] ?? "").trim() !== "") {
      targets.push(line);
    }
  }
  const first = targets[0];
  const last = targets[targets.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  if (targets.every((line) => readEmbedRow(stripCarriageReturn(lines[line] ?? ""), line) !== null)) {
    return planWrap(lines, targets, { mergeWithPrevious: false });
  }

  const contexts = scanMarkdownLines(lines);
  const blocks = findV2Blocks(lines, contexts);
  if (blocks.some((block) => block.openLine <= last && block.closeLine >= first)) {
    return null;
  }

  const body = lines.slice(first, last + 1).map(stripCarriageReturn);
  // Text before or after the media makes text columns beside them; anything else is a block of text,
  // with its media lines as figures in it.
  const hasMedia = targets.some((line) => readEmbedRow(stripCarriageReturn(lines[line] ?? ""), line) !== null);
  const attempts = hasMedia ? [wrapLines(body), wrapLines(body, TEXT_META)] : [wrapLines(body, TEXT_META)];
  for (const replacement of attempts) {
    const after = [...lines.slice(0, first), ...replacement, ...lines.slice(last + 1)];
    const closeLine = first + replacement.length - 1;
    const found = findV2Blocks(after);
    const wrapped = found.filter((block) => block.openLine <= closeLine && block.closeLine >= first);
    const block = wrapped[0];
    const fits = wrapped.length === 1
      && block !== undefined
      && block.openLine === first
      && block.closeLine === closeLine
      && isEditable(block)
      && blocks.length === found.length - 1;
    if (fits) {
      return { from: first, to: last, replacement };
    }
  }
  return null;
}

const TEXT_META: V2Meta = { rows: [], extra: { type: "text" } };

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
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
