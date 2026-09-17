import { readFile, readdir } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { PDFDocument } from "pdf-lib";
import {
  DocumentService,
  type AnalyzedDocument,
} from "../../apps/api/src/documents";
import {
  DomainService,
  type ActorContext,
} from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";

let mf: Miniflare;
let env: Env;
let domain: DomainService;
let bytes: Uint8Array<ArrayBuffer>;
let hash: string;
const owner: ActorContext = {
  organizationId: "org_rescan",
  userId: "user_rescan",
  role: "admin",
  actor: "browser",
};
const other: ActorContext = {
  organizationId: "org_other",
  userId: "user_other",
  role: "admin",
  actor: "browser",
};
const service = (overrides: Partial<Env> = {}) =>
  new DocumentService({ ...env, ...overrides }, domain);
const binding = (fn: (request: Request) => Promise<Response>) =>
  ({ fetch: fn }) as unknown as Fetcher;
const clean = () =>
  binding(async () => Response.json({ sha256: hash, verdict: "clean" }));
const valid = () =>
  binding(async () => Response.json({ sha256: hash, pages: 1 }));

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "document-rescan-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
      r2Buckets: ["DOCUMENTS"],
    }),
  );
  const DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  const DOCUMENTS = (await mf.getR2Bucket("DOCUMENTS")) as unknown as R2Bucket;
  for (const name of (
    await readdir(new URL("../../migrations/", import.meta.url))
  )
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../../migrations/${name}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    const batch: D1PreparedStatement[] = [];
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement)
        trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        batch.push(DB.prepare(statement));
        statement = "";
        trigger = false;
      }
    }
    if (batch.length) await DB.batch(batch);
  }
  for (const actor of [owner, other]) {
    await DB.batch([
      DB.prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,'production',?)",
      ).bind(actor.organizationId, "Fixture", new Date().toISOString()),
      DB.prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
      ).bind(
        actor.userId,
        "Fixture",
        `${actor.userId}@example.invalid`,
        new Date().toISOString(),
      ),
      DB.prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      ).bind(actor.organizationId, actor.userId, new Date().toISOString()),
      DB.prepare(
        "INSERT INTO content_limits(organization_id,uploads_per_day,bytes_per_day,renders_per_day) VALUES(?,100,104857600,50)",
      ).bind(actor.organizationId),
    ]);
  }
  env = {
    DB,
    DOCUMENTS,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    SCANNER: clean(),
    DOCUMENT_RENDERER: valid(),
  } as Env;
  domain = new DomainService(DB, { mode: "production" });
});
beforeEach(async () => {
  // Each test has a distinct real PDF hash, so old verification history
  // cannot make a failed attempt appear to have produced scan proof.
  const pdf = await PDFDocument.create();
  pdf.setTitle(crypto.randomUUID());
  pdf.addPage();
  bytes = new Uint8Array(await pdf.save());
  hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  await env.DB.prepare("DELETE FROM document_scan_usage").run();
  await env.DB.prepare("DELETE FROM document_scan_locks").run();
  await env.DB.prepare("DELETE FROM document_analysis").run();
  await env.DB.prepare("DELETE FROM content_usage").run();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await mf?.dispose();
});
async function quarantine(actor = owner) {
  const id = `doc_${crypto.randomUUID()}`;
  const storageKey = `${actor.organizationId}/documents/${hash}/${id}.pdf`;
  await env.DOCUMENTS.put(storageKey, bytes);
  // Repeated same-byte fixtures within a test retire the previous retained
  // version; historical records and audit evidence remain untouched.
  await env.DB.prepare(
    "UPDATE documents SET status='purged' WHERE organization_id=? AND sha256=? AND status<>'purged'",
  )
    .bind(actor.organizationId, hash)
    .run();
  return domain.registerDocument(actor, {
    id,
    name: "rescan-fixture.pdf",
    sha256: hash,
    size: bytes.length,
    pages: 0,
    status: "quarantined",
    source: "import",
    storageKey,
  });
}
async function scanProof(actor = owner) {
  return env.DB.prepare(
    "SELECT organization_id,user_id,resource_id,details_json FROM audit_log WHERE organization_id=? AND action='document.scan_verified' AND resource_id=?",
  )
    .bind(actor.organizationId, hash)
    .first();
}
async function expectNoVerification(documentId: string, actor = owner) {
  expect(await scanProof(actor)).toBeNull();
  expect(
    await env.DB.prepare(
      "SELECT id FROM audit_log WHERE organization_id=? AND action='document.rescan_verified' AND resource_id=?",
    )
      .bind(actor.organizationId, documentId)
      .first(),
  ).toBeNull();
}

