import { findV2Blocks } from "../format/v2.ts";
import { markdownTables } from "../markdown/tables.ts";
import type { LineChange } from "../layout/edits.ts";
import { planWrapSelection } from "./plans.ts";

/** Wrap the complete clicked table using the existing text-layout format, independent of the cursor. */
export function planWrapTable(lines: readonly string[], line: number): LineChange | null {
  if (findV2Blocks(lines).some(block => block.openLine <= line && line <= block.closeLine)) return null;
  const table = markdownTables(lines).find(table => table.from <= line && line <= table.to);
  return table ? planWrapSelection(lines, table.from, table.to) : null;
}
