import assert from "node:assert/strict";
import { test } from "node:test";
import * as callouts from "../src/layout/calloutImages.ts";
import { mockedModule } from "./support/mockedModule.ts";

async function readingHarness() {
  let process: (el: unknown, ctx: unknown) => void = () => {};
  let parses = 0;
  let sectionReads = 0;
  let children = 0;
  const module = await mockedModule<{ registerCalloutImages(plugin: unknown): void }>(
    new URL("../src/view/calloutImages.ts", import.meta.url), {
      obsidian: { MarkdownRenderChild: class { register() {} } },
      "@codemirror/view": {},
      "../layout/calloutImages.ts": { ...callouts, calloutImages(lines: string[]) { parses++; return callouts.calloutImages(lines); } },
      "../layout/writeBack.ts": {}, "./media.ts": {}, "./messages.ts": {}, "./pointer.ts": {}, "./windows.ts": {},
    });
  module.registerCalloutImages({
    app: {}, registerMarkdownPostProcessor(callback: typeof process) { process = callback; },
  });
  return {
    get parses() { return parses; }, get sectionReads() { return sectionReads; }, get children() { return children; },
    section(text: string, lineStart: number, lineEnd: number, callout = true) {
      const el = { matches: () => callout, parentElement: null, querySelectorAll: () => [],
        win: { requestAnimationFrame: () => 1, MutationObserver: class { observe() {} } } };
      process(el, { sourcePath: "note.md", getSectionInfo() { sectionReads++; return { text, lineStart, lineEnd }; },
        addChild() { children++; } });
    },
  };
}

const first = '> [!note]\n> <!-- vml {"v":2,"scope":"callout-image","rows":[{"width":0.5}]} -->\n> ![[pic.png]]\n> <!-- /vml -->';
const text = first + '\n\n' + first;

test("ordinary reading sections never retrieve or parse the whole note", async () => {
  const host = await readingHarness();
  for (let i = 0; i < 100; i++) host.section(text, 4, 4, false);
  assert.equal(host.sectionReads, 0);
  assert.equal(host.parses, 0);
  assert.equal(host.children, 0);
});

test("Callout sections reuse exact text parsing but still select their own source ranges", async () => {
  const host = await readingHarness();
  host.section(text, 0, 3);
  host.section(text, 5, 8);
  host.section(text, 4, 4);
  assert.equal(host.parses, 1);
  assert.equal(host.children, 2);
  const next = text.replaceAll('"width":0.5', '"width":0.6');
  host.section(next, 0, 3);
  host.section(next, 5, 8);
  assert.equal(host.parses, 2);
  assert.equal(host.children, 4);
  host.section(text, 5, 8);
  assert.equal(host.parses, 3);
  assert.equal(host.children, 5);
});
