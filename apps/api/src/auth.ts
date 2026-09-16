import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

export const MCP_SCOPES = [
  "documents:read",
  "documents:write",
  "dispatches:prepare",
  "dispatches:send",
  "dispatches:read",
] as const;
export interface AuthEnv {
  DB: D1Database;
  ENVIRONMENT: string;
  MODE: string;
  APP_ORIGIN: string;
  AUTH0_DOMAIN?: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_CLIENT_SECRET?: string;
  AUTH0_AUDIENCE?: string;
}
export interface AuthContext {
  organizationId: string;
  userId: string;
  role: "admin" | "member" | "viewer";
  actor: "browser" | "mcp" | "system";
}
interface Membership {
  organization_id: string;
  organization_name: string;
  user_id: string;
  user_name: string;
  role: AuthContext["role"];
}
export interface AuthenticatedSession {
  context: AuthContext;
  organization: { id: string; name: string };
  user: { id: string; name: string; role: AuthContext["role"] };
  csrfToken: string;
  simulation: boolean;
  mfa: boolean;
  tokenHash: string;
}
export interface McpIdentity {
  context: AuthContext;
  scopes: string[];
  clientId: string;
  expiresAt: number;
  token: string;
}
export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}

const encoder = new TextEncoder();
const HOUR = 3_600_000;
const JWKS = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const nowISO = () => new Date().toISOString();
function randomSecret(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function hashSecret(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function constantEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++)
    different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
export function isLocalSimulation(request: Request, env: AuthEnv): boolean {
  const url = new URL(request.url);
  return (
    env.ENVIRONMENT === "local" &&
    env.MODE === "simulation" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    url.origin === env.APP_ORIGIN
  );
}
export function requireSameOrigin(request: Request, env: AuthEnv): void {
  if (request.headers.get("Origin") !== env.APP_ORIGIN)
    throw new AuthError(
      "ORIGIN_REJECTED",
      "Origine de la requête refusée.",
      403,
    );
}
export function safeReturnPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/#/app";
  const parsed = new URL(value, "https://guteneo.invalid");
  return parsed.origin === "https://guteneo.invalid"
    ? `${parsed.pathname}${parsed.search}${parsed.hash}`
    : "/#/app";
}
function cookieName(env: AuthEnv, purpose: "session" | "login"): string {
  return `${env.ENVIRONMENT === "local" ? "" : "__Host-"}guteneo_${purpose}`;
}
function readCookie(request: Request, name: string): string | undefined {
  const cookies = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((v) => v.trim());
  const found = cookies.find((v) => v.startsWith(`${name}=`));
  return found?.slice(name.length + 1);
}
function cookie(
  env: AuthEnv,
  purpose: "session" | "login",
  value: string,
  maxAge: number,
): string {
  return `${cookieName(env, purpose)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.ENVIRONMENT === "local" ? "" : "; Secure"}`;
}
function json(
  value: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
function redirect(url: string, cookies: string[]): Response {
  const headers = new Headers({ Location: url, "Cache-Control": "no-store" });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}
export function auth0Issuer(env: AuthEnv): string {
  if (!env.AUTH0_DOMAIN)
    throw new AuthError(
      "IDENTITY_NOT_CONFIGURED",
      "Le fournisseur d’identité doit être raccordé.",
      503,
    );
  const url = new URL(
    env.AUTH0_DOMAIN.startsWith("https://")
      ? env.AUTH0_DOMAIN
      : `https://${env.AUTH0_DOMAIN}`,
  );
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new AuthError(
      "IDENTITY_CONFIG_INVALID",
      "Configuration d’identité invalide.",
      503,
    );
  return url.href;
}
function configuredIdentity(env: AuthEnv): {
  issuer: string;
  clientId: string;
  audience: string;
  clientSecret: string;
} {
  const issuer = auth0Issuer(env);
  if (!env.AUTH0_CLIENT_ID || !env.AUTH0_AUDIENCE || !env.AUTH0_CLIENT_SECRET)
    throw new AuthError(
      "IDENTITY_NOT_CONFIGURED",
      "Le client Auth0 et son audience doivent être raccordés.",
      503,
    );
  return {
    issuer,
    clientId: env.AUTH0_CLIENT_ID,
    audience: env.AUTH0_AUDIENCE,
    clientSecret: env.AUTH0_CLIENT_SECRET,
  };
}
export async function validateAuth0Token(
  token: string,
  env: AuthEnv,
  kind: "id" | "access",
  keyOverride?: JWTVerifyGetKey,
): Promise<JWTPayload> {
  const issuer = auth0Issuer(env);
  const audience = kind === "id" ? env.AUTH0_CLIENT_ID : env.AUTH0_AUDIENCE;
  if (!audience)
    throw new AuthError(
      "IDENTITY_NOT_CONFIGURED",
      "Audience d’identité absente.",
      503,
    );
  let keys = JWKS.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(".well-known/jwks.json", issuer), {
      timeoutDuration: 5000,
    });
    JWKS.set(issuer, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keyOverride ?? keys, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat"],
      clockTolerance: 5,
      maxTokenAge: 3600,
    });
    if (!payload.sub || payload.sub.length > 512) throw new Error("subject");
    if (
      kind === "access" &&
      (!payload.iat || !payload.exp || payload.exp - payload.iat > 3600)
    )
      throw new Error("access_lifetime");
    return payload;
  } catch {
    throw new AuthError("TOKEN_INVALID", "Jeton expiré ou non valide.");
  }
}
export function hasMfa(payload: JWTPayload): boolean {
  return (
    (Array.isArray(payload.amr) && payload.amr.includes("mfa")) ||
    payload["https://guteneo.com/mfa"] === true
  );
}
async function memberships(
  env: AuthEnv,
  userId: string,
): Promise<Membership[]> {
  const result = await env.DB.prepare(
    `SELECT m.organization_id, o.name organization_name, m.user_id, u.name user_name, m.role
    FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN users u ON u.id=m.user_id
    WHERE m.user_id=? ORDER BY m.organization_id LIMIT 101`,
  )
    .bind(userId)
    .all<Membership>();
  return result.results;
}
function sessionResult(
  row: Membership & { csrf_token: string; mfa: number },
  tokenHash: string,
  env: AuthEnv,
): AuthenticatedSession {
  return {
    context: {
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.role,
      actor: "browser",
    },
    organization: { id: row.organization_id, name: row.organization_name },
    user: { id: row.user_id, name: row.user_name, role: row.role },
    csrfToken: row.csrf_token,
    simulation: env.MODE === "simulation",
    mfa: Boolean(row.mfa),
    tokenHash,
  };
}
export function publicSession(session: AuthenticatedSession) {
  return {
    organization: session.organization,
    user: session.user,
    csrfToken: session.csrfToken,
    simulation: session.simulation,
    mfa: session.mfa,
  };
}
async function createSession(
  env: AuthEnv,
  membership: Membership,
  mfa: boolean,
  development: boolean,
): Promise<{ session: AuthenticatedSession; cookie: string }> {
  const secret = randomSecret();
  const tokenHash = await hashSecret(secret);
  const csrf = randomSecret();
  await env.DB.prepare(
    `INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?)`,
  )
    .bind(
      tokenHash,
      membership.user_id,
      membership.organization_id,
      csrf,
      Number(mfa),
      Number(development),
      nowISO(),
      new Date(Date.now() + HOUR).toISOString(),
    )
    .run();
  return {
    session: sessionResult(
      { ...membership, csrf_token: csrf, mfa: Number(mfa) },
      tokenHash,
      env,
    ),
    cookie: cookie(env, "session", secret, 3600),
  };
}
export async function authenticateBrowser(
  request: Request,
  env: AuthEnv,
  mutating = false,
): Promise<AuthenticatedSession> {
  const token = readCookie(request, cookieName(env, "session"));
  if (!token || !/^[\w-]{43}$/.test(token))
    throw new AuthError(
      "AUTHENTICATION_REQUIRED",
      "Connectez-vous pour continuer.",
    );
  const tokenHash = await hashSecret(token);
  const row = await env.DB.prepare(
    `SELECT s.csrf_token,s.mfa,s.is_development,m.organization_id,m.user_id,m.role,o.name organization_name,u.name user_name
    FROM browser_sessions s JOIN memberships m ON m.organization_id=s.organization_id AND m.user_id=s.user_id
    JOIN organizations o ON o.id=m.organization_id JOIN users u ON u.id=m.user_id WHERE s.token_hash=? AND s.expires_at>?`,
  )
    .bind(tokenHash, nowISO())
    .first<
      Membership & { csrf_token: string; mfa: number; is_development: number }
    >();
  if (!row || (row.is_development && !isLocalSimulation(request, env)))
    throw new AuthError(
      "SESSION_EXPIRED",
      "Session expirée. Reconnectez-vous.",
    );
  if (!row.is_development && row.role === "admin" && !row.mfa)
    throw new AuthError(
      "MFA_REQUIRED",
      "La double authentification est nécessaire pour les administrateurs.",
      403,
    );
  if (mutating) {
    requireSameOrigin(request, env);
    if (
      !constantEqual(request.headers.get("X-CSRF-Token") ?? "", row.csrf_token)
    )
      throw new AuthError(
        "CSRF_REJECTED",
        "La confirmation de session est absente ou invalide.",
        403,
      );
  }
  return sessionResult(row, tokenHash, env);
}
export function requireScope(
  identity: Pick<McpIdentity, "scopes">,
  scope: string,
): void {
  if (!identity.scopes.includes(scope))
    throw new AuthError(
      "INSUFFICIENT_SCOPE",
      `Autorisation requise : ${scope}.`,
      403,
    );
}
export async function authenticateMcp(
  request: Request,
  env: AuthEnv,
): Promise<McpIdentity> {
  const header = request.headers.get("Authorization") ?? "";
  if (!/^Bearer [^\s]+$/i.test(header))
    throw new AuthError(
      "AUTHENTICATION_REQUIRED",
      "Autorisez la connexion de votre assistant.",
    );
  const token = header.slice(7);
  if (token.startsWith("gtn_dev_")) {
    if (!isLocalSimulation(request, env))
      throw new AuthError(
        "DEVELOPMENT_AUTH_FORBIDDEN",
        "Authentification de développement interdite.",
        403,
      );
    const row = await env.DB.prepare(
      `SELECT t.organization_id,t.user_id,m.role,t.expires_at FROM development_mcp_tokens t
      JOIN memberships m ON m.organization_id=t.organization_id AND m.user_id=t.user_id WHERE t.token_hash=? AND t.expires_at>?`,
    )
      .bind(await hashSecret(token), nowISO())
      .first<{
        organization_id: string;
        user_id: string;
        role: AuthContext["role"];
        expires_at: string;
      }>();
    if (!row)
      throw new AuthError("TOKEN_INVALID", "Jeton de simulation expiré.");
    return {
      context: {
        organizationId: row.organization_id,
        userId: row.user_id,
        role: row.role,
        actor: "mcp",
      },
      scopes: [...MCP_SCOPES],
      clientId: "local-simulation",
      expiresAt: Date.parse(row.expires_at) / 1000,
      token,
    };
  }
  const payload = await validateAuth0Token(token, env, "access");
  const issuer = auth0Issuer(env);
  const clientId =
    typeof payload.client_id === "string"
      ? payload.client_id
      : typeof payload.azp === "string"
        ? payload.azp
        : "";
  if (!clientId || !payload.sub || !payload.iat || !payload.exp)
    throw new AuthError("TOKEN_INVALID", "Jeton OAuth incomplet.");
  const identity = await env.DB.prepare(
    "SELECT user_id FROM auth_identities WHERE issuer=? AND subject=?",
  )
    .bind(issuer, payload.sub)
    .first<{ user_id: string }>();
  if (!identity)
    throw new AuthError(
      "ONBOARDING_REQUIRED",
      "Connectez-vous d’abord à Guteneo pour créer votre espace.",
      403,
    );
  const memberRows = await memberships(env, identity.user_id);
  let connection = await env.DB.prepare(
    "SELECT organization_id,status,not_before FROM authorized_connections WHERE issuer=? AND user_id=? AND client_id=?",
  )
    .bind(issuer, identity.user_id, clientId)
    .first<{ organization_id: string; status: string; not_before: number }>();
  if (!connection) {
    // OAuth consent selects a single personal workspace unambiguously; multi-workspace users must bind explicitly in the dashboard.
    if (memberRows.length !== 1)
      throw new AuthError(
        "ORGANIZATION_SELECTION_REQUIRED",
        "Associez cet assistant à une organisation depuis les connexions du tableau de bord.",
        403,
      );
    await env.DB.prepare(
      `INSERT OR IGNORE INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,not_before,created_at,updated_at)
      VALUES(?,?,?,?,?,'active',0,?,?)`,
    )
      .bind(
        crypto.randomUUID(),
        issuer,
        identity.user_id,
        clientId,
        memberRows[0].organization_id,
        nowISO(),
        nowISO(),
      )
      .run();
    connection = await env.DB.prepare(
      "SELECT organization_id,status,not_before FROM authorized_connections WHERE issuer=? AND user_id=? AND client_id=?",
    )
      .bind(issuer, identity.user_id, clientId)
      .first<{ organization_id: string; status: string; not_before: number }>();
  }
  if (
    !connection ||
    connection.status !== "active" ||
    payload.iat < connection.not_before
  )
    throw new AuthError(
      "CONNECTION_REVOKED",
      "Cette connexion a été révoquée.",
      403,
    );
  const member = memberRows.find(
    (m) => m.organization_id === connection.organization_id,
  );
  if (!member)
    throw new AuthError(
      "MEMBERSHIP_REQUIRED",
      "Accès à cette organisation refusé.",
      403,
    );
  if (member.role === "admin" && !hasMfa(payload))
    throw new AuthError(
      "MFA_REQUIRED",
      "Reconnectez l’assistant après une double authentification.",
      403,
    );
  const scopes =
    typeof payload.scope === "string"
      ? payload.scope
          .split(" ")
          .filter((s) => (MCP_SCOPES as readonly string[]).includes(s))
      : [];
  return {
    context: {
      organizationId: member.organization_id,
      userId: member.user_id,
      role: member.role,
      actor: "mcp",
    },
    scopes,
    clientId,
    expiresAt: payload.exp,
    token,
  };
}
export function protectedResourceMetadata(env: AuthEnv): Response {
  return json({
    resource: `${env.APP_ORIGIN}/mcp`,
    authorization_servers: [auth0Issuer(env).replace(/\/$/, "")],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Guteneo",
  });
}

