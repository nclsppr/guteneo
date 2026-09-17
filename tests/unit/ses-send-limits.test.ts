import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  submitSesWithLimits,
  type SesSendLimitScope,
} from "../../apps/api/src/ses-send-limits";
import type { ProviderResult } from "../../packages/providers";

let mf: Miniflare;
let db: D1Database;
const epoch = Date.parse("2026-09-17T10:00:00.000Z");
const day = 86_400_000;
const accepted = (): ProviderResult => ({
  status: "accepted",
  providerId: "fixture-provider-id",
});
const rejected = (): ProviderResult => ({
  status: "rejected",
  errorCode: "SES_IDENTITY_NOT_VERIFIED",
});
async function apply(sql: string) {
  let statement = "";
  let trigger = false;
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line} `;
    if (trigger ? line === "END;" : line.endsWith(";")) {
      await db.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  if (statement) throw new Error("Unterminated fixture SQL");
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  // These tests isolate transport concurrency on real workerd D1. Complete
  // approval/content/money invariants are exercised by live-providers tests.
  await apply(`CREATE TABLE dispatches(id TEXT PRIMARY KEY,organization_id TEXT,active_attempt_id TEXT,status TEXT,mode TEXT,channel TEXT,provider TEXT,provider_id TEXT,updated_at TEXT);
