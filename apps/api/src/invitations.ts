import { z } from "zod";
import {
  invitationEmail,
  workspaceInvitationInput,
  type WorkspaceInvitation,
  type InvitationDeliveryStatus,
} from "../../../packages/contracts/src/invitations";
import { DomainError } from "../../../packages/domain/src/index";
import {
  authenticateBrowser,
  authenticationPolicy,
  hashSecret,
  isLocalSimulation,
  type AuthEnv,
  type AuthenticatedSession,
} from "./auth";
import type { Env } from "./env";
import { resendIdentity } from "./resend-environment";

type InvitationEnv = AuthEnv &
  Partial<
    Pick<
      Env,
      | "INVITATION_EMAILS_ENABLED"
      | "INVITATION_EMAIL_FROM"
      | "RESEND_API_KEY"
      | "RESEND_ACCOUNT_ID"
      | "RESEND_DOMAIN_ID"
      | "RESEND_VERIFIED_DOMAIN"
    >
  >;
interface Row {
  id: string;
  organization_id: string;
  email: string;
  token_hash: string;
  role: WorkspaceInvitation["role"];
  supervisor_can_approve: number;
  supervisor_can_report: number;
  status: WorkspaceInvitation["status"];
  delivery_status: InvitationDeliveryStatus;
  created_at: string;
  expires_at: string;
  organization_name?: string;
}
const timestamp = () => new Date().toISOString();
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
function fail(code: string, message: string, status = 400): never {
  throw new DomainError(code, message, status);
}
function invalid(error: unknown): never {
  const text = String(error);
  if (text.includes("invitation_existing_member"))
    fail(
      "INVITATION_EXISTING_MEMBER",
      "Une des adresses appartient déjà à un membre de cet atelier.",
      409,
    );
  if (text.includes("invitation_daily_limit"))
    fail(
      "INVITATION_DAILY_LIMIT",
      "La limite de 500 invitations par jour est atteinte.",
      429,
    );
  if (
    text.includes(
      "workspace_invitations.organization_id, workspace_invitations.email",
    )
  )
    fail(
      "INVITATION_PENDING",
      "Une invitation est déjà en attente pour une des adresses.",
      409,
    );
  if (text.includes("invitation_admin_required"))
    fail("FORBIDDEN", "Vos droits d’administration ont changé.", 403);
  if (
    text.includes("invitation_unavailable") ||
    text.includes("workspace_invitation_acceptances.invitation_id")
  )
    fail(
      "INVITATION_UNAVAILABLE",
      "Cette invitation a expiré, a été révoquée ou a déjà été utilisée.",
      409,
    );
  throw error;
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
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 40_000) {
        await reader.cancel();
        fail("INVALID_INPUT", "La requête est trop volumineuse.", 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail("INVALID_INPUT", "La requête JSON est invalide.");
  }
}
function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    fail(
      "INVALID_INPUT",
      "Vérifiez les adresses, le rôle et les droits de toutes les invitations.",
    );
  return result.data;
}
function publicRow(row: Row): WorkspaceInvitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    supervisorCanApprove: row.supervisor_can_approve === 1,
    supervisorCanReport: row.supervisor_can_report === 1,
    status:
      row.status === "pending" && row.expires_at <= timestamp()
        ? "expired"
        : row.status,
    deliveryStatus: row.delivery_status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
function fence(env: AuthEnv, session: AuthenticatedSession) {
  return {
    condition: `EXISTS(SELECT 1 FROM memberships m JOIN browser_sessions s ON s.organization_id=m.organization_id AND s.user_id=m.user_id JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=? AND m.role='admin' AND s.token_hash=? AND s.csrf_token=? AND s.expires_at>? AND o.mode=? AND (s.is_development=1 OR ${authenticationPolicy(env) === "verified_email" ? "s.verified_account=1" : "s.mfa=1"}))`,
    values: [
      session.context.organizationId,
      session.context.userId,
      session.tokenHash,
      session.csrfToken,
      timestamp(),
      env.MODE,
    ],
  };
}
function randomToken() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
async function inviteForHash(
  env: Pick<AuthEnv, "DB" | "MODE">,
  tokenHash: string,
): Promise<Row> {
  if (!/^[a-f0-9]{64}$/.test(tokenHash))
    fail("INVITATION_UNAVAILABLE", "Invitation indisponible.", 404);
  const row = await env.DB.prepare(
    "SELECT i.*,o.name organization_name FROM workspace_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.token_hash=? AND o.mode=?",
  )
    .bind(tokenHash, env.MODE)
    .first<Row>();
  if (!row) fail("INVITATION_UNAVAILABLE", "Invitation indisponible.", 404);
  return row;
}
export async function getInvitationPreview(
  env: Pick<AuthEnv, "DB" | "MODE">,
  rawToken: string,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken))
    fail("INVITATION_UNAVAILABLE", "Invitation indisponible.", 404);
  const row = await inviteForHash(env, await hashSecret(rawToken));
  const [local, domain] = row.email.split("@");
  const item = publicRow(row);
  return {
    organization: { name: row.organization_name! },
    role: item.role,
    supervisorCanApprove: item.supervisorCanApprove,
    supervisorCanReport: item.supervisorCanReport,
    maskedEmail: `${local.slice(0, 1)}***@${domain}`,
    status: item.status,
    expiresAt: item.expiresAt,
  };
}
/** Called only after Auth0 verifies the identity and email claims. The token hash
 * belongs to that exact PKCE transaction; it never comes from callback query input. */
