import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { refreshVerifiedFaxReferences } from "../../apps/api/src/verified-fax-reference-refresh";
import { insertRecord } from "../helpers/fax-usage-fixture";
import {
  createVerifiedFaxReferenceFixture,
  registerVerifiedFaxFixture,
  verifiedFaxCsv,
  verifiedFaxNetwork,
  verifiedBindingHash,
  VERIFIED_DECK_URL,
  type ReferenceRow,
  type VerifiedFaxReferenceFixture,
} from "../helpers/verified-fax-reference-fixture";

const DAY = 86400000;
const empty = {
  tariffsRefreshed: 0,
  tariffRefreshFailed: 0,
  tariffRefreshDeferred: 0,
  networkAttempted: false,
};
let mf: Miniflare, db: D1Database, clock: number;
let current: VerifiedFaxReferenceFixture;
const now = () => clock;
const stamp = () => new Date(clock).toISOString();

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
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await db.batch(
      unstable_splitSqlQuery(
        readFileSync(new URL(file, directory), "utf8"),
      ).map((sql) => db.prepare(sql)),
    );
});
afterAll(async () => mf?.dispose());
beforeEach(async () => {
  clock = Date.parse("2026-11-01T10:00:00.000Z");
  await db.batch([
    db.prepare("UPDATE verified_fax_reference_sets SET status='revoked'"),
    db.prepare("UPDATE channel_controls SET enabled=0"),
  ]);
  current = await createVerifiedFaxReferenceFixture(db, now);
});

async function rows(table = "trusted_fax_usage_tariffs") {
  return (
    await db
      .prepare(`SELECT * FROM ${table} WHERE organization_id=? ORDER BY 1`)
      .bind(current.fixture.ctx.organizationId)
      .all<ReferenceRow>()
  ).results;
}
async function state() {
  return db
    .prepare(
      "SELECT * FROM verified_fax_reference_state WHERE organization_id=? AND set_id=?",
    )
    .bind(current.fixture.ctx.organizationId, current.sourceId)
    .first<ReferenceRow>();
}
async function noExecution() {
  for (const table of [
    "approvals",
    "attempts",
    "outbox",
    "reservations",
    "welcome_credit_reservations",
    "expert_approval_acceptances",
    "fax_usage_settlements",
    "document_access_grants",
  ])
    expect(await rows(table)).toEqual([]);
}
const quote = () =>
  current.fixture.domain.prepareDispatch(
    current.fixture.ctx,
    current.fixture.input,
    crypto.randomUUID(),
  );
async function useCurrentFixture() {
  await db
    .prepare("UPDATE channel_controls SET enabled=0 WHERE organization_id=?")
    .bind(current.fixture.ctx.organizationId)
    .run();
  current = await createVerifiedFaxReferenceFixture(db, now, { current: true });
}

