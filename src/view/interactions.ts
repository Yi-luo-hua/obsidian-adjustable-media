import { Menu, Notice, TFile, setIcon, type App } from "obsidian";
import { EditorView } from "@codemirror/view";

import { DEFAULT_ROW_HEIGHT, MAX_ROW_HEIGHT, MIN_BLOCK_WIDTH, MIN_ROW_HEIGHT, findV2Blocks, type TextSide, type V2Block } from "../format/v2.ts";
import { addedTextLine, isEditable, planAddText, planModelEdit, planMoveOut, type BlockEdit, type EditFailureReason } from "../layout/edits.ts";
import { dropTarget, positionOffset, resizePair, weightsFromWidths, type ItemBox, type RowBox } from "../layout/geometry.ts";
import {
  effectiveWidth,
  hasText,
  insertItem,
  maxBlockWidth,
  moveItem,
  removeItem,
  rowOffset,
  scaleRows,
  setAlign,
  setBlockWidth,
  setCaption,
  setCaptionAlign,
  setPosition,
  setRowHeight,
  setSingleWidth,
  setWeights,
  setWrap,
  type ItemPosition,
  type LayoutModel,
  type MoveTarget,
} from "../layout/model.ts";
import { writeBlockEdits } from "../layout/writeBack.ts";
import { CaptionModal } from "./captionModal.ts";
import { createDragGhost } from "./dragGhost.ts";
import { applySizing } from "./layoutView.ts";
import { resolveMedia } from "./media.ts";
import { MediaViewer, type ViewerImage } from "./mediaViewer.ts";
import { t, type MessageKey } from "./messages.ts";
import { trackPointer } from "./pointer.ts";

export interface LayoutContext {
  app: App;
  sourcePath: string;
  block: V2Block;
  model: LayoutModel;
  /** Live preview: the layout gets a frame to resize it by, and its images open in the plugin's viewer. */
  live: boolean;
}

export interface DropState {
  root: HTMLElement;
  context: LayoutContext;
  target: MoveTarget;
}

type FrameEdge = "right" | "bottom" | "corner";

const contexts = new WeakMap<HTMLElement, LayoutContext>();
export const DRAG_THRESHOLD = 6;
const MIN_COLUMN_WIDTH = 60;
/** How close to left, center or right a single item snaps while it is dragged sideways. */
const POSITION_SNAP = 10;
/** A single item that leaves less room than this in its row has nowhere to go sideways. */
const MIN_FREE_SPACE = 4;
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const FAILURE_MESSAGES: Record<EditFailureReason, MessageKey> = {
  "not-found": "writeNotFound",
  ambiguous: "writeAmbiguous",
  overlap: "writeOverlap",
};
const FRAME_LABELS: Record<FrameEdge, MessageKey> = {
  right: "resizeBlockWidth",
  bottom: "resizeBlockHeight",
  corner: "resizeBlock",
};
const DROP_CLASSES = ["vml-drop-before", "vml-drop-after", "vml-drop-row-before", "vml-drop-row-after", "vml-layout--drop-target"];

/**
 * Makes a rendered layout editable: drag to reorder (also into other blocks of the same note in the
 * same pane) or to move a single item sideways, resize rows, columns, single items and, in live
 * preview, the whole layout by its frame, and a context menu. Every change goes through the layout
 * model and the write-back layer; the view never edits the note itself. Blocks that are not editable
 * (docs/DESIGN.md, section 1.3) stay display-only.
 */
export function attachInteractions(root: HTMLElement, context: LayoutContext): void {
  contexts.set(root, context);
  if (context.live) {
    setUpViewer(root, context);
  }
  if (!isEditable(context.block)) {
    return;
  }

  root.addClass("vml-layout--interactive");
  for (const rowEl of Array.from(root.querySelectorAll<HTMLElement>(".vml-row"))) {
    const row = Number(rowEl.dataset.row);
    setUpRow(rowEl, row, context);
    for (const itemEl of Array.from(rowEl.querySelectorAll<HTMLElement>(".vml-item"))) {
      setUpItem(root, itemEl, { row, index: Number(itemEl.dataset.index) }, context);
    }
  }
  if (context.live) {
    setUpFrame(root, context);
  }
}

