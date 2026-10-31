import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let mf: Miniflare;
let db: D1Database;
let sequence = 0;
const now = "2026-10-30T12:00:00.000Z";
const hash = "a".repeat(64);
type Row = Record<string, string | number | null>;
const fixtures: Record<string, Row> = {
  provider_freshness_bindings: {
    organization_id: "",
    family: "fax_tariff",
    binding_sha256: hash,
    active: 1,
    evaluated_at: now,
    evaluation_sha256: hash,
  },
  provider_freshness_incidents: {
    organization_id: "",
    incident_sha256: hash,
    family: "fax_tariff",
    binding_sha256: hash,
    revision_sha256: hash,
    deadline_at: now,
    renewal_mode: "automatic",
    warning_seconds: 86400,
    state: "at_risk",
    opened_at: now,
    last_evaluated_at: now,
    resolved_at: null,
    resolution: null,
    reopened_count: 0,
  },
  provider_freshness_cursors: {
    mechanism: "fax",
    after_organization_id: "",
    after_target_id: "",
    updated_at: now,
  },
  postal_policy_refresh_state: {
    organization_id: "",
    last_error_code: null,
    next_due_at: now,
    failure_count: 0,
  },
  resend_policy_refresh_state: {
    account_id: "",
    domain_id: "fixture-domain",
    route_id: "fixture-route",
    rate_json: null,
    blocked_reasons_json: null,
    next_attempt_at: now,
    failure_count: 0,
  },
  resend_policy_refresh_evidence: {
    id: "",
    account_id: "fixture-account",
    domain_id: "fixture-domain",
    route_id: "fixture-route",
    observed_at: now,
    qualified_until: now,
    domain_sha256: hash,
    usage_sha256: null,
    pricing_sha256: hash,
    fx_sha256: hash,
    rate_json: "{}",
    limits_json: "{}",
    previous_policy_json: "{}",
  },
};

async function insert(
  table: string,
  changes: Row = {},
  conflict = "",
  prepareParent = true,
) {
  const row = { ...fixtures[table] };
  const identity = `constraint-fixture-${++sequence}`;
  for (const key of ["organization_id", "id", "account_id"])
    if (row[key] === "") row[key] = identity;
  Object.assign(row, changes);
  if (typeof row.organization_id === "string")
    await db
      .prepare("INSERT OR IGNORE INTO organizations VALUES(?)")
      .bind(row.organization_id)
      .run();
  if (table === "provider_freshness_incidents" && prepareParent)
    await db
      .prepare(
        "INSERT OR IGNORE INTO provider_freshness_bindings VALUES(?,?,?,?,?,?)",
      )
      .bind(row.organization_id, "fax_tariff", hash, 1, now, hash)
      .run();
  if (table === "provider_freshness_cursors")
    await db.prepare("DELETE FROM provider_freshness_cursors").run();
  const columns = Object.keys(row);
  return db
    .prepare(
      `INSERT${conflict} INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) RETURNING *`,
    )
    .bind(...Object.values(row))
    .all<Record<string, unknown>>();
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
  expect(await db.prepare("PRAGMA ignore_check_constraints").first()).toEqual({
    ignore_check_constraints: 0,
  });
  await db.exec("CREATE TABLE organizations(id TEXT PRIMARY KEY)");
  for (const name of [
    "0068_provider_freshness_alerts.sql",
    "0069_postal_policy_refresh.sql",
    "0070_resend_policy_maintenance.sql",
  ]) {
    const source = readFileSync(
      new URL(`../../migrations/${name}`, import.meta.url),
      "utf8",
    );
    await db.batch(
      unstable_splitSqlQuery(source).map((sql) => db.prepare(sql)),
    );
  }
});
afterAll(async () => mf?.dispose());

