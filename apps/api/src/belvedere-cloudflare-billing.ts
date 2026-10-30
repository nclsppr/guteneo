import { z } from "zod";
import type { BelvedereCloudflareBilling } from "../../../packages/contracts/src/belvedere-cloudflare";
import { boundedText } from "../../../packages/providers/transport";
import type { Fetcher } from "../../../packages/providers/types";

export interface BelvedereCloudflareBillingEnvironment {
  BELVEDERE_CLOUDFLARE_ACCOUNT_ID?: string;
  BELVEDERE_CLOUDFLARE_BILLING_TOKEN?: string;
}

const DAY_MS = 86_400_000;
const PRECISION = 18;
const SCALE = 10n ** BigInt(PRECISION);
const MINOR_SCALE = SCALE / 100n;
const schema = z.object({
  success: z.literal(true),
  errors: z.array(z.unknown()).length(0),
  result: z
    .array(
      z.object({
        BillingAccountId: z.string(),
        BillingCurrency: z.enum(["EUR", "USD"]),
        BillingPeriodStart: z.iso.datetime({ offset: true }),
        ChargeCategory: z.literal("Usage"),
        ChargeClass: z.null().optional(),
        ChargePeriodStart: z.iso.datetime({ offset: true }),
        ChargePeriodEnd: z.iso.datetime({ offset: true }),
        ContractedCost: z.string().max(64),
        ServiceName: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[\p{L}\p{N} ._()+/-]+$/u),
        ConsumedUnit: z.string().max(80),
        PricingUnit: z.string().max(80),
        SubscriptionId: z.string().max(128).optional(),
        ZoneId: z.string().max(128).optional(),
      }),
    )
    .max(2_000),
});

/** Preserve the exact provider decimal token before JSON's binary-number
 * conversion. Only the named numeric field is rewritten; JSON.parse still
 * validates the entire document. Escaped JSON keys are deliberately rejected.
 * Cloudflare documents ContractedCost as a number in BillingCurrency. */
function parseResponse(text: string): unknown {
  const decimalToken =
    /("ContractedCost"\s*:\s*)(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s*[,}])/g;
  return JSON.parse(text.replace(decimalToken, '$1"$2"'));
}

function exactUnits(decimal: string): bigint | null {
  const parts = /^(\d{1,30})(?:\.(\d{1,30}))?(?:[eE]([+-]?\d{1,2}))?$/.exec(
    decimal,
  );
  if (!parts) return null;
  const fraction = parts[2] ?? "";
  const exponent = Number(parts[3] ?? 0);
  const digits = BigInt(parts[1]! + fraction);
  const power = PRECISION + exponent - fraction.length;
  if (Math.abs(power) > 48) return null;
  if (power >= 0) return digits * 10n ** BigInt(power);
  const divisor = 10n ** BigInt(-power);
  return digits % divisor === 0n ? digits / divisor : null;
}

function money(units: bigint) {
  const rounded = (units + MINOR_SCALE / 2n) / MINOR_SCALE;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const remainder = (units % SCALE)
    .toString()
    .padStart(PRECISION, "0")
    .replace(/0+$/, "");
  return {
    amountMinor: Number(rounded),
    reportedAmountDecimal: `${units / SCALE}${remainder ? `.${remainder}` : ""}`,
  };
}

/** Current-cycle metered costs reported by Cloudflare, not a complete invoice
 * or a payment receipt. No cached state, automatic retry or provider mutation. */
