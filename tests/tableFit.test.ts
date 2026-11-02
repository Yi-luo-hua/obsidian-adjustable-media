import assert from "node:assert/strict";
import { test } from "node:test";
import { fitTable, refreshTableFit } from "../src/view/tableFit.ts";

function harness(available: number, natural: number) {
  let measure!: () => void, dispose!: () => void, disconnected = false;
  const observed: unknown[] = [], scales: number[] = [], heights: number[] = [];
  const frames = new Map<number, () => void>();
  let sequence = 0;
  class Observer {
    constructor(callback: () => void) { measure = callback; }
    observe(element: unknown) { observed.push(element); }
    disconnect() { disconnected = true; }
  }
  const viewport = { clientWidth: available, requested: "", style: { getPropertyValue: () => viewport.requested },
    setCssProps: (props: Record<string, string>) => heights.push(parseFloat(props["--vml-table-height"])),
    win: { ResizeObserver: Observer, getComputedStyle: (element: unknown) => ({ height: String(content.naturalHeight), width: String(element === content ? content.offsetWidth : viewport.clientWidth) }),
      requestAnimationFrame(callback: () => void) { frames.set(++sequence, callback); return sequence; },
      cancelAnimationFrame(id: number) { frames.delete(id); } } };
  const content = { offsetWidth: natural, naturalHeight: 90, setCssProps: (props: Record<string, string>) => scales.push(Number(props["--vml-table-scale"])) };
  fitTable(viewport as never, content as never, { register: (fn: () => void) => { dispose = fn; } } as never);
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); };
  return { viewport, content, scales, heights, observed, measure: () => { measure(); flush(); }, notify: () => measure(), flush,
    frames, dispose: () => dispose(), disconnected: () => disconnected };
}

test("a wide table scales to its viewport and responds to narrower and wider panes without enlarging", () => {
  const h = harness(900, 2700);
  assert.deepEqual(h.scales, [899 / 2700]);
  assert.equal(h.heights.at(-1), 90 * 899 / 2700);
  assert.deepEqual(h.observed, [h.viewport, h.content]);
  h.viewport.clientWidth = 450; h.measure();
  assert.equal(h.scales.at(-1), 449 / 2700);
  h.viewport.clientWidth = 1800; h.measure();
  assert.equal(h.scales.at(-1), 1799 / 2700);
  h.viewport.clientWidth = 3000; h.measure();
  assert.equal(h.scales.at(-1), 1);
  assert.equal(h.heights.at(-1), 90);
});

test("manual magnification can enlarge a small table and still shrinks to fit a narrow pane", () => {
  const h = harness(500, 125);
  h.viewport.requested = "2";
  refreshTableFit(h.viewport as never);
  assert.equal(h.scales.at(-1), 2);
  assert.equal(h.heights.at(-1), 180);
  h.viewport.clientWidth = 100; h.measure();
  assert.equal(h.scales.at(-1), 99 / 125);
  h.viewport.clientWidth = 500; h.measure();
  assert.equal(h.scales.at(-1), 2);
  h.viewport.requested = "";
  refreshTableFit(h.viewport as never);
  assert.equal(h.scales.at(-1), 1);
  h.dispose();
  h.viewport.requested = "3";
  refreshTableFit(h.viewport as never);
  assert.equal(h.scales.at(-1), 1);
});

test("small tables stay at their original size and content/font changes trigger fitting", () => {
  const h = harness(900, 125);
  assert.deepEqual(h.scales, []);
  assert.deepEqual(h.heights, [90]);
  h.viewport.clientWidth = 125; h.measure();
  assert.deepEqual(h.scales, [], "a table that fits exactly keeps its original size");
  h.viewport.clientWidth = 900;
  h.content.offsetWidth = 1800; h.measure();
  assert.deepEqual(h.scales, [899 / 1800]);
  h.measure();
  assert.equal(h.scales.length, 1, "a height notification must not cause a resize feedback loop");
  h.content.naturalHeight = 180; h.measure();
  assert.equal(h.heights.at(-1), 180 * 899 / 1800, "new content height updates the space below the table");
  h.notify(); h.notify();
  assert.equal(h.frames.size, 1, "observer callbacks batch into one frame outside ResizeObserver delivery");
  h.flush();
});

test("hidden tables wait for a real width and disposal stops late observer callbacks", () => {
  const h = harness(0, 2700);
  assert.deepEqual(h.scales, []);
  h.viewport.clientWidth = 900; h.measure();
  assert.deepEqual(h.scales, [899 / 2700]);
  h.notify();
  assert.equal(h.frames.size, 1);
  h.dispose();
  assert.equal(h.disconnected(), true);
  assert.equal(h.frames.size, 0, "disposal cancels the scheduled frame");
  h.viewport.clientWidth = 450; h.measure();
  assert.deepEqual(h.scales, [899 / 2700]);
});