/** Where an item dragged from `leaf` would land in a layout of the note at (x, y), if anywhere. */
export function findDrop(doc: Document, sourcePath: string, leaf: Element | null, x: number, y: number): DropState | null {
  const targetRoot = doc.elementFromPoint(x, y)?.closest<HTMLElement>(".vml-layout") ?? null;
  const targetContext = targetRoot ? contexts.get(targetRoot) : undefined;
  if (!targetRoot || !targetContext || targetContext.sourcePath !== sourcePath || !isEditable(targetContext.block)) {
    return null;
  }
  // The same note open in two panes would otherwise let one drag edit a block twice.
  if (targetRoot.closest(".workspace-leaf") !== leaf) {
    return null;
  }

  const rows: RowBox[] = Array.from(targetRoot.querySelectorAll<HTMLElement>(".vml-row"), (rowEl) => ({
    row: Number(rowEl.dataset.row),
    rect: rowEl.getBoundingClientRect(),
  }));
  const items: ItemBox[] = Array.from(targetRoot.querySelectorAll<HTMLElement>(".vml-item"), (itemEl) => ({
    row: Number(itemEl.closest<HTMLElement>(".vml-row")?.dataset.row),
    index: Number(itemEl.dataset.index),
    rect: itemEl.getBoundingClientRect(),
  }));
  const target = dropTarget(x, y, rows, items);
  return target ? { root: targetRoot, context: targetContext, target } : null;
}

export function showDropIndicator({ root, target }: DropState): void {
  root.addClass("vml-layout--drop-target");
  if (target.kind === "beside") {
    root.querySelector(`.vml-row[data-row="${target.position.row}"] .vml-item[data-index="${target.position.index}"]`)
      ?.addClass(target.side === "before" ? "vml-drop-before" : "vml-drop-after");
    return;
  }
  const below = root.querySelector(`.vml-row[data-row="${target.beforeRow}"]`);
  if (below) {
    below.addClass("vml-drop-row-before");
  } else {
    root.querySelector(`.vml-row[data-row="${target.beforeRow - 1}"]`)?.addClass("vml-drop-row-after");
  }
}

export function clearDropIndicators(doc: Document): void {
  for (const cls of DROP_CLASSES) {
    doc.querySelectorAll(`.${cls}`).forEach((el) => el.removeClass(cls));
  }
}

/**
 * The browser still reports a click where a drag ends. Reading view would open Obsidian's image
 * viewer for it and live preview would select the image, so the click right after a drag is dropped.
 */
export function swallowNextClick(doc: Document): void {
  const swallow = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };
  doc.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => doc.removeEventListener("click", swallow, { capture: true }), 0);
}

/** Writes planned edits to the note. Returns whether the note changed. */
export async function commitEdits(app: App, sourcePath: string, edits: Array<BlockEdit | null>): Promise<boolean> {
  const planned = edits.filter((edit): edit is BlockEdit => edit !== null);
  if (planned.length === 0) {
    return false;
  }

  const file = app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) {
    new Notice(t("fileMissing"));
    return false;
  }

  const result = await writeBlockEdits(app, file, planned);
  if (!result.ok) {
    new Notice(t(FAILURE_MESSAGES[result.reason]));
  }
  return result.ok;
}

function setUpViewer(root: HTMLElement, context: LayoutContext): void {
  for (const itemEl of Array.from(root.querySelectorAll<HTMLElement>(".vml-item"))) {
    const position = { row: Number(itemEl.closest<HTMLElement>(".vml-row")?.dataset.row), index: Number(itemEl.dataset.index) };
    if (context.model.rows[position.row]?.items[position.index]?.embed.kind !== "image") {
      continue;
    }
    itemEl.addEventListener("dblclick", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest(".vml-handle")) {
        return;
      }
      event.preventDefault();
      openViewer(context, position);
    });
  }
}

