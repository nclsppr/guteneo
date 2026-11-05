import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  DomainService,
  sha256,
  type ActorContext,
} from "../../packages/domain/src/index";
import { SecureDocumentCopyService } from "../../apps/api/src/secure-document-copy";
import { SecureDistributionService } from "../../apps/api/src/secure-distributions";
import { assertLegacySourceAllowed } from "../../apps/api/src/sensitive-source";
import type { PostalAuthority } from "../../apps/api/src/postal-authority";
import type { Env } from "../../apps/api/src/env";

let mf: Miniflare, db: D1Database, bucket: R2Bucket;
const bytes = new TextEncoder().encode(
  "%PDF-1.7\nEXACT SYNTHETIC COPY FIXTURE\n%%EOF",
);
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
async function apply(sql: string) {
  const statements: D1PreparedStatement[] = [];
  let statement = "",
    trigger = false;
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
      name: "secure-source-copy",
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
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
});

async function fixture(privateSource = false) {
  const ctx: ActorContext = {
    organizationId: uid("org"),
    userId: uid("user"),
    role: "admin",
    actor: "browser",
  };
  const stamp = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'SYNTHETIC','production',?)",
      )
      .bind(ctx.organizationId, stamp),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'SYNTHETIC',?,?)",
      )
      .bind(ctx.userId, `${ctx.userId}@example.invalid`, stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(ctx.organizationId, ctx.userId, stamp),
    db
      .prepare("INSERT INTO content_limits VALUES(?,10,20000000,3)")
      .bind(ctx.organizationId),
  ]);
  const backupId = uid("backup");
  await db.batch([
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'SYNTHETIC',?,?)",
      )
      .bind(backupId, `${backupId}@example.invalid`, stamp),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(ctx.organizationId, backupId, stamp),
  ]);
  const hash = await sha256(bytes),
    sourceId = uid("doc"),
    storageKey = `${ctx.organizationId}/documents/${hash}/${sourceId}.pdf`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at,access_owner_id) VALUES(?,?,'SYNTHETIC.pdf',?,?,1,'ready','import',?,?,?)",
      )
      .bind(
        sourceId,
        ctx.organizationId,
        hash,
        bytes.length,
        storageKey,
        stamp,
        privateSource ? ctx.userId : null,
      ),
    db
      .prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,'document.scan_verified',?,'{}',?)",
      )
      .bind(uid("audit"), ctx.organizationId, ctx.userId, hash, stamp),
  ]);
  await bucket.put(storageKey, bytes);
  const queue = vi.fn(async () => {});
  const env = {
    DB: db,
    DOCUMENTS: bucket,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example.test",
    SECURE_DISTRIBUTION_ENABLED: "true",
    SECURE_DOCUMENTS_KEY: Buffer.from(new Uint8Array(32).fill(17)).toString(
      "base64url",
    ),
    DOCUMENT_RENDERER: {} as Fetcher,
    DISPATCH_QUEUE: { send: queue },
  } as unknown as Env;
  const domain = new DomainService(db, { mode: "production" });
  const authority: PostalAuthority = {
    context: ctx,
    assertCurrent: async () => {
      await domain.authorizeWrite(ctx);
    },
    sql: () => ({
      condition:
        "EXISTS(SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND role=?)",
      values: [ctx.organizationId, ctx.userId, ctx.role],
    }),
  };
  const service = new SecureDocumentCopyService(env, domain);
  return {
    ctx,
    hash,
    sourceId,
    storageKey,
    env,
    domain,
    service,
    authority,
    queue,
  };
}
async function count(org: string, table: string) {
  return (await db
    .prepare(`SELECT count(*) n FROM ${table} WHERE organization_id=?`)
    .bind(org)
    .first<{ n: number }>())!.n;
}
async function usage(org: string) {
  return db
    .prepare("SELECT uploads,bytes FROM content_usage WHERE organization_id=?")
    .bind(org)
    .first<{ uploads: number; bytes: number }>();
}
async function sensitive(
  f: Awaited<ReturnType<typeof fixture>>,
  sourceId = f.sourceId,
) {
  return new SecureDistributionService(f.env, f.domain).prepare(
    f.ctx,
    {
      documentId: sourceId,
      recipient: { address: "recipient@example.invalid" },
      retentionDays: 7,
      allowOriginalDownload: false,
      allowVaultDeposit: false,
      personalRetentionDays: 365,
    },
    uid("share"),
  );
}

