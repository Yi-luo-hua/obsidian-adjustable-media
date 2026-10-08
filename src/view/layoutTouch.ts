import type { Plugin } from "obsidian";
import { eventElement, onEveryDocument } from "./windows.ts";

/** Obsidian's mobile swipe handler respects data-ignore-swipe on a starting target's ancestors. */
export function registerLayoutTouch(plugin: Plugin): void {
  onEveryDocument(plugin, doc => {
    let restore = (): void => {};
    plugin.registerDomEvent(doc, "touchstart", event => {
      if (!doc.body.hasClass("is-mobile") || event.touches.length !== 1) return;
      restore();
      const target = eventElement(event);
      const pane = target?.closest<HTMLElement>(".markdown-source-view, .markdown-preview-view");
      if (!target || !pane) return;
      const touch = event.touches[0];
      const viewport = pane.getBoundingClientRect();
      if (touch.clientX < viewport.left || touch.clientX > viewport.right
        || touch.clientY < viewport.top || touch.clientY > viewport.bottom) return;
      const occupied = Array.from(pane.querySelectorAll<HTMLElement>(".vml-layout, .vml-frame__move, .vml-frame__handle"))
        .some(el => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.right > viewport.left && box.left < viewport.right
            && touch.clientY >= box.top && touch.clientY <= box.bottom;
        });
      if (!occupied) return;
      const previous = pane.getAttribute("data-ignore-swipe");
      pane.setAttribute("data-ignore-swipe", "true");
      restore = () => {
        if (previous === null) pane.removeAttribute("data-ignore-swipe");
        else pane.setAttribute("data-ignore-swipe", previous);
        restore = () => {};
      };
    }, { capture: true, passive: true });
    const end = (event: TouchEvent): void => { if (event.touches.length === 0) restore(); };
    plugin.registerDomEvent(doc, "touchend", end, { capture: true, passive: true });
    plugin.registerDomEvent(doc, "touchcancel", end, { capture: true, passive: true });
    plugin.register(() => restore());
  });
}
