import { findV2Blocks, MAX_WRAP_SKIP, serializeOpener, type V2Block, type WrapSide } from "../format/v2.ts";
import { scanMarkdownLines, type LineContext } from "../markdown/lineContext.ts";
import { isEditable, planModelEdit, type BlockEdit } from "./edits.ts";
import { adjacentOppositeFloat, visualWrapSkip } from "./floatOrder.ts";
import { metaFromModel, modelFromBlock, setSkip, setWrap } from "./model.ts";

/**
 * Moving a whole layout block to another place in its note (docs/DESIGN.md, section 3), together
 * with the side it floats to and how many lines down it starts.
 */

export interface Placement {
  /** The line the block goes in front of; the line count means the end of the note. */
  line: number;
  wrap: WrapSide | null;
  /** How many lines below its place a wrapped block starts; ignored without wrapping. */
  skip: number;
}

export interface GapTop {
  line: number;
  /** Where the gap is on screen. */
  top: number;
}

/** Resolve the block at its current widget position before falling back to a unique text match. */
export function blockForMove(lines: readonly string[], expected: V2Block, line: number): V2Block | "not-found" | "ambiguous" {
  const matches = findV2Blocks(lines).filter((block) => block.lines.length === expected.lines.length
    && block.lines.every((text, index) => text === expected.lines[index]));
  return matches.find((block) => block.openLine === line)
    ?? (matches.length === 1 ? matches[0] : matches.length === 0 ? "not-found" : "ambiguous");
}

const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])[ \t]/;
const HEADING = /^#{1,6}(?:[ \t]|$)/;
const CLOSE_LINE = /^<!-- \/vml -->[ \t]*$/;

/**
 * The lines a block may be moved in front of: the first line of each top-level Markdown block (after
 * a blank line, a heading or another layout block), plus the end of the note. Code, math, comments,
 * frontmatter, indented lines and the inside of lists and of layout blocks are never split.
 */
export function blockGaps(lines: readonly string[], contexts: readonly LineContext[] = scanMarkdownLines(lines)): number[] {
  const inside = new Set<number>();
  for (const block of findV2Blocks(lines, contexts)) {
    for (let line = block.openLine + 1; line <= block.closeLine; line += 1) {
      inside.add(line);
    }
  }

  const gaps: number[] = [];
  for (let line = 0; line < lines.length; line += 1) {
    const text = stripCarriageReturn(lines[line] ?? "");
    if (text.trim() === "" || contexts[line] !== "text" || /^[ \t]/.test(text) || inside.has(line)) {
      continue;
    }
    if (line > 0 && !followsBlockEnd(lines, contexts, line)) {
      continue;
    }
    if (LIST_ITEM.test(text) && continuesList(lines, line)) {
      continue;
    }
    gaps.push(line);
  }
  // EOF is not outside an unterminated fence, equation, frontmatter or comment.
  if (scanMarkdownLines([...lines, "vml insertion boundary"]).at(-1) === "text") {
    gaps.push(lines.length);
  }
  return gaps;
}

/**
 * The gap a block dragged to `y` goes to. A wrapped block goes in front of the part of the note the
 * pointer is in, the last gap at or above it, so the pointer can then pick the line it starts at.
 * A block that does not wrap goes to the nearest gap.
 */
export function pickGap(gaps: readonly GapTop[], y: number, wrapped: boolean): GapTop | null {
  if (wrapped) {
    let best: GapTop | null = gaps[0] ?? null;
    for (const gap of gaps) {
      if (gap.top <= y) {
        best = gap;
      }
    }
    return best;
  }
  return gaps.reduce<GapTop | null>((best, gap) => (best === null || Math.abs(gap.top - y) < Math.abs(best.top - y) ? gap : best), null);
}

/** Whether putting `block` in front of `line` leaves it where it is. */
export function isSamePlace(lines: readonly string[], block: V2Block, line: number): boolean {
  if (line === block.openLine) {
    return true;
  }
  let next = block.closeLine + 1;
  while (next < lines.length && stripCarriageReturn(lines[next] ?? "").trim() === "") {
    next += 1;
  }
  return line === next;
}

/** Keep adjacent opposite-side floats in the order of the height they start at. CSS cannot place a
 * later float above an earlier one, so a moved block crossing its neighbor must cross it in the
 * note too.
 */
export function orderAdjacentFloat(lines: readonly string[], block: V2Block, placement: Placement): Placement {
  if (placement.wrap === null || !isSamePlace(lines, block, placement.line)) {
    return placement;
  }
  const blocks = findV2Blocks(lines);
  const index = blocks.findIndex((candidate) => candidate.openLine === block.openLine);
  if (index < 0) {
    return placement;
  }
  const after = adjacentOppositeFloat(lines, blocks, index, 1);
  if (after && placement.wrap !== modelFromBlock(after).wrap && placement.skip > visualWrapSkip(lines, blocks, index + 1)) {
    return { ...placement, line: after.closeLine + 1 };
  }
  const before = adjacentOppositeFloat(lines, blocks, index, -1);
  if (before && placement.wrap !== modelFromBlock(before).wrap && placement.skip < visualWrapSkip(lines, blocks, index - 1)) {
    return { ...placement, line: before.openLine };
  }
  return placement;
}

