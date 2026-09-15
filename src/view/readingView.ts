import { MarkdownRenderChild, MarkdownView, type MarkdownPostProcessorContext, type MarkdownSectionInformation, type Plugin } from "obsidian";

import { findV2Blocks, hasSideText, type V2Block } from "../format/v2.ts";
import { drawnFrom, isStale, recordDrawn, type Drawn } from "../layout/drawn.ts";
import { modelFromBlock } from "../layout/model.ts";
import { renderLayout } from "./layoutView.ts";
import { blockWarning } from "./messages.ts";
import { readingSections } from "./obsidianInternals.ts";
import { keepWrapped, keepWrapsBeside } from "./readingWrap.ts";

const RERENDER_ATTEMPTS = 5;
const RERENDER_RETRY_MS = 100;

/** The class of every section of a note with a floating layout (styles.css). */
const WRAPPING = "vml-rv-wrapping";

/**
 * Reading view. Obsidian renders each paragraph as its own section, and the embed lines of a block
 * form a section between the two comment sections (docs/DESIGN.md, section 4). A section that lies
 * entirely inside a block body is replaced with the layout of the rows it holds. A layout with text
 * beside its media is drawn whole in the section of its first line, and its other sections are left
 * empty. Transcluded notes have no section info and keep Obsidian's own rendering. In a note with a
 * floating layout, every section also gets its stand-ins for the floats beside it (readingWrap.ts).
 *
 * Layouts are only shown here; they are changed in live preview. A click on one of their images
 * opens Obsidian's image viewer, as for any image in reading view.
 */
export function registerReadingView(plugin: Plugin): void {
  // Sections of one note arrive one after another with the same text; parse it once.
  let lastText: string | null = null;
  let lastBlocks: V2Block[] = [];
  let lastState: Drawn = { comments: "", texts: [] };
  /** Whether a layout of that note floats. */
  let lastWrapped = false;
  const parse = (text: string): void => {
    if (text !== lastText) {
      lastText = text;
      lastBlocks = findBlocks(text);
      lastState = drawnFrom(lastBlocks);
      lastWrapped = lastBlocks.some((block) => block.invalidLine === null && modelFromBlock(block).wrap !== null);
    }
  };

  // What the layouts drawn for each note show, by path.
  const drawn = new Map<string, Drawn>();

  // For each reading view, by its document id, the note it drew last and whether that has a floating layout.
  const views = new Map<string, { path: string; wrapped: boolean }>();

  // In a note with a floating layout, lists, quotes and the like sit beside a float as a whole
  // (styles.css). Obsidian keeps the drawn sections of text that did not change, which never reach
  // here again: when a note gains its first floating layout or loses its last, every section of the
  // reading view changes class, or where Obsidian's renderer cannot be read, the note is drawn again.
  const markWrapping = (el: HTMLElement, ctx: MarkdownPostProcessorContext, text: string): void => {
    el.toggleClass(WRAPPING, lastWrapped);
    const seen = views.get(ctx.docId);
    views.set(ctx.docId, { path: ctx.sourcePath, wrapped: lastWrapped });
    if (seen?.path !== ctx.sourcePath || seen.wrapped === lastWrapped) {
      return;
    }
    const reading = readingSections(plugin.app, el);
    if (reading) {
      for (const section of reading.sections) {
        section.el.toggleClass(WRAPPING, lastWrapped);
      }
    } else {
      // Not while Obsidian draws.
      window.setTimeout(() => rerenderNote(plugin, ctx.sourcePath, text), 0);
    }
  };

  const draw = (el: HTMLElement, info: MarkdownSectionInformation, ctx: MarkdownPostProcessorContext): void => {
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
      editable: false,
      warning: blockWarning(block),
      component: child,
    });
    if (model.wrap !== null) {
      child.register(keepWrapped(plugin.app, el, root, model.wrap));
    }
  };

  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const info = ctx.getSectionInfo(el);
    if (!info) {
      return;
    }
    parse(info.text);
    draw(el, info, ctx);
    markWrapping(el, ctx, info.text);
    // Before Obsidian measures this section, it gets its stand-ins for the floats beside it.
    if (lastWrapped) {
      keepWrapsBeside(plugin.app, el);
    }
  });

  // Obsidian keeps the rendered section of any text that did not change. A settings-only change
  // rewrites just the opening comment, so the section with the embeds would go on showing the old
  // layout; a change to the text beside a layout's media may reach only a section the layout is not
  // drawn in. Re-render that note's reading views.
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
    rerenderNote(plugin, file.path, data);
  }));
  plugin.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => {
    const state = drawn.get(oldPath);
    if (state !== undefined) {
      drawn.delete(oldPath);
      drawn.set(file.path, state);
    }
  }));
}

/** Re-renders the reading views of the note at `path`, each once it shows `data`. */
function rerenderNote(plugin: Plugin, path: string, data: string): void {
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === path && view.getMode() === "preview") {
      rerenderWhenCurrent(view, data, RERENDER_ATTEMPTS);
    }
  }
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
