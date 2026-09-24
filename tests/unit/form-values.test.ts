import { describe, expect, it } from "vitest";
import { euroToMinor, normalizeFaxNumber } from "../../apps/web/src/api";

describe("preparation form values", () => {
  it("converts a euro budget to integer cents without float drift", () => {
    expect(euroToMinor("5")).toBe(500);
    expect(euroToMinor("5.25")).toBe(525);
    expect(euroToMinor("5,25")).toBe(525);
    expect(euroToMinor("0.29")).toBe(29);
    expect(euroToMinor(" 12.1 ")).toBe(1210);
    expect(euroToMinor("10000")).toBe(1_000_000);
  });
  it("rejects amounts the API would misread instead of guessing", () => {
    for (const value of ["", "-1", "5.255", "1e3", "10000.01", "abc", "5."])
      expect(euroToMinor(value)).toBeNull();
  });
  it("removes typed separators from an international fax number", () => {
    expect(normalizeFaxNumber("+352 26 12-34.56")).toBe("+35226123456");
    expect(normalizeFaxNumber("+33100000000")).toBe("+33100000000");
  });
});
