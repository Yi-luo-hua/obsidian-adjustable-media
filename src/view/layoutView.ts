import { MarkdownRenderer, type App, type Component } from "obsidian";

import { DEFAULT_ROW_HEIGHT, type TextSide } from "../format/v2.ts";
import { effectiveWidth, hasText, rowOffset, type LayoutItem, type LayoutModel, type LayoutRow } from "../layout/model.ts";
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
  /** Owns what Obsidian draws for the text beside the media; without it that text is left out. */
  component?: Component;
}

interface MediaSize {
  width: number;
  height: number;
}

/**
 * Sizes of the media drawn so far, by URL. Drawn again (after an edit, or when a layout scrolls back
 * into view), an image gets its size up front, so the layout, and the text wrapping around it, do
 * not change shape once it has loaded.
 */
const mediaSizes = new Map<string, MediaSize>();

/**
 * Draws a layout model. Shared by reading view and live preview; it never writes to the note.
 *
 * Multi-item rows share one height. Without explicit column weights each item's share follows its
 * media's aspect ratio, so every image fills its cell without cropping; with weights the media is
 * fitted inside its cell. Single-item rows use the row's width share, else the size written in the
 * embed, else the media's natural size capped at the container width.
 *
 * A wrapped layout floats to its side of `container`, and the text after it wraps around it
 * (docs/DESIGN.md, section 4). One that starts some lines further down floats below an empty,
 * zero-width float that high, which leaves those lines their full width.
 *
 * Text written in the block goes in columns beside the media, drawn by Obsidian like the rest of
 * the note; the media keep the block's width in a column between them.
 */
export function renderLayout(container: HTMLElement, options: LayoutViewOptions): HTMLElement {
  const { model } = options;
  const rowIndices = options.rowIndices ?? model.rows.map((_row, index) => index);
  if (model.wrap !== null && model.skip !== null && rowIndices.includes(0)) {
    const skip = container.createDiv({ cls: `vml-wrap-skip vml-wrap-skip--${model.wrap}` });
    skip.setCssProps({ "--vml-skip": String(model.skip) });
  }

  const root = container.createDiv({ cls: "vml-layout" });
  root.toggleClass("vml-layout--readonly", !options.editable);
  if (model.wrap !== null) {
    root.addClass("vml-layout--wrap", `vml-layout--wrap-${model.wrap}`);
  }
  const columns = hasText(model);
  root.toggleClass("vml-layout--columns", columns);
  if (model.text.left !== null) {
    renderText(root, "left", model.text.left, options);
  }
  const media = columns ? root.createDiv({ cls: "vml-layout__media" }) : root;
  if (options.warning) {
    media.createDiv({ cls: "vml-layout__warning", text: options.warning });
  }

  for (const rowIndex of rowIndices) {
    const row = model.rows[rowIndex];
    if (row) {
      renderRow(media, row, rowIndex, options);
    }
  }
  if (model.text.right !== null) {
    renderText(root, "right", model.text.right, options);
  }
  applySizing(root, model);
  return root;
}

function renderText(root: HTMLElement, side: TextSide, markdown: string, options: LayoutViewOptions): void {
  const el = root.createDiv({ cls: `vml-layout__text vml-layout__text--${side} markdown-rendered`, attr: { "data-side": side } });
  if (options.component) {
    void MarkdownRenderer.render(options.app, markdown, el, options.sourcePath, options.component);
  }
}

/**
 * Applies the sizes a model sets: the block's width, row heights, and the width and position of
 * single items. Rendering uses it, and so do resize gestures, to preview a model and to restore it.
 */
export function applySizing(root: HTMLElement, model: LayoutModel): void {
  const width = effectiveWidth(model);
  root.toggleClass("vml-layout--sized", width !== null);
  root.setCssProps({ "--vml-block-width": width === null ? "" : `${width * 100}%` });

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
  const shareByRatio = !single && item.weight === null;

  if (!single && item.weight !== null) {
    itemEl.addClass("vml-item--weighted");
    itemEl.setCssProps({ "--vml-grow": String(item.weight) });
  }

  const media = resolveMedia(options.app, item.embed, options.sourcePath);
  if (!media) {
    itemEl.createDiv({ cls: "vml-item__missing", text: t("missingMedia", { target: item.embed.target }) });
  } else {
    const known = mediaSizes.get(media.url);
    const size: Record<string, string> = known ? { width: String(known.width), height: String(known.height) } : {};
    let el: HTMLImageElement | HTMLVideoElement;
    if (item.embed.kind === "image") {
      const img = itemEl.createEl("img", {
        cls: "vml-item__media",
        attr: { alt: item.embed.alt || item.embed.target, draggable: "false", src: media.url, ...size },
      });
      img.addEventListener("load", () => remember(itemEl, media.url, img.naturalWidth, img.naturalHeight, shareByRatio), { once: true });
      el = img;
    } else {
      itemEl.addClass("vml-item--video");
      const video = itemEl.createEl("video", { cls: "vml-item__media", attr: { src: media.url, ...size } });
      video.controls = true;
      video.preload = "metadata";
      video.addEventListener("loadedmetadata", () => remember(itemEl, media.url, video.videoWidth, video.videoHeight, shareByRatio), { once: true });
      el = video;
    }
    if (known) {
      useSize(itemEl, el, known, shareByRatio);
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

function remember(itemEl: HTMLElement, url: string, width: number, height: number, shareByRatio: boolean): void {
  if (width > 0 && height > 0) {
    mediaSizes.set(url, { width, height });
    if (shareByRatio) {
      itemEl.setCssProps({ "--vml-grow": String(width / height) });
    }
  }
}

/** Lays an item out at its media's size before the media has loaded. */
function useSize(itemEl: HTMLElement, media: HTMLElement, size: MediaSize, shareByRatio: boolean): void {
  if (shareByRatio) {
    itemEl.setCssProps({ "--vml-grow": String(size.width / size.height) });
  }
  // A single item at its natural size takes the media's width, capped at the row's.
  media.setCssProps({ "--vml-natural-width": `${size.width}px` });
}

function singleWidth(row: LayoutRow, item: LayoutItem): string | null {
  if (row.width !== null) {
    return `${row.width * 100}%`;
  }
  return item.embed.nativeWidth ? `${item.embed.nativeWidth}px` : null;
}
