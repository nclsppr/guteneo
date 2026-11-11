import type { SupportedLocale } from "../../../../packages/contracts/src/locale";
import type { WorkspacePermissions } from "../../../../packages/contracts/src/roles";
import type { DocumentAnalysis } from "../../../../packages/contracts/src/document-analysis";
import type { DispatchGroup } from "../../../../packages/contracts/src/dispatch-groups";

export type { WorkspacePermissions, DocumentAnalysis, DispatchGroup };

export type Channel = "fax" | "email" | "postal";
/** A line of the station: the three dispatch channels plus the secure locker. */
export type Line = Channel | "locker";

export type WorkspaceSession = {
  organization: { id: string; name: string };
  user: {
    id: string;
    name: string;
    email?: string | null;
    role: string;
    supervisorCanApprove?: boolean;
    supervisorCanReport?: boolean;
    preferredLocale?: SupportedLocale | null;
  };
  csrfToken: string;
  permissions: WorkspacePermissions;
  simulation: boolean;
  mfa?: boolean;
  verifiedAccount?: boolean;
  canAccessBelvedere?: boolean;
};

export type PersonalSession = {
  user: {
    id: string;
    name: string;
    email: string | null;
    preferredLocale?: SupportedLocale | null;
  };
  csrfToken: string;
  simulation: boolean;
  canAccessBelvedere?: boolean;
  mfa: boolean;
  verifiedAccount: boolean;
  authenticatedAt: number | null;
  strongAuthentication: boolean;
  documentAccessMode?: "strong" | "verified_account";
  documentAccessAllowed?: boolean;
  workspaces: {
    id: string;
    name: string;
    role: string;
    current: boolean;
    canViewReports?: boolean;
  }[];
};

export type ChannelCapability = {
  id: Channel;
  name: string;
  liveSending: boolean;
  provider: string;
  status: string;
};

export type Capabilities = {
  version: string;
  mode: "simulation" | "production";
  simulation: boolean;
  liveSending: boolean;
  channels: ChannelCapability[];
  registration: { enabled: boolean; verification: string };
  secureDistribution: { available: boolean };
  scheduledDispatches: { enabled: boolean };
  customerWebhooks?: { enabled?: boolean };
  billing: { configured: boolean; mode: string };
  pdfValidation: {
    available: boolean;
    priceMinor: number;
    currency: string;
  };
  documents: { import: boolean; render: boolean };
  limits?: Record<string, number>;
};

export type DocumentRecord = {
  id: string;
  name: string;
  sha256: string;
  size: number;
  pages: number;
  status: string;
  source: string;
  secure_copy_source_id?: string | null;
  created_at: string;
  analysis?: DocumentAnalysis;
};

export type Dispatch = {
  id: string;
  channel: Channel;
  recipient_json: string | Record<string, unknown>;
  document_id?: string | null;
  sender_id?: string | null;
  sender_address?: string | null;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  options_json?: string | Record<string, unknown> | null;
  status: string;
  mode: "simulation" | "production";
  estimated_minor: number;
  ceiling_minor: number;
  known_minor?: number | null;
  currency: string;
  fingerprint: string;
  provider?: string | null;
  created_at: string;
  updated_at: string;
  campaign_id?: string | null;
  quote_expires_at?: string | null;
  quote_customer_nanoeur?: number | null;
  quote_pricing_basis?: string | null;
  recipient_feedback?: "unsubscribed" | "reported" | null;
  faxPricing?: {
    ceilingMinor: number;
    estimateMinMinor?: number;
    estimateMaxMinor?: number;
    executionScope?: string;
  } | null;
  activeSchedule?: {
    id: string;
    status: "draft" | "approved" | "releasing" | "unknown";
    executeAt: string;
    maxTotalMinor: number;
  };
};

export type DispatchEvent = {
  id: string;
  provider?: string | null;
  kind: string;
  payload_json?: string | null;
  occurred_at: string;
  received_at?: string;
};

export type DispatchAttempt = {
  id: string;
  status: string;
  provider?: string | null;
  error_code?: string | null;
  created_at: string;
  updated_at?: string;
};

export type DispatchDetail = {
  dispatch: Dispatch;
  events: DispatchEvent[];
  attempts: DispatchAttempt[];
  approval?: {
    fingerprint: string;
    expires_at: string;
    approval_kind?: "browser" | "expert";
  } | null;
  approvalRequest?: {
    requested_at: string;
    requested_by: string | null;
  } | null;
  activeSchedule?: Dispatch["activeSchedule"];
};

export type Sender = {
  id: string;
  channel: Channel;
  name?: string;
  address?: string;
  status?: string;
  mode?: string;
};

export type Overview = {
  documents: number;
  dispatches: { total: number } & Record<DispatchGroup, number>;
};

export type Usage = {
  period: string;
  currentPeriod: string;
  availablePeriods: string[];
  welcomeCredit: {
    kind: string;
    currency: string;
    grantedMinor: number;
    reservedMinor: number;
    spentMinor: number;
    availableMinor: number;
    status: string;
    topUpAvailable: boolean;
  };
  items: {
    channel: Channel;
    period: string;
    limit_count: number;
    reserved_count: number;
    confirmed_count: number;
    limit_minor: number;
    reserved_minor: number;
    confirmed_minor: number;
    currency: string;
  }[];
};
