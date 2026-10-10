import { editorInfoField } from "obsidian";
import { StateEffect, StateField, type ChangeDesc, type EditorState, type Extension, type Range } from "@codemirror/state";
import { BlockType, Decoration, EditorView, ViewPlugin, WidgetType, type BlockInfo, type DecorationSet, type ViewUpdate } from "@codemirror/view";

import type { V2Block } from "../format/v2.ts";
import { ConvergenceBudget } from "../layout/convergenceBudget.ts";
import { modelFromBlock } from "../layout/model.ts";
import { carryFloat, liveProxy, mapFloat, mapPlaced, planGaps, planProxy, stackProxies, standInAnchorTop, viewportRun, type FlowBox, type FloatSize, type Gap, type LiveProxyPlan, type PlacedFloat } from "../layout/wrapGaps.ts";
import { layoutIsRendered } from "./layoutView.ts";

/**
 * Live preview around wrapped layouts (docs/DESIGN.md, section 4).
 *
 * A wrapped layout's widget is a zero-height anchor and the layout floats out of it, so the lines
 * beside it are measured with their real heights and CodeMirror's height map stays right. Two things
 * would still break it, and this extension takes care of both:
 * - an element that cannot sit beside a float is pushed below it, by a height no element has; a
 *   spacer in front of it turns the push into a height (see wrapGaps.ts);
 * - CodeMirror draws only part of a long note. When a float's anchor lies above the drawn part but
 *   the float reaches into it, a stand-in for the rest of the float goes in front of the first drawn
 *   line, so the lines beside it keep their wrap and do not jump once the anchor is drawn. Like the
 *   anchor, it is a zero-height block widget the float overflows. Inside a line it would be kept in
 *   any line laid out on its own (lists and quotes beside a float are), which then grows as tall as
 *   the stand-in reaches: the height map grows with it, and the note jumps (measured: 1086px).
 */

/** A wrapped layout: drawn as a widget, or floating beside its source at the start of its first line. */
export interface WrapAnchor {
  /** The widget's range in the document; for a layout beside its source, the start of its first line. */
  from: number;
  to: number;
  /** Runtime instance and content revision, distinct for identical source blocks. */
  key: string;
  /** The runtime instance alone, the same across revisions; none for a layout beside its source. */
  id?: string;
  /** The skip the layout is drawn with: less than its own beside an opposite float sharing its anchor. */
  skip: number;
  /** The note's numbering the layout is drawn with, which its captions show. */
  numbers: string;
  block: V2Block;
}

export interface WrapSource {
  anchors(state: EditorState): readonly WrapAnchor[];
  /** Whether any layout of the note wraps text, drawn or showing its source. */
  hasWraps(state: EditorState): boolean;
  environmentEpoch(state: EditorState): number;
  /** Draws the layout of `anchor` into `el` with all its interactions, as its own widget would. */
  drawStandIn(el: HTMLElement, view: EditorView, anchor: WrapAnchor, sourcePath: string): void;
  /** Read-only rendering for an unseen float in this pane's current width and typography. */
  drawMeasurement?(el: HTMLElement, view: EditorView, anchor: WrapAnchor, sourcePath: string): void;
  /** Whether `el` keeps its layout for `block`: one of its text columns is being typed in. */
  keepStandIn(el: HTMLElement, block: V2Block): boolean;
  /** Adopt sizing changes without replacing a stand-in's media/player. */
  resizeStandIn?(el: HTMLElement, anchor: WrapAnchor, sourcePath: string): boolean;
  releaseStandIn(el: HTMLElement): void;
  /** Sizes/gaps have completed their current measurement; the pane can confirm that coverage. */
  measurementsChanged?(view: EditorView): void;
}

interface GapUpdate {
  /** The measured part of the document; its spacers are replaced by `gaps`. */
  from: number;
  to: number;
  gaps: Gap[];
}

