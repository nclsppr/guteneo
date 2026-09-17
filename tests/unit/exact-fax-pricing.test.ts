import { describe, expect, it } from "vitest";
import { exactFaxPrice } from "../../packages/domain/src/live-fax-quotes";

const cost = {
  supplier_base_numerator: 10,
  supplier_per_page_numerator: 20,
  supplier_denominator: 1,
};
describe("exact supplier fax pricing, no currency conversion or rounding", () => {
  it("doubles the total supplier price exactly, independently of the reservation ceiling", () => {
    expect(exactFaxPrice(cost, 2)).toEqual({
      supplier_minor: 50,
      customer_minor: 100,
    });
    expect(
      exactFaxPrice(
        {
          ...cost,
          supplier_base_numerator: 0,
          supplier_per_page_numerator: 1,
          supplier_denominator: 2,
        },
        2,
      ),
    ).toEqual({ supplier_minor: 1, customer_minor: 2 });
  });
  it("refuses fractional supplier cents even when doubling would give a whole customer cent", () => {
    expect(() =>
      exactFaxPrice(
        {
          ...cost,
          supplier_base_numerator: 1,
          supplier_per_page_numerator: 0,
          supplier_denominator: 2,
        },
        1,
      ),
    ).toThrow(
      expect.objectContaining({ code: "FRACTIONAL_PRICING_UNSUPPORTED" }),
    );
  });
  it("does not round the SES-like fractional-cent scale into an invented per-message price", () => {
    expect(() =>
      exactFaxPrice(
        {
          ...cost,
          supplier_base_numerator: 16,
          supplier_per_page_numerator: 0,
          supplier_denominator: 1000,
        },
        1,
      ),
    ).toThrow(
      expect.objectContaining({ code: "FRACTIONAL_PRICING_UNSUPPORTED" }),
    );
  });
  it("bounds integer inputs and the doubled amount before returning JavaScript numbers", () => {
    for (const patch of [
      { supplier_base_numerator: -1 },
      { supplier_base_numerator: 0.1 },
      { supplier_base_numerator: Number.MAX_SAFE_INTEGER + 1 },
      { supplier_denominator: 0 },
      { supplier_denominator: 1.5 },
      { supplier_denominator: 1_000_001 },
      { supplier_per_page_numerator: 1_000_000_001 },
      { supplier_base_numerator: 500001, supplier_per_page_numerator: 0 },
    ])
      expect(() => exactFaxPrice({ ...cost, ...patch }, 1)).toThrow(
        expect.objectContaining({ code: "LIVE_PRICING_REQUIRED" }),
      );
    expect(
      exactFaxPrice(
        {
          ...cost,
          supplier_base_numerator: 500000,
          supplier_per_page_numerator: 0,
        },
        1,
      ),
    ).toEqual({ supplier_minor: 500000, customer_minor: 1000000 });
  });
});
