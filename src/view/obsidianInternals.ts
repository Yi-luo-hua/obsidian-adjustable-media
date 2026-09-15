import { MarkdownView, type App, type Hotkey } from "obsidian";

/**
 * What the plugin reads of Obsidian through interfaces its API does not document, each with a
 * fallback for when they are missing: the settings of Obsidian's editor and the hotkeys of its
 * commands, which a text column's editor follows (docs/DESIGN.md, section 4.2), and the sections of
 * a note's reading view with the heights it has measured for them (section 4.1). These interfaces
 * never write notes or settings; remeasurement only invalidates the renderer's cached heights.
 */

interface VaultConfig {
  getConfig?(key: string): unknown;
}

interface HotkeyManager {
  getHotkeys?(id: string): Hotkey[] | null | undefined;
  getDefaultHotkeys?(id: string): Hotkey[] | null | undefined;
}

/** One of Obsidian's settings, such as autoPairBrackets; `fallback` when it cannot be read. */
export function obsidianSetting<T extends boolean | number | string>(app: App, key: string, fallback: T): T {
  try {
    const value = (app.vault as unknown as VaultConfig).getConfig?.(key);
    return typeof value === typeof fallback ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The hotkeys of Obsidian's command `id`: the user's own when they have set any (even none), otherwise
 * Obsidian's defaults, otherwise `fallback`.
 */
export function commandHotkeys(app: App, id: string, fallback: readonly Hotkey[]): readonly Hotkey[] {
  try {
    const manager = (app as unknown as { hotkeyManager?: HotkeyManager }).hotkeyManager;
    return manager?.getHotkeys?.(id) ?? manager?.getDefaultHotkeys?.(id) ?? fallback;
  } catch {
    return fallback;
  }
}

/** A section of a note's reading view, as Obsidian's renderer keeps it. */
export interface ReadingSection {
  el: HTMLElement;
  /** From its top to the next section's top, as last measured; only when `computed`. */
  height: number;
  computed: boolean;
  /** Whether its content is drawn. */
  rendered: boolean;
  /** False for the sections under a folded heading. */
  shown?: boolean;
}

/** The sections of a note's reading view, and the element that holds those in the page. */
export interface ReadingSections {
  sections: readonly ReadingSection[];
  sizer: HTMLElement;
}

interface Renderer {
  sections?: unknown;
  sizerEl?: unknown;
  queueRender?: unknown;
}

/**
 * The sections of the reading view that has `el` among its sections, with what Obsidian's renderer
 * knows of them: which are drawn, and how high it measured them. Null when no reading view has it,
 * or when the renderer is not what this plugin knows (it may change with Obsidian).
 */
export function readingSections(app: App, el: HTMLElement): ReadingSections | null {
  try {
    const found = rendererOf(app, el);
    if (!found) {
      return null;
    }
    const { sections } = found;
    const sizer = found.renderer.sizerEl;
    return isElement(sizer) && sections.every(isSection) ? { sections, sizer } : null;
  } catch {
    return null;
  }
}

/**
 * Has Obsidian measure the sections from `from` to `to` of the reading view that has `el` among its
 * sections again, as it does with all of them when the page changes width. False when its renderer
 * is not what this plugin knows.
 */
export function remeasureSections(app: App, el: HTMLElement, from: number, to: number): boolean {
  try {
    const found = rendererOf(app, el);
    if (!found || typeof found.renderer.queueRender !== "function") {
      return false;
    }
    for (const section of found.sections.slice(from, to + 1)) {
      const item = section as { resetCompute?: unknown } | null;
      if (item && typeof item.resetCompute === "function") {
        (item as { resetCompute: () => void }).resetCompute();
      }
    }
    (found.renderer as { queueRender: () => void }).queueRender();
    return true;
  } catch {
    return false;
  }
}

/** The renderer of the reading view that has `el` among its sections. */
function rendererOf(app: App, el: HTMLElement): { renderer: Renderer; sections: unknown[] } | null {
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) {
      continue;
    }
    const renderer = (view.previewMode as unknown as { renderer?: Renderer }).renderer;
    const sections = renderer?.sections;
    if (renderer && Array.isArray(sections) && sections.some((section) => isSection(section) && section.el === el)) {
      return { renderer, sections };
    }
  }
  return null;
}

function isElement(value: unknown): value is HTMLElement {
  return typeof value === "object" && value !== null && "instanceOf" in value && (value as Node).instanceOf(HTMLElement);
}

function isSection(value: unknown): value is ReadingSection {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const section = value as Partial<Record<keyof ReadingSection, unknown>>;
  return isElement(section.el) && typeof section.height === "number" && typeof section.computed === "boolean" && typeof section.rendered === "boolean";
}