const setGaps = StateEffect.define<GapUpdate>();
export const resetWrapGaps = StateEffect.define<null>();
const setProxies = StateEffect.define<DecorationSet>();

class GapWidget extends WidgetType {
  readonly height: number;

  constructor(height: number) {
    super();
    this.height = height;
  }

  override eq(other: GapWidget): boolean {
    return other.height === this.height;
  }

  override get estimatedHeight(): number {
    return this.height;
  }

  toDOM(): HTMLElement {
    const el = createDiv({ cls: "vml-wrap-gap" });
    el.setCssProps({ "--vml-gap-height": `${this.height}px` });
    return el;
  }
}

// Block widgets change the height map, so CodeMirror only takes them from state, not from plugins.
const gapField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(gaps, tr) {
    let next = gaps.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(resetWrapGaps)) next = Decoration.none;
      if (effect.is(setGaps)) {
        const { from, to } = effect.value;
        next = next.update({
          filter: (pos) => pos < from || pos > to,
          add: effect.value.gaps.map((gap) => Decoration.widget({ widget: new GapWidget(gap.height), block: true, side: -1 }).range(gap.pos)),
          sort: true,
        });
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

// The stand-ins depend on the viewport, which only the view knows, but are block widgets too.
const proxyField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(proxies, tr) {
    let next = proxies.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setProxies)) next = effect.value;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * A stand-in is the layout itself, drawn by its own widget's code with all its interactions: only
 * where it starts is planned. Its width and height are the layout's, so it follows an edit made in
 * it before its anchor has been measured again. Under an empty, zero-width float as high as the
 * lines between the first drawn line and the layout, like the skip of the layout itself; or pulled
 * up over that line, when it starts above it, and cut off there.
 */
class ProxyWidget extends WidgetType {
  private readonly source: WrapSource;
  private readonly anchor: WrapAnchor;
  private readonly sourcePath: string;
  private readonly side: FloatSize["side"];
  private readonly plan: LiveProxyPlan;
  readonly key: string;

  constructor(source: WrapSource, anchor: WrapAnchor, sourcePath: string, side: FloatSize["side"], plan: LiveProxyPlan) {
    super();
    this.source = source;
    this.anchor = anchor;
    this.sourcePath = sourcePath;
    this.side = side;
    this.plan = plan;
    this.key = [anchor.key, anchor.from, anchor.block.openLine, anchor.numbers, side, plan.sandbag, plan.shift, plan.marginTop].map(String).join("\n");
  }

  override eq(other: ProxyWidget): boolean {
    return other.key === this.key;
  }

  override get estimatedHeight(): number {
    return 0;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = createDiv({ cls: "vml-wrap-proxy" });
    el.createDiv({ cls: "vml-wrap-proxy__sandbag" });
    const content = el.createDiv({ cls: "vml-live-preview vml-wrap-proxy__live" });
    this.place(el);
    this.source.drawStandIn(content, view, this.anchor, this.sourcePath);
    return el;
  }

  // Another place for the same layout keeps what is drawn; so does a text column being typed in.
  override updateDOM(dom: HTMLElement): boolean {
    const content = dom.querySelector<HTMLElement>(":scope > .vml-wrap-proxy__live");
    const same = dom.dataset.key === this.anchor.key && dom.dataset.from === String(this.anchor.from) && dom.dataset.numbers === this.anchor.numbers;
    if (!content || !(same || this.source.keepStandIn(content, this.anchor.block)
        || (dom.dataset.numbers === this.anchor.numbers && this.source.resizeStandIn?.(content, this.anchor, this.sourcePath)))) {
      return false;
    }
    this.place(dom);
    return true;
  }

  override destroy(dom: HTMLElement): void {
    const content = dom.querySelector<HTMLElement>(":scope > .vml-wrap-proxy__live");
    if (content) {
      this.source.releaseStandIn(content);
    }
  }

  override ignoreEvent(): boolean {
    return true;
  }

