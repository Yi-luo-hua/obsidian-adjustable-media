import { findV2Blocks, isDrawable } from "../format/v2.ts";
import { layoutStacks } from "../layout/layoutStack.ts";

/** What a top-level element of the export is, as far as page breaks go. */
export type PrintElementKind = "heading" | "float" | "other";

/**
 * Which elements of the export a page break must not part from the next one: a heading or a float
 * right before a float. A float that does not fit on the page moves to the next one, and what it is
 * anchored to goes with it (styles.css, print).
 */
export function keepWithNext(kinds: readonly PrintElementKind[]): boolean[] {
  return kinds.map((kind, index) => kind !== "other" && kinds[index + 1] === "float");
}

/** Only the export copy gets placeholders; the vault's Markdown is never rewritten. */
export function printPlan(text: string, token: string) {
  const lines = text.split("\n");
  const parsed = findV2Blocks(lines);
  const blocks = parsed.filter(isDrawable);
  const stacks = layoutStacks(lines, parsed);
  const starts = new Map(stacks.map(stack => [stack.openLine, stack]));
  const covered = new Set(stacks.map(stack => stack.members[1].openLine));
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (covered.has(block.openLine)) continue;
    const end = starts.get(block.openLine)?.closeLine ?? block.closeLine;
    lines.splice(block.openLine, end - block.openLine + 1,
      "", `<div data-vml-print="${token}-${index}"></div>`, "");
  }
  return { markdown: lines.join("\n"), blocks, ...(stacks.length ? { stacks } : {}) };
}
