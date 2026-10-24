import type { PersonalPrincipal } from "./personal-auth";

/** Final database authorization, after any object or renderer await. */
export function personalSessionFence(principal:PersonalPrincipal,maxAge=900) {
  return {
    condition:"EXISTS(SELECT 1 FROM personal_sessions ps WHERE ps.token_hash=? AND ps.user_id=? AND ps.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ps.strong_authentication=1 AND ps.authentication_policy_version='guteneo-sensitive-v1' AND ps.authenticated_at>=CAST(strftime('%s','now') AS INTEGER)-? AND ps.verified_email=?)",
    values:[principal.tokenHash,principal.userId,maxAge,principal.email],
  };
}
