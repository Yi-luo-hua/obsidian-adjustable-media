import assert from "node:assert/strict";
import { test } from "node:test";
import { mockedModule } from "./support/mockedModule.ts";
import { readGuideRevision } from "../src/guide/state.ts";

test("persistent layout highlighting defaults off and both saved choices survive", async () => {
  const settings = await mockedModule<{
    readSettings(saved: unknown): { keepLayoutHighlight: boolean; showReadingLayoutHighlight: boolean; lastSeenReleaseNotes: string };
    VmlSettingTab: new (app: unknown, host: unknown) => {
      setControlValue(key: string, value: unknown): Promise<void>;
      getControlValue(key: string): unknown;
    };
  }>(new URL("../src/settings.ts", import.meta.url), {
    obsidian: { PluginSettingTab: class {}, Setting: class {} },
    "./guide/guideModal.ts": {}, "./guide/state.ts": { readGuideRevision }, "./view/messages.ts": {},
  });
  for (const saved of [undefined, {}, { autoConvert: true }, { keepLayoutHighlight: "false" }]) {
    assert.equal(settings.readSettings(saved).keepLayoutHighlight, false);
    assert.equal(settings.readSettings(saved).showReadingLayoutHighlight, false);
    assert.equal(settings.readSettings(saved).lastSeenReleaseNotes, "");
  }
  assert.equal(settings.readSettings({ lastSeenReleaseNotes: "0.7.2" }).lastSeenReleaseNotes, "0.7.2");
  assert.equal(settings.readSettings({ lastSeenReleaseNotes: false }).lastSeenReleaseNotes, "");
  const host = { settings: settings.readSettings({}), saved: "", async saveSettings() { this.saved = JSON.stringify(this.settings); } };
  const tab = new settings.VmlSettingTab({}, host);
  for (const value of [false, true]) {
    await tab.setControlValue("keepLayoutHighlight", value);
    assert.equal(tab.getControlValue("keepLayoutHighlight"), value);
    assert.equal(settings.readSettings(JSON.parse(host.saved)).keepLayoutHighlight, value);
  }
  for (const value of [true, false]) {
    await tab.setControlValue("showReadingLayoutHighlight", value);
    assert.equal(tab.getControlValue("showReadingLayoutHighlight"), value);
    const saved = settings.readSettings(JSON.parse(host.saved));
    assert.equal(saved.showReadingLayoutHighlight, value);
    assert.equal(saved.keepLayoutHighlight, true);
  }
});
