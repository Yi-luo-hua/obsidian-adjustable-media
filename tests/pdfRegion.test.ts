import assert from "node:assert/strict";
import { test } from "node:test";
import * as format from "../src/format/v2.ts";
import * as model from "../src/layout/model.ts";
import { lineChangeEdit, planWrapImage, planWrapSelection } from "../src/commands/plans.ts";
import { applyEditsToText, isEditable, planColumnText, planModelEdit, planMoveOut, planUnwrap } from "../src/layout/edits.ts";
import { takePlainEmbed } from "../src/layout/plainEmbed.ts";
import { mockedModule } from "./support/mockedModule.ts";

const crop = "![[软件工程.pdf#page=7&rect=45,120,500,600|软件工程, p.7]]";

test("PDF++ rectangle embeds are layout media with their exact fragment and size", () => {
  const raw = `${crop} ![p.2|320](<docs/a b.pdf#page=2&rect=10,20,110,70&color=yellow>) ![[b.pdf#page=3&rect=0,0,300,100&width=240|b, p.3]]`;
  const embeds = format.readEmbedRow(raw, 4)!;
  assert.deepEqual(embeds.map(e => [e.kind, e.target, e.fragment, e.nativeWidth, e.alt]), [
    ["pdf", "软件工程.pdf", "#page=7&rect=45,120,500,600", null, "软件工程, p.7"],
    ["pdf", "docs/a b.pdf", "#page=2&rect=10,20,110,70&color=yellow", 320, "p.2"],
    ["pdf", "b.pdf", "#page=3&rect=0,0,300,100&width=240", 240, "b, p.3"],
  ]);
  for (const embed of embeds) assert.equal(raw.slice(embed.from, embed.to), embed.raw);
  assert.deepEqual(format.pdfRegion("#page=7&rect=45,120,500,600"), { page: 7, rect: [45, 120, 500, 600], width: null });
  assert.deepEqual(format.pdfRegionSize(format.pdfRegion("#page=1&rect=300,100,0,0")!), { width: 400, height: 400 / 3 });
});

test("whole PDFs, pages, selections, annotations and malformed rectangles stay text", () => {
  for (const embed of ["![[a.pdf]]", "![[a.pdf#page=3]]", "![[a.pdf#page=3&selection=1,2,3,4]]", "![[a.pdf#page=3&annotation=12R]]",
    "![[a.pdf#rect=1,2,3,4]]", "![[a.pdf#page=0&rect=1,2,3,4]]", "![[a.pdf#page=x&rect=1,2,3,4]]", "![[a.pdf#page=1&rect=1,2,3]]",
    "![[a.pdf#page=1&rect=1,2,1,4]]", "![[a.pdf#page=1&rect=0,,100,50]]", "![[a.pdf#page=1&rect=0,%20,100,50]]",
    "![[note#page=1&rect=1,2,3,4]]", "![](https://example.com/a.pdf#page=1&rect=1,2,3,4)"]) {
    assert.equal(format.readEmbedRow(embed, 0), null, embed);
    assert.ok(format.readMediaEmbeds(embed, 0, true).every(item => item.kind !== "pdf"), embed);
  }
  const block = format.findV2Blocks(["<!-- vml -->", "![[a.pdf#page=3]]", "<!-- /vml -->"])[0];
  assert.equal(block.rows.length, 0);
  assert.equal(format.pdfRegion("#page=1&rect=0,0,100,50&width=Infinity")?.width, null);
});

test("unmarked PDF regions stay in existing V2 text columns without shifting image settings", () => {
  const opener = '<!-- vml {"v":2,"rows":[{"height":240,"captions":["Photo"]}]} -->';
  for (const column of [[crop], [crop, "Context"]]) {
    const [block] = format.findV2Blocks([opener, ...column, "![[photo.png]]", crop, format.CLOSE_LINE]);
    assert.ok(format.isDrawable(block));
    assert.ok(isEditable(block));
    assert.deepEqual(block.leftText?.lines, column);
    assert.deepEqual(block.rightText?.lines, [crop]);
    const [row] = model.modelFromBlock(block).rows;
    assert.equal(row.height, 240);
    assert.equal(row.items[0].embed.target, "photo.png");
    assert.equal(row.items[0].caption, "Photo");
  }
  const [text] = format.findV2Blocks(["<!-- vml -->", "Context", crop, format.CLOSE_LINE]);
  assert.ok(format.isTextBlock(text));
  assert.deepEqual(text.leftText?.lines, ["Context", crop]);
});

