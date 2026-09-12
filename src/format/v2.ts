import { scanMarkdownLines, type LineContext } from "../markdown/lineContext.ts";

/**
 * v2 layout format: plain media embeds wrapped in HTML comments.
 *
 *   <!-- vml {"v":2,"rows":[{"height":240,"widths":[1,1.4]}]} -->
 *   ![[a.png]] ![alt](b.png)
 *   <!-- /vml -->
 *
 * Every non-blank body line is one layout row. Settings live in the opening comment and are
 * matched to rows by position. The embeds themselves are never rewritten, only moved verbatim.
 * See docs/DESIGN.md, section 1.
 */

export type MediaKind = "image" | "video";
export type EmbedSyntax = "wiki" | "markdown";
export type Align = "left" | "center" | "right";
export type CaptionAlign = "left" | "center";
export type V2RowMeta = Record<string, unknown>;

export interface V2Meta {
  rows: V2RowMeta[];
  /** Unknown top-level keys, written back unchanged. */
  extra: Record<string, unknown>;
}

export interface V2Embed {
  /** Exact source text of the embed. */
  raw: string;
  syntax: EmbedSyntax;
  /** Path used to find the file: decoded, without subpath, size or title. */
  target: string;
  alt: string;
  kind: MediaKind;
  /** Width written in the embed itself, e.g. the 300 in ![[a.png|300]]. */
  nativeWidth: number | null;
  line: number;
  from: number;
  to: number;
}

export interface V2Row {
  line: number;
  embeds: V2Embed[];
}

export interface V2Block {
  openLine: number;
  closeLine: number;
  /** Exact lines of the block (without \r), used to find and validate it before writing. */
  lines: string[];
  rows: V2Row[];
  meta: V2Meta;
  metaError: string | null;
  /** First body line that is not made of media embeds only. Invalid blocks are left to Obsidian. */
  invalidLine: number | null;
}

export interface ResolvedRow {
  height: number;
  /** One positive weight per embed. */
  widths: number[];
  /** Share of the container width for a single-embed row; null means natural size. */
  width: number | null;
  align: Align;
  captions: Array<string | null>;
  captionAlign: CaptionAlign;
}

