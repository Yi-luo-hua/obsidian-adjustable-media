import { Notice, editorInfoField, setIcon, type App } from "obsidian";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";

import { planModelEdit } from "../layout/edits.ts";
import { insertItem } from "../layout/model.ts";
import { takePlainEmbed, takePlainMermaid, type TakenEmbed } from "../layout/plainEmbed.ts";
import { createDragGhost, type DragGhost } from "./dragGhost.ts";
import { DRAG_THRESHOLD, clearDropIndicators, commitEdits, findDrop, showDropIndicator, swallowNextClick, type DropState } from "./interactions.ts";
import { t } from "./messages.ts";
import { trackPointer } from "./pointer.ts";
import { eventElement } from "./windows.ts";

/** Images Obsidian itself draws in live preview, for wiki and Markdown embeds alike. */
const PLAIN_IMAGE = ".image-embed > .image-wrapper > img";

/**
 * Live preview: an image or complete Mermaid outside a layout can be dropped into a layout of the same
 * note. Obsidian's image click, resize corner, menu and Mermaid source button remain available.
 * Nothing moves until the pointer has moved, and only images on a line of plain
 * media embeds or complete top-level Mermaid fences can move. Released off a layout, they stay put.
 *
 * Listeners go on the editor's DOM directly: CodeMirror hands no events from Obsidian's image
 * widgets to extensions.
 */
export function plainMediaDrag(app: App): Extension {
  return ViewPlugin.define((view) => {
    // The media whose drag the plugin is following, if any.
    let dragging: HTMLElement | null = null;
    let cancelDrag: (() => void) | null = null;
    const hasLayouts = (): boolean => view.dom.querySelector(".vml-layout--interactive") !== null;
    const grips = new Set<HTMLElement>();
    const updateGrips = (): void => {
      const available = hasLayouts();
      for (const grip of grips) {
        const diagram = grip.parentElement;
        if (!grip.isConnected || !available || !diagram || !take(view, diagram)) { diagram?.removeClass("vml-plain-media--draggable"); grip.remove(); grips.delete(grip); }
      }
      if (!available) return;
      for (const diagram of Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".mermaid"))) {
        if (diagram.closest(".vml-layout, .vml-text-editor") || !diagram.querySelector("svg")
          || diagram.querySelector(":scope > .vml-plain-media__grip") || !take(view, diagram)) continue;
        const grip = diagram.createEl("button", { cls: "vml-plain-media__grip", attr: { type: "button", "aria-label": t("dragHandle") } });
        setIcon(grip, "grip-vertical");
        grip.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); });
        diagram.addClass("vml-plain-media--draggable");
        grips.add(grip);
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      const target = eventElement(event);
      const diagram = target?.closest<HTMLElement>(".mermaid");
      const media = target?.instanceOf(HTMLImageElement) && target.matches(PLAIN_IMAGE) ? target : diagram;
      const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
      if (event.button !== 0 || modified || !media || media.closest(".vml-layout, .vml-text-editor") || !hasLayouts()) {
        return;
      }
      const hold = diagram !== null && event.pointerType === "touch" && !target?.closest(".vml-plain-media__grip");
      if (hold && target?.closest("button, a, input, textarea")) return;
      const sourcePath = view.state.field(editorInfoField, false)?.file?.path;
      const taken = sourcePath ? take(view, media) : null;
      if (sourcePath && taken) {
        // A native text selection could reveal the fence and remove the diagram during the drag.
        if (diagram && !hold) event.preventDefault();
        dragging = media;
        cancelDrag = startPlainDrag(app, view, media, sourcePath, taken, event, () => {
          dragging = null;
          cancelDrag = null;
        }, hold);
      }
    };
    // While the plugin follows a drag, the browser's own image drag must not start: it would take
    // over the gesture. It is stopped on its way down, before it reaches the image, where Obsidian
    // starts a drag of its own that only a dragend would end (docs/DESIGN.md, section 4).
    const onDragStart = (event: DragEvent): void => {
      if (dragging !== null) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    view.contentDOM.addEventListener("pointerdown", onPointerDown);
    view.contentDOM.addEventListener("dragstart", onDragStart, { capture: true });
    const observer = new (view.contentDOM.ownerDocument.defaultView as Window & typeof window).MutationObserver(updateGrips);
    observer.observe(view.contentDOM, { childList: true, subtree: true });
    updateGrips();
    return {
      destroy() {
        cancelDrag?.();
        observer.disconnect();
        for (const grip of grips) { grip.parentElement?.removeClass("vml-plain-media--draggable"); grip.remove(); }
        grips.clear();
        view.contentDOM.removeEventListener("pointerdown", onPointerDown);
        view.contentDOM.removeEventListener("dragstart", onDragStart, { capture: true });
      },
    };
  });
}

