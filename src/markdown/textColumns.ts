import { MAX_TEXT_COLUMNS } from "../format/v2.ts";
import { scanMarkdownLines } from "./lineContext.ts";

export const COLUMN_BREAK = "+++";

export interface TextColumn {
  /** Exact offsets in the text block's source, excluding the separator line. */
  from: number;
  to: number;
  markdown: string;
}

export interface TextColumns {
  columns: TextColumn[];
  overflow: boolean;
}

/** Only standalone, unindented markers in ordinary top-level text split columns. */
export function textColumnBreaks(source: string): number[] {
  const lines = source.split("\n");
  // A text block's first --- is a rule, never document frontmatter.
  const contexts = scanMarkdownLines(["text block", ...lines]).slice(1);
  const breaks: number[] = [];
  let nestedParagraph = false;
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "") {
      nestedParagraph = false;
    } else if (contexts[index] === "text") {
      if (/^(?:[ \t]*>|[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)/.test(line)) nestedParagraph = true;
      else if (line.trimEnd() === COLUMN_BREAK && !nestedParagraph) breaks.push(index);
      // An unindented heading or rule ends a lazy list/quote paragraph.
      else if (/^#{1,6}(?:[ \t]|$)|^(?:\*{3,}|-{3,}|_{3,})[ \t]*$/.test(line)) nestedParagraph = false;
    } else {
      nestedParagraph = false;
    }
  });
  return breaks;
}

/** Segments stay tied to their original source, including blank lines and embeds. */
export function splitTextColumns(source: string): TextColumns {
  const lines = source.split("\n");
  const breaks = textColumnBreaks(source);
  if (breaks.length === 0 || breaks.length >= MAX_TEXT_COLUMNS) {
    return { columns: [{ from: 0, to: source.length, markdown: source }], overflow: breaks.length >= MAX_TEXT_COLUMNS };
  }
  const columns: TextColumn[] = [];
  let from = 0, offset = 0;
  const markers = new Set(breaks);
  lines.forEach((line, index) => {
    if (markers.has(index)) {
      columns.push({ from, to: offset, markdown: source.slice(from, offset) });
      from = Math.min(source.length, offset + line.length + 1);
    }
    offset += line.length + 1;
  });
  columns.push({ from, to: source.length, markdown: source.slice(from) });
  return { columns, overflow: false };
}

/** An explicit insertion starts a new paragraph on each side and never replaces existing text. */
export function insertTextColumnBreak(source: string, at: number): { text: string; cursor: number } | null {
  if (at < 0 || at > source.length || textColumnBreaks(source).length >= MAX_TEXT_COLUMNS - 1) return null;
  const lineStart = source.lastIndexOf("\n", at - 1) + 1;
  const lineEnd = source.indexOf("\n", at);
  const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
  if (/^[ \t>]|^(?:[-*+]|\d{1,9}[.)])[ \t]+/.test(line)) return null;
  const before = source.slice(0, at), after = source.slice(at);
  const insertion = `${before.endsWith("\n\n") || before === "" ? "" : before.endsWith("\n") ? "\n" : "\n\n"}${COLUMN_BREAK}\n\n`;
  const text = before + insertion + after;
  // A cursor inside code, math, an indented line or a nested paragraph cannot introduce a column.
  if (textColumnBreaks(text).length !== textColumnBreaks(source).length + 1) return null;
  return { text, cursor: before.length + insertion.length };
}
