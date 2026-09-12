export interface PointerHandlers {
  onMove(event: PointerEvent): void;
  onEnd(event: PointerEvent): void;
  /** The gesture was interrupted (pointercancel, lost capture, Escape, a native drag): undo any preview. */
  onCancel(): void;
}

/**
 * Follows one pointer gesture that started with `start` on `target`. It always ends exactly once,
 * including when the system cancels the gesture. No text gets selected while it lasts: in live
 * preview a selection reaching a layout would show its source in place of the drop target.
 *
 * Moves and releases are heard on the document: with pointer capture they are retargeted to
 * `target` and bubble up; without it (the pointer was already released) nothing is missed either.
 * Two things would otherwise leave a gesture hanging, following the pointer with no button held:
 * a native drag that takes over (the browser then sends no pointerup), and a release the document
 * never heard. Either one cancels the gesture.
 */
export function trackPointer(target: HTMLElement, start: PointerEvent, handlers: PointerHandlers): void {
  const doc = target.ownerDocument;
  let finished = false;

  const finish = (ended: PointerEvent | null): void => {
    if (finished) {
      return;
    }
    finished = true;
    doc.removeEventListener("pointermove", onMove);
    doc.removeEventListener("pointerup", onUp);
    doc.removeEventListener("pointercancel", onCancel);
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("selectstart", onSelectStart, true);
    doc.removeEventListener("dragstart", onDragStart);
    target.removeEventListener("lostpointercapture", onCancel);
    if (target.hasPointerCapture(start.pointerId)) {
      target.releasePointerCapture(start.pointerId);
    }
    if (ended) {
      handlers.onEnd(ended);
    } else {
      handlers.onCancel();
    }
  };

  const onMove = (event: PointerEvent): void => {
    if (event.pointerId !== start.pointerId) {
      return;
    }
    // A mouse moving with no button held has been released without us hearing it.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      finish(null);
      return;
    }
    handlers.onMove(event);
  };
  const onUp = (event: PointerEvent): void => {
    if (event.pointerId === start.pointerId) {
      finish(event);
    }
  };
  const onCancel = (event: PointerEvent): void => {
    if (event.pointerId === start.pointerId) {
      finish(null);
    }
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    }
  };
  const onSelectStart = (event: Event): void => {
    event.preventDefault();
  };
  const onDragStart = (event: DragEvent): void => {
    if (!event.defaultPrevented) {
      finish(null);
    }
  };

  try {
    target.setPointerCapture(start.pointerId);
  } catch {
    // The pointer is already gone; the document listeners still see the rest of the gesture.
  }
  doc.addEventListener("pointermove", onMove);
  doc.addEventListener("pointerup", onUp);
  doc.addEventListener("pointercancel", onCancel);
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("selectstart", onSelectStart, true);
  doc.addEventListener("dragstart", onDragStart);
  target.addEventListener("lostpointercapture", onCancel);
}
