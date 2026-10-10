import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldShowReleaseNotes } from "../src/guide/releaseState.ts";
import { GUIDE_REVISION, shouldShowGuide } from "../src/guide/state.ts";
import { mockedModule } from "./support/mockedModule.ts";

test("update notes appear once for their bundled version", () => {
  assert.equal(shouldShowReleaseNotes("", "0.7.3"), true);
  assert.equal(shouldShowReleaseNotes("0.7.1", "0.7.3"), true);
  assert.equal(shouldShowReleaseNotes("0.7.3", "0.7.3"), false);
  assert.equal(shouldShowReleaseNotes("0.7.3", "0.7.4"), false);
});

for (const scenario of [
  { name: "existing users see update notes and persist the version", seen: "", guide: GUIDE_REVISION, updates: 1, guides: 0, unload: false },
  { name: "reloading the same release does not show update notes again", seen: "0.7.3", guide: GUIDE_REVISION, updates: 0, guides: 0, unload: false },
  { name: "first-use guide does not stack an update modal", seen: "", guide: 0, updates: 0, guides: 1, unload: false },
  { name: "unloading before layout readiness prevents automatic modals", seen: "", guide: GUIDE_REVISION, updates: 0, guides: 0, unload: true },
]) {
  test(scenario.name, async () => {
    let ready = (): void => {};
    let updates = 0, guides = 0;
    const settings = { guideRevision: scenario.guide, lastSeenReleaseNotes: scenario.seen };
    class Plugin {
      app = { workspace: { onLayoutReady(callback: () => void) { ready = callback; } } };
      manifest = { version: "0.7.3" };
      persisted: typeof settings | null = null;
      cleanups: Array<() => void> = [];
      commands: Array<{ id: string; callback: () => void }> = [];
      async loadData(): Promise<typeof settings> { return { ...settings }; }
      async saveData(value: typeof settings): Promise<void> { this.persisted = { ...value }; }
      addSettingTab(): void {}
      registerEditorExtension(): void {}
      register(callback: () => void): void { this.cleanups.push(callback); }
      addCommand(command: { id: string; callback: () => void }): void { this.commands.push(command); }
    }
    class Guide { open(): void { guides++; } close(): void {} }
    class Updates { open(): void { updates++; } close(): void {} }
    const loaded = await mockedModule<{ default: new () => Plugin & { onload(): Promise<void> } }>(new URL("../main.ts", import.meta.url), {
      obsidian: { Plugin },
      "./src/commands/register.ts": { registerCommands: () => {} },
      "./src/input/autoConvert.ts": { autoConvert: () => [] },
      "./src/view/crossrefView.ts": { crossrefExtension: () => [], registerCrossrefs: () => {}, setRefLanguage: () => {} },
      "./src/settings.ts": { DEFAULT_SETTINGS: {}, readSettings: (value: unknown) => value, VmlSettingTab: class {} },
      "./src/view/imageMenu.ts": { registerImageMenu: () => {} },
      "./src/view/layoutTouch.ts": { registerLayoutTouch: () => {} },
      "./src/view/cornerInput.ts": { registerCornerInputGuard: () => {} },
      "./src/view/livePreview.ts": { livePreviewExtension: () => [], refreshLayoutHighlights: () => {} },
      "./src/view/plainDrag.ts": { plainImageDrag: () => [] },
      "./src/view/readingView.ts": { registerReadingView: () => {} },
      "./src/guide/guideModal.ts": { GuideModal: Guide },
      "./src/guide/state.ts": { GUIDE_REVISION, shouldShowGuide },
      "./src/guide/releaseModal.ts": { ReleaseNotesModal: Updates },
      "./src/guide/releaseState.ts": { shouldShowReleaseNotes },
      "./src/view/messages.ts": { setUiLanguage: () => {}, t: (key: string) => key },
    });
    const plugin = new loaded.default();
    await plugin.onload();
    if (scenario.unload) plugin.cleanups.forEach(cleanup => cleanup());
    ready();
    await Promise.resolve();
    assert.equal(updates, scenario.updates);
    assert.equal(guides, scenario.guides);
    if (updates || guides) assert.equal(plugin.persisted?.lastSeenReleaseNotes, "0.7.3");
    else assert.equal(plugin.persisted, null);
    if (!scenario.unload) {
      plugin.commands.find(command => command.id === "show-release-notes")!.callback();
      assert.equal(updates, scenario.updates + 1, "manual command remains available");
    }
  });
}
