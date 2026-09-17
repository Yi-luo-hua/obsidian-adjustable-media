import { finishRenderMath, loadMathJax, renderMath } from "obsidian";

/**
 * Draws TeX into `el` in place of what it holds, once MathJax has loaded. Obsidian loads MathJax only
 * when a note first needs it: drawn before, math would throw, and take the editor drawing it along.
 */
export function drawMath(el: HTMLElement, tex: string, display: boolean): void {
  void loadMathJax().then(() => {
    el.empty();
    el.appendChild(renderMath(tex, display));
    return finishRenderMath();
  });
}
