import { Menu, Notice, editorInfoField, requireApiVersion, type Plugin } from "obsidian";
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
 * Remote images share the host's event menu, but have no vault file and emit no file-menu event.
 * Standalone Mermaid widgets get their own wrapping menu.
 */
export function registerImageMenu(plugin: Plugin): void {
  let clicked: Element | null = null;
  onEveryDocument(plugin, (doc) => plugin.registerDomEvent(doc, "contextmenu", (event) => {
    clicked = eventElement(event);
    const remoteImage = clicked?.closest<HTMLElement>(".cm-content .image-embed:not(.internal-embed)");
    const addRemoteAction = remoteImage ? planImageAction(plugin, remoteImage) : null;
    if (addRemoteAction) {
      if (requireApiVersion("1.6.0")) {
        addRemoteAction(Menu.forEvent(event));
      }
    }
    const diagram = clicked?.closest<HTMLElement>(".cm-content .mermaid");
    if (diagram && !diagram.closest(".vml-layout, .vml-text-editor, .vml-plain-image--dragging")) {
      showDiagramMenu(plugin, event, diagram);
    }
    const drawing = clicked?.closest<HTMLElement>(".cm-content .excalidraw-embedded-img");
    if (drawing && !drawing.closest(".vml-layout, .vml-text-editor, .vml-plain-image--dragging")) {
      showDiagramMenu(plugin, event, drawing, true);
    }
  }, { capture: true }));

  plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, _file, source) => {
    const embedEl = source === "link-context-menu" ? clicked?.closest<HTMLElement>(".cm-content .image-embed") : null;
    if (embedEl) planImageAction(plugin, embedEl)?.(menu);
  }));
}

function planImageAction(plugin: Plugin, embedEl: HTMLElement): ((menu: Menu) => void) | null {
  const editorEl = embedEl.closest<HTMLElement>(".cm-editor");
  const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
  const info = view?.state.field(editorInfoField, false);
  const editor = info?.editor;
  const file = info?.file ?? (editor ? fileOfEditor(plugin.app, editor) : null);
  if (!view || !editor || !file) return null;

  const original = editor.getValue(), lines = original.split("\n");
  const change = planWrap(view, lines, embedEl);
  if (!change) return null;
  return menu => menu.addItem(item => item.setTitle(t("wrapInLayout")).setIcon("layout-grid").setSection("image").onClick(() => {
    if (editor.getValue() !== original || !view.contentDOM.contains(embedEl)) {
      new Notice(t("writeNotFound"));
      return;
    }
    void writeBlockEdits(plugin.app, file, [lineChangeEdit(lines, change)], { view, finishWrapping: true }).then(result => {
      if (!result.ok) new Notice(t("writeNotFound"));
    }).catch(reportWriteError);
  }));
}

function showDiagramMenu(plugin: Plugin, event: MouseEvent, diagram: HTMLElement, excalidraw = false): void {
  const editorEl = diagram.closest<HTMLElement>(".cm-editor");
  const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
  const info = view?.state.field(editorInfoField, false);
  const editor = info?.editor;
  const file = info?.file ?? (editor ? fileOfEditor(plugin.app, editor) : null);
  if (!view || !editor || !file) return;

  let line: number, column: number;
  try {
    const pos = view.posAtDOM(diagram), source = view.state.doc.lineAt(pos);
    line = source.number - 1;
    column = pos - source.from;
  } catch {
    // The native widget may have been replaced before the event reached this listener.
    return;
  }
  const original = editor.getValue();
  const lines = original.split("\n");
  const embed = excalidraw ? null : takePlainMermaid(lines, line)?.embed;
  const change = excalidraw ? planWrapImage(lines, line, column) : embed ? planWrapSelection(lines, embed.line, embed.endLine ?? embed.line) : null;
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

function planWrap(view: EditorView, lines: readonly string[], embedEl: HTMLElement): ReturnType<typeof planWrapImage> {
  try {
    const position = view.posAtDOM(embedEl);
    const line = view.state.doc.lineAt(position);
    return planWrapImage(lines, line.number - 1, position - line.from);
  } catch {
    // The image is no longer part of the editor.
    return null;
  }
}
