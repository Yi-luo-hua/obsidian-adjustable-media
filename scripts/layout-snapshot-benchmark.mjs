import { ChangeSet } from "@codemirror/state";
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import os from "node:os";

import { documentSnapshot } from "../src/layout/documentSnapshot.ts";

// Run from the repository root. This measures source-event work, not drag candidates or DOM frames.
const lines = Array.from({ length: 10000 }, (_, index) => index % 10 === 0 ? "" : `Paragraph ${index}`);
for (let index = 0; index < 200; index++) {
  lines.splice(index * 49 + 2, 3,
    `<!-- vml {"v":2,"wrap":"${index % 2 ? "left" : "right"}"} -->`, "![[a.png]]", "<!-- /vml -->");
}
const text = lines.join("\n");
const origin = { file: {}, branch: {}, path: "perf.md" };
const initial = documentSnapshot(text, origin);
const changes = ChangeSet.of({ from: 0, insert: "Prefix\n" }, text.length);
const times = [];
for (let index = 0; index < 25; index++) {
  const start = performance.now();
  documentSnapshot(`Prefix\n${text}`, origin, initial, changes);
  if (index >= 5) times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const result = { node: process.version, cpu: os.cpus()[0].model, lines: lines.length, blocks: initial.blocks.length,
  samples: times.length, p50Ms: times[9], p95Ms: times[18],
  scope: "Snapshot and identity mapping only; not candidate solve or host frame timing" };
fs.writeFileSync("docs/plans/layout-redesign/probes/p1-performance.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
