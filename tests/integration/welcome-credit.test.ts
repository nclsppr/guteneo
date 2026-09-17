import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  DomainService,
  canonicalJson,
  emailRateComponents,
  sha256,
  type ActorContext,
  type Channel,
  type Dispatch,
} from "../../packages/domain/src/index";
import { BillingService, type BillingEnv } from "../../apps/api/src/billing";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";

let mf: Miniflare;
let db: D1Database;
let domain: DomainService;
let owner: ActorContext;
const liveDeliveryIdentity = {
  email: { accountId: "123456789012", routeId: "fixture-region" },
  postal: { accountId: "fixture-pingen", routeId: "fixture-pingen" },
};
const postalPrices = new Map<string, number>();
let now = Date.parse("2026-09-17T12:00:00.000Z");
const stamp = () => new Date(now).toISOString();
async function applySql(target: D1Database, sql: string) {
  let statement = "";
  let trigger = false;
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line}\n`;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      await target.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  expect(statement.trim()).toBe("");
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "welcome-credit-tests",
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB", "LEGACY"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${file}`, import.meta.url),
      "utf8",
    );
    await applySql(db, sql);
  }
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  now = Date.parse("2026-09-17T12:00:00.000Z");
  owner = await tenant();
  domain = new DomainService(db, {
    mode: "production",
    now: () => now,
    liveDeliveryIdentity,
    postalQuote: async (request) => ({
      currency: "EUR",
      supplierMinor: postalPrices.get(
        request.options.providerDraftId as string,
      )!,
      providerDraftId: request.options.providerDraftId as string,
      preparedLetterId: request.options.preparedLetterId as string,
      evidenceSha256: "c".repeat(64),
    }),
  });
});

async function tenant(mode = "production"): Promise<ActorContext> {
  const suffix = crypto.randomUUID();
  const actor: ActorContext = {
    organizationId: `org_${suffix}`,
    userId: `usr_${suffix}`,
    actor: "browser",
    role: "admin",
  };
  await db.batch([
    db
      .prepare("INSERT INTO organizations VALUES(?,'Credit fixture',?,?)")
      .bind(actor.organizationId, mode, stamp()),
    db
      .prepare(
        "INSERT INTO users VALUES(?,'Fixture','fixture@example.invalid',?)",
      )
      .bind(actor.userId, stamp()),
    db
      .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
      .bind(actor.organizationId, actor.userId, stamp()),
    ...(["email", "postal", "fax"] as const).flatMap((channel) => [
      db
        .prepare(
          "INSERT INTO senders VALUES(?,?,?,'Fixture','Fixture sender','verified',?,?)",
        )
        .bind(
          `${actor.organizationId}_${channel}`,
          actor.organizationId,
          channel,
          mode,
          stamp(),
        ),
      db
        .prepare("INSERT INTO channel_controls VALUES(?,?,1)")
        .bind(actor.organizationId, channel),
      db
        .prepare(
          "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,?,?,10000,5000,'EUR')",
        )
        .bind(actor.organizationId, channel, stamp().slice(0, 7)),
    ]),
  ]);
  return actor;
}

