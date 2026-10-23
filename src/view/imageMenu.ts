import { Menu, Notice, editorInfoField, type Editor, type Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";

import { lineChangeEdit, planWrapImage, planWrapSelection } from "../commands/plans.ts";
import { takePlainMermaid } from "../layout/plainEmbed.ts";
import { writeBlockEdits } from "../layout/writeBack.ts";
import { reportWriteError, t } from "./messages.ts";
import { fileOfEditor } from "./obsidianInternals.ts";
import { eventElement, onEveryDocument } from "./windows.ts";

/**
 * Adds "Wrap in a layout" to Obsidian's own menu for an image in live preview. That menu reports
 * the image's file (the file-menu event, source "link-context-menu") but not which embed was
 * clicked, so the element under a right-click is noted on its way down (docs/DESIGN.md, section 4).
 * Standalone Mermaid widgets have no native menu event; they get their own wrapping menu.
 */
export function registerImageMenu(plugin: Plugin): void {
  let clicked: Element | null = null;
  onEveryDocument(plugin, (doc) => plugin.registerDomEvent(doc, "contextmenu", (event) => {
    clicked = eventElement(event);
    const diagram = clicked?.closest<HTMLElement>(".cm-content .mermaid");
    if (diagram && !diagram.closest(".vml-layout, .vml-text-editor, .vml-plain-image--dragging")) {
      showMermaidMenu(plugin, event, diagram);
    }
  }, { capture: true }));

  plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, _file, source) => {
    const embedEl = source === "link-context-menu" ? clicked?.closest<HTMLElement>(".cm-content .image-embed") : null;
    const editorEl = embedEl?.closest<HTMLElement>(".cm-editor");
    const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
    const editor = view?.state.field(editorInfoField, false)?.editor;
    if (!embedEl || !view || !editor || !planWrap(view, editor, embedEl)) {
      return;
    }

    const original = editor.getValue();
    menu.addItem((item) => item.setTitle(t("wrapInLayout")).setIcon("layout-grid").setSection("image").onClick(() => {
      if (editor.getValue() !== original || !view.contentDOM.contains(embedEl)) {
        new Notice(t("writeNotFound"));
        return;
      }
      const change = planWrap(view, editor, embedEl);
      const file = view.state.field(editorInfoField, false)?.file ?? fileOfEditor(plugin.app, editor);
      if (change && file) {
        void writeBlockEdits(plugin.app, file, [lineChangeEdit(editor.getValue().split("\n"), change)], { view, finishWrapping: true }).then(result => {
          if (!result.ok) new Notice(t("writeNotFound"));
        }).catch(reportWriteError);
      } else {
        new Notice(t("wrapNothing"));
      }
    }));
  }));
}

function showMermaidMenu(plugin: Plugin, event: MouseEvent, diagram: HTMLElement): void {
  const editorEl = diagram.closest<HTMLElement>(".cm-editor");
  const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
  const info = view?.state.field(editorInfoField, false);
  const editor = info?.editor;
  const file = info?.file ?? (editor ? fileOfEditor(plugin.app, editor) : null);
  if (!view || !editor || !file) return;

  let line: number;
  try {
    line = view.state.doc.lineAt(view.posAtDOM(diagram)).number - 1;
  } catch {
    // The native widget may have been replaced before the event reached this listener.
    return;
  }
  const original = editor.getValue();
  const lines = original.split("\n");
  const embed = takePlainMermaid(lines, line)?.embed;
  const change = embed ? planWrapSelection(lines, embed.line, embed.endLine ?? embed.line) : null;
  if (!change) return;

  event.preventDefault();
  event.stopPropagation();
  const menu = new Menu();
  menu.addItem(item => item.setTitle(t("wrapInLayout")).setIcon("layout-grid").onClick(() => {
    // Keep the clicked fence and originating file, even if the cursor or open note changes.
    if (editor.getValue() !== original || !view.contentDOM.contains(diagram)) {
      new Notice(t("writeNotFound"));
      return;
    }
    void writeBlockEdits(plugin.app, file, [lineChangeEdit(lines, change)], { view, finishWrapping: true }).then(result => {
      if (!result.ok) new Notice(t("writeNotFound"));
    }).catch(reportWriteError);
  }));
  menu.showAtMouseEvent(event);
}

function planWrap(view: EditorView, editor: Editor, embedEl: HTMLElement): ReturnType<typeof planWrapImage> {
  try {
    const position = view.posAtDOM(embedEl);
    const line = view.state.doc.lineAt(position);
    return planWrapImage(editor.getValue().split("\n"), line.number - 1, position - line.from);
  } catch {
    // The image is no longer part of the editor.
    return null;
  }
}
