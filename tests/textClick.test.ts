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
import * as paragraphBreaks from "../src/markdown/paragraphBreaks.ts";
import * as paragraphParser from "../src/markdown/paragraphParser.ts";
import * as highlight from "../src/layout/cursorHighlight.ts";
import * as identity from "../src/layout/blockIdentity.ts";
import { mockedModule } from "./support/mockedModule.ts";
import type { WrapSource } from "../src/view/wrapGuard.ts";
import type { TextEditHost } from "../src/view/textEditing.ts";
import type { LayoutContext } from "../src/view/interactions.ts";

test("rendered text retains an existing column's focus until click, without intercepting links or editor selections", async () => {
  const info = stateApi.StateField.define({ create: () => ({ editor: {}, file: { path: "note.md" } }), update: value => value });
  const preview = stateApi.StateField.define({ create: () => true, update: value => value });
  let focusedColumn = true, collapsed = true;
  const opened: string[] = [];
  const handlers = new Map<string, (event: object) => void>();
  const frameHandlers = new Map<string, (event: object) => void>();
  const doc = { getSelection: () => ({ isCollapsed: collapsed }), activeElement: { closest: () => focusedColumn ? {} : null } };
  const element = () => ({ doc, dataset: {}, empty() {}, toggleClass() {},
    createEl: () => ({ addEventListener() {} }),
    win: { ResizeObserver: class { observe() {} disconnect() {} } },
  });
  const column = { dataset: { side: "left" }, addEventListener: (name: string, run: (event: object) => void) => handlers.set(name, run) };
  const root = { ...element(), querySelector: () => null, querySelectorAll: () => [column],
    addEventListener: (name: string, run: (event: object) => void) => frameHandlers.set(name, run) };
  const live = await mockedModule<{ livePreviewExtension(app: object): stateApi.Extension }>(new URL("../src/view/livePreview.ts", import.meta.url), {
    obsidian: { editorInfoField: info, editorLivePreviewField: preview, MarkdownView: class {}, Component: class { load() {} unload() {} } },
    "@codemirror/state": stateApi, "@codemirror/view": viewApi,
    "../format/v2.ts": format, "../layout/edits.ts": edits, "../layout/documentSnapshot.ts": snapshots,
    "../layout/cursorHighlight.ts": highlight, "../layout/blockIdentity.ts": identity,
    "../layout/floatOrder.ts": floatOrder, "../layout/changeScan.ts": changeScan, "../layout/viewProjection.ts": projections,
    "../layout/model.ts": model, "../markdown/crossref.ts": crossref,
    "../markdown/paragraphBreaks.ts": paragraphBreaks, "../markdown/paragraphParser.ts": paragraphParser,
    "./blockDrag.ts": { setUpBlockMove() {} }, "./crossrefView.ts": { refContextOf: () => undefined },
    "./interactions.ts": { attachInteractions() {} }, "./layoutHistory.ts": { layoutHistory: () => [] },
    "./layoutView.ts": { renderLayout: () => root }, "./messages.ts": { t: (key: string) => key, blockWarning: () => null },
    "./textEditing.ts": { startTextEdit: (_host: object, side: string) => opened.push(side) },
    "./wrapGuard.ts": { wrapGuard: () => [] }, "./viewEnvironment.ts": {},
    "./obsidianInternals.ts": { fileOfEditor: () => null }, "./windows.ts": { eventElement: (event: { target: object }) => event.target },
  }, { createDiv: element });
  const state = stateApi.EditorState.create({ doc: 'Intro\n\n<!-- vml {"v":2,"type":"text"} -->\nText\n<!-- /vml -->', extensions: [info, preview, live.livePreviewExtension({})] });
  const widgets: viewApi.WidgetType[] = [];
  for (const set of state.facet(viewApi.EditorView.decorations)) {
    if (typeof set !== "function") set.between(0, state.doc.length, (_from, _to, decoration) => {
      const { widget } = decoration.spec as { widget?: viewApi.WidgetType };
      if (widget) widgets.push(widget);
    });
  }
  assert.equal(widgets.length, 1);
  widgets[0].toDOM({ state } as viewApi.EditorView);
  const event = (interactive = false, shiftKey = false) => {
    const result = { button: 0, shiftKey, clientX: 10, clientY: 20, prevented: false,
      target: { closest: () => interactive ? {} : null }, preventDefault() { this.prevented = true; } };
    return result;
  };
  const press = event(); handlers.get("mousedown")!(press); assert.equal(press.prevented, true);
  for (const target of ["frame padding", "warning"]) {
    const gap = event(); frameHandlers.get("mousedown")!(gap);
    assert.equal(gap.prevented, true, target);
  }
  const frameControl = event(true); frameHandlers.get("mousedown")!(frameControl); assert.equal(frameControl.prevented, false);
  const rightClick = { ...event(), button: 2 }; frameHandlers.get("mousedown")!(rightClick); assert.equal(rightClick.prevented, false);
  focusedColumn = false;
  const nativeSelection = event(); handlers.get("mousedown")!(nativeSelection); assert.equal(nativeSelection.prevented, false);
  focusedColumn = true;
  for (const untouched of [event(true), event(false, true)]) { handlers.get("mousedown")!(untouched); assert.equal(untouched.prevented, false); }
  const link = event(true); handlers.get("click")!(link); assert.equal(link.prevented, false); assert.deepEqual(opened, []);
  collapsed = false;
  const selection = event(); handlers.get("click")!(selection); assert.equal(selection.prevented, false); assert.deepEqual(opened, []);
  collapsed = true;
  const switchSide = event(); handlers.get("click")!(switchSide);
  assert.equal(switchSide.prevented, true);
  assert.deepEqual(opened, ["left"]);
});