/** Miniflare accepts more parameters than production D1; enforce its real limits. */
function boundedDatabase(
  options: {
    loseCommitResponse?: boolean;
    expireLeaseBeforeCommit?: boolean;
  } = {},
) {
  const statements = new WeakMap<D1PreparedStatement, string>();
  const bindings = new WeakMap<D1PreparedStatement, unknown[]>();
  let maximumBindings = 0;
  let maximumSqlBytes = 0;
  let lostResponse = false;
  let expiredLease = false;
  const wrapped = {
    prepare(sql: string) {
      maximumSqlBytes = Math.max(
        maximumSqlBytes,
        new TextEncoder().encode(sql).byteLength,
      );
      expect(maximumSqlBytes).toBeLessThanOrEqual(100000);
      const prepared = db.prepare(sql);
      statements.set(prepared, sql);
      return new Proxy(prepared, {
        get(target, property) {
          if (property === "bind")
            return (...values: unknown[]) => {
              maximumBindings = Math.max(maximumBindings, values.length);
              expect(values.length).toBeLessThanOrEqual(100);
              const bound = target.bind(...values);
              statements.set(bound, sql);
              bindings.set(bound, values);
              return bound;
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
    async batch(batch: D1PreparedStatement[]) {
      const main = batch.some((statement) =>
        statements
          .get(statement)
          ?.includes("INSERT INTO verified_fax_reference_evidence"),
      );
      if (options.expireLeaseBeforeCommit && !expiredLease && main) {
        const payload = JSON.parse(String(bindings.get(batch[0])?.[0])) as {
          at: string;
          source: { organization_id: string; id: string };
        };
        await db
          .prepare(
            "UPDATE verified_fax_reference_state SET lease_until=? WHERE organization_id=? AND set_id=?",
          )
          .bind(
            new Date(Date.parse(payload.at) + 1).toISOString(),
            payload.source.organization_id,
            payload.source.id,
          )
          .run();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expiredLease = true;
      }
      const result = await db.batch(batch);
      if (options.loseCommitResponse && !lostResponse && main) {
        lostResponse = true;
        throw new Error("Isolated lost database response after commit");
      }
      return result;
    },
  } as unknown as D1Database;
  return {
    db: wrapped,
    maximumBindings: () => maximumBindings,
    maximumSqlBytes: () => maximumSqlBytes,
    lostResponse: () => lostResponse,
    expiredLease: () => expiredLease,
  };
}

describe("additive reference maintenance constraint boundaries", () => {
  it.each([
    ["sender_address_sha256", "CHECK"],
    ["status", "CHECK"],
    ["bindings_json", "CHECK"],
    ["sender_id", "(?:NOT NULL|CHECK)"],
  ])(
    "rejects a NULL required %s through its database constraint",
    async (field, kind) => {
      await expect(
        insertRecord(db, "verified_fax_reference_sets", {
          ...current.set,
          [field]: null,
        }),
      ).rejects.toThrow(
        new RegExp(kind + " constraint failed:[\\s\\S]*\\b" + field + "\\b"),
      );
      expect(await rows("verified_fax_reference_sets")).toEqual([]);
      expect(await rows("verified_fax_reference_state")).toEqual([]);
    },
  );

  it("preserves the NOT NULL replacement default when failure_count is explicitly NULL", async () => {
    await registerVerifiedFaxFixture(current);
    await db
      .prepare(
        "UPDATE verified_fax_reference_state SET failure_count=5 WHERE organization_id=? AND set_id=?",
      )
      .bind(current.fixture.ctx.organizationId, current.sourceId)
      .run();
    expect(await state()).toMatchObject({ failure_count: 5 });
    await db
      .prepare(
        "INSERT OR REPLACE INTO verified_fax_reference_state(organization_id,set_id,next_due_at,failure_count) VALUES(?,?,?,NULL)",
      )
      .bind(current.fixture.ctx.organizationId, current.sourceId, stamp())
      .run();
    expect(await state()).toMatchObject({
      failure_count: 0,
      next_due_at: stamp(),
      lease_token: null,
      lease_until: null,
      applying_revision_sha256: null,
      applying_plan_json: null,
    });
  });

  it.each([
    ["lease_token", "isolated_lease"],
    ["lease_until", "2026-11-01T10:03:00.000Z"],
    ["applying_revision_sha256", "a".repeat(64)],
    ["applying_plan_json", "{}"],
  ])("rejects a partial %s pair through its CHECK", async (field, value) => {
    await registerVerifiedFaxFixture(current);
    const before = await state();
    await expect(
      db
        .prepare(
          `UPDATE verified_fax_reference_state SET ${field}=? WHERE organization_id=? AND set_id=?`,
        )
        .bind(value, current.fixture.ctx.organizationId, current.sourceId)
        .run(),
    ).rejects.toThrow(
      new RegExp("CHECK constraint failed:[\\s\\S]*\\b" + field + "\\b"),
    );
    expect(await state()).toEqual(before);
  });

  it("enforces the tenant-scoped tariff FK independently of its earlier admission trigger", async () => {
    await registerVerifiedFaxFixture(current);
    const foreign = await createVerifiedFaxReferenceFixture(db, now);
    const foreignId = String(foreign.bindings[0].id);
    const trigger = await db
      .prepare(
        "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='admitted_verified_fax_reference_tariff'",
      )
      .first<{ sql: string }>();
    expect(trigger?.sql).toBeTruthy();
    // The complete fixture violates only the cross-tenant tariff FK. Removing
    // its earlier admission guard locally exposes that constraint's own error.
    await db
      .prepare("DROP TRIGGER admitted_verified_fax_reference_tariff")
      .run();
    try {
      await expect(
        insertRecord(db, "verified_fax_reference_tariffs", {
          organization_id: current.fixture.ctx.organizationId,
          set_id: current.sourceId,
          tariff_id: foreignId,
          binding_sha256: await verifiedBindingHash(
            current.fixture.ctx.organizationId,
            foreignId,
          ),
        }),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      await db.prepare(trigger!.sql).run();
    }
    expect(await rows("verified_fax_reference_tariffs")).toHaveLength(14);
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    expect(
      await db
        .prepare(
          "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='admitted_verified_fax_reference_tariff'",
        )
        .first(),
    ).toEqual(trigger);
  });
});

describe("exact registered FR/DE fax reference maintenance", () => {
  it.each(["missing", "duplicate", "changed", "foreign"])(
    "rejects a %s registration snapshot without creating state or mappings",
    async (failure) => {
      const bindings = [...current.bindings];
      if (failure === "missing") bindings.pop();
      if (failure === "duplicate") bindings[13] = bindings[0];
      if (failure === "changed") bindings[0] = { ...bindings[0], max_pages: 9 };
      if (failure === "foreign")
        bindings[0] = { ...bindings[0], organization_id: "another-tenant" };
      await expect(
        insertRecord(db, "verified_fax_reference_sets", {
          ...current.set,
          bindings_json: JSON.stringify(bindings),
        }),
      ).rejects.toThrow();
      expect(await rows("verified_fax_reference_sets")).toEqual([]);
      expect(await rows("verified_fax_reference_state")).toEqual([]);
      expect(await rows("verified_fax_reference_tariffs")).toEqual([]);
    },
  );

  it("renews exactly fourteen immutable references together within production D1 limits", async () => {
    await registerVerifiedFaxFixture(current);
    const before = await rows();
    const bounded = boundedDatabase();
    const fetcher = verifiedFaxNetwork(now);
    expect(
      await refreshVerifiedFaxReferences(
        { ...current.env, DB: bounded.db },
        { now, fetcher },
      ),
    ).toEqual({ ...empty, tariffsRefreshed: 14, networkAttempted: true });
    expect(bounded.maximumBindings()).toBeGreaterThan(0);
    expect(bounded.maximumBindings()).toBeLessThanOrEqual(100);
    expect(bounded.maximumSqlBytes()).toBeLessThanOrEqual(100000);
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url) === VERIFIED_DECK_URL),
    ).toHaveLength(1);
    const after = await rows();
    for (const previous of before) {
      const expected = current.bindings.some((row) => row.id === previous.id)
        ? { ...previous, status: "revoked" }
        : previous;
      expect(after.find((row) => row.id === previous.id)).toEqual(expected);
    }
    const next = after.filter(
      (row) => row.status === "qualified" && row.route_allowed === 1,
    );
    expect(next).toHaveLength(14);
    for (const row of next) {
      expect(row).toMatchObject({
        page_nano_usd: 9000000,
        minute_nano_usd: 10000001,
        call_nano_usd: 0,
        fx_numerator: 1,
        fx_denominator: 2,
        fx_date: stamp().slice(0, 10),
        valid_from: stamp(),
        expires_at: new Date(clock + 7 * DAY).toISOString(),
        max_pages: 10,
        quote_ttl_seconds: 300,
        route_qualification: "provider_verified",
        execution_scope: "live",
      });
      expect(row.source_reference).toBe(
        "automatic-public-reference:sha256:" + row.source_sha256,
      );
    }
    expect(await rows("verified_fax_reference_tariffs")).toHaveLength(28);
    const evidence = await rows("verified_fax_reference_evidence");
    expect(evidence).toHaveLength(1);
    expect(JSON.parse(String(evidence[0].tariff_ids_json)).sort()).toEqual(
      next.map((row) => row.id).sort(),
    );
    expect(await state()).toMatchObject({
      last_success_at: stamp(),
      last_error_code: null,
      next_due_at: new Date(clock + DAY).toISOString(),
      lease_token: null,
      applying_plan_json: null,
    });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    await noExecution();
    expect(
      await refreshVerifiedFaxReferences(current.env, { now, fetcher }),
    ).toEqual(empty);
    expect(fetcher).toHaveBeenCalledTimes(7);

    clock += DAY;
    const rotated = verifiedFaxNetwork(now, {
      deckUrl: VERIFIED_DECK_URL.replace("fixture.csv", "rotated_fixture.csv"),
      csv: verifiedFaxCsv().replaceAll("0.010000001", "0.020000002"),
    });
    expect(
      await refreshVerifiedFaxReferences(current.env, {
        now,
        fetcher: rotated,
      }),
    ).toEqual({
      ...empty,
      tariffsRefreshed: 14,
      networkAttempted: true,
    });
    expect(await rows("verified_fax_reference_evidence")).toHaveLength(2);
    expect(
      (await rows())
        .filter((row) => row.status === "qualified" && row.route_allowed === 1)
        .every((row) => row.minute_nano_usd === 20000002),
    ).toBe(true);
    await noExecution();
  });

  it.each(["source", "ownership"])(
    "retains all fourteen old prices when current %s evidence is unavailable",
    async (failure) => {
      await registerVerifiedFaxFixture(current);
      const before = await rows();
      const fetcher = verifiedFaxNetwork(
        now,
        failure === "source"
          ? { pageStatus: 503 }
          : { whitelist: ["LU", "FR"] },
      );
      expect(
        await refreshVerifiedFaxReferences(current.env, { now, fetcher }),
      ).toEqual({
        ...empty,
        tariffRefreshFailed: 1,
        networkAttempted: true,
      });
      expect(await rows()).toEqual(before);
      expect(await rows("verified_fax_reference_evidence")).toEqual([]);
      expect(await state()).toMatchObject({
        failure_count: 1,
        last_success_at: null,
        last_error_code:
          failure === "source" ? "SOURCE_HTTP" : "PROVIDER_UNAVAILABLE",
        next_due_at: new Date(clock + 3600000).toISOString(),
        lease_token: null,
      });
      await noExecution();
    },
  );

  it("defers the whole group before any GET while an unexpired quote binds one price", async () => {
    await useCurrentFixture();
    await registerVerifiedFaxFixture(current);
    const dispatch = await quote();
    const before = await rows();
    const snapshot = await db
      .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
      .bind(dispatch.id)
      .first();
    const fetcher = verifiedFaxNetwork(now);
    expect(
      await refreshVerifiedFaxReferences(current.env, { now, fetcher }),
    ).toEqual({ ...empty, tariffRefreshDeferred: 1 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await rows()).toEqual(before);
    expect(
      await db
        .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
        .bind(dispatch.id)
        .first(),
    ).toEqual(snapshot);
    expect(await state()).toMatchObject({
      last_error_code: "QUOTE_ACTIVE",
      failure_count: 0,
    });
    await noExecution();
  });

  it.each(["queued", "submission_unknown"])(
    "retains a %s dispatch and its immutable price after its quote deadline",
    async (status) => {
      await useCurrentFixture();
      await registerVerifiedFaxFixture(current);
      const prepared = await quote();
      const { domain, ctx, identity } = current.fixture;
      await domain.approveDispatch(ctx, prepared.id, prepared.fingerprint);
      await domain.confirmDispatch(ctx, prepared.id, crypto.randomUUID());
      let syntheticSubmissions = 0;
      if (status === "submission_unknown")
        await domain.processDispatch(prepared.id, {
          name: "telnyx",
          liveFaxIdentity: identity,
          submit: async (dispatch) => {
            syntheticSubmissions++;
            await db
              .prepare(
                "UPDATE attempts SET bridge_claimed_at=? WHERE id=? AND bridge_claimed_at IS NULL",
              )
              .bind(stamp(), dispatch.active_attempt_id)
              .run();
            return {
              status: "submission_unknown",
              providerId: "isolated_unknown_" + dispatch.id,
            };
          },
        });
      expect(syntheticSubmissions).toBe(status === "queued" ? 0 : 1);
      const tables = [
        "dispatches",
        "live_fax_quotes_v3",
        "approvals",
        "attempts",
        "outbox",
        "reservations",
        "welcome_credit_reservations",
        "usage",
      ];
      const snapshots = await Promise.all(tables.map((table) => rows(table)));
      expect(snapshots[0][0].status).toBe(status);
      const prices = await rows();
      clock += 600000;
      const fetcher = verifiedFaxNetwork(now);
      expect(
        await refreshVerifiedFaxReferences(current.env, { now, fetcher }),
      ).toEqual({ ...empty, tariffRefreshDeferred: 1 });
      expect(fetcher).not.toHaveBeenCalled();
      expect(await rows()).toEqual(prices);
      expect(await Promise.all(tables.map((table) => rows(table)))).toEqual(
        snapshots,
      );
      expect(await rows("verified_fax_reference_evidence")).toEqual([]);
      expect(await state()).toMatchObject({ last_error_code: "QUOTE_ACTIVE" });
    },
  );

  it.each(["source", "sender", "exclusion", "current", "quote"])(
    "fences all fourteen mutations when %s changes during the GETs",
    async (failure) => {
      if (failure === "quote") await useCurrentFixture();
      await registerVerifiedFaxFixture(current);
      let before: ReferenceRow[] = [];
      let changed = false;
      const fetcher = verifiedFaxNetwork(now, {
        before: async (url) => {
          if (changed || url !== VERIFIED_DECK_URL) return;
          changed = true;
          if (failure === "source")
            await db
              .prepare(
                "UPDATE verified_fax_reference_sets SET status='revoked' WHERE organization_id=? AND id=?",
              )
              .bind(current.fixture.ctx.organizationId, current.sourceId)
              .run();
          else if (failure === "sender")
            await db
              .prepare(
                "UPDATE senders SET status='disabled' WHERE organization_id=? AND id=?",
              )
              .bind(current.fixture.ctx.organizationId, current.set.sender_id)
              .run();
          else if (failure === "exclusion" || failure === "current")
            await db
              .prepare(
                "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
              )
              .bind(
                current.fixture.ctx.organizationId,
                failure === "exclusion"
                  ? current.exclusions[0].id
                  : current.bindings[0].id,
              )
              .run();
          else await quote();
          before = await rows();
        },
      });
      const result = await refreshVerifiedFaxReferences(current.env, {
        now,
        fetcher,
      });
      expect(changed).toBe(true);
      expect(result).toEqual({
        ...empty,
        networkAttempted: true,
        ...(failure === "quote"
          ? { tariffRefreshDeferred: 1 }
          : { tariffRefreshFailed: 1 }),
      });
      expect(await rows()).toEqual(before);
      expect(await rows("verified_fax_reference_tariffs")).toHaveLength(14);
      expect(await rows("verified_fax_reference_evidence")).toEqual([]);
      await noExecution();
    },
  );

  it("rolls back every predecessor revocation if a replacement insert fails", async () => {
    await registerVerifiedFaxFixture(current);
    const before = await rows();
    await db
      .prepare(
        `CREATE TRIGGER isolated_reject_verified_tariff BEFORE INSERT ON trusted_fax_usage_tariffs WHEN NEW.organization_id='${current.fixture.ctx.organizationId}' BEGIN SELECT RAISE(ABORT,'isolated replacement rejection'); END`,
      )
      .run();
    try {
      expect(
        await refreshVerifiedFaxReferences(current.env, {
          now,
          fetcher: verifiedFaxNetwork(now),
        }),
      ).toEqual({ ...empty, tariffRefreshFailed: 1, networkAttempted: true });
      expect(await rows()).toEqual(before);
      expect(await rows("verified_fax_reference_evidence")).toEqual([]);
      expect(await rows("verified_fax_reference_tariffs")).toHaveLength(14);
    } finally {
      await db.prepare("DROP TRIGGER isolated_reject_verified_tariff").run();
    }
    await noExecution();
  });

  it("preserves the shorter original validity lifetime on every renewed route", async () => {
    await useCurrentFixture();
    await registerVerifiedFaxFixture(current);
    expect(
      await refreshVerifiedFaxReferences(current.env, {
        now,
        fetcher: verifiedFaxNetwork(now),
      }),
    ).toEqual({ ...empty, tariffsRefreshed: 14, networkAttempted: true });
    const active = (await rows()).filter(
      (row) => row.status === "qualified" && row.route_allowed === 1,
    );
    expect(active).toHaveLength(14);
    expect(
      active.every(
        (row) => row.expires_at === new Date(clock + 6 * DAY).toISOString(),
      ),
    ).toBe(true);
    await noExecution();
  });

  it("fences a completed read when its lease has expired before the database commit", async () => {
    await registerVerifiedFaxFixture(current);
    const before = await rows();
    let advanced = false;
    const fetcher = verifiedFaxNetwork(now, {
      before: async (url) => {
        if (!advanced && url === VERIFIED_DECK_URL) {
          advanced = true;
          clock += 180001;
        }
      },
    });
    expect(
      await refreshVerifiedFaxReferences(current.env, { now, fetcher }),
    ).toEqual({ ...empty, tariffRefreshFailed: 1, networkAttempted: true });
    expect(advanced).toBe(true);
    expect(await rows()).toEqual(before);
    expect(await rows("verified_fax_reference_evidence")).toEqual([]);
    expect(await state()).toMatchObject({
      last_error_code: "COMMIT_CHANGED",
      last_success_at: null,
      lease_token: null,
    });
    await noExecution();
  });

  it("positively reconciles a committed batch after its database response is lost", async () => {
    await registerVerifiedFaxFixture(current);
    const bounded = boundedDatabase({ loseCommitResponse: true });
    const fetcher = verifiedFaxNetwork(now);
    expect(
      await refreshVerifiedFaxReferences(
        { ...current.env, DB: bounded.db },
        { now, fetcher },
      ),
    ).toEqual({ ...empty, tariffsRefreshed: 14, networkAttempted: true });
    expect(bounded.lostResponse()).toBe(true);
    expect(await rows("verified_fax_reference_evidence")).toHaveLength(1);
    expect(await rows("verified_fax_reference_tariffs")).toHaveLength(28);
    expect(
      await refreshVerifiedFaxReferences(current.env, { now, fetcher }),
    ).toEqual(empty);
    expect(fetcher).toHaveBeenCalledTimes(7);
    await noExecution();
  });

  it("checks the real SQLite execution clock after waiting beyond the lease", async () => {
    clock = Date.now();
    await useCurrentFixture();
    await registerVerifiedFaxFixture(current);
    const before = await rows();
    const bounded = boundedDatabase({ expireLeaseBeforeCommit: true });
    expect(
      await refreshVerifiedFaxReferences(
        { ...current.env, DB: bounded.db },
        { fetcher: verifiedFaxNetwork(Date.now) },
      ),
    ).toEqual({ ...empty, tariffRefreshFailed: 1, networkAttempted: true });
    expect(bounded.expiredLease()).toBe(true);
    expect(await rows()).toEqual(before);
    expect(await rows("verified_fax_reference_evidence")).toEqual([]);
    expect(await rows("verified_fax_reference_tariffs")).toHaveLength(14);
    expect(await state()).toMatchObject({ last_error_code: "COMMIT_CHANGED" });
    await noExecution();
  });

  it("allows only one network attempt and one revision while a lease is held", async () => {
    await registerVerifiedFaxFixture(current);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const fetcher = verifiedFaxNetwork(now, {
      before: async (url) => {
        if (url === "https://api.telnyx.com/v2/tariffs") {
          entered();
          await gate;
        }
      },
    });
    const first = refreshVerifiedFaxReferences(current.env, { now, fetcher });
    await started;
    try {
      expect(
        await refreshVerifiedFaxReferences(current.env, { now, fetcher }),
      ).toEqual(empty);
    } finally {
      release();
    }
    expect(await first).toEqual({
      ...empty,
      tariffsRefreshed: 14,
      networkAttempted: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(await rows("verified_fax_reference_evidence")).toHaveLength(1);
    await noExecution();
  });
});
