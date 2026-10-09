import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  authenticateBrowser,
  authenticateMcp,
  handleAuthRoute,
  type AuthEnv,
  type AuthenticatedSession,
} from "../../apps/api/src/auth";
import { recordConnectionEvent } from "../../apps/api/src/belvedere-telemetry";

let mf: Miniflare;
let db: D1Database;
let env: AuthEnv;
const origin = "https://guteneo-telemetry.example.test";
const issuer = "https://guteneo-telemetry-auth0.example.test/";
const keyPair = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keyPair.publicKey)),
  kid: "auth-telemetry-fixture-key",
  alg: "RS256",
  use: "sig",
};

function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    country?: string;
  } = {},
) {
  const value = new Request(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Origin: origin,
      "CF-Connecting-IP": "192.0.2.10",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  // The synthetic Workers property is deliberately separate from user headers.
  if (options.country)
    Object.defineProperty(value, "cf", { value: { country: options.country } });
  return value;
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "auth-telemetry-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  env = {
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: origin,
    AUTH0_DOMAIN: new URL(issuer).hostname,
    AUTH0_CLIENT_ID: "guteneo-telemetry-browser",
    AUTH0_CLIENT_SECRET: "synthetic-confidential-client",
    AUTH0_AUDIENCE: `${origin}/mcp`,
    AUTH0_AUTH_POLICY: "verified_email",
  };
  for (const filename of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${filename}`, import.meta.url),
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
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
afterAll(async () => mf?.dispose());

async function sign(audience: string, claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keyPair.privateKey);
}

async function loginFlow(configured: AuthEnv = env) {
  const started = (await handleAuthRoute(request("/auth/signup"), configured))!;
  const destination = new URL(started.headers.get("Location")!);
  const sub = `auth0|telemetry-${crypto.randomUUID()}`;
  const claims = {
    sub,
    name: "Synthetic telemetry member",
    email: `${crypto.randomUUID()}@example.invalid`,
    email_verified: true,
    amr: ["pwd"],
    "https://guteneo.com/verified_account": true,
  };
  const idToken = await sign("guteneo-telemetry-browser", {
    ...claims,
    nonce: destination.searchParams.get("nonce"),
  });
  const accessToken = await sign(`${origin}/mcp`, {
    sub,
    client_id: "guteneo-telemetry-browser",
    "https://guteneo.com/verified_account": true,
  });
  // Provider transport is synthetic; JWT verification and all auth D1 queries
  // still use their real implementations and migration constraints.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${issuer}oauth/token`)
      return Response.json({ id_token: idToken, access_token: accessToken });
    if (url === `${issuer}.well-known/jwks.json`)
      return Response.json({ keys: [jwk] });
    throw new Error("Unexpected synthetic identity-provider target");
  });
  const callback = request(
    `/auth/callback?state=${destination.searchParams.get("state")}&code=synthetic-code`,
    {
      headers: { Cookie: started.headers.get("Set-Cookie")!.split(";")[0] },
      country: "LU",
    },
  );
  return {
    sub,
    configured,
    complete: () => handleAuthRoute(callback, configured),
  };
}

const sessionCookie = (response: Response) => {
  const value = response.headers
    .get("Set-Cookie")
    ?.match(/__Host-guteneo_session=[^;,]+/)?.[0];
  if (!value)
    throw new Error("Synthetic authentication issued no session cookie");
  return value;
};

async function loggedIn() {
  const flow = await loginFlow();
  const completed = (await flow.complete())!;
  const cookie = sessionCookie(completed);
  const browser = await authenticateBrowser(
    request("/api/session", { headers: { Cookie: cookie } }),
    env,
  );
  return { ...flow, browser, cookie };
}

