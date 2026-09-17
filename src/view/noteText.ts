import { MarkdownView, type App, type MarkdownPostProcessorContext, type MarkdownSectionInformation } from "obsidian";

/**
 * The text of the note a reading-view section belongs to. Obsidian gives it with the section's
 * information, but not always: some sections, an equation's among them, come with no text at all
 * (1.13.7, docs/DESIGN.md, section 4). Then the text is the one a view of that note shows.
 */
export function sectionNoteText(app: App, ctx: MarkdownPostProcessorContext, info: MarkdownSectionInformation): string {
  if (info.text !== "") {
    return info.text;
  }
  const view = app.workspace.getLeavesOfType("markdown")
    .map((leaf) => leaf.view)
    .find((candidate): candidate is MarkdownView => candidate instanceof MarkdownView && candidate.file?.path === ctx.sourcePath);
  return view?.getViewData() ?? "";
}
