import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";

let mf: Miniflare, db: D1Database;
let before: Record<string, unknown>, rollback: Record<string, unknown>;
let beforeSchema: unknown, rollbackSchema: unknown;
let fixture: Awaited<ReturnType<typeof createFaxUsageFixture>>;
let migration: string;
const now = "2026-09-17T12:00:00.000Z";
const tables = [
  "trusted_fax_usage_tariffs",
  "trusted_fax_tariffs",
  "trusted_fax_supplier_costs",
  "live_fax_quotes",
  "live_fax_quotes_v2",
  "live_fax_quotes_v3",
  "dispatches",
  "approvals",
  "reservations",
  "outbox",
  "usage",
  "welcome_credit_grants",
  "welcome_credit_reservations",
  "welcome_credit_entries",
  "fax_usage_settlements",
];
async function snapshot() {
  const result: Record<string, unknown> = {};
  for (const table of tables)
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
async function sql(source: string) {
  return db.batch(
    unstable_splitSqlQuery(source).map((statement) => db.prepare(statement)),
  );
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
  const directory = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(directory)
    .filter((file) => file.endsWith(".sql") && file < "0027_")
    .sort())
    await sql(readFileSync(new URL(name, directory), "utf8"));
  fixture = await createFaxUsageFixture(db, () => Date.parse(now));
  for (let i = 0; i < 17; i++)
    await insertRecord(db, "trusted_fax_usage_tariffs", {
      ...fixture.tariff,
      id: `${fixture.tariff.id}_historical_${i}`,
      destination_prefix:
        i === 0 ? "+493000" : `+339${String(i).padStart(2, "0")}`,
      destination_country_code: i === 0 ? "DE" : "FR",
      status: i % 2 ? "revoked" : "qualified",
    });
  await insertRecord(db, "trusted_fax_usage_tariffs", {
    ...fixture.tariff,
    id: `${fixture.tariff.id}_lu`,
    destination_country_code: "LU",
    destination_prefix: "+3524",
    origin_class: "local",
    route_qualification: "operator_test",
    operator_authorization_reference:
      "ISOLATED EXISTING OPERATOR AUTHORIZATION",
    operator_test_ceiling_minor: 200,
  });
  const d = await fixture.domain.prepareDispatch(
    fixture.ctx,
    fixture.input,
    "migration-fr",
  );
  await fixture.domain.approveDispatch(fixture.ctx, d.id, d.fingerprint);
  await fixture.domain.confirmDispatch(fixture.ctx, d.id, "migration-confirm");
  await fixture.domain.prepareDispatch(
    fixture.ctx,
    {
      ...fixture.input,
      recipient: { phone: "+35240000000" },
      ceilingMinor: 200,
    },
    "migration-lu",
  );
  before = await snapshot();
  beforeSchema = await schema();
  migration = readFileSync(
    new URL("0027_luxembourg_fax_coverage.sql", directory),
    "utf8",
  );
  await expect(
    sql(
      migration +
        `\nINSERT INTO organizations SELECT * FROM organizations WHERE id='${fixture.ctx.organizationId}';`,
    ),
  ).rejects.toThrow("UNIQUE constraint failed");
  rollback = await snapshot();
  rollbackSchema = await schema();
  await sql(migration);
});
afterAll(async () => {
  await mf?.dispose();
});

describe("Luxembourg coverage migration — populated local D1", () => {
  it("preserves all 19 existing tariffs, both immutable quotes and the held funds, including rollback", async () => {
    expect(before.trusted_fax_usage_tariffs as unknown[]).toHaveLength(19);
    expect(before.live_fax_quotes_v3 as unknown[]).toHaveLength(2);
    expect(before.welcome_credit_reservations as unknown[]).toHaveLength(1);
    expect(rollback).toEqual(before);
    expect(rollbackSchema).toEqual(beforeSchema);
    expect(await snapshot()).toEqual(before);
    expect(
      await db
        .prepare("SELECT count(*) n FROM valid_live_fax_quotes_v3")
        .first(),
    ).toEqual({ n: 2 });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    expect(await db.prepare("PRAGMA quick_check").first()).toEqual({
      quick_check: "ok",
    });
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
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM sqlite_schema WHERE name='fax_tariff_migration_backup'",
        )
        .first(),
    ).toEqual({ n: 0 });
  });
  it("still prepares Germany with its preserved provider-qualified tariff", async () => {
    const dispatch = await fixture.domain.prepareDispatch(
      fixture.ctx,
      {
        ...fixture.input,
        recipient: { phone: "+493000000000" },
      },
      "migration-de",
    );
    expect(dispatch.status).toBe("prepared");
    expect(dispatch.faxPricing?.routeQualification).toBeUndefined();
    expect(
      await db
        .prepare("SELECT tariff_id FROM live_fax_quotes_v3 WHERE dispatch_id=?")
        .bind(dispatch.id)
        .first(),
    ).toEqual({ tariff_id: `${fixture.tariff.id}_historical_0` });
  });
  it("keeps old and expanded tariffs immutable and tenant-scoped", async () => {
    await expect(
      db
        .prepare(
          "UPDATE trusted_fax_usage_tariffs SET destination_category='mobile' WHERE id=?",
        )
        .bind(fixture.tariff.id)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    await expect(
      db
        .prepare("DELETE FROM trusted_fax_usage_tariffs WHERE id=?")
        .bind(`${fixture.tariff.id}_lu`)
        .run(),
    ).rejects.toThrow("immutable_fax_usage_tariff");
    await expect(
      db.prepare("UPDATE live_fax_quotes_v3 SET ceiling_minor=1").run(),
    ).rejects.toThrow("immutable_live_fax_quote");
    await expect(
      insertRecord(db, "trusted_fax_usage_tariffs", {
        ...fixture.tariff,
        id: "other-tenant-tariff",
        organization_id: "missing-tenant",
      }),
    ).rejects.toThrow("FOREIGN KEY constraint failed");
  });
});
