import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";
import * as plans from "../src/commands/plans.ts";
import * as tablePlans from "../src/commands/tablePlans.ts";
import { applyEditsToText, type BlockEdit } from "../src/layout/edits.ts";

async function harness() {
  const tableSource = ["| A | B |", "| --- | --- |", "| One | Two |"];
  const source = ["Before", "", ...tableSource, "", "Between", "", ...tableSource, "", "After"].join("\r\n");
  let text = source, connected = true, inside = false, supported = true, editingCell = false, sharedMenus = 0;
  const timers: Array<() => void> = [], notices: string[] = [], writes: BlockEdit[][] = [];
  const entries: Array<{ title: string; click?: () => void }> = [{ title: "Native row action" }];
  const menu = { addItem(build: (entry: unknown) => void) {
    const entry = { title: "", click: undefined as (() => void) | undefined };
    const item = { setTitle(value: string) { entry.title = value; return item; }, setIcon() { return item; }, setSection() { return item; }, onClick(click: () => void) { entry.click = click; return item; } };
    build(item); entries.push(entry);
  } };
  let callback!: (event: unknown) => void;
  const file = { path: "table-menu.md" }, editor = { getValue: () => text };
  const view = { state: { field: () => ({ editor, file }), doc: { lineAt: () => ({ number: 9 }) } }, posAtDOM: () => 100,
    contentDOM: { contains: () => connected } };
  const widget = { closest: () => ({}) };
  const cellEditorEl = {};
  const table = { win: { setTimeout: (fn: () => void) => timers.push(fn) },
    contains: (element: unknown) => element === cellEditorEl,
    closest: (selector: string) => selector === ".cm-table-widget" ? widget : inside ? {} : null };
  const target = { closest: (selector: string) => selector === ".cm-editor" ? (editingCell ? cellEditorEl : widget) : table };
  const module = await mockedModule<{
    registerTableMenu(plugin: unknown): void;
    addTableCellWrapItem(plugin: unknown, menu: unknown, editor: unknown): boolean;
  }>(new URL("../src/view/tableMenu.ts", import.meta.url), {
    obsidian: { Menu: { forEvent: () => { sharedMenus++; return menu; } },
      Notice: class { constructor(message: string) { notices.push(message); } }, editorInfoField: {}, requireApiVersion: () => supported },
    "@codemirror/view": { EditorView: { findFromDOM: () => view } },
    "../commands/tablePlans.ts": tablePlans, "../commands/plans.ts": plans,
    "../layout/writeBack.ts": { writeBlockEdits: async (_app: unknown, _file: unknown, edits: BlockEdit[]) => { writes.push(edits); return { ok: true }; } },
    "./obsidianInternals.ts": {}, "./messages.ts": { t: (key: string) => key, reportWriteError(error: unknown) { throw error; } },
    "./windows.ts": { eventElement: () => target, onEveryDocument: (_plugin: unknown, fn: (doc: unknown) => void) => fn({}) },
  });
  const plugin = { app: {}, registerDomEvent(_doc: unknown, name: string, fn: (event: unknown) => void) { assert.equal(name, "contextmenu"); callback = fn; } };
  module.registerTableMenu(plugin);
  return { source, entries, writes, notices,
    open() { const event = { defaultPrevented: false }; callback(event); return event; },
    flush() { timers.splice(0).forEach(fn => fn()); },
    get sharedMenus() { return sharedMenus; },
    editCell() { editingCell = true; },
    openEditorMenu() { return module.addTableCellWrapItem(plugin, menu, { cm: { dom: { closest: () => table } } }); },
    change() { text += " changed"; }, detach() { connected = false; }, inside() { inside = true; }, legacy() { supported = false; },
  };
}

test("table wrapping joins the native menu after the native handler and targets the clicked duplicate", async () => {
  const h = await harness();
  const event = h.open();
  assert.equal(h.sharedMenus, 0, "native table actions can populate their menu first");
  event.defaultPrevented = true;
  h.flush();
  assert.equal(h.sharedMenus, 1);
  assert.deepEqual(h.entries.map(e => e.title), ["Native row action", "wrapInLayout"]);
  assert.equal(h.writes.length, 0);
  h.entries[1].click!(); await Promise.resolve();
  const result = applyEditsToText(h.source, h.writes[0]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.text.split("<!-- vml").length, 2);
    assert.ok(result.text.startsWith(h.source.split("\r\n").slice(0, 8).join("\r\n") + "\r\n<!-- vml"));
  }
});

test("an active cell waits for editor-menu and wraps the full table using the outer editor", async () => {
  const h = await harness();
  h.editCell();
  h.open().defaultPrevented = true;
  h.flush();
  assert.equal(h.sharedMenus, 0);
  assert.deepEqual(h.entries.map(e => e.title), ["Native row action"]);
  assert.equal(h.openEditorMenu(), true);
  assert.deepEqual(h.entries.map(e => e.title), ["Native row action", "wrapInLayout"]);
  h.entries[1].click!(); await Promise.resolve();
  const result = applyEditsToText(h.source, h.writes[0]);
  assert.deepEqual(result, {
    ok: true,
    text: h.source.replace("Between\r\n\r\n", 'Between\r\n\r\n<!-- vml {"v":2,"type":"text"} -->\r\n')
      .replace("\r\n\r\nAfter", "\r\n<!-- /vml -->\r\n\r\nAfter"),
  });
});

test("unclaimed table context events do not open a plugin-only menu", async () => {
  const h = await harness(); h.open(); h.flush();
  assert.equal(h.sharedMenus, 0);
});

test("changed source and a detached table cancel the captured wrapping action", async () => {
  for (const invalid of ["change", "detach"] as const) {
    const h = await harness(); h.open().defaultPrevented = true; h.flush(); h[invalid](); h.entries[1].click!();
    assert.equal(h.writes.length, 0);
    assert.deepEqual(h.notices, ["writeNotFound"]);
  }
});

test("tables already in layouts and hosts without Menu.forEvent retain their original menu", async () => {
  for (const mode of ["inside", "legacy"] as const) {
    const h = await harness(); h[mode](); h.open().defaultPrevented = true; h.flush();
    assert.equal(h.entries.length, 1);
  }
});
