import { PluginSettingTab, Setting, type App, type Plugin, type SettingDefinitionItem } from "obsidian";

import { t } from "./view/messages.ts";

export interface VmlSettings {
  /** Wrap dropped or pasted media in a layout. Off by default, since it changes the note. */
  autoConvert: boolean;
}

export const DEFAULT_SETTINGS: VmlSettings = {
  autoConvert: false,
};

/** Reads only the keys this version knows; anything else in the saved data is dropped. */
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

  /**
   * Obsidian 1.13 and later render the tab from these definitions, which also makes the settings
   * findable in the settings search. Older versions ignore this and call display() below.
   */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: t("settingAutoConvert"),
        desc: t("settingAutoConvertDesc"),
        control: { type: "toggle", key: "autoConvert", defaultValue: DEFAULT_SETTINGS.autoConvert },
      },
    ];
  }

  override getControlValue(key: string): unknown {
    return key === "autoConvert" ? this.host.settings.autoConvert : undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "autoConvert" && typeof value === "boolean") {
      this.host.settings.autoConvert = value;
      await this.host.saveSettings();
    }
  }

  /** The same settings for Obsidian before 1.13. */
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
