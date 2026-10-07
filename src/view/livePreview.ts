import { Component, editorInfoField, editorLivePreviewField, type App } from "obsidian";
import { Prec, StateEffect, StateField, type ChangeDesc, type EditorState, type Extension, type Range, type SelectionRange, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from "@codemirror/view";

import { blockWrap, hasTextColumns, isDrawable, type TextSide, type V2Block } from "../format/v2.ts";
import { isEditable } from "../layout/edits.ts";
import { documentSnapshot, editorDocumentOrigin, rememberDocumentSnapshot, snapshotForState, type BlockRef, type DocumentSnapshot } from "../layout/documentSnapshot.ts";
import { changesMayAdd } from "../layout/changeScan.ts";
import { effectiveWrapSkips } from "../layout/floatOrder.ts";
import { PaneMeasurements, ViewProjection } from "../layout/viewProjection.ts";
import { modelFromBlock } from "../layout/model.ts";
import { mayHaveRefs } from "../markdown/crossref.ts";
import { hostParagraphBreaks, paragraphBreaks, type MarkdownSection, type ParagraphBreak } from "../markdown/paragraphBreaks.ts";
import { ParagraphParser } from "../markdown/paragraphParser.ts";
import { setUpBlockMove } from "./blockDrag.ts";
import { refContextOf, type RefContext } from "./crossrefView.ts";
import { attachInteractions, type LayoutContext } from "./interactions.ts";
import { layoutIsRendered, renderLayout } from "./layoutView.ts";
import { layoutHistory } from "./layoutHistory.ts";
import { blockWarning, t } from "./messages.ts";
import { isEditingText, keepWhileEditing, startTextEdit, stopTextEdit, type TextEditHost } from "./textEditing.ts";
import { refreshWrapMedia, resetWrapGaps, wrapGuard, wrapMeasurementsReady, type WrapAnchor } from "./wrapGuard.ts";
import { watchEnvironment } from "./viewEnvironment.ts";
import { fileOfEditor, parseBufferSections } from "./obsidianInternals.ts";
import { eventElement } from "./windows.ts";

/** The pane's environment as viewEnvironment.ts reads it: width, fonts and page classes that change layout. */
export const setEnvironment = StateEffect.define<string>();
/** Results are owned by an exact pane snapshot, including its buffer and source revision. */
export const setParagraphSections = StateEffect.define<{ snapshot: DocumentSnapshot; sections: MarkdownSection[] }>();
/** The environment of a pane before its first reading (viewEnvironment.ts). */
const PENDING_ENVIRONMENT = "pending";
/** How every layout block opens; a note without it has no layouts. */
const OPENING = "<!-- vml";

interface Measurements {
  heights: PaneMeasurements<number>;
  environmentEpoch: number;
  environmentSpec: string;
}

interface LivePreviewState extends Measurements {
  buffer: object | undefined;
  snapshot: DocumentSnapshot | null;
  blocks: V2Block[];
  lines: string[];
  /** Each block's spacer skip, found once per parse: cursor moves redraw decorations, not these. */
  skips: Array<number | null>;
  /** Lines drawn with reading view's paragraph spacing (paragraphBreaks), found once per parse. */
  breaks: ParagraphBreak[];
  decorations: DecorationSet;
  /** Wrapped layouts drawn as widgets. */
  anchors: WrapAnchor[];
  /** Whether any layout of the note wraps text, drawn or showing its source. */
  hasWraps: boolean;
  /** The note's numbered figures, tables and equations, if it has any labels or references. */
  refs: RefContext | undefined;
  /**
   * Whether the user put the cursor where it is: clicked, pressed a key or typed. A note opens with
   * its cursor at its very start, where it touches a layout written first; that cursor shows no source.
   */
  placedCursor: boolean;
}

interface Parsed extends Measurements {
  buffer: object | undefined;
  snapshot: DocumentSnapshot | null;
  blocks: V2Block[];
  lines: string[];
  skips: Array<number | null>;
  breaks: ParagraphBreak[];
  refs: RefContext | undefined;
}

/**
 * Live preview. Each v2 block is replaced with its rendered layout; while the cursor or a selection
 * touches the block, its source shows again (docs/DESIGN.md, section 4). The note is parsed only when
 * it changes; a cursor move just recomputes which blocks show their source.
 *
 * An editor showing a note with editable layouts gets the class `vml-has-layouts`: images outside
 * the layouts can then be dragged into them, and show a grab cursor. One showing a note with
 * wrapped layouts gets `vml-has-wraps`, which lets the note's lines wrap around them.
 */
export function livePreviewExtension(app: App): Extension {
  const field = StateField.define<LivePreviewState>({
    create: (state) => withDecorations(app, state, parse(app, state), false),
    update(value, tr) {
      const modeChanged = tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false);
      const info = tr.state.field(editorInfoField, false);
      const origin = editorDocumentOrigin(info?.file ?? fileOfEditor(app, info?.editor), info?.editor, value.snapshot?.origin);
      const bufferChanged = value.snapshot !== null && value.buffer !== info?.editor;
      const originChanged = value.snapshot !== null && (value.snapshot.origin.file !== origin.file || value.snapshot.origin.path !== origin.path || bufferChanged);
      const environment = tr.effects.find(effect => effect.is(setEnvironment));
      let measurements: Measurements = { heights: value.heights, environmentEpoch: value.environmentEpoch, environmentSpec: value.environmentSpec };
      if (environment) {
        // The pane's first reading only names the environment its layouts were drawn and measured in:
        // starting a new one would draw every layout again as soon as the note opens.
        const first = value.environmentSpec === PENDING_ENVIRONMENT;
        if (!first) value.heights.environmentChanged();
        measurements = { heights: value.heights, environmentEpoch: value.environmentEpoch + (first ? 0 : 1), environmentSpec: environment.value };
      }
      if (originChanged) value.heights.environmentChanged();
      // A note without layouts stays without them unless the change wrote an opening comment: reading
      // the whole note on each keystroke of every note is left for notes that have some.
      const stillWithout = tr.docChanged && !modeChanged && !originChanged && !environment && value.snapshot === null
        && !changesMayAdd(tr.state.doc, tr.changes, (text) => text.includes(OPENING), OPENING.length);
      if (stillWithout) {
        rememberDocumentSnapshot(tr.state, null);
        return value;
      }
      // Another note in the editor opens with a cursor nobody put there; one set by code (Obsidian
      // restoring where a note was left) was not put by the user either.
      const placedCursor = originChanged ? false : tr.selection ? userPlaced(tr) : value.placedCursor || (tr.docChanged && userPlaced(tr));
      if (tr.docChanged || modeChanged || originChanged) {
        return withDecorations(app, tr.state, { ...parse(app, tr.state, bufferChanged ? null : value.snapshot, tr.changes), ...measurements }, placedCursor);
      }
      const paragraphs = tr.effects.find(effect => effect.is(setParagraphSections));
      if (paragraphs?.is(setParagraphSections) && paragraphs.value.snapshot === value.snapshot) {
        return withDecorations(app, tr.state, { ...value, ...measurements,
          breaks: hostParagraphBreaks(value.lines, breakBlocks(value.blocks), paragraphs.value.sections) }, placedCursor);
      }
      if (tr.selection || environment || placedCursor !== value.placedCursor) {
        return withDecorations(app, tr.state, { ...value, ...measurements }, placedCursor);
      }
      rememberDocumentSnapshot(tr.state, value.snapshot);
      return value;
    },
    provide: (self) => [
      EditorView.decorations.from(self, (value) => value.decorations),
      EditorView.editorAttributes.from(self, (value): Record<string, string> => {
        const classes = [value.blocks.some(isEditable) ? "vml-has-layouts" : "", value.hasWraps ? "vml-has-wraps" : ""].filter(Boolean);
        return classes.length > 0 ? { class: classes.join(" ") } : {};
      }),
    ],
  });
  return [
    layoutHistory(),
    Prec.high(field),
    wrapGuard({
      anchors: (state) => state.field(field, false)?.anchors ?? [],
      hasWraps: (state) => state.field(field, false)?.hasWraps ?? false,
      environmentEpoch: (state) => state.field(field, false)?.environmentEpoch ?? 0,
      drawStandIn: (el, view, anchor, sourcePath) => {
        drawWidget(el, view, app, anchor.block, sourcePath, currentRefs(view), null, undefined, anchor.from);
      },
      keepStandIn: (el, block) => keepWhileEditing(el, block),
      releaseStandIn: (el) => {
        stopTextEdit(el);
        components.get(el)?.unload();
        components.delete(el);
      },
    }),
    ViewPlugin.define(view => {
      const projection = new ViewProjection();
      const paragraphs = new ParagraphParser<DocumentSnapshot, MarkdownSection[] | null>(
        snapshot => parseBufferSections(app, snapshot.text, snapshot.lines.length),
        (snapshot, sections) => {
          if (sections && view.state.field(field).snapshot === snapshot) view.dispatch({ effects: setParagraphSections.of({ snapshot, sections }) });
        }, view.contentDOM.win);
      const parseParagraphs = (): void => {
        const value = view.state.field(field);
        paragraphs.request(value.blocks.some(isDrawable) ? value.snapshot : null);
      };
      let destroyed = false;
      let epoch = -1;
      const measure = (): void => {
        const value = view.state.field(field);
        if (!value.snapshot) return;
        projection.request(value.snapshot);
        projection.observeHost(view.state.doc.toString());
        if (epoch !== value.environmentEpoch) { epoch = value.environmentEpoch; projection.environmentChanged(); }
        projection.viewportChanged([{ from: view.viewport.from, to: view.viewport.to }]);
        const token = projection.token()!;
        view.requestMeasure({ key: projection, read: () => {
          if (destroyed || !projection.accepts(token) || !view.contentDOM.isConnected) return null;
          const coverage = [{ from: view.viewport.from, to: view.viewport.to }];
          const media = Array.from(view.contentDOM.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video"));
          const ready = media.every(item => item.instanceOf(HTMLImageElement) ? item.complete : item.readyState > 0)
            && Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".vml-layout")).every(layoutIsRendered);
          return { coverage, measured: ready && view.contentDOM.clientWidth > 0 && view.contentDOM.doc.fonts.status === "loaded" };
        }, write: result => {
          if (result && projection.installed(token, result.coverage) && result.measured && wrapMeasurementsReady(view)) projection.measured(token, result.coverage);
        } });
      };
      const stop = watchEnvironment(view.contentDOM, spec => {
        const current = view.state.field(field).environmentSpec;
        if (destroyed || spec === current) return;
        // Wrap gaps measured before the first reading belong to this same environment.
        const effects = current === PENDING_ENVIRONMENT ? [setEnvironment.of(spec)] : [setEnvironment.of(spec), resetWrapGaps.of(null)];
        queueMicrotask(() => { if (!destroyed) view.dispatch({ effects }); });
      }, () => { refreshWrapMedia(view); measure(); });
      measure();
      parseParagraphs();
      return { update(update) {
        if (update.startState.field(field).snapshot !== update.state.field(field).snapshot) parseParagraphs();
        if (update.docChanged || update.viewportChanged || update.geometryChanged || update.transactions.some(tr => tr.effects.some(effect => effect.is(setEnvironment)))) measure();
      }, destroy() { destroyed = true; paragraphs.dispose(); stop(); projection.dispose(); } };
    }),
  ];
}

