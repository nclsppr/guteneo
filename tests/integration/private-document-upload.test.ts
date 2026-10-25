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
import {
  AuthError,
  authenticateMcp,
  hashSecret,
  type McpIdentity,
} from "../../apps/api/src/auth";
import * as authentication from "../../apps/api/src/auth";
import {
  PrivateDocumentUploadService,
  PRIVATE_UPLOAD_HEADER,
  PRIVATE_UPLOAD_LEASE_MS,
  type PrivateUploadView,
} from "../../apps/api/src/document-upload";
import { DocumentService } from "../../apps/api/src/documents";
import type { Env } from "../../apps/api/src/env";
import { DomainService } from "../../packages/domain/src/index";

let mf: Miniflare,
  db: D1Database,
  bucket: R2Bucket,
  env: Env,
  identity: McpIdentity,
  service: PrivateDocumentUploadService,
  documents: DocumentService,
  bytes: Uint8Array<ArrayBuffer>,
  sha256: string;
const issuer = "https://private-upload-fixture.auth0.example/";
const keys = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "upload",
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
    .filter((n) => n.endsWith(".sql"))
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
    org = `org_${id}`,
    user = `usr_${id}`,
    date = now();
  env = {
    DB: db,
    DOCUMENTS: bucket,
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
        "INSERT INTO organizations VALUES(?,'Private upload fixture','production',?)",
      )
      .bind(org, date),
    db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Synthetic fixture','fixture@example.invalid',?)",
      )
      .bind(user, date),
    db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(org, user, date),
    db
      .prepare("INSERT INTO auth_identities VALUES(?,?,?,?)")
      .bind(issuer, `auth0|${user}`, user, date),
    db
      .prepare(
        "INSERT INTO authorized_connections VALUES(?,?,?,?,?,'active',0,?,?)",
      )
      .bind(`conn_${id}`, issuer, user, "upload-client", org, date, date),
    db
      .prepare("INSERT INTO content_limits VALUES(?,100,104857600,50)")
      .bind(org),
  ]);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (
      String(input instanceof Request ? input.url : input) ===
      `${issuer}.well-known/jwks.json`
    )
      return Response.json({ keys: [jwk] });
    throw Error("External network is forbidden in this synthetic test");
  });
  const token = await new SignJWT({
    sub: `auth0|${user}`,
    client_id: "upload-client",
    scope: "documents:read documents:write",
    amr: ["pwd"],
    "https://guteneo.com/verified_account": true,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(env.AUTH0_AUDIENCE!)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(keys.privateKey);
  identity = await authenticateMcp(
    new Request("https://guteneo.com/mcp", {
      headers: { Authorization: `Bearer ${token}` },
    }),
    env,
  );
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText(`Synthetic upload ${id}`);
  bytes = new Uint8Array(await pdf.save());
  sha256 = await hashSecretBytes(bytes);
  const domain = new DomainService(db, { mode: "production" });
  documents = new DocumentService(env, domain);
  service = new PrivateDocumentUploadService(env, domain, documents);
});
async function hashSecretBytes(value: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", value as Uint8Array<ArrayBuffer>),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
const begin = (key = "synthetic_original") =>
  service.begin(identity, {
    idempotencyKey: key,
    fileName: "synthetic.pdf",
    size: bytes.length,
    sha256,
  });
function put(
  view: PrivateUploadView,
  body: BodyInit = bytes,
  extra: Record<string, string> = {},
) {
  return new Request(view.upload!.url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/pdf",
      [PRIVATE_UPLOAD_HEADER]: view.upload!.capability,
      ...extra,
    },
    body,
    duplex: "half",
  } as RequestInit);
}
async function usage() {
  return db
    .prepare("SELECT uploads,bytes FROM content_usage WHERE organization_id=?")
    .bind(identity.context.organizationId)
    .first();
}

