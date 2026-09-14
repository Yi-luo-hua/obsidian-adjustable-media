/**
 * How a layout's text column is drawn while it is typed in, as live preview draws a note
 * (docs/DESIGN.md, section 4.2), from the tokens of Obsidian's Markdown language.
 *
 * The language names each token after its styles joined by "_", for example
 * "formatting_formatting-strong_strong" for the ** of bold text. The note's editor gives the token's
 * text the class "cm-" plus each style, and the line it is on each style that starts with "HyperMD-",
 * as it is. Live preview then draws some markers in ways of its own (measured in Obsidian 1.13.7):
 * - away from selections, the markers of headings, bold, italic, strikethrough, highlights, inline
 *   code and links are drawn as nothing, so a link shows as its text alone, underlined; quote
 *   markers turn transparent beside the bars drawn for the line; a task's box takes the place of its
 *   list marker and brackets;
 * - heading and quote markers come back while a selection touches the line, the others while one
 *   touches what they mark up;
 * - bullets and numbers are drawn as such whatever the selection.
 * Embeds keep their source: the column's editor draws no media.
 */

/** How the note's editor draws a token. */
export interface TokenStyle {
  /** Classes of the token's line, such as HyperMD-header-1. */
  line: string[];
  /** Classes of the token's text, such as cm-strong. */
  text: string[];
}

export function tokenStyle(name: string): TokenStyle {
  const style: TokenStyle = { line: [], text: [] };
  for (const part of name.split("_")) {
    if (part.startsWith("HyperMD-")) {
      style.line.push(part);
    } else if (part !== "") {
      style.text.push(`cm-${part}`);
    }
  }
  return style;
}

/** A piece of a line, counted from its start. */
export interface Piece {
  from: number;
  to: number;
}

/** A token of Obsidian's Markdown language on a line. */
export interface Token extends Piece {
  name: string;
}

/** How a line is drawn. */
export interface LineStyle {
  /** Classes of the line. */
  line: string[];
  /** Classes of pieces of its text; a piece that lies inside another comes after it. */
  marks: Array<Piece & { classes: string[] }>;
  /** Pieces drawn as nothing. */
  hidden: Piece[];
  /** A task's box, drawn in place of its brackets. */
  task: (Piece & { checked: boolean }) | null;
}

/** The formatting whose markers show while a selection touches the text they mark up. */
const INLINE_MARKERS = ["formatting-strong", "formatting-em", "formatting-strikethrough", "formatting-highlight", "formatting-code"];

interface Item extends Token {
  parts: ReadonlySet<string>;
  hidden: boolean;
  underlined: boolean;
}

/**
 * Draws a line of `text` as live preview does, from its `tokens` in order and the `selections` that
 * touch it (counted from its start, and possibly reaching beyond it). A blank line away from
 * selections gets the class vml-blank-line: the column's editor draws it as high as a paragraph break,
 * as the drawn column does.
 */
export function styleLine(tokens: readonly Token[], text: string, selections: readonly Piece[]): LineStyle {
  const items: Item[] = tokens.map((token) => ({ ...token, parts: new Set(token.name.split("_")), hidden: false, underlined: false }));
  const touched = (from: number, to: number): boolean => selections.some((piece) => piece.from <= to && piece.to >= from);
  const active = selections.length > 0;
  const style: LineStyle = { line: [], marks: [], hidden: [], task: null };

  for (const item of items) {
    for (const name of tokenStyle(item.name).line) {
      if (!style.line.includes(name)) {
        style.line.push(name);
      }
    }
  }
  if (!active && text.trim() === "") {
    style.line.push("vml-blank-line");
  }

  // Headings: the markers show while a selection touches the line.
  for (const item of items) {
    item.hidden ||= !active && item.parts.has("formatting-header");
  }

  // Bold, italic and the like: the markers show while a selection touches what they mark up.
  for (const marker of INLINE_MARKERS) {
    const markers = items.filter((item) => item.parts.has(marker));
    for (let k = 0; k + 1 < markers.length; k += 2) {
      const open = markers[k];
      const close = markers[k + 1];
      if (open && close && !touched(open.from, close.to)) {
        open.hidden = true;
        close.hidden = true;
      }
    }
  }

  // Links: their text alone, underlined, while no selection touches them. Embeds keep their source.
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }
    if (item.parts.has("formatting-link-start")) {
      // [[target]] or [[target|alias]], or an embed: ![[target]].
      const end = items.findIndex((other, j) => j > index && other.parts.has("formatting-link-end"));
      const last = items[end];
      if (end < 0 || !last) {
        continue;
      }
      if (!item.parts.has("formatting-embed") && !touched(item.from, last.to)) {
        for (const inner of items.slice(index, end + 1)) {
          inner.hidden ||= inner === item || inner === last || inner.parts.has("link-has-alias") || inner.parts.has("link-alias-pipe");
          inner.underlined = !inner.hidden;
        }
      }
      index = end;
    } else if (item.parts.has("formatting-link") && item.parts.has("link")) {
      // [text](address)
      const close = items.findIndex((other, j) => j > index && other.parts.has("formatting-link") && other.parts.has("link"));
      const open = items[close + 1];
      const end = items.findIndex((other, j) => j > close + 1 && other.parts.has("formatting-link-string"));
      const last = items[end];
      if (close < 0 || !open?.parts.has("formatting-link-string") || end < 0 || !last) {
        continue;
      }
      if (!touched(item.from, last.to)) {
        items.slice(index, end + 1).forEach((inner, offset) => {
          const isText = offset > 0 && index + offset < close;
          inner.hidden ||= !isText;
          inner.underlined = isText;
        });
      }
      index = end;
    } else if (item.parts.has("url") && !item.parts.has("string")) {
      // An address on its own.
      item.underlined = true;
    }
  }

  // Tasks: a box in place of the list marker and the brackets while no selection touches them.
  const task = items.find((item) => item.parts.has("formatting-task"));
  const list = items.find((item) => item.parts.has("formatting-list"));
  if (task) {
    const start = list && list.from < task.from ? list : task;
    if (!touched(start.from, task.to)) {
      start.hidden = start !== task;
      style.task = { from: task.from, to: task.to, checked: /\[[xX]\]/.test(text.slice(task.from, task.to)) };
    }
  }

  for (const item of items) {
    if (item.hidden || (style.task !== null && item === task)) {
      continue;
    }
    const classes = tokenStyle(item.name).text;
    if (item.underlined) {
      classes.push("cm-underline");
    }
    if (classes.length > 0) {
      style.marks.push({ from: item.from, to: item.to, classes });
    }
  }

  // Bullets and numbers, whatever the selection; on a task's line its box stands for them.
  if (!task && list) {
    if (list.parts.has("formatting-list-ul")) {
      const at = list.from + Math.max(0, text.slice(list.from, list.to).search(/\S/));
      style.marks.push({ from: at, to: at + 1, classes: ["list-bullet"] });
    } else {
      style.marks.push({ from: list.from, to: list.to, classes: ["list-number"] });
    }
  }

  // Quote markers turn transparent away from selections, beside the bars drawn for the line.
  if (!active) {
    let level = 0;
    for (const item of items.filter((candidate) => candidate.parts.has("formatting-quote"))) {
      for (let at = item.from; at < item.to; at += 1) {
        if (text[at] === ">") {
          style.marks.push({ from: at, to: at + 1, classes: level === 0 ? ["cm-transparent"] : ["cm-blockquote-border", "cm-transparent"] });
          level += 1;
        }
      }
    }
  }

  style.hidden = items.filter((item) => item.hidden).map((item) => ({ from: item.from, to: item.to }));
  return style;
}
