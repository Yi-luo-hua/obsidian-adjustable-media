import { MarkdownRenderChild, Notice, editorInfoField, editorLivePreviewField, type App, type Plugin } from "obsidian";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";

import { calloutImages, planCalloutImageWidth, type CalloutImage, type CalloutImages } from "../layout/calloutImages.ts";
import { writeBlockEdits } from "../layout/writeBack.ts";
import { resolveMedia } from "./media.ts";
import { reportWriteError, t } from "./messages.ts";
import { trackPointer } from "./pointer.ts";
import { eventElement } from "./windows.ts";

interface Binding { image: CalloutImage; source: CalloutImages; img: HTMLImageElement }

function roots(el: HTMLElement): HTMLElement[] {
  const candidates = [...(el.matches(".callout") ? [el] : []), ...Array.from(el.querySelectorAll<HTMLElement>(".callout"))];
  return candidates.filter(callout => !callout.parentElement?.closest(".callout, .vml-layout, .markdown-embed"));
}

/** The whole native widget maps to its first source line, so bind all images together in DOM order. */
function bindImages(app: App, root: HTMLElement, source: CalloutImages, path: string): Binding[] {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>(".callout-title img, .callout-content img"))
    .filter(img => !img.closest(".markdown-embed, .vml-layout"));
  if (images.length !== source.images.length || images.some((img, index) =>
    resolveMedia(app, source.images[index].embed, path)?.url !== img.getAttribute("src"))) return [];
  return images.map((img, index) => ({ img, image: source.images[index], source }));
}

function wrapperFor(img: HTMLImageElement): HTMLElement {
  const native = img.parentElement;
  if (native?.matches(".image-embed, .vml-callout-image")) return native;
  const wrapper = img.doc.createElement("span");
  wrapper.addClass("vml-callout-image--wrapper");
  img.replaceWith(wrapper);
  wrapper.append(img);
  return wrapper;
}

function size(wrapper: HTMLElement, width: number | null): void {
  wrapper.toggleClass("vml-callout-image--sized", width !== null);
  wrapper.setCssProps({ "--vml-callout-width": width === null ? "" : `${width * 100}%` });
}

function clear(wrapper: HTMLElement): void {
  wrapper.querySelector(":scope > .vml-callout-image__resize")?.remove();
  wrapper.removeClass("vml-callout-image", "vml-callout-image--sized");
  wrapper.setCssProps({ "--vml-callout-width": "" });
  if (wrapper.hasClass("vml-callout-image--wrapper")) wrapper.replaceWith(...Array.from(wrapper.childNodes));
}

