import { afterAll, beforeAll, expect, it } from "vitest";
import type { Miniflare } from "miniflare";
import type { Env } from "../../apps/api/src/env";
import {
  administrationActivity,
  administrationAuthority,
  administrationCharges,
  administrationConsumption,
  administrationFilters,
  administrationOverview,
} from "../../apps/api/src/administration";
import { settleFaxUsage } from "../../packages/domain/src/live-fax-usage";
import {
  DomainService,
  canonicalJson,
  emailRateComponents,
} from "../../packages/domain/src/index";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";
import { migratedD1 } from "../helpers/migrated-d1";

// Synthetic accounting under the complete current schema. No trigger is removed,
// no real provider is contacted and production flags are not delivery evidence.
let mf: Miniflare, db: D1Database, env: Env;
let clock = Date.now();
const created = new Date(clock).toISOString();
const charged = new Date(clock + 86_400_000).toISOString();
const timestamp = () => new Date(clock).toISOString();
type Fixture = Awaited<ReturnType<typeof createFaxUsageFixture>>;
let alpha: Fixture, beta: Fixture, chargedDispatch: string;
const period = (stamp: string) =>
  administrationFilters(
    new URL(
      `https://example.invalid/?from=${stamp.slice(0, 10)}&to=${stamp.slice(0, 10)}`,
    ),
  );

async function queue(f: Fixture) {
  const dispatch = await f.domain.prepareDispatch(
    f.ctx,
    f.input,
    crypto.randomUUID(),
  );
  await f.domain.approveDispatch(f.ctx, dispatch.id, dispatch.fingerprint);
  return f.domain.confirmDispatch(f.ctx, dispatch.id, crypto.randomUUID());
}
async function accepted(f: Fixture) {
  const dispatch = await queue(f);
  await f.domain.processDispatch(dispatch.id, {
    name: "telnyx",
    liveFaxIdentity: f.identity,
    submit: async (row) => {
      await db
        .prepare(
          "UPDATE attempts SET bridge_claimed_at=? WHERE id=? AND bridge_claimed_at IS NULL",
        )
        .bind(timestamp(), row.active_attempt_id)
        .run();
      return { status: "accepted", providerId: `synthetic_${row.id}` };
    },
  });
  await f.domain.ingestEvent({
    provider: "telnyx",
    eventId: crypto.randomUUID(),
    providerId: `synthetic_${dispatch.id}`,
    dispatchId: dispatch.id,
    kind: "delivered",
    occurredAt: timestamp(),
  });
  return dispatch;
}
async function settle(
  f: Fixture,
  dispatch: Awaited<ReturnType<typeof queue>>,
  supplierNanoUsd: number,
) {
  const row = await db
    .prepare(
      "SELECT active_attempt_id FROM dispatches WHERE organization_id=? AND id=?",
    )
    .bind(f.ctx.organizationId, dispatch.id)
    .first<{ active_attempt_id: string }>();
  await settleFaxUsage(
    db,
    {
      source: "operator_reconciled_usage",
      organizationId: f.ctx.organizationId,
      dispatchId: dispatch.id,
      attemptId: row!.active_attempt_id,
      providerId: `synthetic_${dispatch.id}`,
      accountId: f.identity.accountId,
      connectionId: f.identity.connectionId,
      quoteFingerprint: dispatch.quote_fingerprint!,
      supplierNanoUsd,
      reviewerId: f.ctx.userId,
      evidenceReference: "ISOLATED ACCOUNTING FIXTURE",
      evidenceSha256: "c".repeat(64),
      observedAt: timestamp(),
    },
    timestamp(),
  );
}

