import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { DomainService } from "../../packages/domain/src/index";

const moduleUrl = new URL(
  "../../scripts/qualify-review-fax.mjs",
  import.meta.url,
).href;
const {
  SOURCES,
  COMMERCIAL_BASIS,
  sha256,
  planDigest,
  validateConfig,
  fetchEvidence,
  parseRateDeck,
  parsePagePrice,
  parseFx,
  validateOwnership,
  buildPlan,
  inspectTarget,
  inspectLegacy,
  legacyTariffDigest,
  applyPlan,
} = await import(moduleUrl);
const now = "2026-09-25T12:00:00.000Z";
const deckUrl =
  "https://portal.telnyx.com/downloads/global_conversational/example.csv";
const header =
  "ISO,Country,Origination Prefixes,Destination Prefixes,Description,Interval 1,Interval N,Rate,Price Per Call,Exact Match";
const row = (prefix = "35220", rate = "0.044", call = "", exact = "") =>
  `LU,Luxembourg,local,${prefix},Trunking Outbound Minute - Luxembourg - NGN Service 1 - Local,60,60,${rate},${call},${exact}`;
const config = () => ({
  version: 1,
  organizationId: `review_${crypto.randomUUID()}`,
  senderId: `sender_${crypto.randomUUID()}`,
  reviewerUserId: `user_${crypto.randomUUID()}`,
  reviewerEmail: "reviewer@example.invalid",
  recipientPhone: "+35220000000", // Fictional local fixture; never sent.
  accountId: `telnyx-key-sha256:${"a".repeat(64)}`,
  connectionId: "123456",
  outboundProfileId: "654321",
  authority: {
    id: `authority_${crypto.randomUUID()}`,
    validFrom: "2026-09-21T12:00:00.000Z",
    expiresAt: "2026-10-21T12:00:00.000Z",
    reference: "ISOLATED TEST AUTHORITY",
    sourceSha256: "b".repeat(64),
  },
  rateDeckAssociation: {
    url: deckUrl,
    observedAt: now,
    profileId: "654321",
    reference: "ISOLATED TEST PROFILE EVIDENCE",
    sourceSha256: "c".repeat(64),
  },
  commercialBasis: COMMERCIAL_BASIS,
  callFeeBasis:
    "no_additional_reference_component_blank_is_not_zero_supplier_cost",
});
type Config = ReturnType<typeof config>;
const inspection = (c: Config) => ({
  provider: "telnyx",
  mode: "read_only",
  status: "ok",
  errors: [],
  accountReference: c.accountId,
  application: {
    id: c.connectionId,
    active: true,
    outboundVoiceProfileId: c.outboundProfileId,
  },
  outboundProfile: {
    id: c.outboundProfileId,
    enabled: true,
    whitelistedDestinations: ["LU"],
  },
  numberPagination: { complete: true },
  numbers: [
    {
      phoneNumber: c.recipientPhone,
      country: "LU",
      status: "active",
      features: { t38FaxGatewayEnabled: true },
    },
  ],
});
const source = (url: string, body: string) => {
  const bytes = Buffer.from(body);
  return {
    bytes,
    evidence: {
      url,
      bytes: bytes.length,
      sha256: sha256(bytes),
      contentType: "fixture",
      lastModified: null,
    },
  };
};
const evidence = (c: Config) => ({
  page: source(
    SOURCES.page,
    "<table><tr><td>Send a fax via API</td><td>$0.007 per page + <a>SIP Trunking</a> usage for transmission</td></tr></table>",
  ),
  deck: source(deckUrl, `${header}\n${row()}\n`),
  fx: source(
    SOURCES.fx,
    '<gesmes:Envelope><Cube><Cube time="2026-09-25"><Cube currency="USD" rate="1.1460"/></Cube></Cube></gesmes:Envelope>',
  ),
  inspection: inspection(c),
});

