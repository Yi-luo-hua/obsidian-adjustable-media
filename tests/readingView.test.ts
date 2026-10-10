import assert from "node:assert/strict";
import { test } from "node:test";
import { readingViewHarness } from "./support/readingViewHarness.ts";

const media = '<!-- vml -->\n![[old.png]]\n<!-- /vml -->\n\nBody';

test("file-open retires the previous reader before establishing the newly loaded file", async () => {
  const host = await readingViewHarness(media);
  host.section(media); host.frame();
  const previous = host.projection;
  const next = media.replace("old.png", "new.png");
  const count = host.rerenders;
  host.openFile(next);
  assert.notEqual(host.projection, previous);
  assert.equal(host.rerenders, count + 1);
  host.section(next); host.frame();
  assert.equal(host.renders.at(-1), "![[new.png]]");
  assert.equal(host.projection!.phase, "settled");
  host.dispose();
});

test("a new reader adopts its first matching section after the host finishes loading", async () => {
  const next = media.replace("old.png", "new.png");
  const host = await readingViewHarness(media, true, next);
  host.setHost(next);
  host.section(next);
  host.frame();
  assert.deepEqual(host.renders, ["![[new.png]]"]);
  assert.equal(host.projection!.phase, "settled");
  host.dispose();
});

test("the previous loading buffer cannot replace the opened file's exact disk source", async () => {
  const next = media.replace("old.png", "loaded.png");
  const host = await readingViewHarness(media, true, next);
  host.section(media); host.frame();
  assert.deepEqual(host.renders, []);
  host.setHost(next); host.section(next); host.frame();
  assert.equal(host.renders.at(-1), "![[loaded.png]]");
  assert.equal(host.projection!.phase, "settled");
  host.dispose();
});

test("initial host confirmation cannot replace an explicit desired edit", async () => {
  const host = await readingViewHarness(media);
  const next = media.replace("old.png", "desired.png");
  host.edit(next);
  const section = host.section(media);
  host.frame();
  assert.deepEqual(host.renders, []);
  host.setHost(next);
  section.reprocess(next);
  host.tick(); host.frame();
  assert.deepEqual(host.renders, ["![[desired.png]]"]);
  host.dispose();
});

test("retained media sections settle after unrelated body edits without full rerenders", async () => {
  const host = await readingViewHarness(media, false);
  host.section(media);
  const body = host.section(media, 4);
  host.frame();
  assert.equal(host.projection!.phase, "settled");
  for (const text of [media + " more", media + " more text", media]) {
    host.setHost(text); host.edit(text); body.reprocess(text); host.frame();
    assert.equal(host.projection!.phase, "settled");
    assert.deepEqual(host.projection!.coverage, host.projection!.required);
    assert.deepEqual(host.projection!.measuredCoverage, host.projection!.required);
  }
  assert.equal(host.renders.length, 1);
  assert.equal(host.rerenders, 0);
  host.dispose();
});

test("retained duplicate sections use their host positions after an insertion above them", async () => {
  const text = media + "\n\n" + media;
  const host = await readingViewHarness(text, false);
  const sections = [1, 4, 7, 10].map(line => host.section(text, line));
  host.frame();
  const next = "# Intro\n\n" + text;
  host.setHost(next); host.edit(next);
  sections.forEach((section, index) => section.move([3, 6, 9, 12][index]));
  host.frame();
  assert.equal(host.projection!.phase, "settled");
  assert.equal(host.projection!.coverage[0].from, next.indexOf("![[old.png]]"));
  assert.equal(host.projection!.coverage[2].from, next.lastIndexOf("![[old.png]]"));
  assert.deepEqual(host.projection!.coverage, host.projection!.required);
  assert.equal(host.renders.length, 2);
  assert.equal(host.rerenders, 0);
  host.dispose();
});

test("retained EOF sections can gain a following paragraph without changing their source", async () => {
  const host = await readingViewHarness(media, false);
  host.section(media, 4); host.frame();
  const next = media + "\n\nNew paragraph";
  host.setHost(next); host.edit(next); host.frame();
  assert.equal(host.projection!.phase, "settled");
  assert.deepEqual(host.projection!.required, [{ from: media.indexOf("Body"), to: media.length + 1 }]);
  host.dispose();
});

test("retained sections cannot confirm a desired snapshot before their host adopts it", async () => {
  const host = await readingViewHarness(media, false);
  host.section(media); host.frame();
  const next = media + " more";
  host.edit(next); host.frame();
  assert.equal(host.projection!.phase, "waitingForHost");
  assert.deepEqual(host.projection!.coverage, []);
  host.setHost(next); host.tick(); host.frame();
  assert.equal(host.projection!.phase, "settled");
  assert.equal(host.renders.length, 1);
  host.dispose();
});

