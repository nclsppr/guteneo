import { readFile } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  authenticateMcp,
  hashSecret,
  type AuthEnv,
} from "../../apps/api/src/auth";
import {
  postalBrowserAuthority,
  postalMcpAuthority,
  type PostalAuthority,
} from "../../apps/api/src/postal-authority";

let mf: Miniflare;
let db: D1Database;
let env: AuthEnv;
let organizationId: string;
let userId: string;
const issuer = "https://postal-authority-fixture.auth0.example/";
const randomSecret = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const keys = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "postal-authority",
  alg: "RS256",
  use: "sig",
};

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "postal-authority-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-17",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of [
    "0001_core.sql",
    "0002_auth.sql",
    "0011_account.sql",
    "0019_verified_account_sessions.sql",
  ]) {
    const sql = await readFile(
      new URL(`../../migrations/${file}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement)
        trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await db.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
    expect(statement.trim()).toBe("");
  }
  await db.prepare("CREATE TABLE authority_writes(id TEXT PRIMARY KEY)").run();
});
afterAll(async () => {
  await mf?.dispose();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
beforeEach(async () => {
  organizationId = `org_${crypto.randomUUID()}`;
  userId = `usr_${crypto.randomUUID()}`;
  const backup = `usr_${crypto.randomUUID()}`;
  env = {
    DB: db,
    MODE: "production",
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://guteneo.example",
    AUTH0_AUTH_POLICY: "verified_email",
    AUTH0_DOMAIN: new URL(issuer).hostname,
    AUTH0_CLIENT_ID: "browser-fixture",
    AUTH0_AUDIENCE: "https://guteneo.example/mcp",
  };
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare("INSERT INTO organizations VALUES(?,'Fixture','production',?)")
      .bind(organizationId, now),
    ...[userId, backup].flatMap((id) => [
      db
        .prepare(
          "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
        )
        .bind(id, now),
      db
        .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
        .bind(organizationId, id, now),
    ]),
  ]);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${issuer}.well-known/jwks.json`)
      return Response.json({ keys: [jwk] });
    throw new Error("Unexpected network access in local fixture");
  });
});

