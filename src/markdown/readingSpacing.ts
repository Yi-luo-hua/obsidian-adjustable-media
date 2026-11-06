import { scanMarkdownLines } from "./lineContext.ts";

/** Extra authored blank lines that Markdown would otherwise collapse into one paragraph break. */
export function readingBlankExtras(lines: readonly string[], blocks: readonly { openLine: number; closeLine: number }[]): Map<number, number> {
  const extras = new Map<number, number>();
  if (blocks.length === 0) return extras;
  const contexts = scanMarkdownLines(lines);
  const layout = new Uint8Array(lines.length);
  for (const block of blocks) layout.fill(1, block.openLine, block.closeLine + 1);
  const blank = (line: number): boolean => contexts[line] === "text" && !layout[line] && lines[line]?.trim() === "";
  for (let line = 1; line < lines.length; line++) {
    if (!blank(line)) continue;
    const start = line;
    while (line + 1 < lines.length && blank(line + 1)) line++;
    if (line > start && line + 1 < lines.length && !layout[start - 1]) extras.set(start - 1, line - start);
  }
  return extras;
}
