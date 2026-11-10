import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  AccountDeletionService,
  signDeletionCommand,
  type AccountDeletionEnv,
  type DeletionRetention,
} from "../../apps/api/src/account-deletion";
import {
  authenticateBrowser,
  authenticatePersonalBrowser,
  authenticateMcp,
  createSession,
  memberships,
  assertIdentityCanSignIn,
  handleAuthRoute,
  hashSecret,
} from "../../apps/api/src/auth";
import { authenticateNative } from "../../apps/api/src/mobile";
import { DomainService } from "../../packages/domain/src/index";
import { SavedRecipientService } from "../../apps/api/src/saved-recipients";
import { DispatchScheduleService } from "../../apps/api/src/dispatch-schedules";
import { CustomerWebhookService } from "../../apps/api/src/customer-webhooks";
import { FUTURE_SPENDING_ACKNOWLEDGEMENT } from "../../packages/contracts/src/dispatch-schedules";

let mf: Miniflare, db: D1Database, bucket: R2Bucket;
const issuer = "https://account-deletion-fixture.auth0.com/",
  origin = "http://localhost:8787",
  secret = "synthetic-deletion-operator-" + "a".repeat(40);
const pair = await generateKeyPair("RS256"),
  jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "deletion-test",
    alg: "RS256",
    use: "sig",
  };
const now = () => new Date().toISOString();
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-17",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const statements: D1PreparedStatement[] = [];
    let statement = "",
      trigger = false;
    for (const raw of (
      await readFile(
        new URL(`../../migrations/${name}`, import.meta.url),
        "utf8",
      )
    ).split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement) trigger = line.startsWith("CREATE TRIGGER");
      statement += line + "\n";
      if (
        trigger
          ? line === "END;" || /\bBEGIN\b.+\bEND;$/.test(line)
          : line.endsWith(";")
      ) {
        statements.push(db.prepare(statement));
        statement = "";
        trigger = false;
      }
    }
    expect(statement.trim(), name).toBe("");
    if (statements.length) await db.batch(statements);
  }
});
afterAll(async () => mf?.dispose());
afterEach(() => vi.restoreAllMocks());

