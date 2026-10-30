import { DomainError } from "../../../packages/domain/src/index";
import type { Env } from "./env";

/** Selection is explicit; an invalid value never silently chooses SES. */
export function emailProvider(env: Env): "ses" | "resend" {
  if (env.EMAIL_PROVIDER === undefined || env.EMAIL_PROVIDER === "ses")
    return "ses";
  if (env.EMAIL_PROVIDER === "resend") return "resend";
  throw new DomainError(
    "INVALID_EMAIL_PROVIDER",
    "Invalid email provider.",
    409,
  );
}

/** Operator-qualified account/domain identity. Key rotation leaves this identity
 * unchanged. No credential grants sending permission by itself. */
export function resendIdentity(env: Env) {
  if (
    !/^[a-zA-Z0-9_.:-]{1,100}$/.test(env.RESEND_ACCOUNT_ID ?? "") ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(env.RESEND_DOMAIN_ID ?? "") ||
    env.RESEND_VERIFIED_DOMAIN !== "guteneo.com"
  )
    return undefined;
  return {
    provider: "resend" as const,
    accountId: env.RESEND_ACCOUNT_ID!,
    routeId: `resend:${env.RESEND_DOMAIN_ID}:guteneo.com`,
  };
}

export function resendConfigured(env: Env): boolean {
  return Boolean(
    resendIdentity(env) && env.RESEND_API_KEY && env.RESEND_WEBHOOK_SECRET,
  );
}

export function assertResendSender(env: Env, sender: string): void {
  if (!resendConfigured(env))
    throw new DomainError(
      "RESEND_NOT_CONFIGURED",
      "The Resend account and domain must be qualified.",
      409,
    );
  if (env.RESEND_SENDS_ENABLED !== "true")
    throw new DomainError(
      "RESEND_TRANSPORT_DISABLED",
      "Resend sending is not enabled.",
      409,
    );
  if (!/^[^<>\s@]+@guteneo\.com$/i.test(sender))
    throw new DomainError(
      "RESEND_SENDER_DOMAIN_MISMATCH",
      "The sender must belong to the verified guteneo.com domain.",
      409,
    );
}
