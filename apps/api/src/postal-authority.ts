import { decodeJwt } from "jose";
import type { ActorContext } from "../../../packages/domain/src/index";
import {
  AuthError,
  authenticateBrowser,
  authenticateMcp,
  authenticationPolicy,
  auth0Issuer,
  hasMfa,
  hasVerifiedAccount,
  hashSecret,
  isLocalSimulation,
  requireScope,
  type AuthEnv,
  type McpIdentity,
} from "./auth";

type SqlValue = string | number | null;
export interface PostalAuthority {
  readonly context: ActorContext;
  readonly expert?: { connectionId: string; policyRevision: number };
  assertCurrent(): Promise<void>;
  sql(): { condition: string; values: SqlValue[] };
}

function changed(): never {
  throw new AuthError(
    "POSTAL_AUTHORITY_CHANGED",
    "Votre session ou vos droits ont changé. Reprenez depuis votre espace.",
    403,
  );
}
function contextFor(
  context: ActorContext,
  actor: "browser" | "mcp",
  write: boolean,
) {
  if (
    context.actor !== actor ||
    !(write ? ["admin", "member"] : ["admin", "member", "viewer"]).includes(
      context.role,
    )
  )
    throw new AuthError(
      "FORBIDDEN",
      "Un membre autorisé doit effectuer cette opération.",
      403,
    );
  return Object.freeze({ ...context });
}
function sameContext(a: ActorContext, b: ActorContext) {
  return (
    a.organizationId === b.organizationId &&
    a.userId === b.userId &&
    a.role === b.role &&
    a.actor === b.actor
  );
}
async function assertFence(env: AuthEnv, authority: PostalAuthority) {
  const { condition, values } = authority.sql();
  if (
    !(await env.DB.prepare(`SELECT 1 AS allowed WHERE ${condition}`)
      .bind(...values)
      .first())
  )
    changed();
}

/** Request credentials stay in this invocation's closure, never in a row or response. */
export async function postalBrowserAuthority(
  request: Request,
  env: AuthEnv,
  mutating = true,
): Promise<PostalAuthority> {
  if (request.headers.has("Authorization"))
    throw new AuthError(
      "BROWSER_REQUIRED",
      "Ouvrez Guteneo dans votre navigateur pour confirmer cette opération.",
      403,
    );
  const authenticatedRequest = new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
  });
  const session = await authenticateBrowser(
    authenticatedRequest,
    env,
    mutating,
  );
  const context = contextFor(session.context, "browser", mutating);
  const authority: PostalAuthority = {
    context,
    async assertCurrent() {
      const current = await authenticateBrowser(
        authenticatedRequest,
        env,
        mutating,
      );
      if (
        !sameContext(current.context, context) ||
        current.tokenHash !== session.tokenHash
      )
        changed();
      await assertFence(env, authority);
    },
    sql() {
      const policy = authenticationPolicy(env);
      return {
        condition: `EXISTS(
          SELECT 1 FROM browser_sessions postal_session
          JOIN memberships postal_member ON postal_member.organization_id=postal_session.organization_id AND postal_member.user_id=postal_session.user_id
          JOIN organizations postal_org ON postal_org.id=postal_member.organization_id
          WHERE postal_session.token_hash=? AND postal_member.organization_id=? AND postal_member.user_id=?
          AND postal_member.role=? AND postal_member.role IN (${mutating ? "'admin','member'" : "'admin','member','viewer'"}) AND postal_org.mode=?
          AND postal_session.expires_at>? AND (postal_session.is_development=0 OR ?=1)
          AND (postal_session.is_development=1 OR ${policy === "verified_email" ? "postal_session.verified_account=1" : "postal_member.role<>'admin' OR postal_session.mfa=1"})
        )`,
        values: [
          session.tokenHash,
          context.organizationId,
          context.userId,
          context.role,
          env.MODE,
          new Date().toISOString(),
          Number(isLocalSimulation(authenticatedRequest, env)),
        ],
      };
    },
  };
  await assertFence(env, authority);
  return Object.freeze(authority);
}

/** identity must originate in authenticateMcp, never in client JSON or ActorContext.
 * decodeJwt reads claims already signature-verified by that authentication.
 * assertCurrent also reauthenticates before a caller resumes an awaited operation. */