function startPlainDrag(app: App, view: EditorView, media: HTMLElement, sourcePath: string, initial: TakenEmbed, start: PointerEvent, onFinish: () => void, hold = false): () => void {
  const doc = media.ownerDocument;
  const leaf = media.closest(".workspace-leaf");
  let ghost: DragGhost | null = null;
  let drop: DropState | null = null;
  let armed = !hold;
  let timer: number | undefined;

  const stop = (): void => {
    if (timer !== undefined) media.win.clearTimeout(timer);
    doc.removeEventListener("touchmove", onTouchMove, true);
    doc.removeEventListener("contextmenu", onContextMenu, true);
    ghost?.remove();
    media.removeClass("vml-plain-image--dragging");
    doc.body.removeClass("vml-is-dragging");
    clearDropIndicators(doc);
    onFinish();
  };

  const showGhost = (event: PointerEvent): DragGhost => {
    const preview = createDragGhost(doc, media);
    media.addClass("vml-plain-image--dragging");
    doc.body.addClass("vml-is-dragging");
    preview.move(event.clientX, event.clientY);
    return preview;
  };
  const onTouchMove = (event: TouchEvent): void => {
    if (armed && event.touches.length === 1) event.preventDefault();
  };
  const onContextMenu = (event: MouseEvent): void => {
    if (armed && media.contains(eventElement(event))) { event.preventDefault(); event.stopPropagation(); }
  };
  const cancel = trackPointer(media, start, {
    onMove(event) {
      if (!armed) {
        if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) >= DRAG_THRESHOLD) cancel();
        return;
      }
      if (!ghost) {
        if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < DRAG_THRESHOLD) {
          return;
        }
        ghost = showGhost(event);
      }
      ghost.move(event.clientX, event.clientY);
      clearDropIndicators(doc);
      drop = findDrop(doc, sourcePath, leaf, event.clientX, event.clientY);
      if (drop) {
        showDropIndicator(drop);
      }
    },
    onEnd() {
      const dragged = ghost !== null;
      stop();
      if (!dragged) {
        return;
      }
      swallowNextClick(doc);
      if (drop) {
        void dropPlain(app, view, media, sourcePath, initial, drop);
      }
    },
    onCancel: stop,
  });
  if (hold) {
    doc.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    doc.addEventListener("contextmenu", onContextMenu, true);
    timer = media.win.setTimeout(() => { armed = true; ghost = showGhost(start); }, 350);
  }
  return cancel;
}

async function dropPlain(app: App, view: EditorView, media: HTMLElement, sourcePath: string, initial: TakenEmbed, drop: DropState): Promise<void> {
  // Located again at drop time, from the note as it is now.
  const taken = take(view, media);
  if (!taken || (initial.embed.kind === "mermaid" && taken.embed.raw !== initial.embed.raw)) {
    new Notice(t("writeNotFound"));
    return;
  }
  const target = planModelEdit(drop.context.block, insertItem(drop.context.model, { embed: taken.embed, weight: null, caption: null }, drop.target));
  // Both halves or nothing: writing only the removal would lose the embed.
  if (target) {
    await commitEdits(app, sourcePath, [taken.edit, target], { view });
  }
}

function take(view: EditorView, media: HTMLElement): TakenEmbed | null {
  const diagram = media.matches(".mermaid");
  const embedEl = diagram ? media : media.closest<HTMLElement>(".image-embed");
  if (!embedEl) {
    return null;
  }
  try {
    const pos = view.posAtDOM(embedEl);
    const line = view.state.doc.lineAt(pos);
    const lines = view.state.doc.toString().split("\n");
    return diagram ? takePlainMermaid(lines, line.number - 1) : takePlainEmbed(lines, line.number - 1, pos - line.from);
  } catch {
    // The media is no longer part of the editor.
    return null;
  }
}
