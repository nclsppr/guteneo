import type {
  AdministrationAuditEntry,
  AdministrationConnections,
  AdministrationConsumption,
  AdministrationDispatch,
  AdministrationMember,
  AdministrationOverview,
  AdministrationPage,
} from "../../../packages/contracts/src/administration";
import type { Dispatch, DocumentRecord } from "./api";

const DAY = 86_400_000;
// The preview's own semantics: delivered or submitted fixtures are consumed,
// uncertain ones keep a reservation, exactly as its usage ledger reports them.
const consumed = (dispatch: Dispatch) =>
  ["delivered", "submitted"].includes(dispatch.status);
const reserved = (dispatch: Dispatch) =>
  dispatch.status === "submission_unknown";
const attention = (dispatch: Dispatch) =>
  ["submission_unknown", "failed", "bounced", "complained"].includes(
    dispatch.status,
  );

export type PreviewAdministrationInput = {
  path: string;
  now: string;
  workspace: { id: string; name: string };
  user: { name: string };
  dispatches: readonly Dispatch[];
  documents: readonly DocumentRecord[];
  members: readonly {
    id: string;
    name: string;
    email: string;
    role: string;
    supervisorCanApprove: boolean;
    supervisorCanReport: boolean;
  }[];
  credit: { grantedMinor: number; availableMinor: number };
  fail: (code: string, message: string, status?: number) => never;
};

function period(
  query: URLSearchParams,
  now: string,
  fail: PreviewAdministrationInput["fail"],
) {
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const to = query.get("to") ?? now.slice(0, 10);
  const from =
    query.get("from") ??
    new Date(Date.parse(now) - 29 * DAY).toISOString().slice(0, 10);
  if (
    !valid(from) ||
    !valid(to) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 365 * DAY
  )
    fail(
      "INVALID_FILTERS",
      "Choose a period of at most 366 days and at most 100 rows per page.",
      400,
    );
  return {
    from,
    to,
    start: `${from}T00:00:00.000Z`,
    end: new Date(Date.parse(to) + DAY).toISOString(),
  };
}

