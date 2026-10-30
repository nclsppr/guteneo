import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";
import { customerFaxPricing } from "../../packages/contracts/src/fax-pricing";

const { planContinuousReview, applyContinuousReview, continuousReviewDigest } =
  await import(
    new URL("../../scripts/enable-continuous-review.mjs", import.meta.url).href
  );
let mf: Miniflare, db: D1Database;
let fixture: Awaited<ReturnType<typeof createFaxUsageFixture>>;
let config: Record<string, unknown>;
const old = "2026-10-01T10:00:00.000Z",
  now = "2028-01-01T10:00:00.000Z";
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
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".sql") && Number(name.slice(0, 4)) <= 66)
    .sort())
    await db.batch(
      unstable_splitSqlQuery(readFileSync(new URL(file, dir), "utf8")).map(
        (sql) => db.prepare(sql),
      ),
    );
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  fixture = await createFaxUsageFixture(db, () => Date.parse(old));
  const org = fixture.ctx.organizationId,
    user = fixture.ctx.userId,
    authorityId = crypto.randomUUID(),
    tariffId = crypto.randomUUID();
  await db
    .prepare(
      "UPDATE channel_controls SET enabled=0 WHERE organization_id=? AND channel='fax'",
    )
    .bind(org)
    .run();
  const identity = {
    issuer: "https://isolated-review.invalid/",
    subject: `isolated:${user}`,
  };
  await insertRecord(db, "auth_identities", {
    ...identity,
    user_id: user,
    created_at: old,
  });
  await insertRecord(db, "restricted_delivery_identities", {
    ...identity,
    policy: "prepare_only",
    created_at: old,
  });
  await db
    .prepare(
      "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
    )
    .bind(org, fixture.tariff.id)
    .run();
  await insertRecord(db, "fax_review_preparation_authorities", {
    id: authorityId,
    organization_id: org,
    sender_id: fixture.tariff.sender_id,
    account_id: fixture.tariff.account_id,
    connection_id: fixture.tariff.connection_id,
    outbound_profile_id: fixture.tariff.outbound_profile_id,
    recipient_phone: "+35220000000",
    valid_from: old,
    expires_at: "2026-10-31T10:00:00.000Z",
    status: "active",
    authorization_reference: "ISOLATED OLD REVIEW AUTHORITY",
    source_sha256: "c".repeat(64),
    created_at: old,
  });
  await insertRecord(db, "trusted_fax_usage_tariffs", {
    ...fixture.tariff,
    id: tariffId,
    destination_prefix: "+35220",
    destination_country_code: "LU",
    origin_class: "local",
    destination_category: "ngn",
    route_qualification: "operator_test",
    operator_authorization_reference: "ISOLATED OLD REVIEW AUTHORITY",
    operator_test_ceiling_minor: 200,
    execution_scope: "review_prepare_only",
    review_authority_id: authorityId,
    evidence_observed_at: old,
    max_pages: 7,
    quote_ttl_seconds: 900,
    expires_at: "2026-10-08T10:00:00.000Z",
  });
  config = {
    version: 1,
    accessId: crypto.randomUUID(),
    organizationId: org,
    reviewerUserId: user,
    tariffId,
    authorityId,
    reviewerIdentity: identity,
    authorizationReference: "ISOLATED CONTINUOUS REVIEW OPT-IN",
  };
});
const plan = () => planContinuousReview(db, config, now);
const count = async () =>
  (await db
    .prepare(
      "SELECT COUNT(*) AS n FROM fax_review_preparation_access WHERE organization_id=?",
    )
    .bind(fixture.ctx.organizationId)
    .first<{ n: number }>())!.n;

