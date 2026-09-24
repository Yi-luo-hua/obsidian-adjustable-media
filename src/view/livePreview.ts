import { Component, editorInfoField, editorLivePreviewField, type App } from "obsidian";
import { Prec, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

import { blockWrap, findV2Blocks, hasTextColumns, isDrawable, type TextSide, type V2Block } from "../format/v2.ts";
import { isEditable } from "../layout/edits.ts";
import { effectiveWrapSkip } from "../layout/floatOrder.ts";
import { modelFromBlock } from "../layout/model.ts";
import { mayHaveRefs } from "../markdown/crossref.ts";
import { setUpBlockMove } from "./blockDrag.ts";
import { refContextOf, type RefContext } from "./crossrefView.ts";
import { attachInteractions, type LayoutContext } from "./interactions.ts";
import { renderLayout } from "./layoutView.ts";
import { layoutHistory } from "./layoutHistory.ts";
import { blockWarning, t } from "./messages.ts";
import { isEditingText, keepWhileEditing, startTextEdit, stopTextEdit, type TextEditHost } from "./textEditing.ts";
import { wrapGuard, type WrapAnchor } from "./wrapGuard.ts";

interface LivePreviewState {
  blocks: V2Block[];
  lines: string[];
  decorations: DecorationSet;
  /** Wrapped layouts drawn as widgets. */
  anchors: WrapAnchor[];
  /** Whether any layout of the note wraps text, drawn or showing its source. */
  hasWraps: boolean;
  /** The note's numbered figures, tables and equations, if it has any labels or references. */
  refs: RefContext | undefined;
}

interface Parsed {
  blocks: V2Block[];
  lines: string[];
  refs: RefContext | undefined;
}

/**
 * Live preview. Each v2 block is replaced with its rendered layout; while the cursor or a selection
 * touches the block, its source shows again (docs/DESIGN.md, section 4). The note is parsed only when
 * it changes; a cursor move just recomputes which blocks show their source.
 *
 * An editor showing a note with editable layouts gets the class `vml-has-layouts`: images outside
 * the layouts can then be dragged into them, and show a grab cursor. One showing a note with
 * wrapped layouts gets `vml-has-wraps`, which lets the note's lines wrap around them.
 */
export function livePreviewExtension(app: App): Extension {
  const field = StateField.define<LivePreviewState>({
    create: (state) => withDecorations(app, state, parse(state)),
    update(value, tr) {
      const modeChanged = tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false);
      if (tr.docChanged || modeChanged) {
        return withDecorations(app, tr.state, parse(tr.state));
      }
      if (tr.selection) {
        return withDecorations(app, tr.state, value);
      }
      return value;
    },
    provide: (self) => [
      EditorView.decorations.from(self, (value) => value.decorations),
      EditorView.editorAttributes.from(self, (value): Record<string, string> => {
        const classes = [value.blocks.some(isEditable) ? "vml-has-layouts" : "", value.hasWraps ? "vml-has-wraps" : ""].filter(Boolean);
        return classes.length > 0 ? { class: classes.join(" ") } : {};
      }),
    ],
  });
  return [
    layoutHistory(),
    Prec.high(field),
    wrapGuard(app, {
      anchors: (state) => state.field(field, false)?.anchors ?? [],
      hasWraps: (state) => state.field(field, false)?.hasWraps ?? false,
    }),
  ];
}

function parse(state: EditorState): Parsed {
  if (!state.field(editorLivePreviewField, false)) {
    return { blocks: [], lines: [], refs: undefined };
  }
  // Runs on every change of every note, and most notes have no layouts.
  const text = state.doc.toString();
  if (!text.includes("<!-- vml")) {
    return { blocks: [], lines: [], refs: undefined };
  }
  const lines = text.split("\n");
  return { blocks: findV2Blocks(lines), lines, refs: mayHaveRefs(text) ? refContextOf(text) : undefined };
}

