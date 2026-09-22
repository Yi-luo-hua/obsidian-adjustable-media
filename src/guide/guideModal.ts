import { Modal, Notice, type App, type TFile } from "obsidian";

import { writeExampleNote } from "../layout/writeBack.ts";
import { currentLanguage, t } from "../view/messages.ts";
import { GUIDE_TEXT, guideAssets, type GuideLanguage } from "./content.ts";

/**
 * Feature overview modal shown on initial install or opened via command.
 * Strictly explains features and quick-start instructions without embedding interactive examples.
 */
export class GuideModal extends Modal {
  private language: GuideLanguage = currentLanguage();
  private creating = false;

  constructor(app: App) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("vml-guide-modal");
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    // 1. Header: Title, Subtitle & Language Selector
    const header = contentEl.createDiv({ cls: "vml-guide__header" });
    const headerLeft = header.createDiv({ cls: "vml-guide__header-text" });
    headerLeft.createEl("h2", { text: t("guideTitle", {}, this.language), cls: "vml-guide__title" });
    headerLeft.createEl("p", { text: t("guideSubtitle", {}, this.language), cls: "vml-guide__subtitle" });

    const langSelect = header.createEl("select", {
      cls: "dropdown vml-guide__lang-select",
      attr: { "aria-label": t("guideLanguage", {}, this.language) },
    });
    langSelect.createEl("option", { text: "简体中文", value: "zh" });
    langSelect.createEl("option", { text: "English", value: "en" });
    langSelect.value = this.language;
    langSelect.addEventListener("change", () => {
      this.language = langSelect.value === "zh" ? "zh" : "en";
      this.render();
    });

    // 2. Features Grid: 5 Core Capabilities
    contentEl.createEl("h3", { text: t("guideFeaturesTitle", {}, this.language), cls: "vml-guide__section-title" });
    const grid = contentEl.createDiv({ cls: "vml-guide__grid" });

    const features = [
      {
        icon: "🖼️",
        title: t("guideFeatureSideBySideTitle", {}, this.language),
        desc: t("guideFeatureSideBySideDesc", {}, this.language),
      },
      {
        icon: "📝",
        title: t("guideFeatureTextBesideTitle", {}, this.language),
        desc: t("guideFeatureTextBesideDesc", {}, this.language),
      },
      {
        icon: "🔄",
        title: t("guideFeatureWrapTitle", {}, this.language),
        desc: t("guideFeatureWrapDesc", {}, this.language),
      },
      {
        icon: "📰",
        title: t("guideFeatureColumnsTitle", {}, this.language),
        desc: t("guideFeatureColumnsDesc", {}, this.language),
      },
      {
        icon: "🏷️",
        title: t("guideFeatureCrossrefTitle", {}, this.language),
        desc: t("guideFeatureCrossrefDesc", {}, this.language),
      },
    ];

    for (const f of features) {
      const card = grid.createDiv({ cls: "vml-guide__card" });
      const top = card.createDiv({ cls: "vml-guide__card-header" });
      top.createSpan({ cls: "vml-guide__card-icon", text: f.icon });
      top.createEl("h4", { cls: "vml-guide__card-title", text: f.title });
      card.createEl("p", { cls: "vml-guide__card-desc", text: f.desc });
    }

    // 3. Quick Start Section
    contentEl.createEl("h3", { text: t("guideQuickStartTitle", {}, this.language), cls: "vml-guide__section-title" });
    const stepsContainer = contentEl.createDiv({ cls: "vml-guide__steps" });

    const steps = [
      {
        step: "1",
        title: t("guideQuickStep1Title", {}, this.language),
        desc: t("guideQuickStep1Desc", {}, this.language),
      },
      {
        step: "2",
        title: t("guideQuickStep2Title", {}, this.language),
        desc: t("guideQuickStep2Desc", {}, this.language),
      },
      {
        step: "3",
        title: t("guideQuickStep3Title", {}, this.language),
        desc: t("guideQuickStep3Desc", {}, this.language),
      },
    ];

    for (const s of steps) {
      const stepItem = stepsContainer.createDiv({ cls: "vml-guide__step-item" });
      stepItem.createSpan({ cls: "vml-guide__step-badge", text: s.step });
      const textWrap = stepItem.createDiv({ cls: "vml-guide__step-content" });
      textWrap.createEl("strong", { cls: "vml-guide__step-title", text: s.title });
      textWrap.createSpan({ cls: "vml-guide__step-desc", text: `: ${s.desc}` });
    }

    // 4. Footer & Action Buttons
    const footer = contentEl.createDiv({ cls: "vml-guide__footer" });

    const createWrap = footer.createDiv({ cls: "vml-guide__create-box" });
    const createBtn = createWrap.createEl("button", {
      cls: "mod-cta vml-guide__create-btn",
      text: t("guideCreate", {}, this.language),
    });
    createWrap.createSpan({
      cls: "vml-guide__create-desc",
      text: t("guideCreateDesc", {}, this.language),
    });

    createBtn.addEventListener("click", () => {
      if (this.creating) return;
      this.creating = true;
      createBtn.disabled = true;
      createBtn.setText(t("guideCreating", {}, this.language));
      void this.createNote()
        .then(() => {
          new Notice(t("guideCreated", {}, this.language));
          this.close();
        })
        .catch((error: unknown) => {
          console.error("Adjustable Media: example note creation failed", error);
          new Notice(t("guideFailed", {}, this.language));
        })
        .finally(() => {
          this.creating = false;
          createBtn.disabled = false;
          createBtn.setText(t("guideCreate", {}, this.language));
        });
    });

    const closeBtn = footer.createEl("button", {
      cls: "vml-guide__start-btn",
      text: t("guideStart", {}, this.language),
    });
    closeBtn.addEventListener("click", () => this.close());
  }

  private async createNote(): Promise<TFile> {
    const text = GUIDE_TEXT[this.language];
    const name = this.language === "zh" ? "Adjustable Media 排版示例" : "Adjustable Media Examples";
    const folder = t("exampleFolderName", {}, this.language);
    const file = await writeExampleNote(this.app, name, text, guideAssets(), folder);
    await this.app.workspace.getLeaf("tab").openFile(file, { state: { mode: "source", source: false } });
    return file;
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
