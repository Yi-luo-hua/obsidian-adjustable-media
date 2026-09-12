import test from "node:test";
import assert from "node:assert/strict";

import { findV2Blocks, type V2Block } from "../src/format/v2.ts";
import {
  applyEditsToEditor,
  applyEditsToText,
  isEditable,
  planModelEdit,
  planMoveOut,
  planUnwrap,
  resolveEdits,
  wrapLines,
  type BlockEdit,
} from "../src/layout/edits.ts";
import { insertItem, modelFromBlock, moveItem, removeItem, setRowHeight } from "../src/layout/model.ts";
import { MemoryEditor } from "./support/memoryEditor.ts";

const note = [
  "# 标题", // 0
  "", // 1
  "<!-- vml -->", // 2
  "![[a.png]]![[b.png]]", // 3
  "", // 4
  "![[c.png]]", // 5
  "<!-- /vml -->", // 6
  "", // 7
  "正文", // 8
  "", // 9
  "<!-- vml -->", // 10
  "![[d.png]]", // 11
  "<!-- /vml -->", // 12
];

const TALLER = '<!-- vml {"v":2,"rows":[{"height":300}]} -->';

function nth(lines: readonly string[], index: number): V2Block {
  const block = findV2Blocks(lines)[index];
  assert.ok(block, `expected block #${index}`);
  return block;
}

function taller(block: V2Block): BlockEdit {
  const edit = planModelEdit(block, setRowHeight(modelFromBlock(block), 0, 300));
  assert.ok(edit);
  return edit;
}

