import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import { readFile, readdir } from "node:fs/promises";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  DomainService,
  type ActorContext,
} from "../../packages/domain/src/index";
import {
  authenticateMcp,
  hashSecret,
  type AuthEnv,
  type McpIdentity,
} from "../../apps/api/src/auth";
import { getExpertStatus } from "../../apps/api/src/expert-status";
import {
  acceptExpertDispatch,
  reviewExpertDispatch,
} from "../../apps/api/src/expert-approval";

let mf: Miniflare,
  db: D1Database,
  env: AuthEnv,
  ctx: ActorContext,
  identity: McpIdentity,
  connection: string,
  domain: DomainService;
const issuer = "https://expert-status-fixture.auth0.example/";
const keys = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "status",
  alg: "RS256",
  use: "sig",
};
const scopes =
  "documents:read documents:write dispatches:read dispatches:prepare dispatches:send";
const now = () => new Date().toISOString();
const later = () => new Date(Date.now() + 3600000).toISOString();
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-17",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    let statement = "",
      trigger = false;
    const batch: D1PreparedStatement[] = [];
    for (const raw of (
      await readFile(
        new URL(`../../migrations/${name}`, import.meta.url),
        "utf8",
      )
    ).split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement)
        trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
      statement += line + "\n";
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        batch.push(db.prepare(statement));
        statement = "";
        trigger = false;
      }
    }
    expect(statement.trim()).toBe("");
    if (batch.length) await db.batch(batch);
  }
});
afterAll(async () => {
  await mf?.dispose();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  const suffix = crypto.randomUUID();
  ctx = {
    organizationId: `org_${suffix}`,
    userId: `usr_${suffix}`,
    role: "admin",
    actor: "mcp",
  };
  connection = `conn_${suffix}`;
  env = {
    DB: db,
    MODE: "simulation",
    ENVIRONMENT: "local",
    APP_ORIGIN: "http://localhost:8787",
    AUTH0_DOMAIN: new URL(issuer).hostname,
    AUTH0_AUDIENCE: "https://status.example/mcp",
    AUTH0_CLIENT_ID: "browser",
    AUTH0_AUTH_POLICY: "verified_email",
  };
  const date = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations VALUES(?,'Status fixture','simulation',?)",
      )
      .bind(ctx.organizationId, date),
    db
      .prepare(
        "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
      )
      .bind(ctx.userId, date),
    db
      .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
      .bind(ctx.organizationId, ctx.userId, date),
    db
      .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
      .bind(issuer, `auth0|${ctx.userId}`, ctx.userId, date),
    db
      .prepare(
        "INSERT INTO authorized_connections VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(
        connection,
        issuer,
        ctx.userId,
        "status-client",
        ctx.organizationId,
        date,
        date,
      ),
    db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Fixture','sender@example.invalid','verified','simulation',?)",
      )
      .bind(`sender_${suffix}`, ctx.organizationId, date),
    db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email',?,1000,50000,'EUR')",
      )
      .bind(ctx.organizationId, date.slice(0, 7)),
    db
      .prepare("INSERT INTO channel_controls VALUES(?,'email',1)")
      .bind(ctx.organizationId),
  ]);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${issuer}.well-known/jwks.json`)
      return Response.json({ keys: [jwk] });
    throw Error("No external provider may run in this fixture");
  });
  identity = await identify();
  domain = new DomainService(db, { mode: "simulation" });
});
async function token(
  permission = scopes,
  client = "status-client",
  override: Record<string, unknown> = {},
) {
  return new SignJWT({
    sub: `auth0|${ctx.userId}`,
    client_id: client,
    scope: permission,
    amr: ["pwd"],
    "https://guteneo.com/verified_account": true,
    ...override,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(env.AUTH0_AUDIENCE!)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(keys.privateKey);
}
async function identify(permission = scopes, client = "status-client") {
  return authenticateMcp(
    new Request(`${env.APP_ORIGIN}/mcp`, {
      headers: { Authorization: `Bearer ${await token(permission, client)}` },
    }),
    env,
  );
}
async function grant({
  daily = 250,
  count = 5,
  channels = '["email","fax","postal"]',
  expires = later(),
} = {}) {
  await db
    .prepare(
      "INSERT INTO expert_approval_policies VALUES(?,?,?,1,1,?,100,?,?,?,?,?)",
    )
    .bind(
      connection,
      ctx.organizationId,
      ctx.userId,
      channels,
      daily,
      count,
      expires,
      now(),
      now(),
    )
    .run();
}
async function prepared() {
  return domain.prepareDispatch(
    ctx,
    {
      channel: "email",
      recipient: { email: "fixture@example.invalid" },
      subject: "Status fixture",
      text: "Synthetic exact original",
      ceilingMinor: 100,
    },
    crypto.randomUUID(),
  );
}
async function reviewed() {
  const doc = await prepared();
  const review = await reviewExpertDispatch(identity, env, domain, doc.id);
  return {
    dispatchId: doc.id,
    fingerprint: review.fingerprint,
    ceilingMinor: review.ceilingMinor,
    reviewToken: review.reviewToken,
    idempotencyKey: crypto.randomUUID(),
    recipientRequested: true,
  };
}
async function snapshot() {
  const result: Record<string, unknown[]> = {};
  for (const table of [
    "authorized_connections",
    "expert_approval_policies",
    "expert_dispatch_reviews",
    "expert_approval_acceptances",
    "approvals",
    "reservations",
    "outbox",
    "audit_log",
  ]) {
    result[table] = (
      await db
        .prepare(
          `SELECT * FROM ${table} WHERE organization_id=? ORDER BY rowid`,
        )
        .bind(ctx.organizationId)
        .all()
    ).results;
  }
  return result;
}

describe("connection-specific expert status is read-only and current", () => {
  it("reports no mandate without creating or granting one, for any diagnostic scope", async () => {
    const before = await snapshot();
    for (const permission of [
      "documents:read",
      "dispatches:read",
      "dispatches:prepare",
      "",
    ]) {
      const result = await getExpertStatus(await identify(permission), env);
      expect(result).toMatchObject({
        state: "inactive",
        code: "delegation_missing",
        canUseExpert: false,
        canTransferPostalDraft: false,
        limits: null,
        daily: null,
        channels: [],
        expiresAt: null,
      });
      expect(result.accountUrl).toBe(
        `${env.APP_ORIGIN}/#/app/account?connection=${encodeURIComponent(connection)}`,
      );
    }
    expect(await snapshot()).toEqual(before);
  });

  it("reads an active mandate, exact limits and distinct postal capability without spending anything", async () => {
    await grant();
    const before = await snapshot();
    const result = await getExpertStatus(identity, env);
    expect(result).toMatchObject({
      state: "active",
      code: "delegation_active",
      canUseExpert: true,
      canTransferPostalDraft: true,
      channels: ["email", "fax", "postal"],
      limits: {
        currency: "EUR",
        maxPerDispatchMinor: 100,
        maxDailyMinor: 250,
        maxDailyCount: 5,
      },
      daily: {
        remainingMinor: 250,
        remainingCount: 5,
        usedCount: 0,
        usedCeilingMinor: 0,
        postalDraftsUsed: 0,
        postalDraftsRemaining: 5,
      },
    });
    expect(result.daily?.day).toBe(result.checkedAt.slice(0, 10));
    expect(result.daily?.resetsAt).toBe(
      new Date(
        Date.parse(`${result.daily?.day}T00:00:00Z`) + 86400000,
      ).toISOString(),
    );
    expect(JSON.stringify(result)).not.toContain(identity.token);
    expect(JSON.stringify(result)).not.toContain(ctx.userId);
    expect(await snapshot()).toEqual(before);
  });

  it("reports missing OAuth permissions as an actionable blocked capability without confusing them with the mandate", async () => {
    await grant();
    const reader = await identify("documents:read dispatches:read");
    const result = await getExpertStatus(reader, env);
    expect(result).toMatchObject({
      state: "active",
      code: "scopes_missing",
      canUseExpert: false,
      canTransferPostalDraft: false,
      nextAction: "reconnect",
      scopes: {
        missing: ["dispatches:send"],
        postalMissing: [
          "documents:write",
          "dispatches:prepare",
          "dispatches:send",
        ],
      },
    });
    expect(result.message).toContain("reconnexion désactive");
    const reviewer = await getExpertStatus(
      await identify("documents:read dispatches:read dispatches:send"),
      env,
    );
    expect(reviewer).toMatchObject({
      canUseExpert: true,
      canTransferPostalDraft: false,
    });
  });

  it("does not infer postal transfer from an active non-postal mandate", async () => {
    await grant({ channels: '["email"]' });
    expect(await getExpertStatus(identity, env)).toMatchObject({
      canUseExpert: true,
      canTransferPostalDraft: false,
    });
  });

  it("distinguishes policy expiration and revocation while retaining their explicit renewal guidance", async () => {
    await grant({ expires: "2000-01-01T00:00:00.000Z" });
    expect(await getExpertStatus(identity, env)).toMatchObject({
      state: "expired",
      code: "delegation_expired",
      canUseExpert: false,
      nextAction: "administrator_setup",
    });
    await db
      .prepare(
        "UPDATE expert_approval_policies SET enabled=0,revision=revision+1 WHERE connection_id=?",
      )
      .bind(connection)
      .run();
    expect(await getExpertStatus(identity, env)).toMatchObject({
      state: "revoked",
      code: "delegation_revoked",
      canUseExpert: false,
      policyRevision: 2,
    });
  });

  it("does not revive a mandate after OAuth revocation/reconnection or disclose policy for stale credentials", async () => {
    await grant();
    await db
      .prepare(
        "UPDATE authorized_connections SET status='revoked',updated_at=? WHERE id=?",
      )
      .bind(later(), connection)
      .run();
    expect(await getExpertStatus(identity, env)).toMatchObject({
      state: "revoked",
      code: "connection_changed",
      canUseExpert: false,
      limits: null,
      daily: null,
    });
    await db
      .prepare(
        "UPDATE authorized_connections SET status='active',not_before=?,updated_at=? WHERE id=?",
      )
      .bind(Math.floor(Date.now() / 1000) + 10, later(), connection)
      .run();
    expect(await getExpertStatus(identity, env)).toMatchObject({
      state: "revoked",
      code: "connection_changed",
      canUseExpert: false,
      limits: null,
    });
    await db
      .prepare(
        "UPDATE authorized_connections SET not_before=0,updated_at=? WHERE id=?",
      )
      .bind(now(), connection)
      .run();
    expect(await getExpertStatus(await identify(), env)).toMatchObject({
      state: "revoked",
      code: "delegation_revoked",
      canUseExpert: false,
    });
    expect(
      await db
        .prepare(
          "SELECT enabled FROM expert_approval_policies WHERE connection_id=?",
        )
        .bind(connection)
        .first(),
    ).toEqual({ enabled: 0 });
  });

  it("never auto-creates a missing connection on a status read", async () => {
    await db
      .prepare("DELETE FROM authorized_connections WHERE id=?")
      .bind(connection)
      .run();
    const before = await snapshot();
    expect(await getExpertStatus(identity, env)).toMatchObject({
      state: "inactive",
      code: "connection_missing",
      canUseExpert: false,
      nextAction: "reconnect",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("cannot read another client's, issuer's or tenant's mandate or usage", async () => {
    await grant();
    const original = identity;
    const other = await identify(scopes, "another-client");
    const result = await getExpertStatus(other, env);
    expect(result).toMatchObject({
      state: "inactive",
      limits: null,
      daily: null,
      channels: [],
    });
    expect(JSON.stringify(result)).not.toContain(connection);
    await db
      .prepare(
        "INSERT INTO authorized_connections VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(
        `foreign_${connection}`,
        "https://other-issuer.example/",
        ctx.userId,
        "status-client",
        ctx.organizationId,
        now(),
        now(),
      )
      .run();
    expect(await getExpertStatus(original, env)).toMatchObject({
      state: "active",
      canUseExpert: true,
    });
    await expect(
      getExpertStatus({ ...original, clientId: "another-client" }, env),
    ).rejects.toMatchObject({ code: "EXPERT_STATUS_AUTHORITY_CHANGED" });
    await expect(
      getExpertStatus(
        { ...original, context: { ...ctx, organizationId: "foreign-tenant" } },
        env,
      ),
    ).rejects.toMatchObject({ code: "EXPERT_STATUS_AUTHORITY_CHANGED" });
    await expect(
      getExpertStatus(original, {
        ...env,
        AUTH0_DOMAIN: "other-issuer.example",
      }),
    ).rejects.toMatchObject({ code: "EXPERT_STATUS_AUTHORITY_CHANGED" });
  });

  it("rechecks current membership, identity mapping, account policy and environment mode before disclosure", async () => {
    await grant();
    await expect(
      getExpertStatus(identity, { ...env, MODE: "production" }),
    ).rejects.toMatchObject({ code: "EXPERT_STATUS_AUTHORITY_CHANGED" });
    await expect(
      getExpertStatus(identity, {
        ...env,
        AUTH0_AUTH_POLICY: "verified_email_and_mfa",
      }),
    ).rejects.toMatchObject({ code: "EXPERT_STATUS_AUTHORITY_CHANGED" });
    await db
      .prepare("DELETE FROM auth_identities WHERE issuer=? AND user_id=?")
      .bind(issuer, ctx.userId)
      .run();
    await expect(getExpertStatus(identity, env)).rejects.toMatchObject({
      code: "EXPERT_STATUS_AUTHORITY_CHANGED",
    });
  });

  it("rejects changed roles and does not advertise expert to a currently authenticated viewer", async () => {
    await grant();
    const backup = `backup_${ctx.userId}`;
    await db.batch([
      db
        .prepare(
          "INSERT INTO users VALUES(?,'Backup','backup@example.invalid',?)",
        )
        .bind(backup, now()),
      db
        .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
        .bind(ctx.organizationId, backup, now()),
      db
        .prepare(
          "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
        )
        .bind(ctx.organizationId, ctx.userId),
    ]);
    await expect(getExpertStatus(identity, env)).rejects.toMatchObject({
      code: "EXPERT_STATUS_AUTHORITY_CHANGED",
    });
    expect(await getExpertStatus(await identify(), env)).toMatchObject({
      state: "inactive",
      code: "administrator_required",
      canUseExpert: false,
      limits: null,
    });
  });

  it("shows current UTC usage across policy revisions without refunding cancellations or reserving a snapshot", async () => {
    await grant({ daily: 200, count: 2 });
    const yesterday = await prepared();
    await db
      .prepare(
        "INSERT INTO expert_approval_acceptances VALUES(?,?,?,1,100,date('now','-1 day'),?)",
      )
      .bind(ctx.organizationId, yesterday.id, connection, now())
      .run();
    const input = await reviewed();
    await acceptExpertDispatch(identity, env, domain, input);
    await domain.cancelDispatch(ctx, input.dispatchId);
    await db
      .prepare(
        "UPDATE expert_approval_policies SET revision=revision+1 WHERE connection_id=?",
      )
      .bind(connection)
      .run();
    const before = await snapshot();
    const [first, second] = await Promise.all([
      getExpertStatus(identity, env),
      getExpertStatus(identity, env),
    ]);
    for (const result of [first, second])
      expect(result.daily).toMatchObject({
        usedCount: 1,
        remainingCount: 1,
        usedCeilingMinor: 100,
        remainingMinor: 100,
      });
    expect(await snapshot()).toEqual(before);
    expect(first.usageBasis).toContain("ne sont pas réservées");
  });

  it("keeps concurrent acceptance atomic when two callers observed the same remaining budget", async () => {
    await grant({ daily: 100 });
    const one = await reviewed(),
      two = await reviewed();
    const [a, b] = await Promise.all([
      getExpertStatus(identity, env),
      getExpertStatus(identity, env),
    ]);
    expect(a.daily?.remainingMinor).toBe(100);
    expect(b.daily?.remainingMinor).toBe(100);
    const accepted = await Promise.allSettled([
      acceptExpertDispatch(identity, env, domain, one),
      acceptExpertDispatch(identity, env, domain, two),
    ]);
    expect(
      accepted.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    expect(accepted.find((entry) => entry.status === "rejected")).toMatchObject(
      { reason: { code: "EXPERT_BUDGET_EXCEEDED" } },
    );
    expect(await getExpertStatus(identity, env)).toMatchObject({
      state: "active",
      canUseExpert: false,
      code: "daily_limit_reached",
      nextAction: "wait_until_reset",
      daily: { remainingMinor: 0, usedCount: 1 },
      canTransferPostalDraft: true,
    });
  });

  it("counts postal draft transfers separately, excludes the previous UTC day and never consumes send budget", async () => {
    await grant({ count: 1 });
    const hash = "a".repeat(64),
      documentId = `doc_${crypto.randomUUID()}`,
      senderId = `postal_${crypto.randomUUID()}`;
    // Synthetic local rows satisfy the real consent guards; no provider is invoked.
    await domain.registerDocument(ctx, {
      id: documentId,
      name: "synthetic.pdf",
      sha256: hash,
      size: 20,
      pages: 1,
      status: "ready",
      source: "import",
      storageKey: `${ctx.organizationId}/synthetic.pdf`,
    });
    await db.batch([
      db
        .prepare(
          "INSERT INTO audit_log VALUES(?,?,NULL,'document.scan_verified',?,'{}',?)",
        )
        .bind(crypto.randomUUID(), ctx.organizationId, hash, now()),
      db
        .prepare("INSERT INTO content_limits VALUES(?,10,10000,10)")
        .bind(ctx.organizationId),
      db
        .prepare(
          "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'postal','Synthetic fixture','Fixture address','verified','production',?)",
        )
        .bind(senderId, ctx.organizationId, now()),
    ]);
    const consent = async (kind: "browser" | "expert", createdAt: string) => {
      const id = `preflight_${crypto.randomUUID()}`;
      await db
        .prepare(
          "INSERT INTO postal_preflights(id,organization_id,user_id,document_id,document_sha256,sender_id,sender_address,recipient_json,options_json,profile_json,expected_address,ceiling_minor,request_hash,input_hash,idempotency_key,status,budget_day,processing_until,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'Fixture address','{}','{}','{}','Fixture address',100,?,?,?,'processing',date('now'),?,?,?,?)",
        )
        .bind(
          id,
          ctx.organizationId,
          ctx.userId,
          documentId,
          hash,
          senderId,
          hash,
          hash,
          id,
          later(),
          later(),
          now(),
          now(),
        )
        .run();
      await db
        .prepare(
          "UPDATE postal_preflights SET status='review_required',report_json='{}' WHERE organization_id=? AND id=?",
        )
        .bind(ctx.organizationId, id)
        .run();
      await db
        .prepare(
          "INSERT INTO postal_transfer_consents(preflight_id,organization_id,user_id,fingerprint,reviewed,transfer_only,created_at,consent_kind,expert_connection_id,expert_policy_revision) VALUES(?,?,?,?,1,1,?,?,?,?)",
        )
        .bind(
          id,
          ctx.organizationId,
          ctx.userId,
          hash,
          createdAt,
          kind,
          kind === "expert" ? connection : null,
          kind === "expert" ? 1 : null,
        )
        .run();
    };
    await consent("expert", new Date(Date.now() - 86400000).toISOString());
    await consent("browser", now());
    expect(await getExpertStatus(identity, env)).toMatchObject({
      canTransferPostalDraft: true,
      daily: {
        postalDraftsUsed: 0,
        postalDraftsRemaining: 1,
        remainingCount: 1,
        remainingMinor: 250,
      },
    });
    await consent("expert", now());
    expect(await getExpertStatus(identity, env)).toMatchObject({
      canUseExpert: true,
      canTransferPostalDraft: false,
      daily: {
        postalDraftsUsed: 1,
        postalDraftsRemaining: 0,
        remainingCount: 1,
        remainingMinor: 250,
      },
    });
  });

  it("fails closed when an already authenticated OAuth credential expires before the diagnostic read", async () => {
    await grant();
    const expiredToken = await new SignJWT({
      sub: `auth0|${ctx.userId}`,
      client_id: identity.clientId,
      scope: scopes,
      "https://guteneo.com/verified_account": true,
    })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(env.AUTH0_AUDIENCE!)
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(keys.privateKey);
    await expect(
      getExpertStatus({ ...identity, token: expiredToken, expiresAt: 2 }, env),
    ).rejects.toMatchObject({ code: "EXPERT_STATUS_AUTHORITY_CHANGED" });
  });

  it("returns connection-specific status through the actual MCP transport with truthful observation metadata", async () => {
    await grant();
    const reader = await identify("documents:read");
    const before = await snapshot();
    const server = createGuteneoMcpServer(reader, env, {
      domain,
      documents: { importFile: vi.fn(), render: vi.fn() },
      capabilities: () => ({ mode: "simulation" }),
    });
    const client = new Client({ name: "status-fixture", version: "1" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const tools = await client.listTools();
      expect(
        tools.tools.find((tool) => tool.name === "get_expert_status")
          ?.annotations,
      ).toMatchObject({ readOnlyHint: false });
      const result = await client.callTool({
        name: "get_expert_status",
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        data: {
          mode: "simulation",
          state: "active",
          canUseExpert: false,
          code: "scopes_missing",
          scopes: { missing: ["dispatches:read", "dispatches:send"] },
        },
      });
      expect(JSON.stringify(result)).not.toContain(reader.token);
      expect(JSON.stringify(result)).not.toContain("token_hash");
      expect(await snapshot()).toEqual(before);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("never treats a development token as a production credential and validates local token expiry", async () => {
    const secret = `gtn_dev_${crypto.randomUUID()}`;
    const expiry = later();
    await db
      .prepare("INSERT INTO development_mcp_tokens VALUES(?,?,?,?)")
      .bind(await hashSecret(secret), ctx.userId, ctx.organizationId, expiry)
      .run();
    const local = await authenticateMcp(
      new Request(`${env.APP_ORIGIN}/mcp`, {
        headers: { Authorization: `Bearer ${secret}` },
      }),
      env,
    );
    expect(await getExpertStatus(local, env)).toMatchObject({
      state: "inactive",
      code: "connection_missing",
    });
    await expect(
      getExpertStatus(local, {
        ...env,
        MODE: "production",
        ENVIRONMENT: "production",
      }),
    ).rejects.toMatchObject({ code: "DEVELOPMENT_AUTH_FORBIDDEN" });
    await db
      .prepare(
        "UPDATE development_mcp_tokens SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?",
      )
      .bind(await hashSecret(secret))
      .run();
    await expect(getExpertStatus(local, env)).rejects.toMatchObject({
      code: "EXPERT_STATUS_AUTHORITY_CHANGED",
    });
  });
});
