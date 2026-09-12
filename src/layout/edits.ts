import type { EditorChangeLike, EditorLike } from "../editor/editorLike.ts";
import { CLOSE_LINE, serializeBlock, serializeOpener, type V2Block, type V2Embed } from "../format/v2.ts";
import { scanMarkdownLines, type LineContext } from "../markdown/lineContext.ts";
import { metaFromModel, rowEmbeds, type LayoutModel } from "./model.ts";

/**
 * Turns layout changes into validated line edits (D2, D3).
 *
 * An edit is anchored to the exact lines its block had when it was rendered. Before writing, the
 * anchor must still be at its line, or, if the note shifted since, appear exactly once elsewhere in
 * plain text. Otherwise nothing is written. Only the block's own lines ever change.
 */

export interface BlockEdit {
  anchorLine: number;
  anchorLines: string[];
  /** Replaces anchorLines[start..end] (inclusive). */
  start: number;
  end: number;
  replacement: string[];
}

/** Replaces lines from..to (inclusive) of the current document. */
export interface LineChange {
  from: number;
  to: number;
  replacement: string[];
}

export type EditFailureReason = "not-found" | "ambiguous" | "overlap";

export interface EditFailure {
  ok: false;
  reason: EditFailureReason;
}

export type ResolveResult = { ok: true; changes: LineChange[] } | EditFailure;

/**
 * Only blocks that were read completely may be rewritten. With unreadable settings (a typo, or a
 * newer format version) or non-embed text in the body, a rewrite would silently drop what we could
 * not read, so such blocks are displayed but never written to (section 3.4).
 */
export function isEditable(block: V2Block): boolean {
  return block.metaError === null && block.invalidLine === null;
}

/**
 * Plans the edit for a changed model. A settings-only change rewrites just the opening comment and
 * keeps the body as the user wrote it; moving embeds rewrites the block; an empty model removes it.
 * Returns null when there is nothing to write or the block is not editable.
 */
export function planModelEdit(block: V2Block, model: LayoutModel): BlockEdit | null {
  if (!isEditable(block)) {
    return null;
  }
  const embeds = rowEmbeds(model);
  const lastLine = block.lines.length - 1;
  if (embeds.length === 0) {
    return anchored(block, 0, lastLine, []);
  }

  const meta = metaFromModel(model);
  if (sameRows(block, embeds)) {
    const opener = serializeOpener(meta);
    return opener === block.lines[0] ? null : anchored(block, 0, 0, [opener]);
  }
  return anchored(block, 0, lastLine, serializeBlock(meta, embeds));
}

/** Rewrites the block without the embed and puts the embed on its own line right after it. */
export function planMoveOut(block: V2Block, model: LayoutModel, embed: V2Embed): BlockEdit | null {
  if (!isEditable(block)) {
    return null;
  }
  const embeds = rowEmbeds(model);
  const replacement = embeds.length === 0
    ? [embed.raw]
    : [...serializeBlock(metaFromModel(model), embeds), "", embed.raw];
  return anchored(block, 0, block.lines.length - 1, replacement);
}

/** Removes the two layout comments and leaves the body exactly as written. */
export function planUnwrap(block: V2Block): BlockEdit {
  return anchored(block, 0, block.lines.length - 1, block.lines.slice(1, -1));
}

/** Wraps embed lines in a layout block with no settings. */
export function wrapLines(lines: readonly string[]): string[] {
  return [serializeOpener({ rows: [], extra: {} }), ...lines, CLOSE_LINE];
}

export function resolveEdits(lines: readonly string[], edits: readonly BlockEdit[]): ResolveResult {
  const normalized = lines.map(stripCarriageReturn);
  let contexts: LineContext[] | null = null;
  const contextAt = (line: number): LineContext | undefined => (contexts ??= scanMarkdownLines(normalized))[line];

  const changes: LineChange[] = [];
  const claimed: Array<[number, number]> = [];
  for (const edit of edits) {
    const at = locateAnchor(normalized, edit, contextAt);
    if (typeof at === "string") {
      return { ok: false, reason: at };
    }

    const anchorEnd = at + edit.anchorLines.length - 1;
    if (claimed.some(([start, end]) => at <= end && anchorEnd >= start)) {
      return { ok: false, reason: "overlap" };
    }
    claimed.push([at, anchorEnd]);

    const from = at + edit.start;
    let to = at + edit.end;
    // Removing a block between two blank lines would leave a double gap; take one of them along.
    if (edit.replacement.length === 0 && isBlank(normalized[from - 1]) && isBlank(normalized[to + 1])) {
      to += 1;
    }
    changes.push({ from, to, replacement: edit.replacement });
  }

  return { ok: true, changes: changes.sort((a, b) => b.from - a.from) };
}

