import { readFileSync, readdirSync } from "node:fs";
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
import { refreshFaxTariffs } from "../../apps/api/src/fax-tariff-refresh";
import type { Env } from "../../apps/api/src/env";
import { telnyxAccountReference } from "../../packages/providers/telnyx-readiness";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";

let mf: Miniflare, db: D1Database, clock: number, env: Env;
let fixture: Awaited<ReturnType<typeof createFaxUsageFixture>>;
let sourceId: string;
const deadline = "2026-11-03T23:59:59.999Z";
const deckUrl =
  "https://portal.telnyx.com/downloads/global_conversational/isolated_fixture.csv";
const page =
  "<p>Send a fax via API $0.009 per page + SIP Trunking usage for transmission</p>";
const header =
  "ISO,Country,Origination Prefixes,Destination Prefixes,Description,Interval 1,Interval N,Rate,Price Per Call,Exact Match";
let minute: string;
let currentDeckUrl: string;
const now = () => clock;
const stamp = () => new Date(clock).toISOString();
const empty = {
  tariffsRefreshed: 0,
  tariffRefreshFailed: 0,
  tariffRefreshDeferred: 0,
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
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  clock = Date.parse("2026-10-30T10:00:00.000Z");
  minute = "0.010000001";
  currentDeckUrl = deckUrl;
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  const account = (await telnyxAccountReference(publicKey))!;
  fixture = await createFaxUsageFixture(db, now, {
    account_id: account,
    connection_id: "123",
    outbound_profile_id: "456",
    destination_prefix: "+3524",
    destination_country_code: "LU",
    origin_class: "local",
    destination_category: "fixed",
    route_qualification: "operator_test",
    operator_authorization_reference: "ISOLATED LIVE PILOT AUTHORITY",
    operator_test_ceiling_minor: 200,
    execution_scope: "live",
    max_pages: 10,
    quote_ttl_seconds: 900,
    valid_from: "2026-10-28T10:00:00.000Z",
    expires_at: deadline,
    fx_date: "2026-10-28",
  });
  fixture.input.recipient.phone = "+35240000000";
  env = {
    DB: db,
    MODE: "production",
    ENVIRONMENT: "production",
    TELNYX_API_KEY: "isolated-fixture-key",
    TELNYX_PUBLIC_KEY: publicKey,
    TELNYX_ACCOUNT_ID: account,
    TELNYX_CONNECTION_ID: "123",
    TELNYX_OUTBOUND_VOICE_PROFILE_ID: "456",
  } as Env;
  sourceId = crypto.randomUUID();
});
async function register() {
  await insertRecord(db, "fax_tariff_refresh_sources", {
    id: sourceId,
    organization_id: fixture.ctx.organizationId,
    sender_id: fixture.tariff.sender_id,
    initial_tariff_id: fixture.tariff.id,
    account_id: fixture.tariff.account_id,
    connection_id: "123",
    outbound_profile_id: "456",
    destination_prefix: "+3524",
    options_json: "{}",
    tariff_catalog: "global_conversational",
    rate_deck_url: deckUrl,
    authorization_expires_at: deadline,
    authorization_reference: "ISOLATED PUBLIC COMMERCIAL REFERENCE OPT-IN",
    commercial_basis: "public_reference_not_negotiated",
    status: "active",
    created_at: stamp(),
  });
}
const quote = () =>
  fixture.domain.prepareDispatch(
    fixture.ctx,
    { ...fixture.input, ceilingMinor: 200 },
    crypto.randomUUID(),
  );
