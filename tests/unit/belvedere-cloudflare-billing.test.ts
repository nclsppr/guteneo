import { afterEach, describe, expect, it, vi } from "vitest";
import { getBelvedereCloudflareBilling } from "../../apps/api/src/belvedere-cloudflare-billing";
import type { Fetcher } from "../../packages/providers/types";

const now = new Date("2026-10-02T12:00:00Z");
const env = {
  BELVEDERE_CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  BELVEDERE_CLOUDFLARE_BILLING_TOKEN: "fictional-private-billing-read-token",
};
function row(overrides: Record<string, unknown> = {}) {
  return {
    BillingAccountId: env.BELVEDERE_CLOUDFLARE_ACCOUNT_ID,
    BillingAccountName: "Private account name not returned",
    BillingCurrency: "USD",
    BillingPeriodStart: "2026-10-01T00:00:00Z",
    ChargeCategory: "Usage",
    ChargeClass: null,
    ChargePeriodStart: "2026-10-01T00:00:00Z",
    ChargePeriodEnd: "2026-10-02T00:00:00Z",
    ContractedCost: 0.125,
    BilledCost: 0.125,
    CumulatedContractedCost: 10,
    ServiceName: "Workers Standard",
    ConsumedUnit: "requests",
    PricingUnit: "Count",
    SubscriptionId: "private-subscription-not-returned",
    ZoneId: "b".repeat(32),
    ChargeDescription: "private billing description",
    hosted_invoice_url: "https://example.invalid/?token=private",
    ...overrides,
  };
}
function response(rows: unknown[] = [row()]) {
  return { result: rows, success: true, errors: [], messages: [] };
}
function network(body: unknown = response()) {
  return vi.fn<Fetcher>(async () =>
    body instanceof Response ? body : new Response(JSON.stringify(body)),
  );
}
afterEach(() => vi.useRealTimers());

