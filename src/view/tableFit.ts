import type { Component } from "obsidian";

/** Scale the complete table and reserve exactly its displayed height, with no scrolling. */
export function fitTable(viewport: HTMLElement, content: HTMLElement, component: Component): void {
  let active = true, scale = 1, height = -1, frame: number | null = null;
  const fit = (): void => {
    if (!active || viewport.clientWidth <= 0 || content.offsetWidth <= 0) return;
    // Leave one CSS pixel for table borders and fractional measurement rounding.
    const next = content.offsetWidth <= viewport.clientWidth ? 1 : (viewport.clientWidth - 1) / content.offsetWidth;
    const nextHeight = parseFloat(viewport.win.getComputedStyle(content).height) * next;
    if (next !== scale) {
      scale = next;
      content.setCssProps({ "--vml-table-scale": String(scale) });
    }
    if (nextHeight !== height) {
      height = nextHeight;
      viewport.setCssProps({ "--vml-table-height": `${height}px` });
    }
  };
  const observer = new (viewport.win as Window & typeof window).ResizeObserver(() => {
    if (!active || frame !== null) return;
    frame = viewport.win.requestAnimationFrame(() => { frame = null; fit(); });
  });
  observer.observe(viewport);
  observer.observe(content);
  component.register(() => {
    active = false;
    observer.disconnect();
    if (frame !== null) viewport.win.cancelAnimationFrame(frame);
  });
  fit();
}
