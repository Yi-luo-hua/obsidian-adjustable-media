# An experiment notebook with room for its figures

Follow a three-point moving average using the **teaching dataset** `[2, 5, 3, 8, 4, 9, 6, 8, 7]`. Every chart, animation and value below comes from these samples. All example media ship with the plugin and work offline.

**Try this first:** create the example note → switch to Live Preview → drag the gap between the charts. Use Reading View to read and Live Preview to adjust layouts.

## 1 · Compare side by side

Before-and-after experiments, design revisions and screenshot comparisons benefit from sharing a row.

<!-- vml {"v":2,"rows":[{"height":190,"widths":[1,1],"captions":["Original samples. {#fig:raw}","Three-point mean; endpoints omitted. {#fig:mean}"]}]} -->
![Original samples](./assets/raw.svg) ![Three-point moving average](./assets/mean.svg)
<!-- /vml -->

**Try it:** drag the gap to change the ratio, or the bottom edge to change row height. Drag images to reorder them or start a new row. Use up to four items per row and multiple rows for a gallery; loose images can join an existing layout. Right-click to edit captions and their alignment.

## 2 · Keep the interpretation beside the evidence

<!-- vml {"v":2,"width":0.55,"valign":"center","rows":[{"width":1}]} -->
![Three-point moving average](./assets/mean.svg)
### Smoothing has a cost
The original peak is **9**; its window averages **6.33**. Local variation decreases, but the peak is suppressed too. Keep the original chart when reporting a conclusion.
<!-- /vml -->

**Try it:** click the text to edit it in place; press Esc to finish. Right-click the image to add a left column or align the text at the top, middle or bottom. Text supports Markdown, lists, tasks, links, math and your formatting shortcuts.

## 3 · Wrap a short reminder into its context

<!-- vml {"v":2,"type":"text","wrap":"right","width":0.32,"size":0.9} -->
**At the boundaries**

Only samples 2–8 have a complete window. Leave the endpoints empty instead of padding with zeros.
<!-- /vml -->
A moving average replaces a sample with the mean of three neighbors. It helps a study note show local variation; it does not establish measurement accuracy or replace checking unusual values. The sidebar explains the missing endpoints while the surrounding text continues at full width below it.

**Try it:** images can float left or right too, using their context menu. Drag the grip above the frame to move a whole layout: the middle of the text places it between paragraphs; either side makes it float from the chosen position. Drag frame edges to resize, or a corner to scale proportionally. A single image slides horizontally and snaps left, center or right. Esc cancels a drag.

## 4 · Columns, equations and references explain the method

<!-- vml {"v":2,"type":"text","cols":2,"gap":1.5} -->
### Method

For each interior sample:

$$
y_t=\frac{x_{t-1}+x_t+x_{t+1}}{3}\label{eq:mean}
$$

Compare @fig:raw with @fig:mean: @eq:mean reduces local fluctuations. This code keeps the seven complete windows:

```python
x = [2, 5, 3, 8, 4, 9, 6, 8, 7]
y = [sum(x[i-1:i+2]) / 3
     for i in range(1, len(x)-1)]
```

### Check

| Sample | Original | Mean |
| --- | ---: | ---: |
| 2 | 5 | 3.33 |
| 4 | 8 | 5.00 |
| 6 | 9 | 6.33 |

Three windows checked by hand. {#tbl:check}

Use @tbl:check to check arithmetic, not to equate smoothness with accuracy. Text temporarily uses one column while editing, then returns to its layout.
<!-- /vml -->

**Try it:** right-click the text box → **Text settings** for 2–4 columns, column gap, text size, alignment and block position. One column works better on a narrow screen.

**Numbering syntax:** end a figure caption with `{#fig:name}`, a table caption with `{#tbl:name}`, or put `\label{eq:name}` inside an equation. Refer to them with `@fig:name`, `@tbl:name` and `@eq:name`; click a reference to jump. Numbering follows the order within this note. Choose English or Chinese in settings.

## 5 · Keep the process as well as the result

<!-- vml {"v":2,"rows":[{"height":190,"widths":[1,1],"captions":["A three-point window moving across the samples (teaching animation).","Original samples for checking while paused."]}]} -->
![Moving window animation](./assets/window.webm) ![Original samples](./assets/raw.svg)
<!-- /vml -->

**Try it:** play the animation, then move it using the video's dedicated top-left drag handle. Playback controls remain usable. Double-click an image in Live Preview to inspect it: scroll to zoom, drag to pan and use the arrow keys to switch images.

## Use it in your own notes

| Goal | Shortest route |
| --- | --- |
| Start a layout | Select text or media lines → right-click **Wrap selection in a layout**, or run that command; ordinary images have a context-menu entry too |
| Organize incoming media | Enable automatic conversion after drop/paste in settings if useful (off by default) |
| Merge or unwrap | Run **Merge with the next layout**; use the context menu to move one item out, or remove layout comments to retain the content |
| Inspect or undo | Click **Edit source**; use Obsidian's Undo/Redo for adjustments |
| Share the result | Switch to Reading View or use Obsidian's **Export to PDF**; paper width changes line breaks and pagination |
| Return to this guide | Search **Feature examples** in the command palette; assign your own shortcuts in Obsidian settings |

Layouts live in HTML comments; media remain ordinary embeds. With the plugin disabled, content remains in normal Markdown order. Layouts and automatic numbering require the plugin. Replace the example files with your own media whenever you like.
