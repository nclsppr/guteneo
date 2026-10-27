import { readFile, readdir } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  authenticateBrowser,
  authenticatePersonalBrowser,
  documentAuthenticationEvidence,
  handleAuthRoute,
  requirePersonalStrongAuthentication,
  requirePersonalDocumentAuthentication,
  type AuthEnv,
} from "../../apps/api/src/auth";
import { publicPersonalSession, handlePersonalAccountRoute } from "../../apps/api/src/personal-auth";

let mf: Miniflare;
let db: D1Database;
let env: AuthEnv;
const origin = "http://localhost:8787";
const issuer = "https://personal-account-fixtures.auth0.example/";
const pair = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(pair.publicKey)),
  kid: "personal-fixture-key",
  alg: "RS256",
  use: "sig",
};
const now = () => Math.floor(Date.now() / 1000);
const request = (
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`${origin}${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const sessionCookie = (response: Response) =>
  response.headers.get("Set-Cookie")!.match(/guteneo_session=[^;,]+/)![0];
async function jwt(audience: string, claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pair.privateKey);
}
async function login(
  changes: Record<string, unknown> = {},
  path = "/auth/signup?context=personal&returnTo=%2F%23%2Fapp%2Fmy-documents",
) {
  const started = await handleAuthRoute(request(path), env);
  const destination = new URL(started!.headers.get("Location")!);
  const authenticatedAt = now();
  const sub = `auth0|personal-${crypto.randomUUID()}`;
  const id = await jwt("personal-browser", {
    sub,
    name: "Compte confidentiel",
    email: "recipient@example.test",
    email_verified: true,
    amr: ["webauthn"],
    auth_time: authenticatedAt,
    "https://guteneo.com/verified_account": true,
    "https://guteneo.com/document_authentication": {
      policy: "guteneo-sensitive-v1",
      method: "webauthn_uv",
      authenticated_at: authenticatedAt,
    },
    nonce: destination.searchParams.get("nonce"),
    ...changes,
  });
  const access = await jwt(`${origin}/mcp`, {
    sub,
    ...(changes.sub ? { sub: changes.sub } : {}),
    client_id: "personal-browser",
    "https://guteneo.com/verified_account": true,
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === `${issuer}oauth/token`)
      return Response.json({ id_token: id, access_token: access });
    if (url === `${issuer}.well-known/jwks.json`)
      return Response.json({ keys: [jwk] });
    throw new Error("Unexpected synthetic identity target");
  });
  const response = await handleAuthRoute(
    request(
      `/auth/callback?state=${destination.searchParams.get("state")}&code=fixture-code`,
      "GET",
      undefined,
      { Cookie: started!.headers.get("Set-Cookie")!.split(";")[0] },
    ),
    env,
  );
  const cookie = sessionCookie(response!);
  const principal = await authenticatePersonalBrowser(
    request("/api/personal/session", "GET", undefined, { Cookie: cookie }),
    env,
  );
  return {
    cookie,
    principal,
    response: response!,
    destination,
    headers: { Cookie: cookie, "X-CSRF-Token": principal.csrfToken },
  };
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "personal-account-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  env = {
    DB: db,
    ENVIRONMENT: "local",
    MODE: "production",
    APP_ORIGIN: origin,
    AUTH0_DOMAIN: new URL(issuer).hostname,
    AUTH0_CLIENT_ID: "personal-browser",
    AUTH0_CLIENT_SECRET: "synthetic-only",
    AUTH0_AUDIENCE: `${origin}/mcp`,
    AUTH0_AUTH_POLICY: "verified_email",
  };
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${name}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (line.startsWith("CREATE TRIGGER") && !line.endsWith("END;"))
        trigger = true;
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await db.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
  }
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.prepare("UPDATE secure_document_authentication_policy SET mode='strong' WHERE id=1").run();
});
afterAll(async () => {
  await mf?.dispose();
});

describe("document access policy does not fabricate stronger authentication", () => {
  it("allows a real signed verified Auth0 session in the explicit normal mode", async () => {
    const ordinary = await login({ amr: ["pwd"], auth_time: now() - 3600, "https://guteneo.com/document_authentication": null });
    const normal = { ...env, SENSITIVE_DOCUMENT_AUTHENTICATION: "verified_account" };
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1").run();
    expect(ordinary.principal).toMatchObject({ identityVerified: true, verifiedAccount: true, strongAuthentication: false, mfa: false, authenticationPolicyVersion: null });
    expect(() => requirePersonalDocumentAuthentication(ordinary.principal, normal)).not.toThrow();
    expect(await publicPersonalSession(normal, ordinary.principal)).toMatchObject({ documentAccessMode: "verified_account", documentAccessAllowed: true, strongAuthentication: false, authenticationPolicyVersion: null, mfa: false, workspaces: [] });
    expect(await publicPersonalSession(env, ordinary.principal)).toMatchObject({ documentAccessMode: "strong", documentAccessAllowed: false });
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='strong' WHERE id=1").run();
    expect((await publicPersonalSession(normal, ordinary.principal)).documentAccessAllowed).toBe(false);
    expect(() => requirePersonalDocumentAuthentication(ordinary.principal, env)).toThrow();
    expect(() => requirePersonalDocumentAuthentication(ordinary.principal, { SENSITIVE_DOCUMENT_AUTHENTICATION: "typo" })).toThrow("INVALID_SENSITIVE_DOCUMENT_AUTHENTICATION");
  });
  it("requires actual verified identity and email without a second authentication for an active session", async () => {
    const ordinary = await login({ amr: ["pwd"], "https://guteneo.com/document_authentication": null });
    const normal = { ...env, SENSITIVE_DOCUMENT_AUTHENTICATION: "verified_account" };
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1").run();
    for (const change of [{ verifiedAccount: false }, { verifiedEmail: false }, { identityVerified: false }, { authenticatedAt: null }, { authenticatedAt: 0 }, { authenticatedAt: now() + 6 }, { development: true, simulation: false }])
      expect(() => requirePersonalDocumentAuthentication({ ...ordinary.principal, ...change }, normal)).toThrow();
    expect(() => requirePersonalDocumentAuthentication({ ...ordinary.principal, authenticatedAt: now() - 3600 }, normal)).not.toThrow();
    expect(() => requirePersonalDocumentAuthentication({ ...ordinary.principal, authenticatedAt: now() - 3600 }, normal, { maxAgeSeconds: 300 })).not.toThrow();
    await db.prepare("DELETE FROM auth_identities WHERE user_id=?").bind(ordinary.principal.userId).run();
    const revokedIdentity = await authenticatePersonalBrowser(request("/api/personal/session", "GET", undefined, { Cookie: ordinary.cookie }), normal);
    expect((await publicPersonalSession(normal, revokedIdentity)).documentAccessAllowed).toBe(false);
  });
  it("reuses identity-provider SSO without a forced second authentication in normal mode", async () => {
    const result = await handleAuthRoute(request("/auth/login?context=personal"), { ...env, SENSITIVE_DOCUMENT_AUTHENTICATION: "verified_account" });
    const destination = new URL(result!.headers.get("Location")!);
    expect(destination.searchParams.get("max_age")).toBe("3600");
    expect(destination.searchParams.has("prompt")).toBe(false);
    expect(destination.searchParams.has("claims")).toBe(false);
    expect(destination.searchParams.has("acr_values")).toBe(false);
    const workshop = await handleAuthRoute(request("/auth/login"), { ...env, SENSITIVE_DOCUMENT_AUTHENTICATION: "verified_account" });
    const workshopDestination = new URL(workshop!.headers.get("Location")!);
    expect(workshopDestination.searchParams.get("max_age")).toBe("3600");
    expect(workshopDestination.searchParams.has("prompt")).toBe(false);
    expect(workshopDestination.searchParams.has("acr_values")).toBe(false);
    const strict = await handleAuthRoute(request("/auth/login?context=personal"), env);
    expect(new URL(strict!.headers.get("Location")!).searchParams.get("acr_values")).toContain("multi-factor");
    expect(new URL(strict!.headers.get("Location")!).searchParams.get("max_age")).toBe("0");
    const fresh = await handleAuthRoute(request("/auth/login?context=personal&fresh=1"), { ...env, SENSITIVE_DOCUMENT_AUTHENTICATION: "verified_account" });
    const freshDestination = new URL(fresh!.headers.get("Location")!);
    expect(freshDestination.searchParams.get("prompt")).toBe("login");
    expect(freshDestination.searchParams.get("max_age")).toBe("0");
  });
});

describe("one personal identity without implicit workshop authority", () => {
  it("creates a signed personal account without membership, budgets, senders or welcome credit", async () => {
    const before = await db
      .prepare(
        "SELECT (SELECT count(*) FROM organizations) organizations,(SELECT count(*) FROM welcome_credit_grants) credits,(SELECT count(*) FROM usage) budgets,(SELECT count(*) FROM senders) senders",
      )
      .first();
    const fixture = await login();
    expect(fixture.response.headers.get("Location")).toBe(
      `${origin}/#/app/my-documents`,
    );
    expect(fixture.destination.searchParams.get("max_age")).toBe("0");
    expect(fixture.destination.searchParams.get("acr_values")).toContain(
      "multi-factor",
    );
    expect(
      await db
        .prepare(
          "SELECT (SELECT count(*) FROM organizations) organizations,(SELECT count(*) FROM welcome_credit_grants) credits,(SELECT count(*) FROM usage) budgets,(SELECT count(*) FROM senders) senders",
        )
        .first(),
    ).toEqual(before);
    expect(
      await db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=?")
        .bind(fixture.principal.userId)
        .first(),
    ).toEqual({ n: 0 });
    await expect(
      authenticateBrowser(
        request("/api/documents", "GET", undefined, fixture.headers),
        env,
      ),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(() =>
      requirePersonalStrongAuthentication(fixture.principal),
    ).not.toThrow();
  });
  it("also keeps ordinary signup personal and does not merge two subjects sharing an email", async () => {
    const first = await login({}, "/auth/signup");
    const second = await login({}, "/auth/signup");
    expect(first.principal.userId).not.toBe(second.principal.userId);
    expect(
      await db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id IN (?,?)")
        .bind(first.principal.userId, second.principal.userId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("starts new accounts in V2 and preserves an existing saved Classic choice", async () => {
    const sub = `auth0|appearance-${crypto.randomUUID()}`;
    const first = await login({ sub }, "/auth/signup");
    expect(first.principal.preferredDashboardAppearance).toBe("v2");
    await db.prepare("UPDATE users SET preferred_dashboard_appearance='classic' WHERE id=?")
      .bind(first.principal.userId).run();
    const returning = await login({ sub }, "/auth/login");
    expect(returning.principal.userId).toBe(first.principal.userId);
    expect(returning.principal.preferredDashboardAppearance).toBe("classic");
  });
  it("requires verified email even if a strong authentication assertion is present", async () => {
    await expect(login({ email_verified: false })).rejects.toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED",
    });
  });
  it("rejects mfa enrollment/session booleans without qualified authentication evidence", async () => {
    const fixture = await login({
      amr: ["pwd", "mfa"],
      "https://guteneo.com/mfa": true,
      "https://guteneo.com/document_authentication": undefined,
    });
    expect(fixture.principal.mfa).toBe(true);
    expect(fixture.principal.strongAuthentication).toBe(false);
    expect(() =>
      requirePersonalStrongAuthentication(fixture.principal),
    ).toThrow(/strong authentication/);
  });
  it.each([
    {
      policy: "guteneo-sensitive-v0",
      method: "webauthn_uv",
      authenticated_at: 1,
    },
    { policy: "guteneo-sensitive-v1", method: "email", authenticated_at: 1 },
    {
      policy: "guteneo-sensitive-v1",
      method: "webauthn_uv",
      authenticated_at: 2,
    },
  ])("rejects unqualified policy/method/time assertions %j", (assertion) => {
    expect(
      documentAuthenticationEvidence({
        auth_time: 1,
        "https://guteneo.com/document_authentication": assertion,
      }).strongAuthentication,
    ).toBe(false);
  });
  it("accepts actual WebAuthn MFA after primary authentication and rejects invalid timestamp relations", () => {
    const evidence=(authTime:unknown,ceremony:unknown,issued:unknown)=>documentAuthenticationEvidence({
      auth_time:authTime,iat:issued,
      "https://guteneo.com/document_authentication":{policy:"guteneo-sensitive-v1",method:"webauthn_uv",authenticated_at:ceremony},
    } as Parameters<typeof documentAuthenticationEvidence>[0]);
    expect(evidence(100,110,115)).toMatchObject({strongAuthentication:true,authenticatedAt:100});
    expect(evidence(100,100,100).strongAuthentication).toBe(true);
    for(const [authTime,ceremony,issued] of [[100,99,115],[100,116,115],[100,110,undefined],[100,110.5,115],[100,"110",115],[100,110,114.5],[0,110,115],[undefined,110,115]])
      expect(evidence(authTime,ceremony,issued).strongAuthentication).toBe(false);
  });
  it("fails closed on missing, expired or future authentication freshness", async () => {
    const fixture = await login();
    for (const authenticatedAt of [null, now() - 901, now() + 10])
      expect(() =>
        requirePersonalStrongAuthentication({
          ...fixture.principal,
          authenticatedAt,
        }),
      ).toThrow();
  });
  it("requires both origin and csrf and rejects bearer substitution on personal mutations", async () => {
    const fixture = await login();
    await expect(
      handlePersonalAccountRoute(
        request(
          "/api/personal/account",
          "PATCH",
          { name: "Edited" },
          { Cookie: fixture.cookie },
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    await expect(
      handlePersonalAccountRoute(
        request(
          "/api/personal/account",
          "PATCH",
          { name: "Edited" },
          { ...fixture.headers, Origin: "https://foreign.invalid" },
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "ORIGIN_REJECTED" });
    await expect(
      handlePersonalAccountRoute(
        request("/api/personal/session", "GET", undefined, {
          ...fixture.headers,
          Authorization: "Bearer synthetic",
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
  });
  it("rejects an expired personal session before profile or workshop mutation", async () => {
    const fixture = await login();
    await db
      .prepare("UPDATE personal_sessions SET expires_at=? WHERE token_hash=?")
      .bind(
        new Date(Date.now() - 1000).toISOString(),
        fixture.principal.tokenHash,
      )
      .run();
    await expect(
      handlePersonalAccountRoute(
        request(
          "/api/personal/workspace",
          "POST",
          { name: "Forbidden workshop" },
          fixture.headers,
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM personal_workspace_creations WHERE user_id=?",
        )
        .bind(fixture.principal.userId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("bounds personal requests per account without borrowing a workshop quota", async () => {
    const fixture = await login();
    await db
      .prepare(
        "INSERT INTO personal_http_limits(user_id,window_start,count) VALUES(?,?,180)",
      )
      .bind(fixture.principal.userId, Math.floor(Date.now() / 60000))
      .run();
    const blocked = await handlePersonalAccountRoute(
      request("/api/personal/session", "GET", undefined, fixture.headers),
      env,
    );
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get("Retry-After")).toBe("60");
    const other = await login();
    expect(
      (await handlePersonalAccountRoute(
        request("/api/personal/session", "GET", undefined, other.headers),
        env,
      ))!.status,
    ).toBe(200);
  });
  it("updates one shared profile while preventing a profile edit from changing the verified email", async () => {
    const fixture = await login();
    const updated = await handlePersonalAccountRoute(
      request(
        "/api/personal/account",
        "PATCH",
        { name: "Mon nom", preferredLocale: "lb" },
        fixture.headers,
      ),
      env,
    );
    expect(await updated!.json()).toMatchObject({
      user: {
        id: fixture.principal.userId,
        name: "Mon nom",
        email: "recipient@example.test",
        preferredLocale: "lb",
      },
    });
    const automatic=await handlePersonalAccountRoute(request("/api/personal/account","PATCH",{name:"Mon nom",preferredLocale:null},fixture.headers),env);
    expect(await automatic!.json()).toMatchObject({user:{id:fixture.principal.userId,name:"Mon nom",preferredLocale:null}});
    await expect(
      handlePersonalAccountRoute(
        request(
          "/api/personal/account",
          "PATCH",
          { email: "other@example.test" },
          fixture.headers,
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("creates a sending workshop only on explicit action and keeps one funded workspace on retry", async () => {
    const fixture = await login({ amr: ["pwd", "mfa"] });
    const created = await handlePersonalAccountRoute(
      request(
        "/api/personal/workspace",
        "POST",
        { name: "Mon atelier" },
        fixture.headers,
      ),
      env,
    );
    const result = (await created!.json()) as {
      organization: { id: string };
      session: { user: { id: string } };
    };
    expect(result.session.user.id).toBe(fixture.principal.userId);
    const cookie = sessionCookie(created!);
    const personal = await authenticatePersonalBrowser(
      request("/api/personal/session", "GET", undefined, { Cookie: cookie }),
      env,
    );
    expect(personal.authenticatedAt).toBe(fixture.principal.authenticatedAt);
    expect(personal.strongAuthentication).toBe(true);
    await expect(
      authenticatePersonalBrowser(
        request("/api/personal/session", "GET", undefined, fixture.headers),
        env,
      ),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    const retry = await handlePersonalAccountRoute(
      request(
        "/api/personal/workspace",
        "POST",
        { name: "Second name ignored" },
        { Cookie: cookie, "X-CSRF-Token": personal.csrfToken },
      ),
      env,
    );
    expect(await retry!.json()).toMatchObject({
      organization: { id: result.organization.id },
    });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM personal_workspace_creations WHERE user_id=?",
        )
        .bind(personal.userId)
        .first(),
    ).toEqual({ n: 1 });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM welcome_credit_grants WHERE organization_id=?",
        )
        .bind(result.organization.id)
        .first(),
    ).toEqual({ n: 1 });
    expect(
      (
        await db
          .prepare(
            "SELECT enabled FROM channel_controls WHERE organization_id=?",
          )
          .bind(result.organization.id)
          .all()
      ).results.every((row) => row.enabled === 0),
    ).toBe(true);
    expect(
      await db
        .prepare(
          "SELECT verified_email,issuer,subject FROM browser_identity_evidence WHERE token_hash=?",
        )
        .bind(
          (
            await authenticatePersonalBrowser(
              request("/api/personal/session", "GET", undefined, {
                Cookie: sessionCookie(retry!),
              }),
              env,
            )
          ).tokenHash,
        )
        .first(),
    ).toMatchObject({ verified_email: "recipient@example.test", issuer });
  });
  it("cannot enter an unrelated workshop using a browser-supplied organization", async () => {
    const fixture = await login();
    await expect(
      handlePersonalAccountRoute(
        request(
          "/api/personal/workspace/select",
          "POST",
          { organizationId: "org_not_a_member" },
          fixture.headers,
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_REQUIRED" });
  });
  it("lists only own sessions and rejects revocation of another user's session", async () => {
    const first = await login();
    const other = await login();
    const listed = await handlePersonalAccountRoute(
      request(
        "/api/personal/account/sessions",
        "GET",
        undefined,
        first.headers,
      ),
      env,
    );
    const otherId = await db
      .prepare("SELECT public_id FROM personal_sessions WHERE token_hash=?")
      .bind(other.principal.tokenHash)
      .first<{ public_id: string }>();
    const list = (await listed!.json()) as { items: { id: string }[] };
    expect(list.items).toHaveLength(1);
    expect(list.items[0].id).not.toBe(otherId!.public_id);
    await expect(
      handlePersonalAccountRoute(
        request(
          `/api/personal/account/sessions/${otherId!.public_id}/revoke`,
          "POST",
          {},
          first.headers,
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("signs out both workshop and personal authority through a single logout", async () => {
    const fixture = await login({ amr: ["pwd", "mfa"] });
    const created = await handlePersonalAccountRoute(
      request(
        "/api/personal/workspace",
        "POST",
        { name: "Session atelier" },
        fixture.headers,
      ),
      env,
    );
    const cookie = sessionCookie(created!);
    const principal = await authenticatePersonalBrowser(
      request("/api/personal/session", "GET", undefined, { Cookie: cookie }),
      env,
    );
    const headers = { Cookie: cookie, "X-CSRF-Token": principal.csrfToken };
    await handlePersonalAccountRoute(
      request("/api/personal/logout", "POST", {}, headers),
      env,
    );
    await expect(
      authenticateBrowser(
        request("/api/session", "GET", undefined, headers),
        env,
      ),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    await expect(
      authenticatePersonalBrowser(
        request("/api/personal/session", "GET", undefined, headers),
        env,
      ),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("refuses developer authentication on public, staging and production hosts", async () => {
    for (const variant of [
      { ...env, ENVIRONMENT: "production", MODE: "production" },
      { ...env, ENVIRONMENT: "staging", MODE: "simulation" },
      { ...env, MODE: "simulation", APP_ORIGIN: "https://guteneo.com" },
    ])
      await expect(
        handlePersonalAccountRoute(
          request("/api/dev/personal-login", "POST", { identity: "recipient" }),
          variant,
        ),
      ).rejects.toMatchObject({ code: "DEVELOPMENT_AUTH_FORBIDDEN" });
  });
  it("labels local fixtures as simulation and preserves the weak-session denial case", async () => {
    const local = { ...env, MODE: "simulation" };
    const response = await handlePersonalAccountRoute(
      request("/api/dev/personal-login", "POST", {
        identity: "recipient",
        assurance: "weak",
      }),
      local,
    );
    expect(await response!.clone().json()).toMatchObject({
      simulation: true,
      strongAuthentication: false,
      workspaces: [],
    });
    const principal = await authenticatePersonalBrowser(
      request("/api/personal/session", "GET", undefined, {
        Cookie: sessionCookie(response!),
      }),
      local,
    );
    expect(() => requirePersonalStrongAuthentication(principal)).toThrow();
  });
});
