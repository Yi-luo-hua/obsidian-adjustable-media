import { listPrefix } from "../markdown/listPrefix.ts";

interface PreparedList { rows: HTMLElement[]; users: number; cleanups: Array<() => void> }
const prepared = new WeakMap<HTMLElement, PreparedList>();

/** Let each list paragraph avoid floats separately, without replacing its native content or controls. */
export function wrapReadingLists(section: HTMLElement, collapse?: (event: MouseEvent, indicator: HTMLElement) => void,
  source?: { lines: readonly string[]; from: number; tabSize: number; host: HTMLElement }): () => void {
  const roots = Array.from(section.querySelectorAll<HTMLElement>(":scope > ul, :scope > ol, :scope > blockquote > ul, :scope > blockquote > ol"));
  for (const root of roots) {
    const previous = prepared.get(root);
    if (previous) { previous.users++; continue; }
    const rows: HTMLElement[] = [];
    const cleanups: Array<() => void> = [];
    const widths = new Map<string, { inset: number; bullet: number | null }>();
    const measure: { el: HTMLElement | null } = { el: null };
    const inherited = source ? getComputedStyle(source.host) : null;
    const editorInset = (item: HTMLElement, fallback: number): { inset: number; bullet: number | null } => {
      const relative = Number(item.getAttribute("data-line"));
      const prefix = source && item.hasAttribute("data-line") ? listPrefix(source.lines[source.from + relative] ?? "", source.tabSize) : null;
      if (!prefix) return { inset: fallback, bullet: null };
      const key = JSON.stringify(prefix);
      const known = widths.get(key);
      if (known !== undefined) return known;
      if (!measure.el) {
        // The host also processes detached sections. Measure in the window, with this pane's font.
        measure.el = section.doc.body.createDiv({ cls: "markdown-source-view mod-cm6 is-live-preview cm-s-obsidian mod-ui vml-list-prefix-measure" });
        if (inherited) {
          measure.el.setCssProps({ "--vml-list-font": inherited.font });
          for (const property of ["--list-indent", "--list-indent-editing", "--list-indent-source", "--checkbox-size"]) {
            const value = inherited.getPropertyValue(property);
            if (value) measure.el.setCssProps({ [property]: value });
          }
        }
      }
      const line = measure.el.createDiv({ cls: "cm-line" });
      for (let i = 0; i < prefix.groups; i++) {
        if (prefix.quoted) line.appendText("\u00a0".repeat(source!.tabSize));
        else line.createSpan({ cls: "cm-indent", text: "\u00a0" });
      }
      // Preserve prefix spaces even while Obsidian is still installing this plugin's stylesheet.
      line.appendText("\u00a0".repeat(prefix.spaces));
      const format = line.createSpan({ cls: prefix.quoted ? "cm-quote-1" : `cm-formatting cm-formatting-list cm-formatting-list-${/^\d/.test(prefix.marker) ? "ol" : "ul"}` });
      if (prefix.task) format.createEl("label", { cls: "task-list-label" }).createEl("input", { cls: "task-list-item-checkbox", type: "checkbox" });
      else if (prefix.quoted || /^\d/.test(prefix.marker)) format.appendText(prefix.marker);
      else format.createSpan({ cls: "list-bullet", text: prefix.marker });
      format.appendText("\u00a0");
      const range = section.doc.createRange();
      range.selectNodeContents(line);
      const rect = range.getBoundingClientRect(), fontSize = parseFloat(getComputedStyle(line).fontSize);
      const bullet = format.querySelector<HTMLElement>(".list-bullet")?.getBoundingClientRect();
      const measured = { inset: rect.width / fontSize, bullet: bullet ? (bullet.left + bullet.width / 2 - rect.right) / fontSize : null };
      widths.set(key, measured); line.remove();
      return measured;
    };
    const plans: Array<{ item: HTMLElement; inset: number; bullet: number | null; marker: string; ordinal: number }> = [];
    const visit = (list: HTMLElement, inset: number): void => {
      const style = getComputedStyle(list);
      const padding = (parseFloat(style.paddingInlineStart) || 0) / (parseFloat(style.fontSize) || parseFloat(inherited?.fontSize ?? "16"));
      const items = Array.from(list.children).filter((el): el is HTMLElement => el.instanceOf(HTMLElement) && el.tagName === "LI");
      const first = items[0];
      const prefix = source && first?.hasAttribute("data-line") ? listPrefix(source.lines[source.from + Number(first.getAttribute("data-line"))] ?? "", source.tabSize) : null;
      if (prefix && !prefix.quoted && prefix.groups > 0) {
        list.addClass("vml-rv-list-guided");
        list.setCssProps({ "--vml-guide-level": String(prefix.groups - 1) });
        cleanups.push(() => list.removeClass("vml-rv-list-guided"));
      }
      const reversed = list.hasAttribute("reversed");
      let ordinal = list.hasAttribute("start") ? Number(list.getAttribute("start")) : reversed ? items.length : 1;
      for (const item of items) {
        if (item.hasAttribute("value")) ordinal = Number(item.getAttribute("value"));
        const own = getComputedStyle(item);
        const total = inset + padding + (parseFloat(own.marginInlineStart) || 0) / (parseFloat(own.fontSize) || parseFloat(inherited?.fontSize ?? "16"));
        const marker = own.listStyleType || (list.tagName === "OL" ? "decimal" : list.hasClass("has-list-bullet") ? "none" : "disc");
        plans.push({ item, ...editorInset(item, total), marker, ordinal });
        for (const child of Array.from(item.children)) {
          if (child.instanceOf(HTMLElement) && child.matches("ul, ol")) {
            item.addClass("vml-rv-list-branch");
            cleanups.push(() => item.removeClass("vml-rv-list-branch"));
            visit(child, total);
          }
        }
        ordinal += reversed ? -1 : 1;
      }
    };
    // Measure native indentation before installing the classes that move it into the rows.
    visit(root, 0);
    measure.el?.remove();
    for (const { item, inset, bullet, marker, ordinal } of plans) {
      let row: HTMLElement | null = null;
      let first = true;
      for (const node of Array.from(item.childNodes)) {
        if (node.instanceOf(HTMLElement) && node.matches("ul, ol")) { row = null; continue; }
        if (!row) {
          if (node.nodeType === 3 && !node.textContent?.trim()) continue;
          row = item.createDiv({ cls: "vml-rv-list-row" });
          row.setCssProps({ "--vml-list-inset": `${inset}em`, "--vml-list-type": first ? marker : "none", "--vml-list-ordinal": String(ordinal) });
          if (bullet !== null) row.setCssProps({ "--vml-list-bullet-offset": `${bullet}em` });
          item.insertBefore(row, node);
          rows.push(row);
          first = false;
        }
        row.appendChild(node);
        if (collapse && node.instanceOf(HTMLElement) && node.hasClass("list-collapse-indicator")) {
          const ownRow = row;
          const click = (event: MouseEvent): void => {
            if (event.button !== 0 || event.defaultPrevented) return;
            const next = node.nextSibling;
            // Obsidian delegates clicks to `li > .list-collapse-indicator` and reads its parent.
            // Call the unchanged native handler with that structure, then restore the row synchronously.
            item.insertBefore(node, ownRow);
            try { collapse(event, node); } finally {
              if (node.parentNode === item && ownRow.parentNode === item) ownRow.insertBefore(node, next?.parentNode === ownRow ? next : null);
            }
          };
          node.addEventListener("click", click);
          cleanups.push(() => node.removeEventListener("click", click));
        }
      }
    }
    root.addClass("vml-rv-list");
    prepared.set(root, { rows, users: 1, cleanups });
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    for (const root of roots) {
      const current = prepared.get(root)!;
      if (--current.users > 0) continue;
      for (const cleanup of current.cleanups) cleanup();
      for (const row of current.rows) row.replaceWith(...Array.from(row.childNodes));
      root.removeClass("vml-rv-list");
      prepared.delete(root);
    }
  };
}

