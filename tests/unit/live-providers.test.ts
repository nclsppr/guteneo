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
import { PDFDocument } from "pdf-lib";
import {
  createLiveProviderHook,
  createLiveDeliveryQuoteConfig,
  preparePostalDraft,
  serveProviderMedia,
  type LiveProviderEnv,
  type PreparePostalDraftInput,
} from "../../apps/api/src/live-providers";
import {
  canonicalJson,
  DomainService,
  emailRateComponents,
  sha256,
  type ActorContext,
  type Channel,
  type Dispatch,
  type ProviderHook,
} from "../../packages/domain/src/index";
import { validateRecipient } from "../../packages/contracts/src/content";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";
import type { Fetcher } from "../../packages/providers";
import { resetFixtureMemberships } from "../helpers/reset-memberships";

let mf: Miniflare;
let db: D1Database;
let bucket: R2Bucket;
let domain: DomainService;
let env: LiveProviderEnv;
let pdfBytes: Uint8Array<ArrayBuffer>;
let documentSha: string;
const ctx: ActorContext = {
  organizationId: "org_live_fixture",
  userId: "user_fixture",
  role: "admin",
  actor: "browser",
};
const postalRecipient = {
  name: "Fixture Recipient",
  line1: "1 Fixture Street",
  postalCode: "00000",
  city: "Fixture City",
  country: "FR",
};
const postalOptions = {
  addressPosition: "left",
  deliveryProduct: "cheap",
  printMode: "duplex",
  printSpectrum: "grayscale",
} as const;
const expectedAddress =
  "Fixture Recipient\n1 Fixture Street\n00000 Fixture City\nFRANCE";
