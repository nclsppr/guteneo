import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { DomainService, canonicalJson } from "../../packages/domain/src/index";
import { emailRateComponents } from "../../packages/domain/src/live-delivery-quotes";
import {
  secureDistributionCatalog,
  secureDistributionInputSchema,
  secureDistributionQuote,
  type SecureDistributionPolicy,
} from "../../packages/contracts/src/secure-distribution";
import {
  authenticateBrowser,
  authenticatePersonalBrowser,
  createPersonalBrowserSession,
  createSession,
  memberships,
} from "../../apps/api/src/auth";
import type { Env } from "../../apps/api/src/env";
import {
  SecureDistributionService,
  secureSharedBinding,
  type SecureDistributionRow,
} from "../../apps/api/src/secure-distributions";
import { PersonalDocumentsService } from "../../apps/api/src/personal-documents";
import { handlePersonalDocumentRoute } from "../../apps/api/src/secure-distribution-routes";
import {
  getSecureObject,
  openSecureSecret,
  putSecureObject,
  sealSecureSecret,
  secureSha256,
} from "../../apps/api/src/secure-storage";
import {
  maintainDocuments,
  maintainSecureObjects,
} from "../../apps/api/src/maintenance";

// Real, isolated Workers SQLite and R2. The renderer and authentication evidence
// below are synthetic fixtures; no provider, Auth0 tenant or real send is used.
let mf: Miniflare, db: D1Database, bucket: R2Bucket;
const origin = "https://guteneo.example.test";
const stamp = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const identity = {
  provider: "resend" as const,
  accountId: "secure-core-fixture",
  routeId: "resend:secure-core-fixture:guteneo.com",
};
async function apply(sql: string) {
  let statement = "",
    trigger = false;
  const statements: D1PreparedStatement[] = [];
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement) trigger = line.startsWith("CREATE TRIGGER");
    statement += `${line}\n`;
    if (
      (trigger && (line === "END;" || /\bBEGIN\b.+\bEND;$/.test(line))) ||
      (!trigger && line.endsWith(";"))
    ) {
      statements.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete migration fixture");
  if (statements.length) await db.batch(statements);
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "secure-distribution-core",
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  for (const filename of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await apply(
      await readFile(
        new URL(`../../migrations/${filename}`, import.meta.url),
        "utf8",
      ),
    );
});
afterAll(async () => {
  await mf?.dispose();
});

