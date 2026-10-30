import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { ensureEmailSender } from "../../apps/api/src/email-setup";
import { resendIdentity } from "../../apps/api/src/resend-environment";
import {
  refreshResendPolicies,
  readResendPolicyFreshness,
  parseResendPublicPrice,
  inspectResendPolicySources,
} from "../../apps/api/src/resend-policy-refresh";
import { submitResendWithLimits } from "../../apps/api/src/resend-send-limits";
import type { ActorContext } from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";

const NOW = Date.parse("2026-10-30T15:00:00.000Z");
const UNTIL = "2026-11-23T00:00:00.000Z";
const PRICE =
  "<section>Pro Recommended $20 / mo 50,000 emails Extra emails: $0.90 / 1,000</section>";
let mf: Miniflare,
  db: D1Database,
  legacyDb: D1Database,
  env: Env,
  ctx: ActorContext;
async function apply(target: D1Database, sql: string) {
  let statement = "",
    trigger = false;
  const statements: D1PreparedStatement[] = [];
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line} `;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      statements.push(target.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete fixture SQL");
  if (statements.length) await target.batch(statements);
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB", "LEGACY"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  legacyDb = (await mf.getD1Database("LEGACY")) as unknown as D1Database;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((n) => /^\d{4}_.*\.sql$/.test(n) && Number(n.slice(0, 4)) <= 67)
    .sort()) {
    const sql = readFileSync(new URL(name, dir), "utf8");
    await apply(db, sql);
    await apply(legacyDb, sql);
  }
  await apply(
    db,
    readFileSync(new URL("0070_resend_policy_maintenance.sql", dir), "utf8"),
  );
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  const id = crypto.randomUUID();
  ctx = {
    organizationId: `org_${id}`,
    userId: `usr_${id}`,
    role: "admin",
    actor: "browser",
  };
  env = {
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.com",
    EMAIL_PROVIDER: "resend",
    LIVE_SENDS_ENABLED: "true",
    LIVE_SEND_CHANNELS: "fax,postal,email",
    RESEND_SENDS_ENABLED: "true",
    RESEND_ACCOUNT_ID: `fixture_${id}`,
    RESEND_DOMAIN_ID: "fixture-domain",
    RESEND_VERIFIED_DOMAIN: "guteneo.com",
    RESEND_API_KEY: "fixture-sending",
    RESEND_READINESS_API_KEY: "fixture-inspection",
    RESEND_WEBHOOK_SECRET: "fixture-webhook",
    RESEND_TARIFF_QUALIFIED_UNTIL: UNTIL,
  } as Env;
  await db
    .prepare(
      "INSERT INTO resend_send_limit_policies VALUES(?,80,2400,500,?,?,?,'qualified')",
    )
    .bind(
      env.RESEND_ACCOUNT_ID,
      NOW - 86400000,
      Date.parse(UNTIL),
      "a".repeat(64),
    )
    .run();
});
async function member(target = db) {
  await target.batch([
    target
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Fixture','production',?)",
      )
      .bind(ctx.organizationId, new Date(NOW).toISOString()),
    target
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Fixture','person@example.invalid',?)",
      )
      .bind(ctx.userId, new Date(NOW).toISOString()),
    target
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(ctx.organizationId, ctx.userId, new Date(NOW).toISOString()),
    target
      .prepare("INSERT INTO channel_controls VALUES(?,'email',0)")
      .bind(ctx.organizationId),
  ]);
}
function sources(overrides: Record<string, string | number> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      const api = new URL(url).hostname === "api.resend.com";
      expect(new Headers(init?.headers).get("authorization")).toBe(
        api ? "Bearer fixture-inspection" : null,
      );
      const key = url.endsWith("/usage")
        ? "usage"
        : url.includes("/domains/")
          ? "domain"
          : url.includes("resend.com/pricing")
            ? "price"
            : "fx";
      const defaults = {
        domain: JSON.stringify({
          id: env.RESEND_DOMAIN_ID,
          name: "guteneo.com",
          status: "verified",
        }),
        usage: JSON.stringify({
          object: "usage",
          emails: { daily: { limit: 100 }, monthly: { limit: 3000 } },
          rate_limit: { limit: 10, duration: "1000ms" },
        }),
        price: PRICE,
        fx: '<Cube time="2026-10-29"><Cube currency="USD" rate="1.1600"/></Cube>',
      };
      const value = overrides[key] ?? defaults[key];
      return typeof value === "number"
        ? new Response("unavailable", { status: value })
        : new Response(value);
    },
  ) as typeof fetch;
  return { fetcher, calls };
}
const state = () =>
  db
    .prepare("SELECT * FROM resend_policy_refresh_state WHERE account_id=?")
    .bind(env.RESEND_ACCOUNT_ID)
    .first<Record<string, unknown>>();
const policy = () =>
  db
    .prepare("SELECT * FROM resend_send_limit_policies WHERE account_id=?")
    .bind(env.RESEND_ACCOUNT_ID)
    .first<Record<string, unknown>>();
async function due() {
  await db
    .prepare(
      "UPDATE resend_policy_refresh_state SET next_attempt_at=? WHERE account_id=?",
    )
    .bind(new Date(NOW).toISOString(), env.RESEND_ACCOUNT_ID)
    .run();
}

describe("genuine Resend maintenance", () => {
  it("renews an expired selected policy before first traffic, preserving caps and immutable original evidence", async () => {
    await db
      .prepare(
        "UPDATE resend_send_limit_policies SET expires_at_ms=? WHERE account_id=?",
      )
      .bind(NOW - 1, env.RESEND_ACCOUNT_ID)
      .run();
    const original = await policy();
    const source = sources();
    expect(
      await refreshResendPolicies(env, {
        fetcher: source.fetcher,
        now: () => NOW,
      }),
    ).toEqual({
      resendPoliciesRefreshed: 1,
      resendPolicyRefreshFailed: 0,
      resendPolicyRefreshDeferred: 0,
    });
    expect(source.calls).toHaveLength(4);
    expect(await policy()).toMatchObject({
      account_id: original!.account_id,
      max_recipients_24h: 80,
      max_recipients_month: 2400,
      min_interval_ms: 500,
      status: "qualified",
      qualified_at_ms: NOW,
      expires_at_ms: NOW + 30 * 86400000,
    });
    const evidence = await db
      .prepare(
        "SELECT * FROM resend_policy_refresh_evidence WHERE account_id=?",
      )
      .bind(env.RESEND_ACCOUNT_ID)
      .first<Record<string, string>>();
    expect(JSON.parse(evidence!.previous_policy_json)).toEqual(original);
    expect(JSON.parse(evidence!.rate_json)).toMatchObject({
      usdMicrosPerMessage: 900,
      tariffDate: "2026-10-30",
      fxDate: "2026-10-29",
      eurPerUsdNumerator: 25,
      eurPerUsdDenominator: 29,
    });
    await expect(
      db
        .prepare(
          "UPDATE resend_policy_refresh_evidence SET observed_at='changed' WHERE id=?",
        )
        .bind(evidence!.id)
        .run(),
    ).rejects.toThrow("immutable_resend_policy_refresh_evidence");
    expect(await readResendPolicyFreshness(env, NOW)).toMatchObject({
      status: "active",
      blocked: false,
      tariffExpiresAt: new Date(NOW + 30 * 86400000).toISOString(),
      tariffRevisionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      limitsRevisionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await refreshResendPolicies(env, {
      fetcher: source.fetcher,
      now: () => NOW + 1000,
    });
    expect(source.calls).toHaveLength(4);
  });
  it.each([401, 403, 500])(
    "renews only independent pricing when usage reads fail with HTTP %i",
    async (status) => {
      const original = await policy();
      const previousFreshness = await readResendPolicyFreshness(env, NOW);
      await refreshResendPolicies(env, {
        fetcher: sources({ usage: status }).fetcher,
        now: () => NOW,
      });
      expect(await policy()).toEqual(original);
      expect(await state()).toMatchObject({
        qualified_until: new Date(NOW + 30 * 86400000).toISOString(),
        blocked_reason: null,
      });
      expect(await readResendPolicyFreshness(env, NOW)).toMatchObject({
        tariffExpiresAt: new Date(NOW + 30 * 86400000).toISOString(),
        blocked: false,
        limitsRevisionSha256: previousFreshness.limitsRevisionSha256,
      });
    },
  );
  it.each([
    ["price", PRICE.replace("0.90", "1.00"), "PRICE_CHANGED"],
    [
      "domain",
      JSON.stringify({ id: "other", name: "guteneo.com", status: "verified" }),
      "DOMAIN_CHANGED",
    ],
    [
      "usage",
      JSON.stringify({
        object: "usage",
        emails: { daily: { limit: 70 }, monthly: { limit: 3000 } },
        rate_limit: { limit: 10, duration: "1000ms" },
      }),
      "CAPACITY_CHANGED",
    ],
  ])(
    "blocks contradicted %s only for its consumer and preserves it while that source remains unreadable",
    async (key, body, code) => {
      await member();
      const original = await policy();
      await refreshResendPolicies(env, {
        fetcher: sources({ [key]: body }).fetcher,
        now: () => NOW,
      });
      expect(await policy()).toEqual(original);
      expect(await readResendPolicyFreshness(env, NOW)).toMatchObject({
        blocked: true,
        lastErrorCode: code,
      });
      if (code === "CAPACITY_CHANGED")
        expect(
          await ensureEmailSender(env, ctx, new Date(NOW).toISOString()),
        ).toBeDefined();
      else
        await expect(
          ensureEmailSender(env, ctx, new Date(NOW).toISOString()),
        ).rejects.toMatchObject({ code: "RESEND_QUALIFICATION_CHANGED" });
      const send = vi.fn();
      expect(
        await submitResendWithLimits(
          db,
          {
            accountId: env.RESEND_ACCOUNT_ID!,
            organizationId: ctx.organizationId,
            dispatchId: "fixture",
            attemptId: "fixture",
          },
          send,
          { now: () => NOW },
        ),
      ).toMatchObject({ errorCode: "RESEND_QUALIFICATION_CHANGED" });
      expect(send).not.toHaveBeenCalled();
      await due();
      await refreshResendPolicies(env, {
        fetcher: sources({ [key]: 403 }).fetcher,
        now: () => NOW,
      });
      expect(await state()).toMatchObject({ blocked_reason: code });
      await due();
      await refreshResendPolicies(env, {
        fetcher: sources().fetcher,
        now: () => NOW,
      });
      expect(await state()).toMatchObject({
        blocked_reason: null,
        last_error_code: null,
      });
    },
  );
  it("treats unrecognizable pricing as unavailable evidence instead of inventing a price change", async () => {
    await refreshResendPolicies(env, {
      fetcher: sources({ price: "New layout" }).fetcher,
      now: () => NOW,
    });
    expect(await state()).toMatchObject({
      last_error_code: "SOURCE_INVALID",
      blocked_reason: null,
    });
    expect(() =>
      parseResendPublicPrice(PRICE + PRICE.replace("0.90", "1.00")),
    ).toThrow("PRICE_CHANGED");
  });
  it("uses a lease and exact policy compare to prevent concurrent cap changes being overwritten", async () => {
    const source = sources();
    let changed = false;
    const fetcher = (async (input, init) => {
      if (!changed) {
        changed = true;
        await db
          .prepare(
            "UPDATE resend_send_limit_policies SET max_recipients_24h=79 WHERE account_id=?",
          )
          .bind(env.RESEND_ACCOUNT_ID)
          .run();
      }
      return source.fetcher(input, init);
    }) as typeof fetch;
    await refreshResendPolicies(env, { fetcher, now: () => NOW });
    expect(await policy()).toMatchObject({
      max_recipients_24h: 79,
      expires_at_ms: Date.parse(UNTIL),
      source_sha256: "a".repeat(64),
    });
    expect(await state()).toMatchObject({ qualified_until: null });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM resend_policy_refresh_evidence WHERE account_id=?",
        )
        .bind(env.RESEND_ACCOUNT_ID)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("refreshes consumed pricing with final sending off, while preserving unused quota expiry", async () => {
    env.LIVE_SENDS_ENABLED = "false";
    env.LIVE_SEND_CHANNELS = "fax";
    const original = await policy(),
      source = sources();
    expect(
      await refreshResendPolicies(env, {
        fetcher: source.fetcher,
        now: () => NOW,
      }),
    ).toMatchObject({
      resendPoliciesRefreshed: 1,
      resendPolicyRefreshFailed: 0,
    });
    expect(await policy()).toEqual(original);
    expect(source.calls.some((call) => call.url.endsWith("/usage"))).toBe(
      false,
    );
    expect(await readResendPolicyFreshness(env, NOW)).toMatchObject({
      tariffStatus: "active",
      limitsStatus: "inactive",
      tariffExpiresAt: new Date(NOW + 30 * 86400000).toISOString(),
    });
  });
  it.each(["absent", "revoked"])(
    "qualifies tariff alone with %s quotas, without reading unrelated usage or creating authority",
    async (kind) => {
      if (kind === "absent")
        await db
          .prepare("DELETE FROM resend_send_limit_policies WHERE account_id=?")
          .bind(env.RESEND_ACCOUNT_ID)
          .run();
      else
        await db
          .prepare(
            "UPDATE resend_send_limit_policies SET status='revoked' WHERE account_id=?",
          )
          .bind(env.RESEND_ACCOUNT_ID)
          .run();
      const original = await policy(),
        source = sources({ usage: 403 });
      expect(
        await refreshResendPolicies(env, {
          fetcher: source.fetcher,
          now: () => NOW,
        }),
      ).toMatchObject({
        resendPoliciesRefreshed: 1,
        resendPolicyRefreshFailed: 0,
      });
      expect(source.calls).toHaveLength(3);
      expect(await policy()).toEqual(original);
      expect(await state()).toMatchObject({
        qualified_until: new Date(NOW + 30 * 86400000).toISOString(),
        blocked_reason: null,
      });
      const proof = await db
        .prepare(
          "SELECT usage_sha256,limits_json FROM resend_policy_refresh_evidence WHERE account_id=?",
        )
        .bind(env.RESEND_ACCOUNT_ID)
        .first();
      expect(proof).toEqual({ usage_sha256: null, limits_json: "null" });
    },
  );
  it("records authentic contradictions from independent valid responses even when usage returns403", async () => {
    const original = await policy();
    await refreshResendPolicies(env, {
      fetcher: sources({
        usage: 403,
        domain: JSON.stringify({
          id: env.RESEND_DOMAIN_ID,
          name: "guteneo.com",
          status: "failed",
        }),
        price: PRICE.replace("0.90", "1.90"),
      }).fetcher,
      now: () => NOW,
    });
    expect(await policy()).toEqual(original);
    const saved = await state();
    expect(JSON.parse(saved!.blocked_reasons_json as string)).toEqual(
      expect.arrayContaining(["DOMAIN_CHANGED", "PRICE_CHANGED"]),
    );
    expect(saved!.qualified_until).toBeNull();
    expect(await readResendPolicyFreshness(env, NOW)).toMatchObject({
      universalBlocked: true,
      tariffBlocked: true,
    });
  });
  it("does not invent a domain contradiction from malformed data beside an unreadable source", async () => {
    await refreshResendPolicies(env, {
      fetcher: sources({
        usage: 403,
        domain: JSON.stringify({ error: "synthetic malformed response" }),
      }).fetcher,
      now: () => NOW,
    });
    expect(await state()).toMatchObject({
      qualified_until: null,
      blocked_reason: null,
      blocked_reasons_json: null,
    });
  });
  it("keeps an authenticated negative domain fact when an unrelated source times out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const ordinary = sources({
        domain: JSON.stringify({
          id: env.RESEND_DOMAIN_ID,
          name: "guteneo.com",
          status: "failed",
        }),
      });
      const fetcher = (async (input, init) => {
        if (String(input).endsWith("/usage"))
          return new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener(
              "abort",
              () => reject(new DOMException("synthetic timeout", "AbortError")),
              { once: true },
            );
          });
        return ordinary.fetcher(input, init);
      }) as typeof fetch;
      const result = inspectResendPolicySources(env, {
        fetcher,
        now: () => NOW,
      });
      await vi.advanceTimersByTimeAsync(30001);
      expect(await result).toMatchObject({
        status: "unavailable",
        code: "DOMAIN_CHANGED",
        stage: "domain",
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not let an unused automatic price contradiction block a selected manual policy, including explicit sender", async () => {
    await member();
    await ensureEmailSender(env, ctx, new Date(NOW).toISOString());
    const old = await db
      .prepare("SELECT * FROM trusted_delivery_costs WHERE organization_id=?")
      .bind(ctx.organizationId)
      .first<Record<string, string | number>>();
    await db
      .prepare(
        "UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=?",
      )
      .bind(ctx.organizationId)
      .run();
    const manualSender = "manual_sender_" + crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) SELECT ?,organization_id,channel,name,address,status,mode,created_at FROM senders WHERE organization_id=? AND id=?",
      )
      .bind(manualSender, ctx.organizationId, old!.sender_id)
      .run();
    const manual: Record<string, string | number> = {
      ...old!,
      id: "manual_" + crypto.randomUUID(),
      status: "qualified",
      sender_id: manualSender,
    };
    const keys = Object.keys(manual);
    await db
      .prepare(
        "INSERT INTO trusted_delivery_costs(" +
          keys.join(",") +
          ") VALUES(" +
          keys.map(() => "?").join(",") +
          ")",
      )
      .bind(...keys.map((key) => manual[key as keyof typeof manual]))
      .run();
    await refreshResendPolicies(env, {
      fetcher: sources({ price: PRICE.replace("0.90", "1.90") }).fetcher,
      now: () => NOW,
    });
    const before = await db
      .prepare(
        "SELECT * FROM trusted_delivery_costs WHERE organization_id=? ORDER BY id",
      )
      .bind(ctx.organizationId)
      .all();
    expect(
      await ensureEmailSender(env, ctx, new Date(NOW).toISOString(), {
        senderId: String(manual.sender_id),
      }),
    ).toBeDefined();
    expect(
      (
        await db
          .prepare(
            "SELECT * FROM trusted_delivery_costs WHERE organization_id=? ORDER BY id",
          )
          .bind(ctx.organizationId)
          .all()
      ).results,
    ).toEqual(before.results);
    expect(await readResendPolicyFreshness(env, NOW)).toMatchObject({
      automaticPriceBlocked: true,
      universalBlocked: false,
      limitsBlocked: false,
    });
    await db
      .prepare(
        "UPDATE resend_policy_refresh_state SET blocked_reason='DOMAIN_CHANGED',blocked_reasons_json='[\"DOMAIN_CHANGED\"]' WHERE account_id=?",
      )
      .bind(env.RESEND_ACCOUNT_ID)
      .run();
    await expect(
      ensureEmailSender(env, ctx, new Date(NOW).toISOString(), {
        senderId: String(manual.sender_id),
      }),
    ).rejects.toMatchObject({ code: "RESEND_QUALIFICATION_CHANGED" });
  });
  it("does not activate a future account qualification early", async () => {
    await db
      .prepare(
        "UPDATE resend_send_limit_policies SET qualified_at_ms=? WHERE account_id=?",
      )
      .bind(NOW + 60000, env.RESEND_ACCOUNT_ID)
      .run();
    const original = await policy(),
      source = sources();
    expect(
      await refreshResendPolicies(env, {
        fetcher: source.fetcher,
        now: () => NOW,
      }),
    ).toMatchObject({
      resendPoliciesRefreshed: 1,
      resendPolicyRefreshFailed: 0,
    });
    expect(source.calls).toHaveLength(3);
    expect(await policy()).toEqual(original);
  });
  it("retains historical automatic price rows when installing a later snapshot", async () => {
    await member();
    await ensureEmailSender(env, ctx, new Date(NOW).toISOString());
    const old = await db
      .prepare("SELECT * FROM trusted_delivery_costs WHERE organization_id=?")
      .bind(ctx.organizationId)
      .first<Record<string, unknown>>();
    await refreshResendPolicies(env, {
      fetcher: sources().fetcher,
      now: () => NOW,
    });
    await ensureEmailSender(env, ctx, "2026-11-24T00:00:00.000Z");
    const rows = (
      await db
        .prepare(
          "SELECT * FROM trusted_delivery_costs WHERE organization_id=? ORDER BY valid_from",
        )
        .bind(ctx.organizationId)
        .all<Record<string, unknown>>()
    ).results;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ ...old, status: "revoked" });
    expect(rows[1]).toMatchObject({
      status: "qualified",
      quote_ttl_seconds: 900,
      expires_at: "2026-11-29T15:00:00.000Z",
    });
  });
  it("preserves global account reservations and never replays an unknown outcome after renewal", async () => {
    await member();
    const senderId = `sender_${crypto.randomUUID()}`;
    await db
      .prepare(
        "INSERT INTO senders VALUES(?,?,'email','Fixture','fixture@guteneo.com','verified','production',?)",
      )
      .bind(senderId, ctx.organizationId, new Date(NOW).toISOString())
      .run();
    const scopes = [];
    for (const status of ["unknown", "reserved", "accepted"]) {
      const dispatchId = `dispatch_${crypto.randomUUID()}`,
        attemptId = `attempt_${crypto.randomUUID()}`;
      await db
        .prepare(
          "INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,provider,created_at,updated_at) VALUES(?,?,'email','{\"email\":\"fixture@example.invalid\"}',?,'fixture@guteneo.com','{}','prepared','production',1,1,'EUR',?,?,?,'resend',?,?)",
        )
        .bind(
          dispatchId,
          ctx.organizationId,
          senderId,
          "f".repeat(64),
          dispatchId,
          "e".repeat(64),
          new Date(NOW).toISOString(),
          new Date(NOW).toISOString(),
        )
        .run();
      await db
        .prepare(
          "INSERT INTO attempts(id,dispatch_id,organization_id,provider,status,created_at,updated_at) VALUES(?,?,?,'resend','started',?,?)",
        )
        .bind(
          attemptId,
          dispatchId,
          ctx.organizationId,
          new Date(NOW).toISOString(),
          new Date(NOW).toISOString(),
        )
        .run();
      await db
        .prepare("INSERT INTO resend_send_reservations VALUES(?,?,?,?,?,?,?)")
        .bind(
          attemptId,
          ctx.organizationId,
          dispatchId,
          env.RESEND_ACCOUNT_ID,
          status,
          NOW - 1000,
          status === "reserved" ? null : NOW - 500,
        )
        .run();
      scopes.push({
        accountId: env.RESEND_ACCOUNT_ID!,
        organizationId: ctx.organizationId,
        dispatchId,
        attemptId,
      });
    }
    const before = (
      await db
        .prepare(
          "SELECT * FROM resend_send_reservations WHERE account_id=? ORDER BY attempt_id",
        )
        .bind(env.RESEND_ACCOUNT_ID)
        .all()
    ).results;
    await refreshResendPolicies(env, {
      fetcher: sources().fetcher,
      now: () => NOW,
    });
    expect(
      (
        await db
          .prepare(
            "SELECT * FROM resend_send_reservations WHERE account_id=? ORDER BY attempt_id",
          )
          .bind(env.RESEND_ACCOUNT_ID)
          .all()
      ).results,
    ).toEqual(before);
    const send = vi.fn();
    expect(
      await submitResendWithLimits(db, scopes[0], send, { now: () => NOW }),
    ).toMatchObject({ status: "submission_unknown", retryable: false });
    expect(send).not.toHaveBeenCalled();
  });
});
describe("selection and deployment compatibility", () => {
  it("exposes independent effective statuses for the automatic tariff and account-limit gate", async () => {
    expect(
      await readResendPolicyFreshness(
        { ...env, RESEND_TARIFF_QUALIFIED_UNTIL: undefined },
        NOW,
      ),
    ).toMatchObject({
      status: "unknown",
      tariffStatus: "unknown",
      limitsStatus: "active",
      limitsExpiresAt: UNTIL,
    });
    await db
      .prepare(
        "UPDATE resend_send_limit_policies SET qualified_at_ms=? WHERE account_id=?",
      )
      .bind(NOW + 60000, env.RESEND_ACCOUNT_ID)
      .run();
    expect(await readResendPolicyFreshness(env, NOW)).toMatchObject({
      status: "unknown",
      tariffStatus: "active",
      limitsStatus: "unknown",
      lastErrorCode: "POLICY_INVALID",
    });
  });
  it("keeps strict legacy qualification before migration 0070, including an expired refusal", async () => {
    await member(legacyDb);
    const legacyEnv = { ...env, DB: legacyDb };
    expect(
      await ensureEmailSender(legacyEnv, ctx, new Date(NOW).toISOString()),
    ).toBeDefined();
    expect(
      await ensureEmailSender(
        {
          ...legacyEnv,
          RESEND_TARIFF_QUALIFIED_UNTIL: "2026-10-29T00:00:00.000Z",
        },
        ctx,
        new Date(NOW).toISOString(),
      ),
    ).toBeUndefined();
    await expect(
      ensureEmailSender(
        {
          ...env,
          DB: {
            prepare() {
              throw new Error("database unavailable");
            },
          } as unknown as D1Database,
        },
        ctx,
        new Date(NOW).toISOString(),
      ),
    ).rejects.toMatchObject({ code: "RESEND_QUALIFICATION_UNAVAILABLE" });
  });
  it("lists identity without a pricing deadline or writes to pricing policies", async () => {
    await member();
    expect(
      await ensureEmailSender(
        { ...env, RESEND_TARIFF_QUALIFIED_UNTIL: undefined },
        ctx,
        new Date(NOW).toISOString(),
        { pricing: false },
      ),
    ).toBeDefined();
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM trusted_delivery_costs WHERE organization_id=?",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ n: 0 });
    expect(
      await db
        .prepare(
          "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='email'",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ enabled: 0 });
  });
  it("distinguishes explicit inactivity from lost identity, key, origin, or invalid configuration", async () => {
    for (const patch of [
      { EMAIL_PROVIDER: "ses" },
      { RESEND_SENDS_ENABLED: "false" },
    ])
      expect(
        await readResendPolicyFreshness({ ...env, ...patch } as Env),
      ).toMatchObject({ status: "inactive", applicable: false });
    expect(
      await readResendPolicyFreshness(
        { ...env, LIVE_SENDS_ENABLED: "false", LIVE_SEND_CHANNELS: "postal" },
        NOW,
      ),
    ).toMatchObject({ tariffStatus: "active", limitsStatus: "inactive" });
    for (const patch of [
      { RESEND_ACCOUNT_ID: undefined },
      { RESEND_API_KEY: undefined },
      { APP_ORIGIN: "invalid" },
      { LIVE_SEND_CHANNELS: "email,invalid" },
    ])
      expect(
        await readResendPolicyFreshness({ ...env, ...patch }),
      ).toMatchObject({ status: "unknown", applicable: true });
    const fetcher = vi.fn();
    await refreshResendPolicies(
      { ...env, RESEND_SENDS_ENABLED: "false" },
      { fetcher },
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(resendIdentity(env)?.accountId).toBe(env.RESEND_ACCOUNT_ID);
  });
});
describe("read-only source qualification", () => {
  it("qualifies the exact same evidence without accessing D1 or installing a policy, even before activation", async () => {
    const prepare = vi.fn(() => {
      throw new Error("database must not be accessed");
    });
    const source = sources();
    const result = await inspectResendPolicySources(
      {
        ...env,
        RESEND_SENDS_ENABLED: "false",
        DB: { prepare } as unknown as D1Database,
      },
      { fetcher: source.fetcher, now: () => NOW },
    );
    expect(result).toEqual({
      provider: "resend",
      mode: "read_only",
      status: "ok",
      observedAt: new Date(NOW).toISOString(),
      domainVerified: true,
      usdMicrosPerMessage: 900,
      fxDate: "2026-10-29",
      dailyLimit: 100,
      monthlyLimit: 3000,
      apiRateLimit: 10,
      apiWindowMs: 1000,
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(source.calls).toHaveLength(4);
    expect(JSON.stringify(result)).not.toContain(env.RESEND_DOMAIN_ID);
    expect(JSON.stringify(result)).not.toContain(env.RESEND_ACCOUNT_ID);
    expect(JSON.stringify(result)).not.toContain("fixture-inspection");
    expect(await state()).toBeNull();
  });
  it.each(["domain", "usage"])(
    "distinguishes a %s permission refusal without returning the response",
    async (stage) => {
      expect(
        await inspectResendPolicySources(env, {
          fetcher: sources({ [stage]: 403 }).fetcher,
          now: () => NOW,
        }),
      ).toEqual({
        provider: "resend",
        mode: "read_only",
        status: "unavailable",
        code: "READ_NOT_PERMITTED",
        stage,
      });
    },
  );
  it("distinguishes no-response network failures from permission and never returns raw error details", async () => {
    const source = sources();
    const fetcher = (async (input, init) => {
      if (String(input).endsWith("/usage"))
        throw new Error("private-token-or-url-must-not-escape");
      return source.fetcher(input, init);
    }) as typeof fetch;
    expect(
      await inspectResendPolicySources(env, { fetcher, now: () => NOW }),
    ).toEqual({
      provider: "resend",
      mode: "read_only",
      status: "unavailable",
      code: "SOURCE_UNAVAILABLE",
      stage: "usage",
    });
  });
});
