import { Plugin } from "obsidian";

import { registerCommands } from "./src/commands/register.ts";
import { autoConvert } from "./src/input/autoConvert.ts";
import { crossrefExtension, registerCrossrefs, setRefLanguage } from "./src/view/crossrefView.ts";
import { DEFAULT_SETTINGS, VmlSettingTab, readSettings, type VmlSettings } from "./src/settings.ts";
import { registerImageMenu } from "./src/view/imageMenu.ts";
import { registerLayoutTouch } from "./src/view/layoutTouch.ts";
import { registerCornerInputGuard } from "./src/view/cornerInput.ts";
import { livePreviewExtension, refreshLayoutHighlights } from "./src/view/livePreview.ts";
import { plainImageDrag } from "./src/view/plainDrag.ts";
import { registerReadingView } from "./src/view/readingView.ts";
import { GuideModal } from "./src/guide/guideModal.ts";
import { GUIDE_REVISION, shouldShowGuide } from "./src/guide/state.ts";
import { ReleaseNotesModal } from "./src/guide/releaseModal.ts";
import { shouldShowReleaseNotes } from "./src/guide/releaseState.ts";
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
      livePreviewExtension(this.app, () => this.settings.keepLayoutHighlight),
      crossrefExtension(),
      plainImageDrag(this.app),
      autoConvert(this, () => this.settings.autoConvert),
    ]);
    registerImageMenu(this);
    registerLayoutTouch(this);
    registerCornerInputGuard(this);
    registerCommands(this);
    let guide: GuideModal | null = null;
    let releaseNotes: ReleaseNotesModal | null = null;
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
    const openReleaseNotes = (): void => {
      releaseNotes?.close();
      releaseNotes = new ReleaseNotesModal(this.app);
      releaseNotes.open();
    };
    this.addCommand({ id: "show-release-notes", name: t("releaseNotesCommand"), callback: openReleaseNotes });
    this.register(() => { unloaded = true; guide?.close(); releaseNotes?.close(); });
    this.app.workspace.onLayoutReady(() => {
      if (unloaded) return;
      if (shouldShowGuide(this.settings.guideRevision)) {
        openGuide();
        this.settings.guideRevision = GUIDE_REVISION;
        // A first-use guide already introduces the plugin; do not stack two automatic modals.
        this.settings.lastSeenReleaseNotes = this.manifest.version;
      } else if (shouldShowReleaseNotes(this.settings.lastSeenReleaseNotes, this.manifest.version)) {
        openReleaseNotes();
        this.settings.lastSeenReleaseNotes = this.manifest.version;
      } else return;
      void this.saveSettings().catch((error: unknown) => {
        console.error("Adjustable Media: introduction preference could not be saved", error);
      });
    });
  }

  async saveSettings(): Promise<void> {
    refreshLayoutHighlights();
    await this.saveData(this.settings);
  }
}
