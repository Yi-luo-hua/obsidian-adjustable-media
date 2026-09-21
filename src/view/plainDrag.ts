import { Notice, editorInfoField, type App } from "obsidian";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";

import { planModelEdit } from "../layout/edits.ts";
import { insertItem } from "../layout/model.ts";
import { takePlainEmbed, type TakenEmbed } from "../layout/plainEmbed.ts";
import { createDragGhost, type DragGhost } from "./dragGhost.ts";
import { DRAG_THRESHOLD, clearDropIndicators, commitEdits, findDrop, showDropIndicator, swallowNextClick, type DropState } from "./interactions.ts";
import { t } from "./messages.ts";
import { trackPointer } from "./pointer.ts";

/** Images Obsidian itself draws in live preview, for wiki and Markdown embeds alike. */
const PLAIN_IMAGE = ".image-embed > .image-wrapper > img";

/**
 * Live preview: an image outside any layout can be grabbed and dropped into a layout of the same
 * note. Obsidian's click (select the image, click again to view it), resize corner and menu are
 * left alone: nothing happens until the pointer has moved, and only images on a line of plain
 * media embeds can move. Released anywhere but on a layout, the image stays where it is.
 *
 * Listeners go on the editor's DOM directly: CodeMirror hands no events from Obsidian's image
 * widgets to extensions.
 */
export function plainImageDrag(app: App): Extension {
  return ViewPlugin.define((view) => {
    // The image whose drag the plugin is following, if any.
    let dragging: HTMLImageElement | null = null;
    const hasLayouts = (): boolean => view.dom.querySelector(".vml-layout--interactive") !== null;

    const onPointerDown = (event: PointerEvent): void => {
      const img = event.target;
      const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
      if (event.button !== 0 || modified || !(img instanceof HTMLImageElement) || !img.matches(PLAIN_IMAGE) || !hasLayouts()) {
        return;
      }
      const sourcePath = view.state.field(editorInfoField, false)?.file?.path;
      if (sourcePath && take(view, img)) {
        dragging = img;
        startPlainDrag(app, view, img, sourcePath, event, () => {
          dragging = null;
        });
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
    return {
      destroy() {
        view.contentDOM.removeEventListener("pointerdown", onPointerDown);
        view.contentDOM.removeEventListener("dragstart", onDragStart, { capture: true });
      },
    };
  });
}

function startPlainDrag(app: App, view: EditorView, img: HTMLImageElement, sourcePath: string, start: PointerEvent, onFinish: () => void): void {
  const doc = img.ownerDocument;
  const leaf = img.closest(".workspace-leaf");
  let ghost: DragGhost | null = null;
  let drop: DropState | null = null;

  const stop = (): void => {
    ghost?.remove();
    img.removeClass("vml-plain-image--dragging");
    doc.body.removeClass("vml-is-dragging");
    clearDropIndicators(doc);
    onFinish();
  };

  trackPointer(img, start, {
    onMove(event) {
      if (!ghost) {
        if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < DRAG_THRESHOLD) {
          return;
        }
        ghost = createDragGhost(doc, img);
        img.addClass("vml-plain-image--dragging");
        doc.body.addClass("vml-is-dragging");
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
        void dropPlain(app, view, img, sourcePath, drop);
      }
    },
    onCancel: stop,
  });
}

async function dropPlain(app: App, view: EditorView, img: HTMLImageElement, sourcePath: string, drop: DropState): Promise<void> {
  // Located again at drop time, from the note as it is now.
  const taken = take(view, img);
  if (!taken) {
    new Notice(t("writeNotFound"));
    return;
  }
  const target = planModelEdit(drop.context.block, insertItem(drop.context.model, { embed: taken.embed, weight: null, caption: null }, drop.target));
  // Both halves or nothing: writing only the removal would lose the embed.
  if (target) {
    await commitEdits(app, sourcePath, [taken.edit, target], { view });
  }
}

function take(view: EditorView, img: HTMLImageElement): TakenEmbed | null {
  const embedEl = img.closest<HTMLElement>(".image-embed");
  if (!embedEl) {
    return null;
  }
  try {
    const pos = view.posAtDOM(embedEl);
    const line = view.state.doc.lineAt(pos);
    return takePlainEmbed(view.state.doc.toString().split("\n"), line.number - 1, pos - line.from);
  } catch {
    // The image is no longer part of the editor.
    return null;
  }
}
