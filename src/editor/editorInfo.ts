/**
 * MarkdownView.editor is a getter over editMode.editor. During editor construction,
 * editorInfoField can already contain the view before editMode has been assigned.
 * Retry on the next transaction once the host has finished constructing its editor.
 */
export function editorOfInfo<T>(info: { readonly editor?: T } | null | undefined): T | undefined {
  try {
    return info?.editor;
  } catch {
    return undefined;
  }
}
