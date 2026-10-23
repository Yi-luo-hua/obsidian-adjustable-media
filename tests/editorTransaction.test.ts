import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, type Transaction, type TransactionSpec } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";

import { findV2Blocks } from "../src/format/v2.ts";
import { planModelEdit } from "../src/layout/edits.ts";
import { applyEditsToView, isLayoutHistory, layoutHistoryEffects } from "../src/layout/editorTransaction.ts";
import { modelFromBlock, moveItem } from "../src/layout/model.ts";
import { lineChangeEdit, planWrapSelection } from "../src/commands/plans.ts";

const original = "Cursor stays here.\n\n<!-- vml -->\n![[a.png]] ![[b.png]]\n<!-- /vml -->\n\nTail";

for (const tail of ["", "\n", "\n\nTail", "\nTail", "\n<!-- vml -->\n![[b.png]]\n<!-- /vml -->"]) {
  test(`wrapping leaves a typing line outside the layout and undoes in one step: ${JSON.stringify(tail)}`, () => {
    const text = `Heading\n\n![[a.png|alias|320]]${tail}`;
    const view = editor();
    const start = text.indexOf("![[");
    view.state = EditorState.create({ doc: text, selection: { anchor: start, head: start + 5 },
      extensions: [history(), layoutHistoryEffects] });
    const lines = text.split("\n");
    const change = planWrapSelection(lines, 2, 2)!;
    assert.deepEqual(applyEditsToView(view, [lineChangeEdit(lines, change)], false, [], true), { ok: true });
    const block = findV2Blocks(view.state.doc.toString().split("\n"))[0];
    const caret = view.state.doc.lineAt(view.state.selection.main.head);
    assert.equal(caret.number, block.closeLine + 2);
    assert.equal(caret.text, "");
    assert.equal(view.state.selection.main.empty, true);
    assert.ok(view.state.doc.toString().includes("![[a.png|alias|320]]"));
    assert.ok(view.state.doc.toString().endsWith(tail));
    assert.equal(undo({ state: view.state, dispatch: tr => { view.state = tr.state; } }), true);
    assert.equal(view.state.doc.toString(), text);
    assert.equal(view.state.selection.main.anchor, start);
    assert.equal(redo({ state: view.state, dispatch: tr => { view.state = tr.state; } }), true);
    assert.equal(view.state.doc.lineAt(view.state.selection.main.head).text, "");
  });
}

test("wrapping through a menu preserves a cursor elsewhere in the note", () => {
  const view = editor();
  view.state = EditorState.create({ doc: "Heading\n\n![[a.png]]" });
  const lines = view.state.doc.toString().split("\n");
  const change = planWrapSelection(lines, 2, 2)!;
  applyEditsToView(view, [lineChangeEdit(lines, change)], false, [], true);
  assert.equal(view.state.selection.main.head, 0);
  assert.ok(view.state.doc.toString().endsWith("<!-- /vml -->"));
});

function editor() {
  const transactions: Transaction[] = [];
  return {
    state: EditorState.create({ doc: original, extensions: [history(), layoutHistoryEffects] }),
    transactions,
    dispatch(spec: TransactionSpec) {
      const tr = this.state.update(spec);
      transactions.push(tr);
      this.state = tr.state;
    },
  };
}

test("moving media preserves a distant cursor without requesting a scroll and is independently undoable", () => {
  const view = editor();
  for (let count = 0; count < 2; count += 1) {
    const block = findV2Blocks(view.state.doc.toString().split("\n"))[0];
    assert.ok(block);
    const moved = moveItem(modelFromBlock(block), { row: 0, index: 0 }, { kind: "beside", position: { row: 0, index: 1 }, side: "after" });
    const edit = planModelEdit(block, moved);
    assert.ok(edit);
    assert.deepEqual(applyEditsToView(view, [edit]), { ok: true });
    assert.equal(view.state.selection.main.head, 0);
    assert.equal(view.transactions.at(-1)?.scrollIntoView, false);
  }
  assert.equal(undo({ state: view.state, dispatch: tr => { view.state = tr.state; assert.equal(isLayoutHistory(tr), true); } }), true);
  assert.match(view.state.doc.toString(), /!\[\[b.png\]\] !\[\[a.png\]\]/);
  assert.equal(undo({ state: view.state, dispatch: tr => { view.state = tr.state; } }), true);
  assert.equal(view.state.doc.toString(), original);
  assert.equal(redo({ state: view.state, dispatch: tr => { view.state = tr.state; assert.equal(isLayoutHistory(tr), true); } }), true);
  view.dispatch({ changes: { from: 0, insert: "typed" }, userEvent: "input.type" });
  assert.equal(undo({ state: view.state, dispatch: tr => { view.state = tr.state; assert.equal(isLayoutHistory(tr), false); } }), true);
});

test("a stale layout edit dispatches nothing", () => {
  const view = editor();
  const result = applyEditsToView(view, [{ anchorLine: 2, anchorLines: ["different"], start: 0, end: 0, replacement: ["bad"] }]);
  assert.deepEqual(result, { ok: false, reason: "not-found" });
  assert.equal(view.transactions.length, 0);
  assert.equal(view.state.doc.toString(), original);
});

test("a changed dependency cancels a CodeMirror gesture before dispatch or history changes", () => {
  const view = editor();
  const block = findV2Blocks(original.split("\n"))[0];
  const moved = moveItem(modelFromBlock(block), { row: 0, index: 0 }, { kind: "beside", position: { row: 0, index: 1 }, side: "after" });
  const edit = planModelEdit(block, moved);
  assert.ok(edit);
  assert.deepEqual(applyEditsToView(view, [edit], false, [{ fromLine: 6, lines: ["Changed tail"] }]),
    { ok: false, reason: "stale-dependency" });
  assert.equal(view.transactions.length, 0);
  assert.deepEqual(applyEditsToView(view, [edit], false, [{ fromLine: 6, lines: ["Tail"] }]), { ok: true });
  assert.equal(view.transactions.length, 1);
  assert.equal(undo({ state: view.state, dispatch: tr => { view.state = tr.state; } }), true);
  assert.equal(view.state.doc.toString(), original);
  assert.deepEqual(applyEditsToView(view, []), { ok: true });
  assert.equal(view.transactions.length, 1);
});