describe("private review fax qualification: bounded real-source transport", () => {
  it("allows only fixed official origins, without credentials or redirects", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("evidence", { headers: { "content-type": "text/plain" } }),
    );
    const result = await fetchEvidence(SOURCES.page, 100, fetcher);
    expect(result.evidence.sha256).toBe(sha256("evidence"));
    expect(fetcher).toHaveBeenCalledWith(
      SOURCES.page,
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
      }),
    );
    for (const url of [
      "http://telnyx.com/pricing/fax",
      "https://evil.invalid/fax",
      `${SOURCES.page}?token=x`,
      "https://portal.telnyx.com/downloads/global_conversational/../secret.csv",
    ])
      await expect(fetchEvidence(url, 100, fetcher)).rejects.toThrow(
        "REVIEW_SOURCE_FORBIDDEN",
      );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects HTTP/redirects and both declared and streamed oversized bodies", async () => {
    for (const response of [
      new Response("", { status: 302 }),
      new Response("", { status: 404 }),
      new Response("abc", { headers: { "content-length": "101" } }),
      new Response("x".repeat(101)),
    ])
      await expect(
        fetchEvidence(SOURCES.page, 100, async () => response),
      ).rejects.toThrow(/^REVIEW_SOURCE_(HTTP|TOO_LARGE)$/);
  });
  it("binds absolute thirty-day authority and actual profile observation age", () => {
    const c = config();
    expect(validateConfig(c, now)).toEqual(c);
    for (const patch of [
      { authority: { ...c.authority, expiresAt: "2026-10-21T12:00:00.001Z" } },
      { authority: { ...c.authority, validFrom: "2026-09-26T12:00:00.000Z" } },
      {
        rateDeckAssociation: {
          ...c.rateDeckAssociation,
          observedAt: "2026-09-18T11:59:59.999Z",
        },
      },
      {
        rateDeckAssociation: {
          ...c.rateDeckAssociation,
          observedAt: "2026-09-25T12:00:00.001Z",
        },
      },
      { rateDeckAssociation: { ...c.rateDeckAssociation, profileId: "999" } },
    ])
      expect(() => validateConfig({ ...c, ...patch }, now)).toThrow(
        "REVIEW_AUTHORITY_INVALID",
      );
    expect(() => validateConfig({ ...c, executionScope: "live" }, now)).toThrow(
      "REVIEW_CONFIG_INVALID",
    );
  });
});

