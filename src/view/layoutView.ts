import type { App } from "obsidian";

import { DEFAULT_ROW_HEIGHT } from "../format/v2.ts";
import type { LayoutItem, LayoutModel, LayoutRow } from "../layout/model.ts";
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
  return root;
}

function renderRow(root: HTMLElement, row: LayoutRow, rowIndex: number, options: LayoutViewOptions): void {
  const rowEl = root.createDiv({ cls: "vml-row", attr: { "data-row": String(rowIndex) } });
  rowEl.setCssProps({ "--vml-row-height": `${row.height ?? DEFAULT_ROW_HEIGHT}px` });
  if (row.items.length === 1) {
    rowEl.addClass("vml-row--single");
    rowEl.dataset.align = row.align ?? "center";
  }

  row.items.forEach((item, index) => {
    renderItem(rowEl, row, item, index, options);
  });
}

function renderItem(rowEl: HTMLElement, row: LayoutRow, item: LayoutItem, index: number, options: LayoutViewOptions): void {
  const itemEl = rowEl.createDiv({ cls: "vml-item", attr: { "data-index": String(index) } });
  const single = row.items.length === 1;

  if (single) {
    const width = row.width !== null ? `${row.width * 100}%` : item.embed.nativeWidth ? `${item.embed.nativeWidth}px` : null;
    if (width) {
      itemEl.addClass("vml-item--sized");
      itemEl.setCssProps({ "--vml-item-width": width });
    }
  } else if (item.weight !== null) {
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

function shareByAspectRatio(itemEl: HTMLElement, width: number, height: number): void {
  if (width > 0 && height > 0) {
    itemEl.setCssProps({ "--vml-grow": String(width / height) });
  }
}
