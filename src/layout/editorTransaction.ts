import { invertedEffects, isolateHistory } from "@codemirror/commands";
import { StateEffect, type EditorState, type Transaction, type TransactionSpec } from "@codemirror/state";

import { planOffsetChanges, type BlockEdit, type EditFailure } from "./edits.ts";

interface LayoutEditor {
  state: EditorState;
  dispatch(spec: TransactionSpec): void;
}

const layoutGesture = StateEffect.define<null>();

/** Identifies undo/redo of a layout gesture so the view need not scroll to an unrelated cursor. */
export function isLayoutHistory(tr: Transaction): boolean {
  return (tr.isUserEvent("undo") || tr.isUserEvent("redo")) && tr.effects.some((effect) => effect.is(layoutGesture));
}

export const layoutHistoryEffects = invertedEffects.of((tr) => tr.effects.some((effect) => effect.is(layoutGesture)) ? [layoutGesture.of(null)] : []);

/** Writes a validated layout edit without scrolling to the note's (possibly distant) cursor. */
export function applyEditsToView(view: LayoutEditor, edits: readonly BlockEdit[], typing = false): { ok: true } | EditFailure {
  const planned = planOffsetChanges(view.state.doc.toString(), edits);
  if (!planned.ok) {
    return planned;
  }
  view.dispatch({
    changes: planned.changes,
    userEvent: typing ? "input.type" : "input.layout",
    // Separate gestures undo separately; consecutive text input keeps its normal grouping.
    annotations: typing ? [] : isolateHistory.of("full"),
    effects: typing ? [] : layoutGesture.of(null),
    scrollIntoView: false,
  });
  return { ok: true };
}
