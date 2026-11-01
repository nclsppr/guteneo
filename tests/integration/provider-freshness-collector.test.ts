import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { collectProviderFreshness } from "../../apps/api/src/provider-freshness";
import {
  reconcileFreshnessAlerts,
  type FreshnessEvaluation,
} from "../../apps/api/src/freshness-alerts";
import type { Env } from "../../apps/api/src/env";
import { insertRecord } from "../helpers/fax-usage-fixture";
import {
  createVerifiedFaxReferenceFixture,
  mapVerifiedTariff,
  registerVerifiedFaxFixture,
  verifiedBindingHash,
  type ReferenceRow,
  type VerifiedFaxReferenceFixture,
} from "../helpers/verified-fax-reference-fixture";

const NOW = Date.parse("2026-11-01T10:00:00.000Z");
const DAY = 86400000;
const stamp = (offset = 0) => new Date(NOW + offset).toISOString();
let mf: Miniflare, db: D1Database, legacy: D1Database;
let current: VerifiedFaxReferenceFixture;

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB", "LEGACY"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  legacy = (await mf.getD1Database("LEGACY")) as unknown as D1Database;
  const directory = new URL("../../migrations/", import.meta.url);
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  expect(files.some((file) => file.startsWith("0071_"))).toBe(true);
  for (const file of files) {
    const statements = unstable_splitSqlQuery(
      readFileSync(new URL(file, directory), "utf8"),
    );
    await db.batch(statements.map((sql) => db.prepare(sql)));
    if (file < "0071_")
      await legacy.batch(statements.map((sql) => legacy.prepare(sql)));
  }
});
afterAll(async () => mf?.dispose());
beforeEach(async () => {
  await db.batch([
    db.prepare("UPDATE verified_fax_reference_sets SET status='revoked'"),
    db.prepare("UPDATE channel_controls SET enabled=0"),
    db.prepare("DELETE FROM provider_freshness_incidents"),
    db.prepare("DELETE FROM provider_freshness_bindings"),
    db.prepare("DELETE FROM provider_freshness_cursors"),
  ]);
  current = await createVerifiedFaxReferenceFixture(db, () => NOW);
});

async function collectAll(value = current, selectedEnv: Env = value.env) {
  await value.db.prepare("DELETE FROM provider_freshness_cursors").run();
  const visited = new Map<string, FreshnessEvaluation>();
  const completed = new Set<string>();
  let failures = 0;
  for (let pass = 0; pass < 100; pass++) {
    const collected = await collectProviderFreshness(selectedEnv, {
      now: () => NOW + pass,
    });
    failures += collected.freshnessChecksFailed;
    for (const evaluation of collected.evaluations)
      if (evaluation.organizationId === value.fixture.ctx.organizationId)
        visited.set(evaluation.family + evaluation.bindingSha256, evaluation);
    const cursors = await value.db
      .prepare(
        "SELECT mechanism,after_organization_id,after_target_id FROM provider_freshness_cursors",
      )
      .all<{
        mechanism: string;
        after_organization_id: string;
        after_target_id: string;
      }>();
    for (const cursor of cursors.results)
      if (!cursor.after_organization_id && !cursor.after_target_id)
        completed.add(cursor.mechanism);
    if (completed.size === 6)
      return {
        evaluations: [...visited.values()],
        freshnessChecksFailed: failures,
      };
  }
  throw new Error("Isolated freshness inventory did not complete");
}

async function addUnregisteredManual() {
  const row = {
    ...current.bindings[0],
    id: "manual_" + crypto.randomUUID(),
    destination_prefix: "+491",
    destination_country_code: "DE",
  };
  await insertRecord(db, "trusted_fax_usage_tariffs", row);
  return row;
}