/** Opens the viewer on an image, with the layout's other images a key press away. */
function openViewer(context: LayoutContext, position: ItemPosition): void {
  const images: ViewerImage[] = [];
  let index = 0;
  context.model.rows.forEach((row, rowIndex) => {
    row.items.forEach((item, itemIndex) => {
      const media = item.embed.kind === "image" ? resolveMedia(context.app, item.embed, context.sourcePath) : null;
      if (!media) {
        return;
      }
      if (rowIndex === position.row && itemIndex === position.index) {
        index = images.length;
      }
      images.push({ url: media.url, alt: item.embed.alt || item.embed.target });
    });
  });
  if (images.length > 0) {
    new MediaViewer(context.app, images, index).open();
  }
}

function setUpItem(root: HTMLElement, itemEl: HTMLElement, position: ItemPosition, context: LayoutContext): void {
  const item = context.model.rows[position.row]?.items[position.index];
  if (!item) {
    return;
  }

  itemEl.tabIndex = 0;
  itemEl.setAttribute("aria-label", item.embed.alt || item.embed.target);
  itemEl.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showItemMenu(event, root, context, position);
  });
  itemEl.addEventListener("keydown", (event) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = itemEl.getBoundingClientRect();
      showItemMenu({ x: rect.left + 16, y: rect.top + 16 }, root, context, position);
    }
  });

  // Dragging on a video would fight its seek bar and volume, so videos move by a grip.
  let dragFrom = itemEl;
  if (item.embed.kind === "video") {
    dragFrom = itemEl.createDiv({ cls: "vml-handle vml-item__grip", attr: { "aria-label": t("dragHandle"), role: "button" } });
    setIcon(dragFrom, "grip-vertical");
  }
  dragFrom.addEventListener("pointerdown", (event) => {
    const onOtherHandle = event.target instanceof HTMLElement
      && event.target.closest(".vml-handle") !== null
      && event.target.closest(".vml-item__grip") === null;
    if (event.button !== 0 || onOtherHandle) {
      return;
    }
    event.preventDefault();
    itemEl.focus({ preventScroll: true });
    startDrag(root, itemEl, dragFrom, position, context, event);
  });
}

/**
 * Drags an item. A single item moved sideways within its own row changes its position there, and
 * snaps to left, center and right; anywhere else it moves the item, as the drop indicator shows.
 */
function startDrag(
  root: HTMLElement,
  itemEl: HTMLElement,
  handle: HTMLElement,
  source: ItemPosition,
  context: LayoutContext,
  start: PointerEvent,
): void {
  const doc = root.ownerDocument;
  const row = context.model.rows[source.row];
  const rowEl = itemEl.closest<HTMLElement>(".vml-row");
  const sideways = row?.items.length === 1 && rowEl ? measureSideways(rowEl, itemEl) : null;
  const ghost = createDragGhost(doc, itemEl.querySelector(".vml-item__media"));
  let dragging = false;
  let drop: DropState | null = null;
  let offset: number | null = null;

  const showPosition = (value: number | null): void => {
    if (!row || !rowEl) {
      return;
    }
    rowEl.setCssProps({ "--vml-offset": String(value ?? rowOffset(row)) });
    rowEl.toggleClass("vml-row--positioning", value !== null);
    rowEl.toggleClass("vml-row--snapped", value === 0 || value === 0.5 || value === 1);
  };
  const stop = (): void => {
    itemEl.removeClass("vml-item--dragging");
    root.removeClass("vml-layout--dragging");
    ghost.remove();
    clearDropIndicators(doc);
  };

  trackPointer(handle, start, {
    onMove(event) {
      if (!dragging) {
        if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < DRAG_THRESHOLD) {
          return;
        }
        dragging = true;
        root.addClass("vml-layout--dragging");
      }
      clearDropIndicators(doc);

      const rowRect = rowEl?.getBoundingClientRect();
      if (sideways && rowRect && event.clientY >= rowRect.top && event.clientY <= rowRect.bottom) {
        drop = null;
        offset = positionOffset(sideways.left, event.clientX - start.clientX, sideways.free, POSITION_SNAP);
        itemEl.removeClass("vml-item--dragging");
        ghost.hide();
        showPosition(offset);
        return;
      }

      offset = null;
      showPosition(null);
      itemEl.addClass("vml-item--dragging");
      ghost.move(event.clientX, event.clientY);
      drop = findDrop(doc, context.sourcePath, root.closest(".workspace-leaf"), event.clientX, event.clientY);
      if (drop) {
        showDropIndicator(drop);
      }
    },
    onEnd() {
      stop();
      if (!dragging) {
        return;
      }
      swallowNextClick(doc);
      if (offset !== null) {
        const placed = offset;
        rowEl?.removeClass("vml-row--positioning");
        rowEl?.removeClass("vml-row--snapped");
        // The preview stays until the note re-renders; put it back if nothing was written.
        void commitEdits(context.app, context.sourcePath, [planModelEdit(context.block, setPosition(context.model, source.row, placed))])
          .then((changed) => {
            if (!changed) {
              showPosition(null);
            }
          });
      } else if (drop) {
        void dropItem(context, source, drop);
      }
    },
    onCancel() {
      stop();
      showPosition(null);
    },
  });
}

