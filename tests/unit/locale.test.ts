import { describe, expect, it } from "vitest";
import {
  defaultLocale,
  isSupportedLocale,
  localeFromAcceptLanguage,
  normalizeLocale,
  resolveLocale,
  supportedLocales,
} from "../../packages/contracts/src/locale";

describe("shared interface language contract", () => {
  it("supports French, English, German and Luxembourgish with French fallback", () => {
    expect(supportedLocales).toEqual(["fr", "en", "de", "lb"]);
    expect(defaultLocale).toBe("fr");
    expect(resolveLocale(["es-ES", "de-CH", "en"])).toBe("de");
    expect(resolveLocale(["es-ES"])).toBe("fr");
    expect(resolveLocale([], "lb")).toBe("lb");
  });
  it.each([
    ["de-LU", "de"],
    ["en_US", "en"],
    ["LB-lu", "lb"],
    [" FR ", "fr"],
    ["es", null],
    ["eng", null],
    ["de?x=en", null],
    ["fr, en", null],
    [null, null],
  ])("normalizes browser/device language %s to %s", (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });
  it("keeps exact persisted values strict while negotiating quality-weighted headers", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("en-US")).toBe(false);
    expect(isSupportedLocale("EN")).toBe(false);
    expect(localeFromAcceptLanguage("fr;q=0.5, de-LU;q=0.9, en;q=0.7")).toBe(
      "de",
    );
    expect(localeFromAcceptLanguage("fr;q=0, lb-LU;q=0.5")).toBe("lb");
    expect(localeFromAcceptLanguage("de;q=invalid, en;q=0.5")).toBe("en");
    expect(localeFromAcceptLanguage("es, *;q=0.1")).toBe("fr");
    expect(localeFromAcceptLanguage(null)).toBe("fr");
  });
});
