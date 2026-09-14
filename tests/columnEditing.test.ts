import test from "node:test";
import assert from "node:assert/strict";

import { continueList, isListItem, markdownLink, toggleFormatting } from "../src/markdown/columnEditing.ts";

test("list items, tasks included, indent as a whole", () => {
  for (const line of ["- 项", "\t- 子项", "* 项", "+ 项", "1. 有序", "12) 有序", "- [ ] 任务", "-"]) {
    assert.equal(isListItem(line), true, line);
  }
  for (const line of ["普通文字", "-不是列表", "> 引用", "1.5 倍", "#标签", ""]) {
    assert.equal(isListItem(line), false, line);
  }
});

test("Enter continues a list item or a quote with the same markers, the next number and an unchecked box", () => {
  assert.deepEqual(continueList("- 项一", 4, "\t"), { from: 4, to: 4, insert: "\n- ", cursor: 7 });
  assert.deepEqual(continueList("\t* 子项", 5, "\t"), { from: 5, to: 5, insert: "\n\t* ", cursor: 9 });
  assert.deepEqual(continueList("9. 九", 4, "\t"), { from: 4, to: 4, insert: "\n10. ", cursor: 9 });
  assert.deepEqual(continueList("1) 一", 4, "\t"), { from: 4, to: 4, insert: "\n2) ", cursor: 8 });
  assert.deepEqual(continueList("- [x] 完成", 8, "\t"), { from: 8, to: 8, insert: "\n- [ ] ", cursor: 15 });
  assert.deepEqual(continueList("> 引用", 4, "\t"), { from: 4, to: 4, insert: "\n> ", cursor: 7 });
  assert.deepEqual(continueList("> - 引用里的项", 9, "\t"), { from: 9, to: 9, insert: "\n> - ", cursor: 14 });
  // In the middle of an item, the rest of it goes into the new one.
  assert.deepEqual(continueList("- 前后", 3, "\t"), { from: 3, to: 3, insert: "\n- ", cursor: 6 });
});

test("Enter on an empty item moves it up a level when nested and ends the list or quote otherwise", () => {
  assert.deepEqual(continueList("\t- ", 3, "\t"), { from: 0, to: 1, insert: "", cursor: 2 });
  assert.deepEqual(continueList("    - ", 6, "  "), { from: 0, to: 4, insert: "  ", cursor: 4 });
  assert.deepEqual(continueList("- ", 2, "\t"), { from: 0, to: 2, insert: "", cursor: 0 });
  assert.deepEqual(continueList("- [ ]", 5, "\t"), { from: 0, to: 5, insert: "", cursor: 0 });
  assert.deepEqual(continueList("> - ", 4, "\t"), { from: 2, to: 4, insert: "", cursor: 2 });
  assert.deepEqual(continueList("> ", 2, "\t"), { from: 0, to: 2, insert: "", cursor: 0 });
  assert.deepEqual(continueList("> > ", 4, "\t"), { from: 0, to: 4, insert: "> ", cursor: 2 });
});

test("Enter elsewhere is an ordinary line break", () => {
  assert.equal(continueList("普通文字", 2, "\t"), null);
  assert.equal(continueList("- 项", 1, "\t"), null);
  assert.equal(continueList("1.5 倍", 5, "\t"), null);
});

test("Ctrl+B and Ctrl+I put markers around a selection, or take away the ones just inside or around it", () => {
  assert.deepEqual(toggleFormatting("abc def", 4, 7, "**", []), {
    changes: [{ from: 4, to: 4, insert: "**" }, { from: 7, to: 7, insert: "**" }],
    anchor: 6,
    head: 9,
  });
  const bold = "abc **def** g";
  const markers = [{ from: 4, to: 6 }, { from: 9, to: 11 }];
  const unbolded = { changes: [{ from: 4, to: 6, insert: "" }, { from: 9, to: 11, insert: "" }], anchor: 4, head: 7 };
  assert.deepEqual(toggleFormatting(bold, 6, 9, "**", markers), unbolded);
  assert.deepEqual(toggleFormatting(bold, 4, 11, "**", markers), unbolded);
  // Italic inside bold text goes in beside the bold markers, which are not italic's.
  assert.deepEqual(toggleFormatting(bold, 6, 9, "*", []), {
    changes: [{ from: 6, to: 6, insert: "*" }, { from: 9, to: 9, insert: "*" }],
    anchor: 7,
    head: 10,
  });
});

test("without a selection, the formatting around the cursor comes out, or an empty pair goes in and out", () => {
  const bold = "abc **def** g";
  assert.deepEqual(toggleFormatting(bold, 7, 7, "**", [{ from: 4, to: 6 }, { from: 9, to: 11 }]), {
    changes: [{ from: 4, to: 6, insert: "" }, { from: 9, to: 11, insert: "" }],
    anchor: 5,
    head: 5,
  });
  assert.deepEqual(toggleFormatting("abc", 1, 1, "**", []), { changes: [{ from: 1, to: 1, insert: "****" }], anchor: 3, head: 3 });
  assert.deepEqual(toggleFormatting("a****b", 3, 3, "**", []), { changes: [{ from: 1, to: 5, insert: "" }], anchor: 1, head: 1 });
  assert.deepEqual(toggleFormatting("a**b", 2, 2, "*", []), { changes: [{ from: 1, to: 3, insert: "" }], anchor: 1, head: 1 });
  // An empty bold pair is not taken for an italic one.
  assert.deepEqual(toggleFormatting("a****b", 3, 3, "*", []), { changes: [{ from: 3, to: 3, insert: "**" }], anchor: 4, head: 4 });
});

test("Ctrl+K makes a Markdown link of the selection", () => {
  assert.deepEqual(markdownLink("see text", 4, 8), { changes: [{ from: 4, to: 8, insert: "[text]()" }], anchor: 11, head: 11 });
  assert.deepEqual(markdownLink("x https://a.b", 2, 13), { changes: [{ from: 2, to: 13, insert: "[](https://a.b)" }], anchor: 3, head: 3 });
  assert.deepEqual(markdownLink("ab", 1, 1), { changes: [{ from: 1, to: 1, insert: "[]()" }], anchor: 2, head: 2 });
});