test("unmarked PDF regions do not change the saved item count of a V3 layout", () => {
  const opener = '<!-- vml {"v":3,"kind":"media","rows":[{"items":1}]} -->';
  const [block] = format.findV2Blocks([
    opener, crop, "![[photo.png]]", format.CLOSE_LINE,
  ]);
  assert.ok(isEditable(block));
  assert.deepEqual(block.leftText?.lines, [crop]);
  assert.deepEqual(block.rows[0].embeds.map(embed => embed.target), ["photo.png"]);
  const [marked] = format.findV2Blocks(format.serializeBlock(block.meta, [format.readEmbedRow(crop, 0)!]));
  assert.ok(isEditable(marked));
  assert.equal(marked.rows[0].embeds[0].raw, crop);
});

test("mixed media rows were text before PDF support, and wrapping opts them into media", () => {
  const body = [crop + " ![](https://example.com/content)", "Context"];
  const [legacy] = format.findV2Blocks(["<!-- vml -->", ...body, format.CLOSE_LINE]);
  assert.ok(format.isTextBlock(legacy));
  const change = planWrapSelection(body, 0, 1)!;
  const [wrapped] = format.findV2Blocks(change.replacement);
  assert.deepEqual(wrapped.rows[0].embeds.map(embed => embed.kind), ["pdf", "image"]);
  assert.deepEqual(wrapped.rightText?.lines, ["Context"]);
  assert.deepEqual(planUnwrap(wrapped)?.replacement, body);
});

test("a block of PDF regions has media rows, so resizing and moving keep each embed byte for byte", () => {
  const second = "![[软件工程.pdf#page=8&rect=45,120,500,400|软件工程, p.8]]";
  const text = ["Before", "", '<!-- vml {"v":2,"rows":[{},{}],"custom":"keep"} -->', crop, second, "<!-- /vml -->", "", "After"].join("\r\n");
  const block = format.findV2Blocks(text.split("\n"))[0];
  assert.deepEqual(block.rows.map(row => row.embeds.map(e => e.kind)), [["pdf"], ["pdf"]]);
  assert.equal(block.leftText, null);
  let layout = model.modelFromBlock(block);
  layout = model.moveItem(layout, { row: 1, index: 0 }, { kind: "beside", position: { row: 0, index: 0 }, side: "after" });
  layout = model.setCaption(layout, { row: 0, index: 1 }, "p.8");
  const saved = applyEditsToText(text, [planModelEdit(block, layout)!]);
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.ok(saved.text.includes(`\r\n${crop} ${second} <!-- vml-pdf-row -->\r\n`));
  assert.ok(saved.text.includes('"custom":"keep"'));
  assert.ok(saved.text.startsWith("Before\r\n\r\n") && saved.text.endsWith("\r\n\r\nAfter"));
  const reread = format.findV2Blocks(saved.text.split("\n"))[0];
  const removed = model.removeItem(model.modelFromBlock(reread), { row: 0, index: 0 })!;
  const out = applyEditsToText(saved.text, [planMoveOut(reread, removed.model, removed.item.embed)!]);
  assert.equal(out.ok, true);
  if (out.ok) assert.ok(out.text.includes(crop + "\r\n"));
});

