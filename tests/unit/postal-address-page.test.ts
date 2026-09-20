import { readFile, readdir } from "node:fs/promises";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { PDFDocument } from "pdf-lib";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import api from "../../apps/api/src/index";
import { PostalAddressPageService } from "../../apps/api/src/postal-address-page";
import { PostalService } from "../../apps/api/src/postal";
import {
  postalBrowserAuthority,
  type PostalAuthority,
} from "../../apps/api/src/postal-authority";
import { hashSecret } from "../../apps/api/src/auth";
import {
  DomainService,
  sha256,
  type ActorContext,
} from "../../packages/domain/src/index";
import {
  POSTAL_ADDRESS_PAGE_VERSION,
  type PostalAddressPageInput,
} from "../../packages/contracts/src/postal-address-page";
import type { Env } from "../../apps/api/src/env";
import type { Fetcher } from "../../packages/providers";

let mf: Miniflare,
  env: Env,
  domain: DomainService,
  authority: PostalAuthority,
  source: Uint8Array<ArrayBuffer>,
  sourceHash: string;
let renderer: ReturnType<typeof vi.fn>,
  scanner: ReturnType<typeof vi.fn>,
  profilePosition = "left",
  providerCalls: string[];
const ctx: ActorContext = {
  organizationId: "address_org",
  userId: "address_user",
  role: "admin",
  actor: "browser",
};
const openapi = JSON.parse(
  await readFile(
    new URL("../../apps/web/public/openapi.json", import.meta.url),
    "utf8",
  ),
);
const validateResult = new AjvJsonSchemaValidator().getValidator({
  ...openapi.components.schemas.PostalAddressPageResult,
  components: openapi.components,
});
const token = "p".repeat(43),
  csrf = "address-csrf";
