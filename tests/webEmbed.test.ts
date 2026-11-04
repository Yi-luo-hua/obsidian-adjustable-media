import assert from "node:assert/strict";
import { test } from "node:test";
import { isNativeWebEmbed, parseWebFrame } from "../src/format/webEmbed.ts";
import { findV2Blocks, readMediaEmbeds, readStandaloneWebFrame, serializeBlock } from "../src/format/v2.ts";
import { planWrapSelection, lineChangeEdit, planMergeWithNext } from "../src/commands/plans.ts";
import { applyEditsToText, planModelEdit, planMoveOut } from "../src/layout/edits.ts";
import { insertItem, metaFromModel, modelFromBlock, moveItem, onlySizingDiffers, removeItem, rowEmbeds, scaleRows, setWebHeight, setWeights, webHeight } from "../src/layout/model.ts";
import { takePlainWebFrame } from "../src/layout/plainEmbed.ts";
import * as plain from "../src/layout/plainEmbed.ts";
import * as format from "../src/format/v2.ts";
import * as models from "../src/layout/model.ts";
import { trackPointer } from "../src/view/pointer.ts";
import { webSectionPlan } from "../src/markdown/webSections.ts";
import { planWrap } from "../src/input/insertion.ts";
import { mockedModule } from "./support/mockedModule.ts";

// Public provider examples: docs/features/web-embeds.md records their sources.
const youtube = '<iframe width="560" height="315" src="https://www.youtube.com/embed/M7lc1UVf-VE" title="YouTube API example" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
const spotify = '<iframe style="border-radius:12px"\n src="https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ?utm_source=generator"\n width="100%" height="352" frameBorder="0" allowfullscreen=""\n allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>';
const map = '<iframe width="425" height="350" src="https://www.openstreetmap.org/export/embed.html?bbox=-0.16%2C51.49%2C-0.10%2C51.52&amp;layer=mapnik"></iframe>';
const native = '![](https://www.youtube.com/watch?v=NnTvZWp5Q7o)';
const blockOf = (body: string, rows = [{ items: 3 }]) => findV2Blocks([`<!-- vml ${JSON.stringify({ v: 3, kind: "media", rows })} -->`, ...body.split("\n"), '<!-- /vml -->'])[0];

test("list-owned web embeds cannot be taken, wrapped alone or auto-converted", () => {
  for (const prefix of ['- Item', '1. Item', '- Parent\n  - Child']) {
    for (const raw of [map, spotify, native, map + ' ' + map]) {
      const lines = [...prefix.split('\n'), ...raw.split('\n')], first = prefix.split('\n').length;
      assert.equal(takePlainWebFrame(lines, first), null);
      assert.equal(plain.takePlainEmbed(lines, first, 0), null);
      assert.equal(planWrapSelection(lines, first, lines.length - 1), null);
      assert.equal(planWrap(lines, [first], { mergeWithPrevious: false }), null);
    }
  }
  const separated = ['- Item', '', ...spotify.split('\n')];
  assert.equal(takePlainWebFrame(separated, 2)!.embed.raw, spotify);
  assert.ok(planWrapSelection(separated, 2, separated.length - 1));
});

test("wrapping a whole list keeps its web embeds as list text", () => {
  for (const raw of [map, spotify, native]) {
    const lines = ['- Item', ...raw.split('\n')];
    const change = planWrapSelection(lines, 0, lines.length - 1)!;
    assert.ok(change);
    const block = findV2Blocks(change.replacement)[0];
    assert.equal(block.meta.extra.type, 'text');
    assert.equal(block.rows.length, 0);
    assert.equal(block.leftText!.lines.join('\n'), lines.join('\n'));
  }
});

