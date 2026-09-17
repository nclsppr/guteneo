import { PDFDocument } from "pdf-lib";
import { DocumentService } from "../../apps/api/src/documents";
import type { Env } from "../../apps/api/src/env";
import { reviewExpertPages } from "../../apps/api/src/expert-review-pages";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import type { ReviewPages } from "../../packages/contracts/src/expert-review";
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
  type AuthEnv,
  type McpIdentity,
} from "../../apps/api/src/auth";
import { acceptExpertDispatch } from "../../apps/api/src/expert-approval";

let mf: Miniflare,
  db: D1Database,
  bucket: R2Bucket,
  env: AuthEnv,
  ctx: ActorContext,
  identity: McpIdentity,
  connection: string,
  domain: DomainService;
const issuer = "https://expert-pages-fixture.auth0.example/";
const keys = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "pages",
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
    AUTH0_AUDIENCE: "https://pages.example/mcp",
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

async function originalFixture(pages = 7, large = false) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(crypto.randomUUID());
  if (large)
    pdf.setSubject("Synthetic multipage fixture metadata. ".repeat(20000));
  for (let page = 1; page <= pages; page++)
    pdf
      .addPage([595, 842])
      .drawText(`Original page ${page}`, { x: 40, y: 750 });
  const bytes = new Uint8Array(await pdf.save({ useObjectStreams: false }));
  if (large) expect(bytes.byteLength).toBeGreaterThan(1024 * 1024);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages);
  const hash = Buffer.from(
    await crypto.subtle.digest("SHA-256", bytes),
  ).toString("hex");
  const id = `doc_${crypto.randomUUID()}`;
  const storageKey = `${ctx.organizationId}/documents/${hash}/${id}.pdf`;
  await bucket.put(storageKey, bytes);
  const doc = await domain.registerDocument(ctx, {
    id,
    name: "pages.pdf",
    sha256: hash,
    size: bytes.length,
    pages,
    source: "import",
    status: "ready",
    storageKey,
    scanVerified: true,
  });
  return { bytes, doc };
}
async function fixture(pages = 7, large = false) {
  const { bytes, doc } = await originalFixture(pages, large);
  const dispatch = await domain.prepareDispatch(
    ctx,
    {
      channel: "email",
      documentId: doc.id,
      recipient: { email: "synthetic@example.invalid" },
      subject: "Paginated fixture",
      text: "Synthetic exact attachment",
      ceilingMinor: 100,
    },
    crypto.randomUUID(),
  );
  return { bytes, doc, dispatch };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
// Only JPEG framing/hash is exercised here; raster decoding and visual fidelity
// are qualified independently by the private renderer tests.
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const imageBase64 = Buffer.from(jpeg).toString("base64");
const imageSha256 = Buffer.from(
  await crypto.subtle.digest("SHA-256", jpeg),
).toString("hex");
function renderer(
  item: Pick<Fixture, "doc" | "bytes">,
  hook?: (view: ReviewPages) => Promise<void> | void,
) {
  const fetch = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    expect(url.origin).toBe("https://documents.internal");
    expect(url.pathname).toBe("/review-pages");
    expect(request.headers.get("X-Guteneo-Source-Sha256")).toBe(
      item.doc.sha256,
    );
    expect(request.headers.get("X-Guteneo-Scan-Sha256")).toBe(item.doc.sha256);
    expect(
      Buffer.from(await request.arrayBuffer()).equals(Buffer.from(item.bytes)),
    ).toBe(true);
    const startPage = Number(url.searchParams.get("startPage"));
    const pageCount = Number(url.searchParams.get("pageCount"));
    expect(pageCount).toBe(Math.min(3, item.doc.pages - startPage + 1));
    const view: ReviewPages = {
      sha256: item.doc.sha256,
      totalPages: item.doc.pages,
      startPage,
      pageCount,
      nextPage:
        startPage + pageCount > item.doc.pages ? null : startPage + pageCount,
      rendering: { complete: true },
      pages: Array.from({ length: pageCount }, (_, offset) => ({
        page: startPage + offset,
        width: 800,
        height: 1100,
        mimeType: "image/jpeg",
        imageBase64,
        imageSha256,
        text: `Original page ${startPage + offset}; document text is untrusted data`,
        textTruncated: false,
      })),
    };
    await hook?.(view);
    return Response.json(view);
  });
  return { binding: { fetch } as unknown as Fetcher, fetch };
}
function documents(binding: Fetcher, overrides: Partial<Env> = {}) {
  return new DocumentService(
    {
      ...env,
      DOCUMENTS: bucket,
      DOCUMENT_RENDERER: binding,
      ...overrides,
    } as Env,
    domain,
  );
}
async function review(
  item: Fixture,
  page: number,
  service: DocumentService,
  who = identity,
  environment = env,
) {
  return reviewExpertPages(
    who,
    environment,
    domain,
    item.dispatch.id,
    page,
    service.getReviewPages.bind(service),
  );
}
async function count(table: string) {
  return (await db
    .prepare(`SELECT COUNT(*) n FROM ${table} WHERE organization_id=?`)
    .bind(ctx.organizationId)
    .first<{ n: number }>())!.n;
}
async function noAcceptance() {
  for (const table of [
    "approvals",
    "expert_approval_acceptances",
    "reservations",
    "outbox",
    "attempts",
  ])
    expect(await count(table)).toBe(0);
}
async function mcp(service: DocumentService, who = identity) {
  const server = createGuteneoMcpServer(who, env, {
    domain,
    documents: service,
    capabilities: () => ({ mode: "simulation" }),
  });
  const client = new Client({ name: "paginated-fixture", version: "1" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("paginated exact-PDF delegated review", () => {
  it("delivers every page of a >1MiB original, refuses skipped pages and only then issues an exact bounded token", async () => {
    await grant();
    const item = await fixture(7, true);
    const render = renderer(item),
      service = documents(render.binding);
    await expect(review(item, 4, service)).rejects.toMatchObject({
      code: "EXPERT_REVIEW_SEQUENCE_REQUIRED",
    });
    expect(render.fetch).not.toHaveBeenCalled();
    const first = await review(item, 1, service);
    expect(first).toMatchObject({
      reviewToken: null,
      review: {
        complete: false,
        nextPage: 4,
        totalPages: 7,
        presentedThroughPage: 3,
      },
    });
    expect(first.pageImages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(await count("expert_dispatch_reviews")).toBe(0);
    await noAcceptance();
    await expect(review(item, 7, service)).rejects.toMatchObject({
      code: "EXPERT_REVIEW_SEQUENCE_REQUIRED",
    });
    const second = await review(item, 4, service);
    expect(second).toMatchObject({
      reviewToken: null,
      review: { complete: false, nextPage: 7 },
    });
    expect(second.pageImages.map((page) => page.page)).toEqual([4, 5, 6]);
    expect(await count("expert_dispatch_reviews")).toBe(0);
    const final = await review(item, 7, service);
    expect(final).toMatchObject({
      review: {
        complete: true,
        nextPage: null,
        totalPages: 7,
        presentedThroughPage: 7,
      },
      document: { sha256: item.doc.sha256, pages: 7 },
    });
    expect(final.reviewToken).toMatch(/^[a-f0-9]{64}$/);
    expect(final.pageImages.map((page) => page.page)).toEqual([7]);
    expect(await count("expert_dispatch_reviews")).toBe(1);
    expect(render.fetch).toHaveBeenCalledTimes(3);
    await noAcceptance();
    const input = {
      dispatchId: item.dispatch.id,
      fingerprint: item.dispatch.fingerprint,
      ceilingMinor: item.dispatch.ceiling_minor,
      reviewToken: final.reviewToken!,
      idempotencyKey: "paginated-accept",
      recipientRequested: true,
    };
    await expect(
      acceptExpertDispatch(identity, env, domain, {
        ...input,
        fingerprint: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "EXPERT_REVIEW_INVALID" });
    await expect(
      acceptExpertDispatch(identity, env, domain, {
        ...input,
        ceilingMinor: 101,
      }),
    ).rejects.toMatchObject({ code: "EXPERT_REVIEW_INVALID" });
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
    expect(await count("attempts")).toBe(0);
  });

  it("repeats delivered batches without skipping or duplicating acceptance and preserves the intermediate window", async () => {
    await grant();
    const item = await fixture();
    const service = documents(renderer(item).binding);
    await review(item, 1, service);
    const repeated = await review(item, 1, service);
    expect(repeated.review).toMatchObject({
      complete: false,
      nextPage: 4,
      presentedThroughPage: 3,
    });
    expect(repeated.reviewToken).toBeNull();
    const second = await review(item, 4, service);
    const again = await review(item, 4, service);
    expect(again.review).toEqual(second.review);
    expect(await count("expert_document_review_progress")).toBe(1);
    expect(await count("expert_dispatch_reviews")).toBe(0);
    await noAcceptance();
  });

  it("requires restarting expired progress from the first page and never lets a late batch resurrect it", async () => {
    await grant();
    const item = await fixture();
    const service = documents(renderer(item).binding);
    await review(item, 1, service);
    await db
      .prepare(
        "UPDATE expert_document_review_progress SET expires_at='2000-01-01T00:00:00.000Z' WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(ctx.organizationId, item.dispatch.id)
      .run();
    await expect(review(item, 4, service)).rejects.toMatchObject({
      code: "EXPERT_REVIEW_SEQUENCE_REQUIRED",
    });
    expect((await review(item, 1, service)).review).toMatchObject({
      complete: false,
      nextPage: 4,
    });
    expect(await count("expert_dispatch_reviews")).toBe(0);
    await noAcceptance();
  });

  it("keeps page images exclusively in MCP image content and defaults to paginated review", async () => {
    await grant();
    const item = await fixture(4, true);
    const render = renderer(item);
    const transport = await mcp(documents(render.binding));
    try {
      const first = await transport.client.callTool({
        name: "review_dispatch",
        arguments: { dispatchId: item.dispatch.id },
      });
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toMatchObject({
        data: {
          reviewToken: null,
          review: { complete: false, nextPage: 4, totalPages: 4 },
        },
      });
      expect(
        first.content.filter((part) => part.type === "image"),
      ).toHaveLength(3);
      for (const part of first.content.filter((part) => part.type === "image"))
        expect(part).toMatchObject({
          type: "image",
          mimeType: "image/jpeg",
          data: imageBase64,
        });
      expect(
        first.content.filter((part) => part.type === "resource"),
      ).toHaveLength(0);
      expect(JSON.stringify(first.structuredContent)).not.toContain(
        imageBase64,
      );
      expect(JSON.stringify(first.structuredContent)).not.toContain(
        "pageImages",
      );
      expect(JSON.stringify(first)).not.toContain(item.doc.storage_key);
      expect(await count("expert_dispatch_reviews")).toBe(0);
      await noAcceptance();
      const last = await transport.client.callTool({
        name: "review_dispatch",
        arguments: { dispatchId: item.dispatch.id, page: 4 },
      });
      expect(last.isError).not.toBe(true);
      expect(last.structuredContent).toMatchObject({
        data: {
          review: { complete: true, nextPage: null, totalPages: 4 },
          document: { sha256: item.doc.sha256 },
        },
      });
      expect(last.content.filter((part) => part.type === "image")).toHaveLength(
        1,
      );
      expect(JSON.stringify(last.structuredContent)).not.toContain(imageBase64);
      const data = (last.structuredContent as { data: { reviewToken: string } })
        .data;
      expect(data.reviewToken).toMatch(/^[a-f0-9]{64}$/);
      await noAcceptance();
    } finally {
      await transport.close();
    }
  });

  it("keeps the explicit PDF alternative exact and capped at 1MiB without silently changing format", async () => {
    await grant();
    const large = await fixture(4, true);
    const render = renderer(large);
    const transport = await mcp(documents(render.binding));
    try {
      const response = await transport.client.callTool({
        name: "review_dispatch",
        arguments: { dispatchId: large.dispatch.id, format: "pdf" },
      });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toMatchObject({
        error: { code: "EXPERT_DOCUMENT_TOO_LARGE" },
      });
      expect(render.fetch).not.toHaveBeenCalled();
      expect(await count("expert_dispatch_reviews")).toBe(0);
      const small = await fixture(1, false);
      const embedded = await transport.client.callTool({
        name: "review_dispatch",
        arguments: { dispatchId: small.dispatch.id, format: "pdf" },
      });
      expect(embedded.isError).not.toBe(true);
      const resource = embedded.content.find(
        (part) => part.type === "resource",
      );
      expect(
        resource?.type === "resource" && "blob" in resource.resource
          ? Buffer.from(resource.resource.blob, "base64")
          : null,
      ).toEqual(Buffer.from(small.bytes));
      expect(JSON.stringify(embedded.structuredContent)).not.toContain(
        Buffer.from(small.bytes).toString("base64"),
      );
      expect(
        embedded.content.filter((part) => part.type === "image"),
      ).toHaveLength(0);
      await noAcceptance();
    } finally {
      await transport.close();
    }
  });

  it("does not reuse progress after policy revision, revocation, or client changes", async () => {
    await grant();
    const item = await fixture();
    const render = renderer(item),
      service = documents(render.binding);
    await review(item, 1, service);
    await db
      .prepare(
        "UPDATE expert_approval_policies SET revision=revision+1 WHERE connection_id=?",
      )
      .bind(connection)
      .run();
    await expect(review(item, 4, service)).rejects.toMatchObject({
      code: "EXPERT_REVIEW_SEQUENCE_REQUIRED",
    });
    await review(item, 1, service);
    const other = await identify(scopes, "other-client");
    const otherConnection = await db
      .prepare(
        "SELECT id FROM authorized_connections WHERE organization_id=? AND user_id=? AND client_id='other-client'",
      )
      .bind(ctx.organizationId, ctx.userId)
      .first<{ id: string }>();
    await db
      .prepare(
        "INSERT INTO expert_approval_policies SELECT ?,organization_id,user_id,enabled,revision,channels_json,max_per_dispatch_minor,max_daily_minor,max_daily_count,expires_at,created_at,updated_at FROM expert_approval_policies WHERE connection_id=?",
      )
      .bind(otherConnection!.id, connection)
      .run();
    await expect(review(item, 4, service, other)).rejects.toMatchObject({
      code: "EXPERT_REVIEW_SEQUENCE_REQUIRED",
    });
    await db
      .prepare(
        "UPDATE expert_approval_policies SET enabled=0,revision=revision+1 WHERE connection_id=?",
      )
      .bind(connection)
      .run();
    await expect(review(item, 4, service)).rejects.toMatchObject({
      code: "EXPERT_OPT_IN_REQUIRED",
    });
    expect(await count("expert_dispatch_reviews")).toBe(0);
    await noAcceptance();
  });

  it("rejects missing scopes and a foreign tenant before reading private originals", async () => {
    await grant();
    const item = await fixture();
    const render = renderer(item),
      service = documents(render.binding);
    const readonly = await identify("documents:read dispatches:read");
    await expect(review(item, 1, service, readonly)).rejects.toMatchObject({
      code: "INSUFFICIENT_SCOPE",
    });
    await expect(
      service.getReviewPages(
        { ...ctx, organizationId: "foreign" },
        item.doc.id,
        1,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      review(item, 1, service, {
        ...identity,
        context: { ...ctx, organizationId: "foreign" },
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(render.fetch).not.toHaveBeenCalled();
    expect(await count("expert_document_review_progress")).toBe(0);
    await noAcceptance();
  });

  it.each(["policy", "connection"])(
    "fences %s revocation during rendering before returning any pages or token",
    async (kind) => {
      await grant();
      const item = await fixture(4);
      const render = renderer(item, async () => {
        if (kind === "policy")
          await db
            .prepare(
              "UPDATE expert_approval_policies SET enabled=0,revision=revision+1 WHERE connection_id=?",
            )
            .bind(connection)
            .run();
        else
          await db
            .prepare(
              "UPDATE authorized_connections SET status='revoked',updated_at=? WHERE id=?",
            )
            .bind(now(), connection)
            .run();
      });
      await expect(
        review(item, 1, documents(render.binding)),
      ).rejects.toBeInstanceOf(Error);
      expect(await count("expert_document_review_progress")).toBe(0);
      expect(await count("expert_dispatch_reviews")).toBe(0);
      await noAcceptance();
    },
  );

  it.each(["before", "during"])(
    "fences canonical scan proof removal %s rendering outside local bypass",
    async (when) => {
      await grant();
      const item = await fixture(4);
      const proofEnv = { ...env, ENVIRONMENT: "production" };
      const revoke = () =>
        db
          .prepare(
            "DELETE FROM audit_log WHERE organization_id=? AND action='document.scan_verified' AND resource_id=?",
          )
          .bind(ctx.organizationId, item.doc.sha256)
          .run();
      if (when === "before") await revoke();
      const render = renderer(item, async () => {
        if (when === "during") await revoke();
      });
      await expect(
        review(
          item,
          1,
          documents(render.binding, { ENVIRONMENT: "production" }),
          identity,
          proofEnv,
        ),
      ).rejects.toBeInstanceOf(Error);
      expect(render.fetch).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
      expect(await count("expert_document_review_progress")).toBe(0);
      expect(await count("expert_dispatch_reviews")).toBe(0);
      await noAcceptance();
    },
  );

  it("rejects altered original bytes before a subsequent batch despite unchanged document metadata", async () => {
    await grant();
    const item = await fixture();
    const render = renderer(item),
      service = documents(render.binding);
    await review(item, 1, service);
    const altered = item.bytes.slice();
    altered[altered.length - 1] ^= 1;
    await bucket.put(item.doc.storage_key, altered);
    await expect(review(item, 4, service)).rejects.toMatchObject({
      code: "DOCUMENT_INTEGRITY_ERROR",
    });
    expect(render.fetch).toHaveBeenCalledTimes(1);
    expect(await count("expert_dispatch_reviews")).toBe(0);
    await noAcceptance();
  });

  it.each(["source hash", "page order", "page hash", "total pages", "image"])(
    "rejects inconsistent renderer %s without recording progress",
    async (field) => {
      await grant();
      const item = await fixture(4);
      const render = renderer(item, (view) => {
        if (field === "source hash") view.sha256 = "0".repeat(64);
        if (field === "page order") view.pages[0].page = 2;
        if (field === "page hash") view.pages[0].imageSha256 = "0".repeat(64);
        if (field === "total pages") view.totalPages = 5;
        if (field === "image")
          view.pages[0].imageBase64 =
            Buffer.from("not a JPEG").toString("base64");
      });
      await expect(
        review(item, 1, documents(render.binding)),
      ).rejects.toMatchObject({ code: "DOCUMENT_INTEGRITY_ERROR" });
      expect(await count("expert_document_review_progress")).toBe(0);
      expect(await count("expert_dispatch_reviews")).toBe(0);
      await noAcceptance();
    },
  );
});

describe("read-only original PDF pages through MCP", () => {
  it("lets a documents:read-only connection inspect its PDF before any dispatch or expert mandate exists", async () => {
    const item = await originalFixture(4);
    const render = renderer(item);
    const reader = await identify("documents:read");
    const transport = await mcp(documents(render.binding), reader);
    const auditCount = await count("audit_log");
    try {
      const tools = await transport.client.listTools();
      expect(
        tools.tools.find((tool) => tool.name === "read_document_pages")
          ?.annotations,
      ).toMatchObject({ readOnlyHint: true });
      const first = await transport.client.callTool({
        name: "read_document_pages",
        arguments: { documentId: item.doc.id },
      });
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toMatchObject({
        data: {
          mode: "simulation",
          document: { id: item.doc.id, sha256: item.doc.sha256, pages: 4 },
          startPage: 1,
          nextPage: 4,
        },
      });
      expect(
        first.content.filter((part) => part.type === "image"),
      ).toHaveLength(3);
      for (const part of first.content.filter((part) => part.type === "image"))
        expect(part).toMatchObject({
          type: "image",
          mimeType: "image/jpeg",
          data: imageBase64,
        });
      expect(JSON.stringify(first.structuredContent)).not.toContain(
        imageBase64,
      );
      expect(JSON.stringify(first.structuredContent)).not.toContain(
        "pageImages",
      );
      expect(JSON.stringify(first.structuredContent)).not.toContain(
        "reviewToken",
      );
      expect(JSON.stringify(first)).not.toContain(item.doc.storage_key);
      const last = await transport.client.callTool({
        name: "read_document_pages",
        arguments: { documentId: item.doc.id, page: 4 },
      });
      expect(last.isError).not.toBe(true);
      expect(last.structuredContent).toMatchObject({
        data: { startPage: 4, nextPage: null },
      });
      expect(last.content.filter((part) => part.type === "image")).toHaveLength(
        1,
      );
      expect(render.fetch).toHaveBeenCalledTimes(2);
      for (const table of [
        "dispatches",
        "expert_approval_policies",
        "expert_document_review_progress",
        "expert_dispatch_reviews",
      ])
        expect(await count(table)).toBe(0);
      expect(await count("audit_log")).toBe(auditCount);
      await noAcceptance();
    } finally {
      await transport.close();
    }
  });

  it("returns no images for missing scope or a connection revoked during private rendering", async () => {
    const item = await originalFixture(4);
    const render = renderer(item, async () => {
      await db
        .prepare(
          "UPDATE authorized_connections SET status='revoked',updated_at=? WHERE id=?",
        )
        .bind(now(), connection)
        .run();
    });
    const service = documents(render.binding);
    const withoutScope = await mcp(service, await identify("dispatches:read"));
    try {
      const denied = await withoutScope.client.callTool({
        name: "read_document_pages",
        arguments: { documentId: item.doc.id },
      });
      expect(denied.isError).toBe(true);
      expect(denied.structuredContent).toMatchObject({
        error: { code: "INSUFFICIENT_SCOPE" },
      });
      expect(
        denied.content.filter((part) => part.type === "image"),
      ).toHaveLength(0);
      expect(render.fetch).not.toHaveBeenCalled();
    } finally {
      await withoutScope.close();
    }
    const reader = await mcp(service, await identify("documents:read"));
    try {
      const revoked = await reader.client.callTool({
        name: "read_document_pages",
        arguments: { documentId: item.doc.id },
      });
      expect(revoked.isError).toBe(true);
      expect(revoked.structuredContent).toMatchObject({
        error: {
          code: "CONNECTION_REVOKED",
          recovery: { action: "reconnect", retry: "after_change" },
        },
      });
      expect(
        revoked.content.filter((part) => part.type === "image"),
      ).toHaveLength(0);
      expect(JSON.stringify(revoked)).not.toContain(imageBase64);
      expect(JSON.stringify(revoked)).not.toContain("Original page 1");
      expect(render.fetch).toHaveBeenCalledTimes(1);
      for (const table of [
        "expert_document_review_progress",
        "expert_dispatch_reviews",
        "dispatches",
      ])
        expect(await count(table)).toBe(0);
      await noAcceptance();
    } finally {
      await reader.close();
    }
  });

  it("denies another tenant's existing PDF before reading storage or invoking the renderer", async () => {
    const item = await originalFixture(4);
    const foreignOrganization = `foreign_${crypto.randomUUID()}`;
    await db.batch([
      db
        .prepare(
          "INSERT INTO organizations VALUES(?,'Foreign fixture','simulation',?)",
        )
        .bind(foreignOrganization, now()),
      db
        .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
        .bind(foreignOrganization, ctx.userId, now()),
    ]);
    const foreignId = `doc_${crypto.randomUUID()}`;
    const foreignKey = `${foreignOrganization}/documents/${item.doc.sha256}/${foreignId}.pdf`;
    await bucket.put(foreignKey, item.bytes);
    const foreign = await domain.registerDocument(
      { ...ctx, organizationId: foreignOrganization },
      {
        id: foreignId,
        name: "Private foreign PDF",
        sha256: item.doc.sha256,
        size: item.bytes.length,
        pages: 4,
        source: "import",
        status: "ready",
        storageKey: foreignKey,
        scanVerified: true,
      },
    );
    const render = renderer(item);
    const storage = vi.spyOn(bucket, "get");
    const transport = await mcp(
      documents(render.binding),
      await identify("documents:read"),
    );
    try {
      const denied = await transport.client.callTool({
        name: "read_document_pages",
        arguments: { documentId: foreign.id },
      });
      expect(denied.isError).toBe(true);
      expect(denied.structuredContent).toMatchObject({
        error: { code: "NOT_FOUND" },
      });
      expect(
        denied.content.filter((part) => part.type === "image"),
      ).toHaveLength(0);
      expect(JSON.stringify(denied)).not.toContain(foreignKey);
      expect(JSON.stringify(denied)).not.toContain(foreign.name);
      expect(storage).not.toHaveBeenCalled();
      expect(render.fetch).not.toHaveBeenCalled();
      for (const table of [
        "expert_document_review_progress",
        "expert_dispatch_reviews",
        "dispatches",
      ])
        expect(await count(table)).toBe(0);
      await noAcceptance();
    } finally {
      await transport.close();
    }
  });
});