function parse(app: App, state: EditorState, previous: DocumentSnapshot | null = null, changes?: ChangeDesc): Parsed {
  const measurements = { heights: new PaneMeasurements<number>(), environmentEpoch: 0, environmentSpec: PENDING_ENVIRONMENT };
  const buffer = state.field(editorInfoField, false)?.editor;
  if (!state.field(editorLivePreviewField, false)) {
    return { buffer, blocks: [], lines: [], skips: [], breaks: [], refs: undefined, snapshot: null, ...measurements };
  }
  // Runs on every change of a note with layouts; one without them is only read in full when a change
  // may have written an opening comment (the field's update).
  const text = state.doc.toString();
  if (!text.includes(OPENING)) {
    return { buffer, blocks: [], lines: [], skips: [], breaks: [], refs: undefined, snapshot: null, ...measurements };
  }
  const info = state.field(editorInfoField, false);
  const origin = editorDocumentOrigin(info?.file ?? fileOfEditor(app, info?.editor), info?.editor, previous?.origin);
  const snapshot = documentSnapshot(text, origin, previous ?? undefined, changes);
  const blocks = snapshot.blocks.map(ref => ref.block);
  const lines = [...snapshot.lines];
  return { buffer, snapshot, blocks, lines, skips: effectiveWrapSkips(lines, blocks),
    breaks: blocks.some(isDrawable)
      ? paragraphBreaks(lines, breakBlocks(blocks))
      : [],
    refs: mayHaveRefs(text) ? refContextOf(text) : undefined, ...measurements };
}

