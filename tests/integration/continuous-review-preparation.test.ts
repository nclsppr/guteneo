import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";
import {
  validateFaxUsageQuote,
  type FaxUsageTariff,
} from "../../packages/domain/src/live-fax-usage";
import {
  createLiveProviderHook,
  type LiveProviderEnv,
} from "../../apps/api/src/live-providers";

let mf: Miniflare, db: D1Database, clock: number;
let fixture: Awaited<ReturnType<typeof createFaxUsageFixture>>;
let tariff: FaxUsageTariff;
let authority: Record<string, string>;
let access: Record<string, string>;
const stamp = () => new Date(clock).toISOString();
const phone = "+35220000000"; // Isolated synthetic recipient; never transmitted.
const expired = { code: "LIVE_PRICING_REQUIRED" };
const reviewOnly = { code: "FAX_REVIEW_PREPARATION_ONLY" };

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
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const source = readFileSync(new URL(file, directory), "utf8");
    await db.batch(
      unstable_splitSqlQuery(source).map((sql) => db.prepare(sql)),
    );
  }
});

afterAll(async () => {
  await mf?.dispose();
});

beforeEach(async () => {
  clock = Date.parse("2026-10-01T10:00:00.000Z");
  fixture = await createFaxUsageFixture(db, () => clock);
  await db
    .prepare(
      "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='fax'",
    )
    .bind(fixture.ctx.organizationId)
    .run();
  const identity = {
    issuer: "https://isolated-review.invalid/",
    subject: `isolated:${fixture.ctx.userId}`,
  };
  await insertRecord(db, "auth_identities", {
    ...identity,
    user_id: fixture.ctx.userId,
    created_at: stamp(),
  });
  await insertRecord(db, "restricted_delivery_identities", {
    ...identity,
    policy: "prepare_only",
    created_at: stamp(),
  });
  authority = {
    id: crypto.randomUUID(),
    organization_id: fixture.ctx.organizationId,
    sender_id: fixture.tariff.sender_id,
    account_id: fixture.tariff.account_id,
    connection_id: fixture.tariff.connection_id,
    outbound_profile_id: fixture.tariff.outbound_profile_id,
    recipient_phone: phone,
    valid_from: stamp(),
    expires_at: "2026-10-31T10:00:00.000Z",
    status: "active",
    authorization_reference: "ISOLATED BOUNDED REVIEW AUTHORITY",
    source_sha256: "c".repeat(64),
    created_at: stamp(),
  };
  await insertRecord(db, "fax_review_preparation_authorities", authority);
  tariff = {
    ...fixture.tariff,
    id: crypto.randomUUID(),
    destination_prefix: "+35220",
    destination_country_code: "LU",
    origin_class: "local",
    destination_category: "ngn",
    route_qualification: "operator_test",
    operator_authorization_reference: "ISOLATED REVIEW REFERENCE",
    operator_test_ceiling_minor: 200,
    execution_scope: "review_prepare_only",
    review_authority_id: authority.id,
    evidence_observed_at: stamp(),
    max_pages: 7,
    quote_ttl_seconds: 900,
    expires_at: "2026-10-08T10:00:00.000Z",
  };
  await insertRecord(db, "trusted_fax_usage_tariffs", tariff);
  access = {
    id: crypto.randomUUID(),
    organization_id: fixture.ctx.organizationId,
    reviewer_user_id: fixture.ctx.userId,
    tariff_id: tariff.id,
    authority_id: authority.id,
    status: "active",
    created_at: stamp(),
    authorization_reference: "ISOLATED CONTINUOUS REVIEW OPT-IN",
  };
  fixture.input.recipient.phone = phone;
});

const enable = () => insertRecord(db, "fax_review_preparation_access", access);
const prepare = () =>
  fixture.domain.prepareDispatch(
    fixture.ctx,
    { ...fixture.input, ceilingMinor: 200 },
    crypto.randomUUID(),
  );
