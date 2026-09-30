import { editorInfoField, type App } from "obsidian";
import { StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { BlockType, Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

import type { V2Block } from "../format/v2.ts";
import { isEditable } from "../layout/edits.ts";
import { modelFromBlock } from "../layout/model.ts";
import { planGaps, planProxy, type FlowBox, type FloatSize, type Gap, type ProxyPlan } from "../layout/wrapGaps.ts";
import { layoutIsRendered, renderLayout } from "./layoutView.ts";

/**
 * Live preview around wrapped layouts (docs/DESIGN.md, section 4).
 *
 * A wrapped layout's widget is a zero-height anchor and the layout floats out of it, so the lines
 * beside it are measured with their real heights and CodeMirror's height map stays right. Two things
 * would still break it, and this extension takes care of both:
 * - an element that cannot sit beside a float is pushed below it, by a height no element has; a
 *   spacer in front of it turns the push into a height (see wrapGaps.ts);
 * - CodeMirror draws only part of a long note. When a float's anchor lies above the drawn part but
 *   the float reaches into it, the first drawn line gets a stand-in for the rest of the float, so
 *   the lines beside it keep their wrap and do not jump once the anchor is drawn.
 */

/** A wrapped layout: drawn as a widget, or floating beside its source at the start of its first line. */
export interface WrapAnchor {
  /** The widget's range in the document; for a layout beside its source, the start of its first line. */
  from: number;
  to: number;
  /** Runtime instance and content revision, distinct for identical source blocks. */
  key: string;
  block: V2Block;
}

export interface WrapSource {
  anchors(state: EditorState): readonly WrapAnchor[];
  /** Whether any layout of the note wraps text, drawn or showing its source. */
  hasWraps(state: EditorState): boolean;
  environmentEpoch(state: EditorState): number;
}

interface GapUpdate {
  /** The measured part of the document; its spacers are replaced by `gaps`. */
  from: number;
  to: number;
  gaps: Gap[];
}

const setGaps = StateEffect.define<GapUpdate>();
export const resetWrapGaps = StateEffect.define<null>();

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

class ProxyWidget extends WidgetType {
  private readonly app: App;
  private readonly anchor: WrapAnchor;
  private readonly sourcePath: string;
  private readonly size: FloatSize;
  private readonly plan: ProxyPlan;
  private readonly key: string;

  constructor(app: App, anchor: WrapAnchor, sourcePath: string, size: FloatSize, plan: ProxyPlan) {
    super();
    this.app = app;
    this.anchor = anchor;
    this.sourcePath = sourcePath;
    this.size = size;
    this.plan = plan;
    this.key = [anchor.key, size.side, size.width, size.margin, plan.sandbag, plan.height, plan.shift].map(String).join("\n");
  }

  override eq(other: ProxyWidget): boolean {
    return other.key === this.key;
  }

  toDOM(): HTMLElement {
    const { side, width, margin } = this.size;
    const el = createSpan({ cls: "vml-wrap-proxy" });
    if (this.plan.sandbag > 0) {
      const sandbag = el.createDiv({ cls: `vml-wrap-proxy__sandbag vml-wrap-proxy__sandbag--${side}` });
      sandbag.setCssProps({ "--vml-proxy-sandbag": `${this.plan.sandbag}px` });
    }
    const box = el.createDiv({ cls: `vml-wrap-proxy__float vml-wrap-proxy__float--${side}` });
    box.setCssProps({
      "--vml-proxy-width": `${width}px`,
      "--vml-proxy-height": `${this.plan.height}px`,
      "--vml-proxy-margin": `${margin}px`,
      "--vml-proxy-shift": `${this.plan.shift}px`,
    });
    // The layout itself at the float's width, cut off above the line.
    const content = box.createDiv({ cls: "vml-live-preview vml-live-preview--wrap vml-wrap-proxy__content" });
    const model = { ...modelFromBlock(this.anchor.block), width: null, wrap: null, skip: null, align: null };
    renderLayout(content, { app: this.app, sourcePath: this.sourcePath, model, editable: isEditable(this.anchor.block), warning: null });
    return el;
  }
}

export function wrapGuard(app: App, source: WrapSource): Extension {
  return [
    gapField,
    ViewPlugin.define((view) => new WrapGuard(view, app, source), { decorations: (guard) => guard.decorations }),
  ];
}

const activeGuards = new WeakMap<EditorView, WrapGuard>();

/** An unseen upstream float with no current size keeps the viewport pending. */
export function wrapMeasurementsReady(view: EditorView): boolean {
  return activeGuards.get(view)?.measurementsReady() ?? true;
}

class WrapGuard {
  /** Stand-ins for floats whose anchors are above the drawn part of the note. */
  decorations: DecorationSet = Decoration.none;
  private readonly view: EditorView;
  private readonly app: App;
  private readonly source: WrapSource;
  /** Float sizes by instance and content revision, measured when its anchor is drawn. */
  private readonly sizes = new Map<string, FloatSize>();
  private destroyed = false;
  private serial = 0;
  private epoch: number;
  private readonly resize: ResizeObserver;
  private readonly observed = new Map<HTMLElement, string>();
  private readonly pendingMedia = new Set<string>();
  private pendingUpdate = false;

  constructor(view: EditorView, app: App, source: WrapSource) {
    this.view = view;
    this.app = app;
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
    this.decorations = this.proxies();
    this.measure();
  }

  update(update: ViewUpdate): void {
    const environmentChanged = this.epoch !== this.source.environmentEpoch(update.state);
    if (environmentChanged) { this.epoch = this.source.environmentEpoch(update.state); this.sizes.clear(); this.pendingMedia.clear(); }
    const anchorsChanged = signature(this.source.anchors(update.state)) !== signature(this.source.anchors(update.startState));
    if (update.docChanged || update.viewportChanged || anchorsChanged || environmentChanged || update.transactions.some(tr => tr.effects.some(effect => effect.is(setGaps)))) {
      this.decorations = this.proxies();
    }
    if (update.docChanged || update.viewportChanged || update.heightChanged || update.geometryChanged || anchorsChanged || environmentChanged) {
      this.measure();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.serial++;
    this.resize.disconnect(); this.observed.clear(); this.sizes.clear();
    this.pendingMedia.clear(); activeGuards.delete(this.view);
  }

  measurementsReady(): boolean {
    return !this.pendingUpdate && this.source.anchors(this.view.state).every(anchor => anchor.from > this.view.viewport.to
      || (this.sizes.has(anchor.key) && !this.pendingMedia.has(anchor.key)));
  }

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
    for (const el of this.observed.keys()) if (!view.contentDOM.contains(el)) { this.resize.unobserve(el); this.observed.delete(el); }
    for (const key of this.sizes.keys()) {
      if (!keys.has(key)) {
        this.sizes.delete(key);
      }
    }

    const first = boxes[0];
    const last = boxes[boxes.length - 1];
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
    const ready = layoutIsRendered(layout) && Array.from(layout.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video"))
      .every(media => media.instanceOf(HTMLImageElement) ? media.complete : media.readyState > 0);
    if (ready) this.pendingMedia.delete(anchor.key); else this.pendingMedia.add(anchor.key);
    const side = layout.hasClass("vml-layout--wrap-right") ? "right" : "left";
    this.sizes.set(anchor.key, {
      side,
      layoutTop: rect.top - anchorRect.top,
      layoutHeight: rect.height,
      width: rect.width,
      margin: parseFloat(side === "left" ? style.marginRight : style.marginLeft) || 0,
      marginBottom: parseFloat(style.marginBottom) || 0,
    });
  }

  private proxies(): DecorationSet {
    const view = this.view;
    const anchors = this.source.anchors(view.state);
    const first = view.lineBlockAt(view.viewport.from);
    if (anchors.length === 0 || first.type !== BlockType.Text) {
      return Decoration.none;
    }

    const sourcePath = view.state.field(editorInfoField, false)?.file?.path ?? "";
    const ranges: Array<Range<Decoration>> = [];
    for (const anchor of anchors) {
      const size = this.sizes.get(anchor.key);
      // Drawn, or below the first drawn line.
      if (anchor.to >= view.viewport.from || !size) {
        continue;
      }
      const plan = planProxy(view.lineBlockAt(anchor.from).top, size, first.top);
      if (plan) {
        ranges.push(Decoration.widget({ widget: new ProxyWidget(this.app, anchor, sourcePath, size, plan), side: -1 }).range(first.from));
      }
    }
    return Decoration.set(ranges, true);
  }
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