test("changed media source is not counted until the host section is reprocessed", async () => {
  const host = await readingViewHarness(media, false);
  const section = host.section(media); host.frame();
  const next = media.replace("old.png", "new.png");
  host.setHost(next); host.edit(next); host.frame();
  assert.equal(host.projection!.phase, "projecting");
  assert.deepEqual(host.projection!.coverage, []);
  section.reprocess(next); host.frame();
  assert.equal(host.projection!.phase, "settled");
  assert.deepEqual(host.renders, ["![[old.png]]", "![[new.png]]"]);
  assert.equal(host.rerenders, 0);
  host.dispose();
});

test("unchanged media lines with changed layout settings must be installed again", async () => {
  const host = await readingViewHarness(media, false);
  const section = host.section(media); host.frame();
  const next = media.replace("<!-- vml -->", '<!-- vml {"v":2,"width":0.6} -->');
  host.setHost(next); host.edit(next); host.frame();
  assert.equal(host.projection!.phase, "projecting");
  assert.deepEqual(host.projection!.coverage, []);
  section.reprocess(next); host.frame();
  assert.equal(host.projection!.phase, "settled");
  assert.equal(host.rerenders, 1);
  host.dispose();
});

test("wrap body dependencies prevent stale floats from being counted as installed", async () => {
  const text = media.replace("<!-- vml -->", '<!-- vml {"v":2,"wrap":"right"} -->');
  const host = await readingViewHarness(text, false);
  const section = host.section(text); host.frame();
  const next = text + " more";
  host.setHost(next); host.edit(next); host.frame();
  assert.equal(host.projection!.phase, "projecting");
  assert.deepEqual(host.projection!.coverage, []);
  section.reprocess(next); host.frame();
  assert.equal(host.projection!.phase, "settled");
  assert.equal(host.rerenders, 1);
  host.dispose();
});

test("missing host section info stays pending and retagging preserves section cleanup", async () => {
  const host = await readingViewHarness(media, false);
  const section = host.section(media); host.frame();
  section.setInfoAvailable(false);
  const next = media + " more";
  host.setHost(next); host.edit(next); host.frame();
  assert.equal(host.projection!.phase, "projecting");
  assert.deepEqual(host.projection!.coverage, []);
  section.setInfoAvailable(true); host.scroll(); host.frame();
  assert.equal(host.projection!.phase, "settled");
  section.dispose(); host.scroll(); host.frame();
  assert.deepEqual(host.projection!.required, []);
  host.dispose();
});

test("deleting an earlier media row reinstalls a retained section with its new row settings", async () => {
  const text = '<!-- vml {"v":2,"rows":[{"height":100},{"height":300}]} -->\n![[first.png]]\n\n![[second.png]]\n<!-- /vml -->\n\nBody';
  const host = await readingViewHarness(text, false);
  const section = host.section(text, 3); host.frame();
  assert.deepEqual(host.renderedRows, [[300]]);
  const next = text.replace("![[first.png]]\n\n", "");
  host.setHost(next); host.edit(next); section.move(1); host.frame();
  assert.equal(host.projection!.phase, "projecting");
  assert.deepEqual(host.projection!.coverage, []);
  assert.equal(host.rerenders, 1);
  host.scroll(); host.frame();
  assert.equal(host.rerenders, 1);
  section.reprocess(next); host.frame();
  assert.equal(host.projection!.phase, "settled");
  assert.deepEqual(host.renderedRows, [[300], [100]]);
  host.dispose();
});

test("moving retained media into a different block reinstalls that block's settings", async () => {
  const first = '<!-- vml {"v":2,"rows":[{"height":100}]} -->\n![[first.png]]\n<!-- /vml -->';
  const second = '<!-- vml {"v":2,"rows":[{"height":300}]} -->\n![[second.png]]\n<!-- /vml -->';
  const text = first + "\n\n" + second;
  const host = await readingViewHarness(text, false);
  const section = host.section(text, 5); host.frame();
  assert.deepEqual(host.renderedRows, [[300]]);
  const next = text.replace("first.png", "temp.png").replace("second.png", "first.png").replace("temp.png", "second.png");
  host.setHost(next); host.edit(next); section.move(1); host.frame();
  assert.equal(host.projection!.phase, "projecting");
  assert.equal(host.rerenders, 1);
  section.reprocess(next); host.frame();
  assert.equal(host.projection!.phase, "settled");
  assert.deepEqual(host.renderedRows, [[300], [100]]);
  host.dispose();
});

test("plain reading notes keep host section rendering at startup and on each edit", async () => {
  const host = await readingViewHarness("Body");
  host.section("Body", 0);
  for (const text of ["Body one", "Body two", "Body three"]) { host.setHost(text); host.edit(text); }
  assert.equal(host.rerenders, 0);
  assert.equal(host.counts.observers, 0);
  assert.equal(host.counts.environments, 0);
  assert.equal(host.counts.scrollListeners, 0);
  host.dispose();
});