/** Only the optional event INSERT can fail. All security-related SQL runs on D1. */
function telemetryDatabase() {
  let attempts = 0;
  let fail = false;
  const wrapped = new Proxy(db, {
    get(target, property) {
      if (property !== "prepare") {
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (sql: string) => {
        const statement = target.prepare(sql);
        if (!/INSERT\s+OR\s+IGNORE\s+INTO\s+connection_events/i.test(sql))
          return statement;
        attempts += 1;
        return new Proxy(statement, {
          get(original, field) {
            if (field === "bind")
              return (...values: unknown[]) => {
                const bound = original.bind(...values);
                return new Proxy(bound, {
                  get(value, method) {
                    if (method === "run")
                      return async () => {
                        if (fail) throw new Error("Synthetic telemetry outage");
                        return value.run();
                      };
                    const result = Reflect.get(value, method);
                    return typeof result === "function"
                      ? result.bind(value)
                      : result;
                  },
                });
              };
            const value = Reflect.get(original, field);
            return typeof value === "function" ? value.bind(original) : value;
          },
        });
      };
    },
  }) as D1Database;
  return {
    db: wrapped,
    get attempts() {
      return attempts;
    },
    set failing(value: boolean) {
      fail = value;
    },
  };
}

async function mcpRequest(sub: string, clientId: string) {
  const bearer = await sign(`${origin}/mcp`, {
    sub,
    client_id: clientId,
    scope: "documents:read dispatches:read",
    "https://guteneo.com/verified_account": true,
  });
  return request("/mcp", {
    method: "POST",
    body: {},
    headers: { Authorization: `Bearer ${bearer}` },
    country: "FR",
  });
}

async function addWorkspace(session: AuthenticatedSession) {
  const organizationId = `org_telemetry_${crypto.randomUUID()}`;
  const stamp = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Synthetic second workshop','production',?)",
      )
      .bind(organizationId, stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(organizationId, session.context.userId, stamp),
  ]);
  return organizationId;
}

function switchRequest(
  cookie: string,
  session: AuthenticatedSession,
  organizationId: string,
) {
  return request("/api/account/workspace", {
    method: "POST",
    body: { organizationId },
    headers: { Cookie: cookie, "X-CSRF-Token": session.csrfToken },
    country: "DE",
  });
}

it("keeps valid MCP authority when optional telemetry fails and retries only its observation", async () => {
  const fixture = await loggedIn();
  const instrumented = telemetryDatabase();
  instrumented.failing = true;
  const configured = { ...env, DB: instrumented.db };
  const clientId = `telemetry-client-${crypto.randomUUID()}`;
  const authorization = await mcpRequest(fixture.sub, clientId);
  const identity = await authenticateMcp(authorization, configured);
  expect(identity).toMatchObject({
    context: { ...fixture.browser.context, actor: "mcp" },
    clientId,
    scopes: ["documents:read", "dispatches:read"],
  });
  expect(instrumented.attempts).toBe(1);
  const connection = await db
    .prepare(
      "SELECT id FROM authorized_connections WHERE issuer=? AND user_id=? AND client_id=?",
    )
    .bind(issuer, fixture.browser.context.userId, clientId)
    .first<{ id: string }>();
  expect(connection).not.toBeNull();
  expect(
    await db
      .prepare("SELECT id FROM connection_events WHERE connection_id=?")
      .bind(connection!.id)
      .first(),
  ).toBeNull();
  instrumented.failing = false;
  expect((await authenticateMcp(authorization, configured)).scopes).toEqual(
    identity.scopes,
  );
  expect(instrumented.attempts).toBe(2);
  expect(
    await db
      .prepare("SELECT count(*) n FROM connection_events WHERE connection_id=?")
      .bind(connection!.id)
      .first(),
  ).toEqual({ n: 1 });
  await db
    .prepare("UPDATE authorized_connections SET status='revoked' WHERE id=?")
    .bind(connection!.id)
    .run();
  await expect(
    authenticateMcp(authorization, configured),
  ).rejects.toMatchObject({ code: "CONNECTION_REVOKED" });
  expect(instrumented.attempts).toBe(2);
});

