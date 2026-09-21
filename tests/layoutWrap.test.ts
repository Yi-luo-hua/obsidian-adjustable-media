import test from "node:test";
import assert from "node:assert/strict";

import { findV2Blocks, readBlockSkip, readBlockWrap, serializeOpener, type V2Block } from "../src/format/v2.ts";
import { applyEditsToEditor, applyEditsToText, planModelEdit, type BlockEdit } from "../src/layout/edits.ts";
import { skipLines, wrapZone } from "../src/layout/geometry.ts";
import {
  effectiveWidth,
  metaFromModel,
  modelFromBlock,
  removeItem,
  setBlockWidth,
  setSkip,
  setWrap,
  type LayoutModel,
} from "../src/layout/model.ts";
import { blockForMove, blockGaps, isSamePlace, pickGap, planPlacement } from "../src/layout/placement.ts";
import { planGaps, planProxy, type FlowBox, type FloatSize } from "../src/layout/wrapGaps.ts";
import { MemoryEditor } from "./support/memoryEditor.ts";

function block(lines: readonly string[], index = 0): V2Block {
  const found = findV2Blocks(lines)[index];
  assert.ok(found, `expected block #${index}`);
  return found;
}

function model(opener: string): LayoutModel {
  return modelFromBlock(block([opener, "![[a.png]]", "<!-- /vml -->"]));
}

test("moving a layout cannot split a fenced code block or enter an unclosed fence at EOF", () => {
  const prefix = ['<!-- vml -->', '![[a.png]]', '<!-- /vml -->', ''];
  const lines = [...prefix, '```python', 'print(1)', '', 'print(2)', '```', '', 'Tail'];
  const original = lines.join('\n');
  for (let line = 4; line <= 8; line += 1) {
    assert.equal(planPlacement(lines, block(lines), { line, wrap: 'right', skip: 0 }), null);
  }
  const unclosed = lines.slice(0, 8);
  assert.equal(blockGaps(unclosed).includes(unclosed.length), false);
  assert.equal(planPlacement(unclosed, block(unclosed), { line: unclosed.length, wrap: null, skip: 0 }), null);
  assert.equal(lines.join('\n'), original);
  assert.ok(planPlacement(lines, block(lines), { line: 10, wrap: 'right', skip: 0 }));
});

function apply(lines: readonly string[], edits: readonly BlockEdit[] | null): string[] {
  assert.ok(edits);
  const result = applyEditsToText(lines.join("\n"), edits);
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result)}`);
  return result.text.split("\n");
}

test("wrap and skip are read from the opening comment; invalid values count as unset", () => {
  assert.deepEqual(["left", "right", "center", 1, null, undefined].map(readBlockWrap), ["left", "right", null, null, null, null]);
  assert.deepEqual([3, 2.6, 0, -1, 41, "2", Number.NaN].map(readBlockSkip), [3, 3, null, null, null, null, null]);

  const wrapped = model('<!-- vml {"v":2,"width":0.3,"wrap":"right","skip":2} -->');
  assert.deepEqual([wrapped.width, wrapped.wrap, wrapped.skip], [0.3, "right", 2]);
  assert.deepEqual(model('<!-- vml {"wrap":"up","skip":"x"} -->').wrap, null);
});

test("wrap settings round-trip, and unset or meaningless ones stay out of the comment", () => {
  const opener = '<!-- vml {"v":2,"width":0.3,"wrap":"right","skip":2,"theme":"x"} -->';
  assert.equal(serializeOpener(metaFromModel(model(opener))), opener);
  // Without wrapping, skip means nothing.
  assert.equal(serializeOpener(metaFromModel(model('<!-- vml {"skip":2} -->'))), "<!-- vml -->");
  assert.equal(serializeOpener(metaFromModel(model('<!-- vml {"wrap":"middle"} -->'))), "<!-- vml -->");
});

test("wrapping gives a full-width layout room for text and caps a wide one", () => {
  const full = model("<!-- vml -->");
  const left = setWrap(full, "left");
  assert.deepEqual([left.wrap, left.width, effectiveWidth(left)], ["left", 0.4, 0.4]);
  assert.equal(serializeOpener(metaFromModel(left)), '<!-- vml {"v":2,"width":0.4,"wrap":"left"} -->');
  assert.equal(setWrap(model('<!-- vml {"width":0.95} -->'), "right").width, 0.8);
  assert.equal(setWrap(left, "left"), left);

  // A hand-written wrap without a width is drawn at the default width.
  assert.equal(effectiveWidth(model('<!-- vml {"wrap":"left"} -->')), 0.4);
  assert.equal(effectiveWidth(full), null);
});

test("stopping the wrap keeps the width and drops skip; skip needs a wrap", () => {
  const wrapped = setSkip(setWrap(model('<!-- vml {"width":0.5} -->'), "left"), 3);
  assert.equal(wrapped.skip, 3);

  const plain = setWrap(wrapped, null);
  assert.deepEqual([plain.wrap, plain.skip, plain.width], [null, null, 0.5]);
  assert.equal(setSkip(plain, 2), plain);
  assert.equal(setSkip(wrapped, 0).skip, null);
  assert.equal(setSkip(wrapped, 99).skip, 40);
  assert.equal(setSkip(wrapped, 3), wrapped);
});

test("a wrapped layout cannot be widened past the room text needs", () => {
  const wrapped = setWrap(model("<!-- vml -->"), "left");
  assert.equal(setBlockWidth(wrapped, 1.2).width, 0.8);
  assert.equal(setBlockWidth(setWrap(wrapped, null), 1.2).width, null);
});

test("wrap settings survive changes to the rows", () => {
  const two = modelFromBlock(block(['<!-- vml {"v":2,"width":0.4,"wrap":"left"} -->', "![[a.png]] ![[b.png]]", "<!-- /vml -->"]));
  const taken = removeItem(two, { row: 0, index: 1 });
  assert.ok(taken);
  assert.deepEqual([taken.model.wrap, taken.model.width], ["left", 0.4]);
});

// A note with every kind of line a moved block must not split.
const mixed = [
  "---", // 0
  "title: x", // 1
  "---", // 2
  "# 标题", // 3: right after the frontmatter
  "第一段", // 4: right after a heading
  "", // 5
  "<!-- vml -->", // 6: another layout
  "![[a.png]]", // 7
  "<!-- /vml -->", // 8
  "第二段", // 9: right after a layout
  "", // 10
  "- 列表一", // 11: a list starts
  "", // 12
  "- 列表二", // 13: the same list goes on
  "  缩进的续行", // 14
  "", // 15
  "```", // 16
  "代码", // 17
  "```", // 18
  "", // 19
  "第三段", // 20
];

