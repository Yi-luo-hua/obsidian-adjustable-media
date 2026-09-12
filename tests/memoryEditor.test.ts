import test from "node:test";
import assert from "node:assert/strict";

import { MemoryEditor } from "./support/memoryEditor.ts";

test("reads lines and ranges", () => {
  const editor = new MemoryEditor("one\ntwo\nthree");

  assert.equal(editor.lineCount(), 3);
  assert.equal(editor.lastLine(), 2);
  assert.equal(editor.getLine(1), "two");
  assert.equal(editor.getRange({ line: 0, ch: 1 }, { line: 2, ch: 2 }), "ne\ntwo\nth");
});

test("out-of-range positions throw", () => {
  const editor = new MemoryEditor("one\ntwo");

  assert.throws(() => editor.getLine(2), RangeError);
  assert.throws(() => editor.getLine(-1), RangeError);
  assert.throws(() => editor.replaceRange("x", { line: 0, ch: 4 }), RangeError);
});

test("replaces within and across lines and records each edit", () => {
  const editor = new MemoryEditor("![[a.png]]\ntext\nend");

  editor.replaceRange("```vml\n{}\n```", { line: 0, ch: 0 }, { line: 0, ch: 10 });
  editor.replaceRange("", { line: 3, ch: 0 }, { line: 4, ch: 0 });

  assert.equal(editor.getValue(), "```vml\n{}\n```\nend");
  assert.deepEqual(editor.edits, [
    { from: { line: 0, ch: 0 }, to: { line: 0, ch: 10 }, text: "```vml\n{}\n```" },
    { from: { line: 3, ch: 0 }, to: { line: 4, ch: 0 }, text: "" },
  ]);
});

test("the cursor moves with text inserted before it and ignores text after it", () => {
  const editor = new MemoryEditor("a\nb\nc");
  editor.setCursor({ line: 1, ch: 1 });

  editor.replaceRange("new\n", { line: 0, ch: 0 });
  assert.deepEqual(editor.getCursor(), { line: 2, ch: 1 });

  editor.replaceRange("!", { line: 3, ch: 1 });
  assert.deepEqual(editor.getCursor(), { line: 2, ch: 1 });
});

test("the cursor stays before text inserted exactly at it", () => {
  const editor = new MemoryEditor("ab");
  editor.setCursor({ line: 0, ch: 1 });

  editor.replaceRange("X", { line: 0, ch: 1 });

  assert.equal(editor.getValue(), "aXb");
  assert.deepEqual(editor.getCursor(), { line: 0, ch: 1 });
});

test("a cursor inside a replaced range moves to its start; one at its end moves past the insertion", () => {
  const inside = new MemoryEditor("abcdef");
  inside.setCursor({ line: 0, ch: 3 });
  inside.replaceRange("XY", { line: 0, ch: 1 }, { line: 0, ch: 5 });
  assert.deepEqual(inside.getCursor(), { line: 0, ch: 1 });

  const atEnd = new MemoryEditor("abcdef");
  atEnd.setCursor({ line: 0, ch: 5 });
  atEnd.replaceRange("XY", { line: 0, ch: 1 }, { line: 0, ch: 5 });
  assert.deepEqual(atEnd.getCursor(), { line: 0, ch: 3 });
});

test("a transaction applies all changes against the original document", () => {
  const editor = new MemoryEditor("a\nb\nc\nd");
  editor.setCursor({ line: 3, ch: 1 });

  editor.transaction({
    changes: [
      { from: { line: 0, ch: 0 }, to: { line: 0, ch: 1 }, text: "A1\nA2" },
      { from: { line: 2, ch: 0 }, to: { line: 3, ch: 0 }, text: "" },
    ],
  });

  assert.equal(editor.getValue(), "A1\nA2\nb\nd");
  assert.equal(editor.transactionCount, 1);
  assert.deepEqual(editor.getCursor(), { line: 3, ch: 1 });
  assert.throws(() => editor.transaction({
    changes: [
      { from: { line: 0, ch: 0 }, to: { line: 1, ch: 0 }, text: "x" },
      { from: { line: 0, ch: 1 }, to: { line: 0, ch: 2 }, text: "y" },
    ],
  }), RangeError);
  assert.equal(editor.transactionCount, 1);
});

test("selection reports from/to/anchor/head", () => {
  const editor = new MemoryEditor("one\ntwo");
  assert.equal(editor.somethingSelected(), false);

  editor.setSelection({ line: 1, ch: 2 }, { line: 0, ch: 1 });

  assert.equal(editor.somethingSelected(), true);
  assert.deepEqual(editor.getCursor("from"), { line: 0, ch: 1 });
  assert.deepEqual(editor.getCursor("to"), { line: 1, ch: 2 });
  assert.deepEqual(editor.getCursor("anchor"), { line: 1, ch: 2 });
  assert.deepEqual(editor.getCursor(), { line: 0, ch: 1 });
});