  private place(el: HTMLElement): void {
    el.dataset.key = this.anchor.key;
    el.dataset.from = String(this.anchor.from);
    el.dataset.numbers = this.anchor.numbers;
    el.dataset.shift = String(this.plan.shift);
    const sandbag = el.querySelector<HTMLElement>(":scope > .vml-wrap-proxy__sandbag");
    sandbag?.toggleClass("vml-wrap-proxy__sandbag--left", this.side === "left");
    sandbag?.toggleClass("vml-wrap-proxy__sandbag--right", this.side === "right");
    sandbag?.setCssProps({ "--vml-proxy-sandbag": `${this.plan.sandbag}px` });
    el.setCssProps({ "--vml-proxy-shift": `${this.plan.shift}px`, "--vml-proxy-margin-top": `${this.plan.marginTop}px` });
    el.toggleClass("vml-wrap-proxy--cut", this.plan.shift > 0);
  }
}

export function wrapGuard(source: WrapSource): Extension {
  return [
    gapField,
    proxyField,
    ViewPlugin.define((view) => new WrapGuard(view, source)),
  ];
}

const activeGuards = new WeakMap<EditorView, WrapGuard>();

/** An unseen upstream float with no current size keeps the viewport pending. */
export function wrapMeasurementsReady(view: EditorView): boolean {
  return activeGuards.get(view)?.measurementsReady() ?? true;
}

/** A loaded visible resource needs a fresh measurement, not a new environment for every block. */
export function refreshWrapMedia(view: EditorView): void { activeGuards.get(view)?.mediaChanged(); }

class WrapGuard {
  private readonly view: EditorView;
  private readonly source: WrapSource;
  /** Float sizes by instance and content revision, measured when its anchor is drawn. */
  private readonly sizes = new Map<string, FloatSize>();
  /** Sizes measured on a stand-in, which may change as its media load; its anchor's own replace them. */
  private readonly standInSizes = new Set<string>();
  /**
   * Each instance's latest size, and where it was: an edit made in a stand-in makes a revision
   * nothing has measured yet. While its anchor stays, where it starts follows from there
   * (carryFloat), and the stand-in is measured for the rest.
   */
  private readonly latest = new Map<string, PlacedFloat>();
  private destroyed = false;
  private serial = 0;
  private epoch: number;
  private readonly resize: ResizeObserver;
  private readonly observed = new Map<HTMLElement, string>();
  private readonly pendingMedia = new Set<string>();
  private pendingUpdate = false;
  private readonly budget = new ConvergenceBudget();
  private readonly detached = new Map<string, { anchor: WrapAnchor; el: HTMLElement; signature: string }>();
  /** The stand-ins last sent to proxyField, and the latest plan for them. */
  private proxyKey = "";
  private proxySerial = 0;

