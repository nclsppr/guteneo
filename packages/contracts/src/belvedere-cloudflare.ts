export type BelvedereCloudflareWindow = "24h" | "7d";

export interface BelvedereCloudflareMetrics {
  status: "ok" | "not_configured" | "forbidden" | "unavailable" | "no_data";
  source: "cloudflare_graphql";
  window: BelvedereCloudflareWindow;
  startAt: string;
  endAt: string;
  observedAt: string;
  sampled: true;
  metrics: null | {
    requests: number;
    errors: number;
    subrequests: number;
    /** Fraction in [0, 1], for Worker invocation errors, not HTTP errors. */
    errorRate: number;
    /** Provider-computed percentiles over the whole selected period. */
    wallTimeP50Milliseconds: number | null;
    wallTimeP99Milliseconds: number | null;
  };
  /** Only returned hourly buckets; missing buckets are not fabricated as zero. */
  series: Array<{
    hour: string;
    requests: number;
    errors: number;
    subrequests: number;
  }>;
  /** Analytics cannot establish an invoiced infrastructure expense. */
  billing: { status: "unavailable"; amountMinor: null; currency: null };
}

export interface BelvedereCloudflareBilling {
  status: "ok" | "not_configured" | "forbidden" | "unavailable" | "no_data";
  source: "cloudflare_billable_usage_v1";
  period: "current_billing_cycle";
  observedAt: string;
  firstChargeAt: string | null;
  lastChargeAt: string | null;
  coverage: "metered_usage_only";
  rounding: "nearest_minor_half_up";
  lineCount: number;
  /** No currency conversion; each subtotal is rounded once after exact addition. */
  totals: Array<{
    currency: "EUR" | "USD";
    amountMinor: number;
    reportedAmountDecimal: string;
  }>;
  services: Array<{
    service: string;
    currency: "EUR" | "USD";
    amountMinor: number;
    reportedAmountDecimal: string;
    chargePeriods: number;
  }>;
}
