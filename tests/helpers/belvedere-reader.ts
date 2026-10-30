import { hashSecret } from "../../apps/api/src/auth";
import { handleBelvedereRoute } from "../../apps/api/src/belvedere";
import type { Env } from "../../apps/api/src/env";
/** Test-only browser evidence. Business data still traverses real domain/SQL guards. */
export async function readBelvedereFixture<T>(
  db: D1Database,
  userId: string,
  organizationId: string,
  path: string,
): Promise<T> {
  const now = new Date().toISOString();
  const token = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64url");
  const hash = await hashSecret(token);
  const subject = `belvedere-test|${userId}`;
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://belvedere-test.invalid/',?,?,?)",
      )
      .bind(subject, userId, now),
    db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'fixture',1,0,?,?,1)",
      )
      .bind(
        hash,
        userId,
        organizationId,
        now,
        new Date(Date.now() + 60000).toISOString(),
      ),
    db
      .prepare(
        "INSERT INTO browser_identity_evidence(token_hash,issuer,subject,verified_email,authenticated_at) VALUES(?,'https://belvedere-test.invalid/',?,'nicolas@pieper.fr',?)",
      )
      .bind(hash, subject, now),
  ]);
  const env = {
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://belvedere-test.invalid",
    AUTH0_DOMAIN: "belvedere-test.invalid",
    AUTH0_AUTH_POLICY: "verified_email",
    BELVEDERE_SECRET_SLUG: "test-fixture-slug-abcdefghijklmnopqrstuvwxyz",
  } as Env;
  const response = await handleBelvedereRoute(
    new Request(
      `${env.APP_ORIGIN}/belvedere/${env.BELVEDERE_SECRET_SLUG}/api/${path}`,
      { headers: { Cookie: `__Host-guteneo_session=${token}` } },
    ),
    env,
  );
  if (response?.status !== 200)
    throw new Error(`Unexpected Belvedere fixture status ${response?.status}`);
  return (await response.json()) as T;
}
