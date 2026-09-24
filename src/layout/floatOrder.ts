import { isDrawable, type V2Block } from "../format/v2.ts";
import { modelFromBlock } from "./model.ts";

/** Adjacent layouts separated by blank lines share the same floating anchor. */
export function adjacentOppositeFloat(lines: readonly string[], blocks: readonly V2Block[], index: number,
  direction: -1 | 1): V2Block | null {
  const block = blocks[index];
  const neighbor = blocks[index + direction];
  if (!block || !neighbor || !isDrawable(block) || !isDrawable(neighbor)) {
    return null;
  }
  const currentSide = modelFromBlock(block).wrap;
  const otherSide = modelFromBlock(neighbor).wrap;
  if (currentSide === null || otherSide === null || currentSide === otherSide) {
    return null;
  }
  const before = direction < 0 ? neighbor : block;
  const after = direction < 0 ? block : neighbor;
  for (let line = before.closeLine + 1; line < after.openLine; line += 1) {
    if (lines[line]?.trim() !== "") {
      return null;
    }
  }
  return neighbor;
}

/** A later float's zero-width spacer begins after the earlier float's spacer. Only the remaining
 * difference belongs in its spacer; the metadata continues to count from the shared anchor.
 */
export function effectiveWrapSkip(lines: readonly string[], blocks: readonly V2Block[], index: number): number | null {
  return skipsAt(lines, blocks, index).effective;
}

/** Height where a float actually starts, counted in lines from a shared anchor. Existing notes can
 * have a later float whose stored skip is smaller than the earlier one's; CSS then adds the two.
 */
export function visualWrapSkip(lines: readonly string[], blocks: readonly V2Block[], index: number): number {
  return skipsAt(lines, blocks, index).visual;
}

function skipsAt(lines: readonly string[], blocks: readonly V2Block[], index: number): { effective: number | null; visual: number } {
  let effective: number | null = null;
  let visual = 0;
  for (let at = 0; at <= index; at += 1) {
    const block = blocks[at];
    if (!block) {
      break;
    }
    const current = modelFromBlock(block).skip;
    if (!adjacentOppositeFloat(lines, blocks, at, -1)) {
      effective = current;
      visual = current ?? 0;
    } else {
      effective = current === null ? null : visual <= current ? current - visual : current;
      visual += effective ?? 0;
    }
  }
  return { effective, visual };
}