async function state() {
  return db
    .prepare(
      "SELECT * FROM fax_tariff_refresh_state WHERE organization_id=? AND source_id=?",
    )
    .bind(fixture.ctx.organizationId, sourceId)
    .first<Record<string, unknown>>();
}
async function current() {
  return db
    .prepare(
      "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND destination_prefix='+3524' AND status='qualified'",
    )
    .bind(fixture.ctx.organizationId)
    .first<Record<string, unknown>>();
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
    expect(
      await db
        .prepare(
          `SELECT COUNT(*) AS count FROM ${table} WHERE organization_id=?`,
        )
        .bind(fixture.ctx.organizationId)
        .first(),
    ).toEqual({ count: 0 });
}
function network(before?: (url: string) => Promise<void>, failPage = false) {
  return vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = String(input);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init.headers);
    if (url.startsWith("https://api.telnyx.com/v2/"))
      expect(headers.get("authorization")).toBe("Bearer isolated-fixture-key");
    else {
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
    }
    await before?.(url);
    if (url === "https://api.telnyx.com/v2/tariffs")
      return Response.json({
        data: { global_conversational: { tariff_link: currentDeckUrl } },
      });
    if (url === "https://telnyx.com/pricing/fax")
      return new Response(page, { status: failPage ? 503 : 200 });
    if (url === currentDeckUrl || url === deckUrl)
      return new Response(
        `${header}\nLU,Luxembourg,Local,3524,Trunking Outbound Minute - Luxembourg - Fixed - Local,60,60,${url === deckUrl ? "0.010000001" : minute},,\n`,
      );
    if (url === "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml")
      return new Response(
        `<Cube time='${stamp().slice(0, 10)}'><Cube currency='USD' rate='2.000000'/></Cube>`,
      );
    if (url === "https://api.telnyx.com/v2/fax_applications/123")
      return Response.json({
        data: {
          id: "123",
          active: true,
          outbound: { outbound_voice_profile_id: "456", channel_limit: 1 },
        },
      });
    if (url.startsWith("https://api.telnyx.com/v2/phone_numbers?"))
      return Response.json({
        data: [
          {
            id: "789",
            connection_id: "123",
            phone_number: "+35220000000",
            country_iso_alpha2: "LU",
            status: "active",
            t38_fax_gateway_enabled: true,
          },
        ],
        meta: { page_number: 1, total_pages: 1 },
      });
    if (url === "https://api.telnyx.com/v2/outbound_voice_profiles/456")
      return Response.json({
        data: {
          id: "456",
          enabled: true,
          whitelisted_destinations: ["LU"],
          concurrent_call_limit: 1,
          max_destination_rate: null,
          daily_spend_limit: null,
          daily_spend_limit_enabled: false,
        },
      });
    throw new Error("Unexpected fixture request");
  });
}
describe("automatic real fax tariff references", () => {
  it("does no database or network work outside configured production and no provider work without registration", async () => {
    const prepare = vi.fn(() => {
      throw new Error("unexpected database access");
    });
    const fetcher = network();
    for (const overrides of [
      { MODE: "simulation" },
      { ENVIRONMENT: "staging" },
      { TELNYX_API_KEY: undefined },
      { TELNYX_PUBLIC_KEY: undefined },
    ])
      expect(
        await refreshFaxTariffs(
          { ...env, ...overrides, DB: { prepare } } as unknown as Env,
          { now, fetcher },
        ),
      ).toEqual(empty);
    expect(prepare).not.toHaveBeenCalled();
    expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual(empty);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("installs genuinely fetched page, CSV and FX prices atomically and refreshes again after 24 hours", async () => {
    await register();
    const fetcher = network();
    const original = await current();
    let batchFailure = "";
    const diagnosticDb = new Proxy(db, {
      get(target, key) {
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) => {
            try {
              return await target.batch(statements);
            } catch (error) {
              batchFailure = String(error);
              throw error;
            }
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const result = await refreshFaxTariffs(
      { ...env, DB: diagnosticDb },
      { now, fetcher },
    );
    expect(
      result,
      batchFailure || String((await state())?.last_error_code),
    ).toEqual({
      ...empty,
      tariffsRefreshed: 1,
    });
    const first = await current();
    expect(first).toMatchObject({
      page_nano_usd: 9_000_000,
      minute_nano_usd: 10_000_001,
      fx_numerator: 1,
      fx_denominator: 2,
      fx_date: "2026-10-30",
      valid_from: stamp(),
      expires_at: deadline,
      quote_ttl_seconds: 900,
      max_pages: 10,
      operator_test_ceiling_minor: 200,
      execution_scope: "live",
    });
    expect(first?.source_sha256).not.toBe(original?.source_sha256);
    const old = await db
      .prepare("SELECT * FROM trusted_fax_usage_tariffs WHERE id=?")
      .bind(fixture.tariff.id)
      .first<Record<string, unknown>>();
    expect(old).toEqual({ ...original, status: "revoked" });
    expect((await state())?.next_due_at).toBe("2026-10-31T10:00:00.000Z");
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual(empty);
    expect(fetcher).toHaveBeenCalledTimes(7);
    clock += 24 * 3_600_000;
    minute = "0.012000002";
    currentDeckUrl =
      "https://portal.telnyx.com/downloads/global_conversational/isolated_fixture_rotated.csv";
    expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual({
      ...empty,
      tariffsRefreshed: 1,
    });
    expect(await current()).toMatchObject({
      minute_nano_usd: 12_000_002,
      fx_date: "2026-10-31",
      expires_at: deadline,
      max_pages: 10,
    });
    expect(fetcher.mock.calls.slice(7).map(([url]) => String(url))).toContain(
      currentDeckUrl,
    );
    expect(
      fetcher.mock.calls.slice(7).map(([url]) => String(url)),
    ).not.toContain(deckUrl);
    const recorded = await db
      .prepare(
        "SELECT discovery_sha256,rate_deck_url,discovery_observed_at FROM fax_tariff_refresh_evidence WHERE organization_id=? ORDER BY created_at",
      )
      .bind(fixture.ctx.organizationId)
      .all<{
        discovery_sha256: string;
        rate_deck_url: string;
        discovery_observed_at: string;
      }>();
    expect(recorded.results.map((row) => row.rate_deck_url)).toEqual([
      deckUrl,
      currentDeckUrl,
    ]);
    expect(
      recorded.results.every((row) =>
        /^[a-f0-9]{64}$/.test(row.discovery_sha256),
      ),
    ).toBe(true);
    expect(recorded.results[1].discovery_sha256).not.toBe(
      recorded.results[0].discovery_sha256,
    );
    expect(
      await db
        .prepare(
          "SELECT rate_deck_url,tariff_catalog FROM fax_tariff_refresh_sources WHERE id=?",
        )
        .bind(sourceId)
        .first(),
    ).toEqual({
      rate_deck_url: deckUrl,
      tariff_catalog: "global_conversational",
    });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM fax_tariff_refresh_evidence WHERE organization_id=?",
        )
        .bind(fixture.ctx.organizationId)
        .first(),
    ).toEqual({ count: 2 });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    await noExecution();
  });

  it("keeps all prior evidence untouched and backs off after a failed actual source read", async () => {
    await register();
    const before = await current();
    const fetcher = network(undefined, true);
    expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual({
      ...empty,
      tariffRefreshFailed: 1,
    });
    expect(await current()).toEqual(before);
    expect(await state()).toMatchObject({
      failure_count: 1,
      last_success_at: null,
      last_error_code: "SOURCE_HTTP",
      next_due_at: "2026-10-30T11:00:00.000Z",
      lease_token: null,
    });
    const requests = fetcher.mock.calls.length;
    expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual(empty);
    expect(fetcher.mock.calls.length).toBe(requests);
    await noExecution();
  });

  it.each([
    "unauthorized",
    "forbidden",
    "redirect",
    "malformed",
    "missing",
    "foreign",
    "oversized",
  ])(
    "refuses %s catalog discovery without falling back to the readable original CSV",
    async (failure) => {
      await register();
      const before = await current();
      const readableSources = network();
      const fetcher = vi.fn<typeof fetch>(async (input, init = {}) => {
        if (String(input) !== "https://api.telnyx.com/v2/tariffs")
          return readableSources(input, init);
        expect(new Headers(init.headers).get("authorization")).toBe(
          "Bearer isolated-fixture-key",
        );
        expect(init.method).toBe("GET");
        expect(init.redirect).toBe("manual");
        if (failure === "unauthorized")
          return new Response("", { status: 401 });
        if (failure === "forbidden") return new Response("", { status: 403 });
        if (failure === "redirect")
          return new Response("", {
            status: 302,
            headers: { Location: deckUrl },
          });
        if (failure === "malformed") return new Response("{");
        if (failure === "missing") return Response.json({ data: {} });
        if (failure === "oversized")
          return new Response(" ".repeat(128 * 1024 + 1));
        return Response.json({
          data: {
            global_conversational: {
              tariff_link: "https://foreign.invalid/deck.csv",
            },
          },
        });
      });
      expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual({
        ...empty,
        tariffRefreshFailed: 1,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(readableSources).not.toHaveBeenCalled();
      expect(await current()).toEqual(before);
      expect((await state())?.last_success_at).toBeNull();
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM fax_tariff_refresh_evidence WHERE organization_id=?",
          )
          .bind(fixture.ctx.organizationId)
          .first(),
      ).toEqual({ count: 0 });
      await noExecution();
    },
  );

  it("defers before any network request while a prepared quote still binds the route", async () => {
    await register();
    const dispatch = await quote();
    const fetcher = network();
    const saved = await db
      .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
      .bind(dispatch.id)
      .first();
    expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual({
      ...empty,
      tariffRefreshDeferred: 1,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await current()).toMatchObject({
      id: fixture.tariff.id,
      status: "qualified",
    });
    expect(
      await db
        .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
        .bind(dispatch.id)
        .first(),
    ).toEqual(saved);
    await noExecution();
  });

  it.each(["source", "tariff", "quote"])(
    "rejects a %s race inside the final transaction",
    async (race) => {
      await register();
      let changed = false;
      const fetcher = network(async () => {
        if (changed) return;
        changed = true;
        if (race === "source")
          await db
            .prepare(
              "UPDATE fax_tariff_refresh_sources SET status='revoked' WHERE id=?",
            )
            .bind(sourceId)
            .run();
        else if (race === "tariff")
          await db
            .prepare(
              "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE id=?",
            )
            .bind(fixture.tariff.id)
            .run();
        else await quote();
      });
      expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual({
        ...empty,
        tariffRefreshFailed: 1,
      });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM fax_tariff_refresh_evidence WHERE organization_id=?",
          )
          .bind(fixture.ctx.organizationId)
          .first(),
      ).toEqual({ count: 0 });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM trusted_fax_usage_tariffs WHERE organization_id=?",
          )
          .bind(fixture.ctx.organizationId)
          .first(),
      ).toEqual({ count: 1 });
      await noExecution();
    },
  );

  it("pins the exact inspected sender address inside the final transaction", async () => {
    await register();
    const before = await current();
    const trigger = await db
      .prepare(
        "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='immutable_sender'",
      )
      .first<{ sql: string }>();
    expect(trigger).not.toBeNull();
    let changed = false;
    const fetcher = network(async () => {
      if (changed) return;
      changed = true;
      // Ordinary address edits are already forbidden. Simulate an administrative
      // historical edit in isolated D1, restoring that guard before the final CAS.
      await db.prepare("DROP TRIGGER immutable_sender").run();
      try {
        await db
          .prepare(
            "UPDATE senders SET address=? WHERE organization_id=? AND id=?",
          )
          .bind(
            "+35220000001",
            fixture.ctx.organizationId,
            fixture.tariff.sender_id,
          )
          .run();
      } finally {
        await db.prepare(trigger!.sql).run();
      }
    });
    expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual({
      ...empty,
      tariffRefreshFailed: 1,
    });
    expect((await state())?.last_error_code).toBe("COMMIT_CHANGED");
    expect(await current()).toEqual(before);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM fax_tariff_refresh_evidence WHERE organization_id=?",
        )
        .bind(fixture.ctx.organizationId)
        .first(),
    ).toEqual({ count: 0 });
    await noExecution();
  });

  it("rolls the prior revocation back when inserting the replacement fails", async () => {
    await register();
    const before = await current();
    await db
      .prepare(
        "CREATE TRIGGER isolated_refresh_insert_failure BEFORE INSERT ON trusted_fax_usage_tariffs WHEN NEW.id LIKE 'refresh_%' BEGIN SELECT RAISE(ABORT,'isolated_failure'); END;",
      )
      .run();
    try {
      expect(await refreshFaxTariffs(env, { now, fetcher: network() })).toEqual(
        { ...empty, tariffRefreshFailed: 1 },
      );
      expect(await current()).toEqual(before);
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM fax_tariff_refresh_evidence WHERE organization_id=?",
          )
          .bind(fixture.ctx.organizationId)
          .first(),
      ).toEqual({ count: 0 });
      expect(await state()).toMatchObject({
        applying_tariff_id: null,
        lease_token: null,
        last_success_at: null,
      });
    } finally {
      await db.prepare("DROP TRIGGER isolated_refresh_insert_failure").run();
    }
    await noExecution();
  });

  it("allows one lease owner and reconciles a lost success response without replaying mutations", async () => {
    await register();
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let first = true;
    const fetcher = network(async () => {
      if (first) {
        first = false;
        entered();
        await waiting;
      }
    });
    const proxy = new Proxy(db, {
      get(target, key) {
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) => {
            await target.batch(statements);
            throw new Error("isolated lost success response");
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const job = refreshFaxTariffs({ ...env, DB: proxy }, { now, fetcher });
    await started;
    try {
      expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual(empty);
    } finally {
      release();
    }
    expect(await job).toEqual({ ...empty, tariffsRefreshed: 1 });
    expect(await state()).toMatchObject({
      last_success_at: stamp(),
      next_due_at: "2026-10-31T10:00:00.000Z",
      failure_count: 0,
      last_error_code: null,
    });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM fax_tariff_refresh_evidence WHERE organization_id=?",
        )
        .bind(fixture.ctx.organizationId)
        .first(),
    ).toEqual({ count: 1 });
    await noExecution();
  });

  it("does not extend the pilot authority or revive a revoked registry", async () => {
    await register();
    await db
      .prepare(
        "UPDATE fax_tariff_refresh_sources SET status='revoked' WHERE id=?",
      )
      .bind(sourceId)
      .run();
    await expect(
      db
        .prepare(
          "UPDATE fax_tariff_refresh_sources SET status='active' WHERE id=?",
        )
        .bind(sourceId)
        .run(),
    ).rejects.toThrow(/immutable_fax_tariff_refresh_source/);
    clock = Date.parse("2026-11-04T00:00:00.000Z");
    const fetcher = network();
    expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual(empty);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await current()).toMatchObject({
      id: fixture.tariff.id,
      expires_at: deadline,
    });
    await noExecution();
  });
});

