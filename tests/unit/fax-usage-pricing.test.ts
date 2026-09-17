import { describe, expect, it } from "vitest";
import {
  faxUsageEstimate,
  makeFaxUsageQuote,
  type ResolvedFaxUsageTariff,
} from "../../packages/domain/src/live-fax-usage";
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

describe("operator-test absolute expiry — runtime guard without SQL", () => {
  const quote = (validFrom: string, expiresAt: string) => {
    const t: ResolvedFaxUsageTariff = {
      ...fixtureTariff(validFrom),
      ...faxUsageEstimate(tariff, 1),
      pricing_version: 3,
      origin_class: "local",
      destination_country_code: "LU",
      destination_prefix: "+3524",
      route_qualification: "operator_test",
      operator_authorization_reference: "ISOLATED OPERATOR TEST",
      operator_test_ceiling_minor: 200,
      expires_at: expiresAt,
    };
    return makeFaxUsageQuote(
      "dispatch_fixture",
      t.organization_id,
      { estimatedMinor: t.customer_minor, ceilingMinor: 200 },
      t,
      validFrom,
    );
  };
  it("accepts authority ending exactly at the pilot deadline", async () => {
    await expect(
      quote("2026-09-23T09:00:00.000Z", "2026-09-24T09:00:01.620Z"),
    ).resolves.toMatchObject({ ceiling_minor: 200 });
  });
  it.each([
    ["2026-09-23T09:00:00.000Z", "2026-09-24T09:00:01.621Z"],
    ["2026-09-30T09:00:00.000Z", "2026-10-01T09:00:00.000Z"],
  ])(
    "rejects short authority after the pilot deadline: %s to %s",
    async (from, to) => {
      await expect(quote(from, to)).rejects.toMatchObject({
        code: "FAX_TEST_CEILING_EXCEEDED",
      });
    },
  );
});
