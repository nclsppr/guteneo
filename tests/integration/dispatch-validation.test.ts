import { readFileSync, readdirSync } from "node:fs";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  DomainService,
  canonicalJson,
  sha256,
  type ActorContext,
  type Dispatch,
} from "../../packages/domain/src/index";
import {
  emailRateComponents,
  postalRateEvidence,
  type PublicEmailRateEvidence,
} from "../../packages/domain/src/live-delivery-quotes";
import type { DispatchValidationResult } from "../../packages/contracts/src/dispatch-validation";
import { prepareProtectedDocument } from "../../apps/api/src/protected-documents";
import worker from "../../apps/api/src/index";
import type { Env } from "../../apps/api/src/env";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";

let mf: Miniflare, db: D1Database, bucket: R2Bucket, clock: number;
let f: Awaited<ReturnType<typeof createFaxUsageFixture>>;
let tableNames: string[];
const stamp = () => new Date(clock).toISOString();

async function migrate(source: string) {
  let statement = "",
    trigger = false;
  const statements: D1PreparedStatement[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line}\n`;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      statements.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw Error("Incomplete migration fixture");
  if (statements.length) await db.batch(statements);
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await migrate(readFileSync(new URL(name, dir), "utf8"));
  tableNames = (
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name",
      )
      .all<{ name: string }>()
  ).results.map((row) => row.name);
});
beforeEach(async () => {
  clock = Date.now();
  // Current schema exercises document ownership; no historical ACL adapter.
  f = await createFaxUsageFixture(db, () => clock);
});
afterAll(async () => mf?.dispose());

async function snapshot() {
  // Include every application row, including other tenants and append-only audit/credit data.
  // Cloudflare-owned _cf_* metadata is inaccessible to application D1 queries.
  // Comparing full records catches updates that a count-only assertion misses.
  const tables = await db.batch(
    tableNames.map((name) =>
      db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`),
    ),
  );
  return Object.fromEntries(
    tables.map((table, index) => [
      tableNames[index],
      table.results.map((row) => canonicalJson(row)).sort(),
    ]),
  );
}

async function readOnly<T>(
  action: (domain: DomainService) => Promise<T>,
  source = f.domain,
): Promise<T> {
  const before = await snapshot();
  const forbidden = vi.fn(() => {
    throw Error("Validation attempted a mutation or external call");
  });
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
    ({
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      first: statement.first.bind(statement),
      all: statement.all.bind(statement),
      raw: statement.raw.bind(statement),
      run: forbidden,
    }) as D1PreparedStatement;
  const guardedDb = {
    prepare: (sql: string) => {
      if (!/^\s*SELECT\b/i.test(sql)) return forbidden();
      return wrap(db.prepare(sql));
    },
    batch: forbidden,
    exec: forbidden,
    dump: forbidden,
  } as unknown as D1Database;
  const domain = new DomainService(guardedDb, {
    ...source.config,
    ensureEmailSender: forbidden,
    prepareProtectedDocument: forbidden,
    postalQuote: forbidden,
  });
  const outbound = vi.spyOn(globalThis, "fetch").mockImplementation(forbidden);
  try {
    return await action(domain);
  } finally {
    outbound.mockRestore();
    expect(forbidden).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  }
}

const prepare = () =>
  f.domain.prepareDispatch(f.ctx, f.input, crypto.randomUUID());
function check(result: DispatchValidationResult, id: string) {
  const item = result.checks.find((item) => item.id === id);
  expect(item, `Missing ${id} check`).toBeDefined();
  return item!;
}
function noAcceptance(result: DispatchValidationResult) {
  expect(check(result, "acceptance")).toMatchObject({
    status: "not_checked",
    code: "NOT_EXECUTED",
  });
  expect(check(result, "provider_delivery")).toMatchObject({
    status: "not_checked",
    code: "NOT_EXECUTED",
  });
  expect(result.execution).toBe("validation_only");
}
async function principal(
  role: ActorContext["role"],
  canApprove = false,
): Promise<ActorContext> {
  const userId = crypto.randomUUID();
  await insertRecord(db, "users", {
    id: userId,
    name: "Synthetic reader",
    email: "reader@example.invalid",
    created_at: stamp(),
  });
  await insertRecord(db, "memberships", {
    organization_id: f.ctx.organizationId,
    user_id: userId,
    role,
    supervisor_can_approve: canApprove ? 1 : 0,
    supervisor_can_report: 0,
    created_at: stamp(),
  });
  return {
    ...f.ctx,
    userId,
    role,
    supervisorCanApprove: canApprove,
    supervisorCanReport: false,
  };
}