function paged<T>(items: T[], query: URLSearchParams): AdministrationPage<T> {
  const pageSize = Math.min(
    100,
    Math.max(1, Number(query.get("pageSize") ?? 25)),
  );
  const page = Math.max(1, Number(query.get("page") ?? 1));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

/**
 * Fictional Administration reads for the browser-only preview, derived from
 * the preview workspace's own dispatches, documents and members. Permission
 * checks stay with the caller; nothing here reaches a server or a real record.
 */
export function readPreviewAdministration(
  input: PreviewAdministrationInput,
): unknown {
  const [route, search] = input.path.split("?");
  const query = new URLSearchParams(search);
  const range = period(query, input.now, input.fail);
  const inPeriod = input.dispatches.filter(
    (dispatch) =>
      dispatch.created_at >= range.start && dispatch.created_at < range.end,
  );
  const sum = (items: readonly Dispatch[], pick: (d: Dispatch) => boolean) =>
    items.reduce(
      (total, dispatch) =>
        total + (pick(dispatch) ? dispatch.estimated_minor : 0),
      0,
    );
  if (route === "/administration/overview") {
    const trend: AdministrationOverview["trend"] = [];
    for (let t = Date.parse(range.start); t < Date.parse(range.end); t += DAY) {
      const date = new Date(t).toISOString().slice(0, 10);
      const day = inPeriod.filter((d) => d.created_at.startsWith(date));
      trend.push({
        date,
        dispatches: day.length,
        delivered: day.filter((d) => d.status === "delivered").length,
        consumptionMinor: sum(day, consumed),
        connections: date === input.now.slice(0, 10) ? 1 : 0,
      });
    }
    const byChannel = new Map<string, Dispatch[]>();
    for (const dispatch of inPeriod)
      byChannel.set(dispatch.channel, [
        ...(byChannel.get(dispatch.channel) ?? []),
        dispatch,
      ]);
    const byStatus = new Map<string, number>();
    for (const dispatch of inPeriod)
      byStatus.set(dispatch.status, (byStatus.get(dispatch.status) ?? 0) + 1);
    const needingAttention = inPeriod.filter(attention).length;
    return {
      generatedAt: input.now,
      period: { from: range.from, to: range.to },
      workspace: {
        id: input.workspace.id,
        name: input.workspace.name,
        mode: "simulation",
        createdAt: input.now,
      },
      totals: {
        dispatches: inPeriod.length,
        delivered: inPeriod.filter((d) => d.status === "delivered").length,
        attention: needingAttention,
        pages: inPeriod.filter((d) => d.document_id).length,
        consumptionMinor: sum(inPeriod, consumed),
        reservedMinor: sum(inPeriod, reserved),
        documents: input.documents.filter(
          (document) =>
            document.created_at >= range.start &&
            document.created_at < range.end,
        ).length,
        secureShares: 0,
        members: input.members.length,
        activeConnections: 1,
      },
      credit: input.credit,
      trend,
      channels: [...byChannel].map(([channel, items]) => ({
        channel,
        dispatches: items.length,
        consumptionMinor: sum(items, consumed),
        reservedMinor: sum(items, reserved),
      })),
      statuses: [...byStatus]
        .map(([status, dispatches]) => ({ status, dispatches }))
        .sort((a, b) => b.dispatches - a.dispatches),
      incidents: needingAttention
        ? [
            {
              kind: "dispatch_attention",
              count: needingAttention,
              severity: "warning",
            },
          ]
        : [],
    } satisfies AdministrationOverview;
  }
  if (route === "/administration/activity") {
    const channel = query.get("channel");
    const status = query.get("status");
    const reference = (query.get("q") ?? "").trim();
    const items = inPeriod
      .filter(
        (dispatch) =>
          (!channel || dispatch.channel === channel) &&
          (!status || dispatch.status === status) &&
          (query.get("group") !== "attention" || attention(dispatch)) &&
          (!reference || dispatch.id.includes(reference)),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((dispatch): AdministrationDispatch => ({
        id: dispatch.id,
        channel: dispatch.channel,
        status: dispatch.status,
        createdAt: dispatch.created_at,
        updatedAt: dispatch.updated_at,
        pages: dispatch.document_id ? 1 : null,
        deliveryMode:
          dispatch.channel === "email"
            ? dispatch.document_id
              ? "attachment"
              : "none"
            : null,
        destinationCountry:
          dispatch.channel === "postal"
            ? String(
                (dispatch.recipient_json as Record<string, string>)?.country ??
                  "",
              ) || null
            : null,
        estimatedMinor: dispatch.estimated_minor,
        ceilingMinor: dispatch.ceiling_minor,
        consumptionMinor: consumed(dispatch) ? dispatch.estimated_minor : null,
        reservedMinor: reserved(dispatch) ? dispatch.estimated_minor : 0,
        approvedBy: dispatch.status === "prepared" ? null : input.user.name,
        campaignId: dispatch.campaign_id ?? null,
      }));
    return paged(items, query);
  }
  if (route === "/administration/consumption") {
    const charged = inPeriod.filter(consumed);
    const byChannel = new Map<string, Dispatch[]>();
    for (const dispatch of charged)
      byChannel.set(dispatch.channel, [
        ...(byChannel.get(dispatch.channel) ?? []),
        dispatch,
      ]);
    const byDay = new Map<string, Dispatch[]>();
    for (const dispatch of charged) {
      const date = dispatch.updated_at.slice(0, 10);
      byDay.set(date, [...(byDay.get(date) ?? []), dispatch]);
    }
    const total = sum(charged, () => true);
    return {
      generatedAt: input.now,
      period: { from: range.from, to: range.to },
      basis: "simulation_confirmation",
      totalMinor: total,
      reservedMinor: sum(input.dispatches, reserved),
      credit: input.credit,
      services: charged.length
        ? [{ service: "dispatch", charges: charged.length, amountMinor: total }]
        : [],
      channels: [...byChannel].map(([channel, items]) => ({
        channel,
        dispatches: items.length,
        consumptionMinor: sum(items, () => true),
      })),
      daily: [...byDay]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, items]) => ({
          date,
          amountMinor: sum(items, () => true),
          charges: items.length,
        })),
      monthly: charged.length
        ? [
            {
              month: input.now.slice(0, 7),
              amountMinor: total,
              charges: charged.length,
            },
          ]
        : [],
    } satisfies AdministrationConsumption;
  }
  if (route === "/administration/members")
    return paged(
      input.members.map((member): AdministrationMember => ({
        userId: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        canApprove: member.role === "admin" || member.supervisorCanApprove,
        canReport: member.role === "admin" || member.supervisorCanReport,
        joinedAt: input.now,
        activeConnections: member.role === "admin" ? 1 : 0,
        lastSeenAt: member.role === "admin" ? input.now : null,
        approvals:
          member.role === "admin"
            ? inPeriod.filter((d) => d.status !== "prepared").length
            : 0,
        lastActivityAt: member.role === "admin" ? input.now : null,
      })),
      query,
    );
  if (route === "/administration/connections")
    return {
      current: paged(
        [
          {
            id: "preview_browser_session",
            kind: "browser" as const,
            userName: input.user.name,
            createdAt: input.now,
            expiresAt: new Date(
              Date.parse(input.now) + 3_600_000,
            ).toISOString(),
            lastSeenAt: input.now,
          },
        ],
        query,
      ),
      events: paged(
        [
          {
            id: "preview_sign_in",
            kind: "browser" as const,
            userName: input.user.name,
            occurredAt: input.now,
          },
        ],
        query,
      ),
      retentionDays: 90,
    } satisfies AdministrationConnections;
  if (route === "/administration/audit")
    return paged(
      inPeriod
        .filter((dispatch) => dispatch.status !== "prepared")
        .map((dispatch): AdministrationAuditEntry => ({
          id: `${dispatch.id}_approved`,
          action: "dispatch.approved",
          actor: input.user.name,
          resourceId: dispatch.id,
          createdAt: dispatch.created_at,
        })),
      query,
    );
  return input.fail("NOT_FOUND", "Route not found.", 404);
}