async function browser({
  development = false,
  verified = true,
  mfa = true,
} = {}) {
  const secret = randomSecret();
  const tokenHash = await hashSecret(secret);
  const csrf = randomSecret();
  await db
    .prepare(
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      tokenHash,
      userId,
      organizationId,
      csrf,
      Number(mfa),
      Number(development),
      new Date().toISOString(),
      new Date(Date.now() + 60_000).toISOString(),
      Number(verified),
    )
    .run();
  const request = new Request(`${env.APP_ORIGIN}/api/postal/preflights`, {
    method: "POST",
    headers: {
      Origin: env.APP_ORIGIN,
      "X-CSRF-Token": csrf,
      Cookie: `${env.ENVIRONMENT === "local" ? "" : "__Host-"}guteneo_session=${secret}`,
    },
  });
  return { request, tokenHash, secret, csrf };
}
async function mcp({
  scopes = "documents:write dispatches:prepare",
  mfa = true,
  verified = true,
} = {}) {
  const subject = `auth0|${userId}`;
  const connectionId = crypto.randomUUID();
  const updatedAt = new Date(Date.now() - 1000).toISOString();
  const token = await new SignJWT({
    sub: subject,
    client_id: "postal-client",
    scope: scopes,
    amr: mfa ? ["mfa"] : ["pwd"],
    "https://guteneo.com/verified_account": verified,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(env.AUTH0_AUDIENCE!)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(keys.privateKey);
  await db.batch([
    db
      .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
      .bind(issuer, subject, userId, updatedAt),
    db
      .prepare(
        "INSERT INTO authorized_connections VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(
        connectionId,
        issuer,
        userId,
        "postal-client",
        organizationId,
        updatedAt,
        updatedAt,
      ),
  ]);
  const request = new Request(`${env.APP_ORIGIN}/mcp`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { identity: await authenticateMcp(request, env), token, connectionId };
}
async function permitted(authority: PostalAuthority) {
  const fence = authority.sql();
  return Boolean(
    await db
      .prepare(`SELECT 1 WHERE ${fence.condition}`)
      .bind(...fence.values)
      .first(),
  );
}
function write(authority: PostalAuthority) {
  const fence = authority.sql();
  return db
    .prepare(
      `INSERT INTO authority_writes(id) SELECT ? WHERE ${fence.condition}`,
    )
    .bind(crypto.randomUUID(), ...fence.values);
}

describe("postal browser authority", () => {
  it("requires CSRF and browser credentials, and keeps secrets out of the authority", async () => {
    const session = await browser();
    const authority = await postalBrowserAuthority(session.request, env, true);
    expect(await permitted(authority)).toBe(true);
    await authority.assertCurrent();
    const serialized = JSON.stringify(authority);
    for (const value of [session.secret, session.csrf, session.tokenHash])
      expect(serialized).not.toContain(value);
    expect(authority.sql().values).toContain(session.tokenHash);
    expect(Object.isFrozen(authority.context)).toBe(true);
    const missingCsrf = new Request(session.request);
    missingCsrf.headers.delete("X-CSRF-Token");
    await expect(
      postalBrowserAuthority(missingCsrf, env, true),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    const bearer = new Request(session.request);
    bearer.headers.set("Authorization", "Bearer fixture");
    await expect(postalBrowserAuthority(bearer, env)).rejects.toMatchObject({
      code: "BROWSER_REQUIRED",
    });
  });
  it("fences session revocation in the same D1 batch as a write", async () => {
    const session = await browser();
    const authority = await postalBrowserAuthority(session.request, env);
    const results = await db.batch([
      db
        .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
        .bind(session.tokenHash),
      write(authority),
    ]);
    expect(results[1].meta.changes).toBe(0);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
  it.each(["member", "viewer"])(
    "denies a stale admin after demotion to %s",
    async (role) => {
      const session = await browser();
      const authority = await postalBrowserAuthority(session.request, env);
      await db
        .prepare(
          "UPDATE memberships SET role=? WHERE organization_id=? AND user_id=?",
        )
        .bind(role, organizationId, userId)
        .run();
      expect(await permitted(authority)).toBe(false);
      await expect(authority.assertCurrent()).rejects.toMatchObject({
        code: "POSTAL_AUTHORITY_CHANGED",
      });
    },
  );
  it("does not carry authority across tenant rebinding or mode changes", async () => {
    const session = await browser();
    const authority = await postalBrowserAuthority(session.request, env);
    const other = `org_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await db.batch([
      db
        .prepare("INSERT INTO organizations VALUES(?,'Other','production',?)")
        .bind(other, now),
      db
        .prepare("INSERT INTO memberships VALUES(?,?,'member',?)")
        .bind(other, userId, now),
      db
        .prepare(
          "UPDATE browser_sessions SET organization_id=? WHERE token_hash=?",
        )
        .bind(other, session.tokenHash),
    ]);
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "POSTAL_AUTHORITY_CHANGED",
    });
    await db
      .prepare(
        "UPDATE browser_sessions SET organization_id=? WHERE token_hash=?",
      )
      .bind(organizationId, session.tokenHash)
      .run();
    env.MODE = "simulation";
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "POSTAL_AUTHORITY_CHANGED",
    });
  });
  it("uses the current time and policy for every SQL fence", async () => {
    const session = await browser({ mfa: false });
    const authority = await postalBrowserAuthority(session.request, env);
    env.AUTH0_AUTH_POLICY = "verified_email_and_mfa";
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "MFA_REQUIRED",
    });
    env.AUTH0_AUTH_POLICY = "verified_email";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 120_000);
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
  it("rejects viewers and verification lost after authentication", async () => {
    const session = await browser();
    const authority = await postalBrowserAuthority(session.request, env);
    await db
      .prepare(
        "UPDATE browser_sessions SET verified_account=0 WHERE token_hash=?",
      )
      .bind(session.tokenHash)
      .run();
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "ACCOUNT_VERIFICATION_REQUIRED",
    });
    await db
      .prepare(
        "UPDATE browser_sessions SET verified_account=1 WHERE token_hash=?",
      )
      .bind(session.tokenHash)
      .run();
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(organizationId, userId)
      .run();
    await expect(
      postalBrowserAuthority(session.request, env),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("allows development sessions only on the exact local simulation origin", async () => {
    env = {
      ...env,
      MODE: "simulation",
      ENVIRONMENT: "local",
      APP_ORIGIN: "http://localhost:8787",
    };
    await db
      .prepare("UPDATE organizations SET mode='simulation' WHERE id=?")
      .bind(organizationId)
      .run();
    const session = await browser({
      development: true,
      verified: false,
      mfa: false,
    });
    const authority = await postalBrowserAuthority(session.request, env);
    expect(await permitted(authority)).toBe(true);
    await authority.assertCurrent();
    env.MODE = "production";
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
});

describe("postal MCP authority", () => {
  it("requires a verified scoped identity, persists no token and fences revocation", async () => {
    const fixture = await mcp();
    const authority = await postalMcpAuthority(
      fixture.identity,
      env,
      "documents:write",
    );
    expect(await permitted(authority)).toBe(true);
    expect(JSON.stringify(authority)).not.toContain(fixture.token);
    expect(authority.sql().values).not.toContain(fixture.token);
    const results = await db.batch([
      db
        .prepare(
          "UPDATE authorized_connections SET status='revoked' WHERE id=?",
        )
        .bind(fixture.connectionId),
      write(authority),
    ]);
    expect(results[1].meta.changes).toBe(0);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "CONNECTION_REVOKED",
    });
  });
  it("denies missing scopes and an identity with a forged tenant", async () => {
    const fixture = await mcp({ scopes: "documents:read" });
    await expect(
      postalMcpAuthority(fixture.identity, env, "documents:write"),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_SCOPE" });
    await expect(
      postalMcpAuthority(
        {
          ...fixture.identity,
          context: { ...fixture.identity.context, organizationId: "foreign" },
        },
        env,
        "documents:read",
      ),
    ).rejects.toMatchObject({ code: "POSTAL_AUTHORITY_CHANGED" });
  });
  it.each(["member", "viewer"])(
    "denies demotion to %s after the initial identity",
    async (role) => {
      const fixture = await mcp();
      const authority = await postalMcpAuthority(
        fixture.identity,
        env,
        "documents:write",
      );
      await db
        .prepare(
          "UPDATE memberships SET role=? WHERE organization_id=? AND user_id=?",
        )
        .bind(role, organizationId, userId)
        .run();
      expect(await permitted(authority)).toBe(false);
      await expect(authority.assertCurrent()).rejects.toMatchObject({
        code: "POSTAL_AUTHORITY_CHANGED",
      });
    },
  );
  it("detects an active connection rebound with the same client and tenant", async () => {
    const fixture = await mcp();
    const authority = await postalMcpAuthority(
      fixture.identity,
      env,
      "documents:write",
    );
    await db
      .prepare("UPDATE authorized_connections SET updated_at=? WHERE id=?")
      .bind(new Date().toISOString(), fixture.connectionId)
      .run();
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "POSTAL_AUTHORITY_CHANGED",
    });
  });
  it("rejects a changed connection token cutoff or removed signed identity mapping", async () => {
    const fixture = await mcp();
    const authority = await postalMcpAuthority(
      fixture.identity,
      env,
      "documents:write",
    );
    await db
      .prepare("UPDATE authorized_connections SET not_before=? WHERE id=?")
      .bind(Math.floor(Date.now() / 1000) + 60, fixture.connectionId)
      .run();
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "CONNECTION_REVOKED",
    });
    await db
      .prepare("UPDATE authorized_connections SET not_before=0 WHERE id=?")
      .bind(fixture.connectionId)
      .run();
    await db
      .prepare("DELETE FROM auth_identities WHERE issuer=? AND user_id=?")
      .bind(issuer, userId)
      .run();
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "ONBOARDING_REQUIRED",
    });
  });
  it("uses token expiry and current account policy when generating a new fence", async () => {
    const fixture = await mcp({ mfa: false });
    const authority = await postalMcpAuthority(
      fixture.identity,
      env,
      "documents:write",
    );
    env.AUTH0_AUTH_POLICY = "verified_email_and_mfa";
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "MFA_REQUIRED",
    });
    env.AUTH0_AUTH_POLICY = "verified_email";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((fixture.identity.expiresAt + 60) * 1000);
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
  });
  it("allows hashed development tokens only locally and respects their revocation", async () => {
    env = {
      ...env,
      MODE: "simulation",
      ENVIRONMENT: "local",
      APP_ORIGIN: "http://localhost:8787",
    };
    await db
      .prepare("UPDATE organizations SET mode='simulation' WHERE id=?")
      .bind(organizationId)
      .run();
    const token = `gtn_dev_${randomSecret()}`;
    const hash = await hashSecret(token);
    await db
      .prepare("INSERT INTO development_mcp_tokens VALUES(?,?,?,?)")
      .bind(
        hash,
        userId,
        organizationId,
        new Date(Date.now() + 60_000).toISOString(),
      )
      .run();
    const identity = await authenticateMcp(
      new Request(`${env.APP_ORIGIN}/mcp`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    const authority = await postalMcpAuthority(
      identity,
      env,
      "documents:write",
    );
    expect(await permitted(authority)).toBe(true);
    env.ENVIRONMENT = "production";
    expect(await permitted(authority)).toBe(false);
    await expect(
      postalMcpAuthority(identity, env, "documents:write"),
    ).rejects.toMatchObject({ code: "DEVELOPMENT_AUTH_FORBIDDEN" });
    env.ENVIRONMENT = "local";
    await db
      .prepare("DELETE FROM development_mcp_tokens WHERE token_hash=?")
      .bind(hash)
      .run();
    expect(await permitted(authority)).toBe(false);
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
  });
});

describe("postal read access for viewers", () => {
  it("allows browser reads while write authority stays forbidden", async () => {
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(organizationId, userId)
      .run();
    const session = await browser();
    const authority = await postalBrowserAuthority(session.request, env, false);
    expect(await permitted(authority)).toBe(true);
    await authority.assertCurrent();
    await expect(
      postalBrowserAuthority(session.request, env, true),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("allows OAuth document reads while preparation/write authority stays forbidden", async () => {
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(organizationId, userId)
      .run();
    const fixture = await mcp({
      scopes: "documents:read documents:write dispatches:prepare",
    });
    const authority = await postalMcpAuthority(
      fixture.identity,
      env,
      "documents:read",
    );
    expect(await permitted(authority)).toBe(true);
    await authority.assertCurrent();
    await expect(
      postalMcpAuthority(fixture.identity, env, "documents:write"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
