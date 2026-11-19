import assert from "node:assert/strict";
import test from "node:test";

import { findV2Blocks } from "../src/format/v2.ts";
import { applyEditsToText, planModelEdit, type BlockEdit } from "../src/layout/edits.ts";
import { layoutStacks, planStackDissolve, planStackMove, planStackSizing, planStackSwap } from "../src/layout/layoutStack.ts";
import { modelFromBlock, setBlockWidth } from "../src/layout/model.ts";
import { printPlan } from "../src/markdown/print.ts";

const owner = '<!-- vml {"v":3,"kind":"stack-member","type":"text","stack":{"id":"demo","width":0.8}} -->';
const member = '<!-- vml {"v":3,"kind":"stack-member","type":"text","width":0.6,"stack":{"id":"demo"}} -->';
const first = ["> [!quote] Quote", "> Body with trailing space.  "];
const second = ["> A second quote.", "", "![[sample.png|200]]"];
const source = ["Before.", "", owner, ...first, "<!-- /vml -->", "", member, ...second, "<!-- /vml -->", "", "After.", ""].join("\r\n");

function stacksOf(text: string) {
  const lines = text.split("\n");
  return layoutStacks(lines, findV2Blocks(lines));
}

function apply(text: string, edits: BlockEdit[]) {
  const result = applyEditsToText(text, edits);
  assert.ok(result.ok);
  return result.text;
}

test("resizes the stack and a child independently, preserving the other member and source", () => {
  const [stack] = stacksOf(source);
  const resized = apply(source, [planStackSizing(stack, 0.65)!]);
  assert.equal(resized, source.replace('"width":0.8', '"width":0.65'));
  const current = stacksOf(resized)[0];
  const child = current.members[1];
  const resizedChild = apply(resized, [planModelEdit(child, setBlockWidth(modelFromBlock(child), 0.5))!]);
  const [result] = stacksOf(resizedChild);
  assert.equal(result.width, 0.65);
  assert.equal(modelFromBlock(result.members[1]).width, 0.5);
  assert.deepEqual(result.members[1].lines.slice(1, -1), second);
  assert.equal(result.members[0].lines.join("\n"), current.members[0].lines.join("\n"));

  const [old] = stacksOf(source);
  const stale = applyEditsToText(source.replace(first[0], "> Changed"), [planStackSizing(old, 0.65)!],
    [{ fromLine: old.openLine, lines: source.split("\n").slice(old.openLine, old.closeLine + 1) }]);
  assert.deepEqual(stale, { ok: false, reason: "stale-dependency" });
});

test("moves a complete range, swaps children, and dissolves the group without losing settings", () => {
  const [stack] = stacksOf(source);
  const lines = source.split("\n");
  assert.deepEqual(planStackMove(lines, stack, stack.closeLine + 1), []);
  const moved = apply(source, planStackMove(lines, stack, lines.length));
  assert.ok(moved.indexOf("After.") < moved.indexOf(owner));
  assert.deepEqual(stacksOf(moved)[0].lines, stack.lines);

  const swapped = apply(moved, [planStackSwap(stacksOf(moved)[0])]);
  const [next] = stacksOf(swapped);
  assert.equal(next.width, stack.width);
  assert.equal(modelFromBlock(next.members[0]).width, 0.6);
  assert.deepEqual(next.members.map(block => block.lines.slice(1, -1)), [second, first]);
  const dissolved = apply(swapped, planStackDissolve(next));
  assert.deepEqual(stacksOf(dissolved), []);
  const standalone = findV2Blocks(dissolved.split("\n"));
  assert.deepEqual(standalone.map(block => block.lines.slice(1, -1)), [second, first]);
  assert.equal(modelFromBlock(standalone[0]).width, 0.6);
});

test("only adjacent members group, and a print plan gives the group one slot", () => {
  assert.equal(stacksOf(source.replace(member, `Separate paragraph.\r\n\r\n${member}`)).length, 0);
  const plan = printPlan(source, "print");
  assert.equal(plan.stacks?.length, 1);
  assert.equal(plan.markdown.match(/data-vml-print=/g)?.length, 1);
  assert.match(plan.markdown, /Before\.[\s\S]*After\./);
});
