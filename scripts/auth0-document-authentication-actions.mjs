/** Review-only sources. This module performs no I/O and deploys nothing.
 * Qualified pre-enrollment and tenant entitlement are separate operator gates.
 * https://auth0.com/docs/secure/multi-factor-authentication/customize-mfa/customize-mfa-selection-universal-login
 * https://auth0.com/docs/actions/reference/post-login/post-login-api-object
 * https://support.auth0.com/center/s/article/Configure-number-of-days-to-remember-a-device
 */
export function documentAuthenticationActionSources({
  browserClientId,
  connectionId,
  factor = "webauthn-platform",
  roamingUserVerification = null,
} = {}) {
  if (
    ![browserClientId, connectionId].every(
      (value) =>
        typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value),
    )
  )
    throw new Error("EXACT_BROWSER_AND_CONNECTION_REQUIRED");
  if (!["webauthn-platform", "webauthn-roaming"].includes(factor))
    throw new Error("UNSUPPORTED_DOCUMENT_FACTOR");
  if (factor === "webauthn-roaming" && roamingUserVerification !== "required")
    throw new Error("ROAMING_UV_REQUIRED_POLICY_NOT_VERIFIED");
  const config = {
    browserClientId,
    connectionId,
    factor,
    callback: "https://guteneo.com/auth/callback",
    policy: "guteneo-sensitive-v1",
    marker: "guteneo_document_challenge_v1",
    claim: "https://guteneo.com/document_authentication",
    maxAgeMs: 300_000,
  };
  const common = `// Proposed source: not deployed or live-qualified.
// Scope must match the actual Guteneo Browser client and database connection.
// Date.now below measures freshness only; it never supplies the MFA evidence.
const CONFIG = Object.freeze(${JSON.stringify(config)});
function isBrowser(event) {
  return event.client?.client_id === CONFIG.browserClientId;
}
function eligible(event) {
  return event.connection?.id === CONFIG.connectionId &&
    event.connection?.strategy === "auth0" &&
    event.user?.email_verified === true &&
    event.transaction?.protocol === "oidc-basic-profile" &&
    event.transaction?.redirect_uri === CONFIG.callback &&
    Array.isArray(event.transaction?.response_type) &&
    event.transaction.response_type.length === 1 &&
    event.transaction.response_type[0] === "code" &&
    Array.isArray(event.transaction?.requested_scopes) &&
    event.transaction.requested_scopes.includes("openid");
}
`;
  return [
    {
      name: "Guteneo - document WebAuthn challenge (candidate)",
      runtime: "node22",
      code: `${common}
exports.onExecutePostLogin = async (event, api) => {
  if (!isBrowser(event)) return;
  if (!eligible(event) ||
      typeof api.transaction?.setMetadata !== "function" ||
      typeof api.authentication?.challengeWith !== "function") {
    api.access.deny("Document authentication is unavailable.");
    return;
  }
  // Transaction metadata is written by this Action, never taken from query,
  // app/user metadata, client email suffixes or an assistant assertion.
  api.transaction.setMetadata(CONFIG.marker, {
    policy: CONFIG.policy,
    factor: CONFIG.factor,
    requested_at: Date.now()
  });
  // Pre-enrollment is required. Enrollment alone never issues the strong claim.
  // No OTP, recovery-code or additional-factor fallback is requested.
  api.authentication.challengeWith({ type: CONFIG.factor });
};
`,
    },
    {
      name: "Guteneo - document WebAuthn evidence (candidate)",
      runtime: "node22",
      code: `${common}
exports.onExecutePostLogin = async (event, api) => {
  if (!isBrowser(event)) return;
  const deny = () => api.access.deny("Document authentication is unavailable.");
  if (!eligible(event)) return deny();
  const marker = event.transaction?.metadata?.[CONFIG.marker];
  const now = Date.now();
  if (!marker || marker.policy !== CONFIG.policy ||
      marker.factor !== CONFIG.factor ||
      !Number.isSafeInteger(marker.requested_at) ||
      marker.requested_at <= 0 || marker.requested_at > now ||
      now - marker.requested_at > CONFIG.maxAgeMs) return deny();
  // Auth0 updates authentication.methods at the beginning of this NEXT Action.
  // A factor registration, amr=mfa, passkey name or prior SSO method is not proof.
  const methods = event.authentication?.methods;
  if (!Array.isArray(methods)) return deny();
  const completed = methods.filter((entry) =>
    entry?.name === "mfa" && entry.type === CONFIG.factor &&
    typeof entry.timestamp === "string"
  ).map((entry) => Date.parse(entry.timestamp)).filter((time) =>
    Number.isSafeInteger(time) && time >= marker.requested_at &&
    time <= now && now - time <= CONFIG.maxAgeMs
  );
  if (completed.length === 0) return deny();
  const authenticatedAt = Math.floor(Math.max(...completed) / 1000);
  // The Worker must independently validate the SIGNED ID token's auth_time and
  // iat: auth_time <= authenticatedAt <= iat, and conservative primary freshness.
  // No reserved claim is overwritten and no Enterprise session field is needed.
  api.idToken.setCustomClaim(CONFIG.claim, {
    policy: CONFIG.policy,
    method: "webauthn_uv",
    factor: CONFIG.factor,
    authenticated_at: authenticatedAt
  });
};
`,
    },
  ];
}
