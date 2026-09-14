import type { App, Hotkey } from "obsidian";
import { EditorSelection, EditorState, Prec, type Extension, type Line } from "@codemirror/state";
import { EditorView, keymap, type Command, type KeyBinding } from "@codemirror/view";
import { defaultKeymap, deleteLine, historyKeymap, moveLineDown, moveLineUp, selectParentSyntax, toggleBlockComment, toggleComment } from "@codemirror/commands";
import { indentUnit, syntaxTree } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";

import {
  continueList,
  cycleTask,
  indentLine,
  insertTag,
  internalLink,
  keyName,
  lineDiff,
  markdownLink,
  outdentLine,
  setHeading,
  toggleBullet,
  toggleFormatting,
  toggleNumbered,
  toggleQuote,
  toggleTask,
  type Span,
  type TextChange,
} from "../markdown/columnEditing.ts";
import { commandHotkeys, obsidianSetting } from "./obsidianInternals.ts";

/**
 * The keys of a text column's editor (docs/DESIGN.md, section 4.2). Obsidian's hotkeys do not reach
 * it (textEditing.ts), so it carries out Obsidian's editor commands itself, on the keys they have in
 * Obsidian, the user's own or Obsidian's defaults: formatting, links, tags, lists, tasks, quotes,
 * headings, and moving or deleting lines. Tab, Enter and Backspace work as in the note's editor, and
 * brackets and Markdown markers pair up as Obsidian's settings say.
 */

/**
 * Keys of CodeMirror's default keymap left out: a comment would change what the layout's block is
 * (docs/DESIGN.md, section 3), and Ctrl+I is italic here, as in Obsidian.
 */
const LEFT_OUT = new Set<unknown>([toggleComment, toggleBlockComment, selectParentSyntax]);

/** What pairs up with Obsidian's "Auto pair brackets" on, and with "Auto pair Markdown syntax". */
const BRACKETS = ["(", "[", "{", "'", '"'];
const MARKDOWN = ["`", "*", "_"];

/** Markers that go around a selection typed over whatever those settings say. */
const WRAPPING = "~=$%";

/** The keys of a column's editor, as Obsidian `app` has them. */
export function columnKeys(app: App): Extension {
  const commands: KeyBinding[] = [];
  for (const command of COMMANDS) {
    for (const hotkey of commandHotkeys(app, command.id, command.keys ?? [])) {
      const key = keyName(hotkey.modifiers, hotkey.key);
      if (key !== null) {
        commands.push({ key, run: command.run, preventDefault: true });
      }
    }
  }
  const brackets = [
    ...(obsidianSetting(app, "autoPairBrackets", true) ? BRACKETS : []),
    ...(obsidianSetting(app, "autoPairMarkdown", true) ? MARKDOWN : []),
  ];
  return [
    Prec.highest(EditorState.languageData.of(() => [{ closeBrackets: { brackets } }])),
    closeBrackets(),
    wrapSelection,
    keymap.of([
      { key: "Tab", run: indent, shift: outdent },
      { key: "Enter", run: continueMarkup },
      ...commands,
      ...closeBracketsKeymap,
      ...historyKeymap,
      ...defaultKeymap.filter((binding) => !LEFT_OUT.has(binding.run)),
    ]),
  ];
}

/** Tab: the lines of the selection get one more level of indentation, after their quote markers, as in the note's editor. */
function indent(view: EditorView): boolean {
  const unit = view.state.facet(indentUnit);
  return rewriteLines(view, (texts) => texts.map((text) => indentLine(text, unit)), "input.indent");
}

/** Shift+Tab: one level less. */
function outdent(view: EditorView): boolean {
  const { state } = view;
  const unit = state.facet(indentUnit);
  return rewriteLines(view, (texts) => texts.map((text) => outdentLine(text, unit, state.tabSize)), "delete.dedent");
}

