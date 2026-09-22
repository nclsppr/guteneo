import { z } from "zod";
import {
  AuthError,
  authenticateBrowser,
  authenticationPolicy,
  hashSecret,
  isLocalSimulation,
} from "./auth";
import type { Env } from "./env";
import { DocumentService } from "./documents";
import { handleMobileReview } from "./mobile-review";
import { ContentError, LIMITS } from "../../../packages/contracts/src/content";
import {
  DomainError,
  type ActorContext,
  type DomainService,
} from "../../../packages/domain/src/index";

const PREFIX = "/api/mobile/v1";
const CALLBACK = "guteneo://auth/callback";
const now = () => new Date().toISOString();
const secret = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const redirect = (location: string) =>
  new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
const authorizeInput = z
  .object({
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_challenge_method: z.literal("S256"),
    state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  })
  .strict();
const exchangeInput = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  })
  .strict();
const preparationInput = z
  .object({
    channel: z.enum(["fax", "email", "postal"]),
    recipient: z.record(z.string(), z.unknown()),
    documentId: z.string().optional(),
    subject: z.string().optional(),
    html: z.string().optional(),
    text: z.string().optional(),
    senderId: z.string().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    campaignId: z.string().optional(),
    ceilingMinor: z.number().int().nonnegative().safe().optional(),
  })
  .strict();

type NativeSession = {
  context: ActorContext;
  tokenHash: string;
  expiresAt: string;
  organization: { id: string; name: string };
  user: { id: string; name: string; role: ActorContext["role"] };
  simulation: boolean;
  verifiedAccount: boolean;
  mfa: boolean;
};
type SessionRow = {
  organization_id: string;
  user_id: string;
  organization_name: string;
  user_name: string;
  role: ActorContext["role"];
  mode: string;
  expires_at: string;
  is_development: number;
  verified_account: number;
  mfa: number;
};

