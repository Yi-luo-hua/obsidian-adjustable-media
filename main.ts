import { Plugin } from "obsidian";

import { registerCommands } from "./src/commands/register";
import { autoConvert } from "./src/input/autoConvert";
import { crossrefExtension, registerCrossrefs, setRefLanguage } from "./src/view/crossrefView";
import { DEFAULT_SETTINGS, VmlSettingTab, readSettings, type VmlSettings } from "./src/settings";
import { registerImageMenu } from "./src/view/imageMenu";
import { livePreviewExtension } from "./src/view/livePreview";
import { plainImageDrag } from "./src/view/plainDrag";
import { registerReadingView } from "./src/view/readingView";
import { GuideModal } from "./src/guide/guideModal";
import { GUIDE_REVISION, shouldShowGuide } from "./src/guide/state";
import { t } from "./src/view/messages";

export default class AdjustableMediaPlugin extends Plugin {
  settings: VmlSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.addSettingTab(new VmlSettingTab(this.app, this));
    setRefLanguage(() => this.settings.refLanguage);

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
    this.addCommand({ id: "show-feature-examples", name: t("guideTitle"), callback: openGuide });
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
