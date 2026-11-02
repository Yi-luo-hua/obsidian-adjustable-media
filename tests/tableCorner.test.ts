import assert from "node:assert/strict";
import { test } from "node:test";
import { findV2Blocks, serializeBlock } from "../src/format/v2.ts";
import { cornerScale } from "../src/layout/geometry.ts";
import { keepSingleSizes, metaFromModel, modelFromBlock, moveItem, onlySizingDiffers, rowEmbeds, scaleRows, setBlockWidth, setSingleWidth, setTableScale } from "../src/layout/model.ts";
import { applyEditsToText, planModelEdit } from "../src/layout/edits.ts";

const a = ["| Name | Value |  ", "| :--- | ---: |", "| Alpha | 10 |"], b = ["| Other | Count |", "| --- | --- |", "| Beta | 20 |"];
const source = ['<!-- vml {"v":3,"kind":"media","rows":[{"items":2,"tableScales":[1.5,0.75]},{"items":1}]} -->',
  ...a, "", ...b, "", "![[a.png]]", "<!-- /vml -->"];

test("table corners accept vertical-only, horizontal-only and diagonal pointer movements", () => {
  assert.equal(cornerScale(200, 100, 0, 50), 1.5);
  assert.equal(cornerScale(200, 100, 100, 0), 1.5);
  assert.equal(cornerScale(200, 100, 10, -50), 0.5);
  assert.equal(cornerScale(200, 100, -100, -5), 0.5);
  assert.equal(cornerScale(200, 100, 50, 25), 1.25);
  assert.equal(cornerScale(0, 0, 50, 25), 1);
});

test("table magnification travels with the item when reordered and mixed with an image", () => {
  const model = modelFromBlock(findV2Blocks(source)[0]);
  assert.deepEqual(model.rows[0].items.map(item => item.tableScale), [1.5, 0.75]);
  const moved = moveItem(model, { row: 0, index: 0 }, { kind: "beside", position: { row: 1, index: 0 }, side: "after" });
  assert.deepEqual(metaFromModel(moved).rows.map(row => row.tableScales), [[0.75], [null, 1.5]]);
  const roundtrip = modelFromBlock(findV2Blocks(serializeBlock(metaFromModel(moved), rowEmbeds(moved)))[0]);
  assert.equal(roundtrip.rows[1].items[1].tableScale, 1.5);
});

test("frame scaling uses the measured table scales and changes only the opener", () => {
  const block = findV2Blocks(source)[0], model = modelFromBlock(block);
  const next = scaleRows(model, 2, [null, 0.5], 1, [[0.4, 0.25], [null]]);
  assert.deepEqual(next.rows[0].items.map(item => item.tableScale), [0.8, 0.5]);
  assert.equal(next.rows[0].height, null, "tables scale their content rather than creating an unused row height");
  assert.equal(onlySizingDiffers(model, next), true);
  const result = applyEditsToText(source.join("\r\n"), [planModelEdit(block, next)!]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.text.split("\r\n").slice(1), source.slice(1));
  assert.equal(scaleRows(model, 2).rows[0].items[0].tableScale, 3);
});

test("manual table resizing updates width and magnification together; non-tables remain unchanged", () => {
  const model = modelFromBlock(findV2Blocks(['<!-- vml {"v":3,"kind":"media"} -->', ...a, '<!-- /vml -->'])[0]);
  const next = setTableScale(setSingleWidth(model, 0, 0.4), 0, 0, 2);
  assert.equal(next.rows[0].width, 0.4);
  assert.deepEqual(metaFromModel(next).rows[0].tableScales, [2]);
  assert.equal(setSingleWidth(model, 0, 0.03).rows[0].width, 0.03, "small tables can shrink below the image width minimum");
  const narrow = setSingleWidth(model, 0, 0.03);
  assert.equal(scaleRows(narrow, 0.5, [0.03]).rows[0].width, 0.015);
  assert.equal(keepSingleSizes(narrow, setBlockWidth(narrow, 0.5), 1000).rows[0].width, 0.06);
  assert.equal(onlySizingDiffers(model, next), true);
  const image = modelFromBlock(findV2Blocks(['<!-- vml -->', '![[a.png]]', '<!-- /vml -->'])[0]);
  assert.equal(setTableScale(image, 0, 0, 2), image);
  assert.equal(setSingleWidth(image, 0, 0.03).rows[0].width, 0.1);
});
