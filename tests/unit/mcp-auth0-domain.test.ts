import { readFile, readdir } from "node:fs/promises";
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
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { discoverAuthorizationServerMetadata } from "@modelcontextprotocol/client";
import {
  authenticateMcp,
  mcpAuthorizationIssuer,
  protectedResourceMetadata,
  requireScope,
  type AuthEnv,
} from "../../apps/api/src/auth";
import { postalMcpAuthority } from "../../apps/api/src/postal-authority";
import { getExpertStatus } from "../../apps/api/src/expert-status";
import { expertAuthority } from "../../apps/api/src/expert-approval";

const canonical = "https://pieper.eu.auth0.com/";
const custom = "https://auth.guteneo.com/";
const keys = await generateKeyPair("RS256");
const foreignKeys = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "mcp-domain-fixture",
  alg: "RS256",
  use: "sig",
};
let mf: Miniflare;
let db: D1Database;
let env: AuthEnv;
let userId: string;
let organizationId: string;
let connectionId: string;
let clientId: string;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "mcp-auth0-domain-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-17",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
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
});
afterAll(async () => {
  await mf?.dispose();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  const suffix = crypto.randomUUID();
  userId = `user_${suffix}`;
  organizationId = `org_${suffix}`;
  connectionId = `connection_${suffix}`;
  clientId = `client_${suffix}`;
  env = {
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    AUTH0_DOMAIN: "pieper.eu.auth0.com",
    AUTH0_CLIENT_ID: "browser-fixture",
    AUTH0_AUDIENCE: "https://guteneo.example/mcp",
    AUTH0_AUTH_POLICY: "verified_email",
    AUTH0_MCP_TRUSTED_DOMAIN: "auth.guteneo.com",
    AUTH0_MCP_DISCOVERY: "custom",
  };
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations VALUES(?,'Synthetic workshop','production',?)",
      )
      .bind(organizationId, now),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Synthetic reader','synthetic@example.invalid',?)",
      )
      .bind(userId, now),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(organizationId, userId, now),
    db
      .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
      .bind(canonical, `auth0|${userId}`, userId, now),
    db
      .prepare(
        "INSERT INTO authorized_connections VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(
        connectionId,
        canonical,
        userId,
        clientId,
        organizationId,
        now,
        now,
      ),
  ]);
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const target = input instanceof Request ? input.url : String(input);
    if (target === `${canonical}.well-known/jwks.json`)
      return Response.json({ keys: [jwk] });
    throw new Error(
      "Only the configured canonical signing-key endpoint may be requested.",
    );
  });
});

