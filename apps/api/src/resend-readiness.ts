import { boundedText, request } from "../../../packages/providers/transport";
import type { Fetcher } from "../../../packages/providers/types";
import type { Env } from "./env";
import { resendIdentity } from "./resend-environment";

/** Private read-only probe. Sending-only keys commonly cannot read domains; a
 * 403 is reported honestly and never triggers broader permissions or a send. */
export async function inspectResendReadiness(
  env: Env,
  fetcher: Fetcher = fetch,
) {
  const identity = resendIdentity(env);
  if (!identity || !env.RESEND_API_KEY)
    return {
      ok: false,
      code: "RESEND_INSPECTION_NOT_CONFIGURED",
      emailsSent: 0,
    };
  try {
    const response = await request(
      fetcher,
      `https://api.resend.com/domains/${encodeURIComponent(env.RESEND_DOMAIN_ID!)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      },
    );
    if (response.status === 403)
      return {
        ok: false,
        code: "RESEND_DOMAIN_READ_NOT_PERMITTED",
        emailsSent: 0,
      };
    if (!response.ok)
      return { ok: false, code: "RESEND_DOMAIN_CHECK_FAILED", emailsSent: 0 };
    const domain = JSON.parse(await boundedText(response, 32_768)) as Record<
      string,
      unknown
    >;
    if (
      domain.id !== env.RESEND_DOMAIN_ID ||
      domain.name !== "guteneo.com" ||
      domain.status !== "verified"
    )
      return { ok: false, code: "RESEND_DOMAIN_NOT_VERIFIED", emailsSent: 0 };
    return {
      ok: true,
      domain: "guteneo.com",
      domainId: env.RESEND_DOMAIN_ID,
      domainVerified: true,
      accountBindingVerified: false,
      webhookConfigured: Boolean(env.RESEND_WEBHOOK_SECRET),
      transportQualified: false,
      emailsSent: 0,
    };
  } catch {
    return { ok: false, code: "RESEND_DOMAIN_CHECK_FAILED", emailsSent: 0 };
  }
}