/** Enter: a list item or a quote goes on on the next line, and an empty one ends, as in the note's editor. */
function continueMarkup(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (view.compositionStarted || state.selection.ranges.length > 1 || !range.empty) {
    return false;
  }
  const line = state.doc.lineAt(range.head);
  const lineBreak = continueList(line.text, range.head - line.from, state.facet(indentUnit));
  if (!lineBreak) {
    return false;
  }
  view.dispatch({
    changes: { from: line.from + lineBreak.from, to: line.from + lineBreak.to, insert: lineBreak.insert },
    selection: EditorSelection.cursor(line.from + lineBreak.cursor),
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

/** Toggles the formatting whose markers Obsidian's language styles `style`, putting `marker` in. */
function toggle(marker: string, style: string): Command {
  return change((text, from, to, state) => {
    const word = from === to ? state.wordAt(from) : null;
    return toggleFormatting(text, from, to, marker, markerSpans(state, style, from, to), word);
  });
}

/** A command that changes the text at the main selection as `make` says. */
function change(make: (text: string, from: number, to: number, state: EditorState) => TextChange): Command {
  return (view) => {
    const { state } = view;
    const { from, to } = state.selection.main;
    const result = make(state.doc.toString(), from, to, state);
    view.dispatch({
      changes: result.changes,
      selection: EditorSelection.single(result.anchor, result.head),
      scrollIntoView: true,
      userEvent: result.changes.length > 0 ? "input" : "select",
    });
    return true;
  };
}

/** A command that rewrites the lines the selection touches. */
function lines(rewrite: (texts: readonly string[]) => string[]): Command {
  return (view) => rewriteLines(view, rewrite, "input");
}

/** Rewrites the lines the selection touches, in order, as `rewrite` turns their texts; the selection moves along. */
function rewriteLines(view: EditorView, rewrite: (texts: readonly string[]) => string[], userEvent: string): boolean {
  const { state } = view;
  const touched: Line[] = [];
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to;) {
      const line = state.doc.lineAt(pos);
      if ((range.empty || range.to > line.from) && !touched.some((known) => known.number === line.number)) {
        touched.push(line);
      }
      pos = line.to + 1;
    }
  }
  touched.sort((a, b) => a.number - b.number);
  const after = rewrite(touched.map((line) => line.text));
  const changes = state.changes(touched.flatMap((line, index) => {
    const edit = lineDiff(line.text, after[index] ?? line.text);
    return edit ? [{ from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert }] : [];
  }));
  view.dispatch({ changes, selection: state.selection.map(changes, 1), scrollIntoView: true, userEvent });
  return true;
}

/** The marker tokens of one formatting on the lines from `from` to `to`, in order. */
function markerSpans(state: EditorState, style: string, from: number, to: number): Span[] {
  const spans: Span[] = [];
  syntaxTree(state).iterate({
    from: state.doc.lineAt(from).from,
    to: state.doc.lineAt(to).to,
    enter: (node) => {
      if (!node.type.isTop && node.from < node.to && node.name.split("_").includes(style)) {
        spans.push({ from: node.from, to: node.to });
      }
    },
  });
  return spans;
}

/** `~`, `=`, `$` and `%` typed over a selection go around it, as in the note's editor whatever its settings say. */
const wrapSelection = EditorView.inputHandler.of((view, _from, _to, text) => {
  const { state } = view;
  if (view.compositionStarted || text.length !== 1 || !WRAPPING.includes(text) || state.selection.ranges.some((range) => range.empty)) {
    return false;
  }
  view.dispatch(state.update(state.changeByRange((range) => ({
    changes: [{ from: range.from, insert: text }, { from: range.to, insert: text }],
    range: EditorSelection.range(range.anchor + 1, range.head + 1),
  })), { scrollIntoView: true, userEvent: "input.type" }));
  return true;
});

/** Obsidian's editor commands carried out here, with the default keys Obsidian gives some of them. */
const COMMANDS: ReadonlyArray<{ id: string; run: Command; keys?: Hotkey[] }> = [
  { id: "editor:toggle-bold", run: toggle("**", "formatting-strong"), keys: [{ modifiers: ["Mod"], key: "B" }] },
  { id: "editor:toggle-italics", run: toggle("*", "formatting-em"), keys: [{ modifiers: ["Mod"], key: "I" }] },
  { id: "editor:toggle-strikethrough", run: toggle("~~", "formatting-strikethrough") },
  { id: "editor:toggle-highlight", run: toggle("==", "formatting-highlight") },
  { id: "editor:toggle-code", run: toggle("`", "formatting-code") },
  { id: "editor:toggle-inline-math", run: toggle("$", "formatting-math") },
  { id: "editor:insert-link", run: change((text, from, to) => markdownLink(text, from, to)), keys: [{ modifiers: ["Mod"], key: "K" }] },
  { id: "editor:insert-wikilink", run: change((text, from, to) => internalLink(text, from, to, false)) },
  { id: "editor:insert-embed", run: change((text, from, to) => internalLink(text, from, to, true)) },
  { id: "editor:insert-tag", run: change((_text, from, to) => insertTag(from, to)) },
  { id: "editor:toggle-checklist-status", run: lines((texts) => texts.map(toggleTask)), keys: [{ modifiers: ["Mod"], key: "L" }] },
  { id: "editor:cycle-list-checklist", run: lines((texts) => texts.map(cycleTask)) },
  { id: "editor:toggle-bullet-list", run: lines((texts) => texts.map(toggleBullet)) },
  { id: "editor:toggle-numbered-list", run: lines(toggleNumbered) },
  { id: "editor:toggle-blockquote", run: lines((texts) => texts.map(toggleQuote)) },
  ...[0, 1, 2, 3, 4, 5, 6].map((level) => ({ id: `editor:set-heading-${level}`, run: lines((texts) => texts.map((text) => setHeading(text, level))) })),
  { id: "editor:indent-list", run: indent },
  { id: "editor:unindent-list", run: outdent },
  { id: "editor:swap-line-up", run: moveLineUp },
  { id: "editor:swap-line-down", run: moveLineDown },
  { id: "editor:delete-paragraph", run: deleteLine, keys: [{ modifiers: ["Mod"], key: "D" }] },
];