async function document(f: Fixture, purpose: string) {
  return f.domain.registerDocument(f.ctx, {
    name: `Private ${purpose}.pdf`,
    sha256: (purpose === "hosting" ? "d" : "e").repeat(64),
    size: 100,
    pages: 1,
    status: "ready",
    source: "render",
    storageKey: `synthetic/${purpose}/${f.ctx.organizationId}`,
    scanVerified: true,
  });
}
async function metadataDispatch(
  f: Fixture,
  id: string,
  documentId: string | null,
  options: object,
) {
  await insertRecord(db, "senders", {
    id: `${id}_sender`,
    organization_id: f.ctx.organizationId,
    channel: "email",
    name: "Synthetic",
    address: "sender@example.invalid",
    status: "verified",
    mode: "production",
    created_at: created,
  });
  // A retained queued record is a fixture for read projection, not authorization
  // to submit it. Hosting's real debit/approval guards still run below.
  await insertRecord(db, "dispatches", {
    id,
    organization_id: f.ctx.organizationId,
    document_id: documentId,
    channel: "email",
    recipient_json: '{"email":"private-recipient@example.invalid"}',
    sender_id: `${id}_sender`,
    sender_address: "sender@example.invalid",
    subject: "Private subject",
    text: "Private message",
    options_json: JSON.stringify(options),
    status: "queued",
    mode: "production",
    estimated_minor: 100,
    ceiling_minor: 100,
    currency: "EUR",
    fingerprint: id,
    prepare_key: id,
    request_hash: id,
    created_at: charged,
    updated_at: charged,
  });
  return id;
}
async function hosting(f: Fixture) {
  const doc = await document(f, "hosting"),
    id = `hosting_${f.ctx.organizationId}`;
  const expires = new Date(clock + 7 * 86_400_000).toISOString();
  await insertRecord(db, "protected_document_hostings", {
    id,
    organization_id: f.ctx.organizationId,
    document_id: doc.id,
    document_sha256: doc.sha256,
    duration_days: 7,
    token_hash: crypto.randomUUID().replaceAll("-", "").repeat(2),
    password_salt: "synthetic",
    password_verifier: "synthetic",
    sealed_secrets: "synthetic",
    status: "draft",
    created_at: created,
    expires_at: expires,
  });
  const sender = `email_${id}`,
    identity = {
      provider: "resend" as const,
      accountId: "synthetic-account",
      routeId: "synthetic-route",
    };
  const rate = {
    usdMicrosPerMessage: 100,
    eurPerUsdNumerator: 1,
    eurPerUsdDenominator: 1,
    attachmentBasis: "no_attachments" as const,
  };
  const components = emailRateComponents(rate);
  await insertRecord(db, "senders", {
    id: sender,
    organization_id: f.ctx.organizationId,
    channel: "email",
    name: "Synthetic",
    address: "documents@example.invalid",
    status: "verified",
    mode: "production",
    created_at: charged,
  });
  await db.batch([
    db
      .prepare("INSERT INTO channel_controls VALUES(?,'email',1)")
      .bind(f.ctx.organizationId),
    db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email',?,100,5000,'EUR')",
      )
      .bind(f.ctx.organizationId, charged.slice(0, 7)),
  ]);
  await insertRecord(db, "trusted_delivery_costs", {
    id: `cost_${id}`,
    organization_id: f.ctx.organizationId,
    sender_id: sender,
    channel: "email",
    provider: "resend",
    account_id: identity.accountId,
    route_id: identity.routeId,
    options_json: "{}",
    rate_json: canonicalJson(rate),
    ...components,
    currency: "EUR",
    fiscal_basis: "qualified_final_variable_cost",
    quote_ttl_seconds: 900,
    source_reference: "ISOLATED SYNTHETIC RATE",
    source_sha256: "b".repeat(64),
    valid_from: charged,
    expires_at: new Date(clock + 3600000).toISOString(),
    status: "qualified",
    created_at: charged,
  });
  const domain = new DomainService(db, {
    mode: "production",
    now: () => clock,
    liveDeliveryIdentity: { email: identity },
    prepareProtectedDocument: async () => ({
      hostingId: id,
      expiresAt: expires,
      durationDays: 7,
      hostingFeeMinor: 100,
      currency: "EUR",
      url: "https://example.invalid/synthetic-protected-link",
    }),
  });
  const dispatch = await domain.prepareDispatch(
    f.ctx,
    {
      channel: "email",
      documentId: doc.id,
      senderId: sender,
      recipient: { email: "private-recipient@example.invalid" },
      subject: "Private subject",
      text: "Private message",
      options: { emailDeliveryMode: "protected_link", protectedDays: 7 },
      ceilingMinor: 101,
    },
    crypto.randomUUID(),
  );
  await domain.approveDispatch(f.ctx, dispatch.id, dispatch.fingerprint, {
    recipientRequested: true,
  });
  await domain.confirmDispatch(f.ctx, dispatch.id, crypto.randomUUID());
}
async function distribution(f: Fixture) {
  const doc = await document(f, "distribution"),
    id = `distribution_${f.ctx.organizationId}`;
  await insertRecord(db, "secure_distributions", {
    id,
    organization_id: f.ctx.organizationId,
    source_id: doc.id,
    source_sha256: doc.sha256,
    source_name: doc.name,
    source_pages: 1,
    created_by: f.ctx.userId,
    request_key: id,
    request_hash: id,
    recipient_address: "sensitive@example.invalid",
    token_hash: crypto.randomUUID().replaceAll("-", "").repeat(2),
    sealed_token: "private-token",
    policy_json: "{}",
    quote_json: "{}",
    input_json: "{}",
    service_fee_minor: 200,
    price_version: "secure-distribution-2026-10-24-v1",
    status: "preparing",
    created_at: created,
    prepared_expires_at: charged,
  });
  const dispatch = await metadataDispatch(f, `dispatch_${id}`, null, {});
  await insertRecord(db, "secure_distribution_charges", {
    organization_id: f.ctx.organizationId,
    distribution_id: id,
    dispatch_id: dispatch,
    amount_minor: 200,
    evidence: "production",
    created_at: charged,
  });
}
async function pdfCheck(
  f: Fixture,
  id: string,
  status: "processing" | "complete" | "error",
) {
  await insertRecord(db, "pdf_validations", {
    organization_id: f.ctx.organizationId,
    id,
    document_id: f.documentId,
    document_sha256: "a".repeat(64),
    request_user_id: f.ctx.userId,
    profile: "ua1",
    evidence: "production",
    idempotency_key: id,
    period: charged.slice(0, 7),
    status: "processing",
    created_at: charged,
    deadline_at: new Date(clock + 60_000).toISOString(),
    purchase_terms_version: "pdf-check-2026-10-25-v1",
    purchase_price_minor: 10,
    purchase_source: "browser_administrator",
  });
  if (status === "complete")
    await db
      .prepare(
        "UPDATE pdf_validations SET status='complete',completed_at=?,result_json=? WHERE organization_id=? AND id=?",
      )
      .bind(
        charged,
        JSON.stringify({
          id,
          documentId: f.documentId,
          sha256: "a".repeat(64),
          profile: "ua1",
          evidence: "production",
          certification: false,
          manualReviewRequired: true,
          engine: { version: "1.30.2" },
          status: "failed",
          compliant: false,
        }),
        f.ctx.organizationId,
        id,
      )
      .run();
  if (status === "error")
    await db
      .prepare(
        "UPDATE pdf_validations SET status='error' WHERE organization_id=? AND id=?",
      )
      .bind(f.ctx.organizationId, id)
      .run();
}

