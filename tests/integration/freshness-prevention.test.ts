import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  reconcileFreshnessAlerts,
  type FreshnessEvaluation,
} from "../../apps/api/src/freshness-alerts";
import {
  reconcileFreshnessPrevention,
  readPrivatePreventionReport,
} from "../../apps/api/src/freshness-prevention";

let mf: Miniflare;
let db: D1Database;
const deadline = "2026-12-01T10:00:00.000Z";
const DAY = 86_400_000;
const at = (remaining: number) =>
  new Date(Date.parse(deadline) - remaining).toISOString();
const hash = (letter: string) => letter.repeat(64);
const evaluation = (
  changes: Partial<FreshnessEvaluation> = {},
): FreshnessEvaluation => ({
  organizationId: "org_one",
  family: "fax_authority",
  bindingSha256: hash("a"),
  active: true,
  candidates: [{ revisionSha256: hash("b"), deadline, mode: "operator" }],
  ...changes,
});
async function run(values: FreshnessEvaluation[], now = at(7 * DAY)) {
  await reconcileFreshnessAlerts(db, values, now);
  return reconcileFreshnessPrevention(db, values, now);
}
async function tasks() {
  return (
    await db
      .prepare(
        "SELECT * FROM provider_freshness_prevention_tasks ORDER BY organization_id,deadline_at",
      )
      .all()
  ).results;
}
async function notifications() {
  return (
    await db
      .prepare(
        "SELECT * FROM provider_freshness_prevention_notifications ORDER BY created_at,notification_sha256",
      )
      .all()
  ).results;
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
  await db.exec("CREATE TABLE organizations(id TEXT PRIMARY KEY)");
  for (const file of [
    "0068_provider_freshness_alerts.sql",
    "0074_provider_freshness_prevention.sql",
  ]) {
    const sql = readFileSync(
      new URL(`../../migrations/${file}`, import.meta.url),
      "utf8",
    );
    await db.batch(
      unstable_splitSqlQuery(sql).map((query) => db.prepare(query)),
    );
  }
});
afterAll(async () => mf?.dispose());
beforeEach(async () => {
  await db.exec("DROP TRIGGER IF EXISTS prevention_forced_failure");
  await db.exec("DELETE FROM organizations");
  await db.exec("INSERT INTO organizations VALUES('org_one'),('org_two')");
});
describe("proactive deadline milestones", () => {
  it("anticipates operator deadlines at exact7/3/1day boundaries without changing oldJ1incidentkeys", async () => {
    expect((await run([evaluation()], at(7 * DAY + 1))).preventionOpened).toBe(
      0,
    );
    for (const [remaining, stage] of [
      [7 * DAY, "operator_7d"],
      [3 * DAY, "operator_3d"],
      [DAY, "operator_1d"],
      [0, "expired"],
    ] as const) {
      const result = await run([evaluation()], at(remaining));
      expect(result.preventionOpened).toBe(1);
      expect(result.preventionNotificationsQueued).toBe(1);
      expect((await tasks())[0].stage).toBe(stage);
      expect(
        (await notifications()).filter((row) => row.status === "pending"),
      ).toHaveLength(1);
      expect(
        (await notifications()).find((row) => row.status === "pending")?.stage,
      ).toBe(stage);
      expect((await run([evaluation()], at(remaining))).preventionOpened).toBe(
        0,
      );
    }
    const incident = await db
      .prepare(
        "SELECT warning_seconds,deadline_at FROM provider_freshness_incidents",
      )
      .first();
    expect(incident).toEqual({ warning_seconds: 86400, deadline_at: deadline });
    expect(await notifications()).toHaveLength(4);
    expect((await tasks())[0]).toMatchObject({
      occurrence: 1,
      deadline_at: deadline,
      renewal_mode: "operator",
    });
  });
  it("uses48/24hour thresholds for automatic renewals and skips old stages after downtime", async () => {
    const value = evaluation({
      family: "fax_tariff",
      candidates: [{ revisionSha256: hash("b"), deadline, mode: "automatic" }],
    });
    expect((await run([value], at(2 * DAY + 1))).preventionOpened).toBe(0);
    expect((await run([value], at(2 * DAY))).preventionOpened).toBe(1);
    expect((await tasks())[0].stage).toBe("automatic_48h");
    await run([value], at(DAY));
    expect((await tasks())[0].stage).toBe("automatic_24h");
    await run([value], deadline);
    expect((await tasks())[0].stage).toBe("expired");
    const later = evaluation({ organizationId: "org_two" });
    await run([later], at(60_000));
    expect(
      (await notifications()).filter(
        (row) => row.organization_id === "org_two",
      ),
    ).toHaveLength(1);
    expect(
      (await tasks()).find((row) => row.organization_id === "org_two")?.stage,
    ).toBe("operator_1d");
  });
  it("deduplicates simultaneous first observations and same-stage ticks", async () => {
    const now = at(7 * DAY);
    await reconcileFreshnessAlerts(db, [evaluation()], now);
    const result = await Promise.all([
      reconcileFreshnessPrevention(db, [evaluation()], now),
      reconcileFreshnessPrevention(db, [evaluation()], now),
    ]);
    expect(result.reduce((sum, row) => sum + row.preventionOpened, 0)).toBe(1);
    expect(await notifications()).toHaveLength(1);
    expect(
      (await run([evaluation()], at(7 * DAY - 60_000))).preventionOpened,
    ).toBe(0);
    expect(await notifications()).toHaveLength(1);
  });
  it("requires current binding evidence and cannot resolve omitted or stale pages", async () => {
    expect(
      (await reconcileFreshnessPrevention(db, [evaluation()], at(7 * DAY)))
        .preventionChecksFailed,
    ).toBe(1);
    expect(await tasks()).toHaveLength(0);
    await run([evaluation()], at(3 * DAY));
    const before = await tasks();
    expect(
      (await reconcileFreshnessPrevention(db, [evaluation()], at(7 * DAY)))
        .preventionChecksFailed,
    ).toBe(1);
    expect(
      (
        await reconcileFreshnessPrevention(
          db,
          [evaluation({ active: false, candidates: [] })],
          at(3 * DAY),
        )
      ).preventionChecksFailed,
    ).toBe(1);
    await run([], at(DAY));
    expect(await tasks()).toEqual(before);
    expect((await notifications())[0].status).toBe("pending");
  });
  it("resolves exact replacements and genuine disables, then deduplicates concurrent reenable generations", async () => {
    await run([evaluation()]);
    const original = (await notifications())[0].notification_sha256;
    const disabled = evaluation({ active: false, candidates: [] });
    expect((await run([disabled], at(6 * DAY))).preventionResolved).toBe(1);
    expect((await tasks())[0].resolution).toBe("disabled");
    expect((await notifications())[0].status).toBe("superseded");
    const now = at(5 * DAY);
    await reconcileFreshnessAlerts(db, [evaluation()], now);
    const result = await Promise.all([
      reconcileFreshnessPrevention(db, [evaluation()], now),
      reconcileFreshnessPrevention(db, [evaluation()], now),
    ]);
    expect(result.reduce((sum, row) => sum + row.preventionOpened, 0)).toBe(1);
    expect((await tasks())[0].occurrence).toBe(2);
    expect(
      (await notifications()).find((row) => row.status === "pending")
        ?.notification_sha256,
    ).not.toBe(original);
    const replacement = evaluation({
      candidates: [
        {
          revisionSha256: hash("c"),
          deadline: "2027-03-01T10:00:00.000Z",
          mode: "operator",
        },
      ],
    });
    expect((await run([replacement], at(4 * DAY))).preventionResolved).toBe(1);
    expect((await tasks())[0]).toMatchObject({
      state: "resolved",
      resolution: "replaced",
    });
    expect(
      (await notifications()).every((row) => row.status === "superseded"),
    ).toBe(true);
  });
  it("keeps task identities and milestone ledgers tenant-scoped and retained", async () => {
    await run([evaluation(), evaluation({ organizationId: "org_two" })]);
    const rows = await tasks();
    expect(rows[0].task_sha256).not.toBe(rows[1].task_sha256);
    await expect(
      db
        .prepare(
          "DELETE FROM provider_freshness_prevention_tasks WHERE organization_id='org_one'",
        )
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare(
          "DELETE FROM provider_freshness_prevention_notifications WHERE organization_id='org_one'",
        )
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare(
          "INSERT INTO provider_freshness_prevention_notifications(organization_id,notification_sha256,task_sha256,occurrence,stage,created_at,updated_at) VALUES('org_two',?,?,1,'operator_7d',?,?)",
        )
        .bind(hash("d"), rows[0].task_sha256, at(7 * DAY), at(7 * DAY))
        .run(),
    ).rejects.toThrow();
    await run([evaluation({ active: false, candidates: [] })], at(6 * DAY));
    expect(
      (await tasks()).find((row) => row.organization_id === "org_two")?.state,
    ).toBe("active");
    await db.prepare("DELETE FROM organizations WHERE id='org_one'").run();
    expect(await tasks()).toHaveLength(1);
    expect(await notifications()).toHaveLength(1);
  });
  it("does not supersede already attempted milestones or retry unknown outcomes", async () => {
    await run([evaluation()]);
    const created = at(7 * DAY);
    await db
      .prepare(
        "UPDATE provider_freshness_prevention_notifications SET status='sending',envelope_sha256=?,claimed_at=?,lease_until=? WHERE status='pending'",
      )
      .bind(
        hash("d"),
        created,
        new Date(Date.parse(created) + 60_000).toISOString(),
      )
      .run();
    await db
      .prepare(
        "UPDATE provider_freshness_prevention_notifications SET status='unknown',finished_at=?,error_code='PROVIDER_OUTCOME_UNKNOWN'",
      )
      .bind(created)
      .run();
    expect((await run([evaluation()], at(6 * DAY))).preventionOpened).toBe(0);
    expect((await notifications())[0].status).toBe("unknown");
    await expect(
      db
        .prepare(
          "UPDATE provider_freshness_prevention_notifications SET status='pending',envelope_sha256=NULL,claimed_at=NULL,lease_until=NULL,finished_at=NULL,error_code=NULL",
        )
        .run(),
    ).rejects.toThrow();
    await run([evaluation()], at(3 * DAY));
    expect(
      (await notifications()).find((row) => row.stage === "operator_7d")
        ?.status,
    ).toBe("unknown");
    expect(
      (await notifications()).find((row) => row.stage === "operator_3d")
        ?.status,
    ).toBe("pending");
  });
  it("rolls back the task and notification atomically when outbox insertion fails", async () => {
    const now = at(7 * DAY);
    await reconcileFreshnessAlerts(db, [evaluation()], now);
    await db.exec(
      "CREATE TRIGGER prevention_forced_failure BEFORE INSERT ON provider_freshness_prevention_notifications BEGIN SELECT RAISE(ABORT,'fixture'); END",
    );
    await expect(
      reconcileFreshnessPrevention(db, [evaluation()], now),
    ).rejects.toThrow("FRESHNESS_PREVENTION_RECONCILIATION_FAILED");
    expect(await tasks()).toHaveLength(0);
    expect(await notifications()).toHaveLength(0);
  });
  it("returns bounded private metadata without tenant, binding, revision, notification or provider identifiers", async () => {
    const values = Array.from({ length: 27 }, (_, index) =>
      evaluation({
        bindingSha256: index.toString(16).padStart(64, "0"),
        candidates: [
          {
            revisionSha256: hash("b"),
            deadline: new Date(
              Date.parse(deadline) + index * 60_000,
            ).toISOString(),
            mode: "operator",
          },
        ],
      }),
    );
    await run(values, at(3 * DAY));
    const report = await readPrivatePreventionReport(db);
    expect(report.activeTasks).toBe(27);
    expect(report.actions).toHaveLength(25);
    expect(report.truncated).toBe(true);
    expect(
      report.notifications.find((row) => row.status === "pending")?.count,
    ).toBe(27);
    expect(
      report.actions.every((row) => row.action === "renew_or_retire_authority"),
    ).toBe(true);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(
      /org_one|binding|revision|sha256|provider_reference|source|sender|recipient/,
    );
    expect((await db.prepare("PRAGMA quick_check").first())?.quick_check).toBe(
      "ok",
    );
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toHaveLength(0);
  });
  it("rejects malformed or excessive input without mutating prevention records", async () => {
    await expect(
      reconcileFreshnessPrevention(
        db,
        [evaluation({ family: "untrusted" as never })],
        at(7 * DAY),
      ),
    ).rejects.toThrow("FRESHNESS_PREVENTION_INPUT_INVALID");
    await expect(
      reconcileFreshnessPrevention(
        db,
        [evaluation(), evaluation()],
        at(7 * DAY),
      ),
    ).rejects.toThrow("FRESHNESS_PREVENTION_INPUT_INVALID");
    await expect(
      reconcileFreshnessPrevention(
        db,
        Array(51).fill(evaluation()),
        at(7 * DAY),
      ),
    ).rejects.toThrow("FRESHNESS_PREVENTION_INPUT_INVALID");
    expect(await tasks()).toHaveLength(0);
  });
});
