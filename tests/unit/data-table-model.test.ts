import { describe, expect, it } from "vitest";
import {
  compareTableValues,
  normalizeTableSearch,
  tablePage,
  tableTimestamp,
  type TableValue,
} from "../../apps/web/src/data-table-model";

describe("operational table search and ordering", () => {
  const collator = new Intl.Collator("fr-FR", {
    numeric: true,
    sensitivity: "base",
  });

  it("finds accented labels with an unaccented, case-insensitive query", () => {
    expect(normalizeTableSearch("Échéance · Créé à Lëtzebuerg")).toContain(
      normalizeTableSearch("ECHEANCE"),
    );
    expect(normalizeTableSearch("Échéance · Créé à Lëtzebuerg")).toContain(
      normalizeTableSearch("letzebuerg"),
    );
    expect(normalizeTableSearch("É")).toBe(normalizeTableSearch("E\u0301"));
  });

  it("sorts raw amounts numerically and numbered names naturally", () => {
    expect(
      [1000, 20, 3].sort((a, b) => compareTableValues(a, b, collator, "asc")),
    ).toEqual([3, 20, 1000]);
    expect(
      ["Document 10", "Document 2", "Document 1"].sort((a, b) =>
        compareTableValues(a, b, collator, "asc"),
      ),
    ).toEqual(["Document 1", "Document 2", "Document 10"]);
  });

  it.each(["asc", "desc"] as const)(
    "keeps unavailable amounts and dates after valid values in %s order",
    (direction) => {
      const rows = [
        { id: "missing", value: null },
        { id: "invalid", value: Number.NaN },
        { id: "empty", value: "" },
        { id: "valid", value: 0 },
      ];
      expect(
        rows
          .sort((a, b) =>
            compareTableValues(a.value, b.value, collator, direction),
          )
          .map((row) => row.id),
      ).toEqual(["valid", "missing", "invalid", "empty"]);
    },
  );

  it("does not reorder equal labels arbitrarily", () => {
    const rows = [
      { id: 1, name: "école" },
      { id: 2, name: "Ecole" },
    ];
    expect(
      rows
        .sort((a, b) => compareTableValues(a.name, b.name, collator, "asc"))
        .map((row) => row.id),
    ).toEqual([1, 2]);
  });
});

