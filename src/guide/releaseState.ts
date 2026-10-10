/** Keep bundled update notes tied to their release, and show each version once. */
export const RELEASE_NOTES_VERSION = "0.7.3";

export function shouldShowReleaseNotes(seen: string, version: string): boolean {
  return version === RELEASE_NOTES_VERSION && seen !== version;
}
