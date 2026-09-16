import { z } from "zod";
import { DomainError } from "../../../packages/domain/src/index";
import {
  authenticateBrowser,
  type AuthEnv,
  type AuthenticatedSession,
} from "./auth";

const displayName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^\u0000-\u001f\u007f]+$/);
const profileSchema = z
  .object({
    userName: displayName.optional(),
    organizationName: displayName.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const roleSchema = z
  .object({ role: z.enum(["admin", "member", "viewer"]) })
  .strict();
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const now = () => new Date().toISOString();
function fail(code: string, message: string, status = 400): never {
  throw new DomainError(code, message, status);
}

async function body(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    fail("INVALID_INPUT", "Une requête JSON est nécessaire.");
  const reader = request.body?.getReader();
  if (!reader) fail("INVALID_INPUT", "La requête JSON est absente.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        fail("INVALID_INPUT", "La requête est trop volumineuse.", 413);
      }
      parts.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    fail("INVALID_INPUT", "La requête JSON est invalide.");
  }
}
function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    fail("INVALID_INPUT", "Vérifiez les champs du formulaire.");
  return result.data;
}
function admin(session: AuthenticatedSession) {
  if (session.context.role !== "admin")
    fail(
      "FORBIDDEN",
      "Seul un administrateur de cet atelier peut effectuer cette action.",
      403,
    );
}

// Each write rechecks current membership and session inside the same D1 transaction.
// A concurrent demotion or revocation cannot reuse the authority read before the batch.
const authority = (requireAdmin: boolean) => `EXISTS(
  SELECT 1 FROM memberships a JOIN browser_sessions s ON s.organization_id=a.organization_id AND s.user_id=a.user_id
  WHERE a.organization_id=? AND a.user_id=? AND s.token_hash=? AND s.expires_at>?
  AND (a.role!='admin' OR s.mfa=1 OR s.is_development=1) ${requireAdmin ? "AND a.role='admin'" : ""}
)`;
const authorityArgs = (session: AuthenticatedSession, timestamp: string) => [
  session.context.organizationId,
  session.context.userId,
  session.tokenHash,
  timestamp,
];
const marker =
  "EXISTS(SELECT 1 FROM audit_log WHERE organization_id=? AND id=?)";

async function mutate(
  env: AuthEnv,
  session: AuthenticatedSession,
  action: string,
  resourceId: string,
  requireAdmin: boolean,
  details: Record<string, unknown>,
  operations: (auditId: string, timestamp: string) => D1PreparedStatement[],
  targetCondition = "1",
  targetArgs: unknown[] = [],
) {
  const timestamp = now();
  const auditId = `audit_${crypto.randomUUID()}`;
  const audit = env.DB.prepare(
    `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at)
    SELECT ?,?,?,?,?,?,? WHERE ${authority(requireAdmin)} AND ${targetCondition}`,
  ).bind(
    auditId,
    session.context.organizationId,
    session.context.userId,
    action,
    resourceId,
    JSON.stringify(details),
    timestamp,
    ...authorityArgs(session, timestamp),
    ...targetArgs,
  );
  try {
    const results = await env.DB.batch([
      audit,
      ...operations(auditId, timestamp),
    ]);
    if (!results[0].meta.changes)
      fail(
        "ACCESS_CHANGED",
        "Vos droits ou la ressource ont changé. Actualisez la page.",
        409,
      );
  } catch (error) {
    if (String(error).includes("last_admin_required"))
      fail(
        "LAST_ADMIN_REQUIRED",
        "L’atelier doit conserver au moins un administrateur. Nommez-en un autre avant de modifier ce rôle.",
        409,
      );
    throw error;
  }
}

