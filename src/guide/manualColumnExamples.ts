import { Notice, type App } from "obsidian";
import chinese from "../../docs/examples/ManualColumns.zh-CN.md";
import english from "../../docs/examples/ManualColumns.en.md";
import { writeExampleNote } from "../layout/writeBack.ts";
import { currentLanguage, t } from "../view/messages.ts";

export const MANUAL_COLUMNS_SAMPLE_URLS = {
  zh: "https://raw.githubusercontent.com/Yi-luo-hua/obsidian-adjustable-media/0.7.3/docs/examples/ManualColumns.zh-CN.md",
  en: "https://raw.githubusercontent.com/Yi-luo-hua/obsidian-adjustable-media/0.7.3/docs/examples/ManualColumns.en.md",
};
const MANUAL_COLUMNS_TEXT = { zh: chinese, en: english };

/** Use the onboarding action to create a fresh sample note, available offline. */
export function attachManualColumnExamples(body: HTMLElement, app: App, created: () => void): void {
  const language = currentLanguage();
  const message = (key: Parameters<typeof t>[0]): string => t(key, {}, language);
  for (const link of Array.from(body.querySelectorAll<HTMLAnchorElement>("a"))) {
    if (link.getAttribute("href") !== MANUAL_COLUMNS_SAMPLE_URLS[language]) continue;
    const button = body.createEl("button", { cls: "mod-cta vml-guide__create-btn vml-update__sample-create", text: message("manualColumnExampleCreate") });
    button.addEventListener("click", () => {
      if (button.disabled) return;
      button.disabled = true;
      button.setText(message("guideCreating"));
      void writeExampleNote(app, message("manualColumnExampleName"), MANUAL_COLUMNS_TEXT[language], [], message("exampleFolderName"))
        .then(async (file) => {
          await app.workspace.getLeaf("tab").openFile(file, { state: { mode: "source", source: false } });
          new Notice(message("manualColumnExampleCreated"));
          created();
        })
        .catch((error: unknown) => {
          console.error("Adjustable Media: manual column example creation failed", error);
          new Notice(message("manualColumnExampleFailed"));
        })
        .finally(() => {
          button.disabled = false;
          button.setText(message("manualColumnExampleCreate"));
        });
    });
    link.replaceWith(button);
  }
}