beforeAll(async () => {
  ({ mf, db } = await migratedD1("administration-finance"));
  env = { DB: db, MODE: "production", ENVIRONMENT: "production" } as Env;
  alpha = await createFaxUsageFixture(db, () => clock);
  beta = await createFaxUsageFixture(db, () => clock);
  for (const f of [alpha, beta]) {
    f.ctx.documentSessionHash = crypto
      .randomUUID()
      .replaceAll("-", "")
      .repeat(2);
    await db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'synthetic',1,0,?,?,1)",
      )
      .bind(
        f.ctx.documentSessionHash,
        f.ctx.userId,
        f.ctx.organizationId,
        created,
        new Date(Date.now() + 3600000).toISOString(),
      )
      .run();
  }
  const first = await accepted(alpha),
    zero = await accepted(alpha),
    other = await accepted(beta);
  chargedDispatch = first.id;
  await queue(alpha);
  clock += 86_400_000;
  await settle(alpha, first, 20_000_000);
  await settle(alpha, zero, 0);
  await settle(beta, other, 2_000_000_000);
  await hosting(alpha);
  await distribution(alpha);
  await pdfCheck(alpha, "pdf_complete", "complete");
  await pdfCheck(alpha, "pdf_error", "error");
  await pdfCheck(alpha, "pdf_processing", "processing");
});
afterAll(async () => mf?.dispose());