describe("provider maintenance constraint admission", () => {
  it("rejects NULL in every fused required-value check", async () => {
    const required: Record<string, string[]> = {
      provider_freshness_bindings: [
        "family",
        "binding_sha256",
        "active",
        "evaluation_sha256",
      ],
      provider_freshness_incidents: [
        "incident_sha256",
        "family",
        "revision_sha256",
        "renewal_mode",
      ],
      provider_freshness_cursors: ["after_organization_id", "after_target_id"],
      resend_policy_refresh_evidence: [
        "domain_sha256",
        "pricing_sha256",
        "fx_sha256",
        "rate_json",
        "limits_json",
        "previous_policy_json",
      ],
    };
    for (const [table, columns] of Object.entries(required))
      for (const column of columns)
        await expect(insert(table, { [column]: null })).rejects.toThrow();
  });

  it("keeps enums, hashes, JSON, ranges and date normalization closed", async () => {
    const invalid: [string, Row][] = [
      ["provider_freshness_bindings", { family: "FAX_TARIFF" }],
      ["provider_freshness_bindings", { binding_sha256: "g".repeat(64) }],
      ["provider_freshness_bindings", { evaluation_sha256: "a".repeat(63) }],
      ["provider_freshness_bindings", { active: 0.5 }],
      ["provider_freshness_bindings", { evaluated_at: null }],
      [
        "provider_freshness_bindings",
        { evaluated_at: "2026-02-30T12:00:00.000Z" },
      ],
      ["provider_freshness_incidents", { renewal_mode: "other" }],
      ["provider_freshness_incidents", { deadline_at: null }],
      ["provider_freshness_incidents", { opened_at: null }],
      ["provider_freshness_incidents", { last_evaluated_at: null }],
      [
        "provider_freshness_incidents",
        { last_evaluated_at: "2026-10-29T12:00:00.000Z" },
      ],
      ["provider_freshness_cursors", { mechanism: "unknown" }],
      ["provider_freshness_cursors", { after_target_id: "x".repeat(201) }],
      ["provider_freshness_cursors", { updated_at: null }],
      ["postal_policy_refresh_state", { last_error_code: "unknown" }],
      ["postal_policy_refresh_state", { failure_count: 17 }],
      ["resend_policy_refresh_state", { failure_count: -1 }],
      ["resend_policy_refresh_state", { blocked_reasons_json: "{}" }],
      ["resend_policy_refresh_evidence", { usage_sha256: "short" }],
      ["resend_policy_refresh_evidence", { rate_json: "{invalid" }],
    ];
    for (const [table, changes] of invalid)
      await expect(insert(table, changes)).rejects.toThrow();
  });

  it("preserves numeric affinity and the original optional NULL values", async () => {
    expect(
      (await insert("provider_freshness_bindings", { active: "1" })).results[0]
        .active,
    ).toBe(1);
    expect(
      (await insert("postal_policy_refresh_state", { last_error_code: null }))
        .results[0].last_error_code,
    ).toBeNull();
    expect(
      (await insert("provider_freshness_cursors", { mechanism: null }))
        .results[0].mechanism,
    ).toBeNull();
    expect(
      (await insert("resend_policy_refresh_evidence", { usage_sha256: null }))
        .results[0].usage_sha256,
    ).toBeNull();
    expect(
      (await insert("resend_policy_refresh_state")).results[0],
    ).toMatchObject({ rate_json: null, blocked_reasons_json: null });
  });

  it("retains every supported family, mechanism and postal failure code", async () => {
    for (const family of [
      "fax_tariff",
      "delivery_policy",
      "fax_authority",
      "resend_tariff",
      "resend_send_limits",
    ])
      expect(
        (await insert("provider_freshness_bindings", { family })).results,
      ).toHaveLength(1);
    for (const mechanism of [
      "fax",
      "fax_manual",
      "fax_legacy",
      "postal",
      "resend",
      "delivery_manual",
    ])
      expect(
        (await insert("provider_freshness_cursors", { mechanism })).results,
      ).toHaveLength(1);
    for (const last_error_code of [
      "PROFILE_UNAVAILABLE",
      "PROFILE_CHANGED",
      "BINDING_CHANGED",
      "QUOTE_ACTIVE",
      "COMMIT_CHANGED",
      "DATABASE_UNAVAILABLE",
    ])
      expect(
        (await insert("postal_policy_refresh_state", { last_error_code }))
          .results,
      ).toHaveLength(1);
  });

  it("admits exactly complete open or resolved incident states", async () => {
    for (const state of ["at_risk", "expired", "resolved", "other", null])
      for (const resolved_at of [null, now])
        for (const resolution of [null, "replaced", "disabled", "other"]) {
          const allowed =
            ((state === "at_risk" || state === "expired") &&
              resolved_at === null &&
              resolution === null) ||
            (state === "resolved" &&
              resolved_at !== null &&
              (resolution === "replaced" || resolution === "disabled"));
          const operation = insert("provider_freshness_incidents", {
            state,
            resolved_at,
            resolution,
          });
          if (allowed) expect((await operation).results).toHaveLength(1);
          else await expect(operation).rejects.toThrow();
        }
  });

  it("keeps IGNORE and DEFAULT substitution under REPLACE", async () => {
    expect(
      (
        await insert(
          "provider_freshness_bindings",
          { active: null },
          " OR IGNORE",
        )
      ).results,
    ).toHaveLength(0);
    await expect(
      insert("provider_freshness_bindings", { active: null }, " OR REPLACE"),
    ).rejects.toThrow();
    expect(
      (
        await insert(
          "provider_freshness_incidents",
          { warning_seconds: null, reopened_count: null },
          " OR REPLACE",
        )
      ).results[0],
    ).toMatchObject({ warning_seconds: 86400, reopened_count: 0 });
    for (const table of [
      "postal_policy_refresh_state",
      "resend_policy_refresh_state",
    ])
      expect(
        (await insert(table, { failure_count: null }, " OR REPLACE")).results[0]
          .failure_count,
      ).toBe(0);
  });

  it("retains exact tenant foreign keys and their cascade", async () => {
    await insert("provider_freshness_bindings", {
      organization_id: "fk-first",
    });
    await expect(
      insert(
        "provider_freshness_incidents",
        { organization_id: "fk-second" },
        "",
        false,
      ),
    ).rejects.toThrow();
    for (const organization_id of ["fk-first", "fk-second"])
      await insert("provider_freshness_incidents", { organization_id });
    await db.prepare("DELETE FROM organizations WHERE id='fk-first'").run();
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM provider_freshness_incidents WHERE organization_id='fk-first'",
        )
        .first("count"),
    ).toBe(0);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM provider_freshness_incidents WHERE organization_id='fk-second'",
        )
        .first("count"),
    ).toBe(1);
  });

  it("rolls back the whole batch on a fused required-value violation", async () => {
    await expect(
      db.batch([
        db.prepare("INSERT INTO organizations VALUES('atomic-rollback')"),
        db
          .prepare(
            "INSERT INTO provider_freshness_bindings VALUES(?,?,?,?,?,?)",
          )
          .bind("atomic-rollback", "fax_tariff", hash, 1, now, hash),
        db
          .prepare("INSERT INTO provider_freshness_cursors VALUES(?,?,?,?)")
          .bind("fax_legacy", null, "", now),
      ]),
    ).rejects.toThrow();
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM organizations WHERE id='atomic-rollback'",
        )
        .first("count"),
    ).toBe(0);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM provider_freshness_bindings WHERE organization_id='atomic-rollback'",
        )
        .first("count"),
    ).toBe(0);
    expect(await db.prepare("PRAGMA quick_check").first()).toEqual({
      quick_check: "ok",
    });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
});
