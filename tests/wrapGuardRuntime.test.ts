import assert from "node:assert/strict";
import { test } from "node:test";
import * as stateApi from "@codemirror/state";
import * as viewApi from "@codemirror/view";
import * as model from "../src/layout/model.ts";
import * as gaps from "../src/layout/wrapGaps.ts";
import * as budget from "../src/layout/convergenceBudget.ts";
import { findV2Blocks } from "../src/format/v2.ts";
import { mockedModule } from "./support/mockedModule.ts";

test("a ready stand-in finishes an anchor's pending Markdown measurement after it leaves the viewport", async () => {
  let ready = true;
  const info = stateApi.StateField.define({ create: () => ({}), update: value => value });
  const module = await mockedModule<{ wrapGuard(source: unknown): unknown[] }>(new URL("../src/view/wrapGuard.ts", import.meta.url), {
    obsidian: { editorInfoField: info }, "@codemirror/state": stateApi,
    "@codemirror/view": { ...viewApi, ViewPlugin: { define: (create: unknown) => create } },
    "../layout/model.ts": model, "../layout/wrapGaps.ts": gaps, "../layout/convergenceBudget.ts": budget, "./layoutView.ts": { layoutIsRendered: () => ready },
  }, { queueMicrotask });
  const doc = '<!-- vml {"v":2,"type":"text","wrap":"right"} -->\nText\n<!-- /vml -->\nBody';
  const block = findV2Blocks(doc.split("\n"))[0];
  const anchor = { from: 0, to: 70, key: "runtime:1", id: "runtime", skip: 0, numbers: "", block };
  const source = { anchors: () => [anchor], hasWraps: () => true, environmentEpoch: () => 0 };
  class Observer { observe() {} disconnect() {} }
  const view = { state: stateApi.EditorState.create({ doc }), viewport: { from: 71, to: doc.length },
    dom: { win: { ResizeObserver: Observer } }, defaultLineHeight: 20, requestMeasure() {}, dispatch() {},
    lineBlockAt: () => ({ from: 71, to: doc.length, top: 0, height: 20, type: viewApi.BlockType.Text }) };
  type Guard = {
    sizes: Map<string, gaps.FloatSize>;
    pendingMedia: Set<string>;
    pendingUpdate: boolean;
    measurementsReady(): boolean;
    measureStandIn(anchors: unknown[], host: unknown, layout: unknown): void;
    destroy(): void;
  };
  const create = module.wrapGuard(source)[2] as (view: unknown) => Guard;
  const guard = create(view);
  guard.pendingUpdate = false;
  guard.sizes.set(anchor.key, { refPos: 71, refOffset: 0, side: "right", layoutTop: 0, layoutHeight: 100,
    width: 200, margin: 0, marginBottom: 0, marginTop: 0 });
  guard.pendingMedia.add(anchor.key);
  const layout = { querySelectorAll: () => [], getBoundingClientRect: () => ({ width: 200, height: 300 }), hasClass: () => true };
  const host = { dataset: { key: anchor.key } };
  assert.equal(guard.measurementsReady(), false);
  guard.measureStandIn([anchor], host, layout);
  assert.equal(guard.measurementsReady(), true);
  assert.equal(guard.sizes.get(anchor.key)!.layoutHeight, 300);
  ready = false;
  guard.measureStandIn([anchor], host, layout);
  assert.equal(guard.measurementsReady(), false);
  ready = true;
  guard.measureStandIn([anchor], host, layout);
  assert.equal(guard.measurementsReady(), true);
  guard.destroy();
});

