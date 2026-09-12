import test from "node:test";
import assert from "node:assert/strict";

import { planWrap } from "../src/input/insertion.ts";
import { applyLineChanges } from "../src/layout/edits.ts";

function run(lines: string[], targets: number[], mergeWithPrevious = true): string[] | null {
  const change = planWrap(lines, targets, { mergeWithPrevious });
  return change ? applyLineChanges(lines, [change]) : null;
}

test("a single inserted embed line is wrapped in a new block", () => {
  assert.deepEqual(run(["正文", "", "![[a.png]]"], [2]), ["正文", "", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->"]);
});

test("embeds dropped together are gathered into rows of four and their blank lines dropped", () => {
  const dropped = ["---", "![[1.png]]", "", "![[2.png]]", "", "![[3.png]]", "", "![[4.png]]", "", "![[5.png]]"];

  assert.deepEqual(run(dropped, [1, 3, 5, 7, 9]), [
    "---",
    "<!-- vml -->",
    "![[1.png]] ![[2.png]] ![[3.png]] ![[4.png]]",
    "![[5.png]]",
    "<!-- /vml -->",
  ]);
});

test("embeds pasted with no space between keep their exact text", () => {
  assert.deepEqual(run(["![[a.png]]![b](c.jpg)"], [0]), ["<!-- vml -->", "![[a.png]] ![b](c.jpg)", "<!-- /vml -->"]);
});

test("media inserted right below a layout joins its last row", () => {
  const lines = ['<!-- vml {"v":2,"rows":[{"height":300}]} -->', "![[a.png]] ![[b.png]]", "<!-- /vml -->", "", "![[c.png]]"];

  assert.deepEqual(run(lines, [4]), ['<!-- vml {"v":2,"rows":[{"height":300}]} -->', "![[a.png]] ![[b.png]] ![[c.png]]", "<!-- /vml -->"]);
  assert.deepEqual(run(lines, [4], false), [...lines.slice(0, 4), "<!-- vml -->", "![[c.png]]", "<!-- /vml -->"]);
});

test("a full last row spills into a new row with the same height", () => {
  const lines = ['<!-- vml {"v":2,"rows":[{"height":300}]} -->', "![[1.png]] ![[2.png]] ![[3.png]] ![[4.png]]", "<!-- /vml -->", "![[5.png]]"];

  assert.deepEqual(run(lines, [3]), [
    '<!-- vml {"v":2,"rows":[{"height":300},{"height":300}]} -->',
    "![[1.png]] ![[2.png]] ![[3.png]] ![[4.png]]",
    "![[5.png]]",
    "<!-- /vml -->",
  ]);
});

test("a block above with unreadable settings is left alone; the new lines get their own block", () => {
  const lines = ['<!-- vml {"v":3} -->', "![[a.png]]", "<!-- /vml -->", "", "![[b.png]]"];

  assert.deepEqual(run(lines, [4]), [...lines.slice(0, 4), "<!-- vml -->", "![[b.png]]", "<!-- /vml -->"]);
});

test("nothing is planned for other text, code, existing blocks or non-media embeds", () => {
  assert.equal(run(["![[a.png]] 说明"], [0]), null);
  assert.equal(run(["```", "![[a.png]]", "```"], [1]), null);
  assert.equal(run(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->"], [1]), null);
  assert.equal(run(["![[a.png]]", "正文", "![[b.png]]"], [0, 2]), null);
  assert.equal(run(["![[笔记]]"], [0]), null);
  assert.equal(run(["![[a.png]]"], []), null);
});