it("coalesces same-client observations before D1 without caching authentication", async () => {
  const fixture = await loggedIn();
  const instrumented = telemetryDatabase();
  const configured = { ...env, DB: instrumented.db };
  const clientId = `telemetry-cache-client-${crypto.randomUUID()}`;
  const authorization = await mcpRequest(fixture.sub, clientId);
  const identities = await Promise.all([
    authenticateMcp(authorization, configured),
    authenticateMcp(authorization, configured),
    authenticateMcp(authorization, configured),
  ]);
  expect(
    identities.every(
      (identity) => identity.context.userId === fixture.browser.context.userId,
    ),
  ).toBe(true);
  await authenticateMcp(authorization, configured);
  expect(instrumented.attempts).toBe(1);
  const replacementAdmin = `usr_telemetry_admin_${crypto.randomUUID()}`;
  const stamp = new Date().toISOString();
  // Respect the real last-administrator guard before lowering this role.
  await db.batch([
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Synthetic replacement administrator','replacement@example.invalid',?)",
      )
      .bind(replacementAdmin, stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(fixture.browser.context.organizationId, replacementAdmin, stamp),
  ]);
  await db
    .prepare(
      "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
    )
    .bind(
      fixture.browser.context.organizationId,
      fixture.browser.context.userId,
    )
    .run();
  expect((await authenticateMcp(authorization, configured)).context.role).toBe(
    "viewer",
  );
  expect(instrumented.attempts).toBe(1);
});