function measureSideways(rowEl: HTMLElement, itemEl: HTMLElement): { left: number; free: number } | null {
  const rowRect = rowEl.getBoundingClientRect();
  const itemRect = itemEl.getBoundingClientRect();
  const free = rowRect.width - itemRect.width;
  return free >= MIN_FREE_SPACE ? { left: itemRect.left - rowRect.left, free } : null;
}

async function dropItem(source: LayoutContext, from: ItemPosition, drop: DropState): Promise<void> {
  // A reading-view block split by blank lines is rendered in several sections of one block.
  if (drop.context.block.openLine === source.block.openLine) {
    const moved = moveItem(source.model, from, drop.target);
    if (moved !== source.model) {
      await commitEdits(source.app, source.sourcePath, [planModelEdit(source.block, moved)]);
    }
    return;
  }

  const taken = removeItem(source.model, from);
  if (!taken) {
    return;
  }
  const sourceEdit = planModelEdit(source.block, taken.model);
  const targetEdit = planModelEdit(drop.context.block, insertItem(drop.context.model, taken.item, drop.target));
  // Both halves or nothing: writing only the removal would lose the embed.
  if (sourceEdit && targetEdit) {
    await commitEdits(source.app, source.sourcePath, [sourceEdit, targetEdit]);
  }
}

function setUpRow(rowEl: HTMLElement, row: number, context: LayoutContext): void {
  const layoutRow = context.model.rows[row];
  const itemEls = Array.from(rowEl.querySelectorAll<HTMLElement>(".vml-item"));
  if (!layoutRow) {
    return;
  }

  if (layoutRow.items.length === 1) {
    const itemEl = itemEls[0];
    if (itemEl) {
      setUpWidthHandle(rowEl, itemEl, row, rowOffset(layoutRow), context);
    }
    return;
  }

  setUpHeightHandle(rowEl, row, layoutRow.height ?? DEFAULT_ROW_HEIGHT, context);
  itemEls.slice(0, -1).forEach((itemEl, index) => setUpColumnHandle(itemEls, itemEl, index, row, context));
}

function setUpWidthHandle(rowEl: HTMLElement, itemEl: HTMLElement, row: number, offset: number, context: LayoutContext): void {
  const handle = itemEl.createDiv({ cls: "vml-handle vml-item__width-handle", attr: { "aria-label": t("resizeWidth"), role: "separator" } });
  // As the width changes, the free space shrinks on both sides in the ratio of the position: the
  // right edge moves by (1 - offset) of the change, the left one by offset. The handle sits on the
  // edge that moves more, so it follows the pointer at no more than twice the rate.
  const onLeft = offset > 0.5;
  handle.toggleClass("vml-item__width-handle--left", onLeft);
  const factor = onLeft ? -1 / offset : 1 / (1 - offset);

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rowWidth = rowEl.getBoundingClientRect().width;
    const startWidth = itemEl.getBoundingClientRect().width;
    const startWidthProp = itemEl.style.getPropertyValue("--vml-item-width");
    const wasSized = itemEl.hasClass("vml-item--sized");
    let fraction = startWidth / rowWidth;
    let moved = false;
    handle.addClass("is-active");

    trackPointer(handle, event, {
      onMove(move) {
        moved = true;
        fraction = Math.min(1, Math.max(0.1, (startWidth + (move.clientX - event.clientX) * factor) / rowWidth));
        itemEl.addClass("vml-item--sized");
        itemEl.setCssProps({ "--vml-item-width": `${fraction * 100}%` });
      },
      onEnd() {
        handle.removeClass("is-active");
        // A click without a drag must not write anything.
        if (moved) {
          void commitEdits(context.app, context.sourcePath, [planModelEdit(context.block, setSingleWidth(context.model, row, round(fraction)))]);
        }
      },
      onCancel() {
        handle.removeClass("is-active");
        itemEl.setCssProps({ "--vml-item-width": startWidthProp });
        itemEl.toggleClass("vml-item--sized", wasSized);
      },
    });
  });
}