describe("price provenance and non-floating arithmetic", () => {
  it("uses the longest exact local prefix and refuses ambiguous or changed fee semantics", () => {
    const deck = (lines: string[]) =>
      Buffer.from([header, ...lines].join("\n"));
    expect(
      parseRateDeck(deck([row("352", "0.001"), row()]), "+35220000000"),
    ).toMatchObject({
      prefix: "+35220",
      minuteNanoUsd: 44_000_000,
      callNanoUsd: 0,
    });
    for (const rows of [
      [row(), row()],
      [row("35220", "0.044", "0.01")],
      [row("35220", "0.044", "", "yes")],
      [row("35220", "NaN")],
      [row("3524")],
    ])
      expect(() => parseRateDeck(deck(rows), "+35220000000")).toThrow(
        /^REVIEW_/,
      );
    expect(() =>
      parseRateDeck(Buffer.from("Unexpected,columns\n1,2"), "+35220000000"),
    ).toThrow("REVIEW_DECK_INVALID");
  });
  it("does not mistake commented or scripted historical prices for current page evidence", () => {
    const html = evidence(config()).page.bytes.toString();
    expect(parsePagePrice(Buffer.from(html))).toBe(7_000_000);
    expect(() =>
      parsePagePrice(Buffer.from(`<!--${html}--><script>${html}</script>`)),
    ).toThrow("REVIEW_PAGE_PRICE_UNRECOGNIZED");
    expect(() =>
      parsePagePrice(Buffer.from(html.replace("+", "including"))),
    ).toThrow("REVIEW_PAGE_PRICE_UNRECOGNIZED");
  });
  it("inverts USD-per-EUR exactly and rejects stale/future/ambiguous/entity XML", () => {
    const xml = evidence(config()).fx.bytes;
    expect(parseFx(xml, now)).toMatchObject({
      numerator: 500,
      denominator: 573,
      date: "2026-09-25",
    });
    for (const body of [
      xml.toString().replace("2026-09-25", "2026-09-17"),
      xml.toString().replace("2026-09-25", "2026-09-26"),
      xml.toString() + xml.toString(),
      '<!DOCTYPE x [<!ENTITY bad SYSTEM "file:///x">]>' + xml.toString(),
      xml.toString().replace("1.1460", "0.0000"),
    ])
      expect(() => parseFx(Buffer.from(body), now)).toThrow(/^REVIEW_FX_/);
  });
  it("requires the exact active owned number, application and profile", () => {
    const c = config(),
      current = inspection(c);
    expect(() => validateOwnership(c, current)).not.toThrow();
    for (const patch of [
      { accountReference: "other" },
      { status: "partial" },
      { numberPagination: { complete: false } },
      { numbers: [{ ...current.numbers[0], phoneNumber: "+35220000001" }] },
      {
        application: { ...current.application, outboundVoiceProfileId: "999" },
      },
    ])
      expect(() => validateOwnership(c, { ...current, ...patch })).toThrow(
        "REVIEW_PROVIDER_OWNERSHIP_INVALID",
      );
  });
  it("accepts only the documented spend-limit diagnostic without qualifying spending or sending", () => {
    const c = config(),
      partial = {
        ...inspection(c),
        status: "partial",
        errors: [
          {
            stage: "outbound_profile",
            code: "invalid_response",
            invalidFields: ["daily_spend_limit"],
          },
        ],
      };
    expect(() => validateOwnership(c, partial)).not.toThrow();
    for (const patch of [
      { errors: [] },
      { errors: [...partial.errors, ...partial.errors] },
      { errors: [{ ...partial.errors[0], invalidFields: ["enabled"] }] },
      { errors: [{ ...partial.errors[0], stage: "numbers" }] },
      { numbers: [] },
    ])
      expect(() => validateOwnership(c, { ...partial, ...patch })).toThrow(
        "REVIEW_PROVIDER_OWNERSHIP_INVALID",
      );
  });
  it("freezes independent periods, exact bytes, seven-page ceiling and non-sending scope", () => {
    const c = config(),
      proof = evidence(c);
    const plan = buildPlan(
      c,
      proof,
      { authority: null, priorTariffId: null },
      now,
    );
    expect(plan.tariff).toMatchObject({
      execution_scope: "review_prepare_only",
      route_qualification: "operator_test",
      local_calling_verified: 0,
      max_pages: 7,
      quote_ttl_seconds: 900,
      operator_test_ceiling_minor: 200,
      expires_at: "2026-10-02T12:00:00.000Z",
      evidence_observed_at: now,
    });
    expect(plan.estimatedSevenPageCeilingMinor).toBeLessThanOrEqual(200);
    expect(plan.authority.expires_at).toBe("2026-10-21T12:00:00.000Z");
    expect(plan.tariff.source_sha256).toBe(planDigest(plan.qualification));
    const changed = {
      ...proof,
      deck: { ...proof.deck, bytes: Buffer.from("altered") },
    };
    expect(() =>
      buildPlan(c, changed, { authority: null, priorTariffId: null }, now),
    ).toThrow();
    expect(() =>
      buildPlan(
        c,
        {
          ...proof,
          deck: source(deckUrl, `${header}\n${row("35220", "0.2")}`),
        },
        { authority: null, priorTariffId: null },
        now,
      ),
    ).toThrow("REVIEW_SEVEN_PAGE_CEILING_EXCEEDED");
  });
  it("expires with the oldest profile association without relabelling its observation", () => {
    const c = config();
    c.rateDeckAssociation.observedAt = "2026-09-18T13:00:00.000Z";
    const plan = buildPlan(
      c,
      evidence(c),
      { authority: null, priorTariffId: null },
      now,
    );
    expect(plan.tariff.expires_at).toBe("2026-09-25T13:00:00.000Z");
    expect(plan.qualification.config.rateDeckAssociation.observedAt).toBe(
      "2026-09-18T13:00:00.000Z",
    );
    expect(() => validateConfig(c, "2026-09-25T13:00:00.000Z")).toThrow(
      "REVIEW_AUTHORITY_INVALID",
    );
  });
});

