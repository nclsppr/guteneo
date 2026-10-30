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
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { PDFDocument } from "pdf-lib";
import { authenticateMcp, type McpIdentity } from "../../apps/api/src/auth";
import { DocumentService } from "../../apps/api/src/documents";
import { PrivateDocumentUploadService } from "../../apps/api/src/document-upload";
import type { Env } from "../../apps/api/src/env";
import { DomainService } from "../../packages/domain/src/index";
import {
  McpAppDocumentUploadService,
  cleanupMcpAppDocumentUploads,
} from "../../apps/api/src/mcp-app-upload";
import {
  MCP_APP_UPLOAD_MAX_CALLS,
  MCP_APP_UPLOAD_MAX_BYTES,
  MCP_APP_UPLOAD_PART_BYTES,
  type McpAppUploadView,
} from "../../packages/contracts/src/mcp-app-upload";

let mf: Miniflare, db: D1Database, bucket: R2Bucket, env: Env;
let identity: McpIdentity, domain: DomainService, documents: DocumentService;
let service: McpAppDocumentUploadService, bytes: Uint8Array<ArrayBuffer>;
let enabled: boolean;
const issuer = "https://mcp-app-upload-fixture.auth0.example/";
const keys = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "app-upload",
  alg: "RS256",
  use: "sig",
};
const now = () => new Date().toISOString();

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
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
    let sql = "",
      trigger = false;
    for (const raw of (
      await readFile(
        new URL(`../../migrations/${name}`, import.meta.url),
        "utf8",
      )
    ).split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!sql)
        trigger = line.startsWith("CREATE TRIGGER") && !line.endsWith("END;");
      sql += line + "\n";
      if (trigger ? line === "END;" : line.endsWith(";")) {
        await db.prepare(sql).run();
        sql = "";
        trigger = false;
      }
    }
    expect(sql.trim(), name).toBe("");
  }
});
afterAll(async () => mf?.dispose());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
beforeEach(async () => {
  const id = crypto.randomUUID(),
    organizationId = `org_${id}`,
    userId = `usr_${id}`,
    date = now();
  env = {
    DB: db,
    DOCUMENTS: {
      get: bucket.get.bind(bucket),
      put: bucket.put.bind(bucket),
      delete: bucket.delete.bind(bucket),
      head: bucket.head.bind(bucket),
      list: bucket.list.bind(bucket),
    } as R2Bucket,
    MODE: "production",
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://guteneo.com",
    AUTH0_DOMAIN: new URL(issuer).hostname,
    AUTH0_AUDIENCE: "https://guteneo.com/mcp",
    AUTH0_CLIENT_ID: "browser",
    AUTH0_AUTH_POLICY: "verified_email",
  } as Env;
  await db.batch([
    db
      .prepare(
        "INSERT INTO organizations VALUES(?,'Synthetic App upload','production',?)",
      )
      .bind(organizationId, date),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Synthetic App reader','app-upload@example.invalid',?)",
      )
      .bind(userId, date),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(organizationId, userId, date),
    db
      .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
      .bind(issuer, `auth0|${userId}`, userId, date),
    db
      .prepare(
        "INSERT INTO authorized_connections VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(
        `conn_${id}`,
        issuer,
        userId,
        "app-upload-client",
        organizationId,
        date,
        date,
      ),
    db
      .prepare("INSERT INTO content_limits VALUES(?,100,104857600,50)")
      .bind(organizationId),
  ]);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (
      String(input instanceof Request ? input.url : input) ===
      `${issuer}.well-known/jwks.json`
    )
      return Response.json({ keys: [jwk] });
    throw Error("External network is forbidden in this synthetic test");
  });
  identity = await currentIdentity(organizationId, userId);
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText(`Synthetic App original ${id}`);
  bytes = new Uint8Array(await pdf.save());
  domain = new DomainService(db, { mode: "production" });
  documents = new DocumentService(env, domain);
  enabled = true;
  service = new McpAppDocumentUploadService(
    env,
    domain,
    async () => {
      if (!enabled) throw Error("Synthetic activation withdrawn");
    },
    documents,
  );
});