function setUpHeightHandle(rowEl: HTMLElement, row: number, startHeight: number, context: LayoutContext): void {
  const handle = rowEl.createDiv({
    cls: "vml-handle vml-row__height-handle",
    attr: { "aria-label": t("resizeRow"), "aria-orientation": "horizontal", role: "separator" },
  });

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    let height = startHeight;
    let moved = false;
    handle.addClass("is-active");

    trackPointer(handle, event, {
      onMove(move) {
        moved = true;
        height = Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, startHeight + move.clientY - event.clientY));
        rowEl.setCssProps({ "--vml-row-height": `${height}px` });
      },
      onEnd() {
        handle.removeClass("is-active");
        if (moved) {
          void commitEdits(context.app, context.sourcePath, [planModelEdit(context.block, setRowHeight(context.model, row, height))]);
        }
      },
      onCancel() {
        handle.removeClass("is-active");
        rowEl.setCssProps({ "--vml-row-height": `${startHeight}px` });
      },
    });
  });
}

function setUpColumnHandle(itemEls: HTMLElement[], itemEl: HTMLElement, index: number, row: number, context: LayoutContext): void {
  const handle = itemEl.createDiv({
    cls: "vml-handle vml-item__col-handle",
    attr: { "aria-label": t("resizeColumn"), "aria-orientation": "vertical", role: "separator" },
  });

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const startWidths = itemEls.map((el) => el.getBoundingClientRect().width);
    const startGrow = itemEls.map((el) => el.style.getPropertyValue("--vml-grow"));
    const startWeighted = itemEls.map((el) => el.hasClass("vml-item--weighted"));
    let widths = startWidths;
    let moved = false;
    handle.addClass("is-active");

    trackPointer(handle, event, {
      onMove(move) {
        moved = true;
        widths = resizePair(startWidths, index, move.clientX - event.clientX, MIN_COLUMN_WIDTH);
        itemEls.forEach((el, i) => {
          el.addClass("vml-item--weighted");
          el.setCssProps({ "--vml-grow": String(widths[i] ?? 1) });
        });
      },
      onEnd() {
        handle.removeClass("is-active");
        // Without a drag, the row would silently switch from shares by aspect ratio to fixed widths.
        if (moved) {
          void commitEdits(context.app, context.sourcePath, [planModelEdit(context.block, setWeights(context.model, row, weightsFromWidths(widths)))]);
        }
      },
      onCancel() {
        handle.removeClass("is-active");
        itemEls.forEach((el, i) => {
          el.setCssProps({ "--vml-grow": startGrow[i] ?? "" });
          el.toggleClass("vml-item--weighted", startWeighted[i] ?? false);
        });
      },
    });
  });
}

/**
 * The frame around a layout in live preview: its right edge sets the layout's width, its bottom
 * edge scales the height of every row, and its corner scales both, keeping the images' proportions.
 * With text beside the media, the handles sit on the media's column, which the width belongs to.
 */
function setUpFrame(root: HTMLElement, context: LayoutContext): void {
  const box = root.querySelector<HTMLElement>(":scope > .vml-layout__media") ?? root;
  const { left, right } = context.model.text;
  // The width handles sit on the edge that moves as the layout grows. A layout floating right, or
  // media with text on their left only, grow to the left; media between two texts grow both ways.
  const mirrored = context.model.wrap === "right" || (left !== null && right === null);
  const direction = (mirrored ? -1 : 1) * (left !== null && right !== null ? 2 : 1);
  for (const edge of ["right", "bottom", "corner"] as const) {
    const handle = box.createDiv({
      cls: `vml-handle vml-frame__handle vml-frame__handle--${edge}`,
      attr: { "aria-label": t(FRAME_LABELS[edge]), role: "separator" },
    });
    handle.toggleClass("vml-frame__handle--mirrored", mirrored && edge !== "bottom");
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      resizeBlock(root, box, handle, edge, context, event, direction);
    });
  }
}