function proxyBucket(overrides: Partial<R2Bucket>): R2Bucket {
  return new Proxy(bucket, {
    get(target, key) {
      const override = Reflect.get(overrides, key);
      if (override !== undefined) return override;
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
async function fixture(
  mode: "simulation" | "production" = "simulation",
  pageCount = 1,
  accessMode: "strong" | "verified_account" = "strong",
) {
  await db
    .prepare(
      "UPDATE secure_document_authentication_policy SET mode=? WHERE id=1",
    )
    .bind(accessMode)
    .run();
  const organizationId = id("org"),
    userId = id("usr"),
    recipientId = id("usr");
  const senderId = id("sender"),
    createdAt = stamp();
  const email = `${recipientId}@example.test`,
    ownerEmail = `${userId}@example.test`;
  const bytes = new TextEncoder().encode(
    `%PDF-1.7\nSynthetic confidential fixture ${organizationId}\n%%EOF`,
  );
  const hash = await secureSha256(bytes),
    storageKey = `core-source/${organizationId}.pdf`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Atelier synthétique',?,?)",
      )
      .bind(organizationId, mode, createdAt),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Expéditeur synthétique',?,?),(?,'Destinataire synthétique',?,?)",
      )
      .bind(userId, ownerEmail, createdAt, recipientId, email, createdAt),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(organizationId, userId, createdAt),
    db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Atelier synthétique',?,'verified',?,?)",
      )
      .bind(
        senderId,
        organizationId,
        mode === "production"
          ? "documents@guteneo.com"
          : `${organizationId}@example.invalid`,
        mode,
        createdAt,
      ),
    db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email',?,100,50000,'EUR')",
      )
      .bind(organizationId, createdAt.slice(0, 7)),
    db
      .prepare("INSERT INTO channel_controls VALUES(?,'email',1)")
      .bind(organizationId),
  ]);
  const queue = vi.fn(async (_message: unknown) => {});
  const renderer = vi.fn(async (request: Request) => {
    const url = new URL(request.url),
      start = Number(url.searchParams.get("startPage")),
      count = Number(url.searchParams.get("pageCount"));
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
    expect(request.headers.get("X-Guteneo-Scan-Sha256")).toBe(hash);
    const pages = await Promise.all(
      Array.from({ length: count }, async (_, offset) => {
        const page = start + offset,
          image = new Uint8Array([255, 216, page, 255, 217]);
        return {
          page,
          width: 1200,
          height: 1600,
          mimeType: "image/jpeg",
          imageBase64: btoa(String.fromCharCode(...image)),
          imageSha256: await secureSha256(image),
          text: `Texte accessible synthétique, page ${page}`,
          textTruncated: false,
        };
      }),
    );
    return Response.json({
      sha256: hash,
      totalPages: pageCount,
      startPage: start,
      pageCount: count,
      nextPage: start + count <= pageCount ? start + count : null,
      pages,
      rendering: { complete: true },
    });
  });
  const env = {
    DB: db,
    DOCUMENTS: bucket,
    APP_ORIGIN: origin,
    MODE: mode,
    ENVIRONMENT: mode === "production" ? "production" : "local",
    SECURE_DISTRIBUTION_ENABLED: "true",
    SENSITIVE_DOCUMENT_AUTHENTICATION: accessMode,
    ...(accessMode === "verified_account"
      ? { AUTH0_AUTH_POLICY: "verified_email" }
      : {}),
    SECURE_DOCUMENTS_KEY: btoa("s".repeat(32)),
    DOCUMENT_RENDERER: { fetch: renderer },
    DISPATCH_QUEUE: { send: queue },
  } as unknown as Env;
  if (mode === "production") {
    const rate = {
      usdMicrosPerMessage: 100,
      eurPerUsdNumerator: 1,
      eurPerUsdDenominator: 1,
      attachmentBasis: "no_attachments" as const,
    };
    const components = emailRateComponents(rate);
    await db
      .prepare(
        "INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES(?,?,?,'email','resend',?,?,'{}',?,?,?,?,'EUR','qualified_final_variable_cost',900,'ISOLATED SYNTHETIC TEST',?,?,?,'qualified',?)",
      )
      .bind(
        id("cost"),
        organizationId,
        senderId,
        identity.accountId,
        identity.routeId,
        canonicalJson(rate),
        components.base_numerator,
        components.byte_numerator,
        components.rate_denominator,
        "b".repeat(64),
        createdAt,
        new Date(Date.now() + 3600000).toISOString(),
        createdAt,
      )
      .run();
  }
  if (accessMode === "verified_account")
    await db.batch(
      [userId, recipientId].map((accountId) =>
        db
          .prepare(
            "INSERT INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://fixture.invalid/',?,?,?)",
          )
          .bind(accountId, accountId, createdAt),
      ),
    );
  const authEvidence = {
    verifiedEmail: ownerEmail,
    authenticatedAt: Math.floor(Date.now() / 1000),
    amr: accessMode === "strong" ? ["webauthn"] : ["pwd"],
    strongAuthentication: accessMode === "strong",
    authenticationPolicyVersion:
      accessMode === "strong" ? "guteneo-sensitive-v1" : null,
    identityIssuer: "https://fixture.invalid/",
    identitySubject: userId,
  };
  const ownerSession = await createSession(
    env,
    (await memberships(env, userId))[0],
    accessMode === "strong",
    false,
    true,
    authEvidence,
  );
  const ownerRequest = new Request(`${origin}/api/session`, {
    headers: { Cookie: ownerSession.cookie.split(";")[0] },
  });
  const authenticated = await authenticateBrowser(ownerRequest, env);
  const owner = await authenticatePersonalBrowser(ownerRequest, env);
  const recipientSession = await createPersonalBrowserSession(env, {
    ...authEvidence,
    verifiedEmail: email,
    userId: recipientId,
    development: false,
    mfa: accessMode === "strong",
    verifiedAccount: true,
    identitySubject: recipientId,
  });
  const recipient = await authenticatePersonalBrowser(
    new Request(`${origin}/api/personal/session`, {
      headers: { Cookie: recipientSession.cookie.split(";")[0] },
    }),
    env,
  );
  const domain = new DomainService(db, {
    mode,
    sensitiveDocumentAuthentication: accessMode,
    ...(mode === "production"
      ? { liveDeliveryIdentity: { email: identity } }
      : {}),
  });
  const source = await domain.registerDocument(authenticated.context, {
    name: "Document confidentiel synthétique.pdf",
    sha256: hash,
    size: bytes.length,
    pages: pageCount,
    status: "ready",
    source: "import",
    storageKey,
    ...(mode === "production" ? { scanVerified: true } : {}),
  });
  await bucket.put(storageKey, bytes);
  const service = new SecureDistributionService(env, domain),
    personal = new PersonalDocumentsService(env);
  return {
    env,
    domain,
    service,
    personal,
    ctx: authenticated.context,
    owner,
    recipient,
    source,
    bytes,
    hash,
    queue,
    renderer,
    organizationId,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const policy: SecureDistributionPolicy = {
  retentionDays: 7,
  allowOriginalDownload: false,
  allowVaultDeposit: true,
  personalRetentionDays: 365,
};
async function prepared(
  f: Fixture,
  options: Partial<SecureDistributionPolicy> = {},
) {
  const input = secureDistributionInputSchema.parse({
    documentId: f.source.id,
    recipient: { address: f.recipient.email! },
    ...policy,
    ...options,
  });
  const key = id("prepare");
  const initial = await f.service.prepare(f.ctx, input, key);
  expect(initial.status).toBe("preparing");
  expect(initial.dispatchId).toBeNull();
  for (let step = 0; step < 35; step++) {
    await f.service.processRender(initial.id);
    const result = await f.service.get(f.ctx, initial.id);
    if (result.status !== "preparing") return { view: result, input, key };
  }
  throw new Error("Fixture render did not complete");
}
async function accepted(
  f: Fixture,
  options: Partial<SecureDistributionPolicy> = {},
) {
  const preparation = await prepared(f, options);
  expect(
    preparation.view.status,
    JSON.stringify(
      await db
        .prepare("SELECT error_code FROM secure_distributions WHERE id=?")
        .bind(preparation.view.id)
        .first(),
    ),
  ).toBe("prepared");
  const approved = await f.service.approve(
    f.ctx,
    preparation.view.id,
    f.owner,
    true,
    true,
  );
  expect(approved.approved).toBe(true);
  const key = id("confirm"),
    active = await f.service.confirm(f.ctx, approved.id, key);
  expect(active.status).toBe("active");
  const row = (await db
    .prepare(
      "SELECT * FROM secure_distributions WHERE organization_id=? AND id=?",
    )
    .bind(f.organizationId, active.id)
    .first<SecureDistributionRow>())!;
  return { ...preparation, view: active, row, confirmKey: key };
}
async function bound(
  f: Fixture,
  options: Partial<SecureDistributionPolicy> = {},
) {
  const share = await accepted(f, options);
  const token = await openSecureSecret(
    f.env,
    `${f.organizationId}:${share.view.id}`,
    share.row.sealed_token,
  );
  expect(await f.personal.claim(f.recipient, token)).toMatchObject({
    status: "pending",
  });
  expect((await f.personal.get(f.recipient, share.view.id)).pages).toEqual([]);
  await f.service.bind(f.ctx, share.view.id, f.owner, {
    recipientUserId: f.recipient.userId,
    verificationMethod: "independent_channel",
  });
  return share;
}
async function financials(f: Fixture, dispatchId: string) {
  const charge = await db
    .prepare(
      "SELECT amount_minor,evidence FROM secure_distribution_charges WHERE organization_id=? AND dispatch_id=?",
    )
    .bind(f.organizationId, dispatchId)
    .first();
  const credit = await db
    .prepare(
      "SELECT granted_minor,spent_minor,reserved_minor,available_minor FROM welcome_credit_balances WHERE organization_id=?",
    )
    .bind(f.organizationId)
    .first();
  const usage = await db
    .prepare(
      "SELECT reserved_minor,confirmed_minor FROM usage WHERE organization_id=? AND channel='email' AND period=?",
    )
    .bind(f.organizationId, stamp().slice(0, 7))
    .first();
  const transport = await db
    .prepare(
      "SELECT amount_minor FROM reservations WHERE organization_id=? AND dispatch_id=?",
    )
    .bind(f.organizationId, dispatchId)
    .first();
  return { charge, credit, usage, transport };
}

describe("secure distribution — encrypted objects and immutable prices", () => {
  it("prices each immutable PDF/recipient term separately from notification transport", () => {
    expect(secureDistributionCatalog().unit).toBe("pdf_per_recipient");
    for (const [days, price] of [
      [7, 49],
      [30, 99],
      [90, 199],
      [365, 499],
    ] as const)
      expect(
        secureDistributionQuote(
          { ...policy, retentionDays: days, allowVaultDeposit: false },
          2,
        ),
      ).toMatchObject({
        sharedMinor: price,
        personalMinor: 0,
        transportMinor: 2,
        totalMinor: price + 2,
        nonRefundable: true,
      });
    expect(
      secureDistributionQuote({ ...policy, personalRetentionDays: 1095 }, 1)
        .totalMinor,
    ).toBe(549);
    expect(() => secureDistributionQuote(policy, 0.5)).toThrow();
    expect(
      secureDistributionInputSchema.safeParse({
        documentId: "doc",
        recipient: { address: "x@example.test" },
        retentionDays: 8,
      }).success,
    ).toBe(false);
  });
  it("stores envelope ciphertext and authenticates namespace, content hash and encryption key", async () => {
    const f = await fixture(),
      key = id("encrypted"),
      binding = `shared:${f.organizationId}:share:original`;
    await putSecureObject(f.env, key, binding, f.bytes, "application/pdf");
    const stored = (await bucket.get(key))!;
    expect(new Uint8Array(await stored.arrayBuffer())).not.toEqual(f.bytes);
    expect(stored.httpMetadata?.contentType).toBe("application/octet-stream");
    expect(stored.customMetadata?.binding).toBe(await secureSha256(binding));
    expect((await getSecureObject(f.env, key, binding, f.hash)).bytes).toEqual(
      f.bytes,
    );
    await expect(
      getSecureObject(f.env, key, `shared:other:${binding}`, f.hash),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    await expect(
      getSecureObject(f.env, key, binding, "0".repeat(64)),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    await expect(
      getSecureObject(
        { ...f.env, SECURE_DOCUMENTS_KEY: btoa("k".repeat(32)) },
        key,
        binding,
        f.hash,
      ),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    await expect(
      getSecureObject(
        { ...f.env, MODE: "production", SECURE_DOCUMENTS_KEY: undefined },
        key,
        binding,
        f.hash,
      ),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    // An immutable replay verifies the committed content instead of replacing it.
    await expect(
      putSecureObject(
        f.env,
        key,
        binding,
        new Uint8Array([1, 2, 3]),
        "application/pdf",
      ),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    expect((await getSecureObject(f.env, key, binding, f.hash)).bytes).toEqual(
      f.bytes,
    );
  });
  it("rotates the active wrapping key while retaining decryption of old objects and invitations", async () => {
    const f = await fixture(),
      oldKey = id("old-object"),
      newKey = id("new-object");
    const binding = `shared:${f.organizationId}:share:original`;
    await putSecureObject(f.env, oldKey, binding, f.bytes, "application/pdf");
    const oldSecret = await sealSecureSecret(
      f.env,
      binding,
      "opaque-synthetic-invitation",
    );
    // Exercise already stored metadata and two-part invitation ciphertext from
    // before key-version support; no object or link is rewritten on rotation.
    const stored = (await bucket.get(oldKey))!,
      metadata = { ...stored.customMetadata };
    delete metadata.keyId;
    await bucket.put(oldKey, await stored.arrayBuffer(), {
      customMetadata: metadata,
    });
    const legacySecret = oldSecret.split(".").slice(1).join(".");
    const rotated: Env = {
      ...f.env,
      SECURE_DOCUMENTS_KEY: undefined,
      SECURE_DOCUMENTS_KEY_ID: "v2",
      SECURE_DOCUMENTS_KEYS: JSON.stringify({
        v1: f.env.SECURE_DOCUMENTS_KEY,
        v2: btoa("n".repeat(32)),
      }),
    };
    expect(
      (await getSecureObject(rotated, oldKey, binding, f.hash)).bytes,
    ).toEqual(f.bytes);
    expect(await openSecureSecret(rotated, binding, oldSecret)).toBe(
      "opaque-synthetic-invitation",
    );
    expect(await openSecureSecret(rotated, binding, legacySecret)).toBe(
      "opaque-synthetic-invitation",
    );
    await putSecureObject(rotated, newKey, binding, f.bytes, "application/pdf");
    expect((await bucket.head(newKey))?.customMetadata?.keyId).toBe("v2");
    expect(
      (await getSecureObject(rotated, newKey, binding, f.hash)).bytes,
    ).toEqual(f.bytes);
    const newSecret = await sealSecureSecret(
      rotated,
      binding,
      "new-invitation",
    );
    expect(newSecret.startsWith("v2.")).toBe(true);
    expect(await openSecureSecret(rotated, binding, newSecret)).toBe(
      "new-invitation",
    );
    await expect(
      openSecureSecret(rotated, `${binding}:other-recipient`, newSecret),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    const retired: Env = {
      ...rotated,
      MODE: "production",
      SECURE_DOCUMENTS_KEYS: JSON.stringify({ v2: btoa("n".repeat(32)) }),
    };
    await expect(
      getSecureObject(retired, oldKey, binding, f.hash),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    await expect(
      openSecureSecret(retired, binding, legacySecret),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    expect(
      (await getSecureObject(retired, newKey, binding, f.hash)).bytes,
    ).toEqual(f.bytes);
  });
  it.each(["ciphertext", "wrapped_key"] as const)(
    "rejects tampering of %s in actual R2",
    async (part) => {
      const f = await fixture(),
        key = id("tampered"),
        binding = `personal:${f.recipient.userId}:pd:original`;
      await putSecureObject(f.env, key, binding, f.bytes, "application/pdf");
      const stored = (await bucket.get(key))!,
        ciphertext = new Uint8Array(await stored.arrayBuffer()),
        metadata = { ...stored.customMetadata };
      if (part === "ciphertext") ciphertext[0] ^= 1;
      else metadata.sealedKey = btoa("corrupt wrapped data key");
      await bucket.put(key, ciphertext, { customMetadata: metadata });
      await expect(
        getSecureObject(f.env, key, binding, f.hash),
      ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    },
  );
});

describe("secure distribution — asynchronous preparation and paid acceptance", () => {
  it("renders bounded batches, preserves immutable consent and replays a preparation without new storage or fees", async () => {
    const f = await fixture("simulation", 4),
      p = await prepared(f);
    expect(p.view.status).toBe("prepared");
    expect(
      f.renderer.mock.calls.map(([request]) => new URL(request.url).search),
    ).toEqual(["?startPage=1&pageCount=3", "?startPage=4&pageCount=1"]);
    expect((await f.service.prepare(f.ctx, p.input, p.key)).id).toBe(p.view.id);
    await expect(
      f.service.prepare(
        f.ctx,
        { ...p.input, recipient: { address: "different@example.test" } },
        p.key,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await financials(f, p.view.dispatchId!)).toMatchObject({
      charge: null,
      transport: null,
    });
    await expect(
      f.service.confirm(f.ctx, p.view.id, id("premature")),
    ).rejects.toMatchObject({ code: "HUMAN_APPROVAL_REQUIRED" });
    await expect(
      db
        .prepare(
          "UPDATE secure_distributions SET recipient_address='swapped@example.test' WHERE id=?",
        )
        .bind(p.view.id)
        .run(),
    ).rejects.toThrow("secure_distribution_immutable");
    await expect(
      db
        .prepare(
          "UPDATE secure_distribution_pages SET image_sha256=? WHERE distribution_id=?",
        )
        .bind("0".repeat(64), p.view.id)
        .run(),
    ).rejects.toThrow("secure_page_immutable");
    expect(
      await db
        .prepare("SELECT count(*) AS n FROM outbox WHERE organization_id=?")
        .bind(f.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("fails closed on a renderer hash mismatch before creating a dispatch, charge or delivery outbox", async () => {
    const f = await fixture();
    f.renderer.mockImplementationOnce(async () =>
      Response.json({
        sha256: "0".repeat(64),
        totalPages: 1,
        startPage: 1,
        pageCount: 1,
        nextPage: null,
        pages: [
          {
            page: 1,
            width: 10,
            height: 10,
            mimeType: "image/jpeg",
            imageBase64: "YWJj",
            imageSha256: "a".repeat(64),
            text: "",
            textTruncated: false,
          },
        ],
        rendering: { complete: true },
      }),
    );
    const input = secureDistributionInputSchema.parse({
      documentId: f.source.id,
      recipient: { address: f.recipient.email! },
    });
    const p = await f.service.prepare(f.ctx, input, id("bad-render"));
    await f.service.processRender(p.id);
    expect(await f.service.get(f.ctx, p.id)).toMatchObject({
      status: "failed",
      dispatchId: null,
      approved: false,
    });
    expect(
      await db
        .prepare("SELECT error_code FROM secure_distributions WHERE id=?")
        .bind(p.id)
        .first(),
    ).toEqual({ error_code: "SECURE_RENDER_INTEGRITY" });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM secure_distribution_charges WHERE organization_id=?",
        )
        .bind(f.organizationId)
        .first(),
    ).toEqual({ n: 0 });
    expect(
      await db
        .prepare("SELECT count(*) n FROM outbox WHERE organization_id=?")
        .bind(f.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it.each(["simulation", "production"] as const)(
    "charges a %s term once, separates transport and never refunds revocation",
    async (mode) => {
      const f = await fixture(mode),
        p = await accepted(f),
        fee = 248;
      const before = await financials(f, p.view.dispatchId!);
      expect(before.charge).toEqual({ amount_minor: fee, evidence: mode });
      expect(
        await db
          .prepare(
            "SELECT available_minor FROM pdf_validation_available_credits WHERE organization_id=? AND evidence=?",
          )
          .bind(f.organizationId, mode)
          .first(),
      ).toEqual({
        available_minor:
          5000 -
          fee -
          (mode === "production" ? p.view.quote.transportMinor : 0),
      });
      expect(
        await new DomainService(db, { mode }).usageActivity(f.ctx),
      ).toMatchObject({
        evidence: mode,
        totals: {
          amountMinor: fee,
          dispatchCount: 0,
          chargeCount: 1,
          activeDays: 1,
        },
      });
      expect(before.usage).toMatchObject({ confirmed_minor: fee });
      expect(before.transport).toEqual({
        amount_minor: p.view.quote.transportMinor,
      });
      if (mode === "production")
        expect(before.credit).toEqual({
          granted_minor: 5000,
          spent_minor: fee,
          reserved_minor: p.view.quote.transportMinor,
          available_minor: 5000 - fee - p.view.quote.transportMinor,
        });
      else expect(before.credit).toBeNull();
      await f.service.confirm(f.ctx, p.view.id, p.confirmKey);
      expect(await financials(f, p.view.dispatchId!)).toEqual(before);
      await f.service.revoke(f.ctx, p.view.id);
      await f.service.revoke(f.ctx, p.view.id);
      expect(await financials(f, p.view.dispatchId!)).toEqual(before);
      expect((await f.service.get(f.ctx, p.view.id)).status).toBe("revoked");
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM outbox WHERE organization_id=? AND dispatch_id=?",
          )
          .bind(f.organizationId, p.view.dispatchId)
          .first(),
      ).toEqual({ n: 1 });
      await expect(
        db
          .prepare(
            "DELETE FROM secure_distribution_charges WHERE organization_id=?",
          )
          .bind(f.organizationId)
          .run(),
      ).rejects.toThrow("secure_charge_immutable");
    },
  );
});

describe("personal copies — independent ownership and final authorization", () => {
  it.each(["strong", "verified_account"] as const)(
    "closes personal metadata access when %s Worker and database policies drift",
    async (accessMode) => {
      const f = await fixture("simulation", 1, accessMode);
      expect((await f.personal.list(f.recipient)).items).toEqual([]);
      await db
        .prepare(
          "UPDATE secure_document_authentication_policy SET mode=? WHERE id=1",
        )
        .bind(accessMode === "strong" ? "verified_account" : "strong")
        .run();
      await expect(f.personal.list(f.recipient)).rejects.toMatchObject({
        code: "DOCUMENT_AUTHENTICATION_REQUIRED",
        status: 403,
      });
    },
  );

  it("allows an authorized private deposit even when downloading the shared original is forbidden, then survives workshop revocation", async () => {
    const f = await fixture("simulation", 4),
      p = await bound(f);
    await expect(
      f.personal.download(f.recipient, p.view.id),
    ).rejects.toMatchObject({ code: "ORIGINAL_DOWNLOAD_FORBIDDEN" });
    const first = await f.personal.deposit(f.recipient, p.view.id);
    expect(first).toMatchObject({ status: "preparing", expiresAt: null });
    const op = (await db
      .prepare(
        "SELECT id,next_page,original_ready,status FROM secure_deposit_operations WHERE distribution_id=?",
      )
      .bind(p.view.id)
      .first<{
        id: string;
        next_page: number;
        original_ready: number;
        status: string;
      }>())!;
    expect(op).toMatchObject({
      next_page: 4,
      original_ready: 1,
      status: "preparing",
    });
    expect(f.queue).toHaveBeenCalledWith({
      dispatchId: `secure_deposit:${op.id}`,
    });
    await f.personal.processDeposit(op.id);
    const copy = await f.personal.deposit(f.recipient, p.view.id);
    expect(copy).toMatchObject({ id: first.id, status: "active" });
    expect(Date.parse(copy.expiresAt!) - Date.now()).toBeGreaterThan(
      364 * 86400000,
    );
    const personalView = await f.personal.get(f.recipient, copy.id);
    expect(personalView).toMatchObject({
      kind: "personal",
      status: "active",
      allowOriginalDownload: true,
    });
    expect(personalView.pages).toHaveLength(4);
    const original = await f.personal.download(f.recipient, copy.id);
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(f.bytes);
    const record = (await db
      .prepare("SELECT original_key FROM secure_personal_documents WHERE id=?")
      .bind(copy.id)
      .first<{ original_key: string }>())!;
    expect(record.original_key).not.toBe(p.row.original_key);
    await expect(
      getSecureObject(
        f.env,
        record.original_key,
        secureSharedBinding(p.row, "original"),
        f.hash,
      ),
    ).rejects.toMatchObject({ code: "SECURE_STORAGE_INTEGRITY" });
    const before = await financials(f, p.view.dispatchId!);
    await f.service.revoke(f.ctx, p.view.id);
    await expect(
      f.personal.page(f.recipient, p.view.id, 1),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await f.personal.page(f.recipient, copy.id, 4)).status).toBe(200);
    expect((await f.personal.get(f.recipient, copy.id)).status).toBe("active");
    expect(await financials(f, p.view.dispatchId!)).toEqual(before);
    const workshopEvents = await f.service.events(f.ctx, p.view.id);
    expect(
      workshopEvents.items.filter(
        (event) => event.type === "personal_copy_delivered",
      ),
    ).toHaveLength(1);
    expect(
      workshopEvents.items.some(
        (event) => event.type === "original_transfer_started",
      ),
    ).toBe(false);
    expect(
      await db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=?")
        .bind(f.recipient.userId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it.each(["deleted", "expired"] as const)(
    "does not restart or recharge an acquired personal copy after it becomes %s",
    async (status) => {
      const f = await fixture(),
        p = await bound(f);
      const copy = await f.personal.deposit(f.recipient, p.view.id);
      expect(copy.status).toBe("active");
      expect(await f.personal.get(f.recipient, p.view.id)).toMatchObject({
        allowVaultDeposit: false,
        depositedDocumentId: copy.id,
      });
      const before = await financials(f, p.view.dispatchId!);
      if (status === "deleted") await f.personal.remove(f.recipient, copy.id);
      else
        await db
          .prepare(
            "UPDATE secure_personal_documents SET status='expired' WHERE user_id=? AND id=?",
          )
          .bind(f.recipient.userId, copy.id)
          .run();
      const view = await f.personal.get(f.recipient, p.view.id);
      expect(view).toMatchObject({
        status: "active",
        allowVaultDeposit: false,
      });
      expect(view.depositedDocumentId).toBeUndefined();
      await expect(
        f.personal.deposit(f.recipient, p.view.id),
      ).rejects.toMatchObject({
        code: "PERSONAL_COPY_UNAVAILABLE",
        status: 410,
      });
      expect(await financials(f, p.view.dispatchId!)).toEqual(before);
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_personal_documents WHERE user_id=? AND source_distribution_id=?",
          )
          .bind(f.recipient.userId, p.view.id)
          .first(),
      ).toEqual({ n: 1 });
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_deposit_operations WHERE user_id=? AND distribution_id=?",
          )
          .bind(f.recipient.userId, p.view.id)
          .first(),
      ).toEqual({ n: 1 });
    },
  );
  it("denies a private copy unless it was authorized and paid in the immutable invitation", async () => {
    const f = await fixture(),
      p = await bound(f, {
        allowVaultDeposit: false,
        allowOriginalDownload: true,
      });
    expect(p.view.quote.personalMinor).toBe(0);
    await expect(
      f.personal.deposit(f.recipient, p.view.id),
    ).rejects.toMatchObject({ code: "PERSONAL_COPY_FORBIDDEN" });
    expect((await f.personal.download(f.recipient, p.view.id)).status).toBe(
      200,
    );
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM secure_deposit_operations WHERE distribution_id=?",
        )
        .bind(p.view.id)
        .first(),
    ).toEqual({ n: 0 });
  });
  it.each(
    (["strong", "verified_account"] as const).flatMap((accessMode) =>
      (["stale", "expired", "revoked"] as const).map((failure) => ({
        accessMode,
        failure,
      })),
    ),
  )(
    "resumes the same paid copy in $accessMode after $failure during final R2 awaits",
    async ({ accessMode, failure }) => {
      const f = await fixture("simulation", 1, accessMode),
        share = await bound(f),
        before = await financials(f, share.view.dispatchId!);
      let changed = false;
      const racedBucket = proxyBucket({
        get: (async (key: string) => {
          const object = await bucket.get(key);
          if (
            !changed &&
            key.startsWith(`secure/personal/${f.recipient.userId}/`) &&
            key.endsWith("/1.text")
          ) {
            changed = true;
            if (failure === "stale")
              await db
                .prepare(
                  "UPDATE personal_sessions SET authenticated_at=? WHERE token_hash=?",
                )
                .bind(
                  Math.floor(Date.now() / 1000) - 301,
                  f.recipient.tokenHash,
                )
                .run();
            else if (failure === "expired")
              await db
                .prepare(
                  "UPDATE personal_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?",
                )
                .bind(f.recipient.tokenHash)
                .run();
            else
              await db
                .prepare("DELETE FROM personal_sessions WHERE token_hash=?")
                .bind(f.recipient.tokenHash)
                .run();
          }
          return object;
        }) as R2Bucket["get"],
      });
      await expect(
        new PersonalDocumentsService({
          ...f.env,
          DOCUMENTS: racedBucket,
        }).deposit(f.recipient, share.view.id),
      ).rejects.toMatchObject({
        code:
          accessMode === "strong"
            ? "STRONG_AUTHENTICATION_REQUIRED"
            : "DOCUMENT_AUTHENTICATION_REQUIRED",
        status: 403,
      });
      expect(changed).toBe(true);
      const operation = (await db
        .prepare(
          "SELECT id,personal_document_id,status,auth_session_hash,lease_token,lease_expires_at FROM secure_deposit_operations WHERE organization_id=? AND distribution_id=? AND user_id=?",
        )
        .bind(f.organizationId, share.view.id, f.recipient.userId)
        .first<{
          id: string;
          personal_document_id: string;
          status: string;
          auth_session_hash: string | null;
          lease_token: string;
          lease_expires_at: string;
        }>())!;
      expect(operation).toMatchObject({
        status: "preparing",
        auth_session_hash: null,
        lease_token: "",
      });
      expect(Date.parse(operation.lease_expires_at)).toBeLessThanOrEqual(
        Date.now(),
      );
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_personal_documents WHERE source_distribution_id=?",
          )
          .bind(share.view.id)
          .first(),
      ).toEqual({ n: 0 });
      // The pending job is kept without a reusable credential, and neither a
      // recovery cron nor a duplicated queue delivery can publish it unattended.
      f.queue.mockClear();
      await f.personal.recoverPending();
      expect(f.queue).not.toHaveBeenCalled();
      await f.personal.processDeposit(operation.id);
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_personal_documents WHERE source_distribution_id=?",
          )
          .bind(share.view.id)
          .first(),
      ).toEqual({ n: 0 });
      const signedIn = await createPersonalBrowserSession(f.env, {
        userId: f.recipient.userId,
        verifiedEmail: f.recipient.email,
        mfa: accessMode === "strong",
        verifiedAccount: true,
        authenticatedAt: Math.floor(Date.now() / 1000),
        amr: accessMode === "strong" ? ["webauthn"] : ["pwd"],
        strongAuthentication: accessMode === "strong",
        authenticationPolicyVersion:
          accessMode === "strong" ? "guteneo-sensitive-v1" : null,
        identityIssuer: "https://fixture.invalid/",
        identitySubject: f.recipient.userId,
        development: false,
      });
      const cookie = signedIn.cookie.split(";")[0];
      const principal = await authenticatePersonalBrowser(
        new Request(`${origin}/api/personal/session`, {
          headers: { Cookie: cookie },
        }),
        f.env,
      );
      const retry = () =>
        handlePersonalDocumentRoute(
          new Request(
            `${origin}/api/personal/documents/${share.view.id}/deposit`,
            {
              method: "POST",
              headers: {
                Origin: origin,
                Cookie: cookie,
                "X-CSRF-Token": principal.csrfToken,
              },
            },
          ),
          f.env,
        );
      const response = await retry();
      expect(response?.status).toBe(200);
      const copy = (await response!.json()) as { id: string; status: string };
      expect(copy).toMatchObject({
        id: operation.personal_document_id,
        status: "active",
      });
      expect(await (await retry())!.json()).toMatchObject(copy);
      expect(await financials(f, share.view.dispatchId!)).toEqual(before);
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_deposit_operations WHERE organization_id=? AND distribution_id=?",
          )
          .bind(f.organizationId, share.view.id)
          .first(),
      ).toEqual({ n: 1 });
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_personal_documents WHERE source_distribution_id=?",
          )
          .bind(share.view.id)
          .first(),
      ).toEqual({ n: 1 });
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_document_events WHERE distribution_id=? AND type='personal_copy_delivered'",
          )
          .bind(share.view.id)
          .first(),
      ).toEqual({ n: 1 });
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_document_events WHERE personal_document_id=? AND type='personal_copy_received'",
          )
          .bind(copy.id)
          .first(),
      ).toEqual({ n: 1 });
      expect(
        await db
          .prepare(
            "SELECT auth_session_hash,status FROM secure_deposit_operations WHERE id=?",
          )
          .bind(operation.id)
          .first(),
      ).toEqual({ auth_session_hash: signedIn.tokenHash, status: "active" });
    },
  );
  it.each(["strong", "verified_account"] as const)(
    "rolls back and purges unpublished objects on workshop revocation in %s",
    async (accessMode) => {
      const f = await fixture("simulation", 1, accessMode),
        p = await bound(f);
      let revoked = false;
      const racedBucket = proxyBucket({
        get: (async (key: string) => {
          const object = await bucket.get(key);
          if (
            !revoked &&
            key.startsWith(`secure/personal/${f.recipient.userId}/`)
          ) {
            revoked = true;
            await f.service.revoke(f.ctx, p.view.id);
          }
          return object;
        }) as R2Bucket["get"],
      });
      const raced = new PersonalDocumentsService({
        ...f.env,
        DOCUMENTS: racedBucket,
      });
      await expect(raced.deposit(f.recipient, p.view.id)).rejects.toMatchObject(
        {
          code: "NOT_FOUND",
        },
      );
      expect(revoked).toBe(true);
      const operation = (await db
        .prepare(
          "SELECT id,personal_document_id,status FROM secure_deposit_operations WHERE distribution_id=?",
        )
        .bind(p.view.id)
        .first<{
          id: string;
          personal_document_id: string;
          status: string;
        }>())!;
      expect(operation.status).toBe("aborted");
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_personal_documents WHERE source_distribution_id=?",
          )
          .bind(p.view.id)
          .first(),
      ).toEqual({ n: 0 });
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_document_events WHERE distribution_id=? AND type='personal_copy_delivered'",
          )
          .bind(p.view.id)
          .first(),
      ).toEqual({ n: 0 });
      const prefix = `secure/personal/${f.recipient.userId}/${operation.personal_document_id}/`;
      expect((await bucket.list({ prefix })).objects.length).toBeGreaterThan(0);
      await maintainSecureObjects(f.env);
      expect((await bucket.list({ prefix })).objects).toEqual([]);
      expect(
        await db
          .prepare("SELECT scope FROM secure_object_purges WHERE resource_id=?")
          .bind(operation.id)
          .first(),
      ).toEqual({ scope: "deposit" });
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_distribution_charges WHERE distribution_id=?",
          )
          .bind(p.view.id)
          .first(),
      ).toEqual({ n: 1 });
    },
  );
  it.each(
    (["strong", "verified_account"] as const).flatMap((accessMode) =>
      (["expired", "revoked", "stale", "share_revoked"] as const).map(
        (change) => ({ accessMode, change }),
      ),
    ),
  )(
    "withholds decrypted page bytes in $accessMode when $change wins before authorization",
    async ({ accessMode, change }) => {
      const f = await fixture("simulation", 1, accessMode),
        p = await bound(f);
      let changed = false;
      const racedBucket = proxyBucket({
        get: (async (key: string) => {
          const object = await bucket.get(key);
          if (!changed && key.endsWith("1.image")) {
            changed = true;
            if (change === "expired")
              await db
                .prepare(
                  "UPDATE personal_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?",
                )
                .bind(f.recipient.tokenHash)
                .run();
            else if (change === "revoked")
              await db
                .prepare("DELETE FROM personal_sessions WHERE token_hash=?")
                .bind(f.recipient.tokenHash)
                .run();
            else if (change === "stale")
              await db
                .prepare(
                  "UPDATE personal_sessions SET authenticated_at=? WHERE token_hash=?",
                )
                .bind(
                  Math.floor(Date.now() / 1000) - 901,
                  f.recipient.tokenHash,
                )
                .run();
            else await f.service.revoke(f.ctx, p.view.id);
          }
          return object;
        }) as R2Bucket["get"],
      });
      await expect(
        new PersonalDocumentsService({ ...f.env, DOCUMENTS: racedBucket }).page(
          f.recipient,
          p.view.id,
          1,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(changed).toBe(true);
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_document_events WHERE distribution_id=? AND type='page_access_authorized'",
          )
          .bind(p.view.id)
          .first(),
      ).toEqual({ n: 0 });
    },
  );
  it("runs the verified-account lifecycle with no invented strong evidence, preserving account boundaries and fees", async () => {
    const f = await fixture("production", 1, "verified_account"),
      share = await bound(f);
    expect(f.owner).toMatchObject({
      identityVerified: true,
      mfa: false,
      strongAuthentication: false,
      authenticationPolicyVersion: null,
    });
    expect(f.recipient).toMatchObject({
      identityVerified: true,
      mfa: false,
      strongAuthentication: false,
      authenticationPolicyVersion: null,
    });
    expect(
      await db
        .prepare(
          "SELECT authentication_mode FROM secure_approval_evidence WHERE dispatch_id=?",
        )
        .bind(share.view.dispatchId)
        .first(),
    ).toEqual({ authentication_mode: "verified_account" });
    const before = await financials(f, share.view.dispatchId!);
    expect((await f.personal.page(f.recipient, share.view.id, 1)).status).toBe(
      200,
    );
    await expect(
      f.personal.download(f.recipient, share.view.id),
    ).rejects.toMatchObject({ code: "ORIGINAL_DOWNLOAD_FORBIDDEN" });
    const other = await fixture("production", 1, "verified_account");
    await expect(
      f.personal.get(other.recipient, share.view.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const copy = await f.personal.deposit(f.recipient, share.view.id);
    expect(copy.status).toBe("active");
    expect((await f.personal.download(f.recipient, copy.id)).status).toBe(200);
    await f.service.revoke(f.ctx, share.view.id);
    expect((await f.personal.get(f.recipient, copy.id)).status).toBe("active");
    await f.personal.remove(f.recipient, copy.id);
    expect((await f.personal.get(f.recipient, copy.id)).status).toBe("revoked");
    expect(await financials(f, share.view.dispatchId!)).toEqual(before);
  });
  it("keeps paid private objects out of general orphan deletion, and erases them after personal removal", async () => {
    const f = await fixture(),
      p = await bound(f),
      copy = await f.personal.deposit(f.recipient, p.view.id);
    expect(copy.status).toBe("active");
    const personalKey = (await db
      .prepare("SELECT original_key FROM secure_personal_documents WHERE id=?")
      .bind(copy.id)
      .first<{ original_key: string }>())!.original_key;
    const orphan = `orphan/${id("orphan")}`;
    await bucket.put(orphan, "synthetic orphan");
    const aged = proxyBucket({
      list: (async (options?: R2ListOptions) => {
        const listing = await bucket.list(options);
        return {
          ...listing,
          objects: listing.objects.map((object) => ({
            ...object,
            uploaded: new Date(Date.now() - 2 * 86400000),
          })),
        };
      }) as R2Bucket["list"],
    });
    await maintainDocuments({ ...f.env, DOCUMENTS: aged });
    expect(await bucket.head(orphan)).toBeNull();
    expect(await bucket.head(personalKey)).not.toBeNull();
    expect(await bucket.head(p.row.original_key!)).not.toBeNull();
    await f.personal.remove(f.recipient, copy.id);
    await maintainSecureObjects(f.env);
    expect(await bucket.head(personalKey)).toBeNull();
    expect(await bucket.head(p.row.original_key!)).not.toBeNull();
    await maintainSecureObjects(f.env);
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM secure_object_purges WHERE scope='personal' AND resource_id=?",
        )
        .bind(copy.id)
        .first(),
    ).toEqual({ n: 1 });
  });
  it("purges old activity detail while retaining current authorization and significant receipts", async () => {
    const f = await fixture(),
      p = await bound(f),
      old = new Date(Date.now() - 91 * 86400000).toISOString();
    const activity = id("sev"),
      receipt = id("sev");
    await db.batch([
      db
        .prepare(
          "INSERT INTO secure_document_events(id,organization_id,distribution_id,user_id,type,provenance,page_number,created_at) VALUES(?,?,?,?,'page_displayed','browser',1,?)",
        )
        .bind(
          activity,
          f.ctx.organizationId,
          p.view.id,
          f.recipient.userId,
          old,
        ),
      db
        .prepare(
          "INSERT INTO secure_document_events(id,organization_id,distribution_id,user_id,type,provenance,created_at) VALUES(?,?,?,?,'recipient_binding_confirmed','server',?)",
        )
        .bind(receipt, f.ctx.organizationId, p.view.id, f.ctx.userId, old),
    ]);
    expect((await f.personal.page(f.recipient, p.view.id, 1)).status).toBe(200);
    await maintainSecureObjects(f.env);
    expect(
      await db
        .prepare("SELECT 1 FROM secure_document_events WHERE id=?")
        .bind(activity)
        .first(),
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT 1 FROM secure_document_events WHERE id=?")
        .bind(receipt)
        .first(),
    ).not.toBeNull();
    expect(
      await db
        .prepare(
          "SELECT 1 FROM secure_document_events WHERE distribution_id=? AND type='page_access_authorized'",
        )
        .bind(p.view.id)
        .first(),
    ).not.toBeNull();
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM secure_distribution_charges WHERE distribution_id=?",
        )
        .bind(p.view.id)
        .first(),
    ).toEqual({ n: 1 });
  });
});
