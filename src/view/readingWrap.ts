import type { App } from "obsidian";

import type { WrapSide } from "../format/v2.ts";
import { planProxy, type FloatSize, type ProxyPlan } from "../layout/wrapGaps.ts";
import { readingSections, remeasureSections, type ReadingSection, type ReadingSections } from "./obsidianInternals.ts";

/**
 * Reading view keeps only the sections near the viewport in the page (docs/DESIGN.md, section 4.1).
 * Obsidian measures each section as the distance to the next one, so the section of a wrapped layout
 * is zero high, and it leaves the page as soon as the edge of the kept part passes its top, while the
 * text beside its float may stay: that text would lose its wrap and move everything after it.
 *
 * So each section beside a float holds a hidden stand-in for the part of the float next to it. CSS
 * shows the stand-ins of such a section when the section right before it in the page is neither the
 * layout's section nor another section with a stand-in: the first of them still in the page. That
 * happens the moment Obsidian takes the layout's section out, before it measures the sections it
 * keeps, so it measures them with their wrap. Its own bookkeeping counts the layout's section as zero
 * high either way. Only the section right before counts: Obsidian measures a batch of sections it has
 * just drawn in the page along with those it shows, with a gap between, and those it shows may hold
 * another layout's sections.
 *
 * While the layout's section is in the page, the stand-ins of the sections in the page with it are
 * planned from where they are drawn (the keeper below). The others are planned from the heights
 * Obsidian has measured for the sections between the layout's and theirs, before Obsidian measures or
 * shows them: after a note opens, Obsidian draws all its sections in the background, a batch at a
 * time, and puts each batch in the page just long enough to measure it. A batch can hold text beside a
 * float without the layout's section, and scrolling up into a part of the note never shown shows that
 * text before the layout's section; without a stand-in, it would be measured or shown unwrapped and
 * the note would jump once the float comes. Those heights come from Obsidian's renderer
 * (obsidianInternals.ts); where they cannot be read, only the keeper's stand-ins are made.
 *
 * Each time Obsidian changes which sections it shows, it measures all it shows right after taking the
 * others out, in one task. When a note opens part way down, that task is the one that first draws the
 * layout's section, before any stand-in can be planned, and the text beside the float is measured
 * unwrapped. So once the stand-ins are planned, the sections in the page are checked against the
 * heights Obsidian keeps for them. Where they differ, the stand-ins are planned again from the heights
 * drawn, and Obsidian measures those sections again; until it has, they count at the heights drawn.
 *
 * A float's size counts only once its images and videos have theirs, given up front or known once
 * loaded. Until then its stand-ins wait; when the media have loaded, they are planned, and Obsidian
 * measures the sections beside the float again.
 */

/** A wrapped layout drawn in reading view. */
interface Float {
  /** In the order the layouts are drawn in, which is the order of their floats in a note. */
  id: number;
  app: App;
  section: HTMLElement;
  layout: HTMLElement;
  side: WrapSide;
  /** Its size, and how wide the page was when it was measured. */
  size: { at: number; value: Measured } | null;
  /** The sections holding a stand-in for it. */
  hosts: Set<HTMLElement>;
  /** Whether its stand-ins wait for its media to have a size. */
  waiting: boolean;
}

interface Tracked {
  float: Float;
  resize: ResizeObserver;
}

type Media = HTMLImageElement | HTMLVideoElement;

/** A float's size, with its top margin: below the floats before it on its side, its margin starts where they end. */
type Measured = FloatSize & { marginTop: number };

const floats = new WeakMap<HTMLElement, Float>();
const keepers = new WeakMap<HTMLElement, Keeper>();
/** Pages whose stand-ins are planned again once Obsidian has measured what it draws now. */
const pending = new WeakSet<HTMLElement>();
/** For each section Obsidian was asked to measure again, the height it kept and the height drawn then. */
const asked = new WeakMap<HTMLElement, string>();
/**
 * The sections Obsidian is measuring again at the plugin's request, with the height each was drawn at
 * and how wide the page was then: until Obsidian has measured one, it counts at that height.
 */
const remeasuring = new WeakMap<HTMLElement, { height: number; width: number }>();
/** A table's native scroll box must not contain the float that stands beside the table. */
const tableHosts = new WeakMap<HTMLElement, { box: HTMLElement }>();
let nextId = 0;

