import assert from "node:assert/strict";
import { test } from "node:test";
import * as format from "../src/format/v2.ts";
import * as model from "../src/layout/model.ts";
import * as contexts from "../src/markdown/lineContext.ts";
import { planWrapImage, planWrapSelection, lineChangeEdit } from "../src/commands/plans.ts";
import { applyEditsToText, planModelEdit, planMoveOut } from "../src/layout/edits.ts";
import { takePlainEmbed } from "../src/layout/plainEmbed.ts";
import { mockedModule } from "./support/mockedModule.ts";

test("Excalidraw wiki and Markdown embeds retain exact syntax, sizes and fragment references", () => {
  const raw = '![[draw.excalidraw#^group=abc|alias|240]] ![Sketch|320](<folder/draw.excalidraw.md#^frame=xyz> "Title")';
  const embeds = format.readEmbedRow(raw, 7)!;
  assert.deepEqual(embeds.map(e => [e.kind, e.target, e.fragment, e.nativeWidth]), [
    ["excalidraw", "draw.excalidraw", "#^group=abc", 240],
    ["excalidraw", "folder/draw.excalidraw.md", "#^frame=xyz", 320],
  ]);
  for (const embed of embeds) assert.equal(raw.slice(embed.from, embed.to), embed.raw);
  assert.equal(format.mediaKindOf("DRAW.EXCALIDRAW.MD"), "excalidraw");
  for (const target of ["note.md", "excalidraw.md", "https://example.com/draw.excalidraw", "draw.excalidraw.png.md"]) assert.equal(format.mediaKindOf(target), null);
});

test("wrap, resize, captions, reorder and move out keep Excalidraw source byte for byte", () => {
  const drawing = '![[folder/draw.excalidraw#^area=xyz|原别名|240]]';
  const text = ["Before  ", "", '<!-- vml {"custom":"keep"} -->', `${drawing} ![Photo](image.png "Title")  `, "<!-- /vml -->", "", "After\t"].join("\r\n");
  const block = format.findV2Blocks(text.split("\n"))[0];
  let layout = model.modelFromBlock(block);
  layout = model.setCaption(model.setSingleWidth(layout, 0, 0.6), { row: 0, index: 0 }, "Drawing {#fig:draw}");
  const edit = planModelEdit(block, layout)!;
  const saved = applyEditsToText(text, [edit]);
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.ok(saved.text.includes(`${drawing} ![Photo](image.png "Title")  \r\n`));
  assert.ok(saved.text.startsWith("Before  \r\n\r\n"));
  assert.ok(saved.text.endsWith("\r\nAfter\t"));
  const moved = model.moveItem(layout, { row: 0, index: 0 }, { kind: "newRow", beforeRow: 1 });
  const reordered = applyEditsToText(text, [planModelEdit(block, moved)!]);
  assert.equal(reordered.ok, true);
  if (reordered.ok) assert.deepEqual(format.findV2Blocks(reordered.text.split("\n"))[0].rows.flatMap(r => r.embeds.map(e => e.raw)), ['![Photo](image.png "Title")', drawing]);
  const removed = model.removeItem(layout, { row: 0, index: 0 })!;
  const out = applyEditsToText(text, [planMoveOut(block, removed.model, removed.item.embed)!]);
  assert.equal(out.ok, true);
  if (out.ok) assert.ok(out.text.includes(drawing + "\r\n"));
});

test("plain wrapping and dropping recognize drawings while explicit text blocks stay text", () => {
  const drawing = "![[draw.excalidraw|240]]";
  assert.ok(planWrapImage([drawing], 0, 0));
  assert.ok(planWrapSelection([drawing, "Text beside it"], 0, 1));
  assert.equal(takePlainEmbed([drawing], 0, 0)?.embed.kind, "excalidraw");
  const block = format.findV2Blocks(['<!-- vml {"type":"text","wrap":"right"} -->', drawing, '<!-- /vml -->'])[0];
  assert.equal(block.rows.length, 0);
  assert.deepEqual(block.leftText?.lines, [drawing]);
  for (const lines of [["```md", drawing, "```"], ["---", drawing, "---"], ["$$", drawing, "$$"], ["<!--", drawing, "-->"]]) {
    assert.equal(takePlainEmbed(lines, 1, 0), null);
    assert.equal(planWrapImage(lines, 1, 0), null);
  }
  const wrapped = planWrapImage([drawing], 0, 0)!;
  const stale = applyEditsToText(drawing + " changed", [lineChangeEdit([drawing], wrapped)]);
  assert.equal(stale.ok, false);
});

