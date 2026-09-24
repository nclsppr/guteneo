import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import {
  canonicalJson,
  sha256,
  DomainService,
  type ExpertDispatchAuthority,
} from "../../packages/domain/src/index";
import {
  emailRateComponents,
  insertDeliveryQuote,
  makeDeliveryQuote,
  resolveDeliveryPrice,
} from "../../packages/domain/src/live-delivery-quotes";
import {
  handleProtectedDocumentRoute,
  prepareProtectedDocument,
  revealProtectedDocumentPassword,
  revokeProtectedDocument,
  cleanupProtectedDocuments,
  type ProtectedDocumentsEnv,
} from "../../apps/api/src/protected-documents";
import { maintainDocuments } from "../../apps/api/src/maintenance";
import type { Env } from "../../apps/api/src/env";
import type { AuthContext } from "../../apps/api/src/auth";
import {
  type PreparedProtectedDocument,
  validateProtectedDocument,
} from "../../packages/domain/src/protected-documents";

let mf: Miniflare,
  db: D1Database,
  bucket: R2Bucket,
  env: ProtectedDocumentsEnv,
  ctx: AuthContext;
let documentId: string, hash: string, stamp: string;
const bytes = new TextEncoder().encode(
  "%PDF-1.7\nimmutable synthetic protected-document fixture\n%%EOF",
);
const identity = {
  provider: "resend" as const,
  accountId: "protected-fixture",
  routeId: "resend:protected-fixture:guteneo.com",
};
async function applySql(sql: string) {
  let statement = "",
    trigger = false;
  const statements: D1PreparedStatement[] = [];
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line} `;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      statements.push(db.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete fixture SQL");
  if (statements.length) await db.batch(statements);
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("fixture") } }',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await applySql(readFileSync(new URL(name, dir), "utf8"));
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  const suffix = crypto.randomUUID();
  stamp = new Date().toISOString();
  ctx = {
    organizationId: `org_${suffix}`,
    userId: `user_${suffix}`,
    role: "admin",
    actor: "browser",
  };
  documentId = `doc_${suffix}`;
  hash = await sha256(bytes);
  env = {
    DB: db,
    DOCUMENTS: bucket,
    APP_ORIGIN: "https://guteneo.example",
    MODE: "production",
    ENVIRONMENT: "production",
    PROTECTED_DOCUMENTS_KEY: "x".repeat(43),
  };
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Fixture','production',?)",
      )
      .bind(ctx.organizationId, stamp),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Fixture',?,?)",
      )
      .bind(ctx.userId, `${suffix}@example.invalid`, stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(ctx.organizationId, ctx.userId, stamp),
    db
      .prepare(
        "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at) VALUES(?,?,'Private fixture.pdf',?,?,1,'ready','import',?,'2020-01-01T00:00:00.000Z')",
      )
      .bind(documentId, ctx.organizationId, hash, bytes.length, documentId),
    db
      .prepare(
        "INSERT INTO audit_log VALUES(?,?,?,'document.scan_verified',?,'{}',?)",
      )
      .bind(`scan_${suffix}`, ctx.organizationId, ctx.userId, hash, stamp),
    db
      .prepare(
        "INSERT INTO senders VALUES(?,?,'email','Fixture','documents@guteneo.com','verified','production',?)",
      )
      .bind(`sender_${suffix}`, ctx.organizationId, stamp),
    db
      .prepare(
        "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,'email',?,100,5000,'EUR')",
      )
      .bind(ctx.organizationId, stamp.slice(0, 7)),
    db
      .prepare("INSERT INTO channel_controls VALUES(?,'email',1)")
      .bind(ctx.organizationId),
  ]);
  await bucket.put(documentId, bytes);
  const rate = {
    usdMicrosPerMessage: 100,
    eurPerUsdNumerator: 1,
    eurPerUsdDenominator: 1,
    attachmentBasis: "no_attachments" as const,
  };
  const c = emailRateComponents(rate);
  await db
    .prepare(
      "INSERT INTO trusted_delivery_costs(id,organization_id,sender_id,channel,provider,account_id,route_id,options_json,rate_json,base_numerator,byte_numerator,rate_denominator,currency,fiscal_basis,quote_ttl_seconds,source_reference,source_sha256,valid_from,expires_at,status,created_at) VALUES(?,?,?,'email','resend',?,?,'{}',?,?,?,?,'EUR','qualified_final_variable_cost',900,'SYNTHETIC FIXTURE',?,?,?,'qualified',?)",
    )
    .bind(
      `policy_${suffix}`,
      ctx.organizationId,
      `sender_${suffix}`,
      identity.accountId,
      identity.routeId,
      canonicalJson(rate),
      c.base_numerator,
      c.byte_numerator,
      c.rate_denominator,
      "b".repeat(64),
      stamp,
      new Date(Date.now() + 3600000).toISOString(),
      stamp,
    )
    .run();
});
async function prepare(
  protection: PreparedProtectedDocument,
  ceilingOverride?: number,
) {
  const id = `dsp_${crypto.randomUUID()}`;
  const sender = await db
    .prepare("SELECT id FROM senders WHERE organization_id=?")
    .bind(ctx.organizationId)
    .first<{ id: string }>();
  const { url, currency: _currency, ...descriptor } = protection;
  const options = {
    emailDeliveryMode: "protected_link",
    protectedDocument: descriptor,
  };
  const recipient = { email: "recipient@example.invalid" };
  const price = await resolveDeliveryPrice(db, {
    organizationId: ctx.organizationId,
    senderId: sender!.id,
    channel: "email",
    recipient,
    options,
    document: { id: documentId, sha256: hash, size: bytes.length },
    identity,
    now: stamp,
  });
  const frozen = {
    channel: "email",
    recipient,
    documentId,
    documentSha256: hash,
    senderId: sender!.id,
    senderAddress: "documents@guteneo.com",
    subject: "Fixture",
    html: `<p>${url}</p>`,
    text: url,
    options,
    campaignId: null,
    estimatedMinor: price.amountMinor + protection.hostingFeeMinor,
    ceilingMinor:
      ceilingOverride ?? price.amountMinor + protection.hostingFeeMinor,
    currency: "EUR",
    mode: "production",
  };
  const quote = await makeDeliveryQuote(
    id,
    ctx.organizationId,
    frozen,
    price,
    stamp,
  );
  const fingerprint = await sha256(
    canonicalJson({ ...frozen, quoteFingerprint: quote.fingerprint }),
  );
  quote.dispatch_fingerprint = fingerprint;
  await db.batch([
    db
      .prepare(
        "INSERT INTO dispatches(id,organization_id,channel,recipient_json,document_id,sender_id,sender_address,subject,html,text,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at,quote_fingerprint) VALUES(?,?,'email',?,?,?,'documents@guteneo.com','Fixture',?, ?,?,'prepared','production',?,?,'EUR',?,?,?,?,?,?)",
      )
      .bind(
        id,
        ctx.organizationId,
        canonicalJson(recipient),
        documentId,
        sender!.id,
        frozen.html,
        frozen.text,
        canonicalJson(options),
        frozen.estimatedMinor,
        frozen.ceilingMinor,
        fingerprint,
        id,
        await sha256(id),
        stamp,
        stamp,
        quote.fingerprint,
      ),
    insertDeliveryQuote(db, quote),
  ]);
  await db
    .prepare(
      "INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at,recipient_requested) VALUES(?,?,?,?,?,?,?,1)",
    )
    .bind(
      `approval_${id}`,
      ctx.organizationId,
      id,
      ctx.userId,
      fingerprint,
      quote.expires_at,
      stamp,
    )
    .run();
  return id;
}
async function accept(id: string) {
  await db
    .prepare(
      "UPDATE dispatches SET status='queued',updated_at=? WHERE organization_id=? AND id=? AND status='prepared'",
    )
    .bind(stamp, ctx.organizationId, id)
    .run();
}
async function balance() {
  return db
    .prepare(
      "SELECT reserved_minor,spent_minor,available_minor FROM welcome_credit_balances WHERE organization_id=?",
    )
    .bind(ctx.organizationId)
    .first();
}
async function hosting() {
  return prepareProtectedDocument(env, ctx, { documentId });
}
async function unlock(url: string, password: string) {
  return (await handleProtectedDocumentRoute(
    new Request(`${url}/unlock`, {
      method: "POST",
      headers: {
        Origin: env.APP_ORIGIN,
        "Content-Type": "application/x-www-form-urlencoded",
        "CF-Connecting-IP": "192.0.2.7",
      },
      body: new URLSearchParams({ password }),
    }),
    env,
  ))!;
}

describe("protected PDF hosting on local D1 and private R2", () => {
  it.each(["browser", "expert"] as const)(
    "blocks a prepare-only %s approval atomically while permitting another human in the same organization",
    async (kind) => {
      const issuer = "https://review-fixture.example/",
        subject = `synthetic_${ctx.userId}`;
      await db
        .prepare(
          "INSERT INTO restricted_delivery_identities(issuer,subject) VALUES(?,?)",
        )
        .bind(issuer, subject)
        .run();
      await db
        .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
        .bind(issuer, subject, ctx.userId, stamp)
        .run();
      const h = await hosting(),
        id = await prepare(h);
      let proof: ExpertDispatchAuthority | undefined;
      if (kind === "expert") {
        const connection = `conn_${crypto.randomUUID()}`,
          reviewHash = await sha256(crypto.randomUUID()),
          expiry = new Date(Date.parse(stamp) + 3600000).toISOString();
        await db.batch([
          db
            .prepare(
              "INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,not_before,created_at,updated_at) VALUES(?,?,?,'synthetic-expert',?,'active',0,?,?)",
            )
            .bind(
              connection,
              issuer,
              ctx.userId,
              ctx.organizationId,
              stamp,
              stamp,
            ),
          db
            .prepare(
              "INSERT INTO expert_approval_policies(connection_id,organization_id,user_id,enabled,revision,channels_json,max_per_dispatch_minor,max_daily_minor,max_daily_count,expires_at,created_at,updated_at) VALUES(?,?,?,1,1,'[\"email\"]',200,500,10,?,?,?)",
            )
            .bind(
              connection,
              ctx.organizationId,
              ctx.userId,
              expiry,
              stamp,
              stamp,
            ),
          db
            .prepare(
              "INSERT INTO expert_dispatch_reviews(token_hash,organization_id,dispatch_id,user_id,connection_id,policy_revision,connection_updated_at,fingerprint,ceiling_minor,expires_at,created_at) SELECT ?,organization_id,id,?,?,1,?,fingerprint,ceiling_minor,?,? FROM dispatches WHERE organization_id=? AND id=?",
            )
            .bind(
              reviewHash,
              ctx.userId,
              connection,
              stamp,
              expiry,
              stamp,
              ctx.organizationId,
              id,
            ),
          db
            .prepare(
              "UPDATE approvals SET approval_kind='expert',expert_review_hash=? WHERE organization_id=? AND dispatch_id=?",
            )
            .bind(reviewHash, ctx.organizationId, id),
        ]);
        proof = {
          reviewHash,
          connectionId: connection,
          condition:
            "EXISTS(SELECT 1 FROM authorized_connections WHERE id=? AND status='active')",
          values: [connection],
        };
      }
      const domain = new DomainService(db, {
        mode: "production",
        liveDeliveryIdentity: { email: identity },
        now: () => Date.parse(stamp),
      });
      await expect(
        domain.confirmDispatch(
          { ...ctx, actor: kind === "expert" ? "mcp" : "browser" },
          id,
          crypto.randomUUID(),
          proof,
        ),
      ).rejects.toMatchObject({ code: "PREPARE_ONLY_ACCOUNT", status: 403 });
      expect(await balance()).toMatchObject({
        reserved_minor: 0,
        spent_minor: 0,
      });
      expect(
        await db
          .prepare("SELECT status FROM protected_document_hostings WHERE id=?")
          .bind(h.hostingId)
          .first(),
      ).toEqual({ status: "draft" });
      expect(
        await db
          .prepare("SELECT COUNT(*) AS n FROM outbox WHERE dispatch_id=?")
          .bind(id)
          .first(),
      ).toEqual({ n: 0 });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM expert_approval_acceptances WHERE dispatch_id=?",
          )
          .bind(id)
          .first(),
      ).toEqual({ n: 0 });
      expect(
        await db
          .prepare(
            "SELECT reserved_minor,confirmed_minor FROM usage WHERE organization_id=?",
          )
          .bind(ctx.organizationId)
          .first(),
      ).toEqual({ reserved_minor: 0, confirmed_minor: 0 });
      const normalUser = `user_${crypto.randomUUID()}`;
      await db.batch([
        db
          .prepare(
            "INSERT INTO users(id,name,email,created_at) VALUES(?,'Normal human','normal@example.invalid',?)",
          )
          .bind(normalUser, stamp),
        db
          .prepare(
            "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
          )
          .bind(ctx.organizationId, normalUser, stamp),
      ]);
      ctx = { ...ctx, userId: normalUser };
      const normalId = await prepare(h);
      await expect(
        domain.confirmDispatch(ctx, normalId, crypto.randomUUID()),
      ).resolves.toMatchObject({ status: "queued" });
      expect(await balance()).toMatchObject({
        spent_minor: 100,
        reserved_minor: 1,
      });
    },
  );
  it("keeps drafts private, hides generated secrets, and reuses a concurrent immutable document preparation", async () => {
    const [a, b] = await Promise.all([hosting(), hosting()]);
    expect(a.hostingId).toBe(b.hostingId);
    expect(a.url).toBe(b.url);
    expect(a.hostingFeeMinor).toBe(100);
    expect(a).not.toHaveProperty("password");
    expect(
      await validateProtectedDocument(
        db,
        ctx.organizationId,
        documentId,
        a,
        stamp,
        true,
      ),
    ).toBe(false);
    const raw = JSON.stringify(
      await db
        .prepare("SELECT * FROM protected_document_hostings WHERE id=?")
        .bind(a.hostingId)
        .first(),
    );
    expect(raw).not.toContain(a.url.split("/").at(-1));
    expect(
      (await handleProtectedDocumentRoute(new Request(a.url), env))!.status,
    ).toBe(404);
    expect(await balance()).toMatchObject({
      spent_minor: 0,
      reserved_minor: 0,
    });
  });
  it("charges hosting once with concurrent approvals; transport reserves separately and cancellation retains the hosting service", async () => {
    const h = await hosting();
    const [a, b] = await Promise.all([prepare(h), prepare(h)]);
    await Promise.all([accept(a), accept(b)]);
    expect(
      await validateProtectedDocument(
        db,
        ctx.organizationId,
        documentId,
        h,
        stamp,
        true,
      ),
    ).toBe(true);
    expect(
      await validateProtectedDocument(
        db,
        ctx.organizationId,
        documentId,
        h,
        h.expiresAt,
        true,
      ),
    ).toBe(false);
    expect(await balance()).toMatchObject({
      spent_minor: 100,
      reserved_minor: 2,
      available_minor: 4898,
    });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS n FROM protected_hosting_charges WHERE organization_id=?",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ n: 1 });
    expect(
      await db
        .prepare(
          "SELECT reserved_minor,confirmed_minor FROM usage WHERE organization_id=?",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toMatchObject({ reserved_minor: 2, confirmed_minor: 100 });
    await db
      .prepare(
        "UPDATE dispatches SET status='cancelled' WHERE organization_id=? AND id IN (?,?)",
      )
      .bind(ctx.organizationId, a, b)
      .run();
    expect(await balance()).toMatchObject({
      spent_minor: 100,
      reserved_minor: 0,
    });
    expect(
      await db
        .prepare(
          "SELECT reserved_minor,confirmed_minor FROM usage WHERE organization_id=?",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toMatchObject({ reserved_minor: 0, confirmed_minor: 100 });
    expect((await hosting()).hostingFeeMinor).toBe(0);
  });
  it("rolls back hosting, outbox and quota when monthly budget is insufficient", async () => {
    const h = await hosting(),
      id = await prepare(h);
    await db
      .prepare("UPDATE usage SET limit_minor=100 WHERE organization_id=?")
      .bind(ctx.organizationId)
      .run();
    await expect(accept(id)).rejects.toThrow("quota_exceeded");
    expect(
      await db
        .prepare("SELECT status FROM protected_document_hostings WHERE id=?")
        .bind(h.hostingId)
        .first(),
    ).toEqual({ status: "draft" });
    expect(await balance()).toMatchObject({
      spent_minor: 0,
      reserved_minor: 0,
    });
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM outbox WHERE organization_id=?")
        .bind(ctx.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("rolls back a new hosting charge when the shared balance cannot cover hosting plus transport", async () => {
    const first = await hosting(),
      firstId = await prepare(first, 4900);
    await accept(firstId);
    expect(await balance()).toMatchObject({
      spent_minor: 100,
      reserved_minor: 4800,
      available_minor: 100,
    });
    await revokeProtectedDocument(env, ctx, firstId);
    await db
      .prepare("UPDATE usage SET limit_minor=10000 WHERE organization_id=?")
      .bind(ctx.organizationId)
      .run();
    const renewal = await hosting(),
      secondId = await prepare(renewal);
    expect(renewal.hostingId).not.toBe(first.hostingId);
    await expect(accept(secondId)).rejects.toThrow("credit_exhausted");
    expect(await balance()).toMatchObject({
      spent_minor: 100,
      reserved_minor: 4800,
      available_minor: 100,
    });
    expect(
      await db
        .prepare("SELECT status FROM protected_document_hostings WHERE id=?")
        .bind(renewal.hostingId)
        .first(),
    ).toEqual({ status: "draft" });
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM outbox WHERE dispatch_id=?")
        .bind(secondId)
        .first(),
    ).toEqual({ n: 0 });
    expect(
      await db
        .prepare(
          "SELECT reserved_minor,confirmed_minor FROM usage WHERE organization_id=?",
        )
        .bind(ctx.organizationId)
        .first(),
    ).toMatchObject({ reserved_minor: 4800, confirmed_minor: 100 });
  });
  it("requires browser authority for password, unlocks without consuming GETs, streams exact bytes, and revokes existing sessions", async () => {
    const h = await hosting(),
      id = await prepare(h);
    await accept(id);
    await expect(
      revealProtectedDocumentPassword(env, { ...ctx, actor: "mcp" }, id),
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
    const secret = await revealProtectedDocumentPassword(env, ctx, id);
    expect(secret.password).toHaveLength(24);
    const saved = JSON.stringify(
      await db
        .prepare("SELECT * FROM protected_document_hostings WHERE id=?")
        .bind(h.hostingId)
        .first(),
    );
    expect(saved).not.toContain(secret.password);
    const locked = (await handleProtectedDocumentRoute(
      new Request(h.url),
      env,
    ))!;
    expect(locked.status).toBe(200);
    expect(await locked.text()).not.toContain("Private fixture.pdf");
    expect(
      (await handleProtectedDocumentRoute(
        new Request(`${h.url}/content`),
        env,
      ))!.status,
    ).toBe(401);
    const opened = await unlock(h.url, secret.password);
    expect(opened.status).toBe(303);
    expect(opened.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(opened.headers.get("Set-Cookie")).toContain("SameSite=Strict");
    const cookie = opened.headers.get("Set-Cookie")!.split(";")[0];
    const result = (await handleProtectedDocumentRoute(
      new Request(`${h.url}/content`, { headers: { Cookie: cookie } }),
      env,
    ))!;
    expect(result.status).toBe(200);
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    await revokeProtectedDocument(env, ctx, id);
    expect(
      await validateProtectedDocument(
        db,
        ctx.organizationId,
        documentId,
        h,
        stamp,
        true,
      ),
    ).toBe(false);
    expect(
      (await handleProtectedDocumentRoute(
        new Request(`${h.url}/content`, { headers: { Cookie: cookie } }),
        env,
      ))!.status,
    ).toBe(404);
    expect(await balance()).toMatchObject({ spent_minor: 100 });
  });
  it("isolates tenants, rejects corrupted PDF bytes, and limits guesses", async () => {
    const h = await hosting(),
      id = await prepare(h);
    await accept(id);
    const { password } = await revealProtectedDocumentPassword(env, ctx, id);
    await expect(
      revealProtectedDocumentPassword(
        env,
        { ...ctx, organizationId: "other" },
        id,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const response = await unlock(h.url, password),
      cookie = response.headers.get("Set-Cookie")!.split(";")[0];
    await bucket.put(documentId, new Uint8Array(bytes.length));
    expect(
      (await handleProtectedDocumentRoute(
        new Request(`${h.url}/content`, { headers: { Cookie: cookie } }),
        env,
      ))!.status,
    ).toBe(404);
    let last: Response | undefined;
    for (let n = 0; n < 10; n++) last = await unlock(h.url, "wrong");
    expect(last!.status).toBe(429);
  });
  it("protects active hosting from the 90-day purge and expires both access and secrets", async () => {
    const h = await hosting(),
      id = await prepare(h);
    await accept(id);
    await db
      .prepare("UPDATE dispatches SET status='cancelled' WHERE id=?")
      .bind(id)
      .run();
    await maintainDocuments(env as Env);
    expect(await bucket.head(documentId)).not.toBeNull();
    expect(
      await db
        .prepare("SELECT status FROM documents WHERE id=?")
        .bind(documentId)
        .first(),
    ).toEqual({ status: "ready" });
    const later = new Date(Date.parse(h.expiresAt) + 1000).toISOString();
    await cleanupProtectedDocuments(db, later);
    expect(
      (await handleProtectedDocumentRoute(new Request(h.url), env, later))!
        .status,
    ).toBe(404);
    expect(
      await db
        .prepare(
          "SELECT status,sealed_secrets FROM protected_document_hostings WHERE id=?",
        )
        .bind(h.hostingId)
        .first(),
    ).toEqual({ status: "expired", sealed_secrets: "" });
    // The bounded cursor completes its current scan before revisiting this row.
    await maintainDocuments(env as Env);
    await maintainDocuments(env as Env);
    expect(await bucket.head(documentId)).toBeNull();
  });
});