CREATE TABLE attempts(id TEXT PRIMARY KEY,organization_id TEXT,dispatch_id TEXT,status TEXT,provider TEXT,bridge_claimed_at TEXT,updated_at TEXT);`);
  await apply(
    readFileSync(
      new URL("../../migrations/0017_ses_send_limits.sql", import.meta.url),
      "utf8",
    ),
  );
});
afterAll(async () => {
  await mf.dispose();
});
beforeEach(async () => {
  for (const table of [
    "ses_send_reservations",
    "ses_send_limit_policies",
    "attempts",
    "dispatches",
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
});
async function fixture(
  id: string,
  changes: Partial<SesSendLimitScope> = {},
): Promise<SesSendLimitScope> {
  const scope = {
    accountId: "123456789012",
    region: "eu-west-3",
    sandbox: true,
    organizationId: `org_${id}`,
    dispatchId: `dispatch_${id}`,
    attemptId: `attempt_${id}`,
    ...changes,
  };
  await db.batch([
    db
      .prepare(
        "INSERT INTO dispatches(id,organization_id,active_attempt_id,status,mode,channel,provider) VALUES(?,?,?,'submitting','production','email','ses')",
      )
      .bind(scope.dispatchId, scope.organizationId, scope.attemptId),
    db
      .prepare("INSERT INTO attempts VALUES(?,?,?,'started','ses',?,?)")
      .bind(
        scope.attemptId,
        scope.organizationId,
        scope.dispatchId,
        new Date(epoch).toISOString(),
        new Date(epoch).toISOString(),
      ),
  ]);
  return scope;
}
const send = (
  scope: SesSendLimitScope,
  at: number,
  callback: () => Promise<ProviderResult> = async () => accepted(),
) => submitSesWithLimits(db, scope, callback, { now: () => at });
async function policy(daily: number, interval: number, expires = epoch + day) {
  await db
    .prepare(
      "INSERT INTO ses_send_limit_policies VALUES('123456789012','eu-west-3',?,?,'qualified-local-fixture',?,?,?,'qualified')",
    )
    .bind(daily, interval, "a".repeat(64), epoch, expires)
    .run();
}

describe("SES account and region transport quota on D1", () => {
  it("serializes simultaneous sends across organizations and repeated calls to the same attempt", async () => {
    const scopes = await Promise.all(
      Array.from({ length: 20 }, (_, i) => fixture(String(i))),
    );
    const callback = vi.fn(async () => accepted());
    const results = await Promise.all(
      scopes.map((scope) => send(scope, epoch, callback)),
    );
    expect(results.filter((r) => r.status === "accepted")).toHaveLength(1);
    expect(
      results.filter((r) => r.errorCode === "SES_ACCOUNT_RATE_LIMIT"),
    ).toHaveLength(19);
    expect(callback).toHaveBeenCalledTimes(1);
    const winner = scopes[results.findIndex((r) => r.status === "accepted")];
    expect(await send(winner, epoch + day * 3, callback)).toMatchObject({
      status: "submission_unknown",
      errorCode: "SES_ATTEMPT_ALREADY_RESERVED",
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(
      await send(
        { ...winner, accountId: "999999999999" },
        epoch + day * 3,
        callback,
      ),
    ).toMatchObject({
      status: "submission_unknown",
      errorCode: "SES_ATTEMPT_ALREADY_RESERVED",
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("allows exactly 200 recipients in a rolling 24h window, including exact boundary behavior", async () => {
    for (let i = 0; i < 200; i++)
      expect(
        (await send(await fixture(String(i)), epoch + i * 1000)).status,
      ).toBe("accepted");
    const overflow = await fixture("overflow");
    const callback = vi.fn(async () => accepted());
    expect(await send(overflow, epoch + day - 1, callback)).toMatchObject({
      errorCode: "SES_ACCOUNT_DAILY_LIMIT",
    });
    expect(callback).not.toHaveBeenCalled();
    expect((await send(overflow, epoch + day, callback)).status).toBe(
      "accepted",
    );
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("holds an in-flight mutex and measures the second from completion, not reservation time", async () => {
    let release!: (value: ProviderResult) => void;
    let time = epoch;
    const first = await fixture("first");
    const second = await fixture("second");
    const firstCall = submitSesWithLimits(
      db,
      first,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      { now: () => time },
    );
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    time += 20_000;
    expect(await send(second, time)).toMatchObject({
      errorCode: "SES_ACCOUNT_RATE_LIMIT",
    });
    release(accepted());
    await firstCall;
    expect(await send(second, time + 999)).toMatchObject({
      errorCode: "SES_ACCOUNT_RATE_LIMIT",
    });
    expect((await send(second, time + 1000)).status).toBe("accepted");
  });
  it("uses the acknowledgement timestamp for the full rolling window", async () => {
    await policy(1, 1000, epoch + day * 3);
    const first = await fixture("first");
    let calls = 0;
    await submitSesWithLimits(db, first, async () => accepted(), {
      now: () => epoch + (calls++ ? 20_000 : 0),
    });
    const second = await fixture("second");
    expect(await send(second, epoch + day)).toMatchObject({
      errorCode: "SES_ACCOUNT_DAILY_LIMIT",
    });
    expect((await send(second, epoch + day + 20_000)).status).toBe("accepted");
  });
  it("releases daily quota only for explicit rejection and keeps the rate cooldown", async () => {
    await policy(1, 1000);
    await send(await fixture("first"), epoch, async () => rejected());
    const next = await fixture("next");
    expect(await send(next, epoch + 999)).toMatchObject({
      errorCode: "SES_ACCOUNT_RATE_LIMIT",
    });
    expect((await send(next, epoch + 1000)).status).toBe("accepted");
  });
  it.each(["returned", "thrown", "missing-reference"])(
    "retains unknown quota beyond 24h (%s), with no automatic resubmission",
    async (kind) => {
      await policy(1, 1000, epoch + day * 4);
      const first = await fixture("first");
      const callback = vi.fn(async (): Promise<ProviderResult> => {
        if (kind === "thrown")
          throw new Error("lost response with private details");
        return kind === "missing-reference"
          ? { status: "accepted" }
          : { status: "submission_unknown", errorCode: "SES_RESPONSE_UNKNOWN" };
      });
      expect((await send(first, epoch, callback)).status).toBe(
        "submission_unknown",
      );
      expect(await send(await fixture("next"), epoch + day * 2)).toMatchObject({
        errorCode: "SES_ACCOUNT_DAILY_LIMIT",
      });
      expect(await send(first, epoch + day * 2, callback)).toMatchObject({
        errorCode: "SES_ATTEMPT_ALREADY_RESERVED",
      });
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );
  it("separates accounts and regions, not tenants or rotating credentials", async () => {
    expect((await send(await fixture("first"), epoch)).status).toBe("accepted");
    expect(
      (
        await send(
          await fixture("account", { accountId: "999999999999" }),
          epoch,
        )
      ).status,
    ).toBe("accepted");
    expect(
      (await send(await fixture("region", { region: "eu-west-1" }), epoch))
        .status,
    ).toBe("accepted");
    expect(
      await send(
        await fixture("tenant", { organizationId: "other_tenant" }),
        epoch,
      ),
    ).toMatchObject({ errorCode: "SES_ACCOUNT_RATE_LIMIT" });
  });
  it("requires the active tenant-scoped production SES attempt and durable bridge claim", async () => {
    const scope = await fixture("one");
    const callback = vi.fn(async () => accepted());
    for (const changes of [
      { organizationId: "different" },
      { dispatchId: "different" },
      { attemptId: "different" },
    ])
      expect(
        await send({ ...scope, ...changes }, epoch, callback),
      ).toMatchObject({ errorCode: "SES_ACTIVE_ATTEMPT_REQUIRED" });
    await db.prepare("UPDATE attempts SET bridge_claimed_at=NULL").run();
    expect(await send(scope, epoch, callback)).toMatchObject({
      errorCode: "SES_ACTIVE_ATTEMPT_REQUIRED",
    });
    await db
      .prepare("UPDATE attempts SET bridge_claimed_at=?")
      .bind(new Date(epoch).toISOString())
      .run();
    await db.prepare("UPDATE dispatches SET mode='simulation'").run();
    expect(await send(scope, epoch, callback)).toMatchObject({
      errorCode: "SES_ACTIVE_ATTEMPT_REQUIRED",
    });
    expect(callback).not.toHaveBeenCalled();
  });
  it("bounds policy overrides and never raises sandbox limits", async () => {
    await policy(500, 1);
    await send(await fixture("first"), epoch);
    expect(await send(await fixture("sandbox"), epoch + 1)).toMatchObject({
      errorCode: "SES_ACCOUNT_RATE_LIMIT",
    });
    expect(
      (await send(await fixture("production", { sandbox: false }), epoch + 1))
        .status,
    ).toBe("accepted");
    for (const [daily, interval] of [
      [100001, 1],
      [0, 1],
      [2, 0],
      [2, 60001],
    ])
      await expect(
        db
          .prepare(
            "UPDATE ses_send_limit_policies SET max_recipients_24h=?,min_interval_ms=?",
          )
          .bind(daily, interval)
          .run(),
      ).rejects.toThrow();
  });
  it("expired and revoked policies revert to conservative default limits", async () => {
    await policy(500, 1, epoch + 10_000);
    await send(await fixture("first", { sandbox: false }), epoch + 10_000);
    expect(
      await send(await fixture("next", { sandbox: false }), epoch + 10_001),
    ).toMatchObject({ errorCode: "SES_ACCOUNT_RATE_LIMIT" });
    await db
      .prepare(
        "UPDATE ses_send_limit_policies SET status='revoked',expires_at_ms=?",
      )
      .bind(epoch + day)
      .run();
    expect(
      await send(await fixture("revoked", { sandbox: false }), epoch + 10_001),
    ).toMatchObject({ errorCode: "SES_ACCOUNT_RATE_LIMIT" });
  });
  it("domain crash reconciliation frees the mutex while retaining unknown quota and tenant binding", async () => {
    const first = await fixture("crashed");
    const next = await fixture("next");
    await db
      .prepare(
        "INSERT INTO ses_send_reservations VALUES(?,?,?,?,?,'reserved',?,NULL,200,1000)",
      )
      .bind(
        first.attemptId,
        first.organizationId,
        first.dispatchId,
        first.accountId,
        first.region,
        epoch,
      )
      .run();
    expect(await send(next, epoch + day)).toMatchObject({
      errorCode: "SES_ACCOUNT_RATE_LIMIT",
    });
    await db
      .prepare("UPDATE attempts SET status='unknown',updated_at=? WHERE id=?")
      .bind(new Date(epoch + day).toISOString(), first.attemptId)
      .run();
    expect(
      await db
        .prepare("SELECT status FROM ses_send_reservations WHERE attempt_id=?")
        .bind(first.attemptId)
        .first(),
    ).toEqual({ status: "unknown" });
    expect(await send(next, epoch + day + 999)).toMatchObject({
      errorCode: "SES_ACCOUNT_RATE_LIMIT",
    });
    expect((await send(next, epoch + day + 1000)).status).toBe("accepted");
    await expect(
      db
        .prepare(
          "UPDATE ses_send_reservations SET account_id='999999999999' WHERE attempt_id=?",
        )
        .bind(first.attemptId)
        .run(),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.prepare("DELETE FROM attempts WHERE id=?").bind(first.attemptId).run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
  it("fails closed on malformed configuration or unavailable D1 before provider invocation", async () => {
    const scope = await fixture("one");
    const callback = vi.fn(async () => accepted());
    expect(
      await send({ ...scope, accountId: "access-key" }, epoch, callback),
    ).toMatchObject({ errorCode: "SES_LIMITS_NOT_CONFIGURED" });
    expect(await send(scope, NaN, callback)).toMatchObject({
      errorCode: "SES_LIMITS_NOT_CONFIGURED",
    });
    const broken = {
      batch: async () => {
        throw new Error("private database details");
      },
    } as unknown as D1Database;
    expect(
      await submitSesWithLimits(broken, scope, callback, { now: () => epoch }),
    ).toEqual({
      status: "rejected",
      errorCode: "SES_LIMITS_UNAVAILABLE",
      retryable: false,
    });
    expect(callback).not.toHaveBeenCalled();
  });
  it.each(["accepted", "delivered", "bounced", "complained", "failed"])(
    "counts a later bound SES %s fact as acceptance, never as a quota refund",
    async (status) => {
      await policy(1, 1000, epoch + day * 4);
      const first = await fixture("first");
      await send(first, epoch, async () => ({ status: "submission_unknown" }));
      const observed = epoch + 60_000;
      await db
        .prepare(
          "UPDATE dispatches SET status=?,provider_id='known-ses-id',updated_at=? WHERE id=?",
        )
        .bind(status, new Date(observed).toISOString(), first.dispatchId)
        .run();
      expect(
        await db
          .prepare(
            "SELECT status,completed_at_ms FROM ses_send_reservations WHERE attempt_id=?",
          )
          .bind(first.attemptId)
          .first(),
      ).toEqual({ status: "accepted", completed_at_ms: observed });
      const next = await fixture("next");
      expect(await send(next, observed + day - 1)).toMatchObject({
        errorCode: "SES_ACCOUNT_DAILY_LIMIT",
      });
      expect((await send(next, observed + day)).status).toBe("accepted");
    },
  );
});
