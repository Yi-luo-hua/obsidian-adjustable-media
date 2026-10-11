/** Match Obsidian's first-frame preview without overriding an explicit media fragment. */
export function videoPreviewUrl(url: string): string {
  return url.includes("#") ? url : `${url}#t=0.001`;
}
