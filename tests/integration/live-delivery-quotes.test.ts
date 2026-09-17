import { readFileSync, readdirSync } from "node:fs";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  DomainService,
  canonicalJson,
  type ActorContext,
  type PrepareInput,
  type ProviderHook,
} from "../../packages/domain/src/index";
import {
  emailRateComponents,
  validateLiveDeliveryQuote,
  type EmailRateEvidence,
} from "../../packages/domain/src/live-delivery-quotes";
let mf: Miniflare,
  db: D1Database,
  domain: DomainService,
  ctx: ActorContext,
  clock: number;
let postalSupplierMinor: number;
const identity = {
  email: { accountId: "123456789012", routeId: "eu-west-1" },
  postal: { accountId: "pingen-fixture", routeId: "pingen-fixture" },
};
const rate: EmailRateEvidence = {
  usdMicrosPerMessage: 100,
  usdMicrosPerGb: 120000,
  bytesPerGb: 1000000000,
  eurPerUsdNumerator: 1,
  eurPerUsdDenominator: 1,
  attachmentBasis: "raw_pdf_bytes",
};
const print = {
  addressPosition: "left",
  deliveryProduct: "cheap",
  printMode: "duplex",
  printSpectrum: "grayscale",
};
const stamp = () => new Date(clock).toISOString();
const id = (prefix: string) => `${prefix}_${ctx.organizationId}`;
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
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await sql(readFileSync(new URL(f, dir), "utf8"));
});
afterAll(async () => {
  await mf?.dispose();
});
async function qualify(channel: "email" | "postal", customRate = rate) {
  const c = emailRateComponents(customRate);
  await db
    .prepare(
      "INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'EUR','qualified_final_variable_cost',300,'ISOLATED FIXTURE - NOT A REAL TARIFF',?,?,?,'qualified',?)",
    )
    .bind(
      id("policy_" + channel),
      ctx.organizationId,
      id("sender_" + channel),
      channel,
      channel === "email" ? "ses" : "pingen",
      identity[channel].accountId,
      identity[channel].routeId,
      canonicalJson(channel === "email" ? {} : print),
      canonicalJson(customRate),
      c.base_numerator,
      c.byte_numerator,
      c.rate_denominator,
      "b".repeat(64),
      stamp(),
      new Date(clock + 3600000).toISOString(),
      stamp(),
    )
    .run();
}
beforeEach(async () => {
  clock = Date.now();
  postalSupplierMinor = 150;
  ctx = {
    organizationId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    role: "admin",
    actor: "browser",
  };
  await db.batch([
    db
      .prepare("INSERT INTO organizations VALUES(?,'Fixture','production',?)")
      .bind(ctx.organizationId, stamp()),
    db
      .prepare("INSERT INTO users VALUES(?,'Fixture','test@example.invalid',?)")
      .bind(ctx.userId, stamp()),
    db
      .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
      .bind(ctx.organizationId, ctx.userId, stamp()),
  ]);
  for (const channel of ["email", "postal"] as const) {
    await db.batch([
      db
        .prepare(
          "INSERT INTO senders VALUES(?,?,?,'Fixture',?,'verified','production',?)",
        )
        .bind(
          id("sender_" + channel),
          ctx.organizationId,
          channel,
          channel === "email" ? "sender@example.invalid" : "Fixture sender",
          stamp(),
        ),
      db
        .prepare("INSERT INTO channel_controls VALUES(?,?,1)")
        .bind(ctx.organizationId, channel),
      db
        .prepare(
          "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,?,?,10000,5000,'EUR')",
        )
        .bind(ctx.organizationId, channel, stamp().slice(0, 7)),
    ]);
    await qualify(channel);
  }
  domain = new DomainService(db, {
    mode: "production",
    now: () => clock,
    liveDeliveryIdentity: identity,
    postalQuote: async (request) => ({
      supplierMinor: postalSupplierMinor,
      currency: "EUR",
      providerDraftId: request.options.providerDraftId as string,
      preparedLetterId: request.options.preparedLetterId as string,
      evidenceSha256: "c".repeat(64),
    }),
  });
  await domain.registerDocument(ctx, {
    id: id("doc"),
    name: "fixture.pdf",
    sha256: "a".repeat(64),
    size: 1000,
    pages: 2,
    status: "ready",
    source: "import",
    storageKey: "fixture/" + ctx.organizationId,
    scanVerified: true,
  });
});
const email = (): PrepareInput => ({
  channel: "email",
  recipient: { email: "recipient@example.invalid" },
  subject: "Fixture",
  html: "<p>Fixture</p>",
  text: "Fixture",
});
async function postal(): Promise<PrepareInput> {
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
async function queue(input = email()) {
  const row = await domain.prepareDispatch(ctx, input, crypto.randomUUID());
  await domain.approveDispatch(ctx, row.id, row.fingerprint, {
    recipientRequested: true,
  });
  return domain.confirmDispatch(ctx, row.id, crypto.randomUUID());
}
function provider(
  channel: "email" | "postal",
  result: "accepted" | "rejected" | "submission_unknown" = "accepted",
): ProviderHook {
  return {
    name: channel === "email" ? "ses" : "pingen",
    liveDeliveryIdentity: identity,
    submit: async (row) => ({
      status: result,
      ...(result === "accepted"
        ? { providerId: "provider_" + row.id }
        : { errorCode: "FIXTURE_RESULT" }),
    }),
  };
}
const balance = async () => (await domain.usage(ctx)).welcomeCredit;
const count = async (table: string) =>
  (await db
    .prepare(`SELECT count(*) n FROM ${table} WHERE organization_id=?`)
    .bind(ctx.organizationId)
    .first<{ n: number }>())!.n;
describe("live delivery quotes and cumulative EUR credit — isolated D1 only", () => {
  it("requires a true human recipient-request attestation before any production email approval", async () => {
    const row = await domain.prepareDispatch(ctx, email(), "attestation");
    for (const attestation of [{}, { recipientRequested: false }])
      await expect(
        domain.approveDispatch(ctx, row.id, row.fingerprint, attestation),
      ).rejects.toMatchObject({ code: "RECIPIENT_REQUEST_REQUIRED" });
    await expect(
      domain.approveDispatch(
        { ...ctx, actor: "mcp" },
        row.id,
        row.fingerprint,
        { recipientRequested: true },
      ),
    ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
    expect(await count("approvals")).toBe(0);
    expect(await count("outbox")).toBe(0);
    expect(await count("welcome_credit_reservations")).toBe(0);
    expect(await balance()).toMatchObject({
      availableMinor: 5000,
      reservedMinor: 0,
      spentMinor: 0,
    });
  });
  it("atomically blocks confirmation when a once-attested approval no longer carries that attestation", async () => {
    const row = await domain.prepareDispatch(ctx, email(), "attested");
    await domain.approveDispatch(ctx, row.id, row.fingerprint, {
      recipientRequested: true,
    });
    await db
      .prepare(
        "UPDATE approvals SET recipient_requested=0 WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(ctx.organizationId, row.id)
      .run();
    await expect(
      domain.confirmDispatch(ctx, row.id, "confirm"),
    ).rejects.toMatchObject({ code: "RECIPIENT_REQUEST_REQUIRED" });
    for (const table of [
      "outbox",
      "reservations",
      "welcome_credit_reservations",
    ])
      expect(await count(table)).toBe(0);
    expect(await balance()).toMatchObject({
      availableMinor: 5000,
      reservedMinor: 0,
    });
  });
  it("binds a real-rate-shaped fractional email quote, attachment bytes and one immutable idempotent command", async () => {
    const input = { ...email(), documentId: id("doc") };
    const [a, b] = await Promise.all([
      domain.prepareDispatch(ctx, input, "same"),
      domain.prepareDispatch(ctx, input, "same"),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.quote_supplier_nanoeur).toBe(100120);
    expect(a.quote_customer_nanoeur).toBe(200240);
    expect(a.estimated_minor).toBe(1);
    expect(await count("live_delivery_quotes")).toBe(1);
    await expect(
      db
        .prepare(
          "UPDATE live_delivery_quotes SET customer_nanoeur=2 WHERE dispatch_id=?",
        )
        .bind(a.id)
        .run(),
    ).rejects.toThrow("immutable_delivery_quote");
    await expect(
      db
        .prepare(
          "UPDATE trusted_delivery_costs SET base_numerator=0 WHERE id=?",
        )
        .bind(id("policy_email"))
        .run(),
    ).rejects.toThrow("immutable_delivery_cost");
    await validateLiveDeliveryQuote(db, a, identity.email, stamp());
  });
  it("uses exact rational FX before its explicit sub-nano projection", () => {
    const c = emailRateComponents({
      ...rate,
      eurPerUsdNumerator: 10000,
      eurPerUsdDenominator: 10879,
    });
    expect(BigInt(c.base_numerator) * 10879n).toBe(
      1000000000n * BigInt(c.rate_denominator),
    );
    expect(BigInt(c.byte_numerator) * 10879n).toBe(
      1200n * BigInt(c.rate_denominator),
    );
  });
  it("rejects absent or wrong account/route, client price/options injection, and another tenant", async () => {
    for (const liveDeliveryIdentity of [
      {},
      { email: { ...identity.email, accountId: "000000000000" } },
      { email: { ...identity.email, routeId: "eu-west-3" } },
    ])
      await expect(
        new DomainService(db, {
          mode: "production",
          liveDeliveryIdentity,
        }).prepareDispatch(ctx, email(), crypto.randomUUID()),
      ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
    await expect(
      domain.prepareDispatch(
        ctx,
        { ...email(), options: { supplierPrice: 0 } },
        "injected",
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
    const row = await domain.prepareDispatch(ctx, email(), "valid");
    await expect(
      validateLiveDeliveryQuote(
        db,
        { ...row, organization_id: "another" },
        identity.email,
        stamp(),
      ),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
  });
  it("expires approval and prevents acceptance or provider invocation after policy revocation", async () => {
    const row = await domain.prepareDispatch(ctx, email(), "expiry");
    await domain.approveDispatch(ctx, row.id, row.fingerprint, {
      recipientRequested: true,
    });
    clock += 301000;
    await expect(
      domain.confirmDispatch(ctx, row.id, "expired"),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    clock -= 301000;
    const next = await queue();
    await db
      .prepare("UPDATE trusted_delivery_costs SET status='revoked' WHERE id=?")
      .bind(id("policy_email"))
      .run();
    const hook = provider("email");
    hook.submit = vi.fn(hook.submit);
    await domain.processDispatch(next.id, hook);
    expect(hook.submit).not.toHaveBeenCalled();
    expect(await balance()).toMatchObject({ reservedMinor: 0, spentMinor: 0 });
  });
  it("rejects direct SQL approval bypass without a qualified quote", async () => {
    const row = await domain.prepareDispatch(ctx, email(), "direct");
    await db
      .prepare("UPDATE trusted_delivery_costs SET status='revoked' WHERE id=?")
      .bind(id("policy_email"))
      .run();
    await expect(
      db
        .prepare(
          "INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          ctx.organizationId,
          row.id,
          ctx.userId,
          row.fingerprint,
          new Date(clock + 60000).toISOString(),
          stamp(),
        )
        .run(),
    ).rejects.toThrow("live_quote_invalid");
  });
  it("prices the exact postal draft at twice the authenticated EUR supplier price", async () => {
    const input = await postal();
    const row = await queue(input);
    expect(row.estimated_minor).toBe(300);
    expect(row.quote_customer_nanoeur).toBe(3000000000);
    expect(await balance()).toMatchObject({
      reservedMinor: 400,
      spentMinor: 0,
    });
    await domain.processDispatch(row.id, provider("postal"));
    expect(await balance()).toMatchObject({
      reservedMinor: 0,
      spentMinor: 300,
      availableMinor: 4700,
    });
    await expect(
      domain.prepareDispatch(
        ctx,
        { ...input, options: { ...input.options, preparedLetterId: "wrong" } },
        "wrong-draft",
      ),
    ).rejects.toThrow();
  });
  it("does not charge a cent per email: 51 concurrent acceptances cost 2 cents cumulatively", async () => {
    const rows = await Promise.all(Array.from({ length: 51 }, () => queue()));
    await Promise.all(
      rows.map((row) => domain.processDispatch(row.id, provider("email"))),
    );
    expect(await balance()).toMatchObject({
      reservedMinor: 0,
      spentMinor: 2,
      availableMinor: 4998,
    });
    expect(
      await db
        .prepare(
          "SELECT confirmed_count,confirmed_minor FROM usage WHERE organization_id=? AND channel='email'",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toMatchObject({ confirmed_count: 51, confirmed_minor: 2 });
    expect(await count("delivery_charge_entries")).toBe(51);
    await Promise.all(
      rows
        .slice(0, 4)
        .map((row) => domain.processDispatch(row.id, provider("email"))),
    );
    expect(await count("delivery_charge_entries")).toBe(51);
    expect(await balance()).toMatchObject({ spentMinor: 2 });
  });
  it("shares one credit balance across fractional email and whole-cent postal sends", async () => {
    const mail = await queue(),
      letter = await queue(await postal());
    await Promise.all([
      domain.processDispatch(mail.id, provider("email")),
      domain.processDispatch(letter.id, provider("postal")),
    ]);
    expect(await balance()).toMatchObject({
      spentMinor: 301,
      reservedMinor: 0,
      availableMinor: 4699,
    });
    const charges = await db
      .prepare(
        "SELECT SUM(amount_nanoeur) nano,SUM(charged_minor) cents FROM delivery_charge_entries WHERE organization_id=?",
      )
      .bind(ctx.organizationId)
      .first();
    expect(charges).toEqual({ nano: 3000200000, cents: 301 });
  });
  it("retains both credit and monthly holds after unknown then failed, settling once on late acceptance", async () => {
    const row = await queue();
    await domain.processDispatch(
      row.id,
      provider("email", "submission_unknown"),
    );
    await domain.ingestEvent({
      provider: "ses",
      providerId: "late_" + row.id,
      dispatchId: row.id,
      eventId: "failed_" + row.id,
      kind: "failed",
      occurredAt: stamp(),
    });
    expect(await balance()).toMatchObject({ reservedMinor: 1, spentMinor: 0 });
    expect(
      await db
        .prepare(
          "SELECT reserved_count,reserved_minor FROM usage WHERE organization_id=? AND channel='email'",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ reserved_count: 1, reserved_minor: 1 });
    const accepted = {
      provider: "ses",
      providerId: "late_" + row.id,
      dispatchId: row.id,
      eventId: "accepted_" + row.id,
      kind: "accepted" as const,
      occurredAt: stamp(),
    };
    await domain.ingestEvent(accepted);
    await domain.ingestEvent(accepted);
    expect(await balance()).toMatchObject({ reservedMinor: 0, spentMinor: 1 });
    expect(await count("delivery_charge_entries")).toBe(1);
    expect((await domain.getDispatch(ctx, row.id)).dispatch.status).toBe(
      "failed",
    );
  });
  it("releases safe rejection and queued cancellation without a fractional charge", async () => {
    const rejected = await queue();
    await domain.processDispatch(rejected.id, provider("email", "rejected"));
    const cancelled = await queue();
    await domain.cancelDispatch(ctx, cancelled.id);
    expect(await balance()).toMatchObject({ reservedMinor: 0, spentMinor: 0 });
    expect(await count("delivery_charge_entries")).toBe(0);
    expect(
      await db
        .prepare(
          "SELECT reserved_count,confirmed_count FROM usage WHERE organization_id=? AND channel='email'",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ reserved_count: 0, confirmed_count: 0 });
  });
  it("enforces the shared EUR50 ceiling atomically without overspend", async () => {
    await db
      .prepare("UPDATE trusted_delivery_costs SET status='revoked' WHERE id=?")
      .bind(id("policy_email"))
      .run();
    await db
      .prepare("DELETE FROM trusted_delivery_costs WHERE id=?")
      .bind(id("policy_email"))
      .run();
    await qualify("email", { ...rate, usdMicrosPerMessage: 15000000 });
    const a = await domain.prepareDispatch(ctx, email(), "a"),
      b = await domain.prepareDispatch(ctx, email(), "b");
    await domain.approveDispatch(ctx, a.id, a.fingerprint, {
      recipientRequested: true,
    });
    await domain.approveDispatch(ctx, b.id, b.fingerprint, {
      recipientRequested: true,
    });
    const outcomes = await Promise.allSettled([
      domain.confirmDispatch(ctx, a.id, "ca"),
      domain.confirmDispatch(ctx, b.id, "cb"),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await balance()).toMatchObject({
      reservedMinor: 3000,
      spentMinor: 0,
      availableMinor: 2000,
    });
  });
  it("retains cumulative charges when a historical dispatch is deleted", async () => {
    const row = await queue();
    await domain.processDispatch(row.id, provider("email"));
    for (const table of [
      "ses_send_reservations",
      "provider_events",
      "attempts",
      "approvals",
      "reservations",
      "outbox",
    ])
      await db
        .prepare(`DELETE FROM ${table} WHERE organization_id=?`)
        .bind(ctx.organizationId)
        .run();
    await db
      .prepare("DELETE FROM dispatches WHERE organization_id=? AND id=?")
      .bind(ctx.organizationId, row.id)
      .run();
    expect(await balance()).toMatchObject({ spentMinor: 1 });
    expect(await count("delivery_charge_entries")).toBe(1);
    await expect(
      db
        .prepare("DELETE FROM delivery_charge_entries WHERE organization_id=?")
        .bind(ctx.organizationId)
        .run(),
    ).rejects.toThrow("immutable_delivery_charge");
  });
});
