import { getLinkpath, type App } from "obsidian";
import { EditorSelection, EditorState, Facet, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { history } from "@codemirror/commands";
import { indentUnit, language, syntaxTree } from "@codemirror/language";

import { IMAGE_EXTENSIONS } from "../format/v2.ts";
import { styleLine, type Token } from "../markdown/columnStyle.ts";
import { columnKeys } from "./columnKeys.ts";
import { ImageEmbed, MathWidget, TaskBox, type ImageSource } from "./columnWidgets.ts";
import { hangingIndent } from "./hangingIndent.ts";
import { linkSuggest } from "./linkSuggest.ts";

/**
 * The editor a text column is typed in, right in its layout (docs/DESIGN.md, section 4.2). It is a
 * CodeMirror editor of its own with the Markdown language of the note's editor, and draws the text as
 * live preview draws a note (columnStyle.ts): headings, bold text, lists, quotes and links in their
 * styles, their markers away from the cursor hidden, bullets as bullets and tasks as boxes, inline
 * math and images rendered (columnWidgets.ts), and wrapped list items and quotes hanging under their
 * text (hangingIndent.ts). Its keys work as in the note's editor (columnKeys.ts), [[ brings up link
 * suggestions (linkSuggest.ts), and undo and redo work on what is typed in it.
 */

export interface ColumnEditorOptions {
  /** Where the editor goes. */
  parent: HTMLElement;
  app: App;
  /** The note the column is in, which links in it are relative to. */
  sourcePath: string;
  /** The note's editor, whose Markdown language, indentation and spell checking it takes on. */
  note: EditorView;
  text: string;
  /** Where the cursor starts, in `text`. */
  caret: number;
  /** Called after every update of the editor. */
  onUpdate(update: ViewUpdate): void;
}

type FindImage = (target: string) => ImageSource | null;

/** Finds the image an embed's target names, to draw it. */
const images = Facet.define<FindImage, FindImage>({ combine: (values) => values[0] ?? (() => null) });

/** An embed's size, one of the parts after its first |. */
const SIZE = /^\s*(\d+)(?:x(\d+))?\s*$/;

export function createColumnEditor(options: ColumnEditorOptions): EditorView {
  const { app, note, sourcePath } = options;
  const extensions: Extension[] = [
    history(),
    columnKeys(app),
    linkSuggest(app, sourcePath),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: note.contentDOM.getAttribute("spellcheck") ?? "false" }),
    EditorState.tabSize.of(note.state.tabSize),
    indentUnit.of(note.state.facet(indentUnit)),
    images.of((target) => findImage(app, sourcePath, target)),
    hangingIndent,
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

/** The image an embed's `target` names, as Obsidian finds it from the note at `sourcePath`; null for other files. */
function findImage(app: App, sourcePath: string, target: string): ImageSource | null {
  const [path = "", ...rest] = target.split("|");
  const file = app.metadataCache.getFirstLinkpathDest(getLinkpath(path), sourcePath);
  if (!file || !IMAGE_EXTENSIONS.has(file.extension.toLowerCase())) {
    return null;
  }
  const size = rest.map((part) => SIZE.exec(part)).filter((found) => found !== null).pop();
  return {
    src: app.vault.getResourcePath(file),
    width: size ? Number(size[1]) : null,
    height: size?.[2] ? Number(size[2]) : null,
  };
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
  const image = state.facet(images);
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
    for (const math of style.math) {
      ranges.push(Decoration.replace({ widget: new MathWidget(math.tex) }).range(line.from + math.from, line.from + math.to));
    }
    for (const embed of style.embeds) {
      const source = image(embed.target);
      if (source) {
        ranges.push(Decoration.replace({ widget: new ImageEmbed(source) }).range(line.from + embed.from, line.from + embed.to));
      }
    }
  }
  return Decoration.set(ranges, true);
}
