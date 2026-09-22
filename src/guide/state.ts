/** Increase only when users need to see a substantially revised guide, not for every release. */
export const GUIDE_REVISION = 1;

export function readGuideRevision(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function shouldShowGuide(seen: number): boolean {
  return seen < GUIDE_REVISION;
}