export function calloutImageExtension(app: App): Extension {
  return ViewPlugin.define(view => {
    let bindings = new Map<HTMLElement, Binding>();
    let cancel: (() => void) | null = null;
    let ignoreClick = false;
    let frame = 0;
    let parsedDoc = view.state.doc;
    let boundState = view.state;
    let sources: CalloutImages[] = [];
    let parsed = false;
    const refresh = (): void => {
      frame = 0;
      const next = new Map<HTMLElement, Binding>();
      const info = view.state.field(editorInfoField, false);
      const callouts = roots(view.contentDOM);
      if (info?.file && !view.state.readOnly && view.state.field(editorLivePreviewField, false) && callouts.length) {
        if (!parsed || parsedDoc !== view.state.doc) {
          parsedDoc = view.state.doc; parsed = true;
          sources = calloutImages(parsedDoc.toString().split("\n"));
        }
        for (const root of callouts) {
          const from = view.state.doc.lineAt(view.posAtDOM(root)).number - 1;
          const source = sources.find(source => source.from === from);
          if (!source) continue;
          for (const binding of bindImages(app, root, source, info.file.path)) {
            if (!binding.image.editable && binding.image.width === null) continue;
            const wrapper = wrapperFor(binding.img);
            wrapper.addClass("vml-callout-image");
            if (!cancel) size(wrapper, binding.image.width);
            next.set(wrapper, binding);
            if (binding.image.editable && !wrapper.querySelector(":scope > .vml-callout-image__resize")) {
              wrapper.createEl("button", { cls: "vml-callout-image__resize", attr: {
                type: "button", "aria-label": t("resizeCalloutImage"), title: t("resizeCalloutImage"),
              } });
            }
          }
        }
      }
      for (const wrapper of bindings.keys()) if (!next.has(wrapper)) clear(wrapper);
      bindings = next;
      boundState = view.state;
    };
    const schedule = (): void => { if (!frame) frame = view.dom.win.requestAnimationFrame(refresh); };
    const start = (event: PointerEvent): void => {
      const handle = eventElement(event)?.closest<HTMLElement>(".vml-callout-image__resize");
      const wrapper = handle?.parentElement;
      const binding = wrapper ? bindings.get(wrapper) : undefined;
      const file = view.state.field(editorInfoField, false)?.file;
      if (event.button !== 0 || !handle || !wrapper || !binding || !file) return;
      event.preventDefault(); event.stopPropagation();
      ignoreClick = true;
      cancel?.();
      // A source transaction can precede its next paint. Never rebind an old widget by text search.
      if (boundState.doc !== view.state.doc || boundState.field(editorInfoField, false)?.file !== file) {
        schedule(); new Notice(t("writeNotFound")); return;
      }
      const before = view.state.doc.toString();
      const available = wrapper.parentElement!.getBoundingClientRect().width;
      const initial = binding.img.getBoundingClientRect().width;
      if (!available || !initial) return;
      let width = initial / available;
      let moved = false;
      const restore = (): void => { cancel = null; size(wrapper, binding.image.width); schedule(); };
      cancel = trackPointer(handle, event, {
        onMove(move) {
          const dx = move.clientX - event.clientX;
          if (!moved && Math.abs(dx) < 3) return;
          moved = true;
          width = Math.max(0.1, Math.min(1, (initial + dx) / available));
          size(wrapper, width);
        },
        onEnd() {
          cancel = null;
          if (!moved) { restore(); return; }
          const edit = planCalloutImageWidth(binding.source, binding.image, width);
          if (!edit || view.state.doc.toString() !== before) { restore(); return; }
          void writeBlockEdits(app, file, [edit], { view,
            readSet: [{ fromLine: binding.source.from,
              lines: before.split("\n").slice(binding.source.from, binding.source.from + binding.source.lines.length) }],
          }).then(result => { if (!result.ok) { restore(); new Notice(t("writeNotFound")); } })
            .catch(error => { restore(); reportWriteError(error); });
        },
        onCancel: restore,
      });
    };
    const stopHost = (event: MouseEvent | TouchEvent): void => {
      if (eventElement(event)?.closest(".vml-callout-image__resize")) { event.preventDefault(); event.stopPropagation(); }
    };
    // Escape releases capture before mouseup. Its trailing click may otherwise reveal Callout source.
    const resetClick = (): void => { ignoreClick = false; };
    const afterGesture = (event: MouseEvent): void => {
      if (!ignoreClick || event.detail === 0) return;
      ignoreClick = false; event.preventDefault(); event.stopPropagation();
    };
    view.dom.doc.addEventListener("pointerdown", resetClick, true);
    view.dom.doc.addEventListener("click", afterGesture, true);
    view.contentDOM.addEventListener("pointerdown", start, true);
    view.contentDOM.addEventListener("mousedown", stopHost, true);
    view.contentDOM.addEventListener("touchstart", stopHost, { capture: true, passive: false });
    view.contentDOM.addEventListener("click", stopHost, true);
    const observer = new (view.dom.win as Window & typeof window).MutationObserver(schedule);
    observer.observe(view.contentDOM, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    schedule();
    return {
      update(update) { if (update.docChanged) { cancel?.(); schedule(); } else if (update.viewportChanged) schedule(); },
      destroy() {
        observer.disconnect(); cancel?.(); view.dom.win.cancelAnimationFrame(frame);
        for (const wrapper of bindings.keys()) clear(wrapper);
        view.contentDOM.removeEventListener("pointerdown", start, true);
        view.contentDOM.removeEventListener("mousedown", stopHost, true);
        view.contentDOM.removeEventListener("touchstart", stopHost, true);
        view.contentDOM.removeEventListener("click", stopHost, true);
        view.dom.doc.removeEventListener("pointerdown", resetClick, true);
        view.dom.doc.removeEventListener("click", afterGesture, true);
      },
    };
  });
}

/** Apply stored widths to native Callout DOM, including the print renderer's full-note copy. */
export function applyCalloutImageWidths(app: App, el: HTMLElement, path: string, sources: CalloutImages[]): HTMLElement[] {
  const callouts = roots(el);
  if (callouts.length !== sources.length) return [];
  const sized: HTMLElement[] = [];
  callouts.forEach((root, index) => {
    for (const binding of bindImages(app, root, sources[index], path)) {
      if (binding.image.width === null) continue;
      const wrapper = wrapperFor(binding.img);
      wrapper.addClass("vml-callout-image"); size(wrapper, binding.image.width); sized.push(wrapper);
    }
  });
  return sized;
}

/** Saved widths also apply to native Reading View Callouts. No controls or writes here. */
export function registerCalloutImages(plugin: Plugin): void {
  // Parsing only depends on exact text. Retain one buffer across section callbacks, not a note history.
  let parsedText: string | null = null;
  let parsedSources: CalloutImages[] = [];
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    if (!roots(el).length) return;
    const info = ctx.getSectionInfo(el);
    if (!info || !info.text.includes("<!-- vml")) return;
    if (info.text !== parsedText) {
      parsedSources = calloutImages(info.text.split("\n"));
      parsedText = info.text;
    }
    const sources = parsedSources.filter(source => source.from >= info.lineStart && source.from <= info.lineEnd);
    if (!sources.length) return;
    const child = new MarkdownRenderChild(el);
    ctx.addChild(child);
    let frame = 0;
    const sized = new Set<HTMLElement>();
    const paint = (): void => {
      frame = 0;
      for (const wrapper of applyCalloutImageWidths(plugin.app, el, ctx.sourcePath, sources)) sized.add(wrapper);
    };
    const schedule = (): void => { if (!frame) frame = el.win.requestAnimationFrame(paint); };
    const observer = new (el.win as Window & typeof window).MutationObserver(schedule);
    observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    schedule();
    child.register(() => { observer.disconnect(); el.win.cancelAnimationFrame(frame); for (const wrapper of sized) clear(wrapper); });
  });
}