  constructor(view: EditorView, source: WrapSource) {
    this.view = view;
    this.source = source;
    activeGuards.set(view, this);
    this.epoch = source.environmentEpoch(view.state);
    this.resize = new (view.dom.win as Window & typeof window).ResizeObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const size = `${entry.contentRect.width}:${entry.contentRect.height}`;
        if (this.observed.get(el) !== size) { this.observed.set(el, size); changed = true; }
      }
      if (changed && !this.destroyed) this.measure();
    });
    this.placeProxies();
    this.measure();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      this.budget.reset();
      this.releaseMeasurements();
      this.mapSizes(update.changes);
    }
    const environmentChanged = this.epoch !== this.source.environmentEpoch(update.state);
    if (environmentChanged) { this.budget.reset(); this.releaseMeasurements(); this.epoch = this.source.environmentEpoch(update.state); this.forgetSizes(); this.pendingMedia.clear(); }
    const anchorsChanged = signature(this.source.anchors(update.state)) !== signature(this.source.anchors(update.startState));
    // A stand-in starts below the first drawn line by what the height map has above it, which a
    // measurement of lines above it may change while the viewport stays.
    // So does the selection: CodeMirror draws its lines, stand-ins left there included.
    if (update.docChanged || update.viewportChanged || update.heightChanged || update.geometryChanged || update.selectionSet || anchorsChanged
      || environmentChanged || update.transactions.some(tr => tr.effects.some(effect => effect.is(setGaps)))) {
      this.placeProxies();
    }
    if (update.docChanged || update.viewportChanged || update.heightChanged || update.geometryChanged || anchorsChanged || environmentChanged) {
      this.measure();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.serial++;
    this.resize.disconnect(); this.observed.clear(); this.forgetSizes();
    this.pendingMedia.clear(); activeGuards.delete(this.view);
    this.releaseMeasurements();
  }

  /** The anchors and the lines the layouts start beside move with the note's text. */
  private mapSizes(changes: ChangeDesc): void {
    // Text typed right at an anchor goes in front of its block.
    const mapPos = (pos: number): number => changes.mapPos(pos, 1);
    for (const [key, size] of this.sizes) this.sizes.set(key, mapFloat(size, mapPos));
    for (const [id, placed] of this.latest) this.latest.set(id, mapPlaced(placed, mapPos));
  }

  private forgetSizes(): void {
    this.sizes.clear(); this.standInSizes.clear(); this.latest.clear();
  }

  measurementsReady(): boolean {
    return !this.budget.blocked && !this.pendingUpdate && this.source.anchors(this.view.state).every(anchor => anchor.from > this.view.viewport.to
      || (this.sizes.has(anchor.key) && !this.pendingMedia.has(anchor.key)));
  }

  mediaChanged(): void { this.budget.reset(); this.measure(); }

  private measure(): void {
    const state = this.view.state;
    if (!this.source.hasWraps(state) && (state.field(gapField, false)?.size ?? 0) === 0) {
      return;
    }
    this.prepareMeasurements();
    const serial = ++this.serial;
    this.pendingUpdate = true;
    const doc = state.doc;
    const epoch = this.epoch;
    const viewport = this.view.viewport;
    const current = (): boolean => !this.destroyed && this.serial === serial && this.view.state.doc === doc
      && this.source.environmentEpoch(this.view.state) === epoch && this.view.viewport.from === viewport.from && this.view.viewport.to === viewport.to;
    this.view.requestMeasure({ key: this, read: () => {
      if (!current()) return null;
      const style = getComputedStyle(this.view.contentDOM);
      const props = { "--vml-measure-width": `${this.view.contentDOM.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`,
        "--vml-measure-font": style.fontFamily, "--vml-measure-size": style.fontSize, "--vml-measure-line": style.lineHeight,
        "--vml-measure-weight": style.fontWeight, "--vml-measure-spacing": style.letterSpacing, "--vml-measure-direction": style.direction };
      const signature = JSON.stringify(props);
      if ([...this.detached.values()].some(item => item.signature !== signature)) return { props, signature, update: null };
      return { props: null, signature, update: this.source.hasWraps(state) ? this.read() : { from: 0, to: state.doc.length, gaps: [] } };
    }, write: result => {
      if (!result || !current()) return;
      if (result.props) {
        for (const item of this.detached.values()) { item.el.setCssProps(result.props); item.signature = result.signature; }
        this.measure();
      } else {
        this.prepareMeasurements();
        this.write(result.update, current);
      }
    } });
  }

  private releaseMeasurements(): void {
    for (const { el } of this.detached.values()) { this.source.releaseStandIn(el); el.remove(); }
    this.detached.clear();
  }

  private prepareMeasurements(): void {
    if (!this.source.drawMeasurement) return;
    const anchors = this.source.anchors(this.view.state).filter(anchor => anchor.to < this.view.viewport.from
      && (!this.sizes.has(anchor.key) || this.pendingMedia.has(anchor.key)) && !drawnApart(this.view, anchor));
    const keys = new Set(anchors.map(anchor => anchor.key));
    for (const [key, item] of this.detached) if (!keys.has(key)) { this.source.releaseStandIn(item.el); item.el.remove(); this.detached.delete(key); }
    const sourcePath = this.view.state.field(editorInfoField, false)?.file?.path ?? "";
    for (const anchor of anchors) if (!this.detached.has(anchor.key)) {
      const el = this.view.scrollDOM.createDiv({ cls: "cm-content vml-live-preview vml-wrap-measure", attr: { "aria-hidden": "true" } });
      this.detached.set(anchor.key, { anchor, el, signature: "" });
      const completed = (): void => { if (!this.destroyed && this.detached.get(anchor.key)?.el === el) this.mediaChanged(); };
      for (const type of ["load", "error", "loadedmetadata", "vml-layout-rendered"]) el.addEventListener(type, completed, true);
      this.source.drawMeasurement(el, this.view, anchor, sourcePath);
    }
  }

  private read(): GapUpdate | null {
    const view = this.view;
    if (!this.budget.take(`${this.epoch}:${view.viewport.from}:${view.viewport.to}`)) return null;
    const docTop = view.documentTop;
    const anchors = this.source.anchors(view.state);
    const previousSizes = JSON.stringify([...this.sizes]);
    for (const { anchor, el } of this.detached.values()) {
      const layout = el.querySelector<HTMLElement>(".vml-layout");
      if (!layout || !isReady(layout)) { this.pendingMedia.add(anchor.key); continue; }
      const rect = layout.getBoundingClientRect(), style = getComputedStyle(layout);
      if (rect.width <= 0 || rect.height <= 0) { this.pendingMedia.add(anchor.key); continue; }
      const layoutTop = rect.top - el.getBoundingClientRect().top;
      const top = view.lineBlockAt(anchor.from).top + layoutTop;
      const beside = view.lineBlockAtHeight(top), side = modelFromBlock(anchor.block).wrap!;
      this.keep(anchor, { refPos: beside.from, refOffset: top - beside.top, side, layoutTop, layoutHeight: rect.height, width: rect.width,
        margin: parseFloat(side === "left" ? style.marginRight : style.marginLeft) || 0,
        marginBottom: parseFloat(style.marginBottom) || 0, marginTop: parseFloat(style.marginTop) || 0 });
      this.pendingMedia.delete(anchor.key);
      this.standInSizes.add(anchor.key);
    }
    // Runs of drawn elements, between the gaps CodeMirror leaves for what it has not drawn.
    let boxes: FlowBox[] = [];
    const runs: FlowBox[][] = [boxes];

    for (const child of Array.from(view.contentDOM.querySelectorAll<HTMLElement>(":scope > *"))) {
      if (child.hasClass("cm-gap")) {
        boxes = [];
        runs.push(boxes);
        continue;
      }
      if (child.hasClass("vml-wrap-proxy")) {
        const layout = child.querySelector<HTMLElement>(":scope > .vml-wrap-proxy__live > .vml-layout");
        if (layout) {
          this.measureStandIn(anchors, child, layout);
          if (!this.observed.has(layout)) { this.observed.set(layout, ""); this.resize.observe(layout); }
        }
        boxes.push({ pos: 0, top: 0, height: 0, mapTop: 0, spacer: false, floatBottom: floatBottom(child, docTop), standIn: true });
        continue;
      }
      let pos: number;
      try {
        pos = view.posAtDOM(child);
      } catch {
        continue;
      }
      // A widget anchors its float; a layout beside its source floats from the line it starts.
      const host = child.hasClass("vml-live-preview--wrap") ? child : child.querySelector<HTMLElement>(".vml-wrap-reveal");
      if (host) {
        this.remember(anchors, pos, child, host);
        const layout = host.querySelector<HTMLElement>(".vml-layout");
        if (layout && !this.observed.has(layout)) { this.observed.set(layout, ""); this.resize.observe(layout); }
      }
      const rect = child.getBoundingClientRect();
      boxes.push({
        pos,
        top: rect.top - docTop,
        height: rect.height,
        mapTop: view.lineBlockAt(pos).top,
        spacer: child.hasClass("vml-wrap-gap"),
        floatBottom: floatBottom(child, docTop),
      });
    }

    const keys = new Set(anchors.map((anchor) => anchor.key));
    const ids = new Set(anchors.map((anchor) => anchor.id));
    for (const el of this.observed.keys()) if (!view.contentDOM.contains(el)) { this.resize.unobserve(el); this.observed.delete(el); }
    for (const key of this.sizes.keys()) {
      if (!keys.has(key)) {
        this.sizes.delete(key);
        this.standInSizes.delete(key);
      }
    }
    for (const id of this.latest.keys()) {
      if (!ids.has(id)) {
        this.latest.delete(id);
      }
    }

    // A stand-in's host only carries floats: the elements around it bound what was measured.
    const run = viewportRun(runs, view.viewport.from);
    const elements = run.filter((box) => !box.standIn);
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) {
      return null;
    }
    const gaps = planGaps(run);
    return sameGaps(gaps, currentGaps(view.state, first.pos, last.pos)) && previousSizes === JSON.stringify([...this.sizes])
      ? null : { from: first.pos, to: last.pos, gaps };
  }

  private write(update: GapUpdate | null, current: () => boolean): void {
    if (!update) {
      if (current()) {
        this.pendingUpdate = false;
        this.source.measurementsChanged?.(this.view);
      }
      return;
    }
    // A measurement may not dispatch. The spacers change right after it, before the frame is painted.
    queueMicrotask(() => {
      if (current()) {
        this.pendingUpdate = false;
        this.view.dispatch({ effects: setGaps.of(update) });
        this.source.measurementsChanged?.(this.view);
      }
    });
  }

  /** Measures the float in `host` from the top of `anchorEl`, the element CodeMirror places at `pos`. */
  private remember(anchors: readonly WrapAnchor[], pos: number, anchorEl: HTMLElement, host: HTMLElement): void {
    const anchor = anchors.find((candidate) => candidate.from === pos);
    const layout = host.querySelector<HTMLElement>(".vml-layout--wrap");
    if (!anchor || !layout) {
      return;
    }
    const anchorRect = anchorEl.getBoundingClientRect();
    const rect = layout.getBoundingClientRect();
    const style = getComputedStyle(layout);
    if (rect.width <= 0 || rect.height <= 0) { this.pendingMedia.add(anchor.key); return; }
    if (isReady(layout)) this.pendingMedia.delete(anchor.key); else this.pendingMedia.add(anchor.key);
    const side = layout.hasClass("vml-layout--wrap-right") ? "right" : "left";
    // The line it starts beside, as the height map has it: the stand-in follows that line.
    const top = rect.top - this.view.documentTop;
    const beside = this.view.lineBlockAtHeight(top);
    this.keep(anchor, {
      refPos: beside.from,
      refOffset: top - beside.top,
      side,
      layoutTop: rect.top - anchorRect.top,
      layoutHeight: rect.height,
      width: rect.width,
      margin: parseFloat(side === "left" ? style.marginRight : style.marginLeft) || 0,
      marginBottom: parseFloat(style.marginBottom) || 0,
      marginTop: parseFloat(style.marginTop) || 0,
    });
    this.standInSizes.delete(anchor.key);
  }

  /**
   * Measures the layout a stand-in draws, for a revision its anchor has not been measured in: its
   * height and width are the layout's own; where it starts is known from before.
   */
  private measureStandIn(anchors: readonly WrapAnchor[], host: HTMLElement, layout: HTMLElement): void {
    const anchor = anchors.find((candidate) => candidate.key === host.dataset.key);
    if (!anchor) return;
    const wasPending = this.pendingMedia.has(anchor.key);
    if (!isReady(layout)) { this.pendingMedia.add(anchor.key); return; }
    this.pendingMedia.delete(anchor.key);
    if (this.sizes.has(anchor.key) && !this.standInSizes.has(anchor.key) && !wasPending) return;
    const known = this.sizes.get(anchor.key) ?? this.carried(anchor);
    if (!known) {
      return;
    }
    const rect = layout.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) { this.pendingMedia.add(anchor.key); return; }
    this.keep(anchor, { ...known, side: layout.hasClass("vml-layout--wrap-right") ? "right" : "left", layoutHeight: rect.height, width: rect.width });
    this.standInSizes.add(anchor.key);
  }

  private keep(anchor: WrapAnchor, size: FloatSize): void {
    this.sizes.set(anchor.key, size);
    if (anchor.id !== undefined) {
      this.latest.set(anchor.id, { from: anchor.from, skip: anchor.skip, size });
    }
  }

  /** The size of an earlier revision of the same layout, while its anchor stays. */
  private carried(anchor: WrapAnchor): FloatSize | undefined {
    const latest = anchor.id === undefined ? undefined : this.latest.get(anchor.id);
    if (!latest) {
      return undefined;
    }
    const side = modelFromBlock(anchor.block).wrap ?? latest.size.side;
    return carryFloat(latest, anchor.from, side, anchor.skip, this.view.defaultLineHeight) ?? undefined;
  }

  /**
   * Plans the stand-ins for the current viewport and sends them to proxyField. A view may not
   * dispatch while it updates, so they follow right after, before the frame is painted.
   */
  private placeProxies(): void {
    const view = this.view;
    const drawnFrom = view.lineBlockAt(view.viewport.from).from;
    // Stand-ins left in front of lines no longer drawn stay as they are, until those lines are drawn
    // again. Taking one away changes that line's decorations, and CodeMirror then estimates the
    // line's height afresh, as it cannot measure it: a line measured beside a float, several lines
    // high, lost its height, and the note moved (measured: 98px each way as the stand-in moved on).
    const left: Array<Range<Decoration>> = [];
    view.state.field(proxyField, false)?.between(0, view.state.doc.length, (from, _to, value) => {
      // Not in the viewport, nor on the cursor's lines, which CodeMirror draws apart from it.
      if ((from < drawnFrom || from > view.viewport.to) && !onSelectionLine(view, from)) {
        left.push(value.range(from));
      }
    });
    const ranges = [...left, ...this.proxies()];
    const key = ranges.map((range) => `${range.from}\n${(range.value.spec as { widget: ProxyWidget }).widget.key}`).join("\n\n");
    // A newer plan replaces one still waiting to be sent, even when it is what proxyField has.
    const serial = ++this.proxySerial;
    if (key === this.proxyKey) {
      return;
    }
    const doc = this.view.state.doc;
    queueMicrotask(() => {
      if (this.destroyed || this.proxySerial !== serial || this.view.state.doc !== doc) {
        return;
      }
      this.proxyKey = key;
      this.view.dispatch({ effects: setProxies.of(Decoration.set(ranges, true)) });
    });
  }

  private proxies(): Array<Range<Decoration>> {
    const view = this.view;
    const anchors = this.source.anchors(view.state);
    const first = view.lineBlockAt(view.viewport.from);
    if (anchors.length === 0 || !startsWithText(first)) {
      return [];
    }

    const sourcePath = view.state.field(editorInfoField, false)?.file?.path ?? "";
    const planned: Array<{ anchor: WrapAnchor; side: FloatSize["side"]; plan: LiveProxyPlan }> = [];
    // Floats drawn apart above the first drawn line come before the stand-ins: none starts above them.
    let floor = 0;
    for (const anchor of anchors) {
      const size = this.sizes.get(anchor.key) ?? this.carried(anchor);
      if (anchor.to < view.viewport.from && drawnApart(view, anchor) && size) {
        floor = Math.max(floor, view.lineBlockAt(anchor.from).top + size.layoutTop - (size.marginTop ?? 0) - first.top);
      }
      // Drawn, or below the first drawn line.
      if (anchor.to >= view.viewport.from || drawnApart(view, anchor) || !size) {
        continue;
      }
      const ref = size.refPos !== undefined && size.refPos <= view.state.doc.length ? view.lineBlockAt(size.refPos).top : null;
      const plan = planProxy(standInAnchorTop(size, view.lineBlockAt(anchor.from).top, ref), size, first.top);
      if (plan) {
        planned.push({ anchor, side: size.side, plan: liveProxy(plan, size.marginTop ?? 0) });
      }
    }
    // Drawn in this order, each below the ones before it.
    const plans = stackProxies(planned.map(({ plan }) => plan), floor);
    // In front of the wrap gaps at the same position (side -1): the float starts at the line's top.
    return planned.map(({ anchor, side }, index) => Decoration.widget({
      widget: new ProxyWidget(this.source, anchor, sourcePath, side, plans[index]), block: true, side: -2,
    }).range(first.from));
  }
}

