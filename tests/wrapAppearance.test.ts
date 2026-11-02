import assert from "node:assert/strict";
import { test } from "node:test";
import { findV2Blocks } from "../src/format/v2.ts";
import { planWrapImage } from "../src/commands/plans.ts";
import { planWrapTable } from "../src/commands/tablePlans.ts";
import { keepNativeParagraphs, preserveWrapAppearance, wrapSpacing } from "../src/layout/wrapAppearance.ts";
import { metaFromModel, modelFromBlock, rowOffset, setSingleWidth, setWrap } from "../src/layout/model.ts";
import { wrapLines } from "../src/layout/edits.ts";
import { keepWrapAppearance } from "../src/view/wrapAppearance.ts";

const table = ["| A | B |  ", "| :--- | ---: |", "| One | Two |"];

test("wrapping preserves native width, alignment and nonstandard image aspect ratio in the opener", () => {
  for (const offset of [0, 0.5, 1, 0.27]) {
    const source = ["![[picture.png|240x80]]"];
    const change = preserveWrapAppearance(planWrapImage(source, 0, 0)!, {
      container: { left: 100, width: 1000 }, media: { left: 100 + 760 * offset, width: 240, height: 80 }, spacing: [0, 0],
    });
    assert.deepEqual(change.replacement.slice(1, -1), source);
    const block = findV2Blocks(change.replacement)[0], model = modelFromBlock(block);
    assert.equal(model.rows[0].width, 0.24);
    assert.equal(rowOffset(model.rows[0]), offset);
    assert.equal(model.rows[0].extra.aspect, 3);
    assert.deepEqual(model.extra.spacing, [0, 0]);
    assert.equal(keepNativeParagraphs([block]), true);
    const resized = setSingleWidth(model, 0, 0.4);
    assert.equal(metaFromModel(resized).rows[0].aspect, 3);
    assert.deepEqual(metaFromModel(resized).extra.spacing, [0, 0]);
  }
});

test("small tables retain their complete source and natural height instead of becoming full width", () => {
  const change = preserveWrapAppearance(planWrapTable(table, 1)!, {
    container: { left: 40, width: 1200 }, media: { left: 40, width: 72, height: 90 }, spacing: [16, 16],
  });
  assert.deepEqual(change.replacement.slice(1, -1), table);
  const model = modelFromBlock(findV2Blocks(change.replacement)[0]);
  assert.equal(model.rows[0].width, 0.06);
  assert.equal(rowOffset(model.rows[0]), 0);
  assert.equal(model.rows[0].extra.aspect, undefined);
  assert.deepEqual(model.extra.spacing, [16, 16]);
});

test("wide table conversion records its natural width for fitting without a scrolling viewport", () => {
  const change = preserveWrapAppearance(planWrapTable(table, 1)!, {
    container: { left: 40, width: 900 }, media: { left: 40, width: 1800, height: 90 }, spacing: [16, 16],
  });
  const model = modelFromBlock(findV2Blocks(change.replacement)[0]);
  assert.equal(model.rows[0].width, 1);
  assert.equal(model.rows[0].extra.tableWidth, 1800);
  assert.equal(model.rows[0].extra.tableViewport, undefined);
});

test("native paragraph spacing ends for floating layouts or an existing regular layout", () => {
  const native = findV2Blocks(wrapLines(table, { version: 3, rows: [], extra: { kind: "media", spacing: [16, 16] } }))[0];
  const regular = findV2Blocks(wrapLines(["![[a.png]]"]))[0];
  assert.equal(keepNativeParagraphs([native]), true);
  assert.equal(keepNativeParagraphs([]), false);
  assert.equal(keepNativeParagraphs([native, regular]), false);
  const floating = wrapLines(table, metaFromModel(setWrap(modelFromBlock(native), "right")));
  assert.equal(keepNativeParagraphs(findV2Blocks(floating)), false);
  assert.equal(keepNativeParagraphs(findV2Blocks(wrapLines(["Text"], { rows: [], extra: { spacing: [0, 0], type: "text" } }))), true);
  for (const invalid of [null, [], [1], [-1, 0], [NaN, 0], ["1", 0]]) assert.equal(wrapSpacing(invalid), null);
});

test("unmeasured media and multi-item plans are left unchanged", () => {
  const change = planWrapImage(["![[a.png]] ![[b.png]]"], 0, 0)!;
  assert.equal(preserveWrapAppearance(change, { container: { left: 0, width: 1000 }, media: { left: 0, width: 200, height: 100 }, spacing: [0, 0] }), change);
  const single = planWrapImage(["![[a.png]]"], 0, 0)!;
  assert.equal(preserveWrapAppearance(single, { container: { left: 0, width: 0 }, media: { left: 0, width: 0, height: 0 }, spacing: [0, 0] }), single);
});

test("activation measures the actual media and native outer block rather than the full-width widget", () => {
  const media = { matches: () => true, getBoundingClientRect: () => ({ left: 150, top: 216, bottom: 306, width: 125, height: 90 }),
    closest: () => ({ getBoundingClientRect: () => ({ top: 200, bottom: 322 }) }) };
  const view = { contentDOM: { clientWidth: 1000, getBoundingClientRect: () => ({ left: 150 }) } };
  const result = keepWrapAppearance(view as never, planWrapTable(table, 0)!, media as never);
  const model = modelFromBlock(findV2Blocks(result.replacement)[0]);
  assert.equal(model.rows[0].width, 0.125);
  assert.deepEqual(model.extra.spacing, [16, 16]);
  const wideOuter = { offsetHeight: 104, clientHeight: 92, scrollLeft: 120,
    win: { getComputedStyle: () => ({ paddingLeft: "16px", paddingRight: "16px" }) },
    getBoundingClientRect: () => ({ left: 134, right: 1166, top: 200, bottom: 304 }) };
  const wide = { matches: () => true, closest: () => wideOuter,
    getBoundingClientRect: () => ({ left: 30, top: 216, bottom: 276, width: 1800, height: 60 }) };
  const pane = { contentDOM: { clientWidth: 1000, getBoundingClientRect: () => ({ left: 150, right: 1150, width: 1000 }) } };
  const measured = keepWrapAppearance(pane as never, planWrapTable(table, 0)!, wide as never);
  const measuredModel = modelFromBlock(findV2Blocks(measured.replacement)[0]);
  assert.deepEqual(measuredModel.extra.spacing, [16, 16], "the scrollbar must not be counted twice as bottom spacing");
  assert.equal(measuredModel.rows[0].extra.tableWidth, 1800);
  assert.equal(measuredModel.rows[0].extra.tableViewport, undefined);
});
