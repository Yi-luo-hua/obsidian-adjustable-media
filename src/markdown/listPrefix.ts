/** Match the indentation and marker that the native editor renders before an item's text. */
export function listPrefix(source: string, tabSize: number): { groups: number; spaces: number; marker: string; task: boolean; quoted?: true } | null {
  const inner = source.replace(/^(?: {0,3}>[ \t]?)+/, "");
  const quoted = inner !== source;
  source = inner;
  const match = /^([ \t]*)([-+*]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?/.exec(source);
  if (!match) return null;
  let column = 0;
  for (const char of match[1]) column += char === "\t" ? tabSize - column % tabSize : 1;
  return { groups: Math.floor(column / tabSize), spaces: column % tabSize, marker: match[2], task: !!match[3], ...(quoted ? { quoted: true as const } : {}) };
}