function revokeStatements(
  env: AuthEnv,
  session: AuthenticatedSession,
  userId: string,
  auditId: string,
  timestamp: string,
) {
  const org = session.context.organizationId;
  return [
    env.DB.prepare(
      `DELETE FROM browser_sessions WHERE organization_id=? AND user_id=? AND ${marker}`,
    ).bind(org, userId, org, auditId),
    env.DB.prepare(
      `DELETE FROM development_mcp_tokens WHERE organization_id=? AND user_id=? AND ${marker}`,
    ).bind(org, userId, org, auditId),
    env.DB.prepare(
      `UPDATE authorized_connections SET status='revoked',updated_at=?,not_before=? WHERE organization_id=? AND user_id=? AND status='active' AND ${marker}`,
    ).bind(timestamp, Math.floor(Date.now() / 1000), org, userId, org, auditId),
  ];
}

async function account(env: AuthEnv, session: AuthenticatedSession) {
  const user = await env.DB.prepare("SELECT name FROM users WHERE id=?")
    .bind(session.context.userId)
    .first<{ name: string }>();
  const organization = await env.DB.prepare(
    "SELECT name FROM organizations WHERE id=?",
  )
    .bind(session.context.organizationId)
    .first<{ name: string }>();
  return {
    user: {
      id: session.context.userId,
      name: user!.name,
      role: session.context.role,
    },
    organization: {
      id: session.context.organizationId,
      name: organization!.name,
    },
    simulation: session.simulation,
    mfa: session.mfa,
    permissions: {
      manageOrganization: session.context.role === "admin",
      manageMembers: session.context.role === "admin",
    },
  };
}

