/** Keep bundled update notes tied to their release, and show each version once. */
export const RELEASE_NOTES_VERSION = "1.1.0";

export function shouldShowReleaseNotes(seen: string, version: string): boolean {
  return version === RELEASE_NOTES_VERSION && seen !== version;
}
