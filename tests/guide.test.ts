import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { findV2Blocks, isDrawable, readBlockCaption } from "../src/format/v2.ts";
import { GUIDE_REVISION, readGuideRevision, shouldShowGuide } from "../src/guide/state.ts";
import { calloutImages } from "../src/layout/calloutImages.ts";
import { isEditable } from "../src/layout/edits.ts";
import { collectRefs } from "../src/markdown/crossref.ts";
import { fencedCodeBlocks } from "../src/markdown/lineContext.ts";
import { splitTextColumns } from "../src/markdown/textColumns.ts";
import { mockedModule } from "./support/mockedModule.ts";

test("the guide opens for new and pre-guide installs, but not again on ordinary updates", () => {
  for (const value of [undefined, null, "1", -1, NaN, 0.5]) {
    assert.equal(shouldShowGuide(readGuideRevision(value)), true);
  }
  assert.equal(shouldShowGuide(readGuideRevision(GUIDE_REVISION)), false);
  assert.equal(shouldShowGuide(readGuideRevision(GUIDE_REVISION + 1)), false);
});

for (const language of ["zh-CN", "en"]) {
  test(`${language} examples have valid layouts, packaged media, callouts, manual columns and resolvable references`, () => {
    const text = readFileSync(new URL(`../docs/examples/Guide.${language}.md`, import.meta.url), "utf8");
    const lines = text.split(/\r?\n/);
    const blocks = findV2Blocks(lines);
    assert.equal(blocks.length, 7);
    assert.ok(blocks.every((block) => isDrawable(block) && block.metaError === null && isEditable(block)));
    assert.ok(readBlockCaption(blocks[0].meta.extra.caption) !== null);
    const manual = splitTextColumns(blocks[4].leftText!.lines.join("\n"));
    assert.equal(manual.columns.length, 2);
    assert.equal(manual.overflow, false);
    assert.deepEqual(blocks[6].rows.map((row) => row.embeds.map((embed) => embed.kind)), [["mermaid", "mermaid"]]);
    for (const block of blocks) {
      for (const embed of block.rows.flatMap((row) => row.embeds)) {
        if (embed.kind !== "image" && embed.kind !== "video") continue;
        const data = readFileSync(new URL(`../docs/examples/${embed.target}`, import.meta.url));
        assert.ok(data.byteLength > 0);
      }
    }
    const callouts = calloutImages(lines);
    assert.equal(callouts.length, 1);
    assert.equal(callouts[0].images.length, 1);
    assert.equal(callouts[0].images[0].editable, true);
    assert.equal(callouts[0].images[0].width, 0.45);
    const refs = collectRefs(lines);
    for (const key of ["fig:eval", "fig:gpt2", "eq:attn", "tbl:arch"]) assert.ok(refs.targets.has(key), key);
    assert.equal(refs.targets.size, 4);
  });

  test(`${language} agent guide recipes parse cleanly as valid, editable layouts`, () => {
    const text = readFileSync(new URL(`../docs/examples/AgentGuide.${language}.md`, import.meta.url), "utf8");
    const lines = text.split(/\r?\n/);
    const fences = fencedCodeBlocks(lines).filter((fence) => fence.language === "markdown");
    assert.ok(fences.length >= 7);
    let topLevelBlocks = 0;
    let calloutBlocks = 0;
    for (const fence of fences) {
      const snippet = lines.slice(fence.from + 1, fence.to);
      if (snippet[0]?.includes("{JSON}")) continue;
      for (const block of findV2Blocks(snippet)) {
        assert.ok(isDrawable(block) && block.metaError === null && isEditable(block));
        topLevelBlocks += 1;
      }
      for (const callout of calloutImages(snippet)) {
        for (const image of callout.images) {
          assert.equal(image.editable, true);
          calloutBlocks += 1;
        }
      }
    }
    assert.equal(topLevelBlocks, 6);
    assert.equal(calloutBlocks, 1);
  });
}