const json = (value: unknown, status = 200) => Response.json(value, { status });
async function applySql(sql: string) {
  let statement = "";
  let trigger = false;
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line} `;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      await db.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete migration fixture");
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  const migrations = new URL("../../migrations/", import.meta.url);
  for (const filename of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await applySql(readFileSync(new URL(filename, migrations), "utf8"));
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdfBytes = new Uint8Array(await pdf.save());
  documentSha = await sha256(pdfBytes);
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  for (const table of [
    "postal_transfer_consents",
    "postal_preflights",
    "document_access_grants",
    "provider_drafts",
    "provider_events",
    "ses_send_reservations",
    "attempts",
    "outbox",
    "reservations",
    "approvals",
    "idempotency_keys",
    "audit_log",
    "dispatches",
    "trusted_fax_supplier_costs",
    "trusted_delivery_costs",
    "campaigns",
    "documents",
    "suppressions",
    "senders",
    "channel_controls",
    "usage",
    "content_usage",
    "content_limits",
    "memberships",
    "users",
    "organizations",
  ])
    if (table === "memberships") await resetFixtureMemberships(db);
    else await db.prepare(`DELETE FROM ${table}`).run();
  const now = new Date().toISOString();
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
  for (const [channel, address] of [
    ["fax", "+33100000000"],
    ["email", "sender@example.invalid"],
    ["postal", "Fixture return address"],
  ]) {
    await db
      .prepare(
        "INSERT INTO senders VALUES(?,?,?,'Fixture',?,'verified','production',?)",
      )
      .bind(`sender_${channel}`, ctx.organizationId, channel, address, now)
      .run();
    await db
      .prepare("INSERT INTO channel_controls VALUES(?,?,1)")
      .bind(ctx.organizationId, channel)
      .run();
    await db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,?,?,100,100000,'EUR')",
      )
      .bind(ctx.organizationId, channel, now.slice(0, 7))
      .run();
  }
  domain = new DomainService(db, {
    mode: "production",
    liveFaxIdentity: {
      accountId: "account-fixture",
      connectionId: "connection-fixture",
    },
  });
  await domain.registerDocument(ctx, {
    id: "doc_fixture",
    name: "exact.pdf",
    sha256: documentSha,
    size: pdfBytes.length,
    pages: 1,
    status: "ready",
    source: "import",
    storageKey: "fixture/exact.pdf",
    scanVerified: true,
  });
  await bucket.put("fixture/exact.pdf", pdfBytes);
  env = {
    DB: db,
    DOCUMENTS: bucket,
    ENVIRONMENT: "staging",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    LIVE_SENDS_ENABLED: "true",
    POSTAL_DRAFTS_ENABLED: "true",
    TELNYX_API_KEY: "test-only",
    TELNYX_ACCOUNT_ID: "account-fixture",
    TELNYX_CONNECTION_ID: "connection-fixture",
    TELNYX_FROM: "+33100000000",
    TELNYX_ALLOWED_PREFIXES: "+33,+352,+49",
    AWS_ACCESS_KEY_ID: "TESTKEY",
    AWS_SECRET_ACCESS_KEY: "test-only",
    AWS_REGION: "eu-west-1",
    SES_CONFIGURATION_SET: "fixture",
    SES_SANDBOX: "true",
    SES_ACCOUNT_ID: "123456789012",
    SES_SNS_TOPIC_ARN: "arn:aws:sns:eu-west-1:123456789012:fixture",
    SES_VERIFIED_RECIPIENTS: "recipient@example.invalid",
    PINGEN_CLIENT_ID: "test-client",
    PINGEN_CLIENT_SECRET: "test-only",
    PINGEN_ORGANIZATION_ID: "pingen-fixture",
    PINGEN_SANDBOX: "true",
    PINGEN_DEFAULT_COUNTRY: "LU",
    PINGEN_UPLOAD_ORIGINS: "https://objects.cloudscale.ch",
  } as LiveProviderEnv;
  domain = new DomainService(db, {
    mode: "production",
    liveFaxIdentity: {
      accountId: "account-fixture",
      connectionId: "connection-fixture",
    },
    ...createLiveDeliveryQuoteConfig(env, { fetcher: pingenFixtureFetch() }),
  });
});

/** All channels use qualified isolated prices through the real preparation/approval path. */
async function queueFixture(
  channel: Channel,
  options: Record<string, unknown> = {},
  recipientOverride?: Record<string, unknown>,
): Promise<Dispatch> {
  if (channel === "fax") {
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT OR IGNORE INTO trusted_fax_supplier_costs(id,organization_id,sender_id,provider,account_id,connection_id,destination_prefix,options_json,currency,supplier_base_numerator,supplier_per_page_numerator,supplier_denominator,fiscal_basis,currency_basis,max_pages,quote_ttl_seconds,cost_basis,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES('fixture-tariff',?,'sender_fax','telnyx','account-fixture','connection-fixture','+33','{}','EUR',0,50,1,'tax_inclusive_totals','same_currency_no_fx',350,900,'guaranteed_final_supplier_total','isolated test fixture only',?,? ,?,'qualified',?)",
      )
      .bind(
        ctx.organizationId,
        "a".repeat(64),
        now,
        new Date(Date.now() + 3600000).toISOString(),
        now,
      )
      .run();
    const prepared = await domain.prepareDispatch(
      ctx,
      {
        channel,
        recipient: recipientOverride ?? { phone: "+33100000001" },
        documentId: "doc_fixture",
        senderId: "sender_fax",
        options,
        ceilingMinor: 200,
      },
      crypto.randomUUID(),
    );
    await domain.approveDispatch(ctx, prepared.id, prepared.fingerprint);
    return domain.confirmDispatch(ctx, prepared.id, crypto.randomUUID());
  }
  const recipient = validateRecipient(
    channel,
    recipientOverride ??
      (channel === "email"
        ? { email: "recipient@example.invalid" }
        : postalRecipient),
  );
  const now = new Date().toISOString();
  const priceOptions = channel === "postal" ? postalOptions : options;
  const rate = {
    usdMicrosPerMessage: 100,
    usdMicrosPerGb: 120000,
    bytesPerGb: 1000000000,
    eurPerUsdNumerator: 1,
    eurPerUsdDenominator: 1,
    attachmentBasis: "raw_pdf_bytes" as const,
  };
  const c = emailRateComponents(rate),
    identity =
      createLiveDeliveryQuoteConfig(env).liveDeliveryIdentity[channel]!;
  await db
    .prepare(
      "INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'EUR','qualified_final_variable_cost',900,'ISOLATED PROVIDER FIXTURE',?,?,?,'qualified',?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(
      "policy_" + channel,
      ctx.organizationId,
      "sender_" + channel,
      channel,
      channel === "email" ? "ses" : "pingen",
      identity.accountId,
      identity.routeId,
      canonicalJson(priceOptions),
      canonicalJson(rate),
      c.base_numerator,
      c.byte_numerator,
      c.rate_denominator,
      "b".repeat(64),
      now,
      new Date(Date.now() + 3600000).toISOString(),
      now,
    )
    .run();
  const row = await domain.prepareDispatch(
    ctx,
    {
      channel,
      recipient,
      documentId: "doc_fixture",
      senderId: "sender_" + channel,
      subject: channel === "email" ? "Fixture subject" : undefined,
      html: channel === "email" ? "<p>Approved HTML.</p>" : undefined,
      text: channel === "email" ? "Approved text." : undefined,
      options,
      ceilingMinor: 200,
    },
    crypto.randomUUID(),
  );
  await domain.approveDispatch(ctx, row.id, row.fingerprint, {
    recipientRequested: true,
  });
  return domain.confirmDispatch(ctx, row.id, crypto.randomUUID());
}
function pingenFixtureFetch() {
  return vi.fn<Fetcher>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/auth/access-tokens"))
      return json({ access_token: "fixture-access", expires_in: 43200 });
    if (url.endsWith("/file-upload"))
      return json({
        data: {
          attributes: {
            url: "https://objects.cloudscale.ch/fixture.pdf?signature=fixture",
            url_signature: "fixture-signature",
          },
        },
      });
    if (url.startsWith("https://objects.cloudscale.ch/"))
      return new Response("", { status: 200 });
    if (url.endsWith("/deliveries/letters") && method === "POST")
      return json(
        {
          data: { id: "letter-fixture", attributes: { status: "processing" } },
        },
        201,
      );
    if (url.endsWith("/letters/letter-fixture"))
      return json({
        data: {
          id: "letter-fixture",
          attributes: {
            address: expectedAddress,
            country: "FR",
            paper_types: ["normal"],
            status: "valid",
          },
          meta: { abilities: { self: { submit: "ok" } } },
        },
      });
    if (url.endsWith("/price-calculator"))
      return json({ data: { attributes: { currency: "EUR", price: "0.73" } } });
    if (url.endsWith("/letter-fixture/send")) return json({}, 202);
    throw new Error("Unexpected fixture endpoint");
  });
}
const draftInput = (): PreparePostalDraftInput => ({
  documentId: "doc_fixture",
  senderId: "sender_postal",
  recipient: postalRecipient,
  options: postalOptions,
  ceilingMinor: 200,
  idempotencyKey: "draft-fixture",
  preflightId: "preflight_fixture",
});

/** Synthetic completed renderer evidence and browser consent. This bridge fixture
 * does not claim the blank PDF was analyzed; PostalService has its own renderer,
 * session, quota and consent integration suite. Every SQL guard stays installed. */
async function prepareFixtureDraft(fetcher: Fetcher, input = draftInput()) {
  const preflightId = input.preflightId!;
  const existing = await db
    .prepare("SELECT id FROM postal_preflights WHERE id=?")
    .bind(preflightId)
    .first();
  if (!existing) {
    const created = new Date().toISOString();
    const profile = {
      accountId: env.PINGEN_ORGANIZATION_ID,
      environment: "sandbox",
      defaultCountry: env.PINGEN_DEFAULT_COUNTRY,
      addressPosition: input.options.addressPosition,
      version: PINGEN_PREFLIGHT_VERSION,
    };
    const fingerprint = await sha256(
      canonicalJson({
        documentId: input.documentId,
        senderId: input.senderId,
        recipient: input.recipient,
        options: input.options,
        ceilingMinor: input.ceilingMinor,
        profile,
        documentSha256: documentSha,
        senderAddress: "Fixture return address",
      }),
    );
    const record = {
      id: preflightId,
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      document_id: input.documentId,
      document_sha256: documentSha,
      sender_id: input.senderId,
      sender_address: "Fixture return address",
      recipient_json: canonicalJson(input.recipient),
      options_json: canonicalJson(input.options),
      profile_json: canonicalJson(profile),
      expected_address: expectedAddress,
      ceiling_minor: input.ceilingMinor,
      request_hash: fingerprint,
      input_hash: fingerprint,
      idempotency_key: "fixture-preflight-key",
      status: "processing",
      budget_day: created.slice(0, 10),
      processing_until: new Date(Date.now() + 60000).toISOString(),
      expires_at: new Date(Date.now() + 600000).toISOString(),
      created_at: created,
      updated_at: created,
    };
    const report = {
      version: PINGEN_PREFLIGHT_VERSION,
      status: "review_required",
      sha256: documentSha,
      pages: 1,
      canSend: false,
      issues: [],
      requiredReviews: ["printed_recipient_matches"],
      rendering: {
        dpi: 144,
        complete: true,
        pages: [
          { page: 1, width: 1191, height: 1684, rasterSha256: "a".repeat(64) },
        ],
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
      .prepare("INSERT INTO content_limits VALUES(?,10,80000000,10)")
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
        .bind(
          preflightId,
          ctx.organizationId,
          ctx.userId,
          fingerprint,
          created,
        ),
      db
        .prepare(
          "UPDATE postal_preflights SET transfer_status='preparing',transfer_started_at=? WHERE id=?",
        )
        .bind(created, preflightId),
    ]);
  }
  const beforeTransfer = async () => {
    expect(
      await db
        .prepare(
          "SELECT p.id FROM postal_preflights p JOIN memberships m ON m.organization_id=p.organization_id AND m.user_id=? JOIN documents d ON d.organization_id=p.organization_id AND d.id=p.document_id WHERE p.id=? AND p.organization_id=? AND p.transfer_status='preparing' AND d.status='ready' AND d.sha256=p.document_sha256 AND m.role='admin'",
        )
        .bind(ctx.userId, preflightId, ctx.organizationId)
        .first(),
    ).toEqual({ id: preflightId });
  };
  try {
    const result = await preparePostalDraft(env, domain, ctx, input, {
      fetcher,
      beforeTransfer,
    });
    await db
      .prepare(
        "UPDATE postal_preflights SET transfer_status='prepared',provider_draft_id=? WHERE id=? AND transfer_status='preparing'",
      )
      .bind(result.providerDraftId, preflightId)
      .run();
    return result;
  } catch (error) {
    await db
      .prepare(
        "UPDATE postal_preflights SET transfer_status='unknown' WHERE id=? AND transfer_status='preparing'",
      )
      .bind(preflightId)
      .run();
    throw error;
  }
}

describe("Live provider bridge — real D1/R2, intercepted external fetch only", () => {
  it.each([
    { ENVIRONMENT: "local" },
    { MODE: "simulation" },
    { LIVE_SENDS_ENABLED: "false" },
    { LIVE_SENDS_ENABLED: undefined },
  ])(
    "fails the activation gate without external calls: %j",
    async (override) => {
      const row = await queueFixture("fax");
      const fetcher = vi.fn<Fetcher>();
      const result = await createLiveProviderHook(
        { ...env, ...override } as LiveProviderEnv,
        "fax",
        { fetcher },
      ).submit(row);
      expect(result).toEqual({
        status: "rejected",
        errorCode: "LIVE_TRANSPORT_DISABLED",
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("cannot send a queued row directly without the durable active approved attempt", async () => {
    const fetcher = vi.fn<Fetcher>();
    expect(
      await createLiveProviderHook(env, "fax", { fetcher }).submit(
        await queueFixture("fax"),
      ),
    ).toMatchObject({ errorCode: "ACTIVE_APPROVED_ATTEMPT_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("submits Telnyx with the frozen sender and creates a hashed, scoped, expiring media capability", async () => {
    const row = await queueFixture("fax");
    const fetcher = vi.fn<Fetcher>(async () =>
      json({ data: { id: "fax-fixture", status: "queued" } }, 202),
    );
    expect(
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "fax", { fetcher }),
      ),
    ).toMatchObject({ status: "accepted" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      from: "+33100000000",
      to: "+33100000001",
      connection_id: "connection-fixture",
      webhook_url: "https://guteneo.example/webhooks/telnyx",
    });
    const media = new URL(payload.media_url);
    const token = media.pathname.split("/").at(-1)!;
    expect(media.origin).toBe("https://guteneo.example");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const grant = await db
      .prepare("SELECT * FROM document_access_grants")
      .first();
    expect(grant).toMatchObject({
      token_hash: await sha256(token),
      document_id: "doc_fixture",
      dispatch_id: row.id,
      organization_id: ctx.organizationId,
      provider: "telnyx",
      document_sha256: documentSha,
    });
    expect(JSON.stringify(grant)).not.toContain(token);
    const response = await serveProviderMedia(env, new Request(media), token);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
    expect(
      (
        await serveProviderMedia(env, new Request(media), token, {
          now: () => Date.now() + 46 * 60_000,
        })
      ).status,
    ).toBe(404);
    expect(
      (await serveProviderMedia(env, new Request(media), "a".repeat(43)))
        .status,
    ).toBe(404);
    expect(
      (
        await serveProviderMedia(
          env,
          new Request(media, { method: "HEAD" }),
          token,
        )
      ).status,
    ).toBe(404);
    await db
      .prepare("UPDATE dispatches SET status='delivered' WHERE id=?")
      .bind(row.id)
      .run();
    expect(
      (await serveProviderMedia(env, new Request(media), token)).status,
    ).toBe(404);
  });

  it("rejects a quote that expires while creating the media grant, before the supplier call", async () => {
    const row = await queueFixture("fax");
    const fetcher = vi.fn<Fetcher>();
    const initial = Date.now();
    let reads = 0;
    const clock = () => initial + (++reads >= 4 ? 16 * 60_000 : 0);
    expect(
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "fax", { fetcher, now: clock }),
      ),
    ).toMatchObject({ status: "failed" });
    expect(reads).toBeGreaterThanOrEqual(4);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (
        await db
          .prepare(
            "SELECT count(*) AS n FROM document_access_grants WHERE dispatch_id=?",
          )
          .bind(row.id)
          .first()
      )?.n,
    ).toBe(1);
    expect((await domain.getDispatch(ctx, row.id)).attempts[0]).toMatchObject({
      status: "rejected",
      error_code: "LIVE_QUOTE_INVALID",
    });
    expect(
      (
        await db
          .prepare("SELECT status FROM reservations WHERE dispatch_id=?")
          .bind(row.id)
          .first()
      )?.status,
    ).toBe("released");
  });

  it("blocks missing scan evidence and changed R2 content before provider submission", async () => {
    const row = await queueFixture("fax");
    const fetcher = vi.fn<Fetcher>();
    await db
      .prepare("DELETE FROM audit_log WHERE action='document.scan_verified'")
      .run();
    expect(
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "fax", { fetcher }),
      ),
    ).toMatchObject({ status: "failed" });
    expect((await domain.getDispatch(ctx, row.id)).attempts[0]).toMatchObject({
      error_code: "VERIFIED_SCAN_REQUIRED",
    });
    const second = await queueFixture("fax");
    await db
      .prepare(
        "INSERT INTO audit_log VALUES('scan',?,NULL,'document.scan_verified',?,'{}',?)",
      )
      .bind(ctx.organizationId, documentSha, new Date().toISOString())
      .run();
    const altered = pdfBytes.slice();
    altered[20] ^= 1;
    await bucket.put("fixture/exact.pdf", altered);
    await domain.processDispatch(
      second.id,
      createLiveProviderHook(env, "fax", { fetcher }),
    );
    expect(
      (await domain.getDispatch(ctx, second.id)).attempts[0],
    ).toMatchObject({ error_code: "DOCUMENT_INTEGRITY_MISMATCH" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a sender/config mismatch and a forged approval fingerprint without network", async () => {
    const fetcher = vi.fn<Fetcher>();
    const row = await queueFixture("fax");
    await domain.processDispatch(
      row.id,
      createLiveProviderHook({ ...env, TELNYX_FROM: "+49100000000" }, "fax", {
        fetcher,
      }),
    );
    expect((await domain.getDispatch(ctx, row.id)).attempts[0]).toMatchObject({
      error_code: "FAX_SENDER_CONFIG_MISMATCH",
    });
    const other = await queueFixture("fax");
    const live = createLiveProviderHook(env, "fax", { fetcher });
    await domain.processDispatch(other.id, {
      name: live.name,
      liveFaxIdentity: live.liveFaxIdentity,
      submit: (active) =>
        live.submit({
          ...active,
          recipient_json: canonicalJson({ phone: "+49100000001" }),
        }),
    });
    expect((await domain.getDispatch(ctx, other.id)).attempts[0]).toMatchObject(
      { error_code: "ACTIVE_APPROVED_ATTEMPT_REQUIRED" },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("allows only one invocation under concurrent bridge calls and retains unknown outcomes", async () => {
    const row = await queueFixture("fax");
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new Error("lost response");
    });
    const hook = createLiveProviderHook(env, "fax", { fetcher });
    const results: Awaited<ReturnType<ProviderHook["submit"]>>[] = [];
    await domain.processDispatch(row.id, {
      name: hook.name,
      liveFaxIdentity: hook.liveFaxIdentity,
      async submit(active) {
        results.push(
          ...(await Promise.all([hook.submit(active), hook.submit(active)])),
        );
        return results[0];
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      results.every((result) => result.status === "submission_unknown"),
    ).toBe(true);
    expect(
      results.some((result) => result.errorCode === "ATTEMPT_ALREADY_INVOKED"),
    ).toBe(true);
    expect(
      (await db
        .prepare("SELECT status FROM reservations WHERE dispatch_id=?")
        .bind(row.id)
        .first())!.status,
    ).toBe("reserved");
  });

  it.each([
    { AWS_REGION: "eu-west-3" },
    { SES_CONFIGURATION_SET: "another-configuration" },
    { SES_SANDBOX: "false" },
  ])(
    "invalidates an approved SES quote when the sending contract changes: %j",
    async (override) => {
      expect(
        createLiveDeliveryQuoteConfig(env).liveDeliveryIdentity.email,
      ).toEqual({
        accountId: "123456789012",
        routeId: "eu-west-1:fixture:true",
      });
      const row = await queueFixture("email");
      const fetcher = vi.fn<Fetcher>();
      expect(
        await domain.processDispatch(
          row.id,
          createLiveProviderHook({ ...env, ...override }, "email", { fetcher }),
        ),
      ).toMatchObject({ status: "failed" });
      expect(fetcher).not.toHaveBeenCalled();
      expect(
        await db
          .prepare("SELECT error_code FROM attempts WHERE dispatch_id=?")
          .bind(row.id)
          .first(),
      ).toEqual({ error_code: "LIVE_QUOTE_INVALID" });
      expect(
        await db
          .prepare("SELECT status FROM reservations WHERE dispatch_id=?")
          .bind(row.id)
          .first(),
      ).toEqual({ status: "released" });
    },
  );

  it("does not create a SES pricing identity for an unspecified or malformed sandbox mode", () => {
    for (const SES_SANDBOX of [undefined, "", "unknown", "TRUE"])
      expect(
        createLiveDeliveryQuoteConfig({ ...env, SES_SANDBOX })
          .liveDeliveryIdentity.email,
      ).toBeUndefined();
  });

  it("sends SES one frozen recipient and unmodified HTML, text and optional PDF attachment", async () => {
    const row = await queueFixture("email");
    const fetcher = vi.fn<Fetcher>(async () =>
      json({ MessageId: "ses-fixture" }),
    );
    expect(
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "email", { fetcher }),
      ),
    ).toMatchObject({ status: "accepted" });
    const request = fetcher.mock.calls[0][0] as Request;
    const payload = (await request.json()) as {
      FromEmailAddress: string;
      Destination: { ToAddresses: string[] };
      Content: {
        Simple: {
          Body: {
            Html: { Charset: string; Data: string };
            Text: { Charset: string; Data: string };
          };
          Attachments: { RawContent: string }[];
        };
      };
    };
    expect(payload.FromEmailAddress).toBe("sender@example.invalid");
    expect(payload.Destination).toEqual({
      ToAddresses: ["recipient@example.invalid"],
    });
    expect(payload.Content.Simple.Body).toEqual({
      Html: { Charset: "UTF-8", Data: "<p>Approved HTML.</p>" },
      Text: { Charset: "UTF-8", Data: "Approved text." },
    });
    expect(payload.Content.Simple.Attachments).toHaveLength(1);
    expect(
      Uint8Array.from(
        atob(payload.Content.Simple.Attachments[0].RawContent),
        (character) => character.charCodeAt(0),
      ),
    ).toEqual(pdfBytes);
    expect(request.headers.get("Authorization")).toContain("AWS4-HMAC-SHA256");
  });

  it("persists a Pingen non-sending draft and only submits a matching frozen, tenant-bound draft", async () => {
    const fetcher = pingenFixtureFetch();
    const prepared = await prepareFixtureDraft(fetcher);
    expect(prepared).toMatchObject({
      preparedLetterId: "letter-fixture",
      expectedAddress,
      documentSha256: documentSha,
      ceilingMinor: 200,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(
      new Uint8Array(fetcher.mock.calls[2][1]?.body as ArrayBuffer),
    ).toEqual(pdfBytes);
    expect(
      JSON.parse(String(fetcher.mock.calls[3][1]?.body)).data.attributes
        .auto_send,
    ).toBe(false);
    await expect(prepareFixtureDraft(fetcher)).rejects.toMatchObject({
      code: "POSTAL_PREFLIGHT_REQUIRED",
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    const row = await queueFixture("postal", {
      ...postalOptions,
      providerDraftId: prepared.providerDraftId,
      preparedLetterId: prepared.preparedLetterId,
      expectedAddress,
    });
    expect(
      await domain.processDispatch(
        row.id,
        createLiveProviderHook(env, "postal", { fetcher }),
      ),
    ).toMatchObject({ status: "accepted" });
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/file-upload"),
      ),
    ).toHaveLength(1);
    const [, sent] = fetcher.mock.calls[7];
    expect(sent?.method).toBe("PATCH");
    expect(new Headers(sent?.headers).get("Idempotency-Key")).toBe(row.id);
    expect(JSON.parse(String(sent?.body)).data.attributes).toEqual({
      delivery_product: "cheap",
      print_mode: "duplex",
      print_spectrum: "grayscale",
    });
    await expect(
      queueFixture("postal", {
        ...postalOptions,
        providerDraftId: prepared.providerDraftId,
        preparedLetterId: prepared.preparedLetterId,
        expectedAddress,
      }),
    ).rejects.toMatchObject({ code: "POSTAL_DRAFT_APPROVAL_MISMATCH" });
    expect(fetcher).toHaveBeenCalledTimes(8);
  });

  it("rejects a supplied provider ID, changed recipient, options or missing persisted draft during preparation", async () => {
    const draftFetch = pingenFixtureFetch();
    const prepared = await prepareFixtureDraft(draftFetch);
    for (const patch of [
      { providerDraftId: "foreign-draft" },
      { preparedLetterId: "unowned-letter" },
      { expectedAddress: "Other address" },
      { printMode: "simplex" },
    ]) {
      await expect(
        queueFixture("postal", {
          ...postalOptions,
          providerDraftId: prepared.providerDraftId,
          preparedLetterId: prepared.preparedLetterId,
          expectedAddress,
          ...patch,
        }),
      ).rejects.toMatchObject({
        code: patch.printMode
          ? "LIVE_PRICING_REQUIRED"
          : "POSTAL_DRAFT_APPROVAL_MISMATCH",
      });
    }
    await expect(
      queueFixture(
        "postal",
        {
          ...postalOptions,
          providerDraftId: prepared.providerDraftId,
          preparedLetterId: prepared.preparedLetterId,
          expectedAddress,
        },
        { ...postalRecipient, name: "Different recipient" },
      ),
    ).rejects.toMatchObject({ code: "POSTAL_DRAFT_APPROVAL_MISMATCH" });
    expect(
      draftFetch.mock.calls.some(([url]) => String(url).endsWith("/send")),
    ).toBe(false);
  });

  it.each(["price_changed", "policy_revoked"] as const)(
    "rechecks a Pingen quote after asynchronous calculation: %s",
    async (change) => {
      const draftFetch = pingenFixtureFetch();
      const prepared = await prepareFixtureDraft(draftFetch);
      const row = await queueFixture("postal", {
        ...postalOptions,
        providerDraftId: prepared.providerDraftId,
        preparedLetterId: prepared.preparedLetterId,
        expectedAddress,
      });
      const base = pingenFixtureFetch();
      const fetcher = vi.fn<Fetcher>(async (input, init) => {
        if (String(input).endsWith("/price-calculator")) {
          if (change === "policy_revoked")
            await db
              .prepare(
                "UPDATE trusted_delivery_costs SET status='revoked' WHERE id='policy_postal'",
              )
              .run();
          return json({
            data: {
              attributes: {
                currency: "EUR",
                price: change === "price_changed" ? "1.20" : "0.73",
              },
            },
          });
        }
        return base(input, init);
      });
      expect(
        await domain.processDispatch(
          row.id,
          createLiveProviderHook(env, "postal", { fetcher }),
        ),
      ).toMatchObject({ status: "failed" });
      expect(
        fetcher.mock.calls.some(([url]) => String(url).endsWith("/send")),
      ).toBe(false);
      expect((await domain.usage(ctx)).welcomeCredit).toMatchObject({
        reservedMinor: 0,
        spentMinor: 0,
      });
    },
  );

  it("requires a human document-transfer request and never retries an uncertain draft automatically", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new Error("lost draft response");
    });
    await expect(
      preparePostalDraft(env, domain, { ...ctx, actor: "mcp" }, draftInput(), {
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "HUMAN_DOCUMENT_TRANSFER_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(prepareFixtureDraft(fetcher)).rejects.toMatchObject({
      code: "POSTAL_DRAFT_RECONCILIATION_REQUIRED",
    });
    expect(
      (await db.prepare("SELECT status FROM provider_drafts").first())!.status,
    ).toBe("unknown");
    await expect(prepareFixtureDraft(fetcher)).rejects.toMatchObject({
      code: "POSTAL_PREFLIGHT_REQUIRED",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      prepareFixtureDraft(fetcher, { ...draftInput(), ceilingMinor: 201 }),
    ).rejects.toMatchObject({ code: "POSTAL_PREFLIGHT_REQUIRED" });
  });

  it("keeps the production tariff gate closed even when all provider environment values are present", async () => {
    await expect(
      domain.prepareDispatch(
        ctx,
        {
          channel: "fax",
          recipient: { phone: "+33100000001" },
          documentId: "doc_fixture",
        },
        "real-prepare",
      ),
    ).rejects.toMatchObject({ code: "LIVE_PRICING_REQUIRED" });
  });
});
