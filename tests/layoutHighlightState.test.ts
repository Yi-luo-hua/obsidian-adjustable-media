import assert from "node:assert/strict";
import { test } from "node:test";
import * as stateApi from "@codemirror/state";
import * as viewApi from "@codemirror/view";
import * as format from "../src/format/v2.ts";
import * as edits from "../src/layout/edits.ts";
import * as snapshots from "../src/layout/documentSnapshot.ts";
import * as identity from "../src/layout/blockIdentity.ts";
import * as cursor from "../src/layout/cursorHighlight.ts";
import * as scan from "../src/layout/changeScan.ts";
import * as floats from "../src/layout/floatOrder.ts";
import * as projections from "../src/layout/viewProjection.ts";
import * as model from "../src/layout/model.ts";
import * as crossref from "../src/markdown/crossref.ts";
import { mockedModule } from "./support/mockedModule.ts";

test("source hints follow caret heads and pane focus while toggles preserve widget identity and source", async () => {
  const info = stateApi.StateField.define({ create: () => ({ editor: {}, file: { path: "note.md" } }), update: value => value });
  const preview = stateApi.StateField.define({ create: () => true, update: value => value });
  const live = await mockedModule<{
    livePreviewExtension(app: unknown): stateApi.Extension;
    setLayoutHighlight: stateApi.StateEffectType<{ cursorOnly: boolean; focused: boolean; columnId: string | null }>;
  }>(new URL("../src/view/livePreview.ts", import.meta.url), {
    obsidian: { editorInfoField: info, editorLivePreviewField: preview }, "@codemirror/state": stateApi, "@codemirror/view": viewApi,
    "../format/v2.ts": format, "../layout/edits.ts": edits, "../layout/documentSnapshot.ts": snapshots,
    "../layout/blockIdentity.ts": identity, "../layout/cursorHighlight.ts": cursor, "../layout/changeScan.ts": scan,
    "../layout/floatOrder.ts": floats, "../layout/viewProjection.ts": projections, "../layout/model.ts": model,
    "../markdown/crossref.ts": crossref,
    "./blockDrag.ts": {}, "./crossrefView.ts": {}, "./interactions.ts": {}, "./layoutView.ts": {},
    "./layoutHistory.ts": { layoutHistory: () => [] }, "./messages.ts": {}, "./textEditing.ts": {},
    "./wrapGuard.ts": { wrapGuard: () => [] }, "./viewEnvironment.ts": {}, "./obsidianInternals.ts": {}, "./windows.ts": {},
  });
  const doc = 'Intro\n\n<!-- vml -->\n![[a.png]]\n<!-- /vml -->\n\nTail';
  let state = stateApi.EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [info, preview, live.livePreviewExtension({})] });
  const decorations = (): viewApi.Decoration[] => {
    const result: viewApi.Decoration[] = [];
    for (const set of state.facet(viewApi.EditorView.decorations)) if (typeof set !== "function") {
      set.between(0, state.doc.length, (_from, _to, decoration) => { result.push(decoration); });
    }
    return result;
  };
  const specs = (): Array<{ widget?: viewApi.WidgetType; class?: string }> => decorations().map(d => d.spec as { widget?: viewApi.WidgetType; class?: string });
  const original = specs().find(d => d.widget)!.widget!;
  const highlight = (focused: boolean, cursorOnly = true): void => {
    state = state.update({ effects: live.setLayoutHighlight.of({ cursorOnly, focused, columnId: null }) }).state;
  };
  highlight(true);
  const toggled = specs().find(d => d.widget)!.widget!;
  assert.equal(original.eq(toggled), true, "a settings change must not rebuild the layout");
  const from = state.doc.line(3).from;
  state = state.update({ selection: { anchor: from, head: doc.length }, userEvent: "select" }).state;
  const active = (): number => specs().filter(d => (d.class ?? "").includes("vml-source-line--active")).length;
  assert.equal(active(), 0, "covering the block does not place the caret in it");
  state = state.update({ selection: { anchor: doc.length, head: from }, userEvent: "select" }).state;
  assert.equal(active(), 3);
  highlight(false); assert.equal(active(), 0);
  highlight(true); assert.equal(active(), 3);
  highlight(true, false); assert.equal(active(), 0);
  assert.equal(state.doc.toString(), doc);
});