test("compact web rows resize from their current maximum; mixed rows retain ordinary media height", () => {
  const compact = '<iframe src="https://example.org/a" height="100"></iframe>\n<iframe src="https://example.org/b" height="152"></iframe>';
  const model = modelFromBlock(blockOf(compact, [{ items: 2 }])), row = model.rows[0];
  assert.deepEqual(row.items.map(item => webHeight(row, item)), [100, 152]);
  assert.equal(models.rowHeightForResize(row), 152);
  const resized = models.setRowHeight(model, 0, models.rowHeightForResize(row) + 1).rows[0];
  assert.deepEqual(resized.items.map(item => webHeight(resized, item)), [153, 153]);
  assert.equal(models.rowHeightForResize({ ...row, height: 120 }), 120);
  const mixed = modelFromBlock(blockOf(compact + '\n![[image.png]]')).rows[0];
  assert.equal(models.rowHeightForResize(mixed), 220);
});

test("real provider frames parse without changing permissions, URL escapes or source", () => {
  for (const raw of [youtube, spotify, map]) {
    const item = readStandaloneWebFrame(raw.split("\n"), 0)!;
    assert.equal(item.raw, raw);
    assert.equal(item.kind, "web");
    assert.equal(item.endLine, raw.split("\n").length - 1);
  }
  assert.equal(parseWebFrame(spotify)!.height, 352);
  assert.equal(parseWebFrame(spotify)!.width, null);
  assert.equal(parseWebFrame(youtube)!.attributes.allowfullscreen, "");
  assert.equal(parseWebFrame(map)!.url.endsWith('&layer=mapnik'), true);
  assert.equal(parseWebFrame(spotify)!.attributes.style, undefined);
});

test("HTML quoting, uppercase, entities and protocol-relative sources follow frame semantics", () => {
  const frame = parseWebFrame("<IFRAME TITLE='A > B' SRC='//example.org/?a=1&amp;b=&#50;' height=240 sandbox=''></IFRAME>")!;
  assert.equal(frame.url, 'https://example.org/?a=1&b=2');
  assert.equal(frame.attributes.title, 'A > B');
  assert.equal(frame.attributes.sandbox, '');
  assert.equal(parseWebFrame('<iframe src="https://example.org" src="https://other.org"></iframe>')!.url, 'https://example.org');
});

test("partial HTML, nested content, srcdoc, active schemes and malformed attributes stay ordinary text", () => {
  for (const raw of ['<iframe src="https://example.org">', '<iframe src="https://example.org"/>',
    '<iframe src="javascript:alert(1)"></iframe>', '<iframe src="file:///secret"></iframe>',
    '<iframe src="https://example.org" srcdoc="<p>Hi</p>"></iframe>',
    '<iframe src="https://example.org"><script>alert(1)</script></iframe>',
    '<iframe src="https://example.org" broken=></iframe>']) assert.equal(parseWebFrame(raw), null, raw);
  assert.equal(parseWebFrame('<iframe src="https://example.org" onload="alert(1)"></iframe>')!.attributes.onload, undefined);
});

test("only supported native Markdown web embeds are media; normal links, local notes and remote images keep their meaning", () => {
  for (const url of ['https://youtu.be/M7lc1UVf-VE?t=10', 'https://www.youtube.com/watch?v=NnTvZWp5Q7o',
    'https://m.youtube.com/shorts/abc', 'https://www.youtube-nocookie.com/embed/abc', 'https://twitter.com/obsdmd/status/1580548874246443010']) assert.equal(isNativeWebEmbed(url), true);
  for (const url of ['note.md', 'https://youtube.com.evil.org/watch?v=1', 'https://example.org/image', 'https://example.org/a.png']) assert.equal(isNativeWebEmbed(url), false);
  assert.equal(readMediaEmbeds('[YouTube](https://youtu.be/abc)', 0).length, 0);
  assert.equal(readMediaEmbeds(native, 0)[0].kind, 'web');
  const items = readMediaEmbeds('![[a.png]] ' + youtube + ' ' + native, 4);
  assert.deepEqual(items.map(item => item.kind), ['image', 'web', 'web']);
});

test("multiline frames and mixed media use V3 item counts and preserve all source on round-trip", () => {
  const block = blockOf(youtube + '\n' + spotify + '\n![[a.png]]');
  assert.equal(block.metaError, null);
  assert.deepEqual(block.rows[0].embeds.map(item => item.raw), [youtube, spotify, '![[a.png]]']);
  const model = modelFromBlock(block);
  const reread = findV2Blocks(serializeBlock(metaFromModel(model), rowEmbeds(model)))[0];
  assert.deepEqual(reread.rows.map(row => row.embeds.map(item => item.raw)), block.rows.map(row => row.embeds.map(item => item.raw)));
});

