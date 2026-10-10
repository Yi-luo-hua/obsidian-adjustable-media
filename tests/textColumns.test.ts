import assert from "node:assert/strict";
import { test } from "node:test";
import { splitTextColumns, insertTextColumnBreak, textColumnBreaks } from "../src/markdown/textColumns.ts";
import { planTextColumnBreak } from "../src/commands/textColumnBreak.ts";
import { applyEditsToText, planModelEdit, planColumnText } from "../src/layout/edits.ts";
import { findV2Blocks } from "../src/format/v2.ts";
import { modelFromBlock, setBlockWidth } from "../src/layout/model.ts";

test("manual columns preserve source offsets, blank lines, CRLF and embed spelling", () => {
  const source = "Short\r\n\r\n+++\r\n\r\nLong ![[photo.png|120]]\r\nend";
  const result = splitTextColumns(source);
  assert.equal(result.columns.length, 2);
  assert.equal(result.columns[0]?.markdown, "Short\r\n\r\n");
  assert.equal(result.columns[1]?.markdown, "\r\nLong ![[photo.png|120]]\r\nend");
  for (const column of result.columns) assert.equal(source.slice(column.from, column.to), column.markdown);
});

test("markers require a full unindented line and do not consume ordinary rules", () => {
  assert.deepEqual(textColumnBreaks("---\ntext\n===\n***\n___\n+++\t\n +++\n++++\n+ + +\ntext +++"), [5]);
});

for (const [name, source] of [
  ["fenced code", "```md\n+++\n```"],
  ["math", "$$\n+++\n$$"],
  ["HTML comment", "<!--\n+++\n-->"],
  ["Obsidian comment", "%%\n+++\n%%"],
  ["indented code", "    +++"],
  ["quote", "> +++"],
  ["lazy list continuation", "- Item\n+++"],
  ["lazy quote continuation", "> Item\n+++"],
] as const) {
  test(`${name} does not create a column`, () => assert.equal(splitTextColumns(source).columns.length, 1));
}

test("a blank line ends nested content before a top-level marker", () => {
  assert.equal(splitTextColumns("- Item\n\n+++\n\nSecond").columns.length, 2);
});

test("empty columns are explicit, and overflow falls back without dropping text", () => {
  assert.deepEqual(splitTextColumns("+++\n+++\n+++\n").columns.map(part => part.markdown), ["", "", "", ""]);
  const source = "a\n+++\nb\n+++\nc\n+++\nd\n+++\ne";
  assert.deepEqual(splitTextColumns(source), { columns: [{ from: 0, to: source.length, markdown: source }], overflow: true });
});

test("insertion splits prose without removing any original characters", () => {
  assert.deepEqual(insertTextColumnBreak("AB", 1), { text: "A\n\n+++\n\nB", cursor: 8 });
  for (const source of ["```\ncode\n```", "$$\nmath\n$$", "    code", "- Item", "> Quote"]) {
    const at = source.indexOf("code") >= 0 ? source.indexOf("code") + 2 : source.indexOf("math") >= 0 ? source.indexOf("math") + 2 : source.length;
    assert.equal(insertTextColumnBreak(source, at), null);
  }
  assert.equal(insertTextColumnBreak("a\n+++\nb\n+++\nc\n+++\nd", 1), null);
});

test("source command and settings edits preserve the rest of a CRLF note and embeds", () => {
  const note = ['untouched  ', '<!-- vml {"v":2,"type":"text","cols":4} -->', 'Alpha', '', '![[a.png|120]]', '<!-- /vml -->', 'tail\t'].join("\r\n");
  const edit = planTextColumnBreak(note.split("\n"), { line: 2, ch: 5 });
  assert.ok(edit);
  const changed = applyEditsToText(note, [edit]);
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  assert.match(changed.text, /^untouched {2}\r\n/);
  assert.match(changed.text, /!\[\[a.png\|120\]\]\r\n<!-- \/vml -->\r\ntail\t$/);
  const block = findV2Blocks(changed.text.split("\n"))[0];
  assert.equal(splitTextColumns(block.leftText!.lines.join("\n")).columns.length, 2);
  const resized = planModelEdit(block, setBlockWidth(modelFromBlock(block), 0.7));
  assert.ok(resized);
  assert.equal(resized.start, 0);
  assert.equal(resized.end, 0);
  assert.equal(planColumnText(block, "left", block.leftText!.lines.join("\n")).fits, true);
  assert.equal(applyEditsToText(changed.text.replace("Alpha", "changed"), [edit]).ok, false);
});

test("source command rejects media layouts, block edges, code and unreadable settings", () => {
  for (const lines of [
    ["<!-- vml -->", "Alpha", "![[a.png]]", "<!-- /vml -->"],
    ['<!-- vml {"v":3} -->', "Alpha", "<!-- /vml -->"],
  ]) assert.equal(planTextColumnBreak(lines, { line: 1, ch: 2 }), null);
  const lines = ['<!-- vml {"type":"text"} -->', "Alpha", "<!-- /vml -->"];
  assert.equal(planTextColumnBreak(lines, { line: 0, ch: 0 }), null);
});
