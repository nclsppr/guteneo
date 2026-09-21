import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";
import { validateLiveFaxQuote } from "../../packages/domain/src/live-fax-quotes";
import { type FaxUsageTariff } from "../../packages/domain/src/live-fax-usage";
import {
  createLiveProviderHook,
  type LiveProviderEnv,
} from "../../apps/api/src/live-providers";
import {
  reviewExpertDispatch,
  acceptExpertDispatch,
} from "../../apps/api/src/expert-approval";
import {
  type AuthEnv,
  type McpIdentity,
  MCP_SCOPES,
} from "../../apps/api/src/auth";
import { customerFaxPricing } from "../../packages/contracts/src/fax-pricing";

let mf: Miniflare, db: D1Database, clock: number;
let f: Awaited<ReturnType<typeof createFaxUsageFixture>>;
let tariff: FaxUsageTariff, authority: Record<string, string>;
const stamp = () => new Date(clock).toISOString();
const phone = "+35220000000"; // Isolated synthetic fixture; no provider call.
const code = { code: "FAX_REVIEW_PREPARATION_ONLY" };
async function applyMigration(file: string) {
  const source = readFileSync(
    new URL(`../../migrations/${file}`, import.meta.url),
    "utf8",
  );
  await db.batch(unstable_splitSqlQuery(source).map((sql) => db.prepare(sql)));
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const migrations = readdirSync(new URL("../../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  for (const file of migrations.filter((n) => n < "0035"))
    await applyMigration(file);
  // Populate real historical domain records before migration; hashes must not change.
  const old = await createFaxUsageFixture(db, () =>
    Date.parse("2026-09-21T00:00:00.000Z"),
  );
  // Preparation commits the old-schema quote before the new projection reads its added column.
  await expect(
    old.domain.prepareDispatch(old.ctx, old.input, "old-quote"),
  ).rejects.toThrow(/execution_scope/);
  const draft = await db
    .prepare(
      "SELECT id FROM dispatches WHERE organization_id=? AND prepare_key='old-quote'",
    )
    .bind(old.ctx.organizationId)
    .first<{ id: string }>();
  expect(draft).not.toBeNull();
  const snapshot = await db
    .prepare(
      "SELECT * FROM live_fax_quotes_v3 WHERE organization_id=? AND dispatch_id=?",
    )
    .bind(old.ctx.organizationId, draft!.id)
    .first();
  await applyMigration("0035_review_fax_preparation.sql");
  expect(
    await db
      .prepare(
        "SELECT * FROM live_fax_quotes_v3 WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(old.ctx.organizationId, draft!.id)
      .first(),
  ).toEqual(snapshot);
  expect(
    await db
      .prepare(
        "SELECT execution_scope,review_authority_id,evidence_observed_at FROM trusted_fax_usage_tariffs WHERE organization_id=?",
      )
      .bind(old.ctx.organizationId)
      .first(),
  ).toEqual({
    execution_scope: "live",
    review_authority_id: null,
    evidence_observed_at: null,
  });
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  clock = Date.parse("2026-10-01T10:00:00.000Z");
  f = await createFaxUsageFixture(db, () => clock);
  await db
    .prepare(
      "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='fax'",
    )
    .bind(f.ctx.organizationId)
    .run();
  authority = {
    id: crypto.randomUUID(),
    organization_id: f.ctx.organizationId,
    sender_id: f.tariff.sender_id,
    account_id: f.tariff.account_id,
    connection_id: f.tariff.connection_id,
    outbound_profile_id: f.tariff.outbound_profile_id,
    recipient_phone: phone,
    valid_from: "2026-09-21T00:00:00.000Z",
    expires_at: "2026-10-21T00:00:00.000Z",
    status: "active",
    authorization_reference: "ISOLATED REVIEW AUTHORITY - NO REAL PERMISSION",
    source_sha256: "c".repeat(64),
    created_at: "2026-09-21T00:00:00.000Z",
  };
  await insertRecord(db, "fax_review_preparation_authorities", authority);
  tariff = {
    ...f.tariff,
    id: crypto.randomUUID(),
    destination_prefix: "+35220",
    destination_country_code: "LU",
    origin_class: "local",
    destination_category: "ngn",
    route_qualification: "operator_test",
    operator_authorization_reference: "ISOLATED REVIEW ONLY",
    operator_test_ceiling_minor: 200,
    execution_scope: "review_prepare_only",
    review_authority_id: authority.id,
    evidence_observed_at: stamp(),
    max_pages: 7,
    quote_ttl_seconds: 900,
    expires_at: new Date(clock + 168 * 3600_000).toISOString(),
  };
  await insertRecord(db, "trusted_fax_usage_tariffs", tariff);
  f.input.recipient.phone = phone;
});
const prepare = () =>
  f.domain.prepareDispatch(
    f.ctx,
    { ...f.input, ceilingMinor: 200 },
    crypto.randomUUID(),
  );
async function noExecution() {
  for (const table of [
    "approvals",
    "outbox",
    "attempts",
    "reservations",
    "welcome_credit_reservations",
    "expert_dispatch_reviews",
    "expert_approval_acceptances",
    "fax_usage_settlements",
    "document_access_grants",
  ]) {
    expect(
      await db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE organization_id=?`)
        .bind(f.ctx.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  }
}
describe("non-sending reviewer fax quotations", () => {
  it("prepares a genuine calculated reference after the old pilot deadline, without credit or outbox", async () => {
    const d = await prepare();
    expect(d.status).toBe("prepared");
    expect(d.quote_expires_at).toBe("2026-10-01T10:15:00.000Z");
    expect(d.faxPricing).toMatchObject({
      executionScope: "review_prepare_only",
      routeQualification: "operator_authorized_test",
      settlement: { status: "not_reserved" },
    });
    expect(d.faxPricing!.estimatedHighNanoeur).toBeGreaterThan(0);
    expect(customerFaxPricing(d.faxPricing!).display.explanation).toContain(
      "ne peut être ni approuvé ni envoyé",
    );
    expect(
      customerFaxPricing(d.faxPricing!).display.ceiling.creditLabel,
    ).toContain("Aucune réservation");
    await noExecution();
  });
  it("keeps preparation-only scope and guidance through the actual MCP transport", async () => {
    const identity: McpIdentity = {
      context: { ...f.ctx, actor: "mcp" },
      scopes: [...MCP_SCOPES],
      clientId: "review-fixture",
      token: "fixture-only",
      expiresAt: 0,
    };
    const server = createGuteneoMcpServer(
      identity,
      { APP_ORIGIN: "https://guteneo.invalid" } as AuthEnv,
      {
        domain: f.domain,
        documents: {
          importFile: async () => {
            throw Error("unused");
          },
          render: async () => {
            throw Error("unused");
          },
        },
        capabilities: () => ({ mode: "production", liveSendsEnabled: false }),
      },
    );
    const client = new Client({ name: "review-scope-test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "prepare_fax",
        arguments: {
          documentId: f.documentId,
          phone,
          ceilingMinor: 200,
          idempotencyKey: "review-mcp",
        },
      });
      expect(result.isError).not.toBe(true);
      const body = result.structuredContent as {
        data: { faxPricing: { executionScope: string }; nextActions: string[] };
      };
      expect(body.data.faxPricing.executionScope).toBe("review_prepare_only");
      expect(body.data.nextActions.join(" ")).toContain("Aucun envoi");
      expect(body.data.nextActions.join(" ")).not.toContain(
        "approve_and_send_dispatch",
      );
      await noExecution();
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("rejects an eight-page document on the same authorized recipient", async () => {
    const id = crypto.randomUUID();
    await f.domain.registerDocument(f.ctx, {
      id,
      name: "synthetic-eight.pdf",
      sha256: "d".repeat(64),
      size: 100,
      pages: 8,
      status: "ready",
      source: "import",
      storageKey: "isolated-eight",
      scanVerified: true,
    });
    await expect(
      f.domain.prepareDispatch(
        f.ctx,
        { ...f.input, documentId: id, ceilingMinor: 200 },
        "eight-pages",
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
  });
  it("rejects another exact number, even under the same priced prefix", async () => {
    await expect(
      f.domain.prepareDispatch(
        f.ctx,
        { ...f.input, recipient: { phone: "+35220000001" } },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
    await noExecution();
  });
  it("keeps the customer ceiling at 200 centimes", async () => {
    await expect(
      f.domain.prepareDispatch(
        f.ctx,
        { ...f.input, ceilingMinor: 201 },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "FAX_TEST_CEILING_EXCEEDED" });
  });
  it("rejects browser, direct confirmation, expert review/acceptance and provider paths", async () => {
    const d = await prepare();
    await expect(
      f.domain.approveDispatch(f.ctx, d.id, d.fingerprint),
    ).rejects.toMatchObject(code);
    await expect(
      f.domain.confirmDispatch(f.ctx, d.id, "forbidden-confirm"),
    ).rejects.toMatchObject(code);
    await expect(
      validateLiveFaxQuote(db, d, f.identity, stamp()),
    ).rejects.toMatchObject(code);
    const identity = {
      context: { ...f.ctx, actor: "mcp" },
      scopes: [...MCP_SCOPES],
      token: "fixture-only",
      expiresAt: 0,
      clientId: "fixture-client",
    } as McpIdentity;
    await expect(
      reviewExpertDispatch(identity, { DB: db } as AuthEnv, f.domain, d.id),
    ).rejects.toMatchObject(code);
    await expect(
      acceptExpertDispatch(identity, { DB: db } as AuthEnv, f.domain, {
        dispatchId: d.id,
        reviewToken: "x",
        idempotencyKey: "review-accept-forbidden",
        fingerprint: d.fingerprint,
        ceilingMinor: 200,
      }),
    ).rejects.toMatchObject(code);
    const submit = vi.fn();
    await expect(
      f.domain.processDispatch(d.id, {
        name: "telnyx",
        liveFaxIdentity: f.identity,
        submit,
      }),
    ).rejects.toMatchObject(code);
    expect(submit).not.toHaveBeenCalled();
    const network = vi.fn();
    const provider = createLiveProviderHook(
      { DB: db, MODE: "production" } as LiveProviderEnv,
      "fax",
      { fetcher: network },
    );
    expect(await provider.submit(d)).toMatchObject({
      status: "rejected",
      errorCode: "FAX_REVIEW_PREPARATION_ONLY",
    });
    expect(network).not.toHaveBeenCalled();
    await noExecution();
  });
  it("SQL rejects approval and status transitions independently of runtime and channel", async () => {
    const d = await prepare();
    for (const status of ["queued", "submitting"]) {
      await expect(
        db
          .prepare(
            "UPDATE dispatches SET status=? WHERE organization_id=? AND id=?",
          )
          .bind(status, f.ctx.organizationId, d.id)
          .run(),
      ).rejects.toThrow(
        /fax_review_preparation_only|approval_required|live_quote_invalid/,
      );
    }
    await expect(
      db
        .prepare(
          "INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          f.ctx.organizationId,
          d.id,
          f.ctx.userId,
          d.fingerprint,
          "2026-10-01T10:10:00.000Z",
          stamp(),
        )
        .run(),
    ).rejects.toThrow(/fax_review_preparation_only/);
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=1 WHERE organization_id=? AND channel='fax'",
      )
      .bind(f.ctx.organizationId)
      .run();
    await expect(
      f.domain.approveDispatch(f.ctx, d.id, d.fingerprint),
    ).rejects.toMatchObject(code);
    await expect(prepare()).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
    await noExecution();
  });
  it("SQL prevents direct attempts and outbox insertion", async () => {
    const d = await prepare();
    await expect(
      db
        .prepare(
          "INSERT INTO attempts(id,dispatch_id,organization_id,provider,status,created_at,updated_at) VALUES(?,?,?,'telnyx','started',?,?)",
        )
        .bind(crypto.randomUUID(), d.id, f.ctx.organizationId, stamp(), stamp())
        .run(),
    ).rejects.toThrow(/fax_review_preparation_only/);
    await expect(
      db
        .prepare(
          "INSERT INTO outbox(id,dispatch_id,organization_id,status,created_at) VALUES(?,?,?,'pending',?)",
        )
        .bind(crypto.randomUUID(), d.id, f.ctx.organizationId, stamp())
        .run(),
    ).rejects.toThrow(/fax_review_preparation_only/);
    await noExecution();
  });
  it("only renews an expired review quote, keeping exact content and scope", async () => {
    const d = await prepare();
    await expect(f.domain.renewFaxQuote(f.ctx, d.id)).rejects.toMatchObject({
      code: "QUOTE_STILL_VALID",
    });
    clock += 901_000;
    const renewed = await f.domain.renewFaxQuote(f.ctx, d.id);
    expect(renewed.id).not.toBe(d.id);
    expect(renewed.faxPricing?.executionScope).toBe("review_prepare_only");
    expect(renewed.document_id).toBe(d.document_id);
    expect(renewed.recipient_json).toBe(d.recipient_json);
    await noExecution();
  });
  it("never promotes a review renewal to a newly installed live tariff", async () => {
    // Both scopes can be qualified before the historic pilot deadline.
    clock = Date.parse("2026-09-21T10:00:00.000Z");
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(f.ctx.organizationId, tariff.id)
      .run();
    const earlier = {
      ...tariff,
      id: crypto.randomUUID(),
      valid_from: stamp(),
      created_at: stamp(),
      evidence_observed_at: stamp(),
      fx_date: stamp().slice(0, 10),
      expires_at: "2026-09-24T09:00:01.620Z",
    };
    await insertRecord(db, "trusted_fax_usage_tariffs", earlier);
    const d = await prepare();
    clock += 901_000;
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(f.ctx.organizationId, earlier.id)
      .run();
    await insertRecord(db, "trusted_fax_usage_tariffs", {
      ...earlier,
      id: crypto.randomUUID(),
      execution_scope: "live",
      review_authority_id: null,
      evidence_observed_at: null,
    });
    await expect(f.domain.renewFaxQuote(f.ctx, d.id)).rejects.toMatchObject(
      code,
    );
    expect((await f.domain.getDispatch(f.ctx, d.id)).dispatch.status).toBe(
      "prepared",
    );
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM dispatches WHERE organization_id=?")
        .bind(f.ctx.organizationId)
        .first(),
    ).toEqual({ n: 1 });
    await noExecution();
  });
  it("clips quote expiry at the tariff and authority boundary", async () => {
    clock = Date.parse(tariff.expires_at) - 30_000;
    const d = await prepare();
    expect(d.quote_expires_at).toBe(tariff.expires_at);
    clock += 30_001;
    await expect(prepare()).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
  });
  it("revocation and expiry never authorize a send or allow fallback", async () => {
    const d = await prepare();
    await db
      .prepare(
        "UPDATE fax_review_preparation_authorities SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(f.ctx.organizationId, authority.id)
      .run();
    await expect(prepare()).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
    await expect(
      f.domain.confirmDispatch(f.ctx, d.id, "expired-review"),
    ).rejects.toMatchObject(code);
    await noExecution();
  });
  it.each([
    ["execution_scope", "live"],
    ["review_authority_id", "different"],
    ["evidence_observed_at", "2026-10-02T00:00:00.000Z"],
  ])("cannot change immutable tariff %s", async (k, v) => {
    await expect(
      db
        .prepare(
          `UPDATE trusted_fax_usage_tariffs SET ${k}=? WHERE organization_id=? AND id=?`,
        )
        .bind(v, f.ctx.organizationId, tariff.id)
        .run(),
    ).rejects.toThrow(/immutable_fax_usage_tariff/);
  });
  it.each(["recipient_phone", "expires_at", "sender_id", "account_id"])(
    "cannot widen authority %s",
    async (k) => {
      await expect(
        db
          .prepare(
            `UPDATE fax_review_preparation_authorities SET ${k}=? WHERE organization_id=? AND id=?`,
          )
          .bind("changed", f.ctx.organizationId, authority.id)
          .run(),
      ).rejects.toThrow(/immutable_fax_review_authority/);
    },
  );
  it.each([
    { max_pages: 8 },
    { operator_test_ceiling_minor: 201 },
    { quote_ttl_seconds: 901 },
    { evidence_observed_at: "2026-09-23T00:00:00.000Z" },
    { fx_date: "2026-09-01" },
    { account_id: "different-account" },
    { review_authority_id: "different-authority" },
    { expires_at: "2026-10-22T00:00:00.000Z" },
  ])("rejects out-of-bounds review revision %j", async (overrides) => {
    await expect(
      insertRecord(db, "trusted_fax_usage_tariffs", {
        ...tariff,
        id: crypto.randomUUID(),
        status: "revoked",
        ...overrides,
      }),
    ).rejects.toThrow();
  });
  it("keeps the historical live operator pilot bounded to September24", async () => {
    await expect(
      insertRecord(db, "trusted_fax_usage_tariffs", {
        ...tariff,
        id: crypto.randomUUID(),
        status: "revoked",
        execution_scope: "live",
        review_authority_id: null,
        evidence_observed_at: null,
      }),
    ).rejects.toThrow();
    const old = {
      ...tariff,
      id: crypto.randomUUID(),
      execution_scope: "live" as const,
      review_authority_id: null,
      evidence_observed_at: null,
      valid_from: "2026-09-23T00:00:00.000Z",
      created_at: "2026-09-23T00:00:00.000Z",
      fx_date: "2026-09-23",
      expires_at: "2026-09-24T09:00:01.620Z",
    };
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(f.ctx.organizationId, tariff.id)
      .run();
    await insertRecord(db, "trusted_fax_usage_tariffs", old);
    await expect(prepare()).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
  });
});
