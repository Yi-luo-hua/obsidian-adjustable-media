import assert from "node:assert/strict";
import { test } from "node:test";
import { isolateMediaControls } from "../src/view/mediaControls.ts";

test("native player input stays in the player and retains its default action", () => {
  const listeners = new Map<string, EventListenerOrEventListenerObject>();
  isolateMediaControls({ addEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    listeners.set(name, listener);
  } } as EventTarget);
  for (const name of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "dblclick", "keydown", "keyup"]) {
    const event = new Event(name, { bubbles: true, cancelable: true });
    let stopped = false;
    event.stopPropagation = () => { stopped = true; };
    (listeners.get(name) as EventListener)(event);
    assert.equal(stopped, true, name);
    assert.equal(event.defaultPrevented, false, `${name} must allow playback, seeking and keyboard control`);
  }
  assert.equal(listeners.has("touchmove"), false, "scroll gestures retain their native path");
  assert.equal(listeners.has("contextmenu"), false, "the layout media menu remains available");
});
