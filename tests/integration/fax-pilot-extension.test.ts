import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { quickCheckTables } from "../../scripts/d1-integrity.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  faxUsageEstimate,
  makeFaxUsageQuote,
  type FaxUsageTariff,
} from "../../packages/domain/src/live-fax-usage";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";

const migrationName = "0064_luxembourg_fax_pilot_extension.sql";
const oldDeadline = "2026-09-24T09:00:01.620Z";
const deadline = "2026-11-03T23:59:59.999Z";
const renewedAt = "2026-10-27T12:00:00.000Z";
const phone = "+35240000000"; // Synthetic fixture; never submitted to a provider.
let mf: Miniflare, db: D1Database;
let before: Record<string, unknown>, rollback: Record<string, unknown>;
let beforeSchema: unknown[], rollbackSchema: unknown[];
let migrated: Record<string, unknown>, migratedSchema: unknown[];
let old: Awaited<ReturnType<typeof createFaxUsageFixture>>;
let oldDispatchId: string;
const tables = [
  "trusted_fax_usage_tariffs",
  "fax_review_preparation_authorities",
  "live_fax_quotes_v3",
  "dispatches",
  "approvals",
  "attempts",
  "reservations",
  "outbox",
  "usage",
  "welcome_credit_grants",
  "welcome_credit_reservations",
  "welcome_credit_entries",
  "fax_usage_settlements",
];
const operator: Partial<FaxUsageTariff> = {
  destination_prefix: "+3524",
  destination_country_code: "LU",
  origin_class: "local",
  destination_category: "fixed",
  route_qualification: "operator_test",
  operator_authorization_reference: "SYNTHETIC OPERATOR AUTHORITY - NO SEND",
  operator_test_ceiling_minor: 200,
  local_calling_verified: 0,
  execution_scope: "live",
  review_authority_id: null,
  evidence_observed_at: null,
};
async function sql(source: string) {
  return db.batch(unstable_splitSqlQuery(source).map((s) => db.prepare(s)));
}
async function snapshot() {
  const rows: Record<string, unknown> = {};
  for (const table of tables)
    rows[table] = (
      await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
    ).results;
  return rows;
}
async function schema() {
  const result = await db
    .prepare(
      "SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all<{ type: string; name: string; sql: string | null }>();
  return result.results.map((row) => ({
    ...row,
    sql: row.sql?.replace(/\s+/g, " ").trim() ?? null,
  }));
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
  const directory = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith(".sql") && name < migrationName)
    .sort())
    await sql(readFileSync(new URL(name, directory), "utf8"));

  old = await createFaxUsageFixture(
    db,
    () => Date.parse("2026-09-23T12:00:00.000Z"),
    { ...operator, expires_at: oldDeadline },
    1,
  );
  const dispatch = await old.domain.prepareDispatch(
    old.ctx,
    { ...old.input, recipient: { phone }, ceilingMinor: 200 },
    "historical-live-quote",
  );
  oldDispatchId = dispatch.id;
  await old.domain.approveDispatch(old.ctx, dispatch.id, dispatch.fingerprint);
  await old.domain.confirmDispatch(old.ctx, dispatch.id, "historical-hold");

  // A retained review quote can legitimately reference a subsequently revoked
  // authority. Restoring rows must not re-run the new-insertion authority guard.
  const reviewAt = "2026-10-01T12:00:00.000Z";
  const review = await createFaxUsageFixture(db, () => Date.parse(reviewAt));
  await db
    .prepare(
      "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='fax'",
    )
    .bind(review.ctx.organizationId)
    .run();
  const authorityId = crypto.randomUUID();
  await insertRecord(db, "fax_review_preparation_authorities", {
    id: authorityId,
    organization_id: review.ctx.organizationId,
    sender_id: review.tariff.sender_id,
    account_id: review.tariff.account_id,
    connection_id: review.tariff.connection_id,
    outbound_profile_id: review.tariff.outbound_profile_id,
    recipient_phone: phone,
    valid_from: reviewAt,
    expires_at: "2026-10-21T12:00:00.000Z",
    status: "active",
    authorization_reference: "SYNTHETIC REVIEW AUTHORITY - NO SEND",
    source_sha256: "c".repeat(64),
    created_at: reviewAt,
  });
  await insertRecord(db, "trusted_fax_usage_tariffs", {
    ...review.tariff,
    ...operator,
    id: crypto.randomUUID(),
    execution_scope: "review_prepare_only",
    review_authority_id: authorityId,
    evidence_observed_at: reviewAt,
    max_pages: 7,
    expires_at: "2026-10-08T12:00:00.000Z",
  });
  await review.domain.prepareDispatch(
    review.ctx,
    { ...review.input, recipient: { phone }, ceilingMinor: 200 },
    "historical-review-quote",
  );
  await db
    .prepare(
      "UPDATE fax_review_preparation_authorities SET status='revoked' WHERE organization_id=? AND id=?",
    )
    .bind(review.ctx.organizationId, authorityId)
    .run();
  await insertRecord(db, "trusted_fax_usage_tariffs", {
    ...old.tariff,
    id: crypto.randomUUID(),
    status: "revoked",
  });

  before = await snapshot();
  beforeSchema = await schema();
  const migration = readFileSync(new URL(migrationName, directory), "utf8");
  await expect(
    sql(migration + "\nINSERT INTO organizations SELECT * FROM organizations;"),
  ).rejects.toThrow("UNIQUE constraint failed");
  rollback = await snapshot();
  rollbackSchema = await schema();
  await sql(migration);
  migrated = await snapshot();
  migratedSchema = await schema();
  // Preserve the exact 0064 upgrade proof above, then use the complete current
  // schema for every following call into the current production runtime.
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith(".sql") && name > migrationName)
    .sort())
    await sql(readFileSync(new URL(name, directory), "utf8"));
});
afterAll(async () => {
  await mf?.dispose();
});