describe("exact decimal table ordering", () => {
  const collator = new Intl.Collator("en-US", {
    numeric: true,
    sensitivity: "base",
  });
  const order = (values: TableValue[], direction: "asc" | "desc" = "asc") =>
    values
      .map((value) => ({ value }))
      .sort((a, b) =>
        compareTableValues(a.value, b.value, collator, direction, "decimal"),
      )
      .map((item) => item.value);

  it.each(["asc", "desc"] as const)(
    "orders decimal fractions and negatives numerically in %s order",
    (direction) => {
      const expected = ["-2.5", "-2.12", "0.10", "0.9", "2.12", "2.5"];
      expect(
        order(["2.5", "0.9", "-2.12", "0.10", "-2.5", "2.12"], direction),
      ).toEqual(direction === "asc" ? expected : [...expected].reverse());
    },
  );

  it("retains distinctions beyond floating-point precision", () => {
    const values = [
      "9007199254740993.0000000000000002",
      "9007199254740993.0000000000000001",
      "9007199254740992.9999999999999999",
    ];
    expect(order(values)).toEqual([...values].reverse());
    expect(order(values.map((value) => "-" + value))).toEqual(
      values.map((value) => "-" + value),
    );
  });

  it("orders values across decimal magnitudes and recognizes scientific equality", () => {
    expect(order(["1e2", "100"])).toEqual(["1e2", "100"]);
    const expected = ["0.0001", "1e-3", "99.99", "1e2", "100.01"];
    expect(order([...expected].reverse())).toEqual(expected);
  });

  it("compares scientific notation without expanding huge or tiny exponents", () => {
    const expected = [
      "9e-9007199254740994",
      "1e-9007199254740993",
      "1.234567890123456788e-300",
      "1.234567890123456789e-300",
      "9e9007199254740992",
      "1e9007199254740993",
    ];
    expect(order([...expected].reverse())).toEqual(expected);
    expect(order(expected, "desc")).toEqual([...expected].reverse());
  });

  it("preserves stable order for equivalent decimals, scientific forms and signed zero", () => {
    expect(order(["1.20", "12e-1", "+001.2000", "0.0012e3"])).toEqual([
      "1.20",
      "12e-1",
      "+001.2000",
      "0.0012e3",
    ]);
    expect(order(["-0", "+0.000", "0e9007199254740993", ".0"])).toEqual([
      "-0",
      "+0.000",
      "0e9007199254740993",
      ".0",
    ]);
    expect(order([".25", "1.", "0.025e+1", "-0.25"])).toEqual([
      "-0.25",
      ".25",
      "0.025e+1",
      "1.",
    ]);
  });

  it.each(["asc", "desc"] as const)(
    "keeps invalid source text after valid decimals and missing cells last in %s order",
    (direction) => {
      const missing = [
        null,
        undefined,
        "",
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ];
      const values = [
        null,
        "Label 10",
        "0.9",
        undefined,
        "0.10",
        "Label 2",
        "",
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ];
      expect(order(values, direction)).toEqual([
        ...(direction === "asc"
          ? ["0.10", "0.9", "Label 2", "Label 10"]
          : ["0.9", "0.10", "Label 10", "Label 2"]),
        ...missing,
      ]);
    },
  );

  it("rejects malformed and oversized numeric strings without coercing source text", () => {
    const invalid = [
      "0x10",
      "1,2",
      "1e",
      "--2",
      ".",
      "Infinity",
      "1".repeat(16_385),
    ];
    for (const text of invalid) {
      expect(
        compareTableValues(text, "2", collator, "asc", "decimal"),
      ).toBeGreaterThan(0);
      expect(
        compareTableValues(text, "2", collator, "desc", "decimal"),
      ).toBeGreaterThan(0);
    }
    expect(order([" 0.9 ", 0.1, "1e-1"])).toEqual([0.1, "1e-1", " 0.9 "]);
  });

  it("leaves natural text ordering unchanged unless the column opts in", () => {
    expect(
      ["0.9", "0.10"].sort((a, b) => compareTableValues(a, b, collator, "asc")),
    ).toEqual(["0.9", "0.10"]);
  });
});

describe("table pagination after filtering or refresh", () => {
  it("keeps the final partial page and clamps after a result set shrinks", () => {
    expect(tablePage(31, 10, 3)).toEqual({
      page: 3,
      pages: 4,
      size: 10,
      start: 30,
      end: 31,
    });
    expect(tablePage(2, 10, 3)).toEqual({
      page: 0,
      pages: 1,
      size: 10,
      start: 0,
      end: 2,
    });
  });

  it("provides a single empty page without negative ranges", () => {
    expect(tablePage(0, 10, 5)).toEqual({
      page: 0,
      pages: 1,
      size: 10,
      start: 0,
      end: 0,
    });
    expect(tablePage(31, 25, -1)).toEqual({
      page: 0,
      pages: 2,
      size: 25,
      start: 0,
      end: 25,
    });
  });
});

describe("table timestamps", () => {
  it("compares SQL UTC and explicit-zone timestamps on the same timeline", () => {
    expect(tableTimestamp("2026-10-30 15:14:00")).toBe(
      Date.UTC(2026, 9, 30, 15, 14),
    );
    expect(tableTimestamp("2026-10-30T15:14:00")).toBe(
      tableTimestamp("2026-10-30T15:14:00Z"),
    );
    expect(tableTimestamp("2026-10-25T02:30:00+02:00")).toBe(
      tableTimestamp("2026-10-25 00:30:00"),
    );
    expect(Number.isNaN(tableTimestamp(undefined))).toBe(true);
    expect(Number.isNaN(tableTimestamp("invalid"))).toBe(true);
  });
});
