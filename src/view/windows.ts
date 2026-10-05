import type { Plugin } from "obsidian";

/**
 * Runs `watch` once for the main window's document and once for each pop-out window's: those open
 * when the plugin loads, and those opened later. A listener registered on the main document alone
 * never hears what happens in a pop-out window.
 */
export function onEveryDocument(plugin: Plugin, watch: (doc: Document) => void): void {
  const seen = new WeakSet<Document>();
  const add = (doc: Document): void => {
    if (!seen.has(doc)) {
      seen.add(doc);
      watch(doc);
    }
  };
  add(document);
  plugin.registerEvent(plugin.app.workspace.on("window-open", (win) => add(win.doc)));
  plugin.app.workspace.onLayoutReady(() => {
    plugin.app.workspace.iterateAllLeaves((leaf) => add(leaf.view.containerEl.doc));
  });
}

/**
 * The element an event happened on, in any window. `instanceof Element` compares with the main
 * window's Element only, so it is false for every element of a pop-out window.
 */
export function eventElement(event: UIEvent): Element | null {
  const node = event.targetNode;
  return node?.instanceOf(Element) ? node : null;
}
