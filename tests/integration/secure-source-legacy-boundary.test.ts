import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  DomainService,
  sha256,
  type ActorContext,
} from "../../packages/domain/src/index";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";
import { PostalService } from "../../apps/api/src/postal";
import { PostalAddressPageService } from "../../apps/api/src/postal-address-page";
import type { PostalAuthority } from "../../apps/api/src/postal-authority";
import { assertLegacySourceAllowed } from "../../apps/api/src/sensitive-source";
import {
  handleProtectedDocumentRoute,
  prepareProtectedDocument,
  revealProtectedDocumentPassword,
  revokeProtectedDocument,
} from "../../apps/api/src/protected-documents";
import type { Env } from "../../apps/api/src/env";

let mf: Miniflare, db: D1Database, bucket: R2Bucket;
let sourceGuardSql: string;
const time = () => new Date().toISOString();
const uid = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const bytes = new TextEncoder().encode(
  "%PDF-1.7\nSYNTHETIC PRIVATE LEGACY FIXTURE\n%%EOF",
);
const denied = { code: "SENSITIVE_SOURCE_LEGACY_FORBIDDEN", status: 403 };

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
      name: "secure-source-legacy-boundary",
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-16",
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
    .sort())
    await apply(
      await readFile(
        new URL(`../../migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  // Deliberately model an imported/pre-guard coexistence snapshot. The production
  // migrations reject these combinations; this suite tests defensive application
  // reads even if such rows are present. Financial acceptance has separate tests.
  sourceGuardSql = (await db
    .prepare(
      "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='secure_source_legacy_exposure_guard'",
    )
    .first<{ sql: string }>())!.sql;
  await db.batch([
    db.prepare("DROP TRIGGER IF EXISTS secure_source_legacy_exposure_guard"),
    db.prepare("DROP TRIGGER protected_hosting_charge_guard"),
  ]);
});
afterAll(async () => {
  await mf?.dispose();
});

async function fixture() {
  const organizationId = uid("org"),
    userId = uid("usr"),
    documentId = uid("doc"),
    senderId = uid("sender"),
    stamp = time();
  const hash = await sha256(bytes),
    storageKey = `${organizationId}/documents/${hash}/fixture.pdf`;
  const ctx: ActorContext = {
    organizationId,
    userId,
    role: "admin",
    actor: "browser",
  };
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'SYNTHETIC','production',?)",
      )
      .bind(organizationId, stamp),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'SYNTHETIC',?,?)",
      )
      .bind(userId, `${userId}@example.test`, stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(organizationId, userId, stamp),
    db
      .prepare(
        "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at) VALUES(?,?,'SYNTHETIC.pdf',?,?,1,'ready','import',?,?)",
      )
      .bind(documentId, organizationId, hash, bytes.length, storageKey, stamp),
    db
      .prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,'document.scan_verified',?,'{}',?)",
      )
      .bind(uid("audit"), organizationId, userId, hash, stamp),
    db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'postal','SYNTHETIC','SYNTHETIC RETURN','verified','production',?)",
      )
      .bind(senderId, organizationId, stamp),
    db
      .prepare(
        "INSERT INTO content_limits(organization_id,uploads_per_day,bytes_per_day,renders_per_day) VALUES(?,100,209715200,100)",
      )
      .bind(organizationId),
  ]);
  await bucket.put(storageKey, bytes);
  const renderer = vi.fn(async () => {
    throw new Error("Unexpected renderer call");
  });
  const env = {
    DB: db,
    DOCUMENTS: bucket,
    MODE: "production",
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://guteneo.example.test",
    PROTECTED_DOCUMENTS_KEY: "x".repeat(43),
    DOCUMENT_RENDERER: { fetch: renderer },
  } as unknown as Env;
  const domain = new DomainService(db, { mode: "production" });
  const authority: PostalAuthority = {
    context: ctx,
    assertCurrent: async () => {},
    sql: () => ({ condition: "1=1", values: [] }),
  };
  async function sensitive() {
    const id = uid("sd");
    await db
      .prepare(
        `INSERT INTO secure_distributions(id,organization_id,source_id,source_sha256,source_name,source_pages,created_by,request_key,request_hash,recipient_address,token_hash,sealed_token,policy_json,quote_json,input_json,service_fee_minor,price_version,status,created_at,prepared_expires_at)
      VALUES(?,?,?,?,?,1,?,?,?,?,?,'SYNTHETIC','{}','{}','{}',49,'secure-distribution-2026-10-24-v1','preparing',?,?)`,
      )
      .bind(
        id,
        organizationId,
        documentId,
        hash,
        "SYNTHETIC.pdf",
        userId,
        uid("key"),
        hash,
        "recipient@example.test",
        await sha256(id),
        time(),
        new Date(Date.now() + 86400000).toISOString(),
      )
      .run();
  }
  async function preflight() {
    const id = uid("pp"),
      expires = new Date(Date.now() + 3600000).toISOString();
    const report = {
      version: PINGEN_PREFLIGHT_VERSION,
      status: "review_required",
      sha256: hash,
      pages: 1,
      canSend: false,
      issues: [],
      requiredReviews: ["printed_recipient_matches"],
      rendering: {
        dpi: 144,
        complete: true,
        pages: [{ page: 1, width: 1200, height: 1700, rasterSha256: hash }],
      },
      address: {
        lines: ["SYNTHETIC PRIVATE ADDRESS"],
        issues: [],
        textVisibility: "not_verified",
        crop: {
          pngBase64: "iVBORw0KGgo=",
          width: 100,
          height: 100,
          boundsMm: { x: 20, y: 40, width: 85, height: 40 },
        },
      },
    };
    await db
      .prepare(
        `INSERT INTO postal_preflights(id,organization_id,user_id,document_id,document_sha256,sender_id,sender_address,recipient_json,options_json,profile_json,expected_address,ceiling_minor,request_hash,input_hash,idempotency_key,status,budget_day,processing_until,expires_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'SYNTHETIC RETURN','{}','{}',?,'SYNTHETIC PRIVATE ADDRESS',100,?,?,?,'processing',?,?,?,?,?)`,
      )
      .bind(
        id,
        organizationId,
        userId,
        documentId,
        hash,
        senderId,
        JSON.stringify({ version: PINGEN_PREFLIGHT_VERSION }),
        hash,
        hash,
        id,
        stamp.slice(0, 10),
        expires,
        expires,
        stamp,
        stamp,
      )
      .run();
    await db
      .prepare(
        "UPDATE postal_preflights SET status='review_required',report_json=? WHERE id=?",
      )
      .bind(JSON.stringify(report), id)
      .run();
    return id;
  }
  async function hosting() {
    const prepared = await prepareProtectedDocument(env, ctx, { documentId });
    const dispatchId = uid("dispatch"),
      emailSenderId = uid("sender"),
      stamp = time();
    await db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','SYNTHETIC','SYNTHETIC','verified','production',?)",
      )
      .bind(emailSenderId, organizationId, stamp)
      .run();
    await db
      .prepare(
        `INSERT INTO dispatches(id,organization_id,channel,recipient_json,document_id,sender_id,sender_address,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at)
      VALUES(?,?,'email','{}',?,?,'SYNTHETIC',?,'prepared','production',100,100,'EUR',?,?,?,?,?)`,
      )
      .bind(
        dispatchId,
        organizationId,
        documentId,
        emailSenderId,
        JSON.stringify({
          protectedDocument: { hostingId: prepared.hostingId },
        }),
        hash,
        dispatchId,
        hash,
        stamp,
        stamp,
      )
      .run();
    await db
      .prepare(
        "INSERT INTO protected_hosting_charges(organization_id,hosting_id,dispatch_id,amount_minor,created_at) VALUES(?,?,?,100,?)",
      )
      .bind(organizationId, prepared.hostingId, dispatchId, stamp)
      .run();
    const { password } = await revealProtectedDocumentPassword(
      env,
      ctx,
      dispatchId,
    );
    const unlocked = await handleProtectedDocumentRoute(
      new Request(`${prepared.url}/unlock`, {
        method: "POST",
        headers: {
          Origin: env.APP_ORIGIN,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ password }),
      }),
      env,
    );
    expect(unlocked?.status).toBe(303);
    const cookie = unlocked!.headers.get("Set-Cookie")!.split(";")[0];
    const request = () =>
      new Request(`${prepared.url}/content`, { headers: { Cookie: cookie } });
    return { ...prepared, dispatchId, password, request };
  }
  async function rawHosting(status = "draft") {
    const id = uid("hosting"),
      expiry = new Date(Date.now() + 3600000).toISOString();
    await db
      .prepare(
        "INSERT INTO protected_document_hostings(id,organization_id,document_id,document_sha256,duration_days,token_hash,password_salt,password_verifier,sealed_secrets,status,created_at,expires_at) VALUES(?,?,?,?,7,?,'SYNTHETIC','SYNTHETIC','SYNTHETIC',?,?,?)",
      )
      .bind(
        id,
        organizationId,
        documentId,
        hash,
        await sha256(id),
        status,
        stamp,
        expiry,
      )
      .run();
    return id;
  }
  async function addressReservation() {
    const id = uid("pap"),
      expiry = new Date(Date.now() + 3600000).toISOString();
    await db
      .prepare(
        `INSERT INTO postal_address_pages(id,organization_id,user_id,idempotency_key,input_hash,source_document_id,source_sha256,source_pages,recipient_json,print_mode,profile_json,version,added_pages,planned_document_id,artifact_key,lease_token,lease_until,attempts,expires_at,budget_day,created_at)
      SELECT ?,d.organization_id,?,?,d.sha256,d.id,d.sha256,d.pages,'{}','simplex','{}','postal-address-page-2026-09-20-v1',1,?,?,'SYNTHETIC',?,1,?,?,? FROM documents d WHERE d.organization_id=? AND d.id=?`,
      )
      .bind(
        id,
        userId,
        id,
        uid("doc"),
        uid("artifact"),
        expiry,
        expiry,
        stamp.slice(0, 10),
        stamp,
        organizationId,
        documentId,
      )
      .run();
    return id;
  }
  async function providerDraft() {
    const id = uid("draft");
    await db
      .prepare(
        "INSERT INTO provider_drafts(id,organization_id,document_id,document_sha256,sender_id,sender_address,provider,recipient_json,expected_address,options_json,ceiling_minor,currency,status,request_hash,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,'SYNTHETIC RETURN','pingen','{}','SYNTHETIC','{}',100,'EUR','preparing',?,?,?,?)",
      )
      .bind(
        id,
        organizationId,
        documentId,
        hash,
        senderId,
        hash,
        id,
        stamp,
        stamp,
      )
      .run();
    return id;
  }
  async function legacyDispatch(status = "prepared") {
    const id = uid("dispatch");
    await db
      .prepare(
        "INSERT INTO dispatches(id,organization_id,channel,recipient_json,document_id,sender_id,sender_address,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES(?,?,'postal','{}',?,?,'SYNTHETIC RETURN','{}',?,'production',100,100,'EUR',?,?,?,?,?)",
      )
      .bind(
        id,
        organizationId,
        documentId,
        senderId,
        status,
        hash,
        id,
        hash,
        stamp,
        stamp,
      )
      .run();
    return id;
  }
  return {
    ctx,
    documentId,
    organizationId,
    userId,
    hash,
    storageKey,
    env,
    domain,
    authority,
    renderer,
    sensitive,
    preflight,
    hosting,
    rawHosting,
    addressReservation,
    providerDraft,
    legacyDispatch,
  };
}

describe("sensitive sources cannot escape through legacy content services", () => {
  it("rejects address-page derivation before rendering for both browser and OAuth actors", async () => {
    for (const actor of ["browser", "mcp"] as const) {
      const f = await fixture();
      await f.sensitive();
      const authority = { ...f.authority, context: { ...f.ctx, actor } };
      await expect(
        new PostalAddressPageService(f.env, f.domain).generate(
          authority,
          {
            documentId: f.documentId,
            recipient: {
              name: "SYNTHETIC",
              line1: "Rue du Test 12",
              postalCode: "L-1234",
              city: "LUXEMBOURG",
              country: "LU",
            },
            printMode: "simplex",
          },
          uid("key"),
        ),
      ).rejects.toMatchObject(denied);
      expect(f.renderer).not.toHaveBeenCalled();
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM postal_address_pages WHERE organization_id=?",
          )
          .bind(f.organizationId)
          .first(),
      ).toEqual({ n: 0 });
    }
  });

  it("denies cached postal address text and pixels after a source becomes sensitive", async () => {
    const f = await fixture(),
      id = await f.preflight(),
      service = new PostalService(f.env, f.domain);
    expect((await service.get(f.authority, id)).address.extractedLines).toEqual(
      ["SYNTHETIC PRIVATE ADDRESS"],
    );
    expect(
      (await service.crop(f.authority, id)).headers.get("Content-Type"),
    ).toBe("image/png");
    await f.sensitive();
    await expect(service.get(f.authority, id)).rejects.toMatchObject(denied);
    await expect(service.crop(f.authority, id)).rejects.toMatchObject(denied);
  });

  it("rechecks classification after an original R2 read", async () => {
    const f = await fixture();
    const wrapped = new Proxy(bucket, {
      get(target, field) {
        if (field === "get")
          return async (key: string) => {
            const object = await target.get(key);
            await f.sensitive();
            return object;
          };
        const value = Reflect.get(target, field);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      new PostalService(
        { ...f.env, DOCUMENTS: wrapped },
        f.domain,
      ).exactDocument(f.organizationId, f.documentId),
    ).rejects.toMatchObject(denied);
  });

  it("rechecks cached crop classification after authority awaits", async () => {
    const f = await fixture(),
      id = await f.preflight();
    let checks = 0;
    const authority = {
      ...f.authority,
      assertCurrent: async () => {
        if (++checks === 2) await f.sensitive();
      },
    };
    await expect(
      new PostalService(f.env, f.domain).crop(authority, id),
    ).rejects.toMatchObject(denied);
  });

  it("denies old passwords and anonymous originals while retaining legacy revocation", async () => {
    const f = await fixture(),
      hosting = await f.hosting();
    const normal = await handleProtectedDocumentRoute(hosting.request(), f.env);
    expect(new Uint8Array(await normal!.arrayBuffer())).toEqual(bytes);
    await f.sensitive();
    await expect(
      revealProtectedDocumentPassword(f.env, f.ctx, hosting.dispatchId),
    ).rejects.toMatchObject(denied);
    await expect(
      prepareProtectedDocument(f.env, f.ctx, { documentId: f.documentId }),
    ).rejects.toMatchObject(denied);
    const blocked = await handleProtectedDocumentRoute(
      hosting.request(),
      f.env,
    );
    expect(blocked!.headers.get("Content-Type")).not.toBe("application/pdf");
    expect(await blocked!.text()).not.toContain(
      "SYNTHETIC PRIVATE LEGACY FIXTURE",
    );
    expect(
      await revokeProtectedDocument(f.env, f.ctx, hosting.dispatchId),
    ).toMatchObject({ revoked: true });
  });

  it("denies an anonymous original when sensitivity changes during R2", async () => {
    const f = await fixture(),
      hosting = await f.hosting();
    const wrapped = new Proxy(bucket, {
      get(target, field) {
        if (field === "get")
          return async (key: string) => {
            const object = await target.get(key);
            await f.sensitive();
            return object;
          };
        const value = Reflect.get(target, field);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const response = await handleProtectedDocumentRoute(hosting.request(), {
      ...f.env,
      DOCUMENTS: wrapped,
    });
    expect(response!.headers.get("Content-Type")).not.toBe("application/pdf");
    expect(
      await db
        .prepare(
          "SELECT count(*) n FROM audit_log WHERE organization_id=? AND action='protected_document.downloaded'",
        )
        .bind(f.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });

  it("fences password revelation in the final database write", async () => {
    const f = await fixture(),
      hosting = await f.hosting();
    let injected = false;
    const wrapped = new Proxy(db, {
      get(target, field) {
        if (field === "prepare")
          return (sql: string) => {
            const statement = target.prepare(sql);
            if (!sql.includes("protected_document.password_revealed"))
              return statement;
            return new Proxy(statement, {
              get(stmt, key) {
                if (key === "bind")
                  return (...values: unknown[]) => {
                    const bound = stmt.bind(...values);
                    return new Proxy(bound, {
                      get(original, operation) {
                        if (operation === "first")
                          return async () => {
                            injected = true;
                            await f.sensitive();
                            return original.first();
                          };
                        const value = Reflect.get(original, operation);
                        return typeof value === "function"
                          ? value.bind(original)
                          : value;
                      },
                    });
                  };
                const value = Reflect.get(stmt, key);
                return typeof value === "function" ? value.bind(stmt) : value;
              },
            });
          };
        const value = Reflect.get(target, field);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      revealProtectedDocumentPassword(
        { ...f.env, DB: wrapped },
        f.ctx,
        hosting.dispatchId,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(injected).toBe(true);
  });

  it("keeps classification tenant scoped and ordinary PDF reads available", async () => {
    const sensitive = await fixture(),
      normal = await fixture();
    await sensitive.sensitive();
    await assertLegacySourceAllowed(
      db,
      normal.organizationId,
      sensitive.documentId,
    );
    expect(
      (
        await new PostalService(normal.env, normal.domain).exactDocument(
          normal.organizationId,
          normal.documentId,
        )
      ).bytes,
    ).toEqual(bytes);
  });
});

describe("database serialization of sensitive classification and legacy exposure", () => {
  beforeAll(async () => {
    await db.prepare(sourceGuardSql).run();
  });

  it.each([
    "rawHosting",
    "addressReservation",
    "preflight",
    "providerDraft",
    "legacyDispatch",
  ] as const)(
    "rejects classification when %s won the first write",
    async (method) => {
      const f = await fixture();
      await f[method]();
      await expect(f.sensitive()).rejects.toThrow(
        "secure_source_legacy_exposure",
      );
      expect(
        await db
          .prepare(
            "SELECT count(*) n FROM secure_distributions WHERE organization_id=?",
          )
          .bind(f.organizationId)
          .first(),
      ).toEqual({ n: 0 });
    },
  );

  it.each([
    "rawHosting",
    "addressReservation",
    "preflight",
    "providerDraft",
    "legacyDispatch",
  ] as const)(
    "rejects %s when sensitive classification won the first write",
    async (method) => {
      const f = await fixture();
      await f.sensitive();
      await expect(f[method]()).rejects.toThrow(
        "sensitive_source_legacy_forbidden",
      );
    },
  );

  it("prevents reactivating an expired legacy hosting on a sensitive source", async () => {
    const f = await fixture(),
      id = await f.rawHosting("expired");
    await f.sensitive();
    await expect(
      db
        .prepare(
          "UPDATE protected_document_hostings SET status='active' WHERE id=?",
        )
        .bind(id)
        .run(),
    ).rejects.toThrow("sensitive_source_legacy_forbidden");
  });

  it("fences resumed address-page registration for historical coexistence", async () => {
    const f = await fixture(),
      id = await f.addressReservation();
    await db.prepare("DROP TRIGGER secure_source_legacy_exposure_guard").run();
    try {
      await f.sensitive();
    } finally {
      await db.prepare(sourceGuardSql).run();
    }
    await expect(
      db
        .prepare(
          "UPDATE postal_address_pages SET lease_token='SYNTHETIC RESUMED' WHERE id=?",
        )
        .bind(id)
        .run(),
    ).rejects.toThrow("sensitive_source_legacy_forbidden");
  });

  it.each([
    ["prepared", "queued"],
    ["queued", "submitting"],
  ])(
    "fences historical attachment dispatch transition %s to %s",
    async (initial, next) => {
      const f = await fixture(),
        id = await f.legacyDispatch(initial);
      await db
        .prepare("DROP TRIGGER secure_source_legacy_exposure_guard")
        .run();
      try {
        await f.sensitive();
      } finally {
        await db.prepare(sourceGuardSql).run();
      }
      await expect(
        db
          .prepare("UPDATE dispatches SET status=? WHERE id=?")
          .bind(next, id)
          .run(),
      ).rejects.toThrow("sensitive_source_legacy_forbidden");
    },
  );

  it.each(["browser", "mcp"] as const)(
    "denies legacy original attachments in domain preparation for %s",
    async (actor) => {
      const f = await fixture();
      await f.sensitive();
      await expect(
        f.domain.prepareDispatch(
          { ...f.ctx, actor },
          {
            channel: "email",
            recipient: { email: "recipient@example.test" },
            documentId: f.documentId,
            subject: "SYNTHETIC",
            text: "SYNTHETIC",
          },
          uid("key"),
        ),
      ).rejects.toMatchObject(denied);
    },
  );
});