export async function postalMcpAuthority(
  identity: McpIdentity,
  env: AuthEnv,
  scope: string,
): Promise<PostalAuthority> {
  requireScope(identity, scope);
  const mutating = scope !== "documents:read";
  const context = contextFor(identity.context, "mcp", mutating);
  const token = identity.token;
  const clientId = identity.clientId;
  const scopes = [...identity.scopes].sort();
  const authenticatedRequest = () =>
    new Request(new URL("/mcp", env.APP_ORIGIN), {
      headers: { Authorization: `Bearer ${token}` },
    });
  let sql: PostalAuthority["sql"];
  if (token.startsWith("gtn_dev_")) {
    if (!isLocalSimulation(authenticatedRequest(), env))
      throw new AuthError(
        "DEVELOPMENT_AUTH_FORBIDDEN",
        "Authentification de développement interdite.",
        403,
      );
    const tokenHash = await hashSecret(token);
    sql = () => ({
      condition: `EXISTS(
        SELECT 1 FROM development_mcp_tokens postal_token
        JOIN memberships postal_member ON postal_member.organization_id=postal_token.organization_id AND postal_member.user_id=postal_token.user_id
        JOIN organizations postal_org ON postal_org.id=postal_member.organization_id
        WHERE postal_token.token_hash=? AND postal_member.organization_id=? AND postal_member.user_id=?
        AND postal_member.role=? AND postal_member.role IN (${mutating ? "'admin','member'" : "'admin','member','viewer'"})
        AND postal_org.mode='simulation' AND postal_token.expires_at>? AND ?=1
      )`,
      values: [
        tokenHash,
        context.organizationId,
        context.userId,
        context.role,
        new Date().toISOString(),
        Number(isLocalSimulation(authenticatedRequest(), env)),
      ],
    });
  } else {
    const issuer = auth0Issuer(env);
    const payload = decodeJwt(token);
    const issuedAt = payload.iat;
    const expiresAt = payload.exp;
    const subject = payload.sub;
    const tokenClient =
      typeof payload.client_id === "string" ? payload.client_id : payload.azp;
    if (
      payload.iss !== issuer ||
      tokenClient !== clientId ||
      typeof subject !== "string" ||
      !subject ||
      !Number.isSafeInteger(issuedAt) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt !== identity.expiresAt ||
      typeof payload.scope !== "string" ||
      !payload.scope.split(" ").includes(scope)
    )
      changed();
    const connection = await env.DB.prepare(
      "SELECT id,not_before,updated_at FROM authorized_connections WHERE issuer=? AND user_id=? AND client_id=? AND organization_id=? AND status='active'",
    )
      .bind(issuer, context.userId, clientId, context.organizationId)
      .first<{ id: string; not_before: number; updated_at: string }>();
    if (!connection) changed();
    sql = () => ({
      condition: `EXISTS(
        SELECT 1 FROM authorized_connections postal_connection
        JOIN memberships postal_member ON postal_member.organization_id=postal_connection.organization_id AND postal_member.user_id=postal_connection.user_id
        JOIN organizations postal_org ON postal_org.id=postal_member.organization_id
        JOIN auth_identities postal_identity ON postal_identity.issuer=postal_connection.issuer AND postal_identity.user_id=postal_member.user_id AND postal_identity.subject=?
        WHERE postal_connection.id=? AND postal_connection.issuer=? AND postal_connection.client_id=?
        AND postal_member.organization_id=? AND postal_member.user_id=? AND postal_member.role=? AND postal_member.role IN (${mutating ? "'admin','member'" : "'admin','member','viewer'"})
        AND postal_org.mode=? AND postal_connection.status='active'
        AND postal_connection.not_before=? AND postal_connection.updated_at=? AND postal_connection.not_before<=?
        AND ?>? AND ${authenticationPolicy(env) === "verified_email" ? "?=1" : "(postal_member.role<>'admin' OR ?=1)"}
      )`,
      values: [
        subject,
        connection.id,
        issuer,
        clientId,
        context.organizationId,
        context.userId,
        context.role,
        env.MODE,
        connection.not_before,
        connection.updated_at,
        issuedAt!,
        expiresAt!,
        Math.floor(Date.now() / 1000),
        Number(
          authenticationPolicy(env) === "verified_email"
            ? hasVerifiedAccount(payload)
            : hasMfa(payload),
        ),
      ],
    });
  }
  const authority: PostalAuthority = {
    context,
    sql,
    async assertCurrent() {
      const current = await authenticateMcp(authenticatedRequest(), env);
      requireScope(current, scope);
      if (
        !sameContext(current.context, context) ||
        current.clientId !== clientId ||
        JSON.stringify([...current.scopes].sort()) !== JSON.stringify(scopes)
      )
        changed();
      await assertFence(env, authority);
    },
  };
  await authority.assertCurrent();
  return Object.freeze(authority);
}
