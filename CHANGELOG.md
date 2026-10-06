# Changelog

## Unreleased

- In a PDF, a floating layout that does not fit at the bottom of a page moves to the next page together with the text it wraps and the heading right before it. It used to move alone, leaving its text behind at full width and wrapping unrelated text on the next page.
- In a PDF, a table next to a floating layout shrinks to fit beside it, as in reading view, instead of dropping below the layout at full width.
- In a note with layouts, live preview spaces the note's text like reading view and the PDF: a blank line takes the height of a paragraph break instead of a whole line, extra blank lines take no room while the cursor is elsewhere, and a paragraph break is added where reading view separates blocks written without a blank line (text right after a heading, a list or quote right after text). Layouts get the same spacing as in reading view. The text beside a floating layout is now the same while editing as in reading view and the PDF.

## 0.7.1 - 2026-10-05

- **Add text on the left/right** is no longer offered for a floating layout. Text beside media stops a layout from floating, so the editor used to close after the first letter typed and the layout jumped; choose **No text wrap** first.
- **Move out of layout** keeps the moved embed a paragraph of its own. Moved out of a floating layout, it used to join the paragraph the layout wraps and take over the float's position.
- Dragging a layout, an image or a file no longer redraws every layout and discards their measured heights; the moved layout keeps its dimmed look while it is dragged.
- **Merge with the next layout** refuses to merge when the next layout has block settings (width, wrapping, alignment or settings from a newer version) that the first one does not share, instead of silently dropping them.
- **Wrap selection in a layout** no longer takes in the line after a selection of whole lines that ends at the start of that line.
- References to figures, tables and equations can be clicked in pop-out windows too. Links, handles and menus inside layouts in pop-out windows are recognized there as well.
- While the source of a floating text box is shown, the float beside it shows the box's text and numbered captions instead of an empty frame, so the note keeps wrapping around it.
- Wrapping, the image menu and automatic conversion leave indented media lines alone: they belong to a list item or an indented code block, and wrapping them took the image out of the list or turned code into a layout. Selected together with text, they now stay text in a text box, verbatim, and a selection that starts on an indented line is not wrapped.
- Notes with many floating layouts no longer recompute every layout's offset on each cursor move.
- A layout whose `rows` setting is not a list of objects is now shown read-only with a warning, like other unreadable settings. It used to be editable, and the next edit silently dropped those row settings.
- Reading view and live preview take for a cross-reference label exactly what numbering counts as one: `{#fig:a.}`, whose dot ends the sentence, is left as written.
- The cache of media sizes used to keep layouts steady while images load is now limited instead of growing for the whole session.
- Text in a layout's text column that cannot be saved (its frame is red) is no longer thrown away without asking. Press Esc twice to give it up; clicking elsewhere leaves the editor open with its red frame, to fix the text later, also while lines are added or removed above the layout. If the editor goes away anyway (reading view, another note, or the layout changed elsewhere), the draft is kept until Obsidian restarts and comes back the next time you edit that column, unless the column was changed elsewhere meanwhile. Identical blocks in a note never take each other's editor or draft: where it cannot tell which one a draft belongs to, it is not kept or not restored, with a notice.
- The command palette, quick switcher and settings open with their hotkeys while a text column is being typed in. Other hotkeys still stay away from the column, as before.
- Media dropped or pasted below a floating layout get a layout of their own instead of joining the floating one.
- Typing in a note without layouts or cross-references no longer reads the whole note on each keystroke, and moving the cursor in a note with references no longer does either.
- Opening a note no longer draws each of its layouts twice.

Unsaved drafts are kept only in memory for the current plugin session; restarting Obsidian or reloading the plugin clears them. Retention and recovery require an unambiguous block match and retained buffer context. The note format remains V2; no migration is needed.

## 0.7.0 - 2026-10-01

- Keep layout edits tied to the intended block when identical blocks move, and reject edits whose original source or dependencies have changed. Layout commands and automatic media conversion use the same source validation; blocks with unreadable settings keep their comments and cannot be unwrapped.
- Synchronize reading panes independently, refresh layouts when surrounding wrap text changes, and retain updates while a pane's host is delayed. An empty section source is resolved through its own pane.
- Unrelated paragraph edits now confirm retained reading sections without redrawing the whole note. When deleting an earlier media row or moving a section into another block changes its row settings, reinstall that section with the correct height and captions.
- Keep layout dimensions separate for each pane, width and rendering mode; invalidate measurements after font, theme or width changes, and discard stale callbacks. Media loading requests local measurements, and failed Markdown rendering is not counted as complete.
- Reduce layout snapshot overhead and redundant reading-view work while preserving the existing neighbor-anchor compensation for floating layouts.

The note format remains V2; no migration is needed. Full lifecycle validation, the complete float planner and new group layouts remain future work. Targeted Obsidian 1.13.7 validation and measured limitations are recorded in `docs/STATUS.md` and the layout implementation records.

## 0.6.1 - 2026-09-24

