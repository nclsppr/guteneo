import type { ProviderResult } from "../../../packages/providers";

type Scope = {
  accountId: string;
  organizationId: string;
  dispatchId: string;
  attemptId: string;
};
const denied = (errorCode: string): ProviderResult => ({
  status: "rejected",
  errorCode,
  retryable: false,
});
const unknown = (): ProviderResult => ({
  status: "submission_unknown",
  errorCode: "RESEND_RESPONSE_UNKNOWN",
  retryable: false,
});

/** Separate, qualified Resend account limits. No implicit free-plan quota, no
 * sharing SES reservations, and no automatic retry after unknown acceptance. */
export async function submitResendWithLimits(
  db: D1Database,
  scope: Scope,
  send: () => Promise<ProviderResult>,
  { now = Date.now }: { now?: () => number } = {},
): Promise<ProviderResult> {
  const started = now();
  if (
    Object.values(scope).some((v) => !/^[A-Za-z0-9_.:-]{1,200}$/.test(v)) ||
    !Number.isSafeInteger(started)
  )
    return denied("RESEND_LIMITS_NOT_CONFIGURED");
  try {
    const reserved = await db
      .prepare(
        `
      WITH input(account,organization,dispatch,attempt,now) AS (VALUES(?,?,?,?,?))
      INSERT INTO resend_send_reservations(attempt_id,organization_id,dispatch_id,account_id,status,reserved_at_ms,completed_at_ms)
      SELECT i.attempt,i.organization,i.dispatch,i.account,'reserved',i.now,NULL FROM input i
      JOIN resend_send_limit_policies p ON p.account_id=i.account AND p.status='qualified' AND p.qualified_at_ms<=i.now AND p.expires_at_ms>i.now
      WHERE EXISTS(SELECT 1 FROM attempts a JOIN dispatches d ON d.organization_id=a.organization_id AND d.id=a.dispatch_id
        WHERE a.id=i.attempt AND a.organization_id=i.organization AND a.dispatch_id=i.dispatch AND a.provider='resend' AND a.status='started' AND a.bridge_claimed_at IS NOT NULL
          AND d.active_attempt_id=a.id AND d.provider='resend' AND d.status='submitting' AND d.mode='production' AND d.channel='email')
      AND NOT EXISTS(SELECT 1 FROM resend_send_reservations r WHERE r.account_id=i.account AND (r.status='reserved' OR r.completed_at_ms>i.now-p.min_interval_ms))
      AND (SELECT COUNT(*) FROM resend_send_reservations r WHERE r.account_id=i.account AND (r.status IN ('reserved','unknown') OR (r.status='accepted' AND r.completed_at_ms>i.now-86400000)))<p.max_recipients_24h
      AND (SELECT COUNT(*) FROM resend_send_reservations r WHERE r.account_id=i.account AND (r.status IN ('reserved','unknown') OR (r.status='accepted' AND strftime('%Y-%m',r.completed_at_ms/1000,'unixepoch')=strftime('%Y-%m',i.now/1000,'unixepoch'))))<p.max_recipients_month
      ON CONFLICT(attempt_id) DO NOTHING`,
      )
      .bind(
        scope.accountId,
        scope.organizationId,
        scope.dispatchId,
        scope.attemptId,
        started,
      )
      .run();
    if (reserved.meta.changes !== 1) {
      const prior = await db
        .prepare(
          "SELECT 1 FROM resend_send_reservations WHERE attempt_id=? AND organization_id=? AND dispatch_id=?",
        )
        .bind(scope.attemptId, scope.organizationId, scope.dispatchId)
        .first();
      return prior ? unknown() : denied("RESEND_ACCOUNT_LIMIT_OR_POLICY");
    }
  } catch {
    return denied("RESEND_LIMITS_UNAVAILABLE");
  }
  let result: ProviderResult;
  try {
    result = await send();
  } catch {
    result = unknown();
  }
  if (result.status === "accepted" && !result.providerId) result = unknown();
  try {
    await db
      .prepare(
        "UPDATE resend_send_reservations SET status=?,completed_at_ms=? WHERE attempt_id=? AND organization_id=? AND dispatch_id=? AND account_id=? AND status IN ('reserved','unknown')",
      )
      .bind(
        result.status === "submission_unknown" ? "unknown" : result.status,
        Math.max(started, now()),
        scope.attemptId,
        scope.organizationId,
        scope.dispatchId,
        scope.accountId,
      )
      .run();
  } catch {
    /* Retain the reservation; never retry a physical send. */
  }
  return result;
}
