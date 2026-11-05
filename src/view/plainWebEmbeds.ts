import { Menu, Notice, editorInfoField, editorLivePreviewField, setIcon, type App } from "obsidian";
import type { Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { lineChangeEdit, planWrapSelection } from "../commands/plans.ts";
import { takePlainEmbed, takePlainWebFrame, type TakenEmbed } from "../layout/plainEmbed.ts";
import { readEmbedRow } from "../format/v2.ts";
import { writeBlockEdits } from "../layout/writeBack.ts";
import { reportWriteError, t } from "./messages.ts";
import { startPlainDrag } from "./plainDrag.ts";

export function takeNativeWeb(view: EditorView, frame: HTMLElement): TakenEmbed | null {
  try {
    const html = frame.closest(".cm-html-embed");
    const position = view.posAtDOM(html ?? frame);
    const line = view.state.doc.lineAt(position), lines = view.state.doc.toString().split("\n");
    if (!html) {
      const taken = takePlainEmbed(lines, line.number - 1, position - line.from);
      return taken?.embed.kind === "web" ? taken : null;
    }
    const frames = Array.from(html.querySelectorAll("iframe")), index = frames.indexOf(frame as HTMLIFrameElement);
    const candidates: TakenEmbed[] = [];
    for (let sourceLine = line.number - 1; sourceLine < lines.length && candidates.length < frames.length; sourceLine++) {
      const complete = takePlainWebFrame(lines, sourceLine);
      if (complete?.embed.line === sourceLine) {
        candidates.push(complete); sourceLine = complete.embed.endLine ?? sourceLine;
      } else {
        const row = readEmbedRow(lines[sourceLine], sourceLine);
        if (!row) break;
        for (const embed of row.filter(embed => embed.syntax === "iframe" && (sourceLine > line.number - 1 || embed.from >= position - line.from))) {
          const taken = takePlainEmbed(lines, sourceLine, embed.from);
          if (taken) candidates.push(taken);
          if (candidates.length === frames.length) break;
        }
      }
    }
    if (index < 0 || candidates.length !== frames.length || candidates.some((taken, i) => new URL(taken.embed.target).href !== frames[i].src)) return null;
    return candidates[index];
  } catch { return null; } // The host may already have removed the widget.
}

/** Controls live outside CodeMirror's owned widgets, including bare native YouTube iframes. */
export function plainWebEmbeds(app: App): Extension {
  return ViewPlugin.define(view => {
    const controls = new Map<HTMLElement, HTMLElement>();
    let cancelDrag: (() => void) | null = null, pending = 0;
    const win = view.dom.win as Window & typeof window;
    const menu = (event: MouseEvent, frame: HTMLElement): void => {
      event.preventDefault(); event.stopPropagation();
      const taken = takeNativeWeb(view, frame), info = view.state.field(editorInfoField, false);
      if (!taken || !info?.file) return;
      const original = view.state.doc.toString(), file = info.file;
      new Menu().addItem(item => item.setTitle(t("wrapInLayout")).setIcon("layout-grid").onClick(() => {
        const change = view.state.doc.toString() === original && frame.isConnected
          ? planWrapSelection(original.split("\n"), taken.embed.line, taken.embed.endLine ?? taken.embed.line) : null;
        if (!change) { new Notice(t("writeNotFound")); return; }
        void writeBlockEdits(app, file, [lineChangeEdit(original.split("\n"), change)], { view, finishWrapping: true })
          .then(result => { if (!result.ok) new Notice(t("writeNotFound")); }).catch(reportWriteError);
      })).showAtMouseEvent(event);
    };
    const update = (): void => {
      pending = 0;
      const frames = view.state.field(editorLivePreviewField, false) ? Array.from(view.contentDOM.querySelectorAll<HTMLElement>("iframe"))
        .filter(frame => !frame.closest(".vml-layout, .vml-text-editor") && takeNativeWeb(view, frame)) : [];
      for (const [frame, control] of controls) if (!frames.includes(frame)) { resize.unobserve(frame); control.remove(); controls.delete(frame); }
      const origin = view.dom.getBoundingClientRect();
      for (const frame of frames) {
        let control = controls.get(frame);
        if (!control) {
          control = view.dom.createDiv({ cls: "vml-native-web-controls" });
          const grip = control.createEl("button", { cls: "vml-native-web-grip", attr: { type: "button", "aria-label": t("webEmbedActions"), title: t("webEmbedActions") } });
          setIcon(grip, "grip-vertical");
          grip.addEventListener("contextmenu", event => menu(event, frame));
          grip.addEventListener("click", event => menu(event, frame));
          grip.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;
            event.preventDefault(); event.stopPropagation();
            if (!view.dom.querySelector(".vml-layout--interactive")) return;
            const taken = takeNativeWeb(view, frame), file = view.state.field(editorInfoField, false)?.file;
            if (!taken || !file) return;
            cancelDrag?.();
            cancelDrag = startPlainDrag(app, view, frame, file.path, taken, event, () => { cancelDrag = null; },
              { captureTarget: grip, retake: () => takeNativeWeb(view, frame) });
          });
          controls.set(frame, control);
          resize.observe(frame);
        }
        const box = frame.getBoundingClientRect();
        const size = view.dom.doc.body.hasClass("is-mobile") ? 44 : 24;
        control.toggleClass("is-hidden", box.bottom <= origin.top || box.top >= origin.bottom || box.width === 0);
        control.setCssProps({ "--vml-web-x": `${Math.min(box.right, origin.right) - origin.left - size - 2}px`, "--vml-web-y": `${Math.max(box.top, origin.top) - origin.top + 4}px` });
      }
    };
    const schedule = (): void => { if (!pending) pending = win.requestAnimationFrame(update); };
    const observer = new win.MutationObserver(schedule);
    observer.observe(view.contentDOM, { childList: true, subtree: true });
    const resize = new win.ResizeObserver(schedule);
    resize.observe(view.dom);
    view.scrollDOM.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return { update: schedule, destroy() {
      cancelDrag?.(); win.cancelAnimationFrame(pending); observer.disconnect(); resize.disconnect();
      view.scrollDOM.removeEventListener("scroll", schedule);
      for (const control of controls.values()) control.remove();
      controls.clear();
    } };
  });
}
