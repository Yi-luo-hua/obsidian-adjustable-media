import type { V2Embed } from "../format/v2.ts";
import { parseWebFrame } from "../format/webEmbed.ts";
import { isolateMediaControls } from "./mediaControls.ts";
import { t } from "./messages.ts";

/** Raw HTML is never installed. Keep native frame permissions, with layout-owned dimensions. */
export function renderWebFrame(container: HTMLElement, embed: V2Embed): void {
  const parsed = parseWebFrame(embed.raw);
  if (!parsed) return;
  const frame = container.createEl("iframe", { attr: { title: embed.alt || t("webEmbed"),
    sandbox: "allow-forms allow-presentation allow-same-origin allow-scripts allow-modals", ...parsed.attributes } });
  isolateMediaControls(frame);
}

export function renderWebLink(container: HTMLElement, embed: V2Embed): void {
  container.createEl("a", { cls: "vml-web-link", text: embed.alt || embed.target,
    attr: { href: embed.target, target: "_blank", rel: "noopener noreferrer" } });
}
