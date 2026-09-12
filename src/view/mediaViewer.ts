import { Modal, setIcon, type App } from "obsidian";

import { t } from "./messages.ts";
import { trackPointer } from "./pointer.ts";

export interface ViewerImage {
  url: string;
  alt: string;
}

const MAX_ZOOM = 10;
const WHEEL_STEP = 1.2;
const DOUBLE_CLICK_ZOOM = 2.5;

/**
 * Image viewer for layouts in live preview, where Obsidian's own viewer only opens its own embeds.
 * Wheel to zoom at the pointer, drag to pan, double-click to zoom in or back out, arrow keys to go
 * through the layout's images, Escape or a click beside the image to close.
 */
export class MediaViewer extends Modal {
  private readonly images: ViewerImage[];
  private index: number;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private stageEl: HTMLElement | null = null;
  private imageEl: HTMLImageElement | null = null;
  private counterEl: HTMLElement | null = null;

  constructor(app: App, images: ViewerImage[], index: number) {
    super(app);
    this.images = images;
    this.index = index;
  }

  override onOpen(): void {
    this.modalEl.addClass("vml-viewer");
    this.containerEl.addClass("vml-viewer-container");
    const stage = this.stageEl = this.contentEl.createDiv({ cls: "vml-viewer__stage" });
    const image = this.imageEl = stage.createEl("img", { cls: "vml-viewer__image", attr: { draggable: "false" } });
    // A full-screen modal gets no close button from Obsidian 1.13, so the viewer brings its own.
    const closeButton = this.contentEl.createDiv({ cls: "vml-viewer__close clickable-icon", attr: { "aria-label": t("close"), role: "button" } });
    setIcon(closeButton, "x");
    closeButton.addEventListener("click", () => this.close());

    if (this.images.length > 1) {
      this.counterEl = this.contentEl.createDiv({ cls: "vml-viewer__counter" });
      this.scope.register([], "ArrowLeft", () => {
        this.go(-1);
        return false;
      });
      this.scope.register([], "ArrowRight", () => {
        this.go(1);
        return false;
      });
    }

    stage.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoomAt(event.deltaY < 0 ? this.zoom * WHEEL_STEP : this.zoom / WHEEL_STEP, event.clientX, event.clientY);
    }, { passive: false });
    stage.addEventListener("dblclick", (event) => {
      event.preventDefault();
      this.zoomAt(this.zoom > 1 ? 1 : DOUBLE_CLICK_ZOOM, event.clientX, event.clientY);
    });
    stage.addEventListener("click", (event) => {
      if (event.target === stage) {
        this.close();
      }
    });
    image.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.zoom <= 1) {
        return;
      }
      event.preventDefault();
      const startX = this.panX;
      const startY = this.panY;
      image.addClass("is-panning");
      trackPointer(image, event, {
        onMove: (move) => {
          this.panX = startX + move.clientX - event.clientX;
          this.panY = startY + move.clientY - event.clientY;
          this.apply();
        },
        onEnd: () => image.removeClass("is-panning"),
        onCancel: () => {
          image.removeClass("is-panning");
          this.panX = startX;
          this.panY = startY;
          this.apply();
        },
      });
    });

    this.show();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private go(step: number): void {
    this.index = (this.index + step + this.images.length) % this.images.length;
    this.show();
  }

  private show(): void {
    const image = this.images[this.index];
    if (!image || !this.imageEl) {
      return;
    }
    this.imageEl.src = image.url;
    this.imageEl.alt = image.alt;
    this.counterEl?.setText(`${this.index + 1} / ${this.images.length}`);
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.apply();
  }

  /** Zooms so that the point under (x, y) stays where it is. */
  private zoomAt(next: number, x: number, y: number): void {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, next));
    const rect = this.stageEl?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const fromCenterX = x - (rect.left + rect.width / 2);
    const fromCenterY = y - (rect.top + rect.height / 2);
    this.panX = zoom === 1 ? 0 : fromCenterX - ((fromCenterX - this.panX) * zoom) / this.zoom;
    this.panY = zoom === 1 ? 0 : fromCenterY - ((fromCenterY - this.panY) * zoom) / this.zoom;
    this.zoom = zoom;
    this.apply();
  }

  private apply(): void {
    this.imageEl?.setCssProps({
      "--vml-zoom": String(this.zoom),
      "--vml-pan-x": `${this.panX}px`,
      "--vml-pan-y": `${this.panY}px`,
    });
    this.imageEl?.toggleClass("is-zoomed", this.zoom > 1);
  }
}
