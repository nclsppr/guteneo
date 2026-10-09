import { authenticateBrowser, AuthError } from "./auth";
import type { Env } from "./env";
import type {
  BelvedereFilters,
  BelvedereMode,
  BelvederePage,
  BelvedereWorkshop,
  BelvedereDispatch,
  BelvedereJob,
  BelvedereMember,
  BelvedereConnection,
  BelvedereOverview,
  BelvedereFinance,
  BelvedereConnections,
  BelvedereWorkshopDetail,
} from "../../../packages/contracts/src/belvedere";
import { getBelvedereCloudflareMetrics } from "./belvedere-cloudflare";
import { getBelvedereCloudflareBilling } from "./belvedere-cloudflare-billing";

const headers = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
const absent = () => new Response("Not found", { status: 404, headers });
interface Filters extends BelvedereFilters {
  start: string;
  end: string;
  page: number;
  pageSize: number;
  membersPage: number;
  q: string;
}
export function belvedereFilters(url: URL, now = new Date()): Filters {
  const to = url.searchParams.get("to") ?? now.toISOString().slice(0, 10);
  const from =
    url.searchParams.get("from") ??
    new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  const mode = url.searchParams.get("mode") ?? "production";
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
  const membersPage = Number(url.searchParams.get("membersPage") ?? "1");
  const q = (url.searchParams.get("q") ?? "").trim();
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 365 * 86400000 ||
    !["production", "simulation"].includes(mode) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    q.length > 100 ||
    !Number.isInteger(membersPage) ||
    membersPage < 1 ||
    membersPage > 1000
  )
    throw new AuthError(
      "INVALID_FILTERS",
      "Période limitée à 366 jours et pagination à 100 éléments.",
      400,
    );
  return {
    from,
    to,
    mode: mode as BelvedereMode,
    start: `${from}T00:00:00.000Z`,
    end: new Date(Date.parse(to) + 86400000).toISOString(),
    page,
    pageSize,
    membersPage,
    q,
  };
}
const publicFilters = (f: Filters): BelvedereFilters => ({
  from: f.from,
  to: f.to,
  mode: f.mode,
});
const modeWhere = (alias: string, f: Filters) => `${alias}.mode='${f.mode}'`;
const query = (f: Filters) => `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
const pageResult = <T>(
  items: T[],
  total: number,
  f: Filters,
): BelvederePage<T> => ({ items, total, page: f.page, pageSize: f.pageSize });
const rows = async <T>(
  db: D1Database,
  sql: string,
  bindings: unknown[] = [],
): Promise<T[]> =>
  (
    await db
      .prepare(sql)
      .bind(...bindings)
      .all<T>()
  ).results;
const first = async <T>(
  db: D1Database,
  sql: string,
  bindings: unknown[] = [],
): Promise<T> =>
  (await db
    .prepare(sql)
    .bind(...bindings)
    .first<T>())!;
const transportActual = `CASE WHEN d.mode='production' THEN e.spent_delta WHEN r.status='confirmed' THEN r.amount_minor END`;
// Immutable settled ledger deltas include cumulative fractional pricing. The
// reservation charge is an estimate and must never stand in for this debit.
const actual = `CASE WHEN d.mode='production' THEN CASE WHEN e.dispatch_id IS NOT NULL OR h.amount_minor IS NOT NULL THEN COALESCE(e.spent_delta,0)+COALESCE(h.amount_minor,0) END WHEN r.status='confirmed' THEN r.amount_minor END`;
const reserved = `CASE WHEN d.mode='production' THEN CASE WHEN w.status='reserved' THEN w.amount_minor ELSE 0 END WHEN r.status='reserved' THEN r.amount_minor ELSE 0 END`;
const dispatchJoins = `LEFT JOIN welcome_credit_reservations w ON w.organization_id=d.organization_id AND w.dispatch_id=d.id LEFT JOIN reservations r ON r.organization_id=d.organization_id AND r.dispatch_id=d.id LEFT JOIN documents doc ON doc.organization_id=d.organization_id AND doc.id=d.document_id LEFT JOIN welcome_credit_entries e ON e.organization_id=d.organization_id AND e.dispatch_id=d.id AND e.kind='settled' LEFT JOIN (SELECT organization_id,dispatch_id,sum(amount_minor) amount_minor FROM protected_hosting_charges GROUP BY organization_id,dispatch_id) h ON h.organization_id=d.organization_id AND h.dispatch_id=d.id`;
const period = (f: Filters, alias = "d") =>
  `${alias}.created_at>=? AND ${alias}.created_at<? AND ${modeWhere(alias, f)}`;
const attention = `d.status IN ('submission_unknown','failed','bounced','complained')`;
// Country projection is deliberately coarse. Never infer an email recipient's
// location from its domain, and never return a postal address or fax number.
const destinationJoin = `LEFT JOIN live_fax_quotes_v3 fq ON fq.organization_id=d.organization_id AND fq.dispatch_id=d.id LEFT JOIN trusted_fax_usage_tariffs ft ON ft.organization_id=fq.organization_id AND ft.id=fq.tariff_id`;
const destinationCountry = `CASE WHEN d.channel='postal' AND length(json_extract(d.recipient_json,'$.country'))=2 AND json_extract(d.recipient_json,'$.country') NOT GLOB '*[^A-Z]*' THEN json_extract(d.recipient_json,'$.country') WHEN d.channel='fax' THEN ft.destination_country_code END`;
const dispatchProjection = `d.id,d.channel,d.mode,d.status,d.created_at createdAt,doc.pages,${actual} customerActualMinor,${transportActual} transportActualMinor,COALESCE(h.amount_minor,0) hostingFeeMinor,CASE WHEN d.channel='email' THEN CASE WHEN json_extract(d.options_json,'$.emailDeliveryMode') IN ('none','attachment','protected_link') THEN json_extract(d.options_json,'$.emailDeliveryMode') WHEN d.document_id IS NOT NULL THEN 'attachment' ELSE 'none' END END deliveryMode,${reserved} reservedMinor,d.estimated_minor estimatedMinor,d.ceiling_minor ceilingMinor,CASE WHEN s.dispatch_id IS NOT NULL THEN CAST((s.supplier_nanoeur+5000000)/10000000 AS INTEGER) END supplierVerifiedMinor,CASE WHEN s.dispatch_id IS NOT NULL THEN 'EUR' END supplierCurrency`;
const supplierJoin = `LEFT JOIN fax_usage_settlements s ON s.organization_id=d.organization_id AND s.dispatch_id=d.id`;
const RETENTION_DAYS = 90;
const cutoff = () =>
  new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();

/** These are existing sessions/authorizations, not a claim of live sockets. */
const currentConnections = `WITH current AS (
 SELECT b.public_id id,'browser' kind,b.user_id,b.organization_id,b.created_at,b.expires_at,'active' status FROM browser_sessions b JOIN memberships m ON m.organization_id=b.organization_id AND m.user_id=b.user_id WHERE b.expires_at>? AND b.is_development=0
 UNION ALL SELECT n.public_id,'native',n.user_id,n.organization_id,n.created_at,n.expires_at,'active' FROM native_sessions n JOIN browser_sessions b ON b.token_hash=n.browser_session_hash AND b.organization_id=n.organization_id AND b.user_id=n.user_id JOIN memberships m ON m.organization_id=n.organization_id AND m.user_id=n.user_id WHERE n.expires_at>? AND b.expires_at>? AND b.is_development=0
 UNION ALL SELECT c.id,'mcp',c.user_id,c.organization_id,c.created_at,NULL,'authorized' FROM authorized_connections c JOIN memberships m ON m.organization_id=c.organization_id AND m.user_id=c.user_id WHERE c.status='active'
)`;
const connectionTime = () => {
  const now = new Date().toISOString();
  return [now, now, now];
};

async function channels(env: Env, f: Filters, workshopId?: string) {
  return rows<{
    channel: string;
    dispatches: number;
    consumptionMinor: number;
    reservedMinor: number;
  }>(
    env.DB,
    `SELECT d.channel,count(*) dispatches,COALESCE(sum(${actual}),0) consumptionMinor,COALESCE(sum(${reserved}),0) reservedMinor FROM dispatches d ${dispatchJoins} WHERE ${period(f)} ${workshopId ? "AND d.organization_id=?" : ""} GROUP BY d.channel`,
    [f.start, f.end, ...(workshopId ? [workshopId] : [])],
  );
}
async function countries(env: Env, f: Filters) {
  return rows<{ country: string | null; connections: number }>(
    env.DB,
    `SELECT e.country,count(*) connections FROM connection_events e JOIN organizations o ON o.id=e.organization_id WHERE e.occurred_at>=? AND e.occurred_at<? AND e.occurred_at>=? AND ${modeWhere("o", f)} GROUP BY e.country ORDER BY connections DESC,e.country`,
    [f.start, f.end, cutoff()],
  );
}
async function telemetrySince(env: Env) {
  return (
    await first<{ since: string | null }>(
      env.DB,
      "SELECT min(occurred_at) since FROM connection_events WHERE occurred_at>=?",
      [cutoff()],
    )
  ).since;
}

async function overview(env: Env, f: Filters): Promise<BelvedereOverview> {
  const [
    volume,
    population,
    connections,
    trendRows,
    eventRows,
    countryRows,
    channelRows,
    since,
    documentCount,
    outbox,
    distributionRows,
    statusRows,
  ] = await Promise.all([
    first<{
      dispatches: number;
      delivered: number;
      attention: number;
      pages: number;
      customerConsumptionMinor: number;
      reservedMinor: number;
    }>(
      env.DB,
      `SELECT count(*) dispatches,COALESCE(sum(d.status='delivered'),0) delivered,COALESCE(sum(${attention}),0) attention,COALESCE(sum(doc.pages),0) pages,COALESCE(sum(${actual}),0) customerConsumptionMinor,COALESCE(sum(${reserved}),0) reservedMinor FROM dispatches d ${dispatchJoins} WHERE ${period(f)}`,
      [f.start, f.end],
    ),
    first<{ workshops: number; members: number }>(
      env.DB,
      `SELECT (SELECT count(*) FROM organizations o WHERE ${modeWhere("o", f)}) workshops,(SELECT count(DISTINCT m.user_id) FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE ${modeWhere("o", f)}) members`,
    ),
    first<{ count: number }>(
      env.DB,
      `${currentConnections} SELECT count(*) count FROM current c JOIN organizations o ON o.id=c.organization_id WHERE ${modeWhere("o", f)}`,
      connectionTime(),
    ),
    rows<{
      date: string;
      dispatches: number;
      delivered: number;
      consumptionMinor: number;
    }>(
      env.DB,
      `SELECT substr(d.created_at,1,10) date,count(*) dispatches,sum(d.status='delivered') delivered,COALESCE(sum(${actual}),0) consumptionMinor FROM dispatches d ${dispatchJoins} WHERE ${period(f)} GROUP BY date ORDER BY date`,
      [f.start, f.end],
    ),
    rows<{ date: string; connections: number }>(
      env.DB,
      `SELECT substr(e.occurred_at,1,10) date,count(*) connections FROM connection_events e JOIN organizations o ON o.id=e.organization_id WHERE e.occurred_at>=? AND e.occurred_at<? AND e.occurred_at>=? AND ${modeWhere("o", f)} GROUP BY date`,
      [f.start, f.end, cutoff()],
    ),
    countries(env, f),
    channels(env, f),
    telemetrySince(env),
    first<{ count: number }>(
      env.DB,
      `SELECT count(*) count FROM documents d JOIN organizations o ON o.id=d.organization_id WHERE d.created_at>=? AND d.created_at<? AND ${modeWhere("o", f)}`,
      [f.start, f.end],
    ),
    first<{ count: number }>(
      env.DB,
      `SELECT count(*) count FROM outbox b JOIN dispatches d ON d.organization_id=b.organization_id AND d.id=b.dispatch_id WHERE b.status='pending' AND b.created_at<? AND ${period(f)}`,
      [new Date(Date.now() - 60000).toISOString(), f.start, f.end],
    ),
    rows<{
      country: string | null;
      channel: string;
      dispatches: number;
      delivered: number;
    }>(
      env.DB,
      `SELECT ${destinationCountry} country,d.channel,count(*) dispatches,sum(d.status='delivered') delivered FROM dispatches d ${destinationJoin} WHERE ${period(f)} GROUP BY country,d.channel ORDER BY dispatches DESC,country,d.channel`,
      [f.start, f.end],
    ),
    rows<{ status: string; dispatches: number }>(
      env.DB,
      `SELECT d.status,count(*) dispatches FROM dispatches d WHERE ${period(f)} GROUP BY d.status ORDER BY dispatches DESC,d.status`,
      [f.start, f.end],
    ),
  ]);
  const trend: BelvedereOverview["trend"] = [];
  for (let t = Date.parse(f.start); t < Date.parse(f.end); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    trend.push({
      date,
      dispatches: 0,
      delivered: 0,
      consumptionMinor: 0,
      ...trendRows.find((r) => r.date === date),
      connections: eventRows.find((r) => r.date === date)?.connections ?? 0,
    });
  }
  const distributionCountries: BelvedereOverview["distributionCountries"] = [];
  for (const row of distributionRows) {
    let country = distributionCountries.find((c) => c.country === row.country);
    if (!country) {
      country = {
        country: row.country,
        dispatches: 0,
        delivered: 0,
        channels: [],
      };
      distributionCountries.push(country);
    }
    country.dispatches += row.dispatches;
    country.delivered += row.delivered;
    country.channels.push({ channel: row.channel, dispatches: row.dispatches });
  }
  distributionCountries.sort((a, b) => b.dispatches - a.dispatches);
  return {
    generatedAt: new Date().toISOString(),
    filters: publicFilters(f),
    distributionCountries,
    statuses: statusRows,
    totals: {
      ...volume,
      ...population,
      activeConnections: connections.count,
      documents: documentCount.count,
    },
    trend,
    countries: countryRows,
    channels: channelRows,
    incidents: [
      ...(volume.attention
        ? [
            {
              kind: "dispatch_attention",
              count: volume.attention,
              severity: "warning" as const,
            },
          ]
        : []),
      ...(outbox.count
        ? [
            {
              kind: "outbox_delayed",
              count: outbox.count,
              severity: "critical" as const,
            },
          ]
        : []),
    ],
    telemetry: {
      since,
      retentionDays: RETENTION_DAYS,
      countrySource: "cloudflare_request_cf",
      historicalCountryAvailable: false,
    },
  };
}

async function workshopList(
  env: Env,
  f: Filters,
  id?: string,
): Promise<BelvederePage<BelvedereWorkshop>> {
  const condition = `${modeWhere("o", f)} AND (o.name LIKE ? ESCAPE '\\' OR o.id LIKE ? ESCAPE '\\') ${id ? "AND o.id=?" : ""}`;
  const params = [query(f), query(f), ...(id ? [id] : [])];
  const total = await first<{ count: number }>(
    env.DB,
    `SELECT count(*) count FROM organizations o WHERE ${condition}`,
    params,
  );
  const items = await rows<BelvedereWorkshop>(
    env.DB,
    `SELECT o.id,o.name,o.mode,o.created_at createdAt,
    (SELECT count(*) FROM memberships m WHERE m.organization_id=o.id) members,
    (SELECT count(*) FROM documents x WHERE x.organization_id=o.id AND x.created_at>=? AND x.created_at<?) documents,
    COALESCE(v.dispatches,0) dispatches,COALESCE(v.pages,0) pages,COALESCE(v.consumptionMinor,0) consumptionMinor,COALESCE(v.reservedMinor,0) reservedMinor,
    b.available_minor availableCreditMinor,COALESCE(v.attention,0) attention,v.lastActivityAt
    FROM organizations o LEFT JOIN welcome_credit_balances b ON b.organization_id=o.id
    LEFT JOIN (SELECT d.organization_id,count(*) dispatches,sum(doc.pages) pages,sum(${actual}) consumptionMinor,sum(${reserved}) reservedMinor,sum(${attention}) attention,max(d.updated_at) lastActivityAt FROM dispatches d ${dispatchJoins} WHERE ${period(f)} GROUP BY d.organization_id) v ON v.organization_id=o.id
    WHERE ${condition} ORDER BY o.created_at DESC,o.id LIMIT ? OFFSET ?`,
    [
      f.start,
      f.end,
      f.start,
      f.end,
      ...params,
      f.pageSize,
      (f.page - 1) * f.pageSize,
    ],
  );
  return pageResult(items, total.count, f);
}
async function jobs(
  env: Env,
  f: Filters,
  url: URL,
): Promise<BelvederePage<BelvedereJob>> {
  const channel = url.searchParams.get("channel");
  const status = url.searchParams.get("status");
  const country = url.searchParams.get("country");
  const group = url.searchParams.get("statusGroup");
  const statuses = [
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
  ];
  if (
    (channel && !["fax", "email", "postal"].includes(channel)) ||
    (status && !statuses.includes(status)) ||
    (country && country !== "unknown" && !/^[A-Z]{2}$/.test(country)) ||
    (group && !["attention", "delayed"].includes(group))
  )
    throw new AuthError("INVALID_FILTERS", "Filtre de jobs invalide.", 400);
  const conditions = [
    period(f),
    `(d.id LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')`,
  ];
  const bindings: unknown[] = [f.start, f.end, query(f), query(f)];
  if (channel) {
    conditions.push("d.channel=?");
    bindings.push(channel);
  }
  if (status) {
    conditions.push("d.status=?");
    bindings.push(status);
  }
  if (country) {
    conditions.push(
      country === "unknown"
        ? `${destinationCountry} IS NULL`
        : `${destinationCountry}=?`,
    );
    if (country !== "unknown") bindings.push(country);
  }
  if (group === "attention") conditions.push(attention);
  if (group === "delayed") {
    conditions.push(
      "EXISTS(SELECT 1 FROM outbox b WHERE b.organization_id=d.organization_id AND b.dispatch_id=d.id AND b.status='pending' AND b.created_at<?)",
    );
    bindings.push(new Date(Date.now() - 60000).toISOString());
  }
  const where = conditions.join(" AND ");
  const [total, items] = await Promise.all([
    first<{ count: number }>(
      env.DB,
      `SELECT count(*) count FROM dispatches d JOIN organizations o ON o.id=d.organization_id ${destinationJoin} WHERE ${where}`,
      bindings,
    ),
    rows<BelvedereJob>(
      env.DB,
      `SELECT ${dispatchProjection},d.organization_id workshopId,o.name workshopName,${destinationCountry} destinationCountry FROM dispatches d JOIN organizations o ON o.id=d.organization_id ${dispatchJoins} ${supplierJoin} ${destinationJoin} WHERE ${where} ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?`,
      [...bindings, f.pageSize, (f.page - 1) * f.pageSize],
    ),
  ]);
  return pageResult(items, total.count, f);
}

