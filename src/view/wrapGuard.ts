import { editorInfoField } from "obsidian";
import { StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { BlockType, Decoration, EditorView, ViewPlugin, WidgetType, type BlockInfo, type DecorationSet, type ViewUpdate } from "@codemirror/view";

import type { V2Block } from "../format/v2.ts";
import { modelFromBlock } from "../layout/model.ts";
import { planGaps, planProxy, type FlowBox, type FloatSize, type Gap, type ProxyPlan } from "../layout/wrapGaps.ts";
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
  block: V2Block;
}

export interface WrapSource {
  anchors(state: EditorState): readonly WrapAnchor[];
  /** Whether any layout of the note wraps text, drawn or showing its source. */
  hasWraps(state: EditorState): boolean;
  environmentEpoch(state: EditorState): number;
  /** Draws the layout of `anchor` into `el` with all its interactions, as its own widget would. */
  drawStandIn(el: HTMLElement, view: EditorView, anchor: WrapAnchor, sourcePath: string): void;
  /** Whether `el` keeps its layout for `block`: one of its text columns is being typed in. */
  keepStandIn(el: HTMLElement, block: V2Block): boolean;
  releaseStandIn(el: HTMLElement): void;
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
  private readonly plan: ProxyPlan;
  readonly key: string;

