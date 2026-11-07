import { DropdownComponent, Modal, type App } from "obsidian";

import { CAPTION_SCALES, type CaptionAlign, type CaptionScale } from "../format/v2.ts";
import { t } from "./messages.ts";

interface CaptionSettings {
  text: string;
  align: CaptionAlign;
  scale: CaptionScale | null;
}

export class CaptionModal extends Modal {
  private readonly initial: CaptionSettings;
  private readonly onSave: (settings: CaptionSettings) => void;

  constructor(app: App, initial: CaptionSettings, onSave: (settings: CaptionSettings) => void) {
    super(app);
    this.initial = initial;
    this.onSave = onSave;
  }

  override onOpen(): void {
    this.titleEl.setText(t("captionTitle"));
    const textarea = this.contentEl.createEl("textarea", {
      cls: "vml-caption-modal__text",
      attr: { placeholder: t("captionPlaceholder"), rows: "4" },
    });
    textarea.value = this.initial.text;

    let align = this.initial.align;
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

    let scale = this.initial.scale;
    const dropdown = new DropdownComponent(alignRow);
    dropdown.selectEl.setAttribute("aria-label", t("captionSize"));
    dropdown.addOption("", t("captionSizeDefault"));
    for (const value of CAPTION_SCALES) {
      dropdown.addOption(String(value), `${value * 100}%`);
    }
    dropdown.setValue(scale === null ? "" : String(scale));
    dropdown.onChange((value) => {
      scale = CAPTION_SCALES.find((choice) => String(choice) === value) ?? null;
    });

    const save = (): void => {
      this.onSave({ text: textarea.value, align, scale });
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
