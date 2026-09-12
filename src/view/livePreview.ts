import { editorInfoField, editorLivePreviewField, type App } from "obsidian";
import { Prec, RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

import { findV2Blocks, type V2Block } from "../format/v2.ts";
import { isEditable } from "../layout/edits.ts";
import { modelFromBlock } from "../layout/model.ts";
import { attachInteractions } from "./interactions.ts";
import { renderLayout } from "./layoutView.ts";
import { blockWarning, t } from "./messages.ts";

interface LivePreviewState {
  blocks: V2Block[];
  decorations: DecorationSet;
}

/**
 * Live preview. Each v2 block is replaced with its rendered layout; while the cursor or a selection
 * touches the block, its source shows again (verified in phase 1, S2). The note is parsed only when
 * it changes; a cursor move just recomputes which blocks show their source.
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
    provide: (self) => EditorView.decorations.from(self, (value) => value.decorations),
  });
  return Prec.high(field);
}

function parseBlocks(state: EditorState): V2Block[] {
  if (!state.field(editorLivePreviewField, false)) {
    return [];
  }
  return findV2Blocks(state.doc.toString().split("\n"));
}

function withDecorations(app: App, state: EditorState, blocks: V2Block[]): LivePreviewState {
  const builder = new RangeSetBuilder<Decoration>();
  const sourcePath = state.field(editorInfoField, false)?.file?.path ?? "";

  for (const block of blocks) {
    if (block.invalidLine !== null || block.rows.length === 0) {
      continue;
    }
    const from = state.doc.line(block.openLine + 1).from;
    const to = state.doc.line(block.closeLine + 1).to;
    const revealed = state.selection.ranges.some((range) => range.from <= to && range.to >= from);
    if (!revealed) {
      builder.add(from, to, Decoration.replace({ block: true, widget: new LayoutWidget(app, block, sourcePath) }));
    }
  }

  return { blocks, decorations: builder.finish() };
}

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

  toDOM(view: EditorView): HTMLElement {
    const el = createDiv({ cls: "vml-live-preview" });
    const model = modelFromBlock(this.block);
    const root = renderLayout(el, {
      app: this.app,
      sourcePath: this.sourcePath,
      model,
      editable: isEditable(this.block),
      warning: blockWarning(this.block),
    });
    attachInteractions(root, { app: this.app, sourcePath: this.sourcePath, block: this.block, model });

    const button = el.createEl("button", { cls: "vml-edit-source", text: t("editSource") });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      // Resolve the position at click time; the block may have moved since the widget was drawn.
      view.dispatch({ selection: { anchor: view.posAtDOM(el) } });
      view.focus();
    });
    return el;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}
