import { Notice, editorInfoField, type Editor, type Plugin } from "obsidian";
import { EditorView } from "@codemirror/view";

import { applyLineChange, planWrapSelection } from "../commands/plans.ts";
import { t } from "./messages.ts";

/**
 * Adds "Wrap in a layout" to Obsidian's own menu for an image in live preview. That menu reports
 * the image's file (the file-menu event, source "link-context-menu") but not which embed was
 * clicked, so the element under a right-click is noted on its way down (docs/DESIGN.md, section 4).
 */
export function registerImageMenu(plugin: Plugin): void {
  let clicked: Element | null = null;
  const watch = (doc: Document): void => {
    plugin.registerDomEvent(doc, "contextmenu", (event) => {
      clicked = event.target instanceof Element ? event.target : null;
    }, { capture: true });
  };
  watch(document);
  plugin.registerEvent(plugin.app.workspace.on("window-open", (win) => watch(win.doc)));

  plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, _file, source) => {
    const embedEl = source === "link-context-menu" ? clicked?.closest<HTMLElement>(".cm-content .image-embed") : null;
    const editorEl = embedEl?.closest<HTMLElement>(".cm-editor");
    const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
    const editor = view?.state.field(editorInfoField, false)?.editor;
    if (!embedEl || !view || !editor || !planWrap(view, editor, embedEl)) {
      return;
    }

    menu.addItem((item) => item.setTitle(t("wrapInLayout")).setIcon("layout-grid").setSection("image").onClick(() => {
      // Planned again: the note may have changed while the menu was open.
      const change = planWrap(view, editor, embedEl);
      if (change) {
        applyLineChange(editor, change);
      } else {
        new Notice(t("wrapNothing"));
      }
    }));
  }));
}

function planWrap(view: EditorView, editor: Editor, embedEl: HTMLElement): ReturnType<typeof planWrapSelection> {
  let line: number;
  try {
    line = view.state.doc.lineAt(view.posAtDOM(embedEl)).number - 1;
  } catch {
    // The image is no longer part of the editor.
    return null;
  }
  return planWrapSelection(editor.getValue().split("\n"), line, line);
}
