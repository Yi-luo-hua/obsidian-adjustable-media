import { EditorState, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";

import { isLayoutHistory, layoutHistoryEffects } from "../layout/editorTransaction.ts";

/** Undo normally scrolls to the cursor. Layout gestures instead keep the viewport's current anchor. */
export function layoutHistory(): Extension {
  const views = new WeakMap<EditorState, EditorView>();
  return [
    layoutHistoryEffects,
    ViewPlugin.define((view) => {
      views.set(view.state, view);
      return {
        update: () => { views.set(view.state, view); },
        destroy: () => { views.delete(view.state); },
      };
    }),
    EditorState.transactionExtender.of((tr) => {
      const view = views.get(tr.startState);
      if (!isLayoutHistory(tr) || !view || typeof view.scrollSnapshot !== "function") {
        return null;
      }
      // This effect overrides history's cursor scroll before CodeMirror computes its viewport.
      // A scrollHandler is too late: by then it has already virtualized the cursor's distant lines.
      return { effects: view.scrollSnapshot().map(tr.changes) };
    }),
  ];
}