function nativeTransport(request: Request) {
  // Native URLSession has no browser cookie or Origin authority. Browser/MCP
  // credentials cannot accidentally acquire native capabilities through this path.
  if (request.headers.has("Cookie") || request.headers.has("Origin"))
    throw new AuthError(
      "NATIVE_TRANSPORT_REQUIRED",
      "Utilisez la connexion de l’application iOS.",
      403,
    );
}
function publicSession(session: NativeSession) {
  return {
    organization: session.organization,
    user: session.user,
    simulation: session.simulation,
    verifiedAccount: session.verifiedAccount,
    mfa: session.mfa,
    expiresAt: session.expiresAt,
  };
}
async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function authenticateNative(
  request: Request,
  env: Env,
): Promise<NativeSession> {
  nativeTransport(request);
  const match = /^GuteneoNative ([A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("Authorization") ?? "",
  );
  if (!match)
    throw new AuthError(
      "AUTHENTICATION_REQUIRED",
      "Connectez-vous dans l’application pour continuer.",
    );
  const tokenHash = await hashSecret(match[1]);
  const timestamp = now();
  const row = await env.DB.prepare(
    `SELECT s.organization_id,s.user_id,s.expires_at,
    o.name organization_name,o.mode,u.name user_name,m.role,b.is_development,b.verified_account,b.mfa
    FROM native_sessions s JOIN browser_sessions b ON b.token_hash=s.browser_session_hash
    AND b.organization_id=s.organization_id AND b.user_id=s.user_id
    JOIN memberships m ON m.organization_id=s.organization_id AND m.user_id=s.user_id
    JOIN organizations o ON o.id=m.organization_id JOIN users u ON u.id=m.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND b.expires_at>?
    AND NOT EXISTS(SELECT 1 FROM account_deletion_requests d WHERE d.user_id=s.user_id AND d.status='completed')`,
  )
    .bind(tokenHash, timestamp, timestamp)
    .first<SessionRow>();
  if (
    !row ||
    row.mode !== env.MODE ||
    (row.is_development && !isLocalSimulation(request, env))
  )
    throw new AuthError(
      "SESSION_EXPIRED",
      "Session expirée. Reconnectez-vous.",
    );
  if (
    !row.is_development &&
    authenticationPolicy(env) === "verified_email" &&
    !row.verified_account
  )
    throw new AuthError(
      "ACCOUNT_VERIFICATION_REQUIRED",
      "Reconnectez-vous pour vérifier votre compte.",
      403,
    );
  if (
    !row.is_development &&
    authenticationPolicy(env) === "verified_email_and_mfa" &&
    row.role === "admin" &&
    !row.mfa
  )
    throw new AuthError(
      "MFA_REQUIRED",
      "Reconnectez-vous après une double authentification.",
      403,
    );
  return {
    context: {
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
      actor: "native",
    },
    tokenHash,
    expiresAt: row.expires_at,
    organization: { id: row.organization_id, name: row.organization_name },
    user: { id: row.user_id, name: row.user_name, role: row.role },
    simulation: env.MODE === "simulation",
    verifiedAccount: row.verified_account === 1,
    mfa: row.mfa === 1,
  };
}

async function authorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.origin !== env.APP_ORIGIN)
    return redirect(new URL(url.pathname + url.search, env.APP_ORIGIN).href);
  if (!["GET", "POST"].includes(request.method))
    return json(
      {
        error: { code: "METHOD_NOT_ALLOWED", message: "Méthode indisponible." },
      },
      405,
    );
  if (request.headers.has("Authorization"))
    throw new AuthError(
      "BROWSER_REQUIRED",
      "Ouvrez la connexion sécurisée Guteneo.",
      403,
    );
  let input: z.infer<typeof authorizeInput>;
  let csrf = "";
  if (request.method === "POST") {
    const form = await request.formData();
    input = authorizeInput.parse({
      code_challenge: form.get("code_challenge"),
      code_challenge_method: form.get("code_challenge_method"),
      state: form.get("state"),
    });
    csrf = String(form.get("csrf") ?? "");
  } else input = authorizeInput.parse(Object.fromEntries(url.searchParams));
  let session;
  try {
    const headers = new Headers(request.headers);
    if (request.method === "POST") headers.set("X-CSRF-Token", csrf);
    session = await authenticateBrowser(
      new Request(request.url, { method: request.method, headers }),
      env,
      request.method === "POST",
    );
  } catch (error) {
    if (
      request.method !== "GET" ||
      !(error instanceof AuthError) ||
      !["AUTHENTICATION_REQUIRED", "SESSION_EXPIRED"].includes(error.code)
    )
      throw error;
    const login = new URL("/auth/login", env.APP_ORIGIN);
    login.searchParams.set(
      "returnTo",
      `${url.pathname}?${new URLSearchParams(input)}`,
    );
    return redirect(login.href);
  }
  if (request.method === "GET") {
    // Values in this form are constrained to URL-safe characters; no script or
    // hidden browser consent is used to grant the native session.
    const escape = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    return new Response(
      `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion iOS · guteneo</title><style>body{font-family:system-ui;background:#f6f5ef;color:#181b22;max-width:32rem;margin:12vh auto;padding:24px;line-height:1.5}h1{font-family:Georgia,serif;font-weight:400;font-size:2rem}button{font:inherit;border:0;border-radius:14px;background:#2450db;color:white;padding:16px 22px}a{color:inherit}</style><h1>Connecter l’application iOS</h1><p>Votre application pourra consulter vos PDF et vos envois, déposer des documents et préparer un envoi. La validation et l’expédition restent dans votre navigateur.</p><p>Espace : ${escape(session.organization.name)}</p><form method="post" action="/auth/mobile/authorize"><input type="hidden" name="code_challenge" value="${input.code_challenge}"><input type="hidden" name="code_challenge_method" value="S256"><input type="hidden" name="state" value="${input.state}"><input type="hidden" name="csrf" value="${escape(session.csrfToken)}"><button type="submit">Connecter l’application</button></form><p>Fermez cette fenêtre pour annuler.</p></html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
  const timestamp = now();
  const code = secret();
  const row = await env.DB.prepare(
    `INSERT INTO native_authorization_codes(code_hash,browser_session_hash,organization_id,user_id,code_challenge,expires_at,created_at)
    SELECT ?,token_hash,organization_id,user_id,?,?,? FROM browser_sessions
    WHERE token_hash=? AND expires_at>? RETURNING code_hash`,
  )
    .bind(
      await hashSecret(code),
      input.code_challenge,
      new Date(Date.now() + 60_000).toISOString(),
      timestamp,
      session.tokenHash,
      timestamp,
    )
    .first();
  if (!row)
    throw new AuthError("SESSION_EXPIRED", "Reconnectez-vous pour continuer.");
  const callback = new URL(CALLBACK);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", input.state);
  return redirect(callback.href);
}

async function exchange(request: Request, env: Env): Promise<Response> {
  nativeTransport(request);
  if (request.headers.has("Authorization"))
    throw new AuthError(
      "INVALID_EXCHANGE",
      "Échange de connexion invalide.",
      400,
    );
  if (env.ENVIRONMENT !== "local") {
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip)
      throw new AuthError("LOGIN_UNAVAILABLE", "Connexion indisponible.", 503);
    const window = Math.floor(Date.now() / 3_600_000);
    const limitKey = await hashSecret(
      `mobile:${env.AUTH0_CLIENT_SECRET}:${window}:${ip}`,
    );
    const limit = await env.DB.prepare(
      `INSERT INTO auth_flow_limits(key,window_start,count) VALUES(?,?,1)
      ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
    )
      .bind(limitKey, window)
      .first<{ count: number }>();
    if (!limit || limit.count > 60)
      throw new AuthError(
        "LOGIN_RATE_LIMITED",
        "Trop de tentatives. Réessayez dans une heure.",
        429,
      );
  }
  const input = exchangeInput.parse(await request.json());
  const codeHash = await hashSecret(input.code);
  const proof = await challenge(input.codeVerifier);
  const token = secret();
  const tokenHash = await hashSecret(token);
  const timestamp = now();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  // D1 batch is atomic: the one-time code cannot create two sessions, including
  // simultaneous exchanges. Failed PKCE never consumes another client's code.
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO native_sessions(token_hash,browser_session_hash,organization_id,user_id,created_at,expires_at)
      SELECT ?,c.browser_session_hash,c.organization_id,c.user_id,?,min(b.expires_at,?)
      FROM native_authorization_codes c JOIN browser_sessions b ON b.token_hash=c.browser_session_hash
      AND b.organization_id=c.organization_id AND b.user_id=c.user_id
      JOIN memberships m ON m.organization_id=c.organization_id AND m.user_id=c.user_id
      WHERE c.code_hash=? AND c.code_challenge=? AND c.expires_at>? AND b.expires_at>? RETURNING token_hash`,
    ).bind(
      tokenHash,
      timestamp,
      expiresAt,
      codeHash,
      proof,
      timestamp,
      timestamp,
    ),
    env.DB.prepare(
      "DELETE FROM native_authorization_codes WHERE code_hash=? AND code_challenge=? AND EXISTS(SELECT 1 FROM native_sessions WHERE token_hash=?)",
    ).bind(codeHash, proof, tokenHash),
  ]);
  if (!inserted.results.length)
    throw new AuthError(
      "INVALID_EXCHANGE",
      "Connexion expirée ou déjà utilisée. Reconnectez-vous.",
    );
  const session = await authenticateNative(
    new Request(request.url, {
      headers: { Authorization: `GuteneoNative ${token}` },
    }),
    env,
  );
  return json({
    token,
    expiresAt: session.expiresAt,
    session: publicSession(session),
  });
}

async function rateLimit(env: Env, session: NativeSession) {
  const limit = await env.DB.prepare(
    "INSERT INTO http_limits(organization_id,window_start,count) VALUES(?,?,1) ON CONFLICT(organization_id,window_start) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(session.context.organizationId, Math.floor(Date.now() / 60000))
    .first<{ count: number }>();
  if (!limit || limit.count > 180)
    throw new AuthError(
      "RATE_LIMITED",
      "Trop de requêtes. Réessayez dans une minute.",
      429,
    );
}
const deletionMessage =
  "Votre demande de suppression est enregistrée. La suppression n’est pas encore effectuée. Guteneo doit vérifier les envois en cours, l’espace partagé et les données soumises à une obligation de conservation. Vous recevrez une confirmation à l’adresse de votre compte une fois le traitement terminé.";
async function deletionRequest(env: Env, session: NativeSession) {
  const row = await env.DB.prepare(
    "SELECT id,status,created_at,updated_at,completed_at FROM account_deletion_requests WHERE user_id=?",
  )
    .bind(session.context.userId)
    .first<{
      id: string;
      status: string;
      created_at: string;
      updated_at: string;
      completed_at: string | null;
    }>();
  return row
    ? {
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        message: deletionMessage,
      }
    : null;
}

export async function handleMobileRoute(
  request: Request,
  env: Env,
  domain: DomainService,
  capabilities: {
    mode: string;
    simulation: boolean;
    channels: { id: string; name: string; liveSending: boolean }[];
  },
  afterConfirmation?: () => Promise<unknown>,
): Promise<Response | null> {
  const url = new URL(request.url);
  const review = await handleMobileReview(
    request,
    env,
    domain,
    afterConfirmation,
  );
  if (review) return review;
  if (url.pathname === "/auth/mobile/authorize") return authorize(request, env);
  if (!url.pathname.startsWith(`${PREFIX}/`) && url.pathname !== PREFIX)
    return null;
  const path = url.pathname.slice(PREFIX.length);
  if (path === "/session" && request.method === "POST")
    return exchange(request, env);
  const session = await authenticateNative(request, env);
  await rateLimit(env, session);
  const ctx = session.context;
  const documents = new DocumentService(env, domain);
  const document = /^\/documents\/([^/]+)(\/(content|rescan))?$/.exec(path);
  const dispatch = /^\/dispatches\/([^/]+)(\/(cancel|renew-quote))?$/.exec(
    path,
  );
  const pagination = [
    url.searchParams.get("cursor") ?? undefined,
    Number(url.searchParams.get("limit") ?? 30),
  ] as const;
  const approvalUrl = (id: string) =>
    `${env.APP_ORIGIN}/auth/mobile/review/${encodeURIComponent(id)}`;
  const key = () => {
    const value = request.headers.get("Idempotency-Key");
    if (!value)
      throw new ContentError(
        "IDEMPOTENCY_REQUIRED",
        "Une référence unique est requise.",
      );
    return value;
  };
  if (path === "/session" && request.method === "GET")
    return json(publicSession(session));
  if (path === "/session" && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM native_sessions WHERE token_hash=?")
      .bind(session.tokenHash)
      .run();
    return json({ signedOut: true });
  }
  if (path === "/capabilities" && request.method === "GET")
    return json({
      version: "1",
      mode: capabilities.mode,
      simulation: capabilities.simulation,
      humanApproval: "authenticated_browser",
      nativeApproval: false,
      channels: capabilities.channels.map(({ id, name, liveSending }) => ({
        id,
        name,
        liveSending,
      })),
      limits: LIMITS,
    });
  if (path === "/account" && request.method === "GET")
    return json({ ...publicSession(session), deletionRequestAvailable: true });
  if (path === "/account/deletion-request" && request.method === "GET")
    return json({ request: await deletionRequest(env, session) });
  if (path === "/account/deletion-request" && request.method === "POST") {
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(await request.json());
    const timestamp = now();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO account_deletion_requests(id,user_id,organization_id,status,created_at,updated_at)
      SELECT ?,user_id,organization_id,'requested',?,? FROM native_sessions WHERE token_hash=? AND expires_at>?`,
    )
      .bind(
        `deletion_${crypto.randomUUID()}`,
        timestamp,
        timestamp,
        session.tokenHash,
        timestamp,
      )
      .run();
    const result = await deletionRequest(env, session);
    if (!result)
      throw new AuthError(
        "SESSION_EXPIRED",
        "Reconnectez-vous pour continuer.",
      );
    return json(result, 202);
  }
  if (path === "/documents" && request.method === "GET")
    return json(await documents.list(ctx, ...pagination));
  if (path === "/documents" && request.method === "POST") {
    const data = await request.formData();
    const file = data.get("file");
    if (!file || typeof file === "string")
      throw new ContentError("FILE_REQUIRED", "Choisissez un PDF.");
    if (file.size > LIMITS.pdfBytes)
      throw new ContentError("FILE_TOO_LARGE", "PDF trop volumineux.", 413);
    return json(
      await documents.upload(ctx, {
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }),
      201,
    );
  }
  if (document && request.method === "GET") {
    if (document[3] === "content")
      return documents.getContent(ctx, document[1]);
    if (!document[3]) return json(await documents.get(ctx, document[1]));
  }
  if (document?.[3] === "rescan" && request.method === "POST")
    return json(await documents.rescan(ctx, document[1]));
  if (path === "/senders" && request.method === "GET")
    return json(await domain.listSenders(ctx));
  if (path === "/dispatches" && request.method === "GET") {
    const page = await domain.listDispatches(ctx, ...pagination);
    // A page of valid 128 KiB email bodies exceeds the native response budget.
    // Content is fetched only for the selected dispatch's authenticated detail.
    return json({
      ...page,
      items: page.items.map(
        ({ html: _html, text: _text, ...summary }) => summary,
      ),
    });
  }
  if (path === "/dispatches" && request.method === "POST") {
    const input = preparationInput.parse(await request.json());
    if (input.channel === "postal" && env.MODE === "production")
      throw new DomainError(
        "POSTAL_BROWSER_REQUIRED",
        "La vérification d’adresse et l’autorisation du transfert postal doivent être réalisées sur guteneo.com.",
        409,
      );
    const result = await domain.prepareDispatch(ctx, input, key());
    return json({ ...result, approvalUrl: approvalUrl(result.id) }, 201);
  }
  if (dispatch && !dispatch[3] && request.method === "GET")
    return json({
      ...(await domain.getDispatch(ctx, dispatch[1])),
      approvalUrl: approvalUrl(dispatch[1]),
    });
  if (dispatch?.[3] === "cancel" && request.method === "POST")
    return json(await domain.cancelDispatch(ctx, dispatch[1]));
  if (dispatch?.[3] === "renew-quote" && request.method === "POST") {
    z.object({})
      .strict()
      .parse(await request.json());
    const result = await domain.renewFaxQuote(ctx, dispatch[1]);
    return json({ ...result, approvalUrl: approvalUrl(result.id) }, 201);
  }
  // Closed route allowlist: approval, confirmation, expert, funding, administration
  // and provider transfer are never delegated to the native credential.
  return json(
    {
      error: {
        code: "MOBILE_ROUTE_UNAVAILABLE",
        message: "Cette opération n’est pas disponible dans l’application iOS.",
      },
    },
    404,
  );
}
