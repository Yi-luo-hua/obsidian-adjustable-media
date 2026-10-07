import { scanMarkdownConstructs } from "./lineContext.ts";

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
  const { contexts, opens: constructs } = scanMarkdownConstructs(lines);
  const inBlock = new Uint8Array(lines.length);
  for (const block of blocks) {
    inBlock.fill(1, block.openLine, block.closeLine + 1);
  }
  const text = (line: number): boolean => contexts[line] === "text" && inBlock[line] === 0;
  const blank = (line: number): boolean => text(line) && (lines[line] ?? "").trim() === "";
  const filled = (line: number): boolean => text(line) && (lines[line] ?? "").trim() !== "";
  const breaks: ParagraphBreak[] = [];
  const taken = new Set<number>();
  const add = (line: number, kind: ParagraphBreak["kind"]): void => {
    if (!taken.has(line)) {
      taken.add(line);
      breaks.push({ line, kind });
    }
  };
  const opens = new Set(blocks.map((block) => block.openLine));
  const code = indentedCode(lines, text, (line) => inBlock[line] === 1, (line) => constructs[line] === true);

  for (let line = 0; line < lines.length; line += 1) {
    if (filled(line)) {
      // A heading below which the text goes on right away.
      const level = headingLevel(lines[line]);
      if (level >= 2 && filled(line + 1) && headingLevel(lines[line + 1]) === 0 && !opens.has(line + 1)) {
        add(line, "after");
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
    // Blank lines inside an indented code block belong to the code.
    if (code[line - 1] === 1 && code[end + 1] === 1) {
      line = end;
      continue;
    }
    if (headingLevel(lines[end + 1]) === 0 && headingLevel(lines[line - 1]) !== 1) {
      add(line, "blank");
    }
    for (let extra = line + 1; extra <= end; extra += 1) {
      add(extra, "extra");
    }
    line = end;
  }

  // Blocks written without a blank line between them that reading view still draws apart.
  for (const line of blockStarts(lines, filled)) {
    add(line - 1, "after");
  }

  // Text right above and right below a float: reading view parts the two by a break, the float's
  // anchor between them takes no room.
  for (const block of blocks) {
    const above = block.openLine - 1;
    if (block.floats && filled(above) && filled(block.closeLine + 1)) {
      add(above, "after");
    }
  }
  return breaks.sort((a, b) => a.line - b.line);
}

const LIST_ITEM = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]*)/;
const QUOTE = /^ {0,3}>/;
const INDENT = /^[ \t]*/;

/** The column after `text`, with tab stops every 4 columns, from column `start`. */
function columnAfter(text: string, start: number): number {
  let column = start;
  for (const char of text) {
    column = char === "\t" ? column + 4 - (column % 4) : column + 1;
  }
  return column;
}

interface ListItem {
  /** The list it belongs to: its bullet, or its number's delimiter. */
  kind: string;
  indent: number;
  /** Where the item's text starts: an item indented that far or more is nested in it. */
  content: number;
  number: string | undefined;
}

function listItem(text: string): ListItem | null {
  const match = LIST_ITEM.exec(text);
  if (!match) {
    return null;
  }
  const indent = columnAfter(match[1] ?? "", 0);
  const marker = match[2] ?? `${match[3] ?? ""}${match[4] ?? ""}`;
  const space = match[5] ?? "";
  const rest = text.slice(match[0].length);
  if (space === "" && rest !== "") {
    return null;
  }
  const after = columnAfter(space, indent + marker.length);
  // No text, or a run of five or more columns, puts the text one column after the marker.
  const content = rest === "" || after - indent - marker.length > 4 ? indent + marker.length + 1 : after;
  return { kind: `list${match[2] ?? match[4] ?? ""}`, indent, content, number: match[3] };
}

const THEMATIC_BREAK = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ATX_HEADING = /^#{1,6}(?:[ \t]|$)/;

