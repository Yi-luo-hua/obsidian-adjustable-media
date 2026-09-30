import assert from "node:assert/strict";
import { test } from "node:test";
import { documentSnapshot } from "../src/layout/documentSnapshot.ts";
import { PaneMeasurements, ViewProjection } from "../src/layout/viewProjection.ts";

const origin = { file: {}, branch: {}, path: "note.md" };

test("a render request and host match do not confirm installation or measurement", () => {
  const pane = new ViewProjection();
  pane.request(documentSnapshot("hello", origin));
  pane.viewportChanged([{ from: 0, to: 5 }]);
  assert.equal(pane.phase, "waitingForHost");
  assert.equal(pane.observeHost("old"), false);
  assert.equal(pane.observeHost("hello"), true);
  assert.equal(pane.phase, "projecting");
  const token = pane.token()!;
  assert.equal(pane.measured(token, [{ from: 0, to: 5 }]), false);
  pane.installed(token, [{ from: 0, to: 2 }]);
  assert.equal(pane.phase, "projecting");
  pane.installed(token, [{ from: 2, to: 5 }]);
  assert.equal(pane.phase, "measuring");
  pane.measured(token, [{ from: 0, to: 5 }]);
  assert.equal(pane.phase, "settled");
});

test("a new source event, including undo, rejects old callbacks in just that pane", () => {
  const one = new ViewProjection(), two = new ViewProjection();
  const first = documentSnapshot("old", origin);
  for (const pane of [one, two]) { pane.request(first); pane.observeHost(first.text); }
  const old = one.token()!, other = two.token()!;
  assert.equal(two.accepts(old), false);
  const next = documentSnapshot("new", origin, first);
  one.request(next);
  const undone = documentSnapshot("old", origin, next);
  one.request(undone); one.observeHost("old");
  assert.notEqual(undone.id, first.id);
  assert.equal(one.installed(old, [{ from: 0, to: 3 }]), false);
  assert.equal(two.installed(other, [{ from: 0, to: 3 }]), true);
});

test("viewport callbacks expire without discarding valid dimensions or source coverage", () => {
  const pane = new ViewProjection();
  pane.request(documentSnapshot("abcdef", origin)); pane.observeHost("abcdef");
  pane.viewportChanged([{ from: 0, to: 3 }]);
  const token = pane.token()!;
  pane.installed(token, [{ from: 0, to: 3 }]); pane.measured(token, [{ from: 0, to: 3 }]);
  pane.viewportChanged([{ from: 3, to: 6 }]);
  assert.equal(pane.accepts(token), false);
  assert.deepEqual(pane.measuredCoverage, [{ from: 0, to: 3 }]);
  assert.equal(pane.phase, "projecting");
  pane.environmentChanged();
  assert.deepEqual(pane.coverage, [{ from: 0, to: 3 }]);
  assert.deepEqual(pane.measuredCoverage, []);
});

test("pane, candidate width, render mode and environment isolate measurements", () => {
  const wide = new PaneMeasurements<number>(), narrow = new PaneMeasurements<number>();
  const width720 = wide.key("block", 1, "width=720", "live");
  wide.set(width720, 100);
  assert.equal(narrow.get(narrow.key("block", 1, "width=720", "live")), undefined);
  assert.equal(wide.get(wide.key("block", 1, "width=397", "live")), undefined);
  assert.equal(wide.get(wide.key("block", 1, "width=720", "source")), undefined);
  assert.equal(wide.get(wide.key("copy", 1, "width=720", "live")), undefined);
  wide.environmentChanged();
  assert.equal(wide.get(width720), undefined);
  assert.notEqual(wide.key("block", 1, "width=720", "live"), width720);
});

test("closing a pane permanently rejects its outstanding tasks", () => {
  const pane = new ViewProjection();
  pane.request(documentSnapshot("hello", origin)); pane.observeHost("hello");
  const token = pane.token()!;
  pane.dispose();
  assert.equal(pane.installed(token, [{ from: 0, to: 5 }]), false);
  assert.equal(pane.observeHost("hello"), false);
  assert.equal(pane.token(), null);
});