describe("manual rescan of the exact quarantined original", () => {
  it("unlocks only matching clean scan plus isolated validation, preserving ID, bytes and upload budget", async () => {
    const doc = await quarantine();
    const foreign = await quarantine(other);
    await expectNoVerification(doc.id);
    await expectNoVerification(foreign.id, other);
    const put = vi.spyOn(env.DOCUMENTS, "put");
    const del = vi.spyOn(env.DOCUMENTS, "delete");
    const scanner = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/scan");
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
      return Response.json({ sha256: hash, verdict: "clean" });
    });
    const validator = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/validate");
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
      await expectNoVerification(doc.id);
      return Response.json({ sha256: hash, pages: 1 });
    });
    const after = await service({
      SCANNER: binding(scanner),
      DOCUMENT_RENDERER: binding(validator),
    }).rescan(owner, doc.id);
    expect(after).toMatchObject({
      id: doc.id,
      status: "ready",
      pages: 1,
      sha256: doc.sha256,
      storage_key: doc.storage_key,
      created_at: doc.created_at,
    });
    expect(scanner).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare(
        "SELECT count(*) n FROM content_usage WHERE organization_id=?",
      )
        .bind(owner.organizationId)
        .first(),
    ).toMatchObject({ n: 0 });
    expect(
      await env.DB.prepare(
        "SELECT rescans,warmups FROM document_scan_usage WHERE organization_id=?",
      )
        .bind(owner.organizationId)
        .first(),
    ).toMatchObject({ rescans: 1, warmups: 0 });
    expect(
      await env.DB.prepare(
        "SELECT count(*) n FROM audit_log WHERE organization_id=? AND resource_id=? AND action='document.rescan_verified'",
      )
        .bind(owner.organizationId, doc.id)
        .first(),
    ).toMatchObject({ n: 1 });
    expect(await scanProof()).toEqual({
      organization_id: owner.organizationId,
      user_id: owner.userId,
      resource_id: doc.sha256,
      details_json: JSON.stringify({ pages: 1 }),
    });
    await expectNoVerification(foreign.id, other);
    expect((await domain.getDocument(other, foreign.id)).status).toBe(
      "quarantined",
    );
    expect((await env.DOCUMENTS.get(doc.storage_key))?.size).toBe(bytes.length);
  });
  it("rolls back promotion and retry history if the canonical scan proof cannot commit", async () => {
    const doc = await quarantine();
    await env.DB.prepare(
      "CREATE TRIGGER rescan_proof_fixture_failure BEFORE INSERT ON audit_log WHEN NEW.action='document.scan_verified' BEGIN SELECT RAISE(ABORT,'fixture_proof_failure'); END",
    ).run();
    try {
      await expect(service().rescan(owner, doc.id)).rejects.toThrow(
        "fixture_proof_failure",
      );
      expect(await domain.getDocument(owner, doc.id)).toMatchObject({
        status: "quarantined",
        pages: 0,
        sha256: doc.sha256,
      });
      await expectNoVerification(doc.id);
    } finally {
      await env.DB.prepare("DROP TRIGGER rescan_proof_fixture_failure").run();
    }
  });
  it("requires tenant ownership and write permission before storage/provider access", async () => {
    const doc = await quarantine();
    const get = vi.spyOn(env.DOCUMENTS, "get");
    await expect(service().rescan(other, doc.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      service().rescan({ ...owner, role: "viewer" }, doc.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(get).not.toHaveBeenCalled();
    await expectNoVerification(doc.id);
    expect(
      await env.DB.prepare(
        "SELECT count(*) n FROM document_scan_usage",
      ).first(),
    ).toMatchObject({ n: 0 });
  });
  it("keeps ready documents idempotent and refuses purged originals", async () => {
    const doc = await quarantine();
    await service().rescan(owner, doc.id);
    const get = vi.spyOn(env.DOCUMENTS, "get");
    expect((await service().rescan(owner, doc.id)).status).toBe("ready");
    expect(get).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare(
        "SELECT rescans FROM document_scan_usage WHERE organization_id=?",
      )
        .bind(owner.organizationId)
        .first(),
    ).toMatchObject({ rescans: 1 });
    await env.DB.prepare(
      "UPDATE documents SET status='purged' WHERE organization_id=? AND id=?",
    )
      .bind(owner.organizationId, doc.id)
      .run();
    await expect(service().rescan(owner, doc.id)).rejects.toMatchObject({
      code: "DOCUMENT_NOT_RESCANABLE",
    });
  });
  it("refuses missing scanner/validator without spending a retry", async () => {
    const doc = await quarantine();
    for (const absent of [
      { SCANNER: undefined },
      { DOCUMENT_RENDERER: undefined },
    ])
      await expect(service(absent).rescan(owner, doc.id)).rejects.toMatchObject(
        { code: "SCANNER_NOT_CONFIGURED" },
      );
    expect(
      await env.DB.prepare(
        "SELECT count(*) n FROM document_scan_usage",
      ).first(),
    ).toMatchObject({ n: 0 });
  });
  it("never passes missing or altered private bytes to the scanner", async () => {
    const doc = await quarantine();
    const scan = vi.fn(async () =>
      Response.json({ sha256: hash, verdict: "clean" }),
    );
    const altered = bytes.slice();
    altered[altered.length - 1] ^= 1;
    await env.DOCUMENTS.put(doc.storage_key, altered);
    await expect(
      service({ SCANNER: binding(scan) }).rescan(owner, doc.id),
    ).rejects.toMatchObject({ code: "DOCUMENT_INTEGRITY_ERROR" });
    await env.DOCUMENTS.delete(doc.storage_key);
    await expect(
      service({ SCANNER: binding(scan) }).rescan(owner, doc.id),
    ).rejects.toMatchObject({ code: "DOCUMENT_UNAVAILABLE" });
    expect(scan).not.toHaveBeenCalled();
    expect((await domain.getDocument(owner, doc.id)).status).toBe(
      "quarantined",
    );
    await expectNoVerification(doc.id);
  });
  it.each([
    ["infected", () => Response.json({ sha256: hash, verdict: "infected" })],
    [
      "wrong hash",
      () => Response.json({ sha256: "0".repeat(64), verdict: "clean" }),
    ],
    [
      "malformed JSON",
      () =>
        new Response("{bad", {
          headers: { "Content-Type": "application/json" },
        }),
    ],
    [
      "oversized",
      () =>
        Response.json({
          verdict: "clean",
          sha256: hash,
          extra: "x".repeat(5000),
        }),
    ],
    ["unavailable", () => new Response("", { status: 503 })],
  ])(
    "keeps quarantine on scanner %s and never invokes PDF validation",
    async (_label, response) => {
      const doc = await quarantine();
      const validate = vi.fn(async () =>
        Response.json({ sha256: hash, pages: 1 }),
      );
      const result = await service({
        SCANNER: binding(async () => response()),
        DOCUMENT_RENDERER: binding(validate),
      }).rescan(owner, doc.id);
      expect(result.status).toBe("quarantined");
      expect(validate).not.toHaveBeenCalled();
      await expectNoVerification(doc.id);
    },
  );
  it.each([0, -1, 1.5, 99999])(
    "keeps quarantine for invalid validator page count %s",
    async (pages) => {
      const doc = await quarantine();
      const result = await service({
        DOCUMENT_RENDERER: binding(async () =>
          Response.json({ sha256: hash, pages }),
        ),
      }).rescan(owner, doc.id);
      expect(result.status).toBe("quarantined");
      expect(result.pages).toBe(0);
      await expectNoVerification(doc.id);
    },
  );
  it("does not publish scan proof when the validator returns another PDF hash", async () => {
    const doc = await quarantine();
    const result = await service({
      DOCUMENT_RENDERER: binding(async () =>
        Response.json({ sha256: "0".repeat(64), pages: 1 }),
      ),
    }).rescan(owner, doc.id);
    expect(result).toMatchObject({ status: "quarantined", pages: 0 });
    await expectNoVerification(doc.id);
  });
  it("bounds a fetch that ignores cancellation and never promotes a late clean response", async () => {
    const doc = await quarantine();
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let started!: () => void;
    const scanning = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: (response: Response) => void;
    const pending = service({
      SCANNER: binding(async () => {
        started();
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }),
    }).rescan(owner, doc.id);
    await scanning;
    controller.abort();
    expect((await pending).status).toBe("quarantined");
    release(Response.json({ sha256: hash, verdict: "clean" }));
    expect((await domain.getDocument(owner, doc.id)).status).toBe(
      "quarantined",
    );
    expect(
      await env.DB.prepare(
        "SELECT count(*) n FROM document_scan_locks",
      ).first(),
    ).toMatchObject({ n: 0 });
    await expectNoVerification(doc.id);
  });
  it("blocks concurrent rescans of one document and fences a replaced lease", async () => {
    const doc = await quarantine();
    let started!: () => void;
    const scanning = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: (response: Response) => void;
    const pending = service({
      SCANNER: binding(async () => {
        started();
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }),
    }).rescan(owner, doc.id);
    await scanning;
    await expect(service().rescan(owner, doc.id)).resolves.toMatchObject({
      analysis: { state: "processing", nextAction: "wait" },
    });
    await env.DB.prepare(
      "UPDATE document_scan_locks SET token='successor' WHERE organization_id=? AND document_id=?",
    )
      .bind(owner.organizationId, doc.id)
      .run();
    release(Response.json({ sha256: hash, verdict: "clean" }));
    await expect(pending).rejects.toMatchObject({
      code: "DOCUMENT_SCAN_EXPIRED",
    });
    expect((await domain.getDocument(owner, doc.id)).status).toBe(
      "quarantined",
    );
    expect(
      await env.DB.prepare(
        "SELECT token FROM document_scan_locks WHERE organization_id=? AND document_id=?",
      )
        .bind(owner.organizationId, doc.id)
        .first(),
    ).toMatchObject({ token: "successor" });
    await expectNoVerification(doc.id);
  });
  it("does not revive a document purged while scanning", async () => {
    const doc = await quarantine();
    const result = await service({
      SCANNER: binding(async () => {
        await env.DB.prepare(
          "UPDATE documents SET status='purged' WHERE organization_id=? AND id=?",
        )
          .bind(owner.organizationId, doc.id)
          .run();
        return Response.json({ sha256: hash, verdict: "clean" });
      }),
    }).rescan(owner, doc.id);
    expect(result.status).toBe("purged");
    expect(
      await env.DB.prepare(
        "SELECT count(*) n FROM audit_log WHERE resource_id=? AND action='document.rescan_verified'",
      )
        .bind(doc.id)
        .first(),
    ).toMatchObject({ n: 0 });
    await expectNoVerification(doc.id);
  });
  it("rechecks membership after the scanner before promoting a document", async () => {
    const doc = await quarantine();
    const member: ActorContext = {
      ...owner,
      userId: other.userId,
      role: "member",
    };
    await env.DB.prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'member',?)",
    )
      .bind(member.organizationId, member.userId, new Date().toISOString())
      .run();
    await expect(
      service({
        SCANNER: binding(async () => {
          await env.DB.prepare(
            "DELETE FROM memberships WHERE organization_id=? AND user_id=?",
          )
            .bind(member.organizationId, member.userId)
            .run();
          return Response.json({ sha256: hash, verdict: "clean" });
        }),
      }).rescan(member, doc.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await domain.getDocument(owner, doc.id)).status).toBe(
      "quarantined",
    );
    await expectNoVerification(doc.id);
  });
  it("enforces ten retries per UTC day and keeps upload budgets unchanged", async () => {
    const doc = await quarantine();
    const unavailable = service({
      SCANNER: binding(async () => new Response("", { status: 503 })),
    });
    await env.DB.prepare(
      "INSERT INTO document_scan_usage(organization_id,day,rescans,warmups) VALUES(?,?,9,0)",
    )
      .bind(owner.organizationId, new Date().toISOString().slice(0, 10))
      .run();
    expect((await unavailable.rescan(owner, doc.id)).status).toBe(
      "quarantined",
    );
    await expect(unavailable.rescan(owner, doc.id)).resolves.toMatchObject({
      analysis: { state: "processing", nextAction: "wait" },
    });
    await due(doc.id);
    expect(await unavailable.processPendingScans()).toEqual({ processed: 1 });
    await env.DB.prepare(
      "UPDATE document_analysis SET deadline_at=0 WHERE organization_id=? AND document_id=?",
    )
      .bind(owner.organizationId, doc.id)
      .run();
    await expect(unavailable.rescan(owner, doc.id)).rejects.toMatchObject({
      code: "SCAN_QUOTA_EXCEEDED",
    });
    expect(
      await env.DB.prepare(
        "SELECT rescans FROM document_scan_usage WHERE organization_id=?",
      )
        .bind(owner.organizationId)
        .first(),
    ).toMatchObject({ rescans: 10 });
    const otherDocument = await quarantine(other);
    expect((await service().rescan(other, otherDocument.id)).status).toBe(
      "ready",
    );
    expect(
      await env.DB.prepare(
        "SELECT rescans FROM document_scan_usage WHERE organization_id=?",
      )
        .bind(other.organizationId)
        .first(),
    ).toMatchObject({ rescans: 1 });
    expect(
      await env.DB.prepare("SELECT count(*) n FROM content_usage").first(),
    ).toMatchObject({ n: 0 });
    expect(
      await env.DB.prepare(
        "SELECT count(*) n FROM document_scan_locks",
      ).first(),
    ).toMatchObject({ n: 0 });
  });
});