async function memberList(
  env: Env,
  f: Filters,
  organizationId?: string,
): Promise<BelvederePage<BelvedereMember>> {
  const condition = `EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=u.id AND ${modeWhere("o", f)} ${organizationId ? "AND o.id=?" : ""}) AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')`;
  const args = [
    ...(organizationId ? [organizationId] : []),
    query(f),
    query(f),
  ];
  const total = await first<{ count: number }>(
    env.DB,
    `SELECT count(*) count FROM users u WHERE ${condition}`,
    args,
  );
  const users = await rows<
    Omit<BelvedereMember, "workshops" | "activeConnections">
  >(
    env.DB,
    `SELECT u.id,u.name,u.email,u.created_at createdAt,(SELECT max(e.occurred_at) FROM connection_events e JOIN organizations o ON o.id=e.organization_id WHERE e.user_id=u.id AND ${modeWhere("o", f)} AND e.occurred_at>=?) lastSeenAt FROM users u WHERE ${condition} ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?`,
    [cutoff(), ...args, f.pageSize, (f.page - 1) * f.pageSize],
  );
  type WorkshopRow = {
    userId: string;
    id: string;
    name: string;
    role: string;
    canApprove: number;
    canReport: number;
    workshopsTotal: number;
  };
  const workshopRows: WorkshopRow[] = [];
  const connectionCounts: { userId: string; count: number }[] = [];
  // Keep the number of SQL calls bounded by pages, not members; chunks stay
  // below D1's bound-parameter limit including the clock and tenant filter.
  for (let i = 0; i < users.length; i += 50) {
    const ids = users.slice(i, i + 50).map((u) => u.id);
    const placeholders = ids.map(() => "?").join(",");
    const extra = organizationId ? [organizationId] : [];
    const [workshops, active] = await Promise.all([
      rows<WorkshopRow>(
        env.DB,
        `SELECT * FROM (SELECT m.user_id userId,o.id,o.name,m.role,m.supervisor_can_approve canApprove,m.supervisor_can_report canReport,count(*) OVER(PARTITION BY m.user_id) workshopsTotal,row_number() OVER(PARTITION BY m.user_id ORDER BY o.name,o.id) position FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id IN (${placeholders}) AND ${modeWhere("o", f)} ${organizationId ? "AND o.id=?" : ""}) WHERE position<=101`,
        [...ids, ...extra],
      ),
      rows<{ userId: string; count: number }>(
        env.DB,
        `${currentConnections} SELECT c.user_id userId,count(*) count FROM current c JOIN organizations o ON o.id=c.organization_id WHERE c.user_id IN (${placeholders}) AND ${modeWhere("o", f)} ${organizationId ? "AND o.id=?" : ""} GROUP BY c.user_id`,
        [...connectionTime(), ...ids, ...extra],
      ),
    ]);
    workshopRows.push(...workshops);
    connectionCounts.push(...active);
  }
  const items = users.map((u) => {
    const workshops = workshopRows.filter((w) => w.userId === u.id);
    return {
      ...u,
      workshops: workshops.map(({ id, name, role, canApprove, canReport }) => ({
        id,
        name,
        role,
        canApprove: canApprove === 1,
        canReport: canReport === 1,
      })),
      workshopsTotal: workshops[0]?.workshopsTotal ?? 0,
      activeConnections:
        connectionCounts.find((c) => c.userId === u.id)?.count ?? 0,
    };
  });
  return pageResult(items, total.count, f);
}
async function workshopDetail(
  env: Env,
  f: Filters,
  id: string,
): Promise<BelvedereWorkshopDetail | null> {
  const workshop = (await workshopList(env, { ...f, page: 1, q: "" }, id))
    .items[0];
  if (!workshop) return null;
  const [count, dispatches, members, channelRows] = await Promise.all([
    first<{ count: number }>(
      env.DB,
      `SELECT count(*) count FROM dispatches d WHERE ${period(f)} AND d.organization_id=?`,
      [f.start, f.end, id],
    ),
    rows<BelvedereDispatch>(
      env.DB,
      `SELECT ${dispatchProjection} FROM dispatches d ${dispatchJoins} ${supplierJoin} WHERE ${period(f)} AND d.organization_id=? ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?`,
      [f.start, f.end, id, f.pageSize, (f.page - 1) * f.pageSize],
    ),
    memberList(env, { ...f, page: f.membersPage, pageSize: 100, q: "" }, id),
    channels(env, f, id),
  ]);
  return {
    workshop,
    dispatches: pageResult(dispatches, count.count, f),
    members: members.items,
    membersTotal: members.total,
    membersPage: members.page,
    membersPageSize: members.pageSize,
    channels: channelRows,
  };
}
async function connectionList(
  env: Env,
  f: Filters,
): Promise<BelvedereConnections> {
  const match = `${modeWhere("o", f)} AND (u.name LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')`;
  const textParams = [query(f), query(f), query(f)];
  const eventWhere = `e.occurred_at>=? AND e.occurred_at<? AND e.occurred_at>=? AND ${match}`;
  const [currentCount, current, eventCount, events, countryRows, since] =
    await Promise.all([
      first<{ count: number }>(
        env.DB,
        `${currentConnections} SELECT count(*) count FROM current c JOIN users u ON u.id=c.user_id JOIN organizations o ON o.id=c.organization_id WHERE ${match}`,
        [...connectionTime(), ...textParams],
      ),
      rows<BelvedereConnection>(
        env.DB,
        `${currentConnections} SELECT c.id,c.kind,c.user_id userId,u.name userName,c.organization_id workshopId,o.name workshopName,c.status,c.created_at createdAt,c.expires_at expiresAt,
      (SELECT e.country FROM connection_events e WHERE e.organization_id=c.organization_id AND e.user_id=c.user_id AND e.kind=c.kind AND e.connection_id=c.id AND e.occurred_at>=? ORDER BY e.occurred_at DESC LIMIT 1) country,
      (SELECT max(e.occurred_at) FROM connection_events e WHERE e.organization_id=c.organization_id AND e.user_id=c.user_id AND e.kind=c.kind AND e.connection_id=c.id AND e.occurred_at>=?) lastSeenAt
      FROM current c JOIN users u ON u.id=c.user_id JOIN organizations o ON o.id=c.organization_id WHERE ${match} ORDER BY c.created_at DESC,c.id LIMIT ? OFFSET ?`,
        [
          ...connectionTime(),
          cutoff(),
          cutoff(),
          ...textParams,
          f.pageSize,
          (f.page - 1) * f.pageSize,
        ],
      ),
      first<{ count: number }>(
        env.DB,
        `SELECT count(*) count FROM connection_events e JOIN users u ON u.id=e.user_id JOIN organizations o ON o.id=e.organization_id WHERE ${eventWhere}`,
        [f.start, f.end, cutoff(), ...textParams],
      ),
      rows<BelvedereConnections["events"]["items"][number]>(
        env.DB,
        `SELECT e.id,e.kind,u.name userName,o.name workshopName,e.country,e.occurred_at occurredAt FROM connection_events e JOIN users u ON u.id=e.user_id JOIN organizations o ON o.id=e.organization_id WHERE ${eventWhere} ORDER BY e.occurred_at DESC,e.id LIMIT ? OFFSET ?`,
        [
          f.start,
          f.end,
          cutoff(),
          ...textParams,
          f.pageSize,
          (f.page - 1) * f.pageSize,
        ],
      ),
      countries(env, f),
      telemetrySince(env),
    ]);
  return {
    current: pageResult(current, currentCount.count, f),
    events: pageResult(events, eventCount.count, f),
    countries: countryRows,
    retentionDays: RETENTION_DAYS,
    since,
  };
}
async function finance(env: Env, f: Filters): Promise<BelvedereFinance> {
  // Retained financial entries outlive dispatch metadata. Their posting date,
  // not a surviving dispatch's preparation date, selects the financial period.
  // Horizon consumes account credits as its own service. It contributes to
  // consumption, never to dispatch counts or delivery-channel totals.
  const chargeLedger =
    f.mode === "production"
      ? `WITH charges AS (
    SELECT e.organization_id,e.dispatch_id,e.spent_delta amount_minor,e.created_at charged_at,'dispatch' service FROM welcome_credit_entries e JOIN organizations o ON o.id=e.organization_id WHERE e.kind='settled' AND o.mode='production' AND e.created_at>=? AND e.created_at<?
    UNION ALL SELECT h.organization_id,h.dispatch_id,h.amount_minor,h.created_at,'dispatch' FROM protected_hosting_charges h JOIN organizations o ON o.id=h.organization_id WHERE o.mode='production' AND h.created_at>=? AND h.created_at<?
    UNION ALL SELECT p.organization_id,NULL,p.amount_minor,p.created_at,'horizon' FROM horizon_plan_charges p JOIN organizations o ON o.id=p.organization_id AND o.mode=p.evidence WHERE p.evidence='production' AND p.created_at>=? AND p.created_at<?
  )`
      : `WITH charges AS (
    SELECT r.organization_id,r.dispatch_id,r.amount_minor,r.updated_at charged_at,'dispatch' service FROM reservations r JOIN organizations o ON o.id=r.organization_id WHERE o.mode='simulation' AND r.status='confirmed' AND r.updated_at>=? AND r.updated_at<?
    UNION ALL SELECT p.organization_id,NULL,p.amount_minor,p.created_at,'horizon' FROM horizon_plan_charges p JOIN organizations o ON o.id=p.organization_id AND o.mode=p.evidence WHERE p.evidence='simulation' AND p.created_at>=? AND p.created_at<?
  )`;
  const ledgerBindings =
    f.mode === "production"
      ? [f.start, f.end, f.start, f.end, f.start, f.end]
      : [f.start, f.end, f.start, f.end];
  const [
    snapshot,
    posted,
    promo,
    cash,
    supplier,
    channelRows,
    chargedChannels,
    monthly,
  ] = await Promise.all([
    first<{ reservedMinor: number; supplierUnverifiedDispatches: number }>(
      env.DB,
      `SELECT COALESCE(sum(${reserved}),0) reservedMinor,COALESCE(sum(d.mode='production' AND (w.status IN ('reserved','settled') OR d.active_attempt_id IS NOT NULL) AND s.dispatch_id IS NULL),0) supplierUnverifiedDispatches FROM dispatches d ${dispatchJoins} ${supplierJoin} WHERE ${period(f)}`,
      [f.start, f.end],
    ),
    first<{
      customerConsumptionMinor: number;
      horizonConsumptionMinor: number;
      horizonCharges: number;
    }>(
      env.DB,
      `${chargeLedger} SELECT COALESCE(sum(amount_minor),0) customerConsumptionMinor,COALESCE(sum(CASE WHEN service='horizon' THEN amount_minor ELSE 0 END),0) horizonConsumptionMinor,COALESCE(sum(service='horizon'),0) horizonCharges FROM charges`,
      ledgerBindings,
    ),
    first<{
      promotionalGrantedMinor: number;
      promotionalRemainingMinor: number;
    }>(
      env.DB,
      `SELECT COALESCE(sum(b.granted_minor),0) promotionalGrantedMinor,COALESCE(sum(b.available_minor),0) promotionalRemainingMinor FROM welcome_credit_balances b JOIN organizations o ON o.id=b.organization_id WHERE ${modeWhere("o", f)}`,
    ),
    rows<{ currency: string; amountMinor: number }>(
      env.DB,
      `SELECT upper(p.currency) currency,sum(p.amount_received_minor) amountMinor FROM billing_payments p JOIN organizations o ON o.id=p.organization_id WHERE p.livemode=1 AND p.status='succeeded' AND p.created>=? AND p.created<? AND ${modeWhere("o", f)} GROUP BY p.currency`,
      [Date.parse(f.start) / 1000, Date.parse(f.end) / 1000],
    ),
    rows<{ currency: string; amountMinor: number }>(
      env.DB,
      `SELECT 'EUR' currency,CAST((sum(s.supplier_nanoeur)+5000000)/10000000 AS INTEGER) amountMinor FROM fax_usage_settlements s JOIN organizations o ON o.id=s.organization_id WHERE s.created_at>=? AND s.created_at<? AND ${modeWhere("o", f)} HAVING count(*)>0`,
      [f.start, f.end],
    ),
    channels(env, f),
    rows<{ channel: string; consumptionMinor: number }>(
      env.DB,
      `${chargeLedger} SELECT COALESCE(d.channel,'unknown') channel,sum(c.amount_minor) consumptionMinor FROM charges c LEFT JOIN dispatches d ON d.organization_id=c.organization_id AND d.id=c.dispatch_id WHERE c.service='dispatch' GROUP BY COALESCE(d.channel,'unknown')`,
      ledgerBindings,
    ),
    rows<BelvedereFinance["monthly"][number]>(
      env.DB,
      `${chargeLedger} SELECT substr(charged_at,1,7) month,sum(amount_minor) consumptionMinor,sum(CASE WHEN service='horizon' THEN amount_minor ELSE 0 END) horizonConsumptionMinor,count(DISTINCT CASE WHEN dispatch_id IS NOT NULL THEN json_array(organization_id,dispatch_id) END) dispatches FROM charges GROUP BY month ORDER BY month`,
      ledgerBindings,
    ),
  ]);
  const financialChannels = channelRows.map((row) => ({
    ...row,
    consumptionMinor:
      chargedChannels.find((c) => c.channel === row.channel)
        ?.consumptionMinor ?? 0,
  }));
  for (const row of chargedChannels)
    if (!financialChannels.some((c) => c.channel === row.channel))
      financialChannels.push({ ...row, dispatches: 0, reservedMinor: 0 });
  return {
    generatedAt: new Date().toISOString(),
    filters: publicFilters(f),
    periodBasis:
      f.mode === "production" ? "posted_ledger" : "simulation_confirmation",
    dispatchCountBasis: "created_dispatch_cohort",
    reservedBasis: "current_dispatch_cohort",
    ...snapshot,
    ...posted,
    ...promo,
    cashReceived: cash,
    cashSource: "stripe_verified_payments",
    cashStatus:
      env.STRIPE_API_KEY &&
      env.STRIPE_WEBHOOK_SECRET &&
      env.STRIPE_MODE === "live"
        ? "configured"
        : "unconfigured",
    supplierVerified: supplier,
    netResultMinor: null,
    netResultUnavailableReason:
      "Les crédits promotionnels ne sont pas des recettes. Les factures fournisseurs, remboursements, taxes et coûts fixes ne sont pas tous rapprochés.",
    channels: financialChannels,
    monthly,
  };
}

