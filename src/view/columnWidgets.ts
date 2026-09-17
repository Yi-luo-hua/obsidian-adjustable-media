import { EditorSelection } from "@codemirror/state";
import { WidgetType, type EditorView } from "@codemirror/view";

import { drawMath } from "./math.ts";

/**
 * What a text column's editor draws in place of some of its Markdown, as live preview does
 * (docs/DESIGN.md, section 4.2): a task's box, inline math and embedded images. A click on math or an
 * image puts the cursor there, which shows the source.
 */

/** A task's box, as live preview draws it: a click checks or unchecks the task in the text. */
export class TaskBox extends WidgetType {
  private readonly checked: boolean;

  constructor(checked: boolean) {
    super();
    this.checked = checked;
  }

  override eq(other: TaskBox): boolean {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView): HTMLElement {
    const label = createEl("label", { cls: "task-list-label" });
    const box = label.createEl("input", { cls: "task-list-item-checkbox", type: "checkbox", attr: { "data-task": this.checked ? "x" : " " } });
    box.checked = this.checked;
    // On mousedown, so the editor keeps the focus and the cursor stays where it is.
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const at = view.posAtDOM(label);
      if (/^\[[ xX]\]$/.test(view.state.sliceDoc(at, at + 3))) {
        view.dispatch({ changes: { from: at + 1, to: at + 2, insert: this.checked ? " " : "x" }, userEvent: "input" });
      }
    });
    // The box is drawn anew from the text; the browser does not tick it on its own.
    box.addEventListener("click", (event) => event.preventDefault());
    return label;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** Inline math, rendered by Obsidian's MathJax as in the drawn column. */
export class MathWidget extends WidgetType {
  private readonly tex: string;

  constructor(tex: string) {
    super();
    this.tex = tex;
  }

  override eq(other: MathWidget): boolean {
    return other.tex === this.tex;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = createSpan({ cls: "math math-inline is-loaded" });
    drawMath(el, this.tex, false);
    // A click puts the cursor in the math, which shows its source. MathJax's own handling of the click
    // would take the focus from the editor, and with it end the typing.
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: EditorSelection.cursor(view.posAtDOM(el) + 1), userEvent: "select.pointer" });
    }, true);
    el.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    }, true);
    return el;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** Where an embedded image comes from, and the size its embed asks for. */
export interface ImageSource {
  src: string;
  width: number | null;
  height: number | null;
}

/** An embedded image, as the drawn column draws it. */
export class ImageEmbed extends WidgetType {
  private readonly image: ImageSource;

  constructor(image: ImageSource) {
    super();
    this.image = image;
  }

  override eq(other: ImageEmbed): boolean {
    return other.image.src === this.image.src && other.image.width === this.image.width && other.image.height === this.image.height;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = createSpan({ cls: "internal-embed media-embed image-embed is-loaded" });
    const img = el.createEl("img", { attr: { src: this.image.src } });
    if (this.image.width !== null) {
      img.setAttribute("width", String(this.image.width));
    }
    if (this.image.height !== null) {
      img.setAttribute("height", String(this.image.height));
    }
    // The line grows once the image has loaded.
    img.addEventListener("load", () => view.requestMeasure());
    return el;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
