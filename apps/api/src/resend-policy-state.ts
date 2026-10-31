import { canonicalJson, sha256 } from "../../../packages/domain/src/index";

export type ResendPolicyState = {
  account_id: string;
  domain_id: string;
  route_id: string;
  qualified_until: string | null;
  rate_json: string | null;
  source_sha256: string | null;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error_code: string | null;
  blocked_reason: string | null;
  blocked_reasons_json?: string | null;
  next_attempt_at: string;
  lease_token: string | null;
  lease_until: string | null;
  failure_count: number;
};
export const RESEND_CONTRADICTED_CODES = [
  "DOMAIN_CHANGED",
  "PRICE_CHANGED",
  "CAPACITY_CHANGED",
  "BINDING_CHANGED",
] as const;
export function resendQualificationContradicted(
  code: string | null | undefined,
) {
  return RESEND_CONTRADICTED_CODES.some((known) => known === code);
}
export function resendPolicyContradictions(
  state:
    | Pick<ResendPolicyState, "blocked_reason" | "blocked_reasons_json">
    | null
    | undefined,
) {
  const values: string[] = [];
  if (
    state?.blocked_reason &&
    resendQualificationContradicted(state.blocked_reason)
  )
    values.push(state.blocked_reason);
  if (state?.blocked_reasons_json) {
    const parsed: unknown = JSON.parse(state.blocked_reasons_json);
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (value) =>
          typeof value !== "string" || !resendQualificationContradicted(value),
      )
    )
      throw new Error("RESEND_POLICY_STATE_INVALID");
    values.push(...parsed);
  }
  return [...new Set(values)];
}
export function resendConsumerContradicted(
  state:
    | Pick<ResendPolicyState, "blocked_reason" | "blocked_reasons_json">
    | null
    | undefined,
  consumer: "tariff" | "limits" | "universal" | "automatic_price",
) {
  const relevant =
    consumer === "tariff"
      ? ["DOMAIN_CHANGED", "BINDING_CHANGED", "PRICE_CHANGED"]
      : consumer === "limits"
        ? ["DOMAIN_CHANGED", "BINDING_CHANGED", "CAPACITY_CHANGED"]
        : consumer === "universal"
          ? ["DOMAIN_CHANGED", "BINDING_CHANGED"]
          : ["PRICE_CHANGED"];
  return resendPolicyContradictions(state).some((code) =>
    relevant.includes(code),
  );
}
export async function isAutomaticResendPolicy(policy: {
  id: string;
  organization_id: string;
  account_id: string;
  route_id: string;
  source_sha256: string;
  expires_at: string;
}) {
  const identity = {
    provider: "resend",
    accountId: policy.account_id,
    routeId: policy.route_id,
  };
  return (
    policy.id ===
    "resend_" +
      (
        await sha256(
          canonicalJson({
            organizationId: policy.organization_id,
            identity,
            sourceHash: policy.source_sha256,
            until: policy.expires_at,
          }),
        )
      ).slice(0, 32)
  );
}
export async function readResendPolicyState(db: D1Database, accountId: string) {
  try {
    return {
      schemaAvailable: true,
      state: await db
        .prepare("SELECT * FROM resend_policy_refresh_state WHERE account_id=?")
        .bind(accountId)
        .first<ResendPolicyState>(),
    };
  } catch (error) {
    if (/no such table:\s*resend_policy_refresh_state\b/i.test(String(error)))
      return { schemaAvailable: false, state: null };
    throw error;
  }
}
