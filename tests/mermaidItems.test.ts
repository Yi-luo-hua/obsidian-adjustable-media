import assert from "node:assert/strict";
import test from "node:test";
import { fencedCodeBlocks } from "../src/markdown/lineContext.ts";
import { findV2Blocks, serializeBlock } from "../src/format/v2.ts";
import { metaFromModel, modelFromBlock, moveItem, removeItem, insertItem, setRowHeight, setWeights } from "../src/layout/model.ts";
import { applyEditsToText, isEditable, planModelEdit, planMoveOut } from "../src/layout/edits.ts";
import { planMergeWithNext, planWrapSelection } from "../src/commands/plans.ts";

const diagram = ["```mermaid", "flowchart LR", "    A[开始] --> B[完成]", "```"];
const opener = '<!-- vml {"v":3,"kind":"media","rows":[{"items":2,"height":220,"widths":[1,1]}]} -->';
const source = [opener, "![[photo.png]]", "", ...diagram, "<!-- /vml -->"];

test("a complete Mermaid fence is one item beside ordinary media", () => {
  const block = findV2Blocks(source)[0];
  assert.equal(isEditable(block), true);
  assert.equal(block.rows.length, 1);
  assert.deepEqual(block.rows[0].embeds.map((item) => item.kind), ["image", "mermaid"]);
  assert.equal(block.rows[0].embeds[1].raw, diagram.join("\n"));
  assert.equal(block.rows[0].endLine, 6);
  assert.equal(block.leftText, null);
  assert.equal(block.rightText, null);
});

test("legacy V2 Mermaid remains text and unknown V3 variants stay read-only", () => {
  const legacy = findV2Blocks(["<!-- vml -->", ...diagram, "<!-- /vml -->"])[0];
  assert.equal(legacy.rows.length, 0);
  assert.equal(legacy.leftText?.lines.join("\n"), diagram.join("\n"));
  const future = findV2Blocks(['<!-- vml {"v":3,"kind":"group"} -->', ...diagram, "<!-- /vml -->"])[0];
  assert.equal(isEditable(future), false);
});

test("row sizing and column weights only rewrite settings, preserving all fenced source lines", () => {
  const block = findV2Blocks(source)[0];
  const model = modelFromBlock(block);
  const resized = setWeights(setRowHeight(model, 0, 310), 0, [2, 1]);
  const edit = planModelEdit(block, resized)!;
  assert.equal(edit.start, 0);
  assert.equal(edit.end, 0);
  const reread = findV2Blocks([edit.replacement[0], ...source.slice(1)])[0];
  assert.equal(reread.rows[0].embeds[1].raw, diagram.join("\n"));
  assert.equal(reread.meta.version, 3);
  assert.equal(reread.meta.rows[0].items, 2);
});

test("multiline items serialize on their own lines and read back into the same row", () => {
  const block = findV2Blocks(source)[0];
  const model = modelFromBlock(block);
  const lines = serializeBlock(metaFromModel(model), model.rows.map((row) => row.items.map((item) => item.embed)));
  const reread = findV2Blocks(lines)[0];
  assert.equal(isEditable(reread), true);
  assert.deepEqual(reread.rows.map((row) => row.embeds.map((item) => item.raw)), block.rows.map((row) => row.embeds.map((item) => item.raw)));
});

test("only complete top-level Mermaid fences become diagram sources", () => {
  const examples = ["---", "example: '```mermaid'", "---", "````md", ...diagram, "````", "> ```mermaid", "> A --> B", "> ```", ...diagram, "```mermaid", "unclosed"];
  assert.deepEqual(fencedCodeBlocks(examples).filter((fence) => fence.language === "mermaid"), [{ from: 12, to: 15, language: "mermaid" }]);
});

test("incorrect item counts are displayed without permitting writes", () => {
  const block = findV2Blocks([opener.replace('"items":2', '"items":3'), ...source.slice(1)])[0];
  assert.equal(isEditable(block), false);
  assert.equal(planModelEdit(block, modelFromBlock(block)), null);
  assert.equal(block.rows.flatMap((row) => row.embeds).find((item) => item.kind === "mermaid")?.raw, diagram.join("\n"));
});