/** Mount before generic bearer-authenticated /api routes. Unknown routes fall through. */
export async function handleAccountRoute(
  request: Request,
  env: AuthEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const profile = url.pathname === "/api/account";
  const sessions = url.pathname === "/api/account/sessions";
  const sessionMatch = url.pathname.match(
    /^\/api\/account\/sessions\/(session_[a-f0-9]{32})$/,
  );
  const members = url.pathname === "/api/admin/members";
  const memberMatch = url.pathname.match(
    /^\/api\/admin\/members\/([^/]+)(\/revoke-access)?$/,
  );
  if (!profile && !sessions && !sessionMatch && !members && !memberMatch)
    return null;
  if (request.headers.has("Authorization"))
    fail(
      "BROWSER_REQUIRED",
      "Ouvrez Guteneo dans votre navigateur pour gérer votre compte.",
      403,
    );
  const session = await authenticateBrowser(
    request,
    env,
    !["GET", "HEAD", "OPTIONS"].includes(request.method),
  );
  const rate = await env.DB.prepare(
    "INSERT INTO http_limits(organization_id,window_start,count) VALUES(?,?,1) ON CONFLICT(organization_id,window_start) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(session.context.organizationId, Math.floor(Date.now() / 60000))
    .first<{ count: number }>();
  if ((rate?.count ?? 0) > 180)
    return Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Trop de requêtes. Réessayez dans une minute.",
        },
      },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      },
    );
  const org = session.context.organizationId;
  const userId = session.context.userId;
  if (profile && request.method === "GET")
    return json(await account(env, session));
  if (profile && request.method === "PATCH") {
    const input = parse(profileSchema, await body(request));
    if (input.organizationName !== undefined) admin(session);
    await mutate(
      env,
      session,
      "account.updated",
      userId,
      input.organizationName !== undefined,
      { fields: Object.keys(input) },
      (auditId) => {
        const statements: D1PreparedStatement[] = [];
        if (input.userName !== undefined)
          statements.push(
            env.DB.prepare(
              `UPDATE users SET name=? WHERE id=? AND ${marker}`,
            ).bind(input.userName, userId, org, auditId),
          );
        if (input.organizationName !== undefined)
          statements.push(
            env.DB.prepare(
              `UPDATE organizations SET name=? WHERE id=? AND ${marker}`,
            ).bind(input.organizationName, org, org, auditId),
          );
        return statements;
      },
    );
    return json(await account(env, session));
  }
  if (sessions && request.method === "GET") {
    const result = await env.DB.prepare(
      `SELECT public_id id,created_at createdAt,expires_at expiresAt,mfa,is_development development,(token_hash=?) current
      FROM browser_sessions WHERE organization_id=? AND user_id=? AND expires_at>? ORDER BY created_at DESC,public_id LIMIT 101`,
    )
      .bind(session.tokenHash, org, userId, now())
      .all();
    return json({
      items: result.results.slice(0, 100),
      hasMore: result.results.length > 100,
    });
  }
  if (sessionMatch && request.method === "DELETE") {
    const current = await env.DB.prepare(
      "SELECT (token_hash=?) current FROM browser_sessions WHERE organization_id=? AND user_id=? AND public_id=?",
    )
      .bind(session.tokenHash, org, userId, sessionMatch[1])
      .first<{ current: number }>();
    if (!current) fail("NOT_FOUND", "Session introuvable.", 404);
    await mutate(
      env,
      session,
      "account.session_revoked",
      sessionMatch[1],
      false,
      {},
      (auditId) => [
        env.DB.prepare(
          `DELETE FROM browser_sessions WHERE organization_id=? AND user_id=? AND public_id=? AND ${marker}`,
        ).bind(org, userId, sessionMatch[1], org, auditId),
      ],
    );
    return json({ revoked: true, currentSession: Boolean(current.current) });
  }
  if (members || memberMatch) admin(session);
  if (members && request.method === "GET") {
    const query = parse(
      z
        .object({
          cursor: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(30),
        })
        .strict(),
      Object.fromEntries(url.searchParams),
    );
    const result = await env.DB.prepare(
      `SELECT m.user_id id,u.name,m.role,m.created_at joinedAt,
      (SELECT COUNT(*) FROM browser_sessions s WHERE s.organization_id=m.organization_id AND s.user_id=m.user_id AND s.expires_at>?) sessions,
      (SELECT COUNT(*) FROM authorized_connections c WHERE c.organization_id=m.organization_id AND c.user_id=m.user_id AND c.status='active') connections
      FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id>? ORDER BY m.user_id LIMIT ?`,
    )
      .bind(now(), org, query.cursor ?? "", query.limit + 1)
      .all<{ id: string }>();
    const items = result.results.slice(0, query.limit);
    return json({
      items,
      nextCursor: result.results.length > query.limit ? items.at(-1)!.id : null,
    });
  }
  if (
    memberMatch &&
    ((request.method === "PATCH" && !memberMatch[2]) ||
      (request.method === "POST" && memberMatch[2]))
  ) {
    const targetId = parse(
      z.string().min(1).max(200),
      decodeURIComponent(memberMatch[1]),
    );
    const target = await env.DB.prepare(
      "SELECT role FROM memberships WHERE organization_id=? AND user_id=?",
    )
      .bind(org, targetId)
      .first<{ role: string }>();
    if (!target) fail("NOT_FOUND", "Membre introuvable dans cet atelier.", 404);
    const input = memberMatch[2]
      ? parse(z.object({}).strict(), await body(request))
      : parse(roleSchema, await body(request));
    const role = "role" in input ? input.role : undefined;
    if (role === target.role)
      return json({
        updated: false,
        sessionsRevoked: false,
        self: targetId === userId,
      });
    await mutate(
      env,
      session,
      role ? "member.role_changed" : "member.access_revoked",
      targetId,
      true,
      role ? { role } : {},
      (auditId, timestamp) => [
        ...(role
          ? [
              env.DB.prepare(
                `UPDATE memberships SET role=? WHERE organization_id=? AND user_id=? AND ${marker}`,
              ).bind(role, org, targetId, org, auditId),
            ]
          : []),
        ...revokeStatements(env, session, targetId, auditId, timestamp),
      ],
      "EXISTS(SELECT 1 FROM memberships WHERE organization_id=? AND user_id=?)",
      [org, targetId],
    );
    return json({
      updated: Boolean(role),
      sessionsRevoked: true,
      self: targetId === userId,
    });
  }
  return json(
    {
      error: { code: "METHOD_NOT_ALLOWED", message: "Méthode non autorisée." },
    },
    405,
  );
}
