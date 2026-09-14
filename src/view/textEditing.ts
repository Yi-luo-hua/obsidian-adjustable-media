import { Scope, type App, type Editor } from "obsidian";
import type { EditorView, ViewUpdate } from "@codemirror/view";

import { blockWrap, type TextSide, type V2Block } from "../format/v2.ts";
import { onlyColumnTextDiffers, planColumnText } from "../layout/edits.ts";
import { modelFromBlock } from "../layout/model.ts";
import { createColumnEditor } from "./columnEditor.ts";
import { commitEdits, type LayoutContext } from "./interactions.ts";
import { t } from "./messages.ts";

/**
 * Typing the text beside a layout's media right in the layout, in live preview (docs/DESIGN.md,
 * sections 3 and 4.2). A click on a text column swaps its drawn Markdown for an editor of its own
 * holding the column's source, in the styles of the note's editor (columnEditor.ts); the rest of the
 * layout stays as it is. Every change goes into the note at once, through its editor, so the note's
 * own undo history holds it. While the column is typed in, the layout keeps its element when the note
 * changes, so nothing interrupts the typing, input methods included; leaving the column's editor
 * draws the layout again from the note.
 */

/** A layout drawn in live preview, as far as typing in it goes. */
export interface TextEditHost {
  /** The widget's element, which stays while its text is typed in. */
  el: HTMLElement;
  /** The layout drawn in it. */
  root: HTMLElement;
  app: App;
  sourcePath: string;
  /** The editor showing the note, which the typed text goes into. */
  editor: Editor | undefined;
  /** The same editor's CodeMirror view, whose Markdown language and indentation the column's editor takes on. */
  view: EditorView;
  /** What the layout's interactions work on, kept up to date while its text is typed in. */
  context: LayoutContext;
  /** Draws the layout again from `block`; with `side`, that side shows a text column even without text. */
  redraw(block: V2Block, side?: TextSide): TextEditHost;
}

interface Point {
  x: number;
  y: number;
}

/** The size of the pieces of drawn text looked up in the source to place the caret, longest first. */
const CARET_CLUES = [8, 5, 3];

const sessions = new WeakMap<HTMLElement, TextEditSession>();

/** Starts typing the text on `side` right in the layout, with the caret where `point` is on the drawn text, or at its end. */
export function startTextEdit(host: TextEditHost, side: TextSide, point: Point | null): void {
  if (sessions.has(host.el)) {
    return;
  }
  const source = textOf(host.context.block, side);
  let current = host;
  let column = columnOf(current, side);
  const caret = point && column ? caretInSource(column, point, source) : source.length;
  if (!column) {
    current = current.redraw(current.context.block, side);
    column = columnOf(current, side);
  }
  if (column) {
    sessions.set(current.el, new TextEditSession(current, side, column, source, caret));
  }
}

/**
 * Whether the widget `el` can stay as it is for `block`, its block after a change to the note: only
 * while its text is typed in, and when the change is that typing.
 */
export function keepWhileEditing(el: HTMLElement, block: V2Block): boolean {
  return sessions.get(el)?.accepts(block) ?? false;
}

/** Whether a text column of the widget `el` is being typed in. */
export function isEditingText(el: HTMLElement): boolean {
  return sessions.has(el);
}

/** Stops the typing in the widget `el`, which is going away. */
export function stopTextEdit(el: HTMLElement): void {
  sessions.get(el)?.abort();
}

class TextEditSession {
  private readonly host: TextEditHost;
  private readonly side: TextSide;
  /** The frame around the column's editor. */
  private readonly box: HTMLElement;
  private readonly editor: EditorView;
  // Obsidian's hotkeys act on the note's editor, not on this one: none of them while typing here.
  private readonly scope = new Scope();
  private block: V2Block;
  /** The text going into the note right now; the note holds it once the write is done. */
  private writing: string | null = null;
  /** Whether the editor holds a change the note does not have yet, typed while an input method composes. */
  private pending = false;
  private pushed = false;
  private ended = false;

