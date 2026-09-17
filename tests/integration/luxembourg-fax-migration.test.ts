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
function statements(source: string): string[] {
  const result: string[] = [];
  let statement = "",
    trigger = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += line + " ";
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      result.push(statement);
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw Error("Incomplete SQL");
  return result;
}
async function sql(source: string) {
  return db.batch(statements(source).map((statement) => db.prepare(statement)));
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
  const org = `lu_migration_org_${++sequence}`;
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
async function prepared(
  org: string,
  ceilingMinor = 10,
  phone = "+33100000000",
) {
  const id = `${org}_dispatch_${++sequence}`;
  const frozen = {
    channel: "fax",
    recipient: JSON.stringify({ phone }),
    documentId: `${org}_doc`,
    documentSha256: "a".repeat(64),
    senderId: `${org}_sender`,
    senderAddress: "+352000000000",
    subject: null,
    html: null,
    text: null,
    options: "{}",
    campaignId: null,
    estimatedMinor: 3,
    ceilingMinor,
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

let legacy: Dispatch;
let before: Record<string, unknown>, rollback: Record<string, unknown>;
let beforeSchema: unknown, rollbackSchema: unknown;
let migrationSql: string;
async function snapshot() {
  const result: Record<string, unknown> = {};
  for (const table of [
    "trusted_fax_usage_tariffs",
    "live_fax_quotes_v3",
    "dispatches",
    "approvals",
    "reservations",
    "outbox",
    "usage",
    "welcome_credit_reservations",
    "welcome_credit_entries",
  ])
    result[table] = (
      await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
    ).results;
  return result;
}
async function schema() {
  return (
    await db
      .prepare(
        "SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
  ).results;
}
function operatorTariff(org: string, overrides: Row = {}): Row {
  return tariff(org, {
    destination_prefix: "+3524",
    destination_country_code: "LU",
    origin_class: "local",
    local_calling_verified: 0,
    route_qualification: "operator_test",
    operator_authorization_reference:
      "ISOLATED OPERATOR AUTHORIZATION - NO REAL SEND",
    operator_test_ceiling_minor: 200,
    ...overrides,
  });
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
    .filter((name) => name.endsWith(".sql") && name < "0025_")
    .sort())
    await sql(readFileSync(new URL(name, dir), "utf8"));
  const org = await scope();
  await insert("trusted_fax_usage_tariffs", tariff(org));
  await insert(
    "trusted_fax_usage_tariffs",
    tariff(org, { id: `${org}_revoked`, status: "revoked" }),
  );
  legacy = await prepared(org);
  await queued(legacy);
  before = await snapshot();
  beforeSchema = await schema();
  migrationSql = readFileSync(
    new URL("0025_luxembourg_operator_fax_test.sql", dir),
    "utf8",
  );
  // Inject a failure after the destructive/reconstructive work to verify the entire
  // migration rolls back, including dependent quotes and the original constraints.
  await expect(
    sql(
      migrationSql +
        `\nINSERT INTO organizations(id,name,mode,created_at) VALUES('${org}','Synthetic rollback probe','production','${now}');\n`,
    ),
  ).rejects.toThrow("UNIQUE constraint failed");
  rollback = await snapshot();
  rollbackSchema = await schema();
  await sql(migrationSql);
});
afterAll(async () => {
  await mf?.dispose();
});

describe("Luxembourg operator fax test migration — isolated D1", () => {
  it("rolls back a failed batch, then preserves populated tariffs, quotes, approvals and financial holds", async () => {
    expect(rollback).toEqual(before);
    expect(rollbackSchema).toEqual(beforeSchema);
    const after = await snapshot();
    const rows = after.trusted_fax_usage_tariffs as Row[];
    expect(
      rows.every(
        (row) =>
          row.route_qualification === "provider_verified" &&
          row.operator_authorization_reference === null &&
          row.operator_test_ceiling_minor === null,
      ),
    ).toBe(true);
    after.trusted_fax_usage_tariffs = rows.map(
      ({
        route_qualification,
        operator_authorization_reference,
        operator_test_ceiling_minor,
        ...old
      }) => {
        void route_qualification;
        void operator_authorization_reference;
        void operator_test_ceiling_minor;
        return old;
      },
    );
    expect(after).toEqual(before);
    expect(
      await db
        .prepare(
          "SELECT dispatch_id FROM valid_live_fax_quotes_v3 WHERE dispatch_id=?",
        )
        .bind(legacy.id)
        .first(),
    ).toEqual({ dispatch_id: legacy.id });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    expect(await db.prepare("PRAGMA quick_check").first()).toEqual({
      quick_check: "ok",
    });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM sqlite_schema WHERE name='fax_tariff_migration_backup'",
        )
        .first(),
    ).toEqual({ n: 0 });
    expect(
      (await db.prepare("PRAGMA foreign_key_list(live_fax_quotes_v3)").all())
        .results,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "trusted_fax_usage_tariffs",
          from: "tariff_id",
          to: "id",
          on_delete: "NO ACTION",
        }),
      ]),
    );
    await expect(
      db
        .prepare(
          "UPDATE trusted_fax_usage_tariffs SET minute_nano_usd=1 WHERE id=?",
        )
        .bind(`${legacy.org}_tariff`)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    await expect(
      db
        .prepare(
          "UPDATE live_fax_quotes_v3 SET amount_minor=1 WHERE dispatch_id=?",
        )
        .bind(legacy.id)
        .run(),
    ).rejects.toThrow("immutable_live_fax_quote");
    await expect(
      db
        .prepare("DELETE FROM trusted_fax_usage_tariffs WHERE id=?")
        .bind(`${legacy.org}_revoked`)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
  });
  it("admits an explicitly bounded LU test without claiming Local Calling verification", async () => {
    const org = await scope();
    await insert("trusted_fax_usage_tariffs", operatorTariff(org));
    const d = await prepared(org, 200, "+352400000000");
    await queued(d);
    expect(
      await db
        .prepare(
          "SELECT local_calling_verified,route_qualification,operator_test_ceiling_minor FROM trusted_fax_usage_tariffs WHERE id=?",
        )
        .bind(`${org}_tariff`)
        .first(),
    ).toEqual({
      local_calling_verified: 0,
      route_qualification: "operator_test",
      operator_test_ceiling_minor: 200,
    });
    await expect(prepared(org, 201, "+352400000000")).rejects.toThrow(
      "live_quote_invalid",
    );
    await expect(prepared(org, 200, "+352500000000")).rejects.toThrow(
      "live_quote_invalid",
    );
    await expect(
      db
        .prepare(
          "UPDATE trusted_fax_usage_tariffs SET operator_test_ceiling_minor=199 WHERE id=?",
        )
        .bind(`${org}_tariff`)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    await expect(
      db
        .prepare(
          "UPDATE trusted_fax_usage_tariffs SET operator_authorization_reference='changed' WHERE id=?",
        )
        .bind(`${org}_tariff`)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    await expect(
      db
        .prepare(
          "UPDATE trusted_fax_usage_tariffs SET route_qualification='provider_verified' WHERE id=?",
        )
        .bind(`${org}_tariff`)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE id=?",
      )
      .bind(`${org}_tariff`)
      .run();
    await expect(
      db
        .prepare(
          "UPDATE dispatches SET status='submitting',provider='telnyx',active_attempt_id='synthetic' WHERE id=?",
        )
        .bind(d.id)
        .run(),
    ).rejects.toThrow("live_quote_invalid");
  });
  it("rejects missing authority, expanded routes, false provider proof and weakened bounds in SQL", async () => {
    const org = await scope();
    const invalid: Row[] = [
      { operator_authorization_reference: null },
      { operator_authorization_reference: "" },
      { operator_test_ceiling_minor: null },
      { operator_test_ceiling_minor: 0 },
      { operator_test_ceiling_minor: 201 },
      { destination_prefix: "+352" },
      { destination_prefix: "+3525" },
      { destination_category: "special" },
      { destination_country_code: "FR", destination_prefix: "+331" },
      { local_calling_verified: 1 },
      { origin_class: "eea" },
      { max_pages: 11 },
      { expires_at: "2026-09-24T12:00:00.001Z" },
      { expires_at: "2026-09-24T09:00:01.621Z" },
      {
        valid_from: "2026-09-30T09:00:00.000Z",
        expires_at: "2026-10-01T09:00:00.000Z",
      },
      { route_qualification: "provider_verified" },
    ];
    for (const [index, override] of invalid.entries())
      await expect(
        insert(
          "trusted_fax_usage_tariffs",
          operatorTariff(org, {
            id: `${org}_invalid_${index}`,
            status: "revoked",
            ...override,
          }),
        ),
      ).rejects.toThrow("CHECK constraint failed");
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
});
