import { Menu, Notice, TFile, setIcon, type App } from "obsidian";

import { DEFAULT_ROW_HEIGHT, MAX_ROW_HEIGHT, MIN_ROW_HEIGHT, type V2Block } from "../format/v2.ts";
import { isEditable, planModelEdit, planMoveOut, type BlockEdit, type EditFailureReason } from "../layout/edits.ts";
import { dropTarget, resizePair, weightsFromWidths, type ItemBox, type RowBox } from "../layout/geometry.ts";
import {
  insertItem,
  moveItem,
  removeItem,
  setAlign,
  setCaption,
  setCaptionAlign,
  setRowHeight,
  setSingleWidth,
  setWeights,
  type ItemPosition,
  type LayoutModel,
  type MoveTarget,
} from "../layout/model.ts";
import { writeBlockEdits } from "../layout/writeBack.ts";
import { CaptionModal } from "./captionModal.ts";
import { resolveMedia } from "./media.ts";
import { t, type MessageKey } from "./messages.ts";
import { trackPointer } from "./pointer.ts";

export interface LayoutContext {
  app: App;
  sourcePath: string;
  block: V2Block;
  model: LayoutModel;
}

interface DropState {
  root: HTMLElement;
  context: LayoutContext;
  target: MoveTarget;
}

const contexts = new WeakMap<HTMLElement, LayoutContext>();
const DRAG_THRESHOLD = 6;
const MIN_COLUMN_WIDTH = 60;
const FAILURE_MESSAGES: Record<EditFailureReason, MessageKey> = {
  "not-found": "writeNotFound",
  ambiguous: "writeAmbiguous",
  overlap: "writeOverlap",
};
const DROP_CLASSES = ["vml-drop-before", "vml-drop-after", "vml-drop-row-before", "vml-drop-row-after"];

/**
 * Makes a rendered layout editable: drag to reorder (also into other blocks of the same note in the
 * same pane), resize rows, columns and single items, and a context menu. Every change goes through
 * the layout model and the write-back layer; the view never edits the note itself. Blocks that are
 * not editable (docs/DESIGN.md, section 1.3) stay display-only.
 */
export function attachInteractions(root: HTMLElement, context: LayoutContext): void {
  contexts.set(root, context);
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
    showItemMenu(event, context, position);
  });
  itemEl.addEventListener("keydown", (event) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = itemEl.getBoundingClientRect();
      showItemMenu({ x: rect.left + 16, y: rect.top + 16 }, context, position);
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

function startDrag(
  root: HTMLElement,
  itemEl: HTMLElement,
  handle: HTMLElement,
  source: ItemPosition,
  context: LayoutContext,
  start: PointerEvent,
): void {
  let dragging = false;
  let drop: DropState | null = null;
  const stop = (): void => {
    itemEl.removeClass("vml-item--dragging");
    root.removeClass("vml-layout--dragging");
    clearDropIndicators(root.ownerDocument);
  };

  trackPointer(handle, start, {
    onMove(event) {
      if (!dragging) {
        if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < DRAG_THRESHOLD) {
          return;
        }
        dragging = true;
        itemEl.addClass("vml-item--dragging");
        root.addClass("vml-layout--dragging");
      }
      clearDropIndicators(root.ownerDocument);
      drop = findDrop(root, context, event.clientX, event.clientY);
      if (drop) {
        showDropIndicator(drop);
      }
    },
    onEnd() {
      stop();
      if (dragging && drop) {
        void dropItem(context, source, drop);
      }
    },
    onCancel: stop,
  });
}

function findDrop(root: HTMLElement, context: LayoutContext, x: number, y: number): DropState | null {
  const targetRoot = root.ownerDocument.elementFromPoint(x, y)?.closest<HTMLElement>(".vml-layout") ?? null;
  const targetContext = targetRoot ? contexts.get(targetRoot) : undefined;
  if (!targetRoot || !targetContext || targetContext.sourcePath !== context.sourcePath || !isEditable(targetContext.block)) {
    return null;
  }
  // The same note open in two panes would otherwise let one drag edit a block twice.
  if (targetRoot.closest(".workspace-leaf") !== root.closest(".workspace-leaf")) {
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

function showDropIndicator({ root, target }: DropState): void {
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

function clearDropIndicators(doc: Document): void {
  for (const cls of DROP_CLASSES) {
    doc.querySelectorAll(`.${cls}`).forEach((el) => el.removeClass(cls));
  }
}

async function dropItem(source: LayoutContext, from: ItemPosition, drop: DropState): Promise<void> {
  // A reading-view block split by blank lines is rendered in several sections of one block.
  if (drop.context.block.openLine === source.block.openLine) {
    const moved = moveItem(source.model, from, drop.target);
    if (moved !== source.model) {
      await commit(source, [planModelEdit(source.block, moved)]);
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
    await commit(source, [sourceEdit, targetEdit]);
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
      setUpWidthHandle(rowEl, itemEl, row, layoutRow.align ?? "center", context);
    }
    return;
  }

  setUpHeightHandle(rowEl, row, layoutRow.height ?? DEFAULT_ROW_HEIGHT, context);
  itemEls.slice(0, -1).forEach((itemEl, index) => setUpColumnHandle(itemEls, itemEl, index, row, context));
}

function setUpWidthHandle(rowEl: HTMLElement, itemEl: HTMLElement, row: number, align: string, context: LayoutContext): void {
  const handle = itemEl.createDiv({ cls: "vml-handle vml-item__width-handle", attr: { "aria-label": t("resizeWidth"), role: "separator" } });
  // The handle sits on the edge that moves: the right one, or the left one for a right-aligned item.
  // A centered item grows on both sides, so its edge moves half as far as its width changes.
  handle.toggleClass("vml-item__width-handle--left", align === "right");
  const factor = align === "center" ? 2 : align === "right" ? -1 : 1;

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
          void commit(context, [planModelEdit(context.block, setSingleWidth(context.model, row, round(fraction)))]);
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
          void commit(context, [planModelEdit(context.block, setRowHeight(context.model, row, height))]);
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
          void commit(context, [planModelEdit(context.block, setWeights(context.model, row, weightsFromWidths(widths)))]);
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

function showItemMenu(at: MouseEvent | { x: number; y: number }, context: LayoutContext, position: ItemPosition): void {
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
      void commit(context, [planModelEdit(context.block, model)]);
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
        .setChecked((row.align ?? "center") === align)
        .onClick(() => {
          void commit(context, [planModelEdit(context.block, setAlign(context.model, position.row, align))]);
        }));
    }
  }

  // Nothing is deleted: the embed goes on its own line right after the block.
  menu.addItem((entry) => entry.setTitle(t("moveOut")).setIcon("log-out").setSection("vml-move").onClick(() => {
    const taken = removeItem(context.model, position);
    if (taken) {
      void commit(context, [planMoveOut(context.block, taken.model, taken.item.embed)]);
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

async function commit(context: LayoutContext, edits: Array<BlockEdit | null>): Promise<void> {
  const planned = edits.filter((edit): edit is BlockEdit => edit !== null);
  if (planned.length === 0) {
    return;
  }

  const file = context.app.vault.getAbstractFileByPath(context.sourcePath);
  if (!(file instanceof TFile)) {
    new Notice(t("fileMissing"));
    return;
  }

  const result = await writeBlockEdits(context.app, file, planned);
  if (!result.ok) {
    new Notice(t(FAILURE_MESSAGES[result.reason]));
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
