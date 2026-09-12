import test from "node:test";
import assert from "node:assert/strict";

import { findV2Blocks, serializeOpener } from "../src/format/v2.ts";
import { positionOffset } from "../src/layout/geometry.ts";
import {
  metaFromModel,
  modelFromBlock,
  rowOffset,
  scaleRows,
  setAlign,
  setBlockWidth,
  setPosition,
  type LayoutModel,
} from "../src/layout/model.ts";

function model(lines: string[]): LayoutModel {
  const [block] = findV2Blocks(lines);
  assert.ok(block);
  return modelFromBlock(block);
}

// Row 0 holds two items 240px high; row 1 holds one item at 60% width, aligned left.
const sample = [
  '<!-- vml {"v":2,"rows":[{"height":240},{"width":0.6,"align":"left"}]} -->',
  "![[a.png]] ![[b.png]]",
  "![[c.png]]",
  "<!-- /vml -->",
];

test("a single item's position reads offset first, then align, and is centered by default", () => {
  const layout = model([
    '<!-- vml {"rows":[{"align":"right"},{"offset":0.25,"align":"left"},{},{"offset":2},{"offset":0.3}]} -->',
    "![[a.png]]",
    "![[b.png]]",
    "![[c.png]]",
    "![[d.png]]",
    "![[e.png]] ![[f.png]]",
    "<!-- /vml -->",
  ]);

  assert.deepEqual(layout.rows.slice(0, 4).map(rowOffset), [1, 0.25, 0.5, 0.5]);
  assert.equal(layout.rows[4]?.offset, null);
});

test("left, center and right are stored as align; any other position as offset", () => {
  const layout = model(sample);

  assert.deepEqual(metaFromModel(setPosition(layout, 1, 0.3)).rows[1], { width: 0.6, offset: 0.3 });
  assert.deepEqual(metaFromModel(setPosition(layout, 1, 1)).rows[1], { width: 0.6, align: "right" });
  assert.deepEqual(metaFromModel(setPosition(layout, 1, 0.5)).rows[1], { width: 0.6, align: "center" });
  assert.deepEqual(metaFromModel(setPosition(layout, 1, -2)).rows[1], { width: 0.6, align: "left" });
  assert.deepEqual(metaFromModel(setAlign(setPosition(layout, 1, 0.3), 1, "right")).rows[1], { width: 0.6, align: "right" });
  assert.equal(setPosition(layout, 0, 0.3), layout);
  assert.equal(setPosition(layout, 1, Number.NaN), layout);
});

test("the block width is read from the opening comment and not stored at full width", () => {
  const layout = model(['<!-- vml {"v":2,"width":0.5} -->', "![[a.png]]", "<!-- /vml -->"]);

  assert.equal(layout.width, 0.5);
  assert.equal(serializeOpener(metaFromModel(layout)), '<!-- vml {"v":2,"width":0.5,"rows":[]} -->');
  assert.equal(setBlockWidth(layout, 0.05).width, 0.2);
  assert.equal(setBlockWidth(layout, 0.6666).width, 0.667);
  assert.equal(serializeOpener(metaFromModel(setBlockWidth(layout, 1.4))), "<!-- vml -->");
  assert.equal(setBlockWidth(layout, Number.NaN), layout);
  assert.equal(model(['<!-- vml {"width":"wide"} -->', "![[a.png]]", "<!-- /vml -->"]).width, null);
  assert.equal(model(['<!-- vml {"width":0.1} -->', "![[a.png]]", "<!-- /vml -->"]).width, null);
});

test("scaling rows multiplies their heights and, when asked, the widths of single items", () => {
  const layout = model(sample);

  const taller = metaFromModel(scaleRows(layout, 1.5)).rows;
  assert.deepEqual(taller.map((row) => [row.height, row.width]), [[360, undefined], [undefined, 0.6]]);

  const smaller = metaFromModel(scaleRows(layout, 0.5, [null, 0.8])).rows;
  // The stored width wins over the share the item currently takes up.
  assert.deepEqual(smaller.map((row) => [row.height, row.width]), [[120, undefined], [undefined, 0.3]]);

  const natural = model(["<!-- vml -->", "![[a.png]] ![[b.png]]", "![[c.png]]", "![[d.png]]", "<!-- /vml -->"]);
  // The last item keeps its natural size: nothing says how wide it is now.
  assert.deepEqual(metaFromModel(scaleRows(natural, 2, [null, 0.7, null])).rows, [{ height: 440 }, { width: 1 }, {}]);
  assert.equal(scaleRows(layout, 0), layout);
});

test("a single item's position follows the pointer and snaps to left, center and right", () => {
  // 200px of free space; the item starts 50px from the left edge of its row.
  assert.equal(positionOffset(50, 30, 200, 8), 0.4);
  assert.equal(positionOffset(50, 45, 200, 8), 0.5);
  assert.equal(positionOffset(50, -45, 200, 8), 0);
  assert.equal(positionOffset(50, 400, 200, 8), 1);
  assert.equal(positionOffset(50, 10, 0, 8), 0.5);
});

test("corner scaling makes native and natural single sizes proportional without scaling twice", () => {
  const layout = model([
    '<!-- vml {"rows":[{},{},{"width":0.5},{"height":240}]} -->',
    "![[native.png|200]]",
    "![[natural.png]]",
    "![[proportional.png]]",
    "![[a.png]] ![[b.png]]",
    "<!-- /vml -->",
  ]);
  const resized = scaleRows(setBlockWidth(layout, 0.5), 0.5, [0.25, 0.375, 0.5, null], 1);
  // In an 800px row, 200px and 300px images become 100px and 150px in a 400px row.
  assert.deepEqual(resized.rows.slice(0, 3).map((row) => (row.width ?? 0) * 400), [100, 150, 200]);
  assert.equal(resized.rows[3]?.height, 120);
  assert.deepEqual(resized.rows.map((row) => row.items.map((item) => item.embed.raw)),
    layout.rows.map((row) => row.items.map((item) => item.embed.raw)));
  assert.equal(layout.rows[0]?.width, null);
});