test("wrapping a complete diagram enables media items without changing any code", () => {
  const lines = ["before", "", ...diagram, "", "![[photo.png]]", "", "after"];
  const edit = planWrapSelection(lines, 2, 7);
  assert.ok(edit);
  const block = findV2Blocks(edit.replacement)[0];
  assert.equal(block.meta.version, 3);
  assert.equal(block.rows[0].embeds[0].raw, diagram.join("\n"));
  assert.deepEqual(edit.replacement.slice(1, -1), lines.slice(2, 8));
  assert.equal(planWrapSelection(lines, 2, 4), null);
});

test("reorder and move-out preserve a CRLF diagram and both text columns", () => {
  const lines = ["before", "", opener, "左栏", source[1], ...diagram, "右栏", "<!-- /vml -->", "", "after"];
  const text = lines.join("\r\n");
  const block = findV2Blocks(lines)[0];
  const model = modelFromBlock(block);
  const moved = moveItem(model, { row: 0, index: 1 }, { kind: "beside", position: { row: 0, index: 0 }, side: "before" });
  const edit = planModelEdit(block, moved);
  assert.ok(edit);
  const result = applyEditsToText(text, [edit]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.text.includes(diagram.join("\r\n")));
  const reread = findV2Blocks(result.text.split("\n"))[0];
  assert.deepEqual(reread.rows[0].embeds.map(item => item.kind), ["mermaid", "image"]);
  assert.deepEqual(reread.leftText?.lines, ["左栏"]);
  assert.deepEqual(reread.rightText?.lines, ["右栏"]);
  const taken = removeItem(moved, { row: 0, index: 0 });
  assert.ok(taken);
  const moveOut = planMoveOut(reread, taken.model, taken.item.embed);
  assert.ok(moveOut);
  assert.ok(moveOut.replacement.every(line => !line.includes("\n")));
  const removed = applyEditsToText(result.text, [moveOut]);
  assert.equal(removed.ok, true);
  if (removed.ok) {
    assert.ok(removed.text.includes(diagram.join("\r\n")));
    const rest = findV2Blocks(removed.text.split("\n"))[0];
    assert.equal(rest.rows[0].embeds.length, 1);
    assert.deepEqual(rest.rightText?.lines, ["右栏"]);
    assert.ok(removed.text.startsWith("before\r\n\r\n"));
    assert.ok(removed.text.endsWith("\r\n\r\nafter"));
  }
});

test("moving to a legacy media block upgrades only the destination format", () => {
  const target = findV2Blocks(["<!-- vml -->", "![[other.png]]", "<!-- /vml -->"])[0];
  const item = modelFromBlock(findV2Blocks(source)[0]).rows[0].items[1];
  const model = insertItem(modelFromBlock(target), item, { kind: "beside", position: { row: 0, index: 0 }, side: "after" });
  const edit = planModelEdit(target, model);
  assert.ok(edit);
  const after = findV2Blocks(edit.replacement)[0];
  assert.equal(after.meta.version, 3);
  assert.deepEqual(after.rows[0].embeds.map(item => item.raw), ["![[other.png]]", diagram.join("\n")]);
  const collision = { ...model, extra: { kind: "reserved-custom-value" } };
  assert.equal(planModelEdit(target, collision), null);
});

test("adjacent image and Mermaid layouts merge without rewriting either item", () => {
  const lines = ["<!-- vml -->", "![[other.png]]", "<!-- /vml -->", "", ...source];
  const edit = planMergeWithNext(lines, 1);
  assert.ok(edit);
  const block = findV2Blocks(edit.replacement)[0];
  assert.equal(block.meta.version, 3);
  assert.deepEqual(block.rows.map(row => row.embeds.map(item => item.raw)), [["![[other.png]]"], ["![[photo.png]]", diagram.join("\n")]]);
});
