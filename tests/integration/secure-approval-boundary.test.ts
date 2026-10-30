import { readFile, readdir } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  DomainService,
  canonicalJson,
  type ActorContext,
  type ExpertDispatchAuthority,
} from "../../packages/domain/src/index";
import {
  authenticateBrowser,
  handleAuthRoute,
  publicSession,
  type AuthEnv,
} from "../../apps/api/src/auth";
import {
  SECURE_DISTRIBUTION_PRICE_VERSION,
  secureDistributionQuote,
  type SecureDistributionDescriptor,
} from "../../packages/contracts/src/secure-distribution";

let mf: Miniflare;
let db: D1Database;
let domain: DomainService;
let auth: AuthEnv;
const origin = "http://localhost:8787";
const iso = () => new Date().toISOString();
const hex = () => crypto.randomUUID().replaceAll("-", "").repeat(2);
const base: ActorContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
};
const request = (
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`${origin}${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function apply(sql: string) {
  let statement = "",
    trigger = false;
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line}\n`;
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
      name: "secure-approval-boundary",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
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
  await apply(
    await readFile(new URL("../../scripts/seed.sql", import.meta.url), "utf8"),
  );
  auth = {
    DB: db,
    APP_ORIGIN: origin,
    ENVIRONMENT: "local",
    MODE: "simulation",
  };
  domain = new DomainService(db, { mode: "simulation" });
});
afterEach(async () => {
  await db.prepare("UPDATE secure_document_authentication_policy SET mode='strong' WHERE id=1").run();
});
afterAll(async () => {
  await mf?.dispose();
});
async function browser(organization = "atelier") {
  const response = await handleAuthRoute(
    request("/api/dev/login", "POST", { organization }),
    auth,
  );
  const cookie = response!.headers.get("Set-Cookie")!.split(";")[0];
  const session = await authenticateBrowser(
    request("/api/session", "GET", undefined, { Cookie: cookie }),
    auth,
  );
  return { session, cookie, ctx: session.context };
}
async function preparation() {
  const source = await domain.registerDocument(base, {
    name: "Confidentiel.pdf",
    sha256: hex(),
    size: 100,
    pages: 1,
    status: "ready",
    source: "import",
    storageKey: `synthetic/${crypto.randomUUID()}`,
  });
  const id = `sd_${crypto.randomUUID().replaceAll("-", "")}`,
    time = iso();
  const policy = {
    retentionDays: 7 as const,
    allowOriginalDownload: false,
    allowVaultDeposit: false,
    personalRetentionDays: 365 as const,
  };
  const descriptor: SecureDistributionDescriptor = {
    distributionId: id,
    sourceId: source.id,
    sourceSha256: source.sha256,
    manifestSha256: hex(),
    policy,
    serviceFeeMinor: 49,
    priceVersion: SECURE_DISTRIBUTION_PRICE_VERSION,
    preparedExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  await db
    .prepare(
      `INSERT INTO secure_distributions(id,organization_id,source_id,source_sha256,source_name,source_pages,created_by,request_key,request_hash,recipient_address,token_hash,sealed_token,policy_json,quote_json,input_json,service_fee_minor,price_version,status,manifest_sha256,created_at,prepared_expires_at)
    VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,'prepared',?,?,?)`,
    )
    .bind(
      id,
      base.organizationId,
      source.id,
      source.sha256,
      source.name,
      base.userId,
      id,
      hex(),
      "recipient@example.test",
      hex(),
      "synthetic-sealed-secret",
      canonicalJson(policy),
      JSON.stringify(secureDistributionQuote(policy)),
      JSON.stringify({
        subject: "Notification",
        message: "Votre document",
        documentId: source.id,
        recipient: { address: "recipient@example.test" },
        ...policy,
      }),
      49,
      SECURE_DISTRIBUTION_PRICE_VERSION,
      descriptor.manifestSha256,
      time,
      descriptor.preparedExpiresAt,
    )
    .run();
  await db
    .prepare(
      "INSERT INTO secure_distribution_pages(organization_id,distribution_id,page_number,image_key,image_sha256,text_key,text_sha256,width,height,created_at) VALUES(?,?,1,?,?,?,?,100,100,?)",
    )
    .bind(
      base.organizationId,
      id,
      `${id}/image`,
      hex(),
      `${id}/text`,
      hex(),
      time,
    )
    .run();
  const dispatch = await domain.prepareSecureDistributionDispatch(
    base,
    {
      channel: "email",
      recipient: { email: "recipient@example.test" },
      subject: "Notification",
      text: "Lien opaque de simulation",
      ceilingMinor: 1000,
    },
    `secure_${id}`,
    descriptor,
  );
  await db
    .prepare(
      "UPDATE secure_distributions SET dispatch_id=? WHERE organization_id=? AND id=?",
    )
    .bind(dispatch.id, base.organizationId, id)
    .run();
  return { id, source, dispatch, descriptor };
}
const mcp = (ctx: ActorContext): ActorContext => ({
  ...ctx,
  actor: "mcp",
  documentSessionHash: undefined,
});
const allow = { condition: "1=1", values: [] };
async function counts(dispatchId: string) {
  return db
    .prepare(
      `SELECT (SELECT count(*) FROM approvals WHERE dispatch_id=?) approvals,(SELECT count(*) FROM secure_approval_evidence WHERE dispatch_id=?) evidence,(SELECT count(*) FROM reservations WHERE dispatch_id=?) reservations,(SELECT count(*) FROM outbox WHERE dispatch_id=?) outbox,(SELECT count(*) FROM secure_distribution_charges WHERE dispatch_id=?) charges`,
    )
    .bind(dispatchId, dispatchId, dispatchId, dispatchId, dispatchId)
    .first();
}
async function expertProof(
  fixture: Awaited<ReturnType<typeof preparation>>,
): Promise<ExpertDispatchAuthority> {
  const connection = `connection_${crypto.randomUUID()}`,
    reviewHash = hex(),
    time = iso();
  await db
    .prepare(
      "INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)",
    )
    .bind(
      connection,
      "https://expert.example.test/",
      base.userId,
      connection,
      base.organizationId,
      time,
      time,
    )
    .run();
  await db
    .prepare(
      "INSERT INTO expert_approval_policies(connection_id,organization_id,user_id,enabled,revision,channels_json,max_per_dispatch_minor,max_daily_minor,max_daily_count,expires_at,created_at,updated_at) VALUES(?,?,?,1,1,'[\"email\"]',10000,50000,100,?,?,?)",
    )
    .bind(
      connection,
      base.organizationId,
      base.userId,
      new Date(Date.now() + 3600000).toISOString(),
      time,
      time,
    )
    .run();
  await db
    .prepare(
      "INSERT INTO expert_dispatch_reviews(token_hash,organization_id,dispatch_id,user_id,connection_id,policy_revision,connection_updated_at,fingerprint,ceiling_minor,expires_at,created_at) VALUES(?,?,?,?,?,1,?,?,?,?,?)",
    )
    .bind(
      reviewHash,
      base.organizationId,
      fixture.dispatch.id,
      base.userId,
      connection,
      time,
      fixture.dispatch.fingerprint,
      fixture.dispatch.ceiling_minor,
      new Date(Date.now() + 300000).toISOString(),
      time,
    )
    .run();
  expect(
    await db
      .prepare("SELECT 1 FROM valid_expert_dispatch_reviews WHERE token_hash=?")
      .bind(reviewHash)
      .first(),
  ).not.toBeNull();
  return {
    reviewHash,
    connectionId: connection,
    condition:
      "EXISTS(SELECT 1 FROM valid_expert_dispatch_reviews WHERE token_hash=?)",
    values: [reviewHash],
  };
}

describe("secure dispatch approvals cannot escape through legacy paths", () => {
  it("keeps the actual browser credential hash internal to the authenticated context", async () => {
    const { session } = await browser();
    expect(session.context.documentSessionHash).toBe(session.tokenHash);
    expect(JSON.stringify(publicSession(session))).not.toContain(
      session.tokenHash,
    );
  });
  it("rejects a fabricated browser actor without an authenticated credential", async () => {
    const f = await preparation();
    await expect(
      domain.approveDispatch(base, f.dispatch.id, f.dispatch.fingerprint),
    ).rejects.toMatchObject({ code: "STRONG_BROWSER_APPROVAL_REQUIRED" });
    expect(await counts(f.dispatch.id)).toEqual({
      approvals: 0,
      evidence: 0,
      reservations: 0,
      outbox: 0,
      charges: 0,
    });
  });
  it("rejects the generic expert path even with a currently valid mandate and review", async () => {
    const f = await preparation(),
      proof = await expertProof(f);
    await expect(
      domain.approveExpertDispatch(
        mcp(base),
        f.dispatch.id,
        f.dispatch.fingerprint,
        proof,
      ),
    ).rejects.toMatchObject({ code: "STRONG_BROWSER_APPROVAL_REQUIRED" });
    await expect(
      domain.confirmDispatch(
        mcp(base),
        f.dispatch.id,
        "expert_confirm",
        proof,
        allow,
      ),
    ).rejects.toMatchObject({ code: "STRONG_BROWSER_APPROVAL_REQUIRED" });
    expect(await counts(f.dispatch.id)).toEqual({
      approvals: 0,
      evidence: 0,
      reservations: 0,
      outbox: 0,
      charges: 0,
    });
  });
  it("rejects weak, stale, cross-user and revoked browser credentials before recording consent", async () => {
    const f = await preparation(),
      weak = await browser(),
      stale = await browser(),
      other = await browser("studio"),
      revoked = await browser();
    await db
      .prepare(
        "UPDATE personal_sessions SET strong_authentication=0 WHERE token_hash=?",
      )
      .bind(weak.session.tokenHash)
      .run();
    await db
      .prepare(
        "UPDATE personal_sessions SET authenticated_at=? WHERE token_hash=?",
      )
      .bind(Math.floor(Date.now() / 1000) - 901, stale.session.tokenHash)
      .run();
    await db
      .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
      .bind(revoked.session.tokenHash)
      .run();
    for (const ctx of [
      weak.ctx,
      stale.ctx,
      { ...base, documentSessionHash: other.session.tokenHash },
      revoked.ctx,
    ])
      await expect(
        domain.approveDispatch(ctx, f.dispatch.id, f.dispatch.fingerprint),
      ).rejects.toMatchObject({ code: "STRONG_BROWSER_APPROVAL_REQUIRED" });
    expect(await counts(f.dispatch.id)).toEqual({
      approvals: 0,
      evidence: 0,
      reservations: 0,
      outbox: 0,
      charges: 0,
    });
  });
  it("records verified-account consent honestly, keeps strict mode closed and confirms once with current OAuth authority", async () => {
    const f=await preparation(), b=await browser();
    const normal=new DomainService(db,{mode:"simulation",sensitiveDocumentAuthentication:"verified_account"});
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1").run();
    await db.prepare("INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://fixture.invalid/',?,?,?)").bind(base.userId,base.userId,iso()).run();
    await db.batch([
      db.prepare("UPDATE personal_sessions SET is_development=0,strong_authentication=0,authentication_policy_version=NULL,mfa=0,amr_json='[]',verified_account=1,identity_issuer='https://fixture.invalid/',identity_subject=? WHERE token_hash=?").bind(base.userId,b.session.tokenHash),
      db.prepare("UPDATE browser_sessions SET is_development=0 WHERE token_hash=?").bind(b.session.tokenHash),
    ]);
    await normal.approveDispatch(b.ctx,f.dispatch.id,f.dispatch.fingerprint);
    const receipt=await db.prepare("SELECT authentication_mode,session_hash FROM secure_approval_evidence WHERE dispatch_id=?").bind(f.dispatch.id).first();
    expect(receipt).toEqual({authentication_mode:"verified_account",session_hash:b.session.tokenHash});
    expect(await db.prepare("SELECT strong_authentication,mfa,authentication_policy_version FROM personal_sessions WHERE token_hash=?").bind(b.session.tokenHash).first()).toEqual({strong_authentication:0,mfa:0,authentication_policy_version:null});
    expect((await domain.getDispatch(b.ctx,f.dispatch.id)).approval).toBeNull();
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='strong' WHERE id=1").run();
    await expect(db.prepare("UPDATE dispatches SET status='queued' WHERE organization_id=? AND id=?").bind(base.organizationId,f.dispatch.id).run()).rejects.toThrow(/secure_browser_approval_required/);
    await expect(normal.confirmDispatch(mcp(b.ctx),f.dispatch.id,"drift_denies_confirmation",undefined,allow)).rejects.toMatchObject({code:"APPROVAL_REQUIRED"});
    expect((await normal.getDispatch(b.ctx,f.dispatch.id)).approval).toBeNull();
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1").run();
    await expect(domain.confirmDispatch(mcp(b.ctx),f.dispatch.id,"strict_rejects_normal",undefined,allow)).rejects.toMatchObject({code:"APPROVAL_REQUIRED"});
    await expect(normal.confirmDispatch(mcp(b.ctx),f.dispatch.id,"no_oauth_fence")).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await normal.confirmDispatch(mcp(b.ctx),f.dispatch.id,"normal_once",undefined,allow)).status).toBe("queued");
    expect((await normal.confirmDispatch(mcp(b.ctx),f.dispatch.id,"normal_once",undefined,allow)).status).toBe("queued");
    expect(await counts(f.dispatch.id)).toEqual({approvals:1,evidence:1,reservations:1,outbox:1,charges:1});
  });
  it("reuses an older verified session for browser approval and MCP acceptance without losing revocation", async () => {
    const normal = new DomainService(db, {
      mode: "simulation",
      sensitiveDocumentAuthentication: "verified_account",
    });
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1").run();
    await db.prepare("INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://fixture.invalid/',?,?,?)").bind(base.userId, base.userId, iso()).run();
    for (const invalidate of [false, true]) {
      const f = await preparation(), b = await browser();
      const originalAuthentication = Math.floor(Date.now() / 1000) - 3600;
      await db.batch([
        db.prepare("UPDATE personal_sessions SET is_development=0,strong_authentication=0,authentication_policy_version=NULL,mfa=0,amr_json='[]',verified_account=1,identity_issuer='https://fixture.invalid/',identity_subject=?,authenticated_at=? WHERE token_hash=?").bind(base.userId, originalAuthentication, b.session.tokenHash),
        db.prepare("UPDATE browser_sessions SET is_development=0 WHERE token_hash=?").bind(b.session.tokenHash),
      ]);
      const approved = await normal.approveDispatch(b.ctx, f.dispatch.id, f.dispatch.fingerprint);
      const receipt = await db.prepare("SELECT authenticated_at,authentication_mode FROM secure_approval_evidence WHERE dispatch_id=?").bind(f.dispatch.id).first();
      expect(receipt).toEqual({ authenticated_at: originalAuthentication, authentication_mode: "verified_account" });
      const proof = (await normal.getDispatch(b.ctx, approved.id)).approval;
      expect(proof).not.toBeNull();
      expect(Date.parse(proof!.expires_at)).toBeGreaterThan(Date.now());
      expect(Date.parse(proof!.expires_at)).toBeLessThanOrEqual(Date.now() + 900_000);
      await expect(db.prepare("UPDATE approvals SET expires_at=? WHERE organization_id=? AND dispatch_id=?").bind(new Date(Date.now() + 3_600_000).toISOString(), base.organizationId, f.dispatch.id).run()).rejects.toThrow(/secure_browser_approval_required/);
      if (invalidate) {
        await db.prepare("DELETE FROM browser_sessions WHERE token_hash=?").bind(b.session.tokenHash).run();
        await expect(normal.confirmDispatch(mcp(b.ctx), f.dispatch.id, "revoked_old_verified_session", undefined, allow)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
        await expect(db.prepare("UPDATE dispatches SET status='queued' WHERE organization_id=? AND id=?").bind(base.organizationId, f.dispatch.id).run()).rejects.toThrow(/secure_browser_approval_required/);
        expect(await counts(f.dispatch.id)).toEqual({ approvals: 1, evidence: 1, reservations: 0, outbox: 0, charges: 0 });
      } else {
        expect((await normal.confirmDispatch(mcp(b.ctx), f.dispatch.id, "old_verified_session_once", undefined, allow)).status).toBe("queued");
        expect((await normal.confirmDispatch(mcp(b.ctx), f.dispatch.id, "old_verified_session_once", undefined, allow)).status).toBe("queued");
        expect(await counts(f.dispatch.id)).toEqual({ approvals: 1, evidence: 1, reservations: 1, outbox: 1, charges: 1 });
      }
    }
  });
  it("requires verified real identity and a current session for normal-mode browser receipts", async () => {
    const normal=new DomainService(db,{mode:"simulation",sensitiveDocumentAuthentication:"verified_account"});
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1").run();
    for(const failure of ["identity","email","account","expired","future","cross-user","revoked"] as const) {
      const f=await preparation(), b=await browser();
      await db.prepare("INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://fixture.invalid/',?,?,?)").bind(base.userId,base.userId,iso()).run();
      await db.batch([
        db.prepare("UPDATE personal_sessions SET is_development=0,strong_authentication=0,authentication_policy_version=NULL,verified_account=1,identity_issuer='https://fixture.invalid/',identity_subject=? WHERE token_hash=?").bind(base.userId,b.session.tokenHash),
        db.prepare("UPDATE browser_sessions SET is_development=0 WHERE token_hash=?").bind(b.session.tokenHash),
      ]);
      if(failure==="identity")await db.prepare("UPDATE personal_sessions SET identity_subject='unlinked' WHERE token_hash=?").bind(b.session.tokenHash).run();
      if(failure==="email")await db.prepare("UPDATE personal_sessions SET verified_email='unverified@example.test' WHERE token_hash=?").bind(b.session.tokenHash).run();
      if(failure==="account")await db.prepare("UPDATE personal_sessions SET verified_account=0 WHERE token_hash=?").bind(b.session.tokenHash).run();
      if(failure==="expired")await db.prepare("UPDATE personal_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?").bind(b.session.tokenHash).run();
      if(failure==="future")await db.prepare("UPDATE personal_sessions SET authenticated_at=? WHERE token_hash=?").bind(Math.floor(Date.now()/1000)+60,b.session.tokenHash).run();
      if(failure==="revoked")await db.prepare("DELETE FROM browser_sessions WHERE token_hash=?").bind(b.session.tokenHash).run();
      const ctx=failure==="cross-user"?{...b.ctx,userId:"user_studio"}:b.ctx;
      await expect(normal.approveDispatch(ctx,f.dispatch.id,f.dispatch.fingerprint)).rejects.toBeDefined();
      expect((await counts(f.dispatch.id))!.evidence).toBe(0);
    }
  });
  it("invalidates normal-mode SQL evidence when the verified Auth0 identity is removed", async () => {
    const f=await preparation(),b=await browser(),normal=new DomainService(db,{mode:"simulation",sensitiveDocumentAuthentication:"verified_account"});
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1").run();
    await db.prepare("INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://fixture.invalid/',?,?,?)").bind(base.userId,base.userId,iso()).run();
    await db.batch([
      db.prepare("UPDATE personal_sessions SET is_development=0,strong_authentication=0,authentication_policy_version=NULL,verified_account=1,identity_issuer='https://fixture.invalid/',identity_subject=? WHERE token_hash=?").bind(base.userId,b.session.tokenHash),
      db.prepare("UPDATE browser_sessions SET is_development=0 WHERE token_hash=?").bind(b.session.tokenHash),
    ]);
    await normal.approveDispatch(b.ctx,f.dispatch.id,f.dispatch.fingerprint);
    await db.prepare("DELETE FROM auth_identities WHERE user_id=? AND issuer='https://fixture.invalid/'").bind(base.userId).run();
    expect((await normal.getDispatch(b.ctx,f.dispatch.id)).approval).toBeNull();
    await expect(db.prepare("UPDATE dispatches SET status='queued' WHERE id=? AND organization_id=?").bind(f.dispatch.id,base.organizationId).run()).rejects.toThrow(/secure_browser_approval_required/);
    await expect(normal.confirmDispatch(mcp(b.ctx),f.dispatch.id,"unlinked_identity",undefined,allow)).rejects.toMatchObject({code:"APPROVAL_REQUIRED"});
    expect(await counts(f.dispatch.id)).toEqual({approvals:1,evidence:1,reservations:0,outbox:0,charges:0});
  });
  it.each(["identity","email","account"] as const)("revalidates an old strong receipt against current normal policy after %s changes", async (failure) => {
    const f=await preparation(),b=await browser();
    await db.prepare("INSERT OR IGNORE INTO auth_identities(issuer,subject,user_id,created_at) VALUES('https://fixture.invalid/',?,?,?)").bind(base.userId,base.userId,iso()).run();
    await db.batch([
      db.prepare("UPDATE personal_sessions SET is_development=0,verified_account=1,identity_issuer='https://fixture.invalid/',identity_subject=? WHERE token_hash=?").bind(base.userId,b.session.tokenHash),
      db.prepare("UPDATE browser_sessions SET is_development=0 WHERE token_hash=?").bind(b.session.tokenHash),
    ]);
    await domain.approveDispatch(b.ctx,f.dispatch.id,f.dispatch.fingerprint);
    await db.prepare("UPDATE secure_document_authentication_policy SET mode='verified_account' WHERE id=1").run();
    const normal=new DomainService(db,{mode:"simulation",sensitiveDocumentAuthentication:"verified_account"});
    expect((await normal.getDispatch(b.ctx,f.dispatch.id)).approval).not.toBeNull();
    if(failure==="identity")await db.prepare("DELETE FROM auth_identities WHERE user_id=? AND issuer='https://fixture.invalid/'").bind(base.userId).run();
    if(failure==="email")await db.prepare("UPDATE personal_sessions SET verified_email='changed@example.test' WHERE token_hash=?").bind(b.session.tokenHash).run();
    if(failure==="account")await db.prepare("UPDATE personal_sessions SET verified_account=0 WHERE token_hash=?").bind(b.session.tokenHash).run();
    expect((await normal.getDispatch(b.ctx,f.dispatch.id)).approval).toBeNull();
    await expect(normal.confirmDispatch(mcp(b.ctx),f.dispatch.id,"changed_normal_identity",undefined,allow)).rejects.toMatchObject({code:"APPROVAL_REQUIRED"});
    await expect(db.prepare("UPDATE dispatches SET status='queued' WHERE organization_id=? AND id=?").bind(base.organizationId,f.dispatch.id).run()).rejects.toThrow(/secure_browser_approval_required/);
    expect(await counts(f.dispatch.id)).toEqual({approvals:1,evidence:1,reservations:0,outbox:0,charges:0});
  });
  it("guards direct SQL browser approval and queue acceptance without a receipt", async () => {
    const f = await preparation();
    const time = iso();
    await expect(
      db
        .prepare(
          "INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at,approval_kind) VALUES(?,?,?,?,?,?,?,'browser')",
        )
        .bind(
          `approval_${crypto.randomUUID()}`,
          base.organizationId,
          f.dispatch.id,
          base.userId,
          f.dispatch.fingerprint,
          new Date(Date.now() + 60000).toISOString(),
          time,
        )
        .run(),
    ).rejects.toThrow(/secure_browser_approval_required/);
    await expect(
      db
        .prepare(
          "UPDATE dispatches SET status='queued',updated_at=? WHERE organization_id=? AND id=?",
        )
        .bind(time, base.organizationId, f.dispatch.id)
        .run(),
    ).rejects.toThrow(/secure_browser_approval_required/);
    expect(await counts(f.dispatch.id)).toEqual({
      approvals: 0,
      evidence: 0,
      reservations: 0,
      outbox: 0,
      charges: 0,
    });
  });
  it("records exact strong browser evidence and accepts once through generic MCP confirmation", async () => {
    const f = await preparation(),
      b = await browser();
    await domain.approveDispatch(b.ctx, f.dispatch.id, f.dispatch.fingerprint);
    const receipt = await db
      .prepare(
        "SELECT organization_id,dispatch_id,fingerprint,user_id,session_hash,authenticated_at,policy_version FROM secure_approval_evidence WHERE dispatch_id=?",
      )
      .bind(f.dispatch.id)
      .first();
    expect(receipt).toMatchObject({
      organization_id: base.organizationId,
      dispatch_id: f.dispatch.id,
      fingerprint: f.dispatch.fingerprint,
      user_id: base.userId,
      session_hash: b.session.tokenHash,
      policy_version: "guteneo-sensitive-v1",
    });
    expect(
      (await domain.getDispatch(b.ctx, f.dispatch.id)).approval,
    ).not.toBeNull();
    await expect(
      domain.confirmDispatch(
        mcp(b.ctx),
        f.dispatch.id,
        "missing_credential_fence",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const accepted = await domain.confirmDispatch(
      mcp(b.ctx),
      f.dispatch.id,
      "once_confirm",
      undefined,
      allow,
    );
    expect(accepted.status).toBe("queued");
    expect(await counts(f.dispatch.id)).toEqual({
      approvals: 1,
      evidence: 1,
      reservations: 1,
      outbox: 1,
      charges: 1,
    });
    await db
      .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
      .bind(b.session.tokenHash)
      .run();
    expect(
      (
        await domain.confirmDispatch(
          mcp(b.ctx),
          f.dispatch.id,
          "once_confirm",
          undefined,
          allow,
        )
      ).status,
    ).toBe("queued");
    expect(await counts(f.dispatch.id)).toEqual({
      approvals: 1,
      evidence: 1,
      reservations: 1,
      outbox: 1,
      charges: 1,
    });
  });
  it("invalidates pending consent when its strong session expires or is revoked", async () => {
    for (const change of ["stale", "revoked"]) {
      const f = await preparation(),
        b = await browser();
      await domain.approveDispatch(
        b.ctx,
        f.dispatch.id,
        f.dispatch.fingerprint,
      );
      if (change === "stale")
        await db
          .prepare(
            "UPDATE personal_sessions SET authenticated_at=? WHERE token_hash=?",
          )
          .bind(Math.floor(Date.now() / 1000) - 901, b.session.tokenHash)
          .run();
      else
        await db
          .prepare("DELETE FROM browser_sessions WHERE token_hash=?")
          .bind(b.session.tokenHash)
          .run();
      expect(
        (await domain.getDispatch(base, f.dispatch.id)).approval,
      ).toBeNull();
      await expect(
        domain.confirmDispatch(
          mcp(base),
          f.dispatch.id,
          `blocked_${change}`,
          undefined,
          allow,
        ),
      ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
      await expect(
        db
          .prepare(
            "UPDATE dispatches SET status='queued',updated_at=? WHERE id=?",
          )
          .bind(iso(), f.dispatch.id)
          .run(),
      ).rejects.toThrow(/secure_browser_approval_required/);
      expect(await counts(f.dispatch.id)).toEqual({
        approvals: 1,
        evidence: 1,
        reservations: 0,
        outbox: 0,
        charges: 0,
      });
    }
  });
  it("fences the current OAuth authority in the acceptance transaction", async () => {
    const f = await preparation(),
      b = await browser();
    await domain.approveDispatch(b.ctx, f.dispatch.id, f.dispatch.fingerprint);
    await expect(
      domain.confirmDispatch(
        mcp(base),
        f.dispatch.id,
        "revoked_oauth",
        undefined,
        { condition: "0=1", values: [] },
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(await counts(f.dispatch.id)).toEqual({
      approvals: 1,
      evidence: 1,
      reservations: 0,
      outbox: 0,
      charges: 0,
    });
  });
  it("rolls back approval when its session loses strong authority after review but before the SQL batch", async () => {
    const f = await preparation(),
      b = await browser();
    let raced = false;
    const raceDb = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        if (!raced) {
          raced = true;
          await db
            .prepare(
              "UPDATE personal_sessions SET strong_authentication=0 WHERE token_hash=?",
            )
            .bind(b.session.tokenHash)
            .run();
        }
        return db.batch(statements);
      },
    } as D1Database;
    const racedDomain = new DomainService(raceDb, { mode: "simulation" });
    await expect(
      racedDomain.approveDispatch(b.ctx, f.dispatch.id, f.dispatch.fingerprint),
    ).rejects.toMatchObject({ code: "STRONG_BROWSER_APPROVAL_REQUIRED" });
    expect(raced).toBe(true);
    expect(await counts(f.dispatch.id)).toEqual({
      approvals: 0,
      evidence: 0,
      reservations: 0,
      outbox: 0,
      charges: 0,
    });
  });
  it("blocks a connection revoked between prechecks and the acceptance SQL batch", async () => {
    const f = await preparation(),
      b = await browser(),
      proof = await expertProof(f);
    await domain.approveDispatch(b.ctx, f.dispatch.id, f.dispatch.fingerprint);
    let raced = false;
    const raceDb = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        if (!raced) {
          raced = true;
          await db
            .prepare(
              "UPDATE authorized_connections SET status='revoked' WHERE id=?",
            )
            .bind(proof.connectionId)
            .run();
        }
        return db.batch(statements);
      },
    } as D1Database;
    const racedDomain = new DomainService(raceDb, { mode: "simulation" });
    await expect(
      racedDomain.confirmDispatch(
        mcp(base),
        f.dispatch.id,
        "revoked_at_acceptance",
        undefined,
        {
          condition:
            "EXISTS(SELECT 1 FROM authorized_connections WHERE id=? AND status='active')",
          values: [proof.connectionId],
        },
      ),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(raced).toBe(true);
    expect(await counts(f.dispatch.id)).toEqual({
      approvals: 1,
      evidence: 1,
      reservations: 0,
      outbox: 0,
      charges: 0,
    });
  });
  it("keeps secure invitation and source content out of unrelated member legacy reads", async () => {
    const f = await preparation(),
      userId = `unrelated_${crypto.randomUUID()}`;
    await db
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
      .bind(userId, "Other member", "other@example.test", iso())
      .run();
    await db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'member',?)",
      )
      .bind(base.organizationId, userId, iso())
      .run();
    const other: ActorContext = {
      organizationId: base.organizationId,
      userId,
      role: "member",
      actor: "browser",
    };
    await expect(
      domain.getDispatch(other, f.dispatch.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(domain.getDocument(other, f.source.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      (await domain.listDispatches(other)).items.some(
        (row) => row.id === f.dispatch.id,
      ),
    ).toBe(false);
    expect(
      (await domain.listDocuments(other)).items.some(
        (row) => row.id === f.source.id,
      ),
    ).toBe(false);
    expect((await domain.getDispatch(base, f.dispatch.id)).dispatch.id).toBe(
      f.dispatch.id,
    );
    expect((await domain.getDocument(base, f.source.id)).id).toBe(f.source.id);
  });
});
