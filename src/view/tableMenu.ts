import { Menu, Notice, editorInfoField, requireApiVersion, type Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";

import { planWrapTable } from "../commands/tablePlans.ts";
import { lineChangeEdit } from "../commands/plans.ts";
import { writeBlockEdits } from "../layout/writeBack.ts";
import { fileOfEditor } from "./obsidianInternals.ts";
import { reportWriteError, t } from "./messages.ts";
import { eventElement, onEveryDocument } from "./windows.ts";

/** Native table menus do not emit editor-menu. Menu.forEvent shares their pending menu,
 * so the native row, column and sort actions remain alongside our wrapping action. */
export function registerTableMenu(plugin: Plugin): void {
  onEveryDocument(plugin, doc => plugin.registerDomEvent(doc, "contextmenu", event => {
    const table = eventElement(event)?.closest<HTMLElement>(".cm-content table");
    if (!table || table.closest(".vml-layout, .vml-text-editor")) return;
    const widget = table.closest<HTMLElement>(".cm-table-widget") ?? table;
    const editorEl = widget.closest<HTMLElement>(".cm-editor");
    const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
    const info = view?.state.field(editorInfoField, false), editor = info?.editor;
    const file = info?.file ?? (editor ? fileOfEditor(plugin.app, editor) : null);
    if (!view || !editor || !file) return;
    let line: number;
    try { line = view.state.doc.lineAt(view.posAtDOM(widget)).number - 1; }
    catch { return; }
    const original = editor.getValue();
    const lines = original.split("\n"), change = planWrapTable(lines, line);
    if (!change) return;
    // Run after propagation, before the native menu's deferred show. Calling forEvent during
    // capture prevents the native table handler from adding its row/column actions.
    table.win.setTimeout(() => {
      if (requireApiVersion("1.6.0")) {
        Menu.forEvent(event).addItem(item => item.setTitle(t("wrapInLayout")).setIcon("layout-grid").setSection("vml-layout").onClick(() => {
          if (editor.getValue() !== original || !view.contentDOM.contains(table)) { new Notice(t("writeNotFound")); return; }
          void writeBlockEdits(plugin.app, file, [lineChangeEdit(lines, change)], { view, finishWrapping: true }).then(result => {
            if (!result.ok) new Notice(t("writeNotFound"));
          }).catch(reportWriteError);
        }));
      }
    });
  }, { capture: true }));
}
