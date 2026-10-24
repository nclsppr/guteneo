import { z } from "zod";
import { supportedLocales } from "../../../packages/contracts/src/locale";
import { dashboardAppearances } from "../../../packages/contracts/src/dashboard-appearance";
import { documentAccessMode } from "../../../packages/contracts/src/document-authentication";
import {
  AuthError,
  authenticatePersonalBrowser,
  createPersonalBrowserSession,
  enterWorkspaceFromPersonal,
  isLocalSimulation,
  memberships,
  publicSession,
  requireSameOrigin,
  requirePersonalDocumentAuthentication,
  type AuthEnv,
  type PersonalPrincipal,
} from "./auth";

export {
  authenticatePersonalBrowser,
  requirePersonalStrongAuthentication,
  requirePersonalDocumentAuthentication,
  type PersonalPrincipal,
} from "./auth";

const now = () => new Date().toISOString();
const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
async function input<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new AuthError("INVALID_INPUT", "Invalid request.", 400);
  const reader = request.body?.getReader();
  let text = "";
  if (!reader) throw new AuthError("INVALID_INPUT", "Invalid request.", 400);
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      if (text.length > 2048) {
        await reader.cancel();
        throw new AuthError("INVALID_INPUT", "The request is too long.", 413);
      }
    }
  } finally {
    reader.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AuthError("INVALID_INPUT", "Invalid request.", 400);
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AuthError("INVALID_INPUT", "Check the account information.", 400);
  return result.data;
}

