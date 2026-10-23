import assert from "node:assert/strict";
import { test } from "node:test";
import * as plans from "../src/commands/plans.ts";
import * as plain from "../src/layout/plainEmbed.ts";
import { applyEditsToText, type BlockEdit } from "../src/layout/edits.ts";
import { findV2Blocks } from "../src/format/v2.ts";
import { mockedModule } from "./support/mockedModule.ts";

const graph = ["```mermaid", "flowchart LR", "  A[Keep spaces] --> B", "```"];

async function menuHarness(source: string, line: number, imageColumn?: number) {
  let text = source, connected = true, insideLayout = false, dragging = false;
  const notices: string[] = [];
  const writes: Array<{ file: unknown; edits: BlockEdit[]; options: { view: unknown } }> = [];
  const handlers = new Map<string, (...args: unknown[]) => void>();
  let context!: (event: unknown) => void;
  const menus: MenuStub[] = [];
  class MenuStub {
    title = "";
    click!: () => void;
    addItem(build: (item: object) => void) {
      const item = { setTitle: (title: string) => { this.title = title; return item; },
        setIcon: () => item, setSection: () => item, onClick: (callback: () => void) => { this.click = callback; return item; } };
      build(item);
      return this;
    }
    showAtMouseEvent() { menus.push(this); }
  }
  const file = { path: "menu-test.md" };
  const editor = { getValue: () => text };
  const view = { state: {
    field: () => ({ editor, file }),
    doc: { lineAt: () => ({ number: line + 1, from: 0 }) },
  }, posAtDOM: () => imageColumn ?? 0, contentDOM: { contains: () => connected } };
  const diagram = { closest: (selector: string) => selector === ".cm-editor" ? view
    : selector === ".vml-layout, .vml-text-editor, .vml-plain-image--dragging" && (insideLayout || dragging) ? {} : null };
  const target = { closest: (selector: string) => selector === (imageColumn === undefined ? ".cm-content .mermaid" : ".cm-content .image-embed") ? diagram : null };
  const module = await mockedModule<{ registerImageMenu(plugin: unknown): void }>(new URL("../src/view/imageMenu.ts", import.meta.url), {
    obsidian: { Menu: MenuStub, Notice: class { constructor(message: string) { notices.push(message); } }, editorInfoField: {} },
    "@codemirror/view": { EditorView: { findFromDOM: () => view } },
    "../commands/plans.ts": plans, "../layout/plainEmbed.ts": plain,
    "../layout/writeBack.ts": { writeBlockEdits: async (_app: unknown, file: unknown, edits: BlockEdit[], options: { view: unknown }) => {
      writes.push({ file, edits, options }); return { ok: true };
    } },
    "./messages.ts": { t: (key: string) => key, reportWriteError: (error: unknown) => { throw error; } },
    "./obsidianInternals.ts": { fileOfEditor: () => file },
    "./windows.ts": { eventElement: () => target, onEveryDocument: (_plugin: unknown, callback: (doc: object) => void) => callback({}) },
  });
  module.registerImageMenu({
    app: { workspace: { on: (name: string, handler: (...args: unknown[]) => void) => { handlers.set(name, handler); } } },
    registerEvent() {}, registerDomEvent(_doc: unknown, _name: string, handler: (event: unknown) => void) { context = handler; },
  });
  return {
    file, view, menus, writes, notices,
    open() {
      let prevented = false;
      context({ preventDefault() { prevented = true; }, stopPropagation() {} });
      if (imageColumn !== undefined) {
        const menu = new MenuStub();
        handlers.get("file-menu")!(menu, file, "link-context-menu");
        if (menu.title) menus.push(menu);
      }
      return prevented;
    },
    setText(value: string) { text = value; }, detach() { connected = false; },
    insideLayout() { insideLayout = true; },
    dragging() { dragging = true; },
  };
}

test("an image menu wraps just the inline image and cancels if its source or widget changes", async () => {
  const source = "输入几个字![[a.png]]";
  for (const change of ["none", "source", "widget"]) {
    const host = await menuHarness(source, 0, source.indexOf("![["));
    host.open();
    assert.equal(host.menus.length, 1);
    assert.equal(host.writes.length, 0);
    if (change === "source") host.setText("其他文字![[b.png]]");
    if (change === "widget") host.detach();
    host.menus[0].click();
    if (change === "none") {
      assert.equal(host.writes.length, 1);
      const result = applyEditsToText(source, host.writes[0].edits);
      assert.deepEqual(result, { ok: true, text: "输入几个字\n\n<!-- vml -->\n![[a.png]]\n<!-- /vml -->" });
    } else {
      assert.equal(host.writes.length, 0);
      assert.deepEqual(host.notices, ["writeNotFound"]);
    }
  }
});

test("right-click wraps only the clicked complete Mermaid, preserving CRLF and identical neighbours", async () => {
  const lines = ["before", "", ...graph, "", "between", "", ...graph, "", "after"];
  const text = lines.join("\r\n");
  const host = await menuHarness(text, 10);
  assert.equal(host.open(), true);
  assert.equal(host.menus.length, 1);
  assert.equal(host.menus[0].title, "wrapInLayout");
  assert.equal(host.writes.length, 0, "opening or dismissing the menu never writes");
  host.menus[0].click();
  assert.equal(host.writes.length, 1);
  const write = host.writes[0];
  assert.equal(write.file, host.file);
  assert.equal(write.options.view, host.view);
  const result = applyEditsToText(text, write.edits);
  assert.ok(result.ok);
  assert.equal(result.text, [...lines.slice(0, 9), '<!-- vml {"v":3,"kind":"media"} -->', ...graph, "<!-- /vml -->", ...lines.slice(13)].join("\r\n"));
  const block = findV2Blocks(result.text.split("\n"))[0];
  assert.equal(block.rows[0].embeds[0].raw, graph.join("\n"));
});

test("a changed source or replaced widget cancels the captured Mermaid menu", async () => {
  for (const change of ["source", "widget"]) {
    const text = graph.join("\n");
    const host = await menuHarness(text, 0);
    host.open();
    if (change === "source") host.setText(text.replace("B", "C"));
    else host.detach();
    host.menus[0].click();
    assert.equal(host.writes.length, 0);
    assert.deepEqual(host.notices, ["writeNotFound"]);
  }
});

test("existing layouts, nested fences and incomplete Mermaid keep their original menu behaviour", async () => {
  const samples = [
    { lines: ["<!-- vml -->", ...graph, "<!-- /vml -->"], line: 1 },
    { lines: ['<!-- vml {"v":99} -->', ...graph, "<!-- /vml -->"], line: 1 },
    { lines: ["- list", "", ...graph.map(line => "  " + line)], line: 2 },
    { lines: ["````markdown", ...graph, "````"], line: 1 },
    { lines: graph.slice(0, -1), line: 0 },
  ];
  for (const sample of samples) {
    const host = await menuHarness(sample.lines.join("\n"), sample.line);
    assert.equal(host.open(), false);
    assert.equal(host.menus.length, 0);
  }
  const host = await menuHarness(graph.join("\n"), 0);
  host.insideLayout();
  assert.equal(host.open(), false, "the layout item's own menu receives the event");
  const drag = await menuHarness(graph.join("\n"), 0);
  drag.dragging();
  assert.equal(drag.open(), false, "a touch hold already dragging the diagram keeps its gesture");
});
