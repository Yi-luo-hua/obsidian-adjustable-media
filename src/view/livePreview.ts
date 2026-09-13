import { Component, editorInfoField, editorLivePreviewField, type App } from "obsidian";
import { Prec, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

import { blockWrap, findV2Blocks, type V2Block } from "../format/v2.ts";
import { isEditable } from "../layout/edits.ts";
import { modelFromBlock } from "../layout/model.ts";
import { setUpBlockMove } from "./blockDrag.ts";
import { attachInteractions, type LayoutContext } from "./interactions.ts";
import { renderLayout } from "./layoutView.ts";
import { blockWarning, t } from "./messages.ts";
import { wrapGuard, type WrapAnchor } from "./wrapGuard.ts";

interface LivePreviewState {
  blocks: V2Block[];
  decorations: DecorationSet;
  /** Wrapped layouts drawn as widgets. */
  anchors: WrapAnchor[];
  /** Whether any layout of the note wraps text, drawn or showing its source. */
  hasWraps: boolean;
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
    create: (state) => withDecorations(app, state, parseBlocks(state)),
    update(value, tr) {
      const modeChanged = tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false);
      if (tr.docChanged || modeChanged) {
        return withDecorations(app, tr.state, parseBlocks(tr.state));
      }
      if (tr.selection) {
        return withDecorations(app, tr.state, value.blocks);
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
    Prec.high(field),
    wrapGuard(app, {
      anchors: (state) => state.field(field, false)?.anchors ?? [],
      hasWraps: (state) => state.field(field, false)?.hasWraps ?? false,
    }),
  ];
}

function parseBlocks(state: EditorState): V2Block[] {
  if (!state.field(editorLivePreviewField, false)) {
    return [];
  }
  // Runs on every change of every note, and most notes have no layouts.
  const text = state.doc.toString();
  return text.includes("<!-- vml") ? findV2Blocks(text.split("\n")) : [];
}

function withDecorations(app: App, state: EditorState, blocks: V2Block[]): LivePreviewState {
  const ranges: Array<Range<Decoration>> = [];
  const sourcePath = state.field(editorInfoField, false)?.file?.path ?? "";
  const anchors: WrapAnchor[] = [];
  let hasWraps = false;

  for (const block of blocks) {
    if (block.invalidLine !== null || block.rows.length === 0) {
      continue;
    }
    const from = state.doc.line(block.openLine + 1).from;
    const to = state.doc.line(block.closeLine + 1).to;
    const revealed = state.selection.ranges.some((range) => range.from <= to && range.to >= from);
    const wraps = blockWrap(block) !== null;
    const key = block.lines.join("\n");
    hasWraps ||= wraps;
    if (!revealed) {
      ranges.push(Decoration.replace({ block: true, widget: new LayoutWidget(app, block, sourcePath) }).range(from, to));
      if (wraps) {
        anchors.push({ from, to, key, block });
      }
      continue;
    }

    // The source shows, with the media Obsidian draws in it as thumbnails, so the note barely moves.
    for (let line = block.openLine; line <= block.closeLine; line += 1) {
      ranges.push(Decoration.line({ class: "vml-source-line" }).range(state.doc.line(line + 1).from));
    }
    if (wraps) {
      // The layout floats beside its source, so the text around it keeps its wrap.
      ranges.push(Decoration.widget({ widget: new RevealedWrapWidget(app, block, sourcePath), side: -1 }).range(from));
      anchors.push({ from, to: from, key, block });
    }
  }

  return { blocks, decorations: Decoration.set(ranges, true), anchors, hasWraps };
}

/** What Obsidian draws for the text beside a layout's media lives as long as the widget's element. */
const components = new WeakMap<HTMLElement, Component>();

class LayoutWidget extends WidgetType {
  private readonly app: App;
  private readonly block: V2Block;
  private readonly sourcePath: string;
  private readonly key: string;

  constructor(app: App, block: V2Block, sourcePath: string) {
    super();
    this.app = app;
    this.block = block;
    this.sourcePath = sourcePath;
    this.key = `${sourcePath}\n${block.lines.join("\n")}`;
  }

  override eq(other: LayoutWidget): boolean {
    return other.key === this.key;
  }

  // A wrapped layout's widget is a zero-height anchor; the layout floats out of it.
  override get estimatedHeight(): number {
    return blockWrap(this.block) === null ? -1 : 0;
  }

  toDOM(view: EditorView): HTMLElement {
    const model = modelFromBlock(this.block);
    const el = createDiv({ cls: "vml-live-preview" });
    el.toggleClass("vml-live-preview--wrap", model.wrap !== null);
    const component = new Component();
    component.load();
    components.set(el, component);
    const root = renderLayout(el, {
      app: this.app,
      sourcePath: this.sourcePath,
      model,
      editable: isEditable(this.block),
      warning: blockWarning(this.block),
      component,
    });
    const context: LayoutContext = { app: this.app, sourcePath: this.sourcePath, block: this.block, model, live: true };
    attachInteractions(root, context);
    if (isEditable(this.block)) {
      setUpBlockMove(root, context);
    }
    setUpText(view, el, root, this.block);

    const button = root.createEl("button", { cls: "vml-edit-source", text: t("editSource") });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      // Resolve the position at click time; the block may have moved since the widget was drawn.
      view.dispatch({ selection: { anchor: view.posAtDOM(el) } });
      view.focus();
    });
    return el;
  }

  override destroy(dom: HTMLElement): void {
    components.get(dom)?.unload();
    components.delete(dom);
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/**
 * The text beside a layout's media is written in the note, so it is edited there: a click on it
 * shows the block's source with the cursor at the end of that text. Links in it are Obsidian's and
 * open as anywhere else, and selecting some of the text to copy it edits nothing.
 */
function setUpText(view: EditorView, el: HTMLElement, root: HTMLElement, block: V2Block): void {
  for (const textEl of Array.from(root.querySelectorAll<HTMLElement>(":scope > .vml-layout__text"))) {
    const text = textEl.dataset.side === "left" ? block.leftText : block.rightText;
    if (!text) {
      continue;
    }
    textEl.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) {
        return;
      }
      if (!(el.doc.getSelection()?.isCollapsed ?? true)) {
        return;
      }
      event.preventDefault();
      // Resolved at click time: the block may have moved since the widget was drawn.
      const { doc } = view.state;
      const open = doc.lineAt(view.posAtDOM(el)).number;
      view.dispatch({ selection: { anchor: doc.line(Math.min(doc.lines, open + text.to - block.openLine)).to } });
      view.focus();
    });
  }
}

/** While a wrapped layout's source shows, the layout floats beside it, for display only. */
class RevealedWrapWidget extends WidgetType {
  private readonly app: App;
  private readonly block: V2Block;
  private readonly sourcePath: string;
  private readonly key: string;

  constructor(app: App, block: V2Block, sourcePath: string) {
    super();
    this.app = app;
    this.block = block;
    this.sourcePath = sourcePath;
    this.key = `${sourcePath}\n${block.lines.join("\n")}`;
  }

  override eq(other: RevealedWrapWidget): boolean {
    return other.key === this.key;
  }

  toDOM(): HTMLElement {
    const el = createSpan({ cls: "vml-wrap-reveal vml-live-preview vml-live-preview--wrap" });
    renderLayout(el, { app: this.app, sourcePath: this.sourcePath, model: modelFromBlock(this.block), editable: false, warning: null });
    return el;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}