/**
 * Whether CodeMirror draws the anchor apart from its viewport: it always draws the lines the main
 * selection starts and ends on. A layout whose source shows while the cursor sits in its first
 * line floats from there; a stand-in would come on top of it, cleared below it by the same float.
 */
function drawnApart(view: EditorView, anchor: WrapAnchor): boolean {
  return onSelectionLine(view, anchor.from, anchor.to);
}

/** Whether `from`..`to` meets a line the main selection starts or ends on. */
function onSelectionLine(view: EditorView, from: number, to = from): boolean {
  const { main } = view.state.selection;
  return [main.anchor, main.head].some((pos) => {
    const line = view.lineBlockAt(pos);
    return line.from <= to && line.to >= from;
  });
}

/** Whether the media in a layout have their sizes, and its Markdown is drawn. */
function isReady(layout: HTMLElement): boolean {
  return layoutIsRendered(layout) && Array.from(layout.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video"))
    .every(media => media.instanceOf(HTMLImageElement) ? media.complete : media.readyState > 0);
}

/**
 * Whether a line block starts with text: a line, possibly behind block widgets (stand-ins, wrap
 * gaps), not a layout's widget.
 */
function startsWithText(block: BlockInfo): boolean {
  const parts = Array.isArray(block.type) ? (block.type as readonly BlockInfo[]) : [block];
  return parts.every((part) => part.type === BlockType.Text || part.type === BlockType.WidgetBefore)
    && parts.some((part) => part.type === BlockType.Text);
}

/** Bottom edge of the margin boxes of the floats inside `el`, in document pixels. */
function floatBottom(el: HTMLElement, docTop: number): number | null {
  let bottom: number | null = null;
  for (const float of Array.from(el.querySelectorAll<HTMLElement>(".vml-layout--wrap, .vml-wrap-proxy__float"))) {
    const edge = float.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(float).marginBottom) || 0) - docTop;
    bottom = bottom === null ? edge : Math.max(bottom, edge);
  }
  return bottom;
}

function currentGaps(state: EditorState, from: number, to: number): Gap[] {
  const gaps: Gap[] = [];
  state.field(gapField, false)?.between(from, to, (pos, _to, value) => {
    const { widget } = value.spec as { widget?: unknown };
    if (widget instanceof GapWidget) {
      gaps.push({ pos, height: widget.height });
    }
  });
  return gaps;
}

function sameGaps(a: readonly Gap[], b: readonly Gap[]): boolean {
  return a.length === b.length && a.every((gap, index) => gap.pos === b[index]?.pos && gap.height === b[index]?.height);
}

function signature(anchors: readonly WrapAnchor[]): string {
  return anchors.map((anchor) => `${anchor.from}:${anchor.to}:${anchor.key}`).join(",");
}
