import { MarkdownView, editorLivePreviewField, type App, type MarkdownPostProcessorContext, type Plugin } from "obsidian";
import { Prec, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from "@codemirror/view";

import {
  EMPTY_REF_INDEX,
  captionText,
  captionParagraphStart,
  collectRefs,
  equationLabels,
  mayHaveRefs,
  numberMarkdown,
  refText,
  type RefIndex,
  type RefLanguage,
} from "../markdown/crossref.ts";
import { scanMarkdownLines, type LineContext } from "../markdown/lineContext.ts";
import { drawMath } from "./math.ts";
import { sectionNoteText } from "./noteText.ts";
import { currentLanguage } from "./messages.ts";

/**
 * Numbered figures, tables and equations, and references to them (crossref.ts), as the note shows
 * them: in reading view and live preview, in the note's own text and in the text of layouts. Nothing
 * is written: the note keeps its labels, which pandoc-crossref reads.
 */

export type RefLanguageSetting = "auto" | RefLanguage;

let languageSetting: () => RefLanguageSetting = () => "auto";

export function setRefLanguage(setting: () => RefLanguageSetting): void {
  languageSetting = setting;
}

/** The language numbers are written in: the setting's, or Obsidian's. */
export function refLanguage(): RefLanguage {
  const setting = languageSetting();
  if (setting !== "auto") {
    return setting;
  }
  return currentLanguage();
}

/** What a layout's text needs to be drawn with its numbers. */
export interface RefContext {
  index: RefIndex;
  language: RefLanguage;
}

let lastText: string | null = null;
let lastIndex: RefIndex = EMPTY_REF_INDEX;

/** The numbered targets of a note with the text `text`; the last one is kept, as a note is drawn a piece at a time. */
export function refIndexOf(text: string): RefIndex {
  if (text !== lastText) {
    lastText = text;
    lastIndex = mayHaveRefs(text) ? collectRefs(text.split("\n")) : EMPTY_REF_INDEX;
  }
  return lastIndex;
}

export function refContextOf(text: string): RefContext {
  return { index: refIndexOf(text), language: refLanguage() };
}

/** Markdown to draw, with its numbers. */
export function numbered(markdown: string, refs: RefContext | undefined): string {
  return refs ? numberMarkdown(markdown, refs.index, refs.language) : markdown;
}

/**
 * Once `markdown`, numbered, is drawn in `el`: the paragraphs that are captions get their class, and
 * the equations with labels their label, for references to find them. Paragraphs of an image alone
 * are figures; a caption stays in the same column as the figure, table or equation next to it
 * (styles.css), which is marked for that.
 */
export function markCaptions(el: HTMLElement, markdown: string): void {
  for (const paragraph of Array.from(el.querySelectorAll<HTMLElement>(":scope > p"))) {
    const only = paragraph.children.length === 1 ? paragraph.firstElementChild : null;
    if (only?.hasClass("internal-embed") && paragraph.textContent?.trim() === "") {
      paragraph.addClass("vml-figure");
    }
  }
  for (const label of Array.from(el.querySelectorAll<HTMLElement>(".vml-caption-label"))) {
    const caption = label.parentElement;
    if (!caption) {
      continue;
    }
    caption.addClass("vml-caption");
    const before = caption.previousElementSibling;
    const after = caption.nextElementSibling;
    if (before && isFloatBody(before)) {
      before.addClass("vml-keep-with-next");
    } else if (after && isFloatBody(after)) {
      caption.addClass("vml-keep-with-next");
    }
  }
  if (!mayHaveRefs(markdown)) {
    return;
  }
  const labels = equationLabels(markdown);
  Array.from(el.querySelectorAll<HTMLElement>(".math-block")).forEach((math, index) => {
    const label = labels[index];
    if (label) {
      math.setAttr("data-vml-label", label);
    }
  });
}

/** What a caption goes with: a figure, a table or an equation. */
function isFloatBody(el: Element): boolean {
  return el.hasClass("vml-figure") || el.hasClass("math-block") || el.tagName === "TABLE" || el.querySelector(":scope > table, :scope > .math-block") !== null;
}

const TOKEN = /\{#((?:fig|tbl):[\w.:-]+)\}|(^|[^\w@\\/])@((?:fig|tbl|eq):(?:[A-Za-z0-9_][\w.:-]*[\w-]|[A-Za-z0-9_]))/g;
const EQUATION_LABEL = /\\label\{(eq:[\w.:-]+)\}/;

/**
 * Reading view, and follow-ups to references anywhere. The sections of the note's own text get their
 * numbers here; a layout's text is numbered before it is drawn (layoutView.ts).
 */
export function registerCrossrefs(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor((el, ctx) => numberSection(plugin.app, el, ctx));

  plugin.registerDomEvent(activeDocument, "click", (event) => {
    const ref = event.target instanceof Element ? event.target.closest<HTMLElement>(".vml-ref") : null;
    const id = ref?.dataset.vmlRef;
    if (!ref || !id || ref.hasClass("is-unresolved")) {
      return;
    }
    const view = plugin.app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((candidate): candidate is MarkdownView => candidate instanceof MarkdownView && candidate.containerEl.contains(ref));
    const target = view ? refIndexOf(view.getViewData()).targets.get(id) : undefined;
    if (!view || !target) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    goTo(view, target.id, target.line);
  }, { capture: true });
}

/**
 * Shows the target of a reference in the middle of the view, the cursor left where it is: in live
 * preview, a cursor in a layout would show the layout's source. A target not drawn yet is scrolled to
 * by its line first.
 */
function goTo(view: MarkdownView, id: string, line: number): void {
  const find = (): HTMLElement | null => view.containerEl.querySelector<HTMLElement>(`[data-vml-label="${CSS.escape(id)}"]`);
  const drawn = find();
  if (drawn) {
    drawn.scrollIntoView({ block: "center" });
    return;
  }
  const editor = (view.editor as unknown as { cm?: EditorView }).cm;
  if (view.getMode() === "source" && editor) {
    const pos = editor.state.doc.line(Math.min(line + 1, editor.state.doc.lines)).from;
    editor.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  } else {
    view.setEphemeralState({ line });
  }
  // Drawn now, the target itself goes to the middle.
  window.setTimeout(() => find()?.scrollIntoView({ block: "center" }), 150);
}

function numberSection(app: App, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
  const info = ctx.getSectionInfo(el);
  // CodeMirror renders callouts through MarkdownRenderer without section offsets.
  if (!info && el.closest(".cm-callout")) {
    // The same file open in several panes shares one buffer, so the first matching view yields the
    // same numbering as the view that triggered this post-processor.
    const view = app.workspace.getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .find((candidate): candidate is MarkdownView => candidate instanceof MarkdownView && candidate.file?.path === ctx.sourcePath);
    if (view) {
      numberCallout(el, refContextOf(view.getViewData()));
    }
    return;
  }
  const text = info ? sectionNoteText(app, ctx, info) : "";
  if (!info || !mayHaveRefs(text) || el.querySelector(".vml-layout")) {
    return;
  }
  const lines = text.split("\n");
  const own = lines.slice(info.lineStart, info.lineEnd + 1).join("\n");
  if (!mayHaveRefs(own)) {
    return;
  }
  const refs = refContextOf(text);
  const math = el.querySelector<HTMLElement>(".math-block");
  const source = mathSource(own);
  const label = source === null ? undefined : EQUATION_LABEL.exec(source)?.[1];
  if (math && source !== null && label !== undefined) {
    const tagged = numbered(`$$\n${source}\n$$`, refs).split("\n").slice(1, -1).join("\n");
    math.setAttr("data-vml-label", label);
    if (tagged !== source) {
      drawMath(math, tagged, true);
    }
    return;
  }
  numberTextNodes(el, refs);
}

/** The TeX of a section that is one display equation, or null. */
function mathSource(section: string): string | null {
  const trimmed = section.trim();
  return trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length >= 4 ? trimmed.slice(2, -2).trim() : null;
}

/** Reads references and caption labels out of the drawn text of `el`, code aside. */
function numberTextNodes(el: HTMLElement, refs: RefContext): void {
  const walker = el.doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (parent && !parent.closest("code, pre, .math, .vml-ref, .vml-caption-label") && TOKEN.test(node.data)) {
      nodes.push(node);
    }
    TOKEN.lastIndex = 0;
  }
  for (const node of nodes) {
    const parts = node.data.split(TOKEN);
    const fragment = createFragment();
    let caption: string | null = null;
    // split() gives the text, then each match's three groups, in turn.
    for (let at = 0; at < parts.length; at += 4) {
      const text = parts[at] ?? "";
      const label = parts[at + 1];
      const before = parts[at + 2];
      const ref = parts[at + 3];
      fragment.appendText(label !== undefined ? text.replace(/[ \t]+$/, "") : text);
      if (label !== undefined) {
        caption ??= refs.index.targets.has(label) ? label : null;
        if (!refs.index.targets.has(label)) {
          fragment.appendText(`{#${label}}`);
        }
      } else if (ref !== undefined) {
        fragment.appendText(before ?? "");
        const target = refs.index.targets.get(ref);
        fragment.createSpan({
          cls: target ? "vml-ref" : "vml-ref is-unresolved",
          text: target ? refText(target, refs.language) : "??",
          attr: { "data-vml-ref": ref },
        });
      }
    }
    const block = node.parentElement?.closest<HTMLElement>("p, li, td, th, figcaption, div") ?? null;
    node.replaceWith(fragment);
    const target = caption ? refs.index.targets.get(caption) : undefined;
    if (block && target && !block.querySelector(":scope > .vml-caption-label")) {
      block.addClass("vml-caption");
      const labelEl = createSpan({ cls: "vml-caption-label", text: captionText(target, refs.language), attr: { "data-vml-label": target.id } });
      block.prepend(labelEl, " ");
    }
  }
}

interface CrossrefState {
  index: RefIndex;
  contexts: LineContext[];
  decorations: DecorationSet;
}

function numberCallout(el: HTMLElement, refs: RefContext): void {
  numberTextNodes(el, refs);
  // An unchanged callout widget can survive edits to labels elsewhere in the note.
  for (const ref of Array.from(el.querySelectorAll<HTMLElement>(".vml-ref"))) {
    const target = refs.index.targets.get(ref.dataset.vmlRef ?? "");
    const text = target ? refText(target, refs.language) : "??";
    if (ref.textContent !== text) {
      ref.setText(text);
    }
    ref.toggleClass("is-unresolved", !target);
  }
  for (const label of Array.from(el.querySelectorAll<HTMLElement>(".vml-caption-label"))) {
    const target = refs.index.targets.get(label.dataset.vmlLabel ?? "");
    if (target) {
      const text = captionText(target, refs.language);
      if (label.textContent !== text) {
        label.setText(text);
      }
    }
  }
}

/**
 * Live preview: references and caption labels in the note's own text show their numbers, and an
 * equation with a label shows its tag, until the selection touches them.
 */
export function crossrefExtension(): Extension {
  // Above Obsidian's own drawing of equations.
  const field = StateField.define<CrossrefState>({
    create: (state) => decorate(state, scan(state)),
    update(value, tr) {
      const modeChanged = tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false);
      if (tr.docChanged || modeChanged) {
        return decorate(tr.state, scan(tr.state));
      }
      return tr.selection ? decorate(tr.state, value) : value;
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });
  return [Prec.high(field), ViewPlugin.define((view) => {
    let destroyed = false;
    let pending = false;
    const refresh = (): void => {
      if (pending) {
        return;
      }
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (destroyed || !view.state.field(editorLivePreviewField, false)) {
          return;
        }
        const refs = { index: view.state.field(field).index, language: refLanguage() };
        for (const callout of Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".cm-callout .callout"))) {
          numberCallout(callout, refs);
        }
      });
    };
    refresh();
    return {
      // Callout numbering only changes when the document does: a callout that scrolls into view is
      // numbered by the numberSection post-processor, and cursor moves never renumber. Refreshing on
      // every transaction would walk all callouts on each keystroke and arrow press.
      update: (update) => { if (update.docChanged) refresh(); },
      destroy: () => { destroyed = true; },
    };
  })];
}

