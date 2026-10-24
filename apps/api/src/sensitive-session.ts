import { documentAccessMode, documentAccessPolicySql, documentSessionPolicySql } from "../../../packages/contracts/src/document-authentication";
import type { AuthEnv } from "./auth";
import type { PersonalPrincipal } from "./personal-auth";

type PolicyEnv = Pick<AuthEnv, "SENSITIVE_DOCUMENT_AUTHENTICATION" | "ENVIRONMENT" | "MODE">;
export function sensitiveSessionPolicy(env?: PolicyEnv, alias = "ps") {
  const mode = documentAccessMode(env?.SENSITIVE_DOCUMENT_AUTHENTICATION);
  return `(${documentAccessPolicySql(mode)}) AND (${documentSessionPolicySql(alias, mode, env?.ENVIRONMENT === "local" && env.MODE === "simulation")})`;
}

/** Final database authorization, after any object or renderer await. */
export function personalSessionFence(principal: PersonalPrincipal, maxAge = 900, env?: PolicyEnv) {
  return {
    condition: `EXISTS(SELECT 1 FROM personal_sessions ps WHERE ps.token_hash=? AND ps.user_id=? AND ps.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ${sensitiveSessionPolicy(env)} AND ps.authenticated_at BETWEEN CAST(strftime('%s','now') AS INTEGER)-? AND CAST(strftime('%s','now') AS INTEGER)+5 AND ps.verified_email=?)`,
    values: [principal.tokenHash, principal.userId, maxAge, principal.email],
  };
}
