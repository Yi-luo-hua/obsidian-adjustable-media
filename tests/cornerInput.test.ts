import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";

async function harness() {
  const listeners = new Map<string, (event: unknown) => void>();
  let mobile = true, actualHandle = false, explicitControl = false, inPane = true;
  let box = { left: 300, right: 344, top: 200, bottom: 244, width: 44, height: 44 };
  const pane = { getBoundingClientRect: () => ({ left: 0, right: 400, top: 0, bottom: 700 }),
    querySelectorAll: () => [{ getBoundingClientRect: () => box }] };
  const target = { closest(selector: string) {
    if (selector === ".vml-frame__handle--corner") return actualHandle ? {} : null;
    if (selector === ".vml-handle, button, a, video, audio") return actualHandle || explicitControl ? {} : null;
    return inPane ? pane : null;
  } };
  const module = await mockedModule<{ registerCornerInputGuard(plugin: unknown): void }>(new URL("../src/view/cornerInput.ts", import.meta.url), {
    "./windows.ts": { onEveryDocument: (_plugin: unknown, callback: (doc: unknown) => void) => callback({ body: { hasClass: () => mobile } }), eventElement: () => target },
  });
  module.registerCornerInputGuard({ registerDomEvent(_doc: unknown, name: string, listener: (event: unknown) => void, options: { capture: boolean }) {
    assert.equal(options.capture, true); listeners.set(name, listener);
  } });
  return {
    fire(name: string, x = 340, y = 290, detail = 1) {
      let prevented = false, stopped = false;
      listeners.get(name)!({ clientX: x, clientY: y, pointerId: 7, detail,
        touches: [{ clientX: x, clientY: y }], preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
      return prevented && stopped;
    },
    handle(value: boolean) { actualHandle = value; }, control(value: boolean) { explicitControl = value; },
    mobile(value: boolean) { mobile = value; }, inPane(value: boolean) { inPane = value; },
    mirrored() { box = { ...box, left: 10, right: 54 }; },
    offscreen() { box = { ...box, top: 900, bottom: 944 }; },
  };
}

test("missing the corner into the next text line blocks pointer, touch and click input", async () => {
  const host = await harness();
  for (const name of ["pointerdown", "touchstart", "click"]) assert.equal(host.fire(name), true);
  assert.equal(host.fire("pointerdown", 340, 330), false, "text farther below stays editable");
  assert.equal(host.fire("pointerdown", 150, 290), false, "the rest of the same line stays editable");
});

test("the real resize button receives its gesture but the following click cannot open text", async () => {
  const host = await harness(); host.handle(true);
  assert.equal(host.fire("pointerdown"), false); assert.equal(host.fire("touchstart"), false);
  host.fire("pointerup"); host.handle(false);
  assert.equal(host.fire("click", 150, 400), true, "even a far drag endpoint belongs to the resize");
  assert.equal(host.fire("click", 150, 400), false);
});

test("a new intentional press, cancellation and keyboard activation are not swallowed", async () => {
  const host = await harness(); host.handle(true); host.fire("pointerdown"); host.fire("pointerup");
  host.handle(false); assert.equal(host.fire("pointerdown", 150, 400), false);
  assert.equal(host.fire("click", 150, 400), false);
  host.handle(true); host.fire("pointerdown"); host.fire("pointercancel"); host.handle(false);
  assert.equal(host.fire("click", 150, 400), false);
  assert.equal(host.fire("click", 0, 0, 0), false);
  assert.equal(host.fire("click", 340, 290, 0), true, "a host-synthesized touch click still has physical coordinates");
});

test("mirrored corners use their own side while other panes and offscreen corners stay untouched", async () => {
  const host = await harness(); host.mirrored();
  assert.equal(host.fire("pointerdown", 30, 290), true);
  assert.equal(host.fire("pointerdown", 340, 290), false);
  host.inPane(false); assert.equal(host.fire("pointerdown", 30, 290), false);
  host.inPane(true); host.offscreen(); assert.equal(host.fire("pointerdown", 30, 680), false);
});

test("desktop text, explicit buttons/links and native media controls keep their normal input behavior", async () => {
  const host = await harness(); host.mobile(false); assert.equal(host.fire("pointerdown"), false);
  host.mobile(true); host.control(true); assert.equal(host.fire("pointerdown"), false);
  assert.equal(host.fire("click"), false);
});
