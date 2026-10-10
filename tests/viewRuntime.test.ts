import assert from "node:assert/strict";
import { test } from "node:test";
import * as format from "../src/format/v2.ts";
import * as model from "../src/layout/model.ts";
import * as projections from "../src/layout/viewProjection.ts";
import * as textColumns from "../src/markdown/textColumns.ts";
import { mockedModule } from "./support/mockedModule.ts";

test("media completion requests local measurements without changing the pane environment", async () => {
  const listeners = new Map<string, (event: { target: object }) => void>();
  const frames = new Map<number, () => void>();
  const fonts = new Map<string, () => void>();
  let sequence = 0, environments = 0, mediaUpdates = 0;
  class ImageStub { currentSrc = "image.png"; src = "image.png"; naturalWidth = 320; naturalHeight = 240; }
  class VideoStub {}
  class Observer { observe(): void {} disconnect(): void {} }
  const win = { HTMLImageElement: ImageStub, HTMLVideoElement: VideoStub, ResizeObserver: Observer, MutationObserver: Observer,
    devicePixelRatio: 1, getComputedStyle: () => ({ fontSize: "16px" }),
    requestAnimationFrame(callback: () => void) { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id: number) { frames.delete(id); }, addEventListener() {}, removeEventListener() {} };
  const el = { win, doc: { body: { className: "" }, documentElement: { className: "" },
    fonts: { addEventListener(name: string, callback: () => void) { fonts.set(name, callback); }, removeEventListener() {} } },
    clientWidth: 720, isConnected: true,
    addEventListener(name: string, callback: (event: { target: object }) => void) { listeners.set(name, callback); },
    removeEventListener(name: string) { listeners.delete(name); } };
  const module = await mockedModule<{ watchEnvironment(el: unknown, changed: () => void, media: () => void): () => void }>(new URL("../src/view/viewEnvironment.ts", import.meta.url), {});
  const stop = module.watchEnvironment(el, () => environments++, () => mediaUpdates++);
  const flush = (): void => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  flush();
  assert.equal(environments, 1);
  for (let index = 0; index < 10; index++) { listeners.get("load")!({ target: new ImageStub() }); flush(); }
  assert.equal(mediaUpdates, 10);
  assert.equal(environments, 1);
  const image = new ImageStub();
  listeners.get("load")!({ target: image }); listeners.get("load")!({ target: image });
  assert.equal(mediaUpdates, 11);
  fonts.get("loadingdone")!(); flush();
  assert.equal(environments, 2);
  stop();
  assert.equal(listeners.size, 0);
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
  setBody("theme-light");
  assert.equal(environments, 2);
  assert.equal(module.layoutClasses("  b vml-x a is-grabbing "), "a b");
  stop();
});

