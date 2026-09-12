import { editorInfoField, type Plugin } from "obsidian";
import { Transaction, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { mediaKindOf, readEmbedRow } from "../format/v2.ts";
import { planWrap } from "./insertion.ts";

const WINDOW_MS = 10_000;
const SETTLE_MS = 300;
const OWN_EVENT = "vml.autoconvert";

interface Pending {
  expected: number;
  seen: number;
  /** Start of each inserted embed line, kept mapped through later changes. */
  positions: number[];
  deadline: number;
  view: EditorView | null;
  timer: number | null;
}

/**
 * Automatic conversion (D1, verified in phase 1 as S6).
 *
 * A drop or paste of media files records how many embeds to expect in that note. Obsidian then
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
  // Pending timers must not fire after the plugin is gone (F9).
  plugin.register(() => {
    for (const [path, entry] of Array.from(pending)) {
      forget(path, entry);
    }
  });

  const expect = (path: string | undefined, files: FileList | null | undefined): void => {
    if (!enabled() || !path || !files) {
      return;
    }
    const count = Array.from(files).filter((file) => (
      mediaKindOf(file.name) !== null || file.type.startsWith("image/") || file.type.startsWith("video/")
    )).length;
    if (count === 0) {
      return;
    }

    const previous = pending.get(path);
    if (previous) {
      forget(path, previous);
    }
    pending.set(path, { expected: count, seen: 0, positions: [], deadline: Date.now() + WINDOW_MS, view: null, timer: null });
  };

  plugin.registerEvent(plugin.app.workspace.on("editor-drop", (evt, _editor, info) => {
    expect(info.file?.path, evt.dataTransfer?.files);
  }));
  plugin.registerEvent(plugin.app.workspace.on("editor-paste", (evt, _editor, info) => {
    expect(info.file?.path, evt.clipboardData?.files);
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
    // All expected embeds arrived: convert shortly. Otherwise wait for the rest until the deadline.
    const wait = entry.seen >= entry.expected ? SETTLE_MS : Math.max(0, entry.deadline - Date.now());
    entry.timer = window.setTimeout(() => convert(path, entry), wait);
  };

  return EditorView.updateListener.of((update) => {
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
}
