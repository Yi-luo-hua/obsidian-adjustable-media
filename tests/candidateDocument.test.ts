import assert from "node:assert/strict";
import { test } from "node:test";

import { candidateDocument } from "../src/layout/candidateDocument.ts";
import { documentSnapshot } from "../src/layout/documentSnapshot.ts";
import { applyEditsToText, planModelEdit, type BlockEdit } from "../src/layout/edits.ts";
import { modelFromBlock, setBlockWidth } from "../src/layout/model.ts";
import { planPlacement } from "../src/layout/placement.ts";
import { applyEditsToView } from "../src/layout/editorTransaction.ts";
import { EditorState, type TransactionSpec } from "@codemirror/state";

const source = 'Before  \n\n<!-- vml -->\n![[A.png|custom alias|200]]\n<!-- /vml -->\n\nAfter\n';
const snapshot = (text = source) => documentSnapshot(text, { file: {}, branch: {}, path: "candidate.md" });
const widthEdit = (base: ReturnType<typeof snapshot>, index = 0): BlockEdit => {
  const block = base.blocks[index].block;
  const edit = planModelEdit(block, setBlockWidth(modelFromBlock(block), 1 / 3));
  assert.ok(edit);
  return edit;
};

test("candidate reads serialized width, preserves embeds and does not advance the source lineage", () => {
  const base = snapshot(), result = candidateDocument(base, [widthEdit(base)]);
  assert.ok(result.ok);
  const candidate = result.candidate;
  assert.equal(candidate.state, "parsed");
  assert.equal(candidate.baseSnapshotId, base.id);
  assert.equal(modelFromBlock(candidate.snapshot.blocks[0].block).width, 0.333);
  assert.equal(candidate.snapshot.blocks[0].block.rows[0].embeds[0].raw, '![[A.png|custom alias|200]]');
  assert.equal(base.text, source);
  assert.equal(base.revision, 1);
  assert.notEqual(candidate.snapshot.lineageId, base.lineageId);
  assert.equal(candidate.snapshot.origin.file, base.origin.file);
});

test("file candidate retains CRLF and untouched whitespace exactly as the file writer", () => {
  const raw = source.replaceAll("\n", "\r\n"), base = snapshot(raw), edits = [widthEdit(base)];
  const result = candidateDocument(base, edits), written = applyEditsToText(raw, edits);
  assert.ok(result.ok && written.ok);
  assert.equal(result.candidate.snapshot.text, written.text);
  assert.equal(result.candidate.snapshot.text.startsWith("Before  \r\n\r\n"), true);
  assert.equal(result.candidate.snapshot.text.replaceAll("\r\n", "").includes("\n"), false);
});

test("candidate reads omitted default fields and retains unknown metadata and body whitespace", () => {
  const raw = source.replace("<!-- vml -->", '<!-- vml {"v":2,"width":0.75,"kept":{"key":"value"}} -->');
  const base = snapshot(raw), block = base.blocks[0].block;
  const edit = planModelEdit(block, setBlockWidth(modelFromBlock(block), 1));
  assert.ok(edit);
  const result = candidateDocument(base, [edit]);
  assert.ok(result.ok);
  const parsed = result.candidate.snapshot.blocks[0].block;
  assert.equal(modelFromBlock(parsed).width, null);
  assert.equal("width" in parsed.meta.extra, false);
  assert.deepEqual(parsed.meta.extra.kept, { key: "value" });
  assert.equal(result.candidate.snapshot.text.slice(result.candidate.snapshot.blocks[0].from).split("\n").slice(1).join("\n"), raw.slice(base.blocks[0].from).split("\n").slice(1).join("\n"));
});