test("a rejected Markdown render leaves pending state without claiming a measured layout", async () => {
  class ElementStub {
    createDiv() { return new ElementStub(); }
    toggleClass(): void {} addClass(): void {} setCssProps(): void {}
    querySelectorAll() { return []; }
  }
  const errors: unknown[] = [];
  let reject!: (error: Error) => void;
  const rendering = new Promise<void>((_resolve, fail) => { reject = fail; });
  const module = await mockedModule<{ renderLayout(el: unknown, options: unknown): object; layoutRenderState(root: object): string; layoutIsRendered(root: object): boolean }>(new URL("../src/view/layoutView.ts", import.meta.url), {
    obsidian: { MarkdownRenderer: { render: () => rendering } }, "../format/v2.ts": format, "../layout/model.ts": model, "../layout/viewProjection.ts": projections,
    "../markdown/textColumns.ts": textColumns,
    "./crossrefView.ts": { numbered: (text: string) => text, markCaptions() {} }, "./media.ts": {}, "./messages.ts": {},
  }, { console: { error: (...args: unknown[]) => errors.push(args) } });
  const block = format.findV2Blocks(['<!-- vml {"v":2,"type":"text"} -->', 'Text', '<!-- /vml -->'])[0];
  const root = module.renderLayout(new ElementStub(), { app: {}, sourcePath: "note.md", model: model.modelFromBlock(block), editable: false, warning: null, component: {} });
  assert.equal(module.layoutRenderState(root), "pending");
  reject(new Error("Markdown rejected"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(module.layoutRenderState(root), "failed");
  assert.equal(module.layoutIsRendered(root), false);
  assert.equal(errors.length, 1);
});

test("Mermaid waits for deferred native drawing, stops on disposal, and exposes completed errors", async () => {
  const elements: ElementStub[] = [];
  const observers: ObserverStub[] = [];
  class ObserverStub {
    callback: () => void;
    disconnected = false;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe(): void {} disconnect(): void { this.disconnected = true; }
  }
  class ElementStub {
    classes: Set<string>;
    props: Record<string, string> = {};
    svg: { viewBox: { baseVal: { width: number; height: number } } } | null = null;
    error: string | null = null;
    win = { MutationObserver: ObserverStub };
    constructor(cls = "") { this.classes = new Set(cls.split(" ")); elements.push(this); }
    createDiv(options?: { cls?: string }) { return new ElementStub(options?.cls); }
    toggleClass(): void {} addClass(cls: string): void { this.classes.add(cls); }
    removeClass(cls: string): void { this.classes.delete(cls); }
    setCssProps(props: Record<string, string>): void { Object.assign(this.props, props); }
    querySelectorAll() { return []; }
    querySelector(selector: string) { return selector === ".mermaid > svg" ? this.svg : this.error === null ? null : { textContent: this.error }; }
  }
  const module = await mockedModule<{ renderLayout(el: unknown, options: unknown): object; layoutRenderState(root: object): string }>(new URL("../src/view/layoutView.ts", import.meta.url), {
    obsidian: { MarkdownRenderer: { render: () => Promise.resolve() } }, "../format/v2.ts": format, "../layout/model.ts": model,
    "../layout/viewProjection.ts": projections, "../markdown/textColumns.ts": textColumns,
    "./crossrefView.ts": { numbered: (text: string) => text, markCaptions() {} }, "./media.ts": {}, "./messages.ts": {},
  });
  const create = (name: string) => {
    const cleanup: Array<() => void> = [];
    const block = format.findV2Blocks(['<!-- vml {"v":3,"kind":"media"} -->', "```mermaid", `flowchart LR\nA-->${name}`, "```", "<!-- /vml -->"])[0];
    const root = module.renderLayout(new ElementStub(), { app: {}, sourcePath: "note.md", model: model.modelFromBlock(block), editable: false,
      warning: null, component: { register: (stop: () => void) => cleanup.push(stop) } });
    return { root, diagram: [...elements].reverse().find(el => el.classes.has("vml-item__diagram"))!, cleanup };
  };
  const rendered = create("B");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(module.layoutRenderState(rendered.root), "pending");
  assert.equal(rendered.diagram.classes.has("vml-item__diagram--pending"), true);
  rendered.diagram.svg = { viewBox: { baseVal: { width: 400, height: 100 } } };
  observers.at(-1)!.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(module.layoutRenderState(rendered.root), "rendered");
  assert.equal(rendered.diagram.props["--vml-natural-width"], "400px");
  assert.equal(rendered.diagram.classes.has("vml-item__diagram--pending"), false);
  const disposed = create("C");
  await new Promise(resolve => setImmediate(resolve));
  disposed.cleanup.forEach(stop => stop());
  assert.equal(observers.at(-1)!.disconnected, true);
  assert.equal(disposed.diagram.props["--vml-natural-width"], undefined);
  const failed = create("D");
  await new Promise(resolve => setImmediate(resolve));
  failed.diagram.error = "Error parsing Mermaid diagram!\n\nParse error";
  observers.at(-1)!.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(module.layoutRenderState(failed.root), "rendered");
  assert.equal(failed.diagram.classes.has("vml-item__diagram--pending"), false);
});
