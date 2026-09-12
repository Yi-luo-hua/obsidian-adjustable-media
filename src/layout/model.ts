import {
  MAX_EMBEDS_PER_ROW,
  MAX_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  readRowMeta,
  type Align,
  type CaptionAlign,
  type V2Block,
  type V2Embed,
  type V2Meta,
  type V2RowMeta,
} from "../format/v2.ts";

/**
 * Editable layout model built from a v2 block.
 *
 * Settings are null when the note does not set them, so writing a model back records only what
 * the user actually changed and the opening comment stays short. Every operation returns a new
 * model; embeds travel with their items verbatim.
 */

export interface LayoutItem {
  embed: V2Embed;
  /** Column weight; null means an equal share. */
  weight: number | null;
  caption: string | null;
}

export interface LayoutRow {
  items: LayoutItem[];
  height: number | null;
  /** Share of the container width; single-item rows only. */
  width: number | null;
  /** Single-item rows only. */
  align: Align | null;
  captionAlign: CaptionAlign | null;
  /** Row keys this version does not understand, written back unchanged. */
  extra: V2RowMeta;
}

export interface LayoutModel {
  rows: LayoutRow[];
  extra: Record<string, unknown>;
}

export interface ItemPosition {
  row: number;
  index: number;
}

export type MoveTarget =
  | { kind: "beside"; position: ItemPosition; side: "before" | "after" }
  /** A new row inserted before `beforeRow`, counted before the move; `rows.length` appends. */
  | { kind: "newRow"; beforeRow: number };

export function modelFromBlock(block: V2Block): LayoutModel {
  return {
    rows: block.rows.map((row, rowIndex) => {
      const settings = readRowMeta(block.meta.rows[rowIndex] ?? {}, row.embeds.length);
      return {
        items: row.embeds.map((embed, index) => ({
          embed,
          weight: settings.widths?.[index] ?? null,
          caption: settings.captions?.[index] ?? null,
        })),
        height: settings.height,
        width: settings.width,
        align: settings.align,
        captionAlign: settings.captionAlign,
        extra: settings.extra,
      };
    }),
    extra: { ...block.meta.extra },
  };
}

export function metaFromModel(model: LayoutModel): V2Meta {
  return {
    rows: model.rows.map((row) => {
      const single = row.items.length === 1;
      const meta: V2RowMeta = { ...row.extra };
      if (row.height !== null) {
        meta.height = row.height;
      }
      if (!single && row.items.some((item) => item.weight !== null)) {
        meta.widths = row.items.map((item) => item.weight ?? 1);
      }
      if (single && row.width !== null) {
        meta.width = row.width;
      }
      if (single && row.align !== null) {
        meta.align = row.align;
      }
      if (row.items.some((item) => item.caption !== null)) {
        meta.captions = row.items.map((item) => item.caption);
      }
      if (row.captionAlign !== null) {
        meta.captionAlign = row.captionAlign;
      }
      return meta;
    }),
    extra: { ...model.extra },
  };
}

export function rowEmbeds(model: LayoutModel): V2Embed[][] {
  return model.rows.map((row) => row.items.map((item) => item.embed));
}

export function moveItem(model: LayoutModel, source: ItemPosition, target: MoveTarget): LayoutModel {
  const rows = cloneRows(model.rows);
  const sourceRow = rows[source.row];
  const item = sourceRow?.items[source.index];
  if (!sourceRow || !item) {
    return model;
  }

  if (target.kind === "beside") {
    const targetRow = rows[target.position.row];
    if (!targetRow?.items[target.position.index]) {
      return model;
    }
    if (target.position.row === source.row && target.position.index === source.index) {
      return model;
    }

    sourceRow.items.splice(source.index, 1);
    let index = target.position.index;
    if (targetRow === sourceRow && source.index < index) {
      index -= 1;
    }
    // A weight only means something relative to its own row.
    const moved = targetRow === sourceRow ? item : { ...item, weight: averageWeight(targetRow) };
    targetRow.items.splice(index + (target.side === "after" ? 1 : 0), 0, moved);
  } else {
    const alreadyAlone = sourceRow.items.length === 1
      && (target.beforeRow === source.row || target.beforeRow === source.row + 1);
    if (alreadyAlone) {
      return model;
    }

    sourceRow.items.splice(source.index, 1);
    const beforeRow = Math.min(Math.max(target.beforeRow, 0), rows.length);
    rows.splice(beforeRow, 0, { ...rowLike(sourceRow), items: [{ ...item, weight: null }] });
  }

  return { ...model, rows: rebalance(rows.filter((row) => row.items.length > 0)) };
}

