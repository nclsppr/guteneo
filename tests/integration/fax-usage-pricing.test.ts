import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import { MCP_SCOPES, type AuthEnv } from "../../apps/api/src/auth";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import {
  DomainService,
  canonicalJson,
  type Dispatch,
} from "../../packages/domain/src/index";
import {
  settleFaxUsage,
  readFaxPricingBatch,
  type OperatorFaxUsageProof,
  type FaxUsageTariff,
} from "../../packages/domain/src/live-fax-usage";
import { validateLiveFaxQuote } from "../../packages/domain/src/live-fax-quotes";
import { emailRateComponents } from "../../packages/domain/src/live-delivery-quotes";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";

let mf: Miniflare, db: D1Database, clock: number;
let f: Awaited<ReturnType<typeof createFaxUsageFixture>>;
const stamp = () => new Date(clock).toISOString();
async function sql(source: string) {
  let statement = "",
    trigger = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += line + " ";
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      await db.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw Error("Incomplete SQL");
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await sql(readFileSync(new URL(file, dir), "utf8"));
});
beforeEach(async () => {
  clock = Date.now();
  f = await createFaxUsageFixture(db, () => clock);
});
afterAll(async () => {
  await mf?.dispose();
});
const prepare = (ceilingMinor = 100) =>
  f.domain.prepareDispatch(
    f.ctx,
    { ...f.input, ceilingMinor },
    crypto.randomUUID(),
  );
async function queue(ceilingMinor = 100) {
  const d = await prepare(ceilingMinor);
  await f.domain.approveDispatch(f.ctx, d.id, d.fingerprint);
  return f.domain.confirmDispatch(f.ctx, d.id, crypto.randomUUID());
}
async function submit(
  d: Dispatch,
  outcome: "accepted" | "submission_unknown" | "rejected" = "accepted",
) {
  const providerId = `fax_${d.id}`;
  const hook = vi.fn(async (row: Dispatch) => {
    // Synthetic first-invocation fence; no connector or external HTTP is used.
    await db
      .prepare(
        "UPDATE attempts SET bridge_claimed_at=? WHERE id=? AND bridge_claimed_at IS NULL",
      )
      .bind(stamp(), row.active_attempt_id)
      .run();
    return outcome === "rejected"
      ? { status: outcome, errorCode: "EXPLICIT_NO_SUBMISSION" }
      : { status: outcome, providerId };
  });
  await f.domain.processDispatch(d.id, {
    name: "telnyx",
    liveFaxIdentity: f.identity,
    submit: hook,
  });
  return { providerId, hook };
}
async function event(d: Dispatch, kind: "accepted" | "delivered" | "failed") {
  await f.domain.ingestEvent({
    provider: "telnyx",
    eventId: crypto.randomUUID(),
    providerId: `fax_${d.id}`,
    dispatchId: d.id,
    kind,
    occurredAt: stamp(),
  });
}
async function proof(
  d: Dispatch,
  supplierNanoUsd = 20_000_000,
): Promise<OperatorFaxUsageProof> {
  const row = await db
    .prepare("SELECT active_attempt_id FROM dispatches WHERE id=?")
    .bind(d.id)
    .first<{ active_attempt_id: string }>();
  return {
    source: "operator_reconciled_usage",
    organizationId: f.ctx.organizationId,
    dispatchId: d.id,
    attemptId: row!.active_attempt_id,
    providerId: `fax_${d.id}`,
    accountId: f.identity.accountId,
    connectionId: f.identity.connectionId,
    quoteFingerprint: d.quote_fingerprint!,
    supplierNanoUsd,
    reviewerId: f.ctx.userId,
    evidenceReference: "ISOLATED SYNTHETIC USAGE",
    evidenceSha256: "c".repeat(64),
    observedAt: stamp(),
  };
}
async function balance() {
  return db
    .prepare(
      "SELECT reserved_minor,spent_minor,available_minor FROM welcome_credit_balances WHERE organization_id=?",
    )
    .bind(f.ctx.organizationId)
    .first();
}
async function quota() {
  return db
    .prepare(
      "SELECT reserved_minor,confirmed_minor,reserved_count,confirmed_count FROM usage WHERE organization_id=? AND channel='fax' ORDER BY period LIMIT 1",
    )
    .bind(f.ctx.organizationId)
    .first();
}
async function readyToSettle(ceilingMinor = 100) {
  const d = await queue(ceilingMinor);
  await submit(d);
  await event(d, "delivered");
  return d;
}

