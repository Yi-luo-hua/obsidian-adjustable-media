# Adjustable Media

Arrange, resize, and lay out images and videos in Obsidian like a modern canvas using layout blocks — stored via lightweight HTML comments, keeping 100% native Markdown with zero format lock-in.

[English](README.md) · [简体中文](README.zh-CN.md)

**0.9.2 is released**, keeping layouts rendered after conversion and wrapping inline images without pulling surrounding text into the layout. See [patch verification](docs/releases/0.9.2-readiness.md).

0.9.0 adds Canvas card layouts, Callout image resizing and Mermaid context-menu wrapping, and fixes theme-related handle clipping, layout alignment and external file URL images. Theme compatibility checks screened all 901 official themes' main CSS and 342 rendering combinations from 57 theme styles. See [release verification](docs/releases/0.9.0-readiness.md).

0.8.2 fixes disappearing blank lines and overlapping line numbers away from layouts in live preview, plus reference clicks and navigation. See [patch verification](docs/releases/0.8.2-readiness.md).

0.8.0 adds Mermaid layout items and Android, iPhone and iPad support, alongside recent fixes. Android tablet Mermaid regression and the reported hold-to-drag problem have passed automatic and user checks; new gestures have not been retested on phones or iOS. See [release verification](docs/releases/0.8.0-readiness.md) and [status](docs/STATUS.md).

[Feature examples](docs/examples/Guide.en.md) · [功能示例](docs/examples/Guide.zh-CN.md). In Obsidian, run **Feature examples** for an offline preview and a button to create a working copy with its media. The guide opens once when first available, including for existing users upgrading to the release that adds it.

