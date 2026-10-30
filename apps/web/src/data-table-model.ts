export type TableValue = string | number | boolean | null | undefined;
export type TableSort = { column: string; direction: "asc" | "desc" };

type ExactTableDecimal = {
  sign: -1 | 0 | 1;
  digits: string;
  magnitude: bigint;
};

function exactTableDecimal(value: TableValue): ExactTableDecimal | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value);
  // Original dataset cells are capped at 12,000 characters. Never expand an exponent.
  if (raw.length > 16_384) return null;
  const match =
    /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(
      raw.trim(),
    );
  if (!match) return null;
  const fraction = match[3] ?? match[4] ?? "";
  const digits = ((match[2] ?? "") + fraction).replace(/^0+/, "");
  if (!digits) return { sign: 0, digits: "", magnitude: 0n };
  return {
    sign: match[1] === "-" ? -1 : 1,
    digits: digits.replace(/0+$/, ""),
    magnitude:
      BigInt(match[5] ?? "0") + BigInt(digits.length - fraction.length),
  };
}

function compareExactTableDecimals(
  left: ExactTableDecimal,
  right: ExactTableDecimal,
): number {
  if (left.sign !== right.sign) return left.sign - right.sign;
  if (!left.sign) return 0;
  let result =
    left.magnitude < right.magnitude
      ? -1
      : left.magnitude > right.magnitude
        ? 1
        : 0;
  if (!result) {
    const length = Math.max(left.digits.length, right.digits.length);
    for (let index = 0; index < length; index++) {
      result =
        (left.digits.charCodeAt(index) || 48) -
        (right.digits.charCodeAt(index) || 48);
      if (result) break;
    }
  }
  return left.sign === -1 ? -result : result;
}

export function normalizeTableSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

export function compareTableValues(
  left: TableValue,
  right: TableValue,
  collator: Intl.Collator,
  direction: TableSort["direction"],
  sortType?: "decimal",
): number {
  const missing = (value: TableValue) =>
    value == null ||
    value === "" ||
    (typeof value === "number" && !Number.isFinite(value));
  // Missing values stay last in either direction.
  if (missing(left)) return missing(right) ? 0 : 1;
  if (missing(right)) return -1;
  if (sortType === "decimal") {
    const leftDecimal = exactTableDecimal(left);
    const rightDecimal = exactTableDecimal(right);
    // Invalid source text follows valid numbers in either direction, before missing cells.
    if (leftDecimal && !rightDecimal) return -1;
    if (!leftDecimal && rightDecimal) return 1;
    if (leftDecimal && rightDecimal) {
      const result = compareExactTableDecimals(leftDecimal, rightDecimal);
      return direction === "asc" ? result : -result;
    }
  }
  const result =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : collator.compare(String(left), String(right));
  return direction === "asc" ? result : -result;
}

export function tablePage(
  itemCount: number,
  pageSize: number,
  requestedPage: number,
) {
  const size = Math.max(1, Math.floor(pageSize) || 10);
  const pages = Math.max(1, Math.ceil(itemCount / size));
  const page = Math.min(pages - 1, Math.max(0, requestedPage));
  return {
    page,
    pages,
    size,
    start: page * size,
    end: Math.min(itemCount, (page + 1) * size),
  };
}

/** SQLite timestamps without a zone are UTC, matching the shared date formatter. */
export function tableTimestamp(value?: string): number {
  if (!value) return Number.NaN;
  const zoned = value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value);
  return Date.parse(zoned ? value : `${value.replace(" ", "T")}Z`);
}
