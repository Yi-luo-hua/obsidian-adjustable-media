import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { findV2Blocks } from "../src/format/v2.ts";
import { isEditable } from "../src/layout/edits.ts";
import { splitTextColumns } from "../src/markdown/textColumns.ts";
import { mockedModule } from "./support/mockedModule.ts";

for (const language of ["zh", "en"] as const) {
  const suffix = language === "zh" ? "zh-CN" : "en";
  const samplePath = new URL(`../docs/examples/ManualColumns.${suffix}.md`, import.meta.url);

  test(`${language}: the bundled sample contains valid manual layouts and preserves the code marker`, async () => {
    const sample = await readFile(samplePath, "utf8");
    const blocks = findV2Blocks(sample.split("\n"));
    assert.equal(blocks.length, 4);
    assert.ok(blocks.every(isEditable));
    const parts = blocks.map(block => splitTextColumns(block.leftText!.lines.join("\n")));
    assert.deepEqual(parts.map(part => part.columns.length), [2, 4, 2, 2]);
    assert.ok(parts.every(part => !part.overflow));
    assert.equal(parts[1].columns[1].markdown.trim(), "", "the second column intentionally stays empty");
    assert.ok(parts[2].columns[0].markdown.includes("```text\n+++"), "the marker inside code stays in the first column");
  });

  test(`${language}: the update link creates and opens the bundled sample through the onboarding writer`, async () => {
    const sample = await readFile(samplePath, "utf8");
    const url = `https://raw.githubusercontent.com/Yi-luo-hua/obsidian-adjustable-media/0.7.3/docs/examples/ManualColumns.${suffix}.md`;
    let replace = 0, unrelated = 0, closed = 0, writes = 0;
    let finish!: (file: object) => void;
    const pending = new Promise<object>(resolve => { finish = resolve; });
    const notices: string[] = [];
    const opened: object[] = [];
    let onClick = (): void => {};
    const button = { disabled: false, text: "", setText(text: string) { this.text = text; }, addEventListener(_name: string, run: () => void) { onClick = run; } };
    const links = [
      { getAttribute: () => url, replaceWith() { replace++; } },
      { textContent: "Repository", getAttribute: () => "https://github.com/Yi-luo-hua/obsidian-adjustable-media", replaceWith() { unrelated++; } },
    ];
    const body = { querySelectorAll: () => links, createEl: (_tag: string, options: { text: string; cls: string }) => {
      assert.ok(options.cls.includes("mod-cta vml-guide__create-btn")); button.text = options.text; return button;
    } };
    const app = { workspace: { getLeaf(type: string) { assert.equal(type, "tab"); return { async openFile(file: object) { opened.push(file); } }; } } };
    const loaded = await mockedModule<{ attachManualColumnExamples(body: unknown, app: unknown, close: () => void): void; MANUAL_COLUMNS_SAMPLE_URLS: Record<string, string> }>(new URL("../src/guide/manualColumnExamples.ts", import.meta.url), {
      obsidian: { Notice: class { constructor(text: string) { notices.push(text); } } },
      "../../docs/examples/ManualColumns.zh-CN.md": language === "zh" ? sample : "wrong language",
      "../../docs/examples/ManualColumns.en.md": language === "en" ? sample : "wrong language",
      "../view/messages.ts": { currentLanguage: () => language, t: (key: string, _values: object, selected: string) => { assert.equal(selected, language); return key; } },
      "../layout/writeBack.ts": { writeExampleNote: (target: object, name: string, text: string, assets: unknown[], folder: string) => {
        assert.equal(target, app); assert.equal(name, "manualColumnExampleName"); assert.equal(text, sample); assert.equal(assets.length, 0); assert.equal(folder, "exampleFolderName"); writes++; return pending;
      } },
    });
    const notes = await readFile(new URL(`../docs/releases/0.7.3.${suffix}.md`, import.meta.url), "utf8");
    assert.equal(loaded.MANUAL_COLUMNS_SAMPLE_URLS[language], url);
    assert.ok(notes.includes(url), "release notes link to the matching language sample");
    loaded.attachManualColumnExamples(body, app, () => { closed++; });
    assert.equal(replace, 1);
    assert.equal(unrelated, 0);
    assert.equal(button.text, "manualColumnExampleCreate");
    onClick();
    onClick();
    assert.equal(writes, 1, "a second click during creation cannot create another copy");
    assert.equal(button.disabled, true);
    assert.deepEqual(opened, []);
    const file = { path: "fresh examples/sample.md" };
    finish(file);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(opened, [file]);
    assert.deepEqual(notices, ["manualColumnExampleCreated"]);
    assert.equal(closed, 1);
    assert.equal(button.disabled, false);
    assert.equal(button.text, "manualColumnExampleCreate");
  });

}