/** Keeps the float of `layout`, drawn in the reading-view section `section`. Returns what stops it. */
export function keepWrapped(app: App, section: HTMLElement, layout: HTMLElement, side: WrapSide): () => void {
  nextId += 1;
  const float: Float = { id: nextId, app, section, layout, side, size: null, hosts: new Set(), waiting: false };
  floats.set(section, float);
  // Marked at once: Obsidian may put the section in the page and measure it before telling anyone.
  section.addClass("vml-rv-anchor");
  let keeper: Keeper | null = null;
  let tracked: Tracked | null = null;
  // Sections are drawn before Obsidian puts them in the page, which one is only known once it has.
  const stopWatching = section.onNodeInserted(() => {
    const sizer = section.parentElement;
    if (tracked || !sizer?.hasClass("markdown-preview-sizer")) {
      return;
    }
    keeper = keepers.get(sizer) ?? new Keeper(app, sizer);
    tracked = keeper.add(float);
  });
  return () => {
    stopWatching();
    if (keeper && tracked) {
      keeper.remove(tracked);
    }
    for (const host of Array.from(float.hosts)) {
      unplace(host, float);
    }
    section.removeClass("vml-rv-anchor");
    floats.delete(section);
  };
}

/**
 * Plans the stand-ins of the reading view that draws `section` from the heights Obsidian has measured:
 * now, before Obsidian measures `section`, and again once it has measured what it draws with it.
 */
export function keepWrapsBeside(app: App, section: HTMLElement): void {
  const reading = readingSections(app, section);
  if (!reading) {
    return;
  }
  planFromHeights(reading);
  const { sizer } = reading;
  if (!pending.has(sizer)) {
    pending.add(sizer);
    // Obsidian measures the sections it draws in the same task, once it has drawn them all.
    queueMicrotask(() => {
      pending.delete(sizer);
      const measured = readingSections(app, section);
      if (measured) {
        settle(app, measured);
      }
    });
  }
}

class Keeper {
  private readonly app: App;
  private readonly sizer: HTMLElement;
  private readonly tracked = new Set<Tracked>();
  // Obsidian adds and removes whole sections as the note scrolls.
  private readonly observer: MutationObserver;

  constructor(app: App, sizer: HTMLElement) {
    this.app = app;
    this.sizer = sizer;
    // The box a float's copy is measured in comes and goes too, and is no reason to plan again.
    this.observer = new MutationObserver((records) => {
      const measuring = (node: Node): boolean => node.instanceOf(HTMLElement) && node.hasClass("vml-rv-measure");
      if (!records.every((record) => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].every(measuring))) {
        this.update();
      }
    });
    this.observer.observe(sizer, { childList: true });
    keepers.set(sizer, this);
  }

  add(float: Float): Tracked {
    const tracked: Tracked = { float, resize: new ResizeObserver(() => this.update()) };
    // The float changes size once its images load.
    tracked.resize.observe(float.layout);
    this.tracked.add(tracked);
    this.update();
    return tracked;
  }

  remove(tracked: Tracked): void {
    tracked.resize.disconnect();
    this.tracked.delete(tracked);
    if (this.tracked.size === 0) {
      this.observer.disconnect();
      keepers.delete(this.sizer);
    }
  }

  private update(): void {
    let any: Float | null = null;
    for (const { float } of this.tracked) {
      any = float;
      // Out of the page, the stand-ins already in place take over, by CSS.
      if (float.section.parentElement === this.sizer) {
        planInPage(float, this.sizer);
      }
    }
    // The sections that just left the page keep stand-ins planned from what Obsidian measured.
    const reading = any ? readingSections(this.app, any.section) : null;
    if (reading) {
      settle(this.app, reading);
    }
  }
}

/** Plans the stand-ins of the sections in the page after `float`'s section, from where they are drawn. */
function planInPage(float: Float, sizer: HTMLElement): void {
  const size = measureFloat(float, float.section, float.layout);
  if (!size) {
    return;
  }
  // Measured before its media have a size, the float is not as high as it will be: not kept.
  if (mediaSized(float.layout)) {
    float.size = { at: sizer.clientWidth, value: size };
  }
  const top = float.section.getBoundingClientRect().top;
  let reaches = true;
  for (let el = float.section.nextElementSibling; el?.instanceOf(HTMLElement); el = el.nextElementSibling) {
    const plan = reaches ? planProxy(top, size, el.getBoundingClientRect().top) : null;
    if (plan) {
      place(el, float, size, plan);
    } else {
      reaches = false;
      if (float.hosts.has(el)) {
        unplace(el, float);
      }
    }
  }
}

/**
 * Plans the stand-ins of the sections after each wrapped layout from the heights Obsidian measured for
 * the sections before them, as far as those are known; for the sections in `drawn`, from the heights
 * they are drawn at instead. As in the page, a float starts below the floats before it on its side.
 * The sections in the page next to a layout's section in the page are left to its keeper. Returns how
 * far each float reaches: the last section beside it.
 */
