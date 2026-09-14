import test from "node:test";
import assert from "node:assert/strict";

import { findV2Blocks, hasSideText } from "../src/format/v2.ts";
import { drawnFrom, isStale, recordDrawn, type Drawn } from "../src/layout/drawn.ts";

const note = [
  '<!-- vml {"v":2,"width":0.5} -->', // 0: a layout with text on the right
  "![[a.png]]",
  "右侧文字",
  "",
  "> 单独成段的引用",
  "<!-- /vml -->",
  "",
  "<!-- vml -->", // 7: a layout without text
  "![[b.png]]",
  "<!-- /vml -->",
  "",
  "<!-- vml -->", // 11: another layout with text, on the left
  "左侧文字",
  "![[c.png]]",
  "<!-- /vml -->",
];

function state(lines: readonly string[]): Drawn {
  return drawnFrom(findV2Blocks(lines));
}

/** Records every layout of `lines` as drawn, in order, the way a full render does. */
function drawAll(lines: readonly string[]): Drawn {
  const blocks = findV2Blocks(lines);
  const current = drawnFrom(blocks);
  const withText = blocks.filter(hasSideText);
  return blocks.reduce<Drawn | undefined>((drawn, block) => recordDrawn(drawn, current, withText.indexOf(block)), undefined) ?? current;
}

function replace(lines: readonly string[], index: number, line: string): string[] {
  return lines.map((current, at) => (at === index ? line : current));
}

test("drawn layouts show the comments of every layout and every line of those with text", () => {
  const drawn = state(note);
  assert.equal(drawn.comments, ['<!-- vml {"v":2,"width":0.5} -->', "<!-- /vml -->", "<!-- vml -->", "<!-- /vml -->", "<!-- vml -->", "<!-- /vml -->"].join("\n"));
  assert.deepEqual(drawn.texts, [note.slice(0, 6).join("\n"), note.slice(11).join("\n")]);
  assert.equal(isStale(drawAll(note), state(note)), false);
});

test("text changed in a section the layout is not drawn in leaves the layout stale until it is drawn again", () => {
  const drawn = drawAll(note);
  const changed = replace(note, 4, "> 改过的引用");
  // Obsidian re-renders only the quote's section, which is left empty and records nothing.
  assert.equal(isStale(drawn, state(changed)), true);

  // Drawing the layout again, from the new text, records it.
  const redrawn = recordDrawn(drawn, state(changed), 0);
  assert.equal(isStale(redrawn, state(changed)), false);
});

test("drawing one layout keeps what the others were drawn from", () => {
  const drawn = drawAll(note);
  const both = replace(replace(note, 4, "> 改过的引用"), 12, "改过的左侧文字");
  // The first layout's section is drawn again; the second one's text changed in its own section only.
  const partly = recordDrawn(drawn, state(both), 0);
  assert.equal(isStale(partly, state(both)), true);
  assert.equal(isStale(recordDrawn(partly, state(both), 1), state(both)), false);
});

test("settings, and layouts with text coming or going, are stale; layouts not drawn yet are not", () => {
  const drawn = drawAll(note);
  assert.equal(isStale(drawn, state(replace(note, 7, '<!-- vml {"v":2,"width":0.6} -->'))), true);
  // Text typed into the layout without text makes it one with text.
  assert.equal(isStale(drawn, state(replace(note, 9, "说明\n<!-- /vml -->").join("\n").split("\n"))), true);

  // Only the layout without text was drawn so far: the ones with text are drawn from the text of their time.
  const early = recordDrawn(undefined, state(note), -1);
  assert.deepEqual(early.texts, [null, null]);
  assert.equal(isStale(early, state(replace(note, 4, "> 改过的引用"))), false);
});