describe("provider freshness with exact registered FR/DE references", () => {
  it("preserves manual collection while the additive registration schema is absent", async () => {
    const old = await createVerifiedFaxReferenceFixture(legacy, () => NOW);
    const result = await collectAll(old);
    expect(result.freshnessChecksFailed).toBe(0);
    expect(result.evaluations.filter((value) => value.active)).toHaveLength(14);
    expect(
      result.evaluations
        .filter((value) => value.active)
        .every((value) => value.candidates[0].mode === "operator"),
    ).toBe(true);
  });

  it("classifies only exact registered tariffs as automatic and retains other manual deadlines", async () => {
    await registerVerifiedFaxFixture(current);
    const manual = await addUnregisteredManual();
    const result = await collectAll();
    expect(result.freshnessChecksFailed).toBe(0);
    const active = result.evaluations.filter((value) => value.active);
    expect(
      active.filter((value) => value.candidates[0].mode === "automatic"),
    ).toHaveLength(14);
    const manualHash = await verifiedBindingHash(
      current.fixture.ctx.organizationId,
      String(manual.id),
    );
    expect(
      active.find((value) => value.bindingSha256 === manualHash)?.candidates[0],
    ).toMatchObject({ mode: "operator", deadline: "2026-09-24T09:00:00.000Z" });
    const excluded = new Set(
      await Promise.all(
        current.exclusions.map((row) =>
          verifiedBindingHash(
            current.fixture.ctx.organizationId,
            String(row.id),
          ),
        ),
      ),
    );
    expect(
      result.evaluations
        .filter((value) => excluded.has(value.bindingSha256))
        .every((value) => !value.active),
    ).toBe(true);
    expect(
      await reconcileFreshnessAlerts(db, result.evaluations, stamp()),
    ).toMatchObject({ freshnessExpired: 15 });
  });

  it("retains real expiry risk when a registered automatic source is explicitly revoked", async () => {
    await registerVerifiedFaxFixture(current);
    await reconcileFreshnessAlerts(
      db,
      (await collectAll()).evaluations,
      stamp(),
    );
    await db
      .prepare(
        "UPDATE verified_fax_reference_sets SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(current.fixture.ctx.organizationId, current.sourceId)
      .run();
    const result = await collectAll();
    expect(result.freshnessChecksFailed).toBe(0);
    expect(result.evaluations.filter((value) => value.active)).toHaveLength(14);
    expect(
      result.evaluations
        .filter((value) => value.active)
        .every((value) => value.candidates[0].mode === "operator"),
    ).toBe(true);
    expect(
      await reconcileFreshnessAlerts(db, result.evaluations, stamp(1000)),
    ).toMatchObject({ freshnessExpired: 14 });
  });

  it.each(["sender_hash", "exclusion", "runtime"])(
    "keeps existing risks unknown after %s binding drift",
    async (reason) => {
      const first = await collectAll();
      await reconcileFreshnessAlerts(db, first.evaluations, stamp());
      if (reason === "sender_hash")
        current.set.sender_address_sha256 = "0".repeat(64);
      await registerVerifiedFaxFixture(current);
      if (reason === "exclusion")
        await db
          .prepare(
            "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
          )
          .bind(current.fixture.ctx.organizationId, current.exclusions[0].id)
          .run();
      const env =
        reason === "runtime"
          ? { ...current.env, TELNYX_API_KEY: undefined }
          : current.env;
      const unknown = await collectAll(current, env);
      expect(unknown.freshnessChecksFailed).toBeGreaterThan(0);
      expect(unknown.evaluations.filter((value) => value.active)).toEqual([]);
      expect(
        await reconcileFreshnessAlerts(db, unknown.evaluations, stamp(1000)),
      ).toMatchObject({ freshnessExpired: 14, freshnessResolved: 0 });
    },
  );

  it("resolves only visited replaced revisions, then stops scanning their inactive mapped history", async () => {
    await registerVerifiedFaxFixture(current);
    const manual = await addUnregisteredManual();
    await reconcileFreshnessAlerts(
      db,
      (await collectAll()).evaluations,
      stamp(),
    );
    const initialHashes = new Set(
      await Promise.all(
        current.bindings.map((row) =>
          verifiedBindingHash(
            current.fixture.ctx.organizationId,
            String(row.id),
          ),
        ),
      ),
    );
    for (const prior of current.bindings) {
      const next: ReferenceRow = {
        ...prior,
        id: "replacement_" + crypto.randomUUID(),
        page_nano_usd: 9000000,
        minute_nano_usd: 10000001,
        fx_numerator: 1,
        fx_denominator: 2,
        fx_date: stamp().slice(0, 10),
        fx_source: "ISOLATED CURRENT FX",
        source_reference: "ISOLATED CURRENT REFERENCE",
        source_sha256: "c".repeat(64),
        valid_from: stamp(),
        expires_at: stamp(7 * DAY),
        created_at: stamp(),
      };
      await db
        .prepare(
          "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
        )
        .bind(current.fixture.ctx.organizationId, prior.id)
        .run();
      await insertRecord(db, "trusted_fax_usage_tariffs", next);
      await mapVerifiedTariff(
        db,
        current.fixture.ctx.organizationId,
        current.sourceId,
        String(next.id),
      );
    }
    await db.prepare("DELETE FROM provider_freshness_cursors").run();
    const page = await collectProviderFreshness(current.env, {
      now: () => NOW + 100,
    });
    const visited = new Set(
      page.evaluations.map((value) => value.bindingSha256),
    );
    const unvisited = [...initialHashes].filter((hash) => !visited.has(hash));
    expect(unvisited.length).toBeGreaterThan(0);
    await reconcileFreshnessAlerts(db, page.evaluations, stamp(100));
    for (const hash of unvisited)
      expect(
        await db
          .prepare(
            "SELECT active FROM provider_freshness_bindings WHERE organization_id=? AND family='fax_tariff' AND binding_sha256=?",
          )
          .bind(current.fixture.ctx.organizationId, hash)
          .first("active"),
      ).toBe(1);
    const rest = await collectAll();
    expect(rest.freshnessChecksFailed).toBe(0);
    expect(
      await reconcileFreshnessAlerts(db, rest.evaluations, stamp(1000)),
    ).toMatchObject({ freshnessExpired: 1 });
    const after = await collectAll();
    expect(
      after.evaluations.some((value) => initialHashes.has(value.bindingSha256)),
    ).toBe(false);
    expect(
      after.evaluations.filter(
        (value) => value.active && value.candidates[0].mode === "automatic",
      ),
    ).toHaveLength(14);
    const manualHash = await verifiedBindingHash(
      current.fixture.ctx.organizationId,
      String(manual.id),
    );
    expect(
      after.evaluations.find((value) => value.bindingSha256 === manualHash)
        ?.candidates[0].mode,
    ).toBe("operator");
    const retained = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM trusted_fax_usage_tariffs WHERE organization_id=? AND status='revoked' AND expires_at='2026-09-24T09:00:00.000Z'",
      )
      .bind(current.fixture.ctx.organizationId)
      .first("n");
    expect(retained).toBe(15);
  });
});
