import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownTables } from "../src/markdown/tables.ts";
import { findV2Blocks, serializeBlock, tableEmbed } from "../src/format/v2.ts";
import { planWrapTable } from "../src/commands/tablePlans.ts";
import { planWrapSelection } from "../src/commands/plans.ts";
import { takePlainTable } from "../src/layout/plainEmbed.ts";
import { applyEditsToText, isEditable, planModelEdit, planMoveOut } from "../src/layout/edits.ts";
import { insertItem, metaFromModel, modelFromBlock, moveItem, removeItem, rowEmbeds, setCaption, setWeights, setWrap } from "../src/layout/model.ts";

const table = ["| Name | Value |", "| :--- | ---: |", "| A \\| B | `x\\|y` |  ", "| [[note\\|alias]] | ![[a.png\\|40]] |"];
const other = ["Name | Value", "--- | ---", "Other | 30"];
const open = '<!-- vml {"v":3,"kind":"media"} -->';

test("top-level table boundaries preserve escapes, alignment, CRLF and optional edge pipes", () => {
  const lines = ["Heading", "", ...table, "", ...other, "", "after"];
  assert.deepEqual(markdownTables(lines), [{ from: 2, to: 5 }, { from: 7, to: 9 }]);
  assert.deepEqual(markdownTables(lines.map(line => line + "\r")), markdownTables(lines));
  assert.deepEqual(markdownTables(["| Only |", "| - |"]), [{ from: 0, to: 1 }]);
  assert.deepEqual(markdownTables(["Title", "---", "text"]), []);
  assert.deepEqual(markdownTables(["A | B", "--- | --- | ---", "X | Y"]), []);
  assert.deepEqual(markdownTables([...table, "# Header | text", "after"]), [{ from: 0, to: 3 }]);
});

test("code, math, frontmatter, comments, quotes, indented code and list tables remain untouched", () => {
  for (const lines of [
    ["```md", ...table, "```"], ["$$", ...table, "$$"], ["---", ...table, "---"], ["<!--", ...table, "-->"], ["%%", ...table, "%%"],
    table.map(line => "> " + line), table.map(line => "    " + line), ["- Item", "", ...table.map(line => "  " + line)],
    ["- Item", ...other],
  ]) {
    assert.deepEqual(markdownTables(lines), [], lines.join("\n"));
    for (let line = 0; line < lines.length; line++) assert.equal(planWrapTable(lines, line), null);
  }
});

test("V3 tables become independent items; V2 and explicit text blocks retain their existing meaning", () => {
  const source = [open, ...table, "", "![[photo.png|240]]", "<!-- /vml -->"];
  const block = findV2Blocks(source)[0];
  assert.equal(isEditable(block), true);
  assert.deepEqual(block.rows.flatMap(r => r.embeds.map(e => e.kind)), ["table", "image"]);
  assert.equal(block.rows[0].embeds[0].raw, table.join("\n"));
  assert.equal(block.rows[0].endLine, 4);
  for (const opening of ["<!-- vml -->", '<!-- vml {"v":3,"kind":"media","type":"text"} -->']) {
    const old = findV2Blocks([opening, ...table, "<!-- /vml -->"])[0];
    assert.equal(old.rows.length, 0);
    assert.deepEqual(old.leftText?.lines, table);
  }
});

test("indented body rows remain in their table and unsafe pipe rows cannot cause partial wrapping", () => {
  const indented = ["| A | B |", "| --- | --- |", "  | One | Two |", "   | Three | Four |"];
  assert.deepEqual(markdownTables(indented), [{ from: 0, to: 3 }]);
  assert.deepEqual(planWrapTable(indented, 0)?.replacement.slice(1, -1), indented);
  for (const unsafe of ["| unmatched %% | content |", "    | possibly code | content |", "\t| code | content |", "| <!-- unclosed | content |"] ) {
    const lines = ["| A | B |", "| --- | --- |", unsafe];
    if (unsafe.includes("<!--")) lines.push("-->");
    assert.equal(planWrapTable(lines, 0), null, "the native table must never be split at an unsafe body row");
  }
});

