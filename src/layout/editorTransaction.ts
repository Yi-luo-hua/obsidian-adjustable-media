import { invertedEffects, isolateHistory } from "@codemirror/commands";
import { StateEffect, type EditorState, type Transaction, type TransactionSpec } from "@codemirror/state";

import { planOffsetChanges, type BlockEdit, type EditFailure } from "./edits.ts";
import type { SourceAssertion } from "./sourceAssertions.ts";

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
export function applyEditsToView(view: LayoutEditor, edits: readonly BlockEdit[], typing = false,
  readSet: readonly SourceAssertion[] = [], finishWrapping = false): { ok: true } | EditFailure {
  const planned = planOffsetChanges(view.state.doc.toString(), edits, readSet);
  if (!planned.ok) {
    return planned;
  }
  if (planned.changes.length === 0) {
    return { ok: true };
  }
  // A replaced selection otherwise maps into the opening comment, revealing the new source.
  // Keep unrelated cursors where they are; wrapping at EOF needs a place to continue typing.
  const target = finishWrapping ? planned.changes.find(change => view.state.selection.ranges.some(
    range => range.from <= change.to && range.to >= change.from)) : undefined;
  let selection: { anchor: number } | undefined;
  if (target) {
    const following = view.state.doc.toString().slice(target.to);
    const afterBlock = target.insert.length + 1;
    if (!following.startsWith("\n\n") && following !== "\n") target.insert += "\n";
    const shift = planned.changes.filter(change => change.from < target.from)
      .reduce((sum, change) => sum + change.insert.length - (change.to - change.from), 0);
    selection = { anchor: target.from + shift + afterBlock };
  }
  view.dispatch({
    changes: planned.changes,
    selection,
    userEvent: typing ? "input.type" : "input.layout",
    // Separate gestures undo separately; consecutive text input keeps its normal grouping.
    annotations: typing ? [] : isolateHistory.of("full"),
    effects: typing ? [] : layoutGesture.of(null),
    scrollIntoView: false,
  });
  // CodeMirror otherwise derives redo's cursor by mapping the old selection into the opener.
  // Record the completed selection without adding another document change or undo step.
  if (selection) view.dispatch({ selection, userEvent: "select.layout", scrollIntoView: false });
  return { ok: true };
}
