import { MarkdownRenderer, type App, type Component } from "obsidian";

import { readMediaEmbeds, type V2Embed } from "../format/v2.ts";
import { scanMarkdownLines } from "../markdown/lineContext.ts";
import { resolveMedia } from "./media.ts";
import { t } from "./messages.ts";

interface Automate {
  createSVG(path: string, embedFonts: boolean): Promise<SVGSVGElement>;
  destroy(): void;
}
interface ExcalidrawPlugin {
  ea: Automate & { constructor: new (plugin: ExcalidrawPlugin) => Automate };
}

/** Obtain the optional plugin's Automate class from its existing instance. Each export uses
 * its own instance; never reset or mutate the user's script state. */
function excalidrawPlugin(app: App): ExcalidrawPlugin | undefined {
  const plugin = (app as App & { plugins?: { plugins: Record<string, ExcalidrawPlugin | undefined> } }).plugins?.plugins["obsidian-excalidraw-plugin"];
  return typeof plugin?.ea?.createSVG === "function" ? plugin : undefined;
}

/** Native Markdown postprocessing skips the detached sections used by MarkdownRenderer.
 * Generate an in-memory SVG through Excalidraw's API, without writing an exported file. */
export function renderExcalidraw(app: App, embed: V2Embed, el: HTMLElement, sourcePath: string, component: Component,
  sized: (size: { width: number; height: number }) => void = () => {}): Promise<void> {
  let active = true, generation = 0, url = "", timer = 0;
  let complete!: () => void;
  const initial = new Promise<void>(resolve => { complete = resolve; });
  const win = el.win as Window & typeof window;
  const refresh = async (): Promise<void> => {
    const current = ++generation;
    const plugin = excalidrawPlugin(app);
    const media = resolveMedia(app, embed, sourcePath);
    if (!plugin || !media?.file) {
      el.setText(plugin ? t("missingMedia", { target: embed.target }) : t("excalidrawUnavailable"));
      if (current === generation) complete();
      return;
    }
    const ea = new plugin.ea.constructor(plugin);
    try {
      const svg = await ea.createSVG(media.file.path + (embed.fragment ?? ""), true);
      if (!active || current !== generation || excalidrawPlugin(app) !== plugin) return;
      const box = svg.viewBox.baseVal;
      const next = win.URL.createObjectURL(new win.Blob([svg.outerHTML], { type: "image/svg+xml" }));
      const image = el.doc.createElement("img");
      image.alt = embed.alt || embed.target;
      image.draggable = false;
      image.width = box.width;
      image.height = box.height;
      image.src = next;
      el.replaceChildren(image);
      if (url) win.URL.revokeObjectURL(url);
      url = next;
      sized({ width: box.width, height: box.height });
      el.dispatchEvent(new win.Event("vml-layout-rendered", { bubbles: true }));
    } catch (error) {
      if (active && current === generation) {
        el.setText(t("excalidrawFailed"));
        console.error("Adjustable Media: Excalidraw preview failed", error);
      }
    } finally {
      ea.destroy();
      if (current === generation) complete();
    }
  };
  const schedule = (): void => {
    win.clearTimeout(timer);
    timer = win.setTimeout(() => { void refresh(); }, 100);
  };
  const modified = app.vault.on("modify", file => {
    if (file === resolveMedia(app, embed, sourcePath)?.file) schedule();
  });
  let dark = el.doc.body.hasClass("theme-dark");
  const theme = new win.MutationObserver(() => {
    const next = el.doc.body.hasClass("theme-dark");
    if (next !== dark) { dark = next; schedule(); }
  });
  theme.observe(el.doc.body, { attributes: true, attributeFilter: ["class"] });
  component.register(() => {
    active = false; generation++;
    win.clearTimeout(timer);
    app.vault.offref(modified);
    theme.disconnect();
    if (url) win.URL.revokeObjectURL(url);
    complete();
  });
  el.addEventListener("dblclick", event => {
    event.preventDefault(); event.stopPropagation();
    void app.workspace.openLinkText(embed.target + (embed.fragment ?? ""), sourcePath, event.ctrlKey || event.metaKey);
  });
  void refresh();
  return initial;
}

/** Replace only Excalidraw embeds in the rendering copy, including explicit text blocks. */
export async function renderExcalidrawMarkdown(app: App, markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void> {
  const lines = markdown.split("\n"), contexts = scanMarkdownLines(lines);
  const embeds: V2Embed[] = [], token = crypto.randomUUID();
  const copy = lines.map((line, index) => {
    if (contexts[index] !== "text") return line;
    const masked = line.replace(/(`+).*?\1/g, code => " ".repeat(code.length));
    const items = readMediaEmbeds(masked, index).filter(embed => embed.kind === "excalidraw");
    for (const embed of items.reverse()) {
      const id = embeds.push(embed) - 1;
      line = line.slice(0, embed.from) + `<span data-vml-excalidraw="${token}-${id}"></span>` + line.slice(embed.to);
    }
    return line;
  }).join("\n");
  let active = true;
  component.register(() => { active = false; });
  await MarkdownRenderer.render(app, copy, el, sourcePath, component);
  if (!active) return;
  await Promise.all(embeds.map(async (embed, index) => {
    const slot = el.querySelector<HTMLElement>(`[data-vml-excalidraw="${token}-${index}"]`);
    if (!slot) return;
    slot.addClass("vml-excalidraw-embed");
    if (embed.nativeWidth) slot.setCssProps({ "--vml-excalidraw-width": `${embed.nativeWidth}px` });
    return renderExcalidraw(app, embed, slot, sourcePath, component);
  }));
}
