/**
 * Pure parts of typing Markdown in a layout's text column (docs/DESIGN.md, section 4.2): what Tab,
 * Enter, Ctrl+B, Ctrl+I and Ctrl+K do there, as in the note's editor. How the text is drawn is in
 * columnStyle.ts.
 */

/** Whether `line` is a list item, a task included: Tab indents those as a whole. */
export function isListItem(line: string): boolean {
  return /^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)/.test(line);
}

/** What Enter puts in on a line of a list or a quote, counted from the line's start. */
export interface LineBreak {
  from: number;
  to: number;
  insert: string;
  /** Where the cursor goes. */
  cursor: number;
}

/** Quote markers, indentation, list marker, the space after it and a task's box. */
const LIST_PREFIX = /^((?:[ \t]*>[ \t]?)*)([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)(\[[ xX]\](?:[ \t]+|$))?/;
const QUOTE_PREFIX = /^(?:[ \t]*>[ \t]?)+/;

/**
 * Enter on `line` with the cursor at `at`, as in the note's editor. A list item or a quote line goes
 * on on the next line with the same markers, the next number and an unchecked box; an empty one ends
 * instead, or moves up a level when it is nested (by one `unit` of indentation). Null for other lines,
 * and for a cursor among the markers, where Enter is an ordinary line break.
 */
export function continueList(line: string, at: number, unit: string): LineBreak | null {
  const item = LIST_PREFIX.exec(line);
  const quote = item ? (item[1] ?? "") : (QUOTE_PREFIX.exec(line)?.[0] ?? null);
  if (quote === null) {
    return null;
  }
  const prefix = item ? item[0] : quote;
  if (at < prefix.length) {
    return null;
  }

  if (line.slice(prefix.length).trim() === "") {
    if (!item) {
      // An empty quote line ends a level of the quote.
      const rest = quote.replace(/>[ \t]?$/, "");
      return { from: 0, to: line.length, insert: rest, cursor: rest.length };
    }
    const indent = item[2] ?? "";
    if (indent !== "") {
      const outdented = indent.endsWith(unit) ? indent.slice(0, -unit.length) : indent.replace(/(?:\t| {1,4})$/, "");
      return { from: quote.length, to: quote.length + indent.length, insert: outdented, cursor: line.length - indent.length + outdented.length };
    }
    return { from: quote.length, to: line.length, insert: "", cursor: quote.length };
  }

  let next = quote;
  if (item) {
    const ordered = /^(\d+)([.)])$/.exec(item[3] ?? "");
    const marker = ordered ? `${Number(ordered[1]) + 1}${ordered[2] ?? "."}` : (item[3] ?? "-");
    next = `${quote}${item[2] ?? ""}${marker}${item[4] || " "}${item[5] ? "[ ] " : ""}`;
  }
  return { from: at, to: at, insert: `\n${next}`, cursor: at + 1 + next.length };
}

/** The markers of one formatting in a column's text, from its syntax tree: openers and closers in turn. */
export interface Span {
  from: number;
  to: number;
}

/** Changes to a column's text, and the selection after them. */
export interface TextChange {
  changes: Array<{ from: number; to: number; insert: string }>;
  anchor: number;
  head: number;
}

/**
 * Ctrl+B and Ctrl+I, as in the note's editor. A selection gets `marker` on both sides, or loses the
 * markers of this formatting just inside or just around it. Without a selection, the formatting the
 * cursor is in loses its markers; otherwise an empty pair goes in with the cursor between, and comes
 * out again on a second press. `markers` are the tokens of this formatting's markers, which decide
 * what is bold or italic, so italic toggled inside bold text never takes the bold markers for its own.
 */
export function toggleFormatting(text: string, from: number, to: number, marker: string, markers: readonly Span[]): TextChange {
  const pairs: Array<[Span, Span]> = [];
  for (let i = 0; i + 1 < markers.length; i += 2) {
    const open = markers[i];
    const close = markers[i + 1];
    if (open && close) {
      pairs.push([open, close]);
    }
  }
  const unwrap = ([open, close]: [Span, Span], anchor: number, head: number): TextChange => ({
    changes: [{ from: open.from, to: open.to, insert: "" }, { from: close.from, to: close.to, insert: "" }],
    anchor,
    head,
  });

  const size = marker.length;
  if (from === to) {
    const inside = pairs.find(([open, close]) => open.to <= from && from <= close.from);
    if (inside) {
      const cursor = from - (inside[0].to - inside[0].from);
      return unwrap(inside, cursor, cursor);
    }
    const emptyPair = text.slice(from - size, from) === marker && text.slice(from, from + size) === marker
      && text[from - size - 1] !== marker[0] && text[from + size] !== marker[0];
    if (emptyPair) {
      return { changes: [{ from: from - size, to: from + size, insert: "" }], anchor: from - size, head: from - size };
    }
    return { changes: [{ from, to: from, insert: marker + marker }], anchor: from + size, head: from + size };
  }

  const around = pairs.find(([open, close]) => (open.to === from && close.from === to) || (open.from === from && close.to === to));
  if (around) {
    return unwrap(around, around[0].from, around[1].from - (around[0].to - around[0].from));
  }
  return { changes: [{ from, to: from, insert: marker }, { from: to, to, insert: marker }], anchor: from + size, head: to + size };
}

/**
 * Ctrl+K, as in the note's editor: the selection becomes a Markdown link's text with the cursor where
 * its address goes, or its address when it is one; without a selection, an empty link.
 */
export function markdownLink(text: string, from: number, to: number): TextChange {
  const selected = text.slice(from, to);
  if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(selected)) {
    return { changes: [{ from, to, insert: `[](${selected})` }], anchor: from + 1, head: from + 1 };
  }
  const cursor = selected === "" ? from + 1 : from + selected.length + 3;
  return { changes: [{ from, to, insert: `[${selected}]()` }], anchor: cursor, head: cursor };
}
