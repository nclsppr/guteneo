import { z } from "zod";
import type {
  BelvedereCloudflareMetrics,
  BelvedereCloudflareWindow,
} from "../../../packages/contracts/src/belvedere-cloudflare";
import { boundedText } from "../../../packages/providers/transport";
import type { Fetcher } from "../../../packages/providers/types";

export type { BelvedereCloudflareMetrics, BelvedereCloudflareWindow };

export interface BelvedereCloudflareEnvironment {
  BELVEDERE_CLOUDFLARE_ACCOUNT_ID?: string;
  BELVEDERE_CLOUDFLARE_API_TOKEN?: string;
  BELVEDERE_CLOUDFLARE_SCRIPT_NAME?: string;
}

const HOUR_MS = 3_600_000;
const TIMEOUT_MS = 8_000;
const RESPONSE_LIMIT = 131_072;
const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

// No status or time dimension in aggregate: the provider computes percentiles
// for the complete period. Averaging hourly percentiles would be incorrect.
const QUERY = `query BelvedereWorkers($accountTag: string!, $scriptName: string!, $start: string!, $end: string!) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      aggregate: workersInvocationsAdaptive(limit: 1, filter: {
        scriptName: $scriptName, datetime_geq: $start, datetime_lt: $end
      }) {
        sum { requests errors subrequests }
        quantiles { wallTimeP50 wallTimeP99 }
      }
      hourly: workersInvocationsAdaptive(limit: 170, filter: {
        scriptName: $scriptName, datetime_geq: $start, datetime_lt: $end
      }, orderBy: [datetimeHour_ASC]) {
        dimensions { datetimeHour }
        sum { requests errors subrequests }
      }
    }
  }
}`;

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const sums = z
  .object({ requests: count, errors: count, subrequests: count })
  .refine((value) => value.errors <= value.requests);
const quantile = z.number().finite().min(0).nullable();
const schema = z.object({
  data: z.object({
    viewer: z.object({
      accounts: z
        .array(
          z.object({
            aggregate: z
              .array(
                z.object({
                  sum: sums,
                  quantiles: z.object({
                    wallTimeP50: quantile,
                    wallTimeP99: quantile,
                  }),
                }),
              )
              .max(1),
            hourly: z
              .array(
                z.object({
                  dimensions: z.object({ datetimeHour: z.iso.datetime() }),
                  sum: sums,
                }),
              )
              .max(169),
          }),
        )
        .length(1),
    }),
  }),
});

function hasConfiguration(env: BelvedereCloudflareEnvironment): boolean {
  return (
    /^[a-f0-9]{32}$/i.test(env.BELVEDERE_CLOUDFLARE_ACCOUNT_ID ?? "") &&
    /^[A-Za-z0-9_-]{1,63}$/.test(env.BELVEDERE_CLOUDFLARE_SCRIPT_NAME ?? "") &&
    /^[A-Za-z0-9._-]{20,512}$/.test(env.BELVEDERE_CLOUDFLARE_API_TOKEN ?? "")
  );
}

function providerErrors(value: unknown): unknown[] | null {
  if (!value || typeof value !== "object") return [null];
  const errors = (value as { errors?: unknown }).errors;
  if (errors === null || errors === undefined) return null;
  if (!Array.isArray(errors)) return [null];
  return errors.length ? errors : null;
}

function forbidden(errors: unknown[]): boolean {
  return errors.some((error) => {
    if (!error || typeof error !== "object") return false;
    const { message, extensions } = error as {
      message?: unknown;
      extensions?: { code?: unknown };
    };
    return (
      extensions?.code === "FORBIDDEN" ||
      extensions?.code === "UNAUTHENTICATED" ||
      (typeof message === "string" &&
        /not authorized|not authorised|unauthorized|forbidden|authentication|permission denied|does not have access/i.test(
          message,
        ))
    );
  });
}

/** Read-only, single-account, single-Worker analytics. Call only after the
 * private Belvedere browser guard. Never accepts account/script from a request.
 * Raw provider bodies, errors and credential values never leave this module. */
export async function getBelvedereCloudflareMetrics(
  env: BelvedereCloudflareEnvironment,
  window: BelvedereCloudflareWindow,
  dependencies: { now?: Date; fetcher?: Fetcher } = {},
): Promise<BelvedereCloudflareMetrics> {
  const now = dependencies.now ?? new Date();
  const validWindow = window === "24h" || window === "7d";
  const safeWindow = window === "7d" ? "7d" : "24h";
  const validNow = Number.isFinite(now.getTime());
  const end = validNow ? now.getTime() : Date.now();
  const start = end - (safeWindow === "24h" ? 24 : 168) * HOUR_MS;
  const base: BelvedereCloudflareMetrics = {
    status: "unavailable",
    source: "cloudflare_graphql",
    window: safeWindow,
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    observedAt: new Date(end).toISOString(),
    sampled: true,
    metrics: null,
    series: [],
    billing: { status: "unavailable", amountMinor: null, currency: null },
  };
  if (!validWindow || !validNow) return base;
  if (!hasConfiguration(env)) return { ...base, status: "not_configured" };

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("analytics_timeout"));
    }, TIMEOUT_MS);
  });
  const inspect = async (): Promise<BelvedereCloudflareMetrics> => {
    const response = await (dependencies.fetcher ?? fetch)(ENDPOINT, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.BELVEDERE_CLOUDFLARE_API_TOKEN!}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          accountTag: env.BELVEDERE_CLOUDFLARE_ACCOUNT_ID,
          scriptName: env.BELVEDERE_CLOUDFLARE_SCRIPT_NAME,
          start: base.startAt,
          end: base.endAt,
        },
      }),
    });
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
    const payload: unknown = JSON.parse(
      await boundedText(response, RESPONSE_LIMIT),
    );
    const errors = providerErrors(payload);
    if (errors)
      return {
        ...base,
        status: forbidden(errors) ? "forbidden" : "unavailable",
      };
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return base;
    const account = parsed.data.data.viewer.accounts[0]!;
    const aggregate = account.aggregate[0];
    if (!aggregate)
      return account.hourly.length ? base : { ...base, status: "no_data" };
    const hours = new Set<number>();
    const series: BelvedereCloudflareMetrics["series"] = [];
    for (const row of account.hourly) {
      const hour = Date.parse(row.dimensions.datetimeHour);
      if (
        hour < Math.floor(start / HOUR_MS) * HOUR_MS ||
        hour >= end ||
        hour % HOUR_MS !== 0 ||
        hours.has(hour)
      )
        return base;
      hours.add(hour);
      series.push({ hour: new Date(hour).toISOString(), ...row.sum });
    }
    if (!aggregate.sum.requests) {
      if (series.some((row) => row.requests > 0)) return base;
      return { ...base, status: "no_data" };
    }
    if (!series.length) return base;
    const { wallTimeP50, wallTimeP99 } = aggregate.quantiles;
    if (
      wallTimeP50 !== null &&
      wallTimeP99 !== null &&
      wallTimeP50 > wallTimeP99
    )
      return base;
    return {
      ...base,
      status: "ok",
      metrics: {
        ...aggregate.sum,
        errorRate: aggregate.sum.errors / aggregate.sum.requests,
        wallTimeP50Milliseconds: wallTimeP50,
        wallTimeP99Milliseconds: wallTimeP99,
      },
      series: series.sort((a, b) => a.hour.localeCompare(b.hour)),
    };
  };
  try {
    return await Promise.race([inspect(), deadline]);
  } catch {
    return base;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