it("keeps observation cache keys separate by organization and UTC day", async () => {
  const fixture = await loggedIn();
  const nextOrganization = await addWorkspace(fixture.browser);
  const instrumented = telemetryDatabase();
  const connectionId = `synthetic-cache-${crypto.randomUUID()}`;
  const event = {
    organizationId: fixture.browser.context.organizationId,
    userId: fixture.browser.context.userId,
    kind: "mcp" as const,
    connectionId,
  };
  const observedRequest = request("/mcp", { country: "FR" });
  const noon = new Date(
    `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`,
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(noon);
  await recordConnectionEvent(instrumented.db, observedRequest, event);
  await recordConnectionEvent(instrumented.db, observedRequest, event);
  expect(instrumented.attempts).toBe(1);
  // Distinct D1 bindings keep independent in-memory caches; SQL still prevents
  // a duplicate persisted event for the same connection/day.
  const secondBinding = telemetryDatabase();
  await recordConnectionEvent(secondBinding.db, observedRequest, event);
  expect(secondBinding.attempts).toBe(1);
  expect(
    await db
      .prepare("SELECT count(*) n FROM connection_events WHERE connection_id=?")
      .bind(connectionId)
      .first(),
  ).toEqual({ n: 1 });
  vi.setSystemTime(new Date(noon.getTime() + 16 * 60000));
  await recordConnectionEvent(instrumented.db, observedRequest, event);
  expect(instrumented.attempts).toBe(2);
  expect(
    await db
      .prepare("SELECT count(*) n FROM connection_events WHERE connection_id=?")
      .bind(connectionId)
      .first(),
  ).toEqual({ n: 1 });
  await recordConnectionEvent(instrumented.db, observedRequest, {
    ...event,
    organizationId: nextOrganization,
  });
  expect(instrumented.attempts).toBe(3);
  vi.setSystemTime(new Date(noon.getTime() + 86400000));
  await recordConnectionEvent(instrumented.db, observedRequest, event);
  expect(instrumented.attempts).toBe(4);
  expect(
    await db
      .prepare("SELECT count(*) n FROM connection_events WHERE connection_id=?")
      .bind(connectionId)
      .first(),
  ).toEqual({ n: 3 });
});

it("observes the rotated browser ID in its new workspace and request country", async () => {
  const fixture = await loggedIn();
  const previous = await db
    .prepare("SELECT public_id FROM browser_sessions WHERE token_hash=?")
    .bind(fixture.browser.tokenHash)
    .first<{ public_id: string }>();
  const nextOrganization = await addWorkspace(fixture.browser);
  const response = (await handleAuthRoute(
    switchRequest(fixture.cookie, fixture.browser, nextOrganization),
    env,
  ))!;
  expect(response.status).toBe(200);
  const nextCookie = sessionCookie(response);
  const next = await authenticateBrowser(
    request("/api/session", {
      headers: { Cookie: nextCookie },
    }),
    env,
  );
  const current = await db
    .prepare("SELECT public_id FROM browser_sessions WHERE token_hash=?")
    .bind(next.tokenHash)
    .first<{ public_id: string }>();
  expect(current?.public_id).not.toBe(previous?.public_id);
  expect(
    await db
      .prepare(
        "SELECT organization_id,user_id,kind,country FROM connection_events WHERE connection_id=?",
      )
      .bind(current!.public_id)
      .first(),
  ).toEqual({
    organization_id: nextOrganization,
    user_id: fixture.browser.context.userId,
    kind: "browser",
    country: "DE",
  });
  expect(
    await db
      .prepare(
        "SELECT organization_id,user_id,kind,country FROM connection_events WHERE connection_id=?",
      )
      .bind(previous!.public_id)
      .first(),
  ).toEqual({
    organization_id: fixture.browser.context.organizationId,
    user_id: fixture.browser.context.userId,
    kind: "browser",
    country: "LU",
  });
  await expect(
    authenticateBrowser(
      request("/api/session", {
        headers: { Cookie: fixture.cookie },
      }),
      env,
    ),
  ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
});

it("returns a usable rotated session and preserves identity proof during a telemetry outage", async () => {
  const fixture = await loggedIn();
  const nextOrganization = await addWorkspace(fixture.browser);
  const previousProof = await db
    .prepare(
      "SELECT issuer,subject,verified_email,authenticated_at FROM browser_identity_evidence WHERE token_hash=?",
    )
    .bind(fixture.browser.tokenHash)
    .first();
  const instrumented = telemetryDatabase();
  instrumented.failing = true;
  const response = (await handleAuthRoute(
    switchRequest(fixture.cookie, fixture.browser, nextOrganization),
    { ...env, DB: instrumented.db },
  ))!;
  expect(response.status).toBe(200);
  expect(instrumented.attempts).toBe(1);
  const next = await authenticateBrowser(
    request("/api/session", {
      headers: { Cookie: sessionCookie(response) },
    }),
    env,
  );
  expect(next.context).toMatchObject({
    organizationId: nextOrganization,
    userId: fixture.browser.context.userId,
    role: "admin",
    actor: "browser",
  });
  expect(next.tokenHash).not.toBe(fixture.browser.tokenHash);
  expect(
    await db
      .prepare(
        "SELECT issuer,subject,verified_email,authenticated_at FROM browser_identity_evidence WHERE token_hash=?",
      )
      .bind(next.tokenHash)
      .first(),
  ).toEqual(previousProof);
  await expect(
    authenticateBrowser(
      request("/api/session", {
        headers: { Cookie: fixture.cookie },
      }),
      env,
    ),
  ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
});

it("completes signed browser login when its optional observation cannot be written", async () => {
  const instrumented = telemetryDatabase();
  instrumented.failing = true;
  const configured = { ...env, DB: instrumented.db };
  const flow = await loginFlow(configured);
  const completed = (await flow.complete())!;
  expect(completed.status).toBe(302);
  expect(instrumented.attempts).toBe(1);
  const session = await authenticateBrowser(
    request("/api/session", {
      headers: { Cookie: sessionCookie(completed) },
    }),
    env,
  );
  expect(session.verifiedAccount).toBe(true);
  expect(
    await db
      .prepare(
        "SELECT issuer,subject FROM browser_identity_evidence WHERE token_hash=?",
      )
      .bind(session.tokenHash)
      .first(),
  ).toEqual({ issuer, subject: flow.sub });
});
