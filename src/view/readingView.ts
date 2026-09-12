import { MarkdownRenderChild, type Plugin } from "obsidian";

import { findV2Blocks, type V2Block } from "../format/v2.ts";
import { isEditable } from "../layout/edits.ts";
import { modelFromBlock } from "../layout/model.ts";
import { attachInteractions } from "./interactions.ts";
import { renderLayout } from "./layoutView.ts";
import { blockWarning } from "./messages.ts";

/**
 * Reading view. Obsidian renders each paragraph as its own section, and the embed lines of a block
 * form a section between the two comment sections (verified in phase 1, S1). A section that lies
 * entirely inside a block body is replaced with the layout of the rows it holds.
 * Transcluded notes have no section info and keep Obsidian's own rendering.
 */
export function registerReadingView(plugin: Plugin): void {
  // Sections of one note arrive one after another with the same text; parse it once.
  let lastText: string | null = null;
  let lastBlocks: V2Block[] = [];
  const blocksOf = (text: string): V2Block[] => {
    if (text !== lastText) {
      lastText = text;
      lastBlocks = findV2Blocks(text.split("\n"));
    }
    return lastBlocks;
  };

  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const info = ctx.getSectionInfo(el);
    if (!info || !info.text.includes("<!-- vml")) {
      return;
    }

    const block = blocksOf(info.text)
      .find((candidate) => info.lineStart > candidate.openLine && info.lineEnd < candidate.closeLine);
    if (!block || block.invalidLine !== null) {
      return;
    }

    const rowIndices = block.rows.flatMap((row, index) => (
      row.line >= info.lineStart && row.line <= info.lineEnd ? [index] : []
    ));
    if (rowIndices.length === 0) {
      return;
    }

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
}
