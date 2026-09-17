import { Notice, setIcon } from "obsidian";
import { EditorView } from "@codemirror/view";

import { MAX_WRAP_SKIP } from "../format/v2.ts";
import { skipLines, wrapZone } from "../layout/geometry.ts";
import { effectiveWidth, hasTextColumns, setWrap } from "../layout/model.ts";
import { blockForMove, blockGaps, isSamePlace, pickGap, planPlacement, type GapTop, type Placement } from "../layout/placement.ts";
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
 * Live preview: the grip on top of a layout's frame moves the whole block. Dropped in the left or
 * right third of the text, the layout floats to that side with the text wrapping around it, starting
 * at the line the pointer marks; dropped in the middle third, it stands on its own between two
 * paragraphs. A layout with text beside its media does not float and always goes between two
 * paragraphs. The block moves verbatim, in one edit (docs/DESIGN.md, section 3).
 */
export function setUpBlockMove(root: HTMLElement, context: LayoutContext): void {
  const handle = root.createDiv({ cls: "vml-handle vml-frame__move", attr: { "aria-label": t("moveLayout"), role: "button" } });
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
    startMove(view, root, context, event);
  });
}

function startMove(view: EditorView, root: HTMLElement, context: LayoutContext, start: PointerEvent): void {
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  const text = view.state.doc.toString();
  const lines = text.split("\n");
  // A widget is kept while its block's text stays the same, so the block may have moved since.
  const widget = root.closest<HTMLElement>(".vml-live-preview");
  const line = widget ? view.state.doc.lineAt(view.posAtDOM(widget)).number - 1 : context.block.openLine;
  const block = blockForMove(lines, context.block, line);
  if (typeof block === "string") {
    new Notice(t(block === "not-found" ? "writeNotFound" : "writeAmbiguous"));
    return;
  }

  const gaps = blockGaps(lines);
  const layout = root.getBoundingClientRect();
  const ghost = createDragGhost(doc, root.querySelector(".vml-item__media"));
  const indicator = createDropIndicator(doc);
  let dragging = false;
  let placement: Placement | null = null;
  let pointer = { x: start.clientX, y: start.clientY };
  let frame = 0;

  /** Top of a line on screen; the line count stands for the end of the note. */
  const lineTop = (line: number): number => {
    const { doc: state } = view.state;
    const top = line < state.lines ? view.lineBlockAt(state.line(line + 1).from).top : view.lineBlockAt(state.length).bottom;
    return top + view.documentTop;
  };

  const place = (): void => {
    const content = view.contentDOM.getBoundingClientRect();
    const wrap = hasTextColumns(context.model) ? null : wrapZone(pointer.x, content.left, content.right);
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
      indicator.showLine(content.left, gap.top - lineHeight / 2, content.width, t("wrapNone"));
      return;
    }
    // At its own place the layout starts where its widget is; elsewhere in front of the gap's line.
    const anchorTop = isSamePlace(lines, block, gap.line) ? lineTop(block.openLine) : gap.top;
    const skip = skipLines(pointer.y, anchorTop, lineHeight, MAX_WRAP_SKIP);
    placement = { line: gap.line, wrap, skip };

    const width = (effectiveWidth(setWrap(context.model, wrap)) ?? 1) * content.width;
    const height = Math.min(MAX_PREVIEW_HEIGHT, Math.max(MIN_PREVIEW_HEIGHT, layout.height * (width / Math.max(layout.width, 1))));
    const label = t(wrap === "left" ? "wrapLeft" : "wrapRight") + (skip > 0 ? ` · ${t("dropSkip", { lines: String(skip) })}` : "");
    indicator.showBox(wrap === "left" ? content.left : content.right - width, anchorTop + skip * lineHeight, width, height, label);
  };

  const scroll = (): void => {
    frame = 0;
    const rect = view.scrollDOM.getBoundingClientRect();
    const above = rect.top + SCROLL_EDGE - pointer.y;
    const below = pointer.y - (rect.bottom - SCROLL_EDGE);
    const speed = above > 0 ? -edgeSpeed(above) : below > 0 ? edgeSpeed(below) : 0;
    if (dragging && speed !== 0) {
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
    doc.body.removeClass("vml-is-dragging");
    ghost.remove();
    indicator.remove();
  };

  // The widget may be redrawn while the editor scrolls, so the gesture is followed on the editor.
  trackPointer(view.dom, start, {
    onMove(event) {
      pointer = { x: event.clientX, y: event.clientY };
      if (!dragging) {
        if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < DRAG_THRESHOLD) {
          return;
        }
        dragging = true;
        root.addClass("vml-layout--moving");
        doc.body.addClass("vml-is-dragging");
      }
      ghost.move(event.clientX, event.clientY);
      place();
      if (!frame) {
        frame = win.requestAnimationFrame(scroll);
      }
    },
    onEnd() {
      stop();
      if (!dragging) {
        return;
      }
      swallowNextClick(doc);
      if (!placement) {
        return;
      }
      // The gaps were found in the note as it was when the drag started.
      if (view.state.doc.toString() !== text) {
        new Notice(t("writeNotFound"));
        return;
      }
      const edits = planPlacement(lines, block, placement);
      if (edits && edits.length > 0) {
        void commitEdits(context.app, context.sourcePath, edits);
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
