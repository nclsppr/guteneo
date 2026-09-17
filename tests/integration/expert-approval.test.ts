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
import { PDFDocument } from "pdf-lib";
import {
  DocumentService,
  REVIEW_PDF_MAX_BYTES,
} from "../../apps/api/src/documents";
import type { Env } from "../../apps/api/src/env";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";

let mf: Miniflare,
  db: D1Database,
  bucket: R2Bucket,
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
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
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
function documents(overrides: Partial<Env> = {}) {
  return new DocumentService(
    { ...env, DOCUMENTS: bucket, ...overrides } as Env,
    domain,
  );
}
async function pdfFixture(size?: number, storagePrefix = ctx.organizationId) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(crypto.randomUUID());
  pdf.addPage();
  const original = await pdf.save();
  const bytes = new Uint8Array(size ?? original.length);
  bytes.set(original);
  const sha256 = Buffer.from(
    await crypto.subtle.digest("SHA-256", bytes),
  ).toString("hex");
  const storageKey = `${storagePrefix}/documents/${sha256}/original.pdf`;
  await bucket.put(storageKey, bytes);
  const doc = await domain.registerDocument(ctx, {
    name: "immutable.pdf",
    sha256,
    size: bytes.length,
    pages: 1,
    status: "ready",
    source: "import",
    storageKey,
    scanVerified: true,
  });
  return { doc, bytes };
}
async function prepareWithPdf(size?: number, storagePrefix?: string) {
  const fixture = await pdfFixture(size, storagePrefix);
  const dispatch = await domain.prepareDispatch(
    ctx,
    {
      channel: "email",
      documentId: fixture.doc.id,
      recipient: { email: "recipient@example.invalid" },
      subject: "PDF fixture",
      text: "Review exact attachment",
      ceilingMinor: 100,
    },
    crypto.randomUUID(),
  );
  return { ...fixture, dispatch };
}
async function pdfReview(dispatchId: string, service = documents()) {
  return reviewExpertDispatch(
    identity,
    env,
    domain,
    dispatchId,
    service.getReviewContent.bind(service),
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
  it("never revives an expert mandate when a revoked OAuth connection is reconnected", async () => {
    await grant();
    const row = await prepare();
    await db
      .prepare("UPDATE authorized_connections SET status='revoked' WHERE id=?")
      .bind(connection)
      .run();
    await db
      .prepare(
        "UPDATE authorized_connections SET status='active',updated_at=? WHERE id=?",
      )
      .bind(later(1), connection)
      .run();
    const policy = await db
      .prepare(
        "SELECT enabled,revision FROM expert_approval_policies WHERE connection_id=?",
      )
      .bind(connection)
      .first();
    expect(policy).toMatchObject({ enabled: 0, revision: 2 });
    await expect(
      reviewExpertDispatch(identity, env, domain, row.id),
    ).rejects.toMatchObject({ code: "EXPERT_OPT_IN_REQUIRED" });
  });
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
    const { doc, bytes } = await pdfFixture();
    const server = createGuteneoMcpServer(identity, env, {
      domain,
      documents: documents(),
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
          document: { sha256: doc.sha256, pages: 1 },
          recipient: { phone: "+33123456789" },
        },
      });
      const resource = reviewed.content.find(
        (item) => item.type === "resource",
      );
      expect(resource).toMatchObject({
        type: "resource",
        resource: {
          mimeType: "application/pdf",
          uri: `guteneo-document:///${doc.id}/${doc.sha256}.pdf`,
        },
      });
      expect(
        resource?.type === "resource" && "blob" in resource.resource
          ? Buffer.from(resource.resource.blob, "base64")
          : null,
      ).toEqual(Buffer.from(bytes));
      expect(JSON.stringify(reviewed.structuredContent)).not.toContain(
        "documentResource",
      );
      expect(JSON.stringify(reviewed.structuredContent)).not.toContain(
        Buffer.from(bytes).toString("base64"),
      );
      expect(JSON.stringify(reviewed)).not.toContain(doc.storage_key);
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

describe("exact private PDF before an expert review token", () => {
  beforeEach(async () => {
    await grant();
    env.ENVIRONMENT = "staging";
  });
  async function noReview() {
    expect(await count("expert_dispatch_reviews")).toBe(0);
    expect(await count("outbox")).toBe(0);
  }
  it("keeps exact text-only email review usable without claiming an embedded PDF", async () => {
    const dispatch = await prepare();
    const review = await reviewExpertDispatch(
      identity,
      env,
      domain,
      dispatch.id,
    );
    expect(review.document).toBeNull();
    expect(review.documentResource).toBeUndefined();
    expect(review.text).toBe("Original content");
    expect(review.instructions).toContain("ne contient pas de PDF");
    expect(review.instructions).not.toContain("Lire la ressource PDF");
  });
  it("refuses metadata-only services before issuing any token", async () => {
    const { dispatch } = await prepareWithPdf();
    await expect(
      reviewExpertDispatch(identity, env, domain, dispatch.id),
    ).rejects.toMatchObject({ code: "EXPERT_DOCUMENT_UNAVAILABLE" });
    await noReview();
  });
  it("accepts the exact 1 MiB boundary without truncation", async () => {
    const { dispatch, bytes } = await prepareWithPdf(REVIEW_PDF_MAX_BYTES);
    const review = await pdfReview(dispatch.id);
    expect(Buffer.from(review.documentResource!.blob, "base64")).toEqual(
      Buffer.from(bytes),
    );
    expect(await count("expert_dispatch_reviews")).toBe(1);
  });
  it("rejects a larger original before reading R2 or issuing a token", async () => {
    const { dispatch } = await prepareWithPdf(REVIEW_PDF_MAX_BYTES + 1);
    const get = vi.fn();
    await expect(
      pdfReview(
        dispatch.id,
        documents({ DOCUMENTS: { get } as unknown as R2Bucket }),
      ),
    ).rejects.toMatchObject({ code: "EXPERT_DOCUMENT_TOO_LARGE" });
    expect(get).not.toHaveBeenCalled();
    await noReview();
  });
  it.each(["missing", "same-size-change", "wrong-size"])(
    "refuses %s R2 originals",
    async (kind) => {
      const { dispatch, doc, bytes } = await prepareWithPdf();
      if (kind === "missing") await bucket.delete(doc.storage_key);
      else {
        const altered =
          kind === "wrong-size"
            ? new Uint8Array(bytes.length + 1)
            : bytes.slice();
        altered[0] ^= 1;
        await bucket.put(doc.storage_key, altered);
      }
      await expect(pdfReview(dispatch.id)).rejects.toMatchObject({
        code:
          kind === "missing"
            ? "DOCUMENT_UNAVAILABLE"
            : "DOCUMENT_INTEGRITY_ERROR",
      });
      await noReview();
    },
  );
  it("bounds the stream even if object metadata underreports its size", async () => {
    const { dispatch, doc } = await prepareWithPdf();
    const service = documents({
      DOCUMENTS: {
        get: async () => ({
          size: doc.size,
          body: new Response(new Uint8Array(REVIEW_PDF_MAX_BYTES + 1)).body,
        }),
      } as unknown as R2Bucket,
    });
    await expect(pdfReview(dispatch.id, service)).rejects.toMatchObject({
      code: "EXPERT_DOCUMENT_TOO_LARGE",
    });
    await noReview();
  });
  it.each(["pending-read", "mismatch-cancel"])(
    "bounds cleanup as well as the R2 read deadline: %s",
    async (kind) => {
      const { dispatch, doc } = await prepareWithPdf();
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) =>
        timeout(ms === 15_000 ? 20 : ms),
      );
      const body = new ReadableStream<Uint8Array>({
        pull: () => new Promise(() => {}),
        cancel: () => new Promise(() => {}),
      });
      const service = documents({
        DOCUMENTS: {
          get: async () => ({
            size: doc.size + (kind === "mismatch-cancel" ? 1 : 0),
            body,
          }),
        } as unknown as R2Bucket,
      });
      await expect(pdfReview(dispatch.id, service)).rejects.toMatchObject({
        code:
          kind === "pending-read"
            ? "DOCUMENT_UNAVAILABLE"
            : "DOCUMENT_INTEGRITY_ERROR",
      });
      await noReview();
    },
    3000,
  );
  it("does not read another tenant's storage key or document", async () => {
    const { dispatch } = await prepareWithPdf(undefined, "foreign_org");
    const get = vi.fn();
    await expect(
      pdfReview(
        dispatch.id,
        documents({ DOCUMENTS: { get } as unknown as R2Bucket }),
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_INTEGRITY_ERROR" });
    expect(get).not.toHaveBeenCalled();
    await expect(
      documents().getReviewContent(
        { ...ctx, organizationId: "foreign_org" },
        dispatch.document_id!,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await noReview();
  });
  it.each(["absent", "foreign-tenant", "different-hash"])(
    "requires canonical same-tenant scan proof outside local simulation: %s",
    async (kind) => {
      const { dispatch, doc } = await prepareWithPdf();
      await db
        .prepare(
          "DELETE FROM audit_log WHERE organization_id=? AND action='document.scan_verified'",
        )
        .bind(ctx.organizationId)
        .run();
      if (kind !== "absent") {
        const org =
          kind === "foreign-tenant" ? crypto.randomUUID() : ctx.organizationId;
        if (kind === "foreign-tenant")
          await db
            .prepare(
              "INSERT INTO organizations VALUES(?,'Foreign','simulation',?)",
            )
            .bind(org, now())
            .run();
        await db
          .prepare("INSERT INTO audit_log VALUES(?,?,?,?,?,?,?)")
          .bind(
            crypto.randomUUID(),
            org,
            ctx.userId,
            "document.scan_verified",
            kind === "different-hash" ? "f".repeat(64) : doc.sha256,
            "{}",
            now(),
          )
          .run();
      }
      await expect(
        pdfReview(dispatch.id, documents({ ENVIRONMENT: "staging" })),
      ).rejects.toMatchObject({ code: "DOCUMENT_INTEGRITY_ERROR" });
      await noReview();
    },
  );
  it.each(["quarantined", "purged"])(
    "refuses a %s document before exposing its bytes",
    async (status) => {
      const { dispatch, doc } = await prepareWithPdf();
      await db
        .prepare("UPDATE documents SET status=? WHERE id=?")
        .bind(status, doc.id)
        .run();
      await expect(pdfReview(dispatch.id)).rejects.toMatchObject({
        code: "DOCUMENT_QUARANTINED",
      });
      await noReview();
    },
  );
  it.each(["connection", "membership", "policy", "document", "scan"])(
    "rechecks %s after awaited private byte read",
    async (kind) => {
      const { dispatch, doc } = await prepareWithPdf();
      // Keep production-like scan proof enforced, while fixture transport remains explicitly local simulation.
      const service = documents({
        ENVIRONMENT: "staging",
        DOCUMENTS: {
          get: async (key: string) => {
            const object = await bucket.get(key);
            if (kind === "connection")
              await db
                .prepare(
                  "UPDATE authorized_connections SET status='revoked' WHERE id=?",
                )
                .bind(connection)
                .run();
            if (kind === "membership") {
              const admin = crypto.randomUUID();
              await db.batch([
                db
                  .prepare(
                    "INSERT INTO users VALUES(?,'Backup admin','backup@example.invalid',?)",
                  )
                  .bind(admin, now()),
                db
                  .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
                  .bind(ctx.organizationId, admin, now()),
                db
                  .prepare(
                    "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
                  )
                  .bind(ctx.organizationId, ctx.userId),
              ]);
            }
            if (kind === "policy")
              await db
                .prepare(
                  "UPDATE expert_approval_policies SET revision=revision+1 WHERE connection_id=?",
                )
                .bind(connection)
                .run();
            if (kind === "document")
              await db
                .prepare("UPDATE documents SET status='purged' WHERE id=?")
                .bind(doc.id)
                .run();
            if (kind === "scan")
              await db
                .prepare(
                  "DELETE FROM audit_log WHERE organization_id=? AND action='document.scan_verified'",
                )
                .bind(ctx.organizationId)
                .run();
            return object;
          },
        } as unknown as R2Bucket,
      });
      await expect(pdfReview(dispatch.id, service)).rejects.toBeInstanceOf(
        Error,
      );
      await noReview();
    },
  );
  it("returns neither PDF bytes nor a token over actual MCP after OAuth revocation during R2 read", async () => {
    const { dispatch } = await prepareWithPdf();
    const service = documents({
      DOCUMENTS: {
        get: async (key: string) => {
          const object = await bucket.get(key);
          await db
            .prepare(
              "UPDATE authorized_connections SET status='revoked' WHERE id=?",
            )
            .bind(connection)
            .run();
          return object;
        },
      } as unknown as R2Bucket,
    });
    const server = createGuteneoMcpServer(identity, env, {
      domain,
      documents: service,
      capabilities: () => ({}),
    });
    const client = new Client({ name: "revoked-review-fixture", version: "1" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    try {
      const result = await client.callTool({
        name: "review_dispatch",
        arguments: { dispatchId: dispatch.id },
      });
      expect(result.isError).toBe(true);
      expect(result.content.every((item) => item.type === "text")).toBe(true);
      expect(JSON.stringify(result)).not.toContain("reviewToken");
      expect(JSON.stringify(result)).not.toContain("blob");
      await noReview();
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("rechecks scan proof inside the token insertion after validated bytes were read", async () => {
    const { dispatch } = await prepareWithPdf();
    const service = documents();
    await expect(
      reviewExpertDispatch(
        identity,
        env,
        domain,
        dispatch.id,
        async (...args) => {
          const exact = await service.getReviewContent(...args);
          await db
            .prepare(
              "DELETE FROM audit_log WHERE organization_id=? AND action='document.scan_verified'",
            )
            .bind(ctx.organizationId)
            .run();
          return exact;
        },
      ),
    ).rejects.toMatchObject({ code: "EXPERT_AUTHORITY_CHANGED" });
    await noReview();
  });
  it("fences a status change after the validated read and preserves the prior token", async () => {
    const { dispatch, doc } = await prepareWithPdf();
    const prior = await pdfReview(dispatch.id);
    const service = documents();
    await expect(
      reviewExpertDispatch(
        identity,
        env,
        domain,
        dispatch.id,
        async (...args) => {
          const exact = await service.getReviewContent(...args);
          await db
            .prepare("UPDATE documents SET status='purged' WHERE id=?")
            .bind(doc.id)
            .run();
          return exact;
        },
      ),
    ).rejects.toMatchObject({ code: "EXPERT_AUTHORITY_CHANGED" });
    const stored = await db
      .prepare(
        "SELECT token_hash FROM expert_dispatch_reviews WHERE organization_id=?",
      )
      .bind(ctx.organizationId)
      .first<{ token_hash: string }>();
    expect(stored?.token_hash).toBe(await hashSecret(prior.reviewToken));
  });
});