async function emailFixture(protectedLink = false) {
  const senderId = `email_${f.ctx.organizationId}`;
  const policyId = `email_policy_${f.ctx.organizationId}`;
  const identity = {
    provider: "resend" as const,
    accountId: "synthetic-account",
    routeId: "resend:synthetic:example.invalid",
  };
  const rate: PublicEmailRateEvidence = {
    usdMicrosPerMessage: 900,
    eurPerUsdNumerator: 10000,
    eurPerUsdDenominator: 11537,
    attachmentBasis: "included_pdf",
    pricingBasis: "public_list_price_ex_tax",
    plan: "Pro",
    tier: "additional_emails",
    unit: "recipient",
    currency: "USD",
    tariffSource: "https://resend.com/pricing",
    tariffDate: stamp().slice(0, 10),
    fxBasis: "commercial_fixed_reference",
    fxSource: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    fxDate: stamp().slice(0, 10),
  };
  await insertRecord(db, "senders", {
    id: senderId,
    organization_id: f.ctx.organizationId,
    channel: "email",
    name: "Synthetic sender",
    address: "sender@example.invalid",
    status: "verified",
    mode: "production",
    created_at: stamp(),
  });
  await insertRecord(db, "channel_controls", {
    organization_id: f.ctx.organizationId,
    channel: "email",
    enabled: 1,
  });
  await insertRecord(db, "usage", {
    organization_id: f.ctx.organizationId,
    channel: "email",
    period: stamp().slice(0, 7),
    limit_count: 100,
    limit_minor: 5000,
    currency: "EUR",
  });
  await insertRecord(db, "trusted_delivery_costs", {
    id: policyId,
    organization_id: f.ctx.organizationId,
    sender_id: senderId,
    channel: "email",
    provider: "resend",
    account_id: identity.accountId,
    route_id: identity.routeId,
    options_json: "{}",
    rate_json: canonicalJson(rate),
    ...emailRateComponents(rate),
    currency: "EUR",
    fiscal_basis: "qualified_final_variable_cost",
    pricing_basis: "public_list_price_ex_tax",
    quote_ttl_seconds: 300,
    source_reference: "ISOLATED SYNTHETIC RATE - NEVER PRODUCTION",
    source_sha256: await sha256(canonicalJson(rate)),
    valid_from: stamp(),
    expires_at: new Date(clock + 3600000).toISOString(),
    status: "qualified",
    created_at: stamp(),
  });
  const domain = new DomainService(db, {
    mode: "production",
    now: () => clock,
    liveDeliveryIdentity: { email: identity },
    prepareProtectedDocument: (ctx, input, now) =>
      prepareProtectedDocument(
        {
          DB: db,
          DOCUMENTS: bucket,
          APP_ORIGIN: "https://fixture.example.invalid",
          ENVIRONMENT: "production",
          MODE: "production",
          PROTECTED_DOCUMENTS_KEY: "x".repeat(43),
        },
        ctx,
        input,
        now,
      ),
  });
  const row = await domain.prepareDispatch(
    f.ctx,
    {
      channel: "email",
      recipient: { email: "recipient@example.invalid" },
      subject: "Synthetic private subject",
      html: "<p>Synthetic private body.</p>",
      ceilingMinor: 200,
      ...(protectedLink
        ? {
            documentId: f.documentId,
            options: { emailDeliveryMode: "protected_link", protectedDays: 1 },
          }
        : {}),
    },
    crypto.randomUUID(),
  );
  return { domain, row, policyId };
}

