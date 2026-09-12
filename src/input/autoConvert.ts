import { editorInfoField, type Plugin } from "obsidian";
import { Prec, Transaction, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { mediaKindOf, readEmbedRow } from "../format/v2.ts";
import { planWrap } from "./insertion.ts";

const WINDOW_MS = 10_000;
/** Files dragged from Obsidian's own file list are inserted right away. */
const INTERNAL_WINDOW_MS = 2_000;
const SETTLE_MS = 300;
const OWN_EVENT = "vml.autoconvert";

interface Pending {
  /** Embeds to wait for; null when the drop doesn't say, as with files from Obsidian's file list. */
  expected: number | null;
  seen: number;
  /** Start of each inserted embed line, kept mapped through later changes. */
  positions: number[];
  deadline: number;
  view: EditorView | null;
  timer: number | null;
}

/**
 * Automatic conversion. How Obsidian inserts dropped and pasted files: docs/DESIGN.md, section 4.
 *
 * A drop or paste of media files records how many embeds to expect in that note (a drag from
 * Obsidian's own file list doesn't say, so it waits a short while instead). Obsidian then
 * stores each file and inserts its embed with a transaction that carries no user event. Those
 * insertions are collected and, once all have arrived, wrapped in a layout or appended to the
 * layout right above them. Typing, undo and everything else in the note are never touched.
 * Off by default (setting).
 */
export function autoConvert(plugin: Plugin, enabled: () => boolean): Extension {
  const pending = new Map<string, Pending>();

  const forget = (path: string, entry: Pending): void => {
    if (entry.timer !== null) {
      window.clearTimeout(entry.timer);
      entry.timer = null;
    }
    if (pending.get(path) === entry) {
      pending.delete(path);
    }
  };
  // Pending timers must not fire after the plugin is gone.
  plugin.register(() => {
    for (const [path, entry] of Array.from(pending)) {
      forget(path, entry);
    }
  });

  const expect = (view: EditorView, expected: number | null, windowMs: number): void => {
    const path = view.state.field(editorInfoField, false)?.file?.path;
    if (!enabled() || !path) {
      return;
    }
    const previous = pending.get(path);
    if (previous) {
      forget(path, previous);
    }
    pending.set(path, { expected, seen: 0, positions: [], deadline: Date.now() + windowMs, view, timer: null });
  };
  const mediaCount = (files: FileList | null | undefined): number => Array.from(files ?? []).filter((file) => (
    mediaKindOf(file.name) !== null || file.type.startsWith("image/") || file.type.startsWith("video/")
  )).length;

  // Only take note of the drop or paste: Obsidian still stores the file and inserts its embed, so
  // the event is neither handled nor prevented here. Highest precedence runs this before any
  // editor handler that might stop the event.
  const watchInput = Prec.highest(EditorView.domEventHandlers({
    drop: (evt, view) => {
      const files = evt.dataTransfer?.files;
      if (files && files.length > 0) {
        const count = mediaCount(files);
        if (count > 0) {
          expect(view, count, WINDOW_MS);
        }
      } else {
        // A drag from Obsidian's own file list carries no files: Obsidian inserts the embeds itself,
        // without a user event, as it does for files from outside. Anything else it drops is no embed.
        expect(view, null, INTERNAL_WINDOW_MS);
      }
      return false;
    },
    paste: (evt, view) => {
      const count = mediaCount(evt.clipboardData?.files);
      if (count > 0) {
        expect(view, count, WINDOW_MS);
      }
      return false;
    },
  }));

  const convert = (path: string, entry: Pending): void => {
    forget(path, entry);
    const view = entry.view;
    if (!view || !enabled()) {
      return;
    }

    const doc = view.state.doc;
    const lineNumbers = entry.positions
      .filter((position) => position <= doc.length)
      .map((position) => doc.lineAt(position).number - 1);
    const change = planWrap(doc.toString().split("\n"), lineNumbers, { mergeWithPrevious: true });
    if (!change) {
      return;
    }

    try {
      view.dispatch({
        changes: { from: doc.line(change.from + 1).from, to: doc.line(change.to + 1).to, insert: change.replacement.join("\n") },
        annotations: Transaction.userEvent.of(OWN_EVENT),
      });
    } catch (error) {
      // The note was closed in the meantime; nothing to convert any more.
      console.warn("Adjustable Media: automatic conversion skipped", error);
    }
  };

  const schedule = (path: string, entry: Pending): void => {
    if (entry.timer !== null) {
      window.clearTimeout(entry.timer);
    }
    // All expected embeds arrived, or their number is unknown: convert shortly after the last one.
    // Otherwise wait for the rest until the deadline.
    const done = entry.expected === null || entry.seen >= entry.expected;
    const wait = done ? SETTLE_MS : Math.max(0, entry.deadline - Date.now());
    entry.timer = window.setTimeout(() => convert(path, entry), wait);
  };

  const collect = EditorView.updateListener.of((update) => {
    if (!update.docChanged) {
      return;
    }
    const path = update.state.field(editorInfoField, false)?.file?.path;
    const entry = path ? pending.get(path) : undefined;
    if (!path || !entry) {
      return;
    }
    if (Date.now() > entry.deadline && entry.seen === 0) {
      forget(path, entry);
      return;
    }
    // The same note may be open in another pane; follow only the editor that received the drop.
    if (entry.view && entry.view !== update.view) {
      return;
    }

    let found = false;
    for (const tr of update.transactions) {
      if (!tr.docChanged) {
        continue;
      }
      entry.positions = entry.positions.map((position) => tr.changes.mapPos(position));
      // Typing, undo and our own conversion all carry a user event; Obsidian's insertion does not.
      if (tr.annotation(Transaction.userEvent) !== undefined) {
        continue;
      }
      tr.changes.iterChanges((_fromA, _toA, fromB, _toB, inserted) => {
        let offset = fromB;
        for (const text of inserted.toString().split("\n")) {
          const embeds = text.trim() === "" ? null : readEmbedRow(text, 0);
          if (embeds) {
            entry.positions.push(offset);
            entry.seen += embeds.length;
            found = true;
          }
          offset += text.length + 1;
        }
      });
    }

    if (found) {
      entry.view = update.view;
      schedule(path, entry);
    }
  });

  return [watchInput, collect];
}
