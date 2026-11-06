interface ParagraphSpace { changes: Array<{ node: Text; before: string; after: string }>; breaks: HTMLElement[]; users: number }
const paragraphs = new WeakMap<HTMLElement, ParagraphSpace>();

/** Preserve editor whitespace without counting the renderer's `<br>\n` separator twice. */
export function alignParagraphWhitespace(section: HTMLElement): () => void {
  const paragraph = section.querySelector<HTMLElement>(":scope > p");
  return paragraph ? alignInlineWhitespace(paragraph) : () => {};
}

/** List rows keep authored whitespace; the renderer's structural final newline is not another row. */
export function alignListWhitespace(row: HTMLElement): () => void {
  const stops = [row, ...Array.from(row.querySelectorAll<HTMLElement>(":scope > p"))].map(el => alignInlineWhitespace(el, true));
  return () => { for (const stop of stops) stop(); };
}

function alignInlineWhitespace(paragraph: HTMLElement, trimEnd = false): () => void {
  let current = paragraphs.get(paragraph);
  if (current) current.users++;
  else {
    const changes: ParagraphSpace["changes"] = [];
    for (const node of Array.from(paragraph.childNodes)) {
      if (node.nodeType !== 3 || node.previousSibling?.nodeName !== "BR" || !node.textContent?.startsWith("\n")) continue;
      const text = node as Text, before = text.data, after = before.slice(1);
      text.data = after; changes.push({ node: text, before, after });
    }
    const last = Array.from(paragraph.childNodes).at(-1);
    if (trimEnd && last?.nodeType === 3 && last.textContent?.endsWith("\n")) {
      const node = last as Text, before = node.data, after = before.slice(0, -1);
      node.data = after; changes.push({ node, before, after });
    }
    // Native preview's hidden formatting widgets allow a break at emphasis/code boundaries.
    const breaks: HTMLElement[] = [];
    for (const inline of Array.from(paragraph.querySelectorAll<HTMLElement>("strong, em, code, a, s, mark"))) {
      if (inline.closest("p") && paragraph.tagName !== "P") continue;
      const before = paragraph.doc.createElement("wbr"), after = paragraph.doc.createElement("wbr");
      inline.before(before); inline.after(after); breaks.push(before, after);
    }
    current = { changes, breaks, users: 1 }; paragraphs.set(paragraph, current);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--current.users > 0) return;
    for (const change of [...current.changes].reverse()) if (change.node.data === change.after) change.node.data = change.before;
    for (const marker of current.breaks) marker.remove();
    paragraphs.delete(paragraph);
  };
}