export async function publicPersonalSession(
  env: AuthEnv,
  principal: PersonalPrincipal,
) {
  const available = await memberships(env, principal.userId);
  const current = await env.DB.prepare(
    "SELECT organization_id FROM browser_sessions WHERE token_hash=? AND user_id=? AND expires_at>?",
  )
    .bind(principal.tokenHash, principal.userId, now())
    .first<{ organization_id: string }>();
  const accessMode = documentAccessMode(env.SENSITIVE_DOCUMENT_AUTHENTICATION);
  const policy = await env.DB.prepare(
    "SELECT mode FROM secure_document_authentication_policy WHERE id=1",
  ).first<{ mode: string }>();
  let documentAccessAllowed = false;
  try {
    requirePersonalDocumentAuthentication(principal, env);
    documentAccessAllowed = policy?.mode === accessMode;
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return {
    user: {
      id: principal.userId,
      name: principal.name,
      email: principal.email,
      preferredLocale: principal.preferredLocale,
      preferredDashboardAppearance: principal.preferredDashboardAppearance,
    },
    csrfToken: principal.csrfToken,
    simulation: principal.simulation,
    mfa: principal.mfa,
    verifiedAccount: principal.verifiedAccount,
    authenticatedAt: principal.authenticatedAt,
    strongAuthentication: principal.strongAuthentication,
    documentAccessMode: accessMode,
    documentAccessAllowed,
    authenticationPolicyVersion: principal.authenticationPolicyVersion,
    amr: principal.amr,
    acr: principal.acr,
    workspaces: available.map((member) => ({
      id: member.organization_id,
      name: member.organization_name,
      role: member.role,
      current: member.organization_id === current?.organization_id,
    })),
  };
}

/** Browser account routes are deliberately outside the workshop/bearer guard. */
export async function handlePersonalAccountRoute(
  request: Request,
  env: AuthEnv,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/api/dev/personal-login" && request.method === "POST") {
    if (!isLocalSimulation(request, env))
      throw new AuthError(
        "DEVELOPMENT_AUTH_FORBIDDEN",
        "Available in local simulation only.",
        403,
      );
    requireSameOrigin(request, env);
    if (request.headers.has("Authorization"))
      throw new AuthError(
        "BROWSER_REQUIRED",
        "Open Guteneo in your browser.",
        403,
      );
    const body = await input(
      request,
      z
        .object({
          identity: z.enum(["recipient", "other-recipient"]),
          assurance: z.enum(["strong", "weak"]).default("strong"),
        })
        .strict(),
    );
    const userId =
      body.identity === "recipient" ? "user_recipient" : "user_other_recipient";
    const email = `${body.identity}@example.test`;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users(id,name,email,created_at) VALUES(?,?,?,?)",
    )
      .bind(
        userId,
        body.identity === "recipient"
          ? "Simulation recipient"
          : "Another simulation recipient",
        email,
        now(),
      )
      .run();
    const created = await createPersonalBrowserSession(env, {
      userId,
      verifiedEmail: email,
      mfa: body.assurance === "strong",
      verifiedAccount: true,
      authenticatedAt: Math.floor(Date.now() / 1000),
      amr: body.assurance === "strong" ? ["webauthn"] : ["pwd"],
      acr: null,
      strongAuthentication: body.assurance === "strong",
      authenticationPolicyVersion:
        body.assurance === "strong" ? "guteneo-sensitive-v1" : null,
      development: true,
    });
    const principal = await authenticatePersonalBrowser(
      new Request(request.url, {
        headers: { Cookie: created.cookie.split(";")[0] },
      }),
      env,
    );
    return json(await publicPersonalSession(env, principal), 200, {
      "Set-Cookie": created.cookie,
    });
  }
  if (!path.startsWith("/api/personal/")) return null;
  const known = [
    "/api/personal/session",
    "/api/personal/account",
    "/api/personal/logout",
    "/api/personal/workspace",
    "/api/personal/workspace/select",
    "/api/personal/account/sessions",
  ];
  const revoke = path.match(
    /^\/api\/personal\/account\/sessions\/(personal_[a-f0-9]{32})\/revoke$/,
  );
  if (!known.includes(path) && !revoke) return null;
  const principal = await authenticatePersonalBrowser(
    request,
    env,
    !["GET", "HEAD", "OPTIONS"].includes(request.method),
  );
  const rate = await env.DB.prepare(
    `INSERT INTO personal_http_limits(user_id,window_start,count) VALUES(?,?,1)
     ON CONFLICT(user_id) DO UPDATE SET window_start=excluded.window_start,count=CASE WHEN window_start=excluded.window_start THEN count+1 ELSE 1 END RETURNING count`,
  )
    .bind(principal.userId, Math.floor(Date.now() / 60000))
    .first<{ count: number }>();
  if (!rate || rate.count > 180)
    return json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again in a minute.",
        },
      },
      429,
      { "Retry-After": "60" },
    );
  if (path === "/api/personal/session" && request.method === "GET")
    return json(await publicPersonalSession(env, principal));
  if (path === "/api/personal/account" && request.method === "GET")
    return json(await publicPersonalSession(env, principal));
  if (path === "/api/personal/account" && request.method === "PATCH") {
    const body = await input(
      request,
      z
        .object({
          name: z.string().trim().min(1).max(200).optional(),
          preferredLocale: z.enum(supportedLocales).nullable().optional(),
          preferredDashboardAppearance: z.enum(dashboardAppearances).optional(),
        })
        .strict()
        .refine((value) => Object.keys(value).length > 0),
    );
    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of [
      ["name", "name"],
      ["preferredLocale", "preferred_locale"],
      ["preferredDashboardAppearance", "preferred_dashboard_appearance"],
    ] as const) {
      if (body[key] !== undefined) {
        assignments.push(`${column}=?`);
        values.push(body[key]);
      }
    }
    await env.DB.prepare(
      `UPDATE users SET ${assignments.join(",")} WHERE id=? AND EXISTS(SELECT 1 FROM personal_sessions WHERE token_hash=? AND user_id=users.id AND csrf_token=? AND expires_at>?)`,
    )
      .bind(
        ...values,
        principal.userId,
        principal.tokenHash,
        principal.csrfToken,
        now(),
      )
      .run();
    return json(
      await publicPersonalSession(
        env,
        await authenticatePersonalBrowser(request, env),
      ),
    );
  }
  if (path === "/api/personal/logout" && request.method === "POST") {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM browser_sessions WHERE token_hash=? AND user_id=?",
      ).bind(principal.tokenHash, principal.userId),
      env.DB.prepare(
        "DELETE FROM personal_sessions WHERE token_hash=? AND user_id=?",
      ).bind(principal.tokenHash, principal.userId),
    ]);
    return json({ signedOut: true }, 200, {
      "Set-Cookie": `${env.ENVIRONMENT === "local" ? "" : "__Host-"}guteneo_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.ENVIRONMENT === "local" ? "" : "; Secure"}`,
    });
  }
  if (path === "/api/personal/account/sessions" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT public_id id,created_at createdAt,expires_at expiresAt,mfa,authenticated_at authenticatedAt,strong_authentication strongAuthentication,is_development simulation,(token_hash=?) current FROM personal_sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC,public_id LIMIT 101",
    )
      .bind(principal.tokenHash, principal.userId, now())
      .all();
    return json({
      items: rows.results.slice(0, 100),
      hasMore: rows.results.length > 100,
    });
  }
  if (revoke && request.method === "POST") {
    const row = await env.DB.prepare(
      "SELECT token_hash FROM personal_sessions WHERE user_id=? AND public_id=?",
    )
      .bind(principal.userId, revoke[1])
      .first<{ token_hash: string }>();
    if (!row) throw new AuthError("NOT_FOUND", "Session not found.", 404);
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM browser_sessions WHERE token_hash=? AND user_id=? AND EXISTS(SELECT 1 FROM personal_sessions WHERE token_hash=? AND csrf_token=? AND expires_at>?)",
      ).bind(
        row.token_hash,
        principal.userId,
        principal.tokenHash,
        principal.csrfToken,
        now(),
      ),
      env.DB.prepare(
        "DELETE FROM personal_sessions WHERE token_hash=? AND user_id=? AND (token_hash=? OR EXISTS(SELECT 1 FROM personal_sessions WHERE token_hash=? AND csrf_token=? AND expires_at>?))",
      ).bind(
        row.token_hash,
        principal.userId,
        principal.tokenHash,
        principal.tokenHash,
        principal.csrfToken,
        now(),
      ),
    ]);
    return json({
      revoked: true,
      currentSession: row.token_hash === principal.tokenHash,
    });
  }
  if (path === "/api/personal/workspace" && request.method === "POST") {
    const body = await input(
      request,
      z.object({ name: z.string().trim().min(1).max(100) }).strict(),
    );
    if (!principal.development && !principal.verifiedEmail)
      throw new AuthError(
        "EMAIL_VERIFICATION_REQUIRED",
        "Verify your email address.",
        403,
      );
    let existing = await env.DB.prepare(
      "SELECT organization_id FROM personal_workspace_creations WHERE user_id=?",
    )
      .bind(principal.userId)
      .first<{ organization_id: string }>();
    if (!existing) {
      const organizationId = `org_${crypto.randomUUID()}`;
      const timestamp = now();
      try {
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO organizations(id,name,mode,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_sessions WHERE token_hash=? AND user_id=? AND csrf_token=? AND expires_at>?)",
          ).bind(
            organizationId,
            body.name,
            env.MODE,
            timestamp,
            principal.tokenHash,
            principal.userId,
            principal.csrfToken,
            timestamp,
          ),
          env.DB.prepare(
            "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
          ).bind(organizationId, principal.userId, timestamp),
          env.DB.prepare(
            "INSERT INTO content_limits(organization_id,uploads_per_day,bytes_per_day,renders_per_day) VALUES(?,10,20971520,3)",
          ).bind(organizationId),
          ...["fax", "email", "postal"].flatMap((channel) => [
            env.DB.prepare(
              "INSERT INTO usage(organization_id,channel,period,limit_count,limit_minor,currency) VALUES(?,?,?,10000,5000,'EUR')",
            ).bind(organizationId, channel, timestamp.slice(0, 7)),
            env.DB.prepare(
              "INSERT INTO channel_controls(organization_id,channel,enabled) VALUES(?,?,0)",
            ).bind(organizationId, channel),
          ]),
          env.DB.prepare(
            "INSERT INTO personal_workspace_creations(user_id,organization_id,created_at) VALUES(?,?,?)",
          ).bind(principal.userId, organizationId, timestamp),
        ]);
        existing = { organization_id: organizationId };
      } catch (error) {
        existing = await env.DB.prepare(
          "SELECT organization_id FROM personal_workspace_creations WHERE user_id=?",
        )
          .bind(principal.userId)
          .first<{ organization_id: string }>();
        if (!existing) throw error;
      }
    }
    const entered = await enterWorkspaceFromPersonal(
      env,
      principal,
      existing.organization_id,
    );
    return json(
      {
        organization: entered.session.organization,
        session: publicSession(entered.session),
      },
      200,
      { "Set-Cookie": entered.cookie },
    );
  }
  if (path === "/api/personal/workspace/select" && request.method === "POST") {
    const body = await input(
      request,
      z.object({ organizationId: z.string().min(1).max(200) }).strict(),
    );
    const entered = await enterWorkspaceFromPersonal(
      env,
      principal,
      body.organizationId,
    );
    return json(
      {
        organization: entered.session.organization,
        session: publicSession(entered.session),
      },
      200,
      { "Set-Cookie": entered.cookie },
    );
  }
  return json(
    {
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
    },
    405,
    { Allow: path.endsWith("session") ? "GET" : "GET, POST, PATCH" },
  );
}