export const CLOSE_LINE = "<!-- /vml -->";
export const DEFAULT_ROW_HEIGHT = 220;
export const MIN_ROW_HEIGHT = 80;
export const MAX_ROW_HEIGHT = 900;
export const MAX_EMBEDS_PER_ROW = 4;
export const MIN_BLOCK_WIDTH = 0.2;

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mkv", "mov", "mp4", "ogv", "webm"]);
const OPEN_PATTERN = /^<!-- vml(?:[ \t]+(.*?))?[ \t]*-->[ \t]*$/;
const CLOSE_PATTERN = /^<!-- \/vml -->[ \t]*$/;
// A wiki embed, or a Markdown image whose destination is <...> or allows one level of
// parentheses (e.g. "image (1).png"), followed by an optional title.
const EMBED_PATTERN = /!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(\s*(<[^>\n]*>|(?:[^()\s]|\([^()\s]*\))*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const SIZE_PATTERN = /^(\d+)(?:x\d+)?$/;
const REMOTE_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

export function findV2Blocks(
  lines: readonly string[],
  contexts: readonly LineContext[] = scanMarkdownLines(lines),
): V2Block[] {
  const blocks: V2Block[] = [];
  let open: { line: number; metaText: string | undefined } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripCarriageReturn(lines[index] ?? "");
    if (contexts[index] !== "text") {
      // Code, comments or math inside a block make it a different construct; drop it.
      open = null;
      continue;
    }

    const opening = OPEN_PATTERN.exec(line);
    if (opening) {
      open = { line: index, metaText: opening[1] };
      continue;
    }

    if (open && CLOSE_PATTERN.test(line)) {
      blocks.push(buildBlock(lines, open.line, index, open.metaText));
      open = null;
    }
  }

  return blocks;
}

export function parseMeta(text: string | undefined): { meta: V2Meta; error: string | null } {
  const empty: V2Meta = { rows: [], extra: {} };
  if (text === undefined || text.trim() === "") {
    return { meta: empty, error: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { meta: empty, error: error instanceof Error ? error.message : String(error) };
  }

  if (!isRecord(parsed)) {
    return { meta: empty, error: "Layout settings must be a JSON object" };
  }

  const { v: version, rows, ...extra } = parsed;
  if (version !== undefined && version !== 2) {
    return { meta: empty, error: `Unsupported layout format version: ${JSON.stringify(version)}` };
  }

  return {
    meta: {
      rows: Array.isArray(rows) ? rows.map((row) => (isRecord(row) ? { ...row } : {})) : [],
      extra,
    },
    error: null,
  };
}

export function resolveRow(block: V2Block, rowIndex: number): ResolvedRow {
  return resolveRowMeta(block.meta.rows[rowIndex] ?? {}, block.rows[rowIndex]?.embeds.length ?? 0);
}

/** Applies the tolerance rules (docs/DESIGN.md, section 1.3): anything missing or invalid falls back to a default. */
export function resolveRowMeta(meta: V2RowMeta, embedCount: number): ResolvedRow {
  const settings = readRowMeta(meta, embedCount);

  return {
    height: settings.height ?? DEFAULT_ROW_HEIGHT,
    widths: settings.widths ?? new Array<number>(embedCount).fill(1),
    width: settings.width,
    align: settings.align ?? "center",
    captions: settings.captions ?? new Array<string | null>(embedCount).fill(null),
    captionAlign: settings.captionAlign ?? "left",
  };
}

/** The settings a row actually sets. Missing or invalid values come back as null. */
export interface RowSettings {
  height: number | null;
  widths: number[] | null;
  width: number | null;
  align: Align | null;
  /** Free horizontal position of a single item; takes precedence over align. */
  offset: number | null;
  captions: Array<string | null> | null;
  captionAlign: CaptionAlign | null;
  /** Keys this version does not understand, written back unchanged. */
  extra: V2RowMeta;
}

const ROW_KEYS = new Set(["height", "widths", "width", "align", "offset", "captions", "captionAlign"]);

export function readRowMeta(meta: V2RowMeta, embedCount: number): RowSettings {
  const height = finiteNumber(meta.height);
  const width = finiteNumber(meta.width);
  const offset = finiteNumber(meta.offset);

  return {
    height: height === null ? null : clamp(Math.round(height), MIN_ROW_HEIGHT, MAX_ROW_HEIGHT),
    widths: positiveNumbers(meta.widths, embedCount),
    width: embedCount === 1 && width !== null && width >= 0.1 && width <= 1 ? width : null,
    align: embedCount === 1 && isAlign(meta.align) ? meta.align : null,
    offset: embedCount === 1 && offset !== null && offset >= 0 && offset <= 1 ? offset : null,
    captions: captionList(meta.captions, embedCount),
    captionAlign: meta.captionAlign === "left" || meta.captionAlign === "center" ? meta.captionAlign : null,
    extra: Object.fromEntries(Object.entries(meta).filter(([key]) => !ROW_KEYS.has(key))),
  };
}

/** The block's share of the container width (top-level `width`); null when unset, invalid or full. */
export function readBlockWidth(value: unknown): number | null {
  const width = finiteNumber(value);
  return width !== null && width >= MIN_BLOCK_WIDTH && width < 1 ? width : null;
}

/** Writes the opening comment. Settings are omitted entirely when there are none, to keep the line short. */
export function serializeOpener(meta: V2Meta): string {
  const rows = trimTrailingEmptyRows(meta.rows.map(withoutUndefined));
  if (rows.length === 0 && Object.keys(meta.extra).length === 0) {
    return "<!-- vml -->";
  }

  const json = JSON.stringify({ v: 2, ...meta.extra, rows }, roundNumbers)
    // "--" may only appear inside strings; escaping it keeps the comment from closing early.
    .replace(/--/g, "-\\u002d")
    // An odd number of "%%" would make the whole line read as an Obsidian comment.
    .replace(/%/g, "\\u0025");
  return `<!-- vml ${json} -->`;
}

/** Row text made of the embeds' exact source, separated by single spaces. */
export function serializeRow(embeds: readonly V2Embed[]): string {
  return embeds.map((embed) => embed.raw).join(" ");
}

export function serializeBlock(meta: V2Meta, rows: ReadonlyArray<readonly V2Embed[]>): string[] {
  return [serializeOpener(meta), ...rows.map(serializeRow), CLOSE_LINE];
}

export function mediaKindOf(target: string): MediaKind | null {
  const path = target.split(/[?#]/)[0] ?? target;
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  return null;
}

export function isRemoteTarget(target: string): boolean {
  return REMOTE_PATTERN.test(target);
}

function buildBlock(
  lines: readonly string[],
  openLine: number,
  closeLine: number,
  metaText: string | undefined,
): V2Block {
  const rows: V2Row[] = [];
  let invalidLine: number | null = null;

  for (let line = openLine + 1; line < closeLine; line += 1) {
    const text = stripCarriageReturn(lines[line] ?? "");
    if (text.trim() === "") {
      continue;
    }

    const embeds = readEmbedRow(text, line);
    if (embeds) {
      rows.push({ line, embeds });
    } else {
      invalidLine ??= line;
    }
  }

  const { meta, error } = parseMeta(metaText);
  return {
    openLine,
    closeLine,
    lines: lines.slice(openLine, closeLine + 1).map(stripCarriageReturn),
    rows,
    meta,
    metaError: error,
    invalidLine,
  };
}

/** Returns the embeds of a row, or null when the line holds anything but media embeds. */
export function readEmbedRow(text: string, line: number): V2Embed[] | null {
  const embeds: V2Embed[] = [];
  let leftover = "";
  let cursor = 0;

  for (const match of text.matchAll(EMBED_PATTERN)) {
    const from = match.index ?? 0;
    leftover += text.slice(cursor, from);
    cursor = from + match[0].length;

    const parsed = match[1] !== undefined
      ? { syntax: "wiki" as const, ...parseWikiEmbed(match[1]) }
      : { syntax: "markdown" as const, ...parseMarkdownEmbed(match[2] ?? "", match[3] ?? "") };
    const kind = mediaKindOf(parsed.target);
    if (!kind) {
      return null;
    }
    embeds.push({ raw: match[0], ...parsed, kind, line, from, to: cursor });
  }

  leftover += text.slice(cursor);
  return embeds.length > 0 && leftover.trim() === "" ? embeds : null;
}

function parseWikiEmbed(inner: string): { target: string; alt: string; nativeWidth: number | null } {
  const [path = "", ...options] = inner.split("|");
  return { target: (path.split("#")[0] ?? "").trim(), ...splitSize(options) };
}

function parseMarkdownEmbed(
  altText: string,
  destination: string,
): { target: string; alt: string; nativeWidth: number | null } {
  let path = destination.startsWith("<") && destination.endsWith(">") ? destination.slice(1, -1) : destination;
  if (!isRemoteTarget(path)) {
    path = path.split("#")[0] ?? path;
    try {
      path = decodeURIComponent(path);
    } catch {
      // Not valid percent-encoding: keep the path as written.
    }
  }
  return { target: path.trim(), ...splitSize(altText.split("|")) };
}

function splitSize(parts: string[]): { alt: string; nativeWidth: number | null } {
  const last = parts[parts.length - 1]?.trim() ?? "";
  const size = SIZE_PATTERN.exec(last);
  if (size) {
    return { alt: parts.slice(0, -1).join("|").trim(), nativeWidth: Number(size[1]) };
  }
  return { alt: parts.join("|").trim(), nativeWidth: null };
}

function positiveNumbers(value: unknown, count: number): number[] | null {
  return Array.isArray(value)
    && value.length === count
    && value.every((item) => typeof item === "number" && Number.isFinite(item) && item > 0)
    ? value as number[]
    : null;
}

function captionList(value: unknown, count: number): Array<string | null> | null {
  return Array.isArray(value)
    && value.length === count
    && value.every((item) => item === null || typeof item === "string")
    ? value as Array<string | null>
    : null;
}

function withoutUndefined(row: V2RowMeta): V2RowMeta {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

function trimTrailingEmptyRows(rows: V2RowMeta[]): V2RowMeta[] {
  let end = rows.length;
  while (end > 0 && Object.keys(rows[end - 1] ?? {}).length === 0) {
    end -= 1;
  }
  return rows.slice(0, end);
}

function roundNumbers(_key: string, value: unknown): unknown {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isAlign(value: unknown): value is Align {
  return value === "left" || value === "center" || value === "right";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
