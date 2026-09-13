import type { WrapSide } from "../format/v2.ts";
import { planProxy, type FloatSize, type ProxyPlan } from "../layout/wrapGaps.ts";

/**
 * Reading view keeps only the sections near the viewport in the page (docs/DESIGN.md, section 4.1).
 * Obsidian measures each section as the distance to the next one, so the section of a wrapped layout
 * is zero high, and it leaves the page as soon as the edge of the kept part passes its top, while the
 * text beside its float may stay: that text would lose its wrap and move everything after it.
 *
 * While the layout's section is in the page, each section beside its float gets a hidden stand-in for
 * the part of the float next to it. CSS shows the stand-in of the first such section once nothing
 * before it (the layout's section, or another section with a stand-in) is in the page any more. That
 * happens the moment Obsidian takes the layout's section out, before it measures the sections it
 * keeps, so it measures them with their wrap. Its own bookkeeping counts the layout's section as zero
 * high either way.
 */

interface Placed {
  host: HTMLElement;
  plan: ProxyPlan;
}

interface Tracked {
  id: string;
  section: HTMLElement;
  layout: HTMLElement;
  side: WrapSide;
  placed: Placed[];
  /** Size of the float the stand-ins were made for. */
  size: string;
  resize: ResizeObserver;
}

const keepers = new WeakMap<HTMLElement, Keeper>();
let nextId = 0;

/** Keeps the float of `layout`, drawn in the reading-view section `section`. Returns what stops it. */
export function keepWrapped(section: HTMLElement, layout: HTMLElement, side: WrapSide): () => void {
  let keeper: Keeper | null = null;
  let tracked: Tracked | null = null;
  // Sections are drawn before Obsidian puts them in the page, which one is only known once it has.
  const stopWatching = section.onNodeInserted(() => {
    const sizer = section.parentElement;
    if (tracked || !sizer?.hasClass("markdown-preview-sizer")) {
      return;
    }
    keeper = keepers.get(sizer) ?? new Keeper(sizer);
    tracked = keeper.add(section, layout, side);
  });
  return () => {
    stopWatching();
    if (keeper && tracked) {
      keeper.remove(tracked);
    }
  };
}

class Keeper {
  private readonly sizer: HTMLElement;
  private readonly tracked = new Set<Tracked>();
  // Obsidian adds and removes whole sections as the note scrolls.
  private readonly observer: MutationObserver;

  constructor(sizer: HTMLElement) {
    this.sizer = sizer;
    this.observer = new MutationObserver(() => this.update());
    this.observer.observe(sizer, { childList: true });
    keepers.set(sizer, this);
  }

  add(section: HTMLElement, layout: HTMLElement, side: WrapSide): Tracked {
    nextId += 1;
    const tracked: Tracked = { id: String(nextId), section, layout, side, placed: [], size: "", resize: new ResizeObserver(() => this.update()) };
    section.addClass("vml-rv-anchor");
    // The float changes size once its images load.
    tracked.resize.observe(layout);
    this.tracked.add(tracked);
    this.update();
    return tracked;
  }

  remove(tracked: Tracked): void {
    tracked.resize.disconnect();
    clear(tracked);
    tracked.section.removeClass("vml-rv-anchor");
    this.tracked.delete(tracked);
    if (this.tracked.size === 0) {
      this.observer.disconnect();
      keepers.delete(this.sizer);
    }
  }

  private update(): void {
    for (const tracked of this.tracked) {
      // Out of the page, the stand-ins already in place take over, by CSS.
      if (tracked.section.parentElement === this.sizer) {
        refresh(tracked);
      }
    }
  }
}

/** Puts a hidden stand-in in each section beside the float, measured while the float is in the page. */
function refresh(tracked: Tracked): void {
  const rect = tracked.layout.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }
  const style = getComputedStyle(tracked.layout);
  const size: FloatSize = {
    side: tracked.side,
    layoutTop: 0,
    layoutHeight: rect.height,
    width: rect.width,
    margin: parseFloat(tracked.side === "left" ? style.marginRight : style.marginLeft) || 0,
    marginBottom: parseFloat(style.marginBottom) || 0,
  };

  const placed: Placed[] = [];
  for (let el = tracked.section.nextElementSibling; el?.instanceOf(HTMLElement); el = el.nextElementSibling) {
    const plan = planProxy(rect.top, size, el.getBoundingClientRect().top);
    if (!plan) {
      break;
    }
    placed.push({ host: el, plan });
  }

  const sizeKey = [size.width, size.layoutHeight, size.margin, size.marginBottom].map((value) => Math.round(value)).join(",");
  const same = sizeKey === tracked.size
    && placed.length === tracked.placed.length
    && placed.every((entry, index) => {
      const before = tracked.placed[index];
      return before?.host === entry.host && samePlan(before.plan, entry.plan);
    });
  if (same) {
    return;
  }

  clear(tracked);
  for (const { host, plan } of placed) {
    host.addClass("vml-rv-host");
    host.prepend(standIn(tracked, size, plan));
  }
  tracked.placed = placed;
  tracked.size = sizeKey;
}

function standIn(tracked: Tracked, size: FloatSize, plan: ProxyPlan): HTMLElement {
  const { side } = tracked;
  const el = createDiv({ cls: "vml-rv-proxy", attr: { "data-vml-float": tracked.id } });
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
  const copy = tracked.layout.cloneNode(true);
  if (copy.instanceOf(HTMLElement)) {
    // For display only: a copy has no listeners behind its handles.
    copy.removeClass("vml-layout--interactive");
    copy.querySelectorAll(".vml-handle").forEach((handle) => handle.remove());
    content.appendChild(copy);
  }
  return el;
}

function clear(tracked: Tracked): void {
  for (const { host } of tracked.placed) {
    host.querySelectorAll(`:scope > .vml-rv-proxy[data-vml-float="${tracked.id}"]`).forEach((el) => el.remove());
    if (!host.querySelector(":scope > .vml-rv-proxy")) {
      host.removeClass("vml-rv-host");
    }
  }
  tracked.placed = [];
  tracked.size = "";
}

function samePlan(a: ProxyPlan, b: ProxyPlan): boolean {
  return Math.round(a.sandbag) === Math.round(b.sandbag) && Math.round(a.height) === Math.round(b.height) && Math.round(a.shift) === Math.round(b.shift);
}
