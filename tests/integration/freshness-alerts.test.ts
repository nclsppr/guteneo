import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  reconcileFreshnessAlerts,
  type FreshnessEvaluation,
} from "../../apps/api/src/freshness-alerts";
import { startObservation } from "../../packages/observability/src/index";

let mf: Miniflare;
let db: D1Database;
const now = "2026-10-30T10:00:00.000Z";
const deadline = "2026-10-31T10:00:00.000Z";
const later = "2026-11-03T10:00:00.000Z";
const hash = (letter: string) => letter.repeat(64);
const evaluation = (
  changes: Partial<FreshnessEvaluation> = {},
): FreshnessEvaluation => ({
  organizationId: "org_one",
  family: "fax_tariff",
  bindingSha256: hash("a"),
  active: true,
  candidates: [{ revisionSha256: hash("b"), deadline, mode: "automatic" }],
  ...changes,
});
const noRisk = {
  freshnessAtRisk: 0,
  freshnessExpired: 0,
  freshnessOpened: 0,
  freshnessResolved: 0,
  freshnessChecksFailed: 0,
};
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
  await db.exec("CREATE TABLE organizations(id TEXT PRIMARY KEY)");
  const migration = readFileSync(
    new URL(
      "../../migrations/0068_provider_freshness_alerts.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.batch(
    unstable_splitSqlQuery(migration).map((sql) => db.prepare(sql)),
  );
  await db.exec("INSERT INTO organizations VALUES('org_one'),('org_two')");
});
afterAll(async () => mf?.dispose());
beforeEach(async () => {
  await db.exec("DROP TRIGGER IF EXISTS isolated_commit_failure");
  await db.exec("DELETE FROM provider_freshness_incidents");
  await db.exec("DELETE FROM provider_freshness_bindings");
});

