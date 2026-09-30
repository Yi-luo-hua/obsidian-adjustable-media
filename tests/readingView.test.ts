import assert from "node:assert/strict";
import { test } from "node:test";
import { readingViewHarness } from "./support/readingViewHarness.ts";

const media = '<!-- vml -->\n![[old.png]]\n<!-- /vml -->\n\nBody';

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
