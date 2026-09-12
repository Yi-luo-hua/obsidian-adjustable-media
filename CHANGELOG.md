# Changelog

## 0.1.2 - 2026-09-12

- Release files come with GitHub build provenance attestations, which you can check with `gh attestation verify`. Releases no longer include `sha256sums.txt`.
- The README explains when the plugin reads all notes in the vault.

## 0.1.1 - 2026-09-12

- Automatic conversion also picks up images and videos dragged in from Obsidian's file list.
- The right-click menu now has Obsidian's own file actions for the media, such as revealing it in the file list or the system's file manager, instead of a separate "Reveal in folder" item.
- The setting appears in Obsidian's settings search (Obsidian 1.13 and later).
- Fixed: in reading view, changing a row's height, the column widths, a caption or the alignment didn't show until the note was reopened, and the next change to that layout failed.
- Fixed: clicking a resize handle without dragging changed the note, and could switch a row to fixed column widths.
- Fixed: the width handle of a right-aligned item is on its left edge now, so it follows the pointer.
- Videos show the normal pointer, since they move by their grip.

## 0.1.0 - 2026-09-12

First release.

- Arrange images and videos in rows of up to four items, stored as plain embeds between `<!-- vml … -->` and `<!-- /vml -->`, with the layout settings in the opening comment.
- Layouts render in reading view and live preview; live preview shows the source while the cursor is inside a layout.
- Drag to reorder, to start a new row, or into another layout in the same note.
- Resize row height, column widths and single items by dragging.
- Context menu for captions, revealing the file, aligning a single item and moving an item out of the layout.
- Videos move by a grip, so their playback controls keep working.
- Commands to wrap selected media in a layout, merge with the next layout, remove the layout comments here, and remove layout comments from all notes with a preview.
- Optional automatic conversion of dropped and pasted media, off by default.
- Layouts whose settings can't be read are shown with defaults and never rewritten.
- Chinese and English interface.
