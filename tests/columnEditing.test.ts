import test from "node:test";
import assert from "node:assert/strict";

import { isListItem, tokenStyle } from "../src/markdown/columnEditing.ts";

test("a token of Obsidian's Markdown language gets the classes the note's editor gives it", () => {
  // Token names and classes as Obsidian 1.13.7 draws a note in source mode (docs/DESIGN.md, section 4.2).
  assert.deepEqual(tokenStyle("HyperMD-header_HyperMD-header-1"), { line: ["HyperMD-header", "HyperMD-header-1"], text: [], hidden: false });
  assert.deepEqual(tokenStyle("formatting_formatting-header_formatting-header-1_header_header-1"), {
    line: [],
    text: ["cm-formatting", "cm-formatting-header", "cm-formatting-header-1", "cm-header", "cm-header-1"],
    hidden: true,
  });
  assert.deepEqual(tokenStyle("header_header-2_strong"), { line: [], text: ["cm-header", "cm-header-2", "cm-strong"], hidden: false });
  assert.deepEqual(tokenStyle("hmd-internal-link_link-has-alias"), { line: [], text: ["cm-hmd-internal-link", "cm-link-has-alias"], hidden: false });
  assert.deepEqual(tokenStyle("hashtag_hashtag-end_meta_tag-").text, ["cm-hashtag", "cm-hashtag-end", "cm-meta", "cm-tag-"]);
  assert.deepEqual(tokenStyle("HyperMD-list-line_HyperMD-list-line-1_HyperMD-task-line").line, ["HyperMD-list-line", "HyperMD-list-line-1", "HyperMD-task-line"]);
});

test("the markers live preview hides are those of headings, bold, italic, strikethrough, highlights and inline code", () => {
  const hidden = [
    "formatting_formatting-strong_strong",
    "em_formatting_formatting-em",
    "formatting_formatting-strikethrough_strikethrough",
    "formatting_formatting-highlight_highlight",
    "formatting_formatting-code_inline-code",
    "formatting_formatting-strong_quote_quote-1_strong",
  ];
  for (const name of hidden) {
    assert.equal(tokenStyle(name).hidden, true, name);
  }
  const shown = [
    "strong",
    "formatting_formatting-list_formatting-list-ul_list-1",
    "formatting_formatting-task_meta",
    "formatting_formatting-quote_formatting-quote-1_quote_quote-1",
    "formatting_formatting-link_link",
    "formatting-link_formatting-link-start",
    "formatting_formatting-hashtag_hashtag_hashtag-begin_meta_tag-",
    "formatting_formatting-math_formatting-math-begin_keyword_math",
  ];
  for (const name of shown) {
    assert.equal(tokenStyle(name).hidden, false, name);
  }
});

test("list items, tasks included, indent as a whole", () => {
  for (const line of ["- 项", "\t- 子项", "* 项", "+ 项", "1. 有序", "12) 有序", "- [ ] 任务", "-"]) {
    assert.equal(isListItem(line), true, line);
  }
  for (const line of ["普通文字", "-不是列表", "> 引用", "1.5 倍", "#标签", ""]) {
    assert.equal(isListItem(line), false, line);
  }
});
