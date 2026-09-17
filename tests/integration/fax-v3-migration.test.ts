import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let mf: Miniflare, db: D1Database;
let sequence = 0;
const now = "2026-09-17T12:00:00.000Z";
const later = "2026-09-17T12:30:00.000Z";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Row = Record<string, string | number | null>;
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
async function insert(table: string, row: Row) {
  const columns = Object.keys(row);
  return db
    .prepare(
      `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
    )
    .bind(...Object.values(row))
    .run();
}
async function scope() {
  const org = `migration_org_${++sequence}`;
  await insert("organizations", {
    id: org,
    name: "Isolated fixture",
    mode: "production",
    created_at: now,
  });
  await insert("users", {
    id: `${org}_user`,
    name: "Fixture",
    email: `${org}@example.invalid`,
    created_at: now,
  });
  await insert("memberships", {
    organization_id: org,
    user_id: `${org}_user`,
    role: "admin",
    created_at: now,
  });
  await insert("senders", {
    id: `${org}_sender`,
    organization_id: org,
    channel: "fax",
    name: "Fixture",
    address: "+352000000000",
    status: "verified",
    mode: "production",
    created_at: now,
  });
  await insert("documents", {
    id: `${org}_doc`,
    organization_id: org,
    name: "Synthetic.pdf",
    sha256: "a".repeat(64),
    size: 100,
    pages: 2,
    status: "ready",
    source: "import",
    storage_key: "isolated/fixture.pdf",
    created_at: now,
  });
  await insert("audit_log", {
    id: `${org}_scan`,
    organization_id: org,
    action: "document.scan_verified",
    resource_id: "a".repeat(64),
    details_json: "{}",
    created_at: now,
  });
  await insert("channel_controls", {
    organization_id: org,
    channel: "fax",
    enabled: 1,
  });
  await insert("usage", {
    organization_id: org,
    channel: "fax",
    period: "2026-09",
    limit_count: 100,
    limit_minor: 5000,
    currency: "EUR",
  });
  return org;
}
function tariff(org: string, overrides: Row = {}): Row {
  return {
    id: `${org}_tariff`,
    organization_id: org,
    sender_id: `${org}_sender`,
    provider: "telnyx",
    account_id: "isolated-account",
    connection_id: "isolated-app",
    outbound_profile_id: "isolated-profile",
    sender_prefix: "+352",
    destination_prefix: "+33",
    sender_country_code: "LU",
    destination_country_code: "FR",
    origin_class: "eea",
    destination_category: "fixed",
    route_allowed: 1,
    local_calling_verified: 0,
    options_json: "{}",
    currency: "USD",
    page_nano_usd: 1000000,
    minute_nano_usd: 3000000,
    call_nano_usd: 1000000,
    initial_seconds: 60,
    increment_seconds: 60,
    duration_base_seconds: 0,
    duration_low_per_page_seconds: 30,
    duration_high_per_page_seconds: 120,
    fx_numerator: 1,
    fx_denominator: 1,
    fx_date: "2026-09-17",
    fx_source: "ISOLATED FIXTURE",
    max_pages: 10,
    quote_ttl_seconds: 300,
    source_reference: "ISOLATED FIXTURE - NOT A REAL RATE",
    source_sha256: "b".repeat(64),
    valid_from: now,
    expires_at: later,
    status: "qualified",
    created_at: now,
    ...overrides,
  };
}
async function prepared(org: string, legacy = false) {
  const id = `${org}_dispatch_${++sequence}`;
  const frozen = {
    channel: "fax",
    recipient: JSON.stringify({ phone: "+33100000000" }),
    documentId: `${org}_doc`,
    documentSha256: "a".repeat(64),
    senderId: `${org}_sender`,
    senderAddress: "+352000000000",
    subject: null,
    html: null,
    text: null,
    options: "{}",
    campaignId: null,
    estimatedMinor: legacy ? 100 : 3,
    ceilingMinor: legacy ? 120 : 10,
    currency: "EUR",
    mode: "production",
  };
  const fingerprint = hash({ id, frozen }),
    quoteFingerprint = hash({ quote: id });
  await insert("dispatches", {
    id,
    organization_id: org,
    channel: "fax",
    recipient_json: frozen.recipient,
    document_id: frozen.documentId,
    sender_id: frozen.senderId,
    sender_address: frozen.senderAddress,
    options_json: "{}",
    status: "prepared",
    mode: "production",
    estimated_minor: frozen.estimatedMinor,
    ceiling_minor: frozen.ceilingMinor,
    currency: "EUR",
    fingerprint,
    prepare_key: id,
    request_hash: hash(id),
    quote_fingerprint: quoteFingerprint,
    created_at: now,
    updated_at: now,
  });
  const common = {
    dispatch_id: id,
    organization_id: org,
    tariff_id: `${org}_tariff`,
    fingerprint: quoteFingerprint,
    dispatch_fingerprint: fingerprint,
    input_json: JSON.stringify(frozen),
    input_fingerprint: hash(frozen),
    account_id: "isolated-account",
    connection_id: "isolated-app",
    amount_minor: frozen.estimatedMinor,
    ceiling_minor: frozen.ceilingMinor,
    currency: "EUR",
    source_reference: "ISOLATED FIXTURE - NOT A REAL RATE",
    source_sha256: "b".repeat(64),
    created_at: now,
    expires_at: "2026-09-17T12:05:00.000Z",
  };
  if (legacy)
    await insert("live_fax_quotes_v2", {
      ...common,
      pricing_version: 2,
      price_rule: "supplier_total_x2",
      supplier_amount_minor: 50,
      supplier_currency: "EUR",
      cost_basis: "guaranteed_final_supplier_total",
      fiscal_basis: "tax_inclusive_totals",
      currency_basis: "same_currency_no_fx",
    });
  else
    await insert("live_fax_quotes_v3", {
      ...common,
      outbound_profile_id: "isolated-profile",
      pricing_version: 3,
      price_rule: "usage_x2_customer_cap",
      fiscal_basis: "qualified_usage_ex_tax",
      estimated_low_nanoeur: 12000000,
      estimated_high_nanoeur: 30000000,
      fx_numerator: 1,
      fx_denominator: 1,
      fx_date: "2026-09-17",
      fx_source: "ISOLATED FIXTURE",
    });
  return { org, id, fingerprint, quoteFingerprint };
}
type Dispatch = Awaited<ReturnType<typeof prepared>>;
async function queued(d: Dispatch) {
  await insert("approvals", {
    id: `${d.id}_approval`,
    organization_id: d.org,
    dispatch_id: d.id,
    user_id: `${d.org}_user`,
    fingerprint: d.fingerprint,
    expires_at: "2026-09-17T12:05:00.000Z",
    created_at: now,
  });
  await db
    .prepare("UPDATE dispatches SET status='queued' WHERE id=?")
    .bind(d.id)
    .run();
}
async function attempted(d: Dispatch, status = "accepted") {
  await db
    .prepare(
      "UPDATE dispatches SET status='submitting',provider='telnyx',active_attempt_id=? WHERE id=?",
    )
    .bind(`${d.id}_attempt`, d.id)
    .run();
  await insert("attempts", {
    id: `${d.id}_attempt`,
    dispatch_id: d.id,
    organization_id: d.org,
    provider: "telnyx",
    provider_id: `${d.id}_provider`,
    status: "started",
    bridge_claimed_at: now,
    created_at: now,
    updated_at: now,
  });
  await db
    .prepare("UPDATE dispatches SET status=?,provider_id=? WHERE id=?")
    .bind(status, `${d.id}_provider`, d.id)
    .run();
  await db
    .prepare("UPDATE attempts SET status=? WHERE id=?")
    .bind(
      status === "submission_unknown" ? "unknown" : "accepted",
      `${d.id}_attempt`,
    )
    .run();
}
async function fixture() {
  const org = await scope();
  await insert("trusted_fax_usage_tariffs", tariff(org));
  const d = await prepared(org);
  await queued(d);
  return d;
}
function proof(d: Dispatch, supplier = 1250000, overrides: Row = {}): Row {
  const customer = Math.min(supplier * 2, 100000000);
  return {
    organization_id: d.org,
    dispatch_id: d.id,
    attempt_id: `${d.id}_attempt`,
    provider: "telnyx",
    provider_id: `${d.id}_provider`,
    account_id: "isolated-account",
    connection_id: "isolated-app",
    quote_fingerprint: d.quoteFingerprint,
    proof_source: "operator_reconciled_usage",
    reviewer_id: `${d.org}_user`,
    observed_at: "2026-09-17T12:01:00.000Z",
    evidence_reference: `ISOLATED USAGE ${d.id}`,
    evidence_sha256: hash({ usage: d.id }),
    proof_fingerprint: hash({ d: d.id, supplier }),
    supplier_nano_usd: supplier,
    supplier_nanoeur: supplier,
    customer_nanoeur: customer,
    guteneo_absorbed_nanoeur: Math.max(0, supplier - customer),
    created_at: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}
async function balance(d: Dispatch) {
  return db
    .prepare(
      "SELECT reserved_minor,spent_minor,available_minor FROM welcome_credit_balances WHERE organization_id=?",
    )
    .bind(d.org)
    .first();
}
async function monthly(d: Dispatch) {
  return db
    .prepare(
      "SELECT reserved_count,confirmed_count,reserved_minor,confirmed_minor FROM usage WHERE organization_id=? AND period='2026-09'",
    )
    .bind(d.org)
    .first();
}
let legacy: Dispatch, before: unknown;
async function legacySnapshot() {
  return {
    quote: await db
      .prepare("SELECT * FROM live_fax_quotes_v2 WHERE dispatch_id=?")
      .bind(legacy.id)
      .first(),
    credit: await balance(legacy),
    monthly: await monthly(legacy),
    entries: (
      await db
        .prepare(
          "SELECT * FROM welcome_credit_entries WHERE organization_id=? ORDER BY kind",
        )
        .bind(legacy.org)
        .all()
    ).results,
  };
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
  for (const name of readdirSync(dir)
    .filter((name) => name.endsWith(".sql") && name < "0023_")
    .sort())
    await sql(readFileSync(new URL(name, dir), "utf8"));
  const org = await scope();
  await insert("trusted_fax_supplier_costs", {
    id: `${org}_tariff`,
    organization_id: org,
    sender_id: `${org}_sender`,
    provider: "telnyx",
    account_id: "isolated-account",
    connection_id: "isolated-app",
    destination_prefix: "+33",
    options_json: "{}",
    currency: "EUR",
    supplier_base_numerator: 10,
    supplier_per_page_numerator: 20,
    supplier_denominator: 1,
    max_pages: 10,
    quote_ttl_seconds: 300,
    cost_basis: "guaranteed_final_supplier_total",
    fiscal_basis: "tax_inclusive_totals",
    currency_basis: "same_currency_no_fx",
    source_reference: "ISOLATED FIXTURE - NOT A REAL RATE",
    source_sha256: "b".repeat(64),
    valid_from: now,
    expires_at: later,
    status: "qualified",
    created_at: now,
  });
  legacy = await prepared(org, true);
  await queued(legacy);
  await attempted(legacy);
  before = await legacySnapshot();
  await sql(readFileSync(new URL("0023_fax_usage_pricing.sql", dir), "utf8"));
});
afterAll(async () => {
  await mf?.dispose();
});

describe("Fax v3 migration and financial SQL fences — isolated D1", () => {
  it("preserves populated v2 quotes, fingerprints, charges and original quota semantics", async () => {
    expect(await legacySnapshot()).toEqual(before);
    const d = await prepared(legacy.org, true);
    await queued(d);
    await attempted(d);
    expect(await balance(d)).toEqual({
      reserved_minor: 0,
      spent_minor: 200,
      available_minor: 4800,
    });
    expect(await monthly(d)).toMatchObject({ confirmed_minor: 240 });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    expect(await db.prepare("PRAGMA quick_check").first()).toEqual({
      quick_check: "ok",
    });
  });
  it("retains both holds through acceptance, unknown/failure and late positive acceptance", async () => {
    const d = await fixture();
    await attempted(d, "submission_unknown");
    await db
      .prepare("UPDATE dispatches SET status='failed' WHERE id=?")
      .bind(d.id)
      .run();
    await db
      .prepare("UPDATE attempts SET status='accepted' WHERE id=?")
      .bind(`${d.id}_attempt`)
      .run();
    await insert("provider_events", {
      id: `${d.id}_event`,
      provider: "telnyx",
      provider_event_id: `${d.id}_event`,
      provider_id: `${d.id}_provider`,
      dispatch_id: d.id,
      organization_id: d.org,
      kind: "accepted",
      payload_json: "{}",
      occurred_at: now,
      received_at: now,
    });
    await db
      .prepare("UPDATE provider_events SET applied_at=? WHERE id=?")
      .bind(now, `${d.id}_event`)
      .run();
    expect(await balance(d)).toEqual({
      reserved_minor: 10,
      spent_minor: 0,
      available_minor: 4990,
    });
    expect(await monthly(d)).toEqual({
      reserved_count: 1,
      confirmed_count: 0,
      reserved_minor: 10,
      confirmed_minor: 0,
    });
    await expect(
      db
        .prepare(
          "UPDATE welcome_credit_reservations SET status='settled' WHERE dispatch_id=?",
        )
        .bind(d.id)
        .run(),
    ).rejects.toThrow("credit_settlement_invalid");
  });
  it("settles verified failed usage at frozen FX after expiry/revocation and keeps the original quota month", async () => {
    const d = await fixture();
    await attempted(d, "failed");
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=?",
      )
      .bind(d.org)
      .run();
    await db
      .prepare("UPDATE senders SET status='disabled' WHERE organization_id=?")
      .bind(d.org)
      .run();
    await insert("usage", {
      organization_id: d.org,
      channel: "fax",
      period: "2026-10",
      limit_count: 100,
      limit_minor: 5000,
      currency: "EUR",
    });
    await insert("fax_usage_settlements", proof(d));
    expect(await balance(d)).toEqual({
      reserved_minor: 0,
      spent_minor: 1,
      available_minor: 4999,
    });
    expect(await monthly(d)).toEqual({
      reserved_count: 0,
      confirmed_count: 1,
      reserved_minor: 0,
      confirmed_minor: 1,
    });
    expect(
      await db
        .prepare(
          "SELECT confirmed_minor FROM usage WHERE organization_id=? AND period='2026-10'",
        )
        .bind(d.org)
        .first(),
    ).toEqual({ confirmed_minor: 0 });
    await expect(insert("fax_usage_settlements", proof(d))).rejects.toThrow();
    await expect(
      db
        .prepare(
          "UPDATE fax_usage_settlements SET supplier_nanoeur=0 WHERE dispatch_id=?",
        )
        .bind(d.id)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_settlement");
  });
  it("accumulates fractional charges once and never debits above the firm cap", async () => {
    const d = await fixture();
    const second = await prepared(d.org);
    await queued(second);
    for (const item of [d, second]) {
      await attempted(item, "delivered");
      await insert("fax_usage_settlements", proof(item));
    }
    expect(await balance(d)).toEqual({
      reserved_minor: 0,
      spent_minor: 1,
      available_minor: 4999,
    });
    expect(
      (
        await db
          .prepare(
            "SELECT charged_minor FROM delivery_charge_entries WHERE organization_id=? ORDER BY charged_minor DESC",
          )
          .bind(d.org)
          .all()
      ).results,
    ).toEqual([{ charged_minor: 1 }, { charged_minor: 0 }]);
    const capped = await prepared(d.org);
    await queued(capped);
    await attempted(capped, "delivered");
    await insert("fax_usage_settlements", proof(capped, 150000000));
    expect(
      await db
        .prepare(
          "SELECT customer_nanoeur,guteneo_absorbed_nanoeur FROM fax_usage_settlements WHERE dispatch_id=?",
        )
        .bind(capped.id)
        .first(),
    ).toEqual({
      customer_nanoeur: 100000000,
      guteneo_absorbed_nanoeur: 50000000,
    });
    expect(await balance(d)).toEqual({
      reserved_minor: 0,
      spent_minor: 11,
      available_minor: 4989,
    });
  });
  it("rejects unbound, unverified and arithmetically invalid proofs atomically", async () => {
    const d = await fixture();
    await attempted(d, "accepted");
    await expect(insert("fax_usage_settlements", proof(d))).rejects.toThrow(
      "fax_usage_settlement_invalid",
    );
    await db
      .prepare("UPDATE dispatches SET status='delivered' WHERE id=?")
      .bind(d.id)
      .run();
    const other = await scope();
    const invalidProofs: Row[] = [
      { organization_id: other },
      { account_id: "different" },
      { connection_id: "different" },
      { attempt_id: "different" },
      { provider_id: "different" },
      { reviewer_id: `${other}_user` },
      { supplier_nanoeur: 0 },
      { customer_nanoeur: 0 },
      { quote_fingerprint: "c".repeat(64) },
    ];
    for (const override of invalidProofs)
      await expect(
        insert("fax_usage_settlements", proof(d, 1250000, override)),
      ).rejects.toThrow("fax_usage_settlement_invalid");
    expect(await balance(d)).toEqual({
      reserved_minor: 10,
      spent_minor: 0,
      available_minor: 4990,
    });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM fax_usage_settlements WHERE dispatch_id=?",
        )
        .bind(d.id)
        .first(),
    ).toEqual({ n: 0 });
    await insert("fax_usage_settlements", proof(d, 0));
    expect(await balance(d)).toEqual({
      reserved_minor: 0,
      spent_minor: 0,
      available_minor: 5000,
    });
  });
  it("releases both holds only for a queued cancellation or a definitive rejected attempt", async () => {
    const cancelled = await fixture();
    await db
      .prepare("UPDATE dispatches SET status='cancelled' WHERE id=?")
      .bind(cancelled.id)
      .run();
    expect(await balance(cancelled)).toEqual({
      reserved_minor: 0,
      spent_minor: 0,
      available_minor: 5000,
    });
    expect(await monthly(cancelled)).toMatchObject({
      reserved_count: 0,
      reserved_minor: 0,
    });
    const rejected = await fixture();
    await db
      .prepare(
        "UPDATE dispatches SET status='submitting',provider='telnyx',active_attempt_id=? WHERE id=?",
      )
      .bind(`${rejected.id}_attempt`, rejected.id)
      .run();
    await insert("attempts", {
      id: `${rejected.id}_attempt`,
      dispatch_id: rejected.id,
      organization_id: rejected.org,
      provider: "telnyx",
      status: "started",
      created_at: now,
      updated_at: now,
    });
    await db
      .prepare("UPDATE dispatches SET status='failed' WHERE id=?")
      .bind(rejected.id)
      .run();
    expect(await balance(rejected)).toMatchObject({ reserved_minor: 10 });
    await db
      .prepare("UPDATE attempts SET status='rejected' WHERE id=?")
      .bind(`${rejected.id}_attempt`)
      .run();
    expect(await balance(rejected)).toEqual({
      reserved_minor: 0,
      spent_minor: 0,
      available_minor: 5000,
    });
    expect(await monthly(rejected)).toMatchObject({
      reserved_count: 0,
      reserved_minor: 0,
    });
  });
  it("treats more-specific denied or future routes as fences and rejects mutable policies", async () => {
    const unquoted = await scope();
    await insert("trusted_fax_usage_tariffs", tariff(unquoted));
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=?",
      )
      .bind(unquoted)
      .run();
    await expect(
      db
        .prepare(
          "DELETE FROM trusted_fax_usage_tariffs WHERE organization_id=?",
        )
        .bind(unquoted)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    const d = await fixture();
    await expect(
      db
        .prepare(
          "UPDATE trusted_fax_usage_tariffs SET fx_numerator=2 WHERE organization_id=?",
        )
        .bind(d.org)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    await insert(
      "trusted_fax_usage_tariffs",
      tariff(d.org, {
        id: `${d.org}_deny`,
        destination_prefix: "+331",
        destination_category: "special",
        route_allowed: 0,
        valid_from: "2026-10-01T00:00:00.000Z",
        expires_at: "2026-11-01T00:00:00.000Z",
      }),
    );
    await expect(
      db
        .prepare(
          "UPDATE dispatches SET status='submitting',provider='telnyx',active_attempt_id='forbidden' WHERE id=?",
        )
        .bind(d.id)
        .run(),
    ).rejects.toThrow("live_quote_invalid");
    expect(await balance(d)).toMatchObject({ reserved_minor: 10 });
    await expect(
      db
        .prepare("DELETE FROM live_fax_quotes_v3 WHERE dispatch_id=?")
        .bind(d.id)
        .run(),
    ).rejects.toThrow("immutable_live_fax_quote");
  });
  it("requires canonical scan evidence, coherent country prefixes and a claimed provider invocation", async () => {
    const d = await fixture();
    await db
      .prepare(
        "DELETE FROM audit_log WHERE organization_id=? AND action='document.scan_verified'",
      )
      .bind(d.org)
      .run();
    await expect(
      db
        .prepare(
          "UPDATE dispatches SET status='submitting',provider='telnyx' WHERE id=?",
        )
        .bind(d.id)
        .run(),
    ).rejects.toThrow("live_quote_invalid");
    await insert("audit_log", {
      id: `${d.org}_replacement_scan`,
      organization_id: d.org,
      action: "document.scan_verified",
      resource_id: "a".repeat(64),
      details_json: "{}",
      created_at: now,
    });
    const invalidTariffs: Row[] = [
      { sender_prefix: "+33" },
      { destination_country_code: "LU" },
      { origin_class: "local" },
      { destination_category: "special" },
      { route_allowed: 2 },
      { fx_date: "2026-02-30" },
      { fx_date: "2026-09-18" },
      { valid_from: "not-a-date" },
      { valid_from: "2026-02-30T00:00:00.000Z" },
      { expires_at: "2026-09-17T12:30:00Z" },
      { created_at: "2026-09-17T12:00:00+00:00" },
    ];
    for (const override of invalidTariffs) {
      await expect(
        insert(
          "trusted_fax_usage_tariffs",
          tariff(d.org, {
            id: `${d.org}_invalid_${hash(override)}`,
            ...override,
          }),
        ),
      ).rejects.toThrow("CHECK constraint failed");
    }
    await attempted(d, "delivered");
    await db
      .prepare("UPDATE attempts SET bridge_claimed_at=NULL WHERE id=?")
      .bind(`${d.id}_attempt`)
      .run();
    await expect(insert("fax_usage_settlements", proof(d))).rejects.toThrow(
      "fax_usage_settlement_invalid",
    );
    expect(await balance(d)).toMatchObject({
      reserved_minor: 10,
      spent_minor: 0,
    });
    await db
      .prepare("UPDATE attempts SET bridge_claimed_at=? WHERE id=?")
      .bind(now, `${d.id}_attempt`)
      .run();
    await insert("fax_usage_settlements", proof(d));
    expect(await balance(d)).toMatchObject({
      reserved_minor: 0,
      spent_minor: 1,
    });
  });
  it("retains the final usage proof and shared fractional debit after historical dispatch deletion", async () => {
    const d = await fixture();
    await attempted(d, "delivered");
    await insert("fax_usage_settlements", proof(d));
    await expect(
      db
        .prepare("DELETE FROM fax_usage_settlements WHERE dispatch_id=?")
        .bind(d.id)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_settlement");
    for (const table of ["attempts", "outbox", "reservations", "approvals"])
      await db
        .prepare(`DELETE FROM ${table} WHERE dispatch_id=?`)
        .bind(d.id)
        .run();
    await db.prepare("DELETE FROM dispatches WHERE id=?").bind(d.id).run();
    expect(await balance(d)).toEqual({
      reserved_minor: 0,
      spent_minor: 1,
      available_minor: 4999,
    });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM fax_usage_settlements WHERE dispatch_id=?",
        )
        .bind(d.id)
        .first(),
    ).toEqual({ n: 1 });
    const next = await prepared(d.org);
    await queued(next);
    await attempted(next, "delivered");
    await insert("fax_usage_settlements", proof(next));
    expect(await balance(next)).toEqual({
      reserved_minor: 0,
      spent_minor: 1,
      available_minor: 4999,
    });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
});
