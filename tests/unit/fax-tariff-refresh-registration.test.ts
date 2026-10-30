import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createFaxUsageFixture } from "../helpers/fax-usage-fixture";
const {
  planFaxTariffRefreshRegistration,
  applyFaxTariffRefreshRegistration,
  faxTariffRegistrationDigest,
} = await import(
  new URL("../../scripts/register-fax-tariff-refresh.mjs", import.meta.url).href
);
let mf: Miniflare,
  db: D1Database,
  fixture: Awaited<ReturnType<typeof createFaxUsageFixture>>,
  config: Record<string, unknown>;
const old = "2026-10-27T10:00:00.000Z",
  now = "2026-10-30T10:00:00.000Z";
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
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((n) => n.endsWith(".sql") && Number(n.slice(0, 4)) <= 67)
    .sort())
    await db.batch(
      unstable_splitSqlQuery(readFileSync(new URL(file, dir), "utf8")).map(
        (s) => db.prepare(s),
      ),
    );
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  fixture = await createFaxUsageFixture(db, () => Date.parse(old), {
    destination_prefix: "+3524",
    destination_country_code: "LU",
    origin_class: "local",
    destination_category: "fixed",
    route_qualification: "operator_test",
    operator_authorization_reference: "ISOLATED LIVE PILOT AUTHORITY",
    operator_test_ceiling_minor: 200,
    local_calling_verified: 0,
    max_pages: 7,
    quote_ttl_seconds: 900,
    expires_at: "2026-10-28T10:00:00.000Z",
  });
  config = {
    version: 1,
    sourceId: crypto.randomUUID(),
    organizationId: fixture.ctx.organizationId,
    initialTariffId: fixture.tariff.id,
    tariffCatalog: "global_conversational",
    rateDeckUrl:
      "https://portal.telnyx.com/downloads/global_conversational/isolated.csv",
    authorizationExpiresAt: "2026-11-03T23:59:59.999Z",
    authorizationReference: "ISOLATED AUTOMATIC REFERENCE AUTHORIZATION",
    commercialBasis: "public_reference_not_negotiated",
  };
});
const plan = () => planFaxTariffRefreshRegistration(db, config, now);
const sources = () =>
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM fax_tariff_refresh_sources WHERE organization_id=?",
    )
    .bind(config.organizationId)
    .first<{ n: number }>();
