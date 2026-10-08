import assert from "node:assert/strict";
import { test } from "node:test";
import { findV2Blocks } from "../src/format/v2.ts";
import { applyEditsToText, planModelEdit } from "../src/layout/edits.ts";
import { modelFromBlock, onlySizingDiffers, scaleRows, setBlockWidth, setCaption, setRowHeight, setSingleWidth, setWeights } from "../src/layout/model.ts";

const source = '<!-- vml {"v":2,"rows":[{"height":150}]} -->\n![[clip.mp4]] ![[other.mp4]]\n![[image.png]]\n<!-- /vml -->';
const block = findV2Blocks(source.split("\n"))[0];
const original = modelFromBlock(block);

test("actual saved sizing edits can keep the same players after parsing", () => {
  for (const next of [setBlockWidth(original, 0.7), setRowHeight(original, 0, 180), setSingleWidth(original, 1, 0.5),
    setWeights(original, 0, [1.5, 1]), scaleRows(setBlockWidth(original, 0.6), 0.8)]) {
    const edit = planModelEdit(block, next)!;
    const saved = applyEditsToText(source, [edit]);
    assert.equal(saved.ok, true);
    const parsed = modelFromBlock(findV2Blocks(saved.text.split("\n"))[0]);
    assert.equal(onlySizingDiffers(original, parsed), true);
  }
});

test("captions, media sources and media order require new rendering", () => {
  assert.equal(onlySizingDiffers(original, setCaption(original, { row: 0, index: 0 }, "New caption")), false);
  for (const text of [source.replace("clip.mp4", "new.mp4"), source.replace("![[clip.mp4]] ![[other.mp4]]", "![[other.mp4]] ![[clip.mp4]]")]) {
    assert.equal(onlySizingDiffers(original, modelFromBlock(findV2Blocks(text.split("\n"))[0])), false);
  }
});

test("text, references, typography, wrap and unknown settings cannot reuse a sizing-only update", () => {
  for (const next of [{ ...original, text: { left: "New @fig:x", right: null } }, { ...original, size: 1.2 },
    { ...original, cols: 2 }, { ...original, wrap: "right" as const }, { ...original, extra: { unknown: true } }]) {
    assert.equal(onlySizingDiffers(original, next), false);
  }
});
