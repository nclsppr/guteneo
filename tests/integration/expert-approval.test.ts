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
import {
  reviewExpertDispatch,
  acceptExpertDispatch,
  expertAuthority,
  expertPostalAuthority,
} from "../../apps/api/src/expert-approval";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";

let mf: Miniflare,
  db: D1Database,
  domain: DomainService,
  env: AuthEnv,
  ctx: ActorContext,
  identity: McpIdentity,
  connection: string;
const issuer = "https://expert-fixture.auth0.example/";
const keys = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "expert",
  alg: "RS256",
  use: "sig",
};
const now = () => new Date().toISOString();
const later = (ms = 3600000) => new Date(Date.now() + ms).toISOString();
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
    AUTH0_AUDIENCE: "https://expert.example/mcp",
    AUTH0_CLIENT_ID: "browser",
    AUTH0_AUTH_POLICY: "verified_email",
  };
  const date = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations VALUES(?,'Expert fixture','simulation',?)",
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
        "expert-client",
        ctx.organizationId,
        date,
        date,
      ),
  ]);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${issuer}.well-known/jwks.json`)
      return Response.json({ keys: [jwk] });
    throw Error("No external provider may run in this fixture");
  });
  identity = await authenticateMcp(
    new Request(`${env.APP_ORIGIN}/mcp`, {
      headers: { Authorization: `Bearer ${await token()}` },
    }),
    env,
  );
  domain = new DomainService(db, { mode: "simulation" });
});
async function token(
  client = "expert-client",
  scopes = "documents:read documents:write dispatches:read dispatches:prepare dispatches:send",
) {
  return new SignJWT({
    sub: `auth0|${ctx.userId}`,
    client_id: client,
    scope: scopes,
    amr: ["pwd"],
    "https://guteneo.com/verified_account": true,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(env.AUTH0_AUDIENCE!)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(keys.privateKey);
}
async function grant({
  max = 100,
  daily = 250,
  count = 20,
  channels = '["email"]',
} = {}) {
  await db
    .prepare(
      "INSERT INTO expert_approval_policies VALUES(?,?,?,1,1,?,?,?,?,?,?,?)",
    )
    .bind(
      connection,
      ctx.organizationId,
      ctx.userId,
      channels,
      max,
      daily,
      count,
      later(),
      now(),
      now(),
    )
    .run();
}
async function prepare(ceiling = 100) {
  return domain.prepareDispatch(
    ctx,
    {
      channel: "email",
      recipient: { email: "recipient@example.invalid" },
      subject: "Immutable fixture",
      text: "Original content",
      ceilingMinor: ceiling,
    },
    crypto.randomUUID(),
  );
}
async function reviewed(ceiling = 100) {
  const dispatch = await prepare(ceiling);
  const review = await reviewExpertDispatch(identity, env, domain, dispatch.id);
  return {
    dispatch,
    review,
    input: {
      dispatchId: dispatch.id,
      fingerprint: dispatch.fingerprint,
      ceilingMinor: ceiling,
      reviewToken: review.reviewToken,
      idempotencyKey: crypto.randomUUID(),
    },
  };
}
async function count(table: string) {
  return (await db
    .prepare(`SELECT COUNT(*) n FROM ${table} WHERE organization_id=?`)
    .bind(ctx.organizationId)
    .first<{ n: number }>())!.n;
}

describe("expert delegation against real D1 and signed OAuth identities", () => {
  it("defaults off and refuses a forged browser consent flag", async () => {
    const row = await prepare();
    await expect(
      reviewExpertDispatch(identity, env, domain, row.id),
    ).rejects.toMatchObject({ code: "EXPERT_OPT_IN_REQUIRED" });
    await expect(
      domain.approveDispatch(ctx, row.id, row.fingerprint),
    ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
    expect(await count("approvals")).toBe(0);
  });
  it("returns the exact review and stores only its hash, with a bounded lifetime", async () => {
    await grant();
    const { dispatch, review } = await reviewed();
    expect(review).toMatchObject({
      authority: "delegated",
      dispatchId: dispatch.id,
      fingerprint: dispatch.fingerprint,
      recipient: { email: "recipient@example.invalid" },
      text: "Original content",
      ceilingMinor: 100,
    });
    expect(Date.parse(review.expiresAt) - Date.now()).toBeLessThanOrEqual(
      300000,
    );
    const stored = await db
      .prepare("SELECT * FROM expert_dispatch_reviews WHERE dispatch_id=?")
      .bind(dispatch.id)
      .first();
    expect(JSON.stringify(stored)).not.toContain(review.reviewToken);
    expect(stored!.token_hash).toBe(await hashSecret(review.reviewToken));
  });
  it("accepts once with an atomic budget, reservation and outbox; retries do not duplicate", async () => {
    await grant();
    const { input } = await reviewed();
    expect(
      (await acceptExpertDispatch(identity, env, domain, input)).status,
    ).toBe("queued");
    expect(
      (await acceptExpertDispatch(identity, env, domain, input)).status,
    ).toBe("queued");
    for (const table of [
      "expert_approval_acceptances",
      "reservations",
      "outbox",
    ])
      expect(await count(table)).toBe(1);
    const approval = await db
      .prepare("SELECT approval_kind FROM approvals WHERE dispatch_id=?")
      .bind(input.dispatchId)
      .first();
    expect(approval!.approval_kind).toBe("expert");
    const audit = await db
      .prepare(
        "SELECT action FROM audit_log WHERE organization_id=? AND action LIKE 'dispatch.%approved'",
      )
      .bind(ctx.organizationId)
      .all();
    expect(audit.results.map((r) => r.action)).toEqual([
      "dispatch.expert_approved",
    ]);
  });
  it.each(["fingerprint", "ceilingMinor", "reviewToken"])(
    "refuses a changed %s",
    async (field) => {
      await grant();
      const { input } = await reviewed();
      await expect(
        acceptExpertDispatch(identity, env, domain, {
          ...input,
          [field]: field === "ceilingMinor" ? 99 : "f".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "EXPERT_REVIEW_INVALID" });
      expect(await count("outbox")).toBe(0);
    },
  );
  it("does not let another OAuth connection borrow a review", async () => {
    await grant();
    const { input } = await reviewed();
    const other = `${connection}-other`;
    await db
      .prepare(
        "INSERT INTO authorized_connections VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(
        other,
        issuer,
        ctx.userId,
        "other-client",
        ctx.organizationId,
        now(),
        now(),
      )
      .run();
    await db
      .prepare(
        "INSERT INTO expert_approval_policies SELECT ?,organization_id,user_id,enabled,revision,channels_json,max_per_dispatch_minor,max_daily_minor,max_daily_count,expires_at,created_at,updated_at FROM expert_approval_policies WHERE connection_id=?",
      )
      .bind(other, connection)
      .run();
    const otherIdentity = await authenticateMcp(
      new Request(`${env.APP_ORIGIN}/mcp`, {
        headers: { Authorization: `Bearer ${await token("other-client")}` },
      }),
      env,
    );
    await expect(
      acceptExpertDispatch(otherIdentity, env, domain, input),
    ).rejects.toMatchObject({ code: "EXPERT_REVIEW_INVALID" });
  });
  it.each(["revision", "revocation", "expiry", "connection"])(
    "invalidates pending reviews after %s",
    async (change) => {
      await grant();
      const { input } = await reviewed();
      if (change === "connection")
        await db
          .prepare(
            "UPDATE authorized_connections SET status='revoked' WHERE id=?",
          )
          .bind(connection)
          .run();
      else
        await db
          .prepare(
            `UPDATE expert_approval_policies SET revision=revision+1${change === "revocation" ? ",enabled=0" : change === "expiry" ? ",expires_at='2000-01-01T00:00:00.000Z'" : ""} WHERE connection_id=?`,
          )
          .bind(connection)
          .run();
      await expect(
        acceptExpertDispatch(identity, env, domain, input),
      ).rejects.toBeInstanceOf(Error);
      expect(await count("outbox")).toBe(0);
    },
  );
  it("enforces channel and per-send limits before minting a review", async () => {
    await grant({ channels: '["fax"]' });
    const row = await prepare();
    await expect(
      reviewExpertDispatch(identity, env, domain, row.id),
    ).rejects.toMatchObject({ code: "EXPERT_CHANNEL_DISABLED" });
    await db
      .prepare(
        "UPDATE expert_approval_policies SET revision=revision+1,channels_json='[\"email\"]',max_per_dispatch_minor=50 WHERE connection_id=?",
      )
      .bind(connection)
      .run();
    await expect(
      reviewExpertDispatch(identity, env, domain, row.id),
    ).rejects.toMatchObject({ code: "EXPERT_LIMIT_EXCEEDED" });
  });
  it("enforces the daily budget atomically across concurrent accepts", async () => {
    await grant({ daily: 100 });
    const first = await reviewed();
    const second = await reviewed();
    const results = await Promise.allSettled([
      acceptExpertDispatch(identity, env, domain, first.input),
      acceptExpertDispatch(identity, env, domain, second.input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason,
    ).toMatchObject({ code: "EXPERT_BUDGET_EXCEEDED" });
    for (const table of [
      "expert_approval_acceptances",
      "reservations",
      "outbox",
    ])
      expect(await count(table)).toBe(1);
  });
  it("keeps accepted budget after cancellation and a policy revision", async () => {
    await grant({ count: 1 });
    const { input } = await reviewed();
    await acceptExpertDispatch(identity, env, domain, input);
    await domain.cancelDispatch(ctx, input.dispatchId);
    await db
      .prepare(
        "UPDATE expert_approval_policies SET revision=revision+1 WHERE connection_id=?",
      )
      .bind(connection)
      .run();
    const second = await reviewed();
    await expect(
      acceptExpertDispatch(identity, env, domain, second.input),
    ).rejects.toMatchObject({ code: "EXPERT_BUDGET_EXCEEDED" });
    expect(await count("expert_approval_acceptances")).toBe(1);
  });
  it("rolls back expert budget when ordinary quota reservation fails", async () => {
    await grant();
    const { input } = await reviewed();
    await db
      .prepare("UPDATE usage SET limit_count=0 WHERE organization_id=?")
      .bind(ctx.organizationId)
      .run();
    await expect(
      acceptExpertDispatch(identity, env, domain, input),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    for (const table of [
      "expert_approval_acceptances",
      "reservations",
      "outbox",
    ])
      expect(await count(table)).toBe(0);
  });
  it("does not let the legacy confirmation spend a delegated approval", async () => {
    await grant();
    const { dispatch, input } = await reviewed();
    const { authority, policy } = await expertAuthority(identity, env);
    const proof = {
      ...authority.sql(),
      reviewHash: await hashSecret(input.reviewToken),
      connectionId: policy.connection_id,
    };
    await domain.approveExpertDispatch(
      ctx,
      dispatch.id,
      dispatch.fingerprint,
      proof,
    );
    await expect(
      domain.confirmDispatch(ctx, dispatch.id, "legacy"),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    await domain.approveDispatch(
      { ...ctx, actor: "browser" },
      dispatch.id,
      dispatch.fingerprint,
    );
    expect(
      (await domain.confirmDispatch(ctx, dispatch.id, "browser-approved"))
        .status,
    ).toBe("queued");
    expect(await count("expert_approval_acceptances")).toBe(0);
  });
  it("fences revocation in the acceptance transaction even after approval", async () => {
    await grant();
    const { dispatch, input } = await reviewed();
    const { authority, policy } = await expertAuthority(identity, env);
    const proof = {
      ...authority.sql(),
      reviewHash: await hashSecret(input.reviewToken),
      connectionId: policy.connection_id,
    };
    await domain.approveExpertDispatch(
      ctx,
      dispatch.id,
      dispatch.fingerprint,
      proof,
    );
    await db
      .prepare(
        "UPDATE expert_approval_policies SET enabled=0,revision=revision+1 WHERE connection_id=?",
      )
      .bind(connection)
      .run();
    await expect(
      domain.confirmDispatch(ctx, dispatch.id, "after-revocation", proof),
    ).rejects.toBeInstanceOf(Error);
    expect(await count("outbox")).toBe(0);
  });
  it("does not allow postal authority without its separately selected channel", async () => {
    await grant();
    await expect(
      expertPostalAuthority(identity, env, "unknown", "a".repeat(64)),
    ).rejects.toMatchObject({ code: "EXPERT_CHANNEL_DISABLED" });
  });
  it("completes an exact PDF fax through MCP under a mandate without any browser approval call", async () => {
    await grant({ channels: '["fax"]' });
    await db.batch([
      db
        .prepare(
          "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'fax','Fixture','SIMULATION','verified','simulation',?)",
        )
        .bind(crypto.randomUUID(), ctx.organizationId, now()),
      db
        .prepare(
          "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'fax',?,100,50000,'EUR')",
        )
        .bind(ctx.organizationId, now().slice(0, 7)),
      db
        .prepare("INSERT INTO channel_controls VALUES(?,'fax',1)")
        .bind(ctx.organizationId),
    ]);
    const doc = await domain.registerDocument(ctx, {
      name: "immutable.pdf",
      sha256: "d".repeat(64),
      size: 123,
      pages: 2,
      status: "ready",
      source: "import",
      storageKey: `${ctx.organizationId}/immutable.pdf`,
    });
    const server = createGuteneoMcpServer(identity, env, {
      domain,
      documents: { importFile: vi.fn(), render: vi.fn() },
      capabilities: () => ({ mode: "simulation" }),
    });
    const client = new Client({ name: "expert-fixture", version: "1" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const prepared = await client.callTool({
        name: "prepare_fax",
        arguments: {
          documentId: doc.id,
          phone: "+33123456789",
          ceilingMinor: 100,
          idempotencyKey: "mcp-pdf",
        },
      });
      expect(prepared.isError).not.toBe(true);
      const dispatch = (prepared.structuredContent as { data: { id: string } })
        .data;
      const reviewed = await client.callTool({
        name: "review_dispatch",
        arguments: { dispatchId: dispatch.id },
      });
      expect(reviewed.isError).not.toBe(true);
      expect(reviewed.structuredContent).toMatchObject({
        data: {
          mode: "simulation",
          document: { sha256: doc.sha256, pages: 2 },
          recipient: { phone: "+33123456789" },
        },
      });
      const review = (
        reviewed.structuredContent as {
          data: {
            fingerprint: string;
            reviewToken: string;
            ceilingMinor: number;
          };
        }
      ).data;
      const sent = await client.callTool({
        name: "approve_and_send_dispatch",
        arguments: {
          dispatchId: dispatch.id,
          fingerprint: review.fingerprint,
          reviewToken: review.reviewToken,
          ceilingMinor: review.ceilingMinor,
          idempotencyKey: "mcp-pdf-accept",
        },
      });
      expect(sent.isError).not.toBe(true);
      expect(sent.structuredContent).toMatchObject({
        data: { status: "queued", mode: "simulation", documentId: doc.id },
      });
      expect(await count("expert_approval_acceptances")).toBe(1);
      expect(await count("attempts")).toBe(0);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("advertises host confirmation honestly and refuses read-only OAuth through actual MCP transport", async () => {
    const readonly = {
      ...identity,
      scopes: ["dispatches:read", "documents:read"],
    };
    const onToolFailure = vi.fn();
    const server = createGuteneoMcpServer(readonly, env, {
      domain,
      documents: { importFile: vi.fn(), render: vi.fn() },
      capabilities: () => ({}),
      onToolFailure,
    });
    const client = new Client({ name: "expert-fixture", version: "1" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const tools = await client.listTools();
      expect(
        tools.tools.find((t) => t.name === "approve_and_send_dispatch")
          ?.annotations,
      ).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      });
      const result = await client.callTool({
        name: "review_dispatch",
        arguments: { dispatchId: "unknown" },
      });
      expect(result.isError).toBe(true);
      expect(onToolFailure).toHaveBeenCalledExactlyOnceWith("AUTH_REJECTED");
      expect(result.structuredContent).toMatchObject({
        error: { code: "INSUFFICIENT_SCOPE" },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
