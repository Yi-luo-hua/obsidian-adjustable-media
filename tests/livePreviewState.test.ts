import assert from "node:assert/strict";
import { test } from "node:test";
import * as stateApi from "@codemirror/state";
import * as viewApi from "@codemirror/view";
import * as format from "../src/format/v2.ts";
import * as edits from "../src/layout/edits.ts";
import * as snapshots from "../src/layout/documentSnapshot.ts";
import * as floatOrder from "../src/layout/floatOrder.ts";
import * as changeScan from "../src/layout/changeScan.ts";
import * as projections from "../src/layout/viewProjection.ts";
import * as model from "../src/layout/model.ts";
import * as crossref from "../src/markdown/crossref.ts";
import * as transaction from "../src/layout/editorTransaction.ts";
import * as identity from "../src/layout/blockIdentity.ts";
import { mockedModule } from "./support/mockedModule.ts";

const media = 'Intro\n\n<!-- vml -->\n![[same.png]]\n<!-- /vml -->\n\nTail';

test("an omitted editor file preserves layout identity, dimensions and originating gesture writes", async () => {
  const file = { path: "note.md" };
  const editor = {};
  const info: { editor: object; file?: typeof file } = { editor };
  const editorInfoField = stateApi.StateField.define({ create: () => info, update: value => value });
  const editorLivePreviewField = stateApi.StateField.define({ create: () => true, update: value => value });
  class MarkdownView {}
  const sourceView = Object.assign(new MarkdownView(), { file, editor, getMode: () => "source" });
  const app = { workspace: { getLeavesOfType: () => [{ view: sourceView }] } };
  const caches: projections.PaneMeasurements<number>[] = [];
  class TrackedMeasurements extends projections.PaneMeasurements<number> {
    constructor() { super(); caches.push(this); }
  }
  const obsidian = { editorInfoField, editorLivePreviewField, MarkdownView, Component: class {} };
  const live = await mockedModule<{ livePreviewExtension(app: unknown): stateApi.Extension }>(new URL("../src/view/livePreview.ts", import.meta.url), {
    obsidian, "@codemirror/state": stateApi, "@codemirror/view": viewApi,
    "../format/v2.ts": format, "../layout/edits.ts": edits, "../layout/documentSnapshot.ts": snapshots,
    "../layout/floatOrder.ts": floatOrder, "../layout/changeScan.ts": changeScan, "../layout/viewProjection.ts": { ...projections, PaneMeasurements: TrackedMeasurements },
    "../layout/model.ts": model, "../markdown/crossref.ts": crossref,
    "./blockDrag.ts": {}, "./crossrefView.ts": { refContextOf: () => undefined }, "./interactions.ts": {},
    "./layoutView.ts": {}, "./layoutHistory.ts": { layoutHistory: () => [] }, "./messages.ts": {},
    "./textEditing.ts": {}, "./wrapGuard.ts": { wrapGuard: () => [] }, "./viewEnvironment.ts": {},
    "./obsidianInternals.ts": { fileOfEditor: () => sourceView.file }, "./windows.ts": {},
  });
  let state = stateApi.EditorState.create({ doc: media, extensions: [editorInfoField, editorLivePreviewField, live.livePreviewExtension(app)] });
  const initial = snapshots.snapshotForState(state)!;
  const cache = caches[0];
  const key = cache.key(initial.blocks[0].id, 1, "720", "live");
  cache.set(key, 240);
  for (let index = 0; index < 3; index++) state = state.update({ changes: { from: state.doc.length, insert: " x" } }).state;
  const current = snapshots.snapshotForState(state)!;
  assert.equal(current.blocks[0].id, initial.blocks[0].id);
  assert.equal(current.origin.file, file);
  assert.equal(cache.environmentEpoch, 0);
  assert.equal(cache.get(key), 240);
  info.file = file;
  state = state.update({ selection: { anchor: 1 } }).state;
  delete info.file;
  state = state.update({ selection: { anchor: 0 } }).state;
  assert.equal(cache.environmentEpoch, 0);
  assert.equal(snapshots.snapshotForState(state)!.blocks[0].id, initial.blocks[0].id);

  const writer = await mockedModule<{ writeBlockEdits(app: unknown, file: object, edits: edits.BlockEdit[], options: unknown): Promise<{ ok: boolean }> }>(new URL("../src/layout/writeBack.ts", import.meta.url), {
    obsidian, "@codemirror/view": viewApi, "./edits.ts": edits, "./editorTransaction.ts": transaction,
    "./blockIdentity.ts": identity, "./documentSnapshot.ts": snapshots,
  });
  const view = { get state() { return state; }, dom: { isConnected: true },
    dispatch(spec: stateApi.TransactionSpec) { state = state.update(spec).state; }, focus() {} };
  const block = snapshots.snapshotForState(state)!.blocks[0].block;
  const edit = edits.planModelEdit(block, model.setRowHeight(model.modelFromBlock(block), 0, 300))!;
  const result = await writer.writeBlockEdits(app, file, [edit], { view });
  assert.equal(result.ok, true);
  assert.ok(state.doc.toString().includes('"height":300'));
  sourceView.editor = {};
  assert.equal((await writer.writeBlockEdits(app, file, [edit], { view })).ok, false);
});

