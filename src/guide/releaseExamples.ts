import { Notice, type App } from "obsidian";
import chinese from "../../docs/examples/ManualColumns.zh-CN.md";
import english from "../../docs/examples/ManualColumns.en.md";
import mermaidChinese from "../../docs/examples/Mermaid.zh-CN.md";
import mermaidEnglish from "../../docs/examples/Mermaid.en.md";
import { writeExampleNote } from "../layout/writeBack.ts";
import { currentLanguage, t } from "../view/messages.ts";

export const MANUAL_COLUMNS_SAMPLE_URLS = {
  zh: "https://raw.githubusercontent.com/Yi-luo-hua/obsidian-adjustable-media/0.7.3/docs/examples/ManualColumns.zh-CN.md",
  en: "https://raw.githubusercontent.com/Yi-luo-hua/obsidian-adjustable-media/0.7.3/docs/examples/ManualColumns.en.md",
};
export const MERMAID_SAMPLE_URLS = {
  zh: "https://raw.githubusercontent.com/Yi-luo-hua/obsidian-adjustable-media/0.8.0/docs/examples/Mermaid.zh-CN.md",
  en: "https://raw.githubusercontent.com/Yi-luo-hua/obsidian-adjustable-media/0.8.0/docs/examples/Mermaid.en.md",
};
const SAMPLES = [
  { urls: MANUAL_COLUMNS_SAMPLE_URLS, text: { zh: chinese, en: english }, create: "manualColumnExampleCreate", name: "manualColumnExampleName", created: "manualColumnExampleCreated", failed: "manualColumnExampleFailed" },
  { urls: MERMAID_SAMPLE_URLS, text: { zh: mermaidChinese, en: mermaidEnglish }, create: "mermaidExampleCreate", name: "mermaidExampleName", created: "mermaidExampleCreated", failed: "mermaidExampleFailed" },
] as const;

/** Use the onboarding action to create a fresh sample note, available offline. */
export function attachReleaseExamples(body: HTMLElement, app: App, created: () => void): void {
  const language = currentLanguage();
  const message = (key: Parameters<typeof t>[0]): string => t(key, {}, language);
  for (const link of Array.from(body.querySelectorAll<HTMLAnchorElement>("a"))) {
    const sample = SAMPLES.find(sample => link.getAttribute("href") === sample.urls[language]);
    if (!sample) continue;
    const button = body.createEl("button", { cls: "mod-cta vml-guide__create-btn vml-update__sample-create", text: message(sample.create) });
    button.addEventListener("click", () => {
      if (button.disabled) return;
      button.disabled = true;
      button.setText(message("guideCreating"));
      void writeExampleNote(app, message(sample.name), sample.text[language], [], message("exampleFolderName"))
        .then(async (file) => {
          await app.workspace.getLeaf("tab").openFile(file, { state: { mode: "source", source: false } });
          new Notice(message(sample.created));
          created();
        })
        .catch((error: unknown) => {
          console.error("Adjustable Media: release example creation failed", error);
          new Notice(message(sample.failed));
        })
        .finally(() => {
          button.disabled = false;
          button.setText(message(sample.create));
        });
    });
    link.replaceWith(button);
  }
}
