import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { collectProviderFreshness } from "../../apps/api/src/provider-freshness";
import {
  reconcileFreshnessAlerts,
  type FreshnessEvaluation,
} from "../../apps/api/src/freshness-alerts";
import {
  canonicalJson,
  emailRateComponents,
  sha256,
} from "../../packages/domain/src/index";
import { telnyxAccountReference } from "../../packages/providers/telnyx-readiness";
import { ensureEmailSender, RESEND_RATE } from "../../apps/api/src/email-setup";
import {
  postalRateEvidence,
  resolveDeliveryPrice,
} from "../../packages/domain/src/live-delivery-quotes";
import { resendIdentity } from "../../apps/api/src/resend-environment";
import { readResendPolicyFreshness } from "../../apps/api/src/resend-policy-refresh";
import type { Env } from "../../apps/api/src/env";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";

const NOW = Date.parse("2026-10-30T10:00:00.000Z"),
  DAY = 86400000;
const at = (offset = 0) => new Date(NOW + offset).toISOString();
const cap = "2026-11-03T23:59:59.999Z";
let mf: Miniflare, db: D1Database, env: Env, tick: number;
let fixture: Awaited<ReturnType<typeof createFaxUsageFixture>>;
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
afterAll(async () => mf?.dispose());
beforeEach(async () => {
  tick = 0;
  await db.batch([
    db.prepare("UPDATE channel_controls SET enabled=0"),
    // Prior workspaces remain preparation-capable despite their final-send stop.
    // Explicitly stop only their automatic producer to isolate the next fixture.
    db
      .prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT 'fixture_email_stop_'||id,id,NULL,'channel.control','email','{\"enabled\":false}',? FROM organizations WHERE 1 ON CONFLICT(id) DO NOTHING",
      )
      .bind(at()),
    db.prepare("DELETE FROM provider_freshness_incidents"),
    db.prepare("DELETE FROM provider_freshness_bindings"),
    db.prepare("DELETE FROM provider_freshness_cursors"),
  ]);
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
  const account = (await telnyxAccountReference(publicKey))!;
  env = {
    DB: db,
    MODE: "production",
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://guteneo.com",
    LIVE_SENDS_ENABLED: "true",
    LIVE_SEND_CHANNELS: "fax,email,postal",
    TELNYX_API_KEY: "synthetic-key",
    TELNYX_PUBLIC_KEY: publicKey,
    TELNYX_ACCOUNT_ID: account,
    TELNYX_CONNECTION_ID: "123",
    TELNYX_OUTBOUND_VOICE_PROFILE_ID: "456",
    TELNYX_FROM: "+35220000000",
    TELNYX_ALLOWED_PREFIXES: "+33,+352,+49",
    EMAIL_PROVIDER: "resend",
    RESEND_SENDS_ENABLED: "true",
    RESEND_ACCOUNT_ID: "resend-fixture",
    RESEND_DOMAIN_ID: "domain-fixture",
    RESEND_VERIFIED_DOMAIN: "guteneo.com",
    RESEND_API_KEY: "synthetic-send",
    RESEND_WEBHOOK_SECRET: "synthetic-webhook",
    RESEND_TARIFF_QUALIFIED_UNTIL: at(DAY),
  } as Env;
  fixture = await createFaxUsageFixture(db, () => NOW, {
    account_id: account,
    connection_id: "123",
    outbound_profile_id: "456",
    expires_at: at(5 * DAY),
  });
});
async function collect(
  org = fixture.ctx.organizationId,
  dependencies: Parameters<typeof collectProviderFreshness>[1] = {},
) {
  const found = new Map<string, FreshnessEvaluation>();
  let failed = 0;
  for (let i = 0; i < 5; i++) {
    const value = await collectProviderFreshness(env, {
      now: () => NOW + tick++,
      ...dependencies,
    });
    failed += value.freshnessChecksFailed;
    for (const row of value.evaluations)
      if (row.organizationId === org)
        found.set(row.family + row.bindingSha256, row);
  }
  return { evaluations: [...found.values()], freshnessChecksFailed: failed };
}
async function register(expires = at(DAY)) {
  fixture = await createFaxUsageFixture(db, () => NOW, {
    account_id: env.TELNYX_ACCOUNT_ID!,
    connection_id: "123",
    outbound_profile_id: "456",
    destination_prefix: "+3524",
    destination_country_code: "LU",
    origin_class: "local",
    destination_category: "fixed",
    route_qualification: "operator_test",
    operator_authorization_reference: "SYNTHETIC BOUNDED AUTHORITY",
    operator_test_ceiling_minor: 200,
    execution_scope: "live",
    max_pages: 10,
    quote_ttl_seconds: 900,
    valid_from: at(-DAY),
    expires_at: expires,
    fx_date: at(-DAY).slice(0, 10),
  });
  const id = crypto.randomUUID();
  await insertRecord(db, "fax_tariff_refresh_sources", {
    id,
    organization_id: fixture.ctx.organizationId,
    sender_id: fixture.tariff.sender_id,
    initial_tariff_id: fixture.tariff.id,
    account_id: env.TELNYX_ACCOUNT_ID!,
    connection_id: "123",
    outbound_profile_id: "456",
    destination_prefix: "+3524",
    options_json: "{}",
    tariff_catalog: "global_conversational",
    rate_deck_url:
      "https://portal.telnyx.com/downloads/global_conversational/synthetic.csv",
    authorization_expires_at: cap,
    authorization_reference: "SYNTHETIC PUBLIC SOURCE AUTHORIZATION",
    commercial_basis: "public_reference_not_negotiated",
    status: "active",
    created_at: at(),
  });
  return id;
}
async function email() {
  await db
    .prepare("INSERT INTO channel_controls VALUES(?,'email',1)")
    .bind(fixture.ctx.organizationId)
    .run();
  await db
    .prepare(
      "INSERT INTO resend_send_limit_policies VALUES(?,80,2400,500,?,?,?,'qualified') ON CONFLICT(account_id) DO UPDATE SET status='qualified',expires_at_ms=excluded.expires_at_ms",
    )
    .bind(env.RESEND_ACCOUNT_ID!, NOW - DAY, NOW + 3 * DAY, "a".repeat(64))
    .run();
}
async function manualEmail() {
  await email();
  const org = fixture.ctx.organizationId;
  const sender = "snd_email_" + (await sha256(org)).slice(0, 24);
  await insertRecord(db, "senders", {
    id: sender,
    organization_id: org,
    channel: "email",
    name: "Fixture",
    address: "documents@guteneo.com",
    status: "verified",
    mode: "production",
    created_at: at(),
  });
  const rate = {
    ...RESEND_RATE,
    tariffDate: at(-DAY).slice(0, 10),
    fxDate: at(-DAY).slice(0, 10),
  };
  const components = emailRateComponents(rate);
  const id = "manual_" + crypto.randomUUID();
  await insertRecord(db, "trusted_delivery_costs", {
    id,
    organization_id: org,
    sender_id: sender,
    channel: "email",
    provider: "resend",
    account_id: env.RESEND_ACCOUNT_ID!,
    route_id: "resend:domain-fixture:guteneo.com",
    options_json: "{}",
    rate_json: canonicalJson(rate),
    ...components,
    currency: "EUR",
    fiscal_basis: "qualified_final_variable_cost",
    pricing_basis: "public_list_price_ex_tax",
    quote_ttl_seconds: 300,
    source_reference: "SYNTHETIC MANUAL COMMERCIAL POLICY",
    source_sha256: await sha256(canonicalJson(rate)),
    valid_from: at(-DAY),
    expires_at: at(DAY),
    status: "qualified",
    created_at: at(-DAY),
  });
  return id;
}

