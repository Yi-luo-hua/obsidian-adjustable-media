import type { ChangeDesc, EditorState } from "@codemirror/state";

import { blockWrap, findV2Blocks, type V2Block } from "../format/v2.ts";
import { blockGaps } from "./placement.ts";
import type { SourceAssertion } from "./sourceAssertions.ts";
import { identifyBlock } from "./blockIdentity.ts";

/** File identity and buffer lineage are distinct from the current path or text. */
export interface DocumentOrigin {
  file: object;
  branch: object;
  path: string;
}

export interface BlockRef {
  id: string;
  contentRevision: number;
  from: number;
  to: number;
  source: string;
  block: V2Block;
}

export interface BodyAnchor {
  id: string;
  line: number;
  offset: number;
  readSet: readonly SourceAssertion[];
}

export interface FloatRun {
  members: readonly string[];
  bodyAnchor: string | null;
}

export interface LayoutRelations {
  /** All floats can influence later body until geometry proves an end. */
  floats: readonly string[];
  /** Blank-adjacent source runs, including same-side members; these are not parallel groups. */
  runs: readonly FloatRun[];
  flowRegions: readonly { blockId: string; bodyAnchor: string | null; endLine: null }[];
}

export interface DocumentSnapshot {
  id: string;
  lineageId: string;
  revision: number;
  origin: DocumentOrigin;
  text: string;
  lines: readonly string[];
  blocks: readonly BlockRef[];
  anchors: readonly BodyAnchor[];
  relations: LayoutRelations;
}

let nextIdentity = 0;
const identity = (kind: string): string => `${kind}:${++nextIdentity}`;
const stateSnapshots = new WeakMap<EditorState, DocumentSnapshot | null>();

export function rememberDocumentSnapshot(state: EditorState, snapshot: DocumentSnapshot | null): void {
  stateSnapshots.set(state, snapshot);
}

export function snapshotForState(state: EditorState): DocumentSnapshot | null {
  return stateSnapshots.get(state) ?? null;
}

/**
 * One confirmed source event, including undo to previously seen text, creates a new snapshot.
 * Transaction ranges identify unchanged instances first. Unmatched, byte-identical moves can
 * then retain identity only when one old and one new instance remain. An ambiguous external
 * replacement creates new instances instead of guessing which duplicate moved.
 */
export function documentSnapshot(text: string, origin: DocumentOrigin, previous?: DocumentSnapshot,
  changes?: ChangeDesc): DocumentSnapshot {
  const sameLineage = previous?.origin.file === origin.file && previous.origin.branch === origin.branch;
  const prior = sameLineage ? previous : undefined;
  const lines = text.split("\n");
  const starts = lineStarts(lines);
  const parsed = findV2Blocks(lines);
  const ranges = parsed.map(block => ({
    block,
    from: starts[block.openLine] ?? 0,
    to: (starts[block.closeLine] ?? 0) + (lines[block.closeLine]?.length ?? 0),
  }));
  const matched = new Map<number, BlockRef>();
  const used = new Set<string>();
  if (prior && changes) {
    for (const ref of prior.blocks) {
      const froms = [changes.mapPos(ref.from, 1), changes.mapPos(ref.from, -1)];
      const tos = [changes.mapPos(ref.to, -1), changes.mapPos(ref.to, 1)];
      const candidates = ranges.flatMap((range, index) => !matched.has(index)
        && froms.includes(range.from) && tos.includes(range.to) ? [index] : []);
      if (candidates.length === 1) {
        matched.set(candidates[0], ref);
        used.add(ref.id);
      }
    }
    // Range mapping accounts for the other copies before matching a moved duplicate.
    for (const ref of prior.blocks.filter(ref => !used.has(ref.id))) {
      const old = prior.blocks.filter(other => !used.has(other.id) && other.source === ref.source);
      const candidates = ranges.flatMap((range, index) => !matched.has(index)
        && text.slice(range.from, range.to) === ref.source ? [index] : []);
      if (old.length === 1 && candidates.length === 1) {
        matched.set(candidates[0], ref);
        used.add(ref.id);
      }
    }
  }
  const blocks = ranges.map((range, index): BlockRef => {
    const ref = matched.get(index);
    const source = text.slice(range.from, range.to);
    const result = { ...range, source, id: ref?.id ?? identity("block"),
      contentRevision: ref ? ref.contentRevision + Number(ref.source !== source) : 1 };
    identifyBlock(result.block, result.id);
    return result;
  });
  const usedAnchors = new Set<string>();
  const mappedAnchors = new Map<number, BodyAnchor[]>();
  if (prior && changes) {
    for (const anchor of prior.anchors) {
      const offset = changes.mapPos(anchor.offset, 1);
      const at = mappedAnchors.get(offset) ?? [];
      at.push(anchor);
      mappedAnchors.set(offset, at);
    }
  }
  const anchors = blockGaps(lines).map((line): BodyAnchor => {
    const offset = starts[line] ?? text.length;
    const candidates = (mappedAnchors.get(offset) ?? []).filter(anchor => !usedAnchors.has(anchor.id));
    const id = candidates.length === 1 ? candidates[0].id : identity("body");
    usedAnchors.add(id);
    const fromLine = Math.max(0, Math.min(line - 1, lines.length - 1));
    return { id, line, offset, readSet: [{ fromLine, lines: lines.slice(fromLine, Math.min(line + 1, lines.length)) }] };
  });
  return { id: identity("snapshot"), lineageId: prior?.lineageId ?? identity("lineage"),
    revision: (prior?.revision ?? 0) + 1, origin: { ...origin }, text, lines, blocks, anchors,
    relations: layoutRelations(lines, blocks, anchors) };
}

/** Conservative P1 invalidation: any source change can alter a wrapped note's body geometry. */
export function layoutDependencies(lines: readonly string[], blocks: readonly V2Block[]): string {
  return blocks.some(block => blockWrap(block) !== null) ? lines.join("\n") : "";
}

function layoutRelations(lines: readonly string[], blocks: readonly BlockRef[], anchors: readonly BodyAnchor[]): LayoutRelations {
  const floats = blocks.filter(ref => blockWrap(ref.block) !== null);
  const runs: Array<{ members: string[]; bodyAnchor: string | null }> = [];
  let previous: BlockRef | undefined;
  for (const ref of floats) {
    const bodyAnchor = anchors.find(anchor => anchor.line > ref.block.closeLine && anchor.line < lines.length
      && !floats.some(other => anchor.line >= other.block.openLine && anchor.line <= other.block.closeLine))?.id ?? null;
    const adjacent = previous !== undefined && lines.slice(previous.block.closeLine + 1, ref.block.openLine).every(line => line.trim() === "");
    const last = runs.at(-1);
    if (adjacent && last) {
      last.members.push(ref.id);
      last.bodyAnchor = bodyAnchor;
    } else {
      runs.push({ members: [ref.id], bodyAnchor });
    }
    previous = ref;
  }
  return { floats: floats.map(ref => ref.id), runs,
    flowRegions: floats.map(ref => ({ blockId: ref.id,
      bodyAnchor: runs.find(run => run.members.includes(ref.id))?.bodyAnchor ?? null, endLine: null })) };
}

function lineStarts(lines: readonly string[]): number[] {
  let offset = 0;
  return lines.map(line => {
    const start = offset;
    offset += line.length + 1;
    return start;
  });
}