test("an unseen float waits for rendered nonzero geometry and releases its read-only renderer", async () => {
  let ready = false, measurable = false, released = 0;
  const info = stateApi.StateField.define({ create: () => ({ file: { path: "test.md" } }), update: value => value });
  const style = { paddingLeft: "24", paddingRight: "24", fontFamily: "test font", fontSize: "16px", lineHeight: "20px",
    fontWeight: "400", letterSpacing: "0px", direction: "ltr", marginLeft: "12px", marginRight: "12px", marginTop: "0px", marginBottom: "0px" };
  const module = await mockedModule<{ wrapGuard(source: unknown): unknown[] }>(new URL("../src/view/wrapGuard.ts", import.meta.url), {
    obsidian: { editorInfoField: info }, "@codemirror/state": stateApi,
    "@codemirror/view": { ...viewApi, ViewPlugin: { define: (create: unknown) => create } },
    "../layout/model.ts": model, "../layout/wrapGaps.ts": gaps, "../layout/convergenceBudget.ts": budget,
    "./layoutView.ts": { layoutIsRendered: () => ready },
  }, { queueMicrotask, getComputedStyle: () => style });
  const doc = '<!-- vml {"v":2,"type":"text","wrap":"right"} -->\nText\n<!-- /vml -->\nBody';
  const block = findV2Blocks(doc.split("\n"))[0], from = doc.indexOf("Body");
  const anchor = { from: 0, to: from - 1, key: "unseen:1", id: "unseen", skip: 0, numbers: "", block };
  const props: Record<string, string> = {}, listeners = new Map<string, () => void>();
  const layout = { querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, width: measurable ? parseFloat(props["--vml-measure-width"]) * 0.4 : 0, height: 300 }) };
  const el = { setCssProps: (next: Record<string, string>) => Object.assign(props, next), querySelector: () => layout,
    getBoundingClientRect: () => ({ top: 0 }), addEventListener: (name: string, listener: () => void) => listeners.set(name, listener), remove() {} };
  const body = { hasClass: () => false, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, height: 20 }) };
  class Observer { observe() {} disconnect() {} }
  let request!: { read(): unknown; write(value: unknown): void };
  const view = { state: stateApi.EditorState.create({ doc, extensions: info, selection: { anchor: doc.length } }), viewport: { from, to: doc.length }, documentTop: 0,
    dom: { win: { ResizeObserver: Observer } }, scrollDOM: { createDiv: () => el }, defaultLineHeight: 20,
    contentDOM: { clientWidth: 397, querySelectorAll: () => [body], contains: () => true },
    requestMeasure(next: typeof request) { request = next; }, dispatch() {}, posAtDOM: () => from,
    lineBlockAt: (pos: number) => ({ from: pos, to: doc.length, top: 0, height: 20, type: viewApi.BlockType.Text }),
    lineBlockAtHeight: () => ({ from: 0, top: 0 }) };
  let path = "";
  const source = { anchors: () => [anchor], hasWraps: () => true, environmentEpoch: () => 0,
    drawMeasurement(_el: unknown, _view: unknown, _anchor: unknown, sourcePath: string) { path = sourcePath; },
    releaseStandIn() { released++; } };
  type Guard = { measurementsReady(): boolean; sizes: Map<string, gaps.FloatSize>; mediaChanged(): void; destroy(): void };
  const guard = (module.wrapGuard(source)[2] as (view: unknown) => Guard)(view);
  const flush = async (): Promise<void> => { request.write(request.read()); await new Promise(resolve => setImmediate(resolve)); };
  await flush(); await flush();
  assert.equal(path, "test.md");
  assert.equal(props["--vml-measure-width"], "349px");
  assert.equal(guard.measurementsReady(), false);
  assert.equal(guard.sizes.size, 0);
  ready = true; listeners.get("vml-layout-rendered")!(); await flush();
  assert.equal(guard.measurementsReady(), false, "rendered at zero width is not an observed size");
  assert.equal(guard.sizes.size, 0);
  measurable = true; guard.mediaChanged(); await flush();
  assert.equal(guard.measurementsReady(), true);
  assert.equal(guard.sizes.get(anchor.key)?.layoutHeight, 300);
  assert.equal(guard.sizes.get(anchor.key)?.width, 139.6);
  guard.mediaChanged();
  assert.equal(released, 1);
  guard.destroy(); assert.equal(released, 1);
});
