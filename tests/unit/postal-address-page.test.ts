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
import { DocumentService } from "../../apps/api/src/documents";
import {
  postalBrowserAuthority,
  type PostalAuthority,
} from "../../apps/api/src/postal-authority";
import { hashSecret } from "../../apps/api/src/auth";
import {
  DomainService,
  canonicalJson,
  sha256,
  type ActorContext,
} from "../../packages/domain/src/index";
import {
  POSTAL_ADDRESS_PAGE_VERSION,
  POSTAL_ADDRESS_BLOCK_PAGE_VERSION,
  postalAddressLines,
  postalAddressPageVersion,
  type PostalAddressPageInput,
} from "../../packages/contracts/src/postal-address-page";
import {
  PINGEN_PREFLIGHT_VERSION,
  PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
  pingenPreflightVersion,
} from "../../packages/contracts/src/pingen-preflight";
import {
  addressPageProvenance,
  type AddressPageRow,
} from "../../apps/api/src/postal-address-page-binding";
import { PINGEN_DESTINATION_RESTRICTIONS_URL } from "../../packages/providers/pingen-destination-availability";
import { destinationRestrictionsResponse } from "../helpers/pingen-destinations";
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
  if (String(url) === PINGEN_DESTINATION_RESTRICTIONS_URL)
    return destinationRestrictionsResponse();
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
      "X-Guteneo-Postal-Address-Page-Version": postalAddressPageVersion(
        options.recipient,
      ),
    },
  });
}
/** Transport fixture only; physical address layout is tested by the renderer suite. */
async function renderPreflight(
  request: Request,
  recipient: PostalAddressPageInput["recipient"],
) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  const options = JSON.parse(request.headers.get("X-Guteneo-Pingen-Options")!);
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  return Response.json({
    version: pingenPreflightVersion(options),
    status: "review_required",
    sha256: await sha256(bytes),
    pages,
    canSend: false,
    issues: [],
    requiredReviews: ["printed_recipient_matches"],
    rendering: {
      dpi: 144,
      complete: true,
      pages: Array.from({ length: pages }, (_, index) => ({
        page: index + 1,
        width: 1191,
        height: 1684,
        rasterSha256: "a".repeat(64),
      })),
    },
    address: {
      lines: postalAddressLines(recipient, options.defaultCountry),
      issues: [],
      textVisibility: "not_verified",
      crop: {
        pngBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        width: 1,
        height: 1,
        boundsMm: { x: 20, y: 50, width: 90, height: 40 },
      },
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
      version: POSTAL_ADDRESS_PAGE_VERSION,
      sourceDocumentId: input.documentId,
      sourceSha256: sourceHash,
      generatedDocumentId: result.document.id,
      generatedSha256: result.document.sha256,
      addedPages: 1,
      recipient: input.recipient,
      profile: { version: PINGEN_PREFLIGHT_VERSION },
    });
    expect(
      await env.DB.prepare(
        "SELECT input_hash,recipient_json FROM postal_address_pages WHERE idempotency_key='simplex'",
      ).first(),
    ).toEqual({
      input_hash: await sha256(canonicalJson(input)),
      recipient_json: canonicalJson(input.recipient),
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
  it.each([
    {
      label: "legacy fields",
      recipient: input.recipient,
      pageVersion: POSTAL_ADDRESS_PAGE_VERSION,
      preflightVersion: PINGEN_PREFLIGHT_VERSION,
    },
    {
      label: "six-line United States block",
      recipient: {
        country: "US" as const,
        addressLines: [
          "FICTIONAL RECIPIENT",
          "EXAMPLE COMPANY",
          "SUITE 200",
          "123 EXAMPLE ROAD",
          "ANYTOWN CA 90210",
          "UNITED STATES OF AMERICA",
        ],
      },
      pageVersion: POSTAL_ADDRESS_BLOCK_PAGE_VERSION,
      preflightVersion: PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
    },
    {
      label: "France block",
      recipient: {
        country: "FR" as const,
        addressLines: [
          "FICTIONAL RECIPIENT",
          "12 RUE EXEMPLE",
          "75001 PARIS",
          "FRANCE",
        ],
      },
      pageVersion: POSTAL_ADDRESS_BLOCK_PAGE_VERSION,
      preflightVersion: PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
    },
    {
      label: "Kosovo provider code XZ block",
      recipient: {
        country: "XZ" as const,
        addressLines: [
          "FICTIONAL RECIPIENT",
          "12 EXAMPLE ROAD",
          "10000 PRISTINA",
          "KOSOVO",
        ],
      },
      pageVersion: POSTAL_ADDRESS_BLOCK_PAGE_VERSION,
      preflightVersion: PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
    },
  ])(
    "binds $label generation to its own preflight version with four pricing options after migration 0072",
    async ({ recipient, pageVersion, preflightVersion }) => {
      const generation = { ...input, recipient, printMode: "duplex" as const };
      const generated = await service().generate(
        authority,
        generation,
        "versioned-cover",
      );
      expect(generated.provenance).toMatchObject({
        version: pageVersion,
        recipient,
        profile: { version: preflightVersion },
        addedPages: 2,
      });
      expect(generated.document.pages).toBe(4);
      expect(
        await service().generate(authority, generation, "versioned-cover"),
      ).toEqual(generated);
      let renderOptions: Record<string, unknown> | undefined;
      renderer.mockImplementation(async (request: Request) => {
        if (new URL(request.url).pathname === "/preflight/pingen") {
          renderOptions = JSON.parse(
            request.headers.get("X-Guteneo-Pingen-Options")!,
          );
          return renderPreflight(request, recipient);
        }
        return render(request);
      });
      const review = await new PostalService(env, domain, {
        fetcher: profileFetch,
      }).create(
        authority,
        {
          documentId: generated.document.id,
          senderId: "sender",
          recipient,
          options: {
            printMode: "duplex",
            deliveryProduct: "cheap",
            printSpectrum: "grayscale",
          },
          ceilingMinor: 500,
        },
        "versioned-preflight",
      );
      expect(review).toMatchObject({
        status: "review_required",
        addressPage: generated.provenance,
        recipient,
        checks: { complete: true, issues: [] },
        address: {
          matches: true,
          extractedLines: postalAddressLines(recipient, "LU"),
        },
        transferStatus: "not_started",
        draftId: null,
        canSend: false,
      });
      expect(renderOptions?.addressFormat).toBe(
        pageVersion === POSTAL_ADDRESS_BLOCK_PAGE_VERSION
          ? "address_block"
          : undefined,
      );
      const row = (await env.DB.prepare(
        "SELECT recipient_json,options_json,profile_json,report_json,document_sha256 FROM postal_preflights WHERE id=?",
      )
        .bind(review.id)
        .first<{
          recipient_json: string;
          options_json: string;
          profile_json: string;
          report_json: string;
          document_sha256: string;
        }>())!;
      expect(row.recipient_json).toBe(canonicalJson(recipient));
      expect(row.options_json).toBe(
        canonicalJson({
          addressPosition: "left",
          printMode: "duplex",
          deliveryProduct: "cheap",
          printSpectrum: "grayscale",
        }),
      );
      expect(Object.keys(JSON.parse(row.options_json))).toHaveLength(4);
      expect(JSON.parse(row.profile_json).version).toBe(preflightVersion);
      expect(JSON.parse(row.report_json).version).toBe(preflightVersion);
      expect(row.document_sha256).toBe(generated.document.sha256);
      expect(await count("provider_drafts")).toBe(0);
      expect(await count("dispatches")).toBe(0);
      expect(renderCalls()).toHaveLength(1);

      // Exercise the actual migrated SQL guard, bypassing JavaScript binding checks.
      await expect(
        env.DB.prepare(
          `
        INSERT INTO postal_preflights(id,organization_id,user_id,document_id,document_sha256,sender_id,sender_address,recipient_json,options_json,profile_json,expected_address,ceiling_minor,request_hash,input_hash,idempotency_key,status,budget_day,processing_until,expires_at,created_at,updated_at)
        SELECT id||'_tampered',organization_id,user_id,document_id,document_sha256,sender_id,sender_address,?,options_json,profile_json,expected_address,ceiling_minor,request_hash,input_hash,idempotency_key||'_tampered','processing',budget_day,processing_until,expires_at,created_at,updated_at
        FROM postal_preflights WHERE id=?
      `,
        )
          .bind(
            canonicalJson({
              ...recipient,
              country: recipient.country === "US" ? "GB" : "US",
            }),
            review.id,
          )
          .run(),
      ).rejects.toThrow("postal_address_page_binding_invalid");

      const page = (await env.DB.prepare(
        "SELECT * FROM postal_address_pages WHERE id=?",
      )
        .bind(generated.provenance.id)
        .first<AddressPageRow>())!;
      expect(addressPageProvenance(page)).toEqual(generated.provenance);
      expect(() =>
        addressPageProvenance({
          ...page,
          version:
            pageVersion === POSTAL_ADDRESS_PAGE_VERSION
              ? POSTAL_ADDRESS_BLOCK_PAGE_VERSION
              : POSTAL_ADDRESS_PAGE_VERSION,
        }),
      ).toThrow();
      expect(() =>
        addressPageProvenance({
          ...page,
          profile_json: canonicalJson({
            ...JSON.parse(page.profile_json),
            version:
              preflightVersion === PINGEN_PREFLIGHT_VERSION
                ? PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION
                : PINGEN_PREFLIGHT_VERSION,
          }),
        }),
      ).toThrow();
    },
  );
  it("rejects a legacy renderer version for an address-block request before scanning", async () => {
    renderer.mockImplementation(async (request: Request) => {
      const response = await render(request);
      response.headers.set(
        "X-Guteneo-Postal-Address-Page-Version",
        POSTAL_ADDRESS_PAGE_VERSION,
      );
      return response;
    });
    await expect(
      service().generate(
        authority,
        {
          ...input,
          recipient: {
            country: "US",
            addressLines: [
              "FICTIONAL RECIPIENT",
              "12 EXAMPLE ROAD",
              "ANYTOWN CA 90210",
              "USA",
            ],
          },
        },
        "wrong-block-version",
      ),
    ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_PROOF_INVALID" });
    expect(scanner).not.toHaveBeenCalled();
    expect(await count("documents")).toBe(1);
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
  it.each([
    { printMode: "simplex" as const, pageDifference: 0 },
    { printMode: "simplex" as const, pageDifference: 1 },
    { printMode: "duplex" as const, pageDifference: 0 },
    { printMode: "duplex" as const, pageDifference: -1 },
  ])(
    "revalidates $printMode pagination after deferred scan promotion (difference $pageDifference)",
    async ({ printMode, pageDifference }) => {
      scanner.mockImplementationOnce(async () =>
        Response.json(
          { error: { code: "SCANNER_NOT_READY" } },
          { status: 503 },
        ),
      );
      const generationInput = { ...input, printMode };
      const generated = await service().generate(
        authority,
        generationInput,
        "deferred-pages",
      );
      expect(generated.document).toMatchObject({
        status: "quarantined",
        pages: 0,
      });
      const expectedPages = 2 + generated.provenance.addedPages;
      renderer.mockImplementation(async (request: Request) => {
        if (new URL(request.url).pathname === "/validate") {
          const bytes = new Uint8Array(await request.arrayBuffer());
          return Response.json({
            sha256: await sha256(bytes),
            pages: expectedPages + pageDifference,
          });
        }
        return render(request);
      });
      await env.DB.prepare(
        "UPDATE document_analysis SET next_attempt_at=0 WHERE organization_id=? AND document_id=?",
      )
        .bind(ctx.organizationId, generated.document.id)
        .run();
      expect(
        await new DocumentService(env, domain).processPendingScans(),
      ).toEqual({ processed: 1 });
      expect(
        await domain.getDocument(ctx, generated.document.id),
      ).toMatchObject({
        status: "ready",
        pages: expectedPages + pageDifference,
      });
      const replay = service().generate(
        authority,
        generationInput,
        "deferred-pages",
      );
      if (pageDifference === 0) {
        await expect(replay).resolves.toMatchObject({
          document: {
            id: generated.document.id,
            status: "ready",
            pages: expectedPages,
          },
          provenance: generated.provenance,
        });
      } else {
        await expect(replay).rejects.toMatchObject({
          code: "POSTAL_ADDRESS_PAGE_PROOF_INVALID",
        });
      }
      expect(renderCalls()).toHaveLength(1);
      expect(scanner).toHaveBeenCalledTimes(2);
      expect(await count("documents")).toBe(2);
    },
  );
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
        message: expect.stringContaining(
          "without removing necessary information",
        ),
      });
    await expect(
      service().generate(authority, input, "bounded"),
    ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_RETRY_EXHAUSTED" });
    expect(scanner).not.toHaveBeenCalled();
    expect(renderCalls()).toHaveLength(3);
  });
});

it("binds the explicitly selected right window to the generated address page", async () => {
  const selected: PostalAddressPageInput = {
    ...input,
    addressPosition: "right",
  };
  const generated = await service().generate(
    authority,
    selected,
    "right-cover",
  );
  expect(generated.provenance.profile.addressPosition).toBe("right");
  const request = renderCalls()[0][0] as Request;
  expect(
    JSON.parse(
      decodeURIComponent(request.headers.get("X-Guteneo-Postal-Address-Page")!),
    ),
  ).toMatchObject({ addressPosition: "right" });
  await expect(
    service().generate(
      authority,
      { ...selected, addressPosition: "left" },
      "right-cover",
    ),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  const postal = new PostalService(env, domain, { fetcher: profileFetch });
  await expect(
    postal.create(
      authority,
      {
        documentId: generated.document.id,
        senderId: "sender",
        recipient: input.recipient,
        options: {
          addressPosition: "left",
          printMode: "simplex",
          printSpectrum: "grayscale",
          deliveryProduct: "cheap",
        },
        ceilingMinor: 500,
      },
      "wrong-cover-window",
    ),
  ).rejects.toMatchObject({ code: "POSTAL_ADDRESS_PAGE_BINDING_CHANGED" });
  expect(await count("postal_preflights")).toBe(0);
});
