import { Plugin } from "obsidian";

import { registerCommands } from "./src/commands/register";
import { autoConvert } from "./src/input/autoConvert";
import { DEFAULT_SETTINGS, VmlSettingTab, readSettings, type VmlSettings } from "./src/settings";
import { livePreviewExtension } from "./src/view/livePreview";
import { registerReadingView } from "./src/view/readingView";

export default class AdjustableMediaPlugin extends Plugin {
  settings: VmlSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.addSettingTab(new VmlSettingTab(this.app, this));

    registerReadingView(this);
    this.registerEditorExtension([
      livePreviewExtension(this.app),
      autoConvert(this, () => this.settings.autoConvert),
    ]);
    registerCommands(this);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