describe("continuous review operator — exact private opt-in, no source refresh", () => {
  it("plans without writes years after immutable reference expiry", async () => {
    const p = await plan();
    expect(p.snapshot.tariff.expires_at).toBe("2026-10-08T10:00:00.000Z");
    expect(p.applied).toBe(false);
    expect(await count()).toBe(0);
    expect(p.deliveryPolicy).toBe("prepare_only_unchanged");
  });
  it("applies the reviewed snapshot once and is idempotent without changing the archived source", async () => {
    const p = await plan(),
      digest = continuousReviewDigest(p);
    expect(await applyContinuousReview(db, p, digest, now)).toMatchObject({
      status: "applied",
    });
    expect(await applyContinuousReview(db, p, digest, now)).toMatchObject({
      status: "already_applied",
    });
    expect(await count()).toBe(1);
    const tariff = await db
      .prepare(
        "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=?",
      )
      .bind(config.organizationId, config.tariffId)
      .first();
    expect(tariff).toEqual(p.snapshot.tariff);
    const authority = await db
      .prepare(
        "SELECT * FROM fax_review_preparation_authorities WHERE organization_id=? AND id=?",
      )
      .bind(config.organizationId, config.authorityId)
      .first();
    expect(authority).toEqual(p.snapshot.authority);
  });
  it("rejects a changed plan or an unreviewed digest before inserting", async () => {
    const p = await plan(),
      digest = continuousReviewDigest(p);
    p.access.authorization_reference = "changed";
    await expect(applyContinuousReview(db, p, digest, now)).rejects.toThrow(
      "CONTINUOUS_REVIEW_PLAN_INVALID",
    );
    expect(await count()).toBe(0);
  });
  it("requires the exact restricted authenticated identity, never a display name or another subject", async () => {
    await expect(
      planContinuousReview(
        db,
        {
          ...config,
          reviewerIdentity: {
            issuer: "https://isolated-review.invalid/",
            subject: "other",
          },
        },
        now,
      ),
    ).rejects.toThrow("CONTINUOUS_REVIEW_TARGET_INVALID");
    await expect(
      planContinuousReview(db, { ...config, enableSending: true }, now),
    ).rejects.toThrow("CONTINUOUS_REVIEW_CONFIG_INVALID");
    expect(await count()).toBe(0);
  });
  it("rejects a membership change between plan and apply", async () => {
    const p = await plan();
    const addedUser = crypto.randomUUID();
    await insertRecord(db, "users", {
      id: addedUser,
      name: "Isolated extra member",
      email: "extra@example.invalid",
      created_at: now,
    });
    await insertRecord(db, "memberships", {
      organization_id: config.organizationId,
      user_id: addedUser,
      role: "member",
      created_at: now,
    });
    await expect(
      applyContinuousReview(db, p, continuousReviewDigest(p), now),
    ).rejects.toThrow("CONTINUOUS_REVIEW_TARGET_INVALID");
    expect(await count()).toBe(0);
  });
  it("rejects a missing prepare_only restriction instead of installing or relaxing one", async () => {
    const p = await plan();
    await db
      .prepare(
        "DELETE FROM restricted_delivery_identities WHERE issuer=? AND subject=?",
      )
      .bind(p.config.reviewerIdentity.issuer, p.config.reviewerIdentity.subject)
      .run();
    await expect(
      applyContinuousReview(db, p, continuousReviewDigest(p), now),
    ).rejects.toThrow("CONTINUOUS_REVIEW_TARGET_INVALID");
    expect(await count()).toBe(0);
  });
  it("never re-enables revoked access", async () => {
    const p = await plan(),
      digest = continuousReviewDigest(p);
    await applyContinuousReview(db, p, digest, now);
    await db
      .prepare(
        "UPDATE fax_review_preparation_access SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(config.organizationId, config.accessId)
      .run();
    await expect(applyContinuousReview(db, p, digest, now)).rejects.toThrow(
      "CONTINUOUS_REVIEW_ACCESS_CONFLICT",
    );
    expect(await count()).toBe(1);
  });
  it("atomically rechecks channel state at the only insertion", async () => {
    const p = await plan();
    let changed = false;
    const racingDb = {
      prepare(sql: string) {
        const statement = db.prepare(sql);
        return {
          bind(...values: unknown[]) {
            const bound = statement.bind(...values);
            if (!sql.startsWith("INSERT INTO fax_review_preparation_access"))
              return bound;
            return {
              async run() {
                changed = true;
                await db
                  .prepare(
                    "UPDATE channel_controls SET enabled=1 WHERE organization_id=? AND channel='fax'",
                  )
                  .bind(config.organizationId)
                  .run();
                return bound.run();
              },
            };
          },
        };
      },
    };
    await expect(
      applyContinuousReview(racingDb, p, continuousReviewDigest(p), now),
    ).rejects.toThrow("CONTINUOUS_REVIEW_STATE_CHANGED");
    expect(changed).toBe(true);
    expect(await count()).toBe(0);
  });
  it("keeps source record changes separate from the approved opt-in", async () => {
    const p = await plan();
    await db
      .prepare(
        "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
      )
      .bind(config.organizationId, config.tariffId)
      .run();
    await expect(
      applyContinuousReview(db, p, continuousReviewDigest(p), now),
    ).rejects.toThrow("CONTINUOUS_REVIEW_TARGET_INVALID");
    expect(await count()).toBe(0);
  });
});
it("labels archived review references and does not carry the label onto live customer pricing", () => {
  const common = {
    version: 3 as const,
    currency: "EUR" as const,
    basis: "qualified_usage_ex_tax" as const,
    estimatedLowNanoeur: 1,
    estimatedHighNanoeur: 2,
    ceilingMinor: 200,
    fx: { numerator: 1, denominator: 1, date: "2026-10-01", source: "fixture" },
    settlement: {
      status: "not_reserved" as const,
      customerNanoeur: null,
      chargedMinor: null,
      settledAt: null,
    },
    referenceBasis: "archived_review_reference" as const,
  };
  const review = customerFaxPricing({
    ...common,
    executionScope: "review_prepare_only",
    routeQualification: "operator_authorized_test",
  });
  expect(review.referenceBasis).toBe("archived_review_reference");
  expect(review.routeNotice).toContain("not a current provider price");
  expect(review.display.explanation).toContain(
    "archived rate and FX reference",
  );
  expect(review.display.ceiling.creditLabel).toBe(
    "No credit is reserved or consumed.",
  );
  const live = customerFaxPricing(common);
  expect(live).not.toHaveProperty("referenceBasis");
  expect(live.display.explanation).not.toContain("archived");
});

describe("private operator material stays outside Git and refuses file symlinks", () => {
  it("reads only an absolute private regular file and returns an external output path", async () => {
    const fs = await import("node:fs/promises"),
      { tmpdir } = await import("node:os"),
      { join } = await import("node:path");
    const { readPrivateOperatorJson, privateOperatorPath } = await import(
      new URL("../../scripts/private-operator-files.mjs", import.meta.url).href
    );
    const dir = await fs.mkdtemp(
      join(tmpdir(), "guteneo-private-operator-test-"),
    );
    try {
      const file = join(dir, "config.json");
      await fs.writeFile(file, '{"synthetic":true}', { mode: 0o600 });
      expect(await readPrivateOperatorJson(file, "TEST")).toEqual({
        synthetic: true,
      });
      expect(await privateOperatorPath(join(dir, "plan.json"), "TEST")).toBe(
        join(await fs.realpath(dir), "plan.json"),
      );
      await expect(
        readPrivateOperatorJson("relative.json", "TEST"),
      ).rejects.toThrow("PRIVATE_DIRECTORY_REQUIRED");
      await fs.symlink(file, join(dir, "linked.json"));
      await expect(
        readPrivateOperatorJson(join(dir, "linked.json"), "TEST"),
      ).rejects.toThrow("PRIVATE_FILE_REQUIRED");
      await fs.chmod(file, 0o644);
      await expect(readPrivateOperatorJson(file, "TEST")).rejects.toThrow(
        "PRIVATE_FILE_REQUIRED",
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
  it("rejects a 0600 file inside any Git checkout and a readable external directory", async () => {
    const fs = await import("node:fs/promises"),
      { tmpdir } = await import("node:os"),
      { join } = await import("node:path"),
      { execFileSync } = await import("node:child_process");
    const { readPrivateOperatorJson } = await import(
      new URL("../../scripts/private-operator-files.mjs", import.meta.url).href
    );
    const dir = await fs.mkdtemp(join(tmpdir(), "guteneo-git-operator-test-"));
    try {
      const file = join(dir, "config.json");
      await fs.writeFile(file, '{"synthetic":true}', { mode: 0o600 });
      execFileSync("git", ["init", "--quiet", dir]);
      await expect(readPrivateOperatorJson(file, "TEST")).rejects.toThrow(
        "PRIVATE_DIRECTORY_REQUIRED",
      );
      await fs.rm(join(dir, ".git"), { recursive: true, force: true });
      await fs.chmod(dir, 0o755);
      await expect(readPrivateOperatorJson(file, "TEST")).rejects.toThrow(
        "PRIVATE_DIRECTORY_REQUIRED",
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
