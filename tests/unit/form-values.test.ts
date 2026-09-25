import { describe, expect, it } from "vitest";
import {
  EURO_INPUT_PATTERN,
  euroToMinor,
  FAX_INPUT_PATTERN,
  minorToEuroInput,
  normalizeFaxNumber,
} from "../../apps/web/src/api";

describe("preparation form values", () => {
  it("converts a euro budget to integer cents without float drift", () => {
    expect(euroToMinor("5")).toBe(500);
    expect(euroToMinor("5.25")).toBe(525);
    expect(euroToMinor("5,25")).toBe(525);
    expect(euroToMinor("0.29")).toBe(29);
    expect(euroToMinor(" 12.1 ")).toBe(1210);
    expect(euroToMinor("10000")).toBe(1_000_000);
  });
  it("shows stored cents back with the French decimal comma", () => {
    expect(minorToEuroInput(500)).toBe("5");
    expect(minorToEuroInput(2500)).toBe("25");
    expect(minorToEuroInput(235)).toBe("2,35");
    expect(minorToEuroInput(250)).toBe("2,50");
    for (const minor of [1, 29, 235, 250, 10_000, 1_000_000])
      expect(euroToMinor(minorToEuroInput(minor))).toBe(minor);
  });
  it("rejects amounts the API would misread instead of guessing", () => {
    for (const value of ["", "-1", "5.255", "1e3", "10000.01", "abc", "5."])
      expect(euroToMinor(value)).toBeNull();
  });
  it("validates natively the euro format the parser reads", () => {
    // Browsers compile the pattern attribute with the v flag, anchored.
    const field = new RegExp(`^(?:${EURO_INPUT_PATTERN})$`, "v");
    for (const value of ["5", "5,25", "5.25", " 12.1 ", "0,29", "10000"]) {
      expect(field.test(value)).toBe(true);
      expect(euroToMinor(value)).not.toBeNull();
    }
    for (const value of ["", "-1", "5.255", "1e3", "abc", "5.", "1 000"])
      expect(field.test(value)).toBe(false);
  });
  it("removes typed separators from an international fax number", () => {
    expect(normalizeFaxNumber("+352 26 12-34.56")).toBe("+35226123456");
    expect(normalizeFaxNumber("+33100000000")).toBe("+33100000000");
    expect(normalizeFaxNumber(" +49 (0)30 123 4567 ")).toBe("+49301234567");
  });
  it("lets the fax field accept what the server normalizes", () => {
    const field = new RegExp(`^(?:${FAX_INPUT_PATTERN})$`, "v");
    for (const value of [
      "+33 1 00 00 00 00",
      "+352 26 12-34.56",
      "+49 (0)30 1234567",
      "+33 1 23 45 67 89",
      "+33123456789 ",
    ])
      expect(field.test(value)).toBe(true);
    for (const value of ["123", "33123456789", "+0 123 456 789", "+33 abc"])
      expect(field.test(value)).toBe(false);
  });
});
