/** Keep native player gestures out of the surrounding note editor without cancelling playback. */
export function isolateMediaControls(media: EventTarget): void {
  const stop = (event: Event): void => event.stopPropagation();
  for (const name of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "dblclick", "keydown", "keyup"]) {
    media.addEventListener(name, stop);
  }
}
