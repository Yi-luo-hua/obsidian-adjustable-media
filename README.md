# Adjustable Media

Arrange, resize, and lay out images and videos in Obsidian like a modern canvas using layout blocks — stored via lightweight HTML comments, keeping 100% native Markdown with zero format lock-in.

[English](README.md) · [简体中文](README.zh-CN.md)

![Adjustable Media Preview](assets/demo.jpg)

---

## Features

### 🎨 Fluid, Intuitive Mouse-Driven Layout

- **Side-by-Side & Grids**: Place images and videos side by side (up to 4 per row) with automatic height equalization.
- **Direct Mouse Resizing**: Drag the gap between two images to adjust column widths, drag a row's bottom edge to change height, or drag the outer frame to scale the entire layout block.
- **Free Single-Image Placement**: Slide a single image left or right across its row, with smooth magnetic snapping to left, center, and right.
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
- **Automatic Layouts (Optional)**: When enabled in settings, multiple images or videos dropped from your computer or pasted will automatically be packaged into layout blocks.
- **Single-Transaction Safe Writes**: All modifications execute through a single editor transaction (with native Undo/Redo support), strictly verifying context anchors before writing, never altering untouched lines, blank lines, or indentations.

---

## Quick Start

### 1. Create a Layout Block

- **Right-Click Menu**: In Live Preview, right-click any image or video and choose **Wrap in a layout block**.
- **Command / Hotkey**: Select one or more lines of media embeds and run `Adjustable Media: Wrap selected media in a layout block` (assign a dedicated hotkey in Settings → Hotkeys).
- **Drag & Drop**: When a layout block already exists in your note, drag standalone images from the note directly into it.

### 2. Common Interactions

| Goal | Action |
| :--- | :--- |
| **Adjust column width ratio** | Drag the gap between two items |
| **Change row height** | Drag the bottom edge of the row |
| **Resize the entire layout block** | Drag the outer glowing frame (right edge for width, bottom edge for height, corner for proportional scale) |
| **Position a single item** | Drag the image horizontally; snaps smoothly to left, center, and right |
| **Reorder or move items** | Drag and drop onto adjacent spots, between rows (to split into a new row), or into another layout block |
| **Move a video** | Drag the dedicated handle in the top-left corner of the video |
| **Full-screen image viewer** | Double-click an image in Live Preview (scroll to zoom, drag to pan, arrow keys to switch); single-click in Reading View |
| **Captions** | Right-click an item to edit captions and alignment |
| **Move out of layout block** | Right-click an item and choose to remove it from the layout block |
| **Cancel drag gesture** | Press <kbd>Esc</kbd> anytime during a drag to cancel |
| **View/edit source** | Click the "Edit source" button in the top-left corner of the layout block |

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
- Embed syntax remains completely untouched, fully compatible with file renaming and moving.
- If you ever decide to stop using the plugin, run `Remove layout block comments from all notes…` to cleanly restore plain Markdown in one step.

---

## Installation & Requirements

- **Requirements**: Obsidian 1.5.0 or newer (Desktop).

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

- Layout blocks must start at the beginning of a line (not nested inside quotes, callouts, or lists).
- Each line inside a layout block must contain only image or video embeds. If mixed with plain text, the plugin automatically leaves it untouched to render as normal Markdown.
- Completely offline & private: zero network requests, zero telemetry.

---

## License & Acknowledgments

- Released under the [MIT License](LICENSE).
- Originally inspired by [Fall-Makito/visual-media-layout](https://github.com/Fall-Makito/visual-media-layout), and rewritten from the ground up with a resilient comment-based storage model and safe transactional pipeline.
