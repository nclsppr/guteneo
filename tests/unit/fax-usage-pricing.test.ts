import { describe, expect, it } from "vitest";
import { faxUsageEstimate } from "../../packages/domain/src/live-fax-usage";
import { fixtureTariff } from "../helpers/fax-usage-fixture";

const tariff = fixtureTariff("2026-09-17T00:00:00.000Z");
describe("fax usage estimate — integer arithmetic, synthetic rates", () => {
  it("combines pages and 60/60 duration before exact FX conversion", () => {
    expect(faxUsageEstimate(tariff, 2)).toEqual({
      estimated_low_nanoeur: 35_280_000,
      estimated_high_nanoeur: 55_440_000,
      customer_minor: 6,
    });
  });
  it.each([
    [1, 1],
    [60, 1],
    [61, 2],
  ])("bills %i estimated seconds in %i intervals", (seconds, minutes) => {
    const t = {
      ...tariff,
      page_nano_usd: 0,
      minute_nano_usd: 1_000_000,
      duration_low_per_page_seconds: seconds,
      duration_high_per_page_seconds: seconds,
      fx_numerator: 1,
      fx_denominator: 1,
    };
    expect(faxUsageEstimate(t, 1).estimated_high_nanoeur).toBe(
      minutes * 2_000_000,
    );
  });
  it("preserves fractions of a cent, rounding only the final FX fraction to nano-EUR", () => {
    const t = {
      ...tariff,
      page_nano_usd: 1,
      minute_nano_usd: 1,
      call_nano_usd: 1,
      fx_numerator: 1,
      fx_denominator: 7,
    };
    expect(faxUsageEstimate(t, 1)).toEqual({
      estimated_low_nanoeur: 2,
      estimated_high_nanoeur: 2,
      customer_minor: 1,
    });
  });
  it.each([
    { page_nano_usd: 0.5 },
    { minute_nano_usd: -1 },
    { initial_seconds: 1 },
    { fx_denominator: 0 },
    { duration_low_per_page_seconds: 100, duration_high_per_page_seconds: 90 },
    {
      page_nano_usd: 1_000_000_000,
      fx_numerator: 1_000_000,
      fx_denominator: 1,
    },
  ])("rejects unsupported/unsafe coefficients %j", (patch) => {
    expect(() => faxUsageEstimate({ ...tariff, ...patch }, 2)).toThrow();
  });
  it("keeps the first pilot at ten pages maximum", () => {
    expect(() => faxUsageEstimate(tariff, 11)).toThrow();
  });
});
