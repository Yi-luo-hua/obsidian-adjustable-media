import test from "node:test";
import assert from "node:assert/strict";

import { findV2Blocks } from "../src/format/v2.ts";
import { applyEditsToText, planModelEdit } from "../src/layout/edits.ts";
import { insertItem, modelFromBlock } from "../src/layout/model.ts";
import { takePlainEmbed } from "../src/layout/plainEmbed.ts";

test("taking the only embed of a line removes the line and one of the blank lines around it", () => {
  const lines = ["正文", "", "![[a.png|300]]", "", "后文"];
  const taken = takePlainEmbed(lines, 2, 0);
  assert.ok(taken);

  assert.equal(taken.embed.raw, "![[a.png|300]]");
  assert.deepEqual(applyEditsToText(lines.join("\n"), [taken.edit]), { ok: true, text: "正文\n\n后文" });
});

test("taking one embed of several keeps the rest of the line as written", () => {
  // a spans columns 0-10, b 12-22, c 22-32.
  const lines = ["![[a.png]]  ![[b.png]]![[c.png]]"];

  assert.deepEqual(takePlainEmbed(lines, 0, 12)?.edit.replacement, ["![[a.png]]  ![[c.png]]"]);
  assert.deepEqual(takePlainEmbed(lines, 0, 0)?.edit.replacement, ["![[b.png]]![[c.png]]"]);
  assert.deepEqual(takePlainEmbed(lines, 0, 22)?.edit.replacement, ["![[a.png]]  ![[b.png]]"]);
  assert.equal(takePlainEmbed(lines, 0, 15)?.embed.raw, "![[b.png]]");
});

test("lines with other text, in code or in a layout are never taken from", () => {
  assert.equal(takePlainEmbed(["![[a.png]] 说明"], 0, 0), null);
  assert.equal(takePlainEmbed(["```", "![[a.png]]", "```"], 1, 0), null);
  assert.equal(takePlainEmbed(["<!-- vml -->", "![[a.png]]", "<!-- /vml -->"], 1, 0), null);
  assert.equal(takePlainEmbed(["![[note]]"], 0, 0), null);
  assert.equal(takePlainEmbed(["![[a.png]]"], 0, 40), null);
});

test("taking the last embed preserves preceding whitespace and CRLF outside the removal", () => {
  const text = "before\r\n![[a.png]]  \t![[b.png]]   \r\nafter\r\n";
  const taken = takePlainEmbed(text.split("\n"), 1, 13);
  assert.ok(taken);
  assert.equal(taken.embed.raw, "![[b.png]]");
  assert.deepEqual(applyEditsToText(text, [taken.edit]), {
    ok: true,
    text: "before\r\n![[a.png]]  \t\r\nafter\r\n",
  });
});

test("a plain embed moves into a layout in one validated change", () => {
  const lines = ["<!-- vml -->", "![[a.png]]", "<!-- /vml -->", "", "![[b.png]]"];
  const [block] = findV2Blocks(lines);
  const taken = takePlainEmbed(lines, 4, 0);
  assert.ok(block && taken);

  const joined = insertItem(modelFromBlock(block), { embed: taken.embed, weight: null, caption: null }, {
    kind: "beside",
    position: { row: 0, index: 0 },
    side: "after",
  });
  const target = planModelEdit(block, joined);
  assert.ok(target);

  assert.deepEqual(applyEditsToText(lines.join("\n"), [taken.edit, target]), {
    ok: true,
    text: "<!-- vml -->\n![[a.png]] ![[b.png]]\n<!-- /vml -->\n",
  });
});

test("nothing is written when the plain line changed in the meantime", () => {
  const taken = takePlainEmbed(["![[a.png]]"], 0, 0);
  assert.ok(taken);

  assert.deepEqual(applyEditsToText("![[a.png|200]]", [taken.edit]), { ok: false, reason: "not-found" });
});
