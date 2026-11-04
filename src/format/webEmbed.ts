/** Complete iframe source stays in the note; only these attributes reach the rendered frame. */
export interface WebFrame {
  attributes: Record<string, string>;
  url: string;
  width: number | null;
  height: number | null;
}

export const IFRAME_TOKEN = /<iframe\b(?:[^<>"']|"[^"]*"|'[^']*')*>\s*<\/iframe\s*>/gi;
const FRAME_ATTRIBUTES = new Set(["src", "title", "allow", "allowfullscreen", "sandbox", "referrerpolicy", "loading", "name", "credentialless"]);

export function parseWebFrame(raw: string): WebFrame | null {
  const frame = /^<iframe\b((?:[^<>"']|"[^"]*"|'[^']*')*)>\s*<\/iframe\s*>$/i.exec(raw.trim());
  if (!frame) return null;
  const attrs: Record<string, string> = {};
  const pattern = /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
  let cursor = 0;
  while (cursor < frame[1].length) {
    if (frame[1].slice(cursor).trim() === "") break;
    pattern.lastIndex = cursor;
    const attribute = pattern.exec(frame[1]);
    if (!attribute) return null;
    const name = attribute[1].toLowerCase();
    if (!Object.hasOwn(attrs, name)) attrs[name] = decodeAttribute(attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
    cursor = pattern.lastIndex;
  }
  // srcdoc is a separate document, rather than an external-link embed.
  if (Object.hasOwn(attrs, "srcdoc")) return null;
  const url = httpUrl(attrs.src ?? "");
  if (!url) return null;
  return { url, attributes: { ...Object.fromEntries(Object.entries(attrs).filter(([name]) => FRAME_ATTRIBUTES.has(name))), src: url },
    width: pixels(attrs.width), height: pixels(attrs.height) };
}

/** Markdown embeds handled by Obsidian itself, rather than arbitrary links or extensionless images. */
export function isNativeWebEmbed(target: string): boolean {
  const url = httpUrl(target);
  if (!url) return false;
  const { hostname, pathname } = new URL(url);
  const host = hostname.toLowerCase().replace(/^(?:www|m)\./, "");
  return ((host === "youtube.com" || host === "youtube-nocookie.com") && /^\/(?:watch$|embed\/|shorts\/|live\/)/.test(pathname))
    || (host === "youtu.be" && pathname.length > 1)
    || ((host === "twitter.com" || host === "x.com") && /^\/[^/]+\/status\/\d+/.test(pathname));
}

function httpUrl(value: string): string | null {
  const source = value.trim().startsWith("//") ? `https:${value.trim()}` : value.trim();
  if (!/^https?:\/\//i.test(source)) return null;
  try { const url = new URL(source); return url.protocol === "https:" || url.protocol === "http:" ? source : null; }
  catch { return null; }
}

function pixels(value: string | undefined): number | null {
  return value && /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

function decodeAttribute(value: string): string {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (raw: string, entity: string) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? raw;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "\ufffd";
  });
}
