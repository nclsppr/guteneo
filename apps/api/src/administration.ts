import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  DomainError,
  type ActorContext,
} from "../../../packages/domain/src/index";
import {
  workspacePermissions,
  type WorkspacePermissions,
} from "../../../packages/contracts/src/roles";
import {
  ADMINISTRATION_EXPORT_DATASETS,
  ADMINISTRATION_EXPORT_FORMATS,
  ADMINISTRATION_EXPORT_ROW_LIMIT,
  ADMINISTRATION_MEMBER_DATASETS,
  type AdministrationAuditEntry,
  type AdministrationConnection,
  type AdministrationConnections,
  type AdministrationConsumption,
  type AdministrationDispatch,
  type AdministrationMember,
  type AdministrationOverview,
  type AdministrationPage,
  type AdministrationPermission,
  type AdministrationSignIn,
  type AdministrationWorkspace,
} from "../../../packages/contracts/src/administration";
import {
  isSupportedLocale,
  type SupportedLocale,
} from "../../../packages/contracts/src/locale";
import type { Env } from "./env";
import { authenticationPolicy } from "./auth";
import { renderAdministrationExport } from "./administration-exports";

/*
 * Workspace administration reads. Every statement binds the authenticated
 * membership's organization; nothing here can name another workspace, and no
 * route writes business state. Recipients, subjects, document titles, message
 * bodies and supplier costs stay out of every projection (Belvédère keeps the
 * platform-wide view under its own authority).
 */

const DAY = 86_400_000;
const CONNECTION_RETENTION_DAYS = 90;
const DISPATCH_STATUSES = [
  "prepared",
  "queued",
  "submitting",
  "submission_unknown",
  "accepted",
  "delivered",
  "failed",
  "cancelled",
  "bounced",
  "complained",
  "printed",
  "handed_to_post",
] as const;

export type AdministrationAuthority = {
  organizationId: string;
  userId: string;
  workspace: AdministrationWorkspace;
  permissions: WorkspacePermissions;
};

/** The session role is a snapshot; the current membership row decides. */
export async function administrationAuthority(
  env: Env,
  actor: ActorContext,
  permission: AdministrationPermission,
): Promise<AdministrationAuthority> {
  if (actor.actor !== "browser")
    throw new DomainError(
      "BROWSER_REQUIRED",
      "Open Guteneo in your browser to administer this workspace.",
      403,
    );
  const row = await env.DB.prepare(
    "SELECT o.id,o.name,o.mode,o.created_at,m.role,m.supervisor_can_approve,m.supervisor_can_report FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE o.id=? AND m.user_id=?",
  )
    .bind(actor.organizationId, actor.userId)
    .first<{
      id: string;
      name: string;
      mode: "production" | "simulation";
      created_at: string;
      role: string;
      supervisor_can_approve: number;
      supervisor_can_report: number;
    }>();
  if (!row || row.role !== actor.role)
    throw new DomainError(
      "MEMBERSHIP_CHANGED",
      "Your access to this workspace has changed. Reload the page.",
      403,
    );
  const permissions = workspacePermissions(row.role, {
    canApprove: row.supervisor_can_approve === 1,
    canReport: row.supervisor_can_report === 1,
  });
  if (
    permission === "members"
      ? !permissions.manageMembers
      : !permissions.viewReports
  )
    throw new DomainError(
      "FORBIDDEN",
      permission === "members"
        ? "Administrator access is required."
        : "Report access is required.",
      403,
    );
  const session =
    actor.documentSessionHash &&
    (await env.DB.prepare(
      `SELECT 1 FROM browser_sessions WHERE token_hash=? AND organization_id=? AND user_id=? AND expires_at>? AND (is_development=0 OR ?=1) AND (is_development=1 OR ${authenticationPolicy(env) === "verified_email" ? "verified_account=1" : "? <> 'admin' OR mfa=1"})`,
    )
      .bind(
        actor.documentSessionHash,
        actor.organizationId,
        actor.userId,
        new Date().toISOString(),
        Number(env.MODE === "simulation" && env.ENVIRONMENT !== "production"),
        ...(authenticationPolicy(env) === "verified_email" ? [] : [row.role]),
      )
      .first());
  if (!session)
    throw new DomainError(
      "SESSION_EXPIRED",
      "Session expired. Sign in again.",
      401,
    );
  return {
    organizationId: row.id,
    userId: actor.userId,
    workspace: {
      id: row.id,
      name: row.name,
      mode: row.mode,
      createdAt: row.created_at,
    },
    permissions,
  };
}

