import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { ensureEmailSender, RESEND_RATE } from "../../apps/api/src/email-setup";
import {
  assertResendSender,
  resendIdentity,
} from "../../apps/api/src/resend-environment";
import { resolveDeliveryPrice } from "../../packages/domain/src/live-delivery-quotes";
import type { ActorContext } from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";

let mf: Miniflare, db: D1Database, ctx: ActorContext, env: Env;
const now = "2026-09-21T02:00:00.000Z";
const until = "2026-10-21T02:00:00.000Z";
async function applySql(sql: string) {
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
      statements.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete fixture SQL");
  if (statements.length) await db.batch(statements);
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await applySql(readFileSync(new URL(name, dir), "utf8"));
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
    MODE: "production",
    EMAIL_PROVIDER: "resend",
    RESEND_ACCOUNT_ID: "fixture",
    RESEND_DOMAIN_ID: "fixture-domain",
    RESEND_VERIFIED_DOMAIN: "guteneo.com",
    RESEND_API_KEY: "fixture-key-not-real",
    RESEND_WEBHOOK_SECRET: "fixture-webhook-not-real",
    RESEND_SENDS_ENABLED: "true",
    RESEND_TARIFF_QUALIFIED_UNTIL: until,
  } as Env;
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Fixture','production',?)",
      )
      .bind(ctx.organizationId, now),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Fixture','verified-user@example.invalid',?)",
      )
      .bind(ctx.userId, now),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(ctx.organizationId, ctx.userId, now),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Owner','owner@example.invalid',?)",
      )
      .bind(`owner_${id}`, now),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(ctx.organizationId, `owner_${id}`, now),
    db
      .prepare("INSERT INTO channel_controls VALUES(?,'email',0)")
      .bind(ctx.organizationId),
    db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email','2026-09',100,5000,'EUR')",
      )
      .bind(ctx.organizationId),
  ]);
});
const setup = (context = ctx, config = env, stamp = now) =>
  ensureEmailSender(config, context, stamp);
const rows = (table: string) =>
  db
    .prepare(`SELECT * FROM ${table} WHERE organization_id=?`)
    .bind(ctx.organizationId)
    .all();
const enabled = async () =>
  (await db
    .prepare(
      "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='email'",
    )
    .bind(ctx.organizationId)
    .first<{ enabled: number }>())!.enabled;