function withDecorations(app: App, state: EditorState, { blocks, lines, refs }: Parsed): LivePreviewState {
  const ranges: Array<Range<Decoration>> = [];
  const sourcePath = state.field(editorInfoField, false)?.file?.path ?? "";
  const anchors: WrapAnchor[] = [];
  let hasWraps = false;

  for (const [index, block] of blocks.entries()) {
    if (!isDrawable(block)) {
      continue;
    }
    const from = state.doc.line(block.openLine + 1).from;
    const to = state.doc.line(block.closeLine + 1).to;
    const revealed = state.selection.ranges.some((range) => range.from <= to && range.to >= from);
    const wraps = blockWrap(block) !== null;
    const effectiveSkip = effectiveWrapSkip(lines, blocks, index);
    const key = block.lines.join("\n");
    hasWraps ||= wraps;
    if (!revealed) {
      ranges.push(Decoration.replace({ block: true, widget: new LayoutWidget(app, block, sourcePath, refs, effectiveSkip) }).range(from, to));
      if (wraps) {
        anchors.push({ from, to, key, block });
      }
      continue;
    }

    // Keep a text/media layout at its original position while its source opens below it. Replacing
    // the columns with normal Markdown would move the image below all of the left column's text.
    if (hasTextColumns(block)) {
      ranges.push(Decoration.widget({ block: true, side: -1, widget: new LayoutWidget(app, block, sourcePath, refs, effectiveSkip, true) }).range(from));
    }
    // The source shows, with the media Obsidian draws in it as thumbnails.
    for (let line = block.openLine; line <= block.closeLine; line += 1) {
      ranges.push(Decoration.line({ class: "vml-source-line" }).range(state.doc.line(line + 1).from));
    }
    if (wraps) {
      // The layout floats beside its source, so the text around it keeps its wrap.
      ranges.push(Decoration.widget({ widget: new RevealedWrapWidget(app, block, sourcePath, effectiveSkip), side: -1 }).range(from));
      anchors.push({ from, to: from, key, block });
    }
  }

  // Blank lines between two floating layouts written one after the other would push the later one a
  // line down: they take no room while the cursor is elsewhere.
  for (let index = 1; index < blocks.length; index += 1) {
    const before = blocks[index - 1];
    const after = blocks[index];
    if (!before || !after || !isDrawable(before) || !isDrawable(after) || blockWrap(before) === null || blockWrap(after) === null) {
      continue;
    }
    const gap = state.doc.sliceString(state.doc.line(before.closeLine + 1).to, state.doc.line(after.openLine + 1).from);
    if (gap.trim() !== "" || state.selection.ranges.some((range) => range.from <= state.doc.line(after.closeLine + 1).to && range.to >= state.doc.line(before.openLine + 1).from)) {
      continue;
    }
    for (let line = before.closeLine + 1; line < after.openLine; line += 1) {
      ranges.push(Decoration.line({ class: "vml-float-gap" }).range(state.doc.line(line + 1).from));
    }
  }

  return { blocks, lines, decorations: Decoration.set(ranges, true), anchors, hasWraps, refs };
}

/** What Obsidian draws for the text beside a layout's media lives as long as the widget's element. */
const components = new WeakMap<HTMLElement, Component>();

/**
 * The heights layouts were drawn at, by their block's text and by their place in the note, for
 * CodeMirror to count a layout it has not drawn at the height it will have. Counted by its lines
 * instead, a tall layout of text is far too short: the note's height is off, the note jumps as it
 * scrolls, and a change to the layout, typing in it included, puts it out of the editor's view. The
 * place stands in for a layout whose text has just changed.
 */
const drawnHeights = new Map<string, number>();
const MAX_DRAWN_HEIGHTS = 1000;
const heightWatchers = new WeakMap<HTMLElement, ResizeObserver>();

/** Records the height of the widget `el` under `keys`, now and whenever it changes. */
function watchHeight(el: HTMLElement, keys: readonly string[]): void {
  heightWatchers.get(el)?.disconnect();
  const watcher = new ResizeObserver(() => rememberHeight(keys, el.offsetHeight));
  watcher.observe(el);
  heightWatchers.set(el, watcher);
}