async function renderHarness() {
  const cleanup: Array<() => void> = [], revoked: string[] = [], created: string[] = [], destroyed: number[] = [];
  const pending: Array<{ path: string; resolve(svg: unknown): void; reject(error: Error): void }> = [];
  const events = new Map<string, (file: unknown) => void>(), timers = new Map<number, () => void>();
  const themeCallbacks: Array<() => void> = [], errors: unknown[] = [];
  let timer = 0, dark = false;
  const file = { path: "folder/draw.excalidraw.md" };
  class Automate {
    id = pending.length;
    createSVG(path: string) { return new Promise((resolve, reject) => pending.push({ path, resolve, reject })); }
    destroy() { destroyed.push(this.id); }
  }
  class Observer {
    constructor(callback: () => void) { themeCallbacks.push(callback); }
    observe() {} disconnect() {}
  }
  const body = { hasClass: () => dark };
  const win = { Event, Blob, MutationObserver: Observer, URL: {
    createObjectURL() { const url = `blob:${created.length}`; created.push(url); return url; },
    revokeObjectURL(url: string) { revoked.push(url); },
  }, setTimeout(callback: () => void) { timers.set(++timer, callback); return timer; }, clearTimeout(id: number) { timers.delete(id); } };
  class Element {
    win = win;
    doc = { body, createElement: () => ({}) };
    image: unknown = null;
    text = "";
    setText(text: string) { this.text = text; this.image = null; }
    replaceChildren(image: unknown) { this.image = image; this.text = ""; }
    addEventListener() {}
    dispatchEvent() { return true; }
  }
  const app = { plugins: { plugins: { "obsidian-excalidraw-plugin": { ea: new Automate() } } },
    vault: { on(name: string, callback: (file: unknown) => void) { events.set(name, callback); return name; }, offref(name: string) { events.delete(name); } }, workspace: {} };
  let rendered = "";
  const module = await mockedModule<{ renderExcalidraw(...args: unknown[]): Promise<void>; renderExcalidrawMarkdown(...args: unknown[]): Promise<void> }>(new URL("../src/view/excalidraw.ts", import.meta.url), {
    obsidian: { MarkdownRenderer: { render(_app: unknown, text: string) { rendered = text; return Promise.resolve(); } } },
    "../format/v2.ts": format, "../markdown/lineContext.ts": contexts,
    "./media.ts": { resolveMedia: () => ({ file }) }, "./messages.ts": { t: (key: string) => key },
  }, { crypto, console: { error: (...args: unknown[]) => errors.push(args) } });
  const el = new Element(), component = { register(stop: () => void) { cleanup.push(stop); } };
  const svg = { viewBox: { baseVal: { width: 320, height: 170 } }, outerHTML: "<svg/>" };
  const embed = format.readMediaEmbeds("![[draw.excalidraw#^group=abc|240]]", 0)[0];
  const flush = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); };
  return { module, app, embed, el, component, pending, created, revoked, destroyed, errors,
    svg, file, events, flush, cleanup() { cleanup.splice(0).reverse().forEach(fn => fn()); },
    theme(value: boolean) { dark = value; themeCallbacks.forEach(fn => fn()); },
    rendered: () => rendered,
  };
}

test("SVG preview owns its API instance and URL, refreshes on drawing/theme changes and discards stale results", async () => {
  const h = await renderHarness();
  let sizes = 0;
  const initial = h.module.renderExcalidraw(h.app, h.embed, h.el, "note.md", h.component, () => sizes++);
  assert.equal(h.pending[0].path, h.file.path + "#^group=abc");
  h.pending[0].resolve(h.svg); await initial;
  assert.equal(sizes, 1);
  h.events.get("modify")!({ path: "other.md" }); h.flush();
  assert.equal(h.pending.length, 1);
  h.events.get("modify")!(h.file); h.flush();
  h.theme(true); h.flush();
  h.pending[1].resolve(h.svg); await new Promise(resolve => setImmediate(resolve));
  assert.equal(sizes, 1, "the superseded save result cannot replace the newer theme request");
  h.pending[2].resolve(h.svg); await new Promise(resolve => setImmediate(resolve));
  assert.equal(sizes, 2);
  assert.deepEqual(h.revoked, ["blob:0"]);
  h.events.get("modify")!(h.file); h.flush();
  h.cleanup();
  h.pending[3].resolve(h.svg); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.created.length, 2, "no URL is created after teardown");
  assert.deepEqual(h.revoked, h.created);
  assert.equal(h.events.size, 0);
  assert.equal(h.destroyed.length, 4);
});

test("closing during export resolves pending render tasks without installing a late image", async () => {
  const h = await renderHarness();
  const initial = h.module.renderExcalidraw(h.app, h.embed, h.el, "note.md", h.component);
  h.cleanup(); await initial;
  h.pending[0].resolve(h.svg); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.el.image, null);
  assert.equal(h.created.length, 0);
  assert.equal(h.destroyed.length, 1);
});

test("missing plugin and export failure produce visible fallbacks and complete rendering", async () => {
  const h = await renderHarness();
  const initial = h.module.renderExcalidraw(h.app, h.embed, h.el, "note.md", h.component);
  h.pending[0].reject(new Error("Invalid drawing")); await initial;
  assert.equal(h.el.text, "excalidrawFailed");
  assert.equal(h.errors.length, 1);
  h.cleanup();
  const missing = await renderHarness();
  Reflect.deleteProperty(missing.app.plugins.plugins, "obsidian-excalidraw-plugin");
  await missing.module.renderExcalidraw(missing.app, missing.embed, missing.el, "note.md", missing.component);
  assert.equal(missing.el.text, "excalidrawUnavailable");
  missing.cleanup();
});

test("text rendering replaces only actual embeds, preserving code, comments and repeated source", async () => {
  const h = await renderHarness();
  const raw = "![[draw.excalidraw|240]]";
  const markdown = [raw + " " + raw, "`" + raw + "`", "```md", raw, "```", "<!--", raw, "-->"].join("\n");
  const el = { querySelector: () => null };
  await h.module.renderExcalidrawMarkdown(h.app, markdown, el, "note.md", h.component);
  assert.equal(h.rendered().match(/data-vml-excalidraw=/g)?.length, 2);
  assert.ok(h.rendered().includes("`" + raw + "`"));
  assert.ok(h.rendered().includes("```md\n" + raw + "\n```"));
  assert.ok(h.rendered().includes("<!--\n" + raw + "\n-->"));
  assert.equal(h.pending.length, 0);
  h.cleanup();
});
