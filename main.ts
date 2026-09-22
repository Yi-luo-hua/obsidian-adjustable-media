import { Plugin } from "obsidian";

import { registerCommands } from "./src/commands/register.ts";
import { autoConvert } from "./src/input/autoConvert.ts";
import { crossrefExtension, registerCrossrefs, setRefLanguage } from "./src/view/crossrefView.ts";
import { DEFAULT_SETTINGS, VmlSettingTab, readSettings, type VmlSettings } from "./src/settings.ts";
import { registerImageMenu } from "./src/view/imageMenu.ts";
import { livePreviewExtension } from "./src/view/livePreview.ts";
import { plainImageDrag } from "./src/view/plainDrag.ts";
import { registerReadingView } from "./src/view/readingView.ts";
import { GuideModal } from "./src/guide/guideModal.ts";
import { GUIDE_REVISION, shouldShowGuide } from "./src/guide/state.ts";
import { setUiLanguage, t } from "./src/view/messages.ts";

export default class AdjustableMediaPlugin extends Plugin {
  settings: VmlSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.addSettingTab(new VmlSettingTab(this.app, this));
    setRefLanguage(() => this.settings.refLanguage);
    setUiLanguage(() => this.settings.uiLanguage);

    registerReadingView(this);
    registerCrossrefs(this);
    this.registerEditorExtension([
      livePreviewExtension(this.app),
      crossrefExtension(),
      plainImageDrag(this.app),
      autoConvert(this, () => this.settings.autoConvert),
    ]);
    registerImageMenu(this);
    registerCommands(this);
    let guide: GuideModal | null = null;
    let unloaded = false;
    const openGuide = (): void => {
      guide?.close();
      guide = new GuideModal(this.app);
      guide.open();
    };
    // Obsidian freezes command names at registration; switching UI language later does not rename
    // the entry in the command palette. The name intentionally omits the plugin name because
    // Obsidian already prefixes it with "Adjustable Media:" in the palette (AGENTS.md).
    this.addCommand({ id: "show-feature-examples", name: t("guideCommandName"), callback: openGuide });
    this.register(() => { unloaded = true; guide?.close(); });
    this.app.workspace.onLayoutReady(() => {
      if (unloaded || !shouldShowGuide(this.settings.guideRevision)) return;
      openGuide();
      this.settings.guideRevision = GUIDE_REVISION;
      void this.saveSettings().catch((error: unknown) => {
        console.error("Adjustable Media: guide preference could not be saved", error);
      });
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