function breakBlocks(blocks: readonly V2Block[]): Array<V2Block & { floats: boolean }> {
  return blocks.map(block => ({ ...block, floats: isDrawable(block) && blockWrap(block) !== null }));
}

/** Whether a transaction comes from the user's pointer, keys or typing. */
function userPlaced(tr: Transaction): boolean {
  return ["select", "input", "delete", "move", "undo", "redo"].some((event) => tr.isUserEvent(event));
}

function withDecorations(app: App, state: EditorState, parsed: Parsed, placedCursor: boolean): LivePreviewState {
  const { blocks, lines, refs, snapshot, skips } = parsed;
  // The numbering the layouts are drawn with, as their own widgets' keys hold it.
  const numbers = refs ? `${refs.language} ${refs.index.signature}` : "";
  rememberDocumentSnapshot(state, snapshot);
  const ranges: Array<Range<Decoration>> = [];
  const sourcePath = snapshot?.origin.path ?? state.field(editorInfoField, false)?.file?.path ?? "";
  const anchors: WrapAnchor[] = [];
  // A cursor nobody put at the start of the note touches nothing there.
  const touches = (range: SelectionRange, from: number, to: number): boolean => range.from <= to && range.to >= from
    && (placedCursor || !range.empty || range.head > 0);
  let hasWraps = false;

  for (const [index, block] of blocks.entries()) {
    if (!isDrawable(block)) {
      continue;
    }
    const from = state.doc.line(block.openLine + 1).from;
    const to = state.doc.line(block.closeLine + 1).to;
    const revealed = state.selection.ranges.some((range) => touches(range, from, to));
    const wraps = blockWrap(block) !== null;
    const effectiveSkip = skips[index] ?? null;
    const ref = snapshot!.blocks[index];
    const key = `${ref.id}:${ref.contentRevision}`;
    hasWraps ||= wraps;
    if (!revealed) {
      ranges.push(Decoration.replace({ block: true, widget: new LayoutWidget(app, ref, sourcePath, refs, effectiveSkip, parsed, false, blankEdges(lines, block)) }).range(from, to));
      if (wraps) {
        anchors.push({ from, to, key, id: ref.id, skip: effectiveSkip ?? 0, numbers, block });
      }
      continue;
    }

    // Keep a text/media layout at its original position while its source opens below it. Replacing
    // the columns with normal Markdown would move the image below all of the left column's text.
    if (hasTextColumns(block)) {
      ranges.push(Decoration.widget({ block: true, side: -1, widget: new LayoutWidget(app, ref, sourcePath, refs, effectiveSkip, parsed, true, { above: blankEdges(lines, block).above, below: false }) }).range(from));
    }
    // The source shows, with the media Obsidian draws in it as thumbnails.
    for (let line = block.openLine; line <= block.closeLine; line += 1) {
      ranges.push(Decoration.line({ class: "vml-source-line" }).range(state.doc.line(line + 1).from));
    }
    if (wraps) {
      // The layout floats beside its source, so the text around it keeps its wrap.
      ranges.push(Decoration.widget({ widget: new RevealedWrapWidget(app, block, sourcePath, refs, effectiveSkip), side: -1 }).range(from));
      anchors.push({ from, to: from, key: `${key}:source`, skip: effectiveSkip ?? 0, numbers, block });
    }
  }

  // Blank lines between two floating layouts written one after the other would push the later one a
  // line down: they take no room while the cursor is elsewhere.
  const floatGaps = new Set<number>();
  for (let index = 1; index < blocks.length; index += 1) {
    const before = blocks[index - 1];
    const after = blocks[index];
    if (!before || !after || !isDrawable(before) || !isDrawable(after) || blockWrap(before) === null || blockWrap(after) === null) {
      continue;
    }
    const gap = state.doc.sliceString(state.doc.line(before.closeLine + 1).to, state.doc.line(after.openLine + 1).from);
    if (gap.trim() !== "" || state.selection.ranges.some((range) => touches(range, state.doc.line(before.openLine + 1).from, state.doc.line(after.closeLine + 1).to))) {
      continue;
    }
    for (let line = before.closeLine + 1; line < after.openLine; line += 1) {
      ranges.push(Decoration.line({ class: "vml-float-gap" }).range(state.doc.line(line + 1).from));
      floatGaps.add(line);
    }
  }

  // The note's text keeps reading view's paragraph spacing, which is what it lies on there and in the
  // PDF (paragraphBreaks); a blank line more takes no room while the cursor is elsewhere.
  for (const { line, kind } of parsed.breaks) {
    if (floatGaps.has(line) || line >= state.doc.lines) {
      continue;
    }
    const { from, to } = state.doc.line(line + 1);
    const hidden = kind === "extra" && !state.selection.ranges.some((range) => range.from <= to && range.to >= from);
    const cls = kind === "after" ? "vml-break-after" : hidden ? "vml-break vml-break--extra" : "vml-break";
    ranges.push(Decoration.line({ class: cls }).range(from));
  }

  return { ...parsed, decorations: Decoration.set(ranges, true), anchors, hasWraps, placedCursor };
}

