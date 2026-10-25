import { describe, expect, it, vi } from "vitest";
import { deliveryExpiryDate } from "../../packages/contracts/src/delivery-messages";

describe("localized protected-email expiry", () => {
  it.each([
    ["fr", "1 novembre 2026"],
    ["en", "November 1, 2026"],
    ["de", "1. November 2026"],
    ["lb", "1. November 2026"],
  ] as const)("formats the complete date in %s", (locale, expected) => {
    expect(deliveryExpiryDate("2026-11-01T22:12:46.000Z", locale)).toBe(
      expected,
    );
  });

  it.each([
    ["01", "1. Januar 2026"],
    ["02", "1. Februar 2026"],
    ["03", "1. Mäerz 2026"],
    ["04", "1. Abrëll 2026"],
    ["05", "1. Mee 2026"],
    ["06", "1. Juni 2026"],
    ["07", "1. Juli 2026"],
    ["08", "1. August 2026"],
    ["09", "1. September 2026"],
    ["10", "1. Oktober 2026"],
    ["11", "1. November 2026"],
    ["12", "1. Dezember 2026"],
  ])(
    "renders Luxembourgish month %s without relying on runtime Intl support",
    (month, expected) => {
      const intl = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
        throw new Error("Runtime locale data unavailable");
      });
      try {
        expect(deliveryExpiryDate(`2026-${month}-01T00:00:00.000Z`, "lb")).toBe(
          expected,
        );
        expect(intl).not.toHaveBeenCalled();
      } finally {
        intl.mockRestore();
      }
    },
  );

  it.each([
    ["fr", "1 avril 2026"],
    ["en", "April 1, 2026"],
    ["de", "1. April 2026"],
    ["lb", "1. Abrëll 2026"],
  ] as const)(
    "keeps the hosting expiry calendar date in UTC for %s",
    (locale, expected) => {
      expect(deliveryExpiryDate("2026-03-31T23:30:00.000-02:00", locale)).toBe(
        expected,
      );
    },
  );
});
