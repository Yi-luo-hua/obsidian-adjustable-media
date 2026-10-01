import assert from "node:assert/strict";
import test from "node:test";
import { ChangeSet } from "@codemirror/state";

import { findV2Blocks } from "../src/format/v2.ts";
import { documentSnapshot } from "../src/layout/documentSnapshot.ts";
import { applyEditsToEditor, applyEditsToText, planModelEdit, planUnwrap, planUnwrapAll, resolveEdits, type BlockEdit } from "../src/layout/edits.ts";
import { modelFromBlock, setRowHeight } from "../src/layout/model.ts";
import { drawnFrom, isStale, recordDrawn } from "../src/layout/drawn.ts";
import { MemoryEditor } from "./support/memoryEditor.ts";
import { bindBlockEdits } from "../src/layout/blockIdentity.ts";

const layout = '<!-- vml -->\n![[same.png|240]]\n<!-- /vml -->';
const text = `Intro\n\n${layout}\n\n${layout}\n\nBody`;
const origin = { file: {}, branch: {}, path: "note.md" };

test("duplicate instances retain distinct identities through preceding insertion and settings edits", () => {
  const before = documentSnapshot(text, origin);
  const changes = ChangeSet.of({ from: 0, insert: "Prefix\n" }, text.length);
  const inserted = documentSnapshot(`Prefix\n${text}`, origin, before, changes);
  assert.deepEqual(inserted.blocks.map(ref => ref.id), before.blocks.map(ref => ref.id));
  assert.notEqual(inserted.blocks[0].id, inserted.blocks[1].id);
  const second = inserted.blocks[1];
  const opener = '<!-- vml {"v":2,"width":0.6} -->';
  const replacement = ChangeSet.of({ from: second.from, to: second.from + '<!-- vml -->'.length, insert: opener }, inserted.text.length);
  const changedText = inserted.text.slice(0, second.from) + opener + inserted.text.slice(second.from + '<!-- vml -->'.length);
  const after = documentSnapshot(changedText, origin, inserted, replacement);
  assert.equal(after.blocks[1].id, second.id);
  assert.equal(after.blocks[1].contentRevision, 2);
  assert.equal(after.blocks[0].contentRevision, 1);
  assert.equal(after.revision, 3);
});

test("moving a duplicate preserves identity after transaction mapping accounts for its unmoved copy", () => {
  const before = documentSnapshot(text, origin);
  const first = before.blocks[0];
  const to = text.length;
  const changes = ChangeSet.of([{ from: first.from, to: first.to + 2 }, { from: to, insert: `\n\n${layout}` }], text.length);
  const afterText = text.slice(0, first.from) + text.slice(first.to + 2) + `\n\n${layout}`;
  const after = documentSnapshot(afterText, origin, before, changes);
  assert.deepEqual(after.blocks.map(ref => ref.id), [before.blocks[1].id, first.id]);
  const undone = documentSnapshot(text, origin, after, changes.invertedDesc);
  assert.deepEqual(undone.blocks.map(ref => ref.id), before.blocks.map(ref => ref.id));
  assert.equal(undone.revision, 3);
  assert.notEqual(undone.id, before.id);
  const redone = documentSnapshot(afterText, origin, undone, changes);
  assert.deepEqual(redone.blocks.map(ref => ref.id), after.blocks.map(ref => ref.id));
  assert.equal(redone.revision, 4);
});

test("a whole-buffer replacement with indistinguishable copies rebuilds identities instead of guessing", () => {
  const before = documentSnapshot(text, origin);
  const external = `Other intro\n\n${layout}\n\n${layout}\n\nBody`;
  const changes = ChangeSet.of({ from: 0, to: text.length, insert: external }, text.length);
  const after = documentSnapshot(external, origin, before, changes);
  assert.ok(after.blocks.every(ref => !before.blocks.some(old => old.id === ref.id)));
  const branch = documentSnapshot(text, { ...origin, branch: {} }, before);
  assert.notEqual(branch.lineageId, before.lineageId);
  assert.equal(branch.revision, 1);
  const renamed = documentSnapshot(text, { ...origin, path: "renamed.md" }, before, ChangeSet.empty(text.length));
  assert.equal(renamed.lineageId, before.lineageId);
  assert.equal(before.origin.path, "note.md");
  assert.equal(renamed.origin.path, "renamed.md");
});

test("a stale rendered edit binds to its instance when another duplicate occupies its old line", () => {
  const before = documentSnapshot(text, origin);
  const second = before.blocks[1];
  const edit = planModelEdit(second.block, setRowHeight(modelFromBlock(second.block), 0, 300));
  assert.ok(edit);
  const prefix = "One\nTwo\nThree\nFour\n";
  const currentText = prefix + text;
  const current = documentSnapshot(currentText, origin, before, ChangeSet.of({ from: 0, insert: prefix }, text.length));
  assert.equal(current.blocks[0].block.openLine, second.block.openLine);
  const bound = bindBlockEdits([edit], current.blocks);
  assert.ok(bound.ok);
  const applied = applyEditsToText(currentText, bound.edits);
  assert.ok(applied.ok);
  const parsed = findV2Blocks(applied.text.split("\n"));
  assert.equal(parsed[0].lines[0], "<!-- vml -->");
  assert.match(parsed[1].lines[0], /"height":300/);
  assert.deepEqual(bindBlockEdits([edit], [current.blocks[0]]), { ok: false, reason: "not-found" });
});

