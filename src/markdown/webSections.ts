import { isDrawable, type V2Block } from "../format/v2.ts";

/** Native HTML sections can absorb the layout's closer and the following Markdown. */
export function webSectionPlan(lines: readonly string[], blocks: readonly V2Block[], from: number, to: number, token: string): { markdown: string; layouts: V2Block[] } | null {
  const affected = blocks.filter(block => isDrawable(block) && block.openLine <= to && block.closeLine >= from);
  if (!affected.some(block => block.rows.some(row => row.embeds.some(embed => embed.kind === "web"))
    && (to > block.closeLine || (from <= block.openLine && to > block.openLine)))) return null;
  const markdown: string[] = [], layouts: V2Block[] = [];
  let cursor = from;
  for (const block of affected) {
    markdown.push(...lines.slice(cursor, Math.max(cursor, block.openLine)));
    if (block.openLine >= from) {
      const index = layouts.push(block) - 1;
      markdown.push("", `<div data-vml-web-section="${token}-${index}"></div>`, "");
    }
    cursor = Math.min(to + 1, block.closeLine + 1);
  }
  markdown.push(...lines.slice(cursor, to + 1));
  return { markdown: markdown.join("\n"), layouts };
}
