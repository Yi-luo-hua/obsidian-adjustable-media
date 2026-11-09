import { Menu, Notice, editorInfoField, requireApiVersion, type Editor, type Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";

import { planWrapTable } from "../commands/tablePlans.ts";
import { lineChangeEdit } from "../commands/plans.ts";
import { writeBlockEdits } from "../layout/writeBack.ts";
import { fileOfEditor } from "./obsidianInternals.ts";
import { reportWriteError, t } from "./messages.ts";
import { eventElement, onEveryDocument } from "./windows.ts";

export function registerTableMenu(plugin: Plugin): void {
  onEveryDocument(plugin, doc => plugin.registerDomEvent(doc, "contextmenu", event => {
    const target = eventElement(event);
    const table = target?.closest<HTMLElement>(".cm-content table");
    if (!table) return;
    const editorEl = target?.closest(".cm-editor");
    // A focused cell editor supplies its own menu through editor-menu.
    if (editorEl && table.contains(editorEl)) return;
    const addItem = planTableMenuItem(plugin, table);
    if (!addItem) return;
    // Inactive cells use Menu.forEvent. Join it after propagation, once the native handler
    // has claimed the event, without opening a menu of our own.
    table.win.setTimeout(() => {
      if (!event.defaultPrevented) return;
      if (requireApiVersion("1.6.0")) {
        addItem(Menu.forEvent(event));
      }
    });
  }, { capture: true }));
}

/** A cell's editor contains only that cell's text. Resolve the table in the outer note editor. */
export function addTableCellWrapItem(plugin: Plugin, menu: Menu, editor: Editor): boolean {
  const cm = (editor as Editor & { cm?: EditorView }).cm;
  const table = cm?.dom.closest<HTMLElement>(".cm-table-widget table");
  if (!table) return false;
  planTableMenuItem(plugin, table)?.(menu);
  return true;
}

function planTableMenuItem(plugin: Plugin, table: HTMLElement): ((menu: Menu) => void) | null {
  if (table.closest(".vml-layout, .vml-text-editor")) return null;
  const widget = table.closest<HTMLElement>(".cm-table-widget") ?? table;
  const editorEl = widget.closest<HTMLElement>(".cm-editor");
  const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
  const info = view?.state.field(editorInfoField, false), editor = info?.editor;
  const file = info?.file ?? (editor ? fileOfEditor(plugin.app, editor) : null);
  if (!view || !editor || !file) return null;
  let line: number;
  try { line = view.state.doc.lineAt(view.posAtDOM(widget)).number - 1; }
  catch { return null; }
  const original = editor.getValue();
  const lines = original.split("\n"), change = planWrapTable(lines, line);
  if (!change) return null;
  return menu => menu.addItem(item => item.setTitle(t("wrapInLayout")).setIcon("layout-grid").setSection("vml-layout").onClick(() => {
    if (editor.getValue() !== original || !view.contentDOM.contains(table)) { new Notice(t("writeNotFound")); return; }
    void writeBlockEdits(plugin.app, file, [lineChangeEdit(lines, change)], { view, finishWrapping: true }).then(result => {
      if (!result.ok) new Notice(t("writeNotFound"));
    }).catch(reportWriteError);
  }));
}