test("relations include same-side members and retain an unknown influence end past intervening body", () => {
  const left = '<!-- vml {"v":2,"wrap":"left"} -->\n![[a.png]]\n<!-- /vml -->';
  const right = left.replace('"left"', '"right"').replace('a.png', 'b.png');
  const snapshot = documentSnapshot(`${left}\n\n${left}\n\nBody\n\n${right}\nTail`, origin);
  assert.equal(snapshot.relations.floats.length, 3);
  assert.deepEqual(snapshot.relations.runs.map(run => run.members.length), [2, 1]);
  assert.ok(snapshot.relations.flowRegions.every(region => region.endLine === null));
  const firstRun = snapshot.relations.runs[0];
  const body = snapshot.anchors.find(anchor => anchor.id === firstRun.bodyAnchor);
  assert.equal(snapshot.lines[body!.line], "Body");
  assert.equal(snapshot.text.includes('"id"'), false);
  const eof = documentSnapshot(left, origin);
  assert.equal(eof.relations.runs[0].bodyAnchor, null);
  assert.ok(eof.anchors.some(anchor => anchor.line === eof.lines.length));
});

test("body topology invalidates unchanged layout comments and column text", () => {
  const lines = [
    '<!-- vml {"v":2,"wrap":"left","skip":2} -->', '![[a.png]]', '<!-- /vml -->', '',
    '<!-- vml {"v":2,"wrap":"right","skip":4} -->', '![[b.png]]', '<!-- /vml -->', 'Body',
  ];
  const before = drawnFrom(findV2Blocks(lines), "", lines);
  const changed = lines.map((line, at) => at === 3 ? 'A new body anchor' : line);
  const after = drawnFrom(findV2Blocks(changed), "", changed);
  assert.equal(before.comments, after.comments);
  assert.equal(isStale(recordDrawn(undefined, before, -1), after), true);
  assert.equal(isStale(recordDrawn(undefined, after, -1), after), false);
});

test("one writable target and a changed read-only dependency cancel every write", () => {
  const lines = text.split('\n');
  const block = findV2Blocks(lines)[0];
  const edit = planModelEdit(block, setRowHeight(modelFromBlock(block), 0, 300));
  assert.ok(edit);
  const readSet = [{ fromLine: 5, lines: lines.slice(5, 10) }];
  const changed = lines.map((line, at) => at === 5 ? 'New intervening body' : line).join('\n');
  const editor = new MemoryEditor(changed);
  assert.deepEqual(applyEditsToEditor(editor, [edit], readSet), { ok: false, reason: 'stale-dependency' });
  assert.equal(editor.transactionCount, 0);
  assert.equal(editor.getValue(), changed);
  const applied = applyEditsToText(text, [edit], readSet);
  assert.ok(applied.ok);
  assert.equal(applied.text.split('\n').slice(6).join('\n'), lines.slice(6).join('\n'));
});

test("assertions retain CRLF bytes and do not relocate repeated dependency text", () => {
  const crlf = text.replaceAll('\n', '\r\n');
  const lines = crlf.split('\n');
  const block = findV2Blocks(lines)[0];
  const edit = planModelEdit(block, setRowHeight(modelFromBlock(block), 0, 300));
  assert.ok(edit);
  const readSet = [{ fromLine: 10, lines: lines.slice(10) }];
  assert.equal(applyEditsToText(crlf, [edit], readSet).ok, true);
  assert.deepEqual(applyEditsToText(`Prefix\r\n${crlf}`, [edit], readSet), { ok: false, reason: 'stale-dependency' });
  assert.deepEqual(resolveEdits(lines, [edit], [{ fromLine: 10, lines: ['Body'] }]), { ok: true, changes: [{ from: 2, to: 2, replacement: ['<!-- vml {"v":2,"rows":[{"height":300}]} -->'] }] });
});

test("unknown and invalid blocks are protected at planning and transaction entry points", () => {
  for (const opener of ['<!-- vml {"v":3,"id":"keep"} -->', '<!-- vml {broken} -->']) {
    const unknown = `${opener}\n![[keep.png|240]]\n<!-- /vml -->`;
    const lines = `${layout}\n\n${unknown}`.split('\n');
    const blocks = findV2Blocks(lines);
    assert.equal(planUnwrap(blocks[1]), null);
    const planned = planUnwrapAll(blocks);
    assert.equal(planned.length, 1);
    const applied = applyEditsToText(lines.join('\n'), planned);
    assert.ok(applied.ok);
    assert.ok(applied.text.endsWith(unknown));
    const raw: BlockEdit = { anchorLine: blocks[1].openLine, anchorLines: blocks[1].lines,
      start: 0, end: 2, replacement: ['![[keep.png|240]]'] };
    const editor = new MemoryEditor(lines.join('\n'));
    assert.deepEqual(applyEditsToEditor(editor, [...planned, raw]), { ok: false, reason: 'read-only' });
    assert.equal(editor.transactionCount, 0);
  }
});