/** What Obsidian draws for the text beside a layout's media lives as long as the widget's element. */
const components = new WeakMap<HTMLElement, Component>();

/** Whether a blank line lies right above and right below a block. */
interface BlankEdges {
  above: boolean;
  below: boolean;
}

function blankEdges(lines: readonly string[], block: V2Block): BlankEdges {
  return { above: lines[block.openLine - 1]?.trim() === "", below: lines[block.closeLine + 1]?.trim() === "" };
}

/**
 * In reading view a layout's margin and the paragraph's beside it collapse into one paragraph break.
 * In live preview the layout's spacing is padding of its widget (see styles.css), so it leaves out
 * the side where a blank line already makes that break.
 */
function applyBlankEdges(el: HTMLElement, edges: BlankEdges): void {
  el.toggleClass("vml-live-preview--blank-above", edges.above);
  el.toggleClass("vml-live-preview--blank-below", edges.below);
}

/** What each widget element was drawn for, apart from the blank lines around it. */
const drawnFor = new WeakMap<HTMLElement, string>();

/**
 * The heights layouts were drawn at, by runtime instance and content revision, for
 * CodeMirror to count a layout it has not drawn at the height it will have. Counted by its lines
 * instead, a tall layout of text is far too short: the note's height is off, the note jumps as it
 * scrolls, and a change to the layout, typing in it included, puts it out of the editor's view. The
 * instance stands in for a layout whose text has just changed.
 */
