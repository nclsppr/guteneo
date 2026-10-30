export const BELVEDERE_ORIGIN = "https://belvedere.guteneo.com";
export const BELVEDERE_WATCHER_EMAIL = "nicolas@pieper.fr";

interface BelvederePolicyEnvironment {
  DB: D1Database;
  ENVIRONMENT: string;
  MODE: string;
  AUTH0_DOMAIN?: string;
  AUTH0_AUTH_POLICY?: string;
  BELVEDERE_SECRET_SLUG?: string;
  BELVEDERE_AUTH0_SUBJECT?: string;
}

export function belvedereConfigured(env: BelvederePolicyEnvironment): boolean {
  return (
    env.ENVIRONMENT === "production" &&
    env.MODE === "production" &&
    /^[A-Za-z0-9_-]{32,128}$/.test(env.BELVEDERE_SECRET_SLUG ?? "")
  );
}

/** The switcher receives only a hint; every platform read repeats this guard. */
export async function canAccessBelvedereSession(
  env: BelvederePolicyEnvironment,
  tokenHash: string,
  userId: string,
): Promise<boolean> {
  if (!belvedereConfigured(env) || !env.AUTH0_DOMAIN) return false;
  const policy = env.AUTH0_AUTH_POLICY ?? "verified_email_and_mfa";
  if (!["verified_email", "verified_email_and_mfa"].includes(policy))
    return false;
  const issuer = `https://${env.AUTH0_DOMAIN.replace(/^https:\/\//, "").replace(/\/$/, "")}/`;
  const row = await env.DB.prepare(
    `SELECT b.mfa,b.verified_account,e.issuer,e.subject,e.verified_email verifiedEmail
     FROM browser_sessions b
     JOIN memberships m ON m.organization_id=b.organization_id AND m.user_id=b.user_id
     JOIN browser_identity_evidence e ON e.token_hash=b.token_hash
     JOIN auth_identities i ON i.issuer=e.issuer AND i.subject=e.subject AND i.user_id=b.user_id
     WHERE b.token_hash=? AND b.user_id=? AND b.is_development=0 AND b.expires_at>?`,
  )
    .bind(tokenHash, userId, new Date().toISOString())
    .first<{
      mfa: number;
      verified_account: number;
      issuer: string;
      subject: string;
      verifiedEmail: string;
    }>();
  return Boolean(
    row &&
    (policy === "verified_email"
      ? row.verified_account === 1
      : row.mfa === 1) &&
    row.issuer === issuer &&
    row.verifiedEmail === BELVEDERE_WATCHER_EMAIL &&
    (!env.BELVEDERE_AUTH0_SUBJECT ||
      row.subject === env.BELVEDERE_AUTH0_SUBJECT),
  );
}

/** A server-selected origin only; never infer this from forwarding headers. */
export function isBelvedereBrowserOrigin(
  request: Request,
  env: { APP_ORIGIN: string },
): boolean {
  return (
    env.APP_ORIGIN === BELVEDERE_ORIGIN &&
    new URL(request.url).origin === BELVEDERE_ORIGIN
  );
}
