import {
  actorPermissions,
  DomainError,
  canonicalJson,
  emailRateComponents,
  sha256,
  type ActorContext,
} from "../../../packages/domain/src/index";
import { resendConfigured, resendIdentity } from "./resend-environment";
import {
  readResendPolicyState,
  resendConsumerContradicted,
  isAutomaticResendPolicy,
} from "./resend-policy-state";
import type { Env } from "./env";

/** A public commercial reference, distinct from the team's current Free quota.
 * Qualification is dated and operator-enabled; no paid plan is provisioned. */
export const RESEND_RATE = {
  attachmentBasis: "included_pdf" as const,
  pricingBasis: "public_list_price_ex_tax" as const,
  plan: "Pro" as const,
  tier: "additional_emails" as const,
  unit: "recipient" as const,
  currency: "USD" as const,
  tariffSource: "https://resend.com/pricing" as const,
  tariffDate: "2026-09-21",
  usdMicrosPerMessage: 900,
  fxBasis: "commercial_fixed_reference" as const,
  fxSource:
    "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml" as const,
  fxDate: "2026-09-16",
  eurPerUsdNumerator: 10000,
  eurPerUsdDenominator: 11537,
};

export async function ensureEmailSender(
  env: Env,
  ctx: ActorContext,
  now = new Date().toISOString(),
  options: { pricing?: boolean; senderId?: string } = {},
): Promise<{ replyTo: string; senderId: string } | undefined> {
  const identity = resendIdentity(env);
  let qualification = Date.parse(env.RESEND_TARIFF_QUALIFIED_UNTIL ?? "");
  let rate = RESEND_RATE;
  let maintainedSourceHash: string | null = null;
  if (
    env.MODE !== "production" ||
    env.EMAIL_PROVIDER !== "resend" ||
    !resendConfigured(env) ||
    env.RESEND_SENDS_ENABLED !== "true" ||
    !identity ||
    !actorPermissions(ctx).prepareDispatches
  )
    return;
  const senderId =
    "snd_email_" + (await sha256(ctx.organizationId)).slice(0, 24);
  const selectedSenderId = options.senderId ?? senderId;
  let manual = false;
  if (options.pricing !== false) {
    try {
      const selected = await env.DB.prepare(
        "SELECT p.* FROM trusted_delivery_costs p JOIN senders s ON s.organization_id=p.organization_id AND s.id=p.sender_id AND s.status='verified' AND s.mode='production' AND s.channel='email' WHERE p.organization_id=? AND p.sender_id=? AND p.channel='email' AND p.provider='resend' AND p.account_id=? AND p.route_id=? AND p.options_json='{}' AND p.status='qualified'",
      )
        .bind(
          ctx.organizationId,
          selectedSenderId,
          identity.accountId,
          identity.routeId,
        )
        .first<Parameters<typeof isAutomaticResendPolicy>[0]>();
      manual = !!selected && !(await isAutomaticResendPolicy(selected));
      const { state } = await readResendPolicyState(env.DB, identity.accountId);
      if (
        state &&
        (state.domain_id !== env.RESEND_DOMAIN_ID ||
          state.route_id !== identity.routeId ||
          resendConsumerContradicted(state, manual ? "universal" : "tariff"))
      )
        throw new DomainError(
          "RESEND_QUALIFICATION_CHANGED",
          "The email provider qualification changed and must be verified.",
          409,
        );
      if (!manual && state?.last_success_at) {
        qualification = Date.parse(state.qualified_until ?? "");
        if (!state.rate_json || !state.source_sha256)
          throw new Error("Invalid qualification");
        rate = JSON.parse(state.rate_json) as typeof RESEND_RATE;
        maintainedSourceHash = state.source_sha256;
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "RESEND_QUALIFICATION_UNAVAILABLE",
        "The email qualification could not be checked.",
        503,
      );
    }
    if (
      !manual &&
      (!Number.isFinite(qualification) || qualification <= Date.parse(now))
    )
      return;
  }
  const member = await env.DB.prepare(
    "SELECT u.email FROM users u JOIN memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=? AND m.role=? AND o.mode='production'",
  )
    .bind(ctx.organizationId, ctx.userId, ctx.role)
    .first<{ email: string }>();
  if (
    !member ||
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(member.email) ||
    /[\r\n]/.test(member.email)
  )
    return;
  if (manual) return { replyTo: member.email, senderId: selectedSenderId };
  const allowed =
    "EXISTS(SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND role=?) AND NOT EXISTS(SELECT 1 FROM audit_log WHERE organization_id=? AND action='channel.control' AND resource_id='email' AND json_extract(details_json,'$.enabled')=0)";
  const scope = [ctx.organizationId, ctx.userId, ctx.role, ctx.organizationId];
  if (options.pricing === false) {
    await env.DB.prepare(
      `INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) SELECT ?,?,'email','Guteneo','documents@guteneo.com','verified','production',? WHERE ${allowed} ON CONFLICT(id) DO NOTHING`,
    )
      .bind(senderId, ctx.organizationId, now, ...scope)
      .run();
    return { replyTo: member.email, senderId };
  }
  const until = new Date(qualification).toISOString();
  const sourceHash =
    maintainedSourceHash ?? (await sha256(canonicalJson(rate)));
  const automaticPolicyId = async (sourceHash: string, until: string) =>
    `resend_${(await sha256(canonicalJson({ organizationId: ctx.organizationId, identity, sourceHash, until }))).slice(0, 32)}`;
  const policyId = await automaticPolicyId(sourceHash, until);
  const components = emailRateComponents(rate);
  const expired = await env.DB.prepare(
    `SELECT id,source_sha256,expires_at FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=? AND channel='email' AND provider='resend' AND account_id=? AND route_id=? AND options_json='{}' AND status='qualified' AND expires_at<=? AND ${allowed}`,
  )
    .bind(
      ctx.organizationId,
      senderId,
      identity.accountId,
      identity.routeId,
      now,
      ...scope,
    )
    .first<{ id: string; source_sha256: string; expires_at: string }>();
  // Recognize the automatic ID from its original evidence, including an older
  // tariff hash. A manual policy in the same route must not be superseded.
  const expiredAutomatic =
    expired &&
    expired.id ===
      (await automaticPolicyId(expired.source_sha256, expired.expires_at));
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) SELECT ?,?,'email','Guteneo','documents@guteneo.com','verified','production',? WHERE ${allowed} ON CONFLICT(id) DO NOTHING`,
    ).bind(senderId, ctx.organizationId, now, ...scope),
    ...(expiredAutomatic
      ? [
          env.DB.prepare(
            `UPDATE trusted_delivery_costs SET status='revoked' WHERE id=? AND organization_id=? AND sender_id=? AND channel='email' AND provider='resend' AND account_id=? AND route_id=? AND options_json='{}' AND status='qualified' AND expires_at<=? AND ${allowed}`,
          ).bind(
            expired.id,
            ctx.organizationId,
            senderId,
            identity.accountId,
            identity.routeId,
            now,
            ...scope,
          ),
        ]
      : []),
    env.DB.prepare(
      `INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at,pricing_basis) SELECT ?,?,?,'email','resend',?,?,'{}',?,?,?,?,'EUR','qualified_final_variable_cost',900,?,?,?,?,'qualified',?,'public_list_price_ex_tax' WHERE ${allowed} AND EXISTS(SELECT 1 FROM senders WHERE organization_id=? AND id=? AND status='verified' AND address='documents@guteneo.com') AND NOT EXISTS(SELECT 1 FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=? AND channel='email' AND provider='resend' AND account_id=? AND route_id=? AND options_json='{}' AND status='qualified') ON CONFLICT(id) DO NOTHING`,
    ).bind(
      policyId,
      ctx.organizationId,
      senderId,
      identity.accountId,
      identity.routeId,
      canonicalJson(rate),
      components.base_numerator,
      components.byte_numerator,
      components.rate_denominator,
      rate.tariffSource,
      sourceHash,
      now,
      until,
      now,
      ...scope,
      ctx.organizationId,
      senderId,
      ctx.organizationId,
      senderId,
      identity.accountId,
      identity.routeId,
    ),
    env.DB.prepare(
      `UPDATE channel_controls SET enabled=1 WHERE organization_id=? AND channel='email' AND ${allowed} AND NOT EXISTS(SELECT 1 FROM prepare_only_users WHERE user_id=?) AND EXISTS(SELECT 1 FROM trusted_delivery_costs p JOIN senders s ON s.organization_id=p.organization_id AND s.id=p.sender_id AND s.status='verified' WHERE p.organization_id=? AND p.sender_id=? AND p.provider='resend' AND p.account_id=? AND p.route_id=? AND p.options_json='{}' AND p.status='qualified' AND p.valid_from<=? AND p.expires_at>?)`,
    ).bind(
      ctx.organizationId,
      ...scope,
      ctx.userId,
      ctx.organizationId,
      senderId,
      identity.accountId,
      identity.routeId,
      now,
      now,
    ),
  ]);
  return { replyTo: member.email, senderId };
}
