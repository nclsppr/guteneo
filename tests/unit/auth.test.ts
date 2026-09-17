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
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  authenticateBrowser,
  authenticateMcp,
  AuthError,
  handleAuthRoute,
  hashSecret,
  hasMfa,
  hasVerifiedAccount,
  authenticationPolicy,
  isLocalSimulation,
  MCP_SCOPES,
  protectedResourceMetadata,
  requireSameOrigin,
  requireScope,
  safeReturnPath,
  validateAuth0Token,
  type AuthEnv,
} from "../../apps/api/src/auth";
import { handleMcp, type McpServices } from "../../apps/api/src/mcp";
import { DomainService } from "../../packages/domain/src/index";

let mf: Miniflare;
let env: AuthEnv;
const origin = "http://localhost:8787";
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
const keyPair = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keyPair.publicKey)),
  kid: "auth-test-key",
  alg: "RS256",
  use: "sig",
};
const issuer = "https://guteneo-identity-test.auth0.example/";
const realEnv = () => ({
  ...env,
  AUTH0_DOMAIN: new URL(issuer).hostname,
  AUTH0_CLIENT_ID: "guteneo-browser",
  AUTH0_CLIENT_SECRET: "fixture-confidential-client",
  AUTH0_AUDIENCE: `${origin}/mcp`,
});
async function token(audience: string, claims: Record<string, unknown> = {}) {
  return new SignJWT({ sub: "auth0|test-member", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keyPair.privateKey);
}
const betaEnv = () => ({
  ...realEnv(),
  MODE: "production",
  AUTH0_AUTH_POLICY: "verified_email",
});
async function signedBetaLogin(
  idChanges: Record<string, unknown> = {},
  accessChanges: Record<string, unknown> = {},
) {
  const configured = betaEnv();
  const started = await handleAuthRoute(request("/auth/signup"), configured);
  const destination = new URL(started!.headers.get("Location")!);
  const sub = `auth0|beta-${crypto.randomUUID()}`;
  const claims = {
    sub,
    email: "verified-fixture@example.test",
    email_verified: true,
    amr: ["pwd"],
    "https://guteneo.com/verified_account": true,
  };
  const idToken = await token("guteneo-browser", {
    ...claims,
    nonce: destination.searchParams.get("nonce"),
    ...idChanges,
  });
  const accessToken = await token(`${origin}/mcp`, {
    sub,
    client_id: "guteneo-browser",
    "https://guteneo.com/verified_account": true,
    ...accessChanges,
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const target = input instanceof Request ? input.url : String(input);
    if (target === `${issuer}oauth/token`)
      return Response.json({ id_token: idToken, access_token: accessToken });
    if (target === `${issuer}.well-known/jwks.json`)
      return Response.json({ keys: [jwk] });
    throw new Error("Unexpected fixture target");
  });
  const callback = request(
    `/auth/callback?state=${destination.searchParams.get("state")}&code=fixture-code`,
    "GET",
    undefined,
    { Cookie: started!.headers.get("Set-Cookie")!.split(";")[0] },
  );
  return {
    configured,
    sub,
    callback,
    complete: () => handleAuthRoute(callback, configured),
  };
}
async function login(organization = "atelier") {
  const response = await handleAuthRoute(
    request("/api/dev/login", "POST", { organization }),
    env,
  );
  const data = (await response!.json()) as {
    csrfToken: string;
    organization: { id: string };
  };
  return { data, cookie: response!.headers.get("Set-Cookie")!.split(";")[0] };
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "auth-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;
  env = {
    DB: db,
    ENVIRONMENT: "local",
    MODE: "simulation",
    APP_ORIGIN: origin,
  };
  // Use the actual migrations, not a hand-written fake database contract.
  const migrationNames = (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((n) => n.endsWith(".sql"))
    .sort();
  for (const filename of [
    ...migrationNames.map((name) => `migrations/${name}`),
    "scripts/seed.sql",
  ]) {
    const sql = await readFile(
      new URL(`../../${filename}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    for (const rawLine of sql.split("\n")) {
      const line = rawLine.trim();
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
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await mf?.dispose();
});

describe("identity and authentication boundaries", () => {
  it("issues a real local DB session and requires origin + CSRF for mutations", async () => {
    const auth = await login();
    const session = await authenticateBrowser(
      request("/api/documents", "GET", undefined, { Cookie: auth.cookie }),
      env,
    );
    expect(session.context.organizationId).toBe("org_atelier");
    expect(session.context.actor).toBe("browser");
    await expect(
      authenticateBrowser(
        request("/api/documents", "POST", {}, { Cookie: auth.cookie }),
        env,
        true,
      ),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    await expect(
      authenticateBrowser(
        request(
          "/api/documents",
          "POST",
          {},
          {
            Cookie: auth.cookie,
            "X-CSRF-Token": auth.data.csrfToken,
            Origin: "https://attacker.invalid",
          },
        ),
        env,
        true,
      ),
    ).rejects.toMatchObject({ code: "ORIGIN_REJECTED" });
    await expect(
      authenticateBrowser(
        request(
          "/api/documents",
          "POST",
          {},
          { Cookie: auth.cookie, "X-CSRF-Token": auth.data.csrfToken },
        ),
        env,
        true,
      ),
    ).resolves.toMatchObject({ context: { organizationId: "org_atelier" } });
  });
  it("does not accept a client organization header, forged cookie or removed membership", async () => {
    const auth = await login();
    const session = await authenticateBrowser(
      request("/api/documents", "GET", undefined, {
        Cookie: auth.cookie,
        "X-Organization-Id": "org_studio",
      }),
      env,
    );
    expect(session.context.organizationId).toBe("org_atelier");
    await expect(
      authenticateBrowser(
        request("/api/documents", "GET", undefined, {
          Cookie: "guteneo_session=forged",
        }),
        env,
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await env.DB.prepare("DELETE FROM browser_sessions WHERE token_hash=?")
      .bind(session.tokenHash)
      .run();
    await expect(
      authenticateBrowser(
        request("/api/documents", "GET", undefined, { Cookie: auth.cookie }),
        env,
      ),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("development identity fails closed on public hosts, staging and production", async () => {
    for (const deniedEnv of [
      { ...env, ENVIRONMENT: "production" },
      { ...env, ENVIRONMENT: "staging" },
      { ...env, MODE: "production" },
    ]) {
      await expect(
        handleAuthRoute(
          request("/api/dev/login", "POST", { organization: "atelier" }),
          deniedEnv,
        ),
      ).rejects.toMatchObject({ code: "DEVELOPMENT_AUTH_FORBIDDEN" });
    }
    expect(
      isLocalSimulation(new Request("https://guteneo.com/api/dev/login"), env),
    ).toBe(false);
    expect(() =>
      requireSameOrigin(
        new Request(`${origin}/api/dev/login`, { method: "POST" }),
        env,
      ),
    ).toThrow();
  });
  it("stores only the session token hash and revokes the actual session on logout", async () => {
    const auth = await login();
    const raw = auth.cookie.split("=")[1];
    const row = await env.DB.prepare(
      "SELECT token_hash FROM browser_sessions WHERE token_hash=?",
    )
      .bind(await hashSecret(raw))
      .first<{ token_hash: string }>();
    expect(row?.token_hash).not.toBe(raw);
    await handleAuthRoute(
      request(
        "/api/logout",
        "POST",
        {},
        { Cookie: auth.cookie, "X-CSRF-Token": auth.data.csrfToken },
      ),
      env,
    );
    await expect(
      authenticateBrowser(
        request("/api/session", "GET", undefined, { Cookie: auth.cookie }),
        env,
      ),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("mints a scoped short simulation MCP credential that is unusable remotely", async () => {
    const auth = await login("studio");
    const response = await handleAuthRoute(
      request(
        "/api/dev/mcp-token",
        "POST",
        {},
        { Cookie: auth.cookie, "X-CSRF-Token": auth.data.csrfToken },
      ),
      env,
    );
    const data = (await response!.json()) as { token: string };
    const identity = await authenticateMcp(
      request("/mcp", "POST", {}, { Authorization: `Bearer ${data.token}` }),
      env,
    );
    expect(identity.context).toMatchObject({
      organizationId: "org_studio",
      actor: "mcp",
    });
    expect(identity.scopes).toEqual(MCP_SCOPES);
    await expect(
      authenticateMcp(
        request("/mcp", "POST", {}, { Authorization: `Bearer ${data.token}` }),
        { ...env, ENVIRONMENT: "production" },
      ),
    ).rejects.toMatchObject({ code: "DEVELOPMENT_AUTH_FORBIDDEN" });
  });
  it("verifies signatures, audience, issuer and expiry with real signed JWTs", async () => {
    const keys = createLocalJWKSet({ keys: [jwk] });
    const good = await token(`${origin}/mcp`, { scope: "documents:write" });
    await expect(
      validateAuth0Token(good, realEnv(), "access", keys),
    ).resolves.toMatchObject({ sub: "auth0|test-member" });
    await expect(
      validateAuth0Token(
        good,
        { ...realEnv(), AUTH0_AUDIENCE: "https://another-api.invalid" },
        "access",
        keys,
      ),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    await expect(
      validateAuth0Token(
        good,
        { ...realEnv(), AUTH0_DOMAIN: "other-tenant.auth0.example" },
        "access",
        keys,
      ),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    await expect(
      validateAuth0Token(
        `${good.slice(0, -10)}tampered`,
        realEnv(),
        "access",
        keys,
      ),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    const expired = await new SignJWT({ sub: "auth0|test-member" })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(`${origin}/mcp`)
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(keyPair.privateKey);
    await expect(
      validateAuth0Token(expired, realEnv(), "access", keys),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    const longLived = await new SignJWT({ sub: "auth0|test-member" })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(`${origin}/mcp`)
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(keyPair.privateKey);
    await expect(
      validateAuth0Token(longLived, realEnv(), "access", keys),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });
  it("enforces tool scope and trusted MFA claims", () => {
    expect(() =>
      requireScope({ scopes: ["dispatches:read"] }, "dispatches:send"),
    ).toThrow();
    expect(hasMfa({ amr: ["pwd"] })).toBe(false);
    expect(hasMfa({ amr: ["pwd", "mfa"] })).toBe(true);
    expect(hasMfa({ "https://guteneo.com/mfa": true })).toBe(true);
    expect(hasMfa({ user_confirmed: true })).toBe(false);
  });
  it("creates PKCE-bound login state, rejects foreign browser state and advertises Auth0 discovery", async () => {
    const response = await handleAuthRoute(
      request("/auth/login?returnTo=%2Fapp%2Fdocuments"),
      realEnv(),
    );
    const destination = new URL(response!.headers.get("Location")!);
    expect(destination.origin).toBe(new URL(issuer).origin);
    expect(destination.searchParams.get("code_challenge_method")).toBe("S256");
    expect(destination.searchParams.get("code_challenge")).toHaveLength(43);
    const state = destination.searchParams.get("state")!;
    await expect(
      handleAuthRoute(
        request(`/auth/callback?state=${state}&code=test`, "GET", undefined, {
          Cookie: "guteneo_login=foreign-browser",
        }),
        realEnv(),
      ),
    ).rejects.toMatchObject({ code: "LOGIN_STATE_INVALID" });
    const discovery = (await protectedResourceMetadata(realEnv()).json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(discovery.resource).toBe(`${origin}/mcp`);
    expect(discovery.authorization_servers).toEqual([issuer.slice(0, -1)]);
    for (const path of [
      "//attacker.invalid",
      "/\\attacker.invalid",
      "/\t/attacker.invalid",
      "https://attacker.invalid",
    ])
      expect(safeReturnPath(path)).toBe("/#/app");
  });
  it("grants one shared welcome credit after verified PKCE signup without enabling any channel", async () => {
    const configured = { ...realEnv(), MODE: "production" as const };
    const response = await handleAuthRoute(request("/auth/login"), configured);
    const destination = new URL(response!.headers.get("Location")!);
    const state = destination.searchParams.get("state")!;
    const nonce = destination.searchParams.get("nonce")!;
    const callbackCookie = response!.headers.get("Set-Cookie")!.split(";")[0];
    let idToken = await token("guteneo-browser", {
      nonce,
      name: "Fixture user",
      email: "fixture@example.test",
      email_verified: true,
      amr: ["pwd", "mfa"],
    });
    const accessToken = await token(`${origin}/mcp`, {
      client_id: "guteneo-browser",
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, options) => {
        const target = input instanceof Request ? input.url : String(input);
        if (target === `${issuer}oauth/token`) {
          const body = JSON.parse(options!.body as string);
          expect(body.code_verifier).toHaveLength(43);
          expect(body.grant_type).toBe("authorization_code");
          return Response.json({
            id_token: idToken,
            access_token: accessToken,
          });
        }
        if (target === `${issuer}.well-known/jwks.json`)
          return Response.json({ keys: [jwk] });
        throw new Error("Unexpected network target");
      });
    const callbackRequest = request(
      `/auth/callback?state=${state}&code=fixture-code`,
      "GET",
      undefined,
      { Cookie: callbackCookie },
    );
    const callback = await handleAuthRoute(callbackRequest, configured);
    expect(callback?.status).toBe(302);
    expect(callback!.headers.get("Location")).toBe(`${origin}/#/app`);
    expect(fetchSpy).toHaveBeenCalled();
    const user = await env.DB.prepare(
      "SELECT user_id FROM auth_identities WHERE subject=?",
    )
      .bind("auth0|test-member")
      .first<{ user_id: string }>();
    const budgets = await env.DB.prepare(
      "SELECT limit_count,limit_minor FROM usage WHERE organization_id IN (SELECT organization_id FROM memberships WHERE user_id=?)",
    )
      .bind(user!.user_id)
      .all<{ limit_count: number; limit_minor: number }>();
    expect(budgets.results).toHaveLength(3);
    expect(
      budgets.results.every(
        (v) => v.limit_count === 10000 && v.limit_minor === 5000,
      ),
    ).toBe(true);
    const grants = () =>
      env.DB.prepare(
        "SELECT g.organization_id,g.amount_minor FROM welcome_credit_grants g JOIN memberships m ON m.organization_id=g.organization_id WHERE m.user_id=?",
      )
        .bind(user!.user_id)
        .all<{ organization_id: string; amount_minor: number }>();
    const firstGrant = await grants();
    expect(firstGrant.results).toHaveLength(1);
    expect(firstGrant.results[0].amount_minor).toBe(5000);
    const channels = await env.DB.prepare(
      "SELECT enabled FROM channel_controls WHERE organization_id=?",
    )
      .bind(firstGrant.results[0].organization_id)
      .all<{ enabled: number }>();
    expect(channels.results).toHaveLength(3);
    expect(channels.results.every((channel) => channel.enabled === 0)).toBe(
      true,
    );

    const again = await handleAuthRoute(request("/auth/login"), configured);
    const next = new URL(again!.headers.get("Location")!);
    idToken = await token("guteneo-browser", {
      nonce: next.searchParams.get("nonce"),
      name: "Fixture user",
      email: "fixture@example.test",
      email_verified: true,
      amr: ["pwd", "mfa"],
    });
    expect(
      (
        await handleAuthRoute(
          request(
            `/auth/callback?state=${next.searchParams.get("state")}&code=second-fixture-code`,
            "GET",
            undefined,
            { Cookie: again!.headers.get("Set-Cookie")!.split(";")[0] },
          ),
          configured,
        )
      )?.status,
    ).toBe(302);
    expect((await grants()).results).toEqual(firstGrant.results);
    await expect(
      handleAuthRoute(callbackRequest, configured),
    ).rejects.toMatchObject({ code: "LOGIN_STATE_INVALID" });
  });
  it("accepts a verified password signup in explicit free beta without manufacturing MFA", async () => {
    const flow = await signedBetaLogin();
    const result = await flow.complete();
    expect(result?.status).toBe(302);
    const cookie = result!.headers
      .get("Set-Cookie")!
      .match(/guteneo_session=[^;,]+/)![0];
    const session = await authenticateBrowser(
      request("/api/session", "GET", undefined, { Cookie: cookie }),
      flow.configured,
    );
    expect(session).toMatchObject({
      mfa: false,
      verifiedAccount: true,
      simulation: false,
      context: { role: "admin" },
    });
    expect(
      await env.DB.prepare(
        "SELECT mfa,verified_account,is_development FROM browser_sessions WHERE token_hash=?",
      )
        .bind(session.tokenHash)
        .first(),
    ).toEqual({ mfa: 0, verified_account: 1, is_development: 0 });
    await expect(
      authenticateBrowser(
        request(
          "/api/account",
          "PATCH",
          {},
          { Cookie: cookie, "X-CSRF-Token": session.csrfToken },
        ),
        flow.configured,
        true,
      ),
    ).resolves.toMatchObject({ verifiedAccount: true });
    await expect(
      authenticateBrowser(
        request(
          "/api/account",
          "PATCH",
          {},
          {
            Cookie: cookie,
            "X-CSRF-Token": session.csrfToken,
            Origin: "https://attacker.invalid",
          },
        ),
        flow.configured,
        true,
      ),
    ).rejects.toMatchObject({ code: "ORIGIN_REJECTED" });
    await expect(
      authenticateBrowser(
        request("/api/session", "GET", undefined, { Cookie: cookie }),
        { ...flow.configured, AUTH0_AUTH_POLICY: undefined },
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED" });
    await env.DB.prepare(
      "UPDATE browser_sessions SET verified_account=0 WHERE token_hash=?",
    )
      .bind(session.tokenHash)
      .run();
    await expect(
      authenticateBrowser(
        request("/api/session", "GET", undefined, { Cookie: cookie }),
        flow.configured,
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_VERIFICATION_REQUIRED" });
  });
  it.each([
    {
      label: "missing ID proof",
      id: { "https://guteneo.com/verified_account": undefined },
      access: {},
      code: "ACCOUNT_VERIFICATION_REQUIRED",
    },
    {
      label: "string ID proof",
      id: { "https://guteneo.com/verified_account": "true" },
      access: {},
      code: "ACCOUNT_VERIFICATION_REQUIRED",
    },
    {
      label: "missing access proof",
      id: {},
      access: { "https://guteneo.com/verified_account": undefined },
      code: "ACCOUNT_VERIFICATION_REQUIRED",
    },
    {
      label: "false access proof",
      id: {},
      access: { "https://guteneo.com/verified_account": false },
      code: "ACCOUNT_VERIFICATION_REQUIRED",
    },
    {
      label: "unverified email despite custom proof",
      id: { email_verified: false },
      access: {},
      code: "EMAIL_VERIFICATION_REQUIRED",
    },
  ])(
    "free beta refuses $label before creating an account or grant",
    async ({ id, access, code }) => {
      const before = await env.DB.prepare(
        "SELECT (SELECT count(*) FROM browser_sessions) sessions,(SELECT count(*) FROM welcome_credit_grants) grants",
      ).first();
      const flow = await signedBetaLogin(id, access);
      await expect(flow.complete()).rejects.toMatchObject({ code });
      expect(
        await env.DB.prepare("SELECT 1 FROM auth_identities WHERE subject=?")
          .bind(flow.sub)
          .first(),
      ).toBeNull();
      expect(
        await env.DB.prepare(
          "SELECT (SELECT count(*) FROM browser_sessions) sessions,(SELECT count(*) FROM welcome_credit_grants) grants",
        ).first(),
      ).toEqual(before);
    },
  );
  it("requires the signed verified-account claim for MCP before binding a client, then preserves scope and revocation", async () => {
    const flow = await signedBetaLogin();
    await flow.complete();
    const client = "mcp-beta-" + crypto.randomUUID();
    const requestToken = async (claims: Record<string, unknown>) =>
      request("/mcp", "POST", undefined, {
        Authorization: `Bearer ${await token(`${origin}/mcp`, { sub: flow.sub, client_id: client, scope: "documents:read", ...claims })}`,
      });
    await expect(
      authenticateMcp(
        await requestToken({ amr: ["pwd", "mfa"] }),
        flow.configured,
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_VERIFICATION_REQUIRED" });
    expect(
      await env.DB.prepare(
        "SELECT 1 FROM authorized_connections WHERE client_id=?",
      )
        .bind(client)
        .first(),
    ).toBeNull();
    const authorized = await requestToken({
      "https://guteneo.com/verified_account": true,
    });
    const identity = await authenticateMcp(authorized, flow.configured);
    expect(identity.scopes).toEqual(["documents:read"]);
    expect(identity.context.role).toBe("admin");
    expect(() => requireScope(identity, "dispatches:send")).toThrow(AuthError);
    await env.DB.prepare(
      "UPDATE authorized_connections SET status='revoked' WHERE issuer=? AND user_id=? AND client_id=?",
    )
      .bind(issuer, identity.context.userId, client)
      .run();
    await expect(
      authenticateMcp(authorized, flow.configured),
    ).rejects.toMatchObject({ code: "CONNECTION_REVOKED" });
  });
  it("treats a passkey method as informational, and keeps legacy and invalid policies fail-closed", () => {
    expect(
      hasMfa({
        amr: ["passkey"],
        "https://guteneo.com/verified_account": true,
      }),
    ).toBe(false);
    expect(hasVerifiedAccount({ email_verified: true, amr: ["passkey"] })).toBe(
      false,
    );
    expect(
      hasVerifiedAccount({ "https://guteneo.com/verified_account": true }),
    ).toBe(true);
    expect(
      hasVerifiedAccount({ "https://guteneo.com/verified_account": "true" }),
    ).toBe(false);
    expect(authenticationPolicy({})).toBe("verified_email_and_mfa");
    expect(() => authenticationPolicy({ AUTH0_AUTH_POLICY: "typo" })).toThrow(
      AuthError,
    );
  });
  it("requests real signup and fresh authentication using the same PKCE flow", async () => {
    const response = await handleAuthRoute(
      request("/auth/signup?fresh=1"),
      realEnv(),
    );
    const destination = new URL(response!.headers.get("Location")!);
    expect(destination.searchParams.get("screen_hint")).toBe("signup");
    expect(destination.searchParams.get("prompt")).toBe("login");
    expect(destination.searchParams.get("code_challenge_method")).toBe("S256");
    expect(destination.searchParams.get("scope")).toBe("openid profile email");
  });
  it.each([
    {
      label: "unverified email",
      subject: "unverified",
      verified: false,
      amr: ["pwd", "mfa"],
      code: "EMAIL_VERIFICATION_REQUIRED",
    },
    {
      label: "verified email without MFA",
      subject: "without-mfa",
      verified: true,
      amr: ["pwd"],
      code: "MFA_REQUIRED",
    },
  ])(
    "never provisions $label or issues a session",
    async ({ subject, verified, amr, code }) => {
      const configured = { ...realEnv(), MODE: "production" as const };
      const grantCount = await env.DB.prepare(
        "SELECT count(*) AS count FROM welcome_credit_grants",
      ).first();
      const sessionCount = await env.DB.prepare(
        "SELECT count(*) AS count FROM browser_sessions",
      ).first<{ count: number }>();
      const response = await handleAuthRoute(
        request("/auth/signup"),
        configured,
      );
      const destination = new URL(response!.headers.get("Location")!);
      const sub = `auth0|${subject}-fixture`;
      const idToken = await token("guteneo-browser", {
        sub,
        nonce: destination.searchParams.get("nonce"),
        email: "unverified@example.test",
        email_verified: verified,
        amr,
      });
      const accessToken = await token(`${origin}/mcp`, {
        sub,
        client_id: "guteneo-browser",
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const target = String(input);
        if (target === `${issuer}oauth/token`)
          return Response.json({
            id_token: idToken,
            access_token: accessToken,
          });
        if (target === `${issuer}.well-known/jwks.json`)
          return Response.json({ keys: [jwk] });
        throw new Error("Unexpected network target");
      });
      await expect(
        handleAuthRoute(
          request(
            `/auth/callback?state=${destination.searchParams.get("state")}&code=fixture-code`,
            "GET",
            undefined,
            { Cookie: response!.headers.get("Set-Cookie")!.split(";")[0] },
          ),
          configured,
        ),
      ).rejects.toMatchObject({ code });
      expect(
        await env.DB.prepare(
          "SELECT user_id FROM auth_identities WHERE subject=?",
        )
          .bind(sub)
          .first(),
      ).toBeNull();
      expect(
        await env.DB.prepare(
          "SELECT count(*) AS count FROM browser_sessions",
        ).first(),
      ).toEqual(sessionCount);
      expect(
        await env.DB.prepare(
          "SELECT count(*) AS count FROM welcome_credit_grants",
        ).first(),
      ).toEqual(grantCount);
    },
  );
  it.each(["network", "invalid JSON", "null JSON"])(
    "returns a safe retry error on token exchange %s failure",
    async (failure) => {
      const response = await handleAuthRoute(request("/auth/login"), realEnv());
      const destination = new URL(response!.headers.get("Location")!);
      const state = destination.searchParams.get("state")!;
      const sessionCount = await env.DB.prepare(
        "SELECT count(*) AS count FROM browser_sessions",
      ).first();
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        if (failure === "network")
          throw new Error("provider-private-response-fixture");
        if (failure === "null JSON") return Response.json(null);
        return new Response("provider-private-response-fixture", {
          status: 200,
        });
      });
      const callback = request(
        `/auth/callback?state=${state}&code=fixture-code`,
        "GET",
        undefined,
        {
          Cookie: response!.headers.get("Set-Cookie")!.split(";")[0],
        },
      );
      const error = await handleAuthRoute(callback, realEnv()).catch(
        (error: unknown) => error,
      );
      expect(error).toBeInstanceOf(AuthError);
      expect(error).toMatchObject({ code: "LOGIN_EXCHANGE_FAILED" });
      expect(String(error)).not.toContain("provider-private-response-fixture");
      expect(
        await env.DB.prepare(
          "SELECT count(*) AS count FROM browser_sessions",
        ).first(),
      ).toEqual(sessionCount);
      expect(
        await env.DB.prepare(
          "SELECT state_hash FROM auth_transactions WHERE state_hash=?",
        )
          .bind(await hashSecret(state))
          .first(),
      ).toBeNull();
    },
  );
  it("bounds hosted login writes per source without retaining raw addresses", async () => {
    const hosted = {
      ...realEnv(),
      ENVIRONMENT: "production",
      APP_ORIGIN: "https://guteneo.test",
    };
    const request = () =>
      new Request("https://guteneo.test/auth/signup", {
        headers: { "CF-Connecting-IP": "192.0.2.9" },
      });
    for (let index = 0; index < 60; index++)
      expect((await handleAuthRoute(request(), hosted))?.status).toBe(302);
    await expect(handleAuthRoute(request(), hosted)).rejects.toMatchObject({
      code: "LOGIN_RATE_LIMITED",
    });
    const rows = await env.DB.prepare("SELECT key FROM auth_flow_limits").all<{
      key: string;
    }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].key).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      handleAuthRoute(new Request("https://guteneo.test/auth/signup"), hosted),
    ).rejects.toMatchObject({ code: "LOGIN_UNAVAILABLE" });
  });
});

describe("actual stateless MCP transport with shared D1 domain", () => {
  async function credential(organization = "atelier") {
    const auth = await login(organization);
    const response = await handleAuthRoute(
      request(
        "/api/dev/mcp-token",
        "POST",
        {},
        { Cookie: auth.cookie, "X-CSRF-Token": auth.data.csrfToken },
      ),
      env,
    );
    return { ...auth, ...((await response!.json()) as { token: string }) };
  }
  const services = (): McpServices => ({
    domain: new DomainService(env.DB, { mode: "simulation" }),
    documents: {
      async importFile() {
        throw new Error("Not used in this test");
      },
      async render() {
        throw new Error("Not used in this test");
      },
    },
    capabilities: () => ({ simulation: true }),
  });
  async function rpc(
    token: string,
    method: string,
    params: unknown = {},
    dependencies = services(),
  ) {
    const response = await handleMcp(
      request(
        "/mcp",
        "POST",
        { jsonrpc: "2.0", id: crypto.randomUUID(), method, params },
        {
          Host: "localhost:8787",
          Authorization: `Bearer ${token}`,
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-11-25",
        },
      ),
      env,
      dependencies,
    );
    const raw = await response.text();
    const payload =
      raw.startsWith("event:") || raw.startsWith("data:")
        ? JSON.parse(
            raw
              .split("\n")
              .find((line) => line.startsWith("data:"))!
              .slice(5),
          )
        : JSON.parse(raw);
    return { response, payload };
  }
  it("advertises exact file schema and never exposes a human approval tool", async () => {
    const auth = await credential();
    const { response, payload } = await rpc(auth.token, "tools/list");
    expect(response.status, JSON.stringify(payload)).toBe(200);
    const tools = payload.result.tools as Array<{
      name: string;
      _meta?: Record<string, unknown>;
      inputSchema: {
        properties: Record<
          string,
          { required?: string[]; properties?: object }
        >;
      };
    }>;
    expect(tools.map((t) => t.name)).not.toContain("approve_dispatch");
    const importer = tools.find((t) => t.name === "import_document")!;
    expect(importer._meta?.["openai/fileParams"]).toEqual(["file"]);
    expect(importer.inputSchema.properties.file.required).toEqual([
      "download_url",
      "file_id",
    ]);
    expect(
      Object.keys(importer.inputSchema.properties.file.properties!),
    ).toEqual(["download_url", "file_id", "mime_type", "file_name"]);
  });
  it("requires recorded browser approval and double confirmation creates one reservation", async () => {
    const auth = await credential();
    const call = (name: string, args: unknown, dependencies = services()) =>
      rpc(auth.token, "tools/call", { name, arguments: args }, dependencies);
    const prepared = await call("prepare_dispatch", {
      idempotencyKey: "mcp-prepare-test",
      channel: "email",
      recipient: { email: "reader@example.invalid" },
      subject: "Simulation",
      html: "<p>Bonjour.</p>",
    });
    const dispatch = prepared.payload.result.structuredContent.data as {
      id: string;
      fingerprint: string;
      approvalUrl: string;
    };
    expect(dispatch.approvalUrl).toBe(
      `${origin}/#/app/dispatch/${dispatch.id}`,
    );
    const refused = await call("confirm_dispatch", {
      dispatchId: dispatch.id,
      idempotencyKey: "mcp-confirm-test",
    });
    expect(refused.payload.result.structuredContent.error.code).toBe(
      "APPROVAL_REQUIRED",
    );
    const browser = await authenticateBrowser(
      request("/api/session", "GET", undefined, { Cookie: auth.cookie }),
      env,
    );
    await services().domain.approveDispatch(
      browser.context,
      dispatch.id,
      dispatch.fingerprint,
    );
    const afterConfirmation = vi.fn(async () => {
      throw new Error("Queue temporarily unavailable");
    });
    const results = await Promise.all([
      call(
        "confirm_dispatch",
        { dispatchId: dispatch.id, idempotencyKey: "mcp-confirm-test" },
        { ...services(), afterConfirmation },
      ),
      call("confirm_dispatch", {
        dispatchId: dispatch.id,
        idempotencyKey: "mcp-confirm-test",
      }),
    ]);
    expect(
      results.every(
        (r) => r.payload.result.structuredContent.data.status === "queued",
      ),
    ).toBe(true);
    expect(afterConfirmation).toHaveBeenCalled();
    const rows = await env.DB.prepare(
      "SELECT count(*) n FROM reservations WHERE dispatch_id=?",
    )
      .bind(dispatch.id)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
    const other = await credential("studio");
    const blocked = await rpc(other.token, "tools/call", {
      name: "get_dispatch_status",
      arguments: { dispatchId: dispatch.id },
    });
    expect(blocked.payload.result.structuredContent.error.code).toBe(
      "NOT_FOUND",
    );
  });
  it("rejects missing auth and shares the organization HTTP quota", async () => {
    const denied = await handleMcp(
      request("/mcp", "POST", {}),
      env,
      services(),
    );
    expect(denied.status).toBe(401);
    expect(denied.headers.get("WWW-Authenticate")).toContain(
      "/.well-known/oauth-protected-resource/mcp",
    );
    const auth = await credential("studio");
    await env.DB.prepare(
      "INSERT INTO http_limits(organization_id,window_start,count) VALUES(?,?,180) ON CONFLICT(organization_id,window_start) DO UPDATE SET count=180",
    )
      .bind("org_studio", Math.floor(Date.now() / 60000))
      .run();
    const result = await rpc(auth.token, "tools/list");
    expect(result.response.status).toBe(429);
    expect(result.response.headers.get("Retry-After")).toBe("60");
  });
});