const heightWatchers = new WeakMap<HTMLElement, ResizeObserver>();

/** Records the height of the widget `el` under `keys`, now and whenever it changes. */
function watchHeight(el: HTMLElement, keys: readonly string[], heights: PaneMeasurements<number>, valid: () => boolean): void {
  heightWatchers.get(el)?.disconnect();
  const watcher = new (el.win as Window & typeof window).ResizeObserver(() => {
    if (valid() && el.offsetHeight > 0) for (const key of keys) heights.set(key, el.offsetHeight);
  });
  watcher.observe(el);
  heightWatchers.set(el, watcher);
}

class LayoutWidget extends WidgetType {
  private readonly app: App;
  private readonly block: V2Block;
  private readonly sourcePath: string;
  private readonly refs: RefContext | undefined;
  private readonly effectiveSkip: number | null;
  private readonly key: string;
  private readonly placeKey: string;
  private readonly sourcePreview: boolean;
  private readonly measurements: Measurements;
  private readonly ref: BlockRef;
  private readonly heightKey: string;
  private readonly cacheEpoch: number;
  private readonly edges: BlankEdges;

  constructor(app: App, ref: BlockRef, sourcePath: string, refs: RefContext | undefined,
    effectiveSkip: number | null, measurements: Measurements, sourcePreview = false, edges: BlankEdges = { above: false, below: false }) {
    super();
    this.edges = edges;
    const block = ref.block;
    this.app = app;
    this.block = block;
    this.sourcePath = sourcePath;
    this.refs = refs;
    this.effectiveSkip = effectiveSkip;
    this.sourcePreview = sourcePreview;
    this.measurements = measurements;
    this.cacheEpoch = measurements.heights.environmentEpoch;
    this.ref = ref;
    // New numbers draw the layout again.
    const numbers = refs ? `${refs.language} ${refs.index.signature}` : "";
    // A change of environment draws the layout again through the epoch, which the keys hold.
    const spec = `${numbers}\n${effectiveSkip}`;
    const mode = sourcePreview ? "source" : "live";
    this.heightKey = measurements.heights.key(ref.id, ref.contentRevision, spec, mode);
    this.placeKey = measurements.heights.key(ref.id, 0, spec, mode);
    this.key = `${sourcePath}\n${this.heightKey}\n${block.lines.join("\n")}`;
  }