const input: PostalAddressPageInput = {
  documentId: "source_document",
  recipient: {
    name: "ATELIER EXEMPLE",
    line1: "Rue du Test 12",
    postalCode: "L-1234",
    city: "LUXEMBOURG",
    country: "LU",
  },
  printMode: "simplex",
};
const profileFetch: Fetcher = async (url) => {
  const path = new URL(String(url)).pathname;
  providerCalls.push(path);
  if (path === "/auth/access-tokens")
    return Response.json({
      access_token: "fixture-token",
      token_type: "Bearer",
      expires_in: 3600,
    });
  if (path === "/organisations/pingen_org")
    return Response.json({
      data: {
        id: "pingen_org",
        type: "organisations",
        attributes: {
          billing_currency: "EUR",
          default_country: "LU",
          default_address_position: profilePosition,
        },
      },
    });
  throw new Error("Unexpected provider operation");
};
function service() {
  return new PostalAddressPageService(env, domain, { fetcher: profileFetch });
}
async function render(request: Request) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  const hash = await sha256(bytes);
  if (new URL(request.url).pathname === "/validate")
    return Response.json({
      sha256: hash,
      pages: (await PDFDocument.load(bytes)).getPageCount(),
    });
  expect(new URL(request.url).pathname).toBe("/postal-address-page");
  expect(request.headers.get("X-Guteneo-Scan-Sha256")).toBe(sourceHash);
  expect(request.headers.get("X-Guteneo-Source-Sha256")).toBe(sourceHash);
  const options = JSON.parse(
    decodeURIComponent(request.headers.get("X-Guteneo-Postal-Address-Page")!),
  );
  const added = options.printMode === "duplex" ? 2 : 1;
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  for (let n = 0; n < added; n++) pdf.addPage([595.28, 841.89]);
  const original = await PDFDocument.load(bytes);
  for (const page of await pdf.copyPages(original, original.getPageIndices()))
    pdf.addPage(page);
  const output = new Uint8Array(await pdf.save());
  return new Response(output, {
    headers: {
      "Content-Type": "application/pdf",
      "X-Guteneo-Source-Sha256": hash,
      "X-Guteneo-Document-Sha256": await sha256(output),
      "X-Guteneo-Document-Pages": String(pdf.getPageCount()),
      "X-Guteneo-Added-Pages": String(added),
      "X-Guteneo-Postal-Address-Page-Version": POSTAL_ADDRESS_PAGE_VERSION,
    },
  });
}
async function login(
  org = ctx.organizationId,
  user = ctx.userId,
  secret = token,
) {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,?,0,0,?,?,1)",
  )
    .bind(
      await hashSecret(secret),
      user,
      org,
      csrf,
      new Date().toISOString(),
      new Date(Date.now() + 3600_000).toISOString(),
    )
    .run();
  return new Request("https://guteneo.example/api/postal/address-pages", {
    method: "POST",
    headers: {
      Cookie: `__Host-guteneo_session=${secret}`,
      Origin: env.APP_ORIGIN,
      "X-CSRF-Token": csrf,
      "Content-Type": "application/json",
      "Idempotency-Key": "route-key",
    },
    body: JSON.stringify(input),
  });
}
async function count(table: string) {
  return (await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{
    n: number;
  }>())!.n;
}
const renderCalls = () =>
  renderer.mock.calls.filter(
    ([request]) => new URL(request.url).pathname === "/postal-address-page",
  );
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "postal-address-page-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-17",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  const DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${name}`, import.meta.url),
      "utf8",
    );
    let statement = "",
      trigger = false;
    const statements: D1PreparedStatement[] = [];
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement)
        trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
      statement += line + "\n";
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        statements.push(DB.prepare(statement));
        statement = "";
        trigger = false;
      }
    }
    if (statements.length) await DB.batch(statements);
  }
  env = {
    DB,
    DOCUMENTS: (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    AUTH0_AUTH_POLICY: "verified_email",
    AUTH0_DOMAIN: "fixture.auth0.com",
    AUTH0_CLIENT_ID: "fixture-client",
    AUTH0_CLIENT_SECRET: "fixture-secret",
    AUTH0_AUDIENCE: "https://guteneo.example",
    POSTAL_DRAFTS_ENABLED: "true",
    LIVE_SENDS_ENABLED: "false",
    PINGEN_CLIENT_ID: "fixture-client",
    PINGEN_CLIENT_SECRET: "fixture-secret",
    PINGEN_ORGANIZATION_ID: "pingen_org",
    PINGEN_DEFAULT_COUNTRY: "LU",
    PINGEN_SANDBOX: "false",
    PINGEN_UPLOAD_ORIGINS: "https://upload.pingen.example",
  } as Env;
  domain = new DomainService(DB, { mode: "production" });
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  pdf.addPage([595.28, 841.89]);
  source = new Uint8Array(await pdf.save());
  sourceHash = await sha256(source);
  for (const suffix of ["", "_other"]) {
    const org = ctx.organizationId + suffix,
      user = ctx.userId + suffix,
      now = new Date().toISOString();
    await DB.batch([
      DB.prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,'production',?)",
      ).bind(org, "Fixture", now),
      DB.prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
      ).bind(user, "Fixture", `${user}@example.invalid`, now),
      DB.prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      ).bind(org, user, now),
      DB.prepare(
        "INSERT INTO content_limits(organization_id,uploads_per_day,bytes_per_day,renders_per_day) VALUES(?,100,209715200,100)",
      ).bind(org),
    ]);
  }
  await DB.prepare(
    "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES('sender',?,'postal','Fixture','Return fixture','verified','production',?)",
  )
    .bind(ctx.organizationId, new Date().toISOString())
    .run();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  profilePosition = "left";
  providerCalls = [];
  await env.DB.batch(
    [
      "DELETE FROM postal_preflights",
      "DELETE FROM postal_address_pages",
      "DELETE FROM document_analysis",
      "DELETE FROM document_scan_locks",
      "DELETE FROM documents",
      "DELETE FROM audit_log",
      "DELETE FROM content_usage",
      "DELETE FROM browser_sessions",
      "UPDATE memberships SET role='admin'",
    ].map((sql) => env.DB.prepare(sql)),
  );
  for (const obj of (await env.DOCUMENTS.list()).objects)
    await env.DOCUMENTS.delete(obj.key);
  const key = `${ctx.organizationId}/documents/${sourceHash}/source.pdf`;
  await env.DOCUMENTS.put(key, source);
  await domain.registerDocument(ctx, {
    id: input.documentId,
    name: "source.pdf",
    sha256: sourceHash,
    pages: 2,
    size: source.length,
    status: "ready",
    source: "import",
    storageKey: key,
    scanVerified: true,
  });
  renderer = vi.fn(render);
  scanner = vi.fn(async (request: Request) =>
    Response.json({
      sha256: await sha256(new Uint8Array(await request.arrayBuffer())),
      verdict: "clean",
    }),
  );
  env.DOCUMENT_RENDERER = { fetch: renderer } as unknown as globalThis.Fetcher;
  env.SCANNER = { fetch: scanner } as unknown as globalThis.Fetcher;
  authority = await postalBrowserAuthority(await login(), env);
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => mf.dispose());

describe("explicit postal address-page generation", () => {
  it("preserves original, scans exact final bytes, stores immutable provenance and performs only provider profile reads", async () => {
    const result = await service().generate(authority, input, "simplex");
    expect(result.document).toMatchObject({
      status: "ready",
      pages: 3,
      source: "render",
      analysis: { state: "ready" },
    });
    expect(result.document.id).not.toBe(input.documentId);
    expect(result.canSend).toBe(false);
    expect(result.document).not.toHaveProperty("storage_key");
    expect(result.provenance).toMatchObject({
      sourceDocumentId: input.documentId,
      sourceSha256: sourceHash,
      generatedDocumentId: result.document.id,
      generatedSha256: result.document.sha256,
      addedPages: 1,
      recipient: input.recipient,
    });
    expect(scanner).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare(
        "SELECT 1 AS verified FROM audit_log WHERE organization_id=? AND action='document.scan_verified' AND resource_id=?",
      )
        .bind(ctx.organizationId, result.document.sha256)
        .first(),
    ).toEqual({ verified: 1 });
    const original = await domain.getDocument(ctx, input.documentId);
    expect(
      await sha256(
        new Uint8Array(
          await (await env.DOCUMENTS.get(original.storage_key))!.arrayBuffer(),
        ),
      ),
    ).toBe(sourceHash);
    expect(
      providerCalls.every(
        (p) => p === "/auth/access-tokens" || p === "/organisations/pingen_org",
      ),
    ).toBe(true);
    expect(await count("provider_drafts")).toBe(0);
    expect(await count("dispatches")).toBe(0);
    expect(
      (
        await env.DOCUMENTS.list({
          prefix: `${ctx.organizationId}/postal-address-pages/`,
        })
      ).objects,
    ).toHaveLength(0);
    await expect(
      env.DB.prepare(
        "UPDATE postal_address_pages SET recipient_json='{}'",
      ).run(),
    ).rejects.toThrow("immutable_postal_address_page");
  });
  it("adds the blank cover verso in duplex and replays without rendering/scanning/charging again", async () => {
    const first = await service().generate(
      authority,
      { ...input, printMode: "duplex" },
      "duplex",
    );
    const second = await service().generate(
      authority,
      { ...input, printMode: "duplex" },
      "duplex",
    );
    expect(first.document.pages).toBe(4);
    expect(first.provenance.addedPages).toBe(2);
    expect(second).toEqual(first);
    expect(renderCalls()).toHaveLength(1);
    expect(scanner).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare(
        "SELECT uploads,renders FROM content_usage WHERE organization_id=?",
      )
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ uploads: 1, renders: 1 });
  });
  it("rejects changed idempotency input and user supplied proof or tenant fields", async () => {
    await service().generate(authority, input, "same");
    await expect(
      service().generate(authority, { ...input, printMode: "duplex" }, "same"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      service().generate(
        authority,
        { ...input, organizationId: "other" } as PostalAddressPageInput,
        "extra",
      ),
    ).rejects.toThrow();
    expect(renderCalls()).toHaveLength(1);
  });
  it("rejects recursive covers and another tenant source", async () => {
    const generated = await service().generate(authority, input, "once");
    await expect(
      service().generate(
        authority,
        { ...input, documentId: generated.document.id },
        "twice",
      ),
    ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_RECURSIVE" });
    const other = await postalBrowserAuthority(
      await login(
        ctx.organizationId + "_other",
        ctx.userId + "_other",
        "o".repeat(43),
      ),
      env,
    );
    await expect(
      service().generate(other, input, "once"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(renderCalls()).toHaveLength(1);
  });
  it("requires exact ready source bytes and scan evidence before renderer invocation", async () => {
    await env.DB.prepare(
      "DELETE FROM audit_log WHERE action='document.scan_verified'",
    ).run();
    await expect(
      service().generate(authority, input, "scan"),
    ).rejects.toMatchObject({ code: "VERIFIED_SCAN_REQUIRED" });
    expect(renderer).not.toHaveBeenCalled();
    await domain.registerDocument(ctx, {
      id: input.documentId,
      name: "source.pdf",
      sha256: sourceHash,
      pages: 2,
      size: source.length,
      status: "ready",
      source: "import",
      storageKey: `${ctx.organizationId}/documents/${sourceHash}/source.pdf`,
      scanVerified: true,
    });
    await env.DOCUMENTS.put(
      `${ctx.organizationId}/documents/${sourceHash}/source.pdf`,
      new Uint8Array(source.length),
    );
    await expect(
      service().generate(authority, input, "bytes"),
    ).rejects.toMatchObject({ code: "DOCUMENT_INTEGRITY_MISMATCH" });
    expect(renderer).not.toHaveBeenCalled();
  });
  it("enforces browser CSRF and current membership without provider activity", async () => {
    const request = await login();
    request.headers.delete("X-CSRF-Token");
    const response = await api.fetch(request, env);
    expect(response.status).toBe(403);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
    )
      .bind(ctx.organizationId, ctx.userId + "_other", new Date().toISOString())
      .run();
    await env.DB.prepare(
      "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id='address_user'",
    )
      .bind(ctx.organizationId)
      .run();
    await expect(
      service().generate(authority, input, "viewer"),
    ).rejects.toMatchObject({ status: 403 });
    expect(renderer).not.toHaveBeenCalled();
  });
  it("rejects revoked browser session after renderer and before registering any final document", async () => {
    renderer.mockImplementation(async (request: Request) => {
      const response = await render(request);
      await env.DB.prepare("DELETE FROM browser_sessions").run();
      return response;
    });
    await expect(
      service().generate(authority, input, "revoked"),
    ).rejects.toMatchObject({ status: 401 });
    expect(await count("documents")).toBe(1);
    expect(scanner).not.toHaveBeenCalled();
  });
  it("fences registration atomically if the browser session disappears after the last JS check", async () => {
    const register = domain.registerDocument.bind(domain);
    vi.spyOn(domain, "registerDocument").mockImplementation(async (...args) => {
      await env.DB.prepare("DELETE FROM browser_sessions").run();
      return register(...args);
    });
    await expect(
      service().generate(authority, input, "atomic"),
    ).rejects.toMatchObject({ code: "DOCUMENT_UNAVAILABLE" });
    expect(await count("documents")).toBe(1);
  });
  it("returns processing for concurrent same-key work and one durable document", async () => {
    let release!: () => void, started!: () => void;
    const entered = new Promise<void>((r) => (started = r)),
      wait = new Promise<void>((r) => (release = r));
    renderer.mockImplementation(async (request: Request) => {
      if (new URL(request.url).pathname === "/postal-address-page") {
        started();
        await wait;
      }
      return render(request);
    });
    const first = service().generate(authority, input, "concurrent");
    await entered;
    await expect(
      service().generate(authority, input, "concurrent"),
    ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_PROCESSING" });
    release();
    const result = await first;
    expect(result.document.status).toBe("ready");
    expect(renderCalls()).toHaveLength(1);
    expect(await count("documents")).toBe(2);
  });
  it("recovers saved final bytes after registration failure without another render", async () => {
    const register = domain.registerDocument.bind(domain);
    vi.spyOn(domain, "registerDocument")
      .mockRejectedValueOnce(new Error("synthetic persistence interruption"))
      .mockImplementation(register);
    await expect(service().generate(authority, input, "retry")).rejects.toThrow(
      "synthetic persistence interruption",
    );
    const resumed = await service().generate(authority, input, "retry");
    expect(resumed.document.status).toBe("ready");
    expect(renderCalls()).toHaveLength(1);
    expect(await count("documents")).toBe(2);
  });
  it("recovers a registered document after losing finalization acknowledgement without re-scanning", async () => {
    const register = domain.registerDocument.bind(domain);
    vi.spyOn(domain, "registerDocument")
      .mockImplementationOnce(async (...args) => {
        await register(...args);
        throw new Error("synthetic lost acknowledgement");
      })
      .mockImplementation(register);
    await expect(service().generate(authority, input, "lost")).rejects.toThrow(
      "synthetic lost acknowledgement",
    );
    const resumed = await service().generate(authority, input, "lost");
    expect(resumed.document.status).toBe("ready");
    expect(renderCalls()).toHaveLength(1);
    expect(scanner).toHaveBeenCalledTimes(1);
    expect(await count("documents")).toBe(2);
  });
  it("repairs an interrupted ready registration missing its scan proof", async () => {
    const register = domain.registerDocument.bind(domain);
    vi.spyOn(domain, "registerDocument")
      .mockImplementationOnce(async (...args) => {
        const document = await register(...args);
        await env.DB.prepare(
          "DELETE FROM audit_log WHERE action='document.scan_verified' AND resource_id=?",
        )
          .bind(document.sha256)
          .run();
        throw new Error("synthetic historical partial registration");
      })
      .mockImplementation(register);
    await expect(
      service().generate(authority, input, "proof-retry"),
    ).rejects.toThrow("synthetic historical partial registration");
    const result = await service().generate(authority, input, "proof-retry");
    expect(result.document.status).toBe("ready");
    expect(scanner).toHaveBeenCalledTimes(2);
    expect(renderCalls()).toHaveLength(1);
    await expect(
      new PostalService(env, domain, { fetcher: profileFetch }).exactDocument(
        ctx.organizationId,
        result.document.id,
      ),
    ).resolves.toMatchObject({ document: { sha256: result.document.sha256 } });
  });
  it("never finalizes historical ready bytes when the repair scan is unavailable", async () => {
    const register = domain.registerDocument.bind(domain);
    vi.spyOn(domain, "registerDocument")
      .mockImplementationOnce(async (...args) => {
        const document = await register(...args);
        await env.DB.prepare(
          "DELETE FROM audit_log WHERE action='document.scan_verified' AND resource_id=?",
        )
          .bind(document.sha256)
          .run();
        throw new Error("synthetic historical partial registration");
      })
      .mockImplementation(register);
    await expect(
      service().generate(authority, input, "proof-pending"),
    ).rejects.toThrow("synthetic historical partial registration");
    scanner.mockImplementationOnce(async () =>
      Response.json({ error: { code: "SCANNER_NOT_READY" } }, { status: 503 }),
    );
    await expect(
      service().generate(authority, input, "proof-pending"),
    ).rejects.toMatchObject({ code: "VERIFIED_SCAN_REQUIRED" });
    expect(
      await env.DB.prepare(
        "SELECT generated_document_id FROM postal_address_pages WHERE idempotency_key='proof-pending'",
      ).first(),
    ).toEqual({ generated_document_id: null });
    const recovered = await service().generate(
      authority,
      input,
      "proof-pending",
    );
    expect(recovered.document.status).toBe("ready");
    expect(renderCalls()).toHaveLength(1);
  });
  it("returns the strict public HTTP/OpenAPI envelope and replays the same ID", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      profileFetch as typeof fetch,
    );
    const response = await api.fetch(await login(), env);
    expect(response.status).toBe(201);
    const result = (await response.json()) as { document: { id: string } };
    expect(validateResult(result).valid).toBe(true);
    const replay = await api.fetch(await login(), env);
    expect(replay.status).toBe(201);
    expect(((await replay.json()) as typeof result).document.id).toBe(
      result.document.id,
    );
    expect(renderCalls()).toHaveLength(1);
  });
  it("rejects a forged renderer hash and enforces the existing render budget", async () => {
    renderer.mockImplementation(async (request: Request) => {
      const response = await render(request);
      response.headers.set("X-Guteneo-Document-Sha256", "0".repeat(64));
      return response;
    });
    await expect(
      service().generate(authority, input, "forged"),
    ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_PROOF_INVALID" });
    expect(scanner).not.toHaveBeenCalled();
    expect(await count("documents")).toBe(1);
    await env.DB.prepare(
      "UPDATE content_limits SET renders_per_day=1 WHERE organization_id=?",
    )
      .bind(ctx.organizationId)
      .run();
    await expect(
      service().generate(authority, input, "quota"),
    ).rejects.toMatchObject({ code: "CONTENT_QUOTA_EXCEEDED" });
    expect(renderCalls()).toHaveLength(1);
    await env.DB.prepare(
      "UPDATE content_limits SET renders_per_day=100 WHERE organization_id=?",
    )
      .bind(ctx.organizationId)
      .run();
  });
  it("retains the quarantined final ID when its new scan is pending, without permitting a preflight", async () => {
    scanner.mockImplementation(async () =>
      Response.json({ error: { code: "SCANNER_NOT_READY" } }, { status: 503 }),
    );
    const result = await service().generate(authority, input, "pending");
    expect(result.document).toMatchObject({
      status: "quarantined",
      analysis: { state: "processing" },
    });
    const retry = await service().generate(authority, input, "pending");
    expect(retry.document.id).toBe(result.document.id);
    expect(scanner).toHaveBeenCalledTimes(1);
    await expect(
      new PostalService(env, domain, { fetcher: profileFetch }).create(
        authority,
        {
          documentId: result.document.id,
          senderId: "sender",
          recipient: input.recipient,
          options: {
            printMode: "simplex",
            deliveryProduct: "cheap",
            printSpectrum: "grayscale",
          },
          ceilingMinor: 500,
        },
        "preflight",
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_READY" });
  });
  it("blocks changed recipient, print mode and provider profile before preflight rendering", async () => {
    const generated = await service().generate(authority, input, "binding");
    const postal = new PostalService(env, domain, { fetcher: profileFetch });
    const review = {
      documentId: generated.document.id,
      senderId: "sender",
      recipient: input.recipient,
      options: {
        printMode: "simplex" as const,
        deliveryProduct: "cheap" as const,
        printSpectrum: "grayscale" as const,
      },
      ceilingMinor: 500,
    };
    await expect(
      postal.create(
        authority,
        { ...review, recipient: { ...input.recipient, name: "OTHER" } },
        "recipient",
      ),
    ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_BINDING_CHANGED" });
    await expect(
      postal.create(
        authority,
        { ...review, options: { ...review.options, printMode: "duplex" } },
        "mode",
      ),
    ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_BINDING_CHANGED" });
    profilePosition = "right";
    await expect(
      postal.create(authority, review, "profile"),
    ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_BINDING_CHANGED" });
    expect(renderCalls()).toHaveLength(1);
    expect(await count("postal_preflights")).toBe(0);
  });
  it("rejects invalid renderer evidence before scanning, with bounded retries and actionable errors", async () => {
    renderer.mockImplementation(async () =>
      Response.json(
        { error: { code: "POSTAL_ADDRESS_PAGE_ADDRESS_TOO_LONG" } },
        { status: 422 },
      ),
    );
    for (let n = 0; n < 3; n++)
      await expect(
        service().generate(authority, input, "bounded"),
      ).rejects.toMatchObject({
        code: "POSTAL_ADDRESS_PAGE_ADDRESS_TOO_LONG",
        message: expect.stringContaining("sans retirer d’information"),
      });
    await expect(
      service().generate(authority, input, "bounded"),
    ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_RETRY_EXHAUSTED" });
    expect(scanner).not.toHaveBeenCalled();
    expect(renderCalls()).toHaveLength(3);
  });
});
