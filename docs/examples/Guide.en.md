## 1. Side-by-Side Media

<!-- vml {"v":2,"rows":[{"height":190,"widths":[1.223,0.777],"captions":["Fine-tuning parameters vs. accuracy {#fig:eval}","GPT-2 scale and zero-shot performance {#fig:gpt2}"]}]} -->
![LoRA comparison](./assets/lora-eval.png) ![GPT-2 performance](./assets/gpt2-perf.png)
<!-- /vml -->

- **Adjust image width**: Drag the divider between images to adjust width distribution.
- **Resize layout block**: Drag the bottom edge of the block to adjust height; drag the bottom-right corner to scale proportionally.
- **Adjust media arrangement**: Click and drag an image to reorder media within the layout (left/right/up/down); if a row has only one image, drag horizontally to adjust its offset.
- **Add / edit caption**: Right-click an image and choose "Edit caption…" to edit text and alignment.
- **Layout block position**: Drag the handle in the center of the block to move it; drag left/right to position it left or right.
---

## 2. Text Beside Media

<!-- vml {"v":2,"width":0.48,"valign":"center","rows":[{"width":1}]} -->
![LoRA architecture](./assets/lora-arch.png)
### Low-Rank Adaptation (LoRA)
Freeze pre-trained weights $W \in \mathbb{R}^{d \times k}$ and introduce rank decomposition matrices:
$$h = W x + \frac{\alpha}{r} B A x$$
where $B \in \mathbb{R}^{d \times r}, A \in \mathbb{R}^{r \times k}$, with rank $r \ll \min(d, k)$.
<!-- /vml -->

- **In-place editing**: Click the text on the right to edit directly; press `Esc` to exit.
- **Vertical alignment**: Right-click the image to switch text alignment to top, center, or bottom.
- **Add text box**: Right-click text in the layout block to add a text column on the left or right.

---

## 3. Text Wrap & Float

<!-- vml {"v":2,"width":0.3,"wrap":"right","type":"text","size":0.9} -->
**Hyperparameters**
- Rank $r = 8$
- Scaling $\alpha = 16$
- Optimizer: AdamW
<!-- /vml -->
Right-click the layout block to choose the text wrapping mode.

In large language model fine-tuning, low-rank adaptation drastically reduces trainable parameters. The card on the right floats right, with body text wrapping around it, resuming full-width flow below the card to maintain a compact page layout.


---

## 4. Multi-Column Text & Academic Cross-References

Multi-column paper layout supporting automatic numbering and clickable jump links for figures, tables, and equations.

<!-- vml {"v":2,"type":"text","cols":2,"gap":1.5} -->
### Attention Mechanism

Standard scaled dot-product attention is formulated as:

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V \label{eq:attn}
$$

As illustrated in @fig:eval and @fig:gpt2, models following @eq:attn demonstrate strong scalability.

### Model Parameters

| Architecture | Hidden Dim | Attention Heads |
| --- | ---: | ---: |
| Small (117M) | 768 | 12 |
| Medium (345M) | 1024 | 16 |
| Large (762M) | 1280 | 20 |

GPT-2 model specifications {#tbl:arch}

See @tbl:arch for details. When editing, text temporarily unfolds into a single column, restoring multi-column flow upon exiting.
<!-- /vml -->

- **Column settings**: Right-click the text layout block and choose "Text settings…" to switch 2–4 columns, adjust column gap, and set alignment.
- **Auto-numbering**: Append `{#fig:label}` to captions, `{#tbl:label}` to table captions, and `\label{eq:label}` inside equations; reference them in body text with `@fig:label`, `@tbl:label`, and `@eq:label` for click-to-jump navigation.

---

## 5. Video & Media Combination


<!-- vml {"v":2,"rows":[{"height":190,"widths":[1,1],"captions":["Sliding window attention animation","Model architecture comparison"]}]} -->
![Sliding window](./assets/window.webm) ![LoRA architecture](./assets/lora-arch.png)
<!-- /vml -->

- **Video handle**: The drag handle for videos is located at the top-left corner.
- **Image preview**: Double-click an image to open the full-screen lightbox, supporting mouse-wheel zoom and arrow-key navigation.

---

## Other Common Actions

| Action | Path |
| --- | --- |
| **Create layout** | Select content → right-click "Wrap selection in a layout" (or use hotkey). |
| **Unwrap & restore** | Right-click "Move out of layout", or click "Edit source" to delete comments. |