async function currentIdentity(
  organizationId: string,
  userId: string,
  expiration: number | string = "10m",
) {
  const token = await new SignJWT({
    sub: `auth0|${userId}`,
    client_id: "app-upload-client",
    scope: "documents:read documents:write",
    amr: ["pwd"],
    "https://guteneo.com/verified_account": true,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(env.AUTH0_AUDIENCE!)
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(keys.privateKey);
  return authenticateMcp(
    new Request("https://guteneo.com/mcp", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
}
async function hash(value: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", value as Uint8Array<ArrayBuffer>),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function metadata(
  original = bytes,
  idempotencyKey = "synthetic_app_original",
) {
  return {
    idempotencyKey,
    fileName: "synthetic.pdf",
    size: original.length,
    sha256: await hash(original),
  };
}
async function begin(
  original = bytes,
  idempotencyKey = "synthetic_app_original",
) {
  return service.begin(identity, await metadata(original, idempotencyKey));
}
async function part(uploadId: string, partIndex: number, original = bytes) {
  const data = original.subarray(
    partIndex * MCP_APP_UPLOAD_PART_BYTES,
    (partIndex + 1) * MCP_APP_UPLOAD_PART_BYTES,
  );
  return {
    uploadId,
    partIndex,
    base64: Buffer.from(data).toString("base64"),
    sha256: await hash(data),
  };
}
async function appendAll(view: McpAppUploadView, original = bytes) {
  let current = view;
  for (let partIndex = 0; partIndex < view.partCount; partIndex++)
    current = await service.append(
      identity,
      await part(view.uploadId, partIndex, original),
    );
  return current;
}
async function usage() {
  return db
    .prepare("SELECT uploads,bytes FROM content_usage WHERE organization_id=?")
    .bind(identity.context.organizationId)
    .first();
}
async function registeredDocument(id: string) {
  return db
    .prepare(
      "SELECT id,status,sha256,size,access_owner_id,storage_key FROM documents WHERE organization_id=? AND id=?",
    )
    .bind(identity.context.organizationId, id)
    .first<{
      id: string;
      status: string;
      sha256: string;
      size: number;
      access_owner_id: string;
      storage_key: string;
    }>();
}
function cleanPipeline(original = bytes) {
  const scanner = vi.fn(async (request: Request) => {
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(original);
    return Response.json({ verdict: "clean", sha256: await hash(original) });
  });
  env.SCANNER = { fetch: scanner } as unknown as Fetcher;
  env.DOCUMENT_RENDERER = {
    fetch: async (request: Request) => {
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(original);
      return Response.json({ sha256: await hash(original), pages: 1 });
    },
  } as unknown as Fetcher;
  return scanner;
}

describe("App-only private original staging with local D1/R2", () => {
  it("imports an exact multi-part original once and cleans staging without deleting its registered private document", async () => {
    const original = new Uint8Array(MCP_APP_UPLOAD_PART_BYTES + 97).fill(32);
    original.set(bytes);
    const scanner = cleanPipeline(original),
      upload = vi.spyOn(documents, "upload");
    const reservation = await begin(original);
    expect(reservation).toMatchObject({
      status: "receiving",
      partCount: 2,
      receivedBytes: 0,
      confirmedParts: [],
    });
    expect(reservation).not.toHaveProperty("upload");
    const staged = await appendAll(reservation, original);
    expect(staged).toMatchObject({
      confirmedParts: [0, 1],
      receivedBytes: original.length,
      nextAction: "finish",
    });
    expect(await usage()).toBeNull();
    const receipt = await service.finish(identity, {
      uploadId: reservation.uploadId,
    });
    expect(receipt).toMatchObject({
      status: "complete",
      nextAction: "get_document",
      document: { status: "ready" },
    });
    const record = await registeredDocument(receipt.document!.id);
    expect(record).toMatchObject({
      sha256: await hash(original),
      size: original.length,
      access_owner_id: identity.context.userId,
    });
    expect(
      new Uint8Array(
        await (await bucket.get(record!.storage_key))!.arrayBuffer(),
      ),
    ).toEqual(original);
    await service.finish(identity, { uploadId: reservation.uploadId });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(scanner).toHaveBeenCalledTimes(1);
    expect(await usage()).toEqual({ uploads: 1, bytes: original.length });
    for (const forbidden of [
      "synthetic.pdf",
      "base64",
      "capability",
      "storage_key",
      identity.token,
    ])
      expect(JSON.stringify(receipt)).not.toContain(forbidden);
    expect(
      await db
        .prepare("SELECT COUNT(*) n FROM outbox WHERE organization_id=?")
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ n: 0 });

    const cancelled = await begin(bytes, "synthetic_cancelled_original");
    await appendAll(cancelled);
    expect(
      (await service.cancel(identity, { uploadId: cancelled.uploadId })).status,
    ).toBe("cancelled");
    // Make only these already terminal test sessions eligible for the next tick.
    await db
      .prepare(
        "UPDATE mcp_app_document_uploads SET cleanup_not_before='2000-01-01T00:00:00.000Z',next_cleanup_at='2000-01-01T00:00:00.000Z' WHERE organization_id=?",
      )
      .bind(identity.context.organizationId)
      .run();
    const cleanup = await cleanupMcpAppDocumentUploads(env);
    expect(cleanup.sessionsInspected).toBeLessThanOrEqual(2);
    expect(cleanup.partsDeleted).toBeLessThanOrEqual(80);
    expect(
      (
        await bucket.list({
          prefix: `${identity.context.organizationId}/mcp-app-uploads/`,
        })
      ).objects,
    ).toHaveLength(0);
    expect(
      new Uint8Array(
        await (await bucket.get(record!.storage_key))!.arrayBuffer(),
      ),
    ).toEqual(original);
    expect(await usage()).toEqual({ uploads: 1, bytes: original.length });
  });

  it("remains disabled by default and aborts before creating any reservation", async () => {
    const off = new McpAppDocumentUploadService(env, domain);
    await expect(off.begin(identity, await metadata())).rejects.toThrow();
    const abort = new AbortController();
    abort.abort();
    await expect(
      service.begin(identity, await metadata(), abort.signal),
    ).rejects.toThrow();
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM private_document_uploads WHERE organization_id=?",
        )
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ n: 0 });
    expect(await usage()).toBeNull();
  });

  it("recovers the same key and exact confirmed part without another object or quota write", async () => {
    const first = await begin(),
      second = await begin();
    expect(second.uploadId).toBe(first.uploadId);
    expect(second.expiresAt).toBe(first.expiresAt);
    const put = vi.spyOn(env.DOCUMENTS, "put");
    const input = await part(first.uploadId, 0);
    const confirmed = await service.append(identity, input);
    expect(confirmed.confirmedParts).toEqual([0]);
    const replay = await service.append(identity, input);
    expect(replay).toMatchObject({
      confirmedParts: [0],
      receivedBytes: bytes.length,
    });
    expect(put).toHaveBeenCalledTimes(1);
    expect(await usage()).toBeNull();
    await expect(
      service.begin(identity, {
        ...(await metadata()),
        fileName: "different.pdf",
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_KEY_CONFLICT" });
    const changed = new Uint8Array(bytes);
    changed[changed.length - 1] ^= 1;
    await expect(
      service.append(identity, await part(first.uploadId, 0, changed)),
    ).rejects.toMatchObject({ code: "APP_PART_CONFLICT" });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("converges concurrent first reservations on the same key and immutable session", async () => {
    const input = await metadata();
    const [first, second] = await Promise.all([
      service.begin(identity, input),
      service.begin(identity, input),
    ]);
    expect(first.uploadId).toBe(second.uploadId);
    expect(first.expiresAt).toBe(second.expiresAt);
    expect(first.status).toBe("receiving");
    expect(second.status).toBe("receiving");
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM private_document_uploads WHERE organization_id=?",
        )
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ n: 1 });
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM mcp_app_document_uploads WHERE organization_id=?",
        )
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ n: 1 });
    expect(await usage()).toBeNull();
    expect(
      (await bucket.list({ prefix: `${identity.context.organizationId}/` }))
        .objects,
    ).toHaveLength(0);
  });

  it("refuses gaps, incorrect hashes and oversized decoded parts before staging or quota", async () => {
    const original = new Uint8Array(MCP_APP_UPLOAD_PART_BYTES + 20).fill(32);
    original.set(bytes);
    const reservation = await begin(original),
      put = vi.spyOn(env.DOCUMENTS, "put");
    await expect(
      service.append(identity, await part(reservation.uploadId, 1, original)),
    ).rejects.toMatchObject({ code: "APP_PART_ORDER" });
    const input = await part(reservation.uploadId, 0, original);
    const finalPart = await part(reservation.uploadId, 1, original);
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const noncanonical =
      finalPart.base64.slice(0, -2) +
      alphabet[alphabet.indexOf(finalPart.base64.at(-2)!) + 1] +
      "=";
    expect(Buffer.from(noncanonical, "base64")).toEqual(
      Buffer.from(finalPart.base64, "base64"),
    );
    const oversized = new Uint8Array(MCP_APP_UPLOAD_PART_BYTES + 1).fill(32);
    for (const invalid of [
      { ...input, sha256: "0".repeat(64) },
      {
        ...input,
        base64: Buffer.from(oversized).toString("base64"),
        sha256: await hash(oversized),
      },
      { ...input, base64: " " + input.base64.slice(1) },
      { ...input, base64: "_" + input.base64.slice(1) },
      { ...input, base64: "data:application/pdf;base64," + input.base64 },
      { ...finalPart, base64: noncanonical },
    ])
      await expect(service.append(identity, invalid)).rejects.toThrow();
    await expect(
      service.finish(identity, { uploadId: reservation.uploadId }),
    ).rejects.toMatchObject({ code: "APP_UPLOAD_INCOMPLETE" });
    expect(put).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
    expect(
      (await service.get(identity, { uploadId: reservation.uploadId }))
        .receivedBytes,
    ).toBe(0);
  });

  it("recomputes the whole original before entering the shared document pipeline", async () => {
    const reservation = await service.begin(identity, {
      ...(await metadata()),
      sha256: "0".repeat(64),
    });
    await appendAll(reservation);
    const upload = vi.spyOn(documents, "upload");
    expect(
      (await service.finish(identity, { uploadId: reservation.uploadId }))
        .status,
    ).toBe("rejected");
    expect(upload).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
  });

  it("withdraws App authority during assembly before quota, scanning or document registration", async () => {
    const scanner = cleanPipeline();
    const reservation = await begin();
    await appendAll(reservation);
    const upload = vi.spyOn(documents, "upload");
    const originalGet = env.DOCUMENTS.get.bind(env.DOCUMENTS);
    const reads = vi
      .spyOn(env.DOCUMENTS, "get")
      .mockImplementation(async (...args) => {
        const object = await originalGet(...args);
        enabled = false;
        return object;
      });
    const receipt = await service.finish(identity, {
      uploadId: reservation.uploadId,
    });
    expect(receipt).toMatchObject({ status: "rejected", nextAction: "stop" });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
    expect(scanner).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
    expect(
      await db
        .prepare(
          "SELECT state FROM private_document_uploads WHERE organization_id=? AND id=?",
        )
        .bind(identity.context.organizationId, reservation.uploadId)
        .first(),
    ).toEqual({ state: "rejected" });
    expect(
      await db
        .prepare("SELECT COUNT(*) n FROM documents WHERE organization_id=?")
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ n: 0 });
    enabled = true;
    expect(
      (await service.finish(identity, { uploadId: reservation.uploadId }))
        .status,
    ).toBe("rejected");
    expect(upload).not.toHaveBeenCalled();
    expect(scanner).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
  });

  it("keeps unscanned exact originals quarantined rather than reporting them ready", async () => {
    const reservation = await begin();
    await appendAll(reservation);
    const receipt = await service.finish(identity, {
      uploadId: reservation.uploadId,
    });
    expect(receipt).toMatchObject({
      status: "complete",
      document: { status: "quarantined" },
    });
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });

  it("does not expose App originals through the existing binary status contract", async () => {
    const reservation = await begin();
    await appendAll(reservation);
    const receipt = await service.finish(identity, {
      uploadId: reservation.uploadId,
    });
    expect(receipt.status).toBe("complete");
    const binary = new PrivateDocumentUploadService(env, domain, documents);
    await expect(binary.get(identity, reservation.uploadId)).rejects.toThrow();
    const appStatus = await service.get(identity, {
      uploadId: reservation.uploadId,
    });
    expect(appStatus.document).toEqual({
      id: receipt.document!.id,
      status: "quarantined",
    });
    for (const forbidden of [
      "synthetic.pdf",
      "fileName",
      "storage_key",
      "base64",
      "capability",
    ])
      expect(JSON.stringify(appStatus)).not.toContain(forbidden);
    const legacy = await binary.begin(
      identity,
      await metadata(bytes, "synthetic_binary_original"),
    );
    expect(await binary.get(identity, legacy.uploadId)).toMatchObject({
      uploadId: legacy.uploadId,
      status: "reserved",
    });
  });

  it("refuses foreign principals, revoked connections and withdrawn activation without accepting another part", async () => {
    const reservation = await begin(),
      input = await part(reservation.uploadId, 0),
      put = vi.spyOn(env.DOCUMENTS, "put");
    for (const actor of [
      { ...identity, scopes: [] },
      { ...identity, clientId: "other" },
      {
        ...identity,
        context: { ...identity.context, organizationId: "other" },
      },
      { ...identity, context: { ...identity.context, userId: "other" } },
    ]) {
      await expect(service.append(actor, input)).rejects.toThrow();
      await expect(
        service.get(actor, { uploadId: reservation.uploadId }),
      ).rejects.toThrow();
    }
    enabled = false;
    await expect(service.append(identity, input)).rejects.toThrow();
    enabled = true;
    await db
      .prepare("UPDATE authorized_connections SET status='revoked' WHERE id=?")
      .bind(identity.connectionObservation!.connectionId)
      .run();
    await expect(service.append(identity, input)).rejects.toThrow();
    await expect(
      service.get(identity, { uploadId: reservation.uploadId }),
    ).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
  });

  it("rechecks authority after a part object write before confirming its receipt", async () => {
    const reservation = await begin(),
      originalPut = env.DOCUMENTS.put.bind(env.DOCUMENTS);
    vi.spyOn(env.DOCUMENTS, "put").mockImplementation(async (...args) => {
      const result = await originalPut(...args);
      await db
        .prepare(
          "UPDATE authorized_connections SET status='revoked' WHERE id=?",
        )
        .bind(identity.connectionObservation!.connectionId)
        .run();
      return result;
    });
    await expect(
      service.append(identity, await part(reservation.uploadId, 0)),
    ).rejects.toMatchObject({ code: "UPLOAD_AUTHORITY_CHANGED" });
    expect(
      await db
        .prepare(
          "SELECT state,received_bytes FROM mcp_app_document_uploads WHERE organization_id=? AND upload_id=?",
        )
        .bind(identity.context.organizationId, reservation.uploadId)
        .first(),
    ).toEqual({ state: "unknown", received_bytes: 0 });
    expect(
      await db
        .prepare(
          "SELECT state FROM mcp_app_document_upload_parts WHERE organization_id=? AND upload_id=?",
        )
        .bind(identity.context.organizationId, reservation.uploadId)
        .first(),
    ).toEqual({ state: "unknown" });
    expect(await usage()).toBeNull();
    await expect(
      service.get(identity, { uploadId: reservation.uploadId }),
    ).rejects.toThrow();
  });

  it("withdraws activation after the part receipt claim without putting bytes or retaining phantom staging debt", async () => {
    const reservation = await begin();
    const put = vi.spyOn(env.DOCUMENTS, "put");
    const prepare = db.prepare.bind(db);
    const withdrawAfterRun = (
      statement: D1PreparedStatement,
    ): D1PreparedStatement =>
      new Proxy(statement, {
        get(target, property) {
          if (property === "bind")
            return (...values: unknown[]) =>
              withdrawAfterRun(target.bind(...values));
          if (property === "run")
            return async () => {
              const result = await target.run();
              enabled = false;
              return result;
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    env.DB = new Proxy(db, {
      get(target, property) {
        if (property === "prepare")
          return (query: string) => {
            const statement = prepare(query);
            return query.startsWith("INSERT INTO mcp_app_document_upload_parts")
              ? withdrawAfterRun(statement)
              : statement;
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    expect(
      await service.append(identity, await part(reservation.uploadId, 0)),
    ).toMatchObject({
      status: "rejected",
      errorCode: "APP_PART_NOT_ACCEPTED",
      nextAction: "stop",
      confirmedParts: [],
      receivedBytes: 0,
    });
    expect(put).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
    expect(
      await db
        .prepare(
          "SELECT state FROM private_document_uploads WHERE organization_id=? AND id=?",
        )
        .bind(identity.context.organizationId, reservation.uploadId)
        .first(),
    ).toEqual({ state: "rejected" });
    expect(
      await db
        .prepare(
          "SELECT storage_settled FROM mcp_app_document_upload_parts WHERE organization_id=? AND upload_id=?",
        )
        .bind(identity.context.organizationId, reservation.uploadId)
        .first(),
    ).toEqual({ storage_settled: 1 });
    enabled = true;
    await db
      .prepare(
        "UPDATE mcp_app_document_uploads SET cleanup_not_before='2000-01-01T00:00:00.000Z',next_cleanup_at='2000-01-01T00:00:00.000Z' WHERE organization_id=? AND upload_id=?",
      )
      .bind(identity.context.organizationId, reservation.uploadId)
      .run();
    await cleanupMcpAppDocumentUploads(env);
    expect(
      await db
        .prepare(
          "SELECT COALESCE(SUM(reserved_bytes),0) debt FROM mcp_app_document_uploads WHERE organization_id=? AND cleaned_at IS NULL",
        )
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ debt: 0 });
    expect(put).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
  });

  it("cancels an unfinished session and cannot finish or write after cancellation", async () => {
    const reservation = await begin();
    await appendAll(reservation);
    const upload = vi.spyOn(documents, "upload"),
      put = vi.spyOn(env.DOCUMENTS, "put");
    expect(
      await service.cancel(identity, { uploadId: reservation.uploadId }),
    ).toMatchObject({ status: "cancelled", nextAction: "stop" });
    expect(
      (await service.finish(identity, { uploadId: reservation.uploadId }))
        .status,
    ).toBe("cancelled");
    expect(
      (await service.append(identity, await part(reservation.uploadId, 0)))
        .status,
    ).toBe("cancelled");
    expect(upload).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
  });

  it("does not extend the original expiry when a fresh current token reads the same session", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 2;
    identity = await currentIdentity(
      identity.context.organizationId,
      identity.context.userId,
      expiry,
    );
    const reservation = await begin();
    expect(Date.parse(reservation.expiresAt)).toBeLessThanOrEqual(
      expiry * 1000,
    );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, expiry * 1000 - Date.now() + 150)),
    );
    identity = await currentIdentity(
      identity.context.organizationId,
      identity.context.userId,
    );
    const expired = await service.get(identity, {
      uploadId: reservation.uploadId,
    });
    expect(expired).toMatchObject({
      status: "expired",
      nextAction: "stop",
      expiresAt: reservation.expiresAt,
    });
    expect(await usage()).toBeNull();
  });

  it("keeps an absent storage-uncertain part stopped without a blind replay", async () => {
    const reservation = await begin(),
      put = vi
        .spyOn(env.DOCUMENTS, "put")
        .mockRejectedValue(Error("Synthetic uncertain storage"));
    const input = await part(reservation.uploadId, 0);
    expect((await service.append(identity, input)).status).toBe("unknown");
    expect(
      (await service.get(identity, { uploadId: reservation.uploadId })).status,
    ).toBe("unknown");
    expect((await service.append(identity, input)).status).toBe("unknown");
    expect(put).toHaveBeenCalledTimes(1);
    expect(await usage()).toBeNull();
    await service.cancel(identity, { uploadId: reservation.uploadId });
    await db
      .prepare(
        "UPDATE mcp_app_document_uploads SET cleanup_not_before='2000-01-01T00:00:00.000Z',next_cleanup_at='2000-01-01T00:00:00.000Z' WHERE organization_id=? AND upload_id=?",
      )
      .bind(identity.context.organizationId, reservation.uploadId)
      .run();
    const cleanup = await cleanupMcpAppDocumentUploads(env);
    expect(cleanup.unresolved).toBeGreaterThanOrEqual(1);
    expect(
      await db
        .prepare(
          "SELECT cleaned_at FROM mcp_app_document_uploads WHERE organization_id=? AND upload_id=?",
        )
        .bind(identity.context.organizationId, reservation.uploadId)
        .first(),
    ).toEqual({ cleaned_at: null });
  });

  it("positively reconciles a committed part whose put receipt was lost without writing that part again", async () => {
    const scanner = cleanPipeline();
    const reservation = await begin();
    const originalPut = env.DOCUMENTS.put.bind(env.DOCUMENTS);
    let loseReceipt = true;
    const put = vi
      .spyOn(env.DOCUMENTS, "put")
      .mockImplementation(async (...args) => {
        const object = await originalPut(...args);
        if (loseReceipt) {
          loseReceipt = false;
          throw Error("Synthetic committed part with a lost receipt");
        }
        return object;
      });
    expect(
      await service.append(identity, await part(reservation.uploadId, 0)),
    ).toMatchObject({
      status: "unknown",
      errorCode: "APP_PART_UNCONFIRMED",
      confirmedParts: [],
      receivedBytes: 0,
    });
    expect(
      await service.get(identity, { uploadId: reservation.uploadId }),
    ).toMatchObject({
      status: "receiving",
      confirmedParts: [0],
      receivedBytes: bytes.length,
      nextAction: "finish",
    });
    expect(put).toHaveBeenCalledTimes(1);
    expect(await usage()).toBeNull();
    const upload = vi.spyOn(documents, "upload");
    expect(
      (await service.finish(identity, { uploadId: reservation.uploadId }))
        .status,
    ).toBe("complete");
    expect(
      put.mock.calls.filter(([objectKey]) =>
        objectKey.includes("/mcp-app-uploads/"),
      ),
    ).toHaveLength(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(scanner).toHaveBeenCalledTimes(1);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });

  it("reconciles a lost final receipt without a second pipeline and keeps an unresolved outcome terminal", async () => {
    cleanPipeline();
    const originalUpload = documents.upload.bind(documents);
    const upload = vi
      .spyOn(documents, "upload")
      .mockImplementation(async (...args) => {
        await originalUpload(...args);
        throw Error("Synthetic lost final receipt");
      });
    const reservation = await begin();
    await appendAll(reservation);
    expect(
      (await service.finish(identity, { uploadId: reservation.uploadId }))
        .status,
    ).toBe("complete");
    expect(
      (await service.get(identity, { uploadId: reservation.uploadId })).status,
    ).toBe("complete");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });

    const different = new Uint8Array([...bytes, 10]);
    upload.mockRejectedValue(Error("Synthetic unregistered unknown outcome"));
    const unknown = await begin(different, "synthetic_unknown_original");
    await appendAll(unknown, different);
    expect(
      (await service.finish(identity, { uploadId: unknown.uploadId })).status,
    ).toBe("unknown");
    expect(
      (await service.finish(identity, { uploadId: unknown.uploadId })).status,
    ).toBe("unknown");
    expect(
      (await service.get(identity, { uploadId: unknown.uploadId })).nextAction,
    ).toBe("stop");
    expect(upload).toHaveBeenCalledTimes(2);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });

  it("allows one finalization claim while a concurrent caller receives an in-flight state", async () => {
    cleanPipeline();
    const reservation = await begin();
    await appendAll(reservation);
    const originalUpload = documents.upload.bind(documents);
    let started!: () => void, release!: () => void;
    const held = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const upload = vi
      .spyOn(documents, "upload")
      .mockImplementation(async (...args) => {
        started();
        await gate;
        return originalUpload(...args);
      });
    const pending = service.finish(identity, {
      uploadId: reservation.uploadId,
    });
    await held;
    expect(
      await service.finish(identity, { uploadId: reservation.uploadId }),
    ).toMatchObject({ status: "finalizing", nextAction: "wait" });
    release();
    expect((await pending).status).toBe("complete");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });

  it("fences cancellation after the shared pipeline starts without falsely reporting cancellation or retrying", async () => {
    cleanPipeline();
    const reservation = await begin();
    await appendAll(reservation);
    const originalUpload = documents.upload.bind(documents);
    let started!: () => void, release!: () => void;
    const held = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const upload = vi
      .spyOn(documents, "upload")
      .mockImplementation(async (...args) => {
        started();
        await gate;
        return originalUpload(...args);
      });
    const pending = service.finish(identity, {
      uploadId: reservation.uploadId,
    });
    await held;
    expect(
      await service.cancel(identity, { uploadId: reservation.uploadId }),
    ).toMatchObject({ status: "unknown", nextAction: "stop" });
    release();
    expect((await pending).status).toBe("unknown");
    expect(
      (await service.finish(identity, { uploadId: reservation.uploadId }))
        .status,
    ).toBe("unknown");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await usage()).toBeNull();
    expect(
      await db
        .prepare("SELECT COUNT(*) n FROM documents WHERE organization_id=?")
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });

  it("lets a committed original win a stale cancellation before the App final receipt", async () => {
    cleanPipeline();
    const reservation = await begin();
    await appendAll(reservation);
    const upload = vi.spyOn(documents, "upload");
    let cancellationReached!: () => void,
      allowCancellation!: () => void,
      finalReceiptReached!: () => void,
      allowFinalReceipt!: () => void;
    const cancellationWaiting = new Promise<void>((resolve) => {
      cancellationReached = resolve;
    });
    const cancellationGate = new Promise<void>((resolve) => {
      allowCancellation = resolve;
    });
    const receiptWaiting = new Promise<void>((resolve) => {
      finalReceiptReached = resolve;
    });
    const receiptGate = new Promise<void>((resolve) => {
      allowFinalReceipt = resolve;
    });
    const prepare = db.prepare.bind(db);
    const holdRun = (
      statement: D1PreparedStatement,
      reached: () => void,
      gate: Promise<void>,
    ): D1PreparedStatement =>
      new Proxy(statement, {
        get(target, property) {
          if (property === "bind")
            return (...values: unknown[]) =>
              holdRun(target.bind(...values), reached, gate);
          if (property === "run")
            return async () => {
              reached();
              await gate;
              return target.run();
            };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    env.DB = new Proxy(db, {
      get(target, property) {
        if (property === "prepare")
          return (query: string) => {
            const statement = prepare(query);
            if (
              query.startsWith("UPDATE private_document_uploads SET state=CASE")
            )
              return holdRun(statement, cancellationReached, cancellationGate);
            if (
              query.startsWith(
                "UPDATE mcp_app_document_uploads SET state=?,writer_token=NULL",
              ) &&
              query.includes("state='finalizing' AND writer_token=?")
            )
              return holdRun(statement, finalReceiptReached, receiptGate);
            return statement;
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const cancelling = service.cancel(identity, {
      uploadId: reservation.uploadId,
    });
    await cancellationWaiting;
    // Cancellation has already read the old reserved row, but has not fenced it.
    const finishing = service.finish(identity, {
      uploadId: reservation.uploadId,
    });
    await receiptWaiting;
    expect(
      await db
        .prepare(
          "SELECT state FROM private_document_uploads WHERE organization_id=? AND id=?",
        )
        .bind(identity.context.organizationId, reservation.uploadId)
        .first(),
    ).toEqual({ state: "complete" });
    allowCancellation();
    const cancelled = await cancelling;
    expect(cancelled).toMatchObject({
      status: "complete",
      nextAction: "get_document",
    });
    allowFinalReceipt();
    const finished = await finishing;
    expect(finished.status).toBe("complete");
    expect(finished.document).toEqual(cancelled.document);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });

  it("recovers an expired finalizer permit through bounded cron without deleting or importing its registered original again", async () => {
    const reservation = await begin();
    await appendAll(reservation);
    const originalUpload = documents.upload.bind(documents);
    let registered!: () => void, release!: () => void;
    let documentId: string | undefined;
    const registration = new Promise<void>((resolve) => {
      registered = resolve;
    });
    const receiptGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const upload = vi
      .spyOn(documents, "upload")
      .mockImplementation(async (...args) => {
        const document = await originalUpload(...args);
        documentId = document.id;
        registered();
        await receiptGate;
        return document;
      });
    const finishing = service.finish(identity, {
      uploadId: reservation.uploadId,
    });
    await registration;
    try {
      const document = await registeredDocument(documentId!);
      expect(document).toMatchObject({ status: "quarantined" });
      expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
      expect(
        await db
          .prepare(
            "SELECT state FROM private_document_uploads WHERE organization_id=? AND id=?",
          )
          .bind(identity.context.organizationId, reservation.uploadId)
          .first(),
      ).toEqual({ state: "uploading" });
      expect(
        await db
          .prepare(
            "SELECT 1 future FROM mcp_app_document_uploads WHERE organization_id=? AND upload_id=? AND state='finalizing' AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND cleanup_not_before>strftime('%Y-%m-%dT%H:%M:%fZ','now')",
          )
          .bind(identity.context.organizationId, reservation.uploadId)
          .first(),
      ).toEqual({ future: 1 });
      // Only the App writer lease lapses; the original reservation stays live.
      await db
        .prepare(
          "UPDATE mcp_app_document_uploads SET writer_expires_at='2000-01-01T00:00:00.000Z',next_cleanup_at='2000-01-01T00:00:00.000Z' WHERE organization_id=? AND upload_id=?",
        )
        .bind(identity.context.organizationId, reservation.uploadId)
        .run();
      const cleanup = await cleanupMcpAppDocumentUploads(env);
      expect(cleanup.sessionsInspected).toBeGreaterThanOrEqual(1);
      expect(cleanup.sessionsInspected).toBeLessThanOrEqual(2);
      expect(cleanup.partsDeleted).toBe(0);
      expect(
        await db
          .prepare(
            "SELECT state FROM private_document_uploads WHERE organization_id=? AND id=?",
          )
          .bind(identity.context.organizationId, reservation.uploadId)
          .first(),
      ).toEqual({ state: "unknown" });
      expect(
        await db
          .prepare(
            "SELECT state,writer_token,writer_expires_at FROM mcp_app_document_uploads WHERE organization_id=? AND upload_id=?",
          )
          .bind(identity.context.organizationId, reservation.uploadId)
          .first(),
      ).toEqual({
        state: "unknown",
        writer_token: null,
        writer_expires_at: null,
      });
      expect(
        await db
          .prepare(
            "SELECT COUNT(*) n FROM mcp_app_document_uploads WHERE state='finalizing'",
          )
          .first(),
      ).toEqual({ n: 0 });
      expect(
        (
          await bucket.list({
            prefix: `${identity.context.organizationId}/mcp-app-uploads/`,
          })
        ).objects,
      ).toHaveLength(1);
      expect(
        new Uint8Array(
          await (await bucket.get(document!.storage_key))!.arrayBuffer(),
        ),
      ).toEqual(bytes);
      expect(
        await service.get(identity, { uploadId: reservation.uploadId }),
      ).toMatchObject({
        status: "complete",
        document: { id: documentId, status: "quarantined" },
      });
      expect(upload).toHaveBeenCalledTimes(1);
      expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
    } finally {
      release();
    }
    expect(await finishing).toMatchObject({
      status: "complete",
      document: { id: documentId, status: "quarantined" },
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });

  it("bounds admission to one active App session per user and counts status/replay calls", async () => {
    const first = await begin();
    await expect(
      begin(bytes, "synthetic_other_original"),
    ).rejects.toMatchObject({ code: "APP_UPLOAD_LIMIT", status: 429 });
    expect(await usage()).toBeNull();
    let view = first;
    for (let call = 1; call < MCP_APP_UPLOAD_MAX_CALLS; call++)
      view = await service.get(identity, { uploadId: first.uploadId });
    expect(view).toMatchObject({ remainingCalls: 0, nextAction: "stop" });
    await expect(
      service.get(identity, { uploadId: first.uploadId }),
    ).rejects.toMatchObject({ code: "APP_UPLOAD_CALL_LIMIT", status: 429 });
    expect(await usage()).toBeNull();
  });

  it("does not revisit settled historical staging or let it displace new unresolved cleanup debt", async () => {
    const historicalIds: string[] = [];
    for (let index = 0; index < 8; index++) {
      const reservation = await begin(
        bytes,
        `synthetic_clean_history_${index}`,
      );
      await appendAll(reservation);
      await service.cancel(identity, { uploadId: reservation.uploadId });
      historicalIds.push(reservation.uploadId);
    }
    await db
      .prepare(
        "UPDATE mcp_app_document_uploads SET cleanup_not_before='2000-01-01T00:00:00.000Z',next_cleanup_at='2000-01-01T00:00:00.000Z' WHERE organization_id=?",
      )
      .bind(identity.context.organizationId)
      .run();
    for (let tick = 0; tick < 4; tick++)
      expect(await cleanupMcpAppDocumentUploads(env)).toMatchObject({
        sessionsInspected: 2,
        sessionsCleaned: 2,
      });
    const historicalKeys = new Set(
      (
        await db
          .prepare(
            "SELECT object_key FROM mcp_app_document_upload_parts WHERE organization_id=?",
          )
          .bind(identity.context.organizationId)
          .all<{ object_key: string }>()
      ).results.map((part) => part.object_key),
    );
    expect(historicalKeys.size).toBe(8);
    await db
      .prepare(
        "UPDATE mcp_app_document_uploads SET next_cleanup_at='2000-01-01T00:00:00.000Z' WHERE organization_id=? AND cleaned_at IS NOT NULL",
      )
      .bind(identity.context.organizationId)
      .run();

    const uncertain = await begin(bytes, "synthetic_new_unobserved_put");
    const put = vi
      .spyOn(env.DOCUMENTS, "put")
      .mockRejectedValueOnce(Error("Synthetic unobserved storage outcome"));
    expect(
      (await service.append(identity, await part(uncertain.uploadId, 0)))
        .status,
    ).toBe("unknown");
    put.mockRestore();
    await service.cancel(identity, { uploadId: uncertain.uploadId });
    const settled = await begin(bytes, "synthetic_new_settled_put");
    await appendAll(settled);
    await service.cancel(identity, { uploadId: settled.uploadId });
    await db
      .prepare(
        "UPDATE mcp_app_document_uploads SET cleanup_not_before='2001-01-01T00:00:00.000Z',next_cleanup_at='2001-01-01T00:00:00.000Z' WHERE organization_id=? AND cleaned_at IS NULL",
      )
      .bind(identity.context.organizationId)
      .run();

    const head = vi.spyOn(env.DOCUMENTS, "head"),
      remove = vi.spyOn(env.DOCUMENTS, "delete");
    expect(await cleanupMcpAppDocumentUploads(env)).toMatchObject({
      sessionsInspected: 2,
      partsDeleted: 2,
      sessionsCleaned: 1,
      unresolved: 1,
    });
    expect(head.mock.calls.every(([key]) => !historicalKeys.has(key))).toBe(
      true,
    );
    expect(
      remove.mock.calls
        .flatMap(([keys]) => (typeof keys === "string" ? [keys] : keys))
        .every((key) => !historicalKeys.has(key)),
    ).toBe(true);
    const rows = (
      await db
        .prepare(
          "SELECT upload_id,cleaned_at,next_cleanup_at FROM mcp_app_document_uploads WHERE organization_id=?",
        )
        .bind(identity.context.organizationId)
        .all<{
          upload_id: string;
          cleaned_at: string | null;
          next_cleanup_at: string;
        }>()
    ).results;
    expect(
      rows.find((row) => row.upload_id === uncertain.uploadId)?.cleaned_at,
    ).toBeNull();
    expect(
      rows.find((row) => row.upload_id === settled.uploadId)?.cleaned_at,
    ).not.toBeNull();
    expect(
      rows
        .filter((row) => historicalIds.includes(row.upload_id))
        .every(
          (row) =>
            row.cleaned_at !== null &&
            row.next_cleanup_at === "2000-01-01T00:00:00.000Z",
        ),
    ).toBe(true);
    expect(await usage()).toBeNull();
  });

  it("retains cancelled staging debt at 200MiB until a bounded two-session cleanup releases only its own debt", async () => {
    const put = vi.spyOn(env.DOCUMENTS, "put");
    for (let index = 0; index < 20; index++) {
      const reservation = await service.begin(identity, {
        idempotencyKey: `synthetic_debt_${index}`,
        fileName: "synthetic.pdf",
        size: MCP_APP_UPLOAD_MAX_BYTES,
        sha256: "a".repeat(64),
      });
      expect(
        (await service.cancel(identity, { uploadId: reservation.uploadId }))
          .status,
      ).toBe("cancelled");
    }
    const debt = () =>
      db
        .prepare(
          "SELECT SUM(reserved_bytes) debt FROM mcp_app_document_uploads WHERE organization_id=? AND cleaned_at IS NULL",
        )
        .bind(identity.context.organizationId)
        .first();
    expect(await debt()).toEqual({ debt: 20 * MCP_APP_UPLOAD_MAX_BYTES });
    const input = {
      idempotencyKey: "synthetic_debt_overflow",
      fileName: "synthetic.pdf",
      size: MCP_APP_UPLOAD_MAX_BYTES,
      sha256: "a".repeat(64),
    };
    await expect(service.begin(identity, input)).rejects.toMatchObject({
      code: "APP_UPLOAD_LIMIT",
      status: 429,
    });
    expect(put).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
    await db
      .prepare(
        "UPDATE mcp_app_document_uploads SET cleanup_not_before='2000-01-01T00:00:00.000Z',next_cleanup_at='2000-01-01T00:00:00.000Z' WHERE organization_id=?",
      )
      .bind(identity.context.organizationId)
      .run();
    expect(await cleanupMcpAppDocumentUploads(env)).toMatchObject({
      sessionsInspected: 2,
      partsDeleted: 0,
      sessionsCleaned: 2,
      unresolved: 0,
    });
    expect(await debt()).toEqual({ debt: 18 * MCP_APP_UPLOAD_MAX_BYTES });
    expect(
      await service.begin(identity, {
        ...input,
        idempotencyKey: "synthetic_debt_after_cleanup",
      }),
    ).toMatchObject({ status: "receiving", partCount: 40 });
    expect(await debt()).toEqual({ debt: 19 * MCP_APP_UPLOAD_MAX_BYTES });
    expect(put).not.toHaveBeenCalled();
    expect(await usage()).toBeNull();
    expect(
      (await bucket.list({ prefix: `${identity.context.organizationId}/` }))
        .objects,
    ).toHaveLength(0);
  });
});
