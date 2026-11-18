import assert from "node:assert/strict";
import test from "node:test";
import { lineChangeEdit, planMergeWithNext, planWrapImage, planWrapSelection } from "../src/commands/plans.ts";
import { findV2Blocks } from "../src/format/v2.ts";
import { applyEditsToText, isEditable, planModelEdit } from "../src/layout/edits.ts";
import { insertItem, modelFromBlock } from "../src/layout/model.ts";
import { takePlainEmbed } from "../src/layout/plainEmbed.ts";

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

test("the selection command puts extensionless HTTP images in a media row and preserves their source", () => {
  const images = ['![图|240](https://example.org/assets/id?size=large "caption")', '![](http://example.org/get/42#photo)'];
  const change = planWrapSelection(images, 0, 1);
  assert.ok(change);
  const [block] = findV2Blocks(change.replacement);
  assert.deepEqual(block.rows.map(row => row.embeds.map(embed => [embed.kind, embed.raw])), [images.map(raw => ["image", raw])]);
  assert.equal(block.meta.extra.type, undefined);
  assert.equal(block.meta.extra.remoteImages, true);
  const [explicitText] = findV2Blocks(['<!-- vml {"v":2,"type":"text"} -->', ...images, "<!-- /vml -->"]);
  assert.equal(explicitText.rows.length, 0);
});

const remoteImage = "![CDN](https://example.org/image/id?width=120)";

test("legacy V2 and V3 layouts keep extensionless images in side text and preserve row settings", () => {
  for (const { opener, rows } of [
    { opener: '<!-- vml {"v":2,"rows":[{"captions":["Local"]}]} -->', rows: ["![[local.png]]"] },
    { opener: '<!-- vml {"v":3,"kind":"media","rows":[{"items":1,"captions":["Diagram"]}]} -->', rows: ["```mermaid", "graph LR", "```"] },
  ]) {
    const [block] = findV2Blocks([opener, remoteImage, "Side text", "", ...rows, "<!-- /vml -->"]);
    assert.ok(isEditable(block));
    assert.deepEqual(block.leftText?.lines, [remoteImage, "Side text"]);
    assert.deepEqual(block.rows.map(row => row.embeds.map(embed => embed.raw)), [[rows.join("\n")]]);
    assert.equal(modelFromBlock(block).rows[0].items[0].caption, rows.length === 1 ? "Local" : "Diagram");
  }
});

test("moving an extensionless image adds the opt-in to its destination only when existing text still reads back", () => {
  const taken = takePlainEmbed([remoteImage], 0, 0);
  assert.ok(taken);
  const target = { kind: "beside", position: { row: 0, index: 0 }, side: "before" } as const;
  for (const left of [["Side text"], [remoteImage, "Side text"]]) {
    const lines = ["<!-- vml -->", ...left, "", "![[local.png]]", "<!-- /vml -->"];
    const [block] = findV2Blocks(lines);
    const model = insertItem(modelFromBlock(block), { embed: taken.embed, weight: null, caption: null }, target);
    const edit = planModelEdit(block, model);
    if (left.includes(remoteImage)) {
      assert.equal(edit, null);
      continue;
    }
    assert.ok(edit);
    const [reread] = findV2Blocks(edit.replacement);
    assert.deepEqual(reread.leftText?.lines, left);
    assert.equal(reread.meta.extra.remoteImages, true);
    assert.deepEqual(reread.rows[0].embeds.map(embed => embed.raw), [remoteImage, "![[local.png]]"]);
  }
});

test("merging into an older media-only layout carries the remote image opt-in", () => {
  const remote = planWrapSelection([remoteImage], 0, 0);
  assert.ok(remote);
  const change = planMergeWithNext(["<!-- vml -->", "![[local.png]]", "<!-- /vml -->", "", ...remote.replacement], 1);
  assert.ok(change);
  const [block] = findV2Blocks(change.replacement);
  assert.equal(block.meta.extra.remoteImages, true);
  assert.deepEqual(block.rows.flatMap(row => row.embeds.map(embed => embed.raw)), ["![[local.png]]", remoteImage]);
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