The latest release is **0.9.2**. Text boxes, multi-column text and numbered figures, tables and equations with cross-references were introduced in 0.4.0, following the text wrapping, movable layouts and editable text columns of 0.3. Download from [GitHub Releases](https://github.com/Yi-luo-hua/obsidian-adjustable-media/releases/latest). See the [documentation index](docs/README.md) and [project status and validation](docs/STATUS.md) for test coverage and known limitations, and [layout improvement progress and next steps](docs/plans/layout-redesign/09-progress-and-next-steps.md) for the remaining layout work.

![Adjustable Media Preview](assets/demo.jpg)

---

## Features

### 🎨 Fluid, Intuitive Mouse-Driven Layout

- **Side-by-Side & Grids**: Place images and videos side by side (up to 4 per row) with automatic height equalization.
- **Direct Mouse Resizing**: Drag the gap between two images to adjust column widths (double-click it to share the row by the images' proportions again), drag a row's bottom edge to change height, or drag the outer frame to scale the entire layout block.
- **Free Single-Image Placement**: Slide a single image left or right across its row, with smooth magnetic snapping to left, center, and right.
- **Text Wrap, like LaTeX's `wrapfigure`**: Float a layout to the left or right and let the note's own paragraphs, lists, quotes, headings and code flow around it, then continue at full width below it. The text beside it is ordinary note text: type right next to the image and it reflows as you go.
- **Text Beside Images, like Side-by-Side Minipages**: Write text in a layout block before its media for a column on their left, after them for a column on their right, or both. It is ordinary Markdown (headings, lists, quotes, links), and the media keep the layout's width in the middle. The text lines up with the media at the top, in the middle or at the bottom. In Live Preview, click the text to edit it right in the layout, where it keeps the look of Live Preview (headings, bold text, bullets, task boxes, links, rendered math and images, wrapped list items lined up under their text) and the keys work as in the note: <kbd>Tab</kbd> indents, <kbd>Enter</kbd> continues lists, brackets pair up, typing `[[` suggests links, and Obsidian's formatting, link, list, task and heading commands work on the hotkeys you gave them (<kbd>Ctrl</kbd>+<kbd>B</kbd>, <kbd>Ctrl</kbd>+<kbd>I</kbd>, <kbd>Ctrl</kbd>+<kbd>K</kbd> and <kbd>Ctrl</kbd>+<kbd>L</kbd> by default). Or right-click an image and choose **Add text on the left** or **Add text on the right** to start one.
- **Two-Column Text and Paper Drafts**: A text box can flow its text through 2–4 columns that balance themselves, like `multicols`, with its own column gap, alignment (including justified) and text size, and a narrow box can sit in the middle (right-click the box and choose **Text settings…**). Code, math and figures go inside the text, so a whole paper section can be one box.
- **Numbered Figures, Tables and Equations**: End a caption with `{#fig:name}` or `{#tbl:name}`, put `\label{eq:name}` in an equation, and write `@fig:name`, `@tbl:name` or `@eq:name` in the text. Captions start with "Figure 1.", equations get their number, and references read "Figure 1" and jump to their target when clicked. The syntax is pandoc-crossref's, so the draft converts to LaTeX as it is. Choose English or Chinese numbers in the settings.
- **Text Boxes**: A layout block can hold text alone, without media. It is drawn as one column of Markdown at the layout's width and can float left or right like an image, with the note's text wrapping around it: a sidebar or margin note. Select some lines and run the wrap command to make one; click the text to edit it, drag the frame's edge to set its width, and right-click it to float it or to remove the box and keep its text.
- **Move Whole Layouts**: Drag the grip on top of a layout's frame to move the whole block. Drop it in the middle of the text to place it between paragraphs, or in the left or right third to float it there, starting at the line you point at.
- **Flexible Drag-and-Drop Reordering**: Drag an item to reorder within a row, drop between rows to start a new row, or drag loose images from your note directly into an existing layout block.
- **Double-Click Image Viewer**: In editing mode, double-click any image in a layout block to inspect it up close; supports mouse wheel zoom, click-and-drag panning, and left/right arrow keys to switch between images in the block.
- **Video Playback**: Videos feature a dedicated drag button in the top-left corner, ensuring layout drags never accidentally trigger playback or the timeline scrubber.

### 🛡️ Zero Lock-in, Permanent Data Safety

- **Native Markdown Syntax**: Notes store standard Obsidian media embeds (`![[...]]` or `![...](...)`).
- **Minimal Comment Storage**: Layout block settings are stored compactly inside a pair of HTML comments (`<!-- vml ... -->` ... `<!-- /vml -->`).
- **Seamless Multi-Platform & Publishing Compatibility**: Even with the plugin disabled, on mobile, pushed to GitHub, or published to Hexo / Quartz / personal blogs, media still renders cleanly as ordinary embeds without clutter or broken tags.
- **Refactor-Proof**: Renaming or moving image and video files in Obsidian automatically updates links, keeping layouts completely intact.

### ⚡ Intuitive Editing Workflow

- **WYSIWYG with Instant Source Switching**: Features an illuminated control frame in editing mode; moving the cursor inside or clicking "Edit source" smoothly switches to plain Markdown text for effortless transitions between visual and handwritten editing.
- **Layout border highlighting**: Keep layout borders highlighted is enabled by default. Turn it off to show the full border on mouse hover or while editing the layout.
- **Automatic Layouts (Optional)**: When enabled in settings, multiple images or videos dropped from your computer or pasted will automatically be packaged into layout blocks.
- **Validated Writes**: Layout gestures in an active editor use one transaction with native Undo/Redo. Markdown file operations without an active editor use `vault.process`; bulk removal validates and updates each file separately. Every write checks the expected source and preserves unrelated text and line endings.

---

## Quick Start

### 1. Create a Layout Block

- **Right-Click Menu**: In Live Preview, right-click a standalone image, video or Mermaid diagram and choose **Wrap in a layout**. For a diagram, keep its complete top-level Mermaid fence.
- **Command / Hotkey**: Select one or more lines and run `Adjustable Media: Wrap selection in a layout` (assign a dedicated hotkey in Settings → Hotkeys). Lines of media embeds are gathered into rows; lines with text are wrapped as they are, making a text box, or text columns beside the media.
- **Selected text menu**: In Live Preview or Source mode, select text, right-click and choose **Wrap selection in a layout**. The command wraps the whole lines touched by the selection. It appears only when the selection can form a layout. To choose your own shortcut, open **Settings → Hotkeys**, search for **Wrap selection in a layout**, and assign a key combination; no shortcut is assigned by default.
- **Drag & Drop**: When a layout block already exists in your note, drag standalone images or Mermaid diagrams from the same note and pane directly into it. On touch devices, diagrams have a drag handle; holding a standalone diagram's body also starts a drag, while a quick swipe scrolls.
- **Canvas cards**: Text and Markdown file cards support layouts within each card. Edit the card in Live Preview to wrap content or adjust its layout; each card keeps its own preview and edits. Cross-card layout dragging and Canvas cross-reference navigation are outside this release.
- **Callout images**: Drag the bottom-right handle of a standalone image line in a native Callout. This saves a width setting without changing the original embed; it does not turn the Callout into a layout block.

### 2. Common Interactions

| Goal | Action |
| :--- | :--- |
| **Adjust column width ratio** | Drag the gap between two items; double-click it to share the row by the images' proportions again |
| **Change row height** | Drag the bottom edge of the row |
| **Resize the entire layout block** | Drag the outer glowing frame (right edge for width, bottom edge for height, corner to scale; a layout floating right uses its left edge and bottom-left corner). From 0.9.1, media-and-text layouts can shrink too: outer edge/corner handles resize the entire layout, while media-column edge/bottom handles adjust its share/media sizes |
| **Position a single item** | Drag the image horizontally; snaps smoothly to left, center, and right |
| **Reorder or move items** | Drag and drop onto adjacent spots, between rows (to split into a new row), or into another layout block |
| **Wrap text around a layout** | Right-click an item and choose **Float left, wrap text** or **Float right, wrap text**; **No text wrap** takes it back |
| **Put text beside the media** | Right-click an item and choose **Add text on the left** or **Add text on the right**, then type right there; later, click the text to edit it in place (<kbd>Tab</kbd> indents, <kbd>Enter</kbd> continues lists, `[[` suggests links, and your formatting hotkeys such as <kbd>Ctrl</kbd>+<kbd>B</kbd>/<kbd>I</kbd>/<kbd>K</kbd> work; <kbd>Esc</kbd> or a click elsewhere finishes). The same menu lines the text up with the media at the top, in the middle or at the bottom |
| **Move the whole layout** | Drag the grip on top of the frame: the left or right third of the text floats it there from the line you point at, the middle places it between paragraphs |
| **Move a video** | Drag the dedicated handle in the top-left corner of the video |
| **Full-screen image viewer** | Double-click an image in Live Preview (scroll to zoom, drag to pan, arrow keys to switch); single-click in Reading View |
| **Captions** | Right-click an item to edit captions and alignment |
| **Move out of layout block** | Right-click an item and choose to remove it from the layout block |
| **Cancel drag gesture** | Press <kbd>Esc</kbd> anytime during a drag to cancel |
| **View/edit source** | Click the "Edit source" button in the top-right corner of the layout block (of its media, when there is text beside them) |

---

## How It Works

Adjustable Media introduces no custom syntax. Your notes contain only standard embeds wrapped in clean HTML comments:

```markdown
<!-- vml {"v":2,"rows":[{"height":240,"widths":[1,1.4]}]} -->
![[beach.png]] ![A sketch](attachments/sketch.png)
![[clip.mp4]]
<!-- /vml -->
```

- The opening comment stores only essential parameters (row height, width ratios, captions, alignment), with zero unnecessary overhead.
- A layout that wraps text sits right above the text that wraps around it, and says which side it floats to:

  ```markdown
  <!-- vml {"v":2,"width":0.4,"wrap":"left"} -->
  ![[portrait.png]]
  <!-- /vml -->
  This paragraph flows around the image, then continues at full width below it.
  ```

  Without the plugin, the image simply shows above that paragraph.
- Text written in a layout before its media shows in a column on their left, text after them in a column on their right:

  ```markdown
  <!-- vml {"v":2,"width":0.4} -->
  Text on the left: several lines or paragraphs, lists, quotes.
  ![[beach.png]]
  Text on the right.
  <!-- /vml -->
  ```

  Without the plugin, the text and the image show one after the other.
- Embed syntax remains completely untouched, fully compatible with file renaming and moving.
- To remove editable top-level layout comments from Markdown files, run `Remove layout comments from all notes…` and review the confirmation. This does not scan Canvas text cards or remove Callout image settings; unreadable layouts are preserved. Their comments can be removed manually while keeping the original content.

---

## Installation & Requirements

- **Requirements**: Obsidian 1.5.0 or newer; desktop, Android, iPhone and iPad. Device and build-specific validation is recorded in [project status](docs/STATUS.md) and the [mobile record](docs/plans/layout-redesign/mobile-adaptation.md). Recent desktop fixes have not all been retested on mobile.

### Method 1: Community Plugins (Recommended)

1. In Obsidian, open **Settings → Community plugins** and turn off Restricted mode.
2. Click **Browse**, search for **Adjustable Media**.
3. Click **Install**, then **Enable**.

### Method 2: Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Yi-luo-hua/obsidian-adjustable-media/releases/latest).
2. Place them into `<your vault>/.obsidian/plugins/adjustable-media/`.
3. Restart Obsidian and enable **Adjustable Media** in Community plugins.

---

## Notes

- Full layout blocks must start at the beginning of a top-level line, outside quotes, Callouts and lists. Resizing a standalone Callout image uses separate settings and does not enable full layouts inside Callouts.
- Reading View only shows layout blocks; change them in Live Preview.
- In a media layout, text goes before its first row of media (left column) or after its last row (right column); text between two media rows makes that layout invalid. A text-only block, or a block marked `type:"text"`, treats all its content as text and can contain embedded media anywhere. A layout with text beside its media does not wrap the note's text.
- No telemetry or analytics. Local media work offline; remote media embedded in a note still load from their source URLs.

---

## License & Acknowledgments

- Released under the [MIT License](LICENSE).
- Originally inspired by [Fall-Makito/visual-media-layout](https://github.com/Fall-Makito/visual-media-layout), and rewritten from the ground up with a resilient comment-based storage model and safe transactional pipeline.

## 0.7.3: manual text columns

Inside a text layout, write `+++` on its own unindented line to start the next column. Up to four equal-width columns align at the top, and each keeps its own content, including empty columns. Without markers, automatic columns continue to work. Type the marker while editing layout text, or use the Insert column break command in the layout source. Code, math and comments are left alone; more than four columns triggers a warning and falls back to automatic columns without changing the source.

This version also fixes clicks between text editors and on frame padding unexpectedly revealing source. Its release notes can create offline [English](docs/examples/ManualColumns.en.md) or [Chinese](docs/examples/ManualColumns.zh-CN.md) examples to match the interface language, using a fresh folder for each creation.

User acceptance, bilingual Windows/Obsidian 1.14.4 checks, all 327 automated tests and release packaging are complete. Version 0.7.3 is tagged from `codex/text-column-breaks`, based on the published 0.7.2 source and retaining its features. Version 0.7.3 was published at that stage; its three attested build files and the merged release index are verified. See [status](docs/STATUS.md) and the [implementation record](docs/plans/layout-redesign/34-text-column-breaks.md) for validation details. Version 0.7.3 was desktop only and used V2. Current mobile support and version information are recorded above.