function rememberHeight(keys: readonly string[], height: number): void {
  if (height <= 0) {
    return;
  }
  for (const key of keys) {
    drawnHeights.delete(key);
    drawnHeights.set(key, height);
  }
  // The oldest go first.
  for (const key of drawnHeights.keys()) {
    if (drawnHeights.size <= MAX_DRAWN_HEIGHTS) {
      break;
    }
    drawnHeights.delete(key);
  }
}

class LayoutWidget extends WidgetType {
  private readonly app: App;
  private readonly block: V2Block;
  private readonly sourcePath: string;
  private readonly refs: RefContext | undefined;
  private readonly effectiveSkip: number | null;
  private readonly key: string;
  private readonly placeKey: string;
  private readonly sourcePreview: boolean;

  constructor(app: App, block: V2Block, sourcePath: string, refs: RefContext | undefined,
    effectiveSkip: number | null, sourcePreview = false) {
    super();
    this.app = app;
    this.block = block;
    this.sourcePath = sourcePath;
    this.refs = refs;
    this.effectiveSkip = effectiveSkip;
    this.sourcePreview = sourcePreview;
    // New numbers draw the layout again.
    const numbers = refs ? `${refs.language} ${refs.index.signature}` : "";
    this.key = `${sourcePath}\n${numbers}\n${effectiveSkip}\n${block.lines.join("\n")}`;
    this.placeKey = `${sourcePath}\n@${block.openLine}`;
  }

  override eq(other: LayoutWidget): boolean {
    return other.key === this.key && other.sourcePreview === this.sourcePreview;
  }

  // A wrapped layout's widget is a zero-height anchor; the layout floats out of it.
  override get estimatedHeight(): number {
    if (blockWrap(this.block) !== null) {
      return 0;
    }
    return drawnHeights.get(this.key) ?? drawnHeights.get(this.placeKey) ?? -1;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = createDiv({ cls: "vml-live-preview" });
    if (this.sourcePreview) {
      const component = new Component();
      component.load();
      components.set(el, component);
      renderLayout(el, { app: this.app, sourcePath: this.sourcePath, model: modelFromBlock(this.block), effectiveSkip: this.effectiveSkip,
        editable: false, warning: blockWarning(this.block), component, refs: this.refs });
    } else {
      drawWidget(el, view, this.app, this.block, this.sourcePath, this.refs, this.effectiveSkip);
    }
    if (blockWrap(this.block) === null) {
      watchHeight(el, [this.key, this.placeKey]);
    }
    return el;
  }

  // While one of its text columns is typed in, the layout keeps its element (textEditing.ts), and
  // its height goes on under the new text.
  override updateDOM(dom: HTMLElement): boolean {
    if (this.sourcePreview || !keepWhileEditing(dom, this.block)) {
      return false;
    }
    watchHeight(dom, [this.key, this.placeKey]);
    return true;
  }