export async function acceptWorkspaceInvitation(
  env: Pick<AuthEnv, "DB" | "MODE">,
  tokenHash: string,
  verifiedEmail: string,
  userId: string,
  prerequisiteStatements: D1PreparedStatement[] = [],
): Promise<{ organizationId: string }> {
  const email = invitationEmail.safeParse(verifiedEmail);
  if (!email.success)
    fail(
      "INVITATION_EMAIL_MISMATCH",
      "Connectez-vous avec l’adresse vérifiée destinataire de l’invitation.",
      403,
    );
  const invitation = await inviteForHash(env, tokenHash);
  if (invitation.email !== email.data)
    fail(
      "INVITATION_EMAIL_MISMATCH",
      "Connectez-vous avec l’adresse vérifiée destinataire de l’invitation.",
      403,
    );
  if (invitation.status !== "pending" || invitation.expires_at <= timestamp())
    fail(
      "INVITATION_UNAVAILABLE",
      "Cette invitation a expiré, a été révoquée ou a déjà été utilisée.",
      409,
    );
  try {
    await env.DB.batch([
      ...prerequisiteStatements,
      env.DB.prepare(
        "INSERT INTO workspace_invitation_acceptances(invitation_id,organization_id,user_id,verified_email,created_at) VALUES(?,?,?,?,?)",
      ).bind(
        invitation.id,
        invitation.organization_id,
        userId,
        email.data,
        timestamp(),
      ),
    ]);
  } catch (error) {
    invalid(error);
  }
  return { organizationId: invitation.organization_id };
}
function deliveryReady(env: InvitationEnv) {
  return (
    env.MODE === "production" &&
    env.INVITATION_EMAILS_ENABLED === "true" &&
    Boolean(env.RESEND_API_KEY) &&
    Boolean(resendIdentity(env as Env)) &&
    /^[^<>\s@]+@guteneo\.com$/i.test(env.INVITATION_EMAIL_FROM ?? "")
  );
}
const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function mail(
  env: InvitationEnv,
  organization: string,
  email: string,
  url: string,
  locale: string | null | undefined,
) {
  const texts: Record<string, [string, string, string, string]> = {
    fr: [
      "Invitation à rejoindre un atelier",
      "Vous êtes invité à rejoindre",
      "Accepter l’invitation",
      "Ce lien expire dans 7 jours. Connectez-vous avec cette adresse e-mail vérifiée. Si vous n’attendiez pas cette invitation, ignorez ce message.",
    ],
    en: [
      "Invitation to join a workspace",
      "You are invited to join",
      "Accept invitation",
      "This link expires in 7 days. Sign in with this verified email address. If you were not expecting this invitation, ignore this message.",
    ],
    de: [
      "Einladung zu einem Arbeitsbereich",
      "Sie wurden eingeladen zu",
      "Einladung annehmen",
      "Dieser Link läuft in 7 Tagen ab. Melden Sie sich mit dieser bestätigten E-Mail-Adresse an. Wenn Sie diese Einladung nicht erwartet haben, ignorieren Sie diese Nachricht.",
    ],
    lb: [
      "Invitatioun fir en Atelier",
      "Dir sidd invitéiert bei",
      "Invitatioun unhuelen",
      "Dëse Link leeft a 7 Deeg of. Mellt Iech mat dëser verifizéierter E-Mail-Adress un. Wann Dir dës Invitatioun net erwaart hutt, ignoréiert dëse Message.",
    ],
  };
  const [subject, lead, action, note] = texts[locale ?? "fr"] ?? texts.fr;
  return {
    from: env.INVITATION_EMAIL_FROM!,
    to: [email],
    subject: `guteneo · ${subject}`,
    text: `${lead} ${organization}.\n\n${action} : ${url}\n\n${note}`,
    html: `<p>${escape(lead)} <strong>${escape(organization)}</strong>.</p><p><a href="${escape(url)}">${escape(action)}</a></p><p>${escape(note)}</p>`,
  };
}
async function deliver(
  env: InvitationEnv,
  request: Request,
  session: AuthenticatedSession,
  rows: { row: Row; url: string }[],
  batchId: string,
) {
  // Claim before the external request. A crash or uncertain provider response is
  // never auto-retried, and no bearer token is persisted to enable such a retry.
  const current = await authenticateBrowser(request, env, true);
  if (
    current.context.role !== "admin" ||
    current.tokenHash !== session.tokenHash
  )
    fail("FORBIDDEN", "Vos droits ont changé.", 403);
  const authority = fence(env, current);
  const ids = JSON.stringify(rows.map(({ row }) => row.id));
  const claim = await env.DB.prepare(
    `UPDATE workspace_invitations SET delivery_status='unknown',delivery_attempted_at=? WHERE organization_id=? AND id IN (SELECT value FROM json_each(?)) AND status='pending' AND delivery_status='pending' AND expires_at>? AND ${authority.condition}`,
  )
    .bind(
      timestamp(),
      session.context.organizationId,
      ids,
      timestamp(),
      ...authority.values,
    )
    .run();
  if (claim.meta.changes !== rows.length) return;
  let state: InvitationDeliveryStatus = "unknown";
  let providerIds: string[] = [];
  try {
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `guteneo/invitations/${batchId}`,
      },
      body: JSON.stringify(
        rows.map(({ row, url }) =>
          mail(
            env,
            session.organization.name,
            row.email,
            url,
            session.user.preferredLocale,
          ),
        ),
      ),
    });
    if (response.ok) {
      const result = (await response.json()) as { data?: { id?: unknown }[] };
      if (
        Array.isArray(result.data) &&
        result.data.length === rows.length &&
        result.data.every(
          (item) =>
            typeof item.id === "string" &&
            /^[a-zA-Z0-9_-]{1,100}$/.test(item.id),
        ) &&
        new Set(result.data.map((item) => item.id)).size === rows.length
      ) {
        providerIds = result.data.map((item) => item.id as string);
        state = "sent";
      }
    } else if (
      response.status >= 400 &&
      response.status < 500 &&
      ![408, 409].includes(response.status)
    )
      state = "failed";
  } catch {
    /* Unknown outcomes remain unknown; provider response text is never logged. */
  }
  await env.DB.batch(
    rows.map(({ row }, index) =>
      env.DB.prepare(
        "UPDATE workspace_invitations SET delivery_status=?,provider_id=? WHERE organization_id=? AND id=? AND delivery_status='unknown'",
      ).bind(state, providerIds[index] ?? null, row.organization_id, row.id),
    ),
  );
}