test("a buffer without any host file retains its lineage independently of changing documents", () => {
  const buffer = {};
  const first = snapshots.editorDocumentOrigin(undefined, buffer);
  const next = snapshots.editorDocumentOrigin(undefined, buffer, first);
  assert.equal(first.file, next.file);
  assert.equal(first.branch, next.branch);
  const real = snapshots.editorDocumentOrigin({ path: "real.md" }, buffer, next);
  assert.notEqual(real.file, next.file);
});

test("a wrapped text box whose source shows still floats with its text drawn beside the source", async () => {
  const editorInfoField = stateApi.StateField.define({ create: () => ({ editor: {}, file: { path: "note.md" } }), update: value => value });
  const editorLivePreviewField = stateApi.StateField.define({ create: () => true, update: value => value });
  const loaded: string[] = [];
  class Component { load() { loaded.push("load"); } unload() { loaded.push("unload"); } }
  const drawn: Array<{ component?: unknown; refs?: unknown; model: model.LayoutModel }> = [];
  const refs = { index: { signature: "fig:a=1" }, language: "en" };
  const live = await mockedModule<{ livePreviewExtension(app: unknown): stateApi.Extension }>(new URL("../src/view/livePreview.ts", import.meta.url), {
    obsidian: { editorInfoField, editorLivePreviewField, MarkdownView: class {}, Component }, "@codemirror/state": stateApi, "@codemirror/view": viewApi,
    "../format/v2.ts": format, "../layout/edits.ts": edits, "../layout/documentSnapshot.ts": snapshots,
    "../layout/floatOrder.ts": floatOrder, "../layout/changeScan.ts": changeScan, "../layout/viewProjection.ts": projections,
    "../layout/model.ts": model, "../markdown/crossref.ts": crossref,
    "./blockDrag.ts": {}, "./crossrefView.ts": { refContextOf: () => refs }, "./interactions.ts": {},
    "./layoutView.ts": { renderLayout: (_el: unknown, options: (typeof drawn)[number]) => drawn.push(options) },
    "./layoutHistory.ts": { layoutHistory: () => [] }, "./messages.ts": {},
    "./textEditing.ts": {}, "./wrapGuard.ts": { wrapGuard: () => [] }, "./viewEnvironment.ts": {},
    "./obsidianInternals.ts": { fileOfEditor: () => null }, "./windows.ts": {},
  }, { createSpan: () => ({}) });
  const doc = '<!-- vml {"v":2,"wrap":"right"} -->\nA side note, see @fig:a.\n<!-- /vml -->\nBody text.';
  // The cursor in the box shows its source.
  const state = stateApi.EditorState.create({ doc, selection: { anchor: 40 }, extensions: [editorInfoField, editorLivePreviewField, live.livePreviewExtension({})] });
  const widgets: viewApi.WidgetType[] = [];
  for (const source of state.facet(viewApi.EditorView.decorations)) {
    const set = typeof source === "function" ? null : source;
    set?.between(0, state.doc.length, (_from, _to, decoration) => {
      const { widget } = decoration.spec as { widget?: viewApi.WidgetType };
      if (widget) widgets.push(widget);
    });
  }
  assert.equal(widgets.length, 1);
  const [widget] = widgets;
  assert.ok(widget);
  const dom = widget.toDOM({} as viewApi.EditorView);
  assert.equal(drawn.length, 1);
  const [options] = drawn;
  assert.ok(options);
  assert.ok(options.component instanceof Component, "the box's text needs a component to be drawn");
  assert.equal(options.refs, refs);
  assert.equal(options.model.text.left, "A side note, see @fig:a.");
  widget.destroy(dom);
  assert.deepEqual(loaded, ["load", "unload"]);
});

