# Changelog

## Unreleased

- Improve reading-view wrap measurements across virtualized sections and after media loads. Some first-pass scrolling jumps remain; see `docs/STATUS.md` and `docs/DESIGN.md` for the measured limits.
- Remove a folded layout's float stand-ins, and restore them when its heading is expanded.
- Suppress link completion while editing a target with an existing alias or image-size suffix, preserving that suffix unchanged.
- Fix whole-layout dragging for duplicate blocks and drops immediately after closed code, math, comment and frontmatter sections.

- Text wrap, like LaTeX's `wrapfigure`: a layout can float to the left or right of the note's own text. The paragraphs, lists, quotes, headings, code and tables after it wrap around it and continue at full width below it, in reading view and live preview. Choose **Float left, wrap text**, **Float right, wrap text** or **No text wrap** in the right-click menu. New layout settings `wrap` and `skip`; older versions of the plugin show such layouts without wrapping and keep the settings.
- Text beside the media, like side-by-side minipages: text written in a layout before its media shows in a column on their left, text after them in a column on their right. It is ordinary Markdown and always stays exactly as you wrote it; the layout's width is the width of its media column. In live preview the text is typed right in the layout, in the look of live preview: headings, bold text and links keep their styles, lists their bullets and tasks their boxes, inline math and images show rendered, wrapped list items and quotes go on under their text, and markers show only where the cursor is. Click the text to edit it, or right-click an image and choose **Add text on the left** or **Add text on the right**. The keys work as in the note: Tab indents, Enter continues lists, brackets pair up as Obsidian's settings say, `[[` suggests links, and Obsidian's commands for formatting, links, lists, tasks, quotes and headings work on the hotkeys you gave them. Esc or a click elsewhere finishes. Input methods, undo and redo work as in the note. The same menu lines the text up with the media at the top, in the middle or at the bottom (new setting `valign`). A layout with text does not float and is not merged with other layouts. Older versions of the plugin show such layouts as plain Markdown and never change them.
- Layouts can no longer be changed in reading view, which only shows them: dragging, resizing and the image menu work in live preview.
- Move a whole layout in live preview by the grip on top of its frame. Dropped in the middle of the text, it goes between two paragraphs; dropped in the left or right third, it floats on that side, starting at the line you point at.
- A layout that floats right has its width handles on its left edge.
- While a layout shows its source in live preview, the images and videos in it are thumbnails, so the note no longer jumps by the height of the images. A wrapped layout keeps floating beside its source.
- Images and videos shown before get their size up front when a layout is drawn again, so layouts no longer change shape once their media has loaded.
- Removing a layout at the top of a note also removes the blank line after it.
- The opening comment of a layout with only layout-wide settings no longer ends in an empty `"rows":[]`.

## 0.2.1 - 2026-09-13

- Refresh the English and Chinese README with reorganized feature descriptions, usage instructions, and a demo image.
- Refine Chinese interface wording and layout block terminology in the design documentation.

## 0.2.0 - 2026-09-13

- In live preview, a glowing frame shows where each layout begins and ends. Drag its right edge to change the layout's width, its bottom edge to scale the height of every row, or its corner to scale both.
- Drag an image from anywhere in the note into a layout, in live preview. Images on a line with other text stay where they are.
- Drag a single image left or right within its row to place it anywhere; it snaps to left, center and right. Those three are stored as before; other positions use the new `offset` setting.
- Right-click an image in live preview and choose **Wrap in a layout**. You can also click an image and run **Wrap selected media in a layout**, for example from a hotkey.
- Double-click an image in a layout in live preview to view it: scroll to zoom, drag to pan, arrow keys for the layout's other images, Esc to close.
- A click at the end of a drag no longer opens Obsidian's image viewer in reading view.
- New layout setting `width` for the whole layout. Older versions of the plugin show such layouts at full width and keep the setting.

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