  constructor(host: TextEditHost, side: TextSide, column: HTMLElement, source: string, caret: number) {
    this.host = host;
    this.side = side;
    this.block = host.context.block;
    column.empty();
    // The source is drawn as the note's editor draws its text, not as rendered Markdown.
    column.removeClass("markdown-rendered");
    column.addClass("vml-layout__text--editing");
    this.box = column.createDiv({ cls: "vml-text-editor" });
    column.createDiv({ cls: "vml-text-editor__note", text: t("textNotSaved") });
    this.editor = createColumnEditor({
      parent: this.box,
      note: host.view,
      text: source,
      caret,
      onUpdate: (update) => this.updated(update),
    });
    this.scope.register([], "Escape", (event) => {
      // Esc during an input method's composition cancels the composition.
      if (event.isComposing) {
        return true;
      }
      this.editor.contentDOM.blur();
      return false;
    });

    const content = this.editor.contentDOM;
    // Focus leaving the editor ends the typing, once it has settled elsewhere. Another window taking
    // the focus leaves the editor focused in this one, and the typing goes on on return.
    content.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (content.doc.activeElement !== content) {
          this.end();
        }
      }, 0);
    });
    // Composed text goes in with the editor's next update; this covers an editor that reports none.
    content.addEventListener("compositionend", () => {
      window.setTimeout(() => {
        if (this.pending) {
          this.write();
        }
      }, 0);
    });
    // The frame's padding takes no focus from the editor.
    this.box.addEventListener("mousedown", (event) => {
      if (event.target === this.box) {
        event.preventDefault();
      }
    });
    // The menu of the note's editor would act on the note, not on this editor.
    this.editor.dom.addEventListener("contextmenu", (event) => event.stopPropagation());

    this.editor.focus();
    this.pushScope();
  }

  /** Whether `block`, the layout's block after a change to the note, holds just the typed text: then the layout stays. */
  accepts(block: V2Block): boolean {
    const text = this.writing ?? this.editor.state.doc.toString();
    if (this.ended || blockWrap(block) !== blockWrap(this.block) || !onlyColumnTextDiffers(this.block, block, this.side, text.split("\n"))) {
      this.abort();
      return false;
    }
    this.block = block;
    this.host.context.block = block;
    this.host.context.model = modelFromBlock(block);
    return true;
  }

  /** Stops without drawing anything: the layout is drawn anew anyway. */
  abort(): void {
    if (!this.ended) {
      this.finish();
    }
  }

  /** Leaves the editor: what is left is written, and the layout is drawn again from the note. */
  private end(): void {
    if (this.ended) {
      return;
    }
    this.write(true);
    if (this.ended) {
      return;
    }
    this.finish();
    this.host.redraw(this.block);
  }

  /** Writes each change; one typed while an input method composes, once the composition ends. */
  private updated(update: ViewUpdate): void {
    if (update.docChanged) {
      this.pending = true;
    }
    if (this.pending) {
      this.write();
    }
  }

  /**
   * Puts the editor's text into the note, when it fits there and differs from what the note holds.
   * Waits while an input method composes, unless `now`.
   */
  private write(now = false): void {
    if (this.ended || (!now && (this.editor.composing || this.editor.compositionStarted))) {
      return;
    }
    this.pending = false;
    const text = this.editor.state.doc.toString();
    const plan = planColumnText(this.block, this.side, text);
    this.box.toggleClass("is-invalid", !plan.fits);
    if (!plan.edit) {
      return;
    }
    this.writing = text;
    void commitEdits(this.host.app, this.host.sourcePath, [plan.edit], this.host.editor).then((written) => {
      // The note changed elsewhere in the meantime: draw what it holds now.
      if (!written && !this.ended) {
        this.finish();
        this.host.redraw(this.block);
      }
    });
    this.writing = null;
  }

  private finish(): void {
    this.ended = true;
    this.popScope();
    this.editor.destroy();
    if (sessions.get(this.host.el) === this) {
      sessions.delete(this.host.el);
    }
  }

  private pushScope(): void {
    if (!this.pushed && !this.ended) {
      this.host.app.keymap.pushScope(this.scope);
      this.pushed = true;
    }
  }

  private popScope(): void {
    if (this.pushed) {
      this.host.app.keymap.popScope(this.scope);
      this.pushed = false;
    }
  }
}

function textOf(block: V2Block, side: TextSide): string {
  return (side === "left" ? block.leftText : block.rightText)?.lines.join("\n") ?? "";
}

function columnOf(host: TextEditHost, side: TextSide): HTMLElement | null {
  return host.root.querySelector<HTMLElement>(`:scope > .vml-layout__text--${side}`);
}

/**
 * Where `point`, on the drawn text of `column`, is in `source`: right after the few characters
 * drawn before it, found exactly once in the source. Otherwise at the end.
 */
function caretInSource(column: HTMLElement, point: Point, source: string): number {
  // Chromium 128 and later; before that the caret simply goes to the end.
  const lookup = column.doc as unknown as { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const position = lookup.caretPositionFromPoint?.(point.x, point.y);
  if (!position || !column.contains(position.offsetNode)) {
    return source.length;
  }
  const range = column.doc.createRange();
  range.setStart(column, 0);
  range.setEnd(position.offsetNode, position.offset);
  const before = range.toString().replace(/\s+/g, "");
  if (before === "") {
    return 0;
  }
  for (const size of CARET_CLUES) {
    const clue = before.slice(-size);
    const at = source.indexOf(clue);
    if (clue.length === Math.min(size, before.length) && at >= 0 && source.indexOf(clue, at + 1) < 0) {
      return at + clue.length;
    }
  }
  return source.length;
}
