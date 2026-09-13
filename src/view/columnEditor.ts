import { EditorSelection, EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, keymap, type Command, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, selectParentSyntax, toggleBlockComment, toggleComment } from "@codemirror/commands";
import { indentUnit, language, syntaxTree } from "@codemirror/language";

import { isListItem, tokenStyle } from "../markdown/columnEditing.ts";

/**
 * The editor a text column is typed in, right in its layout (docs/DESIGN.md, section 4.2). It is a
 * CodeMirror editor of its own with the Markdown language of the note's editor, so the text looks as
 * it does there: headings, bold text, lists, quotes and links in their styles, and the markers of
 * headings, bold, italic, strikethrough, highlights and inline code hidden on lines without the
 * cursor, as in live preview. Tab indents, and undo and redo work on what is typed in it.
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
 * (docs/DESIGN.md, section 3), and Ctrl+I, italic in Obsidian, would select text here instead.
 */
const LEFT_OUT = new Set<unknown>([toggleComment, toggleBlockComment, selectParentSyntax]);

export function createColumnEditor(options: ColumnEditorOptions): EditorView {
  const { note } = options;
  const extensions: Extension[] = [
    history(),
    keymap.of([
      { key: "Tab", run: indentOrInsert, shift: indentLess },
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

/** Draws the text as the note's editor does, from the syntax tree of Obsidian's Markdown language. */
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
  // The lines of the cursor and of any selection show their markers.
  const shown = new Set<number>();
  for (const range of state.selection.ranges) {
    for (let line = doc.lineAt(range.from).number; line <= doc.lineAt(range.to).number; line += 1) {
      shown.add(line);
    }
  }

  const lineClasses = new Map<number, string[]>();
  const ranges: Array<Range<Decoration>> = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.type.isTop || node.from === node.to) {
        return;
      }
      const style = tokenStyle(node.name);
      const line = doc.lineAt(node.from);
      if (style.line.length > 0) {
        lineClasses.set(line.from, [...(lineClasses.get(line.from) ?? []), ...style.line]);
      }
      if (style.hidden && !shown.has(line.number)) {
        ranges.push(Decoration.replace({}).range(node.from, node.to));
      } else if (style.text.length > 0) {
        ranges.push(Decoration.mark({ class: style.text.join(" ") }).range(node.from, node.to));
      }
    },
  });
  for (const [from, classes] of lineClasses) {
    ranges.push(Decoration.line({ class: classes.join(" ") }).range(from));
  }
  return Decoration.set(ranges, true);
}
