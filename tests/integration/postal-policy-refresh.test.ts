import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { handlePostalSetupRoute } from "../../apps/api/src/postal-setup";
import {
  refreshPostalPolicies,
  inspectPostalPolicyDeadline,
} from "../../apps/api/src/postal-policy-refresh";
import {
  DomainService,
  canonicalJson,
  sha256,
  type ActorContext,
  type PrepareInput,
} from "../../packages/domain/src/index";
import { validateLiveDeliveryQuote } from "../../packages/domain/src/live-delivery-quotes";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";
import { hashSecret } from "../../apps/api/src/auth";
import type { Env } from "../../apps/api/src/env";
import type { Fetcher } from "../../packages/providers";
const DAY = 86400000;
let mf: Miniflare,
  db: D1Database,
  env: Env,
  clock: number,
  ctx: ActorContext,
  domain: DomainService;
let senderId: string,
  calls: string[],
  country: string,
  beforeInspection: (() => Promise<void>) | undefined;
const stamp = () => new Date(clock).toISOString();
const id = (kind: string) =>
  kind === "sender_postal" ? senderId : `${kind}_${ctx.organizationId}`;
const identity = {
  postal: { accountId: "pingen-fixture", routeId: "pingen-fixture" },
};
const print = {
  addressPosition: "left",
  deliveryProduct: "cheap",
  printMode: "duplex",
  printSpectrum: "grayscale",
};
const fetcher: Fetcher = async (url, init) => {
  const path = new URL(String(url)).pathname;
  calls.push(`${init?.method ?? "GET"} ${path}`);
  if (path === "/auth/access-tokens")
    return Response.json({
      access_token: "synthetic-token",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "organisation_read",
    });
  if (path === "/organisations/pingen-fixture") {
    await beforeInspection?.();
    return Response.json({
      data: {
        id: "pingen-fixture",
        type: "organisations",
        attributes: {
          billing_currency: "EUR",
          default_country: country,
          default_address_position: "left",
        },
      },
    });
  }
  throw new Error("No other provider operation is permitted in this fixture");
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
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await db.batch(
      unstable_splitSqlQuery(
        readFileSync(new URL(name, directory), "utf8"),
      ).map((sql) => db.prepare(sql)),
    );
});
afterAll(async () => {
  await mf?.dispose();
});
afterEach(() => vi.useRealTimers());
beforeEach(async () => {
  clock = Date.parse("2026-10-30T10:00:00.000Z");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
  // A stopped send channel still consumes pricing during preparation. Explicitly
  // deselect prior fixture senders so each tick exercises only this test's tenant.
  await db
    .prepare("UPDATE senders SET status='disabled' WHERE channel='postal'")
    .run();
  ctx = {
    organizationId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    role: "admin",
    actor: "browser",
  };
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Synthetic workspace','production',?)",
      )
      .bind(ctx.organizationId, stamp()),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Synthetic reviewer','test@example.invalid',?)",
      )
      .bind(ctx.userId, stamp()),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(ctx.organizationId, ctx.userId, stamp()),
    db
      .prepare("INSERT INTO channel_controls VALUES(?,'postal',0)")
      .bind(ctx.organizationId),
  ]);
  const token = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64url"),
    csrf = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account) VALUES(?,?,?,?,0,0,?,?,1)",
    )
    .bind(
      await hashSecret(token),
      ctx.userId,
      ctx.organizationId,
      csrf,
      stamp(),
      new Date(clock + 3600000).toISOString(),
    )
    .run();
  env = {
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    AUTH0_AUTH_POLICY: "verified_email",
    LIVE_SENDS_ENABLED: "true",
    LIVE_SEND_CHANNELS: "postal",
    POSTAL_DRAFTS_ENABLED: "true",
    PINGEN_SANDBOX: "false",
    PINGEN_CLIENT_ID: "synthetic-client",
    PINGEN_CLIENT_SECRET: "synthetic-secret",
    PINGEN_ORGANIZATION_ID: "pingen-fixture",
    PINGEN_DEFAULT_COUNTRY: "LU",
    PINGEN_WEBHOOK_SECRET: "synthetic-webhook",
    PINGEN_UPLOAD_ORIGINS: "https://upload.pingen.example",
  } as Env;
  country = "LU";
  beforeInspection = undefined;
  calls = [];
  const response = await handlePostalSetupRoute(
    new Request(`${env.APP_ORIGIN}/api/postal/setup`, {
      method: "POST",
      headers: {
        Origin: env.APP_ORIGIN,
        Cookie: `__Host-guteneo_session=${token}`,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Fixture",
        address: "Fixture sender",
        authorized: true,
      }),
    }),
    env,
    { fetcher },
  );
  expect(response?.status).toBe(200);
  senderId = (await db
    .prepare(
      "SELECT sender_id FROM postal_sender_declarations WHERE organization_id=?",
    )
    .bind(ctx.organizationId)
    .first<{ sender_id: string }>())!.sender_id;
  calls = [];
  clock += 84 * DAY;
  vi.setSystemTime(clock);
  domain = new DomainService(db, {
    mode: "production",
    now: () => clock,
    liveDeliveryIdentity: identity,
    postalQuote: async (request) => ({
      supplierMinor: 150,
      currency: "EUR",
      providerDraftId: request.options.providerDraftId as string,
      preparedLetterId: request.options.preparedLetterId as string,
      evidenceSha256: "c".repeat(64),
    }),
  });
  await domain.registerDocument(ctx, {
    id: id("doc"),
    name: "synthetic.pdf",
    sha256: "a".repeat(64),
    size: 1000,
    pages: 2,
    status: "ready",
    source: "import",
    storageKey: `synthetic/${ctx.organizationId}`,
    scanVerified: true,
  });
});
async function rows(table: string) {
  return (
    await db
      .prepare(`SELECT * FROM ${table} WHERE organization_id=? ORDER BY rowid`)
      .bind(ctx.organizationId)
      .all()
  ).results;
}
async function legacyWindowFixture(
  mutateMigration: (source: string) => string = (source) => source,
) {
  const legacy = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["LEGACY"],
    }),
  );
  const target = (await legacy.getD1Database(
    "LEGACY",
  )) as unknown as D1Database;
  try {
    const directory = new URL("../../migrations/", import.meta.url);
    const names = readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const apply = async (source: string) =>
      target.batch(
        unstable_splitSqlQuery(source).map((sql) => target.prepare(sql)),
      );
    for (const name of names.filter((name) => name < "0036_"))
      await apply(readFileSync(new URL(name, directory), "utf8"));
    const policies = (await rows("trusted_delivery_costs")).filter(
      (row) => JSON.parse(String(row.options_json)).addressPosition === "left",
    );
    expect(policies).toHaveLength(8);
    const generation = (await rows("postal_setup_policy_generations"))[0];
    for (const table of [
      "organizations",
      "users",
      "memberships",
      "channel_controls",
      "senders",
      "audit_log",
      "postal_sender_declarations",
      "trusted_delivery_costs",
      "postal_setup_policy_generations",
    ]) {
      const fields = new Set(
        (
          await target
            .prepare(`PRAGMA table_info(${table})`)
            .all<{ name: string }>()
        ).results.map((field) => field.name),
      );
      const sourceRows =
        table === "users" || table === "organizations"
          ? (
              await db
                .prepare(`SELECT * FROM ${table} WHERE id=?`)
                .bind(table === "users" ? ctx.userId : ctx.organizationId)
                .all()
            ).results
          : table === "trusted_delivery_costs"
            ? policies
            : table === "postal_setup_policy_generations"
              ? [
                  {
                    ...generation,
                    policy_ids_json: canonicalJson(policies.map((p) => p.id)),
                  },
                ]
              : await rows(table);
      for (const row of sourceRows) {
        const entries = Object.entries(row).filter(([key]) => fields.has(key));
        await target
          .prepare(
            `INSERT INTO ${table}(${entries.map(([key]) => key).join(",")}) VALUES(${entries.map(() => "?").join(",")})`,
          )
          .bind(...entries.map(([, value]) => value))
          .run();
      }
    }
    const expandedAt = new Date(
      Date.parse(String(generation.created_at)) + 10_380_480,
    ).toISOString();
    // Freeze SQLite's clock only; execute the actual 0036 expansion and guards.
    const expansion = mutateMigration(
      readFileSync(
        new URL("0036_postal_window_options.sql", directory),
        "utf8",
      ),
    ).replaceAll("'now'", `'${expandedAt}'`);
    await apply(expansion);
    for (const name of names.filter(
      (name) => name > "0036_postal_window_options.sql",
    ))
      await apply(readFileSync(new URL(name, directory), "utf8"));
    return {
      db: target,
      env: { ...env, DB: target },
      dispose: () => legacy.dispose(),
      generation,
      policies,
    };
  } catch (error) {
    await legacy.dispose();
    throw error;
  }
}
const deps = () => ({ now: () => clock, fetcher });
async function postal(
  version: string = PINGEN_PREFLIGHT_VERSION,
): Promise<PrepareInput> {
  const recipient = {
    name: "Fixture Person",
    line1: "1 Test Street",
    postalCode: "1000",
    city: "Luxembourg",
    country: "LU",
  };
  const expectedAddress = "Fixture Person\n1 Test Street\n1000 Luxembourg";
  const draft = crypto.randomUUID(),
    letter = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO provider_drafts(id,organization_id,document_id,document_sha256,sender_id,sender_address,provider,provider_id,recipient_json,expected_address,options_json,ceiling_minor,currency,status,request_hash,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,'pingen',?,?,?,?,400,'EUR','prepared',?,?,?,?)",
    )
    .bind(
      draft,
      ctx.organizationId,
      id("doc"),
      "a".repeat(64),
      id("sender_postal"),
      "Fixture sender",
      letter,
      canonicalJson(recipient),
      expectedAddress,
      canonicalJson(print),
      "d".repeat(64),
      draft,
      stamp(),
      stamp(),
    )
    .run();
  // Synthetic renderer proof and browser consent for this isolated postal draft.
  // Keep the actual migration guards enabled; the service suite tests rendering.
  const preflightId = crypto.randomUUID();
  const fingerprint = await sha256(
    canonicalJson({ recipient, print, documentSha256: "a".repeat(64), draft }),
  );
  const record = {
    id: preflightId,
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    document_id: id("doc"),
    document_sha256: "a".repeat(64),
    sender_id: id("sender_postal"),
    sender_address: "Fixture sender",
    recipient_json: canonicalJson(recipient),
    options_json: canonicalJson(print),
    profile_json: canonicalJson({
      accountId: identity.postal.accountId,
      environment: "sandbox",
      defaultCountry: "LU",
      addressPosition: "left",
      version,
    }),
    expected_address: expectedAddress,
    ceiling_minor: 400,
    request_hash: fingerprint,
    input_hash: fingerprint,
    idempotency_key: preflightId,
    status: "processing",
    budget_day: stamp().slice(0, 10),
    processing_until: new Date(clock + 60000).toISOString(),
    expires_at: new Date(clock + 3600000).toISOString(),
    created_at: stamp(),
    updated_at: stamp(),
  };
  const report = {
    version,
    status: "review_required",
    sha256: "a".repeat(64),
    pages: 2,
    canSend: false,
    issues: [],
    requiredReviews: ["printed_recipient_matches"],
    rendering: {
      complete: true,
      dpi: 144,
      pages: [1, 2].map((page) => ({
        page,
        width: 1191,
        height: 1684,
        rasterSha256: "b".repeat(64),
      })),
    },
    address: {
      lines: expectedAddress.split("\n"),
      issues: [],
      textVisibility: "not_verified",
      crop: {
        pngBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        width: 1,
        height: 1,
        boundsMm: { x: 20, y: 40, width: 89.5, height: 47.5 },
      },
    },
  };
  await db
    .prepare(
      "INSERT INTO content_limits VALUES(?,10,80000000,10) ON CONFLICT(organization_id) DO NOTHING",
    )
    .bind(ctx.organizationId)
    .run();
  await db.batch([
    db
      .prepare(
        `INSERT INTO postal_preflights(${Object.keys(record).join(",")}) VALUES(${Object.keys(
          record,
        )
          .map(() => "?")
          .join(",")})`,
      )
      .bind(...Object.values(record)),
    db
      .prepare(
        "UPDATE postal_preflights SET status='review_required',report_json=? WHERE id=?",
      )
      .bind(canonicalJson(report), preflightId),
    db
      .prepare(
        "INSERT INTO postal_transfer_consents(preflight_id,organization_id,user_id,fingerprint,reviewed,transfer_only,created_at) VALUES(?,?,?,?,1,1,?)",
      )
      .bind(preflightId, ctx.organizationId, ctx.userId, fingerprint, stamp()),
    db
      .prepare(
        "UPDATE postal_preflights SET transfer_status='preparing',transfer_started_at=? WHERE id=?",
      )
      .bind(stamp(), preflightId),
    db
      .prepare(
        "UPDATE postal_preflights SET transfer_status='prepared',provider_draft_id=? WHERE id=?",
      )
      .bind(draft, preflightId),
  ]);
  return {
    channel: "postal",
    recipient,
    documentId: id("doc"),
    ceilingMinor: 400,
    options: {
      ...print,
      providerDraftId: draft,
      preparedLetterId: letter,
      expectedAddress,
    },
  };
}
describe("automatic postal policy maintenance — isolated production-shaped D1", () => {
  it("recognizes the real 0036 window expansion without rewriting its older price dates", async () => {
    const legacy = await legacyWindowFixture();
    try {
      const before = await legacy.db
        .prepare("SELECT * FROM trusted_delivery_costs ORDER BY id")
        .all();
      expect(before.results).toHaveLength(16);
      const inspected = await inspectPostalPolicyDeadline(
        legacy.env,
        ctx.organizationId,
      );
      expect(inspected).toMatchObject({
        status: "active",
        expiresAt: legacy.generation.expires_at,
      });
      expect(calls).toEqual([]);
      expect(
        await legacy.db
          .prepare("SELECT * FROM trusted_delivery_costs ORDER BY id")
          .all(),
      ).toMatchObject({ results: before.results });
      expect(await refreshPostalPolicies(legacy.env, deps())).toEqual({
        postalPoliciesRefreshed: 1,
        postalPolicyRefreshFailed: 0,
        postalPolicyRefreshDeferred: 0,
      });
      expect(calls).toEqual([
        "POST /auth/access-tokens",
        "GET /organisations/pingen-fixture",
      ]);
      expect(
        await legacy.db
          .prepare(
            "SELECT COUNT(*) AS count FROM postal_setup_policy_generations",
          )
          .first("count"),
      ).toBe(3);
      const after = (
        await legacy.db
          .prepare("SELECT * FROM trusted_delivery_costs ORDER BY id")
          .all()
      ).results;
      const priorIds = new Set(before.results.map((row) => row.id));
      expect(after.filter((row) => priorIds.has(row.id))).toEqual(
        before.results.map((row) => ({ ...row, status: "revoked" })),
      );
      await expect(
        legacy.db
          .prepare(
            "UPDATE postal_setup_policy_generations SET created_at=? WHERE organization_id=? AND generation=2",
          )
          .bind(stamp(), ctx.organizationId)
          .run(),
      ).rejects.toThrow(/immutable_postal_setup/);
      expect(
        await legacy.db
          .prepare("SELECT COUNT(*) AS count FROM outbox")
          .first("count"),
      ).toBe(0);
    } finally {
      await legacy.dispose();
    }
  });
  it.each([
    [
      "missing predecessor",
      (sql: string) => sql.replace("g.generation+1", "g.generation+2"),
    ],
    [
      "unrelated audit",
      (sql: string) =>
        sql.replaceAll(
          "'postal.pricing.windows_extended'",
          "'postal.pricing.untrusted'",
        ),
    ],
    [
      "invented consent",
      (sql: string) =>
        sql.replaceAll(
          '"humanConsentClaimed":false',
          '"humanConsentClaimed":true',
        ),
    ],
    [
      "unproven clone IDs",
      (sql: string) => sql.replaceAll("'cost_window_'", "'untrusted_window_'"),
    ],
    [
      "changed price history",
      (sql: string) =>
        sql.replace(
          "p.valid_from,p.expires_at,p.status",
          "strftime('%Y-%m-%dT%H:%M:%fZ',p.valid_from,'-1 day'),p.expires_at,p.status",
        ),
    ],
    [
      "unrelated generation clock",
      (sql: string) =>
        sql.replace(
          "g.profile_json,'audit_windows_'||g.audit_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),g.expires_at",
          "g.profile_json,'audit_windows_'||g.audit_id,strftime('%Y-%m-%dT%H:%M:%fZ',g.created_at,'-1 hour'),g.expires_at",
        ),
    ],
  ] as const)(
    "keeps %s unknown rather than accepting a forged legacy chain",
    async (_name, mutate) => {
      const legacy = await legacyWindowFixture(mutate);
      try {
        expect(
          await inspectPostalPolicyDeadline(legacy.env, ctx.organizationId),
        ).toMatchObject({ status: "unknown", code: "BINDING_CHANGED" });
        expect(calls).toEqual([]);
      } finally {
        await legacy.dispose();
      }
    },
  );
  it("does not loosen canonical-generation timestamps or accept a changed legacy profile", async () => {
    const legacy = await legacyWindowFixture();
    try {
      expect(
        await inspectPostalPolicyDeadline(
          { ...legacy.env, PINGEN_DEFAULT_COUNTRY: "FR" },
          ctx.organizationId,
        ),
      ).toMatchObject({ status: "unknown", code: "BINDING_CHANGED" });
      const generation = (await rows("postal_setup_policy_generations"))[0];
      const changed = {
        ...generation,
        generation: 2,
        created_at: new Date(
          Date.parse(String(generation.created_at)) + 1000,
        ).toISOString(),
      };
      await db
        .prepare(
          `INSERT INTO postal_setup_policy_generations(${Object.keys(changed).join(",")}) VALUES(${Object.keys(
            changed,
          )
            .map(() => "?")
            .join(",")})`,
        )
        .bind(...Object.values(changed))
        .run();
      expect(
        await inspectPostalPolicyDeadline(env, ctx.organizationId),
      ).toMatchObject({ status: "unknown", code: "BINDING_CHANGED" });
    } finally {
      await legacy.dispose();
    }
  });
  it("retains the exact-snapshot commit fence for an inherited generation", async () => {
    const legacy = await legacyWindowFixture();
    try {
      beforeInspection = async () => {
        await legacy.db
          .prepare(
            "UPDATE senders SET name='Changed fixture' WHERE organization_id=? AND id=?",
          )
          .bind(ctx.organizationId, senderId)
          .run();
      };
      const before = (
        await legacy.db
          .prepare("SELECT * FROM trusted_delivery_costs ORDER BY id")
          .all()
      ).results;
      expect(await refreshPostalPolicies(legacy.env, deps())).toMatchObject({
        postalPoliciesRefreshed: 0,
        postalPolicyRefreshFailed: 0,
        postalPolicyRefreshDeferred: 1,
      });
      expect(
        await legacy.db
          .prepare(
            "SELECT last_error_code FROM postal_policy_refresh_state WHERE organization_id=?",
          )
          .bind(ctx.organizationId)
          .first("last_error_code"),
      ).toBe("COMMIT_CHANGED");
      expect(
        (
          await legacy.db
            .prepare("SELECT * FROM trusted_delivery_costs ORDER BY id")
            .all()
        ).results,
      ).toEqual(before);
      expect(
        await legacy.db
          .prepare(
            "SELECT COUNT(*) AS count FROM postal_setup_policy_generations",
          )
          .first("count"),
      ).toBe(2);
    } finally {
      await legacy.dispose();
    }
  });
  it("reinspects only the same provider profile, preserves original method evidence and sender authority, and installs one immutable generation", async () => {
    const declared = await rows("postal_sender_declarations"),
      senders = await rows("senders"),
      channels = await rows("channel_controls"),
      previous = await rows("trusted_delivery_costs");
    const before = await inspectPostalPolicyDeadline(env, ctx.organizationId);
    expect(before.status).toBe("active");
    expect(await refreshPostalPolicies(env, deps())).toEqual({
      postalPoliciesRefreshed: 1,
      postalPolicyRefreshFailed: 0,
      postalPolicyRefreshDeferred: 0,
    });
    expect(calls).toEqual([
      "POST /auth/access-tokens",
      "GET /organisations/pingen-fixture",
    ]);
    expect(await rows("postal_sender_declarations")).toEqual(declared);
    expect(await rows("senders")).toEqual(senders);
    expect(await rows("channel_controls")).toEqual(channels);
    const policies = await rows("trusted_delivery_costs");
    expect(policies).toHaveLength(32);
    expect(policies.filter((p) => p.status === "revoked")).toHaveLength(16);
    const next = policies.filter((p) => p.status === "qualified");
    expect(next).toHaveLength(16);
    for (const p of next) {
      expect(p.rate_json).toBe(previous[0].rate_json);
      expect(p.source_sha256).toBe(previous[0].source_sha256);
      expect(p.expires_at).toBe(new Date(clock + 90 * DAY).toISOString());
    }
    const after = await inspectPostalPolicyDeadline(env, ctx.organizationId);
    expect(after.status).toBe("active");
    if (before.status === "active" && after.status === "active")
      expect(after.revisionSha256).not.toBe(before.revisionSha256);
    expect(await rows("provider_drafts")).toHaveLength(0);
    expect(await rows("approvals")).toHaveLength(0);
    expect(await rows("outbox")).toHaveLength(0);
    expect(await rows("reservations")).toHaveLength(0);
    expect(await rows("postal_setup_policy_generations")).toHaveLength(2);
    await expect(
      db
        .prepare(
          "UPDATE postal_setup_policy_generations SET expires_at=? WHERE organization_id=?",
        )
        .bind(new Date(clock + 100 * DAY).toISOString(), ctx.organizationId)
        .run(),
    ).rejects.toThrow(/immutable_postal_setup/);
  });
  it("does not poll an unchanged generation before its seven-day maintenance window", async () => {
    clock -= 10 * DAY;
    vi.setSystemTime(clock);
    expect(
      (await refreshPostalPolicies(env, deps())).postalPoliciesRefreshed,
    ).toBe(0);
    expect(calls).toEqual([]);
  });
  it("does not renew or alert an explicitly disabled postal preparation consumer", async () => {
    env.POSTAL_DRAFTS_ENABLED = "false";
    expect(
      (await refreshPostalPolicies(env, deps())).postalPoliciesRefreshed,
    ).toBe(0);
    expect(
      await inspectPostalPolicyDeadline(env, ctx.organizationId),
    ).toMatchObject({ status: "inactive", reason: "transport_disabled" });
    expect(calls).toEqual([]);
  });
  it.each([
    { live: undefined, channels: undefined, channel: 1 },
    { live: "false", channels: "fax,email", channel: 0 },
    { live: "true", channels: "postal,garbage", channel: 1 },
    { live: "true", channels: "garbage", channel: 0 },
  ])(
    "maintains the consumed preparation policy despite final-send settings %j",
    async ({ live, channels, channel }) => {
      env.LIVE_SENDS_ENABLED = live;
      env.LIVE_SEND_CHANNELS = channels;
      await db
        .prepare(
          "UPDATE channel_controls SET enabled=? WHERE organization_id=? AND channel='postal'",
        )
        .bind(channel, ctx.organizationId)
        .run();
      expect(
        await inspectPostalPolicyDeadline(env, ctx.organizationId),
      ).toMatchObject({ status: "active" });
      expect(
        (await refreshPostalPolicies(env, deps())).postalPoliciesRefreshed,
      ).toBe(1);
      expect(calls).toEqual([
        "POST /auth/access-tokens",
        "GET /organisations/pingen-fixture",
      ]);
      expect((await rows("channel_controls"))[0].enabled).toBe(channel);
    },
  );
  it("an exact prepared quote still consumes its policy when only final sending is stopped", async () => {
    env.LIVE_SENDS_ENABLED = "false";
    env.LIVE_SEND_CHANNELS = "fax";
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='postal'",
      )
      .bind(ctx.organizationId)
      .run();
    const dispatch = await domain.prepareDispatch(
      ctx,
      await postal(),
      crypto.randomUUID(),
    );
    expect(
      await validateLiveDeliveryQuote(db, dispatch, identity.postal, stamp()),
    ).toMatchObject({ fingerprint: dispatch.quote_fingerprint });
    expect(
      await inspectPostalPolicyDeadline(env, ctx.organizationId),
    ).toMatchObject({ status: "active" });
    expect(
      (await refreshPostalPolicies(env, deps())).postalPolicyRefreshDeferred,
    ).toBe(1);
    expect(calls).toEqual([]);
  });

  it("cannot revive a revoked current generation", async () => {
    await db
      .prepare(
        "UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=? AND channel='postal'",
      )
      .bind(ctx.organizationId)
      .run();
    expect(
      (await refreshPostalPolicies(env, deps())).postalPolicyRefreshFailed,
    ).toBe(0);
    expect(calls).toEqual([]);
    expect(
      await inspectPostalPolicyDeadline(env, ctx.organizationId),
    ).toMatchObject({ status: "inactive", reason: "policies_revoked" });
    expect(await rows("postal_setup_policy_generations")).toHaveLength(1);
  });
  it("fails closed on a different live provider profile and backs off without relabelling a successful inspection", async () => {
    country = "DE";
    const original = await rows("trusted_delivery_costs");
    expect(
      (await refreshPostalPolicies(env, deps())).postalPolicyRefreshFailed,
    ).toBe(1);
    expect(await rows("trusted_delivery_costs")).toEqual(original);
    const state = (await rows("postal_policy_refresh_state"))[0];
    expect(state.last_error_code).toBe("PROFILE_CHANGED");
    expect(state.last_success_at).toBeNull();
    expect(
      (await refreshPostalPolicies(env, deps())).postalPolicyRefreshFailed,
    ).toBe(0);
    expect(calls).toHaveLength(2);
  });
  it("defers before provider reads while an exact prepared quote remains usable, preserving its fingerprint and approval", async () => {
    const dispatch = await domain.prepareDispatch(
      ctx,
      await postal(),
      crypto.randomUUID(),
    );
    await domain.approveDispatch(ctx, dispatch.id, dispatch.fingerprint);
    const quotes = await rows("live_delivery_quotes"),
      approvals = await rows("approvals");
    expect(
      (await refreshPostalPolicies(env, deps())).postalPolicyRefreshDeferred,
    ).toBe(1);
    expect(calls).toEqual([]);
    expect(await rows("live_delivery_quotes")).toEqual(quotes);
    expect(await rows("approvals")).toEqual(approvals);
    expect(
      await validateLiveDeliveryQuote(db, dispatch, identity.postal, stamp()),
    ).toMatchObject({ fingerprint: dispatch.quote_fingerprint });
  });
  it("does not mutate a queued letter or its reservation", async () => {
    const dispatch = await domain.prepareDispatch(
      ctx,
      await postal(),
      crypto.randomUUID(),
    );
    await domain.approveDispatch(ctx, dispatch.id, dispatch.fingerprint);
    await domain.confirmDispatch(ctx, dispatch.id, crypto.randomUUID());
    const quotes = await rows("live_delivery_quotes"),
      reservations = await rows("welcome_credit_reservations");
    expect(
      (await refreshPostalPolicies(env, deps())).postalPolicyRefreshDeferred,
    ).toBe(1);
    expect(calls).toEqual([]);
    expect(await rows("live_delivery_quotes")).toEqual(quotes);
    expect(await rows("welcome_credit_reservations")).toEqual(reservations);
  });
  it("rechecks the exact sender and generation after the provider wait", async () => {
    beforeInspection = async () => {
      await db
        .prepare(
          "UPDATE senders SET status='disabled' WHERE organization_id=? AND channel='postal'",
        )
        .bind(ctx.organizationId)
        .run();
    };
    const old = await rows("trusted_delivery_costs");
    expect(
      (await refreshPostalPolicies(env, deps())).postalPolicyRefreshDeferred,
    ).toBe(1);
    expect(await rows("trusted_delivery_costs")).toEqual(old);
    expect(await rows("postal_setup_policy_generations")).toHaveLength(1);
  });
  it("defers atomically when a new usable quote appears during the provider inspection", async () => {
    let created:
      Awaited<ReturnType<DomainService["prepareDispatch"]>> | undefined;
    beforeInspection = async () => {
      created = await domain.prepareDispatch(
        ctx,
        await postal(),
        crypto.randomUUID(),
      );
    };
    const previous = await rows("trusted_delivery_costs");
    expect(
      (await refreshPostalPolicies(env, deps())).postalPolicyRefreshDeferred,
    ).toBe(1);
    expect(await rows("trusted_delivery_costs")).toEqual(previous);
    expect(await rows("postal_setup_policy_generations")).toHaveLength(1);
    expect(created).toBeDefined();
    expect(
      await validateLiveDeliveryQuote(db, created!, identity.postal, stamp()),
    ).toMatchObject({ fingerprint: created!.quote_fingerprint });
  });
  it("does not treat missing bindings or a rolling-schema error as proof of source deselection", async () => {
    expect(
      await inspectPostalPolicyDeadline(env, crypto.randomUUID()),
    ).toMatchObject({ status: "unknown", code: "BINDING_CHANGED" });
    expect(
      await inspectPostalPolicyDeadline(
        { ...env, POSTAL_DRAFTS_ENABLED: undefined },
        ctx.organizationId,
      ),
    ).toMatchObject({ status: "unknown", code: "BINDING_CHANGED" });
    expect(
      await inspectPostalPolicyDeadline(
        { ...env, APP_ORIGIN: "http://unsafe.example" },
        ctx.organizationId,
      ),
    ).toMatchObject({ status: "unknown", code: "BINDING_CHANGED" });
    expect(
      await inspectPostalPolicyDeadline(
        { ...env, POSTAL_DRAFTS_ENABLED: "garbage" },
        ctx.organizationId,
      ),
    ).toMatchObject({ status: "unknown", code: "BINDING_CHANGED" });
    const broken = {
      ...env,
      DB: {
        prepare: () => {
          throw new Error("missing schema");
        },
      } as unknown as D1Database,
    };
    expect(
      await inspectPostalPolicyDeadline(broken, ctx.organizationId),
    ).toMatchObject({ status: "unknown", code: "DATABASE_UNAVAILABLE" });
    expect(await refreshPostalPolicies(broken, deps())).toEqual({
      postalPoliciesRefreshed: 0,
      postalPolicyRefreshFailed: 1,
      postalPolicyRefreshDeferred: 0,
    });
  });
  it("one valid refresh is bounded and subsequent ticks perform no provider reads", async () => {
    const result = await refreshPostalPolicies(env, deps());
    expect(result.postalPoliciesRefreshed).toBe(1);
    calls = [];
    expect(await refreshPostalPolicies(env, deps())).toEqual({
      postalPoliciesRefreshed: 0,
      postalPolicyRefreshFailed: 0,
      postalPolicyRefreshDeferred: 0,
    });
    expect(calls).toEqual([]);
  });
});