/** Takes an item out of the layout; the caller decides where it goes next. */
export function removeItem(model: LayoutModel, position: ItemPosition): { model: LayoutModel; item: LayoutItem } | null {
  const rows = cloneRows(model.rows);
  const [item] = rows[position.row]?.items.splice(position.index, 1) ?? [];
  if (!item) {
    return null;
  }
  return { model: { ...model, rows: rows.filter((row) => row.items.length > 0) }, item };
}

/** Adds an item taken from another layout, e.g. one dragged across blocks. */
export function insertItem(model: LayoutModel, item: LayoutItem, target: MoveTarget): LayoutModel {
  const rows = cloneRows(model.rows);

  if (target.kind === "beside") {
    const targetRow = rows[target.position.row];
    if (!targetRow?.items[target.position.index]) {
      return model;
    }
    const inserted = { ...item, weight: averageWeight(targetRow) };
    targetRow.items.splice(target.position.index + (target.side === "after" ? 1 : 0), 0, inserted);
  } else {
    const beforeRow = Math.min(Math.max(target.beforeRow, 0), rows.length);
    rows.splice(beforeRow, 0, {
      items: [{ ...item, weight: null }],
      height: null,
      width: null,
      align: null,
      captionAlign: null,
      extra: {},
    });
  }

  return { ...model, rows: rebalance(rows) };
}

export function setRowHeight(model: LayoutModel, rowIndex: number, height: number): LayoutModel {
  if (!Number.isFinite(height)) {
    return model;
  }
  return updateRow(model, rowIndex, (row) => ({
    ...row,
    height: Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, Math.round(height))),
  }));
}

export function setWeights(model: LayoutModel, rowIndex: number, weights: readonly number[]): LayoutModel {
  const row = model.rows[rowIndex];
  const valid = row !== undefined
    && weights.length === row.items.length
    && weights.every((weight) => Number.isFinite(weight) && weight > 0);
  if (!valid) {
    return model;
  }
  return updateRow(model, rowIndex, (current) => ({
    ...current,
    items: current.items.map((item, index) => ({ ...item, weight: weights[index] ?? item.weight })),
  }));
}

export function setSingleWidth(model: LayoutModel, rowIndex: number, width: number): LayoutModel {
  if (model.rows[rowIndex]?.items.length !== 1 || !Number.isFinite(width)) {
    return model;
  }
  return updateRow(model, rowIndex, (row) => ({ ...row, width: Math.min(1, Math.max(0.1, width)) }));
}

export function setAlign(model: LayoutModel, rowIndex: number, align: Align): LayoutModel {
  if (model.rows[rowIndex]?.items.length !== 1) {
    return model;
  }
  return updateRow(model, rowIndex, (row) => ({ ...row, align }));
}

export function setCaption(model: LayoutModel, position: ItemPosition, caption: string | null): LayoutModel {
  const text = caption?.trim() || null;
  if (!model.rows[position.row]?.items[position.index]) {
    return model;
  }
  return updateRow(model, position.row, (row) => ({
    ...row,
    items: row.items.map((item, index) => (index === position.index ? { ...item, caption: text } : item)),
  }));
}

export function setCaptionAlign(model: LayoutModel, rowIndex: number, captionAlign: CaptionAlign): LayoutModel {
  return updateRow(model, rowIndex, (row) => ({ ...row, captionAlign }));
}

/** Splits rows with more than MAX_EMBEDS_PER_ROW items; the extra rows keep the row's height. */
function rebalance(rows: LayoutRow[]): LayoutRow[] {
  return rows.flatMap((row) => {
    if (row.items.length <= MAX_EMBEDS_PER_ROW) {
      return [row];
    }

    const chunks: LayoutRow[] = [];
    for (let start = 0; start < row.items.length; start += MAX_EMBEDS_PER_ROW) {
      const items = row.items.slice(start, start + MAX_EMBEDS_PER_ROW);
      chunks.push(start === 0 ? { ...row, items } : { ...rowLike(row), items });
    }
    return chunks;
  });
}

function rowLike(row: LayoutRow): LayoutRow {
  return { items: [], height: row.height, width: null, align: null, captionAlign: row.captionAlign, extra: {} };
}

function averageWeight(row: LayoutRow): number | null {
  const weights = row.items.map((item) => item.weight).filter((weight): weight is number => weight !== null);
  return weights.length > 0 ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length : null;
}

function updateRow(model: LayoutModel, rowIndex: number, update: (row: LayoutRow) => LayoutRow): LayoutModel {
  const row = model.rows[rowIndex];
  if (!row) {
    return model;
  }
  return { ...model, rows: model.rows.map((current, index) => (index === rowIndex ? update(current) : current)) };
}

function cloneRows(rows: readonly LayoutRow[]): LayoutRow[] {
  return rows.map((row) => ({ ...row, items: [...row.items] }));
}
