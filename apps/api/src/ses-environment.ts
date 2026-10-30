import { DomainError } from "../../../packages/domain/src/index";
import type { Env } from "./env";

function fail(code: string, message: string): never {
  throw new DomainError(code, message, 409);
}

function mailbox(value: string): string | null {
  if (
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
      value,
    )
  )
    return null;
  // SES verified email identities are case-sensitive. Keep the exact identity
  // qualified by the operator; neither normalization nor wildcards widen it.
  return value;
}

/** SES sandbox still sends real email. This is separate from app simulation. */
export function sesTransportSandbox(env: Env, recipient: string): boolean {
  if (!["true", "false"].includes(env.SES_SANDBOX ?? ""))
    fail("SES_MODE_REQUIRED", "The email sending mode must be configured.");
  if (
    !/^\d{12}$/.test(env.SES_ACCOUNT_ID ?? "") ||
    !/^eu-(west|central|north|south)-\d$/.test(env.AWS_REGION ?? "") ||
    !env.SES_SNS_TOPIC_ARN?.startsWith(
      `arn:aws:sns:${env.AWS_REGION}:${env.SES_ACCOUNT_ID}:`,
    )
  )
    fail(
      "SES_IDENTITY_REQUIRED",
      "The email account and its tracking must be verified.",
    );
  const address = mailbox(recipient);
  if (!address)
    fail(
      "INVALID_EMAIL_RECIPIENT",
      "The recipient's email address is invalid.",
    );
  if (env.SES_SANDBOX === "false") return false;
  const configured = (env.SES_VERIFIED_RECIPIENTS ?? "")
    .split(",")
    .map((value) => value.trim());
  if (
    configured.length > 100 ||
    configured.some((value) => !mailbox(value)) ||
    !configured.some((value) => mailbox(value) === address)
  )
    fail(
      "SES_RECIPIENT_NOT_QUALIFIED",
      "Amazon SES is still in test mode. This dispatch requires a verified recipient; no email was transmitted.",
    );
  return true;
}
