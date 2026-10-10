import { Notice, Scope, type App, type Editor, type Hotkey } from "obsidian";
import type { EditorView, ViewUpdate } from "@codemirror/view";

import { blockWrap, findV2Blocks, type TextSide, type V2Block } from "../format/v2.ts";
import { blockIdentity } from "../layout/blockIdentity.ts";
import { latestSnapshotOf, snapshotForState } from "../layout/documentSnapshot.ts";
import { onlyColumnTextDiffers, planColumnText } from "../layout/edits.ts";
import { modelFromBlock } from "../layout/model.ts";
import { setBounded } from "../layout/viewProjection.ts";
import { createColumnEditor } from "./columnEditor.ts";
import { commitEdits, type LayoutContext } from "./interactions.ts";
import { closeLinkSuggest } from "./linkSuggest.ts";
import { t } from "./messages.ts";
import { commandHotkeys, executeCommand } from "./obsidianInternals.ts";

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
const CARET_CLUES = [32, 16, 8, 5, 3];

const sessions = new WeakMap<HTMLElement, TextEditSession>();

/**
 * Obsidian commands that still work while a column is typed in, on their keys in Obsidian: they act on
 * no editor, and each takes the focus away, which ends the typing as any other click elsewhere does.
 * Every other hotkey stays away from the column's editor (see `scope`).
 */
const GLOBAL_COMMANDS: ReadonlyArray<{ id: string; keys: Hotkey[] }> = [
  { id: "command-palette:open", keys: [{ modifiers: ["Mod"], key: "P" }] },
  { id: "switcher:open", keys: [{ modifiers: ["Mod"], key: "O" }] },
  { id: "app:open-settings", keys: [{ modifiers: ["Mod"], key: "," }] },
];

/**
 * Text typed in a column that could not go into the note when its editor went away with the layout's
 * element (reading view, another note, the block changed elsewhere), by the block and side it was
 * typed for. Kept in memory for this session of Obsidian only, the latest few.
 */
const drafts = new Map<string, string>();
const MAX_DRAFTS = 20;

/**
 * What a draft was typed for: the note, the side, and the block's opening comment, rows and text on
 * that side as they were. A draft comes back only to exactly that: once the side has changed
 * elsewhere, writing the draft would undo that change, and a same-looking block elsewhere is not it.
 */
function draftKey(sourcePath: string, block: V2Block, side: TextSide): string {
  return JSON.stringify([sourcePath, side, block.lines[0], block.rows.map((row) => row.embeds.map((embed) => embed.raw)), textOf(block, side)]);
}

/** How many blocks of the note in `view` a draft for `key` could belong to. */
function draftTargets(view: EditorView, sourcePath: string, side: TextSide, key: string): number {
  return findV2Blocks(view.state.doc.toString().split("\n")).filter((block) => draftKey(sourcePath, block, side) === key).length;
}