describe("one-time public fax reference registration", () => {
  it("plans without refreshing prices or extending dated evidence", async () => {
    const p = await plan();
    expect(p.snapshot.tariff.expires_at).toBe("2026-10-28T10:00:00.000Z");
    expect(p.applied).toBe(false);
    expect(p.qualification).toBe(
      "registration_only_first_refresh_requires_current_catalog_source_and_provider_reads",
    );
    expect(p.source.tariff_catalog).toBe("global_conversational");
    expect(p.discovery).toEqual({
      tariffCatalog: "global_conversational",
      currentCatalogUrl: "https://api.telnyx.com/v2/tariffs",
      linkSelection: "data.global_conversational.tariff_link",
      initialRateDeckUrl: config.rateDeckUrl,
      fallbackToInitialRateDeck: false,
      standardApiKeyAccess: "unverified_by_registration",
    });
    expect((await sources())!.n).toBe(0);
  });
  it("applies once, schedules real reads and is idempotent", async () => {
    const p = await plan(),
      digest = faxTariffRegistrationDigest(p);
    expect(
      await applyFaxTariffRefreshRegistration(db, p, digest, now),
    ).toMatchObject({ status: "applied" });
    expect(
      await applyFaxTariffRefreshRegistration(db, p, digest, now),
    ).toMatchObject({ status: "already_applied" });
    expect((await sources())!.n).toBe(1);
    const state = await db
      .prepare(
        "SELECT * FROM fax_tariff_refresh_state WHERE organization_id=? AND source_id=?",
      )
      .bind(config.organizationId, config.sourceId)
      .first();
    expect(state).toMatchObject({
      next_due_at: now,
      last_success_at: null,
      last_attempt_at: null,
      failure_count: 0,
    });
    const tariff = await db
      .prepare(
        "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=?",
      )
      .bind(config.organizationId, config.initialTariffId)
      .first();
    expect(tariff).toEqual(p.snapshot.tariff);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM fax_tariff_refresh_evidence WHERE organization_id=?",
        )
        .bind(config.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("rejects altered material before the only registration write", async () => {
    const p = await plan(),
      digest = faxTariffRegistrationDigest(p);
    p.source.authorization_expires_at = "2026-11-03T23:59:59.998Z";
    await expect(
      applyFaxTariffRefreshRegistration(db, p, digest, now),
    ).rejects.toThrow("FAX_REFRESH_PLAN_INVALID");
    expect((await sources())!.n).toBe(0);
  });
  it.each([
    "https://evil.invalid/rates.csv",
    "http://portal.telnyx.com/downloads/global_conversational/a.csv",
    "https://portal.telnyx.com/downloads/global_conversational/a.csv?token=x",
    "https://portal.telnyx.com/downloads/global_conversational/../a.csv",
  ])("rejects an unbound source origin or URL: %s", async (rateDeckUrl) => {
    await expect(
      planFaxTariffRefreshRegistration(db, { ...config, rateDeckUrl }, now),
    ).rejects.toThrow("FAX_REFRESH_CONFIG_INVALID");
    expect((await sources())!.n).toBe(0);
  });
  it("does not broaden or extend pilot authority", async () => {
    for (const authorizationExpiresAt of ["2026-11-04T00:00:00.000Z", now])
      await expect(
        planFaxTariffRefreshRegistration(
          db,
          { ...config, authorizationExpiresAt },
          now,
        ),
      ).rejects.toThrow("FAX_REFRESH_CONFIG_INVALID");
    await expect(
      planFaxTariffRefreshRegistration(
        db,
        { ...config, commercialBasis: "negotiated_provider_price" },
        now,
      ),
    ).rejects.toThrow("FAX_REFRESH_CONFIG_INVALID");
  });
  it("requires an explicit Global Conversational catalogue binding", async () => {
    for (const tariffCatalog of [
      "other",
      "global_conversational_bundle_basic",
      null,
      undefined,
    ])
      await expect(
        planFaxTariffRefreshRegistration(db, { ...config, tariffCatalog }, now),
      ).rejects.toThrow("FAX_REFRESH_CONFIG_INVALID");
    expect((await sources())!.n).toBe(0);
  });
  it("refuses an approved plan that relabels the initial CSV as a discovery fallback", async () => {
    const p = await plan();
    p.discovery.fallbackToInitialRateDeck = true;
    await expect(
      applyFaxTariffRefreshRegistration(
        db,
        p,
        faxTariffRegistrationDigest(p),
        now,
      ),
    ).rejects.toThrow("FAX_REFRESH_PLAN_INVALID");
    expect((await sources())!.n).toBe(0);
  });
  it("is tenant scoped even for a known tariff ID", async () => {
    await expect(
      planFaxTariffRefreshRegistration(
        db,
        { ...config, organizationId: "other_tenant" },
        now,
      ),
    ).rejects.toThrow("FAX_REFRESH_TARGET_INVALID");
    expect((await sources())!.n).toBe(0);
  });
  it("does not re-enable a revoked source or change its source URL", async () => {
    const p = await plan();
    await applyFaxTariffRefreshRegistration(
      db,
      p,
      faxTariffRegistrationDigest(p),
      now,
    );
    await expect(
      planFaxTariffRefreshRegistration(
        db,
        {
          ...config,
          rateDeckUrl:
            "https://portal.telnyx.com/downloads/global_conversational/changed.csv",
        },
        now,
      ),
    ).rejects.toThrow("FAX_REFRESH_SOURCE_CONFLICT");
    await expect(
      db
        .prepare(
          "UPDATE fax_tariff_refresh_sources SET tariff_catalog='other' WHERE organization_id=? AND id=?",
        )
        .bind(config.organizationId, config.sourceId)
        .run(),
    ).rejects.toThrow(/immutable_fax_tariff_refresh_source|CHECK/);
    await db
      .prepare(
        "UPDATE fax_tariff_refresh_sources SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(config.organizationId, config.sourceId)
      .run();
    await expect(
      applyFaxTariffRefreshRegistration(
        db,
        p,
        faxTariffRegistrationDigest(p),
        now,
      ),
    ).rejects.toThrow("FAX_REFRESH_SOURCE_CONFLICT");
  });
  it("rejects a revoked initial tariff between review and application", async () => {
    const p = await plan();
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(config.organizationId, config.initialTariffId)
      .run();
    await expect(
      applyFaxTariffRefreshRegistration(
        db,
        p,
        faxTariffRegistrationDigest(p),
        now,
      ),
    ).rejects.toThrow("FAX_REFRESH_TARGET_INVALID");
    expect((await sources())!.n).toBe(0);
  });
  it("atomically checks the exact sender during insertion", async () => {
    const p = await plan();
    let changed = false;
    const racingDb = {
      prepare(sql: string) {
        const statement = db.prepare(sql);
        return {
          bind(...values: unknown[]) {
            const bound = statement.bind(...values);
            if (!sql.startsWith("INSERT INTO fax_tariff_refresh_sources"))
              return bound;
            return {
              async run() {
                changed = true;
                await db
                  .prepare(
                    "UPDATE senders SET status='disabled' WHERE organization_id=? AND id=?",
                  )
                  .bind(config.organizationId, fixture.tariff.sender_id)
                  .run();
                return bound.run();
              },
            };
          },
        };
      },
    };
    await expect(
      applyFaxTariffRefreshRegistration(
        racingDb,
        p,
        faxTariffRegistrationDigest(p),
        now,
      ),
    ).rejects.toThrow("FAX_REFRESH_STATE_CHANGED");
    expect(changed).toBe(true);
    expect((await sources())!.n).toBe(0);
  });
});

it("does not start an operator policy before the initial tariff's valid-from", async () => {
  const future = await createFaxUsageFixture(
    db,
    () => Date.parse("2026-10-31T10:00:00.000Z"),
    {
      destination_prefix: "+3524",
      destination_country_code: "LU",
      origin_class: "local",
      destination_category: "fixed",
      route_qualification: "operator_test",
      operator_authorization_reference: "ISOLATED FUTURE AUTHORITY",
      operator_test_ceiling_minor: 200,
      local_calling_verified: 0,
      max_pages: 7,
      expires_at: "2026-11-01T10:00:00.000Z",
    },
  );
  await expect(
    planFaxTariffRefreshRegistration(
      db,
      {
        ...config,
        organizationId: future.ctx.organizationId,
        initialTariffId: future.tariff.id,
      },
      now,
    ),
  ).rejects.toThrow("FAX_REFRESH_TARGET_INVALID");
});
