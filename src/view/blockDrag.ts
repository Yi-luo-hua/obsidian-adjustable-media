import { Notice, setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";

import { findV2Blocks, MAX_WRAP_SKIP } from "../format/v2.ts";
import { planModelEdit } from "../layout/edits.ts";
import { positionOffset, wrapZone, wrappedDrop } from "../layout/geometry.ts";
import { visualWrapSkip } from "../layout/floatOrder.ts";
import { effectiveFrameWidth, effectiveWidth, frameOffset, hasTextColumns, setFramePosition, setWrap } from "../layout/model.ts";
import { blockForMove, isSamePlace, moveGaps, pickGap, placeAboveEarlierFloats, planPlacement, type GapTop, type Placement } from "../layout/placement.ts";
import { insideStack, layoutStacks, planStackMove, planStackSizing, type LayoutStack } from "../layout/layoutStack.ts";
import { createDragGhost } from "./dragGhost.ts";
import { DRAG_THRESHOLD, commitEdits, swallowNextClick, type LayoutContext } from "./interactions.ts";
import { t } from "./messages.ts";
import { trackPointer } from "./pointer.ts";

/** Near the top or bottom edge of the editor a drag scrolls it, faster the closer it gets. */
const SCROLL_EDGE = 48;
const SCROLL_SPEED = 24;
const MIN_PREVIEW_HEIGHT = 48;
const MAX_PREVIEW_HEIGHT = 360;

interface DropIndicator {
  showBox(x: number, y: number, width: number, height: number, label: string): void;
  showLine(x: number, y: number, width: number, label: string): void;
  hide(): void;
  remove(): void;
}

/**
 * The top grip moves the whole block. A narrow non-floating frame can slide across its own line
 * when the drag starts horizontally. Other drags use the existing paragraph and wrap targets.
 */
export function setUpBlockMove(root: HTMLElement, context: LayoutContext, stack?: LayoutStack): void {
  const handle = root.createDiv({ cls: "vml-handle vml-frame__move", attr: { "aria-label": t(stack ? "moveStack" : "moveLayout"), role: "button" } });
  setIcon(handle, "grip-horizontal");
  handle.addEventListener("pointerdown", (event) => {
    // CodeMirror finds a view from its outer element only.
    const editorEl = root.closest<HTMLElement>(".cm-editor");
    const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
    if (event.button !== 0 || !view) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    startMove(view, root, context, event, stack);
  });
}

function startMove(view: EditorView, root: HTMLElement, context: LayoutContext, start: PointerEvent, expectedStack?: LayoutStack): void {
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  const text = view.state.doc.toString();
  const lines = text.split("\n");
  // A widget is kept while its block's text stays the same, so the block may have moved since.
  const widget = root.closest<HTMLElement>(".vml-live-preview");
  const at = context.position?.() ?? (widget ? view.posAtDOM(widget) : null);
  const line = at === null ? context.block.openLine : view.state.doc.lineAt(at).number - 1;
  const movingBlocks = findV2Blocks(lines);
  const stacks = layoutStacks(lines, movingBlocks);
  const stack = expectedStack && stacks.find(candidate => candidate.openLine === expectedStack.openLine
    && candidate.lines.join("\n") === expectedStack.lines.join("\n"));
  if (expectedStack && !stack) {
    new Notice(t("writeNotFound"));
    return;
  }
  const block = stack?.members[0] ?? blockForMove(lines, context.block, line);
  if (typeof block === "string") {
    new Notice(t(block === "not-found" ? "writeNotFound" : "writeAmbiguous"));
    return;
  }

  const gaps = moveGaps(lines).filter(gap => !insideStack(stacks, gap));
  const model = context.model;
  const movingIndex = movingBlocks.findIndex((candidate) => candidate.openLine === block.openLine);
  const currentVisualSkip = movingIndex < 0 ? model.skip ?? 0 : visualWrapSkip(lines, movingBlocks, movingIndex);
  const layout = root.getBoundingClientRect();
  const travel = (root.parentElement?.getBoundingClientRect().width ?? 0) - layout.width;
  const canSlide = model.wrap === null && effectiveFrameWidth(model) !== null && travel > 0;
  const initialOffset = frameOffset(model);
  const ghost = createDragGhost(doc, root.querySelector(".vml-item__media"));
  const indicator = createDropIndicator(doc);
  let drag: "horizontal" | "vertical" | null = null;
  let offset = initialOffset;
  let placement: Placement | null = null;
  let pointer = { x: start.clientX, y: start.clientY };
  let frame = 0;

  /** Top of a line on screen; the line count stands for the end of the note. */
  const lineTop = (line: number): number => {
    const { doc: state } = view.state;
    const top = line < state.lines ? view.lineBlockAt(state.line(line + 1).from).top : view.lineBlockAt(state.length).bottom;
    return top + view.documentTop;
  };
  const initialAnchorTop = lineTop(block.openLine);

  const place = (): void => {
    const content = view.contentDOM.getBoundingClientRect();
    const wrap = stack || hasTextColumns(model) ? null : wrapZone(pointer.x, content.left, content.right);
    const tops: GapTop[] = gaps.map((line) => ({ line, top: lineTop(line) }));
    const gap = pickGap(tops, pointer.y, wrap !== null);
    if (!gap) {
      placement = null;
      indicator.hide();
      return;
    }

    const lineHeight = view.defaultLineHeight;
    if (wrap === null) {
      placement = { line: gap.line, wrap: null, skip: 0 };
      indicator.showLine(content.left, gap.top - lineHeight / 2, content.width, t(stack ? "moveStack" : "wrapNone"));
      return;
    }
    const samePlace = isSamePlace(lines, block, gap.line);
    const targetTop = samePlace ? lineTop(block.openLine) : gap.top;
    const renderedTop = root.isConnected ? root.getBoundingClientRect().top : layout.top + targetTop - initialAnchorTop;
    const { skip, top } = wrappedDrop(pointer.y, targetTop, renderedTop, currentVisualSkip,
      lineHeight, MAX_WRAP_SKIP, samePlace && wrap === model.wrap);
    // Where it shows, ahead of any float written earlier that starts lower.
    placement = placeAboveEarlierFloats(lines, block, { line: gap.line, wrap, skip }, top, lineTop, lineHeight);

    const width = (effectiveWidth(setWrap(model, wrap)) ?? 1) * content.width;
    const height = Math.min(MAX_PREVIEW_HEIGHT, Math.max(MIN_PREVIEW_HEIGHT, layout.height * (width / Math.max(layout.width, 1))));
    const label = t(wrap === "left" ? "wrapLeft" : "wrapRight") + (placement.skip > 0 ? ` · ${t("dropSkip", { lines: String(placement.skip) })}` : "");
    indicator.showBox(wrap === "left" ? content.left : content.right - width, top, width, height, label);
  };

  const scroll = (): void => {
    frame = 0;
    const rect = view.scrollDOM.getBoundingClientRect();
    const above = rect.top + SCROLL_EDGE - pointer.y;
    const below = pointer.y - (rect.bottom - SCROLL_EDGE);
    const speed = above > 0 ? -edgeSpeed(above) : below > 0 ? edgeSpeed(below) : 0;
    if (drag === "vertical" && speed !== 0) {
      view.scrollDOM.scrollTop += speed;
      place();
      frame = win.requestAnimationFrame(scroll);
    }
  };

  const stop = (): void => {
    if (frame) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    root.removeClass("vml-layout--moving");
    if (drag === "horizontal") root.setCssProps({ "--vml-preview-frame-offset": "" });
    doc.body.removeClass("vml-is-dragging");
    ghost.remove();
    indicator.remove();
  };

  // The widget may be redrawn while the editor scrolls, so the gesture is followed on the editor.
  trackPointer(view.dom, start, {
    onMove(event) {
      pointer = { x: event.clientX, y: event.clientY };
      const dx = event.clientX - start.clientX;
      const dy = event.clientY - start.clientY;
      if (!drag) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
          return;
        }
        drag = canSlide && Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
        root.toggleClass("vml-layout--moving", drag === "vertical");
        doc.body.addClass("vml-is-dragging");
      }
      if (drag === "horizontal") {
        offset = dx === 0 ? initialOffset : positionOffset(initialOffset * travel, dx, travel, 0);
        root.setCssProps({ "--vml-preview-frame-offset": String(offset) });
        return;
      }
      ghost.move(event.clientX, event.clientY);
      place();
      if (!frame) {
        frame = win.requestAnimationFrame(scroll);
      }
    },
    onEnd() {
      stop();
      if (!drag) {
        return;
      }
      swallowNextClick(doc);
      if (drag === "horizontal" ? offset === initialOffset : placement === null) {
        return;
      }
      // The block and drop gaps belong to the note as it was when the drag started.
      if (view.state.doc.toString() !== text) {
        new Notice(t("writeNotFound"));
        return;
      }
      const edits = stack
        ? placement ? planStackMove(lines, stack, placement.line) : [planStackSizing(stack, stack.width, offset)]
        : placement ? planPlacement(lines, block, placement) : [planModelEdit(block, setFramePosition(model, offset))];
      if (edits && edits.length > 0) {
        void commitEdits(context.app, context.sourcePath, edits, { ...context, view, readSet: [{ fromLine: 0, lines }] });
      }
    },
    onCancel: stop,
  });
}

function edgeSpeed(depth: number): number {
  return Math.min(SCROLL_SPEED, (depth / SCROLL_EDGE) * SCROLL_SPEED);
}

function createDropIndicator(doc: Document): DropIndicator {
  const el = doc.body.createDiv({ cls: "vml-block-drop is-hidden" });
  const label = el.createDiv({ cls: "vml-block-drop__label" });
  const show = (x: number, y: number, width: number, height: number, text: string, line: boolean): void => {
    el.removeClass("is-hidden");
    el.toggleClass("vml-block-drop--line", line);
    el.setCssProps({
      "--vml-drop-x": `${x}px`,
      "--vml-drop-y": `${y}px`,
      "--vml-drop-width": `${width}px`,
      "--vml-drop-height": `${height}px`,
    });
    label.setText(text);
  };
  return {
    showBox: (x, y, width, height, text) => show(x, y, width, height, text, false),
    showLine: (x, y, width, text) => show(x, y, width, 3, text, true),
    hide: () => el.addClass("is-hidden"),
    remove: () => el.remove(),
  };
}
