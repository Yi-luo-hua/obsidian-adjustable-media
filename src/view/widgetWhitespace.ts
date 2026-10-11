import { eventElement } from "./windows.ts";

const guarded = new WeakSet<HTMLElement>();
const CONTENT = ".vml-layout__text, .vml-item, .vml-handle, .vml-edit-source, a, button, input, textarea, select, video, audio";
const TAP_DISTANCE = 6;

/** Empty parts of a noneditable widget must not place the outer editor's DOM caret. */
export function guardWidgetWhitespace(el: HTMLElement): void {
  if (guarded.has(el)) return;
  guarded.add(el);
  const blank = (event: UIEvent): boolean => {
    const target = eventElement(event);
    return target !== null && !target.closest(CONTENT);
  };
  const stop = (event: Event): void => { event.preventDefault(); event.stopPropagation(); };
  el.addEventListener("mousedown", event => { if (event.button === 0 && blank(event)) stop(event); });
  el.addEventListener("click", event => { if (blank(event)) stop(event); });
  let tap: { id: number; x: number; y: number } | null = null;
  el.addEventListener("touchstart", event => {
    const touch = event.touches[0];
    tap = event.touches.length === 1 && blank(event) ? { id: touch.identifier, x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true });
  el.addEventListener("touchmove", event => {
    const touch = event.touches[0];
    if (tap && (event.touches.length !== 1 || touch.identifier !== tap.id
      || Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > TAP_DISTANCE)) tap = null;
  }, { passive: true });
  el.addEventListener("touchend", event => {
    const start = tap;
    tap = null;
    const touch = event.changedTouches[0];
    if (start && event.touches.length === 0 && touch?.identifier === start.id && blank(event)
      && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) <= TAP_DISTANCE) stop(event);
  }, { passive: false });
  el.addEventListener("touchcancel", () => { tap = null; }, { passive: true });
}
