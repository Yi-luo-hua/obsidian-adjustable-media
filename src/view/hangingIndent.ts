import { StateEffect, type Range } from "@codemirror/state";
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

import { hangingPrefix } from "../markdown/columnStyle.ts";

/**
 * The hanging indent of list items, tasks and quotes in a text column's editor, as live preview gives
 * them (docs/DESIGN.md, section 4.2): the rows of a wrapped line after its first go on under its
 * text, not under its markers. Like live preview, the editor measures how wide the markers are drawn
 * (hangingPrefix tells which they are) and indents the other rows by as much, again after every
 * change that can move them.
 */

/** Makes the editor take measured indents on: a measurement cannot start an update of its own. */
const indentsMeasured = StateEffect.define<null>();

class HangingIndent {
  decorations: DecorationSet = Decoration.none;
  /** The indent of each line with markers, by where the line starts. */
  private widths = new Map<number, number>();
  private destroyed = false;
  private readonly view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.measure();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      this.decorations = this.decorations.map(update.changes);
      this.widths = new Map(Array.from(this.widths, ([from, width]) => [update.changes.mapPos(from), width]));
    }
    if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged) {
      this.measure();
    }
  }

  destroy(): void {
    this.destroyed = true;
  }

  private measure(): void {
    this.view.requestMeasure({
      key: this,
      read: (view) => markerWidths(view),
      write: (widths, view) => {
        if (sameWidths(widths, this.widths)) {
          return;
        }
        this.widths = widths;
        const ranges: Array<Range<Decoration>> = [];
        for (const [from, width] of widths) {
          ranges.push(Decoration.line({ class: "vml-hanging", attributes: { style: `--vml-hanging: ${width}px` } }).range(from));
        }
        this.decorations = Decoration.set(ranges, true);
        queueMicrotask(() => {
          if (!this.destroyed) {
            view.dispatch({ effects: indentsMeasured.of(null) });
          }
        });
      },
    });
  }
}

export const hangingIndent = ViewPlugin.fromClass(HangingIndent, { decorations: (plugin) => plugin.decorations });

/** How wide the markers of each visible line that has any are drawn, by where the line starts. */
function markerWidths(view: EditorView): Map<number, number> {
  const widths = new Map<number, number>();
  const { doc } = view.state;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = doc.lineAt(pos);
      const prefix = hangingPrefix(line.text);
      const start = prefix > 0 ? rowStart(view, line.from) : null;
      const end = start ? view.coordsAtPos(line.from + prefix, -1) : null;
      // Markers that wrap on their own leave the line as it is.
      if (start && end && end.top < start.bottom && end.bottom > start.top && end.left > start.left) {
        widths.set(line.from, Math.round((end.left - start.left) * 10) / 10);
      }
      pos = line.to + 1;
    }
  }
  return widths;
}

/**
 * Where the first row of the line at `from` starts, and how high it is. Taken from the line's box, not
 * from its first character: Obsidian draws a bullet away from where its - is.
 */
function rowStart(view: EditorView, from: number): { left: number; top: number; bottom: number } | null {
  const { node } = view.domAtPos(from);
  const el = (node.instanceOf(HTMLElement) ? node : node.parentElement)?.closest<HTMLElement>(".cm-line");
  const first = view.coordsAtPos(from, 1);
  if (!el || !first) {
    return null;
  }
  const style = el.win.getComputedStyle(el);
  const left = el.getBoundingClientRect().left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) + parseFloat(style.textIndent);
  return { left, top: first.top, bottom: first.bottom };
}

function sameWidths(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): boolean {
  return a.size === b.size && Array.from(a).every(([from, width]) => b.get(from) === width);
}
