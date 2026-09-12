import { MarkdownRenderChild, MarkdownView, type Plugin } from "obsidian";

import { findV2Blocks, type V2Block } from "../format/v2.ts";
import { isEditable } from "../layout/edits.ts";
import { modelFromBlock } from "../layout/model.ts";
import { attachInteractions } from "./interactions.ts";
import { renderLayout } from "./layoutView.ts";
import { blockWarning } from "./messages.ts";

const LAYOUT_COMMENT_LINES = /^<!-- \/?vml\b.*$/gm;
const RERENDER_ATTEMPTS = 5;
const RERENDER_RETRY_MS = 100;

/**
 * Reading view. Obsidian renders each paragraph as its own section, and the embed lines of a block
 * form a section between the two comment sections (docs/DESIGN.md, section 4). A section that lies
 * entirely inside a block body is replaced with the layout of the rows it holds.
 * Transcluded notes have no section info and keep Obsidian's own rendering.
 */
export function registerReadingView(plugin: Plugin): void {
  // Sections of one note arrive one after another with the same text; parse it once.
  let lastText: string | null = null;
  let lastBlocks: V2Block[] = [];
  let lastComments = "";
  const parse = (text: string): void => {
    if (text !== lastText) {
      lastText = text;
      lastBlocks = text.includes("<!-- vml") ? findV2Blocks(text.split("\n")) : [];
      lastComments = layoutCommentLines(text);
    }
  };

  // The layout comment lines each note had when its layouts were last rendered, by path.
  const renderedComments = new Map<string, string>();

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

    const rowIndices = block.rows.flatMap((row, index) => (
      row.line >= info.lineStart && row.line <= info.lineEnd ? [index] : []
    ));
    if (rowIndices.length === 0) {
      return;
    }

    renderedComments.set(ctx.sourcePath, lastComments);
    ctx.addChild(new MarkdownRenderChild(el));
    el.empty();
    const model = modelFromBlock(block);
    const root = renderLayout(el, {
      app: plugin.app,
      sourcePath: ctx.sourcePath,
      model,
      rowIndices,
      editable: isEditable(block),
      warning: blockWarning(block),
    });
    attachInteractions(root, { app: plugin.app, sourcePath: ctx.sourcePath, block, model });
  });

  // Obsidian keeps the rendered section of any text that did not change. A settings-only change
  // rewrites just the opening comment, so the section with the embeds would go on showing the old
  // layout, with settings the next edit no longer matches. Re-render that note's reading views.
  plugin.registerEvent(plugin.app.metadataCache.on("changed", (file, data) => {
    const previous = renderedComments.get(file.path);
    if (previous === undefined) {
      return;
    }
    const current = layoutCommentLines(data);
    if (current === previous) {
      return;
    }
    renderedComments.set(file.path, current);
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === file.path && view.getMode() === "preview") {
        rerenderWhenCurrent(view, data, RERENDER_ATTEMPTS);
      }
    }
  }));
  plugin.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => {
    const comments = renderedComments.get(oldPath);
    if (comments !== undefined) {
      renderedComments.delete(oldPath);
      renderedComments.set(file.path, comments);
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

function layoutCommentLines(text: string): string {
  return (text.match(LAYOUT_COMMENT_LINES) ?? []).join("\n");
}
