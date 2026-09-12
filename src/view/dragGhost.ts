import { setIcon } from "obsidian";

export interface DragGhost {
  /** Shows the ghost next to the pointer. */
  move(x: number, y: number): void;
  hide(): void;
  remove(): void;
}

/** A small copy of the dragged media that follows the pointer while an item is moved. */
export function createDragGhost(doc: Document, media: Element | null): DragGhost {
  const el = doc.body.createDiv({ cls: "vml-drag-ghost is-hidden" });
  const src = media?.instanceOf(HTMLImageElement) ? media.currentSrc || media.src : "";
  if (src) {
    el.createEl("img", { attr: { alt: "", src } });
  } else {
    setIcon(el, media?.instanceOf(HTMLVideoElement) ? "film" : "image");
  }

  return {
    move(x, y) {
      el.removeClass("is-hidden");
      el.setCssProps({ "--vml-ghost-x": `${x}px`, "--vml-ghost-y": `${y}px` });
    },
    hide() {
      el.addClass("is-hidden");
    },
    remove() {
      el.remove();
    },
  };
}
