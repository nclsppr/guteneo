import { createHash } from "node:crypto";
import { canonicalJson } from "../../../packages/domain/src/index";
import { RESEND_RATE } from "./email-setup";
import { parseFaxFx } from "./fax-tariff-refresh";
import { resendIdentity } from "./resend-environment";
import {
  readResendPolicyState,
  resendQualificationContradicted,
  resendPolicyContradictions,
  resendConsumerContradicted,
  type ResendPolicyState,
} from "./resend-policy-state";
import type { Env } from "./env";

const DAY = 86400000,
  HORIZON = 30 * DAY;
const PRICE = "https://resend.com/pricing",
  FX = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
type Code =
  | "READ_NOT_PERMITTED"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_INVALID"
  | "PRICE_CHANGED"
  | "DOMAIN_CHANGED"
  | "CAPACITY_CHANGED"
  | "BINDING_CHANGED"
  | "COMMIT_CHANGED";
type SourceStage =
  "configuration" | "domain" | "usage" | "pricing" | "fx" | "sources";
class RefreshError extends Error {
  constructor(
    readonly code: Code,
    readonly stage?: SourceStage,
    readonly contradictions: string[] = [],
  ) {
    super(code);
  }
}
const fail = (code: Code): never => {
  throw new RefreshError(code);
};
function selection(
  env: Env,
  consumer: "tariff" | "limits",
): "active" | "inactive" | "unknown" {
  if (
    env.ENVIRONMENT !== "production" ||
    env.MODE !== "production" ||
    env.EMAIL_PROVIDER === undefined ||
    env.EMAIL_PROVIDER === "ses" ||
    [undefined, "false"].includes(env.RESEND_SENDS_ENABLED)
  )
    return "inactive";
  if (env.EMAIL_PROVIDER !== "resend" || env.RESEND_SENDS_ENABLED !== "true")
    return "unknown";
  if (consumer === "limits") {
    if ([undefined, "false"].includes(env.LIVE_SENDS_ENABLED))
      return "inactive";
    if (env.LIVE_SENDS_ENABLED !== "true") return "unknown";
    if (env.LIVE_SEND_CHANNELS !== undefined) {
      const channels = env.LIVE_SEND_CHANNELS.split(",").map((value) =>
        value.trim(),
      );
      if (channels.some((value) => !["fax", "postal", "email"].includes(value)))
        return "unknown";
      if (!channels.includes("email")) return "inactive";
    }
  }
  try {
    const origin = new URL(env.APP_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      return "unknown";
  } catch {
    return "unknown";
  }
  return "active";
}
export function resendMaintenanceSelected(env: Env) {
  return selection(env, "tariff") === "active";
}
type LimitPolicy = {
  account_id: string;
  max_recipients_24h: number;
  max_recipients_month: number;
  min_interval_ms: number;
  qualified_at_ms: number;
  expires_at_ms: number;
  source_sha256: string;
  status: string;
};
type State = ResendPolicyState;
export type ResendPolicyRefreshCounts = {
  resendPoliciesRefreshed: number;
  resendPolicyRefreshFailed: number;
  resendPolicyRefreshDeferred: number;
};
const empty = (): ResendPolicyRefreshCounts => ({
  resendPoliciesRefreshed: 0,
  resendPolicyRefreshFailed: 0,
  resendPolicyRefreshDeferred: 0,
});
export async function readResendPolicyFreshness(env: Env, now = Date.now()) {
  const tariffSelection = selection(env, "tariff"),
    limitsSelection = selection(env, "limits");
  const base = {
    applicable: false,
    status: "inactive" as "active" | "inactive" | "unknown",
    tariffStatus: "inactive" as "active" | "inactive" | "unknown",
    limitsStatus: "inactive" as "active" | "inactive" | "unknown",
    tariffExpiresAt: null as string | null,
    limitsExpiresAt: null as string | null,
    tariffRevisionSha256: null as string | null,
    limitsRevisionSha256: null as string | null,
    lastSuccessAt: null as string | null,
    lastErrorCode: null as string | null,
    nextAttemptAt: null as string | null,
    unknown: false,
    blocked: false,
    tariffBlocked: false,
    limitsBlocked: false,
    automaticPriceBlocked: false,
    universalBlocked: false,
  };
  if (tariffSelection === "inactive" && limitsSelection === "inactive")
    return base;
  const unavailable = (code: string) => ({
    ...base,
    applicable: true,
    status: "unknown" as const,
    unknown: true,
    lastErrorCode: code,
    tariffStatus:
      tariffSelection === "inactive"
        ? ("inactive" as const)
        : ("unknown" as const),
    limitsStatus:
      limitsSelection === "inactive"
        ? ("inactive" as const)
        : ("unknown" as const),
  });
  const identity = resendIdentity(env);
  if (!identity) return unavailable("BINDING_NOT_CONFIGURED");
  try {
    const policy = await env.DB.prepare(
      "SELECT * FROM resend_send_limit_policies WHERE account_id=?",
    )
      .bind(identity.accountId)
      .first<LimitPolicy>();
    const { state } = await readResendPolicyState(env.DB, identity.accountId);
    const bindingChanged =
      !!state &&
      (state.domain_id !== env.RESEND_DOMAIN_ID ||
        state.route_id !== identity.routeId);
    const missingConfiguration =
      !env.RESEND_API_KEY || !env.RESEND_WEBHOOK_SECRET;
    const commonUnknown = bindingChanged || missingConfiguration;
    const legacy = Date.parse(env.RESEND_TARIFF_QUALIFIED_UNTIL ?? "");
    const tariff = state?.last_success_at
      ? state.qualified_until
      : Number.isFinite(legacy)
        ? new Date(legacy).toISOString()
        : null;
    const tariffValid = !!tariff && Number.isFinite(Date.parse(tariff));
    const policyValid =
      !!policy &&
      policy.status === "qualified" &&
      Number.isSafeInteger(policy.qualified_at_ms) &&
      policy.qualified_at_ms >= 0 &&
      policy.qualified_at_ms <= now &&
      Number.isSafeInteger(policy.expires_at_ms) &&
      policy.expires_at_ms > policy.qualified_at_ms &&
      policy.expires_at_ms <= 8640000000000000 &&
      /^[a-fA-F0-9]{64}$/.test(policy.source_sha256);
    const tariffStatus =
      tariffSelection === "inactive"
        ? "inactive"
        : tariffSelection === "unknown" || commonUnknown || !tariffValid
          ? "unknown"
          : "active";
    const limitsStatus =
      limitsSelection === "inactive" || policy?.status === "revoked"
        ? "inactive"
        : limitsSelection === "unknown" || commonUnknown || !policyValid
          ? "unknown"
          : "active";
    const unknown = tariffStatus === "unknown" || limitsStatus === "unknown";
    const universalBlocked =
      bindingChanged || resendConsumerContradicted(state, "universal");
    const tariffBlocked =
      universalBlocked || resendConsumerContradicted(state, "tariff");
    const limitsBlocked =
      universalBlocked || resendConsumerContradicted(state, "limits");
    const automaticPriceBlocked = resendConsumerContradicted(
      state,
      "automatic_price",
    );
    const limits = policyValid
      ? new Date(policy.expires_at_ms).toISOString()
      : null;
    return {
      ...base,
      applicable: true,
      status: unknown ? ("unknown" as const) : ("active" as const),
      tariffStatus,
      limitsStatus,
      unknown,
      tariffExpiresAt: tariffSelection === "inactive" ? null : tariff,
      limitsExpiresAt: limitsSelection === "inactive" ? null : limits,
      lastSuccessAt: state?.last_success_at ?? null,
      nextAttemptAt: state?.next_attempt_at ?? null,
      lastErrorCode: bindingChanged
        ? "BINDING_CHANGED"
        : (state?.blocked_reason ??
          state?.last_error_code ??
          (missingConfiguration
            ? "CONFIGURATION_INCOMPLETE"
            : limitsStatus === "unknown" && !policy
              ? "POLICY_NOT_REGISTERED"
              : limitsStatus === "unknown" && !policyValid
                ? "POLICY_INVALID"
                : tariffStatus === "unknown" && !tariffValid
                  ? "TARIFF_UNQUALIFIED"
                  : null)),
      blocked: universalBlocked || tariffBlocked || limitsBlocked,
      universalBlocked,
      tariffBlocked,
      limitsBlocked,
      automaticPriceBlocked,
      tariffRevisionSha256: hash(
        canonicalJson({
          rate: state?.last_success_at ? state.rate_json : RESEND_RATE,
          source: state?.last_success_at
            ? state.source_sha256
            : hash(canonicalJson(RESEND_RATE)),
          until: tariff,
        }),
      ),
      limitsRevisionSha256: policy ? hash(canonicalJson(policy)) : null,
      expired:
        (tariffStatus === "active" && !!tariff && Date.parse(tariff) <= now) ||
        (limitsStatus === "active" && !!limits && Date.parse(limits) <= now),
    };
  } catch {
    return unavailable("DATABASE_UNAVAILABLE");
  }
}
export function parseResendPublicPrice(html: string) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
  const prices = [
    ...text.matchAll(
      /\bPro(?:\s+Recommended)?\s*\$[\d,.]+\s*\/\s*mo[\s\S]{0,350}?Extra emails:\s*\$([\d.]+)\s*\/\s*1,000/gi,
    ),
  ];
  if (!prices.length) return fail("SOURCE_INVALID");
  if (prices.some((p) => !/^0\.90(?:0*)?$/.test(p[1]))) fail("PRICE_CHANGED");
  return 900;
}
function parseUsage(text: string, policy?: LimitPolicy) {
  const usage = JSON.parse(text) as {
    object?: unknown;
    emails?: { daily?: { limit?: unknown }; monthly?: { limit?: unknown } };
    rate_limit?: { limit?: unknown; duration?: unknown };
  };
  const bound = (n: unknown) =>
    n === null
      ? Infinity
      : typeof n === "number" && Number.isSafeInteger(n) && n > 0
        ? n
        : fail("SOURCE_INVALID");
  if (usage.object !== "usage") fail("SOURCE_INVALID");
  const daily = bound(usage.emails?.daily?.limit),
    monthly = bound(usage.emails?.monthly?.limit),
    limit = bound(usage.rate_limit?.limit),
    duration =
      typeof usage.rate_limit?.duration === "string"
        ? /^(\d{1,8})(ms|s)$/.exec(usage.rate_limit.duration)
        : null;
  if (!duration || !Number(duration[1]) || !Number.isFinite(limit))
    return fail("SOURCE_INVALID");
  const durationMs = Number(duration[1]) * (duration[2] === "s" ? 1000 : 1);
  if (
    policy &&
    (policy.max_recipients_24h > daily ||
      policy.max_recipients_month > monthly ||
      policy.min_interval_ms < Math.ceil(durationMs / limit))
  )
    fail("CAPACITY_CHANGED");
  return {
    dailyLimit: Number.isFinite(daily) ? daily : null,
    monthlyLimit: Number.isFinite(monthly) ? monthly : null,
    apiRateLimit: limit,
    apiWindowMs: durationMs,
  };
}
async function read(
  url: string,
  key: string | undefined,
  signal: AbortSignal,
  fetcher: typeof fetch,
  maximum: number,
) {
  const api = url.startsWith("https://api.resend.com/");
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      signal,
      headers: api
        ? { Authorization: `Bearer ${key!}`, Accept: "application/json" }
        : undefined,
    });
  } catch {
    return fail("SOURCE_UNAVAILABLE");
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    fail("READ_NOT_PERMITTED");
  }
  if (response.status !== 200 || (response.url && response.url !== url)) {
    await response.body?.cancel();
    fail("SOURCE_UNAVAILABLE");
  }
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    await response.body?.cancel();
    fail("SOURCE_INVALID");
  }
  const reader = response.body?.getReader();
  if (!reader) return fail("SOURCE_INVALID");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const bodyHash = createHash("sha256");
  let text = "",
    size = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const part = await reader.read();
      if (signal.aborted) fail("SOURCE_UNAVAILABLE");
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) fail("SOURCE_INVALID");
      bodyHash.update(part.value);
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
  }
  if (!size) fail("SOURCE_INVALID");
  return { text, sha256: bodyHash.digest("hex") };
}
type SourceDependencies = { fetcher?: typeof fetch; now?: () => number };
async function atStage<T>(
  stage: SourceStage,
  action: () => T | Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new RefreshError(
      error instanceof RefreshError ? error.code : "SOURCE_INVALID",
      stage,
    );
  }
}
/** Shared real evidence collector: no database access or provider writes. */
async function readResendEvidence(
  env: Env,
  { fetcher = fetch, now = Date.now }: SourceDependencies,
  policy?: LimitPolicy,
  includeUsage = true,
) {
  if (!resendIdentity(env))
    throw new RefreshError("BINDING_CHANGED", "configuration");
  const key = env.RESEND_READINESS_API_KEY ?? env.RESEND_API_KEY;
  if (!key) throw new RefreshError("READ_NOT_PERMITTED", "configuration");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const negatives: RefreshError[] = [];
  type Source = Awaited<ReturnType<typeof read>>;
  const observed: PromiseSettledResult<Source | null>[] = [];
  const track = (
    index: number,
    stage: SourceStage,
    action: () => Promise<Source | null>,
  ) =>
    atStage(stage, action).then(
      (value) => {
        observed[index] = { status: "fulfilled", value };
        return value;
      },
      (reason) => {
        observed[index] = { status: "rejected", reason };
        if (
          reason instanceof RefreshError &&
          resendQualificationContradicted(reason.code)
        )
          negatives.push(reason);
        throw reason;
      },
    );
  const jobs = [
    track(0, "domain", async () => {
      const source = await read(
        "https://api.resend.com/domains/" +
          encodeURIComponent(env.RESEND_DOMAIN_ID!),
        key,
        controller.signal,
        fetcher,
        32768,
      );
      const value = JSON.parse(source.text) as Record<string, unknown>;
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.id !== "string" ||
        typeof value.name !== "string" ||
        ![
          "not_started",
          "pending",
          "verified",
          "failed",
          "temporary_failure",
        ].includes(String(value.status))
      )
        fail("SOURCE_INVALID");
      if (
        value.id !== env.RESEND_DOMAIN_ID ||
        value.name !== env.RESEND_VERIFIED_DOMAIN ||
        value.status !== "verified"
      )
        fail("DOMAIN_CHANGED");
      return source;
    }),
    track(1, "usage", async () => {
      if (!includeUsage) return null;
      const source = await read(
        "https://api.resend.com/usage",
        key,
        controller.signal,
        fetcher,
        65536,
      );
      try {
        parseUsage(source.text, policy);
      } catch (error) {
        if (
          !(error instanceof RefreshError) ||
          error.code !== "CAPACITY_CHANGED"
        )
          throw error;
        negatives.push(new RefreshError("CAPACITY_CHANGED", "usage"));
        parseUsage(source.text);
      }
      return source;
    }),
    track(2, "pricing", async () => {
      const source = await read(
        PRICE,
        undefined,
        controller.signal,
        fetcher,
        1024 * 1024,
      );
      parseResendPublicPrice(source.text);
      return source;
    }),
    track(3, "fx", async () => {
      const source = await read(
        FX,
        undefined,
        controller.signal,
        fetcher,
        128 * 1024,
      );
      parseFaxFx(source.text, new Date(now()).toISOString());
      return source;
    }),
  ];
  try {
    await Promise.race([
      Promise.allSettled(jobs),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve();
        }, 30000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
  const codes = [...new Set(negatives.map((value) => value.code))];
  const prices = [observed[0], observed[2], observed[3]];
  const missingPrice = prices.find(
    (value) => !value || value.status !== "fulfilled" || !value.value,
  );
  if (codes.some((code) => code !== "CAPACITY_CHANGED") || missingPrice) {
    if (negatives.length) {
      const primary = negatives[0];
      throw new RefreshError(primary.code, primary.stage, codes);
    }
    const rejected = prices.find((value) => value?.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
    throw new RefreshError("SOURCE_UNAVAILABLE", "sources");
  }
  const required = (index: number) => {
    const value = observed[index];
    if (!value || value.status !== "fulfilled" || !value.value)
      throw new RefreshError("SOURCE_UNAVAILABLE", "sources");
    return value.value;
  };
  const domainSource = required(0),
    priceSource = required(2),
    fxSource = required(3);
  const usageResult = observed[1];
  const usageSource =
    usageResult?.status === "fulfilled" ? usageResult.value : null;
  const usageError =
    includeUsage && !usageSource
      ? usageResult?.status === "rejected" &&
        usageResult.reason instanceof RefreshError
        ? usageResult.reason
        : new RefreshError("SOURCE_UNAVAILABLE", "usage")
      : null;
  const limits = usageSource ? parseUsage(usageSource.text) : null;
  const observedAt = new Date(now()).toISOString(),
    fx = parseFaxFx(fxSource.text, observedAt);
  const rate = {
    ...RESEND_RATE,
    tariffDate: observedAt.slice(0, 10),
    fxDate: fx.date,
    eurPerUsdNumerator: fx.numerator,
    eurPerUsdDenominator: fx.denominator,
  };
  return {
    domainSource,
    usageSource,
    priceSource,
    fxSource,
    limits,
    usageError,
    observedAt,
    rate,
    contradictions: codes,
  };
}
export type ResendPolicySourceInspection =
  | {
      provider: "resend";
      mode: "read_only";
      status: "ok";
      observedAt: string;
      domainVerified: true;
      usdMicrosPerMessage: number;
      fxDate: string;
      dailyLimit: number | null;
      monthlyLimit: number | null;
      apiRateLimit: number;
      apiWindowMs: number;
    }
  | {
      provider: "resend";
      mode: "read_only";
      status: "unavailable";
      code: Code;
      stage: SourceStage;
    };
/** Authenticated source qualification only; deliberately never reads or writes D1. */
export async function inspectResendPolicySources(
  env: Env,
  deps: SourceDependencies = {},
): Promise<ResendPolicySourceInspection> {
  try {
    const evidence = await readResendEvidence(env, deps);
    if (evidence.usageError) throw evidence.usageError;
    if (!evidence.limits) throw new RefreshError("SOURCE_INVALID", "usage");
    return {
      provider: "resend",
      mode: "read_only",
      status: "ok",
      observedAt: evidence.observedAt,
      domainVerified: true,
      usdMicrosPerMessage: evidence.rate.usdMicrosPerMessage,
      fxDate: evidence.rate.fxDate,
      ...evidence.limits,
    };
  } catch (error) {
    return {
      provider: "resend",
      mode: "read_only",
      status: "unavailable",
      code: error instanceof RefreshError ? error.code : "SOURCE_INVALID",
      stage:
        error instanceof RefreshError ? (error.stage ?? "sources") : "sources",
    };
  }
}
export async function refreshResendPolicies(
  env: Env,
  {
    fetcher = fetch,
    now = Date.now,
  }: { fetcher?: typeof fetch; now?: () => number } = {},
): Promise<ResendPolicyRefreshCounts> {
  const counts = empty();
  if (!resendMaintenanceSelected(env)) return counts;
  const identity = resendIdentity(env);
  if (!identity) return counts;
  let lease: string | null = null,
    priorState: State | null = null;
  try {
    const observedPolicy = await env.DB.prepare(
      "SELECT * FROM resend_send_limit_policies WHERE account_id=?",
    )
      .bind(identity.accountId)
      .first<LimitPolicy>();
    const policy =
      observedPolicy?.status === "qualified" ? observedPolicy : undefined;
    const maintainLimits =
      !!policy &&
      selection(env, "limits") === "active" &&
      Number.isSafeInteger(policy.qualified_at_ms) &&
      policy.qualified_at_ms <= now();
    const started = new Date(now()).toISOString();
    await env.DB.prepare(
      "INSERT INTO resend_policy_refresh_state(account_id,domain_id,route_id,next_attempt_at) VALUES(?,?,?,?) ON CONFLICT(account_id) DO NOTHING",
    )
      .bind(
        identity.accountId,
        env.RESEND_DOMAIN_ID!,
        identity.routeId,
        started,
      )
      .run();
    const state = await env.DB.prepare(
      "SELECT * FROM resend_policy_refresh_state WHERE account_id=?",
    )
      .bind(identity.accountId)
      .first<State>();
    priorState = state;
    if (
      !state ||
      state.domain_id !== env.RESEND_DOMAIN_ID ||
      state.route_id !== identity.routeId
    )
      return fail("BINDING_CHANGED");
    const limitBecameSelected =
      maintainLimits &&
      state.last_success_at &&
      !state.last_error_code &&
      policy.source_sha256 !== state.source_sha256;
    if (
      (state.next_attempt_at > started && !limitBecameSelected) ||
      (state.lease_until && state.lease_until > started)
    )
      return counts;
    lease = crypto.randomUUID();
    const claimed = await env.DB.prepare(
      "UPDATE resend_policy_refresh_state SET lease_token=?,lease_until=?,last_attempt_at=? WHERE account_id=? AND domain_id=? AND route_id=? AND (next_attempt_at<=? OR ?=1) AND (lease_until IS NULL OR lease_until<=?)",
    )
      .bind(
        lease,
        new Date(now() + 60000).toISOString(),
        started,
        identity.accountId,
        env.RESEND_DOMAIN_ID!,
        identity.routeId,
        started,
        limitBecameSelected ? 1 : 0,
        started,
      )
      .run();
    if (claimed.meta.changes !== 1) {
      counts.resendPolicyRefreshDeferred++;
      return counts;
    }
    const evidence = await readResendEvidence(
      env,
      { fetcher, now },
      maintainLimits ? policy : undefined,
      maintainLimits,
    );
    const {
      domainSource,
      usageSource,
      priceSource,
      fxSource,
      limits,
      observedAt,
      rate,
      usageError,
    } = evidence;
    const contradictions = [
      ...new Set([
        ...evidence.contradictions,
        ...(!usageSource
          ? resendPolicyContradictions(priorState).filter(
              (code) => code === "CAPACITY_CHANGED",
            )
          : []),
      ]),
    ];
    const until = new Date(Date.parse(observedAt) + HORIZON).toISOString();
    const sourceHash = hash(
      canonicalJson({
        account: identity,
        domain: env.RESEND_DOMAIN_ID,
        domainHash: domainSource.sha256,
        usageHash: usageSource?.sha256 ?? null,
        priceHash: priceSource.sha256,
        fxHash: fxSource.sha256,
        rate,
        observedAt,
        until,
        previous: observedPolicy,
      }),
    );
    const columns = observedPolicy
      ? (Object.keys(observedPolicy) as (keyof LimitPolicy)[])
      : [];
    const equal = columns.map((key) => key + " IS ?").join(" AND ");
    const previousValues = columns.map((key) => observedPolicy![key]);
    const policyGuard = observedPolicy
      ? "EXISTS(SELECT 1 FROM resend_send_limit_policies WHERE " + equal + ")"
      : "NOT EXISTS(SELECT 1 FROM resend_send_limit_policies WHERE account_id=?)";
    const policyValues = observedPolicy ? previousValues : [identity.accountId];
    const guard =
      "EXISTS(SELECT 1 FROM resend_policy_refresh_state WHERE account_id=? AND domain_id=? AND route_id=? AND lease_token=? AND lease_until>? AND source_sha256=?)";
    const guardValues = [
      identity.accountId,
      env.RESEND_DOMAIN_ID!,
      identity.routeId,
      lease,
      observedAt,
      sourceHash,
    ];
    const statements = [
      env.DB.prepare(
        "UPDATE resend_policy_refresh_state SET source_sha256=? WHERE account_id=? AND domain_id=? AND route_id=? AND lease_token=? AND lease_until>? AND " +
          policyGuard,
      ).bind(
        sourceHash,
        identity.accountId,
        env.RESEND_DOMAIN_ID!,
        identity.routeId,
        lease,
        observedAt,
        ...policyValues,
      ),
    ];
    if (
      maintainLimits &&
      usageSource &&
      !contradictions.includes("CAPACITY_CHANGED")
    )
      statements.push(
        env.DB.prepare(
          "UPDATE resend_send_limit_policies SET qualified_at_ms=?,expires_at_ms=?,source_sha256=? WHERE " +
            equal +
            " AND " +
            guard,
        ).bind(
          Date.parse(observedAt),
          Date.parse(until),
          sourceHash,
          ...previousValues,
          ...guardValues,
        ),
      );
    statements.push(
      env.DB.prepare(
        "INSERT INTO resend_policy_refresh_evidence(id,account_id,domain_id,route_id,observed_at,qualified_until,domain_sha256,usage_sha256,pricing_sha256,fx_sha256,rate_json,limits_json,previous_policy_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE " +
          guard,
      ).bind(
        sourceHash,
        identity.accountId,
        env.RESEND_DOMAIN_ID!,
        identity.routeId,
        observedAt,
        until,
        domainSource.sha256,
        usageSource?.sha256 ?? null,
        priceSource.sha256,
        fxSource.sha256,
        canonicalJson(rate),
        canonicalJson(limits),
        canonicalJson(observedPolicy),
        ...guardValues,
      ),
      env.DB.prepare(
        "UPDATE resend_policy_refresh_state SET qualified_until=?,rate_json=?,last_success_at=?,last_error_code=?,blocked_reason=?,blocked_reasons_json=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL,failure_count=0 WHERE account_id=? AND domain_id=? AND route_id=? AND lease_token=? AND source_sha256=? AND EXISTS(SELECT 1 FROM resend_policy_refresh_evidence WHERE id=?)",
      ).bind(
        until,
        canonicalJson(rate),
        observedAt,
        usageError?.code ?? contradictions[0] ?? null,
        contradictions[0] ?? null,
        contradictions.length ? canonicalJson(contradictions) : null,
        new Date(
          now() + (usageError || contradictions.length ? 3600000 : DAY),
        ).toISOString(),
        identity.accountId,
        env.RESEND_DOMAIN_ID!,
        identity.routeId,
        lease,
        sourceHash,
        sourceHash,
      ),
      env.DB.prepare(
        "SELECT CASE WHEN EXISTS(SELECT 1 FROM resend_policy_refresh_state WHERE account_id=? AND domain_id=? AND route_id=? AND source_sha256=? AND last_success_at=?) THEN 1 ELSE json('resend_refresh_commit_changed') END AS valid",
      ).bind(
        identity.accountId,
        env.RESEND_DOMAIN_ID!,
        identity.routeId,
        sourceHash,
        observedAt,
      ),
    );
    await env.DB.batch(statements);
    counts.resendPoliciesRefreshed++;
    if (usageError || contradictions.length) counts.resendPolicyRefreshFailed++;
  } catch (error) {
    counts.resendPolicyRefreshFailed++;
    if (lease)
      try {
        const code =
          error instanceof RefreshError ? error.code : "SOURCE_INVALID";
        const observed =
          error instanceof RefreshError && error.contradictions.length
            ? error.contradictions
            : resendQualificationContradicted(code)
              ? [code]
              : [];
        const negative = [
          ...new Set([...resendPolicyContradictions(priorState), ...observed]),
        ];
        await env.DB.prepare(
          "UPDATE resend_policy_refresh_state SET lease_token=NULL,lease_until=NULL,last_error_code=?,blocked_reason=?,blocked_reasons_json=?,failure_count=min(16,failure_count+1),next_attempt_at=? WHERE account_id=? AND lease_token=?",
        )
          .bind(
            code,
            negative[0] ?? null,
            negative.length ? canonicalJson(negative) : null,
            new Date(now() + 3600000).toISOString(),
            identity.accountId,
            lease,
          )
          .run();
      } catch {
        /* Unavailable state never grants permission or retries a send. */
      }
  }
  return counts;
}
