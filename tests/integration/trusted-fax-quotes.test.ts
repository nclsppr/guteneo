import { readFileSync, readdirSync } from "node:fs";
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
import {
  DomainService,
  type ActorContext,
} from "../../packages/domain/src/index";
import { resetFixtureMemberships } from "../helpers/reset-memberships";
let mf: Miniflare, db: D1Database, domain: DomainService;
let clock: number;
const identity = {
  accountId: "account-fixture",
  connectionId: "application-fixture",
};
const ctx: ActorContext = {
  organizationId: "org_fixture",
  userId: "user_fixture",
  role: "admin",
  actor: "browser",
};
async function sql(source: string) {
  let statement = "",
    trigger = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += line + " ";
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      await db.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw Error("Incomplete SQL");
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await sql(readFileSync(new URL(file, dir), "utf8"));
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  for (const table of [
    "attempts",
    "provider_events",
    "outbox",
    "reservations",
    "approvals",
    "idempotency_keys",
    "audit_log",
    "dispatches",
    "trusted_fax_tariffs",
    "documents",
    "senders",
    "channel_controls",
    "usage",
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
  await resetFixtureMemberships(db);
  await db.prepare("DELETE FROM users").run();
  await db.prepare("DELETE FROM organizations").run();
  clock = Date.now();
  const now = new Date(clock).toISOString();
  await db
    .prepare("INSERT INTO organizations VALUES(?,'Fixture','production',?)")
    .bind(ctx.organizationId, now)
    .run();
  await db
    .prepare(
      "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
    )
    .bind(ctx.userId, now)
    .run();
  await db
    .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
    .bind(ctx.organizationId, ctx.userId, now)
    .run();
  await db
    .prepare(
      "INSERT INTO senders VALUES('sender_fixture',?,'fax','Fixture','+33100000000','verified','production',?)",
    )
    .bind(ctx.organizationId, now)
    .run();
  await db
    .prepare("INSERT INTO channel_controls VALUES(?,'fax',1)")
    .bind(ctx.organizationId)
    .run();
  await db
    .prepare(
      "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'fax',?,5,1000,'EUR')",
    )
    .bind(ctx.organizationId, now.slice(0, 7))
    .run();
  domain = new DomainService(db, {
    mode: "production",
    now: () => clock,
    liveFaxIdentity: identity,
  });
  await domain.registerDocument(ctx, {
    id: "doc_fixture",
    name: "test.pdf",
    sha256: "a".repeat(64),
    size: 100,
    pages: 2,
    status: "ready",
    source: "import",
    storageKey: "fixture/test.pdf",
    scanVerified: true,
  });
  await db
    .prepare(
      "INSERT INTO trusted_fax_tariffs(id,organization_id,sender_id,provider,account_id,connection_id,destination_prefix,options_json,currency,base_minor,per_page_minor,max_pages,quote_ttl_seconds,cost_basis,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES('tariff_fixture',?,'sender_fixture','telnyx',?,?,'+33','{}','EUR',10,20,10,300,'qualified_upper_bound','ISOLATED FIXTURE - NOT A REAL PRICE',?,?,?,'qualified',?)",
    )
    .bind(
      ctx.organizationId,
      identity.accountId,
      identity.connectionId,
      "b".repeat(64),
      now,
      new Date(clock + 3600000).toISOString(),
      now,
    )
    .run();
});
const input = () => ({
  channel: "fax" as const,
  documentId: "doc_fixture",
  recipient: { phone: "+33100000001" },
  ceilingMinor: 60,
});
const prepare = () => domain.prepareDispatch(ctx, input(), crypto.randomUUID());
const queue = async () => {
  const d = await prepare();
  await domain.approveDispatch(ctx, d.id, d.fingerprint);
  return domain.confirmDispatch(ctx, d.id, crypto.randomUUID());
};
describe("Trusted live fax quotes — isolated D1, no provider sends", () => {
  it("prepares an immutable qualified quote, approves it and reserves exactly once concurrently", async () => {
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      domain.prepareDispatch(ctx, input(), key),
      domain.prepareDispatch(ctx, input(), key),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.estimated_minor).toBe(50);
    expect(a.quote_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await domain.approveDispatch(ctx, a.id, a.fingerprint);
    const detail = await domain.getDispatch(ctx, a.id);
    expect(detail.dispatch.quote_expires_at).toBe(detail.approval?.expires_at);
    await Promise.all([
      domain.confirmDispatch(ctx, a.id, "confirm"),
      domain.confirmDispatch(ctx, a.id, "confirm"),
    ]);
    expect(
      (await db.prepare("SELECT count(*) n FROM live_fax_quotes").first())?.n,
    ).toBe(1);
    expect((await db.prepare("SELECT count(*) n FROM outbox").first())?.n).toBe(
      1,
    );
    expect(
      (await db.prepare("SELECT reserved_minor FROM usage").first())
        ?.reserved_minor,
    ).toBe(60);
  });
  it("rejects unqualified/missing identities, other accounts and other destinations", async () => {
    for (const liveFaxIdentity of [
      undefined,
      { ...identity, accountId: "different" },
      { ...identity, connectionId: "different" },
    ])
      await expect(
        new DomainService(db, {
          mode: "production",
          liveFaxIdentity,
        }).prepareDispatch(
          ctx,
          input(),
          "identity-" + JSON.stringify(liveFaxIdentity),
        ),
      ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
    await expect(
      domain.prepareDispatch(
        ctx,
        { ...input(), recipient: { phone: "+49100000001" } },
        "other-destination",
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
  });
  it("rejects insufficient/noninteger ceilings and options not covered by qualification", async () => {
    for (const ceilingMinor of [49, 50.1, 1000001])
      await expect(
        domain.prepareDispatch(
          ctx,
          { ...input(), ceilingMinor },
          "ceiling-" + ceilingMinor,
        ),
      ).rejects.toMatchObject({ code: "INVALID_CEILING" });
    await expect(
      domain.prepareDispatch(
        ctx,
        { ...input(), options: { quality: "different" } },
        "options",
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
  });
  it("binds document, recipient, options, sender and quote against in-place mutation", async () => {
    const d = await prepare();
    for (const [column, value] of [
      ["recipient_json", JSON.stringify({ phone: "+33100000002" })],
      ["options_json", '{"changed":true}'],
      ["sender_address", "+33100000002"],
      ["document_id", "other"],
      ["quote_fingerprint", "c".repeat(64)],
    ])
      await expect(
        db
          .prepare(`UPDATE dispatches SET ${column}=? WHERE id=?`)
          .bind(value, d.id)
          .run(),
      ).rejects.toThrow();
    await expect(
      db.prepare("UPDATE live_fax_quotes SET account_id='other'").run(),
    ).rejects.toThrow("immutable_live_fax_quote");
    await expect(
      db.prepare("UPDATE trusted_fax_tariffs SET per_page_minor=1").run(),
    ).rejects.toThrow("immutable_fax_tariff");
  });
  it("rejects quote expiry at human approval and at confirmation", async () => {
    const a = await prepare();
    clock += 301000;
    await expect(
      domain.approveDispatch(ctx, a.id, a.fingerprint),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    const b = await prepare();
    await domain.approveDispatch(ctx, b.id, b.fingerprint);
    clock += 301000;
    await expect(
      domain.confirmDispatch(ctx, b.id, "expired"),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    expect(
      (await db.prepare("SELECT count(*) n FROM reservations").first())?.n,
    ).toBe(0);
  });
  it("atomically rejects direct SQL approval and acceptance after tariff revocation", async () => {
    const d = await prepare();
    await domain.approveDispatch(ctx, d.id, d.fingerprint);
    await db.prepare("UPDATE trusted_fax_tariffs SET status='revoked'").run();
    await expect(
      db
        .prepare("UPDATE approvals SET created_at=? WHERE dispatch_id=?")
        .bind(new Date(clock).toISOString(), d.id)
        .run(),
    ).rejects.toThrow("live_quote_invalid");
    await expect(
      db
        .prepare(
          "UPDATE dispatches SET status='queued',updated_at=? WHERE id=?",
        )
        .bind(new Date(clock).toISOString(), d.id)
        .run(),
    ).rejects.toThrow("live_quote_invalid");
    expect(
      (await db.prepare("SELECT reserved_minor FROM usage").first())
        ?.reserved_minor,
    ).toBe(0);
  });
  it("rejects changed account at approval and confirmation", async () => {
    const d = await prepare();
    const changed = new DomainService(db, {
      mode: "production",
      now: () => clock,
      liveFaxIdentity: { ...identity, accountId: "other" },
    });
    await expect(
      changed.approveDispatch(ctx, d.id, d.fingerprint),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    await domain.approveDispatch(ctx, d.id, d.fingerprint);
    await expect(
      changed.confirmDispatch(ctx, d.id, "changed"),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
  });
  it("never invokes a provider after expiry or changed account at preflight", async () => {
    const a = await queue();
    clock += 301000;
    const submit = vi.fn();
    expect(
      await domain.processDispatch(a.id, {
        name: "telnyx",
        liveFaxIdentity: identity,
        submit,
      }),
    ).toMatchObject({ status: "failed" });
    expect(submit).not.toHaveBeenCalled();
    const b = await queue();
    expect(
      await domain.processDispatch(b.id, {
        name: "telnyx",
        liveFaxIdentity: { ...identity, accountId: "other" },
        submit,
      }),
    ).toMatchObject({ status: "failed" });
    expect(submit).not.toHaveBeenCalled();
    expect(
      (await db.prepare("SELECT reserved_minor FROM usage").first())
        ?.reserved_minor,
    ).toBe(0);
  });
  it("rejects cross-organization lookup and quote transplantation", async () => {
    const d = await prepare();
    await expect(
      domain.approveDispatch(
        { ...ctx, organizationId: "org_other" },
        d.id,
        d.fingerprint,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      db
        .prepare(
          "UPDATE live_fax_quotes SET organization_id='org_other' WHERE dispatch_id=?",
        )
        .bind(d.id)
        .run(),
    ).rejects.toThrow("immutable_live_fax_quote");
  });
  it("rejects a NULL provider at the atomic SQL preflight guard", async () => {
    const d = await queue();
    await expect(
      db
        .prepare(
          "UPDATE dispatches SET status='submitting',provider=NULL,updated_at=? WHERE id=?",
        )
        .bind(new Date(clock).toISOString(), d.id)
        .run(),
    ).rejects.toThrow("live_quote_invalid");
    expect((await domain.getDispatch(ctx, d.id)).dispatch.status).toBe(
      "queued",
    );
  });
  it("keeps a queued idempotent confirmation stable after quote expiry without reserving again", async () => {
    const d = await queue();
    clock += 301000;
    expect(
      (await domain.confirmDispatch(ctx, d.id, "repeat-after-expiry")).status,
    ).toBe("queued");
    expect(
      (await db.prepare("SELECT count(*) n FROM reservations").first())?.n,
    ).toBe(1);
  });
  it("rolls back preparation if the qualified tariff is revoked after resolution", async () => {
    const fencedDb = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        await db
          .prepare("UPDATE trusted_fax_tariffs SET status='revoked'")
          .run();
        return db.batch(statements);
      },
    } as unknown as D1Database;
    const raced = new DomainService(fencedDb, {
      mode: "production",
      now: () => clock,
      liveFaxIdentity: identity,
    });
    await expect(
      raced.prepareDispatch(ctx, input(), "raced"),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    expect(
      (await db.prepare("SELECT count(*) n FROM dispatches").first())?.n,
    ).toBe(0);
    expect(
      (await db.prepare("SELECT count(*) n FROM live_fax_quotes").first())?.n,
    ).toBe(0);
  });
  it("invalidates a quote when a more-specific destination policy is introduced", async () => {
    const d = await prepare();
    await db
      .prepare(
        "INSERT INTO trusted_fax_tariffs SELECT 'specific',organization_id,sender_id,provider,account_id,connection_id,'+331',options_json,currency,base_minor,per_page_minor,max_pages,quote_ttl_seconds,cost_basis,source_reference,source_sha256,valid_from,expires_at,status,created_at FROM trusted_fax_tariffs WHERE id='tariff_fixture'",
      )
      .run();
    await expect(
      domain.approveDispatch(ctx, d.id, d.fingerprint),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    const replacement = await prepare();
    expect(
      (
        await db
          .prepare("SELECT tariff_id FROM live_fax_quotes WHERE dispatch_id=?")
          .bind(replacement.id)
          .first()
      )?.tariff_id,
    ).toBe("specific");
  });
});
