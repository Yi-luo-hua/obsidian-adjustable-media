interface ParagraphSpace { changes: Array<{ node: Text; before: string; after: string }>; users: number }
const paragraphs = new WeakMap<HTMLElement, ParagraphSpace>();

/** Preserve editor whitespace without counting the renderer's `<br>\n` separator twice. */
export function alignParagraphWhitespace(section: HTMLElement): () => void {
  const paragraph = section.querySelector<HTMLElement>(":scope > p");
  if (!paragraph) return () => {};
  let current = paragraphs.get(paragraph);
  if (current) current.users++;
  else {
    const changes: ParagraphSpace["changes"] = [];
    for (const node of Array.from(paragraph.childNodes)) {
      if (node.nodeType !== 3 || node.previousSibling?.nodeName !== "BR" || !node.textContent?.startsWith("\n")) continue;
      const text = node as Text, before = text.data, after = before.slice(1);
      text.data = after; changes.push({ node: text, before, after });
    }
    current = { changes, users: 1 }; paragraphs.set(paragraph, current);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--current.users > 0) return;
    for (const change of current.changes) if (change.node.data === change.after) change.node.data = change.before;
    paragraphs.delete(paragraph);
  };
}
