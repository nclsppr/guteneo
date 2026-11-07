import type { Env } from "./env";

type NotificationEnv = Pick<
  Env,
  | "DB"
  | "ENVIRONMENT"
  | "MODE"
  | "RESEND_API_KEY"
  | "RESEND_SENDS_ENABLED"
  | "RESEND_VERIFIED_DOMAIN"
  | "PROVIDER_PREVENTION_EMAILS_ENABLED"
  | "PROVIDER_PREVENTION_EMAIL_FROM"
  | "PROVIDER_PREVENTION_EMAIL_TO"
  | "PROVIDER_PREVENTION_EMAIL_DAILY_LIMIT"
>;
export interface PreventionNotificationCounts {
  providerPreventionNotificationsSent: number;
  providerPreventionNotificationsFailed: number;
  providerPreventionNotificationsUnknown: number;
}
interface Dependencies {
  fetch?: typeof fetch;
  now?: () => Date;
}
interface Notice {
  organization_id: string;
  notification_sha256: string;
  family: string;
  renewal_mode: string;
  stage: string;
  deadline_at: string;
}
const zero = (): PreventionNotificationCounts => ({
  providerPreventionNotificationsSent: 0,
  providerPreventionNotificationsFailed: 0,
  providerPreventionNotificationsUnknown: 0,
});
const families: Record<string, string> = {
  fax_authority: "Fax operator authorization",
  fax_tariff: "Fax reference",
  delivery_policy: "Delivery policy",
  resend_tariff: "Email reference",
  resend_send_limits: "Email sending limits",
};
const stages: Record<string, string> = {
  operator_7d: "Action needed within seven days",
  operator_3d: "Action needed within three days",
  operator_1d: "Action needed within one day",
  automatic_48h: "Repair technical renewal within two days",
  automatic_24h: "Repair technical renewal within one day",
  expired: "Deadline expired",
};
const mailbox = (value: string | undefined): value is string =>
  typeof value === "string" &&
  value.length <= 320 &&
  !/[\r\n\0]/.test(value) &&
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(
    value,
  );
async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function providerReference(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > 8192) {
        await reader.cancel();
        return null;
      }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const id =
      payload && typeof payload === "object" && "id" in payload
        ? payload.id
        : null;
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id)
      ? id
      : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

/** Operational notices have their own immutable milestone outbox. A committed
 * claim permits one provider attempt only; a crash or ambiguous result never
 * schedules another attempt, even after the provider's idempotency retention. */
