import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { expect, it } from "vitest";
import { createFaxUsageFixture } from "../helpers/fax-usage-fixture";

it("preserves a prepared fax, its approval, reservation, outbox and exact price across the worldwide migration", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response()}}",
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-16",
    }),
  );
  try {
    const db = (await mf.getD1Database("DB")) as unknown as D1Database;
    const directory = new URL("../../migrations/", import.meta.url);
    const sql = (file: string) =>
      unstable_splitSqlQuery(
        readFileSync(new URL(file, directory), "utf8"),
      ).map((statement) => db.prepare(statement));
    for (const file of readdirSync(directory)
      .filter((file) => file.endsWith(".sql") && file < "0084")
      .sort())
      await db.batch(sql(file));
    const f = await createFaxUsageFixture(db, Date.now);
    const d = await f.domain.prepareDispatch(f.ctx, f.input, "pre-migration");
    await f.domain.approveDispatch(f.ctx, d.id, d.fingerprint);
    await f.domain.confirmDispatch(f.ctx, d.id, "pre-migration");
    const historical = () =>
      db.batch(
        [
          "trusted_fax_usage_tariffs",
          "live_fax_quotes_v3",
          "approvals",
          "reservations",
          "outbox",
        ].map((table) => db.prepare(`SELECT * FROM ${table}`)),
      );
    const before = (await historical()).map((v) => v.results);
    const migration = sql("0084_fax_price_continuity.sql");
    await db.batch(migration);
    expect((await historical()).map((v) => v.results)).toEqual(before);
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    expect(
      await db
        .prepare(
          "SELECT fingerprint FROM valid_live_fax_quotes_v3 WHERE organization_id=? AND dispatch_id=?",
        )
        .bind(f.ctx.organizationId, d.id)
        .first("fingerprint"),
    ).toBe(d.quote_fingerprint);
  } finally {
    await mf.dispose();
  }
});