test("the clicked row wraps exactly its complete table, including duplicate tables", () => {
  const lines = ["Before  ", "", ...table, "", "Between", "", ...table, "", "After\t"];
  for (let line = 9; line <= 12; line++) {
    const change = planWrapTable(lines, line)!;
    assert.ok(change);
    assert.equal(change.from, 9);
    assert.equal(change.to, 12);
    assert.deepEqual(change.replacement.slice(1, -1), table);
    assert.equal(findV2Blocks(change.replacement)[0].rows[0].embeds[0].kind, "table");
  }
  assert.equal(planWrapTable(lines, 0), null);
  assert.equal(planWrapTable([open, ...table, "<!-- /vml -->"], 2), null);
  const selected = planWrapSelection([...table, "", "![[photo.png]]"], 0, 5)!;
  assert.deepEqual(findV2Blocks(selected.replacement)[0].rows.flatMap(r => r.embeds.map(e => e.kind)), ["table", "image"]);
});

test("multiple tables serialize with boundaries and stay whole through resize, captions and reordering", () => {
  const block = findV2Blocks([open, ...table, "", ...other, "<!-- /vml -->"])[0];
  let layout = modelFromBlock(block);
  layout = moveItem(layout, { row: 1, index: 0 }, { kind: "beside", position: { row: 0, index: 0 }, side: "after" });
  layout = setCaption(setWeights(setWrap(layout, "right"), 0, [2, 1]), { row: 0, index: 0 }, "Results {#tbl:results}");
  const lines = serializeBlock(metaFromModel(layout), rowEmbeds(layout));
  const after = findV2Blocks(lines)[0];
  assert.equal(after.metaError, null);
  assert.equal(after.rows.length, 1);
  assert.deepEqual(after.rows[0].embeds.map(e => e.raw), [table.join("\n"), other.join("\n")]);
  const edit = planModelEdit(block, layout)!;
  assert.ok(edit);
  const original = ["Before  ", "", ...block.lines, "", "After\t"].join("\r\n");
  const adjusted = { ...edit, anchorLine: 2 };
  const saved = applyEditsToText(original, [adjusted]);
  assert.equal(saved.ok, true);
  if (saved.ok) {
    assert.ok(saved.text.includes(table.join("\r\n")));
    assert.ok(saved.text.startsWith("Before  \r\n\r\n"));
    assert.ok(saved.text.endsWith("\r\n\r\nAfter\t"));
  }
  const removed = removeItem(layout, { row: 0, index: 0 })!;
  assert.ok(planMoveOut(block, removed.model, removed.item.embed));
});

test("standalone table drops are atomic and do not absorb following sized media", () => {
  const lines = [...table, "", "<!-- vml -->", "![[photo.png|240]]", "<!-- /vml -->"];
  const taken = takePlainTable(lines, 2)!;
  assert.equal(taken.embed.raw, table.join("\n"));
  const target = findV2Blocks(lines)[0];
  const layout = insertItem(modelFromBlock(target), { embed: taken.embed, weight: null, caption: null }, { kind: "beside", position: { row: 0, index: 0 }, side: "before" });
  const edit = planModelEdit(target, layout)!;
  assert.ok(edit);
  const result = applyEditsToText(lines.join("\n"), [taken.edit, edit]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(findV2Blocks(result.text.split("\n"))[0].rows[0].embeds.map(e => e.kind), ["table", "image"]);
  assert.equal(applyEditsToText([table[0], ...lines.slice(1).map((line, i) => i === 1 ? line + " changed" : line)].join("\n"), [taken.edit, edit]).ok, false);
});

test("new table items preserve text columns and do not reclassify their pipe-containing text", () => {
  const lines = [open, "Left column", "![[photo.png|240]]", "Right | column", "<!-- /vml -->"];
  const block = findV2Blocks(lines)[0];
  const layout = insertItem(modelFromBlock(block), { embed: tableEmbed(other, 0, 2), weight: null, caption: null }, { kind: "newRow", beforeRow: 1 });
  const edit = planModelEdit(block, layout)!;
  assert.ok(edit);
  const result = applyEditsToText(lines.join("\n"), [edit]);
  assert.equal(result.ok, true);
  if (result.ok) {
    const after = findV2Blocks(result.text.split("\n"))[0];
    assert.deepEqual(after.rightText?.lines, ["Right | column"]);
    assert.deepEqual(after.leftText?.lines, ["Left column"]);
  }
});
