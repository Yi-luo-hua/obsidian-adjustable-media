import type { WrapSide } from "../format/v2.ts";

/**
 * Keeps CodeMirror's height map true around wrapped layouts in live preview (docs/DESIGN.md,
 * section 4). The plans are made from measurements, so they are pure and tested without a DOM.
 *
 * CodeMirror adds up the heights of the editor's top-level elements to know where each one is. A
 * wrapped layout's widget is a zero-height anchor that the layout floats out of, and the lines
 * beside the float have their own, measured heights, so the sum stays right. An element that cannot
 * sit beside the float, though (a widget too wide for the room left, or one that clears floats), is
 * pushed below it, and that push belongs to no element: everything after it would be placed too
 * high, and clicks and arrow keys would land on the wrong line. A spacer in front of such an element,
 * as high as the push, turns the push into a height CodeMirror measures.
 */

/** One top-level element of the editor's content, in document order, in document pixels. */
export interface FlowBox {
  /** Document position of the element. */
  pos: number;
  /** Where the element is drawn. */
  top: number;
  height: number;
  /** Where CodeMirror's height map puts it. */
  mapTop: number;
  /** A spacer planned earlier. */
  spacer: boolean;
  /** Bottom edge of the margin boxes of the floats inside the element, if any. */
  floatBottom: number | null;
}

export interface Gap {
  /** Document position of the element the spacer goes in front of. */
  pos: number;
  height: number;
}

const TOLERANCE = 1;

/**
 * The spacers the measured elements need. An element pushed below a float gets one as high as the
 * push. An existing spacer grows when its element is pushed further, shrinks when the float no
 * longer reaches as far, and goes once the float ends above it. Spacers are only ever made for
 * elements next to a float; anything else that moves the height map is CodeMirror's business.
 */
export function planGaps(boxes: readonly FlowBox[]): Gap[] {
  const gaps: Gap[] = [];
  let floatBottom = Number.NEGATIVE_INFINITY;
  // Height this plan adds that the height map does not have yet.
  let pending = 0;
  let spacer: FlowBox | null = null;
  let lastContentPos: number | null = null;

  for (const box of boxes) {
    if (box.spacer) {
      if (spacer && spacer.pos === box.pos) {
        // Several block widgets can share a document position. Treat their old spacers as one
        // physical gap; otherwise the first one's height is counted again on every measurement.
        spacer = { pos: spacer.pos, top: spacer.top, height: box.top + box.height - spacer.top,
          mapTop: spacer.mapTop, spacer: true, floatBottom: null };
      } else {
        if (spacer) {
          gaps.push({ pos: spacer.pos, height: Math.round(spacer.height) });
        }
        spacer = box;
      }
      continue;
    }

    if (box.pos === lastContentPos) {
      // CodeMirror maps separate DOM children of a block widget to the same position and gives
      // each the same mapTop. The later child's offset includes the earlier child's height, so it
      // cannot be interpreted as a new gap in the document height map.
      if (spacer) {
        pending -= spacer.height;
        spacer = null;
      }
    } else if (spacer) {
      const pushed = box.top - (spacer.top + spacer.height);
      let height = spacer.height;
      if (pushed > TOLERANCE) {
        height += pushed;
      } else if (floatBottom < spacer.top + spacer.height - TOLERANCE) {
        height = Math.max(0, floatBottom - spacer.top);
      }
      pending += height - spacer.height;
      if (height > TOLERANCE) {
        gaps.push({ pos: box.pos, height: Math.round(height) });
      }
      spacer = null;
    } else {
      const expected = box.mapTop + pending;
      const drift = box.top - expected;
      if (drift > TOLERANCE && expected < floatBottom) {
        gaps.push({ pos: box.pos, height: Math.round(drift) });
        pending += drift;
      }
    }
    lastContentPos = box.pos;

    if (box.floatBottom !== null) {
      floatBottom = Math.max(floatBottom, box.floatBottom);
    }
  }

  // A spacer at the end of what was measured keeps its height until its element is measured too.
  if (spacer) {
    gaps.push({ pos: spacer.pos, height: Math.round(spacer.height) });
  }
  return gaps;
}

/** A wrapped layout's float, measured from the top of its anchor, in pixels. */
export interface FloatSize {
  side: WrapSide;
  /** From the anchor's top to the layout's top edge (its border box). */
  layoutTop: number;
  layoutHeight: number;
  /** Width of the layout's border box. */
  width: number;
  /** Margin between the layout and the text. */
  margin: number;
  marginBottom: number;
}

export interface ProxyPlan {
  /** Height of an empty, zero-width float above the stand-in, when the layout starts below the line. */
  sandbag: number;
  /** Height of the stand-in, bottom margin included. */
  height: number;
  /** How much of the layout lies above the stand-in's top and is cut off. */
  shift: number;
}

/**
 * A stand-in for a float whose anchor lies above the part of the note CodeMirror has drawn, placed
 * on the first line drawn, which starts at `lineTop`: the part of the float at or below that line,
 * or null when the float ends above it. Without it, the lines beside the float lose their wrap until
 * the anchor is drawn, then jump. With it, the lines sit where they would beside the real float.
 */
export function planProxy(anchorTop: number, size: FloatSize, lineTop: number): ProxyPlan | null {
  const layoutTop = anchorTop + size.layoutTop;
  const bottom = layoutTop + size.layoutHeight + size.marginBottom;
  if (bottom <= lineTop + TOLERANCE) {
    return null;
  }
  const visibleTop = Math.max(layoutTop, lineTop);
  return { sandbag: Math.max(0, layoutTop - lineTop), height: bottom - visibleTop, shift: visibleTop - layoutTop };
}
