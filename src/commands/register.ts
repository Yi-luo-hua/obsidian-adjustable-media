import { Modal, Notice, type App, type Plugin, type TFile } from "obsidian";

import { findV2Blocks, type V2Block } from "../format/v2.ts";
import { applyEditsToEditor, planUnwrap } from "../layout/edits.ts";
import { writeBlockEdits } from "../layout/writeBack.ts";
import { t } from "../view/messages.ts";
import { applyLineChange, blockAt, planMergeWithNext, planWrapSelection } from "./plans.ts";

export function registerCommands(plugin: Plugin): void {
  plugin.addCommand({
    id: "wrap-selection-in-layout",
    name: t("cmdWrap"),
    editorCallback: (editor) => {
      const change = planWrapSelection(editor.getValue().split("\n"), editor.getCursor("from").line, editor.getCursor("to").line);
      if (change) {
        applyLineChange(editor, change);
      } else {
        new Notice(t("wrapNothing"));
      }
    },
  });

  plugin.addCommand({
    id: "merge-with-next-layout",
    name: t("cmdMerge"),
    editorCallback: (editor) => {
      const change = planMergeWithNext(editor.getValue().split("\n"), editor.getCursor().line);
      if (change) {
        applyLineChange(editor, change);
      } else {
        new Notice(t("mergeNothing"));
      }
    },
  });

  plugin.addCommand({
    id: "remove-layout-comments-here",
    name: t("cmdUnwrap"),
    editorCallback: (editor) => {
      const block = blockAt(editor.getValue().split("\n"), editor.getCursor().line);
      if (!block) {
        new Notice(t("unwrapNothing"));
        return;
      }
      const result = applyEditsToEditor(editor, [planUnwrap(block)]);
      if (!result.ok) {
        new Notice(t("writeNotFound"));
      }
    },
  });

  plugin.addCommand({
    id: "remove-all-layout-comments",
    name: t("cmdRemoveAll"),
    callback: () => {
      void openRemoveAll(plugin.app);
    },
  });
}

interface NoteLayouts {
  file: TFile;
  blocks: V2Block[];
}

async function openRemoveAll(app: App): Promise<void> {
  const found: NoteLayouts[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const text = await app.vault.cachedRead(file);
    if (!text.includes("<!-- vml")) {
      continue;
    }
    const blocks = findV2Blocks(text.split("\n"));
    if (blocks.length > 0) {
      found.push({ file, blocks });
    }
  }

  if (found.length === 0) {
    new Notice(t("removeAllNone"));
    return;
  }
  new RemoveAllModal(app, found).open();
}

/** Batch removal shows exactly what will change and does nothing until confirmed. */
class RemoveAllModal extends Modal {
  private readonly notes: NoteLayouts[];

  constructor(app: App, notes: NoteLayouts[]) {
    super(app);
    this.notes = notes;
  }

  override onOpen(): void {
    const blockCount = this.notes.reduce((sum, note) => sum + note.blocks.length, 0);
    this.titleEl.setText(t("removeAllTitle"));
    this.contentEl.createEl("p", {
      text: t("removeAllSummary", { files: String(this.notes.length), blocks: String(blockCount) }),
    });
    const list = this.contentEl.createEl("ul", { cls: "vml-remove-list" });
    for (const note of this.notes) {
      list.createEl("li", { text: `${note.file.path} · ${note.blocks.length}` });
    }

    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { cls: "mod-warning", text: t("removeAllConfirm") }).addEventListener("click", () => {
      this.close();
      void this.removeAll();
    });
    footer.createEl("button", { text: t("cancel") }).addEventListener("click", () => this.close());
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  private async removeAll(): Promise<void> {
    let files = 0;
    let blocks = 0;
    let failed = 0;
    for (const note of this.notes) {
      // Each block is re-validated against the note's current content before anything is written.
      const result = await writeBlockEdits(this.app, note.file, note.blocks.map(planUnwrap));
      if (result.ok) {
        files += 1;
        blocks += note.blocks.length;
      } else {
        failed += 1;
      }
    }

    new Notice(t("removeAllDone", { files: String(files), blocks: String(blocks) }));
    if (failed > 0) {
      new Notice(t("removeAllFailed", { count: String(failed) }));
    }
  }
}
