import { scanMarkdownLines } from "./lineContext.ts";

/**
 * A line live preview draws with reading view's break between two paragraphs:
 * - `blank`: a blank line, as high as the break instead of a whole line;
 * - `extra`: a blank line after the first of a run, which reading view makes one break with; it takes
 *   no room while the cursor is elsewhere;
 * - `after`: a line followed right away by another block, which reading view parts from it by the
 *   break and live preview does not; the break goes below it.
 */
export interface ParagraphBreak {
  /** 0-based line. */
  line: number;
  kind: "blank" | "extra" | "after";
}

export interface BreakBlock {
  openLine: number;
  closeLine: number;
  /** A drawn layout that floats: its widget is an anchor of no height between the lines around it. */
  floats: boolean;
}

const HEADING = /^ {0,3}(#{1,6})(?:\s|$)/;

/** The level of a heading line, else 0. */
function headingLevel(line: string | undefined): number {
  return line === undefined ? 0 : HEADING.exec(line)?.[1]?.length ?? 0;
}

/**
 * The lines of a note's text that live preview draws with reading view's paragraph spacing, so that
 * the note's text, and what of it sits beside a float, lies where reading view and the PDF put it
 * (docs/DESIGN.md, section 4.3).
 *
 * The spacing above a heading, and below a first-level one, is the heading's own: it differs between
 * the two modes by level and theme, and a whole blank line there already comes out close. Lines in
 * layouts, code, math, comments and frontmatter are left alone.
 */
export function paragraphBreaks(lines: readonly string[], blocks: readonly BreakBlock[]): ParagraphBreak[] {
  const contexts = scanMarkdownLines(lines);
  const inBlock = new Uint8Array(lines.length);
  for (const block of blocks) {
    inBlock.fill(1, block.openLine, block.closeLine + 1);
  }
  const text = (line: number): boolean => contexts[line] === "text" && inBlock[line] === 0;
  const blank = (line: number): boolean => text(line) && (lines[line] ?? "").trim() === "";
  const filled = (line: number): boolean => text(line) && (lines[line] ?? "").trim() !== "";
  const breaks: ParagraphBreak[] = [];
  const opens = new Set(blocks.map((block) => block.openLine));

  for (let line = 0; line < lines.length; line += 1) {
    if (filled(line)) {
      // A heading below which the text goes on right away.
      const level = headingLevel(lines[line]);
      if (level >= 2 && filled(line + 1) && headingLevel(lines[line + 1]) === 0 && !opens.has(line + 1)) {
        breaks.push({ line, kind: "after" });
      }
      continue;
    }
    if (!blank(line) || (line > 0 && blank(line - 1))) {
      continue;
    }
    let end = line;
    while (end + 1 < lines.length && blank(end + 1)) {
      end += 1;
    }
    if (headingLevel(lines[end + 1]) === 0 && headingLevel(lines[line - 1]) !== 1) {
      breaks.push({ line, kind: "blank" });
    }
    for (let extra = line + 1; extra <= end; extra += 1) {
      breaks.push({ line: extra, kind: "extra" });
    }
    line = end;
  }

  // Blocks written without a blank line between them that reading view still draws apart.
  for (const line of blockStarts(lines, filled)) {
    if (!breaks.some((item) => item.line === line - 1)) {
      breaks.push({ line: line - 1, kind: "after" });
    }
  }

  // Text right above and right below a float: reading view parts the two by a break, the float's
  // anchor between them takes no room.
  for (const block of blocks) {
    const above = block.openLine - 1;
    if (block.floats && filled(above) && filled(block.closeLine + 1) && !breaks.some((item) => item.line === above)) {
      breaks.push({ line: above, kind: "after" });
    }
  }
  return breaks.sort((a, b) => a.line - b.line);
}

const LIST_ITEM = /^( {0,3})(?:([-*+])|(\d{1,9})([.)]))(?:[ \t]|$)/;
const QUOTE = /^ {0,3}>/;

/**
 * The block a line of text belongs to, given the block of the line before it (null after a blank
 * line or a heading): a list of one kind (its items share their bullet, or their number's delimiter),
 * a quote, or a paragraph. Text right below a list or a quote goes on in it (a lazy continuation
 * line), an indented item in a list is a nested one, and only a list starting at 1 interrupts a
 * paragraph.
 */
function blockOf(text: string, previous: string | null): string {
  const item = LIST_ITEM.exec(text);
  if (item) {
    const nested = previous !== null && previous.startsWith("list") && item[1] !== "";
    const continues = previous === "paragraph" && item[3] !== undefined && item[3] !== "1";
    return nested || continues ? previous : `list${item[2] ?? item[4] ?? ""}`;
  }
  return QUOTE.test(text) ? "quote" : previous ?? "paragraph";
}

/**
 * Lines that start a list or a quote right below another block of text, with no blank line between:
 * below a paragraph, a list of another kind, or a quote or a list. A heading's spacing is the
 * heading's own.
 */
function blockStarts(lines: readonly string[], filled: (line: number) => boolean): number[] {
  const starts: number[] = [];
  let previous: string | null = null;
  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line] ?? "";
    if (!filled(line) || headingLevel(text) > 0) {
      previous = null;
      continue;
    }
    const block = blockOf(text, previous);
    if (previous !== null && block !== previous) {
      starts.push(line);
    }
    previous = block;
  }
  return starts;
}