describe("Belvedere Cloudflare reported usage costs", () => {
  it("keeps current-cycle metered cost distinct from invoices and exposes no private billing details", async () => {
    const fetcher = network();
    const result = await getBelvedereCloudflareBilling(env, { now, fetcher });
    expect(result).toMatchObject({
      status: "ok",
      source: "cloudflare_billable_usage_v1",
      period: "current_billing_cycle",
      coverage: "metered_usage_only",
      rounding: "nearest_minor_half_up",
      firstChargeAt: "2026-10-01T00:00:00.000Z",
      lastChargeAt: "2026-10-02T00:00:00.000Z",
      lineCount: 1,
      totals: [
        { currency: "USD", amountMinor: 13, reportedAmountDecimal: "0.125" },
      ],
      services: [
        {
          service: "Workers Standard",
          currency: "USD",
          amountMinor: 13,
          reportedAmountDecimal: "0.125",
          chargePeriods: 1,
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${env.BELVEDERE_CLOUDFLARE_ACCOUNT_ID}/billable-usage`,
    );
    expect(options).toMatchObject({
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${env.BELVEDERE_CLOUDFLARE_BILLING_TOKEN}`,
      },
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("Private");
    expect(JSON.stringify(result)).not.toContain("invoice");
    expect(JSON.stringify(result)).not.toContain(
      env.BELVEDERE_CLOUDFLARE_ACCOUNT_ID,
    );
  });

  it("sums fractional cents exactly before rounding, never cumulative costs or currencies", async () => {
    const result = await getBelvedereCloudflareBilling(env, {
      now,
      fetcher: network(
        response([
          row({ ContractedCost: 0.004, ServiceName: "R2 Class A" }),
          row({ ContractedCost: 0.004, ServiceName: "R2 Class B" }),
          row({ ContractedCost: 0.004, ServiceName: "D1 reads" }),
          row({ ContractedCost: 10.25, BillingCurrency: "EUR" }),
        ]),
      ),
    });
    expect(result.status).toBe("ok");
    expect(result.totals).toEqual([
      { currency: "EUR", amountMinor: 1025, reportedAmountDecimal: "10.25" },
      { currency: "USD", amountMinor: 1, reportedAmountDecimal: "0.012" },
    ]);
    expect(
      result.services
        .filter((service) => service.currency === "USD")
        .map((service) => service.amountMinor),
    ).toEqual([0, 0, 0]);
  });

  it("preserves provider number tokens beyond binary floating-point precision", async () => {
    const raw = JSON.stringify(response()).replace(
      '"ContractedCost":0.125',
      '"ContractedCost":0.124999999999999999',
    );
    const result = await getBelvedereCloudflareBilling(env, {
      now,
      fetcher: network(new Response(raw)),
    });
    expect(result.totals).toEqual([
      {
        currency: "USD",
        amountMinor: 12,
        reportedAmountDecimal: "0.124999999999999999",
      },
    ]);
  });

  it("accepts small costs in scientific notation without binary multiplication", async () => {
    const raw = JSON.stringify(response()).replace(
      '"ContractedCost":0.125',
      '"ContractedCost":5e-3',
    );
    const result = await getBelvedereCloudflareBilling(env, {
      now,
      fetcher: network(new Response(raw)),
    });
    expect(result.totals).toEqual([
      { currency: "USD", amountMinor: 1, reportedAmountDecimal: "0.005" },
    ]);
  });

  it("does not rewrite a decimal-looking string inside private metadata", async () => {
    const result = await getBelvedereCloudflareBilling(env, {
      now,
      fetcher: network(
        response([
          row({ ChargeDescription: 'example "ContractedCost": 9999' }),
        ]),
      ),
    });
    expect(result.totals[0]!.amountMinor).toBe(13);
  });

  it.each([
    {},
    { ...env, BELVEDERE_CLOUDFLARE_ACCOUNT_ID: "../other" },
    { ...env, BELVEDERE_CLOUDFLARE_BILLING_TOKEN: "invalid\nsecret" },
  ])(
    "does not call the provider without dedicated valid configuration",
    async (config) => {
      const fetcher = network();
      const result = await getBelvedereCloudflareBilling(config, {
        now,
        fetcher,
      });
      expect(result.status).toBe("not_configured");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    { BillingAccountId: "b".repeat(32) },
    { BillingCurrency: "JPY" },
    { ChargeCategory: "Tax" },
    { ChargeClass: "Correction" },
    { ContractedCost: null },
    { ContractedCost: -1 },
    { ContractedCost: 1e20 },
    { ContractedCost: 1e-19 },
    { ContractedCost: "garbage" },
    { ServiceName: "<script>private</script>" },
    { BillingPeriodStart: "2025-10-01T00:00:00Z" },
    { ChargePeriodStart: "2026-09-30T00:00:00Z" },
    { ChargePeriodStart: "2026-10-03T00:00:00Z" },
    { ChargePeriodEnd: "2026-10-01T00:00:00Z" },
    { ChargePeriodEnd: "2027-10-01T00:00:00Z" },
  ])(
    "does not turn unsupported or invalid cost evidence into totals: %o",
    async (overrides) => {
      const result = await getBelvedereCloudflareBilling(env, {
        now,
        fetcher: network(response([row(overrides)])),
      });
      expect(result.status).toBe("unavailable");
      expect(result.totals).toEqual([]);
      expect(result.services).toEqual([]);
    },
  );

  it("rejects ambiguous duplicated charge periods", async () => {
    const result = await getBelvedereCloudflareBilling(env, {
      now,
      fetcher: network(response([row(), row()])),
    });
    expect(result.status).toBe("unavailable");
    expect(result.totals).toEqual([]);
  });

  it("returns no subtotal if exact aggregation overflows safe minor units", async () => {
    const result = await getBelvedereCloudflareBilling(env, {
      now,
      fetcher: network(
        response([
          row({ ContractedCost: 1, BillingCurrency: "EUR" }),
          row({ ContractedCost: 80000000000000 }),
          row({ ContractedCost: 80000000000000, ServiceName: "R2 storage" }),
        ]),
      ),
    });
    expect(result.status).toBe("unavailable");
    expect(result.totals).toEqual([]);
    expect(result.services).toEqual([]);
  });

  it("distinguishes absent data from a validated zero-cost usage period", async () => {
    expect(
      (
        await getBelvedereCloudflareBilling(env, {
          now,
          fetcher: network(response([])),
        })
      ).status,
    ).toBe("no_data");
    const zero = await getBelvedereCloudflareBilling(env, {
      now,
      fetcher: network(response([row({ ContractedCost: 0 })])),
    });
    expect(zero.status).toBe("ok");
    expect(zero.totals[0]!.amountMinor).toBe(0);
  });

  it.each([401, 403, 429, 500, 302])(
    "handles HTTP %s without retries or provider error leakage",
    async (status) => {
      const fetcher = network(new Response("private failure", { status }));
      const result = await getBelvedereCloudflareBilling(env, { now, fetcher });
      expect(result.status).toBe(
        status === 401 || status === 403 ? "forbidden" : "unavailable",
      );
      expect(JSON.stringify(result)).not.toContain("private");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects HTTP-200 provider errors even with partial costs", async () => {
    const result = await getBelvedereCloudflareBilling(env, {
      now,
      fetcher: network({
        ...response(),
        errors: [{ message: "private", code: 1234 }],
      }),
    });
    expect(result.status).toBe("unavailable");
    expect(result.totals).toEqual([]);
  });

  it("rejects oversized responses and too many rows", async () => {
    for (const fixture of [
      new Response("private".repeat(90_000)),
      response(Array.from({ length: 2001 }, () => row())),
    ]) {
      const result = await getBelvedereCloudflareBilling(env, {
        now,
        fetcher: network(fixture),
      });
      expect(result.status).toBe("unavailable");
    }
  });

  it("bounds a hanging provider at eight seconds", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<Fetcher>(() => new Promise(() => undefined));
    const pending = getBelvedereCloudflareBilling(env, { now, fetcher });
    await vi.advanceTimersByTimeAsync(8000);
    expect((await pending).status).toBe("unavailable");
    expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
});
