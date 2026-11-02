import { scanMarkdownContainers, scanMarkdownLines } from "./lineContext.ts";

export interface MarkdownTable { from: number; to: number }

/** Complete top-level pipe tables. Escaped pipes are cell content; unescaped pipes also split
 * code spans, as in Obsidian's Markdown tables. Keep every original line for writing back. */
export function markdownTables(lines: readonly string[]): MarkdownTable[] {
  const contexts = scanMarkdownLines(lines), { topLevel } = scanMarkdownContainers(lines);
  const tables: MarkdownTable[] = [];
  const interrupts = (line: number): boolean => /^(?:>|#{1,6}(?:\s|$)|(?:[-*+]|\d+[.)])[ \t]|`{3,}|~{3,}|<!--)/.test((lines[line] ?? "").trimStart());
  const row = (line: number): boolean => contexts[line] === "text" && topLevel[line]
    && !/^(?: {4}|[ \t]*\t)/.test(lines[line] ?? "") && !interrupts(line);
  for (let from = 0; from + 1 < lines.length; from++) {
    if (!row(from) || !row(from + 1)) continue;
    const header = cells(lines[from]), delimiter = cells(lines[from + 1]);
    if (!header || !delimiter || header.length !== delimiter.length
      || !delimiter.every(cell => /^:?-+:?$/.test(cell.trim()))) continue;
    let to = from + 1;
    while (to + 1 < lines.length && row(to + 1) && cells(lines[to + 1])) to++;
    // An unreadable pipe row may still belong to the native table. Never wrap just its prefix.
    if (to + 1 < lines.length && cells(lines[to + 1]) && !interrupts(to + 1)) { from = to; continue; }
    tables.push({ from, to });
    from = to;
  }
  return tables;
}

function cells(raw: string): string[] | null {
  const text = raw.replace(/\r$/, "");
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\\") { index++; continue; }
    if (text[index] !== "|") continue;
    parts.push(text.slice(start, index));
    start = index + 1;
  }
  if (parts.length === 0) return null;
  parts.push(text.slice(start));
  if (parts[0].trim() === "") parts.shift();
  if (parts.at(-1)?.trim() === "") parts.pop();
  return parts.length > 0 ? parts : null;
}
