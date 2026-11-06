import assert from "node:assert/strict";
import { test } from "node:test";
import { findV2Blocks } from "../src/format/v2.ts";
import { readingBlankExtras } from "../src/markdown/readingSpacing.ts";

const prefix = '<!-- vml -->\n![[a.png]]\n<!-- /vml -->\n\n';
const gaps = (text: string): Array<[number, number]> => {
  const lines = text.split("\n");
  return [...readingBlankExtras(lines, findV2Blocks(lines))];
};

test("reading paragraphs retain the extra two and four authored blank lines", () => {
  for (const count of [1, 3, 5]) {
    const text = prefix + "One" + "\n".repeat(count + 1) + "Two";
    assert.deepEqual(gaps(text), count === 1 ? [] : [[4, count - 1]]);
  }
});

test("layout contents and protected Markdown whitespace never gain paragraph gaps", () => {
  const text = '<!-- vml {"type":"text"} -->\nInside\n\n\nBlock\n<!-- /vml -->\n\n```\nCode\n\n\nEnd\n```\n\n$$\nMath\n\n\nEnd\n$$\n\n<!--\nComment\n\n\nEnd\n-->';
  assert.deepEqual(gaps(text), []);
});

test("ordinary notes and trailing whitespace keep their host rendering", () => {
  assert.deepEqual(gaps("One\n\n\n\nTwo"), []);
  assert.deepEqual(gaps(prefix + "One\n\n\n\n"), []);
});
