import { Scope, type App, type Editor } from "obsidian";

import { blockWrap, type TextSide, type V2Block } from "../format/v2.ts";
import { onlyColumnTextDiffers, planColumnText } from "../layout/edits.ts";
import { modelFromBlock } from "../layout/model.ts";
import { commitEdits, type LayoutContext } from "./interactions.ts";
import { t } from "./messages.ts";

/**
 * Typing the text beside a layout's media right in the layout, in live preview (docs/DESIGN.md,
 * sections 3 and 4.2). A click on a text column swaps its drawn Markdown for a text box holding the
 * column's source; the rest of the layout stays as it is. Every change goes into the note at once,
 * through its editor, so the note's own undo history holds it. While the box is in use, the layout
 * keeps its element when the note changes, so nothing interrupts the typing, input methods included;
 * leaving the box draws the layout again from the note.
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
  private readonly box: HTMLTextAreaElement;
  // Obsidian's hotkeys act on the note's editor, not on this box: none of them while typing here.
  private readonly scope = new Scope();
  private block: V2Block;
  /** The text going into the note right now; the note holds it once the write is done. */
  private writing: string | null = null;
  private composing = false;
  private pushed = false;
  private ended = false;

  constructor(host: TextEditHost, side: TextSide, column: HTMLElement, source: string, caret: number) {
    this.host = host;
    this.side = side;
    this.block = host.context.block;
    column.empty();
    column.addClass("vml-layout__text--editing");
    this.box = column.createEl("textarea", { cls: "vml-text-editor" });
    column.createDiv({ cls: "vml-text-editor__note", text: t("textNotSaved") });
    this.box.value = source;
    this.scope.register([], "Escape", () => {
      this.box.blur();
      return false;
    });

    this.box.addEventListener("blur", () => this.end());
    this.box.addEventListener("input", (event) => {
      this.fit();
      // An input method's text goes in once it is composed.
      if (!this.composing && !(event instanceof InputEvent && event.isComposing)) {
        this.write();
      }
    });
    this.box.addEventListener("compositionstart", () => {
      this.composing = true;
    });
    this.box.addEventListener("compositionend", () => {
      this.composing = false;
      this.write();
    });
    // The editor's own menu would act on the note, not on this box.
    this.box.addEventListener("contextmenu", (event) => event.stopPropagation());

    this.fit();
    this.box.focus({ preventScroll: true });
    this.box.setSelectionRange(caret, caret);
    this.pushScope();
  }

  /** Whether `block`, the layout's block after a change to the note, holds just the typed text: then the layout stays. */
  accepts(block: V2Block): boolean {
    const text = this.writing ?? this.box.value;
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

  /** Leaves the box: what is left is written, and the layout is drawn again from the note. */
  private end(): void {
    if (this.ended) {
      return;
    }
    this.composing = false;
    this.write();
    if (this.ended) {
      return;
    }
    this.finish();
    this.host.redraw(this.block);
  }

  /** Puts the box's text into the note, when it fits there and differs from what the note holds. */
  private write(): void {
    if (this.ended || this.composing) {
      return;
    }
    const text = this.box.value;
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

  /** Makes the box as high as its text. */
  private fit(): void {
    this.box.setCssProps({ "--vml-edit-height": "auto" });
    this.box.setCssProps({ "--vml-edit-height": `${this.box.scrollHeight + 2}px` });
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
