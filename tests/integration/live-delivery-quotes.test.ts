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
  sha256,
  type ActorContext,
  type PrepareInput,
  type ProviderHook,
} from "../../packages/domain/src/index";
import {
  emailRateComponents,
  postalPolicyOptions,
  postalRateEvidence,
  resolveDeliveryPrice,
  validateLiveDeliveryQuote,
  type EmailRateEvidence,
  type PublicEmailRateEvidence,
} from "../../packages/domain/src/live-delivery-quotes";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";
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
const textOnlyRate: EmailRateEvidence = {
  usdMicrosPerMessage: 160,
  eurPerUsdNumerator: 10000,
  eurPerUsdDenominator: 11537,
  attachmentBasis: "no_attachments",
};
const publicRate: PublicEmailRateEvidence = {
  ...textOnlyRate,
  attachmentBasis: "no_attachments",
  pricingBasis: "public_list_price_ex_tax",
  plan: "Essentials",
  tier: "0-10000000",
  unit: "recipient",
  currency: "USD",
  tariffSource: "https://aws.amazon.com/ses/pricing/",
  tariffDate: "2026-09-17",
  fxBasis: "commercial_fixed_reference",
  fxSource: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
  fxDate: "2026-09-16",
};
let upgradeProof: {
  before: string;
  after: string;
  foreignKeys: unknown[];
  quickCheck: unknown;
  legacyBasis: string;
  legacyQuoteValid: boolean;
};
let postalUpgradeProof: {
  before: string;
  after: string;
  historicalPostalValid: boolean;
  publicEmailValid: boolean;
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
  const statements: D1PreparedStatement[] = [];
  let statement = "",
    trigger = false;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += line + " ";
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      statements.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw Error("Incomplete SQL");
  if (statements.length) await db.batch(statements);
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
    .filter(
      (f) =>
        f.endsWith(".sql") &&
        !["0022_", "0030_", "0034_", "0035_"].some((prefix) =>
          f.startsWith(prefix),
        ),
    )
    .sort())
    await sql(readFileSync(new URL(f, dir), "utf8"));
  // Exercise an upgrade with an existing immutable quote, approval and settled
  // credit, not merely an empty schema. Both old policies retain their contract.
  await setupFixture();
  const legacy = await queue();
  await domain.processDispatch(legacy.id, provider("email"));
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all(
        [
          "live_delivery_quotes",
          "approvals",
          "delivery_charge_entries",
          "welcome_credit_entries",
        ].map(
          async (table) =>
            (
              await db
                .prepare(
                  `SELECT * FROM ${table} WHERE organization_id=? ORDER BY rowid`,
                )
                .bind(ctx.organizationId)
                .all()
            ).results,
        ),
      ),
    );
  const before = await snapshot();
  await sql(
    readFileSync(new URL("0022_ses_public_list_prices.sql", dir), "utf8"),
  );
  upgradeProof = {
    before,
    after: await snapshot(),
    foreignKeys: (await db.prepare("PRAGMA foreign_key_check").all()).results,
    quickCheck: await db.prepare("PRAGMA quick_check").first(),
    legacyBasis: (await db
      .prepare("SELECT pricing_basis FROM trusted_delivery_costs WHERE id=?")
      .bind(id("policy_email"))
      .first<{ pricing_basis: string }>())!.pricing_basis,
    legacyQuoteValid: Boolean(
      await validateLiveDeliveryQuote(db, legacy, identity.email, stamp()),
    ),
  };
  const historicalPostal = await queue(await postal());
  await setupFixture();
  await replaceEmailRate(publicRate);
  const publicEmail = await queue();
  const allQuotes = async () =>
    JSON.stringify(
      (
        await db
          .prepare("SELECT * FROM live_delivery_quotes ORDER BY dispatch_id")
          .all()
      ).results,
    );
  const postalBefore = await allQuotes();
  await sql(
    readFileSync(new URL("0030_postal_public_pricing.sql", dir), "utf8"),
  );
  postalUpgradeProof = {
    before: postalBefore,
    after: await allQuotes(),
    historicalPostalValid: Boolean(
      await validateLiveDeliveryQuote(
        db,
        historicalPostal,
        identity.postal,
        stamp(),
      ),
    ),
    publicEmailValid: Boolean(
      await validateLiveDeliveryQuote(db, publicEmail, identity.email, stamp()),
    ),
  };
  // Later migrations depend on the prior pricing schemas. The dedicated
  // resend-email suite proves these upgrades against populated signed quotes.
  for (const filename of [
    "0035_resend_email_transport.sql",
    "0036_protected_documents.sql",
  ])
    await sql(readFileSync(new URL(filename, dir), "utf8"));
});
afterAll(async () => {
  await mf?.dispose();
});
async function qualify(
  channel: "email" | "postal",
  customRate: EmailRateEvidence = rate,
) {
  const c = emailRateComponents(customRate);
  const basis = (customRate as Partial<PublicEmailRateEvidence>).pricingBasis;
  await db
    .prepare(
      `INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at${basis ? ",pricing_basis" : ""}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'EUR','qualified_final_variable_cost',300,'ISOLATED FIXTURE - NOT A REAL TARIFF',?,?,?,'qualified',?${basis ? ",?" : ""})`,
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
      ...(basis ? [basis] : []),
    )
    .run();
}
async function setupFixture() {
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
}
beforeEach(setupFixture);
const email = (): PrepareInput => ({
  channel: "email",
  recipient: { email: "recipient@example.invalid" },
  subject: "Fixture",
  html: "<p>Fixture</p>",
  text: "Fixture",
});
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
async function replaceEmailRate(customRate: EmailRateEvidence) {
  await db
    .prepare(
      "DELETE FROM trusted_delivery_costs WHERE organization_id=? AND id=?",
    )
    .bind(ctx.organizationId, id("policy_email"))
    .run();
  await qualify("email", customRate);
}
async function replacePostalRate() {
  const rate = postalRateEvidence(stamp().slice(0, 10));
  await db
    .prepare(
      "DELETE FROM trusted_delivery_costs WHERE organization_id=? AND id=?",
    )
    .bind(ctx.organizationId, id("policy_postal"))
    .run();
  await db
    .prepare(
      "INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,pricing_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES(?,?,?,'postal','pingen',?,?,?, ?,0,0,1,'EUR','qualified_final_variable_cost','public_list_price_ex_tax',300,'ISOLATED PINGEN CALCULATOR CONTRACT',?,?,?,'qualified',?)",
    )
    .bind(
      id("policy_postal"),
      ctx.organizationId,
      id("sender_postal"),
      identity.postal.accountId,
      identity.postal.routeId,
      canonicalJson(print),
      canonicalJson(rate),
      await sha256(canonicalJson(rate)),
      stamp(),
      new Date(clock + 3600000).toISOString(),
      stamp(),
    )
    .run();
  return rate;
}
describe("live delivery quotes and cumulative EUR credit — isolated D1 only", () => {
  it("upgrades existing signed quotes and settled credit without repricing or changing fingerprints", () => {
    expect(upgradeProof.after).toBe(upgradeProof.before);
    expect(upgradeProof.foreignKeys).toEqual([]);
    expect(upgradeProof.quickCheck).toEqual({ quick_check: "ok" });
    expect(upgradeProof.legacyBasis).toBe("qualified_final_variable_cost");
    expect(upgradeProof.legacyQuoteValid).toBe(true);
  });
  it("adds postal ex-tax pricing without altering historical postal or public-email quotes", () => {
    expect(postalUpgradeProof.after).toBe(postalUpgradeProof.before);
    expect(postalUpgradeProof.historicalPostalValid).toBe(true);
    expect(postalUpgradeProof.publicEmailValid).toBe(true);
  });
  it("binds exact Pingen calculator EUR ex-tax price to approval, acceptance and charge without FX", async () => {
    await replacePostalRate();
    postalSupplierMinor = 151;
    const row = await queue(await postal());
    expect(row).toMatchObject({
      quote_pricing_basis: "public_list_price_ex_tax",
      quote_fx: null,
      estimated_minor: 302,
      quote_customer_nanoeur: 3020000000,
    });
    const quote = await validateLiveDeliveryQuote(
      db,
      row,
      identity.postal,
      stamp(),
    );
    expect(JSON.parse(quote.input_json)).toHaveProperty(
      "pricingBasis",
      "public_list_price_ex_tax",
    );
    expect(JSON.parse(quote.input_json)).not.toHaveProperty("fx");
    expect(quote).toMatchObject({
      supplier_nanoeur: 1510000000,
      fiscal_basis: "public_list_price_ex_tax",
    });
    const hook = provider("postal");
    hook.submit = vi.fn(hook.submit);
    await domain.processDispatch(row.id, hook);
    expect(hook.submit).toHaveBeenCalledOnce();
    expect(await balance()).toMatchObject({
      spentMinor: 302,
      reservedMinor: 0,
    });
  });
  it("rejects unknown calculator methods, tax sources, currency, FX, options and policy coefficients", async () => {
    const rate = await replacePostalRate();
    expect(postalPolicyOptions("left")).toHaveLength(8);
    expect(() => postalRateEvidence("2026-02-30")).toThrow();
    const baseline = (await db
      .prepare("SELECT * FROM trusted_delivery_costs WHERE id=?")
      .bind(id("policy_postal"))
      .first<Record<string, string | number>>())!;
    const patches = [
      ...[
        { method: "unverified" },
        { taxSource: "https://example.invalid" },
        { taxBasis: "vat_included" },
        { currency: "USD" },
        { tariffDate: "2999-01-01" },
        { tariffDate: "2026-02-30" },
        { fx: { numerator: 1, denominator: 1 } },
      ].map((patch) => ({ rate_json: canonicalJson({ ...rate, ...patch }) })),
      { base_numerator: 1 },
      { byte_numerator: 1 },
      { rate_denominator: 100 },
      { route_id: "other-account" },
      { options_json: canonicalJson({ ...print, printSpectrum: "unknown" }) },
      { options_json: canonicalJson({ ...print, extra: true }) },
      { channel: "email", provider: "ses" },
    ];
    for (const patch of patches) {
      const values = {
        ...baseline,
        ...patch,
        id: crypto.randomUUID(),
        status: "revoked",
      };
      await expect(
        db
          .prepare(
            `INSERT INTO trusted_delivery_costs(${Object.keys(values).join(",")}) VALUES(${Object.keys(
              values,
            )
              .map(() => "?")
              .join(",")})`,
          )
          .bind(...Object.values(values))
          .run(),
      ).rejects.toThrow("public_email_price_invalid");
    }
  });
  it("rechecks the postal public contract before accepting a signed quote and blocks revocation", async () => {
    await replacePostalRate();
    const row = await queue(await postal());
    const tamperedDb = new Proxy(db, {
      get(target, key) {
        if (key !== "prepare") return Reflect.get(target, key, target);
        return (query: string) => {
          const statement = target.prepare(query);
          if (
            !query.startsWith(
              "SELECT * FROM trusted_delivery_costs WHERE organization_id=? AND id=?",
            )
          )
            return statement;
          return {
            bind: (...values: unknown[]) => ({
              first: async () => {
                const policy = await statement
                  .bind(...values)
                  .first<Record<string, unknown>>();
                return {
                  ...policy,
                  rate_json: canonicalJson({
                    ...postalRateEvidence(stamp().slice(0, 10)),
                    fx: { numerator: 1, denominator: 1 },
                  }),
                };
              },
            }),
          } as D1PreparedStatement;
        };
      },
    });
    await expect(
      validateLiveDeliveryQuote(tamperedDb, row, identity.postal, stamp()),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    await db
      .prepare("UPDATE trusted_delivery_costs SET status='revoked' WHERE id=?")
      .bind(id("policy_postal"))
      .run();
    await expect(
      validateLiveDeliveryQuote(db, row, identity.postal, stamp()),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    const hook = provider("postal");
    hook.submit = vi.fn(hook.submit);
    await domain.processDispatch(row.id, hook);
    expect(hook.submit).not.toHaveBeenCalled();
  });
  it("atomically rejects a postal quote from an old reader that omits its public-price disclosure", async () => {
    await replacePostalRate();
    const legacyDb = new Proxy(db, {
      get(target, key) {
        if (key !== "prepare") return Reflect.get(target, key, target);
        return (query: string) => {
          const statement = target.prepare(query);
          if (
            !query.startsWith(
              "SELECT * FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=?",
            )
          )
            return statement;
          return {
            bind: (...values: unknown[]) => ({
              first: async () => {
                const policy = await statement
                  .bind(...values)
                  .first<Record<string, unknown>>();
                if (!policy) return policy;
                const { pricing_basis: _ignored, ...old } = policy;
                return { ...old, rate_json: "{}" };
              },
            }),
          } as D1PreparedStatement;
        };
      },
    });
    const oldReader = new DomainService(legacyDb, domain.config);
    await expect(
      oldReader.prepareDispatch(ctx, await postal(), "old-postal-reader"),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    expect(await count("dispatches")).toBe(0);
    expect(await count("live_delivery_quotes")).toBe(0);
    expect(await count("outbox")).toBe(0);
  });
  it("quotes the SES public ex-tax price at a signed commercial FX without claiming invoice cost", async () => {
    await replaceEmailRate(publicRate);
    await expect(
      domain.prepareDispatch(
        ctx,
        { ...email(), documentId: id("doc") },
        "public-pdf",
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
    const row = await queue();
    expect(row).toMatchObject({
      quote_pricing_basis: "public_list_price_ex_tax",
      quote_fx: {
        numerator: 10000,
        denominator: 11537,
        date: "2026-09-16",
        source: publicRate.fxSource,
      },
      quote_customer_nanoeur: 277370,
      estimated_minor: 1,
    });
    const q = await validateLiveDeliveryQuote(db, row, identity.email, stamp());
    expect(q.fiscal_basis).toBe("public_list_price_ex_tax");
    expect(q.supplier_nanoeur).toBe(138685);
    expect(row).not.toHaveProperty("quote_supplier_nanoeur");
    expect(JSON.parse(q.input_json)).toMatchObject({
      pricingBasis: "public_list_price_ex_tax",
      fx: row.quote_fx,
    });
    await expect(
      db
        .prepare(
          "UPDATE trusted_delivery_costs SET pricing_basis='qualified_final_variable_cost' WHERE id=?",
        )
        .bind(id("policy_email"))
        .run(),
    ).rejects.toThrow("immutable_delivery_cost");
    await domain.processDispatch(row.id, provider("email"));
    expect(await balance()).toMatchObject({ spentMinor: 1, reservedMinor: 0 });
    expect((await domain.getDispatch(ctx, row.id)).dispatch.quote_fx).toEqual(
      row.quote_fx,
    );
  });
  it("rejects public-price qualification with unknown sources, future FX, attachments, or the postal channel", async () => {
    await replaceEmailRate(publicRate);
    const baseline = (await db
      .prepare("SELECT * FROM trusted_delivery_costs WHERE id=?")
      .bind(id("policy_email"))
      .first<Record<string, string | number>>())!;
    const patches = [
      {
        rate_json: canonicalJson({
          ...publicRate,
          attachmentBasis: "raw_pdf_bytes",
          usdMicrosPerGb: 0,
          bytesPerGb: 1,
        }),
      },
      { rate_json: canonicalJson({ ...publicRate, fxDate: "2999-01-01" }) },
      {
        rate_json: canonicalJson({
          ...publicRate,
          fxSource: "https://unqualified.example.invalid/",
        }),
      },
      { rate_json: canonicalJson({ ...publicRate, plan: "Pro" }) },
      { rate_json: canonicalJson(textOnlyRate) },
      { pricing_basis: "qualified_final_variable_cost" },
      { channel: "postal", provider: "pingen" },
    ];
    for (const patch of patches) {
      const values = {
        ...baseline,
        ...patch,
        id: crypto.randomUUID(),
        status: "revoked",
      };
      await expect(
        db
          .prepare(
            `INSERT INTO trusted_delivery_costs(${Object.keys(values).join(",")}) VALUES(${Object.keys(
              values,
            )
              .map(() => "?")
              .join(",")})`,
          )
          .bind(...Object.values(values))
          .run(),
      ).rejects.toThrow("public_email_price_invalid");
    }
  });
  it("atomically blocks an old reader from relabelling a public policy as qualified invoice cost", async () => {
    await replaceEmailRate(publicRate);
    const legacyDb = new Proxy(db, {
      get(target, key) {
        if (key !== "prepare") return Reflect.get(target, key, target);
        return (query: string) => {
          const statement = target.prepare(query);
          if (
            !query.startsWith(
              "SELECT * FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=?",
            )
          )
            return statement;
          return {
            bind: (...bindings: unknown[]) => ({
              first: async () => {
                const p = await statement
                  .bind(...bindings)
                  .first<Record<string, unknown>>();
                if (!p) return p;
                const { pricing_basis: _ignored, ...old } = p;
                return { ...old, rate_json: canonicalJson(textOnlyRate) };
              },
            }),
          } as D1PreparedStatement;
        };
      },
    });
    const legacyReader = new DomainService(legacyDb, {
      mode: "production",
      now: () => clock,
      liveDeliveryIdentity: identity,
    });
    await expect(
      legacyReader.prepareDispatch(ctx, email(), "old-pricing-reader"),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    expect(await count("dispatches")).toBe(0);
    expect(await count("live_delivery_quotes")).toBe(0);
    expect(await count("outbox")).toBe(0);
  });
  it("qualifies text-only email independently of unknown attachment billing and retains exact rational FX", async () => {
    expect(emailRateComponents(textOnlyRate)).toEqual({
      base_numerator: 1600000000,
      byte_numerator: 0,
      rate_denominator: 11537,
    });
    await replaceEmailRate(textOnlyRate);
    const row = await queue();
    const quote = await validateLiveDeliveryQuote(
      db,
      row,
      identity.email,
      stamp(),
    );
    const supplierNano = Number((1600000000n + 11536n) / 11537n);
    expect(quote).toMatchObject({
      supplier_numerator: "1600000000",
      supplier_denominator: "11537",
      supplier_nanoeur: supplierNano,
      customer_nanoeur: 2 * supplierNano,
      attachment_bytes: 0,
      amount_minor: 1,
    });
    const hook = provider("email");
    hook.submit = vi.fn(hook.submit);
    await domain.processDispatch(row.id, hook);
    expect(hook.submit).toHaveBeenCalledOnce();
    expect(await balance()).toMatchObject({ reservedMinor: 0, spentMinor: 1 });
  });
  it("rejects documents under a no-attachments policy even when their declared byte size is zero", async () => {
    await replaceEmailRate(textOnlyRate);
    await expect(
      domain.prepareDispatch(ctx, { ...email(), documentId: id("doc") }, "pdf"),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
    await expect(
      resolveDeliveryPrice(db, {
        organizationId: ctx.organizationId,
        senderId: id("sender_email"),
        channel: "email",
        recipient: { email: "recipient@example.invalid" },
        options: {},
        document: { id: id("doc"), sha256: "a".repeat(64), size: 0 },
        identity: identity.email,
        now: stamp(),
      }),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
    expect(await count("dispatches")).toBe(0);
    expect(await count("live_delivery_quotes")).toBe(0);
    expect(await count("outbox")).toBe(0);
    const row = await domain.prepareDispatch(ctx, email(), "text");
    // The transport receives this Dispatch object. The last pre-submit check must
    // reject a document on it even if the persisted no-attachment quote is valid.
    await expect(
      validateLiveDeliveryQuote(
        db,
        { ...row, document_id: id("doc") },
        identity.email,
        stamp(),
      ),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    await expect(
      validateLiveDeliveryQuote(
        db,
        row,
        { ...identity.email, accountId: "other" },
        stamp(),
      ),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    clock += 301000;
    await expect(
      validateLiveDeliveryQuote(db, row, identity.email, stamp()),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
  });
  it("rejects ambiguous no-attachment evidence in both the rate helper and direct SQL qualification", async () => {
    const baseline = (await db
      .prepare(
        "SELECT * FROM trusted_delivery_costs WHERE id=? AND organization_id=?",
      )
      .bind(id("policy_email"), ctx.organizationId)
      .first<Record<string, string | number>>())!;
    for (const evidence of [
      { ...textOnlyRate, usdMicrosPerGb: 0 },
      { ...textOnlyRate, bytesPerGb: 1000000000 },
      { ...textOnlyRate, usdMicrosPerGb: null },
      { ...textOnlyRate, attachmentBasis: "unknown" },
      { usdMicrosPerMessage: 160 },
    ]) {
      expect(() =>
        emailRateComponents(evidence as EmailRateEvidence),
      ).toThrow();
      const values = {
        ...baseline,
        id: crypto.randomUUID(),
        status: "revoked",
        rate_json: canonicalJson(evidence),
        byte_numerator: 0,
      };
      await expect(
        db
          .prepare(
            `INSERT INTO trusted_delivery_costs(${Object.keys(values).join(",")}) VALUES(${Object.keys(
              values,
            )
              .map(() => "?")
              .join(",")})`,
          )
          .bind(...Object.values(values))
          .run(),
      ).rejects.toThrow("email_attachment_scope_invalid");
    }
  });
  it("atomically rejects an attached quote produced by a legacy reader that ignores no-attachment scope", async () => {
    await replaceEmailRate({
      ...textOnlyRate,
      eurPerUsdNumerator: 1,
      eurPerUsdDenominator: 1,
    });
    // Simulate the old application's interpretation of zero byte cost. Writes and
    // approval guards still run against the actual migrated D1 policy and view.
    const legacyDb = new Proxy(db, {
      get(target, key) {
        if (key !== "prepare") return Reflect.get(target, key, target);
        return (query: string) => {
          const statement = target.prepare(query);
          if (
            !query.startsWith(
              "SELECT * FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=?",
            )
          )
            return statement;
          return {
            bind: (...bindings: unknown[]) => ({
              first: async () => {
                const p = await statement
                  .bind(...bindings)
                  .first<Record<string, unknown>>();
                return (
                  p && {
                    ...p,
                    rate_json: canonicalJson({
                      ...rate,
                      usdMicrosPerMessage: 160,
                      usdMicrosPerGb: 0,
                    }),
                  }
                );
              },
            }),
          } as D1PreparedStatement;
        };
      },
    });
    const legacyReader = new DomainService(legacyDb, {
      mode: "production",
      now: () => clock,
      liveDeliveryIdentity: identity,
    });
    await expect(
      legacyReader.prepareDispatch(
        ctx,
        { ...email(), documentId: id("doc") },
        "legacy",
      ),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    expect(await count("dispatches")).toBe(0);
    expect(await count("live_delivery_quotes")).toBe(0);
    expect(await count("approvals")).toBe(0);
    expect(await count("outbox")).toBe(0);
  });
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
    expect(a).not.toHaveProperty("quote_supplier_nanoeur");
    expect(
      (await validateLiveDeliveryQuote(db, a, identity.email, stamp()))
        .supplier_nanoeur,
    ).toBe(100120);
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
  it("atomically refuses a v1 postal proof after the v2 rules migration", async () => {
    const row = await domain.prepareDispatch(
      ctx,
      await postal("pingen-2026-09-17-v1"),
      "legacy-postal-proof",
    );
    await domain.approveDispatch(ctx, row.id, row.fingerprint);
    await expect(
      domain.confirmDispatch(ctx, row.id, "legacy-postal-accept"),
    ).rejects.toMatchObject({ code: "POSTAL_PREFLIGHT_REQUIRED" });
    for (const table of [
      "outbox",
      "reservations",
      "welcome_credit_reservations",
    ])
      expect(await count(table)).toBe(0);
    expect(await balance()).toMatchObject({
      availableMinor: 5000,
      reservedMinor: 0,
      spentMinor: 0,
    });
  });
  it("atomically blocks postal acceptance if its canonical scan proof is withdrawn after approval", async () => {
    const row = await domain.prepareDispatch(
      ctx,
      await postal(),
      "postal-proof",
    );
    await domain.approveDispatch(ctx, row.id, row.fingerprint);
    await db
      .prepare(
        "DELETE FROM audit_log WHERE organization_id=? AND action='document.scan_verified' AND resource_id=?",
      )
      .bind(ctx.organizationId, "a".repeat(64))
      .run();
    await expect(
      domain.confirmDispatch(ctx, row.id, "postal-no-proof"),
    ).rejects.toMatchObject({ code: "POSTAL_PREFLIGHT_REQUIRED" });
    for (const table of [
      "outbox",
      "reservations",
      "welcome_credit_reservations",
    ])
      expect(await count(table)).toBe(0);
    expect(await balance()).toMatchObject({
      availableMinor: 5000,
      reservedMinor: 0,
      spentMinor: 0,
    });
  });
  // Keep all 51 real D1 approval/acceptance paths concurrent. The shared Linux
  // runner needs more than the default 30s for this financial integration test.
  it(
    "does not charge a cent per email: 51 concurrent acceptances cost 2 cents cumulatively",
    { timeout: 90_000 },
    async () => {
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
    },
  );
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
