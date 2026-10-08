import { ChangeSet, Text } from "@codemirror/state";

import { bindBlockEdits } from "./blockIdentity.ts";
import { documentSnapshot, type DocumentSnapshot } from "./documentSnapshot.ts";
import { applyEditsToText, planOffsetChanges, type BlockEdit, type EditFailure } from "./edits.ts";
import type { SourceAssertion } from "./sourceAssertions.ts";

export interface CandidateDocument {
  /** Source round-trip only. Geometry must still be measured before a plan can become ready. */
  state: "parsed";
  baseSnapshotId: string;
  backend: "file" | "editor";
  snapshot: DocumentSnapshot;
  sourceEdits: readonly BlockEdit[];
  readSet: readonly SourceAssertion[];
}

/**
 * Read back the exact edits a writer would apply, rather than measuring a pre-serialization model.
 * The detached candidate has its own lineage and is never published as the note's current snapshot.
 */
export function candidateDocument(base: DocumentSnapshot, edits: readonly BlockEdit[],
  readSet: readonly SourceAssertion[] = [], backend: "file" | "editor" = "file"):
  { ok: true; candidate: CandidateDocument } | EditFailure {
  const bound = bindBlockEdits(edits, base.blocks);
  if (!bound.ok) return bound;
  let text: string;
  if (backend === "file") {
    const applied = applyEditsToText(base.text, bound.edits, readSet);
    if (!applied.ok) return applied;
    text = applied.text;
  } else {
    const planned = planOffsetChanges(base.text, bound.edits, readSet);
    if (!planned.ok) return planned;
    text = ChangeSet.of(planned.changes, base.text.length).apply(Text.of(base.text.split("\n"))).toString();
  }
  const snapshot = documentSnapshot(text, { ...base.origin, branch: {} });
  return { ok: true, candidate: { state: "parsed", baseSnapshotId: base.id, backend, snapshot,
    sourceEdits: bound.edits, readSet } };
}