export function applyLineChanges(lines: readonly string[], changes: readonly LineChange[]): string[] {
  const result = [...lines];
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    result.splice(change.from, change.to - change.from + 1, ...change.replacement);
  }
  return result;
}

/** Applies edits to file content, keeping its line endings; untouched lines stay byte-identical. */
export function applyEditsToText(text: string, edits: readonly BlockEdit[]): { ok: true; text: string } | EditFailure {
  const lines = text.split("\n");
  const resolved = resolveEdits(lines, edits);
  if (!resolved.ok) {
    return resolved;
  }

  const crlf = text.includes("\r\n");
  const lastLine = lines.length - 1;
  const lastLineHasCr = (lines[lastLine] ?? "").endsWith("\r");
  const changes = crlf
    ? resolved.changes.map((change) => ({
      ...change,
      replacement: change.replacement.map((line, index) => {
        const endsFile = change.to === lastLine && index === change.replacement.length - 1 && !lastLineHasCr;
        return endsFile ? line : `${line}\r`;
      }),
    }))
    : resolved.changes;

  let result = applyLineChanges(lines, changes).join("\n");
  if (crlf && !text.endsWith("\r") && result.endsWith("\r")) {
    result = result.slice(0, -1);
  }
  return { ok: true, text: result };
}

/** Applies edits to an open editor as a single transaction, or changes nothing on failure. */
export function applyEditsToEditor(editor: EditorLike, edits: readonly BlockEdit[]): { ok: true } | EditFailure {
  const lines = editor.getValue().split("\n");
  const resolved = resolveEdits(lines, edits);
  if (!resolved.ok) {
    return resolved;
  }

  editor.transaction({ changes: resolved.changes.map((change) => toEditorChange(lines, change)) });
  return { ok: true };
}

function toEditorChange(lines: readonly string[], change: LineChange): EditorChangeLike {
  const lineEnd = (line: number) => ({ line, ch: (lines[line] ?? "").length });

  if (change.replacement.length > 0) {
    return { from: { line: change.from, ch: 0 }, to: lineEnd(change.to), text: change.replacement.join("\n") };
  }
  // Deleting whole lines also removes one line break, matching applyLineChanges.
  if (change.to + 1 < lines.length) {
    return { from: { line: change.from, ch: 0 }, to: { line: change.to + 1, ch: 0 }, text: "" };
  }
  if (change.from > 0) {
    return { from: lineEnd(change.from - 1), to: lineEnd(change.to), text: "" };
  }
  return { from: { line: 0, ch: 0 }, to: lineEnd(change.to), text: "" };
}

function locateAnchor(
  lines: readonly string[],
  edit: BlockEdit,
  contextAt: (line: number) => LineContext | undefined,
): number | EditFailureReason {
  const usable = (line: number) => matchesAt(lines, edit.anchorLines, line) && contextAt(line) === "text";
  if (usable(edit.anchorLine)) {
    return edit.anchorLine;
  }

  const hits: number[] = [];
  for (let line = 0; line + edit.anchorLines.length <= lines.length; line += 1) {
    if (usable(line)) {
      hits.push(line);
    }
  }
  if (hits.length === 1) {
    return hits[0] ?? "not-found";
  }
  return hits.length === 0 ? "not-found" : "ambiguous";
}

function matchesAt(lines: readonly string[], expected: readonly string[], at: number): boolean {
  return at >= 0
    && at + expected.length <= lines.length
    && expected.every((line, index) => lines[at + index] === line);
}

function sameRows(block: V2Block, embeds: ReadonlyArray<readonly V2Embed[]>): boolean {
  return block.rows.length === embeds.length
    && block.rows.every((row, index) => {
      const target = embeds[index] ?? [];
      return row.embeds.length === target.length && row.embeds.every((embed, column) => embed.raw === target[column]?.raw);
    });
}

function anchored(block: V2Block, start: number, end: number, replacement: string[]): BlockEdit {
  return { anchorLine: block.openLine, anchorLines: block.lines, start, end, replacement };
}

function isBlank(line: string | undefined): boolean {
  return line !== undefined && line.trim() === "";
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