  override eq(other: LayoutWidget): boolean {
    return other.key === this.key && other.block.openLine === this.block.openLine && other.sourcePreview === this.sourcePreview
      && other.edges.above === this.edges.above && other.edges.below === this.edges.below;
  }

  private get drawnKey(): string {
    return `${this.sourcePreview}\n${this.block.openLine}\n${this.key}`;
  }

  // A wrapped layout's widget is a zero-height anchor; the layout floats out of it.
  override get estimatedHeight(): number {
    if (blockWrap(this.block) !== null) {
      return 0;
    }
    return this.measurements.heights.get(this.heightKey) ?? this.measurements.heights.get(this.placeKey) ?? -1;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = createDiv({ cls: "vml-live-preview" });
    if (this.sourcePreview) {
      const component = new Component();
      component.load();
      components.set(el, component);
      renderLayout(el, { app: this.app, sourcePath: this.sourcePath, model: modelFromBlock(this.block), effectiveSkip: this.effectiveSkip,
        editable: false, warning: blockWarning(this.block), component, refs: this.refs });
    } else {
      drawWidget(el, view, this.app, this.block, this.sourcePath, this.refs, this.effectiveSkip);
    }
    if (blockWrap(this.block) === null) {
      this.watch(el, view);
    }
    applyBlankEdges(el, this.edges);
    drawnFor.set(el, this.drawnKey);
    return el;
  }

  // While one of its text columns is typed in, the layout keeps its element (textEditing.ts), and
  // its height goes on under the new text. A blank line typed or removed beside it changes only its
  // spacing.
  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    if (drawnFor.get(dom) === this.drawnKey) {
      applyBlankEdges(dom, this.edges);
      return true;
    }
    if (this.sourcePreview || !keepWhileEditing(dom, this.block)) {
      return false;
    }
    applyBlankEdges(dom, this.edges);
    drawnFor.set(dom, this.drawnKey);
    this.watch(dom, view);
    return true;
  }

  override destroy(dom: HTMLElement): void {
    heightWatchers.get(dom)?.disconnect();
    heightWatchers.delete(dom);
    stopTextEdit(dom);
    components.get(dom)?.unload();
    components.delete(dom);
  }

  override ignoreEvent(): boolean {
    return true;
  }

  private watch(el: HTMLElement, view: EditorView): void {
    watchHeight(el, [this.heightKey, this.placeKey], this.measurements.heights, () => {
      const current = snapshotForState(view.state)?.blocks.find(ref => ref.id === this.ref.id);
      return el.isConnected && this.cacheEpoch === this.measurements.heights.environmentEpoch && current?.contentRevision === this.ref.contentRevision;
    });
  }
}

/**
 * Draws a layout's widget into `el`, in place of what was there. With `side`, that side shows a text
 * column even without text, for its first line to be typed in. A stand-in for a float whose anchor is
 * not drawn (wrapGuard.ts) gives where the block starts, `standIn`: its element is elsewhere.
 */
function drawWidget(
  el: HTMLElement,
  view: EditorView,
  app: App,
  block: V2Block,
  sourcePath: string,
  refs: RefContext | undefined,
  effectiveSkip: number | null,
  side?: TextSide,
  standIn?: number,
): TextEditHost {
  components.get(el)?.unload();
  el.empty();
  const model = modelFromBlock(block);
  if (side === "left" && model.text.left === null) {
    model.text = { ...model.text, left: "" };
  } else if (side === "right" && model.text.right === null) {
    model.text = { ...model.text, right: "" };
  }
  el.toggleClass("vml-live-preview--wrap", model.wrap !== null);
  const component = new Component();
  component.load();
  components.set(el, component);
  const root = renderLayout(el, { app, sourcePath, model, effectiveSkip, editable: isEditable(block), warning: blockWarning(block), component, refs });
  // Resolved when asked: the block may have moved since the widget was drawn.
  const position = (): number => standIn ?? view.posAtDOM(el);
  const context: LayoutContext = { app, sourcePath, block, model, view, editor: view.state.field(editorInfoField, false)?.editor, position };
  const host: TextEditHost = {
    el,
    root,
    app,
    sourcePath,
    context,
    editor: view.state.field(editorInfoField, false)?.editor,
    view,
    // Drawn again from the note as it is now, numbers included.
    redraw: (next, editing) => drawWidget(el, view, app, next, sourcePath, currentRefs(view), effectiveSkip, editing, standIn),
  };
  if (isEditable(block)) {
    context.editText = (editing) => startTextEdit(host, editing, null);
  }
  attachInteractions(root, context);
  if (isEditable(block)) {
    setUpBlockMove(root, context);
  }
  setUpText(view, host);

  // On the media, where it hides none of the text beside them.
  const buttonHost = root.querySelector<HTMLElement>(":scope > .vml-layout__media") ?? root;
  const button = buttonHost.createEl("button", { cls: "vml-edit-source", text: t("editSource") });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    // A stand-in's block lies above what is drawn.
    view.dispatch({ selection: { anchor: position() }, scrollIntoView: standIn !== undefined, userEvent: "select" });
    view.focus();
  });
  return host;
}