export async function processPreventionNotifications(
  env: NotificationEnv,
  dependencies: Dependencies = {},
): Promise<PreventionNotificationCounts> {
  if (
    env.PROVIDER_PREVENTION_EMAILS_ENABLED !== "true" ||
    env.ENVIRONMENT !== "production" ||
    env.MODE !== "production"
  )
    return zero();
  const from = env.PROVIDER_PREVENTION_EMAIL_FROM;
  const to = env.PROVIDER_PREVENTION_EMAIL_TO;
  const limitText = env.PROVIDER_PREVENTION_EMAIL_DAILY_LIMIT ?? "4";
  const limit = Number(limitText);
  const clock = (dependencies.now ?? (() => new Date()))();
  if (
    env.RESEND_SENDS_ENABLED !== "true" ||
    !env.RESEND_API_KEY ||
    !mailbox(from) ||
    !mailbox(to) ||
    !env.RESEND_VERIFIED_DOMAIN ||
    from.split("@")[1].toLowerCase() !==
      env.RESEND_VERIFIED_DOMAIN.toLowerCase() ||
    !/^(?:[1-9]|1[0-9]|20)$/.test(limitText) ||
    !Number.isFinite(clock.getTime())
  )
    return { ...zero(), providerPreventionNotificationsFailed: 1 };
  const now = clock.toISOString();
  const hourAgo = new Date(clock.getTime() - 3_600_000).toISOString();
  const leaseUntil = new Date(clock.getTime() + 120_000).toISOString();
  const day = now.slice(0, 10) + "T00:00:00.000Z";
  const envelope = await sha256(JSON.stringify([from, to, "prevention-v1"]));
  await env.DB.prepare(
    "UPDATE provider_freshness_prevention_notifications SET status='unknown',updated_at=?,finished_at=?,error_code='ATTEMPT_INTERRUPTED' WHERE status='sending' AND lease_until<=?",
  )
    .bind(now, now, now)
    .run();
  // D1 serializes this single claim and both account-wide volume guards. Neither
  // tenant input nor a pending row can select a recipient or provider endpoint.
  const claimed = await env.DB.prepare(
    `UPDATE provider_freshness_prevention_notifications SET status='sending',envelope_sha256=?,claimed_at=?,lease_until=?,updated_at=?
     WHERE (organization_id,notification_sha256)=(
       SELECT n.organization_id,n.notification_sha256 FROM provider_freshness_prevention_notifications n
       JOIN provider_freshness_prevention_tasks t ON t.organization_id=n.organization_id AND t.task_sha256=n.task_sha256
       JOIN provider_freshness_bindings b ON b.organization_id=t.organization_id AND b.family=t.family AND b.binding_sha256=t.binding_sha256
       WHERE n.status='pending' AND t.state='active' AND t.occurrence=n.occurrence AND t.stage=n.stage
       AND b.active=1 AND b.evaluated_at=t.last_evaluated_at
       ORDER BY t.stage_rank DESC,t.deadline_at,n.created_at,n.notification_sha256 LIMIT 1
     ) AND status='pending'
     AND (SELECT COUNT(*) FROM provider_freshness_prevention_notifications WHERE claimed_at>=?)<?
     AND NOT EXISTS(SELECT 1 FROM provider_freshness_prevention_notifications WHERE claimed_at>?)
     RETURNING organization_id,notification_sha256,task_sha256,occurrence,stage`,
  )
    .bind(envelope, now, leaseUntil, now, day, limit, hourAgo)
    .first<{
      organization_id: string;
      notification_sha256: string;
      task_sha256: string;
      occurrence: number;
      stage: string;
    }>();
  let sent = 0;
  if (claimed) {
    const notice = await env.DB.prepare(
      `SELECT n.organization_id,n.notification_sha256,t.family,t.renewal_mode,n.stage,t.deadline_at
       FROM provider_freshness_prevention_notifications n JOIN provider_freshness_prevention_tasks t
       ON t.organization_id=n.organization_id AND t.task_sha256=n.task_sha256
       JOIN provider_freshness_bindings b ON b.organization_id=t.organization_id AND b.family=t.family AND b.binding_sha256=t.binding_sha256
       WHERE n.organization_id=? AND n.notification_sha256=? AND n.status='sending'
       AND n.envelope_sha256=? AND t.state='active' AND t.occurrence=n.occurrence AND t.stage=n.stage
       AND b.active=1 AND b.evaluated_at=t.last_evaluated_at`,
    )
      .bind(claimed.organization_id, claimed.notification_sha256, envelope)
      .first<Notice>();
    let status: "sent" | "failed" | "unknown" = "unknown";
    let reference: string | null = null;
    let errorCode: string | null = "PROVIDER_OUTCOME_UNKNOWN";
    if (!notice || !families[notice.family] || !stages[notice.stage]) {
      status = "failed";
      errorCode = "TASK_CHANGED";
    } else {
      const action =
        notice.renewal_mode === "operator"
          ? "Review and explicitly renew the authorization or retire the affected route. Technical source refresh cannot extend human authority."
          : "Inspect and repair the registered technical renewal. Recheck its genuine sources, lease and active commitments. Do not extend a deadline without qualified evidence.";
      const subject = `guteneo · ${stages[notice.stage]} · ${families[notice.family]}`;
      const text = `${families[notice.family]}\n${stages[notice.stage]}\nDeadline (UTC): ${notice.deadline_at}\n\n${action}\n\nInspect the private operator report with: node scripts/provider-readiness.mjs freshness-prevention\n\nThis operational notice does not authorize a communication, change a price or prove customer delivery.`;
      const escape = (value: string) =>
        value.replace(
          /[&<>"']/g,
          (character) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[character]!,
        );
      const fetcher = dependencies.fetch ?? fetch;
      try {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          // Workerd rejects redirect:error before dispatch. Manual never follows
          // a redirect or forwards the private sending credential elsewhere.
          redirect: "manual",
          signal: AbortSignal.timeout(20_000),
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `guteneo/prevention/${notice.notification_sha256}/${envelope}`,
          },
          body: JSON.stringify({
            from,
            to: [to],
            subject,
            text,
            html: `<p>${escape(families[notice.family])}</p><h1>${escape(stages[notice.stage])}</h1><p>Deadline (UTC): ${escape(notice.deadline_at)}</p><p>${escape(action)}</p><p>Inspect the private provider prevention report.</p>`,
          }),
        });
        if (response.ok) {
          reference = await providerReference(response);
          if (reference) {
            status = "sent";
            errorCode = null;
          }
        } else {
          await response.body?.cancel();
          if (
            response.status >= 400 &&
            response.status < 500 &&
            ![408, 409].includes(response.status)
          ) {
            status = "failed";
            errorCode = "PROVIDER_REFUSED";
          }
        }
      } catch {
        // Do not retain a raw response, exception, mailbox, key or request body.
      }
    }
    const persisted = await env.DB.prepare(
      "UPDATE provider_freshness_prevention_notifications SET status=?,provider_reference=?,error_code=?,updated_at=?,finished_at=? WHERE organization_id=? AND notification_sha256=? AND status='sending' AND envelope_sha256=? AND claimed_at=?",
    )
      .bind(
        status,
        reference,
        errorCode,
        now,
        now,
        claimed.organization_id,
        claimed.notification_sha256,
        envelope,
        now,
      )
      .run();
    sent = status === "sent" && persisted.meta.changes === 1 ? 1 : 0;
  }
  const pendingFailures = await env.DB.prepare(
    `SELECT COALESCE(SUM(n.status='failed'),0) AS failed,COALESCE(SUM(n.status='unknown'),0) AS unknown
     FROM provider_freshness_prevention_notifications n JOIN provider_freshness_prevention_tasks t
     ON t.organization_id=n.organization_id AND t.task_sha256=n.task_sha256
     WHERE t.state='active' AND t.occurrence=n.occurrence AND n.status IN ('failed','unknown')
     AND (n.error_code IS NULL OR n.error_code<>'TASK_CHANGED')`,
  ).first<{ failed: number; unknown: number }>();
  return {
    providerPreventionNotificationsSent: sent,
    providerPreventionNotificationsFailed: pendingFailures?.failed ?? 0,
    providerPreventionNotificationsUnknown: pendingFailures?.unknown ?? 0,
  };
}
