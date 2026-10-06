import test from "node:test";
import assert from "node:assert/strict";

import { paragraphBreaks, type ParagraphBreak } from "../src/markdown/paragraphBreaks.ts";

const lines = (breaks: ParagraphBreak[]): string[] => breaks.map((item) => `${item.line}:${item.kind}`);

test("blank lines between paragraphs become breaks; more blank lines in a run are extra", () => {
  assert.deepEqual(lines(paragraphBreaks(["One.", "", "Two.", "", "", "", "Three."], [])),
    ["1:blank", "3:blank", "4:extra", "5:extra"]);
});

test("a heading keeps the spacing above it, and a first-level one below it too", () => {
  const text = ["Text.", "", "## Heading", "", "", "Text.", "", "# Title", "", "Text.", "", "#Tag is text", "", "   ### Indented"];
  assert.deepEqual(lines(paragraphBreaks(text, [])), ["3:blank", "4:extra", "10:blank"]);
});

test("a heading followed right away by text gets the break below it", () => {
  const text = ["## Heading", "Text.", "# Title", "Text.", "### Next", "#### Sub", "- item", "## Last", "<!-- vml -->", "x", "<!-- /vml -->"];
  assert.deepEqual(lines(paragraphBreaks(text, [{ openLine: 8, closeLine: 10, floats: false }])), ["0:after", "5:after"]);
});

test("text right above and below a float is parted by a break below the text above", () => {
  const text = ["Above.", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->", "Below.", "", "<!-- vml -->", "![[b.png]]", "<!-- /vml -->", "Below."];
  assert.deepEqual(lines(paragraphBreaks(text, [{ openLine: 1, closeLine: 3, floats: true }, { openLine: 6, closeLine: 8, floats: true }])),
    ["0:after", "5:blank"]);
  // Not when the layout does not float, nor when a blank line or another layout is beside it.
  assert.deepEqual(lines(paragraphBreaks(text.slice(0, 5), [{ openLine: 1, closeLine: 3, floats: false }])), []);
  const stacked = ["Above.", "<!-- vml -->", "![[a.png]]", "<!-- /vml -->", "<!-- vml -->", "![[b.png]]", "<!-- /vml -->", "Below."];
  assert.deepEqual(lines(paragraphBreaks(stacked, [{ openLine: 1, closeLine: 3, floats: true }, { openLine: 4, closeLine: 6, floats: true }])),
    []);
});

test("blank lines in code, math, comments, frontmatter and layouts are left alone", () => {
  const text = ["---", "a: 1", "", "---", "", "```", "x", "", "```", "", "$$", "", "$$", "",
    "<!-- vml -->", "Text", "", "More", "<!-- /vml -->", "", "End."];
  const breaks = paragraphBreaks(text, [{ openLine: 14, closeLine: 18, floats: false }]);
  assert.deepEqual(breaks.map((item) => item.line), [4, 9, 13, 19]);
});

test("a list or quote right below another block is parted from it by a break", () => {
  const text = ["Text:", "- a", "- [ ] task", "  1. nested", "continued", "1. ordered", "2) other", "> quote",
    "lazy text", "- list", "", "Para", "2. not a list", "1. a list", "", "## Head", "- item"];
  assert.deepEqual(lines(paragraphBreaks(text, [])), ["0:after", "4:after", "5:after", "6:after", "8:after",
    "10:blank", "12:after", "15:after"]);
});