export async function handleInvitationRoute(
  request: Request,
  env: InvitationEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  const list = url.pathname === "/api/admin/invitations";
  const revoke = url.pathname.match(
    /^\/api\/admin\/invitations\/([^/]+)\/revoke$/,
  );
  if (url.pathname === "/api/invitations/preview") {
    if (request.method !== "POST")
      return json(
        {
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "Méthode non autorisée.",
          },
        },
        405,
      );
    const input = parse(
      z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
      await body(request),
    );
    return json(await getInvitationPreview(env, input.token));
  }
  if (!list && !revoke) return null;
  if (request.headers.has("Authorization"))
    fail("BROWSER_REQUIRED", "Ouvrez Guteneo dans votre navigateur.", 403);
  const session = await authenticateBrowser(
    request,
    env,
    request.method !== "GET",
  );
  if (session.context.role !== "admin")
    fail(
      "FORBIDDEN",
      "Seul un administrateur peut inviter des collaborateurs.",
      403,
    );
  const org = session.context.organizationId;
  if (list && request.method === "GET") {
    const query = parse(
      z
        .object({
          cursor: z.string().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .strict(),
      Object.fromEntries(url.searchParams),
    );
    const result = await env.DB.prepare(
      "SELECT * FROM workspace_invitations WHERE organization_id=? AND id>? ORDER BY id LIMIT ?",
    )
      .bind(org, query.cursor ?? "", query.limit + 1)
      .all<Row>();
    const items = result.results.slice(0, query.limit).map(publicRow);
    return json({
      items,
      nextCursor: result.results.length > query.limit ? items.at(-1)!.id : null,
    });
  }
  if (revoke && request.method === "POST") {
    parse(z.object({}).strict(), await body(request));
    const id = parse(z.string().min(1).max(100), decodeURIComponent(revoke[1]));
    const authority = fence(env, session);
    const now = timestamp();
    const result = await env.DB.batch([
      env.DB.prepare(
        `UPDATE workspace_invitations SET status='revoked',revoked_at=? WHERE organization_id=? AND id=? AND status='pending' AND ${authority.condition}`,
      ).bind(now, org, id, ...authority.values),
      env.DB.prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'invitation.revoked',?,'{}',? WHERE changes()=1",
      ).bind(
        `audit_${crypto.randomUUID()}`,
        org,
        session.context.userId,
        id,
        now,
      ),
    ]);
    if (!result[0].meta.changes)
      fail(
        "INVITATION_UNAVAILABLE",
        "Cette invitation n’est plus en attente ou vos droits ont changé.",
        409,
      );
    return json({ revoked: true });
  }
  if (list && request.method === "POST") {
    const input = parse(workspaceInvitationInput, await body(request));
    const simulation = isLocalSimulation(request, env);
    if (!simulation && !deliveryReady(env))
      fail(
        "INVITATION_DELIVERY_DISABLED",
        "L’envoi des invitations par e-mail n’est pas encore activé pour cet environnement.",
        409,
      );
    const now = timestamp(),
      expiry = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const batchId = crypto.randomUUID();
    const auditId = `audit_${batchId}`;
    const rows = await Promise.all(
      input.emails.map(async (email) => {
        const token = randomToken();
        const row: Row = {
          id: `invite_${crypto.randomUUID()}`,
          organization_id: org,
          email,
          token_hash: await hashSecret(token),
          role: input.role,
          supervisor_can_approve: Number(
            input.role === "supervisor" && input.supervisorCanApprove === true,
          ),
          supervisor_can_report: Number(
            input.role === "supervisor" && input.supervisorCanReport === true,
          ),
          status: "pending",
          delivery_status: simulation ? "simulated" : "pending",
          created_at: now,
          expires_at: expiry,
        };
        return { row, url: `${env.APP_ORIGIN}/invitation/#token=${token}` };
      }),
    );
    const authority = fence(env, session);
    const marker =
      "EXISTS(SELECT 1 FROM audit_log WHERE organization_id=? AND id=?)";
    try {
      const results = await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'invitation.created',?,?,? WHERE ${authority.condition}`,
        ).bind(
          auditId,
          org,
          session.context.userId,
          batchId,
          JSON.stringify({
            count: rows.length,
            role: input.role,
            supervisorCanApprove: input.supervisorCanApprove ?? false,
            supervisorCanReport: input.supervisorCanReport ?? false,
            simulation,
          }),
          now,
          ...authority.values,
        ),
        env.DB.prepare(
          `UPDATE workspace_invitations SET status='expired' WHERE organization_id=? AND status='pending' AND expires_at<=? AND ${marker}`,
        ).bind(org, now, org, auditId),
        ...rows.map(({ row }) =>
          env.DB.prepare(
            `INSERT INTO workspace_invitations(id,organization_id,email,token_hash,role,supervisor_can_approve,supervisor_can_report,invited_by,status,delivery_status,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,'pending',?,?,? WHERE ${marker}`,
          ).bind(
            row.id,
            org,
            row.email,
            row.token_hash,
            row.role,
            row.supervisor_can_approve,
            row.supervisor_can_report,
            session.context.userId,
            row.delivery_status,
            now,
            expiry,
            org,
            auditId,
          ),
        ),
      ]);
      if (!results[0].meta.changes)
        fail("FORBIDDEN", "Vos droits ont changé. Actualisez la page.", 403);
    } catch (error) {
      invalid(error);
    }
    if (!simulation) await deliver(env, request, session, rows, batchId);
    const saved = await env.DB.prepare(
      "SELECT * FROM workspace_invitations WHERE organization_id=? AND id IN (SELECT value FROM json_each(?)) ORDER BY id",
    )
      .bind(org, JSON.stringify(rows.map(({ row }) => row.id)))
      .all<Row>();
    const urls = new Map(rows.map(({ row, url }) => [row.id, url]));
    return json(
      {
        items: saved.results.map((row) => ({
          ...publicRow(row),
          ...(simulation ? { previewUrl: urls.get(row.id) } : {}),
        })),
        simulation,
      },
      201,
    );
  }
  return json(
    {
      error: { code: "METHOD_NOT_ALLOWED", message: "Méthode non autorisée." },
    },
    405,
  );
}