test("a reused stand-in opens and redraws at its current anchor after text is inserted above it", async () => {
  const info = stateApi.StateField.define({ create: () => ({ editor: {}, file: { path: "note.md" } }), update: value => value });
  const preview = stateApi.StateField.define({ create: () => true, update: value => value });
  let source!: WrapSource, host!: TextEditHost, click!: (event: { preventDefault(): void }) => void;
  let context!: LayoutContext;
  const doc = { activeElement: null };
  const element = () => ({ doc, dataset: {}, empty() {}, toggleClass() {},
    createEl: () => ({ addEventListener: (_name: string, run: typeof click) => { click = run; } }) });
  const root = { ...element(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  const live = await mockedModule<{ livePreviewExtension(app: object): stateApi.Extension }>(new URL("../src/view/livePreview.ts", import.meta.url), {
    obsidian: { editorInfoField: info, editorLivePreviewField: preview, MarkdownView: class {}, Component: class { load() {} unload() {} } },
    "@codemirror/state": stateApi, "@codemirror/view": viewApi,
    "../format/v2.ts": format, "../layout/edits.ts": edits, "../layout/documentSnapshot.ts": snapshots,
    "../layout/cursorHighlight.ts": highlight, "../layout/blockIdentity.ts": identity,
    "../layout/floatOrder.ts": floatOrder, "../layout/changeScan.ts": changeScan, "../layout/viewProjection.ts": projections,
    "../layout/model.ts": model, "../markdown/crossref.ts": crossref,
    "../markdown/paragraphBreaks.ts": paragraphBreaks, "../markdown/paragraphParser.ts": paragraphParser,
    "./blockDrag.ts": { setUpBlockMove() {} }, "./crossrefView.ts": { refContextOf: () => undefined },
    "./interactions.ts": { attachInteractions(_root: unknown, next: LayoutContext) { context = next; }, refreshSizingHandles() {} }, "./layoutHistory.ts": { layoutHistory: () => [] },
    "./layoutView.ts": { renderLayout: () => root, applySizing() {} }, "./messages.ts": { t: (key: string) => key, blockWarning: () => null },
    "./textEditing.ts": { isEditingText: () => false, startTextEdit: (next: TextEditHost) => { host = next; } },
    "./wrapGuard.ts": { wrapGuard: (next: WrapSource) => { source = next; return []; } }, "./viewEnvironment.ts": {},
    "./obsidianInternals.ts": { fileOfEditor: () => null }, "./windows.ts": {},
  });
  const text = 'Intro\n\n<!-- vml {"v":2,"type":"text","wrap":"right"} -->\nText\n<!-- /vml -->\nBody';
  let state = stateApi.EditorState.create({ doc: text, extensions: [info, preview, live.livePreviewExtension({})] });
  const view = { get state() { return state; }, dispatch(spec: stateApi.TransactionSpec) { state = state.update(spec).state; }, focus() {} } as viewApi.EditorView;
  const el = element() as unknown as HTMLElement;
  const original = source.anchors(state)[0];
  source.drawStandIn(el, view, original, "note.md");
  state = state.update({ changes: { from: 0, insert: "Inserted above\n" } }).state;
  const current = source.anchors(state)[0];
  assert.notEqual(current.from, original.from);
  assert.equal(source.resizeStandIn!(el, current, "note.md"), true);
  click({ preventDefault() {} });
  assert.equal(state.selection.main.anchor, current.from);
  const savedText = state.doc.toString();
  context.editText!("left");
  host.redraw(current.block);
  click({ preventDefault() {} });
  assert.equal(state.selection.main.anchor, current.from, "redrawing retains the updated stand-in anchor");
  assert.equal(state.doc.toString(), savedText);
});
