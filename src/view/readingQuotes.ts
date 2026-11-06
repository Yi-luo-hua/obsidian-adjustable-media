/** Use the native quote prefix width and the same tight-list spacing as the source editor. */
export function alignReadingQuote(section: HTMLElement, lines: readonly string[], from: number, to: number, host: HTMLElement): () => void {
  const quote = section.querySelector<HTMLElement>(":scope > blockquote");
  if (!quote) return () => {};
  const font = getComputedStyle(host).font;
  const measure = section.doc.body.createDiv({ cls: "markdown-source-view mod-cm6 is-live-preview cm-s-obsidian mod-ui vml-list-prefix-measure" });
  measure.setCssProps({ "--vml-list-font": font });
  const line = measure.createDiv({ cls: "cm-line" });
  const prefix = line.createSpan({ cls: "cm-formatting cm-formatting-quote cm-quote-1", text: ">\u00a0" });
  const range = section.doc.createRange(); range.selectNodeContents(line);
  const inset = range.getBoundingClientRect().width / parseFloat(getComputedStyle(prefix).fontSize);
  measure.remove();
  quote.setCssProps({ "--vml-quote-prefix": `${inset}em`, "--vml-quote-border": getComputedStyle(quote).borderInlineStartWidth });
  quote.addClass("vml-rv-quote");
  const tight = !lines.slice(from, to + 1).some(line => /^\s*>\s*$/.test(line) || !line.trim());
  quote.toggleClass("vml-rv-quote-tight", tight);
  return () => quote.removeClass("vml-rv-quote", "vml-rv-quote-tight");
}