function planFromHeights({ sections, sizer }: ReadingSections, drawn?: ReadonlyMap<number, number>): Map<Float, number> {
  const reach = new Map<Float, number>();
  // Where each section starts, counted from the first, as long as all before it are measured.
  const tops: number[] = [];
  const width = sizer.clientWidth;
  let top = 0;
  sections.forEach((section, index) => {
    tops.push(top);
    if (section.shown !== false) {
      top += drawn?.get(index) ?? knownHeight(section, width);
    }
  });
  // Where the floats so far end on each side.
  const ends: Record<WrapSide, number> = { left: Number.NEGATIVE_INFINITY, right: Number.NEGATIVE_INFINITY };
  sections.forEach((anchor, index) => {
    const float = floats.get(anchor.el);
    const anchorTop = tops[index] ?? Number.NaN;
    if (float && anchor.shown === false) {
      // A folded layout must not leave a visible copy beside the next unfolded heading.
      for (const host of Array.from(float.hosts)) {
        unplace(host, float);
      }
      return;
    }
    if (!float || !anchor.rendered || Number.isNaN(anchorTop)) {
      return;
    }
    const measured = floatSize(float, sizer);
    if (!measured) {
      return;
    }
    const size: FloatSize = { ...measured, layoutTop: Math.max(measured.layoutTop, ends[float.side] - anchorTop + measured.marginTop) };
    ends[float.side] = Math.max(ends[float.side], anchorTop + size.layoutTop + size.layoutHeight + size.marginBottom);
    const keptInPage = (el: HTMLElement): boolean => float.section.parentElement === sizer && el.parentElement === sizer;
    for (let i = index + 1; i < sections.length; i += 1) {
      const host = sections[i];
      const hostTop = tops[i] ?? Number.NaN;
      if (host?.shown === false) {
        unplace(host.el, float);
        continue;
      }
      if (!host || Number.isNaN(hostTop)) {
        return;
      }
      const plan = planProxy(0, size, hostTop - anchorTop);
      if (!plan) {
        // Past the float: what stood in for it further down, planned before, goes.
        for (const later of sections.slice(i)) {
          if (float.hosts.has(later.el) && !keptInPage(later.el)) {
            unplace(later.el, float);
          }
        }
        return;
      }
      reach.set(float, i);
      if (host.rendered && !keptInPage(host.el)) {
        place(host.el, float, size, plan);
      }
    }
  });
  return reach;
}

/**
 * Plans the stand-ins from the heights Obsidian measured, then checks the sections in the page against
 * those heights: Obsidian may have measured them before their stand-ins were in place. Where they
 * differ, the stand-ins are planned again from the heights drawn, and Obsidian measures those sections
 * again. Obsidian draws the sections it has not drawn yet before it measures these, and the plugin
 * plans their stand-ins from these, so until then they count at the heights drawn. Obsidian is not
 * asked twice about a section with the same two heights until it has been seen to measure it as
 * drawn, so a section it keeps measuring otherwise does not have it measure again and again.
 */
function settle(app: App, reading: ReadingSections): void {
  planFromHeights(reading);
  const drawn = drawnHeights(reading);
  const stale: number[] = [];
  for (const [index, height] of drawn) {
    const section = reading.sections[index];
    if (!section?.computed) {
      continue;
    }
    if (Math.abs(section.height - height) < 1) {
      asked.delete(section.el);
      continue;
    }
    const key = `${Math.round(section.height)}:${height}`;
    if (asked.get(section.el) !== key) {
      asked.set(section.el, key);
      stale.push(index);
    }
  }
  const first = stale[0];
  const last = stale[stale.length - 1];
  const el = first === undefined ? undefined : reading.sections[first]?.el;
  if (first === undefined || last === undefined || !el) {
    return;
  }
  planFromHeights(reading, drawn);
  const width = reading.sizer.clientWidth;
  for (let index = first; index <= last; index += 1) {
    const section = reading.sections[index];
    const height = drawn.get(index);
    if (section && height !== undefined) {
      remeasuring.set(section.el, { height, width });
    }
  }
  remeasureSections(app, el, first, last);
}

/**
 * The height Obsidian measured for `section`; while it measures it again at the plugin's request, the
 * height it was drawn at, as long as the page is as wide as then; NaN when neither is known.
 */
function knownHeight(section: ReadingSection, width: number): number {
  if (section.computed) {
    remeasuring.delete(section.el);
    return section.height;
  }
  const pending = remeasuring.get(section.el);
  return pending?.width === width ? pending.height : Number.NaN;
}