/**
 * Plans putting `block` at `placement`. At its own place only the opening comment changes.
 * Elsewhere the block leaves its place, taking one of two surrounding blank lines along, and goes in
 * front of the target line with its body verbatim: after a blank line, and followed by one unless
 * text wraps around it. A wrapped block sits right on top of the text that wraps around it.
 * Returns null when the block cannot be edited, [] when nothing changes.
 */
export function planPlacement(lines: readonly string[], block: V2Block, placement: Placement): BlockEdit[] | null {
  const ordered = orderAdjacentFloat(lines, block, placement);
  const afterAdjacent = ordered.line !== placement.line && ordered.line > block.closeLine
    && (ordered.line === lines.length || lines[ordered.line]?.trim() === "");
  const gaps = blockGaps(lines);
  if (!isEditable(block) || !gaps.includes(placement.line) || (!gaps.includes(ordered.line) && !afterAdjacent)) {
    return null;
  }
  const current = modelFromBlock(block);
  const blocks = findV2Blocks(lines);
  const index = blocks.findIndex((candidate) => candidate.openLine === block.openLine);
  const after = placement.wrap === current.wrap && isSamePlace(lines, block, placement.line) && index >= 0
    ? adjacentOppositeFloat(lines, blocks, index, 1) : null;
  const afterVisual = after ? visualWrapSkip(lines, blocks, index + 1) : 0;
  if (afterVisual > MAX_WRAP_SKIP) {
    return null;
  }
  const afterEdit = after ? planModelEdit(after, setSkip(modelFromBlock(after), afterVisual)) : null;
  if (after && afterVisual !== (modelFromBlock(after).skip ?? 0) && !afterEdit) {
    return null;
  }
  const model = setSkip(setWrap(current, ordered.wrap), ordered.skip);
  if (isSamePlace(lines, block, ordered.line)) {
    const edit = planModelEdit(block, model);
    return [...(edit ? [edit] : []), ...(afterEdit ? [afterEdit] : [])];
  }

  // Unchanged settings keep the opening comment exactly as the user wrote it.
  const meta = metaFromModel(model);
  const opener = JSON.stringify(meta) === JSON.stringify(metaFromModel(current)) ? block.lines[0] ?? "" : serializeOpener(meta);
  const moved = [opener, ...block.lines.slice(1)];
  const removal: BlockEdit = { anchorLine: block.openLine, anchorLines: block.lines, start: 0, end: block.lines.length - 1, replacement: [] };
  return [removal, insertion(lines, ordered.line, moved, model.wrap !== null), ...(afterEdit ? [afterEdit] : [])];
}

function insertion(lines: readonly string[], line: number, moved: readonly string[], glued: boolean): BlockEdit {
  const last = lines.length - 1;
  if (line > last) {
    const end = stripCarriageReturn(lines[last] ?? "");
    // The note ends with a line break: the block goes before it, and the line break stays last.
    if (end.trim() === "" && last > 0) {
      const before = stripCarriageReturn(lines[last - 1] ?? "");
      const head = before.trim() === "" ? [] : [""];
      return { anchorLine: last - 1, anchorLines: [before, end], start: 1, end: 1, replacement: [...head, ...moved, ""] };
    }
    return { anchorLine: last, anchorLines: [end], start: 0, end: 0, replacement: [end, ...(end.trim() === "" ? [] : [""]), ...moved] };
  }

  const target = stripCarriageReturn(lines[line] ?? "");
  const tail = glued ? [target] : ["", target];
  if (line === 0) {
    return { anchorLine: 0, anchorLines: [target], start: 0, end: 0, replacement: [...moved, ...tail] };
  }
  // Anchored to the line above as well: a single line of text is often not unique.
  const previous = stripCarriageReturn(lines[line - 1] ?? "");
  const head = previous.trim() === "" ? [] : [""];
  return { anchorLine: line - 1, anchorLines: [previous, target], textOffset: 1, start: 1, end: 1, replacement: [...head, ...moved, ...tail] };
}

function followsBlockEnd(lines: readonly string[], contexts: readonly LineContext[], line: number): boolean {
  // Frontmatter, a code fence, math or a comment just ended.
  if (contexts[line - 1] !== "text") {
    return true;
  }
  const previous = stripCarriageReturn(lines[line - 1] ?? "");
  return previous.trim() === "" || HEADING.test(previous) || CLOSE_LINE.test(previous);
}

/** A list item after blank lines still belongs to the list above it, if there is one. */
function continuesList(lines: readonly string[], line: number): boolean {
  for (let previous = line - 1; previous >= 0; previous -= 1) {
    const text = stripCarriageReturn(lines[previous] ?? "");
    if (text.trim() !== "") {
      return LIST_ITEM.test(text) || /^[ \t]/.test(text);
    }
  }
  return false;
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
