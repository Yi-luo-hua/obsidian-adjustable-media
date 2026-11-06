import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";
import { listPrefix } from "../src/markdown/listPrefix.ts";
import { alignListWhitespace } from "../src/view/readingParagraphs.ts";

class Dom {
  nodeType = 1;
  tagName: string;
  childNodes: Dom[] = [];
  parentElement: Dom | null = null;
  classes = new Set<string>();
  props: Record<string, string> = {};
  attributes: Record<string, string> = {};
  native = { fontSize: "16px", font: "16px sans-serif", paddingInlineStart: "0px", marginInlineStart: "0px", listStyleType: "disc", getPropertyValue: () => "" };
  value = "";
  constructor(tag: string, ...children: Dom[]) { this.tagName = tag; children.forEach(child => this.appendChild(child)); }
  get children(): Dom[] { return this.childNodes.filter(node => node.nodeType === 1); }
  get textContent(): string { return this.value + this.childNodes.map(child => child.textContent).join(""); }
  instanceOf(type: unknown): boolean { return this.nodeType === 1 && type === Dom; }
  matches(selector: string): boolean { return selector.split(",").some(tag => tag.trim().toUpperCase() === this.tagName); }
  querySelectorAll(selector = "ul,ol"): Dom[] { return this.children.filter(child => child.matches(selector === ":scope > p" ? "p" : "ul,ol")); }
  get data(): string { return this.value; }
  set data(value: string) { this.value = value; }
  querySelector(selector: string): Dom | null { return this.children.find(child => child.hasClass(selector.slice(1))) ?? null; }
  getBoundingClientRect(): { left: number; width: number } {
    const left = this.parentElement ? this.parentElement.getBoundingClientRect().left + this.parentElement.childNodes.slice(0, this.parentElement.childNodes.indexOf(this)).reduce((sum, child) => sum + measuredWidth(child), 0) : 0;
    return { left, width: measuredWidth(this) };
  }
  hasAttribute(name: string): boolean { return name in this.attributes; }
  getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
  addClass(name: string): void { this.classes.add(name); }
  hasClass(name: string): boolean { return this.classes.has(name); }
  removeClass(name: string): void { this.classes.delete(name); }
  setCssProps(props: Record<string, string>): void { Object.assign(this.props, props); }
  createDiv({ cls }: { cls: string }): Dom { const el = new Dom("DIV"); el.addClass(cls); return this.appendChild(el); }
  createSpan({ cls, text: value }: { cls: string; text?: string }): Dom {
    const el = new Dom("SPAN"); el.addClass(cls); if (value) el.appendText(value); return this.appendChild(el);
  }
  appendText(value: string): void { this.appendChild(text(value)); }
  remove(): void { if (this.parentElement) this.parentElement.childNodes.splice(this.parentElement.childNodes.indexOf(this), 1); this.parentElement = null; }
  get doc() { return measurementDocument; }
  appendChild(node: Dom): Dom { return this.insertBefore(node, null); }
  insertBefore(node: Dom, before: Dom | null): Dom {
    if (node.parentElement) node.parentElement.childNodes.splice(node.parentElement.childNodes.indexOf(node), 1);
    const at = before ? this.childNodes.indexOf(before) : this.childNodes.length;
    this.childNodes.splice(at, 0, node); node.parentElement = this; return node;
  }
  replaceWith(...nodes: Dom[]): void {
    const parent = this.parentElement!;
    for (const node of nodes) parent.insertBefore(node, this);
    parent.childNodes.splice(parent.childNodes.indexOf(this), 1); this.parentElement = null;
  }
}

const text = (value: string): Dom => { const node = new Dom(""); node.nodeType = 3; node.value = value; return node; };
// During stylesheet installation a Range omits collapsed whitespace inside an otherwise wide indent span.
const measuredWidth = (el: Dom): number => el.hasClass("cm-indent") ? (/^[ \t\n]*$/.test(el.textContent) ? 0 : 36)
  : el.hasClass("list-bullet") ? 20 : el.nodeType === 3 ? el.value.length * 4 : el.childNodes.reduce((sum, child) => sum + measuredWidth(child), 0);