async function fixture(lastAdmin = false) {
  const id = crypto.randomUUID(),
    user = `user_${id}`,
    admin = `admin_${id}`,
    orgs = [`org_a_${id}`, `org_b_${id}`],
    requestId = `deletion_${id}`,
    subject = `auth0|${id}`,
    email = `${id}@example.invalid`,
    date = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at,preferred_locale) VALUES(?,'Account owner',?,?,'fr')",
      )
      .bind(user, email, date),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Shared administrator','shared@example.invalid',?)",
      )
      .bind(admin, date),
    ...orgs.map((org) =>
      db
        .prepare(
          "INSERT INTO organizations VALUES(?,'Shared workspace','simulation',?)",
        )
        .bind(org, date),
    ),
    ...orgs.map((org) =>
      db
        .prepare(
          "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,?,?)",
        )
        .bind(org, user, lastAdmin ? "admin" : "member", date),
    ),
    ...(!lastAdmin
      ? orgs.map((org) =>
          db
            .prepare(
              "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
            )
            .bind(org, admin, date),
        )
      : []),
    db
      .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
      .bind(issuer, subject, user, date),
    db
      .prepare(
        "INSERT INTO account_deletion_requests(id,user_id,organization_id,status,created_at,updated_at) VALUES(?,?,?,'requested',?,?)",
      )
      .bind(requestId, user, orgs[0], date, date),
  ]);
  const env = {
    DB: db,
    DOCUMENTS: bucket,
    ENVIRONMENT: "local",
    MODE: "simulation",
    APP_ORIGIN: origin,
    AUTH0_DOMAIN: new URL(issuer).hostname,
    AUTH0_CLIENT_ID: "deletion-browser",
    AUTH0_CLIENT_SECRET: "synthetic-browser",
    AUTH0_AUDIENCE: "https://fixture.invalid/mcp",
    AUTH0_AUTH_POLICY: "verified_email",
    ACCOUNT_DELETION_ENABLED: "true",
    ACCOUNT_DELETION_OPERATOR_SECRET: secret,
    AUTH0_DELETION_MANAGEMENT_TOKEN: "synthetic-management",
    RESEND_READINESS_API_KEY: "synthetic-inspection",
  } as AccountDeletionEnv;
  const member = (await memberships(env, user))[0];
  const login = await createSession(env, member, false, true, true, {
    verifiedEmail: email,
    authenticatedAt: Math.floor(Date.now() / 1000),
    identityIssuer: issuer,
    identitySubject: subject,
  });
  const nativeToken = Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64url");
  await db
    .prepare(
      "INSERT INTO native_sessions(token_hash,browser_session_hash,organization_id,user_id,created_at,expires_at) VALUES(?,?,?,?,?,?)",
    )
    .bind(
      await hashSecret(nativeToken),
      login.session.tokenHash,
      orgs[0],
      user,
      date,
      new Date(Date.now() + 3600000).toISOString(),
    )
    .run();
  let absent = false,
    loseDeleteResponse = false,
    notice: Awaited<ReturnType<AccountDeletionService["notice"]>> | undefined,
    noticeEvent = "delivered",
    noticeCreated: string | undefined,
    noticeExtras: string[] | null = [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input)),
        method = init?.method ?? "GET";
      if (url.href === `${issuer}.well-known/jwks.json`)
        return Response.json({ keys: [jwk] });
      if (
        url.origin === new URL(issuer).origin &&
        url.pathname.startsWith("/api/v2/users/")
      ) {
        if (method === "DELETE") {
          absent = true;
          if (loseDeleteResponse) {
            loseDeleteResponse = false;
            throw Error("synthetic response lost");
          }
          return new Response(null, { status: 204 });
        }
        return absent
          ? new Response(null, { status: 404 })
          : Response.json({ user_id: subject });
      }
      if (
        url.origin === new URL(issuer).origin &&
        ["/api/v2/grants", "/api/v2/device-credentials"].includes(url.pathname)
      )
        return Response.json([]);
      if (
        url.origin === "https://api.resend.com" &&
        url.pathname.startsWith("/emails/")
      )
        return Response.json({
          object: "email",
          id: url.pathname.split("/").at(-1),
          to: [email],
          cc: noticeExtras,
          bcc: noticeExtras,
          subject: notice?.subject,
          text: notice?.text,
          html: null,
          last_event: noticeEvent,
          created_at: noticeCreated ?? now(),
        });
      throw Error("External network forbidden in synthetic deletion fixture");
    },
  );
  const service = new AccountDeletionService(env, fetcher as typeof fetch);
  const command = async (planHash: string) => ({
    requestId,
    planHash,
    capability: await signDeletionCommand(
      secret,
      requestId,
      planHash,
      Date.now() + 600000,
    ),
  });
  const review = async () => {
    const preliminary = await service.plan({ requestId });
    const retentions: DeletionRetention[] = preliminary.retentionRequired.map(
      (item) => ({
        resourceRef: item.resourceRef,
        basis: "published_policy_review",
        evidenceReference: "synthetic-reviewed-case",
        reviewCriterion: "case_and_processor_retention_review",
      }),
    );
    const plan = await service.plan({ requestId, retentions });
    return {
      plan,
      retentions,
      input: { ...(await command(plan.planHash)), retentions },
    };
  };
  const identityToken = await new SignJWT({
    sub: subject,
    client_id: "deletion-client",
    scope: "documents:write",
    amr: ["pwd"],
    "https://guteneo.com/verified_account": true,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(env.AUTH0_AUDIENCE!)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(pair.privateKey);
  return {
    id,
    user,
    admin,
    orgs,
    requestId,
    subject,
    email,
    env,
    login,
    nativeToken,
    service,
    fetcher,
    command,
    review,
    identityToken,
    loseNextDelete: () => {
      loseDeleteResponse = true;
    },
    setNotice: (value: typeof notice) => {
      notice = value;
    },
    setNoticeEvent: (value: string) => {
      noticeEvent = value;
    },
    setNoticeExtras: (value: string[] | null) => {
      noticeExtras = value;
    },
    setNoticeCreated: (value: string) => {
      noticeCreated = value;
    },
    isAbsent: () => absent,
  };
}

describe("reviewed private account erasure with migrated D1, real R2 and synthetic processors", () => {
  it("rolls back deletion if a callback invocation starts after the final reviewed resource read",async()=>{
    const f=await fixture();
    await db.prepare("UPDATE memberships SET role='admin' WHERE organization_id=? AND user_id=?").bind(f.orgs[0],f.user).run();
    const ctx={...f.login.session.context,role:"admin" as const,documentSessionHash:f.login.session.tokenHash},domain=new DomainService(db,{mode:"simulation"});
    await db.prepare("INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Synthetic sender','sender@example.invalid','verified','simulation',?)").bind(`sender_${f.id}`,f.orgs[0],now()).run();
    const source=await domain.prepareDispatch(ctx,{channel:"email",recipient:{email:"recipient@example.invalid"},subject:"Synthetic source",text:"Synthetic callback metadata source"},crypto.randomUUID());
    const endpoint=await new CustomerWebhookService({...f.env,CUSTOMER_WEBHOOK_ENCRYPTION_KEY:"a".repeat(64)},domain).create(ctx,{name:"Synthetic callback",url:"https://example.com/lifecycle",revealSigningSecret:true},crypto.randomUUID());
    const reviewed=await f.review();
    expect(reviewed.plan.blockers).toEqual([]);
    let raced=false;
    const racingDB=new Proxy(db,{get(target,property){
      if(property==="batch")return async(statements:D1PreparedStatement[])=>{
        if(!raced){raced=true;await db.prepare("INSERT INTO customer_webhook_deliveries(id,organization_id,endpoint_id,endpoint_revision,event_id,dispatch_id,dispatch_status,channel,occurred_at,status,lease_token,lease_until,invoked_at) VALUES(?,?,?,1,?,?,'prepared','email',?,'sending','synthetic-lease',?,?)")
          .bind(`delivery_${f.id}`,f.orgs[0],endpoint.endpoint.id,`event_${f.id}`,source.id,now(),new Date(Date.now()+30_000).toISOString(),now()).run();}
        return target.batch(statements);
      };
      const value=Reflect.get(target,property);return typeof value==="function"?value.bind(target):value;
    }});
    await expect(new AccountDeletionService({...f.env,DB:racingDB},f.fetcher as typeof fetch).begin(reviewed.input)).rejects.toThrow("CHECK constraint failed");
    expect(await db.prepare("SELECT status FROM account_deletion_requests WHERE id=?").bind(f.requestId).first()).toEqual({status:"requested"});
    expect(await db.prepare("SELECT count(*) AS n FROM account_deletion_plans WHERE request_id=?").bind(f.requestId).first()).toEqual({n:0});
    const next=await f.review();
    expect(next.plan.blockers.some(code=>code.startsWith("WORK_UNRESOLVED:"))).toBe(true);
  });
  it("retires future authority and callback secrets, purges owned contacts and completes deletion without runnable new features", async () => {
    const f = await fixture();
    await db.prepare("UPDATE memberships SET role='admin' WHERE organization_id=? AND user_id=?").bind(f.orgs[0],f.user).run();
    const ctx={...f.login.session.context,role:"admin" as const,documentSessionHash:f.login.session.tokenHash};
    const domain=new DomainService(db,{mode:"simulation"});
    await db.prepare("INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Synthetic sender','sender@example.invalid','verified','simulation',?)").bind(`sender_${f.id}`,f.orgs[0],now()).run();
    const contacts=new SavedRecipientService(domain);
    const contact=await contacts.create(ctx,{label:"Synthetic saved contact",channel:"email",recipient:{email:"recipient@example.invalid"}},crypto.randomUUID());
    const source=await domain.prepareDispatch(ctx,{channel:"email",recipient:{email:"recipient@example.invalid"},subject:"Synthetic scheduled fixture",text:"Synthetic future message"},crypto.randomUUID());
    const scheduled=new DispatchScheduleService({MODE:"simulation",SCHEDULED_DISPATCH_ENABLED:"true"},domain);
    const draft=await scheduled.create(ctx,{dispatchId:source.id,executeAt:new Date(Date.now()+120_000).toISOString(),maxTotalMinor:100},crypto.randomUUID());
    await scheduled.approve(ctx,draft.id,{expectedRevision:1,snapshotHash:draft.snapshotHash,acknowledgement:FUTURE_SPENDING_ACKNOWLEDGEMENT,recipientRequested:true});
    const callbacks=new CustomerWebhookService({...f.env,CUSTOMER_WEBHOOK_ENCRYPTION_KEY:"a".repeat(64)},domain);
    const callback=await callbacks.create(ctx,{name:"Synthetic callback",url:"https://example.com/lifecycle",revealSigningSecret:true},crypto.randomUUID());
    const reviewed=await f.review();
    expect(reviewed.plan.blockers).toEqual([]);
    expect(reviewed.plan.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({kind:"saved_recipients",action:"delete"}),
      expect.objectContaining({kind:"dispatch_schedules",action:"retire"}),
      expect.objectContaining({kind:"dispatch_schedule_approvals",action:"retire"}),
      expect.objectContaining({kind:"customer_webhook_endpoints",action:"retire"}),
    ]));
    await f.service.begin(reviewed.input);
    expect(await db.prepare("SELECT status FROM dispatch_schedules WHERE id=?").bind(draft.id).first()).toEqual({status:"cancelled"});
    expect((await db.prepare("SELECT revoked_at FROM dispatch_schedule_approvals WHERE schedule_id=?").bind(draft.id).first<{revoked_at:string}>())!.revoked_at).toBeTruthy();
    expect(await db.prepare("SELECT enabled,status,secret_ciphertext,url,name FROM customer_webhook_endpoints WHERE id=?").bind(callback.endpoint.id).first()).toEqual({enabled:0,status:"revoked",secret_ciphertext:null,url:"https://deleted.invalid/",name:"Deleted endpoint"});
    await f.service.advance(await f.command(reviewed.plan.planHash));
    expect(await db.prepare("SELECT 1 FROM saved_recipients WHERE id=?").bind(contact.id).first()).toBeNull();
    expect(await scheduled.processDue()).toMatchObject({processed:0});
    const notice=await f.service.notice(await f.command(reviewed.plan.planHash));
    f.setNotice(notice);f.setNoticeEvent("delivered");
    expect(await f.service.complete({...await f.command(reviewed.plan.planHash),notificationReceiptId:`receipt_${f.id}`})).toMatchObject({status:"completed"});
    expect(await db.prepare("SELECT count(*) AS n FROM memberships WHERE user_id=?").bind(f.admin).first()).toEqual({n:2});
  });
  it("requires actual operator capability, exact plan and reviewed resource retention before changing access", async () => {
    const f = await fixture(),
      preliminary = await f.service.plan({ requestId: f.requestId });
    expect(
      preliminary.blockers.some((item) =>
        item.startsWith("RETENTION_REVIEW_REQUIRED"),
      ),
    ).toBe(true);
    await expect(
      f.service.begin({
        ...(await f.command(preliminary.planHash)),
        retentions: [],
      }),
    ).rejects.toMatchObject({ code: "DELETION_BLOCKED" });
    const reviewed = await f.review();
    expect(reviewed.plan.blockers).toEqual([]);
    await expect(
      f.service.begin({
        ...reviewed.input,
        capability: { ...reviewed.input.capability, signature: "0".repeat(64) },
      }),
    ).rejects.toMatchObject({ code: "DELETION_CAPABILITY_INVALID" });
    await expect(
      new AccountDeletionService(
        { ...f.env, ACCOUNT_DELETION_ENABLED: "false" },
        f.fetcher as typeof fetch,
      ).begin(reviewed.input),
    ).rejects.toMatchObject({ code: "DELETION_DISABLED" });
    expect(
      (await f.service.plan({ requestId: f.requestId })).identityCount,
    ).toBe(1);
    expect(
      await db
        .prepare("SELECT status FROM account_deletion_requests WHERE id=?")
        .bind(f.requestId)
        .first(),
    ).toEqual({ status: "requested" });
  });
  it("erases an eligible account across all memberships and owned bytes while preserving both shared workspaces", async () => {
    const f = await fixture(),
      key = `${f.orgs[0]}/documents/${"a".repeat(64)}/private.pdf`,
      doc = `doc_${f.id}`;
    await bucket.put(key, new Uint8Array([1, 2, 3]));
    await db
      .prepare(
        "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at,access_owner_id) VALUES(?,?,'Private original',?,3,1,'ready','import',?,?,?)",
      )
      .bind(doc, f.orgs[0], "a".repeat(64), key, now(), f.user)
      .run();
    const { input, plan } = await f.review();
    expect(plan.blockers).toEqual([]);
    await f.service.begin(input);
    await expect(
      db
        .prepare(
          "UPDATE account_deletion_requests SET processing_reference=? WHERE id=?",
        )
        .bind("f".repeat(64), f.requestId)
        .run(),
    ).rejects.toThrow("account_deletion_request_immutable");
    await expect(
      f.service.notice(await f.command(plan.planHash)),
    ).rejects.toMatchObject({ code: "DELETION_DATA_UNVERIFIED" });
    expect(
      await f.service.advance(await f.command(plan.planHash)),
    ).toMatchObject({
      status: "processing",
      nextAction: "verify_completion_notice",
    });
    expect(await bucket.head(key)).toBeNull();
    expect(f.isAbsent()).toBe(true);
    expect(
      await db
        .prepare("SELECT name,email,preferred_locale FROM users WHERE id=?")
        .bind(f.user)
        .first(),
    ).toEqual({
      name: "Deleted account",
      email: "deleted@account.invalid",
      preferred_locale: null,
    });
    expect(
      await db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=?")
        .bind(f.user)
        .first(),
    ).toEqual({ n: 0 });
    expect(
      await db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=?")
        .bind(f.admin)
        .first(),
    ).toEqual({ n: 2 });
    const notice = await f.service.notice(await f.command(plan.planHash));
    f.setNotice(notice);
    f.setNoticeEvent("sent");
    await expect(
      f.service.complete({
        ...(await f.command(plan.planHash)),
        notificationReceiptId: `receipt_${f.id}`,
      }),
    ).rejects.toMatchObject({ code: "NOTICE_DELIVERY_UNVERIFIED" });
    f.setNoticeEvent("delivered");
    expect(
      await f.service.complete({
        ...(await f.command(plan.planHash)),
        notificationReceiptId: `receipt_${f.id}`,
      }),
    ).toMatchObject({ status: "completed" });
    expect(
      await db
        .prepare(
          "SELECT sealed_recipient FROM account_deletion_plans WHERE request_id=?",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ sealed_recipient: "" });
    expect(
      await f.service.complete({
        ...(await f.command(plan.planHash)),
        notificationReceiptId: `receipt_${f.id}`,
      }),
    ).toMatchObject({ status: "completed" });
    expect(
      f.fetcher.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
  it("keeps partial erasure processing after an unknown Auth0 response and resumes by verifying the same identity", async () => {
    const f = await fixture(),
      { input, plan } = await f.review();
    await f.service.begin(input);
    f.loseNextDelete();
    await expect(
      f.service.advance(await f.command(plan.planHash)),
    ).rejects.toMatchObject({ code: "AUTH0_OUTCOME_UNKNOWN" });
    expect(
      await db
        .prepare("SELECT status FROM account_deletion_requests WHERE id=?")
        .bind(f.requestId)
        .first(),
    ).toEqual({ status: "processing" });
    await expect(
      f.service.notice(await f.command(plan.planHash)),
    ).rejects.toMatchObject({ code: "DELETION_DATA_UNVERIFIED" });
    expect(
      await f.service.advance(await f.command(plan.planHash)),
    ).toMatchObject({ nextAction: "verify_completion_notice" });
    expect(
      f.fetcher.mock.calls.filter(
        ([url, init]) =>
          String(url).includes("/users/") && init?.method === "DELETE",
      ),
    ).toHaveLength(1);
  });
  it("blocks a last administrator without transferring ownership or erasing a shared workspace", async () => {
    const f = await fixture(true),
      { input, plan } = await f.review();
    expect(
      plan.blockers.filter((item) => item.startsWith("SUCCESSOR_REQUIRED")),
    ).toHaveLength(2);
    await expect(f.service.begin(input)).rejects.toMatchObject({
      code: "DELETION_BLOCKED",
    });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(
      await db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=?")
        .bind(f.user)
        .first(),
    ).toEqual({ n: 2 });
  });
  it("refuses changed or newly inserted resources at the actual begin transaction", async () => {
    const f = await fixture(),
      { input } = await f.review();
    await db
      .prepare("UPDATE users SET name='Changed after review' WHERE id=?")
      .bind(f.user)
      .run();
    await expect(f.service.begin(input)).rejects.toMatchObject({
      code: "DELETION_PLAN_CHANGED",
    });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM account_deletion_plans WHERE request_id=?",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("revokes browser, personal, native and OAuth access and fences an already-read callback identity", async () => {
    const f = await fixture(),
      { input, plan } = await f.review();
    vi.spyOn(globalThis, "fetch").mockImplementation(f.fetcher as typeof fetch);
    await f.service.begin(input);
    const browser = new Request(`${origin}/api/session`, {
      headers: { Cookie: f.login.cookie.split(";")[0] },
    });
    await expect(authenticateBrowser(browser, f.env)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    await expect(
      authenticatePersonalBrowser(browser, f.env),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    await expect(
      authenticateNative(
        new Request(`${origin}/api/mobile/v1/session`, {
          headers: { Authorization: `GuteneoNative ${f.nativeToken}` },
        }),
        f.env,
      ),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    await expect(
      authenticateMcp(
        new Request(`${origin}/mcp`, {
          headers: { Authorization: `Bearer ${f.identityToken}` },
        }),
        f.env,
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_DELETION_IN_PROGRESS" });
    await expect(
      assertIdentityCanSignIn(f.env, issuer, f.subject),
    ).rejects.toMatchObject({ code: "ACCOUNT_DELETION_IN_PROGRESS" });
    await expect(
      db
        .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
        .bind(issuer, f.subject, f.admin, now())
        .run(),
    ).rejects.toThrow("account_deletion_in_progress");
    const domain = new DomainService(db, { mode: "simulation" });
    await expect(
      domain.createCampaign(f.login.session.context, { name: "Cached actor" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      domain.registerDocument(f.login.session.context, {
        name: "Late bytes",
        sha256: "b".repeat(64),
        size: 3,
        pages: 1,
        status: "ready",
        source: "import",
        storageKey: "never-created",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await f.service.advance(await f.command(plan.planHash));
    await expect(
      db
        .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
        .bind(issuer, f.subject, f.admin, now())
        .run(),
    ).rejects.toThrow("account_deletion_in_progress");
  });
  it("does not accept a completion message created before verified erasure", async () => {
    const f = await fixture(),
      { input, plan } = await f.review();
    await f.service.begin(input);
    await f.service.advance(await f.command(plan.planHash));
    f.setNotice(await f.service.notice(await f.command(plan.planHash)));
    f.setNoticeCreated("2000-01-01T00:00:00.000Z");
    await expect(
      f.service.complete({
        ...(await f.command(plan.planHash)),
        notificationReceiptId: `receipt_${f.id}`,
      }),
    ).rejects.toMatchObject({ code: "NOTICE_DELIVERY_UNVERIFIED" });
  });
  it("accepts the official nullable empty-recipient shape after independently verified delivery", async () => {
    const f = await fixture(),
      { input, plan } = await f.review();
    await f.service.begin(input);
    await f.service.advance(await f.command(plan.planHash));
    f.setNotice(await f.service.notice(await f.command(plan.planHash)));
    f.setNoticeExtras(null);
    await expect(
      f.service.complete({
        ...(await f.command(plan.planHash)),
        notificationReceiptId: `receipt_${f.id}`,
      }),
    ).resolves.toMatchObject({ status: "completed" });
  });
  it("rolls back the frozen plan, tombstones and revocations when a resource changes after the final read", async () => {
    const f = await fixture(),
      { input } = await f.review();
    let changed = false;
    const raced = new Proxy(db, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!changed) {
              changed = true;
              await db
                .prepare("UPDATE users SET name='Raced final read' WHERE id=?")
                .bind(f.user)
                .run();
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      new AccountDeletionService(
        { ...f.env, DB: raced },
        f.fetcher as typeof fetch,
      ).begin(input),
    ).rejects.toThrow("CHECK constraint failed");
    expect(
      await db
        .prepare("SELECT status FROM account_deletion_requests WHERE id=?")
        .bind(f.requestId)
        .first(),
    ).toEqual({ status: "requested" });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM account_deletion_plans WHERE request_id=?",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ n: 0 });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM account_deletion_identity_tombstones WHERE request_id=?",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ n: 0 });
    expect(
      await db
        .prepare("SELECT count(*) n FROM browser_sessions WHERE user_id=?")
        .bind(f.user)
        .first(),
    ).toEqual({ n: 1 });
  });
  it("stops a stale worker before processor deletion and preserves the replacement lease", async () => {
    const f = await fixture(),
      { input, plan } = await f.review();
    await f.service.begin(input);
    const original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementationOnce(async (url, init) => {
      await db
        .prepare(
          "UPDATE account_deletion_plans SET lease_token='replacement-worker',lease_expires_at=? WHERE request_id=?",
        )
        .bind(new Date(Date.now() + 60000).toISOString(), f.requestId)
        .run();
      return original(url, init);
    });
    await expect(
      f.service.advance(await f.command(plan.planHash)),
    ).rejects.toMatchObject({ code: "DELETION_LEASE_EXPIRED" });
    expect(
      f.fetcher.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);
    expect(
      await db
        .prepare(
          "SELECT lease_token,data_verified_at FROM account_deletion_plans WHERE request_id=?",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ lease_token: "replacement-worker", data_verified_at: null });
    expect(
      await db
        .prepare(
          "SELECT state FROM account_deletion_steps WHERE request_id=? AND step='auth0'",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ state: "started" });
    expect(
      await db
        .prepare("SELECT name FROM users WHERE id=?")
        .bind(f.user)
        .first(),
    ).toEqual({ name: "Account owner" });
  });
  it("fences local erasure atomically if its lease is replaced after the preceding read", async () => {
    const f = await fixture(),
      { input, plan } = await f.review();
    await f.service.begin(input);
    let replaced = false;
    const raced = new Proxy(db, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!replaced) {
              replaced = true;
              await db
                .prepare(
                  "UPDATE account_deletion_plans SET lease_token='replacement-local',lease_expires_at=? WHERE request_id=?",
                )
                .bind(new Date(Date.now() + 60000).toISOString(), f.requestId)
                .run();
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      new AccountDeletionService(
        { ...f.env, DB: raced },
        f.fetcher as typeof fetch,
      ).advance(await f.command(plan.planHash)),
    ).rejects.toThrow("CHECK constraint failed");
    expect(
      await db
        .prepare("SELECT name FROM users WHERE id=?")
        .bind(f.user)
        .first(),
    ).toEqual({ name: "Account owner" });
    expect(
      await db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=?")
        .bind(f.user)
        .first(),
    ).toEqual({ n: 2 });
    expect(
      await db
        .prepare(
          "SELECT lease_token,data_verified_at FROM account_deletion_plans WHERE request_id=?",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ lease_token: "replacement-local", data_verified_at: null });
  });
  it("refuses an already-issued callback after processing begins, without recreating an account", async () => {
    const f = await fixture();
    const login = await handleAuthRoute(
      new Request(`${origin}/auth/login`),
      f.env,
    );
    const destination = new URL(login!.headers.get("location")!);
    const cookie = login!.headers.get("set-cookie")!.split(";")[0];
    const nonce = destination.searchParams.get("nonce")!;
    const { input } = await f.review();
    const idToken = await new SignJWT({
      sub: f.subject,
      nonce,
      email: f.email,
      email_verified: true,
      name: "Account owner",
      amr: ["pwd"],
      "https://guteneo.com/verified_account": true,
    })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(f.env.AUTH0_CLIENT_ID!)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(pair.privateKey);
    const original = f.fetcher.getMockImplementation()!;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url) === `${issuer}oauth/token`) {
        await f.service.begin(input);
        return Response.json({
          id_token: idToken,
          access_token: f.identityToken,
        });
      }
      return original(url, init);
    });
    await expect(
      handleAuthRoute(
        new Request(
          `${origin}/auth/callback?state=${destination.searchParams.get("state")}&code=synthetic`,
          { headers: { Cookie: cookie } },
        ),
        f.env,
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_DELETION_IN_PROGRESS" });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM auth_identities WHERE issuer=? AND subject=?",
        )
        .bind(issuer, f.subject)
        .first(),
    ).toEqual({ n: 1 });
    expect(
      await db
        .prepare("SELECT count(*) n FROM memberships WHERE user_id=?")
        .bind(f.user)
        .first(),
    ).toEqual({ n: 2 });
  });
  it("inventories user foreign keys and semantic historical updater references for individual retention", async () => {
    const f = await fixture();
    await db
      .prepare(
        "INSERT INTO workflow_ai_policy(organization_id,updated_by,updated_at) VALUES(?,?,?)",
      )
      .bind(f.orgs[0], f.user, now())
      .run();
    // A new user FK is detected automatically and has no implicit retention approval.
    await db
      .prepare(
        "CREATE TABLE deletion_fixture_new_actor(id TEXT PRIMARY KEY, principal TEXT REFERENCES users(id))",
      )
      .run();
    try {
      await db
        .prepare("INSERT INTO deletion_fixture_new_actor VALUES(?,?)")
        .bind(f.id, f.user)
        .run();
      const plan = await f.service.plan({ requestId: f.requestId });
      expect(
        plan.retentionRequired.some(
          (item) => item.kind === "workflow_ai_policy",
        ),
      ).toBe(true);
      expect(
        plan.resources.some(
          (item) =>
            item.kind === "deletion_fixture_new_actor" &&
            item.action === "blocked",
        ),
      ).toBe(true);
      expect(
        plan.blockers.some((item) =>
          item.startsWith("RESOURCE_OWNERSHIP_UNSUPPORTED:"),
        ),
      ).toBe(true);
    } finally {
      await db.prepare("DROP TABLE deletion_fixture_new_actor").run();
    }
  });
  it("uses supported native Worker redirects and refuses provider redirects without following them", async () => {
    const bundle = await build({
      stdin: {
        contents: `import { accountDeletionProcessors } from './apps/api/src/account-deletion-auth0.ts'; export default {async fetch(){const p=accountDeletionProcessors({AUTH0_DOMAIN:'deletion.auth0.com',AUTH0_DELETION_MANAGEMENT_TOKEN:'synthetic',RESEND_READINESS_API_KEY:'synthetic'});const errors=[];try{await p.verifyIdentityAbsent({issuer:'https://deletion.auth0.com/',subject:'auth0|synthetic'});}catch(e){errors.push(e.code);}try{await p.verifyNotification({id:'synthetic',recipient:'fixture@example.invalid',subject:'fixture',text:'fixture',earliest:'2000-01-01T00:00:00Z'});}catch(e){errors.push(e.code);}return Response.json(errors);}}`,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
    });
    let outbound = 0;
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: "2026-09-17",
        outboundService: async () => {
          outbound++;
          return new Response(null, {
            status: 302,
            headers: { Location: "https://not-followed.invalid/" },
          });
        },
      }),
    );
    try {
      const response = await runtime.dispatchFetch("https://fixture.invalid/");
      expect(await response.json()).toEqual([
        "AUTH0_ERASURE_UNVERIFIED",
        "PROCESSOR_READ_FAILED",
      ]);
      expect(outbound).toBe(2);
    } finally {
      await runtime.dispose();
    }
  });
  it("blocks cancelled multipart uploads until canonical storage drain and debt settlement finish", async () => {
    const f = await fixture(),
      upload = `upload_${f.id}`,
      date = now(),
      future = new Date(Date.now() + 300000).toISOString();
    await db
      .prepare(
        `INSERT INTO private_document_uploads(id,organization_id,user_id,client_id,connection_id_snapshot,authorization_revision,issuer,token_issuer,subject,token_issued_at,token_expires_at,member_role,supervisor_can_approve,supervisor_can_report,authentication_policy,verified_account,mfa,mode,idempotency_key,file_name,expected_size,expected_sha256,state,planned_document_id,expires_at,created_at,updated_at,transport) VALUES(?,?,?,'fixture','fixture',0,?,?,?,1,9999999999,'member',0,0,'verified_email',1,0,'simulation',?,'fixture.pdf',20,?,'rejected',?,?,?,?, 'app')`,
      )
      .bind(
        upload,
        f.orgs[0],
        f.user,
        issuer,
        issuer,
        f.subject,
        upload,
        "a".repeat(64),
        `doc_${f.id}`,
        future,
        date,
        date,
      )
      .run();
    await db
      .prepare(
        "INSERT INTO mcp_app_document_uploads(organization_id,upload_id,user_id,state,part_size,part_count,reserved_bytes,call_count,expires_at,created_at,updated_at,cleanup_not_before,next_cleanup_at) VALUES(?,?,?,'cancelled',262144,1,20,1,?,?,?,?,?)",
      )
      .bind(f.orgs[0], upload, f.user, future, date, date, future, future)
      .run();
    await db
      .prepare(
        "INSERT INTO mcp_app_document_upload_parts(organization_id,upload_id,part_index,byte_length,sha256,object_key,state,put_token,created_at) VALUES(?,?,0,20,?,?,'pending','already-issued-put',?)",
      )
      .bind(f.orgs[0], upload, "a".repeat(64), `mcp-parts/${f.id}`, date)
      .run();
    const reviewed = await f.review();
    expect(
      reviewed.plan.blockers.some((item) =>
        item.startsWith("UPLOAD_STORAGE_DRAIN_UNRESOLVED:"),
      ),
    ).toBe(true);
    await expect(f.service.begin(reviewed.input)).rejects.toMatchObject({
      code: "DELETION_BLOCKED",
    });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM mcp_app_document_upload_parts WHERE organization_id=? AND upload_id=? AND storage_settled=0",
        )
        .bind(f.orgs[0], upload)
        .first(),
    ).toEqual({ n: 1 });
  });
  it("does not publish an object checkpoint after losing its lease during a storage delete", async () => {
    const f = await fixture(),
      key = `secure/personal/${f.user}/orphan/original.bin`;
    await bucket.put(key, new Uint8Array([1, 2, 3]));
    const { input, plan } = await f.review();
    await f.service.begin(input);
    const raced = new Proxy(bucket, {
      get(target, property) {
        if (property === "delete")
          return async (key: string) => {
            await target.delete(key);
            await db
              .prepare(
                "UPDATE account_deletion_plans SET lease_token='replacement-storage',lease_expires_at=? WHERE request_id=?",
              )
              .bind(new Date(Date.now() + 60000).toISOString(), f.requestId)
              .run();
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      new AccountDeletionService(
        { ...f.env, DOCUMENTS: raced },
        f.fetcher as typeof fetch,
      ).advance(await f.command(plan.planHash)),
    ).rejects.toMatchObject({ code: "DELETION_LEASE_EXPIRED" });
    expect(
      await db
        .prepare(
          "SELECT state FROM account_deletion_steps WHERE request_id=? AND step='objects'",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ state: "started" });
    expect(
      await db
        .prepare(
          "SELECT lease_token,data_verified_at FROM account_deletion_plans WHERE request_id=?",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ lease_token: "replacement-storage", data_verified_at: null });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("keeps a live successor across two concurrent deletion reviews and later ordinary membership changes", async () => {
    const f = await fixture(),
      second = `second_${f.id}`;
    await db.batch([
      db
        .prepare("UPDATE memberships SET role='admin' WHERE user_id=?")
        .bind(f.user),
      db
        .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
        .bind(issuer, `auth0|other_${f.id}`, f.admin, now()),
      db
        .prepare(
          "INSERT INTO account_deletion_requests(id,user_id,organization_id,status,created_at,updated_at) VALUES(?,?,?,'requested',?,?)",
        )
        .bind(second, f.admin, f.orgs[0], now(), now()),
    ]);
    const primary = await f.review();
    const preliminary = await f.service.plan({ requestId: second });
    const retentions = preliminary.retentionRequired.map((item) => ({
      resourceRef: item.resourceRef,
      basis: "published_policy_review",
      evidenceReference: "synthetic-reviewed-case",
      reviewCriterion: "case_review",
    }));
    const candidate = await f.service.plan({ requestId: second, retentions });
    expect(candidate.blockers).toEqual([]);
    const input = {
      requestId: second,
      planHash: candidate.planHash,
      retentions,
      capability: await signDeletionCommand(
        secret,
        second,
        candidate.planHash,
        Date.now() + 600000,
      ),
    };
    let started = false;
    const raced = new Proxy(db, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!started) {
              started = true;
              await f.service.begin(primary.input);
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      new AccountDeletionService(
        { ...f.env, DB: raced },
        f.fetcher as typeof fetch,
      ).begin(input),
    ).rejects.toThrow("account_deletion_successor_required");
    const after = await f.service.plan({ requestId: second, retentions });
    expect(
      after.blockers.filter((item) => item.startsWith("SUCCESSOR_REQUIRED:")),
    ).toHaveLength(2);
    await expect(
      db
        .prepare(
          "UPDATE memberships SET role='member' WHERE organization_id=? AND user_id=?",
        )
        .bind(f.orgs[0], f.admin)
        .run(),
    ).rejects.toThrow("last_admin_required");
    await expect(
      db
        .prepare(
          "DELETE FROM memberships WHERE organization_id=? AND user_id=?",
        )
        .bind(f.orgs[0], f.admin)
        .run(),
    ).rejects.toThrow("last_admin_required");
    expect(
      await db
        .prepare("SELECT status FROM account_deletion_requests WHERE id=?")
        .bind(second)
        .first(),
    ).toEqual({ status: "requested" });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM account_deletion_plans WHERE request_id=?",
        )
        .bind(second)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("atomically refuses completion if unreviewed history arrives after the final resource read", async () => {
    const f = await fixture(),
      { input, plan } = await f.review();
    await f.service.begin(input);
    await f.service.advance(await f.command(plan.planHash));
    f.setNotice(await f.service.notice(await f.command(plan.planHash)));
    let inserted = false;
    const raced = new Proxy(db, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!inserted) {
              inserted = true;
              await db
                .prepare(
                  "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,'synthetic.late',?,'{}',?)",
                )
                .bind(`late_${f.id}`, f.orgs[0], f.user, f.id, now())
                .run();
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      new AccountDeletionService(
        { ...f.env, DB: raced },
        f.fetcher as typeof fetch,
      ).complete({
        ...(await f.command(plan.planHash)),
        notificationReceiptId: `receipt_${f.id}`,
      }),
    ).rejects.toThrow("CHECK constraint failed");
    expect(
      await db
        .prepare("SELECT status FROM account_deletion_requests WHERE id=?")
        .bind(f.requestId)
        .first(),
    ).toEqual({ status: "processing" });
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM account_deletion_notification_receipts WHERE request_id=?",
        )
        .bind(f.requestId)
        .first(),
    ).toEqual({ n: 0 });
  });
});
