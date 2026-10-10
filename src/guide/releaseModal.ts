import { Component, MarkdownRenderer, Modal, type App } from "obsidian";
import { currentLanguage, t } from "../view/messages.ts";
import { RELEASE_NOTES_VERSION } from "./releaseState.ts";
import { RELEASE_NOTES_TEXT } from "./releaseContent.ts";
import { attachManualColumnExamples } from "./manualColumnExamples.ts";

/** Update summary bundled with the plugin, available without a network connection. */
export class ReleaseNotesModal extends Modal {
  private rendering: Component | null = null;
  constructor(app: App) { super(app); }

  override onOpen(): void {
    this.modalEl.addClass("vml-update-modal");
    const { contentEl } = this;
    contentEl.createEl("h2", { text: t("releaseNotesTitle", { version: RELEASE_NOTES_VERSION }) });
    const body = contentEl.createDiv({ cls: "vml-update__body" });
    this.rendering = new Component();
    this.rendering.load();
    void MarkdownRenderer.render(this.app, RELEASE_NOTES_TEXT[currentLanguage()], body, "", this.rendering)
      .then(() => attachManualColumnExamples(body, this.app, () => this.close()));
    contentEl.createEl("p", { cls: "vml-guide__subtitle", text: t("releaseNotesAgain") });
    const footer = contentEl.createDiv({ cls: "vml-guide__footer" });
    footer.createEl("button", { cls: "mod-cta", text: t("releaseNotesClose") })
      .addEventListener("click", () => this.close());
  }

  override onClose(): void {
    this.rendering?.unload();
    this.rendering = null;
    this.contentEl.empty();
  }
}
