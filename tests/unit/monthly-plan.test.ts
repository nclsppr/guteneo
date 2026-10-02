import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { hashSecret, type AuthContext } from "../../apps/api/src/auth";
import {
  getHorizonStatus,
  handleMonthlyPlanRoute,
  HORIZON_TERMS_VERSION,
  horizonPeriodEnd,
  renewHorizonPlans,
  requireHorizonPlan,
  type HorizonEnv,
} from "../../apps/api/src/monthly-plan";
import { readWelcomeCredit } from "../../packages/domain/src/welcome-credit";

let mf: Miniflare;
let DB: D1Database;
const origin = "http://localhost:8787";
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "monthly-plan-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  const files = (await readdir(new URL("../../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    const sql = await readFile(
      new URL(`../../migrations/${name}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (line.startsWith("CREATE TRIGGER") && !line.endsWith("END;"))
        trigger = true;
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await DB.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
  }
});
afterAll(async () => mf?.dispose());
afterEach(() => vi.restoreAllMocks());

async function fixture(mode: "production" | "simulation" = "simulation") {
  const id = crypto.randomUUID().replaceAll("-", "");
  const now = new Date().toISOString();
  const actor: AuthContext = {
    organizationId: `org_${id}`,
    userId: `user_${id}`,
    role: "admin",
    actor: "browser",
  };
  await DB.batch([
    DB.prepare(
      "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,?,?)",
    ).bind(actor.organizationId, "Horizon fixture", mode, now),
    DB.prepare(
      "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
    ).bind(actor.userId, "Admin fixture", `${id}@example.invalid`, now),
    DB.prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
    ).bind(actor.organizationId, actor.userId, now),
  ]);
  const secret = crypto.randomUUID().replaceAll("-", "") + "01234567890";
  const tokenHash = await hashSecret(secret);
  const csrf = `csrf_${id}`;
  await DB.prepare(
    "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,?,1,0,?,?,1)",
  )
    .bind(
      tokenHash,
      actor.userId,
      actor.organizationId,
      csrf,
      now,
      new Date(Date.now() + 3600_000).toISOString(),
    )
    .run();
  const env: HorizonEnv = {
    DB,
    ENVIRONMENT: "local",
    MODE: mode,
    APP_ORIGIN: origin,
    HORIZON_ENABLED: "true",
    PDF_VALIDATOR: {
      fetch: async () => new Response("fixture"),
    } as unknown as Fetcher,
  };
  const request = (
    path: string,
    key: string = crypto.randomUUID(),
    body: unknown = { consent: true, termsVersion: HORIZON_TERMS_VERSION },
    extra: HeadersInit = {},
  ) =>
    new Request(`${origin}${path}`, {
      method: path === "/api/plan" ? "GET" : "POST",
      headers: {
        Origin: origin,
        Cookie: `guteneo_session=${secret}`,
        "X-CSRF-Token": csrf,
        "Idempotency-Key": key,
        ...extra,
      },
      ...(path === "/api/plan" ? {} : { body: JSON.stringify(body) }),
    });
  const subscribe = (key?: string) =>
    handleMonthlyPlanRoute(request("/api/plan/subscribe", key), env);
  const cancel = (key?: string) =>
    handleMonthlyPlanRoute(request("/api/plan/cancel", key, {}), env);
  return { actor, env, request, subscribe, cancel, tokenHash, csrf };
}
async function count(organizationId: string) {
  return (await DB.prepare(
    "SELECT count(*) n FROM horizon_plan_charges WHERE organization_id=?",
  )
    .bind(organizationId)
    .first<{ n: number }>())!.n;
}
async function injectSimulationCredit(organizationId: string) {
  // Explicit test-only adjustment; never changes production grants or adds a top-up API.
  await DB.prepare(
    "CREATE TABLE horizon_test_credit_adjustments(organization_id TEXT PRIMARY KEY,amount_minor INTEGER)",
  ).run();
  await DB.prepare("INSERT INTO horizon_test_credit_adjustments VALUES(?,3000)")
    .bind(organizationId)
    .run();
  await DB.prepare("DROP VIEW horizon_available_credits").run();
  await DB.prepare(
    "CREATE VIEW horizon_available_credits AS SELECT organization_id,'production' AS evidence,available_minor FROM welcome_credit_balances UNION ALL SELECT b.organization_id,'simulation' AS evidence,b.available_minor+COALESCE(t.amount_minor,0) AS available_minor FROM horizon_simulation_credit_balances b LEFT JOIN horizon_test_credit_adjustments t ON t.organization_id=b.organization_id",
  ).run();
  return async () => {
    await DB.prepare("DROP VIEW horizon_available_credits").run();
    await DB.prepare(
      "CREATE VIEW horizon_available_credits AS SELECT organization_id,'production' AS evidence,available_minor FROM welcome_credit_balances UNION ALL SELECT organization_id,'simulation' AS evidence,available_minor FROM horizon_simulation_credit_balances",
    ).run();
    await DB.prepare("DROP TABLE horizon_test_credit_adjustments").run();
  };
}
async function reserve(organizationId: string, amount = 2500) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await DB.prepare(
    "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Fixture','fixture@example.invalid','verified','production',?)",
  )
    .bind(id, organizationId, now)
    .run();
  await DB.prepare(
    "INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES(?,?,'email','{}',?,'fixture@example.invalid','{}','queued','production',?,?,'EUR','fixture',?,'fixture',?,?)",
  )
    .bind(id, organizationId, id, amount, amount, id, now, now)
    .run();
  await DB.prepare(
    "INSERT INTO welcome_credit_reservations(organization_id,dispatch_id,amount_minor,charge_minor,status,created_at,updated_at) VALUES(?,?,?,?,'reserved',?,?)",
  )
    .bind(organizationId, id, amount, amount, now, now)
    .run();
}

describe("monthly Horizon account-credit plan", () => {
  it("shares the tenant HTTP budget and stops excess subscriptions before consent or debit", async () => {
    const f = await fixture();
    const other = await fixture();
    const window = Math.floor(Date.now() / 60_000);
    vi.spyOn(Date, "now").mockReturnValue(window * 60_000 + 5000);
    await DB.prepare(
      "INSERT INTO http_limits(organization_id,window_start,count) VALUES(?,?,179)",
    )
      .bind(f.actor.organizationId, window)
      .run();
    expect(
      (await handleMonthlyPlanRoute(f.request("/api/plan"), f.env))?.status,
    ).toBe(200);
    const denied = await f.subscribe();
    expect(denied?.status).toBe(429);
    expect(denied?.headers.get("Retry-After")).toBe("60");
    expect(denied?.headers.get("Cache-Control")).toBe("no-store");
    expect(await denied?.json()).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect(await count(f.actor.organizationId)).toBe(0);
    expect(
      await DB.prepare(
        "SELECT id FROM horizon_plan_actions WHERE organization_id=?",
      )
        .bind(f.actor.organizationId)
        .first(),
    ).toBeNull();
    expect((await other.subscribe())?.status).toBe(200);
    expect(await count(other.actor.organizationId)).toBe(1);
    // Invalid CSRF never spends another account's authenticated HTTP budget.
    await expect(
      handleMonthlyPlanRoute(
        f.request("/api/plan/subscribe", undefined, undefined, {
          "X-CSRF-Token": "wrong",
        }),
        f.env,
      ),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    expect(
      await DB.prepare(
        "SELECT count FROM http_limits WHERE organization_id=? AND window_start=?",
      )
        .bind(f.actor.organizationId, window)
        .first(),
    ).toEqual({ count: 181 });
  });
  it("uses fixed immutable terms and a shared production balance; simulation stays separate", async () => {
    const real = await fixture("production");
    const sim = await fixture();
    const response = await real.subscribe();
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.json()).toMatchObject({
      plan: {
        id: "horizon",
        name: "guteneo Horizon",
        priceMinor: 3000,
        currency: "EUR",
        interval: "month",
      },
      status: "active",
      entitled: true,
      creditAvailableMinor: 2000,
      evidence: "production",
    });
    expect(
      await readWelcomeCredit(DB, real.actor.organizationId),
    ).toMatchObject({
      spentMinor: 3000,
      availableMinor: 2000,
      kind: "promotional",
    });
    await sim.subscribe();
    expect(await getHorizonStatus(sim.env, sim.actor)).toMatchObject({
      evidence: "simulation",
      creditAvailableMinor: 2000,
      entitled: true,
    });
    expect(await readWelcomeCredit(DB, sim.actor.organizationId)).toMatchObject(
      { spentMinor: 0, availableMinor: 0, kind: "simulation" },
    );
    const charge = await DB.prepare(
      "SELECT amount_minor,current_period_start,consent_action_id FROM horizon_plan_charges WHERE organization_id=?",
    )
      .bind(real.actor.organizationId)
      .first();
    await expect(
      DB.prepare(
        "UPDATE horizon_plan_charges SET amount_minor=0 WHERE organization_id=?",
      )
        .bind(real.actor.organizationId)
        .run(),
    ).rejects.toThrow();
    await expect(
      DB.prepare("DELETE FROM horizon_plan_actions WHERE organization_id=?")
        .bind(real.actor.organizationId)
        .run(),
    ).rejects.toThrow();
    expect(charge).toMatchObject({ amount_minor: 3000 });
  });
  it("serializes concurrent subscription, replay and different consent keys without double debit", async () => {
    const f = await fixture("production");
    const key = "same_subscription_001";
    const results = await Promise.all([
      f.subscribe(key),
      f.subscribe(key),
      f.subscribe("different_key_001"),
    ]);
    expect(results.every((r) => r?.status === 200)).toBe(true);
    expect(await count(f.actor.organizationId)).toBe(1);
    expect(await getHorizonStatus(f.env, f.actor)).toMatchObject({
      creditAvailableMinor: 2000,
    });
    await expect(f.cancel(key)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
  it("preserves paid access on cancellation, and resubscription keeps the original period", async () => {
    const f = await fixture();
    await f.subscribe();
    const before = await getHorizonStatus(f.env, f.actor);
    await f.cancel();
    expect(await getHorizonStatus(f.env, f.actor)).toMatchObject({
      status: "cancelled",
      entitled: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: before.currentPeriodEnd,
    });
    await renewHorizonPlans(f.env, new Date(before.currentPeriodEnd!));
    expect(await count(f.actor.organizationId)).toBe(1);
    await f.subscribe();
    expect(await getHorizonStatus(f.env, f.actor)).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodStart: before.currentPeriodStart,
      currentPeriodEnd: before.currentPeriodEnd,
      creditAvailableMinor: 2000,
    });
  });
  it("never borrows reserved communication credit or creates debt when renewal is unfunded", async () => {
    const reserved = await fixture("production");
    await reserve(reserved.actor.organizationId);
    await expect(reserved.subscribe()).rejects.toMatchObject({
      code: "HORIZON_CREDIT_INSUFFICIENT",
    });
    expect(await count(reserved.actor.organizationId)).toBe(0);
    expect(await getHorizonStatus(reserved.env, reserved.actor)).toMatchObject({
      status: "inactive",
      creditAvailableMinor: 2500,
    });
    const f = await fixture("production");
    await f.subscribe();
    await expect(reserve(f.actor.organizationId, 2500)).rejects.toThrow(
      "credit_exhausted",
    );
    const before = await getHorizonStatus(f.env, f.actor);
    await Promise.all([
      renewHorizonPlans(f.env, new Date(before.currentPeriodEnd!)),
      renewHorizonPlans(f.env, new Date(before.currentPeriodEnd!)),
    ]);
    expect(await count(f.actor.organizationId)).toBe(1);
    expect(await getHorizonStatus(f.env, f.actor)).toMatchObject({
      status: "past_due",
      entitled: false,
      creditAvailableMinor: 2000,
    });
    await expect(requireHorizonPlan(f.env, f.actor)).rejects.toMatchObject({
      code: "HORIZON_PLAN_REQUIRED",
    });
  });
  it("fails closed when disabled, without a production validator, or in the wrong evidence mode", async () => {
    const f = await fixture("production");
    for (const env of [
      { ...f.env, HORIZON_ENABLED: undefined },
      { ...f.env, PDF_VALIDATOR: undefined },
    ]) {
      expect(await getHorizonStatus(env, f.actor)).toMatchObject({
        enabled: false,
        entitled: false,
      });
      await expect(
        handleMonthlyPlanRoute(f.request("/api/plan/subscribe"), env),
      ).rejects.toMatchObject({ code: "HORIZON_UNAVAILABLE" });
    }
    await expect(
      getHorizonStatus({ ...f.env, MODE: "simulation" }, f.actor),
    ).rejects.toMatchObject({ code: "HORIZON_MODE_MISMATCH" });
    expect(await count(f.actor.organizationId)).toBe(0);
    await f.subscribe();
    await handleMonthlyPlanRoute(f.request("/api/plan/cancel", undefined, {}), {
      ...f.env,
      HORIZON_ENABLED: undefined,
    });
    expect(await getHorizonStatus(f.env, f.actor)).toMatchObject({
      cancelAtPeriodEnd: true,
    });
  });
  it("requires browser administrator, current CSRF, immutable consent and tenant-scoped keys", async () => {
    const f = await fixture();
    for (const body of [
      {},
      { consent: false, termsVersion: HORIZON_TERMS_VERSION },
      { consent: true, termsVersion: "old" },
      { consent: true, termsVersion: HORIZON_TERMS_VERSION, priceMinor: 1 },
    ])
      await expect(
        handleMonthlyPlanRoute(
          f.request("/api/plan/subscribe", undefined, body),
          f.env,
        ),
      ).rejects.toMatchObject({ code: "HORIZON_CONSENT_REQUIRED" });
    await expect(
      handleMonthlyPlanRoute(
        f.request("/api/plan/subscribe", undefined, undefined, {
          "X-CSRF-Token": "wrong",
        }),
        f.env,
      ),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    await expect(
      handleMonthlyPlanRoute(
        f.request("/api/plan/subscribe", undefined, undefined, {
          Authorization: "Bearer fixture",
        }),
        f.env,
      ),
    ).rejects.toMatchObject({ code: "BILLING_BROWSER_REQUIRED" });
    await expect(
      handleMonthlyPlanRoute(
        f.request("/api/plan/subscribe", undefined, undefined, {
          Origin: "https://attacker.invalid",
        }),
        f.env,
      ),
    ).rejects.toMatchObject({ code: "ORIGIN_REJECTED" });
    const foreign = await fixture();
    expect(await getHorizonStatus(f.env, foreign.actor)).toMatchObject({
      status: "inactive",
    });
    await expect(
      getHorizonStatus(f.env, {
        ...f.actor,
        organizationId: foreign.actor.organizationId,
      }),
    ).rejects.toMatchObject({ code: "MEMBERSHIP_REQUIRED" });
    await f.subscribe("tenant_shared_key");
    await foreign.subscribe("tenant_shared_key");
    expect(await count(f.actor.organizationId)).toBe(1);
    expect(await count(foreign.actor.organizationId)).toBe(1);
    for (const actor of ["native", "mcp"] as const)
      expect(
        await getHorizonStatus(f.env, { ...f.actor, actor }),
      ).toMatchObject({
        entitled: true,
        billingManagementAllowed: false,
        creditAvailableMinor: null,
      });
    const member = await fixture();
    await DB.prepare(
      "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
    )
      .bind(f.actor.organizationId, f.actor.userId)
      .run()
      .catch(async () => {
        await DB.prepare(
          "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
        )
          .bind(
            f.actor.organizationId,
            member.actor.userId,
            new Date().toISOString(),
          )
          .run();
        await DB.prepare(
          "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
        )
          .bind(f.actor.organizationId, f.actor.userId)
          .run();
      });
    expect(await getHorizonStatus(f.env, f.actor)).toMatchObject({
      entitled: true,
      billingManagementAllowed: false,
      creditAvailableMinor: null,
    });
    await expect(f.cancel()).rejects.toMatchObject({
      code: "BILLING_ADMIN_REQUIRED",
    });
  });
  it.each(["session", "csrf", "membership"])(
    "fences a %s change between authentication and the atomic debit",
    async (change) => {
      const f = await fixture();
      const other = await fixture();
      await DB.prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
        .bind(
          f.actor.organizationId,
          other.actor.userId,
          new Date().toISOString(),
        )
        .run();
      let changed = false;
      const env = {
        ...f.env,
        DB: new Proxy(DB, {
          get(target, prop) {
            if (prop !== "prepare") return Reflect.get(target, prop);
            return (query: string) => {
              const statement = target.prepare(query);
              if (!query.startsWith("INSERT INTO horizon_plan_actions"))
                return statement;
              return {
                bind(...values: unknown[]) {
                  const bound = statement.bind(...values);
                  return {
                    async run() {
                      if (!changed) {
                        changed = true;
                        if (change === "session")
                          await DB.prepare(
                            "DELETE FROM browser_sessions WHERE token_hash=?",
                          )
                            .bind(f.tokenHash)
                            .run();
                        if (change === "csrf")
                          await DB.prepare(
                            "UPDATE browser_sessions SET csrf_token='rotated' WHERE token_hash=?",
                          )
                            .bind(f.tokenHash)
                            .run();
                        if (change === "membership")
                          await DB.prepare(
                            "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
                          )
                            .bind(f.actor.organizationId, f.actor.userId)
                            .run();
                      }
                      return bound.run();
                    },
                  };
                },
              };
            };
          },
        }) as D1Database,
      };
      await expect(
        handleMonthlyPlanRoute(f.request("/api/plan/subscribe"), env),
      ).rejects.toMatchObject({ code: "BILLING_ADMIN_REQUIRED" });
      expect(await count(f.actor.organizationId)).toBe(0);
      expect(
        await DB.prepare(
          "SELECT organization_id FROM horizon_subscriptions WHERE organization_id=?",
        )
          .bind(f.actor.organizationId)
          .first(),
      ).toBeNull();
    },
  );
  it("renews funded simulation once under concurrency, with injected test-only credit", async () => {
    const f = await fixture();
    await f.subscribe();
    const before = await getHorizonStatus(f.env, f.actor);
    // No production grant/top-up exists. This isolated simulated adjustment lets
    // the real SQLite atomic renewal path run without inventing a paid balance.
    const restore = await injectSimulationCredit(f.actor.organizationId);
    try {
      const now = new Date(before.currentPeriodEnd!);
      await Promise.all([
        renewHorizonPlans(f.env, now),
        renewHorizonPlans(f.env, now),
        renewHorizonPlans(f.env, now),
      ]);
      expect(await count(f.actor.organizationId)).toBe(2);
      const row = await DB.prepare(
        "SELECT status,current_period_start,current_period_end FROM horizon_subscriptions WHERE organization_id=?",
      )
        .bind(f.actor.organizationId)
        .first();
      expect(row).toEqual({
        status: "active",
        current_period_start: before.currentPeriodEnd,
        current_period_end: horizonPeriodEnd(
          now,
          new Date(before.currentPeriodStart!).getUTCDate(),
        ),
      });
      expect(
        await DB.prepare(
          "SELECT available_minor FROM horizon_available_credits WHERE organization_id=?",
        )
          .bind(f.actor.organizationId)
          .first(),
      ).toEqual({ available_minor: 2000 });
      expect(await readWelcomeCredit(DB, f.actor.organizationId)).toMatchObject(
        { spentMinor: 0, availableMinor: 0 },
      );
      await expect(
        DB.prepare(
          "UPDATE horizon_subscriptions SET current_period_end='2099-01-01T00:00:00.000Z' WHERE organization_id=?",
        )
          .bind(f.actor.organizationId)
          .run(),
      ).rejects.toThrow("immutable_horizon_subscription");
    } finally {
      await restore();
    }
  });
  it("does not let 100 older unfunded accounts starve a later funded renewal", async () => {
    const f = await fixture();
    await f.subscribe();
    const before = await getHorizonStatus(f.env, f.actor);
    const today = new Date();
    const oldStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, 1),
    ).toISOString();
    const oldEnd = horizonPeriodEnd(new Date(oldStart));
    const now = today.toISOString();
    const expires = new Date(today.getTime() + 3600_000).toISOString();
    const statements: D1PreparedStatement[] = [];
    for (let i = 0; i < 100; i++) {
      const organizationId = `org_unfunded_${f.actor.organizationId}_${i}`;
      const sessionHash = i.toString(16).padStart(64, "0");
      statements.push(
        DB.prepare(
          "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Unfunded fixture','simulation',?)",
        ).bind(organizationId, oldStart),
        DB.prepare(
          "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
        ).bind(organizationId, f.actor.userId, oldStart),
        DB.prepare(
          "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,'synthetic',1,0,?,?,1)",
        ).bind(sessionHash, f.actor.userId, organizationId, oldStart, expires),
        DB.prepare(
          "INSERT INTO horizon_plan_actions(id,organization_id,request_key,action,source,evidence,user_id,session_hash,terms_version,amount_minor,currency,payment_source,interval,auto_renew,current_period_start,current_period_end,anchor_day,created_at) VALUES(?,?,?,'subscribe','browser','simulation',?,?,'horizon-2026-10-02-v1',3000,'EUR','account_credits','month',1,?,?,1,?)",
        ).bind(
          `${organizationId}_consent`,
          organizationId,
          `${organizationId}_subscribe`,
          f.actor.userId,
          sessionHash,
          oldStart,
          oldEnd,
          oldStart,
        ),
        DB.prepare(
          "INSERT INTO horizon_plan_actions(id,organization_id,request_key,action,source,evidence,terms_version,amount_minor,currency,payment_source,interval,auto_renew,expected_period_end,created_at) VALUES(?,?,?,'past_due','system','simulation','horizon-2026-10-02-v1',3000,'EUR','account_credits','month',0,?,?)",
        ).bind(
          `${organizationId}_unfunded`,
          organizationId,
          `past_due_${oldEnd.replace(/[^0-9]/g, "")}`,
          oldEnd,
          now,
        ),
      );
    }
    await DB.batch(statements);
    const restore = await injectSimulationCredit(f.actor.organizationId);
    try {
      await renewHorizonPlans(f.env, new Date(before.currentPeriodEnd!));
      expect(await count(f.actor.organizationId)).toBe(2);
      expect(
        await DB.prepare(
          "SELECT count(*) n FROM horizon_subscriptions WHERE instr(organization_id,?)=1 AND status='past_due'",
        )
          .bind(`org_unfunded_${f.actor.organizationId}_`)
          .first(),
      ).toEqual({ n: 100 });
      expect(
        await DB.prepare(
          "SELECT count(*) n FROM horizon_plan_charges WHERE instr(organization_id,?)=1",
        )
          .bind(`org_unfunded_${f.actor.organizationId}_`)
          .first(),
      ).toEqual({ n: 100 });
    } finally {
      await restore();
    }
  });
  it("preserves calendar anniversaries across short months and leap years", () => {
    expect(horizonPeriodEnd(new Date("2028-01-31T10:11:12.345Z"))).toBe(
      "2028-02-29T10:11:12.345Z",
    );
    expect(horizonPeriodEnd(new Date("2028-02-29T10:11:12.345Z"), 31)).toBe(
      "2028-03-31T10:11:12.345Z",
    );
    expect(horizonPeriodEnd(new Date("2027-01-31T10:11:12.345Z"))).toBe(
      "2027-02-28T10:11:12.345Z",
    );
    expect(horizonPeriodEnd(new Date("2027-12-31T10:11:12.345Z"))).toBe(
      "2028-01-31T10:11:12.345Z",
    );
  });
});