  constructor(source: WrapSource, anchor: WrapAnchor, sourcePath: string, side: FloatSize["side"], plan: ProxyPlan) {
    super();
    this.source = source;
    this.anchor = anchor;
    this.sourcePath = sourcePath;
    this.side = side;
    this.plan = plan;
    this.key = [anchor.key, anchor.from, anchor.block.openLine, side, plan.sandbag, plan.shift].map(String).join("\n");
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
    const same = dom.dataset.key === this.anchor.key && dom.dataset.from === String(this.anchor.from);
    if (!content || !(same || this.source.keepStandIn(content, this.anchor.block))) {
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
    el.dataset.shift = String(this.plan.shift);
    const sandbag = el.querySelector<HTMLElement>(":scope > .vml-wrap-proxy__sandbag");
    sandbag?.toggleClass("vml-wrap-proxy__sandbag--left", this.side === "left");
    sandbag?.toggleClass("vml-wrap-proxy__sandbag--right", this.side === "right");
    sandbag?.setCssProps({ "--vml-proxy-sandbag": `${this.plan.sandbag}px` });
    el.setCssProps({ "--vml-proxy-shift": `${this.plan.shift}px` });
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
   * nothing has measured yet. Where the layout starts stays the same while its anchor, side and skip
   * do, so the stand-in is drawn from there and measured for the rest.
   */
  private readonly latest = new Map<string, { from: number; place: string; size: FloatSize }>();
  private destroyed = false;
  private serial = 0;
  private epoch: number;
  private readonly resize: ResizeObserver;
  private readonly observed = new Map<HTMLElement, string>();
  private readonly pendingMedia = new Set<string>();
  private pendingUpdate = false;
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
    const environmentChanged = this.epoch !== this.source.environmentEpoch(update.state);
    if (environmentChanged) { this.epoch = this.source.environmentEpoch(update.state); this.forgetSizes(); this.pendingMedia.clear(); }
    const anchorsChanged = signature(this.source.anchors(update.state)) !== signature(this.source.anchors(update.startState));
    // A stand-in starts below the first drawn line by what the height map has above it, which a
    // measurement of lines above it may change while the viewport stays.
    if (update.docChanged || update.viewportChanged || update.heightChanged || update.geometryChanged || anchorsChanged || environmentChanged
      || update.transactions.some(tr => tr.effects.some(effect => effect.is(setGaps)))) {
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
  }

  private forgetSizes(): void {
    this.sizes.clear(); this.standInSizes.clear(); this.latest.clear();
  }

  measurementsReady(): boolean {
    return !this.pendingUpdate && this.source.anchors(this.view.state).every(anchor => anchor.from > this.view.viewport.to
      || (this.sizes.has(anchor.key) && !this.pendingMedia.has(anchor.key)));
  }

  mediaChanged(): void { this.measure(); }

  private measure(): void {
    const state = this.view.state;
    if (!this.source.hasWraps(state) && (state.field(gapField, false)?.size ?? 0) === 0) {
      return;
    }
    const serial = ++this.serial;
    this.pendingUpdate = true;
    const doc = state.doc;
    const epoch = this.epoch;
    const viewport = this.view.viewport;
    const current = (): boolean => !this.destroyed && this.serial === serial && this.view.state.doc === doc
      && this.source.environmentEpoch(this.view.state) === epoch && this.view.viewport.from === viewport.from && this.view.viewport.to === viewport.to;
    this.view.requestMeasure({ key: this, read: () => current()
      ? this.source.hasWraps(state) ? this.read() : { from: 0, to: state.doc.length, gaps: [] }
      : null, write: update => this.write(update, current) });
  }

  private read(): GapUpdate | null {
    const view = this.view;
    const docTop = view.documentTop;
    const anchors = this.source.anchors(view.state);
    const previousSizes = JSON.stringify([...this.sizes]);
    const boxes: FlowBox[] = [];

    for (const child of Array.from(view.contentDOM.querySelectorAll<HTMLElement>(":scope > *"))) {
      if (child.hasClass("cm-gap")) {
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
    const elements = boxes.filter((box) => !box.standIn);
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) {
      return null;
    }
    const gaps = planGaps(boxes);
    return sameGaps(gaps, currentGaps(view.state, first.pos, last.pos)) && previousSizes === JSON.stringify([...this.sizes])
      ? null : { from: first.pos, to: last.pos, gaps };
  }

  private write(update: GapUpdate | null, current: () => boolean): void {
    if (!update) {
      if (current()) this.pendingUpdate = false;
      return;
    }
    // A measurement may not dispatch. The spacers change right after it, before the frame is painted.
    queueMicrotask(() => {
      if (current()) {
        this.pendingUpdate = false;
        this.view.dispatch({ effects: setGaps.of(update) });
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
    if (isReady(layout)) this.pendingMedia.delete(anchor.key); else this.pendingMedia.add(anchor.key);
    const side = layout.hasClass("vml-layout--wrap-right") ? "right" : "left";
    this.keep(anchor, {
      side,
      layoutTop: rect.top - anchorRect.top,
      layoutHeight: rect.height,
      width: rect.width,
      margin: parseFloat(side === "left" ? style.marginRight : style.marginLeft) || 0,
      marginBottom: parseFloat(style.marginBottom) || 0,
    });
    this.standInSizes.delete(anchor.key);
  }

  /**
   * Measures the layout a stand-in draws, for a revision its anchor has not been measured in: its
   * height and width are the layout's own; where it starts is known from before.
   */
  private measureStandIn(anchors: readonly WrapAnchor[], host: HTMLElement, layout: HTMLElement): void {
    const anchor = anchors.find((candidate) => candidate.key === host.dataset.key);
    if (!anchor || (this.sizes.has(anchor.key) && !this.standInSizes.has(anchor.key)) || !isReady(layout)) {
      return;
    }
    const known = this.sizes.get(anchor.key) ?? this.carried(anchor);
    if (!known) {
      return;
    }
    const rect = layout.getBoundingClientRect();
    this.keep(anchor, { ...known, side: layout.hasClass("vml-layout--wrap-right") ? "right" : "left", layoutHeight: rect.height, width: rect.width });
    this.standInSizes.add(anchor.key);
  }

  private keep(anchor: WrapAnchor, size: FloatSize): void {
    this.sizes.set(anchor.key, size);
    if (anchor.id !== undefined) {
      this.latest.set(anchor.id, { from: anchor.from, place: placeOf(anchor), size });
    }
  }

  /** The size of an earlier revision of the same layout, while it still starts at the same place. */
  private carried(anchor: WrapAnchor): FloatSize | undefined {
    const latest = anchor.id === undefined ? undefined : this.latest.get(anchor.id);
    return latest && latest.from === anchor.from && latest.place === placeOf(anchor) ? latest.size : undefined;
  }

  /**
   * Plans the stand-ins for the current viewport and sends them to proxyField. A view may not
   * dispatch while it updates, so they follow right after, before the frame is painted.
   */
  private placeProxies(): void {
    const ranges = this.proxies();
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
    const ranges: Array<Range<Decoration>> = [];
    for (const anchor of anchors) {
      const size = this.sizes.get(anchor.key) ?? this.carried(anchor);
      // Drawn, or below the first drawn line.
      if (anchor.to >= view.viewport.from || !size) {
        continue;
      }
      const plan = planProxy(view.lineBlockAt(anchor.from).top, size, first.top);
      if (plan) {
        // In front of the wrap gaps at the same position (side -1): the float starts at the line's top.
        ranges.push(Decoration.widget({ widget: new ProxyWidget(this.source, anchor, sourcePath, size.side, plan), block: true, side: -2 }).range(first.from));
      }
    }
    return ranges;
  }
}

/** Whether the media in a layout have their sizes, and its Markdown is drawn. */
function isReady(layout: HTMLElement): boolean {
  return layoutIsRendered(layout) && Array.from(layout.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video"))
    .every(media => media.instanceOf(HTMLImageElement) ? media.complete : media.readyState > 0);
}

/** What decides where a layout starts beside its anchor. */
function placeOf(anchor: WrapAnchor): string {
  const model = modelFromBlock(anchor.block);
  return `${model.wrap}:${model.skip}`;
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