test("editor candidate uses the same offset edits as a native editor transaction", () => {
  const base = snapshot(), edits = [widthEdit(base)];
  const result = candidateDocument(base, edits, [], "editor");
  assert.ok(result.ok);
  const view = { state: EditorState.create({ doc: base.text }), dispatch(spec: TransactionSpec) { this.state = this.state.update(spec).state; } };
  assert.equal(applyEditsToView(view, edits).ok, true);
  assert.equal(result.candidate.snapshot.text, view.state.doc.toString());
});

test("moving to EOF removes the old occurrence before parsing source relations and reads skip=40", () => {
  const base = snapshot(), edits = planPlacement(base.lines, base.blocks[0].block, { line: base.lines.length, wrap: "right", skip: 40 });
  assert.ok(edits);
  const result = candidateDocument(base, edits);
  assert.ok(result.ok);
  const parsed = result.candidate.snapshot;
  assert.equal(parsed.blocks.length, 1);
  assert.equal(parsed.text.match(/!\[\[A\.png\|custom alias\|200\]\]/g)?.length, 1);
  assert.equal(parsed.blocks[0].from > parsed.text.indexOf("After"), true);
  assert.equal(modelFromBlock(parsed.blocks[0].block).skip, 40);
  assert.equal(parsed.relations.floats.length, 1);
});

test("same-side and opposite-side floats remain in the candidate after an actual move", () => {
  const block = (name: string, side: string) => `<!-- vml {"v":2,"wrap":"${side}","width":0.6} -->\n![[${name}.png]]\n<!-- /vml -->`;
  const base = snapshot([block("A", "left"), "", block("B", "left"), "", block("C", "right"), "", "Body", "", "Target"].join("\n"));
  const edits = planPlacement(base.lines, base.blocks[0].block, { line: base.lines.length, wrap: "left", skip: 0 });
  assert.ok(edits);
  const result = candidateDocument(base, edits);
  assert.ok(result.ok);
  assert.equal(result.candidate.snapshot.relations.floats.length, 3);
  assert.deepEqual(result.candidate.snapshot.blocks.map(ref => ref.block.rows[0].embeds[0].raw), ["![[B.png]]", "![[C.png]]", "![[A.png]]"]);
});

test("a bound duplicate edits only its runtime instance and missing identity never targets another copy", () => {
  const body = source.slice(source.indexOf("<!--"), source.indexOf("\n\nAfter"));
  const base = snapshot(body + "\n\n" + body), edit = widthEdit(base, 1);
  edit.anchorLine = 0;
  const result = candidateDocument(base, [edit]);
  assert.ok(result.ok);
  assert.equal(modelFromBlock(result.candidate.snapshot.blocks[0].block).width, null);
  assert.equal(modelFromBlock(result.candidate.snapshot.blocks[1].block).width, 0.333);
  const missing = candidateDocument(base, [{ ...edit, blockId: "removed-instance" }]);
  assert.deepEqual(missing, { ok: false, reason: "not-found" });
});

test("candidate rejects a stale read dependency and overlapping writes as a whole", () => {
  const base = snapshot(), edit = widthEdit(base);
  assert.deepEqual(candidateDocument(base, [edit], [{ fromLine: 0, lines: ["Different"] }]), { ok: false, reason: "stale-dependency" });
  assert.deepEqual(candidateDocument(base, [edit, edit]), { ok: false, reason: "overlap" });
  assert.equal(base.text, source);
});

test("candidate cannot rewrite an unknown-format block or anchors inside a code fence", () => {
  const unknown = snapshot(source.replace("<!-- vml -->", '<!-- vml {"v":3} -->'));
  const edit: BlockEdit = { anchorLine: 2, anchorLines: unknown.lines.slice(2, 5), start: 0, end: 0, replacement: ["<!-- vml -->"] };
  assert.deepEqual(candidateDocument(unknown, [edit]), { ok: false, reason: "read-only" });
  const code = snapshot("```markdown\n" + source + "```"), raw = widthEdit(snapshot());
  delete raw.blockId;
  assert.deepEqual(candidateDocument(code, [raw]), { ok: false, reason: "not-found" });
});