describe("durable operational deadline incidents", () => {
  it("opens exactly at the real 24-hour boundary, with no new deadline", async () => {
    expect(
      await reconcileFreshnessAlerts(
        db,
        [evaluation()],
        "2026-10-30T09:59:59.999Z",
      ),
    ).toEqual(noRisk);
    expect(await reconcileFreshnessAlerts(db, [evaluation()], now)).toEqual({
      ...noRisk,
      freshnessAtRisk: 1,
      freshnessOpened: 1,
    });
    const incident = await db
      .prepare(
        "SELECT deadline_at,warning_seconds FROM provider_freshness_incidents",
      )
      .first();
    expect(incident).toEqual({ deadline_at: deadline, warning_seconds: 86400 });
  });

  it("deduplicates repeated and overlapping Cron evaluations", async () => {
    const result = await Promise.all([
      reconcileFreshnessAlerts(db, [evaluation()], now),
      reconcileFreshnessAlerts(db, [evaluation()], now),
    ]);
    expect(result.reduce((n, value) => n + value.freshnessOpened, 0)).toBe(1);
    expect(await reconcileFreshnessAlerts(db, [evaluation()], now)).toEqual({
      ...noRisk,
      freshnessAtRisk: 1,
    });
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM provider_freshness_incidents")
        .first("count"),
    ).toBe(1);
  });

  it("keeps unvisited incidents and classifies elapsed deadlines without a page read", async () => {
    await reconcileFreshnessAlerts(db, [evaluation()], now);
    expect(await reconcileFreshnessAlerts(db, [], deadline)).toEqual({
      ...noRisk,
      freshnessExpired: 1,
    });
    const other = evaluation({
      bindingSha256: hash("c"),
      candidates: [
        { revisionSha256: hash("d"), deadline: later, mode: "automatic" },
      ],
    });
    expect(await reconcileFreshnessAlerts(db, [other], deadline)).toEqual({
      ...noRisk,
      freshnessExpired: 1,
    });
  });

  it("resolves only the explicitly evaluated exact binding when genuinely replaced", async () => {
    await reconcileFreshnessAlerts(
      db,
      [evaluation(), evaluation({ bindingSha256: hash("c") })],
      now,
    );
    const replacement = evaluation({
      candidates: [
        { revisionSha256: hash("d"), deadline: later, mode: "automatic" },
      ],
    });
    expect(
      await reconcileFreshnessAlerts(
        db,
        [replacement],
        "2026-10-30T10:01:00.000Z",
      ),
    ).toEqual({
      ...noRisk,
      freshnessAtRisk: 1,
      freshnessResolved: 1,
    });
    expect(
      await db
        .prepare(
          "SELECT resolution FROM provider_freshness_incidents WHERE binding_sha256=?",
        )
        .bind(hash("a"))
        .first("resolution"),
    ).toBe("replaced");
  });

  it("requires proved deselection and can reopen the same still-expiring configuration", async () => {
    await reconcileFreshnessAlerts(db, [evaluation()], now);
    const disabled = evaluation({ active: false, candidates: [] });
    expect(
      await reconcileFreshnessAlerts(
        db,
        [disabled],
        "2026-10-30T10:01:00.000Z",
      ),
    ).toEqual({ ...noRisk, freshnessResolved: 1 });
    expect(
      await reconcileFreshnessAlerts(
        db,
        [evaluation()],
        "2026-10-30T10:02:00.000Z",
      ),
    ).toEqual({ ...noRisk, freshnessAtRisk: 1, freshnessOpened: 1 });
    expect(
      await db
        .prepare("SELECT reopened_count FROM provider_freshness_incidents")
        .first("reopened_count"),
    ).toBe(1);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM provider_freshness_incidents")
        .first("count"),
    ).toBe(1);
  });

  it("does not infer resolution from missing candidates or an unexplained guard loss", async () => {
    await reconcileFreshnessAlerts(db, [evaluation()], now);
    await expect(
      reconcileFreshnessAlerts(db, [evaluation({ candidates: [] })], now),
    ).rejects.toThrow("FRESHNESS_INPUT_INVALID");
    expect(await reconcileFreshnessAlerts(db, [], now)).toEqual({
      ...noRisk,
      freshnessAtRisk: 1,
    });
  });

  it("isolates identical binding hashes across tenants", async () => {
    await reconcileFreshnessAlerts(
      db,
      [evaluation(), evaluation({ organizationId: "org_two" })],
      now,
    );
    const disabled = evaluation({ active: false, candidates: [] });
    expect(
      await reconcileFreshnessAlerts(
        db,
        [disabled],
        "2026-10-30T10:01:00.000Z",
      ),
    ).toEqual({ ...noRisk, freshnessAtRisk: 1, freshnessResolved: 1 });
    expect(
      await db
        .prepare(
          "SELECT state FROM provider_freshness_incidents WHERE organization_id='org_two'",
        )
        .first("state"),
    ).toBe("at_risk");
  });

  it("fences stale evaluations and conflicting evidence with the same timestamp", async () => {
    await reconcileFreshnessAlerts(db, [evaluation()], now);
    const disabled = evaluation({ active: false, candidates: [] });
    expect(await reconcileFreshnessAlerts(db, [disabled], now)).toEqual({
      ...noRisk,
      freshnessAtRisk: 1,
      freshnessChecksFailed: 1,
    });
    expect(
      await reconcileFreshnessAlerts(
        db,
        [disabled],
        "2026-10-30T09:00:00.000Z",
      ),
    ).toEqual({ ...noRisk, freshnessAtRisk: 1, freshnessChecksFailed: 1 });
    await reconcileFreshnessAlerts(db, [disabled], "2026-10-30T10:01:00.000Z");
    expect(await reconcileFreshnessAlerts(db, [evaluation()], now)).toEqual({
      ...noRisk,
      freshnessChecksFailed: 1,
    });
  });

  it("records an operator deadline but never renews its authority", async () => {
    const authority = evaluation({
      family: "fax_authority",
      candidates: [{ revisionSha256: hash("e"), deadline, mode: "operator" }],
    });
    await reconcileFreshnessAlerts(db, [authority], now);
    const expired = await reconcileFreshnessAlerts(db, [authority], deadline);
    expect(expired).toEqual({ ...noRisk, freshnessExpired: 1 });
    expect(
      await db
        .prepare(
          "SELECT deadline_at,renewal_mode,state FROM provider_freshness_incidents",
        )
        .first(),
    ).toEqual({
      deadline_at: deadline,
      renewal_mode: "operator",
      state: "expired",
    });
  });

  it("rolls back binding state and earlier incidents when the transaction fails", async () => {
    await db.exec(
      "CREATE TRIGGER isolated_commit_failure BEFORE INSERT ON provider_freshness_incidents BEGIN SELECT RAISE(ABORT,'isolated private diagnostic'); END",
    );
    await expect(
      reconcileFreshnessAlerts(db, [evaluation()], now),
    ).rejects.toThrow("FRESHNESS_RECONCILIATION_FAILED");
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM provider_freshness_bindings")
        .first("count"),
    ).toBe(0);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM provider_freshness_incidents")
        .first("count"),
    ).toBe(0);
  });

  it("retains immutable identity, deadline and first observation evidence", async () => {
    await reconcileFreshnessAlerts(db, [evaluation()], now);
    await expect(
      db
        .prepare("UPDATE provider_freshness_incidents SET deadline_at=?")
        .bind(later)
        .run(),
    ).rejects.toThrow("immutable_provider_freshness_incident");
  });

  it("removes only a deleted tenant's operational metadata", async () => {
    await db.exec("INSERT INTO organizations VALUES('org_removed')");
    await reconcileFreshnessAlerts(
      db,
      [evaluation({ organizationId: "org_removed" }), evaluation()],
      now,
    );
    await db.exec("DELETE FROM organizations WHERE id='org_removed'");
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM provider_freshness_incidents WHERE organization_id='org_removed'",
        )
        .first("count"),
    ).toBe(0);
    expect(await reconcileFreshnessAlerts(db, [], now)).toEqual({
      ...noRisk,
      freshnessAtRisk: 1,
    });
  });

  it("rejects duplicate bindings, inactive candidates, malformed clocks and unbounded input before SQL", async () => {
    const prepare = vi.fn();
    const fake = { prepare } as unknown as D1Database;
    for (const values of [
      [evaluation(), evaluation()],
      [evaluation({ active: false })],
      Array.from({ length: 51 }, () => evaluation()),
    ])
      await expect(reconcileFreshnessAlerts(fake, values, now)).rejects.toThrow(
        "FRESHNESS_INPUT_INVALID",
      );
    await expect(
      reconcileFreshnessAlerts(fake, [evaluation()], "2026-10-30"),
    ).rejects.toThrow("FRESHNESS_INPUT_INVALID");
    expect(prepare).not.toHaveBeenCalled();
  });
});

it("exports only closed coarse observations, separate from the Cron heartbeat", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    for (const code of [
      "FRESHNESS_AT_RISK",
      "FRESHNESS_CHECK_FAILED",
    ] as const) {
      const observation = startObservation(
        {},
        "app",
        "freshness",
        "maintenance",
      );
      observation.setCode(code);
      observation.finish(
        undefined,
        {
          freshnessAtRisk: 2,
          freshnessChecksFailed: code === "FRESHNESS_CHECK_FAILED" ? 1 : 0,
        },
        "freshness",
      );
      expect(warn.mock.lastCall?.[0]).toMatchObject({
        event: "freshness",
        stage: "freshness",
        code,
        freshnessAtRisk: 2,
      });
      const text = JSON.stringify(warn.mock.lastCall?.[0]);
      expect(text).not.toContain("org_one");
      expect(text).not.toContain(hash("a"));
      expect(text).not.toContain("complete");
    }
  } finally {
    warn.mockRestore();
  }
});