export async function handleAuthRoute(
  request: Request,
  env: AuthEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (
    request.method === "GET" &&
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ].includes(url.pathname)
  )
    return protectedResourceMetadata(env);
  if (
    request.method === "GET" &&
    ["/auth/login", "/auth/signup"].includes(url.pathname)
  ) {
    const config = configuredIdentity(env);
    if (env.ENVIRONMENT !== "local") {
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip)
        throw new AuthError(
          "LOGIN_UNAVAILABLE",
          "Connexion indisponible.",
          503,
        );
      const window = Math.floor(Date.now() / 3_600_000);
      const key = await hashSecret(
        `${env.AUTH0_CLIENT_SECRET}:${Math.floor(window / 24)}:${ip}`,
      );
      const limit = await env.DB.prepare(
        `INSERT INTO auth_flow_limits(key,window_start,count) VALUES(?,?,1)
        ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,
        count=CASE WHEN window_start=excluded.window_start THEN count+1 ELSE 1 END RETURNING count`,
      )
        .bind(key, window)
        .first<{ count: number }>();
      if (!limit || limit.count > 60)
        throw new AuthError(
          "LOGIN_RATE_LIMITED",
          "Trop de tentatives. Réessayez dans une heure.",
          429,
        );
    }
    const state = randomSecret();
    const browser = randomSecret();
    const verifier = randomSecret();
    const nonce = randomSecret();
    const bytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(verifier)),
    );
    const challenge = btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    await env.DB.prepare(
      "INSERT INTO auth_transactions(state_hash,browser_hash,code_verifier,nonce,return_to,expires_at) VALUES(?,?,?,?,?,?)",
    )
      .bind(
        await hashSecret(state),
        await hashSecret(browser),
        verifier,
        nonce,
        safeReturnPath(url.searchParams.get("returnTo")),
        new Date(Date.now() + 600_000).toISOString(),
      )
      .run();
    const destination = new URL("authorize", config.issuer);
    destination.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: `${env.APP_ORIGIN}/auth/callback`,
      scope: "openid profile email",
      audience: config.audience,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    if (url.pathname === "/auth/signup")
      destination.searchParams.set("screen_hint", "signup");
    // A fresh login allows a newly verified email or MFA enrolment to be reflected
    // in signed claims rather than reusing an old identity-provider session.
    if (url.searchParams.get("fresh") === "1") {
      destination.searchParams.set("prompt", "login");
      destination.searchParams.set("max_age", "0");
    }
    return redirect(destination.href, [cookie(env, "login", browser, 600)]);
  }
  if (request.method === "GET" && url.pathname === "/auth/callback") {
    const config = configuredIdentity(env);
    const browser = readCookie(request, cookieName(env, "login"));
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!browser || !state || !code || state.length > 256 || code.length > 4096)
      throw new AuthError("LOGIN_STATE_INVALID", "Recommencez la connexion.");
    const transaction = await env.DB.prepare(
      "DELETE FROM auth_transactions WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING code_verifier,nonce,return_to",
    )
      .bind(await hashSecret(state), await hashSecret(browser), nowISO())
      .first<{ code_verifier: string; nonce: string; return_to: string }>();
    if (!transaction)
      throw new AuthError(
        "LOGIN_STATE_INVALID",
        "Connexion expirée ou déjà utilisée.",
      );
    const response = await fetch(new URL("oauth/token", config.issuer), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: transaction.code_verifier,
        redirect_uri: `${env.APP_ORIGIN}/auth/callback`,
      }),
    }).catch(() => {
      throw new AuthError(
        "LOGIN_EXCHANGE_FAILED",
        "Le service de connexion est momentanément indisponible. Réessayez.",
      );
    });
    if (!response.ok)
      throw new AuthError(
        "LOGIN_EXCHANGE_FAILED",
        "La connexion n’a pas pu être terminée. Recommencez.",
        401,
      );
    const tokens = (await response.json().catch(() => {
      throw new AuthError(
        "LOGIN_EXCHANGE_FAILED",
        "La connexion n’a pas pu être terminée. Recommencez.",
      );
    })) as {
      id_token?: string;
      access_token?: string;
    } | null;
    if (
      !tokens ||
      typeof tokens !== "object" ||
      typeof tokens.id_token !== "string" ||
      typeof tokens.access_token !== "string" ||
      !tokens.id_token ||
      !tokens.access_token
    )
      throw new AuthError(
        "LOGIN_EXCHANGE_FAILED",
        "Réponse d’identité incomplète.",
      );
    const claims = await validateAuth0Token(tokens.id_token, env, "id");
    const accessClaims = await validateAuth0Token(
      tokens.access_token,
      env,
      "access",
    );
    if (claims.nonce !== transaction.nonce || claims.sub !== accessClaims.sub)
      throw new AuthError(
        "LOGIN_STATE_INVALID",
        "Réponse d’identité non liée à cette connexion.",
      );
    if (
      claims.email_verified !== true ||
      typeof claims.email !== "string" ||
      !claims.email.trim() ||
      claims.email.length > 320
    )
      throw new AuthError(
        "EMAIL_VERIFICATION_REQUIRED",
        "Vérifiez votre adresse avec le lien reçu par e-mail, puis reconnectez-vous.",
        403,
      );
    let identity = await env.DB.prepare(
      "SELECT user_id FROM auth_identities WHERE issuer=? AND subject=?",
    )
      .bind(config.issuer, claims.sub)
      .first<{ user_id: string }>();
    if (!identity) {
      if (!hasMfa(claims))
        throw new AuthError(
          "MFA_REQUIRED",
          "Terminez la double authentification pour créer votre espace.",
          403,
        );
      // The organization trigger grants one shared lifetime welcome credit.
      // Per-channel quotas are safety ceilings; channels still need activation.
      const userId = `usr_${crypto.randomUUID()}`;
      const organizationId = `org_${crypto.randomUUID()}`;
      const createdAt = nowISO();
      try {
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
          ).bind(
            userId,
            typeof claims.name === "string"
              ? claims.name.slice(0, 200)
              : "Utilisateur Guteneo",
            typeof claims.email === "string" && claims.email_verified === true
              ? claims.email.slice(0, 320)
              : "",
            createdAt,
          ),
          env.DB.prepare(
            "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,?,?,?)",
          ).bind(organizationId, "Mon espace", env.MODE, createdAt),
          env.DB.prepare(
            "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
          ).bind(organizationId, userId, createdAt),
          env.DB.prepare(
            "INSERT INTO auth_identities(issuer,subject,user_id,created_at) VALUES(?,?,?,?)",
          ).bind(config.issuer, claims.sub, userId, createdAt),
          env.DB.prepare(
            "INSERT INTO content_limits(organization_id,uploads_per_day,bytes_per_day,renders_per_day) VALUES(?,10,20971520,3)",
          ).bind(organizationId),
          ...["fax", "email", "postal"].flatMap((channel) => [
            env.DB.prepare(
              "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,?,?,10000,5000,'EUR')",
            ).bind(organizationId, channel, createdAt.slice(0, 7)),
            env.DB.prepare(
              "INSERT INTO channel_controls(organization_id,channel,enabled) VALUES(?,?,0)",
            ).bind(organizationId, channel),
          ]),
        ]);
        identity = { user_id: userId };
      } catch (error) {
        // Concurrent valid callbacks can race to create the same identity. The
        // failed D1 batch rolls back, then we reuse only the exact signed subject.
        identity = await env.DB.prepare(
          "SELECT user_id FROM auth_identities WHERE issuer=? AND subject=?",
        )
          .bind(config.issuer, claims.sub)
          .first<{ user_id: string }>();
        if (!identity) throw error;
      }
    }
    const memberRows = await memberships(env, identity.user_id);
    if (!memberRows.length)
      return redirect(`${env.APP_ORIGIN}/?auth=invitation_required#/app`, [
        cookie(env, "login", "", 0),
      ]);
    const member = memberRows[0];
    if (member.role === "admin" && !hasMfa(claims))
      throw new AuthError(
        "MFA_REQUIRED",
        "Activez la double authentification avant d’accéder à l’espace administrateur.",
        403,
      );
    const session = await createSession(env, member, hasMfa(claims), false);
    return redirect(new URL(transaction.return_to, env.APP_ORIGIN).href, [
      cookie(env, "login", "", 0),
      session.cookie,
    ]);
  }
  if (request.method === "POST" && url.pathname === "/api/dev/login") {
    if (!isLocalSimulation(request, env))
      throw new AuthError(
        "DEVELOPMENT_AUTH_FORBIDDEN",
        "Connexion de démonstration disponible uniquement en local.",
        403,
      );
    requireSameOrigin(request, env);
    const body = (await request.json()) as { organization?: string };
    if (!["atelier", "studio"].includes(body.organization ?? ""))
      throw new AuthError(
        "INVALID_ORGANIZATION",
        "Choisissez une organisation de simulation.",
        400,
      );
    const selected = (await memberships(env, `user_${body.organization}`)).find(
      (m) => m.organization_id === `org_${body.organization}`,
    );
    if (!selected)
      throw new AuthError(
        "SEED_REQUIRED",
        "Initialisez les données de simulation.",
        503,
      );
    const result = await createSession(env, selected, false, true);
    return json(publicSession(result.session), 200, {
      "Set-Cookie": result.cookie,
    });
  }
  if (request.method === "GET" && url.pathname === "/api/session")
    return json(publicSession(await authenticateBrowser(request, env)));
  if (request.method === "POST" && url.pathname === "/api/logout") {
    const session = await authenticateBrowser(request, env, true);
    await env.DB.prepare("DELETE FROM browser_sessions WHERE token_hash=?")
      .bind(session.tokenHash)
      .run();
    return json({ signedOut: true }, 200, {
      "Set-Cookie": cookie(env, "session", "", 0),
    });
  }
  if (request.method === "POST" && url.pathname === "/api/dev/mcp-token") {
    if (!isLocalSimulation(request, env))
      throw new AuthError(
        "DEVELOPMENT_AUTH_FORBIDDEN",
        "Disponible uniquement en simulation locale.",
        403,
      );
    const session = await authenticateBrowser(request, env, true);
    const token = `gtn_dev_${randomSecret()}`;
    const expiresAt = new Date(Date.now() + HOUR).toISOString();
    await env.DB.prepare(
      "INSERT INTO development_mcp_tokens(token_hash,user_id,organization_id,expires_at) VALUES(?,?,?,?)",
    )
      .bind(
        await hashSecret(token),
        session.context.userId,
        session.context.organizationId,
        expiresAt,
      )
      .run();
    return json({ token, expiresAt, simulation: true });
  }
  if (url.pathname === "/api/connections" && request.method === "GET") {
    const session = await authenticateBrowser(request, env);
    const result = await env.DB.prepare(
      "SELECT id,client_id,organization_id,status,created_at,updated_at FROM authorized_connections WHERE user_id=? AND organization_id=? ORDER BY created_at DESC LIMIT 100",
    )
      .bind(session.context.userId, session.context.organizationId)
      .all();
    return json({ items: result.results });
  }
  if (url.pathname === "/api/connections" && request.method === "POST") {
    const session = await authenticateBrowser(request, env, true);
    const body = (await request.json()) as { clientId?: string };
    if (!body.clientId || !/^[A-Za-z0-9_-]{1,200}$/.test(body.clientId))
      throw new AuthError(
        "CLIENT_ID_INVALID",
        "Identifiant OAuth invalide.",
        400,
      );
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO authorized_connections(id,issuer,user_id,client_id,organization_id,status,not_before,created_at,updated_at)
      VALUES(?,?,?,?,?,'active',?,?,?) ON CONFLICT(issuer,user_id,client_id) DO UPDATE SET organization_id=excluded.organization_id,status='active',not_before=excluded.not_before,updated_at=excluded.updated_at`,
      ).bind(
        crypto.randomUUID(),
        auth0Issuer(env),
        session.context.userId,
        body.clientId,
        session.context.organizationId,
        Math.floor(Date.now() / 1000),
        nowISO(),
        nowISO(),
      ),
      env.DB.prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        session.context.organizationId,
        session.context.userId,
        "connection.bound",
        body.clientId,
        "{}",
        nowISO(),
      ),
    ]);
    return json({ bound: true, reconnectRequired: true });
  }
  if (
    url.pathname.startsWith("/api/connections/") &&
    request.method === "DELETE"
  ) {
    const session = await authenticateBrowser(request, env, true);
    const connectionId = url.pathname.split("/").at(-1);
    const existing = await env.DB.prepare(
      "SELECT id FROM authorized_connections WHERE id=? AND user_id=? AND organization_id=?",
    )
      .bind(
        connectionId,
        session.context.userId,
        session.context.organizationId,
      )
      .first();
    if (!existing)
      throw new AuthError("NOT_FOUND", "Connexion introuvable.", 404);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE authorized_connections SET status='revoked',updated_at=? WHERE id=? AND user_id=? AND organization_id=?",
      ).bind(
        nowISO(),
        connectionId,
        session.context.userId,
        session.context.organizationId,
      ),
      env.DB.prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        session.context.organizationId,
        session.context.userId,
        "connection.revoked",
        connectionId,
        "{}",
        nowISO(),
      ),
    ]);
    return json({ revoked: true });
  }
  return null;
}