/** Starts typing the text on `side` right in the layout, with the caret where `point` is on the drawn text, or at its end. */
export function startTextEdit(host: TextEditHost, side: TextSide, point: Point | null): void {
  const active = sessions.get(host.el);
  if (active) {
    active.switchColumn(side, point);
    return;
  }
  const source = textOf(host.context.block, side);
  const key = draftKey(host.sourcePath, host.context.block, side);
  let draft = drafts.get(key);
  // With identical blocks in the note, nothing tells which one the draft was typed in: it stays kept,
  // and comes back once that block is the only one like it.
  if (draft !== undefined && draftTargets(host.view, host.sourcePath, side, key) > 1) {
    new Notice(t("textDraftAmbiguous"));
    draft = undefined;
  }
  let current = host;
  let column = columnOf(current, side);
  const caret = draft !== undefined ? draft.length : point && column ? caretInSource(column, point, source) : source.length;
  if (!column) {
    current = current.redraw(current.context.block, side);
    column = columnOf(current, side);
  }
  if (column) {
    sessions.set(current.el, new TextEditSession(current, side, column, draft ?? source, caret, draft !== undefined));
    if (draft !== undefined) {
      drafts.delete(key);
      new Notice(t("textDraftRestored"));
    }
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
  /** The lineage of the note's buffer when the typing started: drafts are judged against that note. */
  private readonly lineage: string | undefined;
  /** The frame around the column's editor. */
  private readonly box: HTMLElement;
  private readonly editor: EditorView;
  private readonly discardButton: HTMLButtonElement;
  // Obsidian's hotkeys act on the note's editor, not on this one: none of them while typing here, but
  // for the few that act on no editor (GLOBAL_COMMANDS). The column's editor carries out Obsidian's
  // editor commands on their keys itself (columnKeys.ts).
  private readonly scope = new Scope();
  private block: V2Block;
  /** The text going into the note right now; the note holds it once the write is done. */
  private writing: string | null = null;
  /** Whether the editor holds a change the note does not have yet, typed while an input method composes. */
  private pending = false;
  private pushed = false;
  private ended = false;
  /** Whether the editor holds text that cannot go into the note as it is (its frame shows red). */
  private invalid = false;
  /** Whether Esc was pressed once on such text: a second press, with nothing typed between, gives it up. */
  private warned = false;

  /** `text` is the column's source, or, `restored`, a draft of it typed before that could not be saved. */
  constructor(host: TextEditHost, side: TextSide, column: HTMLElement, text: string, caret: number, restored = false) {
    this.host = host;
    this.side = side;
    this.block = host.context.block;
    this.lineage = snapshotForState(host.view.state)?.lineageId;
    column.empty();
    // The source is drawn as the note's editor draws its text, not as rendered Markdown.
    column.removeClass("markdown-rendered");
    column.addClass("vml-layout__text--editing");
    this.box = column.createDiv({ cls: "vml-text-editor" });
    column.createDiv({ cls: "vml-text-editor__note", text: t("textNotSaved") });
    this.editor = createColumnEditor({
      parent: this.box,
      app: host.app,
      sourcePath: host.sourcePath,
      note: host.view,
      text,
      caret,
      onUpdate: (update) => this.updated(update),
    });
    const actions = column.createDiv({ cls: "vml-text-editor__actions" });
    const done = actions.createEl("button", { text: t("textDone"), attr: { type: "button" } });
    this.discardButton = actions.createEl("button", { text: t("textDiscardDraft"),
      attr: { type: "button", title: t("textDiscardDraftDesc") } });
    this.discardButton.disabled = true;
    // Decide what happens to the draft and IME before the buttons take input focus.
    for (const name of ["pointerdown", "mousedown"]) actions.addEventListener(name, event => {
      event.preventDefault();
      event.stopPropagation();
    });
    done.addEventListener("click", event => {
      event.stopPropagation();
      if (this.editor.composing || this.editor.compositionStarted) {
        new Notice(t("textFinishComposition"));
        this.editor.focus();
        return;
      }
      this.end();
    });
    this.discardButton.addEventListener("click", event => {
      event.stopPropagation();
      if (this.invalid) this.discard();
    });
    this.scope.register([], "Escape", (event) => {
      // Esc during an input method's composition cancels the composition, and with link suggestions
      // open it closes them.
      if (event.isComposing || closeLinkSuggest(this.editor)) {
        return event.isComposing;
      }
      // Text that cannot be saved is never given up without asking: Esc once warns, twice discards it.
      if (this.invalid && !this.warned) {
        this.warned = true;
        new Notice(t("textUnsavedEsc"));
      } else if (this.invalid) {
        this.discard();
      } else {
        this.editor.contentDOM.blur();
      }
      return false;
    });
    for (const command of GLOBAL_COMMANDS) {
      for (const hotkey of commandHotkeys(host.app, command.id, command.keys)) {
        this.scope.register(hotkey.modifiers, hotkey.key, () => {
          executeCommand(host.app, command.id);
          return false;
        });
      }
    }

    const content = this.editor.contentDOM;
    // Focus leaving the editor ends the typing, once it has settled elsewhere. Another window taking
    // the focus leaves the editor focused in this one, and the typing goes on on return.
    content.addEventListener("focusout", () => {
      content.win.setTimeout(() => {
        if (content.doc.activeElement !== content) {
          this.end();
        }
      }, 0);
    });
    // Back in an editor that was left open on unsaved text, Obsidian's hotkeys stay away again.
    content.addEventListener("focusin", () => this.pushScope());
    // Composed text goes in with the editor's next update; this covers an editor that reports none.
    content.addEventListener("compositionend", () => {
      content.win.setTimeout(() => {
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
    // A restored draft is checked as typed text is: its frame shows whether it can be saved now.
    if (restored) {
      this.write();
    }
  }

  /**
   * Whether `block`, the layout's block after a change to the note, holds just the typed text: then the
   * layout stays. CodeMirror also offers the element to the widgets of other blocks, which it may not
   * take; the typing goes on, and ends only if the element goes away (stopTextEdit).
   */
  accepts(block: V2Block): boolean {
    // CodeMirror offers the element to the widgets of other blocks too: an identical block elsewhere,
    // left when this one is deleted, is another block and does not take this editor or its draft.
    const mine = blockIdentity(this.block);
    if (mine !== undefined && blockIdentity(block) !== mine) {
      return false;
    }
    // What the note holds of this side: the text being written, the typed text once it is written, or,
    // while the editor holds text that cannot be written, the side as it last was. The block may still
    // move (a line added above it) without the unsaved text going away with its element.
    const text = this.writing ?? (this.invalid ? textOf(this.block, this.side) : this.editor.state.doc.toString());
    if (this.ended || blockWrap(block) !== blockWrap(this.block) || !onlyColumnTextDiffers(this.block, block, this.side, text.split("\n"))) {
      return false;
    }
    this.block = block;
    this.host.context.block = block;
    this.host.context.model = modelFromBlock(block);
    return true;
  }

  /**
   * Stops without drawing anything: the layout is drawn anew anyway. Text that could not be saved is
   * kept as a draft, for the column of the same block to bring back when it is typed in again.
   */
  abort(): void {
    if (this.ended) {
      return;
    }
    if (this.invalid) {
      const key = draftKey(this.host.sourcePath, this.block, this.side);
      if (this.draftBelongs(key)) {
        setBounded(drafts, key, this.editor.state.doc.toString(), MAX_DRAFTS);
        new Notice(t("textDraftSaved"));
      } else {
        new Notice(t("textDraftNotKept"));
      }
    }
    this.finish();
  }

  /**
   * Leaves the editor: what is left is written, and the layout is drawn again from the note. Text that
   * cannot be written keeps the editor open, its frame red, for the text to be fixed or given up with Esc.
   */
  private end(): TextEditHost | null {
    if (this.ended) {
      return null;
    }
    this.write(true);
    if (this.ended) {
      return null;
    }
    if (this.invalid) {
      this.popScope();
      new Notice(t("textKeptOpen"));
      return null;
    }
    this.finish();
    return this.host.redraw(this.block);
  }

  /** A click on the other rendered column finishes this one through its normal write checks. */
  switchColumn(side: TextSide, point: Point | null): void {
    if (side !== this.side) {
      const next = this.end();
      if (next) {
        startTextEdit(next, side, point);
        return;
      }
    }
    this.editor.focus();
    this.pushScope();
  }

  /**
   * Whether a draft kept under `key` can only come back to this block: no other block of the note
   * (another runtime identity) reads the way this one did when the draft was typed for it. This block
   * itself may be there as it was, changed elsewhere or deleted: an undo back to it brings the draft
   * back. The note is the one the typing started in, as it last stood with layouts in it, not whatever
   * the editor shows now: going to another note or closing this one empties or replaces the editor's
   * text before its widgets go. Unknown, the draft is not kept.
   */
  private draftBelongs(key: string): boolean {
    const mine = blockIdentity(this.block);
    const snapshot = this.lineage === undefined ? null : latestSnapshotOf(this.lineage);
    return mine !== undefined && snapshot !== null
      && !snapshot.blocks.some((ref) => ref.id !== mine && draftKey(this.host.sourcePath, ref.block, this.side) === key);
  }

  /** Gives up the text that cannot be written, and draws the layout again from the note. */
  private discard(): void {
    this.finish();
    this.host.redraw(this.block);
  }

  /** Writes each change; one typed while an input method composes, once the composition ends. */
  private updated(update: ViewUpdate): void {
    if (update.docChanged) {
      this.pending = true;
      this.warned = false;
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
    this.invalid = !plan.fits;
    this.box.toggleClass("is-invalid", this.invalid);
    this.discardButton.disabled = !this.invalid;
    if (!plan.edit) {
      return;
    }
    this.writing = text;
    void commitEdits(this.host.app, this.host.sourcePath, [plan.edit], { editor: this.host.editor, view: this.host.view, typing: true }).then((written) => {
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
  // Newer browsers expose a caret position; older Android WebViews expose a collapsed range.
  const lookup = column.doc as unknown as {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let position = lookup.caretPositionFromPoint?.(point.x, point.y);
  if (!position) {
    const caret = lookup.caretRangeFromPoint?.(point.x, point.y);
    if (caret) position = { offsetNode: caret.startContainer, offset: caret.startOffset };
  }
  if (!position || !column.contains(position.offsetNode)) {
    return source.length;
  }
  const part = position.offsetNode.parentElement?.closest<HTMLElement>(".vml-text-column");
  const sourceFrom = part ? Number(part.dataset.sourceFrom) : 0;
  const sourceTo = part ? Number(part.dataset.sourceTo) : source.length;
  const range = column.doc.createRange();
  range.setStart(part ?? column, 0);
  range.setEnd(position.offsetNode, position.offset);
  const before = range.toString().replace(/\s+/g, "");
  if (before === "") {
    return sourceFrom;
  }
  // The drawn text has no line breaks and collapses spaces: both sides are compared without whitespace.
  const { text: compact, offsets } = withoutWhitespace(source.slice(sourceFrom, sourceTo));
  for (const size of CARET_CLUES) {
    const clue = before.slice(-size);
    const at = compact.indexOf(clue);
    if (clue.length === Math.min(size, before.length) && at >= 0 && compact.indexOf(clue, at + 1) < 0) {
      return sourceFrom + (offsets[at + clue.length - 1] ?? sourceTo - sourceFrom - 1) + 1;
    }
  }
  return sourceTo;
}

/** `source` without whitespace, and where each of its characters is in `source`. */
function withoutWhitespace(source: string): { text: string; offsets: number[] } {
  let text = "";
  const offsets: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (!/\s/.test(char)) {
      text += char;
      offsets.push(index);
    }
  }
  return { text, offsets };
}
