import type { MoveTarget } from "./model.ts";

/**
 * Pure geometry for drag and resize, so it can be tested without a DOM. Rects are in client pixels.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RowBox {
  row: number;
  rect: Rect;
}

export interface ItemBox {
  row: number;
  index: number;
  rect: Rect;
}

const EDGE_BAND_RATIO = 0.25;
const EDGE_BAND_MAX = 32;
const OUTSIDE_REACH = 40;

/**
 * Where a dragged item lands if released at (x, y). The top and bottom bands of an item mean
 * "a new row above / below"; elsewhere on an item it goes before or after it. Returns null when the
 * pointer is outside the layout.
 */
export function dropTarget(x: number, y: number, rows: readonly RowBox[], items: readonly ItemBox[]): MoveTarget | null {
  const hit = items.find((box) => contains(box.rect, x, y));
  if (hit) {
    const band = Math.min(EDGE_BAND_MAX, (hit.rect.bottom - hit.rect.top) * EDGE_BAND_RATIO);
    if (y < hit.rect.top + band) {
      return { kind: "newRow", beforeRow: hit.row };
    }
    if (y > hit.rect.bottom - band) {
      return { kind: "newRow", beforeRow: hit.row + 1 };
    }
    return beside(hit, x);
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) {
    return null;
  }
  const left = Math.min(...rows.map((box) => box.rect.left));
  const right = Math.max(...rows.map((box) => box.rect.right));
  if (x < left || x > right) {
    return null;
  }
  if (y < first.rect.top) {
    return y >= first.rect.top - OUTSIDE_REACH ? { kind: "newRow", beforeRow: first.row } : null;
  }
  if (y > last.rect.bottom) {
    return y <= last.rect.bottom + OUTSIDE_REACH ? { kind: "newRow", beforeRow: last.row + 1 } : null;
  }

  const row = rows.find((box) => y >= box.rect.top && y <= box.rect.bottom);
  if (row) {
    const nearest = items
      .filter((box) => box.row === row.row)
      .reduce<ItemBox | null>((best, box) => (
        best === null || horizontalDistance(box.rect, x) < horizontalDistance(best.rect, x) ? box : best
      ), null);
    return nearest ? beside(nearest, x) : null;
  }

  for (let index = 0; index + 1 < rows.length; index += 1) {
    const above = rows[index];
    const below = rows[index + 1];
    if (above && below && y > above.rect.bottom && y < below.rect.top) {
      return { kind: "newRow", beforeRow: below.row };
    }
  }
  return null;
}

/** Column weights from rendered widths, scaled so they average 1. */
export function weightsFromWidths(widths: readonly number[]): number[] {
  const positive = widths.map((width) => Math.max(width, 1));
  const mean = positive.reduce((sum, width) => sum + width, 0) / positive.length;
  return positive.map((width) => Math.round((width / mean) * 1000) / 1000);
}

/** Moves the boundary between item `index` and `index + 1` by `delta`, keeping both at least `min` wide. */
export function resizePair(widths: readonly number[], index: number, delta: number, min: number): number[] {
  const left = widths[index];
  const right = widths[index + 1];
  if (left === undefined || right === undefined) {
    return [...widths];
  }

  const total = left + right;
  const floor = Math.min(min, total / 2);
  const nextLeft = Math.min(total - floor, Math.max(floor, left + delta));
  const result = [...widths];
  result[index] = nextLeft;
  result[index + 1] = total - nextLeft;
  return result;
}

function beside(box: ItemBox, x: number): MoveTarget {
  const side = x < (box.rect.left + box.rect.right) / 2 ? "before" : "after";
  return { kind: "beside", position: { row: box.row, index: box.index }, side };
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function horizontalDistance(rect: Rect, x: number): number {
  if (x < rect.left) {
    return rect.left - x;
  }
  return x > rect.right ? x - rect.right : 0;
}
