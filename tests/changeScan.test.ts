import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorState } from "@codemirror/state";

import { changesMayAdd } from "../src/layout/changeScan.ts";
import { mayHaveRefs } from "../src/markdown/crossref.ts";

const OPENING = "<!-- vml";
const opens = (text: string): boolean => text.includes(OPENING);

/** Applies `spec` to `doc` and asks whether it may have added an opening comment. */
function added(doc: string, spec: { from: number; to?: number; insert?: string }, found = opens, reach = OPENING.length): boolean {
  const tr = EditorState.create({ doc }).update({ changes: spec });
  return changesMayAdd(tr.state.doc, tr.changes, found, reach);
}

test("typing elsewhere in a long note never reads it for a layout", () => {
  const doc = `${"Some text.\n".repeat(2000)}End`;
  assert.equal(added(doc, { from: 5, insert: "x" }), false);
  assert.equal(added(doc, { from: 100, to: 120 }), false);
});

test("an opening comment typed, pasted or joined by a deletion is noticed", () => {
  // The last letter typed completes it.
  assert.equal(added("Text\n<!-- vm", { from: 12, insert: "l" }), true);
  // Pasted whole.
  assert.equal(added("Text\n", { from: 5, insert: "<!-- vml -->\n![[a.png]]\n<!-- /vml -->" }), true);
  // Deleting what stood between its two halves.
  assert.equal(added("<!-- vXXXml -->", { from: 6, to: 9 }), true);
  // Typed right after one that was already there, with a short reach: still found, being in reach.
  assert.equal(added("<!-- vml", { from: 8, insert: " " }), true);
});

test("a label or reference written into a note without any is noticed", () => {
  const refs = (doc: string, spec: { from: number; to?: number; insert?: string }) => added(doc, spec, mayHaveRefs, 10);
  assert.equal(refs("See @fig", { from: 8, insert: ":" }), true);
  assert.equal(refs("$$ x \\label{eq", { from: 14, insert: ":" }), true);
  assert.equal(refs("Caption {#fi", { from: 12, insert: "g:" }), true);
  assert.equal(refs("Plain text here", { from: 5, insert: "more " }), false);
});