export function belvedereBasePath(env: Env): string | null {
  return env.ENVIRONMENT === "production" &&
    env.MODE === "production" &&
    /^[A-Za-z0-9_-]{32,128}$/.test(env.BELVEDERE_SECRET_SLUG ?? "")
    ? `/belvedere/${env.BELVEDERE_SECRET_SLUG}`
    : null;
}
/** The signed login proof is deliberately independent from mutable users.email. */
export async function authorizeBelvedere(
  request: Request,
  env: Env,
): Promise<string | null> {
  if (!belvedereBasePath(env) || request.headers.has("Authorization"))
    return null;
  if (
    new URL(request.url).origin !== env.APP_ORIGIN ||
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    (request.headers.has("Origin") &&
      request.headers.get("Origin") !== env.APP_ORIGIN)
  )
    return null;
  const session = await authenticateBrowser(request, env);
  if (env.AUTH0_AUTH_POLICY !== "verified_email" && !session.mfa) return null;
  const row = await first<{
    userId: string;
    issuer: string;
    subject: string;
    verifiedEmail: string;
  } | null>(
    env.DB,
    `SELECT b.user_id userId,e.issuer,e.subject,e.verified_email verifiedEmail FROM browser_sessions b JOIN browser_identity_evidence e ON e.token_hash=b.token_hash JOIN auth_identities i ON i.issuer=e.issuer AND i.subject=e.subject AND i.user_id=b.user_id WHERE b.token_hash=? AND b.is_development=0 AND b.expires_at>?`,
    [session.tokenHash, new Date().toISOString()],
  );
  const expectedIssuer = env.AUTH0_DOMAIN
    ? `https://${env.AUTH0_DOMAIN.replace(/^https:\/\//, "").replace(/\/$/, "")}/`
    : null;
  if (
    !row ||
    row.verifiedEmail !== "nicolas@pieper.fr" ||
    !expectedIssuer ||
    row.issuer !== expectedIssuer ||
    (env.BELVEDERE_AUTH0_SUBJECT && row.subject !== env.BELVEDERE_AUTH0_SUBJECT)
  )
    return null;
  return row.userId;
}
export async function handleBelvedereRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/belvedere" && !url.pathname.startsWith("/belvedere/"))
    return null;
  const base = belvedereBasePath(env);
  if (
    !base ||
    (url.pathname !== base &&
      url.pathname !== `${base}/` &&
      !url.pathname.startsWith(`${base}/api/`))
  )
    return absent();
  if (request.method !== "GET") return absent();
  const suffix = url.pathname.slice(base.length);
  const shell = suffix === "" || suffix === "/";
  let userId: string | null;
  try {
    userId = await authorizeBelvedere(request, env);
  } catch (error) {
    if (error instanceof AuthError) {
      if (
        shell &&
        !request.headers.has("Authorization") &&
        ["AUTHENTICATION_REQUIRED", "SESSION_EXPIRED"].includes(error.code)
      )
        return new Response(null, {
          status: 302,
          headers: {
            ...headers,
            Location: `${env.APP_ORIGIN}/auth/login?returnTo=${encodeURIComponent(base)}`,
          },
        });
      return absent();
    }
    throw error;
  }
  if (!userId) return absent();
  let action:
    | "shell"
    | "overview"
    | "jobs"
    | "workshops"
    | "workshop"
    | "members"
    | "connections"
    | "finance"
    | "infrastructure";
  const detail = /^\/api\/workshops\/([A-Za-z0-9_-]{1,120})$/.exec(suffix);
  if (shell) action = "shell";
  else if (detail) action = "workshop";
  else if (suffix === "/api/infrastructure/billing") action = "infrastructure";
  else {
    const route = suffix.slice(5);
    if (
      !suffix.startsWith("/api/") ||
      ![
        "overview",
        "jobs",
        "workshops",
        "members",
        "connections",
        "finance",
        "infrastructure",
      ].includes(route)
    )
      return absent();
    action = route as typeof action;
  }
  // Audit intentionally stores no URL, query, token, email or requested tenant.
  await env.DB.prepare(
    "INSERT INTO platform_access_audit(id,user_id,action,occurred_at) VALUES(?,?,?,?)",
  )
    .bind(crypto.randomUUID(), userId, action, new Date().toISOString())
    .run();
  if (shell) {
    const response = await env.ASSETS.fetch(
      new Request(new URL("/", url), { method: "GET" }),
    );
    if (!response.ok)
      return new Response("Interface indisponible", { status: 503, headers });
    const html = (await response.text()).replace(
      "<head>",
      `<head><meta name="guteneo-belvedere" content="${base}">`,
    );
    const responseHeaders = new Headers(response.headers);
    for (const [name, value] of Object.entries(headers))
      responseHeaders.set(name, value);
    responseHeaders.delete("ETag");
    responseHeaders.delete("Content-Length");
    return new Response(html, { status: 200, headers: responseHeaders });
  }
  try {
    const f = belvedereFilters(url);
    if (action === "overview") return json(await overview(env, f));
    if (action === "jobs") return json(await jobs(env, f, url));
    if (action === "workshops") return json(await workshopList(env, f));
    if (action === "members") {
      const workshopId = url.searchParams.get("workshopId") ?? undefined;
      if (workshopId && !/^[A-Za-z0-9_-]{1,120}$/.test(workshopId))
        return json(
          { error: { code: "INVALID_FILTERS", message: "Atelier invalide." } },
          400,
        );
      return json(await memberList(env, f, workshopId));
    }
    if (action === "connections") return json(await connectionList(env, f));
    if (action === "finance") return json(await finance(env, f));
    if (action === "infrastructure" && suffix === "/api/infrastructure/billing")
      return json(await getBelvedereCloudflareBilling(env));
    if (action === "infrastructure")
      return json(
        await getBelvedereCloudflareMetrics(
          env,
          url.searchParams.get("window") === "7d" ? "7d" : "24h",
        ),
      );
    const result = await workshopDetail(env, f, detail![1]);
    return result ? json(result) : absent();
  } catch (error) {
    if (error instanceof AuthError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    throw error;
  }
}
