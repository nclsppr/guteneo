import type { ProfileSheet } from "../contracts/src/datasets";

/** Keep ordinal choices only when their complete source row still matches. */
export function retainUnchangedRowExclusions(input: {
  before: ProfileSheet | undefined;
  after: ProfileSheet | undefined;
  rows: number[];
  structureUnchanged: boolean;
  rowCountUnchanged: boolean;
  previewCellLimit: number;
}): number[] {
  const { before, after } = input;
  if (
    !input.structureUnchanged ||
    !input.rowCountUnchanged ||
    !before ||
    !after
  )
    return [];
  return input.rows.filter((number) => {
    const previous = before.rows.find((row) => row.rowNumber === number);
    const next = after.rows.find((row) => row.rowNumber === number);
    if (!previous || !next) return false;
    if (
      [...previous.cells, ...next.cells].some(
        (cell) =>
          cell.raw !== null && cell.raw.length >= input.previewCellLimit,
      )
    )
      return false;
    return JSON.stringify(previous) === JSON.stringify(next);
  });
}
