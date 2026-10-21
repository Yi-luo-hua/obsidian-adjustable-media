# FAQ

## Do my notes still work if I remove the plugin?

Yes. A layout keeps ordinary image and video embeds, complete Mermaid fences and any text you put in it; its settings live in HTML comments. Without the plugin, Obsidian renders that content normally, without the saved layout. Reading view hides the comments, while live preview may show them when editing the source.

Before uninstalling, you can run "Remove layout comments from all notes…" to remove editable top-level layout comments from Markdown files after confirmation. This does not scan Canvas text cards or remove Callout image settings, and it preserves layouts whose settings cannot be read. You can remove those comments manually while keeping their content. Manual column markers (`+++`) remain ordinary text without the plugin.

## Why an HTML comment instead of a code block?

Obsidian doesn't read the inside of code blocks. Image paths stored there are not links: renaming a file doesn't update them, backlinks don't show them, attachment cleanup tools may think the files are unused, and without the plugin you would see raw data instead of images. Plain embeds avoid all of that.

## Can I edit a layout by hand?

Yes. Keep in mind:

- The opening `<!-- vml … -->` and closing `<!-- /vml -->` comments each sit on their own line, at the start of the line.
- A line between them that holds only image or video embeds, with or without spaces between them, is a row of media. Any other line is text: text before the first media row shows in a column on its left, text after the last media row in a column on its right, and a block with text and no media is a text box drawn as one column. Code, math and comments count as text too. Text between two media rows makes the block invalid, so it is left alone and displays as normal Markdown.
- Settings are matched to media rows by position; text lines don't count. If you reorder embeds by hand, column widths and captions may no longer line up; set them again.
- A block with `type:"text"` treats all its content as text, including embedded media between paragraphs. It does not split that content into media rows and side columns. Text boxes can use automatic columns or standalone `+++` lines for up to four manual columns.
- Mermaid items use `v:3, kind:"media"` and keep each complete fence as one item. When `rows[i].items` is supplied, every row must have a positive integer count and the total must cover all items exactly. See [format details](plans/layout-redesign/37-mermaid-layout-items.md). Existing V2 text layouts keep their diagrams as text content.

## Can I put a layout inside a callout, a quote or a list?

Full layout blocks must start at the beginning of a top-level line; a full layout inside a callout, quote or list item is shown as normal Markdown. Standalone image lines inside native Callouts have a separate resize handle in live preview. Its `scope:"callout-image"` comments preserve the original image line and apply the saved width in reading view and PDF; they do not enable full layouts inside Callouts.

## Can I use layouts in Canvas cards?

Yes. Canvas text and Markdown file cards support layouts within each card, including Mermaid items and editable text columns. Each card keeps its own edits and preview. Cross-card layout dragging, bulk removal from Canvas text cards and Canvas cross-reference navigation are outside the current release.

## Why does a layout say its settings could not be read?

The JSON in its opening comment is invalid, or it was written by a newer version of the plugin. The layout is shown with default settings and the plugin won't rewrite it, so nothing it couldn't read is lost. Fix the JSON and it works again.

## Why is automatic conversion off by default?

It changes your note when you drop or paste media, so you turn it on yourself in the plugin settings. It converts the media inserted by that action, and may append them to a compatible layout directly above. Floating layouts and layouts with text are not extended. It does not convert ordinary typed text, and you can undo the conversion with Ctrl+Z (Cmd+Z on macOS).

## What happens when I publish a note?

The comments are kept as HTML comments, which don't show on the page, and the images display however your publishing tool shows them. Without the plugin's styling, large images from the same row will stack vertically.

## Why do lines break differently in the PDF than on screen?

When no text font is set, Obsidian exports PDFs in Arial while the screen uses your system font, so words take a different width and lines break elsewhere. Set a font under **Settings → Appearance → Text font** and both use it. Paper width also differs from your window, so lines break where the paper ends; the layouts themselves keep their proportions.

## Does it support touch devices?

Yes. Android, iPhone and iPad installation and touch controls have been enabled since 0.8.0. Device results belong to their tested builds: recent desktop updates were not all retested on mobile, and the latest standalone Mermaid hold-and-drop gestures were checked on an Android tablet only. See [project status](STATUS.md) and the [mobile record](plans/layout-redesign/mobile-adaptation.md) for the supported operations and untested ranges.

## Does the plugin send my data anywhere?

No. It runs entirely on your device. Web images referenced in your notes are loaded by Obsidian itself.

## Where should I download it?

From Community plugins in Obsidian: search for Adjustable Media. You can also download the files from this repository's GitHub releases. The release files come with build provenance attestations; see [Verifying a release](../SECURITY.md#verifying-a-release).