const measurementDocument = { body: new Dom("BODY"), createRange() {
  let node: Dom;
  return { selectNodeContents(el: Dom) { node = el; }, getBoundingClientRect: () => ({ width: measuredWidth(node), right: measuredWidth(node) }) };
} };
const load = () => mockedModule<{ wrapReadingLists: (section: unknown, collapse?: undefined, source?: unknown) => () => void }>(new URL("../src/view/readingLists.ts", import.meta.url), { "../markdown/listPrefix.ts": { listPrefix }, "./readingParagraphs.ts": { alignListWhitespace } }, {
  HTMLElement: Dom, getComputedStyle: (el: Dom) => el.native,
});

test("complete source indent units survive reading-view measurement before plugin CSS is installed", async () => {
  const { wrapReadingLists } = await load();
  const child = new Dom("LI", text("Nested")); child.attributes["data-line"] = "1";
  const parent = new Dom("LI", text("Root"), new Dom("UL", child)); parent.attributes["data-line"] = "0";
  const section = new Dom("DIV", new Dom("UL", parent));
  const stop = wrapReadingLists(section, undefined, { lines: ["- Root", "    - Nested"], from: 0, tabSize: 4, host: section });
  assert.equal(parent.children[0].props["--vml-list-inset"], "1.5em");
  assert.equal(parent.children[0].props["--vml-list-bullet-offset"], "-0.875em");
  assert.equal(child.children[0].props["--vml-list-inset"], "3.75em");
  assert.equal(child.parentElement!.hasClass("vml-rv-list-guided"), true);
  assert.equal(measurementDocument.body.children.length, 0);
  stop();
  assert.equal(child.parentElement!.hasClass("vml-rv-list-guided"), false);
});

test("nested list paragraphs flow independently while native checkbox and text nodes survive cleanup", async () => {
  const { wrapReadingLists } = await load();
  const checkbox = new Dom("INPUT");
  const nested = new Dom("LI", checkbox, text("Nested task")); nested.native.marginInlineStart = "36px";
  const item = new Dom("LI", text("Parent"), new Dom("UL", nested), text("Continuation")); item.native.marginInlineStart = "28px";
  const root = new Dom("UL", item), section = new Dom("DIV", root);
  const before = section.textContent;
  const stop = wrapReadingLists(section);
  const first = item.children[0], nestedRow = nested.children[0];
  assert.equal(first.props["--vml-list-inset"], "1.75em");
  assert.equal(nestedRow.props["--vml-list-inset"], "4em");
  assert.equal(nestedRow.childNodes[0], checkbox);
  assert.equal(item.children[2].props["--vml-list-type"], "none");
  assert.equal(section.textContent, before);
  stop();
  assert.equal(section.textContent, before);
  assert.equal(nested.childNodes[0], checkbox);
  assert.equal(root.classes.size, 0);
});

test("ordered starts, reversed lists and explicit item values keep their displayed ordinals", async () => {
  const { wrapReadingLists } = await load();
  const items = [new Dom("LI", text("One")), new Dom("LI", text("Two")), new Dom("LI", text("Three"))];
  const root = new Dom("OL", ...items); root.attributes = { start: "7", reversed: "" }; items[1].attributes.value = "3";
  wrapReadingLists(new Dom("DIV", root));
  assert.deepEqual(items.map(item => item.children[0].props["--vml-list-ordinal"]), ["7", "3", "2"]);
});

test("reprocessing a retained list does not double-wrap it or let an old lifecycle remove its rows", async () => {
  const { wrapReadingLists } = await load();
  const item = new Dom("LI", text("Same content")), root = new Dom("UL", item), section = new Dom("DIV", root);
  const stopOld = wrapReadingLists(section), row = item.children[0], stopNew = wrapReadingLists(section);
  assert.equal(item.children[0], row);
  stopOld(); stopOld();
  assert.equal(item.children[0], row);
  stopNew();
  assert.equal(item.childNodes[0].nodeType, 3);
});