test("selection wraps full frames together; code, comments and explicit text blocks never become media", () => {
  const raw = youtube + '\n\n' + spotify;
  const change = planWrapSelection(raw.split('\n'), 0, raw.split('\n').length - 1)!;
  const wrapped = findV2Blocks(change.replacement)[0];
  assert.equal(wrapped.meta.version, 3);
  assert.deepEqual(wrapped.rows[0].embeds.map(item => item.raw), [youtube, spotify]);
  for (const body of ['```html\n' + youtube + '\n```', '%%\n' + youtube + '\n%%', '<!--\n' + youtube + '\n-->']) {
    const b = blockOf(body, []);
    assert.equal(b.rows.length, 0);
    assert.equal(takePlainWebFrame(body.split('\n'), 1), null);
  }
  const text = findV2Blocks(['<!-- vml {"type":"text"} -->', youtube, '<!-- /vml -->'])[0];
  assert.equal(text.rows.length, 0);
  assert.equal(planWrapSelection(spotify.split('\n'), 0, 1), null);
});

test("size edits only change the opening comment, preserve CRLF and reuse loaded frames", () => {
  const block = blockOf(youtube + '\n' + spotify + '\n' + map), model = modelFromBlock(block);
  const next = setWebHeight(setWeights(model, 0, [2, 1, 1]), { row: 0, index: 1 }, 410);
  const edit = planModelEdit(block, next)!;
  assert.equal(edit.start, 0); assert.equal(edit.end, 0);
  const text = 'Before\r\n\r\n' + block.lines.join('\r\n') + '\r\n\r\nAfter';
  const shifted = { ...block, openLine: 2, closeLine: block.closeLine + 2 };
  const saved = applyEditsToText(text, [planModelEdit(shifted, next)!]);
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.text.slice(saved.text.indexOf('\r\n', saved.text.indexOf('<!-- vml'))), text.slice(text.indexOf('\r\n', text.indexOf('<!-- vml'))));
  const parsed = modelFromBlock(findV2Blocks(saved.text.split('\n'))[0]);
  assert.equal(onlySizingDiffers(modelFromBlock(findV2Blocks(text.split('\n'))[0]), parsed), true);
  assert.equal(parsed.rows[0].items[1].height, 410);
});

test("independent heights travel with moved web items and reset without changing native size", () => {
  const block = blockOf(youtube + '\n' + spotify + '\n' + map), model = modelFromBlock(block);
  const sized = setWebHeight(model, { row: 0, index: 1 }, 400);
  const moved = moveItem(sized, { row: 0, index: 1 }, { kind: 'newRow', beforeRow: 1 });
  const reread = modelFromBlock(findV2Blocks(serializeBlock(metaFromModel(moved), rowEmbeds(moved)))[0]);
  assert.equal(reread.rows[1].items[0].height, 400);
  const reset = setWebHeight(reread, { row: 1, index: 0 }, null);
  assert.equal(webHeight(reset.rows[1], reset.rows[1].items[0]), 352);
  assert.equal(scaleRows(reset, 2).rows[1].items[0].height, 704);
});

test("native block removal and layout insertion form an atomic write; stale source cancels both", () => {
  const destination = blockOf(youtube, [{ items: 1 }]);
  const source = spotify + '\n\n' + destination.lines.join('\n'), lines = source.split('\n');
  const taken = takePlainWebFrame(lines, 2)!;
  assert.equal(taken.embed.raw, spotify);
  const block = findV2Blocks(lines)[0];
  const edit = planModelEdit(block, insertItem(modelFromBlock(block), { embed: taken.embed, weight: null, caption: null }, { kind: 'beside', position: { row: 0, index: 0 }, side: 'after' }))!;
  const saved = applyEditsToText(source, [taken.edit, edit]);
  assert.equal(saved.ok, true);
  if (saved.ok) assert.equal(saved.text.split(spotify).length, 2);
  assert.equal(applyEditsToText(source.replace('height="352"', 'height="353"'), [taken.edit, edit]).ok, false);
  assert.equal(takePlainWebFrame(destination.lines, 1), null);
});