describe("selected provider deadline collection", () => {
  it("does nothing before any DB access outside production", async () => {
    const prepare = vi.fn(() => {
      throw new Error("unexpected read");
    });
    expect(
      await collectProviderFreshness({
        ...env,
        DB: { prepare } as unknown as D1Database,
        MODE: "simulation",
      }),
    ).toEqual({ evaluations: [], freshnessChecksFailed: 0 });
    expect(prepare).not.toHaveBeenCalled();
  });
  it("separates a renewable registered tariff from its real bounded authority", async () => {
    await register();
    const result = await collect();
    expect(result.freshnessChecksFailed).toBe(0);
    const tariff = result.evaluations.find(
      (value) => value.family === "fax_tariff",
    )!;
    const authority = result.evaluations.find(
      (value) => value.family === "fax_authority",
    )!;
    expect(tariff.candidates[0]).toMatchObject({
      deadline: at(DAY),
      mode: "automatic",
    });
    expect(authority.candidates[0]).toMatchObject({
      deadline: cap,
      mode: "operator",
    });
    expect(
      await reconcileFreshnessAlerts(db, result.evaluations, at()),
    ).toMatchObject({ freshnessAtRisk: 1, freshnessOpened: 1 });
  });
  it("attributes an authority-capped tariff to the authority rather than fake renewable freshness", async () => {
    await register(cap);
    const result = await collect();
    expect(
      result.evaluations.find((value) => value.family === "fax_tariff")?.active,
    ).toBe(false);
    expect(
      result.evaluations.find((value) => value.family === "fax_authority")
        ?.candidates[0].deadline,
    ).toBe(cap);
  });
  it("preserves a warning when sender verification or credentials disappear without an explicit suspension", async () => {
    await register();
    const first = await collect();
    await reconcileFreshnessAlerts(db, first.evaluations, at());
    await db
      .prepare("UPDATE senders SET status='pending' WHERE id=?")
      .bind(fixture.tariff.sender_id)
      .run();
    const unknown = await collect();
    expect(unknown.freshnessChecksFailed).toBeGreaterThan(0);
    expect(unknown.evaluations).toEqual([]);
    expect(
      await reconcileFreshnessAlerts(db, unknown.evaluations, at(1000)),
    ).toMatchObject({ freshnessAtRisk: 1, freshnessResolved: 0 });
    await db
      .prepare("UPDATE senders SET status='verified' WHERE id=?")
      .bind(fixture.tariff.sender_id)
      .run();
    env.TELNYX_API_KEY = undefined;
    expect((await collect()).freshnessChecksFailed).toBeGreaterThan(0);
  });
  it("retains a consumed tariff after source revocation, and closes it on real channel suspension", async () => {
    const source = await register();
    await reconcileFreshnessAlerts(db, (await collect()).evaluations, at());
    await db
      .prepare(
        "UPDATE fax_tariff_refresh_sources SET status='revoked' WHERE id=?",
      )
      .bind(source)
      .run();
    const revoked = await collect();
    expect(
      revoked.evaluations.find((value) => value.family === "fax_authority")
        ?.active,
    ).toBe(false);
    expect(
      revoked.evaluations.find((value) => value.family === "fax_tariff")
        ?.candidates[0].mode,
    ).toBe("operator");
    expect(
      await reconcileFreshnessAlerts(db, revoked.evaluations, at(1000)),
    ).toMatchObject({
      freshnessAtRisk: 1,
      freshnessResolved: 1,
      freshnessOpened: 1,
    });
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='fax'",
      )
      .bind(fixture.ctx.organizationId)
      .run();
    expect(
      await reconcileFreshnessAlerts(
        db,
        (await collect()).evaluations,
        at(2000),
      ),
    ).toMatchObject({ freshnessAtRisk: 0, freshnessResolved: 1 });
  });
  it("warns on a currently consumed unregistered provider-verified fax policy without extending it", async () => {
    const result = await collect();
    expect(result.evaluations.filter((value) => value.active)).toHaveLength(1);
    expect(result.evaluations[0].candidates[0]).toMatchObject({
      deadline: at(5 * DAY),
      mode: "operator",
    });
    expect(
      result.evaluations.some((value) => value.family === "fax_authority"),
    ).toBe(false);
    expect(
      await db
        .prepare("SELECT expires_at FROM trusted_fax_usage_tariffs WHERE id=?")
        .bind(fixture.tariff.id)
        .first("expires_at"),
    ).toBe(at(5 * DAY));
  });
  it("covers the actual legacy fax fallback and suppresses it once v3 has ever owned its scope", async () => {
    const org = fixture.ctx.organizationId,
      sender = "legacy_sender_" + crypto.randomUUID();
    await db
      .prepare("UPDATE senders SET status='disabled' WHERE id=?")
      .bind(fixture.tariff.sender_id)
      .run();
    await insertRecord(db, "senders", {
      id: sender,
      organization_id: org,
      channel: "fax",
      name: "Fixture",
      address: env.TELNYX_FROM!,
      status: "verified",
      mode: "production",
      created_at: at(),
    });
    const id = "legacy_" + crypto.randomUUID();
    await insertRecord(db, "trusted_fax_supplier_costs", {
      id,
      organization_id: org,
      sender_id: sender,
      provider: "telnyx",
      account_id: env.TELNYX_ACCOUNT_ID!,
      connection_id: "123",
      destination_prefix: "+33",
      options_json: "{}",
      currency: "EUR",
      supplier_base_numerator: 0,
      supplier_per_page_numerator: 10,
      supplier_denominator: 1,
      max_pages: 10,
      quote_ttl_seconds: 300,
      cost_basis: "guaranteed_final_supplier_total",
      fiscal_basis: "tax_inclusive_totals",
      currency_basis: "same_currency_no_fx",
      source_reference: "SYNTHETIC GUARANTEED TOTAL",
      source_sha256: "e".repeat(64),
      valid_from: at(-DAY),
      expires_at: at(DAY),
      status: "qualified",
      created_at: at(-DAY),
    });
    env.TELNYX_OUTBOUND_VOICE_PROFILE_ID = undefined;
    const current = await collect();
    expect(current.freshnessChecksFailed).toBe(0);
    const legacy = current.evaluations.find((value) => value.active)!;
    expect(legacy.candidates[0]).toMatchObject({
      deadline: at(DAY),
      mode: "operator",
    });
    await reconcileFreshnessAlerts(db, current.evaluations, at());
    await insertRecord(db, "trusted_fax_usage_tariffs", {
      ...fixture.tariff,
      id: crypto.randomUUID(),
      sender_id: sender,
      status: "revoked",
    });
    const owned = await collect();
    const superseded = owned.evaluations.filter(
      (value) => value.bindingSha256 === legacy.bindingSha256,
    );
    expect(superseded[0].active).toBe(false);
    expect(
      await reconcileFreshnessAlerts(db, superseded, at(1000)),
    ).toMatchObject({ freshnessAtRisk: 0, freshnessResolved: 1 });
  });
  it("covers configured Resend before the first message or automatic sender is created", async () => {
    await email();
    const result = await collect();
    expect(result.freshnessChecksFailed).toBe(0);
    expect(
      result.evaluations.find((value) => value.family === "resend_tariff")
        ?.candidates[0],
    ).toMatchObject({ deadline: at(DAY), mode: "automatic" });
    expect(
      result.evaluations.find((value) => value.family === "resend_send_limits")
        ?.candidates[0].deadline,
    ).toBe(at(3 * DAY));
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM dispatches WHERE organization_id=?",
        )
        .bind(fixture.ctx.organizationId)
        .first("count"),
    ).toBe(0);
  });
  it("collects the automatic tariff before first preparation with final sending stopped and an initially disabled channel", async () => {
    await email();
    env.LIVE_SENDS_ENABLED = "false";
    env.LIVE_SEND_CHANNELS = "fax";
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='email'",
      )
      .bind(fixture.ctx.organizationId)
      .run();
    const result = await collect();
    expect(result.freshnessChecksFailed).toBe(0);
    expect(
      result.evaluations.find((value) => value.family === "resend_tariff")
        ?.candidates[0],
    ).toMatchObject({ deadline: at(DAY), mode: "automatic" });
    expect(
      result.evaluations.find((value) => value.family === "resend_send_limits")
        ?.active,
    ).toBe(false);
    expect(
      await db
        .prepare(
          "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='email'",
        )
        .bind(fixture.ctx.organizationId)
        .first("enabled"),
    ).toBe(0);
    const sender = await ensureEmailSender(env, fixture.ctx, at());
    expect(sender).toBeDefined();
    expect(
      (
        await resolveDeliveryPrice(db, {
          organizationId: fixture.ctx.organizationId,
          senderId: sender!.senderId,
          channel: "email",
          recipient: { email: "synthetic@example.invalid" },
          options: {},
          identity: resendIdentity(env)!,
          now: at(),
        })
      ).policy.id,
    ).toMatch(/^resend_/);
    expect(
      (await db
        .prepare("SELECT count(*) n FROM attempts WHERE organization_id=?")
        .bind(fixture.ctx.organizationId)
        .first())!.n,
    ).toBe(0);
  });
  it("keeps an installed automatic price as an enforced D1 deadline when its automatic producer is disabled", async () => {
    await email();
    const sender = (await ensureEmailSender(env, fixture.ctx, at()))!;
    env.RESEND_SENDS_ENABLED = "false";
    env.LIVE_SENDS_ENABLED = "false";
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='email'",
      )
      .bind(fixture.ctx.organizationId)
      .run();
    await expect(
      resolveDeliveryPrice(db, {
        organizationId: fixture.ctx.organizationId,
        senderId: sender.senderId,
        channel: "email",
        recipient: { email: "synthetic@example.invalid" },
        options: {},
        identity: resendIdentity(env)!,
        now: at(),
      }),
    ).resolves.toMatchObject({ policy: { provider: "resend" } });
    const result = await collect();
    expect(result.freshnessChecksFailed).toBe(0);
    expect(
      result.evaluations.find((value) => value.family === "resend_tariff")
        ?.active,
    ).toBe(false);
    expect(
      result.evaluations.find(
        (value) => value.family === "delivery_policy" && value.active,
      )?.candidates[0],
    ).toMatchObject({ deadline: at(DAY), mode: "operator" });
  });
  it("includes a configured prepare-only email tariff without inventing acceptance or treating its unrelated fax archive as the source", async () => {
    await email();
    await db.batch([
      db
        .prepare(
          "INSERT INTO restricted_delivery_identities(issuer,subject) VALUES('https://synthetic-review.invalid/',?)",
        )
        .bind(fixture.ctx.userId),
      db
        .prepare(
          "INSERT INTO auth_identities VALUES('https://synthetic-review.invalid/',?,?,?)",
        )
        .bind(fixture.ctx.userId, fixture.ctx.userId, at()),
      db
        .prepare(
          "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='email'",
        )
        .bind(fixture.ctx.organizationId),
    ]);
    const result = await collect();
    expect(result.freshnessChecksFailed).toBe(0);
    expect(
      result.evaluations.find((value) => value.family === "resend_tariff")
        ?.candidates[0],
    ).toMatchObject({ deadline: at(DAY), mode: "automatic" });
    expect(
      result.evaluations.find((value) => value.family === "resend_send_limits")
        ?.active,
    ).toBe(false);
    const sender = (await ensureEmailSender(env, fixture.ctx, at()))!;
    expect(sender).toBeDefined();
    await expect(
      resolveDeliveryPrice(db, {
        organizationId: fixture.ctx.organizationId,
        senderId: sender.senderId,
        channel: "email",
        recipient: { email: "synthetic@example.invalid" },
        options: {},
        identity: resendIdentity(env)!,
        now: at(),
      }),
    ).resolves.toMatchObject({ policy: { provider: "resend" } });
    expect(
      await db
        .prepare(
          "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='email'",
        )
        .bind(fixture.ctx.organizationId)
        .first("enabled"),
    ).toBe(0);
  });
  it("monitors an exact manual email price with final sending disabled, without requiring unused transport keys", async () => {
    await manualEmail();
    env.LIVE_SENDS_ENABLED = "false";
    env.LIVE_SEND_CHANNELS = "fax";
    env.RESEND_API_KEY = undefined;
    env.RESEND_WEBHOOK_SECRET = undefined;
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='email'",
      )
      .bind(fixture.ctx.organizationId)
      .run();
    const senderId =
      "snd_email_" + (await sha256(fixture.ctx.organizationId)).slice(0, 24);
    await expect(
      resolveDeliveryPrice(db, {
        organizationId: fixture.ctx.organizationId,
        senderId,
        channel: "email",
        recipient: { email: "synthetic@example.invalid" },
        options: {},
        identity: resendIdentity(env)!,
        now: at(),
      }),
    ).resolves.toMatchObject({ policy: { provider: "resend" } });
    const result = await collect();
    expect(result.freshnessChecksFailed).toBe(0);
    expect(
      result.evaluations.find(
        (value) => value.family === "delivery_policy" && value.active,
      )?.candidates[0],
    ).toMatchObject({ deadline: at(DAY), mode: "operator" });
  });
  it("excludes an expired qualified reviewer archive even though its old dates remain stored", async () => {
    const authority = crypto.randomUUID(),
      org = fixture.ctx.organizationId;
    const valid = "2026-10-01T10:00:00.000Z";
    await insertRecord(db, "fax_review_preparation_authorities", {
      id: authority,
      organization_id: org,
      sender_id: fixture.tariff.sender_id,
      account_id: env.TELNYX_ACCOUNT_ID!,
      connection_id: "123",
      outbound_profile_id: "456",
      recipient_phone: "+35220000000",
      valid_from: valid,
      expires_at: "2026-10-31T10:00:00.000Z",
      status: "active",
      authorization_reference: "SYNTHETIC ARCHIVED REVIEW AUTHORITY",
      source_sha256: "e".repeat(64),
      created_at: valid,
    });
    await insertRecord(db, "trusted_fax_usage_tariffs", {
      ...fixture.tariff,
      id: crypto.randomUUID(),
      execution_scope: "review_prepare_only",
      review_authority_id: authority,
      evidence_observed_at: valid,
      destination_prefix: "+35220",
      destination_country_code: "LU",
      origin_class: "local",
      destination_category: "ngn",
      route_qualification: "operator_test",
      operator_authorization_reference: "SYNTHETIC ARCHIVED REFERENCE",
      operator_test_ceiling_minor: 200,
      max_pages: 7,
      quote_ttl_seconds: 900,
      valid_from: valid,
      created_at: valid,
      expires_at: "2026-10-08T10:00:00.000Z",
      fx_date: "2026-10-01",
    });
    const result = await collect();
    expect(result.freshnessChecksFailed).toBe(0);
    expect(result.evaluations.filter((value) => value.active)).toHaveLength(1);
    expect(
      await reconcileFreshnessAlerts(db, result.evaluations, at()),
    ).toMatchObject({ freshnessAtRisk: 0, freshnessExpired: 0 });
  });
  it("alerts on a selected manual Pingen policy without pretending its source is automatically renewable", async () => {
    const org = fixture.ctx.organizationId,
      sender = "postal_" + crypto.randomUUID(),
      id = "manual_postal_" + crypto.randomUUID();
    env.POSTAL_DRAFTS_ENABLED = "true";
    env.PINGEN_CLIENT_ID = "synthetic-client";
    env.PINGEN_CLIENT_SECRET = "synthetic-secret";
    env.PINGEN_ORGANIZATION_ID = "pingen-fixture";
    env.PINGEN_SANDBOX = "false";
    env.PINGEN_WEBHOOK_SECRET = "synthetic-webhook";
    env.PINGEN_UPLOAD_ORIGINS = "https://upload.example.invalid";
    await insertRecord(db, "senders", {
      id: sender,
      organization_id: org,
      channel: "postal",
      name: "Fixture",
      address: "SYNTHETIC SENDER ADDRESS",
      status: "verified",
      mode: "production",
      created_at: at(),
    });
    await db
      .prepare("INSERT INTO channel_controls VALUES(?,'postal',1)")
      .bind(org)
      .run();
    const rate = postalRateEvidence(at(-DAY).slice(0, 10));
    await insertRecord(db, "trusted_delivery_costs", {
      id,
      organization_id: org,
      sender_id: sender,
      channel: "postal",
      provider: "pingen",
      account_id: "pingen-fixture",
      route_id: "pingen-fixture",
      options_json: canonicalJson({
        addressPosition: "left",
        deliveryProduct: "cheap",
        printMode: "duplex",
        printSpectrum: "grayscale",
      }),
      rate_json: canonicalJson(rate),
      base_numerator: 0,
      byte_numerator: 0,
      rate_denominator: 1,
      currency: "EUR",
      fiscal_basis: "qualified_final_variable_cost",
      pricing_basis: "public_list_price_ex_tax",
      quote_ttl_seconds: 300,
      source_reference: "SYNTHETIC MANUAL POSTAL POLICY",
      source_sha256: await sha256(canonicalJson(rate)),
      valid_from: at(-DAY),
      expires_at: at(DAY),
      status: "qualified",
      created_at: at(-DAY),
    });
    const result = await collect();
    expect(result.freshnessChecksFailed).toBe(0);
    expect(
      result.evaluations.find(
        (value) => value.family === "delivery_policy" && value.active,
      )?.candidates[0],
    ).toMatchObject({ deadline: at(DAY), mode: "operator" });
    expect(
      await reconcileFreshnessAlerts(db, result.evaluations, at()),
    ).toMatchObject({ freshnessAtRisk: 1, freshnessExpired: 0 });
    env.LIVE_SENDS_ENABLED = "false";
    env.LIVE_SEND_CHANNELS = "invalid-send-list";
    env.PINGEN_WEBHOOK_SECRET = undefined;
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='postal'",
      )
      .bind(org)
      .run();
    const preparation = await collect();
    expect(preparation.freshnessChecksFailed).toBe(0);
    const current = preparation.evaluations.find(
      (value) => value.family === "delivery_policy" && value.active,
    )!;
    expect(current.candidates[0]).toMatchObject({
      deadline: at(DAY),
      mode: "operator",
    });
    env.PINGEN_CLIENT_SECRET = undefined;
    const unknown = await collect();
    expect(unknown.freshnessChecksFailed).toBeGreaterThan(0);
    expect(
      await reconcileFreshnessAlerts(db, unknown.evaluations, at(1000)),
    ).toMatchObject({ freshnessAtRisk: 1, freshnessResolved: 0 });
    env.POSTAL_DRAFTS_ENABLED = "false";
    const inactive = await collect();
    expect(
      await reconcileFreshnessAlerts(db, inactive.evaluations, at(2000)),
    ).toMatchObject({ freshnessAtRisk: 0, freshnessResolved: 1 });
  });
  it("retains an actually expired manual gate and closes it only on explicit revocation", async () => {
    const id = await manualEmail();
    env.RESEND_TARIFF_QUALIFIED_UNTIL = at(-1000);
    const result = await collect(fixture.ctx.organizationId, {
      now: () => NOW + 2 * DAY,
    });
    const manual = result.evaluations.filter(
      (value) => value.family === "delivery_policy" && value.active,
    );
    expect(
      await reconcileFreshnessAlerts(db, manual, at(2 * DAY)),
    ).toMatchObject({ freshnessExpired: 1 });
    await db
      .prepare(
        "UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(fixture.ctx.organizationId, id)
      .run();
    const revoked = await collect(fixture.ctx.organizationId, {
      now: () => NOW + 2 * DAY + 1000,
    });
    const exact = revoked.evaluations.filter(
      (value) => value.bindingSha256 === manual[0].bindingSha256,
    );
    expect(exact[0].active).toBe(false);
    expect(
      await reconcileFreshnessAlerts(db, exact, at(2 * DAY + 1000)),
    ).toMatchObject({ freshnessExpired: 0, freshnessResolved: 1 });
  });
  it("uses a manual Resend policy expiry and suppresses the unused automatic qualification deadline", async () => {
    const id = await manualEmail();
    env.RESEND_TARIFF_QUALIFIED_UNTIL = at(-1000);
    const result = await collect();
    expect(result.freshnessChecksFailed).toBe(0);
    expect(
      result.evaluations.find((value) => value.family === "resend_tariff")
        ?.active,
    ).toBe(false);
    const manual = result.evaluations.find(
      (value) => value.family === "delivery_policy" && value.active,
    )!;
    expect(manual.candidates[0]).toMatchObject({
      deadline: at(DAY),
      mode: "operator",
    });
    expect(
      await reconcileFreshnessAlerts(db, result.evaluations, at()),
    ).toMatchObject({ freshnessAtRisk: 1, freshnessExpired: 0 });
    expect(
      await db
        .prepare("SELECT expires_at FROM trusted_delivery_costs WHERE id=?")
        .bind(id)
        .first("expires_at"),
    ).toBe(at(DAY));
    env.RESEND_TARIFF_QUALIFIED_UNTIL = undefined;
    const withoutUnusedSetting = await collect();
    expect(withoutUnusedSetting.freshnessChecksFailed).toBe(0);
    expect(
      withoutUnusedSetting.evaluations.find(
        (value) => value.family === "resend_tariff",
      )?.active,
    ).toBe(false);
    expect(
      withoutUnusedSetting.evaluations.find(
        (value) => value.family === "delivery_policy" && value.active,
      )?.candidates[0].deadline,
    ).toBe(at(DAY));
  });
  it("preserves an exact manual price and independent account limits when the automatic commercial source contradicts its own price", async () => {
    await manualEmail();
    const result = await collect(fixture.ctx.organizationId, {
      readResend: async (...args) => ({
        ...(await readResendPolicyFreshness(...args)),
        blocked: true,
        universalBlocked: false,
        tariffBlocked: true,
        limitsBlocked: false,
        tariffStatus: "unknown" as const,
      }),
    });
    expect(result.freshnessChecksFailed).toBe(0);
    expect(
      result.evaluations.find((value) => value.family === "resend_tariff")
        ?.active,
    ).toBe(false);
    expect(
      result.evaluations.find((value) => value.family === "resend_send_limits")
        ?.active,
    ).toBe(true);
    expect(
      result.evaluations.find(
        (value) => value.family === "delivery_policy" && value.active,
      )?.candidates[0],
    ).toMatchObject({ deadline: at(DAY), mode: "operator" });
  });
  it("keeps a known limits evaluation when the independent automatic tariff check is unknown", async () => {
    await email();
    await reconcileFreshnessAlerts(db, (await collect()).evaluations, at());
    const result = await collect(fixture.ctx.organizationId, {
      readResend: async (...args) => ({
        ...(await readResendPolicyFreshness(...args)),
        tariffStatus: "unknown" as const,
        tariffExpiresAt: null,
      }),
    });
    expect(result.freshnessChecksFailed).toBeGreaterThan(0);
    expect(
      result.evaluations.some((value) => value.family === "resend_tariff"),
    ).toBe(false);
    expect(
      result.evaluations.find((value) => value.family === "resend_send_limits")
        ?.active,
    ).toBe(true);
    expect(
      await reconcileFreshnessAlerts(db, result.evaluations, at(1000)),
    ).toMatchObject({ freshnessAtRisk: 1, freshnessResolved: 0 });
  });
  it("does not turn a failed Resend read into an inactive binding", async () => {
    await email();
    await reconcileFreshnessAlerts(db, (await collect()).evaluations, at());
    const result = await collect(fixture.ctx.organizationId, {
      readResend: async () => {
        throw new Error("synthetic private failure");
      },
    });
    expect(result.freshnessChecksFailed).toBeGreaterThan(0);
    expect(
      result.evaluations.some((value) => value.family.startsWith("resend")),
    ).toBe(false);
    expect(
      await reconcileFreshnessAlerts(db, result.evaluations, at(1000)),
    ).toMatchObject({ freshnessAtRisk: 1, freshnessResolved: 0 });
  });
  it("composes the postal inspector's real grouped revision and retains unknown source state", async () => {
    const org = fixture.ctx.organizationId;
    const bindingSha256 = await sha256(
      canonicalJson({
        organizationId: org,
        family: "delivery_policy",
        mechanism: "pingen_current_setup",
      }),
    );
    const known: FreshnessEvaluation = {
      organizationId: org,
      family: "delivery_policy",
      bindingSha256,
      active: true,
      candidates: [
        {
          revisionSha256: "c".repeat(64),
          deadline: at(DAY),
          mode: "automatic",
        },
      ],
    };
    await reconcileFreshnessAlerts(db, [known], at());
    const unknown = await collect(org, {
      inspectPostal: async () => ({
        status: "unknown",
        organizationId: org,
        code: "BINDING_CHANGED",
      }),
    });
    expect(unknown.freshnessChecksFailed).toBeGreaterThan(0);
    expect(
      await reconcileFreshnessAlerts(db, unknown.evaluations, at(1000)),
    ).toMatchObject({ freshnessAtRisk: 1, freshnessResolved: 0 });
    const active = await collect(org, {
      inspectPostal: async () => ({
        status: "active",
        kind: "pingen_postal_policy",
        sourceId: org,
        organizationId: org,
        revisionSha256: "d".repeat(64),
        expiresAt: at(90 * DAY),
        lastSuccessAt: at(),
        lastErrorCode: null,
      }),
    });
    expect(
      await reconcileFreshnessAlerts(db, active.evaluations, at(2000)),
    ).toMatchObject({ freshnessAtRisk: 0, freshnessResolved: 1 });
  });
  it("advances durable pages beyond six targets without resolving unvisited warnings", async () => {
    const targets = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const value = await createFaxUsageFixture(db, () => NOW, {
        account_id: env.TELNYX_ACCOUNT_ID!,
        connection_id: "123",
        outbound_profile_id: "456",
        expires_at: at(5 * DAY),
      });
      targets.add(value.ctx.organizationId);
    }
    const seen = new Set<string>();
    let nonemptyCursor = false;
    for (let i = 0; i < 8; i++) {
      const result = await collectProviderFreshness(
        { ...env },
        { now: () => NOW + i },
      );
      expect(result.evaluations.length).toBeLessThanOrEqual(48);
      for (const row of result.evaluations)
        if (targets.has(row.organizationId) && row.active)
          seen.add(row.organizationId);
      const cursor = await db
        .prepare(
          "SELECT after_organization_id FROM provider_freshness_cursors WHERE mechanism='fax_manual'",
        )
        .first<string>("after_organization_id");
      nonemptyCursor ||= !!cursor;
    }
    expect(nonemptyCursor).toBe(true);
    expect(seen).toEqual(targets);
  });
  it("uses no provider network and mutates only progress cursors", async () => {
    const statements: string[] = [];
    const traced = {
      ...env,
      DB: {
        prepare(query: string) {
          statements.push(query);
          return db.prepare(query);
        },
        batch(values: D1PreparedStatement[]) {
          return db.batch(values);
        },
      } as D1Database,
    };
    const network = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("No network permitted");
    });
    try {
      const result = await collectProviderFreshness(traced, { now: () => NOW });
      expect(result.freshnessChecksFailed).toBe(0);
      expect(network).not.toHaveBeenCalled();
      const writes = statements.filter((query) => !query.startsWith("SELECT"));
      expect(writes).toHaveLength(6);
      expect(
        writes.every((query) =>
          query.startsWith("INSERT INTO provider_freshness_cursors"),
        ),
      ).toBe(true);
    } finally {
      network.mockRestore();
    }
  });
});