// Isolated qualified-price fixtures exercise the same live guards as production.
// No provider or real tariff is installed, and no external request is made.
async function approved(
  charge = 1000,
  ceiling = charge,
  channel: Channel = "email",
  actor = owner,
) {
  if (channel === "fax") throw Error("Use fax-specific quote fixtures");
  const key = crypto.randomUUID(),
    stampNow = stamp();
  const print = {
    addressPosition: "left",
    deliveryProduct: "cheap",
    printMode: "duplex",
    printSpectrum: "grayscale",
  };
  const options = channel === "email" ? { fixture: key } : print;
  const rate = {
    usdMicrosPerMessage: charge * 5000,
    usdMicrosPerGb: 0,
    bytesPerGb: 1000000000,
    eurPerUsdNumerator: 1,
    eurPerUsdDenominator: 1,
    attachmentBasis: "raw_pdf_bytes" as const,
  };
  const components = emailRateComponents(rate);
  const policyId =
    channel === "email" ? key : actor.organizationId + "_postal_policy";
  await db
    .prepare(
      "INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'EUR','qualified_final_variable_cost',900,'ISOLATED CREDIT FIXTURE',?,?,?,'qualified',?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(
      policyId,
      actor.organizationId,
      `${actor.organizationId}_${channel}`,
      channel,
      channel === "email" ? "ses" : "pingen",
      liveDeliveryIdentity[channel].accountId,
      liveDeliveryIdentity[channel].routeId,
      canonicalJson(options),
      canonicalJson(rate),
      components.base_numerator,
      components.byte_numerator,
      components.rate_denominator,
      "b".repeat(64),
      stampNow,
      new Date(now + 3600000).toISOString(),
      stampNow,
    )
    .run();
  let input;
  if (channel === "email")
    input = {
      channel,
      recipient: { email: "fixture@example.invalid" },
      subject: "Fixture",
      html: "<p>Fixture</p>",
      text: "Fixture",
      ceilingMinor: ceiling,
      options,
    };
  else {
    const documentId = actor.organizationId + "_doc";
    if (
      !(await db
        .prepare("SELECT 1 FROM documents WHERE organization_id=? AND id=?")
        .bind(actor.organizationId, documentId)
        .first())
    )
      await domain.registerDocument(actor, {
        id: documentId,
        name: "fixture.pdf",
        sha256: "a".repeat(64),
        size: 100,
        pages: 1,
        status: "ready",
        source: "import",
        storageKey: "fixture/" + actor.organizationId,
        scanVerified: true,
      });
    const recipient = {
        name: "Fixture",
        line1: "Fixture",
        postalCode: "75001",
        city: "Paris",
        country: "FR",
      },
      expectedAddress = "Fixture\nFixture\n75001 Paris";
    await db
      .prepare(
        "INSERT INTO provider_drafts(id,organization_id,document_id,document_sha256,sender_id,sender_address,provider,provider_id,recipient_json,expected_address,options_json,ceiling_minor,currency,status,request_hash,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,'Fixture sender','pingen',?,?,?,?,?,'EUR','prepared',?,?,?,?)",
      )
      .bind(
        key,
        actor.organizationId,
        documentId,
        "a".repeat(64),
        `${actor.organizationId}_postal`,
        key,
        canonicalJson(recipient),
        expectedAddress,
        canonicalJson(print),
        ceiling,
        "d".repeat(64),
        key,
        stampNow,
        stampNow,
      )
      .run();
    // Synthetic renderer evidence and browser consent, only for these isolated
    // credit scenarios. Exercise migration 0020's guards without a provider call.
    const preflightId = `pp_${key}`;
    const fingerprint = await sha256(
      canonicalJson({ documentId, recipient, print, ceiling, draft: key }),
    );
    const record = {
      id: preflightId,
      organization_id: actor.organizationId,
      user_id: actor.userId,
      document_id: documentId,
      document_sha256: "a".repeat(64),
      sender_id: `${actor.organizationId}_postal`,
      sender_address: "Fixture sender",
      recipient_json: canonicalJson(recipient),
      options_json: canonicalJson(print),
      profile_json: canonicalJson({
        accountId: liveDeliveryIdentity.postal.accountId,
        environment: "sandbox",
        defaultCountry: "FR",
        addressPosition: "left",
        version: PINGEN_PREFLIGHT_VERSION,
      }),
      expected_address: expectedAddress,
      ceiling_minor: ceiling,
      request_hash: fingerprint,
      input_hash: fingerprint,
      idempotency_key: preflightId,
      status: "processing",
      budget_day: stampNow.slice(0, 10),
      processing_until: new Date(now + 60_000).toISOString(),
      expires_at: new Date(now + 3_600_000).toISOString(),
      created_at: stampNow,
      updated_at: stampNow,
    };
    const report = {
      version: PINGEN_PREFLIGHT_VERSION,
      status: "review_required",
      sha256: "a".repeat(64),
      pages: 1,
      canSend: false,
      issues: [],
      requiredReviews: ["printed_recipient_matches"],
      rendering: {
        complete: true,
        dpi: 144,
        pages: [
          {
            page: 1,
            width: 1191,
            height: 1684,
            rasterSha256: "b".repeat(64),
          },
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
      .prepare(
        "INSERT INTO content_limits VALUES(?,10,80000000,10) ON CONFLICT(organization_id) DO NOTHING",
      )
      .bind(actor.organizationId)
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
          "UPDATE postal_preflights SET status='review_required',report_json=? WHERE organization_id=? AND id=?",
        )
        .bind(canonicalJson(report), actor.organizationId, preflightId),
      db
        .prepare("INSERT INTO postal_transfer_consents VALUES(?,?,?,?,1,1,?)")
        .bind(
          preflightId,
          actor.organizationId,
          actor.userId,
          fingerprint,
          stampNow,
        ),
      db
        .prepare(
          "UPDATE postal_preflights SET transfer_status='preparing',transfer_started_at=? WHERE organization_id=? AND id=?",
        )
        .bind(stampNow, actor.organizationId, preflightId),
      db
        .prepare(
          "UPDATE postal_preflights SET transfer_status='prepared',provider_draft_id=? WHERE organization_id=? AND id=?",
        )
        .bind(key, actor.organizationId, preflightId),
    ]);
    postalPrices.set(key, charge / 2);
    input = {
      channel,
      recipient,
      documentId,
      ceilingMinor: ceiling,
      options: {
        ...print,
        providerDraftId: key,
        preparedLetterId: key,
        expectedAddress,
      },
    };
  }
  const row = await domain.prepareDispatch(actor, input, key);
  await domain.approveDispatch(actor, row.id, row.fingerprint, {
    recipientRequested: true,
  });
  return row.id;
}
async function queue(
  charge = 1000,
  ceiling = charge,
  channel: Channel = "email",
  actor = owner,
) {
  const id = await approved(charge, ceiling, channel, actor);
  await domain.confirmDispatch(actor, id, id);
  return id;
}
async function balance(actor = owner) {
  return (await domain.usage(actor)).welcomeCredit;
}
async function count(table: string, actor = owner) {
  return (await db
    .prepare(`SELECT count(*) n FROM ${table} WHERE organization_id=?`)
    .bind(actor.organizationId)
    .first<{ n: number }>())!.n;
}
async function accept(id: string) {
  await domain.processDispatch(id, {
    name: "ses",
    liveDeliveryIdentity,
    submit: async () => ({ status: "accepted", providerId: `provider_${id}` }),
  });
}

