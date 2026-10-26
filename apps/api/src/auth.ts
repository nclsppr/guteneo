import { recordConnectionEvent } from "./belvedere-telemetry";
import {
  BELVEDERE_WATCHER_EMAIL,
  isBelvedereBrowserOrigin,
} from "./belvedere-policy";
import { accountEmail } from "../../../packages/contracts/src/account-identity";
import { documentAccessMode } from "../../../packages/contracts/src/document-authentication";
import type { DashboardAppearance } from "../../../packages/contracts/src/dashboard-appearance";
import { isDispatchGroup } from "../../../packages/contracts/src/dispatch-groups";
import { acceptWorkspaceInvitation, getInvitationPreview } from "./invitations";
import {
  workspacePermissions,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import {
  localeFromAcceptLanguage,
  normalizeLocale,
  type SupportedLocale,
} from "../../../packages/contracts/src/locale";

export const MCP_SCOPES = [
  "documents:read",
  "documents:write",
  "dispatches:prepare",
  "dispatches:send",
  "dispatches:read",
  "templates:read",
  "templates:write",
  "templates:publish",
  "templates:share",
  "datasets:read",
  "datasets:write",
  "generations:read",
  "generations:write",
] as const;
export interface AuthEnv {
  DB: D1Database;
  ENVIRONMENT: string;
  MODE: string;
  APP_ORIGIN: string;
  /** Disabled unless an exact connection/revision has a bounded diagnostic window. */
  MCP_UI_PROBE?: string;
  /** Default-off original-file App; bounded qualification or authorized rollout. */
  MCP_DOCUMENT_UPLOAD_APP?: string;
  AUTH0_DOMAIN?: string;
  /** Browser-only alias; never enables MCP trust or changes identity keys. */
  AUTH0_BROWSER_DOMAIN?: string;
  /** Explicit same-tenant MCP alias; independent of browser login selection. */
  AUTH0_MCP_TRUSTED_DOMAIN?: string;
  /** Discovery rollback retains the separately configured trusted issuer. */
  AUTH0_MCP_DISCOVERY?: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_CLIENT_SECRET?: string;
  AUTH0_AUDIENCE?: string;
  AUTH0_AUTH_POLICY?: string;
  BELVEDERE_AUTH0_SUBJECT?: string;
  SENSITIVE_DOCUMENT_AUTHENTICATION?: string;
}
export interface AuthContext {
  organizationId: string;
  userId: string;
  role: WorkspaceRole;
  supervisorCanApprove?: boolean;
  supervisorCanReport?: boolean;
  actor: "browser" | "native" | "mcp" | "system";
  /** Internal hash of the actual authenticated browser credential. Never
   * serialize this context or accept this field from an API request. */
  documentSessionHash?: string;
}
export interface Membership {
  organization_id: string;
  organization_name: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  preferred_locale: SupportedLocale | null;
  preferred_dashboard_appearance: DashboardAppearance;
  role: AuthContext["role"];
  supervisor_can_approve: number;
  supervisor_can_report: number;
}
export interface AuthenticatedSession {
  context: AuthContext;
  organization: { id: string; name: string };
  user: {
    id: string;
    name: string;
    email: string | null;
    role: AuthContext["role"];
    supervisorCanApprove?: boolean;
    supervisorCanReport?: boolean;
    preferredLocale: SupportedLocale | null;
    preferredDashboardAppearance: DashboardAppearance;
  };
  csrfToken: string;
  simulation: boolean;
  mfa: boolean;
  verifiedAccount: boolean;
  tokenHash: string;
}
/** A personal account grants no workshop authority. Authentication evidence is
 * copied only from signature-verified login claims, never enrollment flags. */
export interface PersonalPrincipal {
  userId: string;
  name: string;
  email: string | null;
  verifiedEmail: boolean;
  mfa: boolean;
  verifiedAccount: boolean;
  /** Current persisted Auth0 subject and verified email still match this user. */
  identityVerified?: boolean;
  authenticatedAt: number | null;
  amr: string[];
  acr: string | null;
  strongAuthentication: boolean;
  authenticationPolicyVersion: string | null;
  preferredLocale: SupportedLocale | null;
  preferredDashboardAppearance: DashboardAppearance;
  csrfToken: string;
  tokenHash: string;
  simulation: boolean;
  development: boolean;
}
export interface McpIdentity {
  context: AuthContext;
  scopes: string[];
  clientId: string;
  expiresAt: number;
  token: string;
  /** Exact issuer after signature verification, never client-supplied metadata. */
  verifiedTokenIssuer?: string;
  /** Trusted snapshot from production OAuth authentication, never host metadata. */
  connectionObservation?: {
    connectionId: string;
    authorizationRevision: number;
  };
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
    throw new AuthError("ORIGIN_REJECTED", "Request origin rejected.", 403);
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
interface LoginFailureContext {
  returnTo: string;
  locale: SupportedLocale;
}
// Recovery context stays private to the thrown error and is never serialized.
// Callback context is populated only after the browser-bound state is consumed.
const loginFailureContexts = new WeakMap<object, LoginFailureContext>();

function requestedLoginLocale(request: Request): SupportedLocale {
  const url = new URL(request.url);
  return (
    normalizeLocale(url.searchParams.get("locale")) ??
    normalizeLocale(url.searchParams.get("ui_locales")) ??
    localeFromAcceptLanguage(request.headers.get("Accept-Language"))
  );
}

function recoveryHash(returnTo: string): string {
  const destination = new URL(
    safeReturnPath(returnTo),
    "https://guteneo.invalid",
  );
  // A fragment is navigation data, not an arbitrary URL to parse. Reject it
  // before URL construction so malformed hosts cannot break error recovery.
  if (destination.hash && !/^#\/app(?:[/?]|$)/.test(destination.hash))
    return "#/app";
  const route = destination.hash
    ? new URL(destination.hash.slice(1), "https://guteneo.invalid")
    : destination;
  if (
    route.pathname.length > 512 ||
    !/^\/app(?:\/[A-Za-z0-9_-]+)*\/?$/.test(route.pathname)
  )
    return "#/app";
  // Keep explicit navigation choices, never arbitrary query data or capability
  // tokens. These references still require current authenticated membership.
  const query = new URLSearchParams();
  for (const [key, value] of route.searchParams) {
    if (
      (key === "entry" && value === "direct") ||
      (key === "channel" && ["fax", "email", "postal"].includes(value)) ||
      (key === "group" && isDispatchGroup(value)) ||
      (key === "new" && value === "blank") ||
      (["document", "connection"].includes(key) &&
        /^[A-Za-z0-9_-]{1,120}$/.test(value))
    )
      query.set(key, value);
  }
  return `#${route.pathname}${query.size ? `?${query}` : ""}`;
}

export function authFailureRedirect(
  request: Request,
  env: Pick<AuthEnv, "APP_ORIGIN">,
  code: string,
  error?: unknown,
): string {
  const url = new URL(request.url);
  const startingLogin = ["/auth/login", "/auth/signup"].includes(url.pathname);
  const context =
    error !== null && typeof error === "object"
      ? loginFailureContexts.get(error)
      : undefined;
  const destination = new URL("/", env.APP_ORIGIN);
  destination.searchParams.set("auth", code);
  destination.searchParams.set(
    "lang",
    context?.locale ??
      (startingLogin
        ? requestedLoginLocale(request)
        : localeFromAcceptLanguage(request.headers.get("Accept-Language"))),
  );
  destination.hash = recoveryHash(
    context?.returnTo ??
      (startingLogin
        ? safeReturnPath(url.searchParams.get("returnTo"))
        : "/#/app"),
  );
  return destination.href;
}
function cookieName(
  env: AuthEnv,
  purpose: "session" | "login" | "invitation",
): string {
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
  purpose: "session" | "login" | "invitation",
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
      "The identity provider must be connected.",
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
      "Invalid identity configuration.",
      503,
    );
  return url.href;
}
// The alias belongs to this same Auth0 tenant. Never learn this mapping from a
// token's unverified `iss`, discovery metadata, a request or an email address.
const TRUSTED_AUTH0_ALIAS = {
  canonical: "https://pieper.eu.auth0.com/",
  custom: "https://auth.guteneo.com/",
} as const;
function invalidIdentityConfiguration(): never {
  throw new AuthError(
    "IDENTITY_CONFIG_INVALID",
    "Invalid identity configuration.",
    503,
  );
}
function browserAuth0Issuer(env: AuthEnv): string {
  const canonical = auth0Issuer(env);
  if (env.AUTH0_BROWSER_DOMAIN === undefined) return canonical;
  let browser: string;
  try {
    browser = auth0Issuer({ ...env, AUTH0_DOMAIN: env.AUTH0_BROWSER_DOMAIN });
  } catch {
    return invalidIdentityConfiguration();
  }
  if (
    canonical !== TRUSTED_AUTH0_ALIAS.canonical ||
    browser !== TRUSTED_AUTH0_ALIAS.custom
  )
    invalidIdentityConfiguration();
  return browser;
}
function mcpAuth0Configuration(env: AuthEnv) {
  const identityIssuer = auth0Issuer(env);
  const preference = env.AUTH0_MCP_DISCOVERY ?? "canonical";
  if (preference !== "canonical" && preference !== "custom")
    invalidIdentityConfiguration();
  let customIssuer: string | undefined;
  if (env.AUTH0_MCP_TRUSTED_DOMAIN !== undefined) {
    try {
      customIssuer = auth0Issuer({
        ...env,
        AUTH0_DOMAIN: env.AUTH0_MCP_TRUSTED_DOMAIN,
      });
    } catch {
      return invalidIdentityConfiguration();
    }
    if (
      identityIssuer !== TRUSTED_AUTH0_ALIAS.canonical ||
      customIssuer !== TRUSTED_AUTH0_ALIAS.custom
    )
      invalidIdentityConfiguration();
  }
  if (preference === "custom" && !customIssuer) invalidIdentityConfiguration();
  return {
    identityIssuer,
    tokenIssuers: customIssuer
      ? [identityIssuer, customIssuer]
      : [identityIssuer],
    authorizationIssuer:
      preference === "custom" ? customIssuer! : identityIssuer,
  };
}

/** Discovery preference never changes the canonical data namespace or trust set. */
export function mcpAuthorizationIssuer(env: AuthEnv): string {
  return mcpAuth0Configuration(env).authorizationIssuer;
}

/** Downstream fences consume the authentication snapshot and retain canonical
 * connection keys. A missing snapshot can only match the historical issuer. */
export function verifiedMcpTokenIssuer(
  identity: Pick<McpIdentity, "verifiedTokenIssuer">,
  env: AuthEnv,
): string {
  const configuration = mcpAuth0Configuration(env);
  const issuer = identity.verifiedTokenIssuer ?? configuration.identityIssuer;
  if (!configuration.tokenIssuers.includes(issuer))
    throw new AuthError("TOKEN_INVALID", "Expired or invalid token.");
  return issuer;
}
function transactionAuth0Issuer(
  env: AuthEnv,
  transaction: {
    authorization_issuer: string | null;
    identity_issuer: string | null;
  },
): string {
  const canonical = auth0Issuer(env);
  // Pre-migration transactions were always initiated at the canonical domain.
  // In particular they must not inherit a newly enabled browser alias.
  if (
    transaction.authorization_issuer === null &&
    transaction.identity_issuer === null
  )
    return canonical;
  if (transaction.identity_issuer !== canonical) invalidIdentityConfiguration();
  if (transaction.authorization_issuer === canonical) return canonical;
  // Keep an already-started alias flow valid when the opt-in is rolled back.
  if (
    canonical === TRUSTED_AUTH0_ALIAS.canonical &&
    transaction.authorization_issuer === TRUSTED_AUTH0_ALIAS.custom
  )
    return transaction.authorization_issuer;
  return invalidIdentityConfiguration();
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
      "The Auth0 client and audience must be connected.",
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
  return validateAuth0TokenAtIssuer(
    token,
    env,
    kind,
    auth0Issuer(env),
    keyOverride,
  );
}
/** Key discovery is server-owned. MCP's bounded same-tenant aliases use the
 * canonical key set; the token never chooses a JWKS URL or creates an alias. */
async function validateAuth0TokenAtIssuer(
  token: string,
  env: AuthEnv,
  kind: "id" | "access",
  issuer: string,
  keyOverride?: JWTVerifyGetKey,
  acceptedIssuers: string[] = [issuer],
): Promise<JWTPayload> {
  const audience = kind === "id" ? env.AUTH0_CLIENT_ID : env.AUTH0_AUDIENCE;
  if (!audience)
    throw new AuthError(
      "IDENTITY_NOT_CONFIGURED",
      "Identity audience is missing.",
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
      issuer: acceptedIssuers,
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
    throw new AuthError("TOKEN_INVALID", "Expired or invalid token.");
  }
}
export function hasMfa(payload: JWTPayload): boolean {
  return (
    (Array.isArray(payload.amr) && payload.amr.includes("mfa")) ||
    payload["https://guteneo.com/mfa"] === true ||
    documentAuthenticationEvidence(payload).strongAuthentication
  );
}
/** Call only after JWT signature/issuer/audience/nonce validation. A deployed
 * Auth0 Action may issue this assertion only after qualifying the actual
 * user-verified WebAuthn or equivalent enterprise authentication ceremony.
 * Native MFA can complete after primary auth_time; its actual timestamp must
 * lie between that authentication and this token's signed issuance time. */
export function documentAuthenticationEvidence(payload: JWTPayload) {
  const authenticatedAt =
    typeof payload.auth_time === "number" &&
    Number.isSafeInteger(payload.auth_time) &&
    payload.auth_time > 0
      ? payload.auth_time
      : null;
  const amr = Array.isArray(payload.amr)
    ? payload.amr
        .filter((item): item is string => typeof item === "string")
        .slice(0, 20)
    : [];
  const acr =
    typeof payload.acr === "string" ? payload.acr.slice(0, 200) : null;
  const assertion = payload["https://guteneo.com/document_authentication"];
  const ceremonyAt =
    assertion && typeof assertion === "object" && !Array.isArray(assertion)
      ? (assertion as Record<string, unknown>).authenticated_at
      : null;
  const valid =
    !!assertion &&
    typeof assertion === "object" &&
    !Array.isArray(assertion) &&
    (assertion as Record<string, unknown>).policy === "guteneo-sensitive-v1" &&
    ((assertion as Record<string, unknown>).method === "webauthn_uv" ||
      (assertion as Record<string, unknown>).method ===
        "qualified_federation") &&
    authenticatedAt !== null &&
    typeof ceremonyAt === "number" &&
    Number.isSafeInteger(ceremonyAt) &&
    typeof payload.iat === "number" &&
    Number.isSafeInteger(payload.iat) &&
    authenticatedAt <= ceremonyAt &&
    ceremonyAt <= payload.iat;
  return {
    authenticatedAt,
    amr,
    acr,
    strongAuthentication: valid,
    authenticationPolicyVersion: valid ? "guteneo-sensitive-v1" : null,
  };
}
export function authenticationPolicy(
  env: Pick<AuthEnv, "AUTH0_AUTH_POLICY">,
): "verified_email" | "verified_email_and_mfa" {
  const policy = env.AUTH0_AUTH_POLICY ?? "verified_email_and_mfa";
  if (policy !== "verified_email" && policy !== "verified_email_and_mfa")
    throw new AuthError(
      "IDENTITY_CONFIG_INVALID",
      "Invalid connection policy.",
      503,
    );
  return policy;
}
/** This is a scoped Action claim in a signature-verified token, never an input
 * supplied by the browser or inferred from a passkey/MFA enrollment flag. */
export function hasVerifiedAccount(payload: JWTPayload): boolean {
  return (
    payload["https://guteneo.com/verified_account"] === true &&
    payload.email_verified !== false
  );
}
function requireVerifiedAccount(payload: JWTPayload): void {
  if (!hasVerifiedAccount(payload))
    throw new AuthError(
      "ACCOUNT_VERIFICATION_REQUIRED",
      "Sign in again after verifying your email address.",
      403,
    );
}
export async function memberships(
  env: AuthEnv,
  userId: string,
): Promise<Membership[]> {
  const result = await env.DB.prepare(
    `SELECT m.organization_id, o.name organization_name, m.user_id, u.name user_name,u.email user_email, u.preferred_locale,u.preferred_dashboard_appearance, m.role,m.supervisor_can_approve,m.supervisor_can_report
    FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN users u ON u.id=m.user_id
    WHERE m.user_id=? ORDER BY m.organization_id LIMIT 101`,
  )
    .bind(userId)
    .all<Membership>();
  return result.results;
}
function sessionResult(
  row: Membership & {
    csrf_token: string;
    mfa: number;
    verified_account: number;
  },
  tokenHash: string,
  env: AuthEnv,
): AuthenticatedSession {
  const context: AuthContext = {
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    supervisorCanApprove: row.supervisor_can_approve === 1,
    supervisorCanReport: row.supervisor_can_report === 1,
    actor: "browser",
  };
  // Internal evidence must survive direct server use without appearing in JSON
  // authority objects, public sessions or a spread into an OAuth identity.
  Object.defineProperty(context, "documentSessionHash", {
    value: tokenHash,
    enumerable: false,
    writable: false,
  });
  return {
    context,
    organization: { id: row.organization_id, name: row.organization_name },
    user: {
      id: row.user_id,
      name: row.user_name,
      email: accountEmail(row.user_email),
      role: row.role,
      supervisorCanApprove: row.supervisor_can_approve === 1,
      supervisorCanReport: row.supervisor_can_report === 1,
      preferredLocale: row.preferred_locale,
      preferredDashboardAppearance: row.preferred_dashboard_appearance,
    },
    csrfToken: row.csrf_token,
    simulation: env.MODE === "simulation",
    mfa: Boolean(row.mfa),
    verifiedAccount: row.verified_account === 1,
    tokenHash,
  };
}
export function publicSession(session: AuthenticatedSession) {
  return {
    organization: session.organization,
    user: session.user,
    csrfToken: session.csrfToken,
    permissions: workspacePermissions(session.context.role, {
      canApprove: session.context.supervisorCanApprove,
      canReport: session.context.supervisorCanReport,
    }),
    simulation: session.simulation,
    mfa: session.mfa,
    verifiedAccount: session.verifiedAccount,
  };
}
export async function createSession(
  env: AuthEnv,
  membership: Membership,
  mfa: boolean,
  development: boolean,
  verifiedAccount = false,
  authentication?: {
    verifiedEmail: string;
    authenticatedAt: number | null;
    amr?: string[];
    acr?: string | null;
    strongAuthentication?: boolean;
    authenticationPolicyVersion?: string | null;
    identityIssuer?: string;
    identitySubject?: string;
  },
): Promise<{ session: AuthenticatedSession; cookie: string }> {
  const secret = randomSecret();
  const tokenHash = await hashSecret(secret);
  const csrf = randomSecret();
  await env.DB.prepare(
    `INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account)
    VALUES(?,?,?,?,?,?,?,?,?)`,
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
      Number(verifiedAccount),
    )
    .run();
  await persistPersonalSession(env, {
    tokenHash,
    userId: membership.user_id,
    csrfToken: csrf,
    mfa,
    development,
    verifiedAccount,
    verifiedEmail: authentication?.verifiedEmail ?? null,
    authenticatedAt: authentication?.authenticatedAt ?? null,
    amr: authentication?.amr,
    acr: authentication?.acr,
    strongAuthentication: authentication?.strongAuthentication,
    authenticationPolicyVersion: authentication?.authenticationPolicyVersion,
    identityIssuer: authentication?.identityIssuer,
    identitySubject: authentication?.identitySubject,
    expiresAt: new Date(Date.now() + HOUR).toISOString(),
  });
  return {
    session: sessionResult(
      {
        ...membership,
        csrf_token: csrf,
        mfa: Number(mfa),
        verified_account: Number(verifiedAccount),
      },
      tokenHash,
      env,
    ),
    cookie: cookie(env, "session", secret, 3600),
  };
}

export async function persistPersonalSession(
  env: AuthEnv,
  input: {
    tokenHash: string;
    userId: string;
    csrfToken: string;
    verifiedEmail: string | null;
    mfa: boolean;
    verifiedAccount: boolean;
    authenticatedAt: number | null;
    amr?: string[];
    acr?: string | null;
    strongAuthentication?: boolean;
    authenticationPolicyVersion?: string | null;
    development: boolean;
    expiresAt: string;
    identityIssuer?: string;
    identitySubject?: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO personal_sessions(token_hash,user_id,csrf_token,verified_email,mfa,verified_account,authenticated_at,amr_json,acr,strong_authentication,authentication_policy_version,is_development,public_id,created_at,expires_at,identity_issuer,identity_subject,identity_authenticated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      input.tokenHash,
      input.userId,
      input.csrfToken,
      input.verifiedEmail,
      Number(input.mfa),
      Number(input.verifiedAccount),
      input.authenticatedAt,
      JSON.stringify(input.amr ?? []),
      input.acr ?? null,
      Number(input.strongAuthentication ?? false),
      input.authenticationPolicyVersion ?? null,
      Number(input.development),
      `personal_${crypto.randomUUID().replaceAll("-", "")}`,
      nowISO(),
      input.expiresAt,
      input.identityIssuer ?? null,
      input.identitySubject ?? null,
      input.identityIssuer ? nowISO() : null,
    )
    .run();
}

export async function createPersonalBrowserSession(
  env: AuthEnv,
  input: Omit<
    Parameters<typeof persistPersonalSession>[1],
    "tokenHash" | "csrfToken" | "expiresAt"
  >,
): Promise<{ cookie: string; tokenHash: string }> {
  const secret = randomSecret();
  const tokenHash = await hashSecret(secret);
  await persistPersonalSession(env, {
    ...input,
    tokenHash,
    csrfToken: randomSecret(),
    expiresAt: new Date(Date.now() + HOUR).toISOString(),
  });
  return { cookie: cookie(env, "session", secret, 3600), tokenHash };
}

export async function authenticatePersonalBrowser(
  request: Request,
  env: AuthEnv,
  mutating = false,
): Promise<PersonalPrincipal> {
  if (request.headers.has("Authorization"))
    throw new AuthError(
      "BROWSER_REQUIRED",
      "Open your documents in your browser.",
      403,
    );
  const token = readCookie(request, cookieName(env, "session"));
  if (!token || !/^[\w-]{43}$/.test(token))
    throw new AuthError("AUTHENTICATION_REQUIRED", "Sign in to continue.");
  const tokenHash = await hashSecret(token);
  const row = await env.DB.prepare(
    `SELECT p.user_id,p.csrf_token,p.verified_email,p.mfa,p.verified_account,p.authenticated_at,p.amr_json,p.acr,p.strong_authentication,p.authentication_policy_version,p.is_development,u.name,u.preferred_locale,u.preferred_dashboard_appearance,
     EXISTS(SELECT 1 FROM auth_identities ai WHERE ai.user_id=p.user_id AND ai.issuer=p.identity_issuer AND ai.subject=p.identity_subject AND u.email=p.verified_email) identity_verified
     FROM personal_sessions p JOIN users u ON u.id=p.user_id WHERE p.token_hash=? AND p.expires_at>?`,
  )
    .bind(tokenHash, nowISO())
    .first<{
      user_id: string;
      csrf_token: string;
      verified_email: string | null;
      mfa: number;
      verified_account: number;
      identity_verified: number;
      authenticated_at: number | null;
      amr_json: string;
      acr: string | null;
      strong_authentication: number;
      authentication_policy_version: string | null;
      is_development: number;
      name: string;
      preferred_locale: SupportedLocale | null;
      preferred_dashboard_appearance: DashboardAppearance;
    }>();
  if (!row || (row.is_development && !isLocalSimulation(request, env)))
    throw new AuthError("SESSION_EXPIRED", "Session expired. Sign in again.");
  if (mutating) {
    requireSameOrigin(request, env);
    if (
      !constantEqual(request.headers.get("X-CSRF-Token") ?? "", row.csrf_token)
    )
      throw new AuthError(
        "CSRF_REJECTED",
        "Session confirmation is missing or invalid.",
        403,
      );
  }
  return {
    userId: row.user_id,
    name: row.name,
    email: accountEmail(row.verified_email),
    verifiedEmail: !!row.verified_email,
    mfa: row.mfa === 1,
    verifiedAccount: row.verified_account === 1,
    identityVerified: row.identity_verified === 1,
    authenticatedAt: row.authenticated_at,
    amr: JSON.parse(row.amr_json),
    acr: row.acr,
    strongAuthentication: row.strong_authentication === 1,
    authenticationPolicyVersion: row.authentication_policy_version,
    preferredLocale: row.preferred_locale,
    preferredDashboardAppearance: row.preferred_dashboard_appearance,
    csrfToken: row.csrf_token,
    tokenHash,
    simulation: env.MODE === "simulation",
    development: row.is_development === 1,
  };
}

export function requirePersonalStrongAuthentication(
  principal: PersonalPrincipal,
  options: { maxAgeSeconds?: number } = {},
): void {
  const now = Math.floor(Date.now() / 1000);
  if (
    !principal.verifiedEmail ||
    !principal.strongAuthentication ||
    principal.authenticationPolicyVersion !== "guteneo-sensitive-v1" ||
    principal.authenticatedAt === null ||
    principal.authenticatedAt > now + 5 ||
    now - principal.authenticatedAt > (options.maxAgeSeconds ?? 900)
  )
    throw new AuthError(
      "STRONG_AUTHENTICATION_REQUIRED",
      "Sign in again with recent strong authentication to access this document.",
      403,
    );
  if (principal.development && !principal.simulation)
    throw new AuthError(
      "DEVELOPMENT_AUTH_FORBIDDEN",
      "A real sign-in is required.",
      403,
    );
}

/** Document authorization policy never upgrades the observed authentication. */
export function requirePersonalDocumentAuthentication(
  principal: PersonalPrincipal,
  env: Pick<AuthEnv, "SENSITIVE_DOCUMENT_AUTHENTICATION">,
  options: { maxAgeSeconds?: number } = {},
): void {
  if (documentAccessMode(env.SENSITIVE_DOCUMENT_AUTHENTICATION) === "strong")
    return requirePersonalStrongAuthentication(principal, options);
  const now = Math.floor(Date.now() / 1000);
  if (
    !principal.verifiedAccount ||
    !principal.verifiedEmail ||
    !principal.email ||
    !(
      principal.identityVerified ||
      (principal.development && principal.simulation)
    ) ||
    !Number.isSafeInteger(principal.authenticatedAt) ||
    principal.authenticatedAt === null ||
    principal.authenticatedAt <= 0 ||
    principal.authenticatedAt > now + 5 ||
    now - principal.authenticatedAt > (options.maxAgeSeconds ?? 900)
  )
    throw new AuthError(
      "DOCUMENT_AUTHENTICATION_REQUIRED",
      "Sign in again with your verified account to access this document.",
      403,
    );
  if (principal.development && !principal.simulation)
    throw new AuthError(
      "DEVELOPMENT_AUTH_FORBIDDEN",
      "A real sign-in is required.",
      403,
    );
}

/** Rotate the shared cookie without extending the original authenticated
 * lifetime. A personal session never supplies an organization by assertion. */
export async function enterWorkspaceFromPersonal(
  env: AuthEnv,
  principal: PersonalPrincipal,
  organizationId: string,
): Promise<{ session: AuthenticatedSession; cookie: string }> {
  const member = (await memberships(env, principal.userId)).find(
    (item) => item.organization_id === organizationId,
  );
  if (!member)
    throw new AuthError(
      "MEMBERSHIP_REQUIRED",
      "You are not a member of this workspace.",
      403,
    );
  if (
    !principal.development &&
    authenticationPolicy(env) === "verified_email_and_mfa" &&
    member.role === "admin" &&
    !principal.mfa
  )
    throw new AuthError(
      "MFA_REQUIRED",
      "Sign in again after two-factor authentication.",
      403,
    );
  const secret = randomSecret();
  const tokenHash = await hashSecret(secret);
  const csrfToken = randomSecret();
  const timestamp = nowISO();
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account)
      SELECT ?,p.user_id,m.organization_id,?,p.mfa,p.is_development,?,p.expires_at,p.verified_account FROM personal_sessions p
      JOIN memberships m ON m.user_id=p.user_id JOIN organizations o ON o.id=m.organization_id
      WHERE p.token_hash=? AND p.user_id=? AND p.csrf_token=? AND p.expires_at>? AND m.organization_id=? AND m.role=? AND m.supervisor_can_approve=? AND m.supervisor_can_report=? AND o.mode=?`,
    ).bind(
      tokenHash,
      csrfToken,
      timestamp,
      principal.tokenHash,
      principal.userId,
      principal.csrfToken,
      timestamp,
      organizationId,
      member.role,
      member.supervisor_can_approve,
      member.supervisor_can_report,
      env.MODE,
    ),
    env.DB.prepare(
      `INSERT INTO personal_sessions(token_hash,user_id,csrf_token,verified_email,mfa,verified_account,authenticated_at,amr_json,acr,strong_authentication,authentication_policy_version,is_development,public_id,created_at,expires_at,identity_issuer,identity_subject,identity_authenticated_at)
      SELECT ?,user_id,?,verified_email,mfa,verified_account,authenticated_at,amr_json,acr,strong_authentication,authentication_policy_version,is_development,?,?,expires_at,identity_issuer,identity_subject,identity_authenticated_at FROM personal_sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM browser_sessions WHERE token_hash=?)`,
    ).bind(
      tokenHash,
      csrfToken,
      `personal_${crypto.randomUUID().replaceAll("-", "")}`,
      timestamp,
      principal.tokenHash,
      tokenHash,
    ),
    env.DB.prepare(
      "INSERT INTO browser_identity_evidence(token_hash,issuer,subject,verified_email,authenticated_at) SELECT ?,identity_issuer,identity_subject,verified_email,identity_authenticated_at FROM personal_sessions WHERE token_hash=? AND identity_issuer IS NOT NULL AND identity_subject IS NOT NULL AND EXISTS(SELECT 1 FROM browser_sessions WHERE token_hash=?)",
    ).bind(tokenHash, principal.tokenHash, tokenHash),
    env.DB.prepare(
      "DELETE FROM browser_sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM personal_sessions WHERE token_hash=?)",
    ).bind(principal.tokenHash, tokenHash),
    env.DB.prepare(
      "DELETE FROM personal_sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM personal_sessions WHERE token_hash=?)",
    ).bind(principal.tokenHash, tokenHash),
  ]);
  if (!results[0].meta.changes)
    throw new AuthError(
      "ACCESS_CHANGED",
      "Your permissions or session have changed. Sign in again.",
      403,
    );
  return {
    session: sessionResult(
      {
        ...member,
        user_email: principal.email,
        csrf_token: csrfToken,
        mfa: Number(principal.mfa),
        verified_account: Number(principal.verifiedAccount),
      },
      tokenHash,
      env,
    ),
    cookie: cookie(env, "session", secret, 3600),
  };
}
async function observeBrowserSession(
  env: AuthEnv,
  request: Request,
  session: AuthenticatedSession,
): Promise<void> {
  try {
    const publicId = await env.DB.prepare(
      "SELECT public_id FROM browser_sessions WHERE token_hash=? AND organization_id=? AND user_id=? AND is_development=0 AND expires_at>?",
    )
      .bind(
        session.tokenHash,
        session.context.organizationId,
        session.context.userId,
        nowISO(),
      )
      .first<{ public_id: string }>();
    if (publicId)
      await recordConnectionEvent(env.DB, request, {
        organizationId: session.context.organizationId,
        userId: session.context.userId,
        kind: "browser",
        connectionId: publicId.public_id,
      });
  } catch {
    // The optional public-ID lookup is telemetry too. Its failure never changes
    // authenticated authority or the session cookie already being rotated.
  }
}
export async function authenticateBrowser(
  request: Request,
  env: AuthEnv,
  mutating = false,
): Promise<AuthenticatedSession> {
  const token = readCookie(request, cookieName(env, "session"));
  if (!token || !/^[\w-]{43}$/.test(token))
    throw new AuthError("AUTHENTICATION_REQUIRED", "Sign in to continue.");
  const tokenHash = await hashSecret(token);
  const row = await env.DB.prepare(
    `SELECT s.csrf_token,s.mfa,s.is_development,s.verified_account,m.organization_id,m.user_id,m.role,m.supervisor_can_approve,m.supervisor_can_report,o.name organization_name,u.name user_name,COALESCE(e.verified_email,u.email) user_email,u.preferred_locale,u.preferred_dashboard_appearance
    FROM browser_sessions s JOIN memberships m ON m.organization_id=s.organization_id AND m.user_id=s.user_id
    JOIN organizations o ON o.id=m.organization_id JOIN users u ON u.id=m.user_id
    LEFT JOIN browser_identity_evidence e ON e.token_hash=s.token_hash
    WHERE s.token_hash=? AND s.expires_at>?`,
  )
    .bind(tokenHash, nowISO())
    .first<
      Membership & {
        csrf_token: string;
        mfa: number;
        is_development: number;
        verified_account: number;
      }
    >();
  if (!row || (row.is_development && !isLocalSimulation(request, env)))
    throw new AuthError("SESSION_EXPIRED", "Session expired. Sign in again.");
  const policy = authenticationPolicy(env);
  if (
    !row.is_development &&
    policy === "verified_email" &&
    row.verified_account !== 1
  )
    throw new AuthError(
      "ACCOUNT_VERIFICATION_REQUIRED",
      "Sign in again to verify your account.",
      403,
    );
  if (
    !row.is_development &&
    policy === "verified_email_and_mfa" &&
    row.role === "admin" &&
    !row.mfa
  )
    throw new AuthError(
      "MFA_REQUIRED",
      "Two-factor authentication is required for administrators.",
      403,
    );
  if (mutating) {
    requireSameOrigin(request, env);
    if (
      !constantEqual(request.headers.get("X-CSRF-Token") ?? "", row.csrf_token)
    )
      throw new AuthError(
        "CSRF_REJECTED",
        "Session confirmation is missing or invalid.",
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
      `Authorization required: ${scope}.`,
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
      "Authorize your assistant connection.",
    );
  const token = header.slice(7);
  if (token.startsWith("gtn_dev_")) {
    if (!isLocalSimulation(request, env))
      throw new AuthError(
        "DEVELOPMENT_AUTH_FORBIDDEN",
        "Development authentication is forbidden.",
        403,
      );
    const row = await env.DB.prepare(
      `SELECT t.organization_id,t.user_id,m.role,m.supervisor_can_approve,m.supervisor_can_report,t.expires_at FROM development_mcp_tokens t
      JOIN memberships m ON m.organization_id=t.organization_id AND m.user_id=t.user_id WHERE t.token_hash=? AND t.expires_at>?`,
    )
      .bind(await hashSecret(token), nowISO())
      .first<{
        organization_id: string;
        user_id: string;
        role: AuthContext["role"];
        supervisor_can_approve: number;
        supervisor_can_report: number;
        expires_at: string;
      }>();
    if (!row) throw new AuthError("TOKEN_INVALID", "Simulation token expired.");
    return {
      context: {
        organizationId: row.organization_id,
        userId: row.user_id,
        role: row.role,
        supervisorCanApprove: row.supervisor_can_approve === 1,
        supervisorCanReport: row.supervisor_can_report === 1,
        actor: "mcp",
      },
      scopes: [...MCP_SCOPES],
      clientId: "local-simulation",
      expiresAt: Date.parse(row.expires_at) / 1000,
      token,
    };
  }
  const configuration = mcpAuth0Configuration(env);
  const payload = await validateAuth0TokenAtIssuer(
    token,
    env,
    "access",
    configuration.identityIssuer,
    undefined,
    configuration.tokenIssuers,
  );
  const policy = authenticationPolicy(env);
  if (policy === "verified_email") requireVerifiedAccount(payload);
  const issuer = configuration.identityIssuer;
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
      "Sign in to Guteneo first to create your workspace.",
      403,
    );
  const memberRows = await memberships(env, identity.user_id);
  const readConnection = () =>
    env.DB.prepare(
      `SELECT c.id,c.organization_id,c.status,c.not_before,o.authorization_revision
       FROM authorized_connections c LEFT JOIN connection_tool_observations o
         ON o.connection_id=c.id AND o.organization_id=c.organization_id AND o.user_id=c.user_id
       WHERE c.issuer=? AND c.user_id=? AND c.client_id=?`,
    )
      .bind(issuer, identity.user_id, clientId)
      .first<{
        id: string;
        organization_id: string;
        status: string;
        not_before: number;
        authorization_revision: number | null;
      }>();
  let connection = await readConnection();
  if (!connection) {
    // OAuth consent selects a single personal workspace unambiguously; multi-workspace users must bind explicitly in the dashboard.
    if (memberRows.length !== 1)
      throw new AuthError(
        "ORGANIZATION_SELECTION_REQUIRED",
        "Link this assistant to an organization from the dashboard connections.",
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
    connection = await readConnection();
  }
  if (
    !connection ||
    connection.status !== "active" ||
    payload.iat < connection.not_before
  )
    throw new AuthError(
      "CONNECTION_REVOKED",
      "This connection has been revoked.",
      403,
    );
  const member = memberRows.find(
    (m) => m.organization_id === connection.organization_id,
  );
  if (!member)
    throw new AuthError(
      "MEMBERSHIP_REQUIRED",
      "Access to this organization denied.",
      403,
    );
  if (
    policy === "verified_email_and_mfa" &&
    member.role === "admin" &&
    !hasMfa(payload)
  )
    throw new AuthError(
      "MFA_REQUIRED",
      "Reconnect the assistant after two-factor authentication.",
      403,
    );
  if (env.MODE === "production")
    await recordConnectionEvent(env.DB, request, {
      organizationId: member.organization_id,
      userId: member.user_id,
      kind: "mcp",
      connectionId: connection.id,
    });
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
      supervisorCanApprove: member.supervisor_can_approve === 1,
      supervisorCanReport: member.supervisor_can_report === 1,
      actor: "mcp",
    },
    scopes,
    clientId,
    expiresAt: payload.exp,
    token,
    verifiedTokenIssuer: payload.iss!,
    ...(env.MODE === "production" && connection.authorization_revision !== null
      ? {
          connectionObservation: {
            connectionId: connection.id,
            authorizationRevision: connection.authorization_revision,
          },
        }
      : {}),
  };
}
export function protectedResourceMetadata(env: AuthEnv): Response {
  return json({
    resource: `${env.APP_ORIGIN}/mcp`,
    authorization_servers: [mcpAuthorizationIssuer(env)],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "Guteneo",
    resource_documentation: `${env.APP_ORIGIN}/developers/?lang=en`,
  });
}

async function boundedAuthInput(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError("INVALID_INPUT", "Invalid invitation.", 400);
  let text = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      text += decoder.decode(part.value, { stream: true });
      if (text.length > 512) {
        await reader.cancel();
        throw new AuthError("INVALID_INPUT", "Invalid invitation.", 400);
      }
    }
  } finally {
    reader.releaseLock();
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new AuthError("INVALID_INPUT", "Invalid invitation.", 400);
  }
  return input;
}
export async function handleAuthRoute(
  request: Request,
  env: AuthEnv,
): Promise<Response | null> {
  const failureContext: { validated?: LoginFailureContext } = {};
  try {
    return await handleAuthRouteOperation(request, env, failureContext);
  } catch (error) {
    if (failureContext.validated && error !== null && typeof error === "object")
      loginFailureContexts.set(error, failureContext.validated);
    throw error;
  }
}
async function handleAuthRouteOperation(
  request: Request,
  env: AuthEnv,
  failureContext: { validated?: LoginFailureContext },
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
  if (request.method === "POST" && url.pathname === "/auth/invitation") {
    requireSameOrigin(request, env);
    if (
      request.headers.has("Authorization") ||
      !request.headers.get("Content-Type")?.startsWith("application/json")
    )
      throw new AuthError(
        "BROWSER_REQUIRED",
        "Open the invitation in your browser.",
        403,
      );
    const input = await boundedAuthInput(request);
    if (
      !input ||
      typeof input !== "object" ||
      Object.keys(input).length !== 1 ||
      !("token" in input) ||
      typeof input.token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.token)
    )
      throw new AuthError("INVALID_INPUT", "Invalid invitation.", 400);
    const preview = await getInvitationPreview(env, input.token);
    if (preview.status !== "pending")
      throw new AuthError(
        "INVITATION_UNAVAILABLE",
        "This invitation is no longer available.",
        409,
      );
    return json({ loginUrl: "/auth/login?fresh=1" }, 200, {
      "Set-Cookie": cookie(env, "invitation", input.token, 600),
    });
  }
  if (
    request.method === "GET" &&
    ["/auth/login", "/auth/signup"].includes(url.pathname)
  ) {
    const config = configuredIdentity(env);
    const authorizationIssuer = browserAuth0Issuer(env);
    const preferredLocale = requestedLoginLocale(request);
    if (env.ENVIRONMENT !== "local") {
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip)
        throw new AuthError("LOGIN_UNAVAILABLE", "Sign-in unavailable.", 503);
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
          "Too many attempts. Try again in an hour.",
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
    const invitationToken = readCookie(request, cookieName(env, "invitation"));
    const invitationHash =
      invitationToken && /^[A-Za-z0-9_-]{43}$/.test(invitationToken)
        ? await hashSecret(invitationToken)
        : null;
    await env.DB.prepare(
      "INSERT INTO auth_transactions(state_hash,browser_hash,code_verifier,nonce,return_to,expires_at,preferred_locale,invitation_token_hash,authorization_issuer,identity_issuer,account_context) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        await hashSecret(state),
        await hashSecret(browser),
        verifier,
        nonce,
        safeReturnPath(url.searchParams.get("returnTo")),
        new Date(Date.now() + 600_000).toISOString(),
        preferredLocale,
        invitationHash,
        authorizationIssuer,
        config.issuer,
        url.searchParams.get("context") === "personal"
          ? "personal"
          : "workshop",
      )
      .run();
    const destination = new URL("authorize", authorizationIssuer);
    destination.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: `${env.APP_ORIGIN}/auth/callback`,
      scope: "openid profile email",
      // Auth0 does not offer Luxembourgish. Keep the personal preference intact
      // while requesting its supported German interface for the hosted screen.
      ui_locales: preferredLocale === "lb" ? "de" : preferredLocale,
      audience: config.audience,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    if (url.pathname === "/auth/signup")
      destination.searchParams.set("screen_hint", "signup");
    if (url.searchParams.get("context") === "personal") {
      if (
        documentAccessMode(env.SENSITIVE_DOCUMENT_AUTHENTICATION) === "strong"
      )
        destination.searchParams.set(
          "acr_values",
          "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
        );
      destination.searchParams.set("max_age", "0");
    }
    // A fresh login allows a newly verified email or MFA enrolment to be reflected
    // in signed claims rather than reusing an old identity-provider session.
    if (
      url.searchParams.get("fresh") === "1" ||
      url.searchParams.get("intent") === "switch-account"
    ) {
      destination.searchParams.set("prompt", "login");
      destination.searchParams.set("max_age", "0");
    }
    return redirect(destination.href, [
      cookie(env, "login", browser, 600),
      cookie(env, "invitation", "", 0),
    ]);
  }
  if (request.method === "GET" && url.pathname === "/auth/callback") {
    const config = configuredIdentity(env);
    const browser = readCookie(request, cookieName(env, "login"));
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (
      !browser ||
      !state ||
      state.length > 256 ||
      (code && code.length > 4096)
    )
      throw new AuthError("LOGIN_STATE_INVALID", "Restart sign-in.");
    const transaction = await env.DB.prepare(
      "DELETE FROM auth_transactions WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING code_verifier,nonce,return_to,preferred_locale,invitation_token_hash,authorization_issuer,identity_issuer,account_context",
    )
      .bind(await hashSecret(state), await hashSecret(browser), nowISO())
      .first<{
        invitation_token_hash: string | null;
        authorization_issuer: string | null;
        identity_issuer: string | null;
        account_context: "personal" | "workshop";
        code_verifier: string;
        nonce: string;
        return_to: string;
        preferred_locale: SupportedLocale | null;
      }>();
    if (!transaction)
      throw new AuthError(
        "LOGIN_STATE_INVALID",
        "Connection expired or already used.",
      );
    failureContext.validated = {
      returnTo: safeReturnPath(transaction.return_to),
      locale:
        normalizeLocale(transaction.preferred_locale) ??
        localeFromAcceptLanguage(request.headers.get("Accept-Language")),
    };
    if (!code) throw new AuthError("LOGIN_STATE_INVALID", "Restart sign-in.");
    const authorizationIssuer = transactionAuth0Issuer(env, transaction);
    const response = await fetch(new URL("oauth/token", authorizationIssuer), {
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
        "The sign-in service is temporarily unavailable. Try again.",
      );
    });
    if (!response.ok)
      throw new AuthError(
        "LOGIN_EXCHANGE_FAILED",
        "Sign-in could not be completed. Start again.",
        401,
      );
    const tokens = (await response.json().catch(() => {
      throw new AuthError(
        "LOGIN_EXCHANGE_FAILED",
        "Sign-in could not be completed. Start again.",
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
        "Incomplete identity response.",
      );
    const claims = await validateAuth0TokenAtIssuer(
      tokens.id_token,
      env,
      "id",
      authorizationIssuer,
    );
    const accessClaims = await validateAuth0TokenAtIssuer(
      tokens.access_token,
      env,
      "access",
      authorizationIssuer,
    );
    if (claims.nonce !== transaction.nonce || claims.sub !== accessClaims.sub)
      throw new AuthError(
        "LOGIN_STATE_INVALID",
        "The identity response is not bound to this connection.",
      );
    if (
      claims.email_verified !== true ||
      typeof claims.email !== "string" ||
      !claims.email.trim() ||
      claims.email.length > 320
    )
      throw new AuthError(
        "EMAIL_VERIFICATION_REQUIRED",
        "Verify your address using the link in the email, then sign in again.",
        403,
      );
    const policy = authenticationPolicy(env);
    if (policy === "verified_email") {
      requireVerifiedAccount(claims);
      requireVerifiedAccount(accessClaims);
    }
    const verifiedAccount =
      hasVerifiedAccount(claims) && hasVerifiedAccount(accessClaims);
    let identity = await env.DB.prepare(
      "SELECT user_id FROM auth_identities WHERE issuer=? AND subject=?",
    )
      .bind(config.issuer, claims.sub)
      .first<{ user_id: string }>();
    const platformBrowser = isBelvedereBrowserOrigin(request, env);
    if (
      platformBrowser &&
      (!identity ||
        transaction.invitation_token_hash ||
        claims.email.trim().toLowerCase() !== BELVEDERE_WATCHER_EMAIL ||
        (env.BELVEDERE_AUTH0_SUBJECT &&
          claims.sub !== env.BELVEDERE_AUTH0_SUBJECT))
    )
      throw new AuthError("ACCESS_DENIED", "Access denied.", 403);
    let invitedOrganizationId: string | undefined;
    if (transaction.invitation_token_hash) {
      if (policy === "verified_email_and_mfa" && !hasMfa(claims)) {
        const invitedRole = await env.DB.prepare(
          "SELECT role FROM workspace_invitations WHERE token_hash=?",
        )
          .bind(transaction.invitation_token_hash)
          .first<{ role: string }>();
        if (invitedRole?.role === "admin")
          throw new AuthError(
            "MFA_REQUIRED",
            "Enable two-factor authentication to accept this administrator role.",
            403,
          );
      }
      const userId = identity?.user_id ?? `usr_${crypto.randomUUID()}`;
      const createdAt = nowISO();
      const prerequisites = identity
        ? []
        : [
            env.DB.prepare(
              "INSERT INTO users(id,name,email,created_at,preferred_locale) VALUES(?,?,?,?,?)",
            ).bind(
              userId,
              typeof claims.name === "string"
                ? claims.name.slice(0, 200)
                : "Utilisateur Guteneo",
              claims.email,
              createdAt,
              transaction.preferred_locale,
            ),
            env.DB.prepare(
              "INSERT INTO auth_identities(issuer,subject,user_id,created_at) VALUES(?,?,?,?)",
            ).bind(config.issuer, claims.sub, userId, createdAt),
          ];
      const accepted = await acceptWorkspaceInvitation(
        env,
        transaction.invitation_token_hash,
        claims.email,
        userId,
        prerequisites,
      );
      invitedOrganizationId = accepted.organizationId;
      identity = { user_id: userId };
    }
    if (!identity) {
      if (
        policy === "verified_email_and_mfa" &&
        !hasMfa(claims) &&
        !documentAuthenticationEvidence(claims).strongAuthentication
      )
        throw new AuthError(
          "MFA_REQUIRED",
          "Complete enhanced authentication to create your account.",
          403,
        );
      const userId = `usr_${crypto.randomUUID()}`;
      const createdAt = nowISO();
      try {
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO users(id,name,email,created_at,preferred_locale) VALUES(?,?,?,?,?)",
          ).bind(
            userId,
            typeof claims.name === "string"
              ? claims.name.slice(0, 200)
              : "Utilisateur Guteneo",
            claims.email.trim().toLowerCase(),
            createdAt,
            transaction.preferred_locale,
          ),
          env.DB.prepare(
            "INSERT INTO auth_identities(issuer,subject,user_id,created_at) VALUES(?,?,?,?)",
          ).bind(config.issuer, claims.sub, userId, createdAt),
        ]);
        identity = { user_id: userId };
      } catch (error) {
        // Never merge identities by email, including concurrent callbacks.
        identity = await env.DB.prepare(
          "SELECT user_id FROM auth_identities WHERE issuer=? AND subject=?",
        )
          .bind(config.issuer, claims.sub)
          .first<{ user_id: string }>();
        if (!identity) throw error;
      }
    }
    const memberRows = await memberships(env, identity.user_id);
    if (platformBrowser && !memberRows.length)
      throw new AuthError("ACCESS_DENIED", "Access denied.", 403);
    if (
      !memberRows.length ||
      (transaction.account_context === "personal" && !invitedOrganizationId)
    ) {
      await env.DB.prepare(
        "UPDATE users SET email=? WHERE id=? AND EXISTS(SELECT 1 FROM auth_identities i WHERE i.user_id=users.id AND i.issuer=? AND i.subject=?)",
      )
        .bind(
          claims.email.trim().toLowerCase(),
          identity.user_id,
          config.issuer,
          claims.sub,
        )
        .run();
      const personal = await createPersonalBrowserSession(env, {
        userId: identity.user_id,
        verifiedEmail: claims.email.trim().toLowerCase(),
        mfa: hasMfa(claims),
        verifiedAccount,
        ...documentAuthenticationEvidence(claims),
        identityIssuer: config.issuer,
        identitySubject: claims.sub,
        development: false,
      });
      return redirect(new URL(transaction.return_to, env.APP_ORIGIN).href, [
        cookie(env, "login", "", 0),
        personal.cookie,
      ]);
    }
    const member = invitedOrganizationId
      ? memberRows.find(
          (entry) => entry.organization_id === invitedOrganizationId,
        )
      : memberRows[0];
    if (!member)
      throw new AuthError(
        "MEMBERSHIP_REQUIRED",
        "Your access to this workspace has changed.",
        403,
      );
    if (
      policy === "verified_email_and_mfa" &&
      member.role === "admin" &&
      !hasMfa(claims)
    )
      throw new AuthError(
        "MFA_REQUIRED",
        "Enable two-factor authentication before accessing the administrator workspace.",
        403,
      );
    // Only the exact signature-verified identity may refresh its login address.
    // A profile edit and an email match never link or elevate another account.
    // Preserve the person's name and saved language across Auth0 reconnections.
    if (claims.email_verified === true) {
      const verifiedEmail = claims.email.trim().toLowerCase();
      if (member.user_email !== verifiedEmail)
        await env.DB.prepare(
          "UPDATE users SET email=? WHERE id=? AND EXISTS(SELECT 1 FROM auth_identities i WHERE i.user_id=users.id AND i.issuer=? AND i.subject=?)",
        )
          .bind(verifiedEmail, identity.user_id, config.issuer, claims.sub)
          .run();
      member.user_email = verifiedEmail;
    }
    const session = await createSession(
      env,
      member,
      hasMfa(claims),
      false,
      verifiedAccount,
      {
        verifiedEmail: claims.email.trim().toLowerCase(),
        ...documentAuthenticationEvidence(claims),
        identityIssuer: config.issuer,
        identitySubject: claims.sub,
      },
    );
    await env.DB.prepare(
      "INSERT INTO browser_identity_evidence(token_hash,issuer,subject,verified_email,authenticated_at) SELECT token_hash,identity_issuer,identity_subject,verified_email,identity_authenticated_at FROM personal_sessions WHERE token_hash=? AND identity_issuer IS NOT NULL AND identity_subject IS NOT NULL",
    )
      .bind(session.session.tokenHash)
      .run();
    await observeBrowserSession(env, request, session.session);
    return redirect(
      new URL(
        invitedOrganizationId ? "/#/app" : transaction.return_to,
        env.APP_ORIGIN,
      ).href,
      [cookie(env, "login", "", 0), session.cookie],
    );
  }
  if (request.method === "POST" && url.pathname === "/api/dev/login") {
    if (!isLocalSimulation(request, env))
      throw new AuthError(
        "DEVELOPMENT_AUTH_FORBIDDEN",
        "Demo sign-in is available locally only.",
        403,
      );
    requireSameOrigin(request, env);
    const body = (await request.json()) as { organization?: string };
    if (!["atelier", "studio"].includes(body.organization ?? ""))
      throw new AuthError(
        "INVALID_ORGANIZATION",
        "Choose a simulation organization.",
        400,
      );
    const selected = (await memberships(env, `user_${body.organization}`)).find(
      (m) => m.organization_id === `org_${body.organization}`,
    );
    if (!selected)
      throw new AuthError(
        "SEED_REQUIRED",
        "Initialize the simulation data.",
        503,
      );
    const result = await createSession(env, selected, false, true, false, {
      verifiedEmail: selected.user_email ?? "workshop@example.test",
      authenticatedAt: Math.floor(Date.now() / 1000),
      amr: ["simulation"],
      strongAuthentication: true,
      authenticationPolicyVersion: "guteneo-sensitive-v1",
    });
    return json(publicSession(result.session), 200, {
      "Set-Cookie": result.cookie,
    });
  }
  if (url.pathname === "/api/account/workspaces" && request.method === "GET") {
    if (request.headers.has("Authorization"))
      throw new AuthError(
        "BROWSER_REQUIRED",
        "Open Guteneo in your browser.",
        403,
      );
    const session = await authenticateBrowser(request, env);
    const available = await memberships(env, session.context.userId);
    return json({
      items: available.map((member) => ({
        id: member.organization_id,
        name: member.organization_name,
        role: member.role,
        current: member.organization_id === session.context.organizationId,
        permissions: workspacePermissions(member.role, {
          canApprove: member.supervisor_can_approve === 1,
          canReport: member.supervisor_can_report === 1,
        }),
      })),
    });
  }
  if (url.pathname === "/api/account/workspace" && request.method === "POST") {
    if (request.headers.has("Authorization"))
      throw new AuthError(
        "BROWSER_REQUIRED",
        "Open Guteneo in your browser.",
        403,
      );
    const session = await authenticateBrowser(request, env, true);
    const input = await boundedAuthInput(request);
    if (
      !input ||
      typeof input !== "object" ||
      Object.keys(input).length !== 1 ||
      !("organizationId" in input) ||
      typeof input.organizationId !== "string" ||
      input.organizationId.length > 200
    )
      throw new AuthError(
        "INVALID_INPUT",
        "Choose an accessible workspace.",
        400,
      );
    const available = await memberships(env, session.context.userId);
    const selected = available.find(
      (member) => member.organization_id === input.organizationId,
    );
    if (!selected)
      throw new AuthError(
        "MEMBERSHIP_REQUIRED",
        "You are not a member of this workspace.",
        403,
      );
    const current = await env.DB.prepare(
      "SELECT is_development FROM browser_sessions WHERE token_hash=? AND expires_at>?",
    )
      .bind(session.tokenHash, nowISO())
      .first<{ is_development: number }>();
    if (!current)
      throw new AuthError("SESSION_EXPIRED", "Session expired. Sign in again.");
    if (
      !current.is_development &&
      authenticationPolicy(env) === "verified_email_and_mfa" &&
      selected.role === "admin" &&
      !session.mfa
    )
      throw new AuthError(
        "MFA_REQUIRED",
        "Sign in again after two-factor authentication.",
        403,
      );
    if (selected.organization_id === session.context.organizationId)
      return json(publicSession(session));
    const secret = randomSecret();
    const tokenHash = await hashSecret(secret);
    const csrfToken = randomSecret();
    const now = nowISO();
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at,verified_account)
        SELECT ?,target.user_id,target.organization_id,?,s.mfa,s.is_development,?,s.expires_at,s.verified_account
        FROM browser_sessions s JOIN memberships source ON source.organization_id=s.organization_id AND source.user_id=s.user_id
        JOIN memberships target ON target.user_id=s.user_id JOIN organizations o ON o.id=target.organization_id
        WHERE s.token_hash=? AND s.csrf_token=? AND s.expires_at>? AND s.user_id=? AND s.organization_id=?
        AND source.role=? AND source.supervisor_can_approve=? AND source.supervisor_can_report=?
        AND target.organization_id=? AND target.role=? AND target.supervisor_can_approve=? AND target.supervisor_can_report=? AND o.mode=?
        AND s.mfa=? AND s.verified_account=? AND s.is_development=?`,
      ).bind(
        tokenHash,
        csrfToken,
        now,
        session.tokenHash,
        session.csrfToken,
        now,
        session.context.userId,
        session.context.organizationId,
        session.context.role,
        Number(session.context.supervisorCanApprove),
        Number(session.context.supervisorCanReport),
        selected.organization_id,
        selected.role,
        selected.supervisor_can_approve,
        selected.supervisor_can_report,
        env.MODE,
        Number(session.mfa),
        Number(session.verifiedAccount),
        current.is_development,
      ),
      env.DB.prepare(
        "INSERT INTO browser_identity_evidence(token_hash,issuer,subject,verified_email,authenticated_at) SELECT ?,identity_issuer,identity_subject,verified_email,identity_authenticated_at FROM personal_sessions WHERE token_hash=? AND identity_issuer IS NOT NULL AND identity_subject IS NOT NULL AND EXISTS(SELECT 1 FROM browser_sessions WHERE token_hash=?)",
      ).bind(tokenHash, session.tokenHash, tokenHash),
      env.DB.prepare(
        `INSERT INTO personal_sessions(token_hash,user_id,csrf_token,verified_email,mfa,verified_account,authenticated_at,amr_json,acr,strong_authentication,authentication_policy_version,is_development,public_id,created_at,expires_at,identity_issuer,identity_subject,identity_authenticated_at)
        SELECT ?,user_id,?,verified_email,mfa,verified_account,authenticated_at,amr_json,acr,strong_authentication,authentication_policy_version,is_development,?,?,expires_at,identity_issuer,identity_subject,identity_authenticated_at FROM personal_sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM browser_sessions WHERE token_hash=?)`,
      ).bind(
        tokenHash,
        csrfToken,
        `personal_${crypto.randomUUID().replaceAll("-", "")}`,
        now,
        session.tokenHash,
        tokenHash,
      ),
      env.DB.prepare(
        "DELETE FROM browser_sessions WHERE token_hash=? AND EXISTS(SELECT 1 FROM browser_sessions WHERE token_hash=?)",
      ).bind(session.tokenHash, tokenHash),
    ]);
    // D1 also counts the public-session-ID trigger update in meta.changes.
    if (!results[0].meta.changes)
      throw new AuthError(
        "ACCESS_CHANGED",
        "Your permissions or session have changed. Sign in again.",
        403,
      );
    const result = sessionResult(
      {
        ...selected,
        user_email: session.user.email,
        csrf_token: csrfToken,
        mfa: Number(session.mfa),
        verified_account: Number(session.verifiedAccount),
      },
      tokenHash,
      env,
    );
    if (!current.is_development)
      await observeBrowserSession(env, request, result);
    return json(publicSession(result), 200, {
      "Set-Cookie": cookie(env, "session", secret, 3600),
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
        "Available in local simulation only.",
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
      `SELECT c.id,c.client_id,c.organization_id,c.status,c.created_at,c.updated_at,
         NULL AS display_name,NULL AS assistant,
         CASE WHEN c.status='active' AND ?='production' AND org.mode='production' THEN o.last_successful_tool_at ELSE NULL END AS last_successful_tool_at,
         CASE WHEN c.status='active' AND ?='production' AND org.mode='production' AND o.last_successful_tool_at IS NOT NULL THEN 'verified' ELSE 'unverified' END AS verification
       FROM authorized_connections c
       JOIN organizations org ON org.id=c.organization_id
       LEFT JOIN connection_tool_observations o ON o.connection_id=c.id AND o.organization_id=c.organization_id AND o.user_id=c.user_id
       WHERE c.user_id=? AND c.organization_id=? ORDER BY c.created_at DESC,c.id LIMIT 100`,
    )
      .bind(
        env.MODE,
        env.MODE,
        session.context.userId,
        session.context.organizationId,
      )
      .all();
    return json({ items: result.results });
  }
  if (url.pathname === "/api/connections" && request.method === "POST") {
    const session = await authenticateBrowser(request, env, true);
    const body = (await request.json()) as { clientId?: string };
    if (!body.clientId || !/^[A-Za-z0-9_-]{1,200}$/.test(body.clientId))
      throw new AuthError(
        "CLIENT_ID_INVALID",
        "Invalid OAuth identifier.",
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
      throw new AuthError("NOT_FOUND", "Connection not found.", 404);
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