it("refuses a live page-limit change instead of changing the registered anchor", async () => {
  await register();
  await db
    .prepare(
      "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
    )
    .bind(fixture.ctx.organizationId, fixture.tariff.id)
    .run();
  await insertRecord(db, "trusted_fax_usage_tariffs", {
    ...fixture.tariff,
    id: crypto.randomUUID(),
    max_pages: 9,
  });
  const fetcher = network();
  expect(await refreshFaxTariffs(env, { now, fetcher })).toEqual({
    ...empty,
    tariffRefreshFailed: 1,
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect((await state())?.last_error_code).toBe("BINDING_CHANGED");
  expect((await current())?.max_pages).toBe(9);
});

it("rejects an eleven-page live tariff while preserving the registered ten-page policy", async () => {
  await register();
  await expect(
    insertRecord(db, "trusted_fax_usage_tariffs", {
      ...fixture.tariff,
      id: crypto.randomUUID(),
      max_pages: 11,
    }),
  ).rejects.toThrow(/CHECK/);
  expect((await current())?.max_pages).toBe(10);
  expect(await refreshFaxTariffs(env, { now, fetcher: network() })).toEqual({
    ...empty,
    tariffsRefreshed: 1,
  });
  expect((await current())?.max_pages).toBe(10);
});
