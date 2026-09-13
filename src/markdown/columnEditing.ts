/**
 * Pure parts of typing Markdown in a layout's text column (docs/DESIGN.md, section 4.2): how the
 * note's editor draws each token of Obsidian's Markdown language, and which lines Tab indents as a
 * whole.
 *
 * Obsidian's Markdown language names each token after its styles joined by "_", for example
 * "formatting_formatting-strong_strong" for the ** of bold text. The note's editor gives the token's
 * text the class "cm-" plus each style, and the line it is on each style that starts with "HyperMD-",
 * as it is (measured in Obsidian 1.13.7).
 */

/** How the note's editor draws a token. */
export interface TokenStyle {
  /** Classes of the token's line, such as HyperMD-header-1. */
  line: string[];
  /** Classes of the token's text, such as cm-strong. */
  text: string[];
  /** Whether live preview hides the token on lines without the cursor. */
  hidden: boolean;
}

/**
 * The markers live preview hides on lines without the cursor: those of headings, bold, italic,
 * strikethrough, highlights and inline code. List and task markers, quote markers, links, tags and
 * math stay, as live preview draws those in ways of its own.
 */
const HIDDEN_FORMATTING = new Set([
  "formatting-header",
  "formatting-strong",
  "formatting-em",
  "formatting-strikethrough",
  "formatting-highlight",
  "formatting-code",
]);

export function tokenStyle(name: string): TokenStyle {
  const style: TokenStyle = { line: [], text: [], hidden: false };
  for (const part of name.split("_")) {
    if (part.startsWith("HyperMD-")) {
      style.line.push(part);
    } else if (part !== "") {
      style.text.push(`cm-${part}`);
      style.hidden ||= HIDDEN_FORMATTING.has(part);
    }
  }
  return style;
}

/** Whether `line` is a list item, a task included: Tab indents those as a whole. */
export function isListItem(line: string): boolean {
  return /^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)/.test(line);
}