describe("explicit scanner warmup", () => {
  it("allows only browser administrators, transmits no PDF, and reports readiness conservatively", async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.method).toBe("GET");
      expect(request.body).toBeNull();
      expect(new URL(request.url).pathname).toBe("/health");
      return Response.json({ status: "ready" });
    });
    const scanner = service({ SCANNER: binding(fetcher) });
    await expect(
      scanner.warmScanner({ ...owner, actor: "mcp" }),
    ).rejects.toMatchObject({ code: "SCANNER_ADMIN_REQUIRED" });
    expect(await scanner.warmScanner(owner)).toEqual({
      status: "ready",
      retryAfterSeconds: 0,
    });
    expect(
      await service({
        SCANNER: binding(async () => new Response("", { status: 503 })),
      }).warmScanner(owner),
    ).toEqual({ status: "not_ready", retryAfterSeconds: 15 });
    expect(
      await env.DB.prepare(
        "SELECT rescans,warmups FROM document_scan_usage WHERE organization_id=?",
      )
        .bind(owner.organizationId)
        .first(),
    ).toMatchObject({ rescans: 0, warmups: 2 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("limits manual warmups to three per day without spending rescan allowance", async () => {
    await env.DB.prepare(
      "INSERT INTO document_scan_usage(organization_id,day,rescans,warmups) VALUES(?,?,0,3)",
    )
      .bind(owner.organizationId, new Date().toISOString().slice(0, 10))
      .run();
    const fetcher = vi.fn(async () => Response.json({ status: "ready" }));
    await expect(
      service({ SCANNER: binding(fetcher) }).warmScanner(owner),
    ).rejects.toMatchObject({ code: "SCAN_QUOTA_EXCEEDED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

async function due(documentId: string, actor = owner) {
  await env.DB.prepare(
    "UPDATE document_analysis SET next_attempt_at=0 WHERE organization_id=? AND document_id=?",
  )
    .bind(actor.organizationId, documentId)
    .run();
}
const unavailable = () =>
  binding(async () =>
    Response.json({ code: "SCANNER_NOT_READY" }, { status: 503 }),
  );

describe("durable automatic analysis of the retained original", () => {
  it("gives queued originals a full bounded cycle from their first automatic claim despite cron backlog", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const documents: {
      document: AnalyzedDocument;
      original: Uint8Array<ArrayBuffer>;
    }[] = [];
    const pending = service({ SCANNER: unavailable() });
    for (let index = 0; index < 4; index++) {
      const pdf = await PDFDocument.load(bytes);
      pdf.setTitle(`queue-${index}`);
      const original = new Uint8Array(await pdf.save());
      const document = await pending.upload(owner, {
        name: `queue-${index}.pdf`,
        bytes: original,
      });
      documents.push({ document, original });
    }
    documents.sort((a, b) => a.document.id.localeCompare(b.document.id));
    const waiting = documents[3].document;
    const scanner = vi.fn(async (request: Request) => {
      const original = new Uint8Array(await request.arrayBuffer());
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", original)),
        (value) => value.toString(16).padStart(2, "0"),
      ).join("");
      expect(original).toEqual(
        documents.find(({ document }) => document.sha256 === digest)?.original,
      );
      return digest === waiting.sha256
        ? Response.json({ code: "SCANNER_NOT_READY" }, { status: 503 })
        : Response.json({ verdict: "clean", sha256: digest });
    });
    const worker = service({
      SCANNER: binding(scanner),
      DOCUMENT_RENDERER: binding(async (request) => {
        const digest = Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await request.arrayBuffer()),
          ),
          (value) => value.toString(16).padStart(2, "0"),
        ).join("");
        return Response.json({ sha256: digest, pages: 1 });
      }),
    });
    const analysis = (id: string) =>
      env.DB.prepare(
        "SELECT state,attempts,deadline_at FROM document_analysis WHERE organization_id=? AND document_id=?",
      )
        .bind(owner.organizationId, id)
        .first<{ state: string; attempts: number; deadline_at: number }>();

    // Waiting behind the global three-per-cron limit must not consume the
    // recovery window before a document gets its first automatic scanner call.
    now += 11 * 60_000;
    for (const { document } of documents)
      expect((await worker.get(owner, document.id)).analysis).toMatchObject({
        state: "processing",
        nextAction: "wait",
      });
    expect((await worker.rescan(owner, waiting.id)).analysis.state).toBe(
      "processing",
    );
    expect(scanner).not.toHaveBeenCalled();
    expect(await worker.processPendingScans()).toEqual({ processed: 3 });
    expect(scanner).toHaveBeenCalledTimes(3);
    for (const { document } of documents.slice(0, 3)) {
      expect(await worker.get(owner, document.id)).toMatchObject({
        id: document.id,
        sha256: document.sha256,
        status: "ready",
      });
      expect(await analysis(document.id)).toEqual({
        state: "ready",
        attempts: 1,
        deadline_at: now + 10 * 60_000,
      });
    }
    expect(await analysis(waiting.id)).toMatchObject({
      state: "processing",
      attempts: 0,
    });
    expect((await worker.get(owner, waiting.id)).analysis.state).toBe(
      "processing",
    );

    now += 60_000;
    expect(await worker.processPendingScans()).toEqual({ processed: 1 });
    const deadline = now + 10 * 60_000;
    expect(await analysis(waiting.id)).toEqual({
      state: "processing",
      attempts: 1,
      deadline_at: deadline,
    });
    now += 60_000;
    expect(await worker.processPendingScans()).toEqual({ processed: 1 });
    expect(await analysis(waiting.id)).toEqual({
      state: "processing",
      attempts: 2,
      deadline_at: deadline,
    });
    now = deadline;
    expect((await worker.get(owner, waiting.id)).analysis).toMatchObject({
      state: "retryable",
      code: "retry_exhausted",
    });
    expect(await worker.processPendingScans()).toEqual({ processed: 0 });
    expect(scanner).toHaveBeenCalledTimes(5);
    expect(await analysis(waiting.id)).toEqual({
      state: "retryable",
      attempts: 2,
      deadline_at: deadline,
    });
    expect(
      await env.DB.prepare("SELECT count(*) n FROM outbox").first(),
    ).toEqual({ n: 0 });
  });

  it("recovers a cold upload on the cron, preserves exact bytes and attributes proof to the system", async () => {
    const doc = await service({ SCANNER: unavailable() }).upload(owner, {
      name: "original.pdf",
      bytes,
    });
    expect(doc).toMatchObject({
      status: "quarantined",
      analysis: {
        state: "processing",
        code: "scanner_not_ready",
        nextAction: "wait",
      },
    });
    expect(await service().get(owner, doc.id)).toMatchObject({
      analysis: doc.analysis,
    });
    expect((await service().list(owner)).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: doc.id, analysis: doc.analysis }),
      ]),
    );
    const scan = vi.fn(async (request: Request) => {
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
      return Response.json({ verdict: "clean", sha256: hash });
    });
    await due(doc.id);
    expect(
      await service({ SCANNER: binding(scan) }).processPendingScans(),
    ).toEqual({ processed: 1 });
    const ready = await service().get(owner, doc.id);
    expect(ready).toMatchObject({
      id: doc.id,
      sha256: hash,
      storage_key: doc.storage_key,
      status: "ready",
      pages: 1,
      analysis: { state: "ready", nextAction: "continue" },
    });
    expect(
      new Uint8Array(
        await (await env.DOCUMENTS.get(doc.storage_key))!.arrayBuffer(),
      ),
    ).toEqual(bytes);
    expect(await scanProof()).toMatchObject({
      user_id: null,
      details_json: JSON.stringify({ pages: 1, actor: "system" }),
    });
    expect(
      await env.DB.prepare(
        "SELECT count(*) n FROM document_scan_usage",
      ).first(),
    ).toEqual({ n: 0 });
    expect(
      await env.DB.prepare(
        "SELECT uploads FROM content_usage WHERE organization_id=?",
      )
        .bind(owner.organizationId)
        .first(),
    ).toEqual({ uploads: 1 });
    expect(
      await env.DB.prepare("SELECT count(*) n FROM dispatches").first(),
    ).toEqual({ n: 0 });
    expect(
      await env.DB.prepare("SELECT count(*) n FROM outbox").first(),
    ).toEqual({ n: 0 });
    expect(await service().processPendingScans()).toEqual({ processed: 0 });
    expect(scan).toHaveBeenCalledTimes(1);
    await expect(service().get(other, doc.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it.each([
    [
      "security_rejected",
      () => ({
        SCANNER: binding(async () =>
          Response.json({ verdict: "infected", sha256: hash }),
        ),
      }),
    ],
    [
      "integrity_error",
      () => ({
        SCANNER: binding(async () =>
          Response.json({ verdict: "clean", sha256: "0".repeat(64) }),
        ),
      }),
    ],
    [
      "signatures_stale",
      () => ({
        SCANNER: binding(async () =>
          Response.json(
            {
              code: "SIGNATURES_STALE",
              details: "never disclose private service data",
            },
            { status: 503 },
          ),
        ),
      }),
    ],
    ["service_not_configured", () => ({ SCANNER: undefined })],
    [
      "pdf_rejected",
      () => ({
        DOCUMENT_RENDERER: binding(
          async () => new Response("private parser error", { status: 422 }),
        ),
      }),
    ],
    [
      "invalid_response",
      () => ({
        SCANNER: binding(async () =>
          Response.json({ extra: "x".repeat(5000) }),
        ),
      }),
    ],
  ])(
    "retains safe %s reason and never automatically retries permanent failure",
    async (code, overrides) => {
      const doc = await service(overrides()).upload(owner, {
        name: "blocked.pdf",
        bytes,
      });
      expect(doc.analysis).toMatchObject({ state: "blocked", code });
      expect(JSON.stringify(doc.analysis)).not.toContain("private");
      await due(doc.id);
      const scanner = vi.fn(async () =>
        Response.json({ verdict: "clean", sha256: hash }),
      );
      expect(
        await service({ SCANNER: binding(scanner) }).processPendingScans(),
      ).toEqual({ processed: 0 });
      expect(scanner).not.toHaveBeenCalled();
      expect((await service().get(owner, doc.id)).analysis).toEqual(
        doc.analysis,
      );
      await expectNoVerification(doc.id);
    },
  );

  it("bounds retries to five, makes pending manual retries idempotent, and cannot reset via duplicate import", async () => {
    const doc = await quarantine();
    const scan = vi.fn(async () =>
      Response.json({ code: "SCANNER_BUSY" }, { status: 503 }),
    );
    const instance = service({ SCANNER: binding(scan) });
    await instance.rescan(owner, doc.id);
    await instance.rescan(owner, doc.id);
    expect(scan).toHaveBeenCalledTimes(1);
    for (let attempt = 0; attempt < 5; attempt++) {
      await due(doc.id);
      expect(await instance.processPendingScans()).toEqual({ processed: 1 });
    }
    expect(scan).toHaveBeenCalledTimes(6);
    expect((await instance.get(owner, doc.id)).analysis).toMatchObject({
      state: "retryable",
      code: "retry_exhausted",
      nextAction: "rescan",
    });
    await due(doc.id);
    expect(await instance.processPendingScans()).toEqual({ processed: 0 });
    const duplicate = await instance.upload(owner, { name: "same.pdf", bytes });
    expect(duplicate).toMatchObject({
      id: doc.id,
      analysis: { state: "retryable", code: "retry_exhausted" },
    });
    expect(
      await env.DB.prepare(
        "SELECT attempts FROM document_analysis WHERE organization_id=? AND document_id=?",
      )
        .bind(owner.organizationId, doc.id)
        .first(),
    ).toEqual({ attempts: 5 });
    expect(
      await env.DB.prepare(
        "SELECT rescans FROM document_scan_usage WHERE organization_id=?",
      )
        .bind(owner.organizationId)
        .first(),
    ).toEqual({ rescans: 1 });
    expect((await service().rescan(owner, doc.id)).status).toBe("ready");
    expect(
      await env.DB.prepare(
        "SELECT rescans FROM document_scan_usage WHERE organization_id=?",
      )
        .bind(owner.organizationId)
        .first(),
    ).toEqual({ rescans: 2 });
  });

  it("projects an expired deadline immediately and retires it without another scanner call", async () => {
    const doc = await quarantine();
    const instance = service({ SCANNER: unavailable() });
    await instance.rescan(owner, doc.id);
    await due(doc.id);
    expect(await instance.processPendingScans()).toEqual({ processed: 1 });
    await env.DB.prepare(
      "UPDATE document_analysis SET deadline_at=0 WHERE organization_id=? AND document_id=?",
    )
      .bind(owner.organizationId, doc.id)
      .run();
    expect((await service().get(owner, doc.id)).analysis).toMatchObject({
      state: "retryable",
      code: "retry_exhausted",
    });
    expect(await service().processPendingScans()).toEqual({ processed: 0 });
    await expectNoVerification(doc.id);
  });

  it("reclaims a crashed lease once and prevents concurrent cron or manual duplicate scans", async () => {
    const doc = await quarantine();
    await service({ SCANNER: unavailable() }).rescan(owner, doc.id);
    await due(doc.id);
    await env.DB.prepare(
      "INSERT INTO document_scan_locks(organization_id,document_id,token,expires_at) VALUES(?,?,'crashed',0)",
    )
      .bind(owner.organizationId, doc.id)
      .run();
    let started!: () => void;
    const scanning = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: (response: Response) => void;
    const scanner = vi.fn(async () => {
      started();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const active = service({ SCANNER: binding(scanner) }).processPendingScans();
    await scanning;
    expect(await service().processPendingScans()).toEqual({ processed: 0 });
    expect((await service().rescan(owner, doc.id)).analysis.state).toBe(
      "processing",
    );
    release(Response.json({ verdict: "clean", sha256: hash }));
    expect(await active).toEqual({ processed: 1 });
    expect(scanner).toHaveBeenCalledTimes(1);
    expect((await service().get(owner, doc.id)).status).toBe("ready");
    expect(
      await env.DB.prepare(
        "SELECT rescans FROM document_scan_usage WHERE organization_id=?",
      )
        .bind(owner.organizationId)
        .first(),
    ).toEqual({ rescans: 1 });
  });

  it("uses the requesting authority returned by the claim when a selected cycle changes", async () => {
    const doc = await quarantine();
    await service({ SCANNER: unavailable() }).rescan(owner, doc.id);
    await due(doc.id);
    const prepare = env.DB.prepare.bind(env.DB);
    const database = {
      prepare(sql: string) {
        const statement = prepare(sql);
        if (
          !sql.startsWith(
            "SELECT * FROM document_analysis WHERE state='processing'",
          )
        )
          return statement;
        return {
          bind(...values: unknown[]) {
            const bound = statement.bind(...values);
            return {
              async all<T>() {
                const selected = await bound.all<T>();
                // A newer explicit cycle replaced the selected one before claim;
                // its requesting member then lost authority.
                await prepare(
                  "UPDATE document_analysis SET request_user_id=?,request_role='member' WHERE organization_id=? AND document_id=?",
                )
                  .bind(other.userId, owner.organizationId, doc.id)
                  .run();
                return selected;
              },
            } as D1PreparedStatement;
          },
        } as D1PreparedStatement;
      },
      batch: env.DB.batch.bind(env.DB),
    } as D1Database;
    const scanner = vi.fn(async () =>
      Response.json({ verdict: "clean", sha256: hash }),
    );
    await service({
      DB: database,
      SCANNER: binding(scanner),
    }).processPendingScans();
    expect(scanner).not.toHaveBeenCalled();
    expect((await service().get(owner, doc.id)).analysis).toMatchObject({
      state: "blocked",
      code: "access_revoked",
    });
    await expectNoVerification(doc.id);
  });

  it("cannot promote when a successor replaces the automatic lease", async () => {
    const doc = await quarantine();
    await service({ SCANNER: unavailable() }).rescan(owner, doc.id);
    await due(doc.id);
    const scanner = binding(async () => {
      await env.DB.prepare(
        "UPDATE document_scan_locks SET token='successor' WHERE organization_id=? AND document_id=?",
      )
        .bind(owner.organizationId, doc.id)
        .run();
      return Response.json({ verdict: "clean", sha256: hash });
    });
    await expect(
      service({ SCANNER: scanner }).processPendingScans(),
    ).rejects.toMatchObject({ code: "DOCUMENT_SCAN_EXPIRED" });
    await expectNoVerification(doc.id);
    expect((await service().get(owner, doc.id)).status).toBe("quarantined");
    expect(
      await env.DB.prepare(
        "SELECT token FROM document_scan_locks WHERE organization_id=? AND document_id=?",
      )
        .bind(owner.organizationId, doc.id)
        .first(),
    ).toEqual({ token: "successor" });
  });

  it.each(["before", "during"])(
    "rechecks the requesting member %s an automatic scan",
    async (when) => {
      const member: ActorContext = {
        ...owner,
        userId: other.userId,
        role: "member",
      };
      await env.DB.prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'member',?)",
      )
        .bind(member.organizationId, member.userId, new Date().toISOString())
        .run();
      const revoke = () =>
        env.DB.prepare(
          "DELETE FROM memberships WHERE organization_id=? AND user_id=?",
        )
          .bind(member.organizationId, member.userId)
          .run();
      const doc = await quarantine(member);
      await service({ SCANNER: unavailable() }).rescan(member, doc.id);
      await due(doc.id);
      if (when === "before") await revoke();
      const scanner = vi.fn(async () => {
        if (when === "during") await revoke();
        return Response.json({ verdict: "clean", sha256: hash });
      });
      expect(
        await service({ SCANNER: binding(scanner) }).processPendingScans(),
      ).toEqual({ processed: 1 });
      expect(scanner).toHaveBeenCalledTimes(when === "during" ? 1 : 0);
      expect((await service().get(owner, doc.id)).analysis).toMatchObject({
        state: "blocked",
        code: "access_revoked",
      });
      await expectNoVerification(doc.id);
    },
  );

  it.each(["before", "during"])(
    "does not revive an original purged %s automatic scanning",
    async (when) => {
      const doc = await quarantine();
      await service({ SCANNER: unavailable() }).rescan(owner, doc.id);
      await due(doc.id);
      const purge = () =>
        env.DB.prepare(
          "UPDATE documents SET status='purged' WHERE organization_id=? AND id=?",
        )
          .bind(owner.organizationId, doc.id)
          .run();
      if (when === "before") await purge();
      const scanner = vi.fn(async () => {
        if (when === "during") await purge();
        return Response.json({ verdict: "clean", sha256: hash });
      });
      await service({ SCANNER: binding(scanner) }).processPendingScans();
      expect(scanner).toHaveBeenCalledTimes(when === "during" ? 1 : 0);
      expect((await service().get(owner, doc.id)).status).toBe("purged");
      await expectNoVerification(doc.id);
      expect(await service().processPendingScans()).toEqual({ processed: 0 });
    },
  );

  it("blocks an altered R2 original before automatic scanner access", async () => {
    const doc = await quarantine();
    await service({ SCANNER: unavailable() }).rescan(owner, doc.id);
    await due(doc.id);
    const altered = bytes.slice();
    altered[altered.length - 1] ^= 1;
    await env.DOCUMENTS.put(doc.storage_key, altered);
    const scanner = vi.fn(async () =>
      Response.json({ verdict: "clean", sha256: hash }),
    );
    await service({ SCANNER: binding(scanner) }).processPendingScans();
    expect(scanner).not.toHaveBeenCalled();
    expect((await service().get(owner, doc.id)).analysis).toMatchObject({
      state: "blocked",
      code: "integrity_error",
    });
    await expectNoVerification(doc.id);
  });
});
