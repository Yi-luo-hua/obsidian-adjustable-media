import type { EditorPosition } from "../editor/editorLike.ts";
import { findV2Blocks, isTextBlock } from "../format/v2.ts";
import { isEditable, planColumnText, type BlockEdit } from "../layout/edits.ts";
import { insertTextColumnBreak } from "../markdown/textColumns.ts";

/** Plan only the current text block's body; writeBack validates its full anchor. */
export function planTextColumnBreak(lines: readonly string[], cursor: EditorPosition): BlockEdit | null {
  const block = findV2Blocks(lines).find((item) => item.openLine < cursor.line && cursor.line < item.closeLine);
  const text = block?.leftText;
  if (!block || !text || !isTextBlock(block) || !isEditable(block) || cursor.line < text.from || cursor.line > text.to) return null;
  const source = text.lines.join("\n");
  const at = text.lines.slice(0, cursor.line - text.from).reduce((offset, line) => offset + line.length + 1, 0) + cursor.ch;
  const result = insertTextColumnBreak(source, at);
  return result ? planColumnText(block, "left", result.text).edit : null;
}