test("wrapping PDF region lines makes a media layout; explicit text blocks stay text", () => {
  const second = "![[a.pdf#page=2&rect=0,0,100,50]]";
  const change = planWrapSelection([crop, second], 0, 1)!;
  const wrapped = applyEditsToText([crop, second].join("\n"), [lineChangeEdit([crop, second], change)]);
  assert.equal(wrapped.ok, true);
  if (wrapped.ok) {
    const block = format.findV2Blocks(wrapped.text.split("\n"))[0];
    assert.equal(block.rows.flatMap(row => row.embeds).length, 2);
    assert.equal(block.leftText, null);
    const plan = planColumnText(block, "left", crop);
    assert.ok(plan.fits && plan.edit);
    const [withColumn] = format.findV2Blocks([...plan.edit.replacement, ...block.lines.slice(1)]);
    assert.deepEqual(withColumn.leftText?.lines, [crop]);
    assert.equal(withColumn.rows.flatMap(row => row.embeds).length, 2);
  }
  assert.ok(planWrapImage([crop], 0, 3));
  assert.equal(takePlainEmbed([crop], 0, 0)?.embed.kind, "pdf");
  const text = format.findV2Blocks(['<!-- vml {"type":"text"} -->', crop, "<!-- /vml -->"])[0];
  assert.equal(text.rows.length, 0);
  assert.deepEqual(text.leftText?.lines, [crop]);
});

async function regionHarness(loaded: boolean) {
  const opened: string[] = [], rendered: string[] = [], cleanup: Array<() => void> = [], timers = new Map<number, () => void>();
  let observed: (() => void) | null = null, timer = 0;
  const image = { complete: false, naturalWidth: 0, naturalHeight: 0, listeners: new Map<string, () => void>(),
    addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); },
    removeEventListener(name: string) { this.listeners.delete(name); } };
  const el = {
    text: "", classes: [] as string[], child: null as typeof image | null, listeners: new Map<string, (event: object) => void>(),
    win: { MutationObserver: class { constructor(callback: () => void) { observed = callback; } observe() {} disconnect() { observed = null; } },
      setTimeout: (callback: () => void) => { timers.set(++timer, callback); return timer; }, clearTimeout: (id: number) => timers.delete(id) },
    addEventListener(name: string, callback: (event: object) => void) { this.listeners.set(name, callback); },
    addClass(cls: string) { this.classes.push(cls); }, setText(text: string) { this.text = text; },
    querySelector() { return this.child; },
  };
  const app = { plugins: { plugins: loaded ? { "pdf-plus": {} } : {} }, workspace: { openLinkText: async (link: string) => { opened.push(link); } } };
  const module = await mockedModule<{ renderPdfRegion(...args: unknown[]): Promise<void> }>(
    new URL("../src/view/pdfRegion.ts", import.meta.url), {
      obsidian: { MarkdownRenderer: { render: async (_app: unknown, markdown: string) => { rendered.push(markdown); } } },
      "./messages.ts": { t: (key: string) => key },
    });
  const sizes: Array<{ width: number; height: number }> = [];
  const embed = format.readEmbedRow(crop, 0)![0];
  const done = module.renderPdfRegion(app, embed, el, "note.md", { register: (callback: () => void) => cleanup.push(callback) }, (size: { width: number; height: number }) => sizes.push({ ...size }));
  return { el, image, done, opened, rendered, sizes, timers, cleanup, mutate: () => observed?.() };
}

test("a PDF region waits for PDF++'s image, and without PDF++ explains what is missing", async () => {
  const host = await regionHarness(true);
  await Promise.resolve();
  assert.deepEqual(host.rendered, [crop]);
  let settled = false;
  void host.done.then(() => { settled = true; });
  host.el.child = host.image;
  host.mutate();
  await Promise.resolve();
  assert.equal(settled, false);
  Object.assign(host.image, { complete: true, naturalWidth: 900, naturalHeight: 300 });
  host.image.listeners.get("load")!();
  await host.done;
  assert.deepEqual(host.sizes, [{ width: 900, height: 300 }]);
  assert.equal(host.timers.size, 0);
  host.el.listeners.get("dblclick")!({ preventDefault() {}, stopPropagation() {}, ctrlKey: false, metaKey: false });
  assert.deepEqual(host.opened, ["软件工程.pdf#page=7&rect=45,120,500,600"]);

  const closed = await regionHarness(true);
  await Promise.resolve();
  for (const callback of closed.cleanup) callback();
  await closed.done;
  assert.deepEqual(closed.sizes, []);

  const missing = await regionHarness(false);
  await missing.done;
  assert.equal(missing.el.text, "pdfPlusUnavailable");
  assert.deepEqual(missing.rendered, []);
});
