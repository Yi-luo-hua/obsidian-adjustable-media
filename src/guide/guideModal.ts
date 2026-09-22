import { Component, MarkdownRenderer, Modal, Notice, moment, type App, type TFile } from "obsidian";

import { printPlan } from "../markdown/print.ts";
import { modelFromBlock } from "../layout/model.ts";
import { writeExampleNote } from "../layout/writeBack.ts";
import { markCaptions, numbered, refContextOf } from "../view/crossrefView.ts";
import { renderLayout } from "../view/layoutView.ts";
import { t } from "../view/messages.ts";
import { GUIDE_TEXT, guideAssets, type GuideLanguage } from "./content.ts";

/** A read-only, offline preview. Writing a runnable copy requires the explicit create button. */
export class GuideModal extends Modal {
  private language: GuideLanguage = moment.locale().toLowerCase().startsWith("zh") ? "zh" : "en";
  private renderer: Component | null = null;
  private urls: string[] = [];
  private generation = 0;
  private creating = false;
  private body!: HTMLElement;

  constructor(app: App) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass("vml-guide");
    this.titleEl.setText(t("guideTitle"));
    this.contentEl.createEl("p", { text: t("guideIntro") });
    const actions = this.contentEl.createDiv({ cls: "vml-guide__actions" });
    const select = actions.createEl("select", { attr: { "aria-label": t("guideLanguage") } });
    select.createEl("option", { text: "中文", value: "zh" });
    select.createEl("option", { text: "English", value: "en" });
    select.value = this.language;
    select.addEventListener("change", () => {
      this.language = select.value === "zh" ? "zh" : "en";
      void this.renderGuide();
    });
    const create = actions.createEl("button", { cls: "mod-cta", text: t("guideCreate"), attr: { title: t("guideCreateDesc") } });
    create.addEventListener("click", () => {
      if (this.creating) return;
      this.creating = true;
      create.disabled = true;
      create.setText(t("guideCreating"));
      void this.createNote().then(() => this.close()).catch((error: unknown) => {
        console.error("Adjustable Media: example creation failed", error);
        new Notice(t("guideFailed"));
      }).finally(() => {
        this.creating = false;
        create.disabled = false;
        create.setText(t("guideCreate"));
      });
    });
    actions.createEl("button", { text: t("close") }).addEventListener("click", () => this.close());
    this.contentEl.createEl("p", { cls: "setting-item-description", text: t("guideCreateDesc") });
    this.body = this.contentEl.createDiv({ cls: "vml-guide__body markdown-rendered" });
    this.body.addEventListener("click", (event) => {
      const ref = event.target instanceof Element ? event.target.closest<HTMLElement>(".vml-ref") : null;
      const id = ref?.dataset.vmlRef;
      if (id) {
        event.preventDefault();
        this.body.querySelector<HTMLElement>(`[data-vml-label="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center" });
      }
    });
    void this.renderGuide();
  }

  private releaseRender(): void {
    this.renderer?.unload();
    this.renderer = null;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
  }

  private async renderGuide(): Promise<void> {
    const generation = ++this.generation;
    this.releaseRender();
    const renderer = new Component();
    this.renderer = renderer;
    renderer.load();
    const content = this.body.createDiv();
    this.body.replaceChildren(content);
    const mediaSources = new Map(guideAssets().map((asset) => {
      const url = URL.createObjectURL(new Blob([asset.data], { type: asset.type }));
      this.urls.push(url);
      return [`./assets/${asset.name}`, url];
    }));
    try {
      const text = GUIDE_TEXT[this.language];
      const refs = { ...refContextOf(text), language: this.language };
      const token = crypto.randomUUID();
      const { markdown, blocks } = printPlan(text, token);
      await MarkdownRenderer.render(this.app, numbered(markdown, refs), content, "", renderer);
      if (generation !== this.generation) return;
      markCaptions(content, markdown);
      const tasks: Promise<void>[] = [];
      blocks.forEach((block, index) => {
        const slot = content.querySelector<HTMLElement>(`[data-vml-print="${token}-${index}"]`);
        if (slot) renderLayout(slot, { app: this.app, sourcePath: "", model: modelFromBlock(block), editable: false,
          warning: null, component: renderer, refs, renderTasks: tasks, mediaSources });
      });
      await Promise.all(tasks);
    } catch (error) {
      if (generation === this.generation) {
        content.setText(t("guideLoadFailed"));
        console.error("Adjustable Media: guide rendering failed", error);
      }
    }
  }

  private async createNote(): Promise<TFile> {
    const text = GUIDE_TEXT[this.language];
    const name = this.language === "zh" ? "功能示例" : "Feature examples";
    const file = await writeExampleNote(this.app, name, text, guideAssets());
    await this.app.workspace.getLeaf("tab").openFile(file, { state: { mode: "source", source: false } });
    return file;
  }

  override onClose(): void {
    this.generation++;
    this.releaseRender();
    this.contentEl.empty();
  }
}
