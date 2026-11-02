import type { EditorView } from "@codemirror/view";
import type { LineChange } from "../layout/edits.ts";
import { preserveWrapAppearance } from "../layout/wrapAppearance.ts";

/** Read at activation time: a menu can stay open while its pane changes size. */
export function keepWrapAppearance(view: EditorView, change: LineChange, element: HTMLElement): LineChange {
  const media = element.matches("table, img, video, svg") ? element : element.querySelector<HTMLElement>("img, video, svg");
  if (!media) return change;
  const outer = element.closest<HTMLElement>(".cm-embed-block, .cm-line") ?? element;
  const box = media.getBoundingClientRect(), host = outer.getBoundingClientRect();
  const content = view.contentDOM.getBoundingClientRect();
  const wide = media.matches("table") && box.width > content.width;
  const scrollbar = wide ? outer.offsetHeight - outer.clientHeight : 0;
  return preserveWrapAppearance(change, {
    container: { left: content.left, width: view.contentDOM.clientWidth },
    media: { left: box.left, width: box.width, height: box.height },
    spacing: [box.top - host.top, host.bottom - box.bottom - scrollbar],
  });
}
