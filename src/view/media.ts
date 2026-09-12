import { TFile, normalizePath, type App } from "obsidian";

import { isRemoteTarget, type V2Embed } from "../format/v2.ts";

export interface ResolvedMedia {
  url: string;
  /** The vault file, or null for a remote URL. */
  file: TFile | null;
}

/**
 * Finds the file an embed points to (F2). Link targets are already decoded by the parser; vault
 * links resolve the way Obsidian resolves them from the note, plus "./" and "../" paths, which
 * Markdown links written with relative paths use.
 */
export function resolveMedia(app: App, embed: V2Embed, sourcePath: string): ResolvedMedia | null {
  if (isRemoteTarget(embed.target)) {
    return { url: embed.target, file: null };
  }

  const linked = app.metadataCache.getFirstLinkpathDest(embed.target, sourcePath);
  const relativePath = resolveRelativePath(sourcePath, embed.target);
  const file = linked ?? (relativePath === null ? null : app.vault.getAbstractFileByPath(relativePath));
  return file instanceof TFile ? { url: app.vault.getResourcePath(file), file } : null;
}

function resolveRelativePath(sourcePath: string, target: string): string | null {
  if (!target.startsWith("./") && !target.startsWith("../")) {
    return null;
  }

  const segments = sourcePath.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "." || part === "") {
      continue;
    }
    if (part === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return normalizePath(segments.join("/"));
}