/**
 * A click on the text beside a layout's media types it right in the layout (textEditing.ts); in a
 * block the plugin cannot write to, it shows the block's source there instead. Links in the text are
 * Obsidian's and open as anywhere else, and selecting some of the text to copy it changes nothing.
 */
function setUpText(view: EditorView, host: TextEditHost): void {
  const { block } = host.context;
  for (const textEl of Array.from(host.root.querySelectorAll<HTMLElement>(":scope > .vml-layout__text"))) {
    const side: TextSide = textEl.dataset.side === "left" ? "left" : "right";
    textEl.addEventListener("click", (event) => {
      if (isEditingText(host.el) || eventElement(event)?.closest("a")) {
        return;
      }
      if (!(host.el.doc.getSelection()?.isCollapsed ?? true)) {
        return;
      }
      event.preventDefault();
      if (isEditable(block)) {
        startTextEdit(host, side, { x: event.clientX, y: event.clientY });
        return;
      }
      const text = side === "left" ? block.leftText : block.rightText;
      if (text) {
        const { doc } = view.state;
        const open = doc.lineAt(host.context.position?.() ?? view.posAtDOM(host.el)).number;
        view.dispatch({ selection: { anchor: doc.line(Math.min(doc.lines, open + text.to - block.openLine)).to }, scrollIntoView: host.el.closest(".vml-wrap-proxy") !== null });
        view.focus();
      }
    });
  }
}

/**
 * While a wrapped layout's source shows, the layout floats beside it, for display only. Its text and
 * captions are drawn too: a box of text drawn empty would leave the note's text nothing to wrap
 * around, and the note would jump each time the cursor went in and out of the box.
 */
class RevealedWrapWidget extends WidgetType {
  private readonly app: App;
  private readonly block: V2Block;
  private readonly sourcePath: string;
  private readonly refs: RefContext | undefined;
  private readonly effectiveSkip: number | null;
  private readonly key: string;

  constructor(app: App, block: V2Block, sourcePath: string, refs: RefContext | undefined, effectiveSkip: number | null) {
    super();
    this.app = app;
    this.block = block;
    this.sourcePath = sourcePath;
    this.refs = refs;
    this.effectiveSkip = effectiveSkip;
    // New numbers draw the layout again.
    const numbers = refs ? `${refs.language} ${refs.index.signature}` : "";
    this.key = `${sourcePath}\n${effectiveSkip}\n${numbers}\n${block.lines.join("\n")}`;
  }

  override eq(other: RevealedWrapWidget): boolean {
    return other.key === this.key;
  }

  toDOM(): HTMLElement {
    const el = createSpan({ cls: "vml-wrap-reveal vml-live-preview vml-live-preview--wrap" });
    const component = new Component();
    component.load();
    components.set(el, component);
    renderLayout(el, { app: this.app, sourcePath: this.sourcePath, model: modelFromBlock(this.block),
      effectiveSkip: this.effectiveSkip, editable: false, warning: null, component, refs: this.refs });
    return el;
  }

  override destroy(dom: HTMLElement): void {
    components.get(dom)?.unload();
    components.delete(dom);
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function currentRefs(view: EditorView): RefContext | undefined {
  const text = view.state.doc.toString();
  return mayHaveRefs(text) ? refContextOf(text) : undefined;
}
