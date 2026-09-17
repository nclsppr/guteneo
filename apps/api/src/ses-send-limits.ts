import type { ProviderResult } from "../../../packages/providers";

const DAY_MS = 86_400_000;
const DEFAULT_DAILY_LIMIT = 200;
const DEFAULT_INTERVAL_MS = 1_000;

export type SesSendLimitScope = {
  /** Stable AWS account ID, previously qualified against the sending principal.
   * A credential/access-key rotation must never create a fresh quota bucket. */
  accountId: string;
  region: string;
  sandbox: boolean;
  organizationId: string;
  dispatchId: string;
  attemptId: string;
};
type Reservation = { status: "reserved" | "accepted" | "unknown" | "rejected" };

function denied(errorCode: string): ProviderResult {
  return { status: "rejected", errorCode, retryable: false };
}
function unknown(errorCode: string): ProviderResult {
  return { status: "submission_unknown", errorCode, retryable: false };
}

/** Exactly one recipient per persisted attempt. This is a transport ceiling,
 * never a replacement for tenant approval, money reservation or AWS checks.
 * Call only after the durable bridge claim; callbacks must perform one SES call
 * without retries. No timer, sleeping Worker or queue auto-resubmission. */
export async function submitSesWithLimits(
  db: D1Database,
  scope: SesSendLimitScope,
  send: () => Promise<ProviderResult>,
  { now = Date.now }: { now?: () => number } = {},
): Promise<ProviderResult> {
  const started = now();
  if (
    !/^\d{12}$/.test(scope.accountId) ||
    !/^eu-(west|central|north|south)-\d$/.test(scope.region) ||
    typeof scope.sandbox !== "boolean" ||
    [scope.organizationId, scope.dispatchId, scope.attemptId].some(
      (id) => !/^[A-Za-z0-9_.:-]{1,200}$/.test(id),
    ) ||
    !Number.isSafeInteger(started) ||
    started < 0
  )
    return denied("SES_LIMITS_NOT_CONFIGURED");

  // One write evaluates the qualified policy, active tenant attempt, daily
  // window and in-flight/cooldown guards atomically at the D1 primary.
  // A pending/unknown send never ages out without a known provider outcome.
  const values = [
    scope.accountId,
    scope.region,
    scope.organizationId,
    scope.dispatchId,
    scope.attemptId,
    started,
    scope.sandbox ? 1 : 0,
  ];
  let acquired: boolean;
  try {
    const results = await db.batch([
      db
        .prepare(
          `WITH input(account,region,organization,dispatch,attempt,now,sandbox) AS (VALUES(?,?,?,?,?,?,?)),
        limits AS (SELECT input.*,
          CASE WHEN sandbox=1 THEN MIN(COALESCE(p.max_recipients_24h,${DEFAULT_DAILY_LIMIT}),${DEFAULT_DAILY_LIMIT}) ELSE COALESCE(p.max_recipients_24h,${DEFAULT_DAILY_LIMIT}) END AS daily_limit,
          CASE WHEN sandbox=1 THEN MAX(COALESCE(p.min_interval_ms,${DEFAULT_INTERVAL_MS}),${DEFAULT_INTERVAL_MS}) ELSE COALESCE(p.min_interval_ms,${DEFAULT_INTERVAL_MS}) END AS interval_ms
          FROM input LEFT JOIN ses_send_limit_policies p ON p.account_id=input.account AND p.region=input.region AND p.status='qualified' AND p.qualified_at_ms<=input.now AND p.expires_at_ms>input.now)
        INSERT INTO ses_send_reservations(attempt_id,organization_id,dispatch_id,account_id,region,status,reserved_at_ms,completed_at_ms,max_recipients_24h,min_interval_ms)
        SELECT attempt,organization,dispatch,account,region,'reserved',now,NULL,daily_limit,interval_ms FROM limits
        WHERE EXISTS(SELECT 1 FROM attempts a JOIN dispatches d ON d.organization_id=a.organization_id AND d.id=a.dispatch_id
          WHERE a.id=limits.attempt AND a.organization_id=limits.organization AND a.dispatch_id=limits.dispatch AND a.provider='ses' AND a.status='started' AND a.bridge_claimed_at IS NOT NULL
            AND d.active_attempt_id=a.id AND d.status='submitting' AND d.mode='production' AND d.channel='email' AND d.provider='ses')
        AND NOT EXISTS(SELECT 1 FROM ses_send_reservations r WHERE r.attempt_id=limits.attempt)
        AND NOT EXISTS(SELECT 1 FROM ses_send_reservations r WHERE r.account_id=limits.account AND r.region=limits.region AND (r.status='reserved' OR r.completed_at_ms>limits.now-limits.interval_ms))
        AND (SELECT COUNT(*) FROM ses_send_reservations r WHERE r.account_id=limits.account AND r.region=limits.region AND (r.status IN ('reserved','unknown') OR (r.status='accepted' AND r.completed_at_ms>limits.now-${DAY_MS})))<daily_limit
        ON CONFLICT(attempt_id) DO NOTHING`,
        )
        .bind(...values),
      db
        .prepare(
          "SELECT status FROM ses_send_reservations WHERE attempt_id=? AND organization_id=? AND dispatch_id=?",
        )
        .bind(scope.attemptId, scope.organizationId, scope.dispatchId),
    ]);
    acquired = results[0].meta.changes === 1;
    if (!acquired && results[1].results.length)
      return unknown("SES_ATTEMPT_ALREADY_RESERVED");
    if (!acquired) {
      const active = await db
        .prepare(
          `SELECT 1 FROM attempts a JOIN dispatches d ON d.organization_id=a.organization_id AND d.id=a.dispatch_id
        WHERE a.id=? AND a.organization_id=? AND a.dispatch_id=? AND a.status='started' AND a.provider='ses' AND a.bridge_claimed_at IS NOT NULL
          AND d.active_attempt_id=a.id AND d.status='submitting' AND d.mode='production' AND d.channel='email' AND d.provider='ses'`,
        )
        .bind(scope.attemptId, scope.organizationId, scope.dispatchId)
        .first();
      if (!active) return denied("SES_ACTIVE_ATTEMPT_REQUIRED");
      // This diagnostic read never grants a send; the atomic write above owns
      // permission. Prefer a broad temporary-limit message if state moved.
      const usage = await db
        .prepare(
          `SELECT COUNT(*) AS used FROM ses_send_reservations WHERE account_id=? AND region=? AND
        (status IN ('reserved','unknown') OR (status='accepted' AND completed_at_ms>?))`,
        )
        .bind(scope.accountId, scope.region, started - DAY_MS)
        .first<{ used: number }>();
      const policy = await db
        .prepare(
          "SELECT max_recipients_24h FROM ses_send_limit_policies WHERE account_id=? AND region=? AND status='qualified' AND qualified_at_ms<=? AND expires_at_ms>?",
        )
        .bind(scope.accountId, scope.region, started, started)
        .first<{ max_recipients_24h: number }>();
      const daily = scope.sandbox
        ? Math.min(
            policy?.max_recipients_24h ?? DEFAULT_DAILY_LIMIT,
            DEFAULT_DAILY_LIMIT,
          )
        : (policy?.max_recipients_24h ?? DEFAULT_DAILY_LIMIT);
      return denied(
        (usage?.used ?? 0) >= daily
          ? "SES_ACCOUNT_DAILY_LIMIT"
          : "SES_ACCOUNT_RATE_LIMIT",
      );
    }
  } catch {
    // An ambiguous D1 reservation result is never permission to contact SES.
    return denied("SES_LIMITS_UNAVAILABLE");
  }

  let result: ProviderResult;
  try {
    result = await send();
  } catch {
    result = unknown("SES_RESPONSE_UNKNOWN");
  }
  if (result.status === "accepted" && !result.providerId)
    result = unknown("SES_RESPONSE_UNKNOWN");
  const completed = Math.max(started, now());
  const outcome: Reservation["status"] =
    result.status === "submission_unknown" ? "unknown" : result.status;
  try {
    await db
      .prepare(
        `UPDATE ses_send_reservations SET status=?,completed_at_ms=?
      WHERE attempt_id=? AND organization_id=? AND dispatch_id=? AND account_id=? AND region=? AND status IN ('reserved','unknown')`,
      )
      .bind(
        outcome,
        completed,
        scope.attemptId,
        scope.organizationId,
        scope.dispatchId,
        scope.accountId,
        scope.region,
      )
      .run();
  } catch {
    // Never infer a failed send from an accounting write failure. The domain's
    // attempt outcome trigger also records the result, including known rejects.
    // Retaining an extra quota reservation is safe; retrying the send is not.
  }
  return result;
}
