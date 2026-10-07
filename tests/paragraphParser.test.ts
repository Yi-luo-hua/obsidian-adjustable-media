import assert from "node:assert/strict";
import { test } from "node:test";
import { ParagraphParser } from "../src/markdown/paragraphParser.ts";
import { metadataSections } from "../src/markdown/paragraphBreaks.ts";
import { mockedModule } from "./support/mockedModule.ts";
import * as paragraphBreaks from "../src/markdown/paragraphBreaks.ts";

function timers() {
  let next = 0;
  const tasks = new Map<number, () => void>();
  return {
    setTimeout: ((callback: () => void) => { tasks.set(++next, callback); return next; }) as Window["setTimeout"],
    clearTimeout: (id: number | undefined) => { if (id !== undefined) tasks.delete(id); },
    flush: () => { const pending = [...tasks.values()]; tasks.clear(); pending.forEach(task => task()); },
    get pending() { return tasks.size; },
  };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

test("typing coalesces into one worker request; an in-flight old version cannot install", async () => {
  const clock = timers();
  const requests: Array<{ source: string; resolve: (result: string) => void }> = [];
  const installed: string[] = [];
  const parser = new ParagraphParser<string, string>(source => new Promise(resolve => requests.push({ source, resolve })),
    (source, result) => installed.push(`${source}:${result}`), clock);
  parser.request("one"); parser.request("two"); parser.request("three");
  assert.equal(clock.pending, 1);
  clock.flush();
  assert.deepEqual(requests.map(r => r.source), ["three"]);
  parser.request("four"); clock.flush();
  assert.equal(requests.length, 1, "one request at a time per pane");
  requests[0].resolve("obsolete"); await tick();
  assert.deepEqual(installed, []);
  clock.flush();
  assert.deepEqual(requests.map(r => r.source), ["three", "four"]);
  requests[1].resolve("current"); await tick();
  assert.deepEqual(installed, ["four:current"]);
  parser.dispose();
});

test("switching out of live preview and closing a pane cancel pending and late results", async () => {
  for (const close of [false, true]) {
    const clock = timers();
    let finish!: (result: number) => void;
    const installed: number[] = [];
    const parser = new ParagraphParser<object, number>(() => new Promise(resolve => { finish = resolve; }),
      (_source, result) => installed.push(result), clock);
    parser.request({}); clock.flush();
    if (close) parser.dispose(); else parser.request(null);
    finish(1); await tick(); clock.flush();
    assert.deepEqual(installed, []);
    assert.equal(clock.pending, 0);
    parser.dispose();
  }
});

test("buffers and panes are independent even when their text is identical", async () => {
  const clock = timers();
  const a = { text: "same" }, b = { text: "same" };
  const installed: object[] = [];
  const parser = new ParagraphParser<object, null>(async () => null, source => installed.push(source), clock);
  parser.request(a); clock.flush(); parser.request(b);
  await tick(); clock.flush(); await tick();
  assert.deepEqual(installed, [b]);
  parser.dispose();
});

test("host section data rejects missing, fractional, inverted, overlapping and out-of-buffer ranges", () => {
  const section = (from: number, to: number) => ({ type: "paragraph", position: { start: { line: from }, end: { line: to } } });
  for (const metadata of [undefined, {}, { sections: null }, { sections: [null] },
    { sections: [section(-1, 0)] }, { sections: [section(0.5, 1)] }, { sections: [section(2, 1)] },
    { sections: [section(0, 3)] }, { sections: [section(0, 1), section(1, 2)] }]) {
    assert.equal(metadataSections(metadata, 3), null);
  }
  assert.deepEqual(metadataSections({ sections: [section(0, 0), section(2, 2)] }, 3),
    [{ type: "paragraph", from: 0, to: 0 }, { type: "paragraph", from: 2, to: 2 }]);
});

test("the host adapter allocates each transferable buffer and falls back without reading a saved cache", async () => {
  const adapter = await mockedModule<{ parseBufferSections(app: unknown, text: string, lines: number): Promise<unknown> }>(
    new URL("../src/view/obsidianInternals.ts", import.meta.url),
    { obsidian: { MarkdownView: class {} }, "../markdown/paragraphBreaks.ts": paragraphBreaks }, { TextEncoder });
  const buffers: ArrayBuffer[] = [];
  const cache = {
    getFileCache: () => { throw new Error("saved cache must not be used for a buffer"); },
    computeMetadataAsync(buffer: ArrayBuffer) {
      buffers.push(buffer);
      assert.equal(new TextDecoder().decode(buffer), "当前缓冲");
      structuredClone(buffer, { transfer: [buffer] });
      return { sections: [{ type: "paragraph", position: { start: { line: 0 }, end: { line: 0 } } }] };
    },
  };
  const app = { metadataCache: cache };
  for (let n = 0; n < 2; n++) assert.deepEqual(await adapter.parseBufferSections(app, "当前缓冲", 1), [{ type: "paragraph", from: 0, to: 0 }]);
  assert.notEqual(buffers[0], buffers[1]);
  assert.equal(buffers[0].byteLength, 0);
  for (const metadataCache of [{}, { computeMetadataAsync: () => undefined },
    { computeMetadataAsync: () => ({ sections: [{ type: "code", position: { start: { line: 0 }, end: { line: 9 } } }] }) },
    { computeMetadataAsync: () => { throw new Error("worker gone"); } }]) {
    assert.equal(await adapter.parseBufferSections({ metadataCache }, "current", 1), null);
  }
});
