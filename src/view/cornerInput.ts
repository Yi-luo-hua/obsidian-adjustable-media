import type { Plugin } from "obsidian";
import { eventElement, onEveryDocument } from "./windows.ts";

/** A finger missing the resize button must not open the nearby text editor. */
const INPUT_MARGIN = 64;

export function registerCornerInputGuard(plugin: Plugin): void {
  onEveryDocument(plugin, doc => {
    let pointer: number | null = null;
    let pendingClick = false;
    const blocked = (target: Element, x: number, y: number): boolean => {
      if (target.closest(".vml-handle, button, a, video, audio")) return false;
      const pane = target.closest<HTMLElement>(".markdown-source-view");
      if (!pane) return false;
      const viewport = pane.getBoundingClientRect();
      return Array.from(pane.querySelectorAll<HTMLElement>(".vml-frame__handle--corner")).some(handle => {
        const box = handle.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.right > viewport.left && box.left < viewport.right
          && box.bottom > viewport.top && box.top < viewport.bottom
          && x >= box.left - INPUT_MARGIN && x <= box.right + INPUT_MARGIN
          && y >= box.top - INPUT_MARGIN && y <= box.bottom + INPUT_MARGIN;
      });
    };
    const stop = (event: Event): void => { event.preventDefault(); event.stopPropagation(); };
    plugin.registerDomEvent(doc, "pointerdown", event => {
      pointer = null; pendingClick = false;
      if (!doc.body.hasClass("is-mobile")) return;
      const target = eventElement(event);
      if (!target) return;
      if (target.closest(".vml-frame__handle--corner")) { pointer = event.pointerId; return; }
      if (blocked(target, event.clientX, event.clientY)) stop(event);
    }, { capture: true });
    plugin.registerDomEvent(doc, "touchstart", event => {
      if (!doc.body.hasClass("is-mobile") || event.touches.length !== 1) return;
      const target = eventElement(event), touch = event.touches[0];
      if (target && blocked(target, touch.clientX, touch.clientY)) stop(event);
    }, { capture: true, passive: false });
    plugin.registerDomEvent(doc, "pointerup", event => {
      if (event.pointerId === pointer) { pointer = null; pendingClick = true; }
    }, { capture: true });
    plugin.registerDomEvent(doc, "pointercancel", event => {
      if (event.pointerId === pointer) { pointer = null; pendingClick = false; }
    }, { capture: true });
    plugin.registerDomEvent(doc, "click", event => {
      if (!doc.body.hasClass("is-mobile") || (event.detail === 0 && event.clientX === 0 && event.clientY === 0)) return;
      if (pendingClick) { pendingClick = false; stop(event); return; }
      const target = eventElement(event);
      if (target && blocked(target, event.clientX, event.clientY)) stop(event);
    }, { capture: true });
  });
}