describe("one shared lifetime promotional credit", () => {
  it("upgrades existing untouched onboarding zeros without enabling channels or lifting operator stops", async () => {
    const legacy = (await mf.getD1Database("LEGACY")) as unknown as D1Database;
    const directory = new URL("../../migrations/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((file) => file.endsWith(".sql") && file < "0014")
      .sort())
      await applySql(legacy, await readFile(new URL(file, directory), "utf8"));
    await legacy
      .prepare(
        "INSERT INTO organizations VALUES('legacy','Legacy','production',?)",
      )
      .bind(stamp())
      .run();
    for (const [channel, enabled, count, amount] of [
      ["fax", 0, 0, 0],
      ["email", 1, 0, 0],
      ["postal", 0, 5, 123],
    ] as const) {
      await legacy
        .prepare("INSERT INTO channel_controls VALUES('legacy',?,?)")
        .bind(channel, enabled)
        .run();
      await legacy
        .prepare(
          "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES('legacy',?,'2026-09',?,?,'EUR')",
        )
        .bind(channel, count, amount)
        .run();
    }
    await applySql(
      legacy,
      await readFile(new URL("0014_welcome_credit.sql", directory), "utf8"),
    );
    expect(
      await legacy
        .prepare(
          "SELECT amount_minor FROM welcome_credit_grants WHERE organization_id='legacy'",
        )
        .first(),
    ).toEqual({ amount_minor: 5000 });
    expect(
      (
        await legacy
          .prepare(
            "SELECT channel,limit_count,limit_minor FROM usage ORDER BY channel",
          )
          .all()
      ).results,
    ).toEqual([
      { channel: "email", limit_count: 0, limit_minor: 0 },
      { channel: "fax", limit_count: 10000, limit_minor: 5000 },
      { channel: "postal", limit_count: 5, limit_minor: 123 },
    ]);
    expect(
      (
        await legacy
          .prepare(
            "SELECT channel,enabled FROM channel_controls ORDER BY channel",
          )
          .all()
      ).results,
    ).toEqual([
      { channel: "email", enabled: 1 },
      { channel: "fax", enabled: 0 },
      { channel: "postal", enabled: 0 },
    ]);
    expect(
      (await legacy.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
  it("grants exactly EUR50 atomically with a production organization, and repeats never refill it", async () => {
    expect(await balance()).toMatchObject({
      grantedMinor: 5000,
      reservedMinor: 0,
      spentMinor: 0,
      availableMinor: 5000,
      currency: "EUR",
      renewal: "none",
      topUpAvailable: false,
    });
    const id = await queue(5000);
    await accept(id);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        db
          .prepare(
            "INSERT INTO welcome_credit_grants(organization_id,created_at) VALUES(?,?) ON CONFLICT(organization_id) DO NOTHING",
          )
          .bind(owner.organizationId, stamp())
          .run(),
      ),
    );
    await db
      .prepare(
        "INSERT OR REPLACE INTO welcome_credit_grants(organization_id,created_at) VALUES(?,?)",
      )
      .bind(owner.organizationId, stamp())
      .run();
    expect(await count("welcome_credit_grants")).toBe(1);
    expect(await balance()).toMatchObject({
      grantedMinor: 5000,
      spentMinor: 5000,
      availableMinor: 0,
      status: "exhausted",
    });
    await expect(
      db
        .prepare(
          "UPDATE welcome_credit_grants SET amount_minor=5000 WHERE organization_id=?",
        )
        .bind(owner.organizationId)
        .run(),
    ).rejects.toThrow("immutable_welcome_credit");
    await expect(
      db
        .prepare("DELETE FROM welcome_credit_grants WHERE organization_id=?")
        .bind(owner.organizationId)
        .run(),
    ).rejects.toThrow("immutable_welcome_credit");
    const zeroCost = await approved(0);
    await expect(
      domain.confirmDispatch(owner, zeroCost, zeroCost),
    ).rejects.toMatchObject({ code: "CREDIT_EXHAUSTED" });
  });
  it("rolls back an unsuccessful signup together with its welcome grant", async () => {
    const id = `org_rollback_${crypto.randomUUID()}`;
    await expect(
      db.batch([
        db
          .prepare(
            "INSERT INTO organizations VALUES(?,'Rollback','production',?)",
          )
          .bind(id, stamp()),
        db
          .prepare("INSERT INTO memberships VALUES(?,'missing-user','admin',?)")
          .bind(id, stamp()),
      ]),
    ).rejects.toThrow();
    expect(
      await db
        .prepare("SELECT * FROM welcome_credit_grants WHERE organization_id=?")
        .bind(id)
        .first(),
    ).toBeNull();
  });
  it("does not mint real credit for a simulation tenant", async () => {
    const actor = await tenant("simulation");
    const simulation = new DomainService(db, { mode: "simulation" });
    expect((await simulation.usage(actor)).welcomeCredit).toMatchObject({
      kind: "simulation",
      status: "simulation",
      grantedMinor: 0,
      availableMinor: 0,
    });
    await expect(
      db
        .prepare(
          "INSERT INTO welcome_credit_grants(organization_id,created_at) VALUES(?,?)",
        )
        .bind(actor.organizationId, stamp())
        .run(),
    ).rejects.toThrow("credit_production_only");
  });
  it("reserves once under concurrent confirmations and binds credit to the tenant", async () => {
    const id = await approved(2000, 3000);
    await Promise.all([
      domain.confirmDispatch(owner, id, "first"),
      domain.confirmDispatch(owner, id, "second"),
      domain.confirmDispatch(owner, id, "first"),
    ]);
    expect(await count("welcome_credit_reservations")).toBe(1);
    expect(await count("welcome_credit_entries")).toBe(1);
    expect(await count("outbox")).toBe(1);
    expect(await balance()).toMatchObject({
      reservedMinor: 3000,
      availableMinor: 2000,
    });
    const stranger = await tenant();
    await expect(
      domain.confirmDispatch(stranger, id, "foreign"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      domain.usage({ ...stranger, organizationId: owner.organizationId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await balance(stranger)).toMatchObject({
      availableMinor: 5000,
      reservedMinor: 0,
    });
  });
  it("competes across channels for one balance and rolls back losing quota, key and outbox writes", async () => {
    const a = await approved(3000, 3000, "email");
    const b = await approved(3000, 3000, "postal");
    const results = await Promise.allSettled([
      domain.confirmDispatch(owner, a, a),
      domain.confirmDispatch(owner, b, b),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CREDIT_EXHAUSTED" },
    });
    for (const table of [
      "welcome_credit_reservations",
      "welcome_credit_entries",
      "reservations",
      "outbox",
      "idempotency_keys",
    ])
      expect(await count(table)).toBe(1);
    const usage = (await domain.usage(owner)).items;
    expect(
      usage.reduce((sum, row) => sum + Number(row.reserved_minor), 0),
    ).toBe(3000);
    expect(await balance()).toMatchObject({
      availableMinor: 2000,
      reservedMinor: 3000,
    });
  });
  it("settles the immutable customer quote once, releases the unused ceiling and ignores callback cost claims", async () => {
    const id = await queue(1200, 3000);
    await accept(id);
    expect(await balance()).toMatchObject({
      availableMinor: 3800,
      reservedMinor: 0,
      spentMinor: 1200,
    });
    const event = {
      provider: "ses",
      providerId: `provider_${id}`,
      eventId: `settled_${id}`,
      kind: "delivered" as const,
      occurredAt: stamp(),
      payload: { amountMinor: 1, refund: 999999 },
    };
    await domain.ingestEvent(event);
    await domain.ingestEvent(event);
    await domain.ingestEvent({
      ...event,
      eventId: `failed_${id}`,
      kind: "failed",
    });
    expect(await balance()).toMatchObject({
      availableMinor: 3800,
      reservedMinor: 0,
      spentMinor: 1200,
    });
    expect(await count("welcome_credit_entries")).toBe(2);
  });
  it("releases only a pending reservation on cancellation or definitive rejection", async () => {
    const cancelled = await queue(500, 1000);
    await Promise.all([
      domain.cancelDispatch(owner, cancelled),
      domain.cancelDispatch(owner, cancelled),
    ]);
    const rejected = await queue(1000, 1500);
    await domain.processDispatch(rejected, {
      name: "ses",
      liveDeliveryIdentity,
      submit: async () => ({ status: "rejected" }),
    });
    expect(await balance()).toMatchObject({
      availableMinor: 5000,
      reservedMinor: 0,
      spentMinor: 0,
    });
    expect(await count("welcome_credit_entries")).toBe(4);
  });
  it.each(["unknown", "early"] as const)(
    "retains the full ceiling for a %s provider failure without established cost",
    async (timing) => {
      const id = await queue(1000, 5000);
      const failed = {
        provider: "ses",
        dispatchId: id,
        providerId: `provider_${id}`,
        eventId: `failed_${id}`,
        kind: "failed" as const,
        occurredAt: stamp(),
        payload: { amountMinor: 0, reason: "partial transmission" },
      };
      await domain.processDispatch(id, {
        name: "ses",
        liveDeliveryIdentity,
        submit: async () => {
          if (timing === "early") await domain.ingestEvent(failed);
          return { status: "submission_unknown" };
        },
      });
      await domain.ingestEvent(failed);
      expect((await domain.getDispatch(owner, id)).dispatch.status).toBe(
        "failed",
      );
      expect(await balance()).toMatchObject({
        availableMinor: 0,
        reservedMinor: 5000,
        spentMinor: 0,
      });
      await expect(
        db
          .prepare(
            "UPDATE welcome_credit_reservations SET status='released' WHERE organization_id=? AND dispatch_id=?",
          )
          .bind(owner.organizationId, id)
          .run(),
      ).rejects.toThrow("credit_settlement_invalid");
      expect(await count("welcome_credit_entries")).toBe(1);
      const next = await approved(2, 2, "postal");
      await expect(
        domain.confirmDispatch(owner, next, next),
      ).rejects.toMatchObject({ code: "CREDIT_EXHAUSTED" });
    },
  );
  it("retains the confirmed customer charge when an accepted provider operation later fails", async () => {
    const id = await queue(1000, 5000);
    await accept(id);
    await domain.ingestEvent({
      provider: "ses",
      providerId: `provider_${id}`,
      eventId: `accepted_then_failed_${id}`,
      kind: "failed",
      occurredAt: stamp(),
    });
    expect((await domain.getDispatch(owner, id)).dispatch.status).toBe(
      "failed",
    );
    expect(await balance()).toMatchObject({
      availableMinor: 4000,
      reservedMinor: 0,
      spentMinor: 1000,
    });
  });
  it.each(["submit_response", "late_webhook"] as const)(
    "settles a positive %s after failure without regressing the displayed status",
    async (evidence) => {
      const id = await queue(1000, 5000);
      await domain.processDispatch(id, {
        name: "ses",
        liveDeliveryIdentity,
        submit: async () => {
          await domain.ingestEvent({
            provider: "ses",
            providerId: `provider_${id}`,
            dispatchId: id,
            eventId: `failure_first_${id}`,
            kind: "failed",
            occurredAt: stamp(),
          });
          expect(await balance()).toMatchObject({
            reservedMinor: 5000,
            spentMinor: 0,
          });
          return {
            status:
              evidence === "submit_response"
                ? "accepted"
                : "submission_unknown",
            providerId: `provider_${id}`,
          };
        },
      });
      if (evidence === "late_webhook") {
        const event = {
          provider: "ses",
          providerId: `provider_${id}`,
          eventId: `acceptance_later_${id}`,
          kind: "accepted" as const,
          occurredAt: stamp(),
        };
        await domain.ingestEvent(event);
        await domain.ingestEvent(event);
      }
      expect((await domain.getDispatch(owner, id)).dispatch.status).toBe(
        "failed",
      );
      expect(await balance()).toMatchObject({
        availableMinor: 4000,
        reservedMinor: 0,
        spentMinor: 1000,
      });
      expect(await count("welcome_credit_entries")).toBe(2);
    },
  );
  it("holds an unknown outcome across timeout and month rollover without a blind retry", async () => {
    const id = await queue(1000, 5000);
    let calls = 0;
    const provider = {
      name: "ses",
      liveDeliveryIdentity,
      submit: async (_dispatch: Dispatch): Promise<never> => {
        calls++;
        throw new Error("unknown outcome");
      },
    };
    await domain.processDispatch(id, provider);
    await domain.processDispatch(id, provider);
    now = Date.parse("2026-10-17T12:00:00.000Z");
    await domain.reconcileExpiredLeases();
    expect(calls).toBe(1);
    expect(await balance()).toMatchObject({
      availableMinor: 0,
      reservedMinor: 5000,
      spentMinor: 0,
    });
    await expect(domain.cancelDispatch(owner, id)).rejects.toMatchObject({
      code: "CANCELLATION_TOO_LATE",
    });
    const next = await approved(2, 2, "postal");
    await expect(
      domain.confirmDispatch(owner, next, next),
    ).rejects.toMatchObject({ code: "CREDIT_EXHAUSTED" });
    expect(
      await db
        .prepare(
          "SELECT 1 FROM usage WHERE organization_id=? AND period='2026-10'",
        )
        .bind(owner.organizationId)
        .first(),
    ).toBeNull();
    await domain.ingestEvent({
      provider: "ses",
      dispatchId: id,
      providerId: `provider_${id}`,
      eventId: `resolved_${id}`,
      kind: "delivered",
      occurredAt: stamp(),
    });
    expect(await balance()).toMatchObject({
      availableMinor: 4000,
      reservedMinor: 0,
      spentMinor: 1000,
    });
  });
  it("carries monthly safety caps forward while retaining lifetime spend and honoring an operator zero", async () => {
    await accept(await queue(2500));
    now = Date.parse("2026-10-17T12:00:00.000Z");
    const next = await queue(2500);
    await accept(next);
    expect(await balance()).toMatchObject({
      grantedMinor: 5000,
      spentMinor: 5000,
      availableMinor: 0,
    });
    expect(
      await db
        .prepare(
          "SELECT limit_minor FROM usage WHERE organization_id=? AND channel='email' AND period='2026-10'",
        )
        .bind(owner.organizationId)
        .first(),
    ).toEqual({ limit_minor: 5000 });
    const fresh = await tenant();
    await db
      .prepare(
        "UPDATE usage SET limit_minor=0 WHERE organization_id=? AND channel='postal'",
      )
      .bind(fresh.organizationId)
      .run();
    now = Date.parse("2026-11-17T12:00:00.000Z");
    const stopped = await approved(2, 2, "postal", fresh);
    await expect(
      domain.confirmDispatch(fresh, stopped, stopped),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(await balance(fresh)).toMatchObject({ availableMinor: 5000 });
  });
  it("keeps approvals and channel emergency stops independent from credit", async () => {
    const id = await approved(100);
    await db
      .prepare(
        "DELETE FROM approvals WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(owner.organizationId, id)
      .run();
    await expect(domain.confirmDispatch(owner, id, id)).rejects.toMatchObject({
      code: "RECIPIENT_REQUEST_REQUIRED",
    });
    await domain.approveDispatch(
      owner,
      id,
      (await domain.getDispatch(owner, id)).dispatch.fingerprint,
      { recipientRequested: true },
    );
    await db
      .prepare(
        "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='email'",
      )
      .bind(owner.organizationId)
      .run();
    await expect(domain.confirmDispatch(owner, id, id)).rejects.toMatchObject({
      code: "CHANNEL_DISABLED",
    });
    expect(await balance()).toMatchObject({
      availableMinor: 5000,
      reservedMinor: 0,
    });
  });
  it("retains immutable financial history even when historical dispatch metadata is deleted", async () => {
    const id = await queue(1000);
    await accept(id);
    await expect(
      db
        .prepare("DELETE FROM welcome_credit_entries WHERE organization_id=?")
        .bind(owner.organizationId)
        .run(),
    ).rejects.toThrow("immutable_credit_entry");
    await expect(
      db
        .prepare(
          "UPDATE welcome_credit_reservations SET status='released' WHERE organization_id=? AND dispatch_id=?",
        )
        .bind(owner.organizationId, id)
        .run(),
    ).rejects.toThrow();
    await db.batch([
      db.prepare("DELETE FROM provider_events WHERE dispatch_id=?").bind(id),
      db.prepare("DELETE FROM attempts WHERE dispatch_id=?").bind(id),
      db.prepare("DELETE FROM outbox WHERE dispatch_id=?").bind(id),
      db.prepare("DELETE FROM reservations WHERE dispatch_id=?").bind(id),
      db.prepare("DELETE FROM approvals WHERE dispatch_id=?").bind(id),
      db.prepare("DELETE FROM dispatches WHERE id=?").bind(id),
    ]);
    expect(await balance()).toMatchObject({
      spentMinor: 1000,
      availableMinor: 4000,
    });
  });
  it("returns the actual promotional balance without Stripe and denies a forged admin or assistant", async () => {
    await queue(200, 500);
    const env: BillingEnv = {
      DB: db,
      ENVIRONMENT: "production",
      MODE: "production",
      APP_ORIGIN: "https://guteneo.example",
    };
    const billing = new BillingService(env);
    expect(await billing.overview(owner)).toMatchObject({
      status: "configuration_required",
      topUpAvailable: false,
      welcomeCredit: {
        kind: "promotional",
        grantedMinor: 5000,
        reservedMinor: 500,
        availableMinor: 4500,
        topUpAvailable: false,
      },
    });
    const stranger = await tenant();
    await expect(
      billing.overview({ ...stranger, organizationId: owner.organizationId }),
    ).rejects.toMatchObject({ code: "BILLING_ADMIN_REQUIRED" });
    await expect(
      billing.overview({ ...owner, actor: "mcp" }),
    ).rejects.toMatchObject({ code: "BILLING_ADMIN_REQUIRED" });
  });
});