let mf: Miniflare, db: D1Database;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-17",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const directory = new URL("../../migrations/", import.meta.url);
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await db.batch(
      unstable_splitSqlQuery(
        await readFile(new URL(name, directory), "utf8"),
      ).map((sql) => db.prepare(sql)),
    );
});
afterAll(async () => {
  await mf?.dispose();
});
async function seeded() {
  const c = config();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations VALUES(?,'Isolated reviewer fixture','production',?)",
      )
      .bind(c.organizationId, now),
    db
      .prepare("INSERT INTO users VALUES(?,'Isolated reviewer fixture',?,?)")
      .bind(c.reviewerUserId, c.reviewerEmail, now),
    db
      .prepare("INSERT INTO memberships VALUES(?,?,'admin',?)")
      .bind(c.organizationId, c.reviewerUserId, now),
    db
      .prepare(
        "INSERT INTO senders VALUES(?,?,'fax','Isolated fixture',?,'verified','production',?)",
      )
      .bind(c.senderId, c.organizationId, c.recipientPhone, now),
    db
      .prepare("INSERT INTO channel_controls VALUES(?,'fax',0)")
      .bind(c.organizationId),
  ]);
  const proof = evidence(c),
    target = await inspectTarget(db, c);
  const plan = buildPlan(c, proof, target, now);
  return { c, proof, plan };
}
async function legacyFixture(c: Config, tariff: Record<string, unknown>) {
  const row = {
    ...tariff,
    id: `legacy_${crypto.randomUUID()}`,
    execution_scope: "live",
    review_authority_id: null,
    evidence_observed_at: null,
    valid_from: "2026-09-21T12:00:00.000Z",
    expires_at: "2026-09-24T09:00:01.620Z",
    created_at: "2026-09-21T12:00:00.000Z",
    fx_date: "2026-09-21",
    source_reference: "ISOLATED LEGACY FIXTURE",
    source_sha256: "d".repeat(64),
    operator_authorization_reference: "ISOLATED LEGACY AUTHORITY",
  };
  const fields = Object.keys(row);
  await db
    .prepare(
      `INSERT INTO trusted_fax_usage_tariffs(${fields.join(",")}) VALUES(${fields.map(() => "?").join(",")})`,
    )
    .bind(...Object.values(row))
    .run();
  expect(
    await db
      .prepare(
        "SELECT organization_id FROM trusted_fax_usage_tariffs WHERE id=?",
      )
      .bind(row.id)
      .first("organization_id"),
  ).toBe(c.organizationId);
  return row;
}
describe("atomic operator installation against actual D1 migrations", () => {
  it("installs only the reviewed tenant and is idempotent with no approvals, quota or outbox", async () => {
    const { c, proof, plan } = await seeded();
    await expect(
      applyPlan(db, plan, planDigest(plan), proof, inspection(c), now),
    ).resolves.toMatchObject({ status: "applied" });
    await expect(
      applyPlan(db, plan, planDigest(plan), proof, inspection(c), now),
    ).resolves.toMatchObject({ status: "already_applied" });
    for (const table of [
      "approvals",
      "attempts",
      "outbox",
      "reservations",
      "welcome_credit_reservations",
    ])
      expect(
        await db
          .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE organization_id=?`)
          .bind(c.organizationId)
          .first("n"),
      ).toBe(0);
    expect(
      await db
        .prepare(
          "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel='fax'",
        )
        .bind(c.organizationId)
        .first("enabled"),
    ).toBe(0);
  });
  it("rejects wrong review digest, changed target, altered evidence and forged live plan before writes", async () => {
    const { c, proof, plan } = await seeded();
    await expect(
      applyPlan(db, plan, "0".repeat(64), proof, inspection(c), now),
    ).rejects.toThrow("REVIEW_PLAN_NOT_REVIEWED");
    const forged = structuredClone(plan);
    forged.tariff.execution_scope = "live";
    await expect(
      applyPlan(db, forged, planDigest(forged), proof, inspection(c), now),
    ).rejects.toThrow("REVIEW_PLAN_CHANGED");
    const altered = {
      ...proof,
      page: {
        ...proof.page,
        bytes: Buffer.from(
          proof.page.bytes.toString().replace("0.007", "0.008"),
        ),
      },
    };
    await expect(
      applyPlan(db, plan, planDigest(plan), altered, inspection(c), now),
    ).rejects.toThrow("REVIEW_EVIDENCE_MISMATCH");
    await expect(
      applyPlan(
        db,
        plan,
        planDigest(plan),
        proof,
        inspection(c),
        plan.tariff.expires_at,
      ),
    ).rejects.toThrow("REVIEW_PLAN_EXPIRED");
    await db
      .prepare("UPDATE channel_controls SET enabled=1 WHERE organization_id=?")
      .bind(c.organizationId)
      .run();
    await expect(
      applyPlan(db, plan, planDigest(plan), proof, inspection(c), now),
    ).rejects.toThrow("REVIEW_TARGET_INVALID");
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM fax_review_preparation_authorities WHERE organization_id=?",
        )
        .bind(c.organizationId)
        .first("n"),
    ).toBe(0);
  });
  it("does not widen the single reviewer tenant to another member or number", async () => {
    const { c } = await seeded();
    await expect(
      inspectTarget(db, { ...c, recipientPhone: "+35220000001" }),
    ).rejects.toThrow("REVIEW_TARGET_INVALID");
    await db
      .prepare("INSERT INTO memberships VALUES(?,?,'member',?)")
      .bind(c.organizationId, (await seeded()).c.reviewerUserId, now)
      .run();
    await expect(inspectTarget(db, c)).rejects.toThrow("REVIEW_TARGET_INVALID");
  });
  it("rechecks target inside the transaction when a channel changes after preflight", async () => {
    const { c, proof, plan } = await seeded();
    const racing = {
      prepare: db.prepare.bind(db),
      async batch(statements: D1PreparedStatement[]) {
        await db
          .prepare(
            "UPDATE channel_controls SET enabled=1 WHERE organization_id=?",
          )
          .bind(c.organizationId)
          .run();
        return db.batch(statements);
      },
    };
    await expect(
      applyPlan(racing, plan, planDigest(plan), proof, inspection(c), now),
    ).rejects.toThrow();
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM fax_review_preparation_authorities WHERE organization_id=?",
        )
        .bind(c.organizationId)
        .first("n"),
    ).toBe(0);
  });
  it("rolls back the previous tariff revocation if the installation batch fails later", async () => {
    const { c, proof, plan } = await seeded();
    await applyPlan(db, plan, planDigest(plan), proof, inspection(c), now);
    const later = "2026-09-26T12:00:00.000Z";
    const renewal = buildPlan(c, proof, await inspectTarget(db, c), later);
    const rejecting = {
      prepare: db.prepare.bind(db),
      batch(statements: D1PreparedStatement[]) {
        return db.batch([
          ...statements,
          db
            .prepare(
              "INSERT INTO organizations SELECT * FROM organizations WHERE id=?",
            )
            .bind(c.organizationId),
        ]);
      },
    };
    await expect(
      applyPlan(
        rejecting,
        renewal,
        planDigest(renewal),
        proof,
        inspection(c),
        later,
      ),
    ).rejects.toThrow();
    expect(
      await db
        .prepare("SELECT status FROM trusted_fax_usage_tariffs WHERE id=?")
        .bind(plan.tariff.id)
        .first("status"),
    ).toBe("qualified");
    expect(
      await db
        .prepare("SELECT id FROM trusted_fax_usage_tariffs WHERE id=?")
        .bind(renewal.tariff.id)
        .first(),
    ).toBeNull();
  });
  it("renews references atomically without extending authority, and rejects revoked authority replay", async () => {
    const { c, proof, plan } = await seeded();
    await applyPlan(db, plan, planDigest(plan), proof, inspection(c), now);
    const later = "2026-09-26T12:00:00.000Z";
    const renewal = buildPlan(c, proof, await inspectTarget(db, c), later);
    await applyPlan(
      db,
      renewal,
      planDigest(renewal),
      proof,
      inspection(c),
      later,
    );
    expect(
      await db
        .prepare("SELECT status FROM trusted_fax_usage_tariffs WHERE id=?")
        .bind(plan.tariff.id)
        .first("status"),
    ).toBe("revoked");
    expect(renewal.authority).toEqual(plan.authority);
    await db
      .prepare(
        "UPDATE fax_review_preparation_authorities SET status='revoked' WHERE id=?",
      )
      .bind(c.authority.id)
      .run();
    await expect(
      applyPlan(db, renewal, planDigest(renewal), proof, inspection(c), later),
    ).rejects.toThrow("REVIEW_AUTHORITY_CONFLICT");
  });
  it("requires explicit exact legacy ID and complete row digest before atomic narrowing", async () => {
    const { c, plan } = await seeded();
    const legacy = await legacyFixture(c, plan.tariff);
    const ctx = {
      organizationId: c.organizationId,
      userId: c.reviewerUserId,
      role: "admin" as const,
      actor: "browser" as const,
    };
    const domain = new DomainService(db, {
      mode: "production",
      now: () => Date.parse("2026-09-22T12:00:00.000Z"),
      liveFaxIdentity: {
        accountId: c.accountId,
        connectionId: c.connectionId,
        outboundProfileId: c.outboundProfileId,
      },
    });
    const document = await domain.registerDocument(ctx, {
      id: `doc_${c.organizationId}`,
      name: "synthetic.pdf",
      sha256: "e".repeat(64),
      size: 100,
      pages: 2,
      status: "ready",
      source: "import",
      storageKey: `fixture/${c.organizationId}.pdf`,
      scanVerified: true,
    });
    const prepared = await domain.prepareDispatch(
      ctx,
      {
        channel: "fax",
        documentId: document.id,
        senderId: c.senderId,
        recipient: { phone: c.recipientPhone },
        ceilingMinor: 200,
      },
      crypto.randomUUID(),
    );
    const originalDispatch = await db
      .prepare("SELECT * FROM dispatches WHERE id=?")
      .bind(prepared.id)
      .first();
    const originalQuote = await db
      .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
      .bind(prepared.id)
      .first();
    await expect(inspectTarget(db, c)).rejects.toThrow(
      "REVIEW_LEGACY_RECONCILIATION_REQUIRED",
    );
    const report = await inspectLegacy(db, c);
    expect(report).toMatchObject({
      applied: false,
      tariffId: legacy.id,
      rowSha256: legacyTariffDigest(legacy),
    });
    for (const transition of [
      { id: legacy.id, rowSha256: "0".repeat(64) },
      { id: "other", rowSha256: report.rowSha256 },
    ])
      await expect(
        inspectTarget(db, { ...c, transitionFromLive: transition }),
      ).rejects.toThrow("REVIEW_LEGACY_RECONCILIATION_REQUIRED");
    const exact = {
      ...c,
      transitionFromLive: { id: report.tariffId, rowSha256: report.rowSha256 },
    };
    const proof = evidence(exact),
      narrowed = buildPlan(exact, proof, await inspectTarget(db, exact), now);
    await applyPlan(
      db,
      narrowed,
      planDigest(narrowed),
      proof,
      inspection(exact),
      now,
    );
    const preserved = await db
      .prepare("SELECT * FROM trusted_fax_usage_tariffs WHERE id=?")
      .bind(legacy.id)
      .first();
    expect(preserved).toEqual({ ...legacy, status: "revoked" });
    expect(
      await db
        .prepare("SELECT * FROM dispatches WHERE id=?")
        .bind(prepared.id)
        .first(),
    ).toEqual(originalDispatch);
    expect(
      await db
        .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
        .bind(prepared.id)
        .first(),
    ).toEqual(originalQuote);
    expect(
      await db
        .prepare(
          "SELECT execution_scope FROM trusted_fax_usage_tariffs WHERE id=?",
        )
        .bind(narrowed.tariff.id)
        .first("execution_scope"),
    ).toBe("review_prepare_only");
    await expect(
      applyPlan(
        db,
        narrowed,
        planDigest(narrowed),
        proof,
        inspection(exact),
        now,
      ),
    ).resolves.toMatchObject({ status: "already_applied" });
  });
  it("rolls back a legacy revocation and new authority when replacement fails", async () => {
    const { c, plan } = await seeded();
    const legacy = await legacyFixture(c, plan.tariff);
    const exact = {
      ...c,
      transitionFromLive: {
        id: legacy.id,
        rowSha256: legacyTariffDigest(legacy),
      },
    };
    const proof = evidence(exact),
      narrowed = buildPlan(exact, proof, await inspectTarget(db, exact), now);
    const rejecting = {
      prepare: db.prepare.bind(db),
      batch(statements: D1PreparedStatement[]) {
        return db.batch([
          ...statements,
          db
            .prepare(
              "INSERT INTO organizations SELECT * FROM organizations WHERE id=?",
            )
            .bind(c.organizationId),
        ]);
      },
    };
    await expect(
      applyPlan(
        rejecting,
        narrowed,
        planDigest(narrowed),
        proof,
        inspection(exact),
        now,
      ),
    ).rejects.toThrow();
    expect(
      await db
        .prepare("SELECT * FROM trusted_fax_usage_tariffs WHERE id=?")
        .bind(legacy.id)
        .first(),
    ).toEqual(legacy);
    expect(
      await db
        .prepare("SELECT id FROM fax_review_preparation_authorities WHERE id=?")
        .bind(c.authority.id)
        .first(),
    ).toBeNull();
  });
});
