import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { candidateDocument } from "../src/layout/candidateDocument.ts";
import { documentSnapshot } from "../src/layout/documentSnapshot.ts";
import { planModelEdit } from "../src/layout/edits.ts";
import { modelFromBlock, setBlockWidth } from "../src/layout/model.ts";
import { planPlacement } from "../src/layout/placement.ts";

const media = "Before  \n\n<!-- vml -->\n![[A.png|alias|200]]\n<!-- /vml -->\n\nAfter\n";
const cases = [
  { name: "Width rounding", text: media, kind: "width" },
  { name: "CRLF width", text: media.replaceAll("\n", "\r\n"), kind: "width" },
  { name: "EOF with newline", text: media, kind: "move" },
  { name: "EOF without newline", text: media.trimEnd(), kind: "move" },
  { name: "Skip 40", text: media, kind: "skip" },
  { name: "Duplicate instance", text: media + "\n" + media, kind: "duplicate" },
  { name: "Three floats", text: ["left", "left", "right"].map((side, i) =>
    `<!-- vml {"v":2,"wrap":"${side}","width":0.6} -->\n![[${i}.png]]\n<!-- /vml -->`).join("\n\n") + "\n\nBody", kind: "move" },
];
const hash = text => createHash("sha256").update(text).digest("hex");
const samples = cases.map(item => {
  const base = documentSnapshot(item.text, { file: {}, branch: {}, path: item.name + ".md" });
  const index = item.kind === "duplicate" ? 1 : 0, block = base.blocks[index].block;
  const edits = item.kind === "width" || item.kind === "duplicate"
    ? [planModelEdit(block, setBlockWidth(modelFromBlock(block), 1 / 3))]
    : planPlacement(base.lines, block, { line: base.lines.length, wrap: "right", skip: item.kind === "skip" ? 40 : 0 });
  if (!edits || edits.some(edit => edit === null)) throw new Error("Prototype planning failed: " + item.name);
  const result = candidateDocument(base, edits);
  if (!result.ok) throw new Error("Candidate rejected: " + item.name + ": " + result.reason);
  const candidate = result.candidate;
  return { name: item.name, state: candidate.state, backend: candidate.backend, baseHash: hash(base.text),
    candidateHash: hash(candidate.snapshot.text), sourceEdits: candidate.sourceEdits,
    source: base.text, candidate: candidate.snapshot.text,
    blocks: candidate.snapshot.blocks.map(ref => ({ from: ref.from, to: ref.to, openLine: ref.block.openLine,
      width: modelFromBlock(ref.block).width, skip: modelFromBlock(ref.block).skip, wrap: modelFromBlock(ref.block).wrap,
      embeds: ref.block.rows.flatMap(row => row.embeds.map(embed => embed.raw)) })),
    floatCount: candidate.snapshot.relations.floats.length };
});
await writeFile("docs/plans/layout-redesign/probes/w02-source-candidates.json", JSON.stringify({
  scope: "Pure source round-trip. No DOM, host measurement or ready geometry acceptance.",
  samples,
}, null, 2));
process.stdout.write(`${samples.length} source candidates prepared; geometry acceptance pending\n`);
