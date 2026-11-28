import { describe, expect, it } from "vitest";
import { quotedMoney } from "../../apps/web/src/api";

describe("customer quote precision", () => {
  const quote = (nano: number | null) =>
    quotedMoney({
      quote_customer_nanoeur: nano,
      estimated_minor: 1,
      currency: "EUR",
    });
  it("preserves sub-cent amounts down to a nanoEUR", () => {
    expect(quote(200_000)).toBe("0,0002\u00a0€");
    expect(quote(1)).toBe("0,000000001\u00a0€");
    expect(quote(10_000_001)).toBe("0,010000001\u00a0€");
    expect(quote(1_200_000_000)).toBe("1,20\u00a0€");
  });
  it("includes the signed secure document service fee alongside fractional email transport", () => {
    expect(
      quotedMoney({
        quote_customer_nanoeur: 1_560_000,
        estimated_minor: 50,
        currency: "EUR",
        options_json: JSON.stringify({
          secureDistribution: { serviceFeeMinor: 49 },
        }),
      }),
    ).toBe("0,49156\u00a0€");
  });
  it("does not claim a free or precise quote when it is absent or invalid", () => {
    expect(quote(null)).toBe("0,01\u00a0€");
    expect(quote(-1)).toBe("0,01\u00a0€");
    expect(quote(0.5)).toBe("0,01\u00a0€");
    expect(quote(0)).toBe("0,00\u00a0€");
  });
});