test("a block may go in front of any top-level Markdown block, and to the end", () => {
  assert.deepEqual(blockGaps(mixed), [3, 4, 6, 9, 11, 20, 21]);
});

const note = [
  "第一段", // 0
  "", // 1
  "<!-- vml -->", // 2
  "![[a.png]]", // 3
  "<!-- /vml -->", // 4
  "", // 5
  "第二段", // 6
  "", // 7
  "第三段", // 8
];
const LAYOUT = ["<!-- vml -->", "![[a.png]]", "<!-- /vml -->"];
const WRAPPED_LEFT = '<!-- vml {"v":2,"width":0.4,"wrap":"left"} -->';

test("moves after closed non-text sections validate the target while preserving the section", () => {
  for (const section of [["~~~", "code", "~~~"], ["$$", "x", "$$"], ["<!--", "comment", "-->"], ["%%", "comment", "%%"], ["---", "key: value", "---"]]) {
    const lines = [...section, "target", "", ...LAYOUT, "", "end"];
    const target = section.length;
    assert.ok(blockGaps(lines).includes(target));
    const edits = planPlacement(lines, block(lines), { line: target, wrap: null, skip: 0 });
    assert.ok(edits);
    const expected = [...section, "", ...LAYOUT, "", "target", "", "end"];
    assert.deepEqual(apply(lines, edits), expected);
    const editor = new MemoryEditor(lines.join("\n"));
    assert.deepEqual(applyEditsToEditor(editor, edits), { ok: true });
    assert.equal(editor.transactionCount, 1);
    assert.equal(editor.getValue(), expected.join("\n"));
    assert.deepEqual(applyEditsToText(lines.join("\r\n"), edits), { ok: true, text: expected.join("\r\n") });
    const changed = [...lines];
    changed[target - 1] += "changed";
    assert.equal(applyEditsToText(changed.join("\n"), edits).ok, false);
    // The same two anchor lines inside a new fence must never become a fallback target.
    assert.equal(applyEditsToText(["````", ...lines.slice(0, target + 1), "````", "", ...LAYOUT].join("\n"), edits).ok, false);
  }
});

