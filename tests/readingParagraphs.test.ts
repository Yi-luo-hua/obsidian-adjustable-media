import assert from "node:assert/strict";
import { test } from "node:test";
import { alignParagraphWhitespace } from "../src/view/readingParagraphs.ts";

test("renderer newlines after a BR are not drawn as a second editor line break", () => {
  const leading = { nodeType: 3, data: " " }, after = { nodeType: 3, previousSibling: { nodeName: "BR" }, data: "\nNext physical line",
    get textContent() { return this.data; } };
  const paragraph = { childNodes: [leading, after] };
  const section = { querySelector: () => paragraph } as unknown as HTMLElement;
  const old = alignParagraphWhitespace(section), current = alignParagraphWhitespace(section);
  assert.equal(leading.data, " ");
  assert.equal(after.data, "Next physical line");
  old();
  assert.equal(after.data, "Next physical line");
  current();
  assert.equal(after.data, "\nNext physical line");
});

test("cleanup does not overwrite text changed by another renderer", () => {
  const node = { nodeType: 3, previousSibling: { nodeName: "BR" }, data: "\nOriginal", get textContent() { return this.data; } };
  const stop = alignParagraphWhitespace({ querySelector: () => ({ childNodes: [node] }) } as unknown as HTMLElement);
  node.data = "Updated externally";
  stop();
  assert.equal(node.data, "Updated externally");
});
