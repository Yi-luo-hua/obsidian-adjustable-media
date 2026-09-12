import { findV2Blocks, readEmbedRow, type V2Embed } from "../format/v2.ts";
import { scanMarkdownLines } from "../markdown/lineContext.ts";
import type { BlockEdit } from "./edits.ts";

export interface TakenEmbed {
  embed: V2Embed;
  /** Removes the embed from its line, anchored to the line's exact text. */
  edit: BlockEdit;
}

/**
 * Takes one embed off a plain media line (a line of image or video embeds outside any layout), so it
 * can move into a layout. `column` is the embed's start, or any position inside it. The embed itself
 * moves verbatim; the rest of the line keeps its text and only loses the spaces that followed the
 * embed. A line left empty is removed.
 *
 * Returns null, touching nothing, when the line holds anything but media embeds, is not plain text,
 * or belongs to a layout.
 */
export function takePlainEmbed(lines: readonly string[], line: number, column: number): TakenEmbed | null {
  const text = stripCarriageReturn(lines[line] ?? "");
  const contexts = scanMarkdownLines(lines);
  if (contexts[line] !== "text") {
    return null;
  }
  if (findV2Blocks(lines, contexts).some((block) => block.openLine <= line && line <= block.closeLine)) {
    return null;
  }

  const embeds = readEmbedRow(text, line);
  const embed = embeds?.find((candidate) => candidate.from === column)
    ?? embeds?.find((candidate) => candidate.from <= column && column < candidate.to);
  if (!embeds || !embed) {
    return null;
  }

  const before = text.slice(0, embed.from);
  const after = text.slice(embed.to);
  const rest = before + after.trimStart();
  return {
    embed,
    edit: { anchorLine: line, anchorLines: [text], start: 0, end: 0, replacement: rest.trim() === "" ? [] : [rest] },
  };
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
