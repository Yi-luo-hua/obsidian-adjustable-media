export interface CursorBlock {
  id: string;
  from: number;
  to: number;
}

export interface CursorRange {
  head: number;
  empty: boolean;
}

/** A selection's head owns the caret; covering a block with its anchor does not activate it. */
export function cursorBlocks(blocks: readonly CursorBlock[], ranges: readonly CursorRange[], placedCursor: boolean,
  focused: boolean, columnId: string | null = null): Set<string> {
  if (!focused) return new Set();
  if (columnId !== null) return new Set(blocks.filter(block => block.id === columnId).map(block => block.id));
  return new Set(blocks.filter(block => ranges.some(range => range.head >= block.from && range.head <= block.to
    && (placedCursor || !range.empty || range.head > 0))).map(block => block.id));
}
