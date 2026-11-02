import { blockWrap, findV2Blocks, hasTextColumns, isDrawable, serializeOpener, type V2Block } from "../format/v2.ts";
import type { LineChange } from "./edits.ts";

export interface WrapAppearance {
  container: { left: number; width: number };
  media: { left: number; width: number; height: number };
  spacing: [number, number];
  tableViewport?: [number, number, number, number, number];
}

/** Add display settings to the new opener; every line of the wrapped source stays untouched. */
export function preserveWrapAppearance(change: LineChange, appearance: WrapAppearance): LineChange {
  const [block] = findV2Blocks(change.replacement);
  if (!block || block.rows.length !== 1 || block.rows[0].embeds.length !== 1 || block.leftText || block.rightText) return change;
  const { container, media, spacing } = appearance;
  if (![container.left, container.width, media.left, media.width, media.height, ...spacing].every(Number.isFinite)
    || container.width <= 0 || media.width <= 0 || media.height <= 0) return change;
  const width = Math.min(1, media.width / container.width);
  const free = container.width - media.width;
  const offset = free > 1 ? Math.max(0, Math.min(1, (media.left - container.left) / free)) : 0;
  const align = offset < 0.001 ? "left" : offset > 0.999 ? "right" : Math.abs(offset - 0.5) < 0.001 ? "center" : null;
  const table = block.rows[0].embeds[0].kind === "table";
  const row = { ...block.meta.rows[0], width, ...(align ? { align } : { offset }),
    ...(table ? media.width > container.width ? { tableWidth: media.width,
      ...(appearance.tableViewport ? { tableViewport: appearance.tableViewport } : {}) } : {} : { aspect: media.width / media.height }) };
  const replacement = [...change.replacement];
  replacement[block.openLine] = serializeOpener({ ...block.meta, rows: [row],
    extra: { ...block.meta.extra, spacing: spacing.map(value => Math.max(0, value)) } });
  return { ...change, replacement };
}

/** Native block insets, retained on conversion; floating/column layouts use their normal spacing. */
export function wrapSpacing(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && value.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)
    ? [value[0] as number, value[1] as number] : null;
}

/** Wrapping native blocks alone must not change blank-line heights elsewhere in the note. */
export function keepNativeParagraphs(blocks: readonly V2Block[]): boolean {
  const drawn = blocks.filter(isDrawable);
  return drawn.length > 0 && drawn.every(block => wrapSpacing(block.meta.extra.spacing) !== null
    && blockWrap(block) === null && !hasTextColumns(block));
}
