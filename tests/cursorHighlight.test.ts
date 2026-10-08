import assert from "node:assert/strict";
import { test } from "node:test";
import { cursorBlocks } from "../src/layout/cursorHighlight.ts";

const blocks = [{ id: "first", from: 0, to: 30 }, { id: "copy", from: 40, to: 70 }];

test("caret heads include comment boundaries and ignore a covered block with its head outside", () => {
  for (const head of [0, 15, 30]) assert.deepEqual([...cursorBlocks(blocks, [{ head, empty: true }], true, true)], ["first"]);
  assert.deepEqual([...cursorBlocks(blocks, [{ head: 80, empty: false }], true, true)], []);
  assert.deepEqual([...cursorBlocks(blocks, [{ head: 40, empty: false }], true, true)], ["copy"]);
  assert.deepEqual([...cursorBlocks(blocks, [{ head: 0, empty: true }, { head: 70, empty: true }], true, true)], ["first", "copy"]);
});

test("restored document-start cursors, inactive panes and ended column focus do not retain highlights", () => {
  assert.deepEqual([...cursorBlocks(blocks, [{ head: 0, empty: true }], false, true)], []);
  assert.deepEqual([...cursorBlocks(blocks, [{ head: 5, empty: true }], true, false, "copy")], []);
  assert.deepEqual([...cursorBlocks(blocks, [{ head: 80, empty: true }], true, true, "copy")], ["copy"]);
  assert.deepEqual([...cursorBlocks(blocks, [{ head: 80, empty: true }], true, true)], []);
  assert.deepEqual([...cursorBlocks(blocks, [{ head: 5, empty: true }], true, true, "removed")], []);
});
