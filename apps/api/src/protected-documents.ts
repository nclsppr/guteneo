import { protectedDocumentPage as page } from "./protected-document-page";
import { DomainError, sha256 } from "../../../packages/domain/src/index";
import type { PreparedProtectedDocument } from "../../../packages/domain/src/protected-documents";
import { authenticateBrowser, type AuthContext, type AuthEnv } from "./auth";

export type ProtectedDocumentsEnv = AuthEnv & {
  DOCUMENTS: R2Bucket;
  PROTECTED_DOCUMENTS_KEY?: string;
};
type Hosting = {
  id: string;
  organization_id: string;
  document_id: string;
  document_sha256: string;
  duration_days: 1 | 7 | 30;
  token_hash: string;
  password_salt: string;
  password_verifier: string;
  sealed_secrets: string;
  status: "draft" | "active" | "expired" | "revoked";
  expires_at: string;
};
const encoder = new TextEncoder();
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const safeHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
function fail(code: string, message: string, status = 409): never {
  throw new DomainError(code, message, status);
}
function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function unbase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
function random(size = 32): string {
  return base64(crypto.getRandomValues(new Uint8Array(size)));
}
async function encryptionKey(env: ProtectedDocumentsEnv): Promise<CryptoKey> {
  if (!tokenPattern.test(env.PROTECTED_DOCUMENTS_KEY ?? ""))
    fail(
      "PROTECTED_DOCUMENTS_NOT_CONFIGURED",
      "La protection des documents n’est pas encore configurée.",
    );
  return crypto.subtle.importKey(
    "raw",
    unbase64(env.PROTECTED_DOCUMENTS_KEY!),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
const associatedData = (
  row: Pick<
    Hosting,
    "id" | "organization_id" | "document_id" | "document_sha256"
  >,
) =>
  encoder.encode(
    JSON.stringify([
      row.id,
      row.organization_id,
      row.document_id,
      row.document_sha256,
    ]),
  );
async function seal(
  env: ProtectedDocumentsEnv,
  row: Parameters<typeof associatedData>[0],
  value: unknown,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: associatedData(row) },
    await encryptionKey(env),
    encoder.encode(JSON.stringify(value)),
  );
  return `${base64(iv)}.${base64(new Uint8Array(cipher))}`;
}
async function open(
  env: ProtectedDocumentsEnv,
  row: Hosting,
): Promise<{ token: string; password: string }> {
  try {
    const [iv, cipher] = row.sealed_secrets.split(".");
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: unbase64(iv),
        additionalData: associatedData(row),
      },
      await encryptionKey(env),
      unbase64(cipher),
    );
    const value = JSON.parse(new TextDecoder().decode(plaintext));
    if (
      !tokenPattern.test(value.token) ||
      !/^[A-Za-z0-9_-]{24}$/.test(value.password) ||
      (await sha256(value.token)) !== row.token_hash
    )
      throw new Error("invalid");
    return value;
  } catch {
    return fail(
      "PROTECTED_DOCUMENT_UNAVAILABLE",
      "Le document protégé est indisponible.",
    );
  }
}
/** Passwords are generated from 144 random bits, never user-selected or returned to MCP. */
async function passwordVerifier(
  password: string,
  salt: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: unbase64(salt),
      iterations: 100_000,
    },
    key,
    256,
  );
  return base64(new Uint8Array(bits));
}
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
async function member(
  env: ProtectedDocumentsEnv,
  ctx: AuthContext,
): Promise<void> {
  if (
    ctx.role === "viewer" ||
    !(await env.DB.prepare(
      "SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=? AND m.role=? AND o.mode='production'",
    )
      .bind(ctx.organizationId, ctx.userId, ctx.role)
      .first())
  )
    fail("FORBIDDEN", "Cet espace ne vous est pas accessible.", 403);
  if (env.MODE !== "production")
    fail(
      "PROTECTED_DOCUMENTS_PRODUCTION_REQUIRED",
      "Ce service nécessite le mode réel.",
    );
}
export async function prepareProtectedDocument(
  env: ProtectedDocumentsEnv,
  ctx: AuthContext,
  input: { documentId: string; durationDays?: 1 | 7 | 30 },
  now = new Date().toISOString(),
): Promise<PreparedProtectedDocument> {
  await member(env, ctx);
  await encryptionKey(env);
  const duration = input.durationDays ?? 7;
  if (![1, 7, 30].includes(duration))
    fail(
      "INVALID_PROTECTION_DURATION",
      "Choisissez une durée de 1, 7 ou 30 jours.",
      400,
    );
  const document = await env.DB.prepare(
    "SELECT id,sha256 FROM documents d WHERE organization_id=? AND id=? AND status='ready' AND EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=d.organization_id AND a.action='document.scan_verified' AND a.resource_id=d.sha256)",
  )
    .bind(ctx.organizationId, input.documentId)
    .first<{ id: string; sha256: string }>();
  if (!document) fail("DOCUMENT_NOT_READY", "Un PDF vérifié est nécessaire.");
  const material = {
    id: `host_${crypto.randomUUID()}`,
    organization_id: ctx.organizationId,
    document_id: document.id,
    document_sha256: document.sha256,
  };
  const token = random(),
    password = random(18),
    salt = random(16);
  const expiresAt = new Date(
    Date.parse(now) + duration * 86400_000,
  ).toISOString();
  const sealed = await seal(env, material, { token, password });
  const verifier = await passwordVerifier(password, salt);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE protected_document_hostings SET status='expired',sealed_secrets='' WHERE organization_id=? AND document_id=? AND status IN ('draft','active') AND expires_at<=?",
    ).bind(ctx.organizationId, document.id, now),
    env.DB.prepare(
      "INSERT INTO protected_document_hostings(id,organization_id,document_id,document_sha256,duration_days,token_hash,password_salt,password_verifier,sealed_secrets,status,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,?,'draft',?,? WHERE EXISTS(SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND role=?) AND EXISTS(SELECT 1 FROM documents WHERE organization_id=? AND id=? AND sha256=? AND status='ready') ON CONFLICT(organization_id,document_id) WHERE status IN ('draft','active') DO NOTHING",
    ).bind(
      material.id,
      ctx.organizationId,
      document.id,
      document.sha256,
      duration,
      await sha256(token),
      salt,
      verifier,
      sealed,
      now,
      expiresAt,
      ctx.organizationId,
      ctx.userId,
      ctx.role,
      ctx.organizationId,
      document.id,
      document.sha256,
    ),
  ]);
  const row = await env.DB.prepare(
    "SELECT * FROM protected_document_hostings WHERE organization_id=? AND document_id=? AND status IN ('draft','active') AND expires_at>?",
  )
    .bind(ctx.organizationId, document.id, now)
    .first<Hosting>();
  if (!row)
    fail(
      "PROTECTED_DOCUMENT_UNAVAILABLE",
      "Le document protégé est indisponible.",
    );
  const secrets = await open(env, row);
  return {
    hostingId: row.id,
    url: new URL(`/share/${secrets.token}`, env.APP_ORIGIN).href,
    expiresAt: row.expires_at,
    durationDays: row.duration_days,
    hostingFeeMinor: row.status === "active" ? 0 : 100,
    currency: "EUR",
  };
}
async function dispatchHosting(
  env: ProtectedDocumentsEnv,
  ctx: AuthContext,
  dispatchId: string,
  now: string,
): Promise<Hosting> {
  await member(env, ctx);
  if (ctx.actor !== "browser")
    fail(
      "BROWSER_REQUIRED",
      "Ouvrez votre espace Guteneo pour cette action.",
      403,
    );
  const row = await env.DB.prepare(
    "SELECT h.* FROM protected_document_hostings h JOIN dispatches d ON d.organization_id=h.organization_id AND d.document_id=h.document_id AND json_extract(d.options_json,'$.protectedDocument.hostingId')=h.id WHERE h.organization_id=? AND d.id=? AND h.status IN ('draft','active') AND h.expires_at>?",
  )
    .bind(ctx.organizationId, dispatchId, now)
    .first<Hosting>();
  if (!row) fail("NOT_FOUND", "Document protégé indisponible.", 404);
  return row;
}
export async function revealProtectedDocumentPassword(
  env: ProtectedDocumentsEnv,
  ctx: AuthContext,
  dispatchId: string,
  now = new Date().toISOString(),
) {
  const row = await dispatchHosting(env, ctx, dispatchId, now);
  const { password } = await open(env, row);
  await member(env, ctx);
  await env.DB.prepare(
    "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,'protected_document.password_revealed',?,'{}',?)",
  )
    .bind(crypto.randomUUID(), ctx.organizationId, ctx.userId, row.id, now)
    .run();
  return { password, expiresAt: row.expires_at };
}
export async function revokeProtectedDocument(
  env: ProtectedDocumentsEnv,
  ctx: AuthContext,
  dispatchId: string,
  now = new Date().toISOString(),
) {
  const row = await dispatchHosting(env, ctx, dispatchId, now);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE protected_document_hostings SET status='revoked',revoked_at=?,sealed_secrets='' WHERE organization_id=? AND id=? AND status IN ('draft','active') AND EXISTS(SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND role=?)",
    ).bind(
      now,
      ctx.organizationId,
      row.id,
      ctx.organizationId,
      ctx.userId,
      ctx.role,
    ),
    env.DB.prepare(
      "DELETE FROM protected_document_sessions WHERE organization_id=? AND hosting_id=? AND EXISTS(SELECT 1 FROM protected_document_hostings WHERE id=? AND status='revoked')",
    ).bind(ctx.organizationId, row.id, row.id),
    env.DB.prepare(
      "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'protected_document.revoked',?,'{}',? WHERE EXISTS(SELECT 1 FROM protected_document_hostings WHERE organization_id=? AND id=? AND status='revoked')",
    ).bind(
      crypto.randomUUID(),
      ctx.organizationId,
      ctx.userId,
      row.id,
      now,
      ctx.organizationId,
      row.id,
    ),
  ]);
  return { revoked: true };
}
function cookieName(env: ProtectedDocumentsEnv): string {
  return env.ENVIRONMENT === "local"
    ? "guteneo_document"
    : "__Secure-guteneo_document";
}
async function activeHosting(
  env: ProtectedDocumentsEnv,
  token: string,
  now: string,
): Promise<Hosting | null> {
  return env.DB.prepare(
    "SELECT h.* FROM protected_document_hostings h JOIN documents d ON d.organization_id=h.organization_id AND d.id=h.document_id AND d.sha256=h.document_sha256 WHERE h.token_hash=? AND h.status='active' AND h.expires_at>? AND d.status='ready' AND EXISTS(SELECT 1 FROM protected_hosting_charges c WHERE c.organization_id=h.organization_id AND c.hosting_id=h.id)",
  )
    .bind(await sha256(token), now)
    .first<Hosting>();
}
async function sessionValid(
  env: ProtectedDocumentsEnv,
  request: Request,
  row: Hosting,
  now: string,
): Promise<boolean> {
  const cookies = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim());
  const raw =
    cookies
      .find((part) => part.startsWith(`${cookieName(env)}=`))
      ?.slice(cookieName(env).length + 1) ?? "";
  if (!tokenPattern.test(raw)) return false;
  return Boolean(
    await env.DB.prepare(
      "SELECT 1 FROM protected_document_sessions WHERE token_hash=? AND organization_id=? AND hosting_id=? AND expires_at>?",
    )
      .bind(await sha256(raw), row.organization_id, row.id, now)
      .first(),
  );
}
async function allowedAttempt(
  env: ProtectedDocumentsEnv,
  scope: string,
  window: number,
  maximum: number,
): Promise<boolean> {
  const result = await env.DB.prepare(
    "INSERT INTO protected_document_attempts(scope_hash,window_start,attempts) VALUES(?,?,1) ON CONFLICT(scope_hash,window_start) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
  )
    .bind(await sha256(scope), window)
    .first<{ attempts: number }>();
  return Boolean(result && result.attempts <= maximum);
}
async function boundedPassword(request: Request): Promise<string> {
  if (
    !request.headers
      .get("Content-Type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return "";
  const reader = request.body?.getReader();
  if (!reader) return "";
  let body = "",
    size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512) {
        await reader.cancel();
        return "";
      }
      body += new TextDecoder().decode(value);
    }
  } finally {
    reader.releaseLock();
  }
  const values = new URLSearchParams(body);
  return values.getAll("password").length === 1 ? values.get("password")! : "";
}
/** Call before authenticated API middleware. No anonymous request assumes tenant membership. */
export async function handleProtectedDocumentRoute(
  request: Request,
  env: ProtectedDocumentsEnv,
  now = new Date().toISOString(),
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const sensitive =
    /^\/api\/dispatches\/([A-Za-z0-9_-]+)\/protected-document(?:\/(password|revoke))?$/.exec(
      pathname,
    );
  if (sensitive) {
    if (
      !sensitive[2] &&
      request.method === "GET" &&
      !request.headers.has("Authorization")
    ) {
      const session = await authenticateBrowser(request, env);
      await member(env, session.context);
      const row = await env.DB.prepare(
        "SELECT h.status,h.expires_at,h.id FROM protected_document_hostings h JOIN dispatches d ON d.organization_id=h.organization_id AND d.document_id=h.document_id AND json_extract(d.options_json,'$.protectedDocument.hostingId')=h.id WHERE h.organization_id=? AND d.id=?",
      )
        .bind(session.context.organizationId, sensitive[1])
        .first<{ status: Hosting["status"]; expires_at: string; id: string }>();
      if (!row)
        return Response.json(
          { status: "unavailable" },
          { status: 404, headers: safeHeaders },
        );
      return Response.json(
        {
          status:
            row.expires_at <= now && row.status !== "revoked"
              ? "expired"
              : row.status,
          expiresAt: row.expires_at,
          hostingId: row.id,
        },
        { headers: safeHeaders },
      );
    }
    if (
      !sensitive[2] ||
      request.method !== "POST" ||
      request.headers.has("Authorization")
    )
      return new Response("Not found", { status: 404, headers: safeHeaders });
    const session = await authenticateBrowser(request, env, true);
    const result =
      sensitive[2] === "password"
        ? await revealProtectedDocumentPassword(
            env,
            session.context,
            sensitive[1],
            now,
          )
        : await revokeProtectedDocument(
            env,
            session.context,
            sensitive[1],
            now,
          );
    return Response.json(result, { headers: safeHeaders });
  }
  if (!pathname.startsWith("/share/")) return null;
  const match = /^\/share\/([A-Za-z0-9_-]{43})(?:\/(unlock|content))?$/.exec(
    pathname,
  );
  if (!match || new URL(request.url).origin !== new URL(env.APP_ORIGIN).origin)
    return page("", "unavailable");
  const [, token, action] = match,
    path = `/share/${token}`;
  try {
    const row = await activeHosting(env, token, now);
    if (!row) return page(path, "unavailable");
    if (action === "unlock" && request.method === "POST") {
      if (request.headers.get("Origin") !== new URL(env.APP_ORIGIN).origin)
        return page(path, "unavailable");
      const window = Math.floor(Date.parse(now) / 900000);
      const ip = request.headers.get("CF-Connecting-IP") ?? "unavailable";
      if (
        !(await allowedAttempt(
          env,
          `ip:${window}:${env.PROTECTED_DOCUMENTS_KEY}:${ip}`,
          window,
          30,
        )) ||
        !(await allowedAttempt(env, `hosting:${row.id}`, window, 10))
      )
        return new Response(
          "Trop de tentatives. Réessayez dans quinze minutes.",
          { status: 429, headers: { ...safeHeaders, "Retry-After": "900" } },
        );
      const password = await boundedPassword(request);
      if (
        !/^[A-Za-z0-9_-]{24}$/.test(password) ||
        !equal(
          await passwordVerifier(password, row.password_salt),
          row.password_verifier,
        )
      )
        return page(
          path,
          "locked",
          "Ce mot de passe ne permet pas d’ouvrir le document.",
        );
      const session = random(),
        expiry = new Date(
          Math.min(Date.parse(now) + 900000, Date.parse(row.expires_at)),
        ).toISOString();
      const inserted = await env.DB.prepare(
        "INSERT INTO protected_document_sessions(token_hash,organization_id,hosting_id,created_at,expires_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM protected_document_hostings WHERE id=? AND status='active' AND expires_at>?)",
      )
        .bind(
          await sha256(session),
          row.organization_id,
          row.id,
          now,
          expiry,
          row.id,
          now,
        )
        .run();
      if (inserted.meta.changes !== 1) return page(path, "unavailable");
      return new Response(null, {
        status: 303,
        headers: {
          ...safeHeaders,
          Location: path,
          "Set-Cookie": `${cookieName(env)}=${session}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((Date.parse(expiry) - Date.parse(now)) / 1000)}${env.ENVIRONMENT === "local" ? "" : "; Secure"}`,
        },
      });
    }
    const unlocked = await sessionValid(env, request, row, now);
    if (action === "content" && request.method === "GET") {
      if (!unlocked)
        return new Response("Accès protégé", {
          status: 401,
          headers: safeHeaders,
        });
      const document = await env.DB.prepare(
        "SELECT storage_key,size FROM documents d WHERE organization_id=? AND id=? AND sha256=? AND status='ready' AND EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=d.organization_id AND a.action='document.scan_verified' AND a.resource_id=d.sha256)",
      )
        .bind(row.organization_id, row.document_id, row.document_sha256)
        .first<{ storage_key: string; size: number }>();
      if (!document) return page(path, "unavailable");
      const object = await env.DOCUMENTS.get(document.storage_key);
      if (
        !object ||
        object.size !== document.size ||
        object.size > 10 * 1024 * 1024
      )
        return page(path, "unavailable");
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (
        (await sha256(bytes)) !== row.document_sha256 ||
        !(await activeHosting(env, token, new Date().toISOString()))
      )
        return page(path, "unavailable");
      await env.DB.prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,NULL,'protected_document.downloaded',?,'{}',?)",
      )
        .bind(crypto.randomUUID(), row.organization_id, row.id, now)
        .run();
      return new Response(bytes, {
        headers: {
          ...safeHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `${new URL(request.url).searchParams.get("view") === "1" ? "inline" : "attachment"}; filename="document.pdf"`,
          "Content-Length": String(bytes.length),
          "Content-Security-Policy":
            "sandbox; default-src 'none'; frame-ancestors 'none'",
        },
      });
    }
    if (action || request.method !== "GET") return page(path, "unavailable");
    return page(path, unlocked ? "unlocked" : "locked");
  } catch {
    // Fixed response only: request URLs, credentials and secret values never enter logs.
    return page(path, "unavailable");
  }
}
export async function cleanupProtectedDocuments(
  db: D1Database,
  now = new Date().toISOString(),
): Promise<void> {
  await db.batch([
    db
      .prepare(
        "UPDATE protected_document_hostings SET status='expired',sealed_secrets='' WHERE id IN (SELECT id FROM protected_document_hostings WHERE status IN ('draft','active') AND expires_at<=? LIMIT 100)",
      )
      .bind(now),
    db
      .prepare(
        "DELETE FROM protected_document_sessions WHERE token_hash IN (SELECT token_hash FROM protected_document_sessions WHERE expires_at<=? LIMIT 200)",
      )
      .bind(now),
    db
      .prepare(
        "DELETE FROM protected_document_attempts WHERE rowid IN (SELECT rowid FROM protected_document_attempts WHERE window_start<? LIMIT 500)",
      )
      .bind(Math.floor(Date.parse(now) / 900000) - 4),
  ]);
}
