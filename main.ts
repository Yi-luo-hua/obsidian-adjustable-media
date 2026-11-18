import { normalizePath, Plugin } from "obsidian";

import { registerCommands } from "./src/commands/register.ts";
import { autoConvert } from "./src/input/autoConvert.ts";
import { crossrefExtension, registerCrossrefs, setRefLanguage } from "./src/view/crossrefView.ts";
import { DEFAULT_SETTINGS, VmlSettingTab, readSettings, type VmlSettings } from "./src/settings.ts";
import { registerImageMenu } from "./src/view/imageMenu.ts";
import { registerTableMenu } from "./src/view/tableMenu.ts";
import { registerLayoutTouch } from "./src/view/layoutTouch.ts";
import { registerCornerInputGuard } from "./src/view/cornerInput.ts";
import { calloutImageExtension, registerCalloutImages } from "./src/view/calloutImages.ts";
import { livePreviewExtension, refreshLayoutHighlights } from "./src/view/livePreview.ts";
import { plainMediaDrag } from "./src/view/plainDrag.ts";
import { plainWebEmbeds } from "./src/view/plainWebEmbeds.ts";
import { registerReadingView } from "./src/view/readingView.ts";
import { registerModeScroll } from "./src/view/modeScroll.ts";
import { GuideModal } from "./src/guide/guideModal.ts";
import { GUIDE_REVISION, shouldShowGuide } from "./src/guide/state.ts";
import { ReleaseNotesModal } from "./src/guide/releaseModal.ts";
import { shouldShowReleaseNotes } from "./src/guide/releaseState.ts";
import { setUiLanguage, t } from "./src/view/messages.ts";
import bundledStyles from "./styles.css";

export default class AdjustableMediaPlugin extends Plugin {
  settings: VmlSettings = { ...DEFAULT_SETTINGS };
  private refreshReadingHighlights = (): void => {};

  override async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    await this.restoreStyles().catch((error: unknown) => {
      console.error("Adjustable Media: could not restore styles.css", error);
    });
    this.updateLayoutBorderColor(this.settings.layoutBorderColor);
    this.registerEvent(this.app.workspace.on("window-open", (_workspace, win) => {
      win.document.body.setCssProps({ "--vml-custom-border-color": this.settings.layoutBorderColor ?? "" });
    }));
    this.register(() => this.updateLayoutBorderColor(null));
    this.addSettingTab(new VmlSettingTab(this.app, this));
    setRefLanguage(() => this.settings.refLanguage);
    setUiLanguage(() => this.settings.uiLanguage);

    this.refreshReadingHighlights = registerReadingView(this, () => this.settings.showReadingLayoutHighlight);
    registerModeScroll(this);
    registerCrossrefs(this);
    registerCalloutImages(this);
    this.registerEditorExtension([
      livePreviewExtension(this.app, () => this.settings.keepLayoutHighlight),
      crossrefExtension(),
      plainMediaDrag(this.app),
      plainWebEmbeds(this.app),
      calloutImageExtension(this.app),
      autoConvert(this, () => this.settings.autoConvert),
    ]);
    registerImageMenu(this);
    registerTableMenu(this);
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
    this.updateLayoutBorderColor(this.settings.layoutBorderColor);
    refreshLayoutHighlights();
    this.refreshReadingHighlights();
    await this.saveData(this.settings);
  }

  private async restoreStyles(): Promise<void> {
    const { dir } = this.manifest;
    if (!dir) return;
    const { adapter } = this.app.vault;
    const path = normalizePath(`${dir}/styles.css`);
    const stylesheet = await adapter.stat(path);
    // Obsidian loads styles.css after onload. Restore the bundled file after an incomplete update.
    if (!stylesheet?.size) await adapter.write(path, bundledStyles);
  }

  private updateLayoutBorderColor(color: string | null): void {
    const bodies = new Set([this.app.workspace.containerEl.ownerDocument.body]);
    this.app.workspace.iterateAllLeaves((leaf) => bodies.add(leaf.view.containerEl.ownerDocument.body));
    for (const body of bodies) body.setCssProps({ "--vml-custom-border-color": color ?? "" });
  }
}
