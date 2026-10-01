/** The pane's own document includes a pop-out window. Height alone is not an environment change. */
export function watchEnvironment(el: HTMLElement, changed: (signature: string) => void,
  mediaChanged: (media: HTMLImageElement | HTMLVideoElement) => void = () => {}): () => void {
  const win = el.win as Window & typeof window;
  const doc = el.doc;
  let signature = "";
  let frame = 0;
  let fontsRevision = 0;
  let stopped = false;
  const seen = new WeakMap<HTMLImageElement | HTMLVideoElement, string>();
  const read = (): void => {
    frame = 0;
    if (stopped || !el.isConnected) return;
    const style = win.getComputedStyle(el);
    const next = JSON.stringify([el.clientWidth, style.fontFamily, style.fontSize, style.lineHeight,
      style.fontWeight, style.letterSpacing, style.direction, win.devicePixelRatio,
      doc.body.className, doc.documentElement.className, fontsRevision]);
    if (signature !== next) { signature = next; changed(next); }
  };
  const schedule = (): void => { if (!stopped && !frame) frame = win.requestAnimationFrame(read); };
  const resource = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof win.HTMLImageElement) && !(target instanceof win.HTMLVideoElement)) return;
    const dimensions = target instanceof win.HTMLImageElement ? `${target.naturalWidth}:${target.naturalHeight}`
      : `${target.videoWidth}:${target.videoHeight}`;
    const key = `${target.currentSrc || target.src}:${dimensions}`;
    if (seen.get(target) !== key) { seen.set(target, key); mediaChanged(target); }
  };
  const fonts = (): void => { fontsRevision++; schedule(); };
  const resize = new win.ResizeObserver(schedule);
  resize.observe(el);
  const theme = new win.MutationObserver(schedule);
  for (const root of [doc.body, doc.documentElement]) theme.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
  for (const name of ["load", "error", "loadedmetadata"]) el.addEventListener(name, resource, true);
  doc.fonts.addEventListener("loadingdone", fonts);
  doc.fonts.addEventListener("loadingerror", fonts);
  win.addEventListener("resize", schedule);
  schedule();
  return () => {
    stopped = true;
    win.cancelAnimationFrame(frame);
    resize.disconnect(); theme.disconnect();
    for (const name of ["load", "error", "loadedmetadata"]) el.removeEventListener(name, resource, true);
    doc.fonts.removeEventListener("loadingdone", fonts);
    doc.fonts.removeEventListener("loadingerror", fonts);
    win.removeEventListener("resize", schedule);
  };
}