describe("bounded +3524 pilot extension — populated isolated D1", () => {
  it("preserves historical quotes, revoked review authority and held funds atomically", async () => {
    expect((before.live_fax_quotes_v3 as unknown[]).length).toBe(2);
    expect((before.welcome_credit_reservations as unknown[]).length).toBe(1);
    expect(rollback).toEqual(before);
    expect(rollbackSchema).toEqual(beforeSchema);
    expect(migrated).toEqual(before);
    const unchanged = (rows: unknown[]) =>
      rows.filter(
        (row) => (row as { name: string }).name !== "trusted_fax_usage_tariffs",
      );
    expect(unchanged(migratedSchema)).toEqual(unchanged(beforeSchema));
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    expect(await quickCheckTables(db)).toBe("ok");
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
        .prepare("UPDATE trusted_fax_usage_tariffs SET expires_at=? WHERE id=?")
        .bind(deadline, old.tariff.id)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    await expect(
      db
        .prepare("DELETE FROM trusted_fax_usage_tariffs WHERE id=?")
        .bind(old.tariff.id)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    await expect(
      db
        .prepare(
          "UPDATE live_fax_quotes_v3 SET ceiling_minor=1 WHERE dispatch_id=?",
        )
        .bind(oldDispatchId)
        .run(),
    ).rejects.toThrow("immutable_live_fax_quote");
  });

  it("accepts a new immutable +3524 revision with unchanged prices after the old deadline", async () => {
    let clock = Date.parse("2026-09-23T12:00:00.000Z");
    const f = await createFaxUsageFixture(
      db,
      () => clock,
      { ...operator, expires_at: oldDeadline },
      1,
    );
    clock = Date.parse(renewedAt);
    const input = { ...f.input, recipient: { phone }, ceilingMinor: 200 };
    await expect(
      f.domain.prepareDispatch(f.ctx, input, "expired-tariff"),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
    const renewed: FaxUsageTariff = {
      ...f.tariff,
      id: crypto.randomUUID(),
      operator_authorization_reference: "SYNTHETIC RENEWAL AUTHORITY - NO SEND",
      valid_from: renewedAt,
      expires_at: "2026-11-03T12:00:00.000Z",
      created_at: renewedAt,
    };
    const columns = Object.keys(renewed) as (keyof FaxUsageTariff)[];
    await db.batch([
      db
        .prepare(
          "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
        )
        .bind(f.ctx.organizationId, f.tariff.id),
      db
        .prepare(
          `INSERT INTO trusted_fax_usage_tariffs(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
        )
        .bind(...columns.map((column) => renewed[column])),
    ]);
    const d = await f.domain.prepareDispatch(f.ctx, input, "renewed-tariff");
    expect(d.status).toBe("prepared");
    expect(d.estimated_minor).toBe(
      faxUsageEstimate(f.tariff, 1).customer_minor,
    );
    expect(d.faxPricing).toMatchObject({
      routeQualification: "operator_authorized_test",
    });
    expect(d.faxPricing?.executionScope).toBeUndefined();
    expect(
      await db
        .prepare("SELECT tariff_id FROM live_fax_quotes_v3 WHERE dispatch_id=?")
        .bind(d.id)
        .first(),
    ).toEqual({ tariff_id: renewed.id });
    for (const table of [
      "approvals",
      "attempts",
      "outbox",
      "reservations",
      "welcome_credit_reservations",
    ])
      expect(
        await db
          .prepare(`SELECT count(*) n FROM ${table} WHERE organization_id=?`)
          .bind(f.ctx.organizationId)
          .first(),
      ).toEqual({ n: 0 });
    await expect(
      f.domain.prepareDispatch(
        f.ctx,
        { ...input, ceilingMinor: 201 },
        "over-cap",
      ),
    ).rejects.toMatchObject({ code: "FAX_TEST_CEILING_EXCEEDED" });
    await expect(
      f.domain.prepareDispatch(
        f.ctx,
        { ...input, recipient: { phone: "+35250000000" } },
        "different-route",
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
  });

  it("allows the exact new deadline and rejects preparation at its expiry", async () => {
    let clock = Date.parse("2026-10-28T00:00:00.000Z");
    const f = await createFaxUsageFixture(
      db,
      () => clock,
      {
        ...operator,
        expires_at: deadline,
      },
      1,
    );
    clock = Date.parse(deadline) - 1;
    const input = { ...f.input, recipient: { phone }, ceilingMinor: 200 };
    const d = await f.domain.prepareDispatch(f.ctx, input, "last-millisecond");
    expect(
      await db
        .prepare(
          "SELECT expires_at FROM live_fax_quotes_v3 WHERE dispatch_id=?",
        )
        .bind(d.id)
        .first(),
    ).toEqual({ expires_at: deadline });
    clock = Date.parse(deadline);
    await expect(
      f.domain.prepareDispatch(f.ctx, input, "expired"),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
  });

  it("keeps the deadline, seven-day duration, other routes and authority limits in SQL and runtime", async () => {
    const f = await createFaxUsageFixture(db, () => Date.parse(renewedAt), {
      ...operator,
      expires_at: "2026-11-03T12:00:00.000Z",
    });
    const invalid: Partial<FaxUsageTariff>[] = [
      {
        valid_from: "2026-10-28T00:00:00.000Z",
        expires_at: "2026-11-04T00:00:00.000Z",
      },
      { expires_at: "2026-11-03T12:00:00.001Z" },
      { destination_prefix: "+3525" },
      { destination_prefix: "+3526", destination_category: "mobile" },
      { operator_test_ceiling_minor: 201 },
      { operator_authorization_reference: null },
      { local_calling_verified: 1 },
    ];
    for (const patch of invalid) {
      const t: FaxUsageTariff = {
        ...f.tariff,
        ...patch,
        id: crypto.randomUUID(),
        status: "revoked",
      };
      await expect(
        insertRecord(db, "trusted_fax_usage_tariffs", t),
      ).rejects.toThrow("CHECK constraint failed");
      const estimate = faxUsageEstimate(t, 1);
      await expect(
        makeFaxUsageQuote(
          "synthetic-invalid",
          f.ctx.organizationId,
          { estimatedMinor: estimate.customer_minor, ceilingMinor: 200 },
          { ...t, ...estimate, pricing_version: 3 },
          t.valid_from,
        ),
      ).rejects.toMatchObject({ code: "FAX_TEST_CEILING_EXCEEDED" });
    }
  });
});
