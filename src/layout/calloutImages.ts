import { findV2Blocks, readEmbedRow, readMediaEmbeds, readRowMeta, serializeOpener, type V2Block, type V2Embed } from "../format/v2.ts";
import { scanMarkdownLines } from "../markdown/lineContext.ts";
import { isEditable, type BlockEdit } from "./edits.ts";

export interface CalloutImage {
  embed: V2Embed;
  line: number;
  prefix: string;
  editable: boolean;
  width: number | null;
  block: V2Block | null;
}

export interface CalloutImages {
  from: number;
  lines: string[];
  images: CalloutImage[];
}

const QUOTE = /^((?: {0,3}>[ \t]?)+)(.*)$/;
const CALLOUT = /^\[![^\]]+\][+-]?(?:\s|$)/;

/** Explicitly quoted Callouts. Nested Callouts stay in their outer source range and DOM order. */
export function calloutImages(lines: readonly string[]): CalloutImages[] {
  const contexts = scanMarkdownLines(lines);
  const layouts = findV2Blocks(lines, contexts);
  const result: CalloutImages[] = [];
  for (let from = 0; from < lines.length; from++) {
    const opening = QUOTE.exec(lines[from].replace(/\r$/, ""));
    if (!opening || !CALLOUT.test(opening[2]) || contexts[from] !== "text"
      || layouts.some(block => block.openLine < from && from < block.closeLine)) continue;
    const depth = opening[1].split(">").length - 1;
    let end = from + 1;
    for (; end < lines.length; end++) {
      const next = QUOTE.exec(lines[end].replace(/\r$/, ""));
      if (!next || next[1].split(">").length - 1 < depth) break;
    }
    const raw = lines.slice(from, end).map(line => line.replace(/\r$/, ""));
    const parts = raw.map(line => QUOTE.exec(line)!);
    const body = parts.map(part => part[2]);
    const localContexts = scanMarkdownLines(body);
    const blocks = findV2Blocks(body, localContexts);
    const images: CalloutImage[] = [];
    const layoutStack: number[] = [];
    body.forEach((text, line) => {
      if (localContexts[line] !== "text" || contexts[from + line] !== "text") return;
      if (/^<!-- vml(?:\s|-->)/.test(text)) layoutStack.push(line);
      if (/^<!-- \/vml -->[ \t]*$/.test(text)) layoutStack.pop();
      const tokens = readMediaEmbeds(text.replace(/(`+).*?\1/g, code => " ".repeat(code.length)), from + line);
      for (const embed of tokens.filter(embed => embed.kind === "image")) {
        const block = blocks.find(block => block.openLine < line && line < block.closeLine) ?? null;
        const single = readEmbedRow(text, from + line);
        const own = block !== null && block.meta.extra.scope === "callout-image"
          && block.meta.version !== 3 && block.closeLine === block.openLine + 2
          && block.rows.length === 1 && block.rows[0].embeds.length === 1
          && parts[block.openLine][1] === parts[line][1] && parts[block.closeLine][1] === parts[line][1];
        images.push({ embed, line: from + line, prefix: parts[line][1], block,
          editable: single?.length === 1 && !/^[ \t]/.test(text)
            && (layoutStack.length === 0 || (layoutStack.length === 1 && own && block.openLine === layoutStack[0] && isEditable(block))),
          width: own ? readRowMeta(block.meta.rows[0] ?? {}, 1).width : null });
      }
    });
    result.push({ from, lines: raw, images });
    from = end - 1;
  }
  return result;
}

/** Only settings comments change; the complete quoted embed line is preserved verbatim. */
export function planCalloutImageWidth(source: CalloutImages, image: CalloutImage, width: number): BlockEdit | null {
  if (!image.editable || !Number.isFinite(width)) return null;
  width = Math.round(Math.max(0.1, Math.min(1, width)) * 1000) / 1000;
  if (width === image.width) return null;
  const line = image.line - source.from;
  const opener = serializeOpener(image.block
    ? { ...image.block.meta, rows: [{ ...image.block.meta.rows[0], width }] }
    : { rows: [{ width }], extra: { scope: "callout-image" } });
  return { anchorLine: source.from, anchorLines: source.lines,
    start: image.block ? image.block.openLine : line,
    end: image.block ? image.block.openLine : line,
    replacement: image.block ? [image.prefix + opener]
      : [image.prefix + opener, source.lines[line], image.prefix + "<!-- /vml -->"] };
}
