# Adjustable Media

Arrange images and videos side by side in your notes, then drag to reorder and resize them. Up to four items share a row, all at the same height.

Your notes keep ordinary embeds. The layout is stored in a single HTML comment, so a note still reads fine without the plugin, on GitHub, or wherever you publish it.

[中文说明](README.zh-CN.md)

## What a layout looks like in the note

```markdown
<!-- vml {"v":2,"rows":[{"height":240,"widths":[1,1.4]}]} -->
![[beach.png]] ![A sketch](attachments/sketch.png)
![[clip.mp4]]
<!-- /vml -->
```

- Each line between the two comments is one row of image or video embeds (`![[…]]` or `![…](…)`).
- Row height, column widths, the width and alignment of a single item, and captions are stored in the opening comment. A layout without settings is just `<!-- vml -->`.
- The plugin never rewrites the embeds themselves. It only changes the settings or moves whole embeds, so renaming a file updates its links as usual.

## Features

- Layouts render in reading view and live preview. In live preview, putting the cursor inside a layout shows its source.
- Drag an item to reorder it, to start a new row, or into another layout in the same note.
- Drag the bottom edge of a row to change its height, the gap between two items to change their widths, or the corner of a single item to change its width.
- Right-click an item to edit its caption, reveal the file, align a single item, or move it out of the layout.
- Videos move by the grip in their top-left corner, so their playback controls keep working.
- Commands:
  - Wrap selected media in a layout
  - Merge with the next layout
  - Remove the layout comments here
  - Remove layout comments from all notes (shows a preview first)
- Optional automatic conversion, off by default: media you drop or paste is wrapped in a layout, or joins the layout right above it.

## Installation

Desktop only. Tested with Obsidian 1.13.7.

Until the plugin is listed in Community plugins:

1. Download `main.js`, `manifest.json` and `styles.css` from the latest [release](../../releases).
2. Put them in `<your vault>/.obsidian/plugins/adjustable-media/`.
3. Restart Obsidian and enable Adjustable Media in Settings → Community plugins.

More detail in [docs/INSTALL.md](docs/INSTALL.md).

## Removing the plugin

Disable or delete it. Your notes are left with plain embeds and comments that don't show up in reading view, so the images keep displaying. To remove the comments as well, run "Remove layout comments from all notes" before you uninstall.

## Good to know

- If a layout's settings can't be read, for example after a manual edit went wrong, the layout is shown with default settings and a notice, and the plugin won't rewrite it until the settings are fixed.
- Without the plugin, live preview shows the comments as a faint line. Reading view, GitHub and most publishing tools hide them.
- Automatic conversion only touches the lines inserted by a drop or paste. Typing never triggers it.

See the [FAQ](docs/FAQ.md) for more.

## Privacy

Everything runs on your device. The plugin makes no network requests and collects nothing. Web images referenced in your notes are loaded by Obsidian itself.

## Development

```bash
npm ci
npm run check
npm run dev
```

`npm run check` type-checks, lints with the rules of the Obsidian plugin review ([eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin)) and runs the tests; `npm run dev` rebuilds `main.js` on every change. The storage format and architecture are described in [docs/DESIGN.md](docs/DESIGN.md) (Chinese), and the release process in [docs/RELEASE.md](docs/RELEASE.md).

## Credits

This project started from [Fall-Makito/visual-media-layout](https://github.com/Fall-Makito/visual-media-layout) and has since been rewritten around a different storage format.

## License

[MIT](LICENSE)
