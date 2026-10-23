import assert from "node:assert/strict";
import test from "node:test";
import { lineChangeEdit, planWrapImage, planWrapSelection } from "../src/commands/plans.ts";
import { findV2Blocks } from "../src/format/v2.ts";
import { applyEditsToText } from "../src/layout/edits.ts";

for (const [before, raw, after] of [
  ["输入几个字", "![[117436869_p0_master1200.jpg]]", ""],
  ["前文  ", "![[中文.png|原有别名|320]]", "  后文"],
  ["", "![原有说明|300](<images/my photo.png>)", "尾文"],
  ["![[same.png]] 前文", "![[same.png]]", " 后文![[same.png]]"],
]) {
  test(`image wrapping leaves surrounding text outside: ${before}${raw}${after}`, () => {
    const text = `上段\r\n\r\n${before}${raw}${after}\r\n\r\n下段\r\n`;
    const lines = text.split("\n");
    const change = planWrapImage(lines, 2, before.length);
    assert.ok(change);
    const result = applyEditsToText(text, [lineChangeEdit(lines, change)]);
    assert.ok(result.ok);
    assert.equal(result.text, ["上段", "", ...(before ? [before, ""] : []), "<!-- vml -->", raw,
      "<!-- /vml -->", ...(after ? ["", after] : []), "", "下段", ""].join("\r\n"));
    const [block] = findV2Blocks(result.text.split("\n"));
    assert.equal(block.rows[0].embeds[0].raw, raw);
    assert.equal(block.leftText, null);
    assert.equal(block.rightText, null);
    assert.equal(block.meta.extra.type, undefined);
  });
}

test("media-only rows and explicit text selections retain their existing wrapping behaviour", () => {
  const row = ["![[a.png]]  ![[b.png]]"];
  assert.deepEqual(planWrapImage(row, 0, 13), planWrapSelection(row, 0, 0));
  const text = ["输入几个字![[a.png]]"];
  assert.ok(planWrapSelection(text, 0, 0)?.replacement[0]?.includes('"type":"text"'));
});

test("image menu refuses non-text contexts, nested structures and existing layouts", () => {
  for (const [lines, line] of [
    [["```", "前文![[a.png]]", "```"], 1],
    [["---", "前文![[a.png]]", "---"], 1],
    [["$$", "前文![[a.png]]", "$$"], 1],
    [["%%", "前文![[a.png]]", "%%"], 1],
    [["<!-- vml -->", "前文![[a.png]]", "<!-- /vml -->"], 1],
    [['<!-- vml {"v":99} -->', "前文![[a.png]]", "<!-- /vml -->"], 1],
    [["  前文![[a.png]]"], 0],
    [["- 前文![[a.png]]"], 0],
    [["> 前文![[a.png]]"], 0],
    [["# 前文![[a.png]]"], 0],
  ] as const) assert.equal(planWrapImage(lines, line, lines[line]!.indexOf("![[")), null);
  assert.equal(planWrapImage(["前文![[a.png]]"], 0, 0), null);
});
