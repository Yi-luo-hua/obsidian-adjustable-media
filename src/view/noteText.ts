import type { App, MarkdownPostProcessorContext, MarkdownSectionInformation } from "obsidian";
import { readingViewOfSection } from "./obsidianInternals.ts";

/**
 * The text of the note a reading-view section belongs to. Obsidian gives it with the section's
 * information, but not always: some sections, an equation's among them, come with no text at all
 * (1.13.7, docs/DESIGN.md, section 4). Then only the owning pane can supply the text.
 */
export function sectionNoteText(app: App, ctx: MarkdownPostProcessorContext, info: MarkdownSectionInformation, el: HTMLElement): string {
  if (info.text !== "") {
    return info.text;
  }
  const view = readingViewOfSection(app, el);
  return view?.file?.path === ctx.sourcePath ? view.getViewData() : "";
}
