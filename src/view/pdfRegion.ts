import { MarkdownRenderer, type App, type Component } from "obsidian";

import type { V2Embed } from "../format/v2.ts";
import { t } from "./messages.ts";

/** How long a layout waits for PDF++ to draw a region before counting it as drawn (export waits on it). */
const RENDER_TIMEOUT = 10000;

function pdfPlusLoaded(app: App): boolean {
  const plugins = (app as App & { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
  return plugins?.["pdf-plus"] !== undefined;
}

/**
 * Draws a PDF++ rectangle embed through Obsidian's own embed, which PDF++ renders as one image of the
 * region; the layout owns the display size. `sized` reports the image's proportions once loaded, in
 * case they differ from the rectangle's (a rotated page). Never writes to the note.
 */
export function renderPdfRegion(app: App, embed: V2Embed, el: HTMLElement, sourcePath: string, component: Component,
  sized: (size: { width: number; height: number }) => void): Promise<void> {
  el.addEventListener("dblclick", event => {
    event.preventDefault(); event.stopPropagation();
    void app.workspace.openLinkText(embed.target + (embed.fragment ?? ""), sourcePath, event.ctrlKey || event.metaKey);
  });
  if (!pdfPlusLoaded(app)) {
    el.addClass("vml-item__pdf--unavailable");
    el.setText(t("pdfPlusUnavailable"));
    return Promise.resolve();
  }
  let active = true;
  component.register(() => { active = false; });
  return MarkdownRenderer.render(app, embed.raw, el, sourcePath, component).then(() => active ? waitForImage(el, component, sized) : undefined);
}

function waitForImage(el: HTMLElement, component: Component, sized: (size: { width: number; height: number }) => void): Promise<void> {
  return new Promise(resolve => {
    const win = el.win as Window & typeof window;
    const observer = new win.MutationObserver(check);
    const timer = win.setTimeout(finish, RENDER_TIMEOUT);
    let finished = false, image: HTMLImageElement | null = null;
    function finish(): void {
      if (finished) return;
      finished = true;
      observer.disconnect();
      win.clearTimeout(timer);
      image?.removeEventListener("load", check);
      image?.removeEventListener("error", finish);
      resolve();
    }
    function check(): void {
      const current = el.querySelector("img");
      if (current !== image) {
        image?.removeEventListener("load", check);
        image?.removeEventListener("error", finish);
        image = current;
        image?.addEventListener("load", check);
        image?.addEventListener("error", finish);
      }
      if (!image?.complete || image.naturalWidth === 0) return;
      sized({ width: image.naturalWidth, height: image.naturalHeight });
      finish();
    }
    observer.observe(el, { childList: true, subtree: true });
    component.register(finish);
    check();
  });
}
