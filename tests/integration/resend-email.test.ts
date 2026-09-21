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
import { PDFDocument } from "pdf-lib";
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
  postalRateEvidence,
  validateLiveDeliveryQuote,
  type LiveDeliveryIdentities,
  type PublicEmailRateEvidence,
} from "../../packages/domain/src/live-delivery-quotes";
import {
  createLiveProviderHook,
  type LiveProviderEnv,
} from "../../apps/api/src/live-providers";
import {
  prepareProtectedDocument,
  revealProtectedDocumentPassword,
  revokeProtectedDocument,
} from "../../apps/api/src/protected-documents";
import { dispatchSummary } from "../../apps/api/src/mcp";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";
import type { Fetcher } from "../../packages/providers";

let mf: Miniflare,
  db: D1Database,
  bucket: R2Bucket,
  domain: DomainService,
  ctx: ActorContext,
  clock: number;
let identity: LiveDeliveryIdentities;
let env: LiveProviderEnv & { PROTECTED_DOCUMENTS_KEY: string };
let pdfBytes: Uint8Array<ArrayBuffer>, documentSha: string;
let migrationProof: {
  before: string;
  after34: string;
  after35: string;
  validBefore: string[];
  validAfter34: string[];
  validAfter35: string[];
  foreignKeys: unknown[];
  quickCheck: unknown;
};
const print = {
  addressPosition: "left",
  deliveryProduct: "cheap",
  printMode: "duplex",
  printSpectrum: "grayscale",
};
const stamp = () => new Date(clock).toISOString();
const id = (prefix: string) => `${prefix}_${ctx.organizationId}`;
const email = (extra: Partial<PrepareInput> = {}): PrepareInput => ({
  channel: "email",
  recipient: { email: "recipient@example.invalid" },
  subject: "Requested synthetic message",
  html: "<p>Exact approved synthetic content.</p>",
  text: "Exact approved synthetic content.",
  ceilingMinor: 200,
  ...extra,
});

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
  if (statement.trim()) throw Error("Incomplete SQL fixture");
  // Match D1 migration atomicity, including deferred FKs during the table rebuild.
  if (statements.length) await db.batch(statements);
}
async function qualify(
  channel: "email" | "postal",
  provider: "ses" | "resend",
) {
  const rate =
    channel === "postal"
      ? postalRateEvidence(stamp().slice(0, 10))
      : ({
          usdMicrosPerMessage: provider === "resend" ? 900 : 160,
          eurPerUsdNumerator: 10000,
          eurPerUsdDenominator: 11537,
          attachmentBasis:
            provider === "resend" ? "included_pdf" : "no_attachments",
          pricingBasis: "public_list_price_ex_tax",
          plan: provider === "resend" ? "Pro" : "Essentials",
          tier: provider === "resend" ? "additional_emails" : "0-10000000",
          unit: "recipient",
          currency: "USD",
          tariffSource:
            provider === "resend"
              ? "https://resend.com/pricing"
              : "https://aws.amazon.com/ses/pricing/",
          tariffDate: stamp().slice(0, 10),
          fxBasis: "commercial_fixed_reference",
          fxSource:
            "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
          fxDate: stamp().slice(0, 10),
        } satisfies PublicEmailRateEvidence);
  const c =
    channel === "email"
      ? emailRateComponents(rate as PublicEmailRateEvidence)
      : { base_numerator: 0, byte_numerator: 0, rate_denominator: 1 };
  await db
    .prepare(
      "INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,pricing_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'EUR','qualified_final_variable_cost','public_list_price_ex_tax',300,'ISOLATED SYNTHETIC RATE - NOT PRODUCTION',?,?,?,'qualified',?)",
    )
    .bind(
      id("policy_" + channel),
      ctx.organizationId,
      id("sender_" + channel),
      channel,
      channel === "postal" ? "pingen" : provider,
      identity[channel]!.accountId,
      identity[channel]!.routeId,
      canonicalJson(channel === "postal" ? print : {}),
      canonicalJson(rate),
      c.base_numerator,
      c.byte_numerator,
      c.rate_denominator,
      await sha256(canonicalJson(rate)),
      stamp(),
      new Date(clock + 3600000).toISOString(),
      stamp(),
    )
    .run();
}
async function setupFixture(provider: "ses" | "resend" = "resend") {
  clock = Date.now();
  ctx = {
    organizationId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    role: "admin",
    actor: "browser",
  };
  identity = {
    email:
      provider === "resend"
        ? {
            provider,
            accountId: `fixture_${ctx.organizationId}`,
            routeId: "resend:domain_fixture:guteneo.com",
          }
        : {
            provider,
            accountId: "123456789012",
            routeId: "eu-west-1:fixture:false",
          },
    postal: { accountId: "pingen-fixture", routeId: "pingen-fixture" },
  };
  env = {
    DB: db,
    DOCUMENTS: bucket,
    APP_ORIGIN: "https://guteneo.invalid",
    ENVIRONMENT: "production",
    MODE: "production",
    LIVE_SENDS_ENABLED: "true",
    LIVE_SEND_CHANNELS: "email",
    EMAIL_PROVIDER: "resend",
    RESEND_ACCOUNT_ID: identity.email!.accountId,
    RESEND_DOMAIN_ID: "domain_fixture",
    RESEND_VERIFIED_DOMAIN: "guteneo.com",
    RESEND_API_KEY: "re_synthetic_fixture_key",
    RESEND_WEBHOOK_SECRET: "synthetic_fixture_secret",
    RESEND_SENDS_ENABLED: "true",
    PROTECTED_DOCUMENTS_KEY: "x".repeat(43),
  } as typeof env;
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations VALUES(?,'Isolated fixture','production',?)",
      )
      .bind(ctx.organizationId, stamp()),
    db
      .prepare(
        "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
      )
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
          channel === "email" ? "fixture@guteneo.com" : "Fixture sender",
          stamp(),
        ),
      db
        .prepare("INSERT INTO channel_controls VALUES(?,?,1)")
        .bind(ctx.organizationId, channel),
      db
        .prepare(
          "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,?,?,10000,100000,'EUR')",
        )
        .bind(ctx.organizationId, channel, stamp().slice(0, 7)),
    ]);
    await qualify(channel, provider);
  }
  if (provider === "resend")
    await db
      .prepare(
        "INSERT INTO resend_send_limit_policies(account_id,max_recipients_24h,max_recipients_month,min_interval_ms,qualified_at_ms,expires_at_ms,source_sha256,status) VALUES(?,100,3000,200,?,?,?,'qualified')",
      )
      .bind(
        identity.email!.accountId,
        clock - 1000,
        clock + 3600000,
        "a".repeat(64),
      )
      .run();
  domain = new DomainService(db, {
    mode: "production",
    now: () => clock,
    liveDeliveryIdentity: identity,
    prepareProtectedDocument: (principal, input, now) =>
      prepareProtectedDocument(env, principal, input, now),
    postalQuote: async (request) => ({
      supplierMinor: 151,
      currency: "EUR",
      providerDraftId: request.options.providerDraftId as string,
      preparedLetterId: request.options.preparedLetterId as string,
      evidenceSha256: "c".repeat(64),
    }),
  });
  await domain.registerDocument(ctx, {
    id: id("doc"),
    name: "original.pdf",
    sha256: documentSha,
    size: pdfBytes.length,
    pages: 2,
    status: "ready",
    source: "import",
    storageKey: `fixture/${ctx.organizationId}`,
    scanVerified: true,
  });
  await bucket.put(`fixture/${ctx.organizationId}`, pdfBytes);
}
async function queue(input = email()) {
  const row = await domain.prepareDispatch(ctx, input, crypto.randomUUID());
  await domain.approveDispatch(ctx, row.id, row.fingerprint, {
    recipientRequested: true,
  });
  return domain.confirmDispatch(ctx, row.id, crypto.randomUUID());
}
const balance = async () => (await domain.usage(ctx)).welcomeCredit;
const validQuotes = async () =>
  (
    await db
      .prepare(
        "SELECT dispatch_id FROM valid_live_delivery_quotes WHERE organization_id=? ORDER BY dispatch_id",
      )
      .bind(ctx.organizationId)
      .all<{ dispatch_id: string }>()
  ).results.map((r) => r.dispatch_id);
