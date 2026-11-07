import type { Env } from "./env";
import emailCopy from "./locales/provider-prevention-emails.json";

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
  | "PROVIDER_PREVENTION_EMAIL_LOCALE"
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
type EmailLocale = keyof typeof emailCopy;
type Mechanism = keyof (typeof emailCopy)["en"]["mechanisms"];
const stages = new Set([
  "operator_7d",
  "operator_3d",
  "operator_1d",
  "automatic_48h",
  "automatic_24h",
  "expired",
]);
function renderNotice(notice: Notice, locale: EmailLocale) {
  const copy = emailCopy[locale];
  const mechanism = copy.mechanisms[notice.family as Mechanism];
  const deadline = new Date(notice.deadline_at);
  const day = new Intl.DateTimeFormat(copy.dateLocale, {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(deadline);
  const dateTime = new Intl.DateTimeFormat(copy.dateLocale, {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(deadline);
  const subjectTemplate =
    notice.stage === "expired"
      ? mechanism.expiredSubject
      : notice.renewal_mode === "automatic" && "automaticSubject" in mechanism
        ? mechanism.automaticSubject
        : mechanism.upcomingSubject;
  const subject = `guteneo · ${subjectTemplate.replace("{date}", day)}`;
  const what = (
    notice.stage === "expired" ? mechanism.expiredWhat : mechanism.upcomingWhat
  ).replace("{deadline}", `${dateTime} (${copy.parisTime})`);
  const action =
    notice.renewal_mode === "operator"
      ? mechanism.operatorAction
      : mechanism.automaticAction;
  const sections = [
    [copy.whatLabel, what],
    [copy.impactLabel, mechanism.impact],
    [copy.actionLabel, action],
  ];
  const text = `${mechanism.title}\n\n${sections.map(([label, value]) => `${label}\n${value}`).join("\n\n")}\n\n${copy.footer}`;
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
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#ffffff;color:#181b22;font-family:Arial,sans-serif"><main style="max-width:600px;margin:auto;padding:32px 24px"><p style="font-size:20px;color:#181b22">guteneo</p><h1 style="font-size:26px;line-height:1.3">${escape(mechanism.title)}</h1>${sections.map(([label, value]) => `<section style="margin-top:24px"><h2 style="font-size:16px;margin-bottom:8px">${escape(label)}</h2><p style="font-size:16px;line-height:1.6;margin-top:0">${escape(value)}</p></section>`).join("")}<p style="margin-top:32px;font-size:13px;line-height:1.5;color:#535a50">${escape(copy.footer)}</p></main></body></html>`;
  return { subject, text, html };
}
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
  const locale = env.PROVIDER_PREVENTION_EMAIL_LOCALE ?? "en";
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
    (locale !== "en" && locale !== "fr") ||
    !Number.isFinite(clock.getTime())
  )
    return { ...zero(), providerPreventionNotificationsFailed: 1 };
  const now = clock.toISOString();
  const hourAgo = new Date(clock.getTime() - 3_600_000).toISOString();
  const leaseUntil = new Date(clock.getTime() + 120_000).toISOString();
  const day = now.slice(0, 10) + "T00:00:00.000Z";
  const envelope = await sha256(
    JSON.stringify([from, to, "prevention-v2", locale]),
  );
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
    if (
      !notice ||
      !Object.hasOwn(emailCopy.en.mechanisms, notice.family) ||
      !stages.has(notice.stage)
    ) {
      status = "failed";
      errorCode = "TASK_CHANGED";
    } else {
      const rendered = renderNotice(notice, locale);
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
            ...rendered,
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