test("move-out and merge retain complete multiline source and per-item heights", () => {
  const block = blockOf(youtube + '\n' + spotify + '\n' + map), model = setWebHeight(modelFromBlock(block), { row: 0, index: 1 }, 400);
  const taken = removeItem(model, { row: 0, index: 1 })!;
  const out = planMoveOut(block, taken.model, taken.item.embed)!;
  assert.equal(out.replacement.join('\n').endsWith(spotify), true);
  const second = blockOf(spotify, [{ items: 1 }]);
  const merge = planMergeWithNext([...block.lines, '', ...second.lines], 1)!;
  assert.equal(findV2Blocks(merge.replacement)[0].rows.flatMap(row => row.embeds).length, 4);
});

test("inline HTML attribute media tokens cannot create extra items", () => {
  const raw = '<iframe src="https://example.org" title="![](https://example.org/x.png)"></iframe>';
  assert.equal(readMediaEmbeds(raw, 0).length, 1);
});

test("frame renderer installs only allowed attributes and inherits the host sandbox", async () => {
  const installed: Array<{ tag: string; attr: Record<string, string> }> = [];
  const module = await mockedModule<{ renderWebFrame(el: unknown, embed: unknown): void }>(new URL('../src/view/webEmbed.ts', import.meta.url), {
    '../format/webEmbed.ts': { parseWebFrame }, './mediaControls.ts': { isolateMediaControls() {} }, './messages.ts': { t: () => 'Web embed' },
  });
  const el = { createEl(tag: string, options: { attr: Record<string, string> }) { installed.push({ tag, attr: options.attr }); return {}; } };
  module.renderWebFrame(el, readStandaloneWebFrame(youtube.split('\n'), 0));
  assert.equal(installed[0].tag, 'iframe');
  assert.equal(installed[0].attr.referrerpolicy, 'strict-origin-when-cross-origin');
  assert.ok(installed[0].attr.sandbox.includes('allow-scripts'));
  assert.equal(installed[0].attr.width, undefined);
});

test("wrap transactions preserve surrounding source and refuse stale targets", () => {
  const source = 'Before\n\n' + spotify + '\n\nAfter', lines = source.split('\n');
  const change = planWrapSelection(lines, 2, 2 + spotify.split('\n').length - 1)!;
  const edit = lineChangeEdit(lines, change);
  const saved = applyEditsToText(source, [edit]);
  assert.equal(saved.ok, true);
  if (saved.ok) { assert.ok(saved.text.startsWith('Before\n\n')); assert.ok(saved.text.endsWith('\n\nAfter')); }
  assert.equal(applyEditsToText(source.replace('track/', 'album/'), [edit]).ok, false);
});

test("native HTML widgets map duplicate and adjacent frames to their exact source occurrence", async () => {
  const module = await mockedModule<{ takeNativeWeb(view: unknown, frame: unknown): plain.TakenEmbed | null }>(new URL('../src/view/plainWebEmbeds.ts', import.meta.url), {
    obsidian: {}, '@codemirror/view': {}, '../commands/plans.ts': {}, '../format/v2.ts': format,
    '../layout/plainEmbed.ts': plain, '../layout/writeBack.ts': {}, './messages.ts': {}, './plainDrag.ts': {},
  }, { URL });
  for (const source of [map + ' ' + map, map + '\n' + spotify]) {
    const frames = [0, 1].map(index => ({ src: index === 1 && source.includes('spotify') ? parseWebFrame(spotify)!.url : parseWebFrame(map)!.url,
      closest: () => html }));
    const html = { querySelectorAll: () => frames };
    const view = { posAtDOM: () => 0, state: { doc: { toString: () => source, lineAt: () => ({ number: 1, from: 0 }) } } };
    const first = module.takeNativeWeb(view, frames[0])!, second = module.takeNativeWeb(view, frames[1])!;
    assert.ok(first); assert.ok(second);
    if (source.includes('\n')) assert.ok(second.embed.line > first.embed.line);
    else assert.ok(second.embed.from > first.embed.from);
    frames[1].src = 'https://changed.example.org/';
    assert.equal(module.takeNativeWeb(view, frames[0]), null, 'DOM/source disagreement cancels mapping');
  }
  const source = map + ' ' + map, offset = map.length + 1;
  const frame = { src: parseWebFrame(map)!.url, closest: () => html }, html = { querySelectorAll: () => [frame] };
  const view = { posAtDOM: () => offset, state: { doc: { toString: () => source, lineAt: () => ({ number: 1, from: 0 }) } } };
  assert.equal(module.takeNativeWeb(view, frame)!.embed.from, offset, 'separate HTML widgets on one line keep their own source column');
});

