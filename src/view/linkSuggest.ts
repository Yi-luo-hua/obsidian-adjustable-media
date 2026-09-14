import { TFile, parseFrontMatterAliases, prepareFuzzySearch, renderResults, type App, type SearchResult } from "obsidian";
import { EditorSelection, Facet, Prec, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, keymap, type ViewUpdate } from "@codemirror/view";

import { linkQueryAt } from "../markdown/columnEditing.ts";
import { t } from "./messages.ts";
import { obsidianSetting } from "./obsidianInternals.ts";

/**
 * Link suggestions in a text column's editor, as the note's editor makes them (docs/DESIGN.md,
 * section 4.2). Obsidian's own suggestions follow the note's editor only, so the column's editor
 * lists them itself, in the same popup: after [[ come the vault's files, the ones changed last first,
 * then those whose names fit what is typed; after a # come the headings of that note. Enter or a click
 * puts the link in, in the form Obsidian's settings ask for, Tab puts in the name and keeps the list
 * open, and Esc closes it.
 */

interface Source {
  app: App;
  /** The note the column is in, which links are relative to. */
  sourcePath: string;
}

const source = Facet.define<Source, Source | null>({ combine: (values) => values[0] ?? null });

interface Suggestion {
  /** What the list shows. */
  title: string;
  /** Beside it, smaller: a file's folder. */
  note: string;
  /** Which letters of the title fit what is typed. */
  match: SearchResult | null;
  /** A heading's level. */
  level: number | null;
  file: TFile;
  subpath?: string;
  alias?: string;
  /** What Tab puts in for what is typed. */
  completion: string;
}

/** A link being typed, counted in the column's text. */
interface Query {
  /** Where its [[ starts. */
  from: number;
  /** Where what is typed ends: at the cursor. */
  at: number;
  /** Where a chosen link ends: after the ]] that follows the cursor, or at the cursor. */
  to: number;
  text: string;
}

/** As many suggestions as Obsidian's popups show at most. */
const LIMIT = 100;

/** Between the cursor and the popup, as in the note's editor. */
const GAP = 5;

/** The files Obsidian lists while it hides the ones it cannot open. */
const SUPPORTED = new Set([
  "md", "canvas", "base", "pdf",
  "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp",
  "3gp", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav",
  "mkv", "mov", "mp4", "ogv", "webm",
]);

class LinkSuggest {
  private readonly view: EditorView;
  private container: HTMLElement | null = null;
  private suggestions: Suggestion[] = [];
  private selected = -1;
  private query: Query | null = null;
  private readonly onScroll = (): void => this.place();

  constructor(view: EditorView) {
    this.view = view;
  }

  update(update: ViewUpdate): void {
    if (!update.docChanged && !update.selectionSet) {
      return;
    }
    // Typing opens the list; moving the cursor only keeps an open one up to date.
    const typed = update.transactions.some((transaction) => transaction.isUserEvent("input") || transaction.isUserEvent("delete"));
    if (this.container !== null || (update.docChanged && typed)) {
      this.refresh();
    }
  }

  destroy(): void {
    this.close();
  }

  move(step: number): boolean {
    if (this.container === null) {
      return false;
    }
    const count = this.suggestions.length;
    if (count > 0) {
      this.selected = this.selected < 0 ? (step > 0 ? 0 : count - 1) : (this.selected + step + count) % count;
      this.highlight();
    }
    return true;
  }

  /** Enter: puts the chosen link in. With none chosen, Obsidian takes the key and does nothing. */
  choose(): boolean {
    if (this.container === null) {
      return false;
    }
    this.accept(this.selected);
    return true;
  }

  /** Tab: puts the chosen name in for what is typed, and keeps the list open. */
  complete(): boolean {
    if (this.container === null) {
      return false;
    }
    const suggestion = this.suggestions[this.selected];
    const query = this.query;
    if (suggestion && query) {
      const start = query.from + 2;
      this.view.dispatch({
        changes: { from: start, to: query.at, insert: suggestion.completion },
        selection: EditorSelection.cursor(start + suggestion.completion.length),
        userEvent: "input.complete",
      });
    }
    return true;
  }

  dismiss(): boolean {
    if (this.container === null) {
      return false;
    }
    this.close();
    return true;
  }