export interface AdministrationFilters {
  from: string;
  to: string;
  start: string;
  end: string;
  page: number;
  pageSize: number;
  q: string;
  channel?: "fax" | "email" | "postal";
  status?: (typeof DISPATCH_STATUSES)[number];
  attention: boolean;
}
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function administrationFilters(
  url: URL,
  now = new Date(),
): AdministrationFilters {
  const to = url.searchParams.get("to") ?? now.toISOString().slice(0, 10);
  const from =
    url.searchParams.get("from") ??
    new Date(now.getTime() - 29 * DAY).toISOString().slice(0, 10);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const q = (url.searchParams.get("q") ?? "").trim();
  const channel = url.searchParams.get("channel") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 365 * DAY ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    q.length > 100 ||
    (channel !== undefined && !["fax", "email", "postal"].includes(channel)) ||
    (status !== undefined &&
      !(DISPATCH_STATUSES as readonly string[]).includes(status))
  )
    throw new DomainError(
      "INVALID_FILTERS",
      "Choose a period of at most 366 days and at most 100 rows per page.",
      400,
    );
  return {
    from,
    to,
    start: `${from}T00:00:00.000Z`,
    end: new Date(Date.parse(to) + DAY).toISOString(),
    page,
    pageSize,
    q,
    channel: channel as AdministrationFilters["channel"],
    status: status as AdministrationFilters["status"],
    attention: url.searchParams.get("group") === "attention",
  };
}

const rows = async <T>(env: Env, sql: string, values: unknown[] = []) =>
  (
    await env.DB.prepare(sql)
      .bind(...values)
      .all<T>()
  ).results;
const first = async <T>(env: Env, sql: string, values: unknown[] = []) =>
  (await env.DB.prepare(sql)
    .bind(...values)
    .first<T>())!;
