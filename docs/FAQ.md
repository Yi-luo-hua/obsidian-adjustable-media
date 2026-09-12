# FAQ

## Do my notes still work if I remove the plugin?

Yes. A layout stores ordinary image and video embeds; its settings live in an HTML comment. Without the plugin the images display as usual. Reading view hides the comments, while live preview shows them as a faint line. To remove the comments too, run "Remove layout comments from all notes" before uninstalling.

## Why an HTML comment instead of a code block?

Obsidian doesn't read the inside of code blocks. Image paths stored there are not links: renaming a file doesn't update them, backlinks don't show them, attachment cleanup tools may think the files are unused, and without the plugin you would see raw data instead of images. Plain embeds avoid all of that.

## Can I edit a layout by hand?

Yes. Keep in mind:

- The opening `<!-- vml … -->` and closing `<!-- /vml -->` comments each sit on their own line, at the start of the line.
- Every line between them may only contain image or video embeds, with or without spaces between them. A layout that also contains text is left alone and displays as normal Markdown.
- Settings are matched to rows by position. If you reorder embeds by hand, column widths and captions may no longer line up; set them again.

## Can I put a layout inside a callout, a quote or a list?

No. The layout comments must start at the beginning of a line, and a layout inside a callout, quote or list item is shown as normal Markdown.

## Why does a layout say its settings could not be read?

The JSON in its opening comment is invalid, or it was written by a newer version of the plugin. The layout is shown with default settings and the plugin won't rewrite it, so nothing it couldn't read is lost. Fix the JSON and it works again.

## Why is automatic conversion off by default?

It changes your note when you drop or paste media, so you turn it on yourself in the plugin settings. It only touches the lines inserted by that drop or paste, never anything you type, and you can undo a conversion with Ctrl+Z (Cmd+Z on macOS).

## What happens when I publish a note?

The comments are kept as HTML comments, which don't show on the page, and the images display however your publishing tool shows them. Without the plugin's styling, large images from the same row will stack vertically.

## Why desktop only?

Dragging with touch isn't supported yet.

## Does the plugin send my data anywhere?

No. It runs entirely on your device. Web images referenced in your notes are loaded by Obsidian itself.

## Where should I download it?

From Community plugins once it's listed. Until then, use [BRAT](https://github.com/TfTHacker/obsidian42-brat) or download the files from this repository's GitHub releases. The release files come with build provenance attestations; see [Verifying a release](../SECURITY.md#verifying-a-release).