function scan(state: EditorState): Omit<CrossrefState, "decorations"> {
  // Source mode shows the labels as written.
  if (!state.field(editorLivePreviewField, false)) {
    return { index: EMPTY_REF_INDEX, contexts: [] };
  }
  const text = state.doc.toString();
  if (!mayHaveRefs(text)) {
    return { index: EMPTY_REF_INDEX, contexts: [] };
  }
  const lines = text.split("\n");
  const contexts = scanMarkdownLines(lines);
  return { index: collectRefs(lines, contexts), contexts };
}

function decorate(state: EditorState, scanned: Omit<CrossrefState, "decorations">): CrossrefState {
  const { index, contexts } = scanned;
  if (contexts.length === 0) {
    return { ...scanned, decorations: Decoration.none };
  }
  const language = refLanguage();
  const ranges: Array<Range<Decoration>> = [];
  const touched = (from: number, to: number): boolean => state.selection.ranges.some((range) => range.from <= to && range.to >= from);
  const { doc } = state;
  const captions = new Set<number>();
  const lines = doc.toString().split("\n");

  for (let at = 0; at < contexts.length; at += 1) {
    const line = doc.line(at + 1);
    if (contexts[at] === "math") {
      let end = at;
      const opening = line.text.trim();
      if (!(opening.length >= 4 && opening.slice(2).includes("$$"))) {
        while (end + 1 < contexts.length && contexts[end + 1] === "math") {
          end += 1;
          if (doc.line(end + 1).text.trimEnd().endsWith("$$")) {
            break;
          }
        }
      }
      const last = doc.line(end + 1);
      const source = mathSource(doc.sliceString(line.from, last.to));
      const label = source === null ? undefined : EQUATION_LABEL.exec(source)?.[1];
      if (source !== null && label !== undefined && !touched(line.from, last.to)) {
        const tagged = numberMarkdown(`$$\n${source}\n$$`, index, language).split("\n").slice(1, -1).join("\n");
        if (tagged !== source) {
          ranges.push(Decoration.replace({ block: true, widget: new MathWidget(tagged, label) }).range(line.from, last.to));
        }
      }
      at = end;
      continue;
    }
    if (contexts[at] !== "text" || !mayHaveRefs(line.text)) {
      continue;
    }
    const code = codeSpans(line.text);
    for (const match of line.text.matchAll(TOKEN)) {
      const start = (match.index ?? 0) + (match[2]?.length ?? 0);
      const from = line.from + start;
      const to = line.from + (match.index ?? 0) + match[0].length;
      if (code.some(([a, b]) => start >= a && start < b) || touched(from, to)) {
        continue;
      }
      const label = match[1];
      const ref = match[3];
      if (label !== undefined) {
        const target = index.targets.get(label);
        const start = captionParagraphStart(lines, contexts, at);
        if (target && !captions.has(start)) {
          // The label goes; the caption's number starts its paragraph, after any quote or list marker.
          captions.add(start);
          const first = doc.line(start + 1);
          const marker = /^(?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?/.exec(first.text)?.[0].length ?? 0;
          ranges.push(Decoration.replace({}).range(from, to));
          ranges.push(Decoration.widget({ widget: new LabelWidget(captionText(target, language), label), side: 1 }).range(first.from + marker));
        }
      } else if (ref !== undefined) {
        const target = index.targets.get(ref);
        ranges.push(Decoration.replace({ widget: new RefWidget(target ? refText(target, language) : "??", ref, !target) }).range(from, to));
      }
    }
  }
  return { index, contexts, decorations: Decoration.set(ranges, true) };
}

function codeSpans(text: string): Array<[number, number]> {
  return Array.from(text.matchAll(/(`+)[\s\S]*?\1/g), (match) => [match.index ?? 0, (match.index ?? 0) + match[0].length]);
}

class RefWidget extends WidgetType {
  private readonly text: string;
  private readonly id: string;
  private readonly unresolved: boolean;

  constructor(text: string, id: string, unresolved: boolean) {
    super();
    this.text = text;
    this.id = id;
    this.unresolved = unresolved;
  }

  override eq(other: RefWidget): boolean {
    return other.text === this.text && other.id === this.id;
  }

  toDOM(): HTMLElement {
    return createSpan({ cls: this.unresolved ? "vml-ref is-unresolved" : "vml-ref", text: this.text, attr: { "data-vml-ref": this.id } });
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

/** A caption's number at the start of its paragraph; the label shows again when the cursor is on it. */
class LabelWidget extends WidgetType {
  private readonly text: string;
  private readonly id: string;

  constructor(text: string, id: string) {
    super();
    this.text = text;
    this.id = id;
  }

  override eq(other: LabelWidget): boolean {
    return other.text === this.text && other.id === this.id;
  }

  toDOM(): HTMLElement {
    return createSpan({ cls: "vml-caption-label", text: `${this.text} `, attr: { "data-vml-label": this.id } });
  }
}

class MathWidget extends WidgetType {
  private readonly tex: string;
  private readonly label: string;

  constructor(tex: string, label: string) {
    super();
    this.tex = tex;
    this.label = label;
  }

  override eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const el = createDiv({ cls: "vml-math math math-block", attr: { "data-vml-label": this.label } });
    drawMath(el, this.tex, true);
    return el;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