  override destroy(dom: HTMLElement): void {
    heightWatchers.get(dom)?.disconnect();
    heightWatchers.delete(dom);
    stopTextEdit(dom);
    components.get(dom)?.unload();
    components.delete(dom);
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Draws a layout's widget into `el`, in place of what was there. With `side`, that side shows a text
 * column even without text, for its first line to be typed in.
 */
function drawWidget(
  el: HTMLElement,
  view: EditorView,
  app: App,
  block: V2Block,
  sourcePath: string,
  refs: RefContext | undefined,
  effectiveSkip: number | null,
  side?: TextSide,
): TextEditHost {
  components.get(el)?.unload();
  el.empty();
  const model = modelFromBlock(block);
  if (side === "left" && model.text.left === null) {
    model.text = { ...model.text, left: "" };
  } else if (side === "right" && model.text.right === null) {
    model.text = { ...model.text, right: "" };
  }
  el.toggleClass("vml-live-preview--wrap", model.wrap !== null);
  const component = new Component();
  component.load();
  components.set(el, component);
  const root = renderLayout(el, { app, sourcePath, model, effectiveSkip, editable: isEditable(block), warning: blockWarning(block), component, refs });
  const context: LayoutContext = { app, sourcePath, block, model, view, editor: view.state.field(editorInfoField, false)?.editor };
  const host: TextEditHost = {
    el,
    root,
    app,
    sourcePath,
    context,
    editor: view.state.field(editorInfoField, false)?.editor,
    view,
    // Drawn again from the note as it is now, numbers included.
    redraw: (next, editing) => drawWidget(el, view, app, next, sourcePath, currentRefs(view), effectiveSkip, editing),
  };
  if (isEditable(block)) {
    context.editText = (editing) => startTextEdit(host, editing, null);
  }
  attachInteractions(root, context);
  if (isEditable(block)) {
    setUpBlockMove(root, context);
  }
  setUpText(view, host);

  // On the media, where it hides none of the text beside them.
  const buttonHost = root.querySelector<HTMLElement>(":scope > .vml-layout__media") ?? root;
  const button = buttonHost.createEl("button", { cls: "vml-edit-source", text: t("editSource") });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    // Resolve the position at click time; the block may have moved since the widget was drawn.
    view.dispatch({ selection: { anchor: view.posAtDOM(el) } });
    view.focus();
  });
  return host;
}

/**
 * A click on the text beside a layout's media types it right in the layout (textEditing.ts); in a
 * block the plugin cannot write to, it shows the block's source there instead. Links in the text are
 * Obsidian's and open as anywhere else, and selecting some of the text to copy it changes nothing.
 */
function setUpText(view: EditorView, host: TextEditHost): void {
  const { block } = host.context;
  for (const textEl of Array.from(host.root.querySelectorAll<HTMLElement>(":scope > .vml-layout__text"))) {
    const side: TextSide = textEl.dataset.side === "left" ? "left" : "right";
    textEl.addEventListener("click", (event) => {
      if (isEditingText(host.el) || (event.target instanceof Element && event.target.closest("a"))) {
        return;
      }
      if (!(host.el.doc.getSelection()?.isCollapsed ?? true)) {
        return;
      }
      event.preventDefault();
      if (isEditable(block)) {
        startTextEdit(host, side, { x: event.clientX, y: event.clientY });
        return;
      }
      const text = side === "left" ? block.leftText : block.rightText;
      if (text) {
        // Resolved at click time: the block may have moved since the widget was drawn.
        const { doc } = view.state;
        const open = doc.lineAt(view.posAtDOM(host.el)).number;
        view.dispatch({ selection: { anchor: doc.line(Math.min(doc.lines, open + text.to - block.openLine)).to } });
        view.focus();
      }
    });
  }
}

/** While a wrapped layout's source shows, the layout floats beside it, for display only. */
class RevealedWrapWidget extends WidgetType {
  private readonly app: App;
  private readonly block: V2Block;
  private readonly sourcePath: string;
  private readonly effectiveSkip: number | null;
  private readonly key: string;

  constructor(app: App, block: V2Block, sourcePath: string, effectiveSkip: number | null) {
    super();
    this.app = app;
    this.block = block;
    this.sourcePath = sourcePath;
    this.effectiveSkip = effectiveSkip;
    this.key = `${sourcePath}\n${effectiveSkip}\n${block.lines.join("\n")}`;
  }

  override eq(other: RevealedWrapWidget): boolean {
    return other.key === this.key;
  }

  toDOM(): HTMLElement {
    const el = createSpan({ cls: "vml-wrap-reveal vml-live-preview vml-live-preview--wrap" });
    renderLayout(el, { app: this.app, sourcePath: this.sourcePath, model: modelFromBlock(this.block),
      effectiveSkip: this.effectiveSkip, editable: false, warning: null });
    return el;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function currentRefs(view: EditorView): RefContext | undefined {
  const text = view.state.doc.toString();
  return mayHaveRefs(text) ? refContextOf(text) : undefined;
}
