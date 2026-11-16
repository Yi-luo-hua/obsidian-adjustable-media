import { Component, MarkdownRenderer, Modal, type App } from "obsidian";
import { currentLanguage, t } from "../view/messages.ts";
import { RELEASE_NOTES_VERSION } from "./releaseState.ts";
import { RELEASE_NOTES_TEXT } from "./releaseContent.ts";
import { attachReleaseExamples } from "./releaseExamples.ts";

/** Update summary bundled with the plugin, available without a network connection. */
export class ReleaseNotesModal extends Modal {
  private rendering: Component | null = null;
  constructor(app: App) { super(app); }

  override onOpen(): void {
    this.modalEl.addClass("vml-update-modal");
    const { contentEl } = this;
    contentEl.createEl("h2", { text: t("releaseNotesTitle", { version: RELEASE_NOTES_VERSION }) });
    const body = contentEl.createDiv({ cls: "vml-update__body" });
    const actions = contentEl.createDiv({ cls: "vml-update__actions" });
    const close = actions.createEl("button", { text: t("releaseNotesClose") });
    close.addEventListener("click", () => this.close());
    contentEl.createEl("p", { cls: "vml-update__hint", text: t("releaseNotesAgain") });
    this.rendering = new Component();
    this.rendering.load();
    void MarkdownRenderer.render(this.app, RELEASE_NOTES_TEXT[currentLanguage()], body, "", this.rendering)
      .then(() => {
        attachReleaseExamples(body, this.app, () => this.close());
        const sponsor = body.querySelector('a[href="https://yi-luo-hua.github.io/sponsor-me/"]');
        if (!sponsor) return;
        const paragraph = sponsor.closest("p");
        sponsor.addClass("vml-update__sponsor");
        close.before(sponsor);
        if (paragraph && !paragraph.textContent?.trim()) paragraph.remove();
      });
  }

  override onClose(): void {
    this.rendering?.unload();
    this.rendering = null;
    this.contentEl.empty();
  }
}
