/**
 * Workspace administration: read-only reports for one workspace, under that
 * workspace's current membership. Never platform-wide (see Belvédère), never
 * recipients, document titles, message content or supplier accounting.
 */
export type AdministrationPermission = "reports" | "members";

export interface AdministrationPeriod {
  from: string;
  to: string;
}
export interface AdministrationPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface AdministrationWorkspace {
  id: string;
  name: string;
  mode: "production" | "simulation";
  createdAt: string;
}
export interface AdministrationOverview {
  generatedAt: string;
  period: AdministrationPeriod;
  workspace: AdministrationWorkspace;
  totals: {
    dispatches: number;
    delivered: number;
    attention: number;
    pages: number;
    consumptionMinor: number;
    reservedMinor: number;
    documents: number;
    secureShares: number;
    members: number;
    activeConnections: number;
  };
  credit: { grantedMinor: number; availableMinor: number } | null;
  trend: {
    date: string;
    dispatches: number;
    delivered: number;
    consumptionMinor: number;
    connections: number;
  }[];
  channels: {
    channel: string;
    dispatches: number;
    consumptionMinor: number;
    reservedMinor: number;
  }[];
  statuses: { status: string; dispatches: number }[];
  incidents: {
    kind: "dispatch_attention" | "outbox_delayed";
    count: number;
    severity: "warning" | "critical";
  }[];
}
export interface AdministrationDispatch {
  id: string;
  channel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  pages: number | null;
  deliveryMode: string | null;
  destinationCountry: string | null;
  estimatedMinor: number;
  ceilingMinor: number;
  consumptionMinor: number | null;
  reservedMinor: number;
  approvedBy: string | null;
  campaignId: string | null;
}
export interface AdministrationMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  canApprove: boolean;
  canReport: boolean;
  joinedAt: string;
  activeConnections: number;
  lastSeenAt: string | null;
  approvals: number;
  lastActivityAt: string | null;
}
export interface AdministrationConnection {
  id: string;
  kind: "browser" | "native" | "mcp";
  userName: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
}
export interface AdministrationSignIn {
  id: string;
  kind: "browser" | "native" | "mcp";
  userName: string;
  occurredAt: string;
}
export interface AdministrationConnections {
  current: AdministrationPage<AdministrationConnection>;
  events: AdministrationPage<AdministrationSignIn>;
  retentionDays: number;
}
export interface AdministrationConsumption {
  generatedAt: string;
  period: AdministrationPeriod;
  basis: "posted_ledger" | "simulation_confirmation";
  totalMinor: number;
  reservedMinor: number;
  credit: { grantedMinor: number; availableMinor: number } | null;
  services: { service: string; charges: number; amountMinor: number }[];
  channels: {
    channel: string;
    dispatches: number;
    consumptionMinor: number;
  }[];
  daily: { date: string; amountMinor: number; charges: number }[];
  monthly: { month: string; amountMinor: number; charges: number }[];
}
export interface AdministrationAuditEntry {
  id: string;
  action: string;
  actor: string | null;
  resourceId: string;
  createdAt: string;
}

export const ADMINISTRATION_EXPORT_DATASETS = [
  "report",
  "activity",
  "consumption",
  "members",
  "connections",
  "audit",
] as const;
export type AdministrationExportDataset =
  (typeof ADMINISTRATION_EXPORT_DATASETS)[number];
export const ADMINISTRATION_EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type AdministrationExportFormat =
  (typeof ADMINISTRATION_EXPORT_FORMATS)[number];
/** An export refuses rather than silently truncating a larger dataset. */
export const ADMINISTRATION_EXPORT_ROW_LIMIT = 10_000;
/** Datasets that name members or their access require member management. */
export const ADMINISTRATION_MEMBER_DATASETS: readonly AdministrationExportDataset[] =
  ["members", "connections", "audit"];
/** Shared rendering bound; longer reports remain available in Excel or CSV. */
export const ADMINISTRATION_PDF_MAX_ROWS = 500;