function safeReport<T>(value: T): T {
  const visit = (item: unknown): void => {
    if (typeof item === "number" && !Number.isSafeInteger(item))
      throw new DomainError(
        "INVALID_REPORT_AMOUNT",
        "Report values must be safe integers.",
        422,
      );
    if (item && typeof item === "object")
      for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return value;
}
const page = <T>(
  items: T[],
  total: number,
  f: AdministrationFilters,
): AdministrationPage<T> =>
  safeReport({
    items,
    total,
    page: f.page,
    pageSize: f.pageSize,
  });
const like = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;
const displayName = (alias: string) =>
  `COALESCE(NULLIF(${alias}.name,''),${alias}.email)`;

// Customer-facing amounts only, matching Belvédère's ledger semantics: a
// settled ledger debit (plus hosting) in production, a confirmed reservation
// in simulation. Supplier costs never enter a workspace report.
const hosting = `(SELECT sum(hc.amount_minor) FROM protected_hosting_charges hc WHERE hc.organization_id=d.organization_id AND hc.dispatch_id=d.id)`;
const consumed = `CASE WHEN d.mode='production' THEN CASE WHEN e.dispatch_id IS NOT NULL OR ${hosting} IS NOT NULL THEN COALESCE(e.spent_delta,0)+COALESCE(${hosting},0) END WHEN r.status='confirmed' THEN r.amount_minor END`;
const reserved = `CASE WHEN d.mode='production' THEN CASE WHEN w.status='reserved' THEN w.amount_minor ELSE 0 END WHEN r.status='reserved' THEN r.amount_minor ELSE 0 END`;
const dispatchJoins = `LEFT JOIN welcome_credit_reservations w ON w.organization_id=d.organization_id AND w.dispatch_id=d.id LEFT JOIN reservations r ON r.organization_id=d.organization_id AND r.dispatch_id=d.id LEFT JOIN documents doc ON doc.organization_id=d.organization_id AND doc.id=d.document_id LEFT JOIN welcome_credit_entries e ON e.organization_id=d.organization_id AND e.dispatch_id=d.id AND e.kind='settled'`;
const attention = `d.status IN ('submission_unknown','failed','bounced','complained')`;
// Coarse destination only: a postal ISO country or the fax tariff country.
// Never an address, a number or an email domain.
const destinationJoin = `LEFT JOIN live_fax_quotes_v3 fq ON fq.organization_id=d.organization_id AND fq.dispatch_id=d.id LEFT JOIN trusted_fax_usage_tariffs ft ON ft.organization_id=fq.organization_id AND ft.id=fq.tariff_id`;
const destinationCountry = `CASE WHEN d.channel='postal' AND length(json_extract(d.recipient_json,'$.country'))=2 AND json_extract(d.recipient_json,'$.country') NOT GLOB '*[^A-Z]*' THEN json_extract(d.recipient_json,'$.country') WHEN d.channel='fax' THEN ft.destination_country_code END`;
const deliveryMode = `CASE WHEN d.channel='email' THEN CASE WHEN json_extract(d.options_json,'$.emailDeliveryMode') IN ('none','attachment','protected_link') THEN json_extract(d.options_json,'$.emailDeliveryMode') WHEN d.document_id IS NOT NULL THEN 'attachment' ELSE 'none' END END`;
const inPeriod = `d.organization_id=? AND d.created_at>=? AND d.created_at<?`;

/** Existing sessions and authorizations, not a claim of live presence. */
function currentConnections(a: AdministrationAuthority) {
  const at = new Date().toISOString();
  // Local simulation workspaces sign in with development sessions; a
  // production workspace never counts them.
  const development = a.workspace.mode === "simulation" ? 1 : 0;
  return {
    sql: `WITH current AS (
 SELECT b.public_id id,'browser' kind,b.user_id,b.created_at,b.expires_at FROM browser_sessions b JOIN memberships m ON m.organization_id=b.organization_id AND m.user_id=b.user_id WHERE b.organization_id=? AND b.expires_at>? AND (b.is_development=0 OR ?=1)
 UNION ALL SELECT n.public_id,'native',n.user_id,n.created_at,n.expires_at FROM native_sessions n JOIN browser_sessions b ON b.token_hash=n.browser_session_hash AND b.organization_id=n.organization_id AND b.user_id=n.user_id JOIN memberships m ON m.organization_id=n.organization_id AND m.user_id=n.user_id WHERE n.organization_id=? AND n.expires_at>? AND b.expires_at>? AND (b.is_development=0 OR ?=1)
 UNION ALL SELECT c.id,'mcp',c.user_id,c.created_at,NULL FROM authorized_connections c JOIN memberships m ON m.organization_id=c.organization_id AND m.user_id=c.user_id WHERE c.organization_id=? AND c.status='active'
)`,
    values: [
      a.organizationId,
      at,
      development,
      a.organizationId,
      at,
      at,
      development,
      a.organizationId,
    ],
  };
}
const retentionStart = () =>
  new Date(Date.now() - CONNECTION_RETENTION_DAYS * DAY).toISOString();

async function credit(env: Env, a: AdministrationAuthority) {
  return (
    (await env.DB.prepare(
      "SELECT granted_minor AS grantedMinor,available_minor AS availableMinor FROM welcome_credit_balances WHERE organization_id=?",
    )
      .bind(a.organizationId)
      .first<{ grantedMinor: number; availableMinor: number }>()) ?? null
  );
}

export async function administrationOverview(
  env: Env,
  a: AdministrationAuthority,
  f: AdministrationFilters,
): Promise<AdministrationOverview> {
  const period = [a.organizationId, f.start, f.end];
  const connections = currentConnections(a);
  const [
    volume,
    trendRows,
    eventRows,
    channels,
    statuses,
    documents,
    shares,
    members,
    active,
    delayed,
    balance,
  ] = await Promise.all([
    first<{
      dispatches: number;
      delivered: number;
      attention: number;
      pages: number;
      consumptionMinor: number;
      reservedMinor: number;
    }>(
      env,
      `SELECT count(*) dispatches,COALESCE(sum(d.status='delivered'),0) delivered,COALESCE(sum(${attention}),0) attention,COALESCE(sum(doc.pages),0) pages,COALESCE(sum(${consumed}),0) consumptionMinor,COALESCE(sum(${reserved}),0) reservedMinor FROM dispatches d ${dispatchJoins} WHERE ${inPeriod}`,
      period,
    ),
    rows<{
      date: string;
      dispatches: number;
      delivered: number;
      consumptionMinor: number;
    }>(
      env,
      `SELECT substr(d.created_at,1,10) date,count(*) dispatches,COALESCE(sum(d.status='delivered'),0) delivered,COALESCE(sum(${consumed}),0) consumptionMinor FROM dispatches d ${dispatchJoins} WHERE ${inPeriod} GROUP BY date ORDER BY date`,
      period,
    ),
    rows<{ date: string; connections: number }>(
      env,
      "SELECT substr(occurred_at,1,10) date,count(*) connections FROM connection_events WHERE organization_id=? AND occurred_at>=? AND occurred_at<? AND occurred_at>=? GROUP BY date",
      [...period, retentionStart()],
    ),
    rows<AdministrationOverview["channels"][number]>(
      env,
      `SELECT d.channel,count(*) dispatches,COALESCE(sum(${consumed}),0) consumptionMinor,COALESCE(sum(${reserved}),0) reservedMinor FROM dispatches d ${dispatchJoins} WHERE ${inPeriod} GROUP BY d.channel ORDER BY dispatches DESC,d.channel`,
      period,
    ),
    rows<AdministrationOverview["statuses"][number]>(
      env,
      `SELECT d.status,count(*) dispatches FROM dispatches d WHERE ${inPeriod} GROUP BY d.status ORDER BY dispatches DESC,d.status`,
      period,
    ),
    first<{ count: number }>(
      env,
      "SELECT count(*) count FROM documents WHERE organization_id=? AND created_at>=? AND created_at<?",
      period,
    ),
    first<{ count: number }>(
      env,
      "SELECT count(*) count FROM secure_distributions WHERE organization_id=? AND activated_at>=? AND activated_at<?",
      period,
    ),
    first<{ count: number }>(
      env,
      "SELECT count(*) count FROM memberships WHERE organization_id=?",
      [a.organizationId],
    ),
    first<{ count: number }>(
      env,
      `${connections.sql} SELECT count(*) count FROM current`,
      connections.values,
    ),
    first<{ count: number }>(
      env,
      "SELECT count(*) count FROM outbox WHERE organization_id=? AND status='pending' AND created_at<?",
      [a.organizationId, new Date(Date.now() - 60_000).toISOString()],
    ),
    credit(env, a),
  ]);
  const trend: AdministrationOverview["trend"] = [];
  for (let t = Date.parse(f.start); t < Date.parse(f.end); t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    const day = trendRows.find((row) => row.date === date);
    trend.push({
      date,
      dispatches: day?.dispatches ?? 0,
      delivered: day?.delivered ?? 0,
      consumptionMinor: day?.consumptionMinor ?? 0,
      connections: eventRows.find((row) => row.date === date)?.connections ?? 0,
    });
  }
  return safeReport({
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    workspace: a.workspace,
    totals: {
      ...volume,
      documents: documents.count,
      secureShares: shares.count,
      members: members.count,
      activeConnections: active.count,
    },
    credit: balance,
    trend,
    channels,
    statuses,
    incidents: [
      ...(volume.attention
        ? [
            {
              kind: "dispatch_attention" as const,
              count: volume.attention,
              severity: "warning" as const,
            },
          ]
        : []),
      ...(delayed.count
        ? [
            {
              kind: "outbox_delayed" as const,
              count: delayed.count,
              severity: "critical" as const,
            },
          ]
        : []),
    ],
  });
}

function activityWhere(a: AdministrationAuthority, f: AdministrationFilters) {
  const conditions = [inPeriod];
  const values: unknown[] = [a.organizationId, f.start, f.end];
  if (f.channel) {
    conditions.push("d.channel=?");
    values.push(f.channel);
  }
  if (f.status) {
    conditions.push("d.status=?");
    values.push(f.status);
  }
  if (f.attention) conditions.push(attention);
  if (f.q) {
    conditions.push(`d.id LIKE ? ESCAPE '\\'`);
    values.push(like(f.q));
  }
  return { sql: conditions.join(" AND "), values };
}
const dispatchProjection = `d.id,d.channel,d.status,d.created_at createdAt,d.updated_at updatedAt,doc.pages,${deliveryMode} deliveryMode,${destinationCountry} destinationCountry,d.estimated_minor estimatedMinor,d.ceiling_minor ceilingMinor,${consumed} consumptionMinor,${reserved} reservedMinor,(SELECT ${displayName("u")} FROM approvals ap JOIN users u ON u.id=ap.user_id WHERE ap.organization_id=d.organization_id AND ap.dispatch_id=d.id) approvedBy,d.campaign_id campaignId`;

export async function administrationActivity(
  env: Env,
  a: AdministrationAuthority,
  f: AdministrationFilters,
  limit = f.pageSize,
  offset = (f.page - 1) * f.pageSize,
): Promise<AdministrationPage<AdministrationDispatch>> {
  const where = activityWhere(a, f);
  const [total, items] = await Promise.all([
    first<{ count: number }>(
      env,
      `SELECT count(*) count FROM dispatches d WHERE ${where.sql}`,
      where.values,
    ),
    rows<AdministrationDispatch>(
      env,
      `SELECT ${dispatchProjection} FROM dispatches d ${dispatchJoins} ${destinationJoin} WHERE ${where.sql} ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?`,
      [...where.values, limit, offset],
    ),
  ]);
  return page(items, total.count, f);
}

export async function administrationMembers(
  env: Env,
  a: AdministrationAuthority,
  f: AdministrationFilters,
  limit = f.pageSize,
  offset = (f.page - 1) * f.pageSize,
): Promise<AdministrationPage<AdministrationMember>> {
  const search = f.q
    ? `AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')`
    : "";
  const searchValues = f.q ? [like(f.q), like(f.q)] : [];
  const connections = currentConnections(a);
  const [total, members, active] = await Promise.all([
    first<{ count: number }>(
      env,
      `SELECT count(*) count FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ${search}`,
      [a.organizationId, ...searchValues],
    ),
    rows<
      Omit<AdministrationMember, "canApprove" | "canReport"> & {
        canApprove: number;
        canReport: number;
      }
    >(
      env,
      `SELECT u.id userId,u.name,u.email,m.role,m.supervisor_can_approve canApprove,m.supervisor_can_report canReport,m.created_at joinedAt,0 activeConnections,
       (SELECT max(e.occurred_at) FROM connection_events e WHERE e.organization_id=m.organization_id AND e.user_id=m.user_id AND e.occurred_at>=?) lastSeenAt,
       (SELECT count(*) FROM approvals ap WHERE ap.organization_id=m.organization_id AND ap.user_id=m.user_id AND ap.created_at>=? AND ap.created_at<?) approvals,
       (SELECT max(l.created_at) FROM audit_log l WHERE l.organization_id=m.organization_id AND l.user_id=m.user_id) lastActivityAt
       FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ${search}
       ORDER BY m.role='admin' DESC,lower(u.name),u.id LIMIT ? OFFSET ?`,
      [
        retentionStart(),
        f.start,
        f.end,
        a.organizationId,
        ...searchValues,
        limit,
        offset,
      ],
    ),
    rows<{ userId: string; count: number }>(
      env,
      `${connections.sql} SELECT user_id userId,count(*) count FROM current GROUP BY user_id`,
      connections.values,
    ),
  ]);
  return page(
    members.map((member) => ({
      ...member,
      canApprove: member.role === "admin" || member.canApprove === 1,
      canReport: member.role === "admin" || member.canReport === 1,
      activeConnections:
        active.find((row) => row.userId === member.userId)?.count ?? 0,
    })),
    total.count,
    f,
  );
}

export async function administrationConnections(
  env: Env,
  a: AdministrationAuthority,
  f: AdministrationFilters,
  limit = f.pageSize,
  offset = (f.page - 1) * f.pageSize,
): Promise<AdministrationConnections> {
  const connections = currentConnections(a);
  const events = [a.organizationId, f.start, f.end, retentionStart()];
  const [currentCount, current, eventCount, signIns] = await Promise.all([
    first<{ count: number }>(
      env,
      `${connections.sql} SELECT count(*) count FROM current`,
      connections.values,
    ),
    rows<AdministrationConnection>(
      env,
      `${connections.sql} SELECT c.id,c.kind,${displayName("u")} userName,c.created_at createdAt,c.expires_at expiresAt,
       (SELECT max(e.occurred_at) FROM connection_events e WHERE e.organization_id=? AND e.user_id=c.user_id AND e.kind=c.kind AND e.connection_id=c.id AND e.occurred_at>=?) lastSeenAt
       FROM current c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC,c.id LIMIT ? OFFSET ?`,
      [
        ...connections.values,
        a.organizationId,
        retentionStart(),
        limit,
        offset,
      ],
    ),
    first<{ count: number }>(
      env,
      "SELECT count(*) count FROM connection_events WHERE organization_id=? AND occurred_at>=? AND occurred_at<? AND occurred_at>=?",
      events,
    ),
    rows<AdministrationSignIn>(
      env,
      `SELECT e.id,e.kind,${displayName("u")} userName,e.occurred_at occurredAt FROM connection_events e JOIN users u ON u.id=e.user_id WHERE e.organization_id=? AND e.occurred_at>=? AND e.occurred_at<? AND e.occurred_at>=? ORDER BY e.occurred_at DESC,e.id LIMIT ? OFFSET ?`,
      [...events, limit, offset],
    ),
  ]);
  return {
    current: page(current, currentCount.count, f),
    events: page(signIns, eventCount.count, f),
    retentionDays: CONNECTION_RETENTION_DAYS,
  };
}

/** Posted charges selected by their own date, as in Belvédère's finance view. */
function chargeLedger(a: AdministrationAuthority, f: AdministrationFilters) {
  const org = a.organizationId,
    mode = a.workspace.mode;
  const dispatches =
    mode === "production"
      ? `SELECT e.dispatch_id,e.spent_delta amount_minor,e.created_at charged_at,'dispatch' service FROM welcome_credit_entries e WHERE e.organization_id=? AND e.kind='settled' AND e.created_at>=? AND e.created_at<?
    UNION ALL SELECT h.dispatch_id,h.amount_minor,h.created_at,'dispatch' FROM protected_hosting_charges h WHERE h.organization_id=? AND h.created_at>=? AND h.created_at<?`
      : `SELECT r.dispatch_id,r.amount_minor,r.updated_at charged_at,'dispatch' service FROM reservations r WHERE r.organization_id=? AND r.status='confirmed' AND r.updated_at>=? AND r.updated_at<?`;
  return {
    sql: `WITH charges AS (
    ${dispatches}
    UNION ALL SELECT NULL,p.amount_minor,p.created_at,'legacy_plan' FROM horizon_plan_charges p WHERE p.organization_id=? AND p.evidence=? AND p.created_at>=? AND p.created_at<?
    UNION ALL SELECT NULL,p.amount_minor,v.completed_at,'pdf_check' FROM pdf_validation_purchases p JOIN pdf_validations v ON v.organization_id=p.organization_id AND v.id=p.validation_id WHERE p.organization_id=? AND v.status='complete' AND p.evidence=? AND v.completed_at>=? AND v.completed_at<?
    UNION ALL SELECT NULL,s.amount_minor,s.created_at,'secure_distribution' FROM secure_distribution_charges s WHERE s.organization_id=? AND s.evidence=? AND s.created_at>=? AND s.created_at<?
  )`,
    values: [
      ...(mode === "production"
        ? [org, f.start, f.end, org, f.start, f.end]
        : [org, f.start, f.end]),
      org,
      mode,
      f.start,
      f.end,
      org,
      mode,
      f.start,
      f.end,
      org,
      mode,
      f.start,
      f.end,
    ],
  };
}

export async function administrationConsumption(
  env: Env,
  a: AdministrationAuthority,
  f: AdministrationFilters,
): Promise<AdministrationConsumption> {
  const ledger = chargeLedger(a, f);
  const [services, channels, daily, monthly, current, balance] =
    await Promise.all([
      rows<AdministrationConsumption["services"][number]>(
        env,
        `${ledger.sql} SELECT service,count(*) charges,COALESCE(sum(amount_minor),0) amountMinor FROM charges GROUP BY service ORDER BY amountMinor DESC,service`,
        ledger.values,
      ),
      rows<AdministrationConsumption["channels"][number]>(
        env,
        `${ledger.sql} SELECT COALESCE(d.channel,'unknown') channel,count(DISTINCT c.dispatch_id) dispatches,COALESCE(sum(c.amount_minor),0) consumptionMinor FROM charges c LEFT JOIN dispatches d ON d.organization_id=? AND d.id=c.dispatch_id WHERE c.service='dispatch' GROUP BY COALESCE(d.channel,'unknown') ORDER BY consumptionMinor DESC`,
        [...ledger.values, a.organizationId],
      ),
      rows<AdministrationConsumption["daily"][number]>(
        env,
        `${ledger.sql} SELECT substr(charged_at,1,10) date,COALESCE(sum(amount_minor),0) amountMinor,count(*) charges FROM charges GROUP BY date ORDER BY date`,
        ledger.values,
      ),
      rows<AdministrationConsumption["monthly"][number]>(
        env,
        `${ledger.sql} SELECT substr(charged_at,1,7) month,COALESCE(sum(amount_minor),0) amountMinor,count(*) charges FROM charges GROUP BY month ORDER BY month`,
        ledger.values,
      ),
      first<{ reservedMinor: number }>(
        env,
        a.workspace.mode === "production"
          ? "SELECT COALESCE((SELECT reserved_minor FROM welcome_credit_balances WHERE organization_id=?),0) reservedMinor"
          : "SELECT COALESCE((SELECT sum(amount_minor) FROM reservations WHERE organization_id=?1 AND status='reserved'),0)+COALESCE((SELECT reserved_minor FROM pdf_validation_credit_effects WHERE organization_id=?1 AND evidence='simulation'),0) reservedMinor",
        [a.organizationId],
      ),
      credit(env, a),
    ]);
  return safeReport({
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    basis:
      a.workspace.mode === "production"
        ? "posted_ledger"
        : "simulation_confirmation",
    totalMinor: services.reduce((sum, row) => sum + row.amountMinor, 0),
    reservedMinor: current.reservedMinor,
    credit: balance,
    services,
    channels,
    daily,
    monthly,
  });
}

/** Individual posted charges for accounting exports, oldest first. */
export async function administrationCharges(
  env: Env,
  a: AdministrationAuthority,
  f: AdministrationFilters,
  limit: number,
) {
  const ledger = chargeLedger(a, f);
  const [total, items] = await Promise.all([
    first<{ count: number }>(
      env,
      `${ledger.sql} SELECT count(*) count FROM charges`,
      ledger.values,
    ),
    rows<{
      chargedAt: string;
      service: string;
      dispatchId: string | null;
      amountMinor: number;
    }>(
      env,
      `${ledger.sql} SELECT charged_at chargedAt,service,dispatch_id dispatchId,amount_minor amountMinor FROM charges ORDER BY charged_at,dispatch_id LIMIT ?`,
      [...ledger.values, limit],
    ),
  ]);
  return safeReport({ items, total: total.count });
}

export async function administrationAudit(
  env: Env,
  a: AdministrationAuthority,
  f: AdministrationFilters,
  limit = f.pageSize,
  offset = (f.page - 1) * f.pageSize,
): Promise<AdministrationPage<AdministrationAuditEntry>> {
  // Actions and their resource identifiers only: details can hold message
  // or recipient context and are never projected into a report.
  const values = [a.organizationId, f.start, f.end];
  const [total, items] = await Promise.all([
    first<{ count: number }>(
      env,
      "SELECT count(*) count FROM audit_log WHERE organization_id=? AND created_at>=? AND created_at<?",
      values,
    ),
    rows<AdministrationAuditEntry>(
      env,
      `SELECT l.id,l.action,${displayName("u")} actor,l.resource_id resourceId,l.created_at createdAt FROM audit_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.organization_id=? AND l.created_at>=? AND l.created_at<? ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    ),
  ]);
  return page(items, total.count, f);
}

const exportQuery = z
  .object({
    format: z.enum(ADMINISTRATION_EXPORT_FORMATS),
    locale: z
      .string()
      .refine((value) => isSupportedLocale(value))
      .optional(),
  })
  .passthrough();

/** Complete datasets for an export, refusing rather than truncating. */
async function exportData(
  env: Env,
  a: AdministrationAuthority,
  f: AdministrationFilters,
  dataset: (typeof ADMINISTRATION_EXPORT_DATASETS)[number],
) {
  const all = ADMINISTRATION_EXPORT_ROW_LIMIT + 1;
  const tooLarge = (count: number) => {
    if (count > ADMINISTRATION_EXPORT_ROW_LIMIT)
      throw new DomainError(
        "EXPORT_TOO_LARGE",
        "This export has more than 10,000 rows. Choose a shorter period.",
        422,
      );
  };
  const members = a.permissions.manageMembers;
  const wants = (name: string) => dataset === "report" || dataset === name;
  const [
    overview,
    activity,
    consumption,
    charges,
    memberRows,
    connections,
    audit,
  ] = await Promise.all([
    dataset === "report" ? administrationOverview(env, a, f) : null,
    wants("activity") ? administrationActivity(env, a, f, all, 0) : null,
    wants("consumption") ? administrationConsumption(env, a, f) : null,
    wants("consumption") ? administrationCharges(env, a, f, all) : null,
    wants("members") && members
      ? administrationMembers(env, a, { ...f, q: "" }, all, 0)
      : null,
    wants("connections") && members
      ? administrationConnections(env, a, f, all, 0)
      : null,
    wants("audit") && members ? administrationAudit(env, a, f, all, 0) : null,
  ]);
  for (const result of [activity, charges, memberRows, audit])
    if (result) tooLarge(Math.max(result.total, result.items.length));
  if (connections) {
    tooLarge(
      Math.max(connections.current.total, connections.current.items.length) +
        Math.max(connections.events.total, connections.events.items.length),
    );
  }
  return {
    overview,
    activity: activity?.items ?? null,
    consumption,
    charges: charges?.items ?? null,
    members: memberRows?.items ?? null,
    connections: connections ?? null,
    audit: audit?.items ?? null,
  };
}
export type AdministrationExportData = Awaited<ReturnType<typeof exportData>>;

type AdministrationEnv = {
  Bindings: Env;
  Variables: { actor: ActorContext };
};

export function createAdministrationRoutes() {
  const app = new Hono<AdministrationEnv>();
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    Vary: "Cookie",
  };
  const read =
    (
      permission: AdministrationPermission,
      load: (
        env: Env,
        a: AdministrationAuthority,
        f: AdministrationFilters,
      ) => Promise<unknown>,
    ) =>
    async (c: Context<AdministrationEnv>) => {
      const authority = await administrationAuthority(
        c.env,
        c.get("actor"),
        permission,
      );
      const filters = administrationFilters(new URL(c.req.url));
      const result = await load(c.env, authority, filters);
      await administrationAuthority(c.env, c.get("actor"), permission);
      return c.json(result, 200, headers);
    };
  app.get(
    "/api/administration/overview",
    read("reports", administrationOverview),
  );
  app.get(
    "/api/administration/activity",
    read("reports", (env, a, f) => administrationActivity(env, a, f)),
  );
  app.get(
    "/api/administration/consumption",
    read("reports", administrationConsumption),
  );
  app.get(
    "/api/administration/members",
    read("members", (env, a, f) => administrationMembers(env, a, f)),
  );
  app.get(
    "/api/administration/connections",
    read("members", (env, a, f) => administrationConnections(env, a, f)),
  );
  app.get(
    "/api/administration/audit",
    read("members", (env, a, f) => administrationAudit(env, a, f)),
  );
  app.get("/api/administration/exports/:dataset", async (c) => {
    const dataset = z
      .enum(ADMINISTRATION_EXPORT_DATASETS)
      .parse(c.req.param("dataset"));
    const authority = await administrationAuthority(
      c.env,
      c.get("actor"),
      ADMINISTRATION_MEMBER_DATASETS.includes(dataset) ? "members" : "reports",
    );
    const url = new URL(c.req.url);
    const filters = administrationFilters(url);
    const { format, locale } = exportQuery.parse(
      Object.fromEntries(url.searchParams),
    );
    if (dataset === "report" && format === "csv")
      throw new DomainError(
        "EXPORT_FORMAT_UNAVAILABLE",
        "A CSV file holds one table. Choose Excel or PDF for the full report.",
        400,
      );
    const data = await exportData(c.env, authority, filters, dataset);
    const file = await renderAdministrationExport({
      dataset,
      format,
      locale: (locale ?? "en") as SupportedLocale,
      workspace: authority.workspace,
      period: { from: filters.from, to: filters.to },
      generatedAt: new Date().toISOString(),
      data,
    });
    // Large local reads/renders may outlive a membership change. Recheck before
    // releasing the attachment or recording a successful export.
    await administrationAuthority(
      c.env,
      c.get("actor"),
      ADMINISTRATION_MEMBER_DATASETS.includes(dataset) ? "members" : "reports",
    );
    // The export itself is a workspace event: who exported what and when.
    // Its parameters are recorded; none of the exported values are.
    await c.env.DB.prepare(
      "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        `audit_${crypto.randomUUID().replaceAll("-", "")}`,
        authority.organizationId,
        authority.userId,
        "report.exported",
        dataset,
        JSON.stringify({
          format,
          from: filters.from,
          to: filters.to,
          rows: file.rows,
        }),
        new Date().toISOString(),
      )
      .run();
    return new Response(
      typeof file.body === "string" ? file.body : new Uint8Array(file.body),
      {
        headers: {
          ...headers,
          "Content-Type": file.contentType,
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  });
  return app;
}
