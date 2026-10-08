import assert from "node:assert/strict";
import { test } from "node:test";
import * as format from "../src/format/v2.ts";
import * as model from "../src/layout/model.ts";
import * as projections from "../src/layout/viewProjection.ts";
import { mockedModule } from "./support/mockedModule.ts";

test("media completion requests local measurements without changing the pane environment", async () => {
  const listeners = new Map<string, (event: { target: object }) => void>();
  const frames = new Map<number, () => void>();
  const fonts = new Map<string, () => void>();
  let sequence = 0, environments = 0, mediaUpdates = 0, layoutUpdates = 0;
  class ImageStub { currentSrc = "image.png"; src = "image.png"; naturalWidth = 320; naturalHeight = 240; }
  class VideoStub {}
  class Observer { observe(): void {} disconnect(): void {} }
  const win = { HTMLImageElement: ImageStub, HTMLVideoElement: VideoStub, ResizeObserver: Observer, MutationObserver: Observer,
    devicePixelRatio: 1, getComputedStyle: () => ({ fontSize: "16px" }),
    requestAnimationFrame(callback: () => void) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id: number) { frames.delete(id); }, addEventListener() {}, removeEventListener() {} };
  const el = { win, doc: { body: { className: "" }, documentElement: { className: "" },
    fonts: { addEventListener(name: string, callback: () => void) { fonts.set(name, callback); }, removeEventListener(name: string) { fonts.delete(name); } } },
    clientWidth: 720, isConnected: true,
    addEventListener(name: string, callback: (event: { target: object }) => void) { listeners.set(name, callback); },
    removeEventListener(name: string) { listeners.delete(name); } };
  const module = await mockedModule<{ watchEnvironment(el: unknown, changed: () => void, media: () => void, layout: () => void): () => void }>(new URL("../src/view/viewEnvironment.ts", import.meta.url), {});
  const stop = module.watchEnvironment(el, () => environments++, () => mediaUpdates++, () => layoutUpdates++);
  const flush = (): void => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  flush();
  assert.equal(environments, 1);
  for (let index = 0; index < 10; index++) { listeners.get("load")!({ target: new ImageStub() }); flush(); }
  assert.equal(mediaUpdates, 10);
  assert.equal(environments, 1);
  const image = new ImageStub();
  listeners.get("load")!({ target: image }); listeners.get("load")!({ target: image });
  assert.equal(mediaUpdates, 11);
  listeners.get("vml-layout-rendered")!({ target: {} });
  assert.equal(layoutUpdates, 1);
  assert.equal(environments, 1, "completed Markdown only wakes measurement; it does not discard dimensions");
  fonts.get("loading")!(); flush();
  assert.equal(environments, 2);
  fonts.get("loadingdone")!(); flush();
  assert.equal(environments, 3);
  stop();
  assert.equal(listeners.size, 0);
  assert.equal(fonts.size, 0);
});

