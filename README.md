# Adjustable Media

Put images and videos side by side in your Obsidian notes, then drag them into place and resize them with the mouse.

Your notes keep ordinary embeds. The layout lives in a single HTML comment, so a note still reads fine without the plugin, on GitHub, or wherever you publish it.

[中文说明](README.zh-CN.md)

## Features

- **Rows of up to four** images or videos at the same height, in reading view and live preview.
- **A visible frame** in live preview shows where each layout begins and ends, and resizes the whole layout.
- **Drag to rearrange**: reorder items, start a new row, move an item into another layout, or drag any image of the note into a layout.
- **Place single images freely**: drag one left or right within its row; it snaps to left, center and right.
- **Resize with the mouse**: the whole layout, a row's height, how two items share a row, or the width of a single item.
- **Captions and alignment** from the right-click menu.
- **View images**: double-click one in live preview to zoom and pan.
- **Videos keep their controls**: they move by a small grip, so seeking and volume still work.
- **Automatic layouts** (optional): media you drop or paste, from your computer or from Obsidian's file list, is laid out for you.
- **No lock-in**: remove the plugin and your images are still there as plain embeds.

## How to use

### Create a layout

Dropped and pasted images stay ordinary embeds. To turn one into a layout, in live preview:

- right-click the image and choose **Wrap in a layout**, or
- click the image, then run **Adjustable Media: Wrap selected media in a layout** from the command palette. Assign it a hotkey in **Settings → Hotkeys** to do this in one keystroke.

The command also wraps several lines of embeds at once: select them first. The embeds are placed in rows of up to four, in order.

Once a note has a layout, you can drag any other image of the note straight into it.

If you want every drop and paste laid out for you, turn on **Convert dropped and pasted media** in the plugin settings. Media you then drop (from your computer or from Obsidian's file list) or paste is wrapped in a layout, or joins the layout right above it.

### Arrange and resize

| To | Do this |
| --- | --- |
| Move an item | Drag it: beside another item, between two rows for a new row, or onto another layout in the same note. |
| Add an image to a layout | In live preview, drag the image from the note onto the layout. It works for images on a line of their own, or on a line of images only. |
| Place a single image | Drag it left or right within its row. It snaps to left, center and right, and can stop anywhere in between. |
| Move a video | Drag the grip in its top-left corner. |
| Resize the whole layout | In live preview, drag the frame: its right edge for the width, its bottom edge for the height of every row, its corner for both at once. |
| Change a row's height | Drag the row's bottom edge. |
| Change how two items share a row | Drag the gap between them. |
| Resize a single item | Drag the small corner handle on the image. |
| View an image | Double-click it in live preview: scroll to zoom, drag to pan, arrow keys for the layout's other images. In reading view, click it. |
| Add a caption, align, move an item out, or reveal the file | Right-click it, or press <kbd>Shift</kbd>+<kbd>F10</kbd> when it's focused. The menu also has Obsidian's usual file actions, such as revealing the file in the file list. |
| Edit the source | In live preview, click **Edit source** in the layout's corner, or move the cursor into the layout. |

Press <kbd>Esc</kbd> while dragging to cancel.

### Commands

- **Wrap selected media in a layout**
- **Merge with the next layout**: joins two layouts that only have blank lines between them.
- **Remove the layout comments here**: turns the layout under the cursor back into plain embeds.
- **Remove layout comments from all notes…**: lists every note it would change and does nothing until you confirm.

## What's stored in your note

```markdown
<!-- vml {"v":2,"rows":[{"height":240,"widths":[1,1.4]}]} -->
![[beach.png]] ![A sketch](attachments/sketch.png)
![[clip.mp4]]
<!-- /vml -->
```

Each line between the two comments is one row. Row heights, widths, alignment and captions go into the opening comment; a layout without settings is just `<!-- vml -->`. The plugin never rewrites the embeds themselves, so renaming or moving a file updates its links as usual.

## Installation

**From Community plugins**

1. Open **Settings → Community plugins** and turn off Restricted mode if it's on.
2. Click **Browse**, search for **Adjustable Media**, then click **Install** and **Enable**.

You can also open the [plugin's page](https://obsidian.md/plugins?id=adjustable-media) and click **Add to Obsidian**.

**Manually**

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/Yi-luo-hua/obsidian-adjustable-media/releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/adjustable-media/`.
3. Restart Obsidian and enable **Adjustable Media** in **Settings → Community plugins**.

Desktop only for now. Requires Obsidian 1.5.0 or newer; tested with 1.13.7.

## Good to know

- A layout starts at the beginning of a line, so it can't sit inside a callout, a quote or a list.
- Every line in a layout may only hold image or video embeds. A layout with anything else in it is left alone and shows as normal Markdown.
- If a layout's settings can't be read, for example after a hand edit went wrong, the layout is shown with default settings and a notice. The plugin won't change it until the settings are fixed.
- Without the plugin, live preview shows the comments as a faint line. Reading view, GitHub and most publishing tools hide them.
- To uninstall cleanly, run **Remove layout comments from all notes…** first. You don't have to: the images display either way.

More answers in the [FAQ](docs/FAQ.md).

## Privacy

Everything runs on your device. The plugin makes no network requests and collects nothing. Web images in your notes are loaded by Obsidian itself.

The plugin only reads the notes it shows or changes. The one exception is **Remove layout comments from all notes…**, which reads every note in the vault to find the layouts to remove, and only when you run it.

## Feedback

Found a bug or have an idea? [Open an issue](https://github.com/Yi-luo-hua/obsidian-adjustable-media/issues).

## Development

```bash
npm ci
npm run dev
```

`npm run dev` rebuilds `main.js` on every change. Before opening a pull request, run `npm run check`: it type-checks, lints with the rules of the Obsidian plugin review ([eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin)) and runs the tests. The storage format and architecture are described in [docs/DESIGN.md](docs/DESIGN.md) (in Chinese).

## Credits

This project started from [Fall-Makito/visual-media-layout](https://github.com/Fall-Makito/visual-media-layout) and has since been rewritten around a different storage format.

## License

[MIT](LICENSE)
