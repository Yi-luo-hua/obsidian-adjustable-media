import type { Component } from "obsidian";

const fits = new WeakMap<HTMLElement, () => void>();

export function refreshTableFit(viewport: HTMLElement): void { fits.get(viewport)?.(); }

/** Scale the complete table and reserve exactly its displayed height, with no scrolling. */
export function fitTable(viewport: HTMLElement, content: HTMLElement, component: Component): void {
  let active = true, scale = 1, height = -1, width = -1, frame: number | null = null;
  const fit = (): void => {
    if (!active || viewport.clientWidth <= 0 || content.offsetWidth <= 0) return;
    // Leave one CSS pixel for table borders and fractional measurement rounding.
    const requested = Number(viewport.style.getPropertyValue("--vml-table-request-scale")) || 1;
    const available = parseFloat(viewport.win.getComputedStyle(viewport).width);
    const natural = viewport.win.getComputedStyle(content);
    const naturalWidth = parseFloat(natural.width);
    const next = requested * naturalWidth <= available ? requested : (available - 1) / naturalWidth;
    const nextHeight = parseFloat(natural.height) * next;
    const nextWidth = naturalWidth * next;
    if (next !== scale) {
      scale = next;
      content.setCssProps({ "--vml-table-scale": String(scale) });
    }
    if (nextHeight !== height) {
      height = nextHeight;
      viewport.setCssProps({ "--vml-table-height": `${height}px` });
    }
    if (nextWidth !== width) {
      width = nextWidth;
      viewport.parentElement?.setCssProps({ "--vml-table-drawn-width": `${width}px` });
    }
  };
  const observer = new (viewport.win as Window & typeof window).ResizeObserver(() => {
    if (!active || frame !== null) return;
    frame = viewport.win.requestAnimationFrame(() => { frame = null; fit(); });
  });
  observer.observe(viewport);
  observer.observe(content);
  fits.set(viewport, fit);
  component.register(() => {
    active = false;
    observer.disconnect();
    fits.delete(viewport);
    if (frame !== null) viewport.win.cancelAnimationFrame(frame);
  });
  fit();
}