test("duplicate layouts resolve at the widget position, including after lines are inserted above", () => {
  const lines = [...LAYOUT, "", ...LAYOUT, "", "end"];
  const original = block(lines);
  for (const at of [0, 4]) {
    const found = blockForMove(lines, original, at);
    assert.equal(typeof found, "object");
    if (typeof found !== "string") assert.equal(found.openLine, at);
  }
  const shifted = blockForMove(["intro", "", ...lines], original, 6);
  assert.equal(typeof shifted, "object");
  if (typeof shifted !== "string") assert.equal(shifted.openLine, 6);
  assert.equal(blockForMove(lines, original, 3), "ambiguous");
  assert.equal(blockForMove(["nothing"], original, 0), "not-found");
  const unique = blockForMove(["intro", "", ...LAYOUT], original, 0);
  assert.equal(typeof unique, "object");
  if (typeof unique !== "string") assert.equal(unique.openLine, 2);
  assert.equal(blockForMove(["~~~", ...LAYOUT, "~~~"], original, 1), "not-found");
});

test("in front of itself or of the next paragraph, a block stays where it is", () => {
  const layout = block(note);
  assert.equal(isSamePlace(note, layout, 2), true);
  assert.equal(isSamePlace(note, layout, 6), true);
  assert.equal(isSamePlace(note, layout, 8), false);
  assert.deepEqual(planPlacement(note, layout, { line: 6, wrap: null, skip: 0 }), []);

  // Only the opening comment changes.
  assert.deepEqual(apply(note, planPlacement(note, layout, { line: 6, wrap: "right", skip: 2 })), [
    "第一段", "", '<!-- vml {"v":2,"width":0.4,"wrap":"right","skip":2} -->', "![[a.png]]", "<!-- /vml -->", "", "第二段", "", "第三段",
  ]);
});

test("a moved block keeps its body, and paragraphs keep one blank line between them", () => {
  const layout = block(note);
  assert.deepEqual(apply(note, planPlacement(note, layout, { line: 8, wrap: null, skip: 0 })), [
    "第一段", "", "第二段", "", ...LAYOUT, "", "第三段",
  ]);
  assert.deepEqual(apply(note, planPlacement(note, layout, { line: 0, wrap: null, skip: 0 })), [
    ...LAYOUT, "", "第一段", "", "第二段", "", "第三段",
  ]);
  assert.deepEqual(apply(note, planPlacement(note, layout, { line: 9, wrap: null, skip: 0 })), [
    "第一段", "", "第二段", "", "第三段", "", ...LAYOUT,
  ]);
  // A note ending in a line break keeps it.
  assert.deepEqual(apply([...note, ""], planPlacement([...note, ""], layout, { line: 10, wrap: null, skip: 0 })), [
    "第一段", "", "第二段", "", "第三段", "", ...LAYOUT, "",
  ]);
});

test("a block that wraps text sits right on top of that text", () => {
  assert.deepEqual(apply(note, planPlacement(note, block(note), { line: 8, wrap: "left", skip: 0 })), [
    "第一段", "", "第二段", "", WRAPPED_LEFT, "![[a.png]]", "<!-- /vml -->", "第三段",
  ]);

  // Moved away again, it leaves that text as it found it.
  const glued = ["a", "", WRAPPED_LEFT, "![[a.png]]", "<!-- /vml -->", "b", "", "c"];
  assert.deepEqual(apply(glued, planPlacement(glued, block(glued), { line: 7, wrap: null, skip: 0 })), [
    "a", "", "b", "", '<!-- vml {"v":2,"width":0.4} -->', "![[a.png]]", "<!-- /vml -->", "", "c",
  ]);
});

test("unchanged settings keep the opening comment exactly as written", () => {
  const spaced = ['<!-- vml {"v":2, "rows":[]} -->', "![[a.png]]", "<!-- /vml -->", "", "x", "", "y"];
  assert.deepEqual(apply(spaced, planPlacement(spaced, block(spaced), { line: 6, wrap: null, skip: 0 })).slice(2, 5), spaced.slice(0, 3));
});

test("a move is one transaction, keeps CRLF, and is not written when the note changed", () => {
  const layout = block(note);
  const edits = planPlacement(note, layout, { line: 8, wrap: "left", skip: 0 });
  assert.ok(edits);

  const editor = new MemoryEditor(note.join("\n"));
  assert.deepEqual(applyEditsToEditor(editor, edits), { ok: true });
  assert.equal(editor.transactionCount, 1);
  assert.equal(editor.getValue(), apply(note, edits).join("\n"));

  const crlf = applyEditsToText(`${note.join("\r\n")}\r\n`, edits);
  assert.ok(crlf.ok);
  assert.equal(crlf.text, `${apply(note, edits).join("\r\n")}\r\n`);

  const changed = new MemoryEditor(note.join("\n").replace("第三段", "改过的第三段"));
  assert.deepEqual(applyEditsToEditor(changed, edits), { ok: false, reason: "not-found" });
  assert.equal(changed.transactionCount, 0);
});