/**
 * Resizes the layout by one of its frame's handles. `box` is what the width applies to, and the
 * pointer moves its edge by `direction` times its own distance: negative for a left edge, two for a
 * box that grows both ways.
 */
function resizeBlock(root: HTMLElement, box: HTMLElement, handle: HTMLElement, edge: FrameEdge, context: LayoutContext, start: PointerEvent, direction: number): void {
  // The width is a share of the layout's container; with text beside the media, of the layout's own content.
  const available = box === root ? (root.parentElement?.getBoundingClientRect().width ?? 0) : contentWidth(root);
  const rect = box.getBoundingClientRect();
  if (available <= 0 || rect.width <= 0) {
    return;
  }
  const startWidth = effectiveWidth(context.model) ?? Math.min(1, rect.width / available);
  const rowEls = Array.from(root.querySelectorAll<HTMLElement>(".vml-row"));
  const rowsHeight = rowEls.reduce((sum, rowEl) => sum + rowEl.getBoundingClientRect().height, 0);
  // Single items without a stored width scale from the share of their row they take up now.
  const singleWidths = context.model.rows.map((row, index) => {
    const rowEl = rowEls.find((el) => Number(el.dataset.row) === index);
    const itemEl = rowEl?.querySelector<HTMLElement>(".vml-item");
    const rowWidth = rowEl?.getBoundingClientRect().width ?? 0;
    return row.items.length === 1 && itemEl && rowWidth > 0 ? itemEl.getBoundingClientRect().width / rowWidth : null;
  });

  let next = context.model;
  let moved = false;
  const done = (): void => {
    handle.removeClass("is-active");
    root.removeClass("vml-layout--resizing");
  };
  handle.addClass("is-active");
  root.addClass("vml-layout--resizing");

  trackPointer(handle, start, {
    onMove(move) {
      moved = true;
      const dx = (move.clientX - start.clientX) * direction;
      const dy = move.clientY - start.clientY;
      if (edge === "right") {
        next = setBlockWidth(context.model, (rect.width + dx) / available);
      } else if (edge === "bottom") {
        const scale = clamp(rowsHeight > 0 ? (rowsHeight + dy) / rowsHeight : 1, MIN_SCALE, MAX_SCALE);
        next = scaleRows(context.model, scale, singleWidths);
      } else {
        // The layout's width stays within its limits, so the rows scale by the same factor as it.
        const widest = maxBlockWidth(context.model) / startWidth;
        const scale = clamp((rect.width + dx) / rect.width, Math.max(MIN_SCALE, MIN_BLOCK_WIDTH / startWidth), Math.min(MAX_SCALE, widest));
        next = scaleRows(setBlockWidth(context.model, startWidth * scale), scale, singleWidths, 1);
      }
      applySizing(root, next);
    },
    onEnd() {
      done();
      if (!moved) {
        return;
      }
      void commitEdits(context.app, context.sourcePath, [planModelEdit(context.block, next)]).then((changed) => {
        if (!changed) {
          applySizing(root, context.model);
        }
      });
    },
    onCancel() {
      done();
      applySizing(root, context.model);
    },
  });
}

