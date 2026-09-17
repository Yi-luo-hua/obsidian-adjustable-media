import test from "node:test";
import assert from "node:assert/strict";

import { applyLineChange, blockAt, planMergeWithNext, planWrapSelection } from "../src/commands/plans.ts";
import { applyLineChanges } from "../src/layout/edits.ts";
import { MemoryEditor } from "./support/memoryEditor.ts";

test("wrapping a selection gathers its media lines into one block", () => {
  const lines = ["前文", "![[a.png]]", "", "![[b.png]] ![[c.png]]", "后文"];
  const change = planWrapSelection(lines, 3, 1);
  assert.ok(change);

  assert.deepEqual(applyLineChanges(lines, [change]), ["前文", "<!-- vml -->", "![[a.png]] ![[b.png]] ![[c.png]]", "<!-- /vml -->", "后文"]);
});

test("a selection with an existing block, or nothing in it, is not wrapped", () => {
  assert.equal(planWrapSelection(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->"], 0, 2), null);
  assert.equal(planWrapSelection(["", ""], 0, 1), null);
});

test("merging joins the next block when only blank lines separate them", () => {
  const lines = ['<!-- vml {"v":2,"rows":[{"height":300}]} -->', "![[a.png]]", "<!-- /vml -->", "", "<!-- vml -->", "![[b.png]] ![[c.png]]", "<!-- /vml -->"];
  const change = planMergeWithNext(lines, 1);
  assert.ok(change);

  assert.deepEqual(applyLineChanges(lines, [change]), [
    '<!-- vml {"v":2,"rows":[{"height":300}]} -->',
    "![[a.png]]",
    "![[b.png]] ![[c.png]]",
    "<!-- /vml -->",
  ]);
  assert.equal(planMergeWithNext(lines, 5), null);
  assert.equal(planMergeWithNext(lines, 3), null);
});

test("blocks separated by text, or that cannot be edited, are not merged", () => {
  assert.equal(planMergeWithNext(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->", "正文", "<!-- vml -->", "![[b.png]]", "<!-- /vml -->"], 0), null);
  assert.equal(planMergeWithNext(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->", '<!-- vml {"v":3} -->', "![[b.png]]", "<!-- /vml -->"], 0), null);
});

test("finds the block around a line", () => {
  const lines = ["正文", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->"];

  assert.equal(blockAt(lines, 2)?.openLine, 1);
  assert.equal(blockAt(lines, 0), null);
});

test("a planned change is applied to the editor in one transaction", () => {
  const editor = new MemoryEditor("前文\n![[a.png]]\n后文");
  const change = planWrapSelection(editor.getValue().split("\n"), 1, 1);
  assert.ok(change);

  applyLineChange(editor, change);

  assert.equal(editor.getValue(), "前文\n<!-- vml -->\n![[a.png]]\n<!-- /vml -->\n后文");
  assert.equal(editor.transactionCount, 1);
});