test("writeExampleNote skips creating an empty assets folder when no assets are passed", async () => {
  const folders: string[] = [];
  const files: string[] = [];
  const existing = new Set<string>();
  const app = {
    vault: {
      getAbstractFileByPath(path: string) { return existing.has(path) ? { path } : null; },
      async createFolder(path: string) { folders.push(path); existing.add(path); },
      async createBinary(path: string) { files.push(path); existing.add(path); },
      async create(path: string) { files.push(path); existing.add(path); return { path }; },
    },
  };
  const loaded = await mockedModule<{
    writeExampleNote(app: unknown, name: string, text: string, assets: readonly { name: string; data: Uint8Array }[], folderName: string): Promise<{ path: string }>;
  }>(new URL("../src/layout/writeBack.ts", import.meta.url), {
    obsidian: { MarkdownView: class { }, Platform: { isMobileApp: false }, editorInfoField: {}, editorLivePreviewField: {} },
    "@codemirror/view": { EditorView: class { } },
    "../view/canvas.ts": { canvasEditor: () => null },
    "./edits.ts": { applyEditsToEditor: () => ({ ok: true }), applyEditsToText: () => ({ ok: true }) },
    "./editorTransaction.ts": { applyEditsToView: () => ({ ok: true }) },
    "./blockIdentity.ts": { bindBlockEdits: () => ({ ok: true, edits: [] }) },
    "./documentSnapshot.ts": { snapshotForState: () => null },
  });
  await loaded.writeExampleNote(app, "Agent Guide", "# Guide", [], "GuideFolder");
  assert.deepEqual(folders, ["GuideFolder"]);
  assert.deepEqual(files, ["GuideFolder/Agent Guide.md"]);
  await loaded.writeExampleNote(app, "User Guide", "# Guide", [{ name: "a.png", data: new Uint8Array([1]) }], "GuideFolder");
  assert.deepEqual(folders, ["GuideFolder", "GuideFolder 2", "GuideFolder 2/assets"]);
  assert.deepEqual(files, ["GuideFolder/Agent Guide.md", "GuideFolder 2/assets/a.png", "GuideFolder 2/User Guide.md"]);
});

test("GuideModal renders 6 feature cards and can create the agent guide without assets", async () => {
  const created: Array<{ name: string; text: string; assets: unknown[]; folder: string }> = [];
  const opened: object[] = [];
  const notices: string[] = [];
  interface FakeEl {
    tag: string;
    cls: string;
    text: string;
    value: string;
    disabled: boolean;
    children: FakeEl[];
    listeners: Map<string, () => void>;
    addClass(cls: string): void;
    empty(): void;
    createDiv(opts?: { cls?: string }): FakeEl;
    createEl(tag: string, opts?: { cls?: string; text?: string; value?: string }): FakeEl;
    createSpan(opts?: { cls?: string; text?: string }): FakeEl;
    setText(text: string): void;
    addEventListener(event: string, fn: () => void): void;
  }
  const makeEl = (tag = "div", opts: { cls?: string; text?: string; value?: string } = {}): FakeEl => {
    const el: FakeEl = {
      tag,
      cls: opts.cls ?? "",
      text: opts.text ?? "",
      value: opts.value ?? "",
      disabled: false,
      children: [],
      listeners: new Map(),
      addClass(cls) { this.cls += ` ${cls}`; },
      empty() { this.children = []; },
      createDiv(o) { const child = makeEl("div", o); this.children.push(child); return child; },
      createEl(t, o) { const child = makeEl(t, o); this.children.push(child); return child; },
      createSpan(o) { const child = makeEl("span", o); this.children.push(child); return child; },
      setText(t) { this.text = t; },
      addEventListener(event, fn) { this.listeners.set(event, fn); },
    };
    return el;
  };
  let closed = 0;
  class Modal {
    app: unknown;
    modalEl = makeEl("div");
    contentEl = makeEl("div");
    constructor(app: unknown) { this.app = app; }
    close() { closed += 1; }
  }
  const app = { workspace: { getLeaf: () => ({ async openFile(file: object) { opened.push(file); } }) } };
  const loaded = await mockedModule<{ GuideModal: new (app: unknown) => { onOpen(): void } }>(new URL("../src/guide/guideModal.ts", import.meta.url), {
    obsidian: { Modal, Notice: class { constructor(text: string) { notices.push(text); } } },
    "../layout/writeBack.ts": {
      writeExampleNote: async (_app: unknown, name: string, text: string, assets: unknown[], folder: string) => {
        created.push({ name, text, assets, folder });
        return { path: `${folder}/${name}.md` };
      },
    },
    "../view/messages.ts": { currentLanguage: () => "en", t: (key: string) => key },
    "./content.ts": {
      GUIDE_TEXT: { zh: "zh guide", en: "en guide" },
      AGENT_GUIDE_TEXT: { zh: "zh agent", en: "en agent" },
      guideAssets: () => [{ name: "a.png", type: "image/png", data: new Uint8Array([1]) }],
    },
  });
  const modal = new loaded.GuideModal(app) as Modal & { onOpen(): void };
  modal.onOpen();
  const grid = modal.contentEl.children.find((el) => el.cls === "vml-guide__grid");
  assert.equal(grid?.children.length, 6);
  const footer = modal.contentEl.children.find((el) => el.cls === "vml-guide__footer");
  const actions = footer?.children.find((el) => el.cls === "vml-guide__footer-actions");
  const buttons = actions?.children.filter((el) => el.tag === "button") ?? [];
  assert.equal(buttons.length, 2);
  buttons[1].listeners.get("click")?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(JSON.stringify(created), JSON.stringify([{ name: "agentGuideName", text: "en agent", assets: [], folder: "exampleFolderName" }]));
  assert.equal(JSON.stringify(opened), JSON.stringify([{ path: "exampleFolderName/agentGuideName.md" }]));
  assert.equal(JSON.stringify(notices), JSON.stringify(["agentGuideCreated"]));
  assert.equal(closed, 1);
});
