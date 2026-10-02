/** Read-only platform projections. No recipient, document content or credentials. */
export type BelvedereMode = "production" | "simulation";
export interface BelvedereFilters {
  from: string;
  to: string;
  mode: BelvedereMode;
}
export interface BelvederePage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface BelvedereMoney {
  currency: string;
  amountMinor: number;
}
export interface BelvedereOverview {
  generatedAt: string;
  filters: BelvedereFilters;
  totals: {
    workshops: number;
    members: number;
    activeConnections: number;
    dispatches: number;
    delivered: number;
    attention: number;
    pages: number;
    documents: number;
    customerConsumptionMinor: number;
    reservedMinor: number;
  };
  trend: {
    date: string;
    dispatches: number;
    delivered: number;
    connections: number;
    consumptionMinor: number;
  }[];
  countries: { country: string | null; connections: number }[];
  distributionCountries: {
    country: string | null;
    dispatches: number;
    delivered: number;
    channels: { channel: string; dispatches: number }[];
  }[];
  statuses: { status: string; dispatches: number }[];
  channels: { channel: string; dispatches: number; consumptionMinor: number }[];
  incidents: {
    kind: string;
    count: number;
    severity: "warning" | "critical";
  }[];
  telemetry: {
    since: string | null;
    retentionDays: number;
    countrySource: "cloudflare_request_cf";
    historicalCountryAvailable: false;
  };
}
export interface BelvedereWorkshop {
  id: string;
  name: string;
  mode: "production" | "simulation";
  createdAt: string;
  members: number;
  dispatches: number;
  documents: number;
  pages: number;
  consumptionMinor: number;
  reservedMinor: number;
  availableCreditMinor: number | null;
  attention: number;
  lastActivityAt: string | null;
}
export interface BelvedereDispatch {
  id: string;
  channel: string;
  mode: string;
  status: string;
  createdAt: string;
  pages: number | null;
  customerActualMinor: number | null;
  transportActualMinor?: number | null;
  hostingFeeMinor?: number;
  deliveryMode?: "none" | "attachment" | "protected_link" | null;
  reservedMinor: number;
  supplierVerifiedMinor: number | null;
  supplierCurrency: string | null;
  estimatedMinor: number;
  ceilingMinor: number;
}
export interface BelvedereMember {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  workshops: {
    id: string;
    name: string;
    role: string;
    canApprove: boolean;
    canReport: boolean;
  }[];
  workshopsTotal: number;
  activeConnections: number;
  lastSeenAt: string | null;
}
export interface BelvedereWorkshopDetail {
  workshop: BelvedereWorkshop;
  dispatches: BelvederePage<BelvedereDispatch>;
  members: BelvedereMember[];
  membersTotal: number;
  membersPage: number;
  membersPageSize: number;
  channels: {
    channel: string;
    dispatches: number;
    consumptionMinor: number;
    reservedMinor: number;
  }[];
}
export interface BelvedereConnection {
  id: string;
  kind: "browser" | "native" | "mcp";
  userId: string;
  userName: string;
  workshopId: string;
  workshopName: string;
  status: string;
  country: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string | null;
}
export interface BelvedereConnections {
  current: BelvederePage<BelvedereConnection>;
  events: BelvederePage<{
    id: string;
    kind: string;
    userName: string;
    workshopName: string;
    country: string | null;
    occurredAt: string;
  }>;
  countries: { country: string | null; connections: number }[];
  retentionDays: number;
  since: string | null;
}
export interface BelvedereFinance {
  periodBasis: "posted_ledger" | "simulation_confirmation";
  dispatchCountBasis: "created_dispatch_cohort";
  reservedBasis: "current_dispatch_cohort";
  generatedAt: string;
  filters: BelvedereFilters;
  customerConsumptionMinor: number;
  reservedMinor: number;
  promotionalGrantedMinor: number;
  promotionalRemainingMinor: number;
  cashReceived: BelvedereMoney[];
  cashSource: "stripe_verified_payments";
  cashStatus: "configured" | "unconfigured";
  supplierVerified: BelvedereMoney[];
  supplierUnverifiedDispatches: number;
  netResultMinor: null;
  netResultUnavailableReason: string;
  channels: {
    channel: string;
    dispatches: number;
    consumptionMinor: number;
    reservedMinor: number;
  }[];
  monthly: { month: string; consumptionMinor: number; dispatches: number }[];
}

export interface BelvedereJob extends BelvedereDispatch {
  workshopId: string;
  workshopName: string;
  destinationCountry: string | null;
}