async function snapshot() {
  return JSON.stringify(
    await Promise.all(
      [
        "trusted_delivery_costs",
        "live_delivery_quotes",
        "approvals",
        "reservations",
        "welcome_credit_reservations",
        "welcome_credit_entries",
        "delivery_charge_entries",
        "outbox",
        "suppressions",
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
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  pdfBytes = new Uint8Array(await pdf.save());
  documentSha = await sha256(pdfBytes);
  const dir = new URL("../../migrations/", import.meta.url);
  for (const filename of readdirSync(dir)
    .filter((name) => name.endsWith(".sql") && name < "0035")
    .sort())
    await sql(readFileSync(new URL(filename, dir), "utf8"));
  await setupFixture("ses");
  const legacyEmail = await queue();
  await domain.processDispatch(legacyEmail.id, {
    name: "ses",
    liveDeliveryIdentity: identity,
    submit: async () => ({
      status: "accepted",
      providerId: "legacy_synthetic_message",
    }),
  });
  await queue(await postal());
  await db
    .prepare(
      "INSERT INTO suppressions VALUES(?,'blocked@example.invalid','hard_bounce',?)",
    )
    .bind(ctx.organizationId, stamp())
    .run();
  const before = await snapshot(),
    validBefore = await validQuotes();
  await sql(
    readFileSync(new URL("0035_resend_email_transport.sql", dir), "utf8"),
  );
  const after34 = await snapshot(),
    validAfter34 = await validQuotes();
  await sql(readFileSync(new URL("0036_protected_documents.sql", dir), "utf8"));
  migrationProof = {
    before,
    after34,
    after35: await snapshot(),
    validBefore,
    validAfter34,
    validAfter35: await validQuotes(),
    foreignKeys: (await db.prepare("PRAGMA foreign_key_check").all()).results,
    quickCheck: await db.prepare("PRAGMA quick_check").first(),
  };
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await setupFixture();
});

describe("Resend domain, live bridge and populated migrations — synthetic transport only", () => {
  it("preserves approved SES/postal quotes, settled credit, reservations and suppressions through 0034 and 0035", () => {
    expect(migrationProof.after34).toBe(migrationProof.before);
    expect(migrationProof.after35).toBe(migrationProof.before);
    expect(migrationProof.validBefore).toHaveLength(2);
    expect(migrationProof.validAfter34).toEqual(migrationProof.validBefore);
    expect(migrationProof.validAfter35).toEqual(migrationProof.validBefore);
    expect(migrationProof.foreignKeys).toEqual([]);
    expect(migrationProof.quickCheck).toEqual({ quick_check: "ok" });
  });

  it.each(["none", "attachment", "protected_link"] as const)(
    "carries %s through real preparation, approval, credit reservation and the Resend bridge",
    async (mode) => {
      const fetcher = vi
        .fn<Fetcher>()
        .mockResolvedValue(Response.json({ id: crypto.randomUUID() }));
      const input = email({
        ...(mode === "none" ? {} : { documentId: id("doc") }),
        ...(mode === "protected_link"
          ? { options: { emailDeliveryMode: mode, protectedDays: 7 } }
          : {}),
      });
      const row = await domain.prepareDispatch(
        ctx,
        input,
        "three_modes_fixture",
      );
      const quote = await validateLiveDeliveryQuote(
        db,
        row,
        identity.email,
        stamp(),
      );
      expect(row.document_id).toBe(mode === "none" ? null : id("doc"));
      expect(quote.provider).toBe("resend");
      expect(quote.attachment_bytes).toBe(
        mode === "attachment" ? pdfBytes.length : 0,
      );
      expect(row.estimated_minor).toBe(
        quote.amount_minor + (mode === "protected_link" ? 100 : 0),
      );
      expect(fetcher).not.toHaveBeenCalled();
      await expect(
        domain.confirmDispatch(ctx, row.id, "without_approval"),
      ).rejects.toMatchObject({ code: "RECIPIENT_REQUEST_REQUIRED" });
      expect(fetcher).not.toHaveBeenCalled();
      await domain.approveDispatch(ctx, row.id, row.fingerprint, {
        recipientRequested: true,
      });
      await domain.confirmDispatch(ctx, row.id, "approved_fixture");
      const reserved = await balance();
      expect(reserved.reservedMinor).toBe(
        row.ceiling_minor - (mode === "protected_link" ? 100 : 0),
      );
      expect(reserved.spentMinor).toBe(mode === "protected_link" ? 100 : 0);
      const hook = createLiveProviderHook(env, "email", {
        fetcher,
        now: () => clock,
      });
      await domain.processDispatch(row.id, hook);
      const result = await domain.getDispatch(ctx, row.id);
      expect(
        result.dispatch.status,
        JSON.stringify(result.attempts.map((attempt) => attempt.error_code)),
      ).toBe("accepted");
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe("https://api.resend.com/emails");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        from: "fixture@guteneo.com",
        to: ["recipient@example.invalid"],
        subject: row.subject,
        html: row.html,
        text: row.text,
      });
      if (mode === "attachment") {
        expect(body.attachments).toHaveLength(1);
        expect(body.attachments[0]).toMatchObject({
          filename: "original.pdf",
          content_type: "application/pdf",
        });
        expect(Buffer.from(body.attachments[0].content, "base64")).toEqual(
          Buffer.from(pdfBytes),
        );
      } else expect(body).not.toHaveProperty("attachments");
      if (mode === "protected_link") {
        const disclosed = await revealProtectedDocumentPassword(
          env,
          ctx,
          row.id,
          stamp(),
        );
        expect(body.text).toContain("https://guteneo.invalid/share/");
        expect(JSON.stringify(body)).not.toContain(disclosed.password);
        expect(
          JSON.stringify(dispatchSummary(result.dispatch, env.APP_ORIGIN)),
        ).not.toContain(disclosed.password);
        expect(
          await db
            .prepare(
              "SELECT count(*) n FROM protected_hosting_charges WHERE organization_id=?",
            )
            .bind(ctx.organizationId)
            .first(),
        ).toEqual({ n: 1 });
      }
      // This isolated account's first message rounds its fractional-cent
      // transport price up to one cent; hosting remains a distinct €1 charge.
      const settledMinor = mode === "protected_link" ? 101 : 1;
      const expectSettled = async () => {
        expect(await balance()).toMatchObject({
          reservedMinor: 0,
          spentMinor: settledMinor,
        });
        expect(
          await db
            .prepare(
              "SELECT reserved_count,confirmed_count,reserved_minor,confirmed_minor FROM usage WHERE organization_id=? AND channel='email' AND period=?",
            )
            .bind(ctx.organizationId, stamp().slice(0, 7))
            .first(),
        ).toEqual({
          reserved_count: 0,
          confirmed_count: 1,
          reserved_minor: 0,
          confirmed_minor: settledMinor,
        });
      };
      await expectSettled();
      await domain.processDispatch(row.id, hook);
      expect(fetcher).toHaveBeenCalledTimes(1);
      await expectSettled();
    },
  );

  it("charges one hosting fee when two separately approved messages reuse the same protected original", async () => {
    const input = email({
      documentId: id("doc"),
      options: { emailDeliveryMode: "protected_link", protectedDays: 7 },
    });
    const first = await domain.prepareDispatch(ctx, input, "first_protected");
    const second = await domain.prepareDispatch(
      ctx,
      { ...input, recipient: { email: "other@example.invalid" } },
      "second_protected",
    );
    const firstProtection = JSON.parse(first.options_json).protectedDocument;
    expect(JSON.parse(second.options_json).protectedDocument).toEqual(
      firstProtection,
    );
    for (const row of [first, second])
      await domain.approveDispatch(ctx, row.id, row.fingerprint, {
        recipientRequested: true,
      });
    await Promise.all([
      domain.confirmDispatch(ctx, first.id, "first_confirm"),
      domain.confirmDispatch(ctx, second.id, "second_confirm"),
    ]);
    expect(
      await db
        .prepare(
          "SELECT count(*) n,SUM(amount_minor) total FROM protected_hosting_charges WHERE organization_id=?",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ n: 1, total: 100 });
    expect(await balance()).toMatchObject({
      reservedMinor: 200,
      spentMinor: 100,
    });
    const third = await domain.prepareDispatch(ctx, input, "already_hosted");
    expect(JSON.parse(third.options_json).protectedDocument).toEqual({
      ...firstProtection,
      hostingFeeMinor: 0,
    });
    expect(third.estimated_minor).toBe(first.estimated_minor - 100);
  });

  it("blocks a revoked protected document after queueing and keeps its hosting charge distinct", async () => {
    const row = await queue(
      email({
        documentId: id("doc"),
        options: { emailDeliveryMode: "protected_link", protectedDays: 7 },
      }),
    );
    await revokeProtectedDocument(env, ctx, row.id, stamp());
    const fetcher = vi.fn<Fetcher>();
    await domain.processDispatch(
      row.id,
      createLiveProviderHook(env, "email", { fetcher, now: () => clock }),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect((await domain.getDispatch(ctx, row.id)).dispatch.status).toBe(
      "failed",
    );
    expect(await balance()).toMatchObject({
      reservedMinor: 0,
      spentMinor: 100,
    });
  });

  it("rechecks hosting expiry after account quota reservation while the approved transport quote is still valid", async () => {
    const protection = await prepareProtectedDocument(
      env,
      ctx,
      { documentId: id("doc"), durationDays: 1 },
      new Date(clock - 86400_000 + 1000).toISOString(),
    );
    const row = await queue(
      email({
        documentId: id("doc"),
        options: { emailDeliveryMode: "protected_link", protectedDays: 1 },
      }),
    );
    const expiresAt = Date.parse(protection.expiresAt);
    const hookDb = new Proxy(db, {
      get(target, property) {
        if (property !== "prepare") {
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (query: string) => {
          const statement = db.prepare(query);
          if (!query.includes("INSERT INTO resend_send_reservations("))
            return statement;
          return {
            bind(...values: unknown[]) {
              const bound = statement.bind(...values);
              return {
                async run() {
                  const result = await bound.run();
                  clock = expiresAt + 1;
                  return result;
                },
              };
            },
          };
        };
      },
    });
    const fetcher = vi.fn<Fetcher>();
    await domain.processDispatch(
      row.id,
      createLiveProviderHook({ ...env, DB: hookDb }, "email", {
        fetcher,
        now: () => clock,
      }),
    );
    expect(clock).toBe(expiresAt + 1);
    expect(Date.parse(row.quote_expires_at!)).toBeGreaterThan(clock);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await domain.getDispatch(ctx, row.id)).dispatch.status).toBe(
      "failed",
    );
  });

  it("rejects a SES hook for a queued Resend quote before contacting either provider", async () => {
    const row = await queue();
    const submit = vi.fn<ProviderHook["submit"]>();
    await domain.processDispatch(row.id, {
      name: "ses",
      liveDeliveryIdentity: {
        email: {
          provider: "ses",
          accountId: identity.email!.accountId,
          routeId: identity.email!.routeId,
        },
      },
      submit,
    });
    expect(submit).not.toHaveBeenCalled();
    expect((await domain.getDispatch(ctx, row.id)).dispatch.status).toBe(
      "failed",
    );
  });
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
      documentSha,
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
    canonicalJson({ recipient, print, documentSha256: documentSha, draft }),
  );
  const record = {
    id: preflightId,
    organization_id: ctx.organizationId,
    user_id: ctx.userId,
    document_id: id("doc"),
    document_sha256: documentSha,
    sender_id: id("sender_postal"),
    sender_address: "Fixture sender",
    recipient_json: canonicalJson(recipient),
    options_json: canonicalJson(print),
    profile_json: canonicalJson({
      accountId: identity.postal!.accountId,
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
    sha256: documentSha,
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