test("blocks that cannot be edited are never moved", () => {
  const broken = ['<!-- vml {"v":3} -->', "![[a.png]]", "<!-- /vml -->", "", "x"];
  assert.equal(planPlacement(broken, block(broken), { line: 5, wrap: null, skip: 0 }), null);
});

test("removing a block at the top of the note takes the blank line after it along", () => {
  const top = [...LAYOUT, "", "正文"];
  const layout = block(top);
  const emptied = removeItem(modelFromBlock(layout), { row: 0, index: 0 });
  assert.ok(emptied);
  const edit = planModelEdit(layout, emptied.model);
  assert.ok(edit);
  assert.deepEqual(apply(top, [edit]), ["正文"]);
});

test("the pointer picks the side and the line a moved layout starts at", () => {
  assert.deepEqual([10, 99, 100, 150, 200, 201, 290].map((x) => wrapZone(x, 0, 300)), ["left", "left", null, null, null, "right", "right"]);
  assert.deepEqual([[1050, 1000], [990, 1000], [5000, 1000]].map(([y = 0, top = 0]) => skipLines(y, top, 24, 40)), [2, 0, 40]);
  assert.equal(skipLines(1050, 1000, 0, 40), 0);

  const gaps = [{ line: 0, top: 0 }, { line: 5, top: 100 }, { line: 9, top: 300 }];
  assert.equal(pickGap(gaps, 250, true)?.line, 5);
  assert.equal(pickGap(gaps, -10, true)?.line, 0);
  assert.equal(pickGap(gaps, 250, false)?.line, 9);
  assert.equal(pickGap([], 10, false), null);
});

function box(pos: number, top: number, height: number, mapTop: number, extra: Partial<FlowBox> = {}): FlowBox {
  return { pos, top, height, mapTop, spacer: false, floatBottom: null, ...extra };
}

// A 300px float anchored at the top, 200px of text beside it, then a table too wide to sit beside it.
const anchor = box(0, 0, 0, 0, { floatBottom: 300 });
const beside = box(10, 0, 200, 0);

test("an element pushed below a float gets a spacer as high as the push, and only that one", () => {
  assert.deepEqual(planGaps([box(0, 0, 24, 0), box(10, 24, 24, 24)]), []);
  assert.deepEqual(planGaps([anchor, beside, box(20, 300, 80, 200), box(30, 380, 24, 280)]), [{ pos: 20, height: 100 }]);
  // Drift that has nothing to do with a float is CodeMirror's business.
  assert.deepEqual(planGaps([anchor, box(10, 0, 400, 0), box(20, 410, 24, 400)]), []);
});

test("a spacer follows its float: it grows, shrinks and goes", () => {
  const spacer = box(20, 200, 100, 200, { spacer: true });
  assert.deepEqual(planGaps([anchor, beside, spacer, box(20, 300, 80, 200)]), [{ pos: 20, height: 100 }]);
  assert.deepEqual(planGaps([box(0, 0, 0, 0, { floatBottom: 350 }), beside, spacer, box(20, 350, 80, 200)]), [{ pos: 20, height: 150 }]);
  assert.deepEqual(planGaps([box(0, 0, 0, 0, { floatBottom: 260 }), beside, spacer, box(20, 300, 80, 200)]), [{ pos: 20, height: 60 }]);
  assert.deepEqual(planGaps([box(0, 0, 0, 0, { floatBottom: 150 }), beside, spacer, box(20, 300, 80, 200)]), []);
  // One whose element was not measured keeps its height.
  assert.deepEqual(planGaps([anchor, beside, spacer]), [{ pos: 20, height: 100 }]);
});

const size: FloatSize = { side: "left", layoutTop: 4, layoutHeight: 400, width: 280, margin: 24, marginBottom: 8 };

test("a stand-in covers the part of a float below the first line drawn", () => {
  assert.deepEqual(planProxy(1000, size, 1200), { sandbag: 0, height: 212, shift: 196 });
  assert.equal(planProxy(1000, size, 1500), null);
  // A layout that starts further down leaves the lines above it their full width.
  assert.deepEqual(planProxy(1000, { ...size, layoutTop: 72 }, 1040), { sandbag: 32, height: 408, shift: 0 });
});
