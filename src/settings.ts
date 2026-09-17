import { PluginSettingTab, Setting, type App, type Plugin, type SettingDefinitionItem } from "obsidian";

import type { RefLanguageSetting } from "./view/crossrefView.ts";
import { t } from "./view/messages.ts";

export interface VmlSettings {
  /** Wrap dropped or pasted media in a layout. Off by default, since it changes the note. */
  autoConvert: boolean;
  /** The language of the numbers of figures, tables and equations; auto follows Obsidian's. */
  refLanguage: RefLanguageSetting;
}

export const DEFAULT_SETTINGS: VmlSettings = {
  autoConvert: false,
  refLanguage: "auto",
};

const REF_LANGUAGES: readonly RefLanguageSetting[] = ["auto", "en", "zh"];

/** Reads only the keys this version knows; anything else in the saved data is dropped. */
export function readSettings(saved: unknown): VmlSettings {
  const record = typeof saved === "object" && saved !== null ? saved as Record<string, unknown> : {};
  const refLanguage = REF_LANGUAGES.find((language) => language === record.refLanguage);
  return {
    autoConvert: typeof record.autoConvert === "boolean" ? record.autoConvert : DEFAULT_SETTINGS.autoConvert,
    refLanguage: refLanguage ?? DEFAULT_SETTINGS.refLanguage,
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
      {
        name: t("settingRefLanguage"),
        desc: t("settingRefLanguageDesc"),
        control: { type: "dropdown", key: "refLanguage", defaultValue: DEFAULT_SETTINGS.refLanguage, options: this.refLanguageOptions() },
      },
    ];
  }

  override getControlValue(key: string): unknown {
    if (key === "autoConvert") {
      return this.host.settings.autoConvert;
    }
    return key === "refLanguage" ? this.host.settings.refLanguage : undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "autoConvert" && typeof value === "boolean") {
      this.host.settings.autoConvert = value;
      await this.host.saveSettings();
    }
    const language = REF_LANGUAGES.find((candidate) => candidate === value);
    if (key === "refLanguage" && language) {
      this.host.settings.refLanguage = language;
      await this.host.saveSettings();
    }
  }

  private refLanguageOptions(): Record<RefLanguageSetting, string> {
    return { auto: t("refLanguageAuto"), en: "English", zh: "中文" };
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
    new Setting(this.containerEl)
      .setName(t("settingRefLanguage"))
      .setDesc(t("settingRefLanguageDesc"))
      .addDropdown((dropdown) => dropdown
        .addOptions(this.refLanguageOptions())
        .setValue(this.host.settings.refLanguage)
        .onChange(async (value) => {
          await this.setControlValue("refLanguage", value);
        }));
  }
}