- Dragging a floating layout could make Obsidian repeatedly unresponsive; layouts that share a document position no longer recompute their wrap gap in a feedback loop.
- A floating layout dropped after an earlier float now lands where the pointer is, measured from the block's actual rendered height instead of its anchor line.
- Adjacent left and right floating layouts that share an anchor now keep independent positions: dragging one no longer pushes the other along, and a float dragged up past its neighbor leaves that neighbor at its original height, even in a chain of three or more alternating floats.

## 0.6.0 - 2026-09-22

- Add an offline Chinese and English feature guide that walks through the plugin's core layouts step by step — side-by-side media, text beside media, text wrap and float, multi-column text with academic cross-references, and video — with bundled sample figures and a short teaching video. Open **Feature examples** from the command palette, or create an editable copy with its media. The guide appears once for new installs and existing users receiving it for the first time; ordinary later updates do not reopen it.
- Add an interface-language setting (Follow Obsidian, Chinese or English) for the plugin's menus, settings and notices.
- Match separator and equation spacing between Live Preview and Reading View, refresh references in Live Preview callouts, and fix PDF numbering, wide-table clipping and unnecessary page breaks in text layouts.

## 0.5.0 - 2026-09-21

- In Live Preview and Source mode, a valid text selection now adds **Wrap selection in a layout** to the editor context menu. The same command remains available in the command palette and can be assigned a custom shortcut under **Settings → Hotkeys**; the plugin does not set a default shortcut.
- Moving, resizing or using the right-click menu on a layout — and undoing or redoing the gesture — no longer scrolls the note to its own cursor, which used to push the layout out of view and close its editor when the cursor was far away. Ordinary typing, undo and redo keep their previous behavior.
- PDF export now draws layouts: media, text columns and their wrap settings appear as they do on screen, instead of only the plain embeds. Notes without layouts export exactly as before.
- A layout can no longer be dropped inside a fenced code block, or into an unclosed code fence, equation, comment or frontmatter at the end of the note. A code fence now clears a floating layout beside it, so its background and width are no longer cut by the image.
- In reading view, a wide table beside a floating layout scrolls horizontally in place instead of being squeezed below the layout.
- A layout with text beside its media now has the same width in reading view and in live preview, so its text wraps identically in both, and centered or bottom-aligned media no longer shift with the height of the text.
- Expanding the source of a layout with text beside its media keeps the read-only preview in place, so the images no longer jump from beside the text to below it.
- Numbered captions and equations: two adjacent single-line equations now each get their own number, and a caption's number no longer leaks into a heading, list, quote or table right after it.

## 0.4.0 - 2026-09-17

- Text boxes: a layout block with text and no media is now a layout of its own, drawn as one column of Markdown at the layout's width. Like media, it can float left or right with the note's text wrapping around it (`wrap`, `skip`), and be moved as a whole. In live preview, click its text to edit it, drag its frame's edge to set its width, and right-click it to choose the wrap or to remove the box and keep its text. Older versions of the plugin show such blocks as plain Markdown and never change them.
- The wrap command (now **Wrap selection in a layout**) also takes lines with text: they are wrapped as they are, into a text box, or into text columns beside the media selected with them. Code, math and comments go in with the text; a selection that would not read back as one layout is refused.
- Reading view draws a layout with text in the section of its opening comment. Drawn in the section of its first line, it was wiped when that line was a heading, and, floating, it was narrowed when that line started a table.
- Text ending in a list gets a blank line above a layout's closing comment, whether written by the wrap command or typed in the layout. Without it, reading view took the comment and the text after the layout into the list.
- Paper drafts: a text box can flow through 2–4 balanced columns, with its own column gap, text alignment (justified included) and text size, and a narrow layout can sit in the middle or on the right. Choose them under **Text settings…** in the layout's menu. New layout settings `type`, `cols`, `gap`, `textAlign`, `size` and `align`.
- Code, math and comments may now be written inside a layout block, as part of its text. With `"type":"text"`, media lines inside a text box are figures in its text.
- Numbered figures, tables and equations, with references, written as pandoc-crossref reads them: `{#fig:name}` and `{#tbl:name}` at the end of a caption, `\label{eq:name}` in an equation, `@fig:name` in the text. Captions in layouts are drawn as Markdown. A new setting picks English or Chinese numbers.
- Fix text typed in a layout closing the layout's editor when the note's cursor was far away, or when the layout was tall, and fix the caret landing at the end of English text when a layout's text is clicked.
- Tall layouts keep their height while live preview scrolls.
- Reading view draws layouts and numbers in sections Obsidian gives without the note's text, and draws open notes again once the plugin is enabled, so it no longer falls back to plain Markdown until the note is edited.
- In columns, headings stay with the text after them, and figures, tables, equations and their captions are not split between columns.
- A blank line between two floating layouts no longer pushes the second one a line down in live preview.

## 0.3.1 - 2026-09-15

- Reading view finds the notes with floating layouts without a `:has()` selector, which can slow down style updates in long notes. The stylesheet uses `!important` only where it must override Obsidian's own.

- Synchronize reused reading-view sections when adding the first floating layout or removing the last, independently in each pane.

## 0.3.0 - 2026-09-15

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
