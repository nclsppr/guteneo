import { describe, expect, it } from "vitest";
import { retainUnchangedRowExclusions } from "../../packages/data/replacement";
import type { ProfileSheet } from "../../packages/contracts/src/datasets";

const sheet = (names: string[]): ProfileSheet => ({
  name: "Data",
  hidden: false,
  headerCandidates: [1],
  merges: [],
  rows: names.map((raw, index) => ({
    rowNumber: index + 1,
    hidden: false,
    cells: [{ column: 1, address: `A${index + 1}`, raw, kind: "text" }],
  })),
});
const before = sheet(["name", "Camille", "Alex", "Morgan"]);
const retain = (after: ProfileSheet, patch = {}) =>
  retainUnchangedRowExclusions({
    before,
    after,
    rows: [2, 4],
    structureUnchanged: true,
    rowCountUnchanged: true,
    previewCellLimit: 256,
    ...patch,
  });

describe("Data replacement row choices", () => {
  it("keeps an unchanged excluded row while an included row is corrected", () => {
    expect(
      retain(sheet(["name", "Camille", "Alex corrected", "Morgan"])),
    ).toEqual([2, 4]);
  });
  it("drops a moved person's old ordinal without transferring that exclusion", () => {
    expect(retain(sheet(["name", "Alex", "Camille", "Morgan"]))).toEqual([4]);
  });
  it("requires review when structure or row count changes", () => {
    expect(retain(before, { structureUnchanged: false })).toEqual([]);
    expect(retain(before, { rowCountUnchanged: false })).toEqual([]);
  });
  it("never treats missing or truncated preview rows as identical", () => {
    expect(retain(before, { rows: [200] })).toEqual([]);
    const long = sheet(["name", "A".repeat(256)]);
    expect(retain(long, { before: long, rows: [2] })).toEqual([]);
  });
});