/**
 * How high the sections in the page are drawn, by their index, measured as Obsidian measures them: to
 * the next section's top. The last one in the page has none after it and is left out, and so are the
 * sections Obsidian has not drawn yet: they are in the page empty, and it does not measure them.
 */
function drawnHeights({ sections, sizer }: ReadingSections): Map<number, number> {
  const els = new Set(sections.map((section) => section.el));
  const drawn = new Map<number, number>();
  sections.forEach(({ el, rendered }, index) => {
    const next = el.nextElementSibling;
    if (rendered && el.parentElement === sizer && next?.instanceOf(HTMLElement) && els.has(next)) {
      drawn.set(index, next.offsetTop - el.offsetTop);
    }
  });
  return drawn;
}

/**
 * The size of `float` in the page `sizer`, measured again only when the page's width changes; null
 * while its media have no size yet.
 */
function floatSize(float: Float, sizer: HTMLElement): Measured | null {
  const at = sizer.clientWidth;
  if (float.size?.at === at) {
    return float.size.value;
  }
  if (!mediaSized(float.layout)) {
    waitForMedia(float, float.layout);
    return null;
  }
  let value: Measured | null = null;
  if (float.section.parentElement === sizer) {
    value = measureFloat(float, float.section, float.layout);
  } else {
    // The layout's section may never have been in the page: a copy is, just long enough to measure it.
    const copy = float.section.cloneNode(true);
    const layout = copy.instanceOf(HTMLElement) ? copy.querySelector<HTMLElement>(":scope > .vml-layout") : null;
    if (copy.instanceOf(HTMLElement) && layout) {
      // The copy's media load anew: they take the size the layout's own already have.
      const own = Array.from(float.layout.querySelectorAll<Media>("img, video"));
      Array.from(layout.querySelectorAll<Media>("img, video")).forEach((media, index) => {
        const source = own[index];
        const [width, height] = source ? naturalSize(source) : [0, 0];
        if (width > 0 && height > 0 && !(media.hasAttribute("width") && media.hasAttribute("height"))) {
          media.setAttribute("width", String(width));
          media.setAttribute("height", String(height));
        }
      });
      const box = sizer.createDiv({ cls: "vml-rv-measure" });
      box.appendChild(copy);
      value = measureFloat(float, copy, layout);
      box.remove();
    }
  }
  if (value) {
    float.size = { at, value };
  }
  return value;
}

function measureFloat(float: Float, section: HTMLElement, layout: HTMLElement): Measured | null {
  const rect = layout.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const style = layout.win.getComputedStyle(layout);
  return {
    side: float.side,
    layoutTop: rect.top - section.getBoundingClientRect().top,
    layoutHeight: rect.height,
    width: rect.width,
    margin: parseFloat(float.side === "left" ? style.marginRight : style.marginLeft) || 0,
    marginTop: parseFloat(style.marginTop) || 0,
    marginBottom: parseFloat(style.marginBottom) || 0,
  };
}

/** Whether every image and video in `root` has its size, given up front or known since it loaded. */
function mediaSized(root: HTMLElement): boolean {
  return Array.from(root.querySelectorAll<Media>("img, video")).every(sized);
}

function naturalSize(media: Media): [number, number] {
  return media.instanceOf(HTMLImageElement) ? [media.naturalWidth, media.naturalHeight] : [media.videoWidth, media.videoHeight];
}

function sized(media: Media): boolean {
  if (media.hasAttribute("width") && media.hasAttribute("height")) {
    return true;
  }
  // One that fails to load keeps the size it has.
  return media.instanceOf(HTMLImageElement) ? media.complete : media.readyState >= 1 || media.error !== null;
}

/**
 * Plans `float`'s stand-ins once the media in `root` without a size yet have one, and has Obsidian
 * measure the sections beside it again: they were measured without them.
 */
function waitForMedia(float: Float, root: HTMLElement): void {
  if (float.waiting) {
    return;
  }
  const unsized = Array.from(root.querySelectorAll<Media>("img, video")).filter((media) => !sized(media));
  if (unsized.length === 0) {
    return;
  }
  float.waiting = true;
  let left = unsized.length;
  for (const media of unsized) {
    let seen = false;
    const loaded = (): void => {
      if (seen) {
        return;
      }
      seen = true;
      left -= 1;
      if (left === 0) {
        float.waiting = false;
        replan(float);
      }
    };
    for (const type of media.instanceOf(HTMLImageElement) ? ["load", "error"] : ["loadedmetadata", "error"]) {
      media.addEventListener(type, loaded, { once: true });
    }
  }
}

