import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";

async function harness() {
  const listeners = new Map<string, (event: unknown) => void>();
  let registrations = 0;
  const el = { addEventListener(name: string, handler: (event: unknown) => void, options?: { passive: boolean }) {
    registrations++; listeners.set(name, handler);
    if (name === "touchstart" || name === "touchmove") assert.equal(options?.passive, true);
    if (name === "touchend") assert.equal(options?.passive, false);
  } };
  const module = await mockedModule<{ guardWidgetWhitespace(el: unknown): void }>(new URL("../src/view/widgetWhitespace.ts", import.meta.url), {
    "./windows.ts": { eventElement: (event: { target: object }) => event.target },
  });
  module.guardWidgetWhitespace(el);
  return { again: () => module.guardWidgetWhitespace(el), count: () => registrations,
    fire(name: string, x = 20, y = 20, content = false, count = name === "touchend" ? 0 : 1, button = 0) {
      const touch = { identifier: 1, clientX: x, clientY: y };
      let prevented = false, stopped = false;
      listeners.get(name)!({ button, target: { closest: () => content ? {} : null },
        touches: Array.from({ length: count }, () => touch), changedTouches: [touch],
        preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
      return prevented && stopped;
    } };
}

test("wrapper side gaps and frame gaps suppress native mouse and touch caret placement", async () => {
  const host = await harness();
  assert.equal(host.fire("mousedown"), true);
  assert.equal(host.fire("click"), true);
  assert.equal(host.fire("mousedown", 20, 20, false, 1, 2), false);
  assert.equal(host.fire("touchstart"), false);
  assert.equal(host.fire("touchend", 22, 21), true);
  const count = host.count(); host.again(); assert.equal(host.count(), count, "redrawing reuses the guard");
});

test("scrolling through whitespace, even back to its starting point, stays native", async () => {
  const host = await harness();
  host.fire("touchstart"); assert.equal(host.fire("touchmove", 20, 50), false);
  host.fire("touchmove"); assert.equal(host.fire("touchend"), false);
  host.fire("touchstart"); host.fire("touchcancel"); assert.equal(host.fire("touchend"), false);
  host.fire("touchstart"); host.fire("touchmove", 20, 20, false, 2); assert.equal(host.fire("touchend"), false);
});

test("text selection, text editing, media controls and explicit actions retain native input", async () => {
  const host = await harness();
  for (const name of ["mousedown", "click", "touchstart", "touchend"]) assert.equal(host.fire(name, 20, 20, true), false);
  host.fire("touchstart"); assert.equal(host.fire("touchend", 20, 20, true), false);
});