describe("fax v3 — real local D1, synthetic provider and operator evidence", () => {
  it("projects a full 100-id page with two bound parameters and keeps tenant isolation", async () => {
    const d = await prepare();
    const ids = [
      d.id,
      ...Array.from({ length: 99 }, () => crypto.randomUUID()),
    ];
    const view = await readFaxPricingBatch(db, f.ctx.organizationId, ids);
    expect(view.size).toBe(1);
    expect(view.get(d.id)?.estimatedHighNanoeur).toBe(55_440_000);
    expect((await readFaxPricingBatch(db, "another-tenant", ids)).size).toBe(0);
    await expect(
      readFaxPricingBatch(db, f.ctx.organizationId, [...ids, "too-many"]),
    ).rejects.toMatchObject({ code: "INVALID_LIMIT" });
  });
  it("prepares a fingerprinted range and cap once, without a future usage record", async () => {
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      f.domain.prepareDispatch(f.ctx, f.input, key),
      f.domain.prepareDispatch(f.ctx, f.input, key),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.estimated_minor).toBe(6);
    expect(a.faxPricing).toMatchObject({
      version: 3,
      estimatedLowNanoeur: 35_280_000,
      estimatedHighNanoeur: 55_440_000,
      ceilingMinor: 100,
      settlement: { status: "not_reserved" },
    });
    expect(JSON.stringify(a.faxPricing)).not.toMatch(
      /supplier|absorbed|priceRule|usage_x2/,
    );
    await f.domain.approveDispatch(f.ctx, a.id, a.fingerprint);
    await Promise.all([
      f.domain.confirmDispatch(f.ctx, a.id, "same-confirm"),
      f.domain.confirmDispatch(f.ctx, a.id, "same-confirm"),
    ]);
    expect(await balance()).toEqual({
      reserved_minor: 100,
      spent_minor: 0,
      available_minor: 4900,
    });
    expect(
      (
        await db
          .prepare("SELECT count(*) n FROM outbox WHERE organization_id=?")
          .bind(f.ctx.organizationId)
          .first()
      )?.n,
    ).toBe(1);
    expect(
      (await f.domain.getDispatch(f.ctx, a.id)).dispatch.faxPricing?.settlement
        .status,
    ).toBe("reserved");
    const listed = (await f.domain.listDispatches(f.ctx)).items.find(
      (row) => row.id === a.id,
    )!;
    expect(listed.faxPricing).toMatchObject({
      estimatedHighNanoeur: 55_440_000,
      settlement: { status: "reserved" },
    });
    expect(JSON.stringify(listed)).not.toMatch(
      /supplier_nano|supplierNano|priceRule|usage_x2|guteneoAbsorbed/,
    );
  });
  it("retains both holds through acceptance and delivery, then settles actual usage once", async () => {
    const d = await queue();
    await submit(d);
    expect(await balance()).toMatchObject({
      reserved_minor: 100,
      spent_minor: 0,
    });
    expect(await quota()).toMatchObject({
      reserved_minor: 100,
      confirmed_minor: 0,
    });
    await event(d, "delivered");
    expect(await balance()).toMatchObject({
      reserved_minor: 100,
      spent_minor: 0,
    });
    const p = await proof(d);
    const [a, b] = await Promise.all([
      settleFaxUsage(db, p, stamp()),
      settleFaxUsage(db, p, stamp()),
    ]);
    expect(a.proof_fingerprint).toBe(b.proof_fingerprint);
    expect(a.customer_nanoeur).toBe(36_000_000);
    expect(await balance()).toEqual({
      reserved_minor: 0,
      spent_minor: 4,
      available_minor: 4996,
    });
    expect(await quota()).toEqual({
      reserved_minor: 0,
      confirmed_minor: 4,
      reserved_count: 0,
      confirmed_count: 1,
    });
    expect(
      (await f.domain.getDispatch(f.ctx, d.id)).dispatch.faxPricing?.settlement,
    ).toEqual({
      status: "settled",
      customerNanoeur: 36_000_000,
      chargedMinor: 4,
      settledAt: stamp(),
    });
    await expect(
      settleFaxUsage(db, { ...p, supplierNanoUsd: 30_000_000 }, stamp()),
    ).rejects.toMatchObject({ code: "FAX_USAGE_PROOF_CONFLICT" });
  });
  it("never bills above the approved ceiling and records Guteneo's actual uncovered cost", async () => {
    const d = await readyToSettle();
    const s = await settleFaxUsage(db, await proof(d, 2_000_000_000), stamp());
    expect(s).toMatchObject({
      supplier_nanoeur: 1_800_000_000,
      customer_nanoeur: 1_000_000_000,
      guteneo_absorbed_nanoeur: 800_000_000,
    });
    expect(await balance()).toEqual({
      reserved_minor: 0,
      spent_minor: 100,
      available_minor: 4900,
    });
    expect(await quota()).toMatchObject({ confirmed_minor: 100 });
  });
  it("keeps unknown→failed→late accepted liability reserved until reconciled, without resending", async () => {
    const d = await queue(),
      { hook } = await submit(d, "submission_unknown");
    await event(d, "failed");
    await event(d, "accepted");
    expect(await balance()).toMatchObject({
      reserved_minor: 100,
      spent_minor: 0,
    });
    expect(await quota()).toMatchObject({
      reserved_minor: 100,
      confirmed_minor: 0,
    });
    await f.domain.processDispatch(d.id, {
      name: "telnyx",
      liveFaxIdentity: f.identity,
      submit: hook,
    });
    expect(hook).toHaveBeenCalledTimes(1);
    await settleFaxUsage(db, await proof(d), stamp());
    await event(d, "accepted");
    expect(await balance()).toMatchObject({
      reserved_minor: 0,
      spent_minor: 4,
    });
  });
  it("can settle a proved zero cost after failure, while failure alone is not free", async () => {
    const d = await queue();
    await submit(d, "submission_unknown");
    await event(d, "failed");
    expect(await balance()).toMatchObject({
      reserved_minor: 100,
      spent_minor: 0,
    });
    await settleFaxUsage(db, await proof(d, 0), stamp());
    expect(await balance()).toEqual({
      reserved_minor: 0,
      spent_minor: 0,
      available_minor: 5000,
    });
    expect(await quota()).toMatchObject({
      reserved_minor: 0,
      confirmed_minor: 0,
      confirmed_count: 1,
    });
  });
  it("releases only explicit no-submission rejection or cancellation before an attempt", async () => {
    const rejected = await queue();
    await submit(rejected, "rejected");
    expect(await balance()).toEqual({
      reserved_minor: 0,
      spent_minor: 0,
      available_minor: 5000,
    });
    expect(await quota()).toMatchObject({
      reserved_minor: 0,
      confirmed_minor: 0,
    });
    const cancelled = await queue();
    await f.domain.cancelDispatch(f.ctx, cancelled.id);
    expect(await balance()).toMatchObject({
      reserved_minor: 0,
      spent_minor: 0,
    });
  });
  it("does not settle ongoing transport and rejects wrong account/attempt/tenant proofs", async () => {
    const d = await queue();
    await submit(d);
    const p = await proof(d);
    await expect(settleFaxUsage(db, p, stamp())).rejects.toMatchObject({
      code: "FAX_USAGE_PROOF_INVALID",
    });
    await event(d, "delivered");
    for (const patch of [
      { accountId: "wrong" },
      { attemptId: "wrong" },
      { providerId: "wrong" },
      { organizationId: "wrong" },
      { reviewerId: "wrong" },
    ])
      await expect(
        settleFaxUsage(db, { ...p, ...patch }, stamp()),
      ).rejects.toMatchObject({ code: "FAX_USAGE_PROOF_INVALID" });
    expect(await balance()).toMatchObject({
      reserved_minor: 100,
      spent_minor: 0,
    });
  });
  it("reconciles after source expiry, sender revocation and a month boundary using original quota", async () => {
    const d = await readyToSettle();
    const originalMonth = stamp().slice(0, 7);
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE id=?",
      )
      .bind(f.tariff.id)
      .run();
    await db
      .prepare("UPDATE senders SET status='disabled' WHERE id=?")
      .bind(f.tariff.sender_id)
      .run();
    clock = Date.UTC(
      new Date(clock).getUTCFullYear(),
      new Date(clock).getUTCMonth() + 1,
      2,
    );
    await settleFaxUsage(db, await proof(d), stamp());
    expect(await quota()).toMatchObject({
      reserved_minor: 0,
      confirmed_minor: 4,
    });
    expect(
      (
        await db
          .prepare("SELECT period FROM reservations WHERE dispatch_id=?")
          .bind(d.id)
          .first()
      )?.period,
    ).toBe(originalMonth);
    expect(await balance()).toMatchObject({ spent_minor: 4 });
  });
  it("accumulates sub-cent charges instead of charging a cent for every fax", async () => {
    for (let i = 0; i < 5; i++) {
      const d = await readyToSettle();
      await settleFaxUsage(db, await proof(d, 1_000_000), stamp());
    }
    expect(await balance()).toEqual({
      reserved_minor: 0,
      spent_minor: 1,
      available_minor: 4999,
    });
    expect(await quota()).toMatchObject({
      confirmed_minor: 1,
      confirmed_count: 5,
    });
  });
  it("rejects a more-specific special prefix, including an already prepared broader quote", async () => {
    const d = await prepare();
    await insertRecord(db, "trusted_fax_usage_tariffs", {
      ...f.tariff,
      id: `${f.tariff.id}_deny`,
      destination_prefix: "+331000",
      destination_category: "special",
      route_allowed: 0,
    });
    await expect(prepare()).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
    await expect(
      f.domain.approveDispatch(f.ctx, d.id, d.fingerprint),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    await expect(
      db
        .prepare("UPDATE dispatches SET status='queued' WHERE id=?")
        .bind(d.id)
        .run(),
    ).rejects.toThrow();
    expect(await balance()).toMatchObject({
      reserved_minor: 0,
      spent_minor: 0,
    });
  });
  it("never falls back to v2 on a revoked/unsupported v3 route or changed profile", async () => {
    await insertRecord(db, "trusted_fax_supplier_costs", {
      id: `legacy_${f.tariff.id}`,
      organization_id: f.ctx.organizationId,
      sender_id: f.tariff.sender_id,
      provider: "telnyx",
      account_id: f.identity.accountId,
      connection_id: f.identity.connectionId,
      destination_prefix: "+33",
      options_json: "{}",
      currency: "EUR",
      supplier_base_numerator: 0,
      supplier_per_page_numerator: 1,
      supplier_denominator: 1,
      fiscal_basis: "tax_inclusive_totals",
      currency_basis: "same_currency_no_fx",
      max_pages: 10,
      quote_ttl_seconds: 300,
      cost_basis: "guaranteed_final_supplier_total",
      source_reference: "ISOLATED V2 FIXTURE",
      source_sha256: "d".repeat(64),
      valid_from: stamp(),
      expires_at: new Date(clock + 3600_000).toISOString(),
      status: "qualified",
      created_at: stamp(),
    });
    const d = await prepare();
    await expect(
      validateLiveFaxQuote(
        db,
        d,
        { ...f.identity, outboundProfileId: "wrong" },
        stamp(),
      ),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE id=?",
      )
      .bind(f.tariff.id)
      .run();
    await expect(prepare()).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
    expect(await balance()).toMatchObject({
      reserved_minor: 0,
      spent_minor: 0,
    });
  });
  it("binds the cap and estimate immutably and refuses expired approval/acceptance before any debit", async () => {
    await expect(prepare(5)).rejects.toMatchObject({ code: "INVALID_CEILING" });
    const d = await prepare();
    await expect(
      db
        .prepare(
          "UPDATE live_fax_quotes_v3 SET estimated_high_nanoeur=1 WHERE dispatch_id=?",
        )
        .bind(d.id)
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare("UPDATE dispatches SET ceiling_minor=200 WHERE id=?")
        .bind(d.id)
        .run(),
    ).rejects.toThrow();
    await f.domain.approveDispatch(f.ctx, d.id, d.fingerprint);
    clock += 301_000;
    await expect(
      f.domain.confirmDispatch(f.ctx, d.id, "expired"),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    expect(await balance()).toMatchObject({
      reserved_minor: 0,
      spent_minor: 0,
    });
    expect(
      (
        await db
          .prepare("SELECT count(*) n FROM outbox WHERE organization_id=?")
          .bind(f.ctx.organizationId)
          .first()
      )?.n,
    ).toBe(0);
  });
  it("rechecks the named reviewer membership when committing a settlement", async () => {
    const d = await readyToSettle(),
      p = await proof(d);
    const other = `replacement_${f.ctx.userId}`;
    await db
      .prepare(
        "INSERT INTO users VALUES(?,'Fixture','replacement@example.invalid',?)",
      )
      .bind(other, stamp())
      .run();
    await db
      .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
      .bind(f.ctx.organizationId, other, stamp())
      .run();
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(f.ctx.organizationId, f.ctx.userId)
      .run();
    await expect(settleFaxUsage(db, p, stamp())).rejects.toMatchObject({
      code: "FAX_USAGE_PROOF_INVALID",
    });
    expect(await balance()).toMatchObject({
      reserved_minor: 100,
      spent_minor: 0,
    });
  });
  it("blocks new acceptance when a single shared ceiling consumes all welcome credit", async () => {
    const first = await prepare(5000),
      second = await prepare(5000);
    await f.domain.approveDispatch(f.ctx, first.id, first.fingerprint);
    await f.domain.approveDispatch(f.ctx, second.id, second.fingerprint);
    const results = await Promise.allSettled([
      f.domain.confirmDispatch(f.ctx, first.id, "first"),
      f.domain.confirmDispatch(f.ctx, second.id, "second"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance()).toEqual({
      reserved_minor: 5000,
      spent_minor: 0,
      available_minor: 0,
    });
    expect(
      (
        await db
          .prepare("SELECT count(*) n FROM outbox WHERE organization_id=?")
          .bind(f.ctx.organizationId)
          .first()
      )?.n,
    ).toBe(1);
  });
  it("shares reservations and fractional settlement with email without changing its accepted-price contract", async () => {
    const org = f.ctx.organizationId,
      sender = `email_${org}`,
      now = stamp();
    await db
      .prepare(
        "INSERT INTO senders VALUES(?,?,'email','Fixture','sender@example.invalid','verified','production',?)",
      )
      .bind(sender, org, now)
      .run();
    await db
      .prepare("INSERT INTO channel_controls VALUES(?,'email',1)")
      .bind(org)
      .run();
    await db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email',?,100,5000,'EUR')",
      )
      .bind(org, now.slice(0, 7))
      .run();
    const rate = {
      usdMicrosPerMessage: 100,
      eurPerUsdNumerator: 1,
      eurPerUsdDenominator: 1,
      attachmentBasis: "no_attachments" as const,
    };
    const components = emailRateComponents(rate);
    await insertRecord(db, "trusted_delivery_costs", {
      id: `email_policy_${org}`,
      organization_id: org,
      sender_id: sender,
      channel: "email",
      provider: "ses",
      account_id: "fixture-email",
      route_id: "fixture-region",
      options_json: "{}",
      rate_json: canonicalJson(rate),
      ...components,
      currency: "EUR",
      fiscal_basis: "qualified_final_variable_cost",
      quote_ttl_seconds: 300,
      source_reference: "ISOLATED EMAIL FIXTURE",
      source_sha256: "d".repeat(64),
      valid_from: now,
      expires_at: new Date(clock + 3600_000).toISOString(),
      status: "qualified",
      created_at: now,
    });
    const identity = {
      email: { accountId: "fixture-email", routeId: "fixture-region" },
    };
    const emailDomain = new DomainService(db, {
      mode: "production",
      now: () => clock,
      liveDeliveryIdentity: identity,
    });
    const email = await emailDomain.prepareDispatch(
      f.ctx,
      {
        channel: "email",
        recipient: { email: "recipient@example.invalid" },
        subject: "Fixture",
        html: "<p>Fixture</p>",
        ceilingMinor: 2501,
      },
      "email",
    );
    const fax = await prepare(2500);
    await emailDomain.approveDispatch(f.ctx, email.id, email.fingerprint, {
      recipientRequested: true,
    });
    await f.domain.approveDispatch(f.ctx, fax.id, fax.fingerprint);
    const results = await Promise.allSettled([
      emailDomain.confirmDispatch(f.ctx, email.id, "email-confirm"),
      f.domain.confirmDispatch(f.ctx, fax.id, "fax-confirm"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? email : fax;
    await (winner.channel === "email" ? emailDomain : f.domain).cancelDispatch(
      f.ctx,
      winner.id,
    );
    const smallEmail = await emailDomain.prepareDispatch(
      f.ctx,
      {
        channel: "email",
        recipient: { email: "recipient@example.invalid" },
        subject: "Small",
        html: "<p>Fixture</p>",
      },
      "small-email",
    );
    await emailDomain.approveDispatch(
      f.ctx,
      smallEmail.id,
      smallEmail.fingerprint,
      { recipientRequested: true },
    );
    await emailDomain.confirmDispatch(
      f.ctx,
      smallEmail.id,
      "small-email-confirm",
    );
    await emailDomain.processDispatch(smallEmail.id, {
      name: "ses",
      liveDeliveryIdentity: identity,
      submit: async () => ({
        status: "accepted",
        providerId: `ses_${smallEmail.id}`,
      }),
    });
    const d = await readyToSettle();
    await settleFaxUsage(db, await proof(d, 1_000_000), stamp());
    expect(await balance()).toMatchObject({
      reserved_minor: 0,
      spent_minor: 1,
    });
    expect(
      (await f.domain.getDispatch(f.ctx, d.id)).dispatch.faxPricing?.settlement
        .chargedMinor,
    ).toBe(0);
  });
});

describe("Luxembourg operator-authorized route test — synthetic D1 only", () => {
  const operatorTest: Partial<FaxUsageTariff> = {
    origin_class: "local",
    destination_country_code: "LU",
    destination_prefix: "+3524",
    minute_nano_usd: 22_000_000,
    local_calling_verified: 0,
    route_qualification: "operator_test",
    operator_authorization_reference:
      "ISOLATED OPERATOR AUTHORIZATION - NEVER PRODUCTION",
    operator_test_ceiling_minor: 200,
  };
  async function fixture() {
    f = await createFaxUsageFixture(db, () => clock, operatorTest);
    f.input.recipient.phone = "+35240000000";
  }
  it("returns the real LU operator-test quote through MCP prepare_fax's strict output schema", async () => {
    await fixture();
    const server = createGuteneoMcpServer(
      {
        context: { ...f.ctx, actor: "mcp" },
        scopes: [...MCP_SCOPES],
        clientId: "fixture-only",
        token: "fixture-only",
        expiresAt: clock + 60000,
      },
      { APP_ORIGIN: "https://guteneo.invalid" } as AuthEnv,
      {
        domain: f.domain,
        documents: {
          importFile: async () => {
            throw Error("No upload in this test");
          },
          render: async () => {
            throw Error("No render in this test");
          },
        },
        capabilities: () => ({ mode: "production", liveSendsEnabled: true }),
      },
    );
    const client = new Client({ name: "lu-operator-route-test", version: "1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
    try {
      const result = await client.callTool({
        name: "prepare_fax",
        arguments: {
          documentId: f.documentId,
          phone: f.input.recipient.phone,
          ceilingMinor: 200,
          idempotencyKey: "lu-real-domain-test",
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: true,
        data: {
          status: "prepared",
          faxPricing: {
            routeQualification: "operator_authorized_test",
            routeNotice: expect.stringContaining("n’est pas confirmée"),
            ceilingMinor: 200,
          },
        },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /operator_authorization_reference|page_nano_usd|minute_nano_usd|supplier/,
      );
      expect(
        await db
          .prepare("SELECT count(*) n FROM outbox WHERE organization_id=?")
          .bind(f.ctx.organizationId)
          .first(),
      ).toEqual({ n: 0 });
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("prepares and accepts a bounded test without claiming verified Local Calling", async () => {
    await fixture();
    const d = await queue(200);
    expect(d.faxPricing).toMatchObject({
      routeQualification: "operator_authorized_test",
      routeNotice: expect.stringContaining("n’est pas confirmée"),
      ceilingMinor: 200,
    });
    expect(await balance()).toEqual({
      reserved_minor: 200,
      spent_minor: 0,
      available_minor: 4800,
    });
    expect(
      await db
        .prepare(
          "SELECT local_calling_verified FROM trusted_fax_usage_tariffs WHERE id=?",
        )
        .bind(f.tariff.id)
        .first(),
    ).toEqual({ local_calling_verified: 0 });
    expect(
      await db
        .prepare("SELECT count(*) n FROM attempts WHERE organization_id=?")
        .bind(f.ctx.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("rejects more than the operator ceiling before preparing or reserving", async () => {
    await fixture();
    await expect(prepare(201)).rejects.toMatchObject({
      code: "FAX_TEST_CEILING_EXCEEDED",
    });
    expect(
      await db
        .prepare("SELECT count(*) n FROM dispatches WHERE organization_id=?")
        .bind(f.ctx.organizationId)
        .first(),
    ).toEqual({ n: 0 });
    expect(await balance()).toEqual({
      reserved_minor: 0,
      spent_minor: 0,
      available_minor: 5000,
    });
  });
  it("does not widen testing to mobiles or another Luxembourg prefix", async () => {
    await fixture();
    f.input.recipient.phone = "+35260000000";
    await expect(prepare()).rejects.toMatchObject({
      code: "LIVE_PRICING_REQUIRED",
    });
  });
  it("revocation prevents approval of an already prepared operator test", async () => {
    await fixture();
    const d = await prepare();
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE id=?",
      )
      .bind(f.tariff.id)
      .run();
    await expect(
      f.domain.approveDispatch(f.ctx, d.id, d.fingerprint),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
  });
  it("keeps test authority and ceiling immutable", async () => {
    await fixture();
    for (const assignment of [
      "operator_test_ceiling_minor=199",
      "operator_authorization_reference='different'",
      "route_qualification='provider_verified'",
    ]) {
      await expect(
        db
          .prepare(
            `UPDATE trusted_fax_usage_tariffs SET ${assignment} WHERE id=?`,
          )
          .bind(f.tariff.id)
          .run(),
      ).rejects.toThrow("immutable_fax_usage_tariff");
    }
  });
  it.each([
    { operator_authorization_reference: null },
    { operator_authorization_reference: "" },
    { operator_test_ceiling_minor: null },
    { operator_test_ceiling_minor: 201 },
    { local_calling_verified: 1 },
    { destination_prefix: "+352" },
    { destination_prefix: "+3526" },
    { destination_category: "special" },
    { origin_class: "eea" },
    { destination_country_code: "FR", destination_prefix: "+334" },
  ] as Partial<FaxUsageTariff>[])(
    "rejects an unbounded or false test policy %#",
    async (invalid) => {
      await expect(
        createFaxUsageFixture(db, () => clock, { ...operatorTest, ...invalid }),
      ).rejects.toThrow();
    },
  );
  it("rejects test authority longer than seven days", async () => {
    await expect(
      createFaxUsageFixture(db, () => clock, {
        ...operatorTest,
        expires_at: new Date(clock + 7 * 86400_000 + 1).toISOString(),
      }),
    ).rejects.toThrow();
  });
});