function replan(float: Float): void {
  const reading = floats.get(float.section) === float ? readingSections(float.app, float.section) : null;
  if (!reading) {
    return;
  }
  float.size = null;
  if (!floatSize(float, reading.sizer)) {
    return;
  }
  const reach = planFromHeights(reading);
  const index = reading.sections.findIndex((section) => section.el === float.section);
  if (index < 0) {
    return;
  }
  // As far as the float reaches, and the floats stacked below it on its side.
  let end = reach.get(float) ?? index;
  for (const [other, last] of reach) {
    const start = reading.sections.findIndex((section) => section.el === other.section);
    if (other.side === float.side && start > index && start <= end) {
      end = Math.max(end, last);
    }
  }
  remeasureSections(float.app, float.section, index, end);
}

/** Puts `float`'s stand-in in `host`, in the order of the floats, unless the same one is there. */
function place(host: HTMLElement, float: Float, size: FloatSize, plan: ProxyPlan): void {
  prepareTableHost(host);
  const key = [size.width, size.layoutHeight, size.margin, size.marginBottom, plan.sandbag, plan.height, plan.shift]
    .map((value) => Math.round(value))
    .join(",");
  const existing = proxyOf(host, float);
  if (existing?.getAttribute("data-vml-plan") === key) {
    return;
  }
  existing?.remove();
  const children = Array.from(host.children);
  const later = children.find((child) => child.hasClass("vml-rv-proxy") && Number(child.getAttribute("data-vml-float")) > float.id);
  host.insertBefore(standIn(float, size, plan, key), later ?? children.find((child) => !child.hasClass("vml-rv-proxy")) ?? null);
  host.addClass("vml-rv-host");
  float.hosts.add(host);
}

function unplace(host: HTMLElement, float: Float): void {
  proxyOf(host, float)?.remove();
  if (!host.querySelector(":scope > .vml-rv-proxy")) {
    host.removeClass("vml-rv-host");
    restoreTableHost(host);
  }
  float.hosts.delete(host);
}

function prepareTableHost(host: HTMLElement): void {
  if (!host.hasClass("el-table") || tableHosts.has(host)) {
    return;
  }
  const table = host.querySelector<HTMLElement>(":scope > table");
  if (!table) {
    return;
  }
  const box = host.createDiv({ cls: "vml-rv-table-scroll" });
  box.appendChild(table);
  tableHosts.set(host, { box });
  // Obsidian puts overflow-x:auto on the section itself. A float inside that formatting context
  // pushes a wide table down by the float's height. Keep scrolling on the table's own inner box.
  host.addClass("vml-rv-table-host");
}

function restoreTableHost(host: HTMLElement): void {
  const saved = tableHosts.get(host);
  if (!saved) {
    return;
  }
  if (saved.box.parentElement === host) {
    saved.box.replaceWith(...Array.from(saved.box.childNodes));
  }
  host.removeClass("vml-rv-table-host");
  tableHosts.delete(host);
}

function proxyOf(host: HTMLElement, float: Float): HTMLElement | null {
  return host.querySelector<HTMLElement>(`:scope > .vml-rv-proxy[data-vml-float="${float.id}"]`);
}

function standIn(float: Float, size: FloatSize, plan: ProxyPlan, key: string): HTMLElement {
  const { side } = float;
  const el = createDiv({ cls: "vml-rv-proxy", attr: { "data-vml-float": String(float.id), "data-vml-plan": key } });
  if (plan.sandbag > 0) {
    const sandbag = el.createDiv({ cls: `vml-wrap-proxy__sandbag vml-wrap-proxy__sandbag--${side}` });
    sandbag.setCssProps({ "--vml-proxy-sandbag": `${plan.sandbag}px` });
  }
  const box = el.createDiv({ cls: `vml-wrap-proxy__float vml-wrap-proxy__float--${side}` });
  box.setCssProps({
    "--vml-proxy-width": `${size.width}px`,
    "--vml-proxy-height": `${plan.height}px`,
    "--vml-proxy-margin": `${size.margin}px`,
    "--vml-proxy-shift": `${plan.shift}px`,
  });
  const content = box.createDiv({ cls: "vml-wrap-proxy__content" });
  const copy = float.layout.cloneNode(true);
  if (copy.instanceOf(HTMLElement)) {
    // For display only: a copy has no listeners behind its handles.
    copy.removeClass("vml-layout--interactive");
    copy.querySelectorAll(".vml-handle").forEach((handle) => handle.remove());
    content.appendChild(copy);
  }
  return el;
}
