import { PluginSettingTab, Setting, type App, type Plugin, type SettingDefinitionItem } from "obsidian";

import { GuideModal } from "./guide/guideModal.ts";
import { readGuideRevision } from "./guide/state.ts";
import type { RefLanguageSetting } from "./view/crossrefView.ts";
import { t, type UiLanguageSetting } from "./view/messages.ts";

export interface VmlSettings {
  /** Wrap dropped or pasted media in a layout. Off by default, since it changes the note. */
  autoConvert: boolean;
  /** The language of the numbers of figures, tables and equations; auto follows Obsidian's. */
  refLanguage: RefLanguageSetting;
  /** The display language of plugin menus and UI; auto follows Obsidian's. */
  uiLanguage: UiLanguageSetting;
  guideRevision: number;
}

export const DEFAULT_SETTINGS: VmlSettings = {
  autoConvert: false,
  refLanguage: "auto",
  uiLanguage: "auto",
  guideRevision: 0,
};

const REF_LANGUAGES: readonly RefLanguageSetting[] = ["auto", "en", "zh"];
const UI_LANGUAGES: readonly UiLanguageSetting[] = ["auto", "en", "zh"];

/** Reads only the keys this version knows; anything else in the saved data is dropped. */
export function readSettings(saved: unknown): VmlSettings {
  const record = typeof saved === "object" && saved !== null ? saved as Record<string, unknown> : {};
  const refLanguage = REF_LANGUAGES.find((language) => language === record.refLanguage);
  const uiLanguage = UI_LANGUAGES.find((language) => language === record.uiLanguage);
  return {
    autoConvert: typeof record.autoConvert === "boolean" ? record.autoConvert : DEFAULT_SETTINGS.autoConvert,
    refLanguage: refLanguage ?? DEFAULT_SETTINGS.refLanguage,
    uiLanguage: uiLanguage ?? DEFAULT_SETTINGS.uiLanguage,
    guideRevision: readGuideRevision(record.guideRevision),
  };
}

interface SettingsHost extends Plugin {
  settings: VmlSettings;
  saveSettings(): Promise<void>;
}

export class VmlSettingTab extends PluginSettingTab {
  private readonly host: SettingsHost;
  private guide: GuideModal | null = null;

  constructor(app: App, host: SettingsHost) {
    super(app, host);
    this.host = host;
  }

  /** Opens the feature overview modal, closing any previous instance to avoid stacking. */
  private openGuide(): void {
    this.guide?.close();
    this.guide = new GuideModal(this.app);
    this.guide.open();
  }

  /**
   * Obsidian 1.13 and later render the tab from these definitions, which also makes the settings
   * findable in the settings search. Older versions ignore this and call display() below.
   */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: t("settingUiLanguage"),
        desc: t("settingUiLanguageDesc"),
        control: { type: "dropdown", key: "uiLanguage", defaultValue: DEFAULT_SETTINGS.uiLanguage, options: this.uiLanguageOptions() },
      },
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
      {
        name: t("settingOpenGuide"),
        desc: t("settingOpenGuideDesc"),
        render: (setting) => {
          setting.addButton((button) => button
            .setButtonText(t("settingOpenGuideBtn"))
            .onClick(() => this.openGuide()));
        },
      },
    ];
  }

  override getControlValue(key: string): unknown {
    if (key === "uiLanguage") {
      return this.host.settings.uiLanguage;
    }
    if (key === "autoConvert") {
      return this.host.settings.autoConvert;
    }
    return key === "refLanguage" ? this.host.settings.refLanguage : undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "uiLanguage") {
      const language = UI_LANGUAGES.find((candidate) => candidate === value);
      if (language) {
        this.host.settings.uiLanguage = language;
        await this.host.saveSettings();
        const tab = this as unknown as Record<string, (() => void) | undefined>;
        tab.update?.();
        tab.display?.();
      }
      return;
    }
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

  private uiLanguageOptions(): Record<UiLanguageSetting, string> {
    return { auto: t("uiLanguageAuto"), zh: "简体中文", en: "English" };
  }

  private refLanguageOptions(): Record<RefLanguageSetting, string> {
    return { auto: t("refLanguageAuto"), zh: "中文 (图 1)", en: "English (Figure 1)" };
  }

  /** Render the settings tab. */
  display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName(t("settingUiLanguage"))
      .setDesc(t("settingUiLanguageDesc"))
      .addDropdown((dropdown) => dropdown
        .addOptions(this.uiLanguageOptions())
        .setValue(this.host.settings.uiLanguage)
        .onChange(async (value) => {
          await this.setControlValue("uiLanguage", value);
        }));

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

    new Setting(this.containerEl)
      .setName(t("settingOpenGuide"))
      .setDesc(t("settingOpenGuideDesc"))
      .addButton((button) => button
        .setButtonText(t("settingOpenGuideBtn"))
        .onClick(() => this.openGuide()));
  }
}
