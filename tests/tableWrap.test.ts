import assert from "node:assert/strict";
import { test } from "node:test";
import { planWrapTable } from "../src/commands/tablePlans.ts";
import { lineChangeEdit } from "../src/commands/plans.ts";
import { findV2Blocks } from "../src/format/v2.ts";
import { applyEditsToText, isEditable } from "../src/layout/edits.ts";

const table = ["| Name | Value |  ", "| :--- | ---: |", "| A \\| B | 10 |", "| Beta | 20 |"];

test("native table wrapping uses the original V2 text layout and preserves the whole source", () => {
  const lines = ["Before  ", "", ...table, "", "After  "];
  for (const line of [2, 3, 4, 5]) {
    const change = planWrapTable(lines, line)!;
    assert.ok(change);
    assert.equal(change.replacement[0], '<!-- vml {"v":2,"type":"text"} -->');
    assert.deepEqual(change.replacement.slice(1, -1), table);
    const result = applyEditsToText(lines.join("\r\n"), [lineChangeEdit(lines, change)]);
    assert.equal(result.ok, true);
    if (result.ok) {
      const block = findV2Blocks(result.text.split("\n"))[0];
      assert.equal(isEditable(block), true);
      assert.equal(block.rows.length, 0, "the table must not become a special media item");
      assert.deepEqual(block.leftText?.lines, table);
      assert.ok(result.text.startsWith("Before  \r\n\r\n"));
      assert.ok(result.text.endsWith("\r\n\r\nAfter  "));
    }
  }
});

test("only the clicked duplicate table is wrapped, leaving other tables intact", () => {
  const lines = [...table, "", "Between", "", ...table, "", "After"];
  const change = planWrapTable(lines, 8)!;
  assert.equal(change.from, 7);
  assert.equal(change.to, 10);
  assert.deepEqual(change.replacement.slice(1, -1), table);
  assert.equal(planWrapTable(lines, 5), null);
});

test("protected Markdown containers and existing layouts have no native table wrapping plan", () => {
  for (const lines of [
    ["```", ...table, "```"], ["---", ...table, "---"], ["$$", ...table, "$$"],
    ["%%", ...table, "%%"], ["<!--", ...table, "-->"], table.map(line => "> " + line),
    ["- Item", ...table.map(line => "  " + line)], ["<!-- vml -->", ...table, "<!-- /vml -->"],
    ['<!-- vml {"v":99} -->', ...table, "<!-- /vml -->"],
  ]) for (let line = 0; line < lines.length; line++) assert.equal(planWrapTable(lines, line), null);
});

test("an unsafe pipe row refuses the whole table rather than wrapping a prefix", () => {
  for (const unsafe of ["| %% comment | 30 |", "    | Extra | 30 |", "\t| Extra | 30 |", "| <!-- unclosed | 30 |"])
    assert.equal(planWrapTable([...table, unsafe], 0), null);
});
