import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";

async function harness() {
  const events = new Map<string, (event: unknown) => void>();
  const cleanups: Array<() => void> = [];
  let mobile = true;
  let box = { left: 100, right: 300, top: 100, bottom: 300, width: 200, height: 200 };
  let inPane = true;
  const attributes = new Map<string, string>();
  const pane = { getBoundingClientRect: () => ({ left: 0, right: 400, top: 50, bottom: 700 }),
    querySelectorAll: () => [{ getBoundingClientRect: () => box }],
    getAttribute: (key: string) => attributes.get(key) ?? null,
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    removeAttribute: (key: string) => attributes.delete(key) };
  const target = { closest: () => inPane ? pane : null };
  const doc = { body: { hasClass: () => mobile } };
  const adapter = await mockedModule<{ registerLayoutTouch(plugin: unknown): void }>(new URL("../src/view/layoutTouch.ts", import.meta.url), {
    "./windows.ts": { onEveryDocument: (_plugin: unknown, callback: (doc: unknown) => void) => callback(doc), eventElement: () => target },
  });
  adapter.registerLayoutTouch({ registerDomEvent: (_doc: unknown, name: string, callback: (event: unknown) => void, options: { capture: boolean; passive: boolean }) => {
    assert.equal(options.capture, true);
    assert.equal(options.passive, true);
    events.set(name, callback);
  }, register: (cleanup: () => void) => cleanups.push(cleanup) });
  return { attributes,
    start(x: number, y: number, count = 1) { events.get("touchstart")!({ touches: Array.from({ length: count }, () => ({ clientX: x, clientY: y })) }); },
    end(name = "touchend", count = 0) { events.get(name)!({ touches: Array.from({ length: count }) }); },
    mobile(value: boolean) { mobile = value; },
    inPane(value: boolean) { inPane = value; },
    hidden() { box = { ...box, width: 0, height: 0 }; },
    unload() { cleanups.forEach(cleanup => cleanup()); },
  };
}

test("a layout blocks sidebar swipes across its whole horizontal band, including the margin", async () => {
  const host = await harness();
  host.start(5, 200);
  assert.equal(host.attributes.get("data-ignore-swipe"), "true");
  host.end();
  assert.equal(host.attributes.has("data-ignore-swipe"), false);
  host.start(395, 200);
  assert.equal(host.attributes.get("data-ignore-swipe"), "true");
  host.end("touchcancel");
  assert.equal(host.attributes.size, 0);
});

test("unoccupied bands and other panes keep native sidebar gestures", async () => {
  const host = await harness();
  for (const [x, y] of [[5, 80], [5, 350], [-1, 200], [401, 200]]) {
    host.start(x, y); assert.equal(host.attributes.size, 0);
  }
  host.inPane(false); host.start(5, 200); assert.equal(host.attributes.size, 0);
});

test("desktop, hidden layouts and multiple initial touches do not acquire a swipe", async () => {
  const host = await harness();
  host.mobile(false); host.start(5, 200); assert.equal(host.attributes.size, 0);
  host.mobile(true); host.start(5, 200, 2); assert.equal(host.attributes.size, 0);
  host.hidden(); host.start(5, 200); assert.equal(host.attributes.size, 0);
});

test("ending the gesture or unloading restores an existing host attribute exactly", async () => {
  const host = await harness();
  host.attributes.set("data-ignore-swipe", "original");
  host.start(5, 200); host.end("touchend", 1);
  assert.equal(host.attributes.get("data-ignore-swipe"), "true");
  host.end(); assert.equal(host.attributes.get("data-ignore-swipe"), "original");
  host.start(5, 200); host.unload();
  assert.equal(host.attributes.get("data-ignore-swipe"), "original");
});