async function signed(
  tokenIssuer = custom,
  claims: Record<string, unknown> = {},
  options: {
    audience?: string;
    foreignKey?: boolean;
    issuedAt?: number;
    expiresAt?: number;
    algorithm?: "RS256" | "HS256";
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: `auth0|${userId}`,
    client_id: clientId,
    scope:
      "documents:read documents:write dispatches:prepare dispatches:send dispatches:read",
    "https://guteneo.com/verified_account": true,
    ...claims,
  })
    .setProtectedHeader({ alg: options.algorithm ?? "RS256", kid: jwk.kid })
    .setIssuer(tokenIssuer)
    .setAudience(options.audience ?? env.AUTH0_AUDIENCE!)
    .setIssuedAt(options.issuedAt ?? now)
    .setExpirationTime(options.expiresAt ?? now + 300)
    .sign(
      options.algorithm === "HS256"
        ? new TextEncoder().encode("synthetic-hmac-secret-long-enough")
        : options.foreignKey
          ? foreignKeys.privateKey
          : keys.privateKey,
    );
}
function identify(token: string, configured = env) {
  return authenticateMcp(
    new Request(`${env.APP_ORIGIN}/mcp`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    configured,
  );
}

describe("bounded MCP custom-domain migration", () => {
  it("discovers the selected exact custom issuer with the official SDK and rejects metadata drift", async () => {
    const metadata = (await protectedResourceMetadata(env).json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(metadata).toMatchObject({
      resource: env.AUTH0_AUDIENCE,
      authorization_servers: [custom],
      resource_documentation: `${env.APP_ORIGIN}/developers/?lang=en`,
    });
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        `${custom}.well-known/oauth-authorization-server`,
      );
      return Response.json({
        issuer: custom,
        authorization_endpoint: `${custom}authorize`,
        token_endpoint: `${custom}oauth/token`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      });
    });
    await expect(
      discoverAuthorizationServerMetadata(metadata.authorization_servers[0], {
        fetchFn,
      }),
    ).resolves.toMatchObject({ issuer: custom });
    fetchFn.mockResolvedValueOnce(
      Response.json({
        issuer: canonical,
        authorization_endpoint: `${custom}authorize`,
        token_endpoint: `${custom}oauth/token`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      }),
    );
    await expect(
      discoverAuthorizationServerMetadata(custom, { fetchFn }),
    ).rejects.toMatchObject({ name: "IssuerMismatchError" });
  });

  it("retains the same user, workshop and connection for both verified token issuers without creating aliases", async () => {
    const previous = await identify(await signed(canonical));
    const keyReads = fetchSpy.mock.calls.length;
    const current = await identify(await signed(custom));
    expect(fetchSpy.mock.calls).toHaveLength(keyReads);
    expect(current.context).toEqual(previous.context);
    expect(current.context).toMatchObject({ userId, organizationId });
    expect(previous.verifiedTokenIssuer).toBe(canonical);
    expect(current.verifiedTokenIssuer).toBe(custom);
    expect(
      await db
        .prepare("SELECT issuer,id FROM authorized_connections WHERE user_id=?")
        .bind(userId)
        .all(),
    ).toMatchObject({ results: [{ issuer: canonical, id: connectionId }] });
    expect(
      await db
        .prepare("SELECT issuer,user_id FROM auth_identities WHERE user_id=?")
        .bind(userId)
        .all(),
    ).toMatchObject({ results: [{ issuer: canonical, user_id: userId }] });
    expect(
      fetchSpy.mock.calls.every(
        (call: unknown[]) =>
          String(call[0]) === `${canonical}.well-known/jwks.json`,
      ),
    ).toBe(true);
  });

  it("rolls discovery back independently while both existing token families remain valid", async () => {
    const oldToken = await signed(canonical);
    const newToken = await signed(custom);
    env.AUTH0_MCP_DISCOVERY = "canonical";
    expect(mcpAuthorizationIssuer(env)).toBe(canonical);
    expect((await identify(oldToken)).context.userId).toBe(userId);
    expect((await identify(newToken)).context.userId).toBe(userId);
    delete env.AUTH0_MCP_DISCOVERY;
    expect(mcpAuthorizationIssuer(env)).toBe(canonical);
    expect((await identify(newToken)).verifiedTokenIssuer).toBe(custom);
  });

  it("does not inherit MCP trust from a browser-only alias and fails closed when that trust is explicitly removed", async () => {
    delete env.AUTH0_MCP_TRUSTED_DOMAIN;
    delete env.AUTH0_MCP_DISCOVERY;
    env.AUTH0_BROWSER_DOMAIN = "auth.guteneo.com";
    expect(mcpAuthorizationIssuer(env)).toBe(canonical);
    await expect(identify(await signed(custom))).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
    expect((await identify(await signed(canonical))).context.userId).toBe(
      userId,
    );
  });

  it.each([
    { AUTH0_MCP_TRUSTED_DOMAIN: undefined, AUTH0_MCP_DISCOVERY: "custom" },
    { AUTH0_MCP_TRUSTED_DOMAIN: "" },
    { AUTH0_MCP_TRUSTED_DOMAIN: "foreign.example" },
    { AUTH0_MCP_TRUSTED_DOMAIN: "auth.guteneo.com/path" },
    { AUTH0_MCP_TRUSTED_DOMAIN: "https://user@auth.guteneo.com/" },
    { AUTH0_MCP_TRUSTED_DOMAIN: "http://auth.guteneo.com" },
    { AUTH0_MCP_TRUSTED_DOMAIN: "auth.guteneo.com:8443" },
    { AUTH0_DOMAIN: "other-tenant.auth0.com" },
    { AUTH0_MCP_DISCOVERY: "unknown" },
  ])(
    "rejects invalid custom configuration before discovery or authentication: %j",
    async (changes) => {
      const configured = { ...env, ...changes };
      expect(() => protectedResourceMetadata(configured)).toThrowError(
        "Invalid identity configuration.",
      );
      await expect(identify(await signed(), configured)).rejects.toMatchObject({
        code: "IDENTITY_CONFIG_INVALID",
        status: 503,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([canonical, custom])(
    "preserves revocation and not-before fences for %s",
    async (tokenIssuer) => {
      const token = await signed(tokenIssuer);
      await db
        .prepare("UPDATE authorized_connections SET not_before=? WHERE id=?")
        .bind(Math.floor(Date.now() / 1000) + 30, connectionId)
        .run();
      await expect(identify(token)).rejects.toMatchObject({
        code: "CONNECTION_REVOKED",
      });
      await db
        .prepare(
          "UPDATE authorized_connections SET not_before=0,status='revoked' WHERE id=?",
        )
        .bind(connectionId)
        .run();
      await expect(identify(token)).rejects.toMatchObject({
        code: "CONNECTION_REVOKED",
      });
      expect(
        await db
          .prepare(
            "SELECT count(*) count FROM authorized_connections WHERE user_id=?",
          )
          .bind(userId)
          .first(),
      ).toEqual({ count: 1 });
    },
  );

  it.each([
    { tokenIssuer: "https://foreign.example/" },
    { audience: "https://other.example/mcp" },
    { audience: "browser-fixture" },
    { foreignKey: true },
    { algorithm: "HS256" as const },
    { issuedAt: 1, expiresAt: 60 },
    {
      issuedAt: Math.floor(Date.now() / 1000) - 3601,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    },
  ])(
    "rejects invalid signed proof without widening trust: %j",
    async ({ tokenIssuer, ...options }) => {
      await expect(
        identify(await signed(tokenIssuer ?? custom, {}, options)),
      ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
      expect(
        fetchSpy.mock.calls.every(
          (call: unknown[]) =>
            String(call[0]) === `${canonical}.well-known/jwks.json`,
        ),
      ).toBe(true);
    },
  );

  it.each([false, "true", null])(
    "does not turn a domain alias into account-verification evidence: %j",
    async (verified) => {
      await expect(
        identify(
          await signed(custom, {
            "https://guteneo.com/verified_account": verified,
          }),
        ),
      ).rejects.toMatchObject({ code: "ACCOUNT_VERIFICATION_REQUIRED" });
    },
  );

  it("retains historical administrator MFA and scope boundaries", async () => {
    env.AUTH0_AUTH_POLICY = "verified_email_and_mfa";
    await expect(identify(await signed(custom))).rejects.toMatchObject({
      code: "MFA_REQUIRED",
    });
    const reader = await identify(
      await signed(custom, { amr: ["mfa"], scope: "documents:read" }),
    );
    expect(() => requireScope(reader, "documents:write")).toThrow();
  });

  it("uses canonical postal/expert fences for a verified custom token and grants no mandate", async () => {
    const identity = await identify(await signed());
    const authority = await postalMcpAuthority(
      identity,
      env,
      "documents:write",
    );
    const fence = authority.sql();
    expect(fence.values).toContain(canonical);
    expect(fence.values).not.toContain(custom);
    expect(
      await db
        .prepare(`SELECT 1 allowed WHERE ${fence.condition}`)
        .bind(...fence.values)
        .first(),
    ).toEqual({ allowed: 1 });
    await expect(authority.assertCurrent()).resolves.toBeUndefined();
    await expect(getExpertStatus(identity, env)).resolves.toMatchObject({
      state: "inactive",
      code: "delegation_missing",
      canUseExpert: false,
    });
    await expect(expertAuthority(identity, env)).rejects.toMatchObject({
      code: "EXPERT_OPT_IN_REQUIRED",
    });
    await expect(
      postalMcpAuthority(
        { ...identity, verifiedTokenIssuer: canonical },
        env,
        "documents:write",
      ),
    ).rejects.toMatchObject({ code: "POSTAL_AUTHORITY_CHANGED" });
    await db
      .prepare("UPDATE authorized_connections SET status='revoked' WHERE id=?")
      .bind(connectionId)
      .run();
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "CONNECTION_REVOKED",
    });
    await expect(getExpertStatus(identity, env)).resolves.toMatchObject({
      canUseExpert: false,
    });
  });

  it("retains an existing bounded canonical mandate and observes its revocation with a custom token", async () => {
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 3600_000).toISOString();
    // Synthetic prior browser authorization; the OAuth authentication creates none.
    await db
      .prepare(
        "INSERT INTO expert_approval_policies VALUES(?,?,?,1,1,'[\"email\"]',100,250,5,?,?,?)",
      )
      .bind(connectionId, organizationId, userId, expires, now, now)
      .run();
    const identity = await identify(await signed());
    await expect(getExpertStatus(identity, env)).resolves.toMatchObject({
      state: "active",
      canUseExpert: true,
      limits: {
        maxPerDispatchMinor: 100,
        maxDailyMinor: 250,
        maxDailyCount: 5,
      },
      expiresAt: expires,
    });
    const { authority, policy } = await expertAuthority(identity, env);
    expect(policy.connection_id).toBe(connectionId);
    env.AUTH0_MCP_DISCOVERY = "canonical";
    await expect(authority.assertCurrent()).resolves.toBeUndefined();
    await db
      .prepare(
        "UPDATE expert_approval_policies SET enabled=0,revision=revision+1 WHERE connection_id=?",
      )
      .bind(connectionId)
      .run();
    await expect(authority.assertCurrent()).rejects.toMatchObject({
      code: "EXPERT_AUTHORITY_CHANGED",
    });
    await expect(getExpertStatus(identity, env)).resolves.toMatchObject({
      state: "revoked",
      canUseExpert: false,
    });
  });
});