describe("secure source copies — actual D1/R2 and production-mode scan gates", () => {
  it.each([false, true])(
    "copies exact bytes into a distinct creator-private identity (private source: %s)",
    async (privateSource) => {
      const f = await fixture(privateSource);
      const copy = await f.service.create(f.authority, f.sourceId, "copy");
      expect(copy.id).not.toBe(f.sourceId);
      expect(copy).toMatchObject({
        sha256: f.hash,
        size: bytes.length,
        pages: 1,
        status: "ready",
        secure_copy_source_id: f.sourceId,
        access_owner_id: f.ctx.userId,
      });
      expect(copy.storage_key).not.toBe(f.storageKey);
      expect(
        new Uint8Array(
          await (await bucket.get(copy.storage_key))!.arrayBuffer(),
        ),
      ).toEqual(bytes);
      expect(
        new Uint8Array(await (await bucket.get(f.storageKey))!.arrayBuffer()),
      ).toEqual(bytes);
      expect(await usage(f.ctx.organizationId)).toEqual({
        uploads: 1,
        bytes: bytes.length,
      });
      expect(await count(f.ctx.organizationId, "secure_distributions")).toBe(0);
      expect(await count(f.ctx.organizationId, "dispatches")).toBe(0);
      const imported = await f.domain.registerDocument(f.ctx, {
        name: "again.pdf",
        sha256: f.hash,
        size: bytes.length,
        pages: 1,
        status: "ready",
        source: "import",
        storageKey: "losing-candidate",
        scanVerified: true,
        privateToCreator: privateSource,
      });
      expect(imported.id).toBe(f.sourceId);
      const view = await sensitive(f, copy.id);
      expect(view.source.id).toBe(copy.id);
      expect(f.queue).toHaveBeenCalledTimes(1);
    },
  );

  it("does not reconcile an ordinary registration to an unrelated ID or secure-copy ID", async () => {
    const f = await fixture(true);
    const copy = await f.service.create(f.authority, f.sourceId, "copy");
    const input = {
      id: copy.id,
      name: "ordinary.pdf",
      sha256: f.hash,
      size: bytes.length,
      pages: 1,
      status: "ready" as const,
      source: "import" as const,
      storageKey: "candidate",
      scanVerified: true,
      privateToCreator: true,
    };
    // The ordinary retained hash remains the canonical deduplication result;
    // the caller-supplied candidate ID must never return the secure-only copy.
    expect((await f.domain.registerDocument(f.ctx, input)).id).toBe(f.sourceId);
    await expect(
      f.domain.registerDocument(f.ctx, {
        ...input,
        id: f.sourceId,
        sha256: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_UNAVAILABLE" });
    await expect(
      f.domain.registerDocument(f.ctx, {
        ...input,
        id: f.sourceId,
        privateToCreator: false,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_UNAVAILABLE" });
    expect(await count(f.ctx.organizationId, "documents")).toBe(2);
  });

  it("recovers concurrent and later same-key requests without duplicate quota or audit", async () => {
    const f = await fixture();
    const copies = await Promise.all(
      Array.from({ length: 3 }, () =>
        f.service.create(f.authority, f.sourceId, "same"),
      ),
    );
    expect(new Set(copies.map((copy) => copy.id)).size).toBe(1);
    expect((await f.service.create(f.authority, f.sourceId, "same")).id).toBe(
      copies[0].id,
    );
    expect(await count(f.ctx.organizationId, "documents")).toBe(2);
    expect(await usage(f.ctx.organizationId)).toEqual({
      uploads: 1,
      bytes: bytes.length,
    });
    expect(
      (await db
        .prepare(
          "SELECT count(*) n FROM audit_log WHERE organization_id=? AND action='document.secure_copy_created'",
        )
        .bind(f.ctx.organizationId)
        .first<{ n: number }>())!.n,
    ).toBe(1);
  });

  it("keeps historical ordinary dispatches on the original and blocks ordinary use of copies immediately", async () => {
    const f = await fixture();
    // A failed/cancelled historical dispatch still blocks the original source.
    await db
      .prepare(
        "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES('sender_'||?,?,'email','SYNTHETIC','sender@example.invalid','verified','production',?)",
      )
      .bind(
        f.ctx.organizationId,
        f.ctx.organizationId,
        new Date().toISOString(),
      )
      .run();
    // The immutable source guard is exercised directly without any provider call.
    await db
      .prepare(
        "INSERT INTO dispatches(id,organization_id,channel,recipient_json,document_id,sender_id,sender_address,subject,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES(?,?,'email','{}',?,'sender_'||?,'sender@example.invalid','SYNTHETIC','{}','cancelled','production',0,0,'EUR','synthetic',?,'synthetic',?,?)",
      )
      .bind(
        uid("dispatch"),
        f.ctx.organizationId,
        f.sourceId,
        f.ctx.organizationId,
        uid("key"),
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
    await expect(sensitive(f)).rejects.toMatchObject({
      code: "SECURE_SOURCE_LEGACY_OUTBOUND",
    });
    const copy = await f.service.create(f.authority, f.sourceId, "copy");
    await expect(
      assertLegacySourceAllowed(db, f.ctx.organizationId, copy.id),
    ).rejects.toMatchObject({ code: "SENSITIVE_SOURCE_LEGACY_FORBIDDEN" });
    await expect(
      f.domain.prepareDispatch(
        f.ctx,
        {
          channel: "email",
          documentId: copy.id,
          recipient: { email: "recipient@example.invalid" },
          subject: "Synthetic",
          html: "<p>Synthetic</p>",
        },
        "ordinary",
      ),
    ).rejects.toMatchObject({ code: "SENSITIVE_SOURCE_LEGACY_FORBIDDEN" });
    await expect(
      db
        .prepare("UPDATE documents SET secure_copy_source_id=NULL WHERE id=?")
        .bind(copy.id)
        .run(),
    ).rejects.toThrow("immutable_secure_copy_source");
    await sensitive(f, copy.id);
    expect(await count(f.ctx.organizationId, "dispatches")).toBe(1);
  });

  it("denies missing scan evidence, quarantined sources, historical secure sources and copies of copies", async () => {
    const f = await fixture();
    await db
      .prepare(
        "DELETE FROM audit_log WHERE organization_id=? AND action='document.scan_verified'",
      )
      .bind(f.ctx.organizationId)
      .run();
    await expect(
      f.service.create(f.authority, f.sourceId, "no-scan"),
    ).rejects.toMatchObject({ code: "SECURE_COPY_SOURCE_UNAVAILABLE" });
    expect(await usage(f.ctx.organizationId)).toBeNull();
    await db
      .prepare(
        "INSERT INTO audit_log VALUES(?,?,?,'document.scan_verified',?,'{}',?)",
      )
      .bind(
        uid("audit"),
        f.ctx.organizationId,
        f.ctx.userId,
        f.hash,
        new Date().toISOString(),
      )
      .run();
    const copy = await f.service.create(f.authority, f.sourceId, "copy");
    await expect(
      f.service.create(f.authority, copy.id, "copy-again"),
    ).rejects.toMatchObject({ code: "SECURE_COPY_SOURCE_UNAVAILABLE" });
    await sensitive(f);
    await expect(
      f.service.create(f.authority, f.sourceId, "secure"),
    ).rejects.toMatchObject({ code: "SECURE_COPY_SOURCE_UNAVAILABLE" });
    const other = await fixture();
    await db
      .prepare("UPDATE documents SET status='quarantined' WHERE id=?")
      .bind(other.sourceId)
      .run();
    await expect(
      other.service.create(other.authority, other.sourceId, "quarantined"),
    ).rejects.toMatchObject({ code: "SECURE_COPY_SOURCE_UNAVAILABLE" });
  });

  it("does not copy cross-tenant or another member's private source; rejects OAuth and observers", async () => {
    const f = await fixture(true),
      other = await fixture();
    await expect(
      other.service.create(other.authority, f.sourceId, "cross-tenant"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const userId = uid("member"),
      stamp = new Date().toISOString();
    await db.batch([
      db
        .prepare(
          "INSERT INTO users(id,name,email,created_at) VALUES(?,'SYNTHETIC',?,?)",
        )
        .bind(userId, `${userId}@example.invalid`, stamp),
      db
        .prepare(
          "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'member',?)",
        )
        .bind(f.ctx.organizationId, userId, stamp),
    ]);
    const foreign = {
      ...f.authority,
      context: { ...f.ctx, userId, role: "member" as const },
      assertCurrent: async () => {},
    };
    await expect(
      f.service.create(foreign, f.sourceId, "private"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      f.service.create(
        { ...f.authority, context: { ...f.ctx, actor: "mcp" } },
        f.sourceId,
        "oauth",
      ),
    ).rejects.toMatchObject({ code: "BROWSER_REQUIRED" });
    await db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(f.ctx.organizationId, f.ctx.userId)
      .run();
    await expect(
      f.service.create(f.authority, f.sourceId, "revoked"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects tampered exact bytes without quota or a copy", async () => {
    const f = await fixture();
    await bucket.put(f.storageKey, new Uint8Array(bytes.length).fill(42));
    await expect(
      f.service.create(f.authority, f.sourceId, "tampered"),
    ).rejects.toMatchObject({ code: "DOCUMENT_INTEGRITY_ERROR" });
    expect(await count(f.ctx.organizationId, "documents")).toBe(1);
    expect(await usage(f.ctx.organizationId)).toBeNull();
  });

  it("rechecks membership after storage I/O", async () => {
    const f = await fixture();
    const put = bucket.put.bind(bucket);
    const wrapped = {
      ...f.env,
      DOCUMENTS: new Proxy(bucket, {
        get(target, property) {
          if (property === "put")
            return async (...args: Parameters<R2Bucket["put"]>) => {
              const result = await put(...args);
              await db
                .prepare(
                  "DELETE FROM memberships WHERE organization_id=? AND user_id=?",
                )
                .bind(f.ctx.organizationId, f.ctx.userId)
                .run();
              return result;
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    };
    await expect(
      new SecureDocumentCopyService(wrapped, f.domain).create(
        f.authority,
        f.sourceId,
        "revoked-during-put",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await count(f.ctx.organizationId, "documents")).toBe(1);
    expect(await usage(f.ctx.organizationId)).toBeNull();
  });

  it("supports runtime-first publication before 0073 and enables copying only after the migration", async () => {
    const currentDb = db,
      currentBucket = bucket;
    const old = new Miniflare(
      convertV4MiniflareOptions({
        name: "secure-copy-runtime-first",
        modules: true,
        script: 'export default {fetch(){return new Response("fixture")}}',
        compatibilityDate: "2026-09-16",
        d1Databases: ["DB"],
        r2Buckets: ["DOCUMENTS"],
      }),
    );
    try {
      db = (await old.getD1Database("DB")) as unknown as D1Database;
      bucket = (await old.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
      for (const name of (
        await readdir(new URL("../../migrations/", import.meta.url))
      )
        .filter((name) => name.endsWith(".sql") && name < "0073")
        .sort())
        await apply(
          await readFile(
            new URL(`../../migrations/${name}`, import.meta.url),
            "utf8",
          ),
        );
      const f = await fixture(true);
      const registered = await f.domain.registerDocument(f.ctx, {
        name: "runtime-first.pdf",
        sha256: f.hash,
        size: bytes.length,
        pages: 1,
        status: "ready",
        source: "import",
        storageKey: "losing-candidate",
        scanVerified: true,
        privateToCreator: true,
      });
      expect(registered.id).toBe(f.sourceId);
      await assertLegacySourceAllowed(db, f.ctx.organizationId, f.sourceId);
      const objectsBefore = (await bucket.list()).objects.length;
      await expect(
        f.service.create(f.authority, f.sourceId, "before-migration"),
      ).rejects.toMatchObject({
        code: "SECURE_COPY_NOT_AVAILABLE",
        status: 409,
      });
      expect((await bucket.list()).objects.length).toBe(objectsBefore);
      expect(await usage(f.ctx.organizationId)).toBeNull();
      await apply(
        await readFile(
          new URL(
            "../../migrations/0073_secure_document_source_copies.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const copy = await f.service.create(
        f.authority,
        f.sourceId,
        "before-migration",
      );
      expect(copy.id).not.toBe(f.sourceId);
      expect(copy.secure_copy_source_id).toBe(f.sourceId);
      expect(await usage(f.ctx.organizationId)).toEqual({
        uploads: 1,
        bytes: bytes.length,
      });
    } finally {
      db = currentDb;
      bucket = currentBucket;
      await old.dispose();
    }
  }, 30_000);

  it.each([false, true])(
    "concurrent different-source key reuse preserves the winner (different bytes: %s)",
    async (differentBytes) => {
      const f = await fixture();
      const otherId = uid("doc");
      const otherBytes = differentBytes
        ? new TextEncoder().encode(
            "%PDF-1.7\nOTHER SYNTHETIC COPY FIXTURE\n%%EOF",
          )
        : bytes;
      const hash = await sha256(otherBytes),
        storageKey = `${f.ctx.organizationId}/documents/${hash}/${otherId}.pdf`;
      await db.batch([
        db
          .prepare(
            "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at,access_owner_id) VALUES(?,?,'other.pdf',?,?,1,'ready','import',?,?,?)",
          )
          .bind(
            otherId,
            f.ctx.organizationId,
            hash,
            otherBytes.length,
            storageKey,
            new Date().toISOString(),
            f.ctx.userId,
          ),
        db
          .prepare(
            "INSERT INTO audit_log VALUES(?,?,?,'document.scan_verified',?,'{}',?)",
          )
          .bind(
            uid("audit"),
            f.ctx.organizationId,
            f.ctx.userId,
            hash,
            new Date().toISOString(),
          ),
      ]);
      await bucket.put(storageKey, otherBytes);
      const outcomes = await Promise.allSettled([
        f.service.create(f.authority, f.sourceId, "shared-key"),
        f.service.create(f.authority, otherId, "shared-key"),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1);
      const failed = outcomes.find(
        (outcome) => outcome.status === "rejected",
      ) as PromiseRejectedResult;
      expect(failed.reason).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      const winner = (
        outcomes.find(
          (outcome) => outcome.status === "fulfilled",
        ) as PromiseFulfilledResult<
          Awaited<ReturnType<SecureDocumentCopyService["create"]>>
        >
      ).value;
      expect(
        await sha256(
          new Uint8Array(
            await (await bucket.get(winner.storage_key))!.arrayBuffer(),
          ),
        ),
      ).toBe(winner.sha256);
      expect((await usage(f.ctx.organizationId))!.uploads).toBe(1);
    },
  );

  it("refuses a source that enters a secure workflow while R2 is being written", async () => {
    const f = await fixture(),
      put = bucket.put.bind(bucket);
    const wrapped = {
      ...f.env,
      DOCUMENTS: new Proxy(bucket, {
        get(target, property) {
          if (property === "put")
            return async (...args: Parameters<R2Bucket["put"]>) => {
              const result = await put(...args);
              await sensitive(f);
              return result;
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    };
    await expect(
      new SecureDocumentCopyService(wrapped, f.domain).create(
        f.authority,
        f.sourceId,
        "source-changed",
      ),
    ).rejects.toMatchObject({ code: "SECURE_COPY_SOURCE_UNAVAILABLE" });
    expect(await count(f.ctx.organizationId, "documents")).toBe(1);
    expect(await usage(f.ctx.organizationId)).toBeNull();
  });

  it("recovers a committed copy after an uncertain D1 result without rewriting or deleting its object", async () => {
    const f = await fixture();
    let fail = true;
    const wrapped = {
      ...f.env,
      DB: new Proxy(db, {
        get(target, property) {
          if (property === "batch")
            return async (...args: Parameters<D1Database["batch"]>) => {
              const result = await target.batch(...args);
              if (fail) {
                fail = false;
                throw new Error("SYNTHETIC uncertain response after commit");
              }
              return result;
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    };
    const service = new SecureDocumentCopyService(wrapped, f.domain);
    await expect(
      service.create(f.authority, f.sourceId, "uncertain"),
    ).rejects.toThrow("SYNTHETIC uncertain");
    const copy = await service.create(f.authority, f.sourceId, "uncertain");
    expect(
      await sha256(
        new Uint8Array(
          await (await bucket.get(copy.storage_key))!.arrayBuffer(),
        ),
      ),
    ).toBe(f.hash);
    expect(await usage(f.ctx.organizationId)).toEqual({
      uploads: 1,
      bytes: bytes.length,
    });
    expect(await count(f.ctx.organizationId, "documents")).toBe(2);
  });

  it("bounds quota and rejects key reuse for a different source without altering the first receipt", async () => {
    const f = await fixture();
    await db
      .prepare(
        "UPDATE content_limits SET uploads_per_day=1 WHERE organization_id=?",
      )
      .bind(f.ctx.organizationId)
      .run();
    const copy = await f.service.create(f.authority, f.sourceId, "first");
    const objectsBefore = (
      await bucket.list({ prefix: `${f.ctx.organizationId}/documents/` })
    ).objects.length;
    await expect(
      f.service.create(f.authority, f.sourceId, "second"),
    ).rejects.toMatchObject({ code: "CONTENT_QUOTA_EXCEEDED" });
    expect(
      (await bucket.list({ prefix: `${f.ctx.organizationId}/documents/` }))
        .objects.length,
    ).toBe(objectsBefore);
    expect((await f.service.create(f.authority, f.sourceId, "first")).id).toBe(
      copy.id,
    );
    const secondId = uid("doc");
    await db
      .prepare(
        "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at,access_owner_id) VALUES(?,?,'private.pdf',?,?,1,'ready','import',?,?,?)",
      )
      .bind(
        secondId,
        f.ctx.organizationId,
        f.hash,
        bytes.length,
        `${f.ctx.organizationId}/documents/${f.hash}/${secondId}.pdf`,
        new Date().toISOString(),
        f.ctx.userId,
      )
      .run();
    await expect(
      f.service.create(f.authority, secondId, "first"),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await usage(f.ctx.organizationId)).toEqual({
      uploads: 1,
      bytes: bytes.length,
    });
  });
});
