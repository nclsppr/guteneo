import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { PdfValidationService } from "../../apps/api/src/pdf-validation";
import {
  DomainService,
  sha256,
  type ActorContext,
} from "../../packages/domain/src/index";
import {
  hashSecret,
  authenticateMcp,
  type McpIdentity,
} from "../../apps/api/src/auth";
import {
  getPdfValidationPricing,
  expirePdfValidations,
} from "../../apps/api/src/pdf-validation-pricing";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import {
  postalBrowserAuthority,
  postalMcpAuthority,
} from "../../apps/api/src/postal-authority";
import type { Env } from "../../apps/api/src/env";
import {
  PDF_VALIDATION_PRICE_MINOR,
  PDF_VALIDATION_TERMS_VERSION,
  pdfManualChecks,
  privatePdfValidationResult,
  pdfValidationRuleTotals,
} from "../../packages/contracts/src/pdf-validation";

let mf: Miniflare;
let DB: D1Database;
let DOCUMENTS: R2Bucket;
let bytes: Uint8Array<ArrayBuffer>;
let hash: string;
const origin = "http://localhost:8787";
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "pdf-validation-test",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  DOCUMENTS = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    let statement = "";
    let trigger = false;
    for (const raw of (
      await readFile(
        new URL(`../../migrations/${name}`, import.meta.url),
        "utf8",
      )
    ).split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (line.startsWith("CREATE TRIGGER") && !line.endsWith("END;"))
        trigger = true;
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await DB.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
  }
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  bytes = new Uint8Array(await pdf.save());
  hash = await sha256(bytes);
});
afterAll(async () => mf?.dispose());

const engineResult = (
  profile = "ua1",
  extra: Record<string, unknown> = {},
) => ({
  sha256: hash,
  profile,
  engine: { name: "veraPDF", version: "1.30.2" },
  compliant: true,
  passedRules:
    pdfValidationRuleTotals[profile as keyof typeof pdfValidationRuleTotals],
  failedRules: 0,
  failedChecks: 0,
  truncated: false,
  findings: [],
  ...extra,
});
async function fixture(
  enabled = true,
  privateToCreator = false,
  mode: "simulation" | "production" = "simulation",
) {
  const suffix = crypto.randomUUID();
  const now = new Date().toISOString();
  const actor: ActorContext = {
    organizationId: `org_${suffix}`,
    userId: `user_${suffix}`,
    role: "admin",
    actor: "browser",
  };
  await DB.batch([
    DB.prepare(
      "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,?,?)",
    ).bind(actor.organizationId, "Synthetic fixture", mode, now),
    DB.prepare(
      "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
    ).bind(actor.userId, "Fixture", `${suffix}@example.invalid`, now),
    DB.prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
    ).bind(actor.organizationId, actor.userId, now),
  ]);
  const secret = crypto.randomUUID().replaceAll("-", "") + "01234567890";
  const tokenHash = await hashSecret(secret);
  await DB.prepare(
    "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'fixture-csrf',1,0,?,?,1)",
  )
    .bind(
      tokenHash,
      actor.userId,
      actor.organizationId,
      now,
      new Date(Date.now() + 3600_000).toISOString(),
    )
    .run();
  const fetch = vi.fn(async (request: Request) => {
    expect(await sha256(new Uint8Array(await request.arrayBuffer()))).toBe(
      hash,
    );
    const profile = new URL(request.url).searchParams.get("profile")!;
    return Response.json(engineResult(profile));
  });
  const env = {
    DB,
    DOCUMENTS,
    ENVIRONMENT: "local",
    MODE: mode,
    SCANNER:
      mode === "production"
        ? ({
            fetch: async () => new Response("synthetic scanner fixture"),
          } as unknown as Fetcher)
        : undefined,
    APP_ORIGIN: origin,
    PDF_VALIDATION_ENABLED: enabled ? "true" : "false",
    PDF_VALIDATOR: { fetch } as unknown as Fetcher,
  } as Env;
  const domain = new DomainService(DB, { mode });
  const storageKey = `${actor.organizationId}/original.pdf`;
  await DOCUMENTS.put(storageKey, bytes);
  const document = await domain.registerDocument(actor, {
    name: "Synthetic.pdf",
    sha256: hash,
    size: bytes.length,
    pages: 1,
    status: "ready",
    source: privateToCreator ? "render" : "import",
    storageKey,
    privateToCreator,
    scanVerified: mode === "production",
  });
  const authRequest = new Request(
    `${origin}/api/documents/${document.id}/validation`,
    {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: `guteneo_session=${secret}`,
        "X-CSRF-Token": "fixture-csrf",
      },
    },
  );
  const authority = await postalBrowserAuthority(authRequest, env, true);
  return {
    actor,
    authority,
    authRequest,
    tokenHash,
    env,
    fetch,
    domain,
    document,
    service: new PdfValidationService(env, domain),
  };
}
const purchase = (profile: "ua1" | "ua2" | "1b" | "2b" | "3b" | "4") => ({
  profile,
  purchase: {
    confirmed: true,
    documentSha256: hash,
    priceMinor: PDF_VALIDATION_PRICE_MINOR,
    currency: "EUR",
    termsVersion: PDF_VALIDATION_TERMS_VERSION,
  },
});
const key = () => crypto.randomUUID();