describe("automatic tenant Resend setup on local D1", () => {
  it("creates one usable Guteneo sender and dated policy concurrently, taking reply-to only from membership user", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        setup({ ...ctx, email: "spoof@example.invalid" } as ActorContext),
      ),
    );
    const senders = (await rows("senders")).results;
    expect(senders).toHaveLength(1);
    expect(results).toEqual(
      Array(5).fill({
        replyTo: "verified-user@example.invalid",
        senderId: senders[0].id,
      }),
    );
    expect(senders[0]).toMatchObject({
      address: "documents@guteneo.com",
      name: "Guteneo",
      status: "verified",
      mode: "production",
    });
    expect(() =>
      assertResendSender(env, senders[0].address as string),
    ).not.toThrow();
    const policies = (await rows("trusted_delivery_costs")).results;
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({
      provider: "resend",
      status: "qualified",
      expires_at: until,
      pricing_basis: "public_list_price_ex_tax",
    });
    expect(JSON.parse(policies[0].rate_json as string)).toEqual(RESEND_RATE);
    const price = await resolveDeliveryPrice(db, {
      organizationId: ctx.organizationId,
      senderId: senders[0].id as string,
      channel: "email",
      recipient: { email: "recipient@example.invalid" },
      options: {},
      identity: resendIdentity(env)!,
      now,
      document: { id: "doc", sha256: "a".repeat(64), size: 500 },
    });
    expect(price.amountMinor).toBe(1);
    expect(price.attachmentBytes).toBe(500);
    expect(await enabled()).toBe(1);
    expect((await rows("usage")).results[0]).toMatchObject({
      reserved_count: 0,
      confirmed_count: 0,
      reserved_minor: 0,
      confirmed_minor: 0,
    });
    expect((await rows("dispatches")).results).toHaveLength(0);
  });
  it("fails closed before any mutation when operator configuration is absent, disabled, invalid or expired", async () => {
    for (const patch of [
      { MODE: "simulation" },
      { EMAIL_PROVIDER: "ses" },
      { RESEND_API_KEY: undefined },
      { RESEND_WEBHOOK_SECRET: undefined },
      { RESEND_VERIFIED_DOMAIN: "other.invalid" },
      { RESEND_SENDS_ENABLED: "false" },
      { RESEND_TARIFF_QUALIFIED_UNTIL: undefined },
      { RESEND_TARIFF_QUALIFIED_UNTIL: "invalid" },
      { RESEND_TARIFF_QUALIFIED_UNTIL: now },
    ]) {
      expect(await setup(ctx, { ...env, ...patch } as Env)).toBeUndefined();
    }
    expect((await rows("senders")).results).toHaveLength(0);
    expect((await rows("trusted_delivery_costs")).results).toHaveLength(0);
    expect(await enabled()).toBe(0);
  });
  it("refuses viewer, stale role, unrelated organization and removed membership", async () => {
    for (const context of [
      { ...ctx, role: "viewer" as const },
      { ...ctx, role: "member" as const },
      { ...ctx, organizationId: "other" },
      { ...ctx, userId: "other" },
    ])
      expect(await setup(context)).toBeUndefined();
    await db
      .prepare("DELETE FROM memberships WHERE organization_id=? AND user_id=?")
      .bind(ctx.organizationId, ctx.userId)
      .run();
    expect(await setup()).toBeUndefined();
    expect((await rows("senders")).results).toHaveLength(0);
    expect(await enabled()).toBe(0);
  });
  it("lets current members prepare but preserves the administrator's explicit channel stop", async () => {
    await db
      .prepare(
        "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
      )
      .bind(ctx.organizationId, ctx.userId)
      .run();
    const member = { ...ctx, role: "member" as const };
    expect(await setup(member)).toMatchObject({
      replyTo: "verified-user@example.invalid",
    });
    await db.batch([
      db
        .prepare(
          "UPDATE channel_controls SET enabled=0 WHERE organization_id=?",
        )
        .bind(ctx.organizationId),
      db
        .prepare(
          "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,'channel.control','email','{\"enabled\":false}',?)",
        )
        .bind(crypto.randomUUID(), ctx.organizationId, ctx.userId, now),
    ]);
    await setup(member);
    expect(await enabled()).toBe(0);
    expect((await rows("trusted_delivery_costs")).results).toHaveLength(1);
  });
  it("reuses the existing current policy if the operator extends the qualification window", async () => {
    await setup();
    await db
      .prepare("UPDATE channel_controls SET enabled=0 WHERE organization_id=?")
      .bind(ctx.organizationId)
      .run();
    await setup(ctx, {
      ...env,
      RESEND_TARIFF_QUALIFIED_UNTIL: "2026-11-21T02:00:00.000Z",
    });
    const policies = (await rows("trusted_delivery_costs")).results;
    expect(policies).toHaveLength(1);
    expect(policies[0].expires_at).toBe(until);
    expect(await enabled()).toBe(1);
  });
  it("renews an expired automatic policy only within the renewed operator qualification", async () => {
    await setup();
    await setup(
      ctx,
      { ...env, RESEND_TARIFF_QUALIFIED_UNTIL: "2026-11-21T03:00:00+01:00" },
      "2026-10-22T02:00:00.000Z",
    );
    const policies = (await rows("trusted_delivery_costs")).results;
    expect(policies).toHaveLength(2);
    expect(policies.filter((p) => p.status === "revoked")).toHaveLength(1);
    expect(policies.find((p) => p.status === "qualified")).toMatchObject({
      expires_at: "2026-11-21T02:00:00.000Z",
    });
  });
  it("does not resurrect a revoked policy or disabled sender", async () => {
    await setup();
    await db.batch([
      db
        .prepare(
          "UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=?",
        )
        .bind(ctx.organizationId),
      db
        .prepare(
          "UPDATE channel_controls SET enabled=0 WHERE organization_id=?",
        )
        .bind(ctx.organizationId),
    ]);
    await setup();
    expect(await enabled()).toBe(0);
    expect((await rows("trusted_delivery_costs")).results).toHaveLength(1);
    await db
      .prepare("UPDATE senders SET status='disabled' WHERE organization_id=?")
      .bind(ctx.organizationId)
      .run();
    await setup(ctx, {
      ...env,
      RESEND_TARIFF_QUALIFIED_UNTIL: "2026-11-21T02:00:00.000Z",
    });
    expect(await enabled()).toBe(0);
    expect((await rows("senders")).results[0].status).toBe("disabled");
  });
  it("binds a new account and route without silently retaining the prior transport identity", async () => {
    await setup();
    const replacement = {
      ...env,
      RESEND_ACCOUNT_ID: "replacement",
      RESEND_DOMAIN_ID: "replacement-domain",
    };
    await setup(ctx, replacement);
    const policies = (await rows("trusted_delivery_costs")).results;
    expect(policies).toHaveLength(2);
    expect(policies.find((p) => p.account_id === "replacement")).toMatchObject({
      route_id: "resend:replacement-domain:guteneo.com",
    });
  });
  it("identifies its usable default sender even when a legacy SES sender sorts first", async () => {
    const legacyId = `a_legacy_${ctx.organizationId}`;
    await db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Legacy','legacy@example.invalid','verified','production',?)",
      )
      .bind(legacyId, ctx.organizationId, now)
      .run();
    const result = await setup();
    expect(result!.senderId).not.toBe(legacyId);
    expect(
      await db
        .prepare("SELECT address FROM senders WHERE organization_id=? AND id=?")
        .bind(ctx.organizationId, result!.senderId)
        .first(),
    ).toEqual({ address: "documents@guteneo.com" });
  });
  it("keeps a prepare-only identity's channel disabled while making preparation available, including restriction before first login", async () => {
    const issuer = "https://review-fixture.example/",
      subject = `synthetic_${ctx.userId}`;
    await db
      .prepare(
        "INSERT INTO restricted_delivery_identities(issuer,subject) VALUES(?,?)",
      )
      .bind(issuer, subject)
      .run();
    await db
      .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
      .bind(issuer, subject, ctx.userId, now)
      .run();
    const result = await setup();
    expect(result).toBeDefined();
    expect((await rows("senders")).results).toHaveLength(1);
    expect((await rows("trusted_delivery_costs")).results).toHaveLength(1);
    expect(await enabled()).toBe(0);
    // A different human in the same organization retains their normal authority.
    const owner = await db
      .prepare(
        "SELECT user_id FROM memberships WHERE organization_id=? AND user_id<>?",
      )
      .bind(ctx.organizationId, ctx.userId)
      .first<{ user_id: string }>();
    await setup({ ...ctx, userId: owner!.user_id });
    expect(await enabled()).toBe(1);
  });
});
