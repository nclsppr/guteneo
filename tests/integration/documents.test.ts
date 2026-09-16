import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { DocumentService, validatePdf } from "../../apps/api/src/documents";
import { maintainDocuments } from "../../apps/api/src/maintenance";
import type { Env } from "../../apps/api/src/env";
import {
  DomainService,
  sha256,
  simulationProvider,
  type ActorContext,
} from "../../packages/domain/src/index";

let mf: Miniflare;
let db: D1Database;
let bucket: R2Bucket;
let env: Env;
let domain: DomainService;
let documents: DocumentService;
let original: Uint8Array<ArrayBuffer>;
const atelier: ActorContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
};
const studio: ActorContext = {
  organizationId: "org_studio",
  userId: "user_studio",
  role: "admin",
  actor: "browser",
};
const oldDate = "2020-01-01T00:00:00.000Z";

async function applySql(sql: string, database = db) {
  let statement = "";
  let trigger = false;
  const statements: D1PreparedStatement[] = [];
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement)
      trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
    statement += `${line} `;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      statements.push(database.prepare(statement));
      statement = "";
      trigger = false;
    }
  }
  if (statement.trim()) throw new Error("Incomplete fixture SQL");
  if (statements.length) await database.batch(statements);
}
async function pdf(label: string): Promise<Uint8Array<ArrayBuffer>> {
  const file = await PDFDocument.create();
  file.setCreationDate(new Date("2026-01-01T00:00:00.000Z"));
  file.setModificationDate(new Date("2026-01-01T00:00:00.000Z"));
  const font = await file.embedFont(StandardFonts.Helvetica);
  file.addPage([595, 842]).drawText(label, { x: 48, y: 750, size: 15, font });
  return new Uint8Array(await file.save());
}
function binding(fn: (request: Request) => Promise<Response>): Fetcher {
  return { fetch: fn } as unknown as Fetcher;
}
async function production() {
  await db
    .prepare("UPDATE organizations SET mode='production' WHERE id=?")
    .bind(atelier.organizationId)
    .run();
  const productionEnv = {
    ...env,
    ENVIRONMENT: "production" as const,
    MODE: "production" as const,
  };
  const productionDomain = new DomainService(db, { mode: "production" });
  return { productionEnv, productionDomain };
}
async function count(table: "documents" | "content_usage" | "audit_log") {
  return (await db
    .prepare(`SELECT count(*) AS n FROM ${table}`)
    .first<{ n: number }>())!.n;
}
async function attachDispatch(documentId: string, key: string) {
  return domain.prepareDispatch(
    atelier,
    {
      channel: "email",
      recipient: { email: `${key}@example.invalid` },
      subject: "Retention test",
      html: "<p>Fixture de rétention.</p>",
      documentId,
    },
    key,
  );
}
async function acceptDispatch(documentId: string, key: string) {
  const dispatch = await attachDispatch(documentId, key);
  await domain.approveDispatch(atelier, dispatch.id, dispatch.fingerprint);
  return domain.confirmDispatch(atelier, dispatch.id, `confirm-${key}`);
}

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch(){return new Response("ok")} }',
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  bucket = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  const migrations = new URL("../../migrations/", import.meta.url);
  for (const filename of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await applySql(readFileSync(new URL(filename, migrations), "utf8"));
  original = await pdf("Exact original PDF bytes");
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  for (const table of [
    "document_access_grants",
    "provider_receipts",
    "provider_events",
    "attempts",
    "outbox",
    "reservations",
    "approvals",
    "idempotency_keys",
    "audit_log",
    "dispatches",
    "campaigns",
    "documents",
    "suppressions",
    "senders",
    "channel_controls",
    "usage",
    "http_limits",
    "content_usage",
    "content_limits",
    "maintenance_state",
    "memberships",
    "users",
    "organizations",
  ])
    await db.prepare(`DELETE FROM ${table}`).run();
  const listing = await bucket.list({ limit: 1000 });
  if (listing.objects.length)
    await bucket.delete(listing.objects.map((item) => item.key));
  await applySql(
    readFileSync(new URL("../../scripts/seed.sql", import.meta.url), "utf8"),
  );
  await applySql(
    readFileSync(
      new URL("../../scripts/seed-content.sql", import.meta.url),
      "utf8",
    ),
  );
  env = {
    DB: db,
    DOCUMENTS: bucket,
    ENVIRONMENT: "local",
    MODE: "simulation",
    APP_ORIGIN: "http://localhost:8787",
  } as Env;
  domain = new DomainService(db, { mode: "simulation" });
  documents = new DocumentService(env, domain);
});