  /** A # typed after a name puts in the chosen note's name, whose headings come next, as in the note's editor. */
  typed(from: number, to: number, text: string): boolean {
    const query = this.query;
    const suggestion = this.suggestions[this.selected];
    if (text !== "#" || this.container === null || !query || !suggestion || suggestion.level !== null || query.text.includes("#") || from !== query.at || to !== from) {
      return false;
    }
    const start = query.from + 2;
    const insert = `${suggestion.completion}#`;
    this.view.dispatch({
      changes: { from: start, to: query.at, insert },
      selection: EditorSelection.cursor(start + insert.length),
      userEvent: "input.type",
    });
    return true;
  }

  private refresh(): void {
    const { state } = this.view;
    const context = state.facet(source);
    const range = state.selection.main;
    const line = state.doc.lineAt(range.head);
    const found = context !== null && range.empty && state.selection.ranges.length === 1 ? linkQueryAt(line.text, range.head - line.from) : null;
    if (context === null || found === null) {
      this.close();
      return;
    }
    this.query = { from: line.from + found.from, at: range.head, to: line.from + found.to, text: found.text };
    this.suggestions = suggest(context, found.text);
    // As in the note's editor, nothing is chosen before a name is typed.
    this.selected = found.text === "" || this.suggestions.length === 0 ? -1 : 0;
    this.render();
    this.place();
  }

  private render(): void {
    if (this.container === null) {
      this.container = this.view.dom.doc.body.createDiv({ cls: "suggestion-container vml-link-suggest" });
      // A click in the list leaves the focus in the editor, whose typing would end otherwise.
      this.container.addEventListener("mousedown", (event) => event.preventDefault());
      this.view.dom.doc.addEventListener("scroll", this.onScroll, true);
    }
    this.container.empty();
    const list = this.container.createDiv({ cls: "suggestion" });
    if (this.suggestions.length === 0) {
      list.createDiv({ cls: "suggestion-empty", text: t("linkSuggestEmpty") });
    }
    this.suggestions.forEach((suggestion, index) => {
      const item = list.createDiv({ cls: "suggestion-item mod-complex" });
      const content = item.createDiv({ cls: "suggestion-content" });
      const title = content.createDiv({ cls: "suggestion-title" });
      if (suggestion.match) {
        renderResults(title, suggestion.title, suggestion.match);
      } else {
        title.setText(suggestion.title);
      }
      content.createDiv({ cls: "suggestion-note", text: suggestion.note });
      const aux = item.createDiv({ cls: "suggestion-aux" });
      if (suggestion.level !== null) {
        aux.createSpan({ cls: "suggestion-flair", text: `H${suggestion.level}` });
      }
      item.addEventListener("mousemove", () => {
        if (this.selected !== index) {
          this.selected = index;
          this.highlight();
        }
      });
      item.addEventListener("click", () => this.accept(index));
    });
    const instructions = this.container.createDiv({ cls: "prompt-instructions" });
    for (const [command, purpose] of [[t("linkSuggestHeadingKey"), t("linkSuggestHeading")], [t("linkSuggestDisplayKey"), t("linkSuggestDisplay")]]) {
      const instruction = instructions.createDiv({ cls: "prompt-instruction" });
      instruction.createSpan({ cls: "prompt-instruction-command", text: command });
      instruction.createSpan({ text: purpose });
    }
    this.highlight();
  }

  private highlight(): void {
    if (this.container === null) {
      return;
    }
    const items = Array.from(this.container.querySelectorAll<HTMLElement>(".suggestion-item"));
    items.forEach((item, index) => item.toggleClass("is-selected", index === this.selected));
    items[this.selected]?.scrollIntoView({ block: "nearest" });
  }

  /** Puts the list under the cursor, or over it when there is no room below. */
  private place(): void {
    const container = this.container;
    const query = this.query;
    if (container === null || query === null) {
      return;
    }
    this.view.requestMeasure({
      key: this,
      read: (view) => ({
        caret: view.coordsAtPos(query.at),
        width: container.offsetWidth,
        height: container.offsetHeight,
        room: { width: container.win.innerWidth, height: container.win.innerHeight },
      }),
      write: ({ caret, width, height, room }) => {
        if (!caret) {
          return;
        }
        const left = Math.max(0, Math.min(caret.left, room.width - width));
        const below = caret.bottom + GAP;
        const top = below + height > room.height && caret.top - GAP - height >= 0 ? caret.top - GAP - height : below;
        container.setCssProps({ "--vml-suggest-left": `${left}px`, "--vml-suggest-top": `${top}px` });
      },
    });
  }

