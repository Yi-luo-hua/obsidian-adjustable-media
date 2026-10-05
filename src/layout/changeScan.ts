import type { ChangeDesc, Text } from "@codemirror/state";

/**
 * Whether a change may have put something `found` into `doc`, its text after the change, that it did
 * not hold before: only the changed ranges and `reach` characters on each side are read. Something
 * new that was not there before overlaps a changed range, or spans the point where text was deleted,
 * so a `reach` of the longest text `found` looks for is enough. Lets a note without layouts or
 * references skip reading all of its text on every keystroke.
 */
export function changesMayAdd(doc: Text, changes: ChangeDesc, found: (text: string) => boolean, reach: number): boolean {
  let added = false;
  changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    added ||= found(doc.sliceString(Math.max(0, fromB - reach), Math.min(doc.length, toB + reach)));
  });
  return added;
}
