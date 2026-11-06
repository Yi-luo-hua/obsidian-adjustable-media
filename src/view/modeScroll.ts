import { MarkdownView, type Plugin } from "obsidian";
import { findV2Blocks, isDrawable } from "../format/v2.ts";
import { afterReadingScroll, scrollReadingToLine } from "./obsidianInternals.ts";

interface Anchor { quote: string; offset: number; text: string; line: number }
const ignored = ".mod-ui, .vml-layout, .vml-rv-proxy, .vml-wrap-proxy, .cm-formatting, .list-bullet, .list-collapse-indicator";
const targets = new WeakMap<HTMLElement, { quote: string; node: Text; at: number; value: string }>();

function surface(view: MarkdownView): { root: HTMLElement; scroller: HTMLElement } | null {
  const root = view.getMode() === "source" ? view.contentEl.querySelector<HTMLElement>(".cm-content")
    : view.previewMode.containerEl.querySelector<HTMLElement>(".markdown-preview-sizer");
  const scroller = view.getMode() === "source" ? view.contentEl.querySelector<HTMLElement>(".cm-scroller")
    : view.previewMode.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
  return root && scroller ? { root, scroller } : null;
}

function textNodes(root: HTMLElement, viewport?: DOMRect): Text[] {
  const roots = viewport ? Array.from(root.children).filter(el => {
    if (el.matches(ignored)) return false;
    const rect = el.getBoundingClientRect();
    return rect.bottom >= viewport.top && rect.top <= viewport.bottom;
  }) : [root];
  const nodes: Text[] = [];
  for (const part of roots) {
    const walker = root.doc.createTreeWalker(part, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.trim() && !node.parentElement?.closest(ignored)) nodes.push(node as Text);
    }
  }
  return nodes;
}

function characterTop(node: Text, at: number): number {
  const range = node.ownerDocument.createRange();
  range.setStart(node, at); range.setEnd(node, at + 1);
  return range.getBoundingClientRect().top;
}

/** Capture actual visible text, rather than the fraction of a Markdown section above the viewport. */
function capture(view: MarkdownView): Anchor | null {
  const own = surface(view);
  if (!own || own.root.clientWidth === 0) return null;
  const text = view.getViewData();
  const viewport = own.scroller.getBoundingClientRect();
  let best: Anchor | null = null, distance = Number.POSITIVE_INFINITY;
  for (const node of textNodes(own.root, viewport)) {
    const value = node.data;
    const last = characterTop(node, value.length - 1);
    if (last < viewport.top) continue;
    const first = value.length === 1 ? last : characterTop(node, 0);
    if (first > viewport.bottom || first >= viewport.top + distance) continue;
    let from = 0, to = value.length - 1;
    while (first < viewport.top && from < to) {
      const mid = Math.floor((from + to) / 2);
      if (characterTop(node, mid) < viewport.top) from = mid + 1;
      else to = mid;
    }
    const part = value.slice(from, from + 40).split("\n")[0];
    const quote = part.trim();
    if (!quote) continue;
    const position = text.indexOf(quote);
    if (position < 0 || text.indexOf(quote, position + 1) >= 0) continue;
    const at = from + part.indexOf(quote);
    const top = at === 0 ? first : characterTop(node, at);
    if (top < viewport.top || top > viewport.bottom || top - viewport.top >= distance) continue;
    distance = top - viewport.top;
    best = { quote, offset: distance, text, line: text.slice(0, position).split("\n").length - 1 };
    targets.set(own.root, { quote, node, at, value });
  }
  return best;
}

function restore(view: MarkdownView, anchor: Anchor): boolean {
  const own = surface(view);
  if (!own || own.root.clientWidth === 0 || view.getViewData() !== anchor.text) return false;
  const move = (node: Text, at: number): boolean => {
    const delta = characterTop(node, at) - own.scroller.getBoundingClientRect().top - anchor.offset;
    if (Math.abs(delta) > 0.5) own.scroller.scrollTop += delta;
    return true;
  };
  const target = targets.get(own.root);
  if (target?.quote === anchor.quote && target.node.isConnected && own.root.contains(target.node) && target.node.data === target.value) {
    return move(target.node, target.at);
  }
  const nodes = textNodes(own.root), text = nodes.map(node => node.data).join("");
  const at = text.indexOf(anchor.quote);
  if (at < 0 || text.indexOf(anchor.quote, at + 1) >= 0) return false;
  let offset = at;
  for (const node of nodes) {
    if (offset >= node.length) { offset -= node.length; continue; }
    targets.set(own.root, { quote: anchor.quote, node, at: offset, value: node.data });
    return move(node, offset);
  }
  return false;
}