export async function getBelvedereCloudflareBilling(
  env: BelvedereCloudflareBillingEnvironment,
  dependencies: { now?: Date; fetcher?: Fetcher } = {},
): Promise<BelvedereCloudflareBilling> {
  const now = dependencies.now ?? new Date();
  const validNow = Number.isFinite(now.getTime());
  const end = validNow ? now.getTime() : Date.now();
  const base: BelvedereCloudflareBilling = {
    status: "unavailable",
    source: "cloudflare_billable_usage_v1",
    period: "current_billing_cycle",
    observedAt: new Date(end).toISOString(),
    firstChargeAt: null,
    lastChargeAt: null,
    coverage: "metered_usage_only",
    rounding: "nearest_minor_half_up",
    lineCount: 0,
    totals: [],
    services: [],
  };
  if (!validNow) return base;
  const account = env.BELVEDERE_CLOUDFLARE_ACCOUNT_ID;
  const token = env.BELVEDERE_CLOUDFLARE_BILLING_TOKEN;
  if (
    !/^[a-f0-9]{32}$/i.test(account ?? "") ||
    !/^[A-Za-z0-9._-]{20,512}$/.test(token ?? "")
  )
    return { ...base, status: "not_configured" };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("billing_timeout"));
    }, 8_000);
  });
  const inspect = async (): Promise<BelvedereCloudflareBilling> => {
    // Omitting dates selects the current cycle; a from/to range that excludes
    // the subscription's anchor day would silently produce an empty result.
    const response = await (dependencies.fetcher ?? fetch)(
      `https://api.cloudflare.com/client/v4/accounts/${account}/billable-usage`,
      {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return {
        ...base,
        status:
          response.status === 401 || response.status === 403
            ? "forbidden"
            : "unavailable",
      };
    }
    const payload = schema.safeParse(
      parseResponse(await boundedText(response, 524_288)),
    );
    if (!payload.success) return base;
    const rows = payload.data.result;
    if (!rows.length) return { ...base, status: "no_data" };
    const totals = new Map<"EUR" | "USD", bigint>();
    const services = new Map<
      string,
      {
        service: string;
        currency: "EUR" | "USD";
        units: bigint;
        chargePeriods: number;
      }
    >();
    const seen = new Set<string>();
    let first = end;
    let last = 0;
    for (const row of rows) {
      const start = Date.parse(row.ChargePeriodStart);
      const finish = Date.parse(row.ChargePeriodEnd);
      const cycle = Date.parse(row.BillingPeriodStart);
      // A bounded monthly current-cycle connector. Older/historical or annual
      // data requires a distinct contract rather than silently broadening it.
      if (
        row.BillingAccountId !== account ||
        cycle < end - 62 * DAY_MS ||
        cycle > start ||
        start > end ||
        finish <= start ||
        finish > end + 31 * DAY_MS ||
        finish - start > 31 * DAY_MS
      )
        return base;
      const units = exactUnits(row.ContractedCost);
      if (units === null || !money(units)) return base;
      const identity = JSON.stringify([
        row.ServiceName,
        row.BillingCurrency,
        row.SubscriptionId ?? "",
        row.ZoneId ?? "",
        row.ConsumedUnit,
        row.PricingUnit,
        cycle,
        start,
        finish,
      ]);
      // Identical row identity is ambiguous, never sum a duplicate charge.
      if (seen.has(identity)) return base;
      seen.add(identity);
      first = Math.min(first, start);
      last = Math.max(last, finish);
      totals.set(
        row.BillingCurrency,
        (totals.get(row.BillingCurrency) ?? 0n) + units,
      );
      const key = `${row.BillingCurrency}:${row.ServiceName}`;
      const service = services.get(key) ?? {
        service: row.ServiceName,
        currency: row.BillingCurrency,
        units: 0n,
        chargePeriods: 0,
      };
      service.units += units;
      service.chargePeriods++;
      services.set(key, service);
    }
    const result: BelvedereCloudflareBilling = {
      ...base,
      status: "ok",
      firstChargeAt: new Date(first).toISOString(),
      lastChargeAt: new Date(last).toISOString(),
      lineCount: rows.length,
      totals: [],
      services: [],
    };
    for (const [currency, units] of totals) {
      const amount = money(units);
      if (!amount) return base;
      result.totals.push({ currency, ...amount });
    }
    for (const {
      service,
      currency,
      units,
      chargePeriods,
    } of services.values()) {
      const amount = money(units);
      if (!amount) return base;
      result.services.push({ service, currency, chargePeriods, ...amount });
    }
    result.totals.sort((a, b) => a.currency.localeCompare(b.currency));
    result.services.sort(
      (a, b) =>
        a.currency.localeCompare(b.currency) ||
        b.amountMinor - a.amountMinor ||
        a.service.localeCompare(b.service),
    );
    return result;
  };
  try {
    return await Promise.race([inspect(), deadline]);
  } catch {
    return base;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
