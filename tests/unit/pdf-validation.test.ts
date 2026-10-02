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
  HORIZON_TERMS_VERSION,
  handleMonthlyPlanRoute,
  getHorizonStatus,
  renewHorizonPlans,
} from "../../apps/api/src/monthly-plan";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import {
  postalBrowserAuthority,
  postalMcpAuthority,
} from "../../apps/api/src/postal-authority";
import type { Env } from "../../apps/api/src/env";
import {
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
async function fixture(paid = true) {
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
      "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,'simulation',?)",
    ).bind(actor.organizationId, "Synthetic fixture", now),
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
    MODE: "simulation",
    APP_ORIGIN: origin,
    HORIZON_ENABLED: "true",
    PDF_VALIDATOR: { fetch } as unknown as Fetcher,
  } as Env;
  if (paid)
    await handleMonthlyPlanRoute(
      new Request(`${origin}/api/plan/subscribe`, {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: `guteneo_session=${secret}`,
          "X-CSRF-Token": "fixture-csrf",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          consent: true,
          termsVersion: HORIZON_TERMS_VERSION,
        }),
      }),
      env,
    );
  const domain = new DomainService(DB, { mode: "simulation" });
  const storageKey = `${actor.organizationId}/original.pdf`;
  await DOCUMENTS.put(storageKey, bytes);
  const document = await domain.registerDocument(actor, {
    name: "Synthetic.pdf",
    sha256: hash,
    size: bytes.length,
    pages: 1,
    status: "ready",
    source: "import",
    storageKey,
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
const key = () => crypto.randomUUID();

describe("immutable PDF diagnostics and paid entitlement", () => {
  it("checks exact bytes once, keeps security/original unchanged and exposes bounded history", async () => {
    const f = await fixture();
    const idempotency = key();
    const result = await f.service.validate(
      f.authority,
      f.document.id,
      { profile: "ua1" },
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
        { profile: "ua1" },
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
    expect(await getHorizonStatus(f.env, f.actor)).toMatchObject({
      creditAvailableMinor: 2000,
    });
    expect(await f.service.list(f.actor, f.document.id)).toEqual({
      items: [result],
    });
    await expect(
      f.service.validate(
        f.authority,
        f.document.id,
        { profile: "ua2" },
        idempotency,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rejects absent subscription, quarantine and missing engine before reading PDF bytes", async () => {
    const unpaid = await fixture(false);
    await expect(
      unpaid.service.validate(
        unpaid.authority,
        unpaid.document.id,
        { profile: "ua1" },
        key(),
      ),
    ).rejects.toMatchObject({ code: "HORIZON_PLAN_REQUIRED" });
    expect(unpaid.fetch).not.toHaveBeenCalled();
    const f = await fixture();
    const gated = new PdfValidationService(
      { ...f.env, PDF_VALIDATOR: undefined },
      f.domain,
    );
    await expect(
      gated.validate(f.authority, f.document.id, { profile: "ua1" }, key()),
    ).rejects.toMatchObject({ code: "HORIZON_PLAN_REQUIRED" });
    await DB.prepare(
      "UPDATE documents SET status='quarantined' WHERE organization_id=? AND id=?",
    )
      .bind(f.actor.organizationId, f.document.id)
      .run();
    await expect(
      f.service.validate(f.authority, f.document.id, { profile: "ua1" }, key()),
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
      { profile: "ua2" },
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
      { profile: "ua2" },
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
          { profile: "ua1" },
          requestKey,
        ),
      ).rejects.toMatchObject({ code: "PDF_VALIDATION_FAILED" });
      await expect(
        f.service.validate(
          f.authority,
          f.document.id,
          { profile: "ua1" },
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
      { profile: "ua1" },
      requestKey,
    );
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(1));
    await expect(
      f.service.validate(
        f.authority,
        f.document.id,
        { profile: "ua1" },
        requestKey,
      ),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_BUSY" });
    const second = f.service.validate(
      f.authority,
      f.document.id,
      { profile: "ua2" },
      key(),
    );
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledTimes(2));
    await expect(
      f.service.validate(f.authority, f.document.id, { profile: "1b" }, key()),
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
      f.service.validate(f.authority, f.document.id, { profile: "ua1" }, key()),
    ).rejects.toMatchObject({ code: "POSTAL_AUTHORITY_CHANGED" });
    expect(
      (await f.service.list({ ...f.actor, role: "viewer" }, f.document.id))
        .items,
    ).toHaveLength(0);
  });
  it("retains tenant-scoped purchased history after access expires", async () => {
    const f = await fixture();
    await f.service.validate(
      f.authority,
      f.document.id,
      { profile: "1b" },
      key(),
    );
    const plan = await getHorizonStatus(f.env, f.actor);
    await renewHorizonPlans(f.env, new Date(plan.currentPeriodEnd!));
    await expect(
      f.service.validate(f.authority, f.document.id, { profile: "ua1" }, key()),
    ).rejects.toMatchObject({ code: "HORIZON_PLAN_REQUIRED" });
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
      f.service.validate(f.authority, f.document.id, { profile: "ua1" }, key()),
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
      "INSERT INTO pdf_validations(organization_id,id,document_id,document_sha256,request_user_id,profile,evidence,idempotency_key,period,status,created_at,deadline_at) VALUES(?,?,?,?,?,'ua1','simulation',?,?,'processing',?,?)",
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
        "UPDATE pdf_validations SET status='complete',result_json='{}' WHERE organization_id=? AND id=?",
      )
        .bind(f.actor.organizationId, id)
        .run(),
    ).rejects.toThrow("immutable_pdf_validation");
  });
  it("enforces shared calendar-month quota atomically before the engine call", async () => {
    const f = await fixture();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    for (let i = 0; i < 100; i++) {
      const id = key();
      statements.push(
        DB.prepare(
          "INSERT INTO pdf_validations(organization_id,id,document_id,document_sha256,request_user_id,profile,evidence,idempotency_key,period,status,created_at,deadline_at) VALUES(?,?,?,?,?,'ua1','simulation',?,?,'processing',?,?)",
        ).bind(
          f.actor.organizationId,
          id,
          f.document.id,
          hash,
          f.actor.userId,
          id,
          now.slice(0, 7),
          now,
          new Date(Date.now() + 60_000).toISOString(),
        ),
      );
      statements.push(
        DB.prepare(
          "UPDATE pdf_validations SET status='error' WHERE organization_id=? AND id=?",
        ).bind(f.actor.organizationId, id),
      );
    }
    await DB.batch(statements);
    await expect(
      f.service.validate(f.authority, f.document.id, { profile: "ua1" }, key()),
    ).rejects.toMatchObject({ code: "PDF_VALIDATION_QUOTA_EXCEEDED" });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("exposes the same scoped diagnostic services in MCP without billing tools", async () => {
    const f = await fixture();
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
      const names = (await client.listTools()).tools.map((tool) => tool.name);
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
          idempotencyKey: key(),
        },
      });
      expect(report.isError).not.toBe(true);
      expect(report.structuredContent).toMatchObject({
        ok: true,
        data: { certification: false, manualReviewRequired: true },
      });
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