async function postalFixture() {
  const senderId = `postal_${f.ctx.organizationId}`;
  const identity = { accountId: "pingen-fixture", routeId: "pingen-fixture" };
  const print = {
    addressPosition: "left",
    deliveryProduct: "cheap",
    printMode: "duplex",
    printSpectrum: "grayscale",
  };
  const rate = postalRateEvidence(stamp().slice(0, 10));
  await insertRecord(db, "senders", {
    id: senderId,
    organization_id: f.ctx.organizationId,
    channel: "postal",
    name: "Synthetic sender",
    address: "Fixture sender",
    status: "verified",
    mode: "production",
    created_at: stamp(),
  });
  await insertRecord(db, "channel_controls", {
    organization_id: f.ctx.organizationId,
    channel: "postal",
    enabled: 1,
  });
  await insertRecord(db, "usage", {
    organization_id: f.ctx.organizationId,
    channel: "postal",
    period: stamp().slice(0, 7),
    limit_count: 100,
    limit_minor: 5000,
    currency: "EUR",
  });
  await insertRecord(db, "trusted_delivery_costs", {
    id: `postal_policy_${f.ctx.organizationId}`,
    organization_id: f.ctx.organizationId,
    sender_id: senderId,
    channel: "postal",
    provider: "pingen",
    account_id: identity.accountId,
    route_id: identity.routeId,
    options_json: canonicalJson(print),
    rate_json: canonicalJson(rate),
    base_numerator: 0,
    byte_numerator: 0,
    rate_denominator: 1,
    currency: "EUR",
    fiscal_basis: "qualified_final_variable_cost",
    pricing_basis: "public_list_price_ex_tax",
    quote_ttl_seconds: 300,
    source_reference: "ISOLATED SYNTHETIC PINGEN CALCULATOR CONTRACT",
    source_sha256: await sha256(canonicalJson(rate)),
    valid_from: stamp(),
    expires_at: new Date(clock + 3600000).toISOString(),
    status: "qualified",
    created_at: stamp(),
  });
  const recipient = {
    name: "Fixture Person",
    line1: "1 Test Street",
    postalCode: "1000",
    city: "Luxembourg",
    country: "LU",
  };
  const expectedAddress = "Fixture Person\n1 Test Street\n1000 Luxembourg";
  const draft = crypto.randomUUID(),
    letter = crypto.randomUUID(),
    preflightId = crypto.randomUUID();
  await insertRecord(db, "provider_drafts", {
    id: draft,
    organization_id: f.ctx.organizationId,
    document_id: f.documentId,
    document_sha256: "a".repeat(64),
    sender_id: senderId,
    sender_address: "Fixture sender",
    provider: "pingen",
    provider_id: letter,
    recipient_json: canonicalJson(recipient),
    expected_address: expectedAddress,
    options_json: canonicalJson(print),
    ceiling_minor: 400,
    currency: "EUR",
    status: "prepared",
    request_hash: "d".repeat(64),
    idempotency_key: draft,
    created_at: stamp(),
    updated_at: stamp(),
  });
  // Same synthetic rendered-review/transfer fixture as live-delivery-quotes.test.ts.
  // Keep every migration and transfer-consent guard active; no Pingen request is made.
  const fingerprint = await sha256(
    canonicalJson({ recipient, print, documentSha256: "a".repeat(64), draft }),
  );
  await db
    .prepare(
      "INSERT INTO content_limits VALUES(?,10,80000000,10) ON CONFLICT(organization_id) DO NOTHING",
    )
    .bind(f.ctx.organizationId)
    .run();
  await insertRecord(db, "postal_preflights", {
    id: preflightId,
    organization_id: f.ctx.organizationId,
    user_id: f.ctx.userId,
    document_id: f.documentId,
    document_sha256: "a".repeat(64),
    sender_id: senderId,
    sender_address: "Fixture sender",
    recipient_json: canonicalJson(recipient),
    options_json: canonicalJson(print),
    profile_json: canonicalJson({
      accountId: identity.accountId,
      environment: "sandbox",
      defaultCountry: "LU",
      addressPosition: "left",
      version: PINGEN_PREFLIGHT_VERSION,
    }),
    expected_address: expectedAddress,
    ceiling_minor: 400,
    request_hash: fingerprint,
    input_hash: fingerprint,
    idempotency_key: preflightId,
    status: "processing",
    budget_day: stamp().slice(0, 10),
    processing_until: new Date(clock + 60000).toISOString(),
    expires_at: new Date(clock + 3600000).toISOString(),
    created_at: stamp(),
    updated_at: stamp(),
  });
  const report = {
    version: PINGEN_PREFLIGHT_VERSION,
    status: "review_required",
    sha256: "a".repeat(64),
    pages: 2,
    canSend: false,
    issues: [],
    requiredReviews: ["printed_recipient_matches"],
    rendering: {
      complete: true,
      dpi: 144,
      pages: [1, 2].map((page) => ({
        page,
        width: 1191,
        height: 1684,
        rasterSha256: "b".repeat(64),
      })),
    },
    address: {
      lines: expectedAddress.split("\n"),
      issues: [],
      textVisibility: "not_verified",
      crop: {
        pngBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        width: 1,
        height: 1,
        boundsMm: { x: 20, y: 40, width: 89.5, height: 47.5 },
      },
    },
  };
  await db.batch([
    db
      .prepare(
        "UPDATE postal_preflights SET status='review_required',report_json=? WHERE id=?",
      )
      .bind(canonicalJson(report), preflightId),
    db
      .prepare(
        "INSERT INTO postal_transfer_consents(preflight_id,organization_id,user_id,fingerprint,reviewed,transfer_only,created_at) VALUES(?,?,?,?,1,1,?)",
      )
      .bind(
        preflightId,
        f.ctx.organizationId,
        f.ctx.userId,
        fingerprint,
        stamp(),
      ),
    db
      .prepare(
        "UPDATE postal_preflights SET transfer_status='preparing',transfer_started_at=? WHERE id=?",
      )
      .bind(stamp(), preflightId),
    db
      .prepare(
        "UPDATE postal_preflights SET transfer_status='prepared',provider_draft_id=? WHERE id=?",
      )
      .bind(draft, preflightId),
  ]);
  const postalQuote = vi.fn(async () => ({
    supplierMinor: 151,
    currency: "EUR" as const,
    providerDraftId: draft,
    preparedLetterId: letter,
    evidenceSha256: "c".repeat(64),
  }));
  const domain = new DomainService(db, {
    mode: "production",
    now: () => clock,
    liveDeliveryIdentity: { postal: identity },
    postalQuote,
  });
  const row = await domain.prepareDispatch(
    f.ctx,
    {
      channel: "postal",
      documentId: f.documentId,
      recipient,
      ceilingMinor: 400,
      options: {
        ...print,
        providerDraftId: draft,
        preparedLetterId: letter,
        expectedAddress,
      },
    },
    crypto.randomUUID(),
  );
  return { domain, row, postalQuote };
}

