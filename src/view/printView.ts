import { MarkdownRenderChild, MarkdownRenderer, TFile, type App, type MarkdownPostProcessorContext } from "obsidian";

import { printPlan } from "../markdown/print.ts";
import { modelFromBlock } from "../layout/model.ts";
import { markCaptions, numbered, refContextOf } from "./crossrefView.ts";
import { renderLayout } from "./layoutView.ts";
import { blockWarning } from "./messages.ts";

const rendering = new WeakSet<HTMLElement>();

/** PDF's postprocessor has no section offsets. Render its whole note once, with layout slots. */
export async function renderPrintLayouts(app: App, el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
  if (!el.matches(".markdown-preview-view") || !el.closest(".print")) {
    return;
  }
  for (let parent: HTMLElement | null = el; parent; parent = parent.parentElement) {
    if (rendering.has(parent)) {
      return;
    }
  }
  rendering.add(el);
  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) {
    rendering.delete(el);
    return;
  }
  const text = await app.vault.cachedRead(file);
  const token = crypto.randomUUID();
  const { markdown, blocks } = printPlan(text, token);
  if (blocks.length === 0) {
    rendering.delete(el);
    return;
  }
  const child = new MarkdownRenderChild(el);
  ctx.addChild(child);
  // Keep Obsidian's optional filename title and export container settings.
  const title = el.querySelector(":scope > h1");
  const content = el.createDiv({ cls: "vml-print-content" });
  const refs = refContextOf(text);
  // Export has no section offsets, so crossref's normal postprocessor cannot number the body.
  // Number before rendering, including TeX labels: leaving them to MathJax causes duplicate labels.
  await MarkdownRenderer.render(app, numbered(markdown, refs), content, ctx.sourcePath, child);
  markCaptions(content, markdown);
  const tasks: Promise<void>[] = [];
  blocks.forEach((block, index) => {
    const slot = content.querySelector<HTMLElement>(`[data-vml-print="${token}-${index}"]`);
    if (slot) {
      renderLayout(slot, { app, sourcePath: ctx.sourcePath, model: modelFromBlock(block), editable: false,
        warning: blockWarning(block), component: child, refs, renderTasks: tasks });
    }
  });
  await Promise.all(tasks);
  await Promise.all(Array.from(content.querySelectorAll("img"), (img) => new Promise<void>((resolve) => {
    if (img.complete) {
      resolve();
      return;
    }
    const finish = (): void => { img.win.clearTimeout(timer); img.removeEventListener("load", finish); img.removeEventListener("error", finish); resolve(); };
    const timer = img.win.setTimeout(finish, 5000);
    img.addEventListener("load", finish);
    img.addEventListener("error", finish);
  })));
  el.replaceChildren(...(title ? [title] : []), content);
}
