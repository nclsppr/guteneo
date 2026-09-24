import {
  canonicalJson,
  emailRateComponents,
  sha256,
  type ActorContext,
} from "../../../packages/domain/src/index";
import { resendConfigured, resendIdentity } from "./resend-environment";
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
): Promise<{ replyTo: string; senderId: string } | undefined> {
  const identity = resendIdentity(env);
  const qualification = Date.parse(env.RESEND_TARIFF_QUALIFIED_UNTIL ?? "");
  if (
    env.MODE !== "production" ||
    env.EMAIL_PROVIDER !== "resend" ||
    !resendConfigured(env) ||
    env.RESEND_SENDS_ENABLED !== "true" ||
    !identity ||
    !Number.isFinite(qualification) ||
    qualification <= Date.parse(now) ||
    ctx.role === "viewer"
  )
    return;
  const until = new Date(qualification).toISOString();
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
  const sourceHash = await sha256(canonicalJson(RESEND_RATE));
  const senderId = `snd_email_${(await sha256(ctx.organizationId)).slice(0, 24)}`;
  const policyId = `resend_${(await sha256(canonicalJson({ organizationId: ctx.organizationId, identity, sourceHash, until }))).slice(0, 32)}`;
  const components = emailRateComponents(RESEND_RATE);
  const allowed =
    "EXISTS(SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND role=?) AND NOT EXISTS(SELECT 1 FROM audit_log WHERE organization_id=? AND action='channel.control' AND resource_id='email' AND json_extract(details_json,'$.enabled')=0)";
  const scope = [ctx.organizationId, ctx.userId, ctx.role, ctx.organizationId];
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) SELECT ?,?,'email','Guteneo','documents@guteneo.com','verified','production',? WHERE ${allowed} ON CONFLICT(id) DO NOTHING`,
    ).bind(senderId, ctx.organizationId, now, ...scope),
    env.DB.prepare(
      `UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=? AND sender_id=? AND channel='email' AND provider='resend' AND status='qualified' AND source_sha256=? AND expires_at<=? AND ${allowed}`,
    ).bind(ctx.organizationId, senderId, sourceHash, now, ...scope),
    env.DB.prepare(
      `INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at,pricing_basis) SELECT ?,?,?,'email','resend',?,?,'{}',?,?,?,?,'EUR','qualified_final_variable_cost',900,?,?,?,?,'qualified',?,'public_list_price_ex_tax' WHERE ${allowed} AND EXISTS(SELECT 1 FROM senders WHERE organization_id=? AND id=? AND status='verified' AND address='documents@guteneo.com') AND NOT EXISTS(SELECT 1 FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=? AND channel='email' AND provider='resend' AND account_id=? AND route_id=? AND options_json='{}' AND status='qualified') ON CONFLICT(id) DO NOTHING`,
    ).bind(
      policyId,
      ctx.organizationId,
      senderId,
      identity.accountId,
      identity.routeId,
      canonicalJson(RESEND_RATE),
      components.base_numerator,
      components.byte_numerator,
      components.rate_denominator,
      RESEND_RATE.tariffSource,
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
