import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";

import { t } from "./view/messages.ts";

export interface VmlSettings {
  /** Wrap dropped or pasted media in a layout. Off by default (D1). */
  autoConvert: boolean;
}

export const DEFAULT_SETTINGS: VmlSettings = {
  autoConvert: false,
};

/** Reads only the keys this version knows; v1's settings are not carried over. */
export function readSettings(saved: unknown): VmlSettings {
  const record = typeof saved === "object" && saved !== null ? saved as Record<string, unknown> : {};
  return {
    autoConvert: typeof record.autoConvert === "boolean" ? record.autoConvert : DEFAULT_SETTINGS.autoConvert,
  };
}

interface SettingsHost extends Plugin {
  settings: VmlSettings;
  saveSettings(): Promise<void>;
}

export class VmlSettingTab extends PluginSettingTab {
  private readonly host: SettingsHost;

  constructor(app: App, host: SettingsHost) {
    super(app, host);
    this.host = host;
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName(t("settingAutoConvert"))
      .setDesc(t("settingAutoConvertDesc"))
      .addToggle((toggle) => toggle
        .setValue(this.host.settings.autoConvert)
        .onChange(async (value) => {
          this.host.settings.autoConvert = value;
          await this.host.saveSettings();
        }));
  }
}