  private accept(index: number): void {
    const suggestion = this.suggestions[index];
    const query = this.query;
    const context = this.view.state.facet(source);
    if (!suggestion || !query || !context) {
      return;
    }
    const link = context.app.fileManager.generateMarkdownLink(suggestion.file, context.sourcePath, suggestion.subpath, suggestion.alias);
    this.close();
    this.view.dispatch({
      changes: { from: query.from, to: query.to, insert: link },
      selection: EditorSelection.cursor(query.from + link.length),
      scrollIntoView: true,
      userEvent: "input.complete",
    });
  }

  private close(): void {
    if (this.container !== null) {
      this.view.dom.doc.removeEventListener("scroll", this.onScroll, true);
      this.container.remove();
      this.container = null;
    }
    this.query = null;
    this.suggestions = [];
    this.selected = -1;
  }
}

const suggestions = ViewPlugin.fromClass(LinkSuggest);

/** Link suggestions for a column's editor in the note at `sourcePath`, with their keys. */
export function linkSuggest(app: App, sourcePath: string): Extension {
  const run = (act: (plugin: LinkSuggest) => boolean) => (view: EditorView): boolean => {
    const plugin = view.plugin(suggestions);
    return plugin ? act(plugin) : false;
  };
  return [
    source.of({ app, sourcePath }),
    suggestions,
    Prec.highest(keymap.of([
      { key: "ArrowDown", run: run((plugin) => plugin.move(1)) },
      { key: "ArrowUp", run: run((plugin) => plugin.move(-1)) },
      { key: "Enter", run: run((plugin) => plugin.choose()) },
      { key: "Tab", run: run((plugin) => plugin.complete()) },
      { key: "Escape", run: run((plugin) => plugin.dismiss()) },
    ])),
    EditorView.inputHandler.of((view, from, to, text) => view.plugin(suggestions)?.typed(from, to, text) ?? false),
  ];
}

/** Closes the link suggestions open in `view`; false when there are none. */
export function closeLinkSuggest(view: EditorView): boolean {
  return view.plugin(suggestions)?.dismiss() ?? false;
}

function suggest(context: Source, text: string): Suggestion[] {
  const hash = text.indexOf("#");
  return hash >= 0 ? headingSuggestions(context, text.slice(0, hash), text.slice(hash + 1)) : fileSuggestions(context, text.trim());
}

function fileSuggestions({ app, sourcePath }: Source, text: string): Suggestion[] {
  const all = obsidianSetting(app, "showUnsupportedFiles", false);
  const files = app.vault.getFiles().filter((file) => all || SUPPORTED.has(file.extension.toLowerCase()));
  if (text === "") {
    return files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, LIMIT).map((file) => fileSuggestion(app, sourcePath, file));
  }
  const search = prepareFuzzySearch(text);
  const found: Suggestion[] = [];
  for (const file of files) {
    const suggestion = fileSuggestion(app, sourcePath, file);
    const match = search(suggestion.title);
    if (match) {
      found.push({ ...suggestion, match });
    }
    const aliases = file.extension === "md" ? parseFrontMatterAliases(app.metadataCache.getFileCache(file)?.frontmatter ?? null) ?? [] : [];
    for (const alias of aliases) {
      const aliasMatch = search(alias);
      if (aliasMatch) {
        found.push({ ...suggestion, title: alias, note: file.basename, match: aliasMatch, alias });
      }
    }
  }
  return found.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0)).slice(0, LIMIT);
}

function fileSuggestion(app: App, sourcePath: string, file: TFile): Suggestion {
  return {
    title: file.extension === "md" ? file.basename : file.name,
    note: file.parent && !file.parent.isRoot() ? `${file.parent.path}/` : "",
    match: null,
    level: null,
    file,
    completion: app.metadataCache.fileToLinktext(file, sourcePath, true),
  };
}

/** The headings of the note `name` links to (this note without a name) that fit `text`. */
function headingSuggestions({ app, sourcePath }: Source, name: string, text: string): Suggestion[] {
  const file = name === "" ? app.vault.getAbstractFileByPath(sourcePath) : app.metadataCache.getFirstLinkpathDest(name, sourcePath);
  if (!(file instanceof TFile)) {
    return [];
  }
  const search = text.trim() === "" ? null : prepareFuzzySearch(text.trim());
  const found: Suggestion[] = [];
  for (const heading of app.metadataCache.getFileCache(file)?.headings ?? []) {
    const match = search ? search(heading.heading) : null;
    if (search && !match) {
      continue;
    }
    found.push({
      title: heading.heading,
      note: "",
      match,
      level: heading.level,
      file,
      subpath: `#${heading.heading}`,
      completion: `${name}#${heading.heading}`,
    });
  }
  if (search) {
    found.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
  }
  return found.slice(0, LIMIT);
}