async function validAccessCount() {
  return db
    .prepare(
      "SELECT COUNT(*) AS count FROM valid_continuous_review_fax_access WHERE organization_id=? AND id=?",
    )
    .bind(fixture.ctx.organizationId, access.id)
    .first<{ count: number }>();
}
async function noExecution() {
  for (const table of [
    "approvals",
    "attempts",
    "outbox",
    "reservations",
    "welcome_credit_reservations",
    "expert_dispatch_reviews",
    "expert_approval_acceptances",
    "fax_usage_settlements",
    "document_access_grants",
  ])
    expect(
      await db
        .prepare(
          `SELECT COUNT(*) AS count FROM ${table} WHERE organization_id=?`,
        )
        .bind(fixture.ctx.organizationId)
        .first(),
    ).toEqual({ count: 0 });
}

describe("continuous unsendable reviewer access", () => {
  it("keeps expired review and ordinary provider pricing closed without opt-in", async () => {
    clock = Date.parse("2027-02-01T10:00:00.000Z");
    await expect(prepare()).rejects.toMatchObject(expired);
    await expect(
      fixture.domain.prepareDispatch(
        fixture.ctx,
        { ...fixture.input, recipient: { phone: "+33100000001" } },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject(expired);
    await noExecution();
  });

  it("prepares months later from an immutable archived reference without renewing provider evidence", async () => {
    const savedTariff = await db
      .prepare("SELECT * FROM trusted_fax_usage_tariffs WHERE id=?")
      .bind(tariff.id)
      .first();
    const savedAuthority = await db
      .prepare("SELECT * FROM fax_review_preparation_authorities WHERE id=?")
      .bind(authority.id)
      .first();
    await enable();
    for (const date of [
      "2026-11-15T10:00:00.000Z",
      "2027-02-01T10:00:00.000Z",
    ]) {
      clock = Date.parse(date);
      const dispatch = await prepare();
      expect(dispatch.status).toBe("prepared");
      expect(dispatch.quote_expires_at).toBe(
        new Date(clock + 900_000).toISOString(),
      );
      expect(dispatch.faxPricing).toMatchObject({
        executionScope: "review_prepare_only",
        referenceBasis: "archived_review_reference",
        display: {
          explanation: expect.stringContaining("not a current provider price"),
        },
        settlement: { status: "not_reserved" },
      });
      const quote = await validateFaxUsageQuote(
        db,
        dispatch,
        fixture.identity,
        stamp(),
      );
      expect(quote?.review_access_id).toBe(access.id);
    }
    expect(
      await db
        .prepare("SELECT * FROM trusted_fax_usage_tariffs WHERE id=?")
        .bind(tariff.id)
        .first(),
    ).toEqual(savedTariff);
    expect(
      await db
        .prepare("SELECT * FROM fax_review_preparation_authorities WHERE id=?")
        .bind(authority.id)
        .first(),
    ).toEqual(savedAuthority);
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    await noExecution();
  });

  it("binds opt-in to a restricted reviewer, exact tenant and existing review-only tariff", async () => {
    for (const changed of [
      { tariff_id: fixture.tariff.id },
      { organization_id: "unknown-isolated-tenant" },
      { reviewer_user_id: "unknown-isolated-reviewer" },
      { authority_id: "unknown-isolated-authority" },
    ])
      await expect(
        insertRecord(db, "fax_review_preparation_access", {
          ...access,
          ...changed,
        }),
      ).rejects.toThrow(/fax_review_preparation_access_invalid|FOREIGN KEY/);
    await db
      .prepare("DELETE FROM restricted_delivery_identities WHERE subject=?")
      .bind(`isolated:${fixture.ctx.userId}`)
      .run();
    await expect(enable()).rejects.toThrow(
      /fax_review_preparation_access_invalid/,
    );
    expect(await validAccessCount()).toEqual({ count: 0 });
    await noExecution();
  });

  it("revokes immediately before quote expiry without fallback or historical rewrites", async () => {
    await enable();
    const dispatch = await prepare();
    const before = await db
      .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
      .bind(dispatch.id)
      .first();
    await db
      .prepare(
        "UPDATE fax_review_preparation_access SET status='revoked' WHERE id=?",
      )
      .bind(access.id)
      .run();
    expect(await validAccessCount()).toEqual({ count: 0 });
    await expect(
      validateFaxUsageQuote(db, dispatch, fixture.identity, stamp()),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    await expect(prepare()).rejects.toMatchObject(expired);
    expect(
      await db
        .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
        .bind(dispatch.id)
        .first(),
    ).toEqual(before);
    await expect(
      db
        .prepare(
          "UPDATE fax_review_preparation_access SET status='active' WHERE id=?",
        )
        .bind(access.id)
        .run(),
    ).rejects.toThrow(/immutable_fax_review_preparation_access/);
    await expect(
      db
        .prepare("DELETE FROM fax_review_preparation_access WHERE id=?")
        .bind(access.id)
        .run(),
    ).rejects.toThrow(/immutable_fax_review_preparation_access/);
    await noExecution();
  });

  it.each([
    "channel",
    "restriction",
    "membership",
    "expert",
    "sender",
    "authority",
    "tariff",
  ])("invalidates current access when its %s guard changes", async (guard) => {
    await enable();
    clock = Date.parse("2027-02-01T10:00:00.000Z");
    const dispatch = await prepare();
    if (guard === "channel")
      await db
        .prepare(
          "UPDATE channel_controls SET enabled=1 WHERE organization_id=? AND channel='fax'",
        )
        .bind(fixture.ctx.organizationId)
        .run();
    else if (guard === "restriction")
      await db
        .prepare("DELETE FROM restricted_delivery_identities WHERE subject=?")
        .bind(`isolated:${fixture.ctx.userId}`)
        .run();
    else if (guard === "membership") {
      const userId = `other_${crypto.randomUUID()}`;
      await insertRecord(db, "users", {
        id: userId,
        name: "Other isolated member",
        email: `${userId}@example.invalid`,
        created_at: stamp(),
      });
      await insertRecord(db, "memberships", {
        organization_id: fixture.ctx.organizationId,
        user_id: userId,
        role: "member",
        created_at: stamp(),
      });
    } else if (guard === "sender")
      await db
        .prepare(
          "UPDATE senders SET status='disabled' WHERE organization_id=? AND id=?",
        )
        .bind(fixture.ctx.organizationId, tariff.sender_id)
        .run();
    else if (guard === "expert") {
      const connectionId = crypto.randomUUID();
      await insertRecord(db, "authorized_connections", {
        id: connectionId,
        issuer: "https://isolated-review.invalid/",
        user_id: fixture.ctx.userId,
        client_id: "isolated-continuous-review-client",
        organization_id: fixture.ctx.organizationId,
        status: "active",
        not_before: 0,
        created_at: stamp(),
        updated_at: stamp(),
      });
      await insertRecord(db, "expert_approval_policies", {
        connection_id: connectionId,
        organization_id: fixture.ctx.organizationId,
        user_id: fixture.ctx.userId,
        enabled: 1,
        revision: 1,
        channels_json: '["fax"]',
        max_per_dispatch_minor: 200,
        max_daily_minor: 200,
        max_daily_count: 1,
        expires_at: new Date(clock + 3600_000).toISOString(),
        created_at: stamp(),
        updated_at: stamp(),
      });
    } else
      await db
        .prepare(
          `UPDATE ${guard === "authority" ? "fax_review_preparation_authorities" : "trusted_fax_usage_tariffs"} SET status='revoked' WHERE id=?`,
        )
        .bind(guard === "authority" ? authority.id : tariff.id)
        .run();
    expect(await validAccessCount()).toEqual({ count: 0 });
    await expect(
      validateFaxUsageQuote(db, dispatch, fixture.identity, stamp()),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    await expect(prepare()).rejects.toMatchObject(
      guard === "sender" ? { code: "SENDER_NOT_CONFIGURED" } : expired,
    );
    await noExecution();
  });

  it("never retrofits a continuous pointer or extends the validity of a historical quote", async () => {
    const dispatch = await prepare();
    const before = await db
      .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
      .bind(dispatch.id)
      .first<Record<string, unknown>>();
    expect(before?.review_access_id).toBeNull();
    await enable();
    const quote = await validateFaxUsageQuote(
      db,
      dispatch,
      fixture.identity,
      stamp(),
    );
    expect(quote?.review_access_id).toBeNull();
    clock = Date.parse("2027-02-01T10:00:00.000Z");
    await expect(
      validateFaxUsageQuote(db, dispatch, fixture.identity, stamp()),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    expect(
      await db
        .prepare("SELECT * FROM live_fax_quotes_v3 WHERE dispatch_id=?")
        .bind(dispatch.id)
        .first(),
    ).toEqual(before);
    await noExecution();
  });

  it("retains quote expiry and rejects a forged access ID or mutation", async () => {
    await enable();
    clock = Date.parse("2027-02-01T10:00:00.000Z");
    const dispatch = await prepare();
    const persistedDispatch = await db
      .prepare("SELECT * FROM dispatches WHERE organization_id=? AND id=?")
      .bind(fixture.ctx.organizationId, dispatch.id)
      .first<Record<string, unknown>>();
    const persistedQuote = await db
      .prepare(
        "SELECT * FROM live_fax_quotes_v3 WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(fixture.ctx.organizationId, dispatch.id)
      .first<Record<string, unknown>>();
    const forgedDispatchId = crypto.randomUUID();
    await insertRecord(db, "dispatches", {
      ...persistedDispatch!,
      id: forgedDispatchId,
      prepare_key: crypto.randomUUID(),
    });
    for (const changed of [
      { review_access_id: "unrelated-continuous-access" },
      { tariff_id: fixture.tariff.id },
      { organization_id: "unrelated-isolated-organization" },
    ])
      await expect(
        insertRecord(db, "live_fax_quotes_v3", {
          ...persistedQuote!,
          dispatch_id: forgedDispatchId,
          ...changed,
        }),
      ).rejects.toThrow(/live_quote_invalid/);
    await expect(
      db
        .prepare(
          "UPDATE live_fax_quotes_v3 SET review_access_id=NULL WHERE dispatch_id=?",
        )
        .bind(dispatch.id)
        .run(),
    ).rejects.toThrow(/immutable_live_fax_quote/);
    clock += 900_000;
    await expect(
      validateFaxUsageQuote(db, dispatch, fixture.identity, stamp()),
    ).rejects.toMatchObject({ code: "LIVE_QUOTE_INVALID" });
    await noExecution();
  });

  it("keeps every execution path closed with no provider request or financial effect", async () => {
    await enable();
    clock = Date.parse("2027-02-01T10:00:00.000Z");
    const dispatch = await prepare();
    await expect(
      fixture.domain.prepareDispatch(
        fixture.ctx,
        { ...fixture.input, recipient: { phone: "+35220000001" } },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject(expired);
    await expect(
      fixture.domain.prepareDispatch(
        fixture.ctx,
        { ...fixture.input, ceilingMinor: 201 },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "FAX_TEST_CEILING_EXCEEDED" });
    await expect(
      fixture.domain.approveDispatch(
        fixture.ctx,
        dispatch.id,
        dispatch.fingerprint,
      ),
    ).rejects.toMatchObject(reviewOnly);
    await expect(
      fixture.domain.confirmDispatch(fixture.ctx, dispatch.id, "never-confirm"),
    ).rejects.toMatchObject(reviewOnly);
    for (const status of ["queued", "submitting"])
      await expect(
        db
          .prepare(
            "UPDATE dispatches SET status=? WHERE organization_id=? AND id=?",
          )
          .bind(status, fixture.ctx.organizationId, dispatch.id)
          .run(),
      ).rejects.toThrow(
        /fax_review_preparation_only|approval_required|live_quote_invalid/,
      );
    const fetcher = vi.fn();
    const provider = createLiveProviderHook(
      { DB: db, MODE: "production" } as LiveProviderEnv,
      "fax",
      { fetcher },
    );
    expect(await provider.submit(dispatch)).toMatchObject({
      status: "rejected",
      errorCode: "FAX_REVIEW_PREPARATION_ONLY",
    });
    expect(fetcher).not.toHaveBeenCalled();
    await noExecution();
  });
});
