import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";

test("detached quote sections measure native border width in the connected page", async () => {
  class Element {
    tag: string; connected: boolean; parent: Element | null = null;
    classes = new Set<string>(); props: Record<string, string> = {}; children: Element[] = []; removed = false;
    constructor(tag: string, connected = false) { this.tag = tag; this.connected = connected; }
    get doc() { return doc; }
    createDiv(options: { cls: string }) { const el = this.createEl("div"); options.cls.split(" ").forEach(cls => el.classes.add(cls)); return el; }
    createSpan() { return this.createEl("span"); }
    createEl(tag: string) { const el = new Element(tag, this.connected); el.parent = this; this.children.push(el); return el; }
    setCssProps(props: Record<string, string>) { Object.assign(this.props, props); }
    addClass(...names: string[]) { names.forEach(name => this.classes.add(name)); }
    removeClass(...names: string[]) { names.forEach(name => this.classes.delete(name)); }
    toggleClass(name: string, value: boolean) { if (value) this.classes.add(name); else this.classes.delete(name); }
    remove() { this.removed = true; }
  }
  const quote = new Element("blockquote"), host = new Element("host", true), body = new Element("body", true);
  const doc = { body, createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ width: 16.6083335876 }) }) };
  const module = await mockedModule<{ alignReadingQuote(section: unknown, lines: string[], from: number, to: number, host: unknown): () => void }>(
    new URL("../src/view/readingQuotes.ts", import.meta.url), {}, { getComputedStyle: (el: Element) => ({
      font: "16px / 24px sans-serif", fontSize: "16px", getPropertyValue: () => "2px",
      borderInlineStartWidth: el.connected && el.parent?.classes.has("markdown-rendered") ? "1.6px" : "",
    }) });
  const stop = module.alignReadingQuote({ doc, querySelector: () => quote }, ["> Heading", "> 1. Item"], 0, 1, host);
  assert.equal(quote.props["--vml-quote-border"], "1.6px");
  assert.equal(quote.classes.has("vml-rv-quote-tight"), true);
  assert.equal(body.children[0].removed, true);
  stop(); assert.equal(quote.classes.size, 0);
});