describe("Document lifecycle — actual Miniflare D1 and R2", () => {
  it("upgrades retained documents without changing existing approvals, reservations or references", async () => {
    const legacy = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: 'export default { fetch(){return new Response("ok")} }',
        d1Databases: ["DB"],
        compatibilityDate: "2026-09-16",
      }),
    );
    try {
      const legacyDb = (await legacy.getD1Database(
        "DB",
      )) as unknown as D1Database;
      const migrations = new URL("../../migrations/", import.meta.url);
      for (const filename of readdirSync(migrations)
        .filter((name) => name.endsWith(".sql") && name < "0008")
        .sort())
        await applySql(
          readFileSync(new URL(filename, migrations), "utf8"),
          legacyDb,
        );
      await applySql(
        readFileSync(
          new URL("../../scripts/seed.sql", import.meta.url),
          "utf8",
        ),
        legacyDb,
      );
      await legacyDb
        .prepare(
          "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at) VALUES('doc_legacy',?,'legacy.pdf',?,?,1,'ready','import','legacy-object',?)",
        )
        .bind(
          atelier.organizationId,
          await sha256(original),
          original.length,
          oldDate,
        )
        .run();
      const legacyDomain = new DomainService(legacyDb, { mode: "simulation" });
      const dispatch = await legacyDomain.prepareDispatch(
        atelier,
        {
          channel: "email",
          recipient: { email: "migration@example.invalid" },
          subject: "Migration fixture",
          html: "<p>Preserve approval</p>",
          documentId: "doc_legacy",
        },
        "migration-fixture",
      );
      await legacyDomain.approveDispatch(
        atelier,
        dispatch.id,
        dispatch.fingerprint,
      );
      await legacyDomain.confirmDispatch(
        atelier,
        dispatch.id,
        "migration-confirm",
      );
      const before = await legacyDomain.getDispatch(atelier, dispatch.id);
      await applySql(
        readFileSync(new URL("0008_document_versions.sql", migrations), "utf8"),
        legacyDb,
      );
      expect(await legacyDomain.getDispatch(atelier, dispatch.id)).toEqual(
        before,
      );
      expect(
        (await legacyDb.prepare("PRAGMA foreign_key_check").all()).results,
      ).toEqual([]);
      expect(
        await legacyDb
          .prepare("SELECT status FROM reservations WHERE dispatch_id=?")
          .bind(dispatch.id)
          .first(),
      ).toEqual({ status: "reserved" });
      expect(
        await legacyDb
          .prepare("SELECT status FROM outbox WHERE dispatch_id=?")
          .bind(dispatch.id)
          .first(),
      ).toEqual({ status: "pending" });
      await expect(
        legacyDb
          .prepare("UPDATE documents SET sha256=? WHERE id='doc_legacy'")
          .bind("a".repeat(64))
          .run(),
      ).rejects.toThrow("immutable_document");
    } finally {
      await legacy.dispose();
    }
  }, 30_000);

  it("preserves every original byte, deduplicates only within an organization, and isolates preview access", async () => {
    const first = await documents.upload(atelier, {
      name: "original.pdf",
      bytes: original,
    });
    const duplicate = await documents.upload(atelier, {
      name: "same-file.pdf",
      bytes: original,
    });
    const separate = await documents.upload(studio, {
      name: "original.pdf",
      bytes: original,
    });
    expect(first.status).toBe("ready");
    expect(first.pages).toBe(1);
    expect(duplicate.id).toBe(first.id);
    expect(separate.id).not.toBe(first.id);
    expect(separate.storage_key).not.toBe(first.storage_key);
    expect(await count("documents")).toBe(2);
    expect((await bucket.list()).objects).toHaveLength(2);
    const stored = await bucket.get(first.storage_key);
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(original);
    const preview = await documents.getContent(atelier, first.id);
    expect(preview.headers.get("X-Document-SHA256")).toBe(
      await sha256(original),
    );
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(original);
    await expect(documents.getContent(studio, first.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects a viewer before R2 storage, accounting, scanning, rendering or URL access", async () => {
    await db
      .prepare("UPDATE memberships SET role='viewer' WHERE organization_id=?")
      .bind(atelier.organizationId)
      .run();
    const viewer = { ...atelier, role: "viewer" as const };
    let calls = 0;
    const deniedExternal = binding(async () => {
      calls++;
      throw new Error("External services must not run");
    });
    const service = new DocumentService(
      { ...env, DOCUMENT_RENDERER: deniedExternal, SCANNER: deniedExternal },
      domain,
    );
    await expect(
      service.upload(viewer, { name: "blocked.pdf", bytes: original }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.render(viewer, { name: "blocked.pdf", html: "<p>Blocked</p>" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.importFile(viewer, {
        file_id: "blocked",
        download_url: "https://untrusted.invalid/document.pdf",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls).toBe(0);
    expect(await count("documents")).toBe(0);
    expect(await count("content_usage")).toBe(0);
    expect((await bucket.list()).objects).toHaveLength(0);
  });

  it("atomically caps concurrent uploads before writing the losing file", async () => {
    const other = await pdf("Distinct second document");
    await db
      .prepare(
        "UPDATE content_limits SET uploads_per_day=1,bytes_per_day=? WHERE organization_id=?",
      )
      .bind(Math.max(original.length, other.length), atelier.organizationId)
      .run();
    const results = await Promise.allSettled([
      documents.upload(atelier, { name: "first.pdf", bytes: original }),
      documents.upload(atelier, { name: "second.pdf", bytes: other }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const denied = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(denied.reason).toMatchObject({ code: "CONTENT_QUOTA_EXCEEDED" });
    const usage = await db
      .prepare(
        "SELECT uploads,bytes FROM content_usage WHERE organization_id=?",
      )
      .bind(atelier.organizationId)
      .first<{ uploads: number; bytes: number }>();
    expect(usage!.uploads).toBe(1);
    expect(usage!.bytes).toBeLessThanOrEqual(
      Math.max(original.length, other.length),
    );
    expect(await count("documents")).toBe(1);
    expect((await bucket.list()).objects).toHaveLength(1);
  });

  it("bounds concurrent rendering before invoking the external engine", async () => {
    await db
      .prepare(
        "UPDATE content_limits SET renders_per_day=1 WHERE organization_id=?",
      )
      .bind(atelier.organizationId)
      .run();
    let renders = 0;
    const renderer = binding(async (request) => {
      expect(new URL(request.url).pathname).toBe("/render");
      expect(await request.text()).toContain("Letter");
      renders++;
      return new Response(original, {
        headers: { "Content-Type": "application/pdf" },
      });
    });
    const service = new DocumentService(
      { ...env, DOCUMENT_RENDERER: renderer },
      domain,
    );
    const results = await Promise.allSettled([
      service.render(atelier, { name: "first", html: "<p>Letter</p>" }),
      service.render(atelier, { name: "second", html: "<p>Letter</p>" }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(renders).toBe(1);
    expect(
      await db
        .prepare(
          "SELECT renders,uploads FROM content_usage WHERE organization_id=?",
        )
        .bind(atelier.organizationId)
        .first(),
    ).toMatchObject({ renders: 1, uploads: 1 });
    expect((await bucket.list()).objects).toHaveLength(1);
  });

  it("quarantines unparsed remote bytes with unknown page count when the scanner is absent", async () => {
    const { productionEnv, productionDomain } = await production();
    const service = new DocumentService(productionEnv, productionDomain);
    const malformed = new TextEncoder().encode(
      "%PDF-1.7\nThis is deliberately not a parseable document.",
    );
    await expect(validatePdf(malformed)).rejects.toBeTruthy();
    const document = await service.upload(atelier, {
      name: "untrusted.pdf",
      bytes: malformed,
    });
    expect(document).toMatchObject({
      status: "quarantined",
      pages: 0,
      size: malformed.length,
    });
    expect(
      new Uint8Array(
        await (await bucket.get(document.storage_key))!.arrayBuffer(),
      ),
    ).toEqual(malformed);
    await expect(
      service.getContent(atelier, document.id),
    ).rejects.toMatchObject({ code: "DOCUMENT_QUARANTINED" });
  });

  it("promotes a quarantined immutable version only after matching clean scan and isolated validation", async () => {
    const { productionEnv, productionDomain } = await production();
    const initial = await new DocumentService(
      productionEnv,
      productionDomain,
    ).upload(atelier, { name: "scanned.pdf", bytes: original });
    const hash = await sha256(original);
    let scanHash = "a".repeat(64);
    let validatorHash = hash;
    let validatorCalls = 0;
    const scanner = binding(async (request) => {
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(original);
      return Response.json({ verdict: "clean", sha256: scanHash });
    });
    const validator = binding(async (request) => {
      expect(new URL(request.url).pathname).toBe("/validate");
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(original);
      validatorCalls++;
      return Response.json({ sha256: validatorHash, pages: 1 });
    });
    const service = new DocumentService(
      { ...productionEnv, SCANNER: scanner, DOCUMENT_RENDERER: validator },
      productionDomain,
    );
    const wrongScan = await service.upload(atelier, {
      name: "scanned.pdf",
      bytes: original,
    });
    expect(wrongScan.status).toBe("quarantined");
    expect(validatorCalls).toBe(0);
    scanHash = hash;
    validatorHash = "b".repeat(64);
    const wrongValidation = await service.upload(atelier, {
      name: "scanned.pdf",
      bytes: original,
    });
    expect(wrongValidation.status).toBe("quarantined");
    expect(wrongValidation.pages).toBe(0);
    validatorHash = hash;
    const promoted = await service.upload(atelier, {
      name: "scanned.pdf",
      bytes: original,
    });
    expect(promoted.id).toBe(initial.id);
    expect(promoted).toMatchObject({ status: "ready", pages: 1, sha256: hash });
    expect(await count("documents")).toBe(1);
    expect((await bucket.list()).objects).toHaveLength(1);
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM audit_log WHERE action='document.scan_verified'",
        )
        .first(),
    ).toEqual({ n: 1 });
    expect(
      new Uint8Array(
        await (await service.getContent(atelier, promoted.id)).arrayBuffer(),
      ),
    ).toEqual(original);
  });

  it("preserves expired content referenced by a prepared or uncertain dispatch", async () => {
    const active = await documents.upload(atelier, {
      name: "active.pdf",
      bytes: original,
    });
    const unknown = await documents.upload(atelier, {
      name: "unknown.pdf",
      bytes: await pdf("Uncertain dispatch content"),
    });
    await attachDispatch(active.id, "prepared");
    const uncertain = await acceptDispatch(unknown.id, "uncertain");
    await domain.processDispatch(
      uncertain.id,
      simulationProvider("email", { outcome: "unknown" }),
    );
    await db.prepare("UPDATE documents SET created_at=?").bind(oldDate).run();
    expect(await maintainDocuments(env)).toMatchObject({ purged: 0 });
    for (const document of [active, unknown]) {
      expect((await domain.getDocument(atelier, document.id)).status).toBe(
        "ready",
      );
      expect(await bucket.get(document.storage_key)).not.toBeNull();
    }
    expect(
      (await domain.getDispatch(atelier, uncertain.id)).dispatch.status,
    ).toBe("submission_unknown");
  });

  it("purges expired terminal content once without changing dispatches or duplicating audit", async () => {
    const expired = await documents.upload(atelier, {
      name: "expired.pdf",
      bytes: original,
    });
    const recent = await documents.upload(atelier, {
      name: "recent.pdf",
      bytes: await pdf("Recent document"),
    });
    const dispatch = await acceptDispatch(expired.id, "delivered");
    await domain.processDispatch(dispatch.id, simulationProvider("email"));
    await db
      .prepare("UPDATE documents SET created_at=? WHERE id=?")
      .bind(oldDate, expired.id)
      .run();
    await maintainDocuments(env);
    await maintainDocuments(env);
    expect((await domain.getDocument(atelier, expired.id)).status).toBe(
      "purged",
    );
    expect(await bucket.get(expired.storage_key)).toBeNull();
    expect(await bucket.get(recent.storage_key)).not.toBeNull();
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM audit_log WHERE action='document.purged' AND resource_id=?",
        )
        .bind(expired.id)
        .first(),
    ).toEqual({ n: 1 });
    const unchanged = await domain.getDispatch(atelier, dispatch.id);
    expect(unchanged.dispatch.status).toBe("delivered");
    expect(unchanged.attempts).toHaveLength(1);
  });

  it("resumes a purge interrupted after the DB tombstone and before R2 deletion", async () => {
    const document = await documents.upload(atelier, {
      name: "interrupted.pdf",
      bytes: original,
    });
    await db
      .prepare("UPDATE documents SET status='purged',created_at=? WHERE id=?")
      .bind(oldDate, document.id)
      .run();
    expect(await bucket.get(document.storage_key)).not.toBeNull();
    await maintainDocuments(env);
    await maintainDocuments(env);
    expect(await bucket.get(document.storage_key)).toBeNull();
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM audit_log WHERE action='document.purged' AND resource_id=?",
        )
        .bind(document.id)
        .first(),
    ).toEqual({ n: 1 });
  });

  it("reimports purged bytes as a new deduplicated version without reviving an approved reference", async () => {
    const expired = await documents.upload(atelier, {
      name: "expired.pdf",
      bytes: original,
    });
    const dispatched = await acceptDispatch(expired.id, "old-approved");
    await domain.processDispatch(dispatched.id, simulationProvider("email"));
    const history = await domain.getDispatch(atelier, dispatched.id);
    await db
      .prepare("UPDATE documents SET created_at=? WHERE id=?")
      .bind(oldDate, expired.id)
      .run();
    await maintainDocuments(env);
    expect(await bucket.get(expired.storage_key)).toBeNull();

    const [replacement, duplicate] = await Promise.all([
      documents.upload(atelier, { name: "reimport.pdf", bytes: original }),
      documents.upload(atelier, { name: "duplicate.pdf", bytes: original }),
    ]);
    const separate = await documents.upload(studio, {
      name: "other-tenant.pdf",
      bytes: original,
    });
    expect(replacement.id).not.toBe(expired.id);
    expect(duplicate.id).toBe(replacement.id);
    expect(separate.id).not.toBe(replacement.id);
    expect(replacement.storage_key).not.toBe(expired.storage_key);
    expect(replacement.status).toBe("ready");
    expect((await bucket.list()).objects).toHaveLength(2);
    await maintainDocuments(env);
    await maintainDocuments(env);
    expect(
      new Uint8Array(
        await (
          await documents.getContent(atelier, replacement.id)
        ).arrayBuffer(),
      ),
    ).toEqual(original);
    expect(await domain.getDispatch(atelier, dispatched.id)).toEqual(history);
    expect((await domain.getDocument(atelier, expired.id)).status).toBe(
      "purged",
    );
    await expect(
      documents.getContent(atelier, expired.id),
    ).rejects.toMatchObject({ code: "DOCUMENT_QUARANTINED" });
    await expect(
      db
        .prepare("UPDATE documents SET status='ready' WHERE id=?")
        .bind(expired.id)
        .run(),
    ).rejects.toThrow("immutable_document");
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });

  it("resuming an interrupted old purge cannot delete newly imported bytes", async () => {
    const expired = await documents.upload(atelier, {
      name: "old.pdf",
      bytes: original,
    });
    await db
      .prepare("UPDATE documents SET status='purged',created_at=? WHERE id=?")
      .bind(oldDate, expired.id)
      .run();
    const replacement = await documents.upload(atelier, {
      name: "new.pdf",
      bytes: original,
    });
    expect(await bucket.get(expired.storage_key)).not.toBeNull();
    expect(replacement.id).not.toBe(expired.id);
    await maintainDocuments(env);
    expect(await bucket.get(expired.storage_key)).toBeNull();
    expect(
      new Uint8Array(
        await (
          await documents.getContent(atelier, replacement.id)
        ).arrayBuffer(),
      ),
    ).toEqual(original);
  });

  it("leaves bytes intact when registration commits but its result is uncertain", async () => {
    const register = domain.registerDocument.bind(domain);
    const uncertain = vi
      .spyOn(domain, "registerDocument")
      .mockImplementation(async (...args) => {
        await register(...args);
        throw new Error("Lost database response");
      });
    try {
      await expect(
        documents.upload(atelier, { name: "uncertain.pdf", bytes: original }),
      ).rejects.toThrow("Lost database response");
    } finally {
      uncertain.mockRestore();
    }
    const retained = (await domain.listDocuments(atelier)).items[0];
    expect(
      new Uint8Array(
        await (await documents.getContent(atelier, retained.id)).arrayBuffer(),
      ),
    ).toEqual(original);
  });

  it("a failed duplicate cleanup preserves the retained version and remains recoverable", async () => {
    const first = await documents.upload(atelier, {
      name: "original.pdf",
      bytes: original,
    });
    const failedCleanup = new DocumentService(
      {
        ...env,
        DOCUMENTS: {
          put: bucket.put.bind(bucket),
          delete: async () => {
            throw new Error("Cleanup unavailable");
          },
        } as unknown as R2Bucket,
      },
      domain,
    );
    const duplicate = await failedCleanup.upload(atelier, {
      name: "duplicate.pdf",
      bytes: original,
    });
    expect(duplicate.id).toBe(first.id);
    expect((await bucket.list()).objects).toHaveLength(2);
    const future = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.now() + 2 * 86400000);
    try {
      expect(await maintainDocuments(env)).toMatchObject({
        purged: 0,
        orphans: 1,
      });
    } finally {
      future.mockRestore();
    }
    expect((await bucket.list()).objects).toHaveLength(1);
    expect(
      new Uint8Array(
        await (await documents.getContent(atelier, first.id)).arrayBuffer(),
      ),
    ).toEqual(original);
  });

  it("advances bounded retention beyond the first 25 expired documents", async () => {
    const records = [];
    for (let index = 0; index < 26; index++)
      records.push(
        await documents.upload(atelier, {
          name: `expired-${index}.pdf`,
          bytes: await pdf(`Expired letter ${index}`),
        }),
      );
    await db.prepare("UPDATE documents SET created_at=?").bind(oldDate).run();
    for (let run = 0; run < 4; run++) await maintainDocuments(env);
    expect((await bucket.list()).objects).toHaveLength(0);
    expect(
      await db
        .prepare("SELECT count(*) AS n FROM documents WHERE status='purged'")
        .first(),
    ).toEqual({ n: records.length });
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM audit_log WHERE action='document.purged'",
        )
        .first(),
    ).toEqual({ n: records.length });
  });
});
