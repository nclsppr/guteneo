/** Required authorization policy, distinct from the authentication observed. */
export type DocumentAccessMode = "strong" | "verified_account";

export function documentAccessMode(value?: string): DocumentAccessMode {
  if (value === undefined || value === "strong") return "strong";
  if (value === "verified_account") return "verified_account";
  throw new Error("INVALID_SENSITIVE_DOCUMENT_AUTHENTICATION");
}

/** Operator-managed policy and Worker configuration must agree. */
export function documentAccessPolicySql(mode: DocumentAccessMode): string {
  return `EXISTS(SELECT 1 FROM secure_document_authentication_policy document_policy WHERE document_policy.id=1 AND document_policy.mode='${mode}')`;
}

/** Server-owned SQL only. Identity evidence is never supplied by a recipient. */
export function documentSessionPolicySql(
  alias: string,
  mode: DocumentAccessMode,
  allowDevelopment = false,
): string {
  if (!/^[a-z_]+$/.test(alias)) throw new Error("INVALID_SESSION_ALIAS");
  const p = alias;
  const realIdentity = `${p}.is_development=0 AND EXISTS(SELECT 1 FROM auth_identities document_identity JOIN users document_user ON document_user.id=document_identity.user_id WHERE document_identity.user_id=${p}.user_id AND document_identity.issuer=${p}.identity_issuer AND document_identity.subject=${p}.identity_subject AND document_user.email=${p}.verified_email)`;
  const authentication =
    mode === "strong"
      ? `${p}.strong_authentication=1 AND ${p}.authentication_policy_version='guteneo-sensitive-v1'`
      : `${p}.verified_account=1 AND ((${realIdentity})${allowDevelopment ? ` OR ${p}.is_development=1` : ""})`;
  return `(${authentication}) AND ${p}.verified_email IS NOT NULL AND length(trim(${p}.verified_email))>0${allowDevelopment ? "" : ` AND ${p}.is_development=0`}`;
}

/** Verified accounts use their current session; strong policy retains step-up age. */
export function documentSessionTimeSql(
  alias: string,
  mode: DocumentAccessMode,
  maxAgeSeconds = 900,
): string {
  if (!/^[a-z_]+$/.test(alias)) throw new Error("INVALID_SESSION_ALIAS");
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0)
    throw new Error("INVALID_DOCUMENT_AUTHENTICATION_AGE");
  const current = `CAST(strftime('%s','now') AS INTEGER)`;
  return `${alias}.authenticated_at>0 AND ${alias}.authenticated_at<=${current}+5${mode === "strong" ? ` AND ${alias}.authenticated_at>=${current}-${maxAgeSeconds}` : ""}`;
}
