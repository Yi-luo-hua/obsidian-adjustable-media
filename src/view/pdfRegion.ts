import { MarkdownRenderer, type App, type Component } from "obsidian";

import type { V2Embed } from "../format/v2.ts";
import { t } from "./messages.ts";

/** How long a layout waits for PDF++ to draw a region before counting it as drawn (export waits on it). */
const RENDER_TIMEOUT = 10000;
// Native PDF embeds may fail without emitting an image or reporting an error to MarkdownRenderer.
const LIVE_QUEUE_WAIT = 1000;
const liveQueues = new WeakMap<Window, Promise<void>>();

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
  sized: (size: { width: number; height: number }) => void, defer = false): Promise<void> {
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
  const draw = async (): Promise<void> => {
    await MarkdownRenderer.render(app, embed.raw, el, sourcePath, component);
    if (active) await waitForImage(el, component, sized);
  };
  return defer ? drawWhenVisible(el, component, draw) : draw();
}

/** PDF++ rasterizes and encodes each crop on the UI thread. Keep overscan and concurrent crops out of that work. */
function drawWhenVisible(el: HTMLElement, component: Component, draw: () => Promise<void>): Promise<void> {
  const win = el.win as Window & typeof window;
  let visible = false, queued = false, disposed = false;
  let release: (() => void) | undefined;
  return new Promise((resolve, reject) => {
    const observer = new win.IntersectionObserver(entries => {
      visible = entries.at(-1)?.isIntersecting ?? false;
      if (!visible || queued) return;
      queued = true;
      const task = (liveQueues.get(win) ?? Promise.resolve())
        .then(() => new Promise<void>(ready => win.setTimeout(ready, 0)))
        .then(() => {
          queued = false;
          if (disposed || !visible) return;
          observer.disconnect();
          return new Promise<void>(next => {
            // Release the queue even if the embed never finishes. A late image can still correct its size.
            const timer = win.setTimeout(next, LIVE_QUEUE_WAIT);
            const advance = (): void => { win.clearTimeout(timer); next(); };
            release = advance;
            void draw().then(resolve, reject).then(advance);
          });
        });
      liveQueues.set(win, task.catch(reject));
    });
    observer.observe(el);
    component.register(() => {
      disposed = true;
      observer.disconnect();
      release?.();
      resolve();
    });
  });
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
