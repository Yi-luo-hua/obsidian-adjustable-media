import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";

interface WindowsModule {
  onEveryDocument: (plugin: unknown, watch: (doc: object) => void) => void;
  eventElement: (event: unknown) => object | null;
}

class ElementStub {}
const main = { name: "main" };
const load = (): Promise<WindowsModule> => mockedModule<WindowsModule>(new URL("../src/view/windows.ts", import.meta.url), {},
  { document: main, Element: ElementStub });

test("listeners go on the main window and on every pop-out window once", async () => {
  const { onEveryDocument } = await load();
  const popout = { name: "popout" };
  const later = { name: "later" };
  let opened: ((win: { doc: object }) => void) | null = null;
  let ready: (() => void) | null = null;
  const plugin = {
    registerEvent() {},
    app: { workspace: {
      on(name: string, callback: (win: { doc: object }) => void) { assert.equal(name, "window-open"); opened = callback; return {}; },
      onLayoutReady(callback: () => void) { ready = callback; },
      // Two leaves in the main window and one in a pop-out window that was open before the plugin loaded.
      iterateAllLeaves(callback: (leaf: unknown) => void) {
        for (const doc of [main, main, popout]) callback({ view: { containerEl: { doc } } });
      },
    } },
  };
  const watched: object[] = [];
  onEveryDocument(plugin, (doc) => watched.push(doc));
  assert.deepEqual(watched, [main]);
  ready!();
  assert.deepEqual(watched, [main, popout]);
  opened!({ doc: later });
  opened!({ doc: popout });
  assert.deepEqual(watched, [main, popout, later]);
});

test("an event's element is found in any window, by Obsidian's cross-window check", async () => {
  const { eventElement } = await load();
  // A pop-out window's element is no instance of the main window's Element; instanceOf knows it is one.
  const element = { instanceOf: (type: unknown) => type === ElementStub };
  const text = { instanceOf: () => false };

  assert.equal(eventElement({ targetNode: element }), element);
  assert.equal(eventElement({ targetNode: text }), null);
  assert.equal(eventElement({ targetNode: null }), null);
});
