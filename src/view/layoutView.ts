import type { App } from "obsidian";

import { DEFAULT_ROW_HEIGHT } from "../format/v2.ts";
import { rowOffset, type LayoutItem, type LayoutModel, type LayoutRow } from "../layout/model.ts";
import { resolveMedia } from "./media.ts";
import { t } from "./messages.ts";

export interface LayoutViewOptions {
  app: App;
  sourcePath: string;
  model: LayoutModel;
  /** Rows to show; a reading-view section may hold only some of the block's rows. Defaults to all. */
  rowIndices?: number[];
  editable: boolean;
  warning: string | null;
}

/**
 * Draws a layout model. Shared by reading view and live preview; it never writes to the note.
 *
 * Multi-item rows share one height. Without explicit column weights each item's share follows its
 * media's aspect ratio, so every image fills its cell without cropping; with weights the media is
 * fitted inside its cell. Single-item rows use the row's width share, else the size written in the
 * embed, else the media's natural size capped at the container width.
 */
export function renderLayout(container: HTMLElement, options: LayoutViewOptions): HTMLElement {
  const root = container.createDiv({ cls: "vml-layout" });
  root.toggleClass("vml-layout--readonly", !options.editable);
  if (options.warning) {
    root.createDiv({ cls: "vml-layout__warning", text: options.warning });
  }

  const rowIndices = options.rowIndices ?? options.model.rows.map((_row, index) => index);
  for (const rowIndex of rowIndices) {
    const row = options.model.rows[rowIndex];
    if (row) {
      renderRow(root, row, rowIndex, options);
    }
  }
  applySizing(root, options.model);
  return root;
}

/**
 * Applies the sizes a model sets: the block's width, row heights, and the width and position of
 * single items. Rendering uses it, and so do resize gestures, to preview a model and to restore it.
 */
export function applySizing(root: HTMLElement, model: LayoutModel): void {
  root.toggleClass("vml-layout--sized", model.width !== null);
  root.setCssProps({ "--vml-block-width": model.width === null ? "" : `${model.width * 100}%` });

  for (const rowEl of Array.from(root.querySelectorAll<HTMLElement>(".vml-row"))) {
    const row = model.rows[Number(rowEl.dataset.row)];
    if (!row) {
      continue;
    }
    rowEl.setCssProps({ "--vml-row-height": `${row.height ?? DEFAULT_ROW_HEIGHT}px` });

    const item = row.items[0];
    const itemEl = rowEl.querySelector<HTMLElement>(".vml-item");
    if (row.items.length !== 1 || !item || !itemEl) {
      continue;
    }
    rowEl.setCssProps({ "--vml-offset": String(rowOffset(row)) });
    const width = singleWidth(row, item);
    itemEl.toggleClass("vml-item--sized", width !== null);
    itemEl.setCssProps({ "--vml-item-width": width ?? "" });
  }
}

function renderRow(root: HTMLElement, row: LayoutRow, rowIndex: number, options: LayoutViewOptions): void {
  const rowEl = root.createDiv({ cls: "vml-row", attr: { "data-row": String(rowIndex) } });
  const single = row.items.length === 1;
  rowEl.toggleClass("vml-row--single", single);

  // A single item sits between two spacers that share the row's free space in the ratio of its
  // position, so any position works whatever the item's width.
  if (single) {
    rowEl.createDiv({ cls: "vml-row__spacer" });
  }
  row.items.forEach((item, index) => {
    renderItem(rowEl, row, item, index, options);
  });
  if (single) {
    rowEl.createDiv({ cls: "vml-row__spacer vml-row__spacer--after" });
  }
}

function renderItem(rowEl: HTMLElement, row: LayoutRow, item: LayoutItem, index: number, options: LayoutViewOptions): void {
  const itemEl = rowEl.createDiv({ cls: "vml-item", attr: { "data-index": String(index) } });
  const single = row.items.length === 1;

  if (!single && item.weight !== null) {
    itemEl.addClass("vml-item--weighted");
    itemEl.setCssProps({ "--vml-grow": String(item.weight) });
  }

  const media = resolveMedia(options.app, item.embed, options.sourcePath);
  if (!media) {
    itemEl.createDiv({ cls: "vml-item__missing", text: t("missingMedia", { target: item.embed.target }) });
  } else if (item.embed.kind === "image") {
    const img = itemEl.createEl("img", {
      cls: "vml-item__media",
      attr: { alt: item.embed.alt || item.embed.target, draggable: "false", src: media.url },
    });
    if (!single && item.weight === null) {
      img.addEventListener("load", () => shareByAspectRatio(itemEl, img.naturalWidth, img.naturalHeight), { once: true });
    }
  } else {
    itemEl.addClass("vml-item--video");
    const video = itemEl.createEl("video", { cls: "vml-item__media", attr: { src: media.url } });
    video.controls = true;
    video.preload = "metadata";
    if (!single && item.weight === null) {
      video.addEventListener("loadedmetadata", () => shareByAspectRatio(itemEl, video.videoWidth, video.videoHeight), { once: true });
    }
  }

  if (item.caption) {
    itemEl.createDiv({
      cls: "vml-item__caption",
      attr: { "data-align": row.captionAlign ?? "left" },
      text: item.caption,
    });
  }
}

function singleWidth(row: LayoutRow, item: LayoutItem): string | null {
  if (row.width !== null) {
    return `${row.width * 100}%`;
  }
  return item.embed.nativeWidth ? `${item.embed.nativeWidth}px` : null;
}

function shareByAspectRatio(itemEl: HTMLElement, width: number, height: number): void {
  if (width > 0 && height > 0) {
    itemEl.setCssProps({ "--vml-grow": String(width / height) });
  }
}
