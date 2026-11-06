import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";
import { listPrefix } from "../src/markdown/listPrefix.ts";

class Dom {
  nodeType = 1;
  tagName: string;
  childNodes: Dom[] = [];
  parentElement: Dom | null = null;
  classes = new Set<string>();
  props: Record<string, string> = {};
  attributes: Record<string, string> = {};
  native = { fontSize: "16px", paddingInlineStart: "0px", marginInlineStart: "0px", listStyleType: "disc" };
  value = "";
  constructor(tag: string, ...children: Dom[]) { this.tagName = tag; children.forEach(child => this.appendChild(child)); }
  get children(): Dom[] { return this.childNodes.filter(node => node.nodeType === 1); }
  get textContent(): string { return this.value + this.childNodes.map(child => child.textContent).join(""); }
  instanceOf(type: unknown): boolean { return this.nodeType === 1 && type === Dom; }
  matches(selector: string): boolean { return selector.split(",").some(tag => tag.trim().toUpperCase() === this.tagName); }
  querySelectorAll(): Dom[] { return this.children.filter(child => child.matches("ul,ol")); }
  hasAttribute(name: string): boolean { return name in this.attributes; }
  getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
  addClass(name: string): void { this.classes.add(name); }
  hasClass(name: string): boolean { return this.classes.has(name); }
  removeClass(name: string): void { this.classes.delete(name); }
  setCssProps(props: Record<string, string>): void { Object.assign(this.props, props); }
  createDiv({ cls }: { cls: string }): Dom { const el = new Dom("DIV"); el.addClass(cls); return this.appendChild(el); }
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
const load = () => mockedModule<{ wrapReadingLists: (section: unknown) => () => void }>(new URL("../src/view/readingLists.ts", import.meta.url), { "../markdown/listPrefix.ts": { listPrefix } }, {
  HTMLElement: Dom, getComputedStyle: (el: Dom) => el.native,
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
