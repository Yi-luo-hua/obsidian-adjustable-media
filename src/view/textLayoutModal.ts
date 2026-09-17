import { Modal, Setting, type App } from "obsidian";

import { DEFAULT_COLUMN_GAP, MAX_COLUMN_GAP, MAX_TEXT_COLUMNS, MAX_TEXT_SIZE, MIN_TEXT_SIZE, type Align, type TextJustify } from "../format/v2.ts";
import type { TextLayout } from "../layout/model.ts";
import { t } from "./messages.ts";

export interface TextLayoutOptions {
  layout: TextLayout;
  /** Whether the text may flow through columns: a layout of text alone. */
  columns: boolean;
  /** Whether the layout's place across the note means anything: it does not float and is narrower than the note. */
  placeable: boolean;
}

/**
 * The settings of a layout's text: columns and the space between them, how its lines line up, its
 * size, and where the layout sits. Nothing is written until they are saved, all at once.
 */
export class TextLayoutModal extends Modal {
  private readonly options: TextLayoutOptions;
  private readonly onSave: (layout: TextLayout) => void;

  constructor(app: App, options: TextLayoutOptions, onSave: (layout: TextLayout) => void) {
    super(app);
    this.options = options;
    this.onSave = onSave;
  }

  override onOpen(): void {
    const layout: TextLayout = { ...this.options.layout };
    this.titleEl.setText(t("textLayoutTitle"));

    let gapSetting: Setting | null = null;
    if (this.options.columns) {
      new Setting(this.contentEl).setName(t("textColumns")).addDropdown((dropdown) => {
        for (let cols = 1; cols <= MAX_TEXT_COLUMNS; cols += 1) {
          dropdown.addOption(String(cols), String(cols));
        }
        dropdown.setValue(String(layout.cols)).onChange((value) => {
          layout.cols = Number(value);
          gapSetting?.setDisabled(layout.cols === 1);
        });
      });
      gapSetting = new Setting(this.contentEl).setName(t("textColumnGap")).addSlider((slider) => slider
        .setLimits(0, MAX_COLUMN_GAP, 0.25)
        .setValue(layout.gap ?? DEFAULT_COLUMN_GAP)
        .onChange((value) => {
          layout.gap = value;
        }));
      gapSetting.setDisabled(layout.cols === 1);
    }

    new Setting(this.contentEl).setName(t("textJustify")).addDropdown((dropdown) => {
      const choices: Array<[TextJustify, string]> = [
        ["left", t("justifyLeft")],
        ["center", t("justifyCenter")],
        ["right", t("justifyRight")],
        ["justify", t("justifyBoth")],
      ];
      for (const [value, label] of choices) {
        dropdown.addOption(value, label);
      }
      dropdown.setValue(layout.textAlign).onChange((value) => {
        layout.textAlign = value as TextJustify;
      });
    });

    new Setting(this.contentEl).setName(t("textSize")).addSlider((slider) => slider
      .setLimits(MIN_TEXT_SIZE, MAX_TEXT_SIZE, 0.05)
      .setValue(layout.size)
      .onChange((value) => {
        layout.size = value;
      }));

    if (this.options.placeable) {
      new Setting(this.contentEl).setName(t("blockPlace")).addDropdown((dropdown) => {
        const choices: Array<[Align, string]> = [["left", t("alignLeft")], ["center", t("alignCenter")], ["right", t("alignRight")]];
        for (const [value, label] of choices) {
          dropdown.addOption(value, label);
        }
        dropdown.setValue(layout.align).onChange((value) => {
          layout.align = value as Align;
        });
      });
    }

    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { cls: "mod-cta", text: t("save") }).addEventListener("click", () => {
      this.close();
      this.onSave(layout);
    });
    footer.createEl("button", { text: t("cancel") }).addEventListener("click", () => this.close());
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