test("a note without layouts is not parsed while typing, until a layout is written into it", async () => {
  const editorInfoField = stateApi.StateField.define({ create: () => ({ editor: {}, file: { path: "note.md" } }), update: value => value });
  const editorLivePreviewField = stateApi.StateField.define({ create: () => true, update: value => value });
  const live = await mockedModule<{ livePreviewExtension(app: unknown): stateApi.Extension }>(new URL("../src/view/livePreview.ts", import.meta.url), {
    obsidian: { editorInfoField, editorLivePreviewField, MarkdownView: class {}, Component: class {} }, "@codemirror/state": stateApi, "@codemirror/view": viewApi,
    "../format/v2.ts": format, "../layout/edits.ts": edits, "../layout/documentSnapshot.ts": snapshots,
    "../layout/floatOrder.ts": floatOrder, "../layout/changeScan.ts": changeScan, "../layout/viewProjection.ts": projections,
    "../layout/model.ts": model, "../markdown/crossref.ts": crossref,
    "./blockDrag.ts": {}, "./crossrefView.ts": { refContextOf: () => undefined }, "./interactions.ts": {},
    "./layoutView.ts": {}, "./layoutHistory.ts": { layoutHistory: () => [] }, "./messages.ts": {},
    "./textEditing.ts": {}, "./wrapGuard.ts": { wrapGuard: () => [] }, "./viewEnvironment.ts": {},
    "./obsidianInternals.ts": { fileOfEditor: () => null }, "./windows.ts": {},
  });
  let state = stateApi.EditorState.create({ doc: "Plain note\n", extensions: [editorInfoField, editorLivePreviewField, live.livePreviewExtension({})] });
  for (const letter of "more text") state = state.update({ changes: { from: state.doc.length, insert: letter } }).state;
  assert.equal(snapshots.snapshotForState(state), null);
  // Typed one letter at a time, the block is found once its opening comment is complete.
  for (const letter of "\n<!-- vml -->\n![[a.png]]\n<!-- /vml -->") state = state.update({ changes: { from: state.doc.length, insert: letter } }).state;
  assert.equal(snapshots.snapshotForState(state)?.blocks.length, 1);
});

test("the first reading of a pane's environment draws nothing again; a later change does", async () => {
  const editorInfoField = stateApi.StateField.define({ create: () => ({ editor: {}, file: { path: "note.md" } }), update: value => value });
  const editorLivePreviewField = stateApi.StateField.define({ create: () => true, update: value => value });
  const caches: projections.PaneMeasurements<number>[] = [];
  class TrackedMeasurements extends projections.PaneMeasurements<number> {
    constructor() { super(); caches.push(this); }
  }
  const live = await mockedModule<{ livePreviewExtension(app: unknown): stateApi.Extension; setEnvironment: stateApi.StateEffectType<string> }>(new URL("../src/view/livePreview.ts", import.meta.url), {
    obsidian: { editorInfoField, editorLivePreviewField, MarkdownView: class {}, Component: class {} }, "@codemirror/state": stateApi, "@codemirror/view": viewApi,
    "../format/v2.ts": format, "../layout/edits.ts": edits, "../layout/documentSnapshot.ts": snapshots,
    "../layout/floatOrder.ts": floatOrder, "../layout/changeScan.ts": changeScan,
    "../layout/viewProjection.ts": { ...projections, PaneMeasurements: TrackedMeasurements },
    "../layout/model.ts": model, "../markdown/crossref.ts": crossref,
    "./blockDrag.ts": {}, "./crossrefView.ts": { refContextOf: () => undefined }, "./interactions.ts": {},
    "./layoutView.ts": {}, "./layoutHistory.ts": { layoutHistory: () => [] }, "./messages.ts": {},
    "./textEditing.ts": {}, "./wrapGuard.ts": { wrapGuard: () => [], resetWrapGaps: stateApi.StateEffect.define<null>() }, "./viewEnvironment.ts": {},
    "./obsidianInternals.ts": { fileOfEditor: () => null }, "./windows.ts": {},
  });
  const widgetOf = (state: stateApi.EditorState): viewApi.WidgetType => {
    const found: viewApi.WidgetType[] = [];
    for (const source of state.facet(viewApi.EditorView.decorations)) {
      if (typeof source !== "function") source.between(0, state.doc.length, (_from, _to, decoration) => {
        const { widget } = decoration.spec as { widget?: viewApi.WidgetType };
        if (widget) found.push(widget);
      });
    }
    const [widget] = found;
    assert.ok(widget && found.length === 1);
    return widget;
  };
  let state = stateApi.EditorState.create({ doc: media, extensions: [editorInfoField, editorLivePreviewField, live.livePreviewExtension({})] });
  const drawn = widgetOf(state);
  const cache = caches[0];
  assert.ok(cache);
  cache.set("measured", 240);

  state = state.update({ effects: live.setEnvironment.of("720px") }).state;
  assert.ok(widgetOf(state).eq(drawn), "the layout drawn at opening stays");
  assert.equal(cache.environmentEpoch, 0);
  assert.equal(cache.get("measured"), 240);

  state = state.update({ effects: live.setEnvironment.of("540px") }).state;
  assert.equal(widgetOf(state).eq(drawn), false, "a new width draws the layout again");
  assert.equal(cache.environmentEpoch, 1);
  assert.equal(cache.get("measured"), undefined);
});
