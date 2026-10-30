import { randomBytes, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { App } from "e2e";
import type { Browser } from "@e2e-dev/web";
import { expect, localApi } from "../distribution-e2e/fixtures";
import { distributionOrigin } from "../../scripts/test-distribution-origin.mjs";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = distributionOrigin;

/** Persist a synthetic normal Auth0 identity/session. Never an application
 * endpoint, UI mock, forged strong claim, production account or IdP proof. */
export async function normalIdentity(browser: Browser, app: App, identity: "atelier" | "recipient" | "other-recipient", authenticationAgeSeconds = 0) {
  const state = process.env.GUTENEO_DISTRIBUTION_E2E_STATE;
  if (!state || !/^\.wrangler\/distribution-e2e-[a-f0-9-]{36}$/u.test(state))
    throw new Error("Normal sessions require isolated fictional storage.");
  const account = identity === "atelier"
    ? { id: "user_atelier", email: "camille@example.invalid", name: "Atelier synthétique" }
    : { id: `user_${identity.replaceAll("-", "_")}`, email: `${identity}@example.test`, name: "Destinataire synthétique" };
  const secret = randomBytes(32).toString("base64url"), csrf = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(secret).digest("hex");
  const time = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString();
  const authenticatedAt = Math.floor(Date.now() / 1000) - authenticationAgeSeconds;
  const identityAuthenticatedAt = new Date(authenticatedAt * 1000).toISOString();
  // The private ledger lets the wrapper independently refuse any report/log
  // containing a raw fixture credential. It is outside uploadable artifacts.
  await appendFile(new URL(`${state}/normal-session-secrets.jsonl`, `file://${root}`), `${JSON.stringify([secret, csrf])}\n`, { mode: 0o600 });
  const sql = `UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1;
INSERT OR IGNORE INTO users(id,name,email,created_at) VALUES('${account.id}','${account.name}','${account.email}','${time}');
INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://auth0-fixture.example.invalid/','auth0|${account.id}','${account.id}','${time}');
INSERT INTO personal_sessions(token_hash,user_id,csrf_token,verified_email,identity_issuer,identity_subject,identity_authenticated_at,mfa,verified_account,authenticated_at,amr_json,acr,strong_authentication,authentication_policy_version,is_development,public_id,created_at,expires_at)
VALUES('${tokenHash}','${account.id}','${csrf}','${account.email}','https://auth0-fixture.example.invalid/','auth0|${account.id}','${identityAuthenticatedAt}',0,1,${authenticatedAt},'["pwd"]',NULL,0,NULL,0,'session_${crypto.randomUUID().replaceAll("-", "")}','${time}','${expires}');
${identity === "atelier" ? `INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) SELECT '${tokenHash}','${account.id}','org_atelier','${csrf}',0,0,'${time}','${expires}',1 WHERE EXISTS(SELECT 1 FROM memberships WHERE organization_id='org_atelier' AND user_id='${account.id}' AND role='admin');` : ""}`;
  try {
    await run(process.execPath, [fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url)), "d1", "execute", "guteneo-local", "--local", "--persist-to", state, "--command", sql], { cwd: root, timeout: 15000, env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" } });
  } catch {
    throw new Error("The isolated normal-session fixture could not be persisted.");
  }
  await browser.setCookies([{ name: "guteneo_session", value: secret, url: origin, httpOnly: true, secure: false, sameSite: "Lax" }]);
  await app.open(identity === "atelier" ? "/#/app/secure-distributions" : "/#/app/my-documents");
  await browser.reload();
  const session = await localApi<{ user: { id: string }; documentAccessMode: string; documentAccessAllowed: boolean; strongAuthentication: boolean; authenticationPolicyVersion: string | null; mfa: boolean; amr: string[] }>(browser, "/api/personal/session");
  expect(session.status).toBe(200);
  expect(session.body.user.id).toBe(account.id);
  expect(session.body.documentAccessMode).toBe("verified_account");
  expect(session.body.documentAccessAllowed).toBe(true);
  expect(session.body.strongAuthentication).toBe(false);
  expect(session.body.mfa).toBe(false);
  expect(session.body.authenticationPolicyVersion).toBeNull();
  expect(session.body.amr).toEqual(["pwd"]);
}