function showItemMenu(at: MouseEvent | { x: number; y: number }, root: HTMLElement, context: LayoutContext, position: ItemPosition): void {
  const row = context.model.rows[position.row];
  const item = row?.items[position.index];
  if (!row || !item) {
    return;
  }

  const menu = new Menu();
  // Each group has its own section: Obsidian separates sections and lists these before the file
  // actions added at the end.
  menu.addItem((entry) => entry.setTitle(t("editCaption")).setIcon("text").setSection("vml-caption").onClick(() => {
    const currentAlign = row.captionAlign ?? "left";
    new CaptionModal(context.app, item.caption ?? "", currentAlign, (caption, align) => {
      let model = setCaption(context.model, position, caption);
      if (align !== currentAlign) {
        model = setCaptionAlign(model, position.row, align);
      }
      void commitEdits(context.app, context.sourcePath, [planModelEdit(context.block, model)]);
    }).open();
  }));

  // Alignment only means something for a row with a single item.
  if (row.items.length === 1) {
    const choices = [["left", "alignLeft", "align-left"], ["center", "alignCenter", "align-center"], ["right", "alignRight", "align-right"]] as const;
    for (const [align, label, icon] of choices) {
      menu.addItem((entry) => entry
        .setTitle(t(label))
        .setIcon(icon)
        .setSection("vml-align")
        .setChecked(row.offset === null && (row.align ?? "center") === align)
        .onClick(() => {
          void commitEdits(context.app, context.sourcePath, [planModelEdit(context.block, setAlign(context.model, position.row, align))]);
        }));
    }
  }

  // The whole layout floats to one side with the note's text wrapping around it, or stands alone.
  // A layout with text beside its media does not float.
  if (!hasText(context.model)) {
    const wraps = [[null, "wrapNone", "square"], ["left", "wrapLeft", "panel-left"], ["right", "wrapRight", "panel-right"]] as const;
    for (const [side, label, icon] of wraps) {
      menu.addItem((entry) => entry
        .setTitle(t(label))
        .setIcon(icon)
        .setSection("vml-wrap")
        .setChecked(context.model.wrap === side)
        .onClick(() => {
          void commitEdits(context.app, context.sourcePath, [planModelEdit(context.block, setWrap(context.model, side))]);
        }));
    }
  }

  // Text beside the media is typed in the note itself, in live preview.
  if (context.live) {
    const sides = [["left", "addTextLeft", "panel-left-open"], ["right", "addTextRight", "panel-right-open"]] as const;
    for (const [side, label, icon] of sides) {
      if (addedTextLine(context.block, side) !== null) {
        menu.addItem((entry) => entry.setTitle(t(label)).setIcon(icon).setSection("vml-text").onClick(() => {
          void addText(root, context, side);
        }));
      }
    }
  }

  // Nothing is deleted: the embed goes on its own line right after the block.
  menu.addItem((entry) => entry.setTitle(t("moveOut")).setIcon("log-out").setSection("vml-move").onClick(() => {
    const taken = removeItem(context.model, position);
    if (taken) {
      void commitEdits(context.app, context.sourcePath, [planMoveOut(context.block, taken.model, taken.item.embed)]);
    }
  }));

  // Obsidian's own actions for the media file, as on any link: reveal it in the file list or the
  // system's file manager, open it, copy its path, and whatever other plugins add.
  const media = resolveMedia(context.app, item.embed, context.sourcePath);
  if (media?.file) {
    context.app.workspace.trigger("file-menu", menu, media.file, "link-context-menu");
  }

  if (at instanceof MouseEvent) {
    menu.showAtMouseEvent(at);
  } else {
    menu.showAtPosition(at);
  }
}

/** Gives the block a blank line for text on one side and puts the cursor on it, showing the block's source. */
async function addText(root: HTMLElement, context: LayoutContext, side: TextSide): Promise<void> {
  // Found first: once the note changes, the layout is drawn anew and `root` leaves the editor.
  const editorEl = root.closest<HTMLElement>(".cm-editor");
  const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
  const edit = planAddText(context.block, side);
  const at = addedTextLine(context.block, side);
  if (!view || !edit || at === null || !(await commitEdits(context.app, context.sourcePath, [edit]))) {
    return;
  }

  const expected = [...context.block.lines];
  expected.splice(edit.start, edit.end - edit.start + 1, ...edit.replacement);
  const matches = findV2Blocks(view.state.doc.toString().split("\n"))
    .filter((candidate) => candidate.lines.length === expected.length && candidate.lines.every((line, index) => line === expected[index]));
  const block = matches.length === 1 ? matches[0] : undefined;
  if (block) {
    view.dispatch({ selection: { anchor: view.state.doc.line(block.openLine + at + 1).from }, scrollIntoView: true });
    view.focus();
  }
}

function contentWidth(el: HTMLElement): number {
  const style = getComputedStyle(el);
  return el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
