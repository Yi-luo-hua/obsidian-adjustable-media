import { MarkdownRenderChild, MarkdownView, type Plugin } from "obsidian";

import { findV2Blocks, hasSideText, type V2Block } from "../format/v2.ts";
import { drawnFrom, isStale, recordDrawn, type Drawn } from "../layout/drawn.ts";
import { isEditable } from "../layout/edits.ts";
import { modelFromBlock } from "../layout/model.ts";
import { attachInteractions } from "./interactions.ts";
import { renderLayout } from "./layoutView.ts";
import { blockWarning } from "./messages.ts";
import { keepWrapped } from "./readingWrap.ts";

const RERENDER_ATTEMPTS = 5;
const RERENDER_RETRY_MS = 100;

/**
 * Reading view. Obsidian renders each paragraph as its own section, and the embed lines of a block
 * form a section between the two comment sections (docs/DESIGN.md, section 4). A section that lies
 * entirely inside a block body is replaced with the layout of the rows it holds. A layout with text
 * beside its media is drawn whole in the section of its first line, and its other sections are left
 * empty. Transcluded notes have no section info and keep Obsidian's own rendering.
 */
export function registerReadingView(plugin: Plugin): void {
  // Sections of one note arrive one after another with the same text; parse it once.
  let lastText: string | null = null;
  let lastBlocks: V2Block[] = [];
  let lastState: Drawn = { comments: "", texts: [] };
  const parse = (text: string): void => {
    if (text !== lastText) {
      lastText = text;
      lastBlocks = findBlocks(text);
      lastState = drawnFrom(lastBlocks);
    }
  };

  // What the layouts drawn for each note show, by path.
  const drawn = new Map<string, Drawn>();

  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const info = ctx.getSectionInfo(el);
    if (!info) {
      return;
    }
    parse(info.text);

    const block = lastBlocks.find((candidate) => info.lineStart > candidate.openLine && info.lineEnd < candidate.closeLine);
    if (!block || block.invalidLine !== null) {
      return;
    }

    let rowIndices: number[] | undefined;
    if (hasSideText(block)) {
      const first = block.leftText?.from ?? block.rows[0]?.line ?? -1;
      if (first < info.lineStart || first > info.lineEnd) {
        el.empty();
        return;
      }
    } else {
      rowIndices = block.rows.flatMap((row, index) => (
        row.line >= info.lineStart && row.line <= info.lineEnd ? [index] : []
      ));
      if (rowIndices.length === 0) {
        return;
      }
    }

    drawn.set(ctx.sourcePath, recordDrawn(drawn.get(ctx.sourcePath), lastState, lastBlocks.filter(hasSideText).indexOf(block)));
    const child = new MarkdownRenderChild(el);
    ctx.addChild(child);
    el.empty();
    const model = modelFromBlock(block);
    const root = renderLayout(el, {
      app: plugin.app,
      sourcePath: ctx.sourcePath,
      model,
      rowIndices,
      editable: isEditable(block),
      warning: blockWarning(block),
      component: child,
    });
    attachInteractions(root, { app: plugin.app, sourcePath: ctx.sourcePath, block, model, live: false });
    if (model.wrap !== null) {
      child.register(keepWrapped(el, root, model.wrap));
    }
  });

  // Obsidian keeps the rendered section of any text that did not change. A settings-only change
  // rewrites just the opening comment, so the section with the embeds would go on showing the old
  // layout, with settings the next edit no longer matches; a change to the text beside a layout's
  // media may reach only a section the layout is not drawn in. Re-render that note's reading views.
  plugin.registerEvent(plugin.app.metadataCache.on("changed", (file, data) => {
    const previous = drawn.get(file.path);
    if (previous === undefined) {
      return;
    }
    const current = drawnFrom(findBlocks(data));
    if (!isStale(previous, current)) {
      return;
    }
    drawn.set(file.path, current);
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === file.path && view.getMode() === "preview") {
        rerenderWhenCurrent(view, data, RERENDER_ATTEMPTS);
      }
    }
  }));
  plugin.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => {
    const state = drawn.get(oldPath);
    if (state !== undefined) {
      drawn.delete(oldPath);
      drawn.set(file.path, state);
    }
  }));
}

/** Re-renders once the view shows `data`; it may still be loading the new content. */
function rerenderWhenCurrent(view: MarkdownView, data: string, attempts: number): void {
  if (view.getViewData() === data) {
    view.previewMode.rerender(true);
  } else if (attempts > 0) {
    window.setTimeout(() => rerenderWhenCurrent(view, data, attempts - 1), RERENDER_RETRY_MS);
  }
}

function findBlocks(text: string): V2Block[] {
  return text.includes("<!-- vml") ? findV2Blocks(text.split("\n")) : [];
}
