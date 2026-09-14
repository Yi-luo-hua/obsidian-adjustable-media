import { EditorSelection, EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type Command, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, selectParentSyntax, toggleBlockComment, toggleComment } from "@codemirror/commands";
import { indentUnit, language, syntaxTree } from "@codemirror/language";

import { continueList, isListItem, markdownLink, toggleFormatting, type Span, type TextChange } from "../markdown/columnEditing.ts";
import { styleLine, type Token } from "../markdown/columnStyle.ts";

/**
 * The editor a text column is typed in, right in its layout (docs/DESIGN.md, section 4.2). It is a
 * CodeMirror editor of its own with the Markdown language of the note's editor, and draws the text
 * as live preview draws a note (columnStyle.ts): headings, bold text, lists, quotes and links in their
 * styles, their markers away from the cursor hidden, bullets as bullets and tasks as boxes. Tab
 * indents, Enter continues lists and quotes, Ctrl+B, Ctrl+I and Ctrl+K format as Obsidian's default
 * keys do, and undo and redo work on what is typed in it.
 */

export interface ColumnEditorOptions {
  /** Where the editor goes. */
  parent: HTMLElement;
  /** The note's editor, whose Markdown language, indentation and spell checking it takes on. */
  note: EditorView;
  text: string;
  /** Where the cursor starts, in `text`. */
  caret: number;
  /** Called after every update of the editor. */
  onUpdate(update: ViewUpdate): void;
}

/**
 * Keys of CodeMirror's default keymap left out: a comment would change what the layout's block is
 * (docs/DESIGN.md, section 3), and Ctrl+I is italic here, as in Obsidian.
 */
const LEFT_OUT = new Set<unknown>([toggleComment, toggleBlockComment, selectParentSyntax]);

export function createColumnEditor(options: ColumnEditorOptions): EditorView {
  const { note } = options;
  const extensions: Extension[] = [
    history(),
    keymap.of([
      { key: "Tab", run: indentOrInsert, shift: indentLess },
      { key: "Enter", run: continueMarkup },
      // Obsidian's default keys for these: its own hotkeys do not reach this editor (textEditing.ts).
      { key: "Mod-b", run: toggle("**", "formatting-strong") },
      { key: "Mod-i", run: toggle("*", "formatting-em") },
      { key: "Mod-k", run: insertLink },
      ...historyKeymap,
      ...defaultKeymap.filter((binding) => !LEFT_OUT.has(binding.run)),
    ]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: note.contentDOM.getAttribute("spellcheck") ?? "false" }),
    EditorState.tabSize.of(note.state.tabSize),
    indentUnit.of(note.state.facet(indentUnit)),
    EditorView.updateListener.of((update) => options.onUpdate(update)),
  ];
  // Without the note's language the text is typed all the same, only without its styles.
  const markdown = note.state.facet(language);
  if (markdown) {
    extensions.push(markdown.extension, markdownStyle);
  }
  return new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.text,
      selection: EditorSelection.cursor(Math.min(options.caret, options.text.length)),
      extensions,
    }),
  });
}

/**
 * Tab: list items, and the lines of a selection, indent as a whole, as in the note's editor;
 * elsewhere the note's indentation goes in at the cursor.
 */
const indentOrInsert: Command = (view) => {
  const { state } = view;
  if (state.selection.ranges.some((range) => !range.empty || isListItem(state.doc.lineAt(range.head).text))) {
    return indentMore(view);
  }
  view.dispatch(state.update(state.replaceSelection(state.facet(indentUnit)), { scrollIntoView: true, userEvent: "input" }));
  return true;
};

/** Enter: a list item or a quote goes on on the next line, and an empty one ends, as in the note's editor. */
const continueMarkup: Command = (view) => {
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
};

/** Ctrl+B and Ctrl+I: `marker` around the selection, or away, for the formatting whose markers Obsidian's language styles `style`. */
function toggle(marker: string, style: string): Command {
  return (view) => apply(view, (state, from, to) => toggleFormatting(state.doc.toString(), from, to, marker, markerSpans(state, style, from, to)));
}

const insertLink: Command = (view) => apply(view, (state, from, to) => markdownLink(state.doc.toString(), from, to));

function apply(view: EditorView, change: (state: EditorState, from: number, to: number) => TextChange): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;
  const result = change(state, from, to);
  view.dispatch({
    changes: result.changes,
    selection: EditorSelection.single(result.anchor, result.head),
    scrollIntoView: true,
    userEvent: "input",
  });
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

/** Draws the text as live preview draws a note, from the syntax tree of Obsidian's Markdown language. */
const markdownStyle = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = styled(view.state);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.selectionSet || syntaxTree(update.startState) !== syntaxTree(update.state)) {
      this.decorations = styled(update.state);
    }
  }
}, { decorations: (plugin) => plugin.decorations });

function styled(state: EditorState): DecorationSet {
  const { doc } = state;
  const byLine = new Map<number, Token[]>();
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.type.isTop || node.from === node.to) {
        return;
      }
      const line = doc.lineAt(node.from);
      const tokens = byLine.get(line.number) ?? [];
      tokens.push({ name: node.name, from: node.from - line.from, to: node.to - line.from });
      byLine.set(line.number, tokens);
    },
  });

  const ranges: Array<Range<Decoration>> = [];
  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number);
    const selections = state.selection.ranges
      .filter((range) => range.from <= line.to && range.to >= line.from)
      .map((range) => ({ from: range.from - line.from, to: range.to - line.from }));
    const style = styleLine(byLine.get(number) ?? [], line.text, selections);
    if (style.line.length > 0) {
      ranges.push(Decoration.line({ class: style.line.join(" ") }).range(line.from));
    }
    for (const mark of style.marks) {
      ranges.push(Decoration.mark({ class: mark.classes.join(" ") }).range(line.from + mark.from, line.from + mark.to));
    }
    for (const piece of style.hidden) {
      ranges.push(Decoration.replace({}).range(line.from + piece.from, line.from + piece.to));
    }
    if (style.task) {
      ranges.push(Decoration.replace({ widget: new TaskBox(style.task.checked) }).range(line.from + style.task.from, line.from + style.task.to));
    }
  }
  return Decoration.set(ranges, true);
}

/** A task's box, as live preview draws it: a click checks or unchecks the task in the text. */
class TaskBox extends WidgetType {
  private readonly checked: boolean;

  constructor(checked: boolean) {
    super();
    this.checked = checked;
  }

  override eq(other: TaskBox): boolean {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView): HTMLElement {
    const label = createEl("label", { cls: "task-list-label" });
    const box = label.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox", attr: { "data-task": this.checked ? "x" : " " } });
    box.checked = this.checked;
    // On mousedown, so the editor keeps the focus and the cursor stays where it is.
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const at = view.posAtDOM(label);
      if (/^\[[ xX]\]$/.test(view.state.sliceDoc(at, at + 3))) {
        view.dispatch({ changes: { from: at + 1, to: at + 2, insert: this.checked ? " " : "x" }, userEvent: "input" });
      }
    });
    // The box is drawn anew from the text; the browser does not tick it on its own.
    box.addEventListener("click", (event) => event.preventDefault());
    return label;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}