/** Keep the same text at the same screen height while the two native modes finish rendering. */
export function registerModeScroll(plugin: Plugin): void {
  const panes = new Map<MarkdownView, { file: MarkdownView["file"]; update: () => void; stop: () => void }>();
  const documents = new WeakMap<MarkdownView, { file: MarkdownView["file"]; text: string; enabled: boolean }>();
  const enabled = (view: MarkdownView): boolean => {
    const text = view.getViewData(), previous = documents.get(view);
    if (previous?.file === view.file && previous.text === text) return previous.enabled;
    const value = text.includes("<!-- vml") && findV2Blocks(text.split("\n")).some(isDrawable);
    documents.set(view, { file: view.file, text, enabled: value });
    return value;
  };
  const refresh = (): void => {
    const views = new Set(plugin.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView));
    for (const [view, pane] of panes) {
      if (!views.has(view) || view.file !== pane.file || !enabled(view)) { pane.stop(); panes.delete(view); }
    }
    for (const view of views) {
      if (panes.has(view) || !view.file) continue;
      if (!enabled(view)) continue;
      const win = view.containerEl.win;
      view.previewMode.containerEl.addClass("vml-reading-parity");
      let mode = view.getMode(), anchor: Anchor | null = null, pending: Anchor | null = null, frame = 0, hinted = false;
      const schedule = (): void => {
        if (frame) return;
        frame = win.requestAnimationFrame(() => {
          frame = 0;
          if (mode !== view.getMode()) return;
          if (pending) {
            if (view.getViewData() !== pending.text) { pending = null; anchor = capture(view); return; }
            if (!restore(view, pending) && !hinted) {
              if (mode === "preview") hinted = scrollReadingToLine(view, pending.line);
              else { hinted = true; view.setEphemeralState({ scroll: pending.line }); }
            }
          } else anchor = capture(view);
        });
      };
      const input = (): void => { pending = null; anchor = capture(view); };
      const changeMode = (): boolean => {
        if (mode !== view.getMode()) {
          mode = view.getMode(); pending = anchor; hinted = false;
          return true;
        }
        return false;
      };
      const stopNativeScroll = afterReadingScroll(view, () => {
        changeMode();
        if (pending) restore(view, pending);
      });
      const mutation = new (win as Window & typeof window).MutationObserver(() => {
        if (changeMode() && pending) restore(view, pending);
        if (pending) schedule();
      });
      mutation.observe(view.containerEl, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-mode", "class", "style"] });
      view.containerEl.addEventListener("scroll", schedule, true);
      view.containerEl.addEventListener("load", schedule, true);
      view.containerEl.addEventListener("pointerdown", input, true);
      view.containerEl.addEventListener("keydown", input, true);
      view.containerEl.addEventListener("wheel", input, { capture: true, passive: true });
      view.containerEl.addEventListener("touchstart", input, { capture: true, passive: true });
      schedule();
      panes.set(view, { file: view.file, update: schedule, stop: () => {
        view.previewMode.containerEl.removeClass("vml-reading-parity");
        stopNativeScroll();
        win.cancelAnimationFrame(frame); mutation.disconnect();
        view.containerEl.removeEventListener("scroll", schedule, true);
        view.containerEl.removeEventListener("load", schedule, true);
        view.containerEl.removeEventListener("pointerdown", input, true);
        view.containerEl.removeEventListener("keydown", input, true);
        view.containerEl.removeEventListener("wheel", input, true);
        view.containerEl.removeEventListener("touchstart", input, true);
      } });
    }
  };
  plugin.registerEvent(plugin.app.workspace.on("layout-change", refresh));
  plugin.registerEvent(plugin.app.workspace.on("file-open", refresh));
  plugin.registerEvent(plugin.app.workspace.on("editor-change", (_editor, info) => {
    refresh();
    if (info instanceof MarkdownView) panes.get(info)?.update();
  }));
  plugin.app.workspace.onLayoutReady(refresh);
  plugin.register(() => { for (const pane of panes.values()) pane.stop(); panes.clear(); });
}
