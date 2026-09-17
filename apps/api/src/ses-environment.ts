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
    fail("SES_MODE_REQUIRED", "Le mode d’envoi e-mail doit être configuré.");
  if (
    !/^\d{12}$/.test(env.SES_ACCOUNT_ID ?? "") ||
    !/^eu-(west|central|north|south)-\d$/.test(env.AWS_REGION ?? "") ||
    !env.SES_SNS_TOPIC_ARN?.startsWith(
      `arn:aws:sns:${env.AWS_REGION}:${env.SES_ACCOUNT_ID}:`,
    )
  )
    fail(
      "SES_IDENTITY_REQUIRED",
      "Le compte e-mail et son suivi doivent être vérifiés.",
    );
  const address = mailbox(recipient);
  if (!address)
    fail(
      "INVALID_EMAIL_RECIPIENT",
      "L’adresse e-mail du destinataire est invalide.",
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
      "Amazon SES est encore en mode test. Cet envoi nécessite un destinataire vérifié ; aucun e-mail n’a été transmis.",
    );
  return true;
}