test("iframe gesture shielding is released on Escape, capture loss and normal release", () => {
  for (const end of ['pointerup', 'lostpointercapture', 'Escape']) {
    const listeners = new Map<string, (event: object) => void>(), classes = new Set<string>();
    let cancelled = 0, ended = 0;
    const doc = { body: { addClass: (name: string) => classes.add(name), removeClass: (name: string) => classes.delete(name) },
      addEventListener: (name: string, fn: (event: object) => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) };
    const target = { ownerDocument: doc, setPointerCapture() {}, hasPointerCapture: () => false,
      addEventListener: doc.addEventListener, removeEventListener: doc.removeEventListener };
    trackPointer(target as unknown as HTMLElement, { pointerId: 1 } as PointerEvent,
      { onMove() {}, onEnd() { ended++; }, onCancel() { cancelled++; } });
    assert.equal(classes.has('vml-pointer-tracking'), true);
    if (end === 'Escape') listeners.get('keydown')!({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    else listeners.get(end)!({ pointerId: 1 });
    assert.equal(classes.size, 0); assert.equal(listeners.size, 0);
    assert.equal(cancelled + ended, 1);
  }
});

test("HTML sections spanning closers, adjacent layouts and trailing prose keep each outside line", () => {
  const first = blockOf(map, [{ items: 1 }]), second = blockOf(youtube, [{ items: 1 }]);
  const lines = [...first.lines, 'Text after first.', ...second.lines, '**Text after second.**'];
  const blocks = findV2Blocks(lines);
  const plan = webSectionPlan(lines, blocks, 1, lines.length - 1, 'test')!;
  assert.equal(plan.layouts.length, 1);
  assert.equal(plan.layouts[0].openLine, 4);
  assert.ok(plan.markdown.includes('Text after first.'));
  assert.ok(plan.markdown.endsWith('**Text after second.**'));
  assert.equal(plan.markdown.includes('<iframe'), false);
  assert.equal(plan.markdown.includes('<!-- /vml -->'), false);
  assert.equal(webSectionPlan(lines, blocks, 1, 2, 'test'), null);
});

test("print renders web links without starting external frames or native provider rendering", async () => {
  const links: string[] = [];
  class Element {
    createDiv() { return new Element(); }
    toggleClass() {} addClass() {} setCssProps() {}
    querySelectorAll() { return []; }
  }
  const unexpected = () => { throw new Error('Printing must not load external content'); };
  const module = await mockedModule<{ renderLayout(el: unknown, options: unknown): void }>(new URL('../src/view/layoutView.ts', import.meta.url), {
    obsidian: { MarkdownRenderer: { render: unexpected } }, '../format/v2.ts': format, '../layout/model.ts': models,
    '../layout/viewProjection.ts': {}, '../markdown/textColumns.ts': {}, './crossrefView.ts': {},
    './media.ts': { resolveMedia: () => null }, './mediaControls.ts': {}, './videoSource.ts': {}, './messages.ts': {}, './excalidraw.ts': {},
    './webEmbed.ts': { renderWebFrame: unexpected, renderWebLink: (_el: unknown, embed: format.V2Embed) => links.push(embed.target) },
  });
  const block = blockOf(youtube + '\n' + native, [{ items: 2 }]);
  module.renderLayout(new Element(), { app: {}, sourcePath: 'note.md', model: modelFromBlock(block), editable: false, warning: null, print: true });
  assert.equal(links.length, 2);
});
