import type { App, Editor, MarkdownView, TFile } from "obsidian";
import type { EditorView } from "@codemirror/view";

/** Canvas embeds use Markdown editors/preview renderers, but are not MarkdownView leaves. */
interface CanvasChild {
  file: TFile | null;
  text: string;
  editor?: Editor;
  editMode?: { cm: EditorView };
  containerEl: HTMLElement;
  previewMode: { containerEl: HTMLElement; renderer: { rerender(full: boolean): void } };
  getMode(): string;
}

interface CanvasNode {
  id: string;
  child?: CanvasChild;
  isEditing: boolean;
  nodeEl: HTMLElement;
}

interface CanvasView {
  file: TFile | null;
  canvas?: { readonly: boolean; nodes: Map<string, CanvasNode> };
}

export interface PreviewHost {
  readonly file: TFile | null;
  readonly containerEl: HTMLElement;
  readonly previewMode: Pick<MarkdownView["previewMode"], "containerEl" | "rerender">;
  getMode(): string;
  getViewData(): string;
}

export interface CanvasEditor {
  file: TFile;
  view: EditorView;
}

/** Resolve the exact mounted card; identical text in another card is never an editing target. */
export function canvasEditor(app: App, editor: Editor | undefined, editing = true): CanvasEditor | null {
  if (!editor) return null;
  for (const leaf of app.workspace.getLeavesOfType("canvas")) {
    const owner = leaf.view as unknown as CanvasView;
    if (!owner.canvas || (editing && owner.canvas.readonly)) continue;
    for (const node of owner.canvas.nodes.values()) {
      const child = node.child;
      const file = child?.file ?? owner.file;
      if (child?.editor === editor && child.editMode && file
        && (!editing || (node.isEditing && node.nodeEl.isConnected && child.getMode() === "source" && child.editMode.cm.dom.isConnected))) {
        return { file, view: child.editMode.cm };
      }
    }
  }
  return null;
}

const previews = new WeakMap<CanvasChild, PreviewHost>();
const canvasPreviews = new WeakSet<PreviewHost>();

export function isCanvasPreview(view: PreviewHost): boolean { return canvasPreviews.has(view); }

/** Stable preview ownership includes the node, since many text cards share one .canvas path. */
export function canvasPreviewHosts(app: App): PreviewHost[] {
  const result: PreviewHost[] = [];
  for (const leaf of app.workspace.getLeavesOfType("canvas")) {
    const owner = leaf.view as unknown as CanvasView;
    if (!owner.canvas) continue;
    for (const node of owner.canvas.nodes.values()) {
      const child = node.child;
      if (!child?.previewMode) continue;
      let host = previews.get(child);
      if (!host) {
        const mounted = (): boolean => owner.canvas?.nodes.get(node.id) === node && node.child === child;
        host = {
          get file() { return mounted() ? child.file ?? owner.file : null; },
          get containerEl() { return child.containerEl; },
          previewMode: { containerEl: child.previewMode.containerEl,
            renderer: child.previewMode.renderer,
            rerender: (full: boolean) => child.previewMode.renderer.rerender(full),
          } as PreviewHost["previewMode"],
          // Canvas prepares this separate preview before it finishes leaving the editor.
          getMode: () => "preview",
          getViewData: () => child.text,
        };
        previews.set(child, host);
        canvasPreviews.add(host);
      }
      result.push(host);
    }
  }
  return result;
}
