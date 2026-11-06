import assert from "node:assert/strict";
import { test } from "node:test";
import { alignListWhitespace, alignParagraphWhitespace } from "../src/view/readingParagraphs.ts";

test("renderer newlines after a BR are not drawn as a second editor line break", () => {
  const leading = { nodeType: 3, data: " " }, after = { nodeType: 3, previousSibling: { nodeName: "BR" }, data: "\nNext physical line",
    get textContent() { return this.data; } };
  const paragraph = { childNodes: [leading, after], querySelectorAll: () => [] };
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
  const stop = alignParagraphWhitespace({ querySelector: () => ({ childNodes: [node], querySelectorAll: () => [] }) } as unknown as HTMLElement);
  node.data = "Updated externally";
  stop();
  assert.equal(node.data, "Updated externally");
});

test("list rows preserve authored spaces without drawing structural end newlines or duplicate hard breaks", () => {
  const leading = { nodeType: 3, data: " Leading  text", get textContent() { return this.data; } };
  const after = { nodeType: 3, data: "\nSecond  line\n", previousSibling: { nodeName: "BR" }, get textContent() { return this.data; } };
  const row = { childNodes: [leading, after], querySelectorAll: () => [] } as unknown as HTMLElement;
  const old = alignListWhitespace(row), current = alignListWhitespace(row);
  assert.equal(leading.data, " Leading  text");
  assert.equal(after.data, "Second  line");
  old(); assert.equal(after.data, "Second  line");
  current(); assert.equal(after.data, "\nSecond  line\n");
});

test("loose list paragraphs and their structural separator restore their original text", () => {
  const separator = { nodeType: 3, data: "\n", get textContent() { return this.data; } };
  const content = { nodeType: 3, data: "Authored  spaces\n", get textContent() { return this.data; } };
  const paragraph = { childNodes: [content], querySelectorAll: () => [] };
  const stop = alignListWhitespace({ childNodes: [paragraph, separator], querySelectorAll: (selector: string) => selector === ":scope > p" ? [paragraph] : [] } as unknown as HTMLElement);
  assert.equal(separator.data, ""); assert.equal(content.data, "Authored  spaces");
  stop(); assert.equal(separator.data, "\n"); assert.equal(content.data, "Authored  spaces\n");
});

test("formatting boundaries retain native break opportunities without duplicating or leaking markers", () => {
  const created: Array<{ removed: boolean; remove(): void }> = [], installed: unknown[] = [];
  const inline = { closest: () => null, before: (node: unknown) => installed.push(node), after: (node: unknown) => installed.push(node) };
  const paragraph = { childNodes: [], querySelectorAll: () => [inline], doc: { createElement(tag: string) {
    assert.equal(tag, "wbr"); const node = { removed: false, remove() { this.removed = true; } }; created.push(node); return node;
  } } };
  const section = { querySelector: () => paragraph } as unknown as HTMLElement;
  const old = alignParagraphWhitespace(section), current = alignParagraphWhitespace(section);
  assert.equal(installed.length, 2);
  old(); assert.ok(created.every(node => !node.removed));
  current(); assert.ok(created.every(node => node.removed));
});