test("reading confirmation uses one pane lookup per scroll frame and batches stable wrapping classes", async () => {
  const text = media.replace("<!-- vml -->", '<!-- vml {"v":2,"wrap":"right"} -->')
    + "\n" + Array.from({ length: 200 }, (_, index) => `Paragraph ${index}`).join("\n");
  const host = await readingViewHarness(text, false);
  host.section(text);
  for (let line = 4; line < 204; line++) host.section(text, line);
  assert.ok(host.counts.classWrites <= 405);
  host.frame();
  const lookups = host.counts.sectionLookups;
  const classes = host.counts.classWrites;
  host.scroll(); host.frame();
  assert.equal(host.counts.sectionLookups - lookups, 1);
  assert.equal(host.counts.classWrites, classes);
  host.dispose();
});

test("removing the final float clears wrapping classes before retiring the reader", async () => {
  const text = media.replace("<!-- vml -->", '<!-- vml {"v":2,"wrap":"right"} -->');
  const host = await readingViewHarness(text, false);
  const section = host.section(text);
  assert.equal(section.wrapping, true);
  host.setHost("Body"); host.edit("Body");
  assert.equal(section.wrapping, false);
  const observers = host.counts.observers;
  host.section("Body", 0);
  assert.equal(host.counts.observers, observers);
  host.dispose();
});

test("a full layout refresh is consumed before later unrelated body edits", async () => {
  const host = await readingViewHarness(media);
  assert.equal(host.rerenders, 1);
  const resized = media.replace('<!-- vml -->', '<!-- vml {"v":2,"width":0.6} -->');
  host.setHost(resized); host.edit(resized);
  assert.equal(host.rerenders, 2);
  host.setHost(resized + " more"); host.edit(resized + " more");
  assert.equal(host.rerenders, 2);
  host.dispose();
});

test("layout invalidation survives more source events while the host is delayed", async () => {
  const host = await readingViewHarness(media, false);
  host.section(media);
  const resized = media.replace('<!-- vml -->', '<!-- vml {"v":2,"width":0.6} -->');
  host.edit(resized); host.edit(resized + " more"); host.tick();
  assert.equal(host.rerenders, 0);
  host.setHost(resized + " more"); host.tick(); host.tick();
  assert.equal(host.rerenders, 1);
  host.setHost(resized + " next"); host.edit(resized + " next");
  assert.equal(host.rerenders, 1);
  host.dispose();
});

test("an external media section arriving before disk reconciliation is retried", async () => {
  const host = await readingViewHarness(media, false);
  host.section(media);
  const changed = media.replace("old.png", "new.png");
  host.setHost(changed);
  const section = host.section(changed);
  assert.equal(host.renders.length, 1);
  await host.diskChange(changed);
  assert.deepEqual(host.renders, ["![[old.png]]", "![[new.png]]"]);
  assert.equal(host.rerenders, 0);
  assert.equal(section.watchers, 0);
  section.insert();
  assert.equal(host.renders.length, 2);
  host.dispose();
});

test("a pending section is installed only after its own host matches the desired source", async () => {
  const host = await readingViewHarness(media, false);
  host.section(media);
  const changed = media.replace("old.png", "new.png");
  host.section(changed);
  await host.diskChange(changed);
  assert.equal(host.renders.length, 1);
  host.setHost(changed); host.tick();
  assert.deepEqual(host.renders, ["![[old.png]]", "![[new.png]]"]);
  host.dispose();
});

test("destroying a pending section removes it before disk reconciliation", async () => {
  const host = await readingViewHarness(media, false);
  host.section(media);
  const changed = media.replace("old.png", "new.png");
  host.setHost(changed);
  const section = host.section(changed);
  section.dispose();
  await host.diskChange(changed);
  assert.deepEqual(host.renders, ["![[old.png]]"]);
  assert.equal(section.watchers, 0);
  host.dispose();
});

test("unloading an older child on a reused section keeps its newer pending callback", async () => {
  const host = await readingViewHarness(media, false);
  host.section(media);
  const first = media.replace("old.png", "first.png");
  const next = media.replace("old.png", "next.png");
  host.setHost(first);
  const section = host.section(first);
  host.setHost(next);
  section.reprocess(next);
  section.unloadChild(0);
  await host.diskChange(next);
  assert.deepEqual(host.renders, ["![[old.png]]", "![[next.png]]"]);
  assert.equal(section.watchers, 0);
  host.dispose();
});
test("a completed host file-open establishes a reader when initial postprocessing preceded preview mode", async () => {
  const text = '<!-- vml -->\n![[a.png]]\n<!-- /vml -->';
  const harness = await readingViewHarness(text, false);
  assert.equal(harness.projection, undefined);
  harness.fileOpened();
  assert.equal(harness.rerenders, 1);
  const projection = harness.projection!;
  harness.fileOpened();
  assert.equal(harness.projection, projection);
  assert.equal(harness.rerenders, 1);
  harness.section(text, 1); harness.frame();
  assert.deepEqual(harness.renders, ['![[a.png]]']);
  harness.dispose();
});