test("drag and focus classes on the page are not an environment change; a theme class is", async () => {
  const frames = new Map<number, () => void>();
  const mutations: Array<() => void> = [];
  let sequence = 0, environments = 0;
  class Observer { observe(): void {} disconnect(): void {} }
  class Mutations extends Observer { constructor(callback: () => void) { super(); mutations.push(callback); } }
  const body = { className: "theme-dark" };
  const win = { HTMLImageElement: class {}, HTMLVideoElement: class {}, ResizeObserver: Observer, MutationObserver: Mutations,
    devicePixelRatio: 1, getComputedStyle: () => ({ fontSize: "16px" }),
    requestAnimationFrame(callback: () => void) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id: number) { frames.delete(id); }, addEventListener() {}, removeEventListener() {} };
  const el = { win, doc: { body, documentElement: { className: "" }, fonts: { addEventListener() {}, removeEventListener() {} } },
    clientWidth: 720, isConnected: true, addEventListener() {}, removeEventListener() {} };
  const module = await mockedModule<{ watchEnvironment(el: unknown, changed: () => void): () => void; layoutClasses(className: string): string }>(
    new URL("../src/view/viewEnvironment.ts", import.meta.url), {});
  const stop = module.watchEnvironment(el, () => environments++);
  const flush = (): void => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  const setBody = (className: string): void => { body.className = className; mutations.forEach(callback => callback()); flush(); };
  flush();
  assert.equal(environments, 1);
  setBody("theme-dark vml-is-dragging");
  setBody("theme-dark vml-is-dragging is-grabbing is-focused");
  setBody("theme-dark");
  assert.equal(environments, 1);
  for (let index = 0; index < 20; index++) setBody(index % 2 ? "theme-dark" : "theme-dark keyboard-animating");
  assert.equal(environments, 1, "mobile keyboard animation must not clear float dimensions in a feedback loop");
  for (let index = 0; index < 20; index++) setBody(index % 2 ? "theme-dark" : "theme-dark is-hidden-nav keyboard-animating");
  assert.equal(environments, 1, "overlay navigation must not rebuild loaded video widgets during touch scrolling");
  for (let index = 0; index < 20; index++) setBody(index % 2 ? "theme-dark" : "theme-dark hide-cursor");
  assert.equal(environments, 1, "touch cursor hiding is not a media measurement change");
  for (let index = 0; index < 20; index++) setBody(index % 2 ? "theme-dark" : "theme-dark mod-toolbar-open");
  assert.equal(environments, 1, "mobile input toolbar visibility does not replace the player");
  setBody("theme-light");
  assert.equal(environments, 2);
  assert.equal(module.layoutClasses("  b vml-x a is-grabbing "), "a b");
  stop();
});

test("Markdown completion wakes its pane after installing rendered or failed state", async () => {
  for (const outcome of ["rendered", "failed"]) {
  const notifications: Array<{ type: string; state: string }> = [];
  let renderState: (root: object) => string;
  class ElementStub {
    win = { Event };
    createDiv() { return new ElementStub(); }
    toggleClass(): void {} addClass(): void {} setCssProps(): void {}
    querySelectorAll() { return []; }
    dispatchEvent(event: Event): boolean { notifications.push({ type: event.type, state: renderState(this) }); return true; }
  }
  const errors: unknown[] = [];
  let reject!: (error: Error) => void;
  let resolve!: () => void;
  const rendering = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  const module = await mockedModule<{ renderLayout(el: unknown, options: unknown): object; layoutRenderState(root: object): string; layoutIsRendered(root: object): boolean }>(new URL("../src/view/layoutView.ts", import.meta.url), {
    obsidian: { MarkdownRenderer: { render: () => rendering } }, "../format/v2.ts": format, "../layout/model.ts": model, "../layout/viewProjection.ts": projections,
    "./crossrefView.ts": { numbered: (text: string) => text, markCaptions() {} }, "./media.ts": {}, "./mediaControls.ts": {}, "./messages.ts": {},
  }, { console: { error: (...args: unknown[]) => errors.push(args) } });
  renderState = root => module.layoutRenderState(root);
  const block = format.findV2Blocks(['<!-- vml {"v":2,"type":"text"} -->', 'Text', '<!-- /vml -->'])[0];
  const root = module.renderLayout(new ElementStub(), { app: {}, sourcePath: "note.md", model: model.modelFromBlock(block), editable: false, warning: null, component: {} });
  assert.equal(module.layoutRenderState(root), "pending");
  assert.equal(notifications.length, 0);
  if (outcome === "failed") reject(new Error("Markdown rejected")); else resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(module.layoutRenderState(root), outcome);
  assert.equal(module.layoutIsRendered(root), outcome === "rendered");
  assert.equal(errors.length, outcome === "failed" ? 1 : 0);
  assert.deepEqual(notifications, [{ type: "vml-layout-rendered", state: outcome }]);
  }
});
