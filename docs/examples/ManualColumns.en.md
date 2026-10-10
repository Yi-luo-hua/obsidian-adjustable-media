## Basic usage

Inside a text layout, write `+++` on its own unindented line to end the current column and start the next one. Columns have equal widths, align at the top, and wrap text within their own boundaries. Each column can contain a different amount of text. Up to four columns are supported.

<!-- vml {"v":2,"type":"text"} -->
First column content

+++

Second column content
<!-- /vml -->


## Leave an empty column

Two consecutive `+++` markers leave an empty column. The second column in this example is empty, while the third and fourth keep their positions.

<!-- vml {"v":2,"type":"text","gap":1} -->
### First column


+++
+++

### Third column



+++

### Fourth column
<!-- /vml -->

## Markers in code and ordinary horizontal rules

A `+++` inside a code block stays unchanged and does not start a new column. A `---` remains a Markdown horizontal rule. Only the column marker outside the code block takes effect in this example.

<!-- vml {"v":2,"type":"text","gap":1} -->
### Code example

```text
+++
This marker is inside a code block and does not split columns.
```

+++

### Ordinary Markdown

Text above the rule.

---

Text below the rule.
<!-- /vml -->

## Start a new column after a list or quote

Leave a blank line after the list or quote, then write an unindented `+++` so the marker is at the top level of the text.

<!-- vml {"v":2,"type":"text","gap":1} -->
### To-do list

- [ ] Organize your material
- [ ] Write your own explanation
- [ ] Review the key concepts

+++

### A reminder

> Explain the problem clearly before thinking about how to solve it.

The quote and this additional text both belong to the right column.
<!-- /vml -->


## Tips

- This first version supports up to four columns. More than four triggers a warning and falls back to automatic columns.
- A marker must occupy its own unindented line. Indented markers, four or more plus signs, and markers inside code, math or comments do not split columns.
- Layouts without markers continue to use automatic columns.

