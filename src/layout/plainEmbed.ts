import { findV2Blocks, mermaidEmbed, readEmbedRow, type V2Embed } from "../format/v2.ts";
import { fencedCodeBlocks, scanMarkdownLines } from "../markdown/lineContext.ts";
import type { BlockEdit } from "./edits.ts";

export interface TakenEmbed {
  embed: V2Embed;
  /** Removes the whole embed, anchored to its exact source and a plain-text boundary. */
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

/** Only a complete top-level Mermaid outside every layout can be taken as a standalone item. */
export function takePlainMermaid(lines: readonly string[], line: number): TakenEmbed | null {
  const fence = fencedCodeBlocks(lines).find(fence => fence.language === "mermaid" && fence.from <= line && line <= fence.to);
  if (!fence || findV2Blocks(lines).some(block => block.openLine <= fence.to && fence.from <= block.closeLine)) return null;
  const contexts = scanMarkdownLines(lines, true);
  // The shared writer validates at a text boundary; the removed range is only the complete fence.
  const before = fence.from > 0 && contexts[fence.from - 1] === "text";
  const anchorLine = before ? fence.from - 1 : fence.from;
  let boundary = fence.to + 1;
  while (contexts[boundary] !== "text" && boundary < lines.length) boundary++;
  const anchorEnd = before ? fence.to : boundary;
  return {
    embed: mermaidEmbed(lines, fence.from, fence.to),
    edit: { anchorLine, anchorLines: lines.slice(anchorLine, anchorEnd + 1).map(stripCarriageReturn),
      textOffset: before ? 0 : boundary - anchorLine, start: fence.from - anchorLine, end: fence.to - anchorLine, replacement: [] },
  };
}
