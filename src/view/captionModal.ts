import { Modal, type App } from "obsidian";

import type { CaptionAlign } from "../format/v2.ts";
import { t } from "./messages.ts";

export class CaptionModal extends Modal {
  private readonly caption: string;
  private readonly align: CaptionAlign;
  private readonly onSave: (caption: string, align: CaptionAlign) => void;

  constructor(app: App, caption: string, align: CaptionAlign, onSave: (caption: string, align: CaptionAlign) => void) {
    super(app);
    this.caption = caption;
    this.align = align;
    this.onSave = onSave;
  }

  override onOpen(): void {
    this.titleEl.setText(t("captionTitle"));
    const textarea = this.contentEl.createEl("textarea", {
      cls: "vml-caption-modal__text",
      attr: { placeholder: t("captionPlaceholder"), rows: "4" },
    });
    textarea.value = this.caption;

    let align = this.align;
    const alignRow = this.contentEl.createDiv({ cls: "vml-caption-modal__align" });
    const choices = ([["left", "captionAlignLeft"], ["center", "captionAlignCenter"]] as const).map(([value, label]) => {
      const button = alignRow.createEl("button", { text: t(label) });
      button.addEventListener("click", () => {
        align = value;
        refresh();
      });
      return { value, button };
    });
    const refresh = (): void => {
      for (const choice of choices) {
        choice.button.toggleClass("is-active", choice.value === align);
      }
    };
    refresh();

    const save = (): void => {
      this.onSave(textarea.value, align);
      this.close();
    };
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        save();
      }
    });

    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { cls: "mod-cta", text: t("save") }).addEventListener("click", save);
    footer.createEl("button", { text: t("cancel") }).addEventListener("click", () => this.close());
    window.setTimeout(() => textarea.focus(), 0);
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
