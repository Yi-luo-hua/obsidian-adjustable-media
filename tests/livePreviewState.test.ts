import assert from "node:assert/strict";
import { test } from "node:test";
import * as stateApi from "@codemirror/state";
import * as viewApi from "@codemirror/view";
import * as format from "../src/format/v2.ts";
import * as edits from "../src/layout/edits.ts";
import * as snapshots from "../src/layout/documentSnapshot.ts";
import * as floatOrder from "../src/layout/floatOrder.ts";
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
    "../layout/floatOrder.ts": floatOrder, "../layout/viewProjection.ts": { ...projections, PaneMeasurements: TrackedMeasurements },
    "../layout/model.ts": model, "../markdown/crossref.ts": crossref,
    "./blockDrag.ts": {}, "./crossrefView.ts": { refContextOf: () => undefined }, "./interactions.ts": {},
    "./layoutView.ts": {}, "./layoutHistory.ts": { layoutHistory: () => [] }, "./messages.ts": {},
    "./textEditing.ts": {}, "./wrapGuard.ts": { wrapGuard: () => [] }, "./viewEnvironment.ts": {},
    "./obsidianInternals.ts": { fileOfEditor: () => sourceView.file },
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