describe("private original PDF transport with real D1/R2 and document pipeline", () => {
  it("rejects a prepared final SQL fence executed after the actual token/capability deadline", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 5;
    const token = await new SignJWT({
      sub: `auth0|${identity.context.userId}`,
      client_id: identity.clientId,
      scope: identity.scopes.join(" "),
      amr: ["pwd"],
      "https://guteneo.com/verified_account": true,
    })
      .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
      .setIssuer(issuer)
      .setAudience(env.AUTH0_AUDIENCE!)
      .setIssuedAt()
      .setExpirationTime(expiry)
      .sign(keys.privateKey);
    identity = await authenticateMcp(
      new Request(`${env.APP_ORIGIN}/mcp`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env,
    );
    const reservation = await begin();
    let early: unknown = "not executed",
      late: unknown = "not executed";
    vi.spyOn(documents, "upload").mockImplementation(
      async (_context, _input, _source, registration) => {
        const fence = registration!.authority.sql();
        const prepared = db
          .prepare(`SELECT 1 allowed WHERE ${fence.condition}`)
          .bind(...fence.values);
        early = await prepared.first();
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, expiry * 1000 - Date.now() + 150)),
        );
        late = await prepared.first();
        throw Error("synthetic prepared SQL executed after expiry");
      },
    );
    expect((await service.receive(put(reservation))).status).toBe(409);
    expect(early).toEqual({ allowed: 1 });
    expect(late).toBeNull();
    expect(await usage()).toBeNull();
  });
  it("checks a lease against the database clock even when its SQL was prepared before expiry", async () => {
    const reservation = await begin();
    let early: unknown = "not executed",
      late: unknown = "not executed";
    vi.spyOn(documents, "upload").mockImplementation(
      async (_context, _input, _source, registration) => {
        const deadline = await db
          .prepare(
            "UPDATE private_document_uploads SET lease_expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 seconds') WHERE organization_id=? AND id=? RETURNING lease_expires_at",
          )
          .bind(identity.context.organizationId, reservation.uploadId)
          .first<{ lease_expires_at: string }>();
        const fence = registration!.authority.sql();
        const prepared = db
          .prepare(`SELECT 1 allowed WHERE ${fence.condition}`)
          .bind(...fence.values);
        early = await prepared.first();
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(
              0,
              Date.parse(deadline!.lease_expires_at) - Date.now() + 150,
            ),
          ),
        );
        late = await prepared.first();
        throw Error("synthetic delayed lease fence");
      },
    );
    expect((await service.receive(put(reservation))).status).toBe(409);
    expect(early).toEqual({ allowed: 1 });
    expect(late).toBeNull();
    expect(await usage()).toBeNull();
  });
  it("reports withdrawn token-issuer trust as an upload-only authority refusal", async () => {
    const reservation = await begin();
    vi.spyOn(authentication, "verifiedMcpTokenIssuer").mockImplementation(
      () => {
        throw new AuthError("TOKEN_INVALID", "Expired or invalid token.");
      },
    );
    const response = await service.receive(put(reservation));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "UPLOAD_AUTHORITY_CHANGED" },
    });
    expect(await usage()).toBeNull();
  });
  it("stores only a capability hash, transfers identical creator-private bytes and keeps unscanned originals quarantined", async () => {
    const reservation = await begin();
    const row = await db
      .prepare("SELECT * FROM private_document_uploads WHERE id=?")
      .bind(reservation.uploadId)
      .first();
    expect(row!.capability_hash).toBe(
      await hashSecret(reservation.upload!.capability),
    );
    expect(JSON.stringify(row)).not.toContain(reservation.upload!.capability);
    expect(JSON.stringify(row)).not.toContain(identity.token);
    expect(await usage()).toBeNull();
    expect((await service.receive(put(reservation))).status).toBe(202);
    const result = await service.get(identity, reservation.uploadId);
    expect(result).toMatchObject({
      status: "complete",
      nextAction: "get_document",
      document: {
        sha256,
        size: bytes.length,
        status: "quarantined",
        access_owner_id: identity.context.userId,
      },
    });
    expect(result.upload).toBeUndefined();
    const stored = await bucket.get(result.document!.storage_key);
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(bytes);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
    expect(
      await db
        .prepare("SELECT COUNT(*) n FROM outbox WHERE organization_id=?")
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ n: 0 });
  });
  it("passes the exact scan and isolated validation gates before reporting ready", async () => {
    const scanner = vi.fn(async (request: Request) => {
      expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
      return Response.json({ verdict: "clean", sha256 });
    });
    env.SCANNER = { fetch: scanner } as unknown as Fetcher;
    env.DOCUMENT_RENDERER = {
      fetch: async (request: Request) => {
        expect(new Uint8Array(await request.arrayBuffer())).toEqual(bytes);
        return Response.json({ sha256, pages: 1 });
      },
    } as unknown as Fetcher;
    const reservation = await begin();
    expect((await service.receive(put(reservation))).status).toBe(202);
    const result = await service.get(identity, reservation.uploadId);
    expect(result.document!.status).toBe("ready");
    expect(scanner).toHaveBeenCalledTimes(1);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) n FROM audit_log WHERE organization_id=? AND action='document.scan_verified'",
        )
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ n: 1 });
  });
  it("rotates only an unused capability on the same idempotent reservation and cannot extend expiry", async () => {
    const first = await begin(),
      second = await begin();
    expect(second.uploadId).toBe(first.uploadId);
    expect(second.expiresAt).toBe(first.expiresAt);
    expect(second.upload!.capability).not.toBe(first.upload!.capability);
    expect((await service.receive(put(first))).status).toBe(403);
    expect((await service.receive(put(second))).status).toBe(202);
    const replay = await begin();
    expect(replay.uploadId).toBe(first.uploadId);
    expect(replay.status).toBe("complete");
    expect(replay.upload).toBeUndefined();
    expect((await service.receive(put(second))).status).toBe(403);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });
  it("allows one concurrent claim before quota, storage or scanning", async () => {
    const reservation = await begin(),
      upload = vi.spyOn(documents, "upload");
    const results = await Promise.all([
      service.receive(put(reservation)),
      service.receive(put(reservation)),
    ]);
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    expect(results.filter((r) => [403, 409].includes(r.status))).toHaveLength(
      1,
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });
  it.each(["wrong-hash", "short-body", "long-body", "declared-size"])(
    "refuses %s before quota and scanning",
    async (mode) => {
      const reservation = await begin(),
        body = new Uint8Array(bytes);
      if (mode === "wrong-hash") body[body.length - 1] ^= 1;
      const value =
        mode === "short-body"
          ? body.subarray(0, body.length - 1)
          : mode === "long-body"
            ? new Uint8Array([...body, 0])
            : body;
      const result = await service.receive(
        put(
          reservation,
          value,
          mode === "declared-size"
            ? { "Content-Length": String(bytes.length + 1) }
            : {},
        ),
      );
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(await usage()).toBeNull();
      expect((await service.get(identity, reservation.uploadId)).status).toBe(
        "rejected",
      );
    },
  );
  it.each(["Cookie", "Authorization", "Origin", "Content-Encoding"])(
    "rejects ambient or unsupported %s before reading bytes",
    async (header) => {
      const reservation = await begin(),
        request = put(reservation, bytes, { [header]: "forbidden_fixture" });
      expect((await service.receive(request)).status).toBe(403);
      expect(await usage()).toBeNull();
      expect((await service.get(identity, reservation.uploadId)).status).toBe(
        "reserved",
      );
    },
  );
  it("rejects changed content, scope, tenant and connection without exposing the reservation", async () => {
    const reservation = await begin();
    await expect(
      service.begin(identity, {
        idempotencyKey: "synthetic_original",
        fileName: "different.pdf",
        size: bytes.length,
        sha256,
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_KEY_CONFLICT" });
    await expect(
      service.get({ ...identity, scopes: [] }, reservation.uploadId),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_SCOPE" });
    await expect(
      service.get(
        {
          ...identity,
          context: { ...identity.context, organizationId: "other" },
        },
        reservation.uploadId,
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_AUTHORITY_CHANGED" });
    await expect(
      service.get({ ...identity, clientId: "other" }, reservation.uploadId),
    ).rejects.toMatchObject({ code: "UPLOAD_AUTHORITY_CHANGED" });
    await db
      .prepare("UPDATE authorized_connections SET status='revoked' WHERE id=?")
      .bind(identity.connectionObservation!.connectionId)
      .run();
    expect((await service.receive(put(reservation))).status).toBe(403);
    expect(await usage()).toBeNull();
    await expect(service.get(identity, reservation.uploadId)).rejects.toThrow();
  });
  it("rechecks membership after receiving the exact body and before consuming quota", async () => {
    const backup = `backup_${crypto.randomUUID()}`;
    await db.batch([
      db
        .prepare(
          "INSERT INTO users(id,name,email,created_at) VALUES(?,'Backup fixture','backup@example.invalid',?)",
        )
        .bind(backup, now()),
      db
        .prepare(
          "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
        )
        .bind(identity.context.organizationId, backup, now()),
    ]);
    const reservation = await begin();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let read!: () => void;
    const bodyRead = new Promise<void>((resolve) => (read = resolve));
    const stream = new ReadableStream(
      {
        async pull(controller) {
          read();
          await gate;
          controller.enqueue(bytes);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const receiving = service.receive(put(reservation, stream));
    await bodyRead;
    await db
      .prepare("DELETE FROM memberships WHERE organization_id=? AND user_id=?")
      .bind(identity.context.organizationId, identity.context.userId)
      .run()
      .catch(async () => {
        await db
          .prepare(
            "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
          )
          .bind(identity.context.organizationId, identity.context.userId)
          .run();
      });
    release();
    expect((await receiving).status).toBe(403);
    expect(await usage()).toBeNull();
  });
  it("recovers a lost final receipt on the same id without rerunning the document pipeline", async () => {
    const reservation = await begin(),
      original = documents.upload.bind(documents);
    const upload = vi
      .spyOn(documents, "upload")
      .mockImplementation(async (...args) => {
        await original(...args);
        throw Error("synthetic lost final receipt");
      });
    expect((await service.receive(put(reservation))).status).toBe(409);
    const recovered = await service.get(identity, reservation.uploadId);
    expect(recovered.status).toBe("complete");
    expect(recovered.document!.sha256).toBe(sha256);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });
  it("keeps an uncertain unregistered import terminal and cleans only its unreferenced owned object", async () => {
    const reservation = await begin();
    const upload = vi
      .spyOn(documents, "upload")
      .mockRejectedValue(Error("synthetic unknown outcome"));
    expect((await service.receive(put(reservation))).status).toBe(409);
    const result = await service.get(identity, reservation.uploadId);
    expect(result).toMatchObject({
      status: "unknown",
      nextAction: "do_not_retry",
    });
    expect((await begin()).upload).toBeUndefined();
    expect(upload).toHaveBeenCalledTimes(1);
    expect((await service.receive(put(reservation))).status).toBe(403);
  });
  it("refuses immutable ledger changes even when called directly through SQL", async () => {
    const reservation = await begin();
    for (const update of [
      "expected_size=expected_size+1",
      "expected_sha256='" + "a".repeat(64) + "'",
      "client_id='other'",
      "expires_at='2099-01-01T00:00:00.000Z'",
    ])
      await expect(
        db
          .prepare(`UPDATE private_document_uploads SET ${update} WHERE id=?`)
          .bind(reservation.uploadId)
          .run(),
      ).rejects.toThrow("private_upload_immutable");
  });
  it("expires unused capabilities without extending the original reservation or reserving content quota", async () => {
    const reservation = await begin();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect((await service.receive(put(reservation))).status).toBe(403);
    const result = await service.get(identity, reservation.uploadId);
    expect(result).toMatchObject({
      status: "rejected",
      errorCode: "UPLOAD_EXPIRED",
      nextAction: "do_not_retry",
    });
    expect(await usage()).toBeNull();
    expect((await begin()).upload).toBeUndefined();
  });
  it("cancels an incomplete binary stream without starting storage or consuming document quota", async () => {
    const reservation = await begin();
    let reading!: () => void;
    const started = new Promise<void>((resolve) => (reading = resolve));
    let cancelled = false;
    const stream = new ReadableStream(
      {
        pull() {
          reading();
          return new Promise(() => {});
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const abort = new AbortController();
    const request = new Request(put(reservation, stream), {
      signal: abort.signal,
    });
    const received = service.receive(request);
    await started;
    abort.abort();
    expect((await received).status).toBe(409);
    expect(cancelled).toBe(true);
    expect(await usage()).toBeNull();
    expect((await service.get(identity, reservation.uploadId)).status).toBe(
      "rejected",
    );
  });
  it("fences an expired finalization lease before a delayed scan can register a document", async () => {
    let scanned!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => (scanned = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    env.SCANNER = {
      fetch: async () => {
        scanned();
        await gate;
        return Response.json({ verdict: "clean", sha256 });
      },
    } as unknown as Fetcher;
    env.DOCUMENT_RENDERER = {
      fetch: async () => Response.json({ sha256, pages: 1 }),
    } as unknown as Fetcher;
    const reservation = await begin(),
      received = service.receive(put(reservation));
    await started;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + PRIVATE_UPLOAD_LEASE_MS + 1000);
    expect((await service.get(identity, reservation.uploadId)).status).toBe(
      "unknown",
    );
    release();
    expect((await received).status).toBe(409);
    expect(
      await db
        .prepare("SELECT COUNT(*) n FROM documents WHERE organization_id=?")
        .bind(identity.context.organizationId)
        .first(),
    ).toEqual({ n: 0 });
    expect((await service.get(identity, reservation.uploadId)).status).toBe(
      "unknown",
    );
    expect(await usage()).toEqual({ uploads: 1, bytes: bytes.length });
  });
});