it("fails closed when a database aggregate or sum exceeds safe integer precision", async () => {
  const authority = await administrationAuthority(env, alpha.ctx, "reports");
  for (const amounts of [
    [Number.MAX_SAFE_INTEGER, 2],
    [Number.MAX_SAFE_INTEGER + 1],
  ]) {
    const database = {
      prepare: (sql: string) => {
        const statement = {
          bind: () => statement,
          first: async () => ({ reservedMinor: 0 }),
          all: async () => ({
            results: sql.includes("SELECT service,count(*)")
              ? amounts.map((amountMinor, i) => ({
                  service: `fixture_${i}`,
                  charges: 1,
                  amountMinor,
                }))
              : [],
          }),
        };
        return statement;
      },
    } as unknown as D1Database;
    await expect(
      administrationConsumption(
        { ...env, DB: database },
        authority,
        period(charged),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REPORT_AMOUNT" });
  }
});

it("selects posted production debits by charge date, including zero-cent settlements and each service once", async () => {
  const a = await administrationAuthority(env, alpha.ctx, "reports");
  const report = await administrationConsumption(env, a, period(charged));
  expect(report).toMatchObject({
    basis: "posted_ledger",
    totalMinor: 314,
    reservedMinor: 111,
    services: [
      { service: "secure_distribution", charges: 1, amountMinor: 200 },
      { service: "dispatch", charges: 3, amountMinor: 104 },
      { service: "pdf_check", charges: 1, amountMinor: 10 },
    ],
    daily: [{ date: charged.slice(0, 10), amountMinor: 314, charges: 5 }],
    monthly: [{ month: charged.slice(0, 7), amountMinor: 314, charges: 5 }],
  });
  expect(report.channels).toEqual([
    { channel: "email", dispatches: 1, consumptionMinor: 100 },
    { channel: "fax", dispatches: 2, consumptionMinor: 4 },
  ]);
  expect(report.credit).toEqual({ grantedMinor: 5000, availableMinor: 4575 });
  expect(
    (await administrationConsumption(env, a, period(created))).totalMinor,
  ).toBe(0);
  const charges = await administrationCharges(env, a, period(charged), 100);
  expect(charges.total).toBe(5);
  expect(charges.items.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(
    314,
  );
  expect(charges.items.some((item) => item.amountMinor === 0)).toBe(true);
  expect(JSON.stringify({ report, charges })).not.toMatch(
    /private-recipient|sensitive@example|Private subject|Private message|Private distribution|supplier|private-token/,
  );
  expect(
    (
      await administrationConsumption(
        env,
        await administrationAuthority(env, beta.ctx, "reports"),
        period(charged),
      )
    ).totalMinor,
  ).toBe(100);
});

it("keeps dispatch-created activity separate from the posted-date ledger", async () => {
  const a = await administrationAuthority(env, alpha.ctx, "reports");
  const old = await administrationActivity(env, a, period(created));
  expect(old.items.find((item) => item.id === chargedDispatch)).toMatchObject({
    consumptionMinor: 4,
    reservedMinor: 0,
  });
  expect(
    (await administrationOverview(env, a, period(created))).totals,
  ).toMatchObject({ dispatches: 3, consumptionMinor: 4, reservedMinor: 100 });
  expect(
    (await administrationOverview(env, a, period(charged))).totals.dispatches,
  ).toBe(2);
  expect(
    (await administrationActivity(env, a, period(charged))).items,
  ).toHaveLength(2);
});
