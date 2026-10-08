import assert from "node:assert/strict";
import { test } from "node:test";
import { documentSnapshot, latestSnapshotOf, rememberDocumentSnapshot } from "../src/layout/documentSnapshot.ts";
import { PaneMeasurements, ViewProjection, setBounded } from "../src/layout/viewProjection.ts";

const origin = { file: {}, branch: {}, path: "note.md" };

test("a newly pending measurement withdraws prior readiness without fabricating an environment change", () => {
  const pane = new ViewProjection(), snapshot = documentSnapshot("hello", origin);
  pane.request(snapshot); pane.observeHost(snapshot.text); pane.viewportChanged([{ from: 0, to: 5 }]);
  const old = pane.token()!;
  pane.installed(old, pane.required); pane.measured(old, pane.required);
  assert.equal(pane.phase, "settled");
  assert.equal(pane.measurementPending(old), true);
  assert.equal(pane.phase, "measuring");
  assert.equal(pane.environmentEpoch, 0);
  assert.equal(pane.measuredRevision, null);
  pane.environmentChanged();
  assert.equal(pane.measurementPending(old), false);
});

test("clearing the last layout invalidates old callbacks and lets the same pane project a later document", () => {
  const pane = new ViewProjection(), first = documentSnapshot("layout", origin);
  pane.request(first); pane.observeHost(first.text);
  pane.viewportChanged([{ from: 0, to: first.text.length }]);
  const old = pane.token()!;
  pane.installed(old, pane.required); pane.measured(old, pane.required);
  pane.clear();
  assert.equal(pane.desired, null);
  assert.equal(pane.hostRevision, null);
  assert.equal(pane.renderedRevision, null);
  assert.equal(pane.measuredRevision, null);
  assert.equal(pane.accepts(old), false);
  assert.equal(pane.installed(old, [{ from: 0, to: 6 }]), false);
  assert.equal(pane.measured(old, [{ from: 0, to: 6 }]), false);
  assert.deepEqual(pane.required, []);
  const next = documentSnapshot("new layout", origin, first);
  pane.request(next); pane.observeHost(next.text);
  assert.equal(pane.accepts(pane.token()!), true);
});

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

test("a bounded cache keeps its newest entries and drops the oldest", () => {
  const map = new Map<string, number>();
  for (const [index, key] of ["a", "b", "c"].entries()) setBounded(map, key, index, 2);
  assert.deepEqual([...map], [["b", 1], ["c", 2]]);
  // Setting a key again makes it the newest.
  setBounded(map, "b", 10, 2);
  setBounded(map, "d", 3, 2);
  assert.deepEqual([...map], [["b", 10], ["d", 3]]);
  // PaneMeasurements keeps its own limit through the same helper.
  const measurements = new PaneMeasurements<number>();
  for (let index = 0; index < 1005; index++) measurements.set(String(index), index);
  assert.equal(measurements.get("4"), undefined);
  assert.equal(measurements.get("5"), 5);
  assert.equal(measurements.get("1004"), 1004);
});

test("a buffer's latest snapshot with layouts outlives the states that have none", () => {
  const first = documentSnapshot("<!-- vml -->\n![[a.png]]\n<!-- /vml -->", origin);
  rememberDocumentSnapshot({} as never, first);
  assert.equal(latestSnapshotOf(first.lineageId), first);
  // The note emptied as it closes, or its last layout deleted: no snapshot for that state.
  rememberDocumentSnapshot({} as never, null);
  assert.equal(latestSnapshotOf(first.lineageId), first);
  // A later snapshot of the same buffer takes over; another buffer keeps its own.
  const next = documentSnapshot("Text\n<!-- vml -->\n![[a.png]]\n<!-- /vml -->", origin, first);
  assert.equal(next.lineageId, first.lineageId);
  rememberDocumentSnapshot({} as never, next);
  assert.equal(latestSnapshotOf(first.lineageId), next);
  const other = documentSnapshot("<!-- vml -->\n![[b.png]]\n<!-- /vml -->", { file: {}, branch: {}, path: "other.md" });
  rememberDocumentSnapshot({} as never, other);
  assert.equal(latestSnapshotOf(first.lineageId), next);
  assert.equal(latestSnapshotOf("unknown"), null);
});