function apply(lines: readonly string[], edits: Array<BlockEdit | null>): string[] {
  const result = applyEditsToText(lines.join("\n"), edits.filter((edit): edit is BlockEdit => edit !== null));
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result)}`);
  return result.text.split("\n");
}

function crossBlockMove(): BlockEdit[] {
  const source = nth(note, 1);
  const target = nth(note, 0);
  const taken = removeItem(modelFromBlock(source), { row: 0, index: 0 });
  assert.ok(taken);
  const moved = insertItem(modelFromBlock(target), taken.item, { kind: "beside", position: { row: 1, index: 0 }, side: "after" });
  return [planModelEdit(source, taken.model), planModelEdit(target, moved)].filter((edit): edit is BlockEdit => edit !== null);
}

test("a settings-only change rewrites just the opening comment and keeps the body as written", () => {
  assert.deepEqual(apply(note, [taller(nth(note, 0))]), [...note.slice(0, 2), TALLER, ...note.slice(3)]);
});

test("blocks with unreadable settings or other text are never rewritten", () => {
  const newer = nth(['<!-- vml {"v":3,"rows":[{"height":300}]} -->', "![[a.png]]", "![[b.png]]", "<!-- /vml -->"], 0);
  assert.equal(isEditable(newer), false);
  assert.equal(planModelEdit(newer, moveItem(modelFromBlock(newer), { row: 1, index: 0 }, { kind: "newRow", beforeRow: 0 })), null);
  const taken = removeItem(modelFromBlock(newer), { row: 0, index: 0 });
  assert.ok(taken);
  assert.equal(planMoveOut(newer, taken.model, taken.item.embed), null);

  const mixed = nth(["<!-- vml -->", "![[a.png]]", "说明文字", "<!-- /vml -->"], 0);
  assert.equal(isEditable(mixed), false);
  assert.equal(planModelEdit(mixed, setRowHeight(modelFromBlock(mixed), 0, 300)), null);

  assert.equal(isEditable(nth(note, 0)), true);
});

test("an unchanged model plans no edit", () => {
  const block = nth(note, 0);

  assert.equal(planModelEdit(block, modelFromBlock(block)), null);
});

test("moving embeds rewrites only the block's own lines", () => {
  const block = nth(note, 0);
  const moved = moveItem(modelFromBlock(block), { row: 0, index: 1 }, { kind: "newRow", beforeRow: 0 });

  assert.deepEqual(apply(note, [planModelEdit(block, moved)]), [
    ...note.slice(0, 2),
    "<!-- vml -->",
    "![[b.png]]",
    "![[a.png]]",
    "![[c.png]]",
    "<!-- /vml -->",
    ...note.slice(7),
  ]);
});

test("moving an embed across blocks changes both and removes the emptied block", () => {
  assert.deepEqual(apply(note, crossBlockMove()), [
    "# 标题",
    "",
    "<!-- vml -->",
    "![[a.png]] ![[b.png]]",
    "![[c.png]] ![[d.png]]",
    "<!-- /vml -->",
    "",
    "正文",
    "",
  ]);
});

test("removing a whole block also removes one of the blank lines around it", () => {
  const lines = ["a", "", "<!-- vml -->", "![[x.png]]", "<!-- /vml -->", "", "b"];
  const block = nth(lines, 0);
  const emptied = removeItem(modelFromBlock(block), { row: 0, index: 0 });
  assert.ok(emptied);

  assert.deepEqual(apply(lines, [planModelEdit(block, emptied.model)]), ["a", "", "b"]);
});

test("moving an embed out of the layout puts it on its own line after the block", () => {
  const block = nth(note, 0);
  const taken = removeItem(modelFromBlock(block), { row: 1, index: 0 });
  assert.ok(taken);
  assert.deepEqual(apply(note, [planMoveOut(block, taken.model, taken.item.embed)]).slice(0, 10), [
    "# 标题", "", "<!-- vml -->", "![[a.png]] ![[b.png]]", "<!-- /vml -->", "", "![[c.png]]", "", "正文", "",
  ]);

  const single = nth(["<!-- vml -->", "![[x.png]]", "<!-- /vml -->"], 0);
  const alone = removeItem(modelFromBlock(single), { row: 0, index: 0 });
  assert.ok(alone);
  assert.deepEqual(apply(single.lines, [planMoveOut(single, alone.model, alone.item.embed)]), ["![[x.png]]"]);
});

test("wrapping lines in a block and removing the comments again restores them byte for byte", () => {
  const body = ["![[a.png]]![[b.png|300]]", "", '![横图](attachments/with%20space.png "t")'];
  const doc = ["前文", "", ...wrapLines(body), "", "后文"];
  const block = nth(doc, 0);

  assert.equal(block.invalidLine, null);
  assert.deepEqual(apply(doc, [planUnwrap(block)]), ["前文", "", ...body, "", "后文"]);
});

test("an edit follows its block when lines were added above it after rendering", () => {
  const shifted = ["新加的一行", "", ...note];
  const out = apply(shifted, [taller(nth(note, 0))]);

  assert.equal(out[4], TALLER);
  assert.deepEqual(out.filter((_, index) => index !== 4), shifted.filter((_, index) => index !== 4));
});

test("nothing is written when the block is gone or no longer unique", () => {
  const twins = ["<!-- vml -->", "![[a.png]]", "<!-- /vml -->", "", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->"];
  const edit = taller(nth(twins, 0));

  assert.equal(resolveEdits(twins, [edit]).ok, true);
  assert.deepEqual(resolveEdits(["前面加了一行", ...twins], [edit]), { ok: false, reason: "ambiguous" });
  assert.deepEqual(
    resolveEdits(note.map((line) => line.replace("c.png", "renamed.png")), [taller(nth(note, 0))]),
    { ok: false, reason: "not-found" },
  );
});

test("a copy of the block inside a code fence is never written to", () => {
  const block = nth(note, 0);

  assert.deepEqual(resolveEdits(["```markdown", ...block.lines, "```"], [taller(block)]), { ok: false, reason: "not-found" });
});

test("two edits for the same block are rejected", () => {
  const block = nth(note, 0);
  const other = planModelEdit(block, setRowHeight(modelFromBlock(block), 0, 400));
  assert.ok(other);

  assert.deepEqual(resolveEdits(note, [taller(block), other]), { ok: false, reason: "overlap" });
});

test("CRLF files keep their line endings and untouched lines stay byte-identical", () => {
  const text = `${note.join("\r\n")}\r\n`;
  const result = applyEditsToText(text, [taller(nth(note, 0))]);
  assert.ok(result.ok);
  assert.equal(result.text, `${[...note.slice(0, 2), TALLER, ...note.slice(3)].join("\r\n")}\r\n`);

  const tail = ["a", "", "<!-- vml -->", "![[x.png]]", "<!-- /vml -->"];
  const block = nth(tail, 0);
  const emptied = removeItem(modelFromBlock(block), { row: 0, index: 0 });
  assert.ok(emptied);
  const edit = planModelEdit(block, emptied.model);
  assert.ok(edit);
  const removed = applyEditsToText(tail.join("\r\n"), [edit]);
  assert.ok(removed.ok);
  assert.equal(removed.text, "a\r\n");
});

test("the editor path makes the same change in one transaction, or none on failure", () => {
  const block = nth(note, 0);
  const moved = planModelEdit(block, moveItem(modelFromBlock(block), { row: 0, index: 1 }, { kind: "newRow", beforeRow: 0 }));
  assert.ok(moved);

  const editor = new MemoryEditor(note.join("\n"));
  assert.deepEqual(applyEditsToEditor(editor, [moved]), { ok: true });
  assert.equal(editor.getValue(), apply(note, [moved]).join("\n"));
  assert.equal(editor.transactionCount, 1);

  const cross = new MemoryEditor(note.join("\n"));
  assert.deepEqual(applyEditsToEditor(cross, crossBlockMove()), { ok: true });
  assert.equal(cross.getValue(), apply(note, crossBlockMove()).join("\n"));

  const stale = new MemoryEditor(note.join("\n").replace("c.png", "z.png"));
  assert.deepEqual(applyEditsToEditor(stale, [moved]), { ok: false, reason: "not-found" });
  assert.equal(stale.transactionCount, 0);
});