async function tenantPeer(
  f: Awaited<ReturnType<typeof fixture>>,
  role: "member" | "admin",
) {
  const userId = `user_${key()}`;
  const now = new Date().toISOString();
  const secret = key().replaceAll("-", "") + "01234567890";
  await DB.batch([
    DB.prepare(
      "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
    ).bind(userId, "Private PDF peer", `${userId}@example.invalid`, now),
    DB.prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,?,?)",
    ).bind(f.actor.organizationId, userId, role, now),
    DB.prepare(
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'fixture-csrf',1,0,?,?,1)",
    ).bind(
      await hashSecret(secret),
      userId,
      f.actor.organizationId,
      now,
      new Date(Date.now() + 3600_000).toISOString(),
    ),
  ]);
  const authority = await postalBrowserAuthority(
    new Request(`${origin}/api/documents/${f.document.id}/validation`, {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: `guteneo_session=${secret}`,
        "X-CSRF-Token": "fixture-csrf",
      },
    }),
    f.env,
    true,
  );
  return { userId, authority };
}

async function diagnosticClient(
  f: Awaited<ReturnType<typeof fixture>>,
  userId: string,
) {
  const token = `gtn_dev_${key()}`;
  await DB.prepare(
    "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES(?,?,?,?)",
  )
    .bind(
      await hashSecret(token),
      userId,
      f.actor.organizationId,
      new Date(Date.now() + 3600_000).toISOString(),
    )
    .run();
  const identity = await authenticateMcp(
    new Request(`${origin}/mcp`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    f.env,
  );
  const server = createGuteneoMcpServer(identity, f.env, {
    domain: f.domain,
    documents: {} as never,
    capabilities: () => ({}),
    pdfValidation: {
      validate: async (id, documentId, input, requestKey) =>
        f.service.validate(
          await postalMcpAuthority(id, f.env, "documents:write"),
          documentId,
          input,
          requestKey,
        ),
      list: (id, documentId) => f.service.list(id.context, documentId),
    },
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "private-diagnostic-test", version: "1" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("immutable PDF diagnostics and explicit per-check purchases", () => {
  it("requires current human purchase consent bound to the exact PDF, profile and unit price", async () => {
    const f = await fixture();
    await expect(
      f.service.validate(f.authority, f.document.id, { profile: "ua1" }, key()),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_PURCHASE_REQUIRED" });
    const approved = purchase("ua1");
    for (const changed of [
      { priceMinor: 9 },
      { currency: "USD" },
      { termsVersion: "old-terms" },
    ])
      await expect(
        f.service.validate(
          f.authority,
          f.document.id,
          { ...approved, purchase: { ...approved.purchase, ...changed } },
          key(),
        ),
      ).rejects.toMatchObject({ code: "PDF_VALIDATION_PRICE_CHANGED" });
    await expect(
      f.service.validate(
        f.authority,
        f.document.id,
        {
          ...approved,
          purchase: { ...approved.purchase, documentSha256: "a".repeat(64) },
        },
        key(),
      ),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_PURCHASE_REQUIRED" });
    const peer = await tenantPeer(f, "member");
    await expect(
      f.service.validate(peer.authority, f.document.id, approved, key()),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_ADMIN_REQUIRED" });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(await getPdfValidationPricing(f.env, f.actor)).toMatchObject({
      creditAvailableMinor: 5000,
    });
    expect(
      await DB.prepare(
        "SELECT count(*) n FROM pdf_validation_purchases WHERE organization_id=?",
      )
        .bind(f.actor.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });

  it("reserves production credit atomically, settles one completed report and includes its real posting day", async () => {
    const f = await fixture(true, false, "production");
    const requestKey = key();
    const report = await f.service.validate(
      f.authority,
      f.document.id,
      purchase("ua1"),
      requestKey,
    );
    expect(
      await f.service.validate(
        f.authority,
        f.document.id,
        purchase("ua1"),
        requestKey,
      ),
    ).toEqual(report);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(await f.domain.usage(f.actor)).toMatchObject({
      welcomeCredit: {
        grantedMinor: 5000,
        reservedMinor: 0,
        spentMinor: 10,
        availableMinor: 4990,
      },
    });
    const completed = await DB.prepare(
      "SELECT completed_at FROM pdf_validations WHERE organization_id=? AND id=?",
    )
      .bind(f.actor.organizationId, report.id)
      .first<{ completed_at: string }>();
    expect(await f.domain.usageActivity(f.actor)).toMatchObject({
      days: [
        {
          date: completed!.completed_at.slice(0, 10),
          amountMinor: 10,
          dispatchCount: 0,
          chargeCount: 1,
        },
      ],
      totals: { amountMinor: 10, chargeCount: 1, activeDays: 1 },
    });
    await expect(
      DB.prepare("DELETE FROM pdf_validation_purchases WHERE organization_id=?")
        .bind(f.actor.organizationId)
        .run(),
    ).rejects.toThrow("immutable_pdf_purchase");
    await expect(
      DB.prepare("DELETE FROM pdf_validations WHERE organization_id=?")
        .bind(f.actor.organizationId)
        .run(),
    ).rejects.toThrow("immutable_pdf_purchase");
  });

  it("releases a failed or expired engine hold without consumption and never retries the same key", async () => {
    const f = await fixture(true, false, "production");
    const failedKey = key();
    f.fetch.mockImplementationOnce(
      async () => new Response("technical failure", { status: 503 }),
    );
    await expect(
      f.service.validate(
        f.authority,
        f.document.id,
        purchase("ua1"),
        failedKey,
      ),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_FAILED" });
    await expect(
      f.service.validate(
        f.authority,
        f.document.id,
        purchase("ua1"),
        failedKey,
      ),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_FAILED" });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(await f.domain.usage(f.actor)).toMatchObject({
      welcomeCredit: { reservedMinor: 0, spentMinor: 0, availableMinor: 5000 },
    });
    let finish = () => {};
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.fetch.mockImplementationOnce(async () => {
      await held;
      return Response.json(engineResult());
    });
    const pending = f.service.validate(
      f.authority,
      f.document.id,
      purchase("ua1"),
      key(),
    );
    const stopped = expect(pending).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
    expect(await f.domain.usage(f.actor)).toMatchObject({
      welcomeCredit: { reservedMinor: 10, spentMinor: 0, availableMinor: 4990 },
    });
    await expirePdfValidations(
      f.env,
      new Date(Date.now() + 61000).toISOString(),
    );
    expect(await f.domain.usage(f.actor)).toMatchObject({
      welcomeCredit: { reservedMinor: 0, spentMinor: 0, availableMinor: 5000 },
    });
    finish();
    await stopped;
    expect((await f.service.list(f.actor, f.document.id)).items).toEqual([]);
    expect((await f.domain.usageActivity(f.actor)).days).toEqual([]);
  });
  it("keeps generated private PDF diagnostics with their browser owner, including replay and history", async () => {
    const f = await fixture(true, true);
    expect(f.document.access_owner_id).toBe(f.actor.userId);
    expect(f.document.source).toBe("render");
    const requestKey = key();
    const report = await f.service.validate(
      f.authority,
      f.document.id,
      purchase("ua1"),
      requestKey,
    );
    expect((await f.service.list(f.actor, f.document.id)).items).toEqual([
      report,
    ]);
    for (const role of ["member", "admin"] as const) {
      const peer = await tenantPeer(f, role);
      for (const idempotency of [requestKey, key()]) {
        await expect(
          f.service.validate(
            peer.authority,
            f.document.id,
            purchase("ua1"),
            idempotency,
          ),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
      await expect(
        f.service.list(peer.authority.context, f.document.id),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(
      await DB.prepare(
        "SELECT COUNT(*) AS n FROM pdf_validations WHERE organization_id=?",
      )
        .bind(f.actor.organizationId)
        .first(),
    ).toEqual({ n: 1 });
    expect(await f.domain.getDocument(f.actor, f.document.id)).toEqual(
      f.document,
    );
  });

  it("rejects a private document claim by another current member or admin in SQL before quota or engine access", async () => {
    const f = await fixture(true, true);
    const now = new Date().toISOString();
    for (const role of ["member", "admin"] as const) {
      const peer = await tenantPeer(f, role);
      const id = key();
      await expect(
        DB.prepare(
          `INSERT INTO pdf_validations(organization_id,id,document_id,document_sha256,request_user_id,profile,evidence,idempotency_key,period,status,created_at,deadline_at,purchase_terms_version,purchase_price_minor,purchase_source) VALUES(?,?,?,?,?,'ua1','simulation',?,?,'processing',?,?,'${PDF_VALIDATION_TERMS_VERSION}',${PDF_VALIDATION_PRICE_MINOR},'browser_administrator')`,
        )
          .bind(
            f.actor.organizationId,
            id,
            f.document.id,
            hash,
            peer.userId,
            id,
            now.slice(0, 7),
            now,
            new Date(Date.now() + 60_000).toISOString(),
          )
          .run(),
      ).rejects.toThrow("pdf_validation_authority");
    }
    expect(f.fetch).not.toHaveBeenCalled();
    expect(
      await DB.prepare(
        "SELECT COUNT(*) AS n FROM pdf_validations WHERE organization_id=?",
      )
        .bind(f.actor.organizationId)
        .first(),
    ).toEqual({ n: 0 });
    await expect(
      f.service.validate(f.authority, f.document.id, purchase("ua1"), key()),
    ).resolves.toMatchObject({ status: "passed", documentId: f.document.id });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it("applies generated PDF ownership to authenticated MCP validation and history reads", async () => {
    const f = await fixture(true, true);
    const purchasedKey = key();
    await f.service.validate(
      f.authority,
      f.document.id,
      purchase("ua2"),
      purchasedKey,
    );
    const own = await diagnosticClient(f, f.actor.userId);
    try {
      expect(
        await own.client.callTool({
          name: "validate_pdf",
          arguments: {
            documentId: f.document.id,
            profile: "ua2",
            idempotencyKey: purchasedKey,
          },
        }),
      ).toMatchObject({
        structuredContent: {
          ok: true,
          data: { documentId: f.document.id, profile: "ua2" },
        },
      });
      expect(
        await own.client.callTool({
          name: "get_pdf_validation",
          arguments: { documentId: f.document.id },
        }),
      ).toMatchObject({
        structuredContent: {
          ok: true,
          data: { items: [{ documentId: f.document.id, profile: "ua2" }] },
        },
      });
      for (const role of ["member", "admin"] as const) {
        const peer = await tenantPeer(f, role);
        const connected = await diagnosticClient(f, peer.userId);
        try {
          for (const operation of [
            {
              name: "validate_pdf",
              arguments: {
                documentId: f.document.id,
                profile: "ua2",
                idempotencyKey: key(),
              },
            },
            {
              name: "get_pdf_validation",
              arguments: { documentId: f.document.id },
            },
          ]) {
            expect(await connected.client.callTool(operation)).toMatchObject({
              isError: true,
              structuredContent: { ok: false, error: { code: "NOT_FOUND" } },
            });
          }
        } finally {
          await connected.client.close();
          await connected.server.close();
        }
      }
    } finally {
      await own.client.close();
      await own.server.close();
    }
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(
      await DB.prepare(
        "SELECT COUNT(*) AS n FROM pdf_validations WHERE organization_id=?",
      )
        .bind(f.actor.organizationId)
        .first(),
    ).toEqual({ n: 1 });
  });

  it("checks exact bytes once, keeps security/original unchanged and exposes bounded history", async () => {
    const f = await fixture();
    const idempotency = key();
    const result = await f.service.validate(
      f.authority,
      f.document.id,
      purchase("ua1"),
      idempotency,
    );
    expect(result).toMatchObject({
      status: "passed",
      manualReviewRequired: true,
      certification: false,
      sha256: hash,
      evidence: "simulation",
      engine: { name: "veraPDF", version: "1.30.2" },
    });
    expect(
      await f.service.validate(
        f.authority,
        f.document.id,
        purchase("ua1"),
        idempotency,
      ),
    ).toEqual(result);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(await f.domain.getDocument(f.actor, f.document.id)).toEqual(
      f.document,
    );
    expect(
      await sha256(
        new Uint8Array(
          await (await DOCUMENTS.get(f.document.storage_key))!.arrayBuffer(),
        ),
      ),
    ).toBe(hash);
    expect(await getPdfValidationPricing(f.env, f.actor)).toMatchObject({
      creditAvailableMinor: 4990,
    });
    expect(await f.service.list(f.actor, f.document.id)).toEqual({
      items: [result],
    });
    await expect(
      f.service.validate(
        f.authority,
        f.document.id,
        purchase("ua2"),
        idempotency,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rejects disabled checking, quarantine and missing engine before reading PDF bytes", async () => {
    const unpaid = await fixture(false);
    await expect(
      unpaid.service.validate(
        unpaid.authority,
        unpaid.document.id,
        purchase("ua1"),
        key(),
      ),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_UNAVAILABLE" });
    expect(unpaid.fetch).not.toHaveBeenCalled();
    const f = await fixture();
    const gated = new PdfValidationService(
      { ...f.env, PDF_VALIDATOR: undefined },
      f.domain,
    );
    await expect(
      gated.validate(f.authority, f.document.id, purchase("ua1"), key()),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_UNAVAILABLE" });
    await DB.prepare(
      "UPDATE documents SET status='quarantined' WHERE organization_id=? AND id=?",
    )
      .bind(f.actor.organizationId, f.document.id)
      .run();
    await expect(
      f.service.validate(f.authority, f.document.id, purchase("ua1"), key()),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_READY" });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("treats genuine noncompliance as a diagnostic with human checks still open", async () => {
    const f = await fixture();
    f.fetch.mockImplementationOnce(async () =>
      Response.json(
        engineResult("ua2", {
          compliant: false,
          passedRules: 1726,
          failedRules: 1,
          failedChecks: 2,
          findings: [
            {
              specification: "ISO 32005:2023",
              clause: "Table 5. Annot-Aside",
              testNumber: 1,
              failedChecks: 2,
            },
          ],
        }),
      ),
    );
    const result = await f.service.validate(
      f.authority,
      f.document.id,
      purchase("ua2"),
      key(),
    );
    expect(result).toMatchObject({
      status: "failed",
      compliant: false,
      failedRules: 1,
      failedChecks: 2,
      manualReviewRequired: true,
      certification: false,
    });
    expect(result.findings[0].clause).toBe("Table 5. Annot-Aside");
  });
  it("fails closed on wrong hash/profile, incomplete counts and content-bearing fields", async () => {
    const f = await fixture();
    for (const extra of [
      { sha256: "b".repeat(64) },
      purchase("ua2"),
      { passedRules: 0 },
      { compliant: true, failedRules: 1 },
      { fileName: "private document text" },
    ]) {
      f.fetch.mockImplementationOnce(async () =>
        Response.json(engineResult("ua1", extra)),
      );
      const requestKey = key();
      await expect(
        f.service.validate(
          f.authority,
          f.document.id,
          purchase("ua1"),
          requestKey,
        ),
      ).rejects.toMatchObject({ code: "PDF_VALIDATION_FAILED" });
      await expect(
        f.service.validate(
          f.authority,
          f.document.id,
          purchase("ua1"),
          requestKey,
        ),
      ).rejects.toMatchObject({ code: "PDF_VALIDATION_FAILED" });
    }
    expect(f.fetch).toHaveBeenCalledTimes(5);
    expect((await f.service.list(f.actor, f.document.id)).items).toHaveLength(
      0,
    );
  });
  it("serializes duplicate requests and protects the two in-flight limit", async () => {
    const f = await fixture();
    let finish: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.fetch.mockImplementation(async (request) => {
      await held;
      return Response.json(
        engineResult(new URL(request.url).searchParams.get("profile")!),
      );
    });
    const requestKey = key();
    const first = f.service.validate(
      f.authority,
      f.document.id,
      purchase("ua1"),
      requestKey,
    );
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
    await expect(
      f.service.validate(
        f.authority,
        f.document.id,
        purchase("ua1"),
        requestKey,
      ),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_BUSY" });
    const second = f.service.validate(
      f.authority,
      f.document.id,
      purchase("ua2"),
      key(),
    );
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
    await expect(
      f.service.validate(f.authority, f.document.id, purchase("1b"), key()),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_BUSY" });
    finish();
    await Promise.all([first, second]);
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it("fences membership demotion during the private engine call", async () => {
    const f = await fixture();
    await DB.batch([
      DB.prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,? ,?,?)",
      ).bind(
        `backup_${f.actor.userId}`,
        "Backup fixture",
        `backup_${f.actor.userId}@example.invalid`,
        new Date().toISOString(),
      ),
      DB.prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      ).bind(
        f.actor.organizationId,
        `backup_${f.actor.userId}`,
        new Date().toISOString(),
      ),
    ]);
    f.fetch.mockImplementationOnce(async () => {
      await DB.prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
        .bind(f.actor.organizationId, f.actor.userId)
        .run();
      return Response.json(engineResult());
    });
    await expect(
      f.service.validate(f.authority, f.document.id, purchase("ua1"), key()),
    ).rejects.toMatchObject({ code: "POSTAL_AUTHORITY_CHANGED" });
    expect(
      (await f.service.list({ ...f.actor, role: "viewer" }, f.document.id))
        .items,
    ).toHaveLength(0);
  });
  it("retains purchased history when new checks become unavailable", async () => {
    const f = await fixture();
    await f.service.validate(f.authority, f.document.id, purchase("1b"), key());
    f.env.PDF_VALIDATION_ENABLED = "false";
    await expect(
      f.service.validate(f.authority, f.document.id, purchase("ua1"), key()),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_UNAVAILABLE" });
    expect((await f.service.list(f.actor, f.document.id)).items).toHaveLength(
      1,
    );
    const other = await fixture();
    await expect(
      other.service.list(other.actor, f.document.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects session revocation while the engine runs without publishing a report", async () => {
    const f = await fixture();
    f.fetch.mockImplementationOnce(async () => {
      await DB.prepare("DELETE FROM browser_sessions WHERE token_hash=?")
        .bind(f.tokenHash)
        .run();
      return Response.json(engineResult());
    });
    await expect(
      f.service.validate(f.authority, f.document.id, purchase("ua1"), key()),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect((await f.service.list(f.actor, f.document.id)).items).toHaveLength(
      0,
    );
  });
  it("rejects malformed completed reports at the database boundary", async () => {
    const f = await fixture();
    const id = key();
    const now = new Date().toISOString();
    await DB.prepare(
      `INSERT INTO pdf_validations(organization_id,id,document_id,document_sha256,request_user_id,profile,evidence,idempotency_key,period,status,created_at,deadline_at,purchase_terms_version,purchase_price_minor,purchase_source) VALUES(?,?,?,?,?,'ua1','simulation',?,?,'processing',?,?,'${PDF_VALIDATION_TERMS_VERSION}',${PDF_VALIDATION_PRICE_MINOR},'browser_administrator')`,
    )
      .bind(
        f.actor.organizationId,
        id,
        f.document.id,
        hash,
        f.actor.userId,
        id,
        now.slice(0, 7),
        now,
        new Date(Date.now() + 60_000).toISOString(),
      )
      .run();
    await expect(
      DB.prepare(
        "UPDATE pdf_validations SET status='complete',result_json='{}',completed_at=created_at WHERE organization_id=? AND id=?",
      )
        .bind(f.actor.organizationId, id)
        .run(),
    ).rejects.toThrow("immutable_pdf_validation");
  });
  it("refuses an unfunded check before the engine and never grants a monthly allowance", async () => {
    const f = await fixture();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    for (let i = 0; i < 5000 / PDF_VALIDATION_PRICE_MINOR; i++) {
      const id = key();
      const report = {
        ...engineResult(),
        id,
        documentId: f.document.id,
        createdAt: now,
        evidence: "simulation",
        status: "passed",
        manualReviewRequired: true,
        manualChecks: [...pdfManualChecks],
        certification: false,
      };
      statements.push(
        DB.prepare(
          `INSERT INTO pdf_validations(organization_id,id,document_id,document_sha256,request_user_id,profile,evidence,idempotency_key,period,status,created_at,deadline_at,purchase_terms_version,purchase_price_minor,purchase_source) VALUES(?,?,?,?,?,'ua1','simulation',?,?,'processing',?,?,'${PDF_VALIDATION_TERMS_VERSION}',${PDF_VALIDATION_PRICE_MINOR},'browser_administrator')`,
        ).bind(
          f.actor.organizationId,
          id,
          f.document.id,
          hash,
          f.actor.userId,
          id,
          now.slice(0, 7),
          now,
          new Date(Date.parse(now) + 60000).toISOString(),
        ),
      );
      statements.push(
        DB.prepare(
          "UPDATE pdf_validations SET status='complete',result_json=?,completed_at=? WHERE organization_id=? AND id=?",
        ).bind(JSON.stringify(report), now, f.actor.organizationId, id),
      );
    }
    await DB.batch(statements);
    expect(await getPdfValidationPricing(f.env, f.actor)).toMatchObject({
      creditAvailableMinor: 0,
    });
    await expect(
      f.service.validate(f.authority, f.document.id, purchase("ua1"), key()),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_CREDIT_INSUFFICIENT" });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("exposes the same scoped diagnostic services in MCP without billing tools", async () => {
    const f = await fixture();
    const purchasedKey = key();
    await f.service.validate(
      f.authority,
      f.document.id,
      purchase("ua1"),
      purchasedKey,
    );
    const developmentToken = `gtn_dev_${crypto.randomUUID()}`;
    await DB.prepare(
      "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES(?,?,?,?)",
    )
      .bind(
        await hashSecret(developmentToken),
        f.actor.userId,
        f.actor.organizationId,
        new Date(Date.now() + 3600_000).toISOString(),
      )
      .run();
    const identity: McpIdentity = await authenticateMcp(
      new Request(`${origin}/mcp`, {
        headers: { Authorization: `Bearer ${developmentToken}` },
      }),
      f.env,
    );
    const server = createGuteneoMcpServer(identity, f.env, {
      domain: f.domain,
      documents: {} as never,
      capabilities: () => ({}),
      pdfValidation: {
        validate: async (id, documentId, input, requestKey) =>
          f.service.validate(
            await postalMcpAuthority(id, f.env, "documents:write"),
            documentId,
            input,
            requestKey,
          ),
        list: (id, documentId) => f.service.list(id.context, documentId),
      },
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "diagnostic-test", version: "1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);
      // Business replay remains keyed, but the shared MCP wrapper also persists
      // successful connection activity; the complete tool is not idempotent.
      expect(
        tools.find((tool) => tool.name === "validate_pdf")?.annotations,
      ).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
      expect(names).toContain("validate_pdf");
      expect(names).toContain("get_pdf_validation");
      expect(names.some((name) => /billing|subscribe|plan/.test(name))).toBe(
        false,
      );
      const report = await client.callTool({
        name: "validate_pdf",
        arguments: {
          documentId: f.document.id,
          profile: "ua1",
          idempotencyKey: purchasedKey,
        },
      });
      expect(report.isError).not.toBe(true);
      expect(report.structuredContent).toMatchObject({
        ok: true,
        data: { certification: false, manualReviewRequired: true },
      });
      const newPurchase = await client.callTool({
        name: "validate_pdf",
        arguments: {
          documentId: f.document.id,
          profile: "ua1",
          idempotencyKey: key(),
        },
      });
      expect(newPurchase).toMatchObject({
        isError: true,
        structuredContent: {
          ok: false,
          error: { code: "PDF_VALIDATION_BROWSER_PURCHASE_REQUIRED" },
        },
      });
      expect(JSON.stringify(newPurchase.structuredContent)).toContain(
        `${origin}/#/app/documents?document=${encodeURIComponent(f.document.id)}`,
      );
      identity.scopes = ["documents:read"];
      const denied = await client.callTool({
        name: "validate_pdf",
        arguments: {
          documentId: f.document.id,
          profile: "ua1",
          idempotencyKey: key(),
        },
      });
      expect(denied.isError).toBe(true);
      expect(f.fetch).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("never accepts zero-check conformance or leaked rule descriptions", () => {
    expect(
      privatePdfValidationResult.safeParse(
        engineResult("ua1", { passedRules: 0 }),
      ).success,
    ).toBe(false);
    expect(
      privatePdfValidationResult.safeParse(
        engineResult("ua1", {
          compliant: false,
          failedRules: 1,
          failedChecks: 1,
          findings: [
            {
              specification: "ISO 14289-1:2014",
              clause: "7.1",
              testNumber: 1,
              failedChecks: 1,
              description: "user contents",
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});
