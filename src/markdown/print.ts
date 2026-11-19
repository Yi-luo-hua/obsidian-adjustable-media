import { findV2Blocks, isDrawable } from "../format/v2.ts";

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
  const blocks = findV2Blocks(lines).filter(isDrawable);
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    lines.splice(block.openLine, block.closeLine - block.openLine + 1,
      "", `<div data-vml-print="${token}-${index}"></div>`, "");
  }
  return { markdown: lines.join("\n"), blocks };
}