/**
 * Which lines belong to an indented code block. Code is indented four columns past where the text of
 * the list item it is in starts, or past the margin outside lists, and does not start right below a
 * paragraph line (a quote's line does not count as one, as Obsidian draws it): indented as far there,
 * or only as far as an item's text, it is ordinary text. Only
 * a paragraph goes on lazily in a line indented less than its list item's text; any other line, or
 * one after a blank line, closes the items whose text it does not reach.
 */
function indentedCode(lines: readonly string[], text: (line: number) => boolean, layout: (line: number) => boolean,
  opens: (line: number) => boolean): Uint8Array {
  const code = new Uint8Array(lines.length);
  /** Where the text of each open list item starts, the innermost last. */
  const items: number[] = [];
  const base = (): number => items[items.length - 1] ?? 0;
  let afterBlank = true;
  let afterParagraph = false;
  for (let line = 0; line < lines.length; line += 1) {
    const source = lines[line] ?? "";
    if (!text(line)) {
      // A layout is at the top of the note. Fenced code, math or a comment stays in the list items its
      // opening line reaches the text of, and ends the others; the lines inside it say nothing.
      if (layout(line)) {
        items.length = 0;
      } else if (opens(line)) {
        const indent = columnAfter(INDENT.exec(source)?.[0] ?? "", 0);
        while (items.length > 0 && indent < base()) {
          items.pop();
        }
      }
      afterBlank = false;
      afterParagraph = false;
      continue;
    }
    if (source.trim() === "") {
      afterBlank = true;
      afterParagraph = false;
      continue;
    }
    const indent = columnAfter(INDENT.exec(source)?.[0] ?? "", 0);
    const trimmed = source.trimStart();
    const thematic = THEMATIC_BREAK.test(trimmed);
    const item = thematic ? null : listItem(source);
    const lazy = !afterBlank && afterParagraph && !item && !thematic && !ATX_HEADING.test(trimmed) && !trimmed.startsWith(">");
    if (!lazy) {
      while (items.length > 0 && indent < base()) {
        items.pop();
      }
    }
    const inCode: boolean = indent >= base() + 4 && !afterParagraph;
    code[line] = inCode ? 1 : 0;
    if (item && !inCode) {
      items.push(item.content);
    }
    // A heading or a rule ends where it is, and Obsidian ends a quote before a line indented as code
    // (CommonMark would take it lazily into the quote); anything else here is a paragraph that may go on.
    const own = indent - base() <= 3;
    afterParagraph = !inCode && !(own && (thematic || ATX_HEADING.test(trimmed) || trimmed.startsWith(">")));
    afterBlank = false;
  }
  return code;
}

/**
 * Lines that start a list or a quote right below another block of text, with no blank line between:
 * below a paragraph, a list of another kind, or a quote or a list. Text right below a list or a quote
 * goes on in it (a lazy continuation line); an item indented as far as the text of the list's item
 * above is nested in it; only a list starting at 1 interrupts a paragraph; a heading's spacing is the
 * heading's own.
 */
function blockStarts(lines: readonly string[], filled: (line: number) => boolean): number[] {
  const starts: number[] = [];
  let previous = null as string | null;
  /** Where the text of the current list's last top-level item starts. */
  let content = 0;
  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line] ?? "";
    if (!filled(line) || headingLevel(text) > 0) {
      previous = null;
      continue;
    }
    // An item indented four columns or more is not one at the top: text in the item above.
    const found = listItem(text);
    const item = found && found.indent <= 3 ? found : null;
    let block: string;
    if (item && previous?.startsWith("list") === true && item.indent >= content) {
      block = previous;
    } else if (item && !(previous === "paragraph" && item.number !== undefined && item.number !== "1")) {
      block = item.kind;
      content = item.content;
    } else {
      block = QUOTE.test(text) ? "quote" : previous ?? "paragraph";
    }
    if (previous !== null && block !== previous) {
      starts.push(line);
    }
    previous = block;
  }
  return starts;
}
