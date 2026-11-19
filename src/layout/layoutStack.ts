import { MIN_BLOCK_WIDTH, STACK_MEMBER_KIND, isTextBlock, serializeOpener, type V2Block } from "../format/v2.ts";
import { isEditable, type BlockEdit } from "./edits.ts";
import { planRangeMove } from "./placement.ts";

export interface LayoutStack {
  members: [V2Block, V2Block];
  openLine: number;
  closeLine: number;
  lines: string[];
  id: string;
  width: number;
  offset: number;
}

type Membership = Record<string, unknown> & { id: string; width?: number; offset?: number };

function membership(block: V2Block): Membership | null {
  const { kind, stack } = block.meta.extra;
  if (kind !== STACK_MEMBER_KIND || typeof stack !== "object" || stack === null
    || !("id" in stack) || typeof stack.id !== "string" || stack.id.trim() === "") return null;
  const width = "width" in stack ? stack.width : undefined;
  const offset = "offset" in stack ? stack.offset : undefined;
  if (width !== undefined && (typeof width !== "number" || !(width >= MIN_BLOCK_WIDTH && width <= 1))) return null;
  if (offset !== undefined && (typeof offset !== "number" || !(offset >= 0 && offset <= 1))) return null;
  return { ...stack, id: stack.id, width, offset };
}

/** The prototype groups exactly two adjacent text blocks. Each block keeps its own source range. */
export function layoutStacks(lines: readonly string[], blocks: readonly V2Block[]): LayoutStack[] {
  const byId = new Map<string, Array<{ block: V2Block; settings: Membership }>>();
  for (const block of blocks) {
    const settings = membership(block);
    if (!settings) continue;
    let entries = byId.get(settings.id);
    if (!entries) byId.set(settings.id, entries = []);
    entries.push({ block, settings });
  }
  const stacks: LayoutStack[] = [];
  for (const entries of byId.values()) {
    if (entries.length !== 2) continue;
    const [first, second] = entries;
    const { id, width, offset = 0 } = first.settings;
    if (width === undefined || second.settings.width !== undefined || second.settings.offset !== undefined) continue;
    const members: LayoutStack["members"] = [first.block, second.block];
    if (!members.every(block => isEditable(block) && isTextBlock(block))
      || blocks[blocks.indexOf(first.block) + 1] !== second.block
      || lines.slice(first.block.closeLine + 1, second.block.openLine).some(line => line.trim() !== "")) continue;
    const openLine = first.block.openLine;
    const closeLine = second.block.closeLine;
    stacks.push({ id, width, offset, members, openLine, closeLine,
      lines: lines.slice(openLine, closeLine + 1).map(line => line.replace(/\r$/, "")) });
  }
  return stacks;
}

function stackEdit(stack: LayoutStack, start: number, end: number, replacement: string[]): BlockEdit {
  return { anchorLine: stack.openLine, anchorLines: stack.lines, start, end, replacement };
}

function memberOpener(member: V2Block, stack: Membership | null): string {
  const extra = { ...member.meta.extra };
  if (stack) {
    extra.stack = stack;
    return serializeOpener({ ...member.meta, extra });
  }
  delete extra.kind;
  delete extra.stack;
  return serializeOpener({ rows: member.meta.rows, extra });
}

export function planStackSizing(stack: LayoutStack, width: number, offset = stack.offset): BlockEdit | null {
  if (width === stack.width && offset === stack.offset) return null;
  const owner = stack.members[0];
  const next = memberOpener(owner, { ...membership(owner), id: stack.id, width, offset: offset || undefined });
  return stackEdit(stack, 0, 0, [next]);
}

export function planStackSwap(stack: LayoutStack): BlockEdit {
  const [first, second] = stack.members;
  const gap = stack.lines.slice(first.lines.length, second.openLine - stack.openLine);
  return stackEdit(stack, 0, stack.lines.length - 1, [
    memberOpener(second, membership(first)), ...second.lines.slice(1), ...gap,
    memberOpener(first, membership(second)), ...first.lines.slice(1),
  ]);
}

export function planStackDissolve(stack: LayoutStack): BlockEdit[] {
  return stack.members.map(member => {
    const line = member.openLine - stack.openLine;
    return stackEdit(stack, line, line, [memberOpener(member, null)]);
  });
}

export function insideStack(stacks: readonly LayoutStack[], line: number): boolean {
  return stacks.some(stack => line > stack.openLine && line <= stack.closeLine);
}

export function planStackMove(lines: readonly string[], stack: LayoutStack, line: number): BlockEdit[] {
  const after = line > stack.closeLine && lines.slice(stack.closeLine + 1, line).every(source => source.trim() === "");
  return after || (line >= stack.openLine && line <= stack.closeLine) ? [] : planRangeMove(lines, stack, line);
}
