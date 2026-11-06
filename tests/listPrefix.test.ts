import assert from "node:assert/strict";
import { test } from "node:test";
import { listPrefix } from "../src/markdown/listPrefix.ts";

test("list indentation distinguishes partial spaces from complete editor indent units", () => {
  assert.deepEqual(listPrefix("  * Nested", 4), { groups: 0, spaces: 2, marker: "*", task: false });
  assert.deepEqual(listPrefix("    - Nested", 4), { groups: 1, spaces: 0, marker: "-", task: false });
  assert.deepEqual(listPrefix(" \t  10. Ordered", 4), { groups: 1, spaces: 2, marker: "10.", task: false });
});

test("task markers are measured as native checkboxes while ordinary text is untouched", () => {
  assert.deepEqual(listPrefix("- [x] Done", 4), { groups: 0, spaces: 0, marker: "-", task: true });
  assert.equal(listPrefix("Ordinary paragraph", 4), null);
});

test("quoted lists retain their literal prefix instead of editor list indentation", () => {
  assert.deepEqual(listPrefix("> 1. First", 4), { groups: 0, spaces: 0, marker: "1.", task: false, quoted: true });
  assert.deepEqual(listPrefix("> >     - Nested", 4), { groups: 1, spaces: 0, marker: "-", task: false, quoted: true });
});