describe("existing-dispatch validation without business effects", () => {
  it("repeats a valid production quote check without approval, consumption, or disclosure", async () => {
    const row = await prepare();
    await readOnly(async (domain) => {
      const results = await Promise.all(
        Array.from({ length: 3 }, () => domain.validateDispatch(f.ctx, row.id)),
      );
      for (const result of results) {
        expect(result).toMatchObject({
          schema: 1,
          dispatchId: row.id,
          fingerprint: row.fingerprint,
          dispatchMode: "production",
          checkedAt: stamp(),
          status: "partial",
        });
        expect(check(result, "prepared_state").status).toBe("passed");
        expect(check(result, "submission_not_started").status).toBe("passed");
        expect(check(result, "quote").status).toBe("passed");
        noAcceptance(result);
        const encoded = JSON.stringify(result);
        for (const privateValue of [
          f.input.recipient.phone,
          f.documentId,
          f.identity.accountId,
          "synthetic.pdf",
        ])
          expect(encoded).not.toContain(privateValue);
      }
      expect(results[0]).toEqual(results[1]);
    });
    expect(
      await db
        .prepare("SELECT count(*) n FROM approvals WHERE organization_id=?")
        .bind(f.ctx.organizationId)
        .first("n"),
    ).toBe(0);
  });

  it("keeps existing human approval unchanged and still does not claim acceptance", async () => {
    const row = await prepare();
    await f.domain.approveDispatch(f.ctx, row.id, row.fingerprint);
    await readOnly(async (domain) => {
      const result = await domain.validateDispatch(f.ctx, row.id);
      expect(result.status).toBe("partial");
      noAcceptance(result);
    });
  });

  it.each(["expired", "revoked", "missing_identity", "wrong_account"])(
    "blocks a %s fax quote without renewing it",
    async (reason) => {
      const row = await prepare();
      let source = f.domain;
      if (reason === "expired") clock += 301000;
      if (reason === "revoked")
        await db
          .prepare(
            "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE id=?",
          )
          .bind(f.tariff.id)
          .run();
      if (reason === "missing_identity" || reason === "wrong_account")
        source = new DomainService(db, {
          ...f.domain.config,
          liveFaxIdentity:
            reason === "missing_identity"
              ? undefined
              : { ...f.identity, accountId: "different-account" },
        });
      await readOnly(async (domain) => {
        const result = await domain.validateDispatch(f.ctx, row.id);
        expect(result.status).toBe("blocked");
        expect(check(result, "quote")).toMatchObject({
          status: "blocked",
          code: "LIVE_QUOTE_INVALID",
        });
        noAcceptance(result);
      }, source);
    },
  );

  it("does not initialize the next monthly quota period", async () => {
    const row = await prepare();
    clock += 35 * 86400000;
    await readOnly(async (domain) => {
      expect((await domain.validateDispatch(f.ctx, row.id)).status).toBe(
        "blocked",
      );
    });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM usage WHERE organization_id=? AND period=?",
        )
        .bind(f.ctx.organizationId, stamp().slice(0, 7))
        .first("n"),
    ).toBe(0);
  });

  it("does not claim credit or quota acceptance when the safety ceiling is zero", async () => {
    const row = await prepare();
    await db
      .prepare(
        "UPDATE usage SET limit_count=0,limit_minor=0 WHERE organization_id=?",
      )
      .bind(f.ctx.organizationId)
      .run();
    await readOnly(async (domain) => {
      const result = await domain.validateDispatch(f.ctx, row.id);
      expect(check(result, "quote").status).toBe("passed");
      expect(result.status).toBe("partial");
      noAcceptance(result);
    });
  });

  it.each(["admin", "supervisor", "member", "viewer"] as const)(
    "allows existing operational reads for %s without granting approval",
    async (role) => {
      const row = await prepare(),
        actor = await principal(role);
      await readOnly(async (domain) => {
        const result = await domain.validateDispatch(actor, row.id);
        expect(result.status).toBe("partial");
        noAcceptance(result);
      });
    },
  );

  it("rejects forged or revoked current membership and cross-tenant identifiers", async () => {
    const row = await prepare(),
      reader = await principal("viewer");
    const other = await createFaxUsageFixture(db, () => clock);
    await readOnly(async (domain) => {
      await expect(
        domain.validateDispatch({ ...reader, role: "admin" }, row.id),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        domain.validateDispatch(other.ctx, row.id),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        domain.validateDispatch(
          { ...f.ctx, organizationId: other.ctx.organizationId },
          row.id,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    await db
      .prepare("DELETE FROM memberships WHERE organization_id=? AND user_id=?")
      .bind(reader.organizationId, reader.userId)
      .run();
    await readOnly(async (domain) => {
      await expect(
        domain.validateDispatch(reader, row.id),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("honors private document ownership and current supervisor review authority", async () => {
    const owner = await principal("member"),
      other = await principal("member");
    const supervisor = await principal("supervisor", true);
    const documentId = crypto.randomUUID();
    await f.domain.registerDocument(owner, {
      id: documentId,
      name: "private.pdf",
      sha256: "e".repeat(64),
      size: 100,
      pages: 2,
      status: "ready",
      source: "import",
      storageKey: "isolated/private.pdf",
      scanVerified: true,
      privateToCreator: true,
    });
    const row = await f.domain.prepareDispatch(
      owner,
      { ...f.input, documentId },
      crypto.randomUUID(),
    );
    await readOnly(async (domain) => {
      expect((await domain.validateDispatch(owner, row.id)).status).toBe(
        "partial",
      );
      expect((await domain.validateDispatch(supervisor, row.id)).status).toBe(
        "partial",
      );
      await expect(
        domain.validateDispatch(other, row.id),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    await db
      .prepare(
        "UPDATE memberships SET supervisor_can_approve=0 WHERE organization_id=? AND user_id=?",
      )
      .bind(supervisor.organizationId, supervisor.userId)
      .run();
    await readOnly(async (domain) => {
      await expect(
        domain.validateDispatch(supervisor, row.id),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        domain.validateDispatch(
          { ...supervisor, supervisorCanApprove: false },
          row.id,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it.each(["attempt", "provider", "provider_id", "active_attempt_id"])(
    "blocks a prepared row with an existing %s trace",
    async (trace) => {
      const row = await prepare();
      if (trace === "attempt")
        await insertRecord(db, "attempts", {
          id: crypto.randomUUID(),
          dispatch_id: row.id,
          organization_id: f.ctx.organizationId,
          provider: "telnyx",
          status: "unknown",
          created_at: stamp(),
          updated_at: stamp(),
        });
      else
        await db
          .prepare(`UPDATE dispatches SET ${trace}=? WHERE id=?`)
          .bind("synthetic-submission-trace", row.id)
          .run();
      await readOnly(async (domain) => {
        const result = await domain.validateDispatch(f.ctx, row.id);
        expect(result.status).toBe("blocked");
        expect(check(result, "submission_not_started")).toMatchObject({
          status: "blocked",
          code: "SUBMISSION_ALREADY_STARTED",
        });
        noAcceptance(result);
      });
    },
  );

  it.each(["queued", "submission_unknown", "accepted"] as const)(
    "preserves %s work, reservations and outbox without retrying",
    async (state) => {
      const row = await prepare();
      await f.domain.approveDispatch(f.ctx, row.id, row.fingerprint);
      await f.domain.confirmDispatch(f.ctx, row.id, crypto.randomUUID());
      if (state !== "queued") {
        // Deterministic local provider double only; no transport exists in this fixture.
        const submit = vi.fn(async (_dispatch: Dispatch) => ({
          status: state,
          providerId: `synthetic-${row.id}`,
        }));
        await f.domain.processDispatch(row.id, {
          name: "telnyx",
          liveFaxIdentity: f.identity,
          submit,
        });
        expect(submit).toHaveBeenCalledOnce();
      }
      await readOnly(async (domain) => {
        const result = await domain.validateDispatch(f.ctx, row.id);
        expect(result.status).toBe("blocked");
        expect(check(result, "prepared_state")).toMatchObject({
          status: "blocked",
          code: "INVALID_STATE",
        });
        for (const id of [
          "quote",
          "protected_document",
          "recipient_suppression",
        ])
          expect(check(result, id)).toMatchObject({
            status: "not_checked",
            code: "DISPATCH_NOT_PREPARED",
          });
        noAcceptance(result);
      });
      expect(
        await db
          .prepare("SELECT status FROM dispatches WHERE id=?")
          .bind(row.id)
          .first("status"),
      ).toBe(state);
    },
  );

  it("checks a Resend quote locally without sender setup or content exposure", async () => {
    const { domain: source, row } = await emailFixture();
    await readOnly(async (domain) => {
      const result = await domain.validateDispatch(f.ctx, row.id);
      expect(result.status).toBe("partial");
      expect(check(result, "quote").status).toBe("passed");
      expect(check(result, "recipient_suppression").status).toBe("passed");
      noAcceptance(result);
      const json = JSON.stringify(result);
      for (const privateValue of [
        "recipient@example.invalid",
        "Synthetic private subject",
        "Synthetic private body",
        "synthetic-account",
      ])
        expect(json).not.toContain(privateValue);
    }, source);
  });

  it.each(["expired", "revoked"])(
    "blocks a %s delivery quote without replacing it",
    async (reason) => {
      const { domain: source, row, policyId } = await emailFixture();
      if (reason === "expired") clock += 301000;
      else
        await db
          .prepare(
            "UPDATE trusted_delivery_costs SET status='revoked' WHERE id=?",
          )
          .bind(policyId)
          .run();
      await readOnly(async (domain) => {
        const result = await domain.validateDispatch(f.ctx, row.id);
        expect(result.status).toBe("blocked");
        expect(check(result, "quote")).toMatchObject({
          status: "blocked",
          code: "LIVE_QUOTE_INVALID",
        });
        noAcceptance(result);
      }, source);
    },
  );

  it("keeps suppression tenant scoped and blocks the current recipient without mutation", async () => {
    const { domain: source, row } = await emailFixture();
    const other = await createFaxUsageFixture(db, () => clock);
    await insertRecord(db, "suppressions", {
      organization_id: other.ctx.organizationId,
      email: "recipient@example.invalid",
      reason: "complaint",
      created_at: stamp(),
    });
    await readOnly(async (domain) => {
      expect(
        check(
          await domain.validateDispatch(f.ctx, row.id),
          "recipient_suppression",
        ).status,
      ).toBe("passed");
    }, source);
    await insertRecord(db, "suppressions", {
      organization_id: f.ctx.organizationId,
      email: "recipient@example.invalid",
      reason: "complaint",
      created_at: stamp(),
    });
    await readOnly(async (domain) => {
      const result = await domain.validateDispatch(f.ctx, row.id);
      expect(result.status).toBe("blocked");
      expect(check(result, "recipient_suppression")).toMatchObject({
        status: "blocked",
        code: "RECIPIENT_SUPPRESSED",
      });
      noAcceptance(result);
    }, source);
  });

  it.each(["valid", "revoked", "expired"])(
    "reads %s protected hosting without activation, password reveal or charge",
    async (state) => {
      const { domain: source, row } = await emailFixture(true);
      if (state === "revoked")
        await db
          .prepare(
            "UPDATE protected_document_hostings SET status='revoked',revoked_at=? WHERE organization_id=?",
          )
          .bind(stamp(), f.ctx.organizationId)
          .run();
      if (state === "expired") clock += 86401000;
      await readOnly(async (domain) => {
        const result = await domain.validateDispatch(f.ctx, row.id);
        if (state === "valid") {
          expect(result.status).toBe("partial");
          expect(check(result, "protected_document").status).toBe("passed");
        } else {
          expect(result.status).toBe("blocked");
          expect(check(result, "protected_document")).toMatchObject({
            status: "blocked",
            code: "PROTECTED_DOCUMENT_UNAVAILABLE",
          });
        }
        noAcceptance(result);
        expect(JSON.stringify(result)).not.toContain("hostingId");
        expect(JSON.stringify(result)).not.toContain("fixture.example.invalid");
      }, source);
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM protected_hosting_charges WHERE organization_id=?",
          )
          .bind(f.ctx.organizationId)
          .first("n"),
      ).toBe(0);
    },
  );

  it("labels simulation explicitly and never reports its quote as production proof", async () => {
    await db
      .prepare("UPDATE organizations SET mode='simulation' WHERE id=?")
      .bind(f.ctx.organizationId)
      .run();
    await insertRecord(db, "senders", {
      id: crypto.randomUUID(),
      organization_id: f.ctx.organizationId,
      channel: "fax",
      name: "Simulation sender",
      address: "+35220000000",
      status: "verified",
      mode: "simulation",
      created_at: stamp(),
    });
    const source = new DomainService(db, {
      mode: "simulation",
      now: () => clock,
    });
    const row = await source.prepareDispatch(
      f.ctx,
      f.input,
      crypto.randomUUID(),
    );
    await readOnly(async (domain) => {
      const result = await domain.validateDispatch(f.ctx, row.id);
      expect(result.dispatchMode).toBe("simulation");
      expect(result.status).toBe("partial");
      expect(check(result, "quote")).toMatchObject({
        status: "not_checked",
        code: "SIMULATION_NOT_PRODUCTION_PROOF",
      });
      noAcceptance(result);
    }, source);
  });

  it("mounts the authenticated HTTP dry-run for a viewer without sending or business mutations", async () => {
    const row = await prepare(),
      viewer = await principal("viewer");
    const token = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64url");
    await insertRecord(db, "browser_sessions", {
      token_hash: await sha256(token),
      organization_id: viewer.organizationId,
      user_id: viewer.userId,
      csrf_token: crypto.randomUUID(),
      mfa: 1,
      is_development: 0,
      verified_account: 1,
      created_at: stamp(),
      expires_at: new Date(clock + 3600000).toISOString(),
    });
    const forbidden = vi.fn(() => {
      throw Error("HTTP validation attempted an external operation");
    });
    const env = {
      DB: db,
      DOCUMENTS: bucket,
      ENVIRONMENT: "local",
      MODE: "production",
      APP_ORIGIN: "http://localhost:8787",
      TELNYX_ACCOUNT_ID: f.identity.accountId,
      TELNYX_CONNECTION_ID: f.identity.connectionId,
      TELNYX_OUTBOUND_VOICE_PROFILE_ID: f.identity.outboundProfileId,
      DISPATCH_QUEUE: { send: forbidden, sendBatch: forbidden },
      BULK_QUEUE: { send: forbidden, sendBatch: forbidden },
      ASSETS: { fetch: forbidden },
    } as unknown as Env;
    const before = await snapshot();
    const outbound = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(forbidden);
    try {
      const url = `${env.APP_ORIGIN}/api/dispatches/${row.id}/dry-run`;
      expect((await worker.fetch(new Request(url), env)).status).toBe(401);
      for (let i = 0; i < 2; i++) {
        const response = await worker.fetch(
          new Request(url, { headers: { Cookie: `guteneo_session=${token}` } }),
          env,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toContain("no-store");
        const result = (await response.json()) as DispatchValidationResult;
        expect(result).toMatchObject({
          dispatchId: row.id,
          dispatchMode: "production",
          execution: "validation_only",
          status: "partial",
        });
        expect(check(result, "quote").status).toBe("passed");
        noAcceptance(result);
      }
    } finally {
      outbound.mockRestore();
      expect(forbidden).not.toHaveBeenCalled();
      const after = await snapshot();
      // HTTP middleware records bounded rate-limit counters; business state stays identical.
      const { http_limits: _beforeLimits, ...beforeBusiness } = before;
      const { http_limits: _afterLimits, ...afterBusiness } = after;
      expect(afterBusiness).toEqual(beforeBusiness);
      expect(
        await db
          .prepare(
            "SELECT sum(count) n FROM http_limits WHERE organization_id=?",
          )
          .bind(f.ctx.organizationId)
          .first("n"),
      ).toBe(2);
    }
  });

  it("rechecks an existing postal quote twice without consuming or requesting a supplier quote", async () => {
    const { domain: source, row, postalQuote } = await postalFixture();
    expect(postalQuote).toHaveBeenCalledOnce();
    postalQuote.mockClear();
    postalQuote.mockImplementation(async () => {
      throw Error("Validation must never request a new Pingen quote");
    });
    await readOnly(async (domain) => {
      for (let i = 0; i < 2; i++) {
        const result = await domain.validateDispatch(f.ctx, row.id);
        expect(result).toMatchObject({
          dispatchId: row.id,
          dispatchMode: "production",
          status: "partial",
        });
        expect(check(result, "quote").status).toBe("passed");
        noAcceptance(result);
      }
    }, source);
    expect(postalQuote).not.toHaveBeenCalled();
    expect(
      await db
        .prepare("SELECT count(*) n FROM approvals WHERE organization_id=?")
        .bind(f.ctx.organizationId)
        .first("n"),
    ).toBe(0);
  });
});
