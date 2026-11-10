import { msg } from "./messages";
import { invalidateClientLists } from "./client-resources";
import {
  formatLocale,
  initializeLocale,
  applyAccountLocale,
  t,
  getLocale,
} from "./locale";
import type { SupportedLocale } from "../../../packages/contracts/src/locale";
import type { DashboardAppearance } from "../../../packages/contracts/src/dashboard-appearance";
import type { ExpertApprovalAccount } from "../../../packages/contracts/src/expert-approval";
import type { FaxPricing } from "../../../packages/contracts/src/fax-pricing";
import type { DocumentAnalysis } from "../../../packages/contracts/src/document-analysis";
import type { DeliveryRecipient } from "../../../packages/contracts/src/content";
import {
  workspacePermissions,
  type WorkspacePermissions,
} from "../../../packages/contracts/src/roles";

export type Channel = "fax" | "email" | "postal";
export type Session = {
  organization: { id: string; name: string };
  user: {
    id: string;
    name: string;
    email?: string | null;
    role: string;
    supervisorCanApprove?: boolean;
    supervisorCanReport?: boolean;
    preferredLocale?: SupportedLocale | null;
    preferredDashboardAppearance?: DashboardAppearance;
  };
  csrfToken: string;
  simulation: boolean;
  verifiedAccount?: boolean;
  permissions?: WorkspacePermissions;
  canAccessBelvedere?: boolean;
};
export function permissionsFor(
  session: Pick<Session, "user" | "permissions">,
): WorkspacePermissions {
  return (
    session.permissions ??
    workspacePermissions(session.user.role, {
      canApprove: session.user.supervisorCanApprove,
      canReport: session.user.supervisorCanReport,
    })
  );
}
/** Billing, members and administration are reserved to the admin role. */
export function canAdminister(session: Pick<Session, "user">): boolean {
  return session.user.role === "admin";
}
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
  activeSchedule?: {
    id: string;
    status: "draft" | "approved" | "releasing" | "unknown";
    executeAt: string;
    maxTotalMinor: number;
  };
  recipient_feedback?: "unsubscribed" | "reported" | null;
  id: string;
  channel: Channel;
  recipient_json: string | DeliveryRecipient;
  document_id?: string;
  options_json?: string | Record<string, unknown>;
  sender_address?: string;
  subject?: string;
  html?: string;
  text?: string;
  status: string;
  mode: string;
  estimated_minor: number;
  ceiling_minor: number;
  quote_expires_at?: string | null;
  quote_customer_nanoeur?: number | null;
  faxPricing?: FaxPricing | null;
  quote_pricing_basis?:
    "qualified_final_variable_cost" | "public_list_price_ex_tax" | null;
  quote_fx?: {
    numerator: number;
    denominator: number;
    date: string;
    source: string;
  } | null;
  currency: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
  campaign_id?: string;
};
export type EventRecord = {
  id: string;
  type?: string;
  event_type?: string;
  status?: string;
  created_at: string;
  detail?: string;
  payload_json?: string;
};
export type DispatchDetail = {
  activeSchedule?: Dispatch["activeSchedule"];
  approval?: {
    fingerprint: string;
    expires_at: string;
    approval_kind?: "browser" | "expert";
  } | null;
  dispatch: Dispatch;
  events: EventRecord[];
  attempts: {
    id: string;
    provider?: string;
    status: string;
    created_at: string;
  }[];
};
export type Sender = {
  id: string;
  name?: string;
  channel: Channel;
  address?: string;
  email?: string;
  phone?: string;
  status?: string;
  verified?: boolean;
  configuration_json?: string;
};
export type Page<T> = { items: T[]; nextCursor: string | null };
export type ExpertApprovalSettings = ExpertApprovalAccount;
export type ExpertApprovalConnection =
  ExpertApprovalAccount["connections"][number];
export type ExpertApprovalPolicy = NonNullable<
  ExpertApprovalConnection["policy"]
>;

export const isPublicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === "true";

/**
 * Browser sessions expire server-side. Any later 401 is announced once to the
 * workspace so it can offer a reconnection that returns to the current page,
 * instead of leaving every screen with a technical error.
 */
export const SESSION_EXPIRED_EVENT = "guteneo:session-expired";
const sessionProbePaths = ["/session", "/logout", "/dev/login"];
function announceSessionExpiry(path: string, status: number, revision: number) {
  if (
    revision !== sessionRevision ||
    status !== 401 ||
    sessionProbePaths.includes(path.split("?")[0] ?? "")
  )
    return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

function assertRequestAuthority(revision: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (revision !== sessionRevision)
    throw new DOMException(
      "This request belongs to a previous session.",
      "AbortError",
    );
}

export async function getDocumentContent(
  id: string,
  signal?: AbortSignal,
  dispatchId?: string,
): Promise<Uint8Array> {
  const revision = sessionRevision;
  try {
    assertRequestAuthority(revision, signal);
    if (isPublicPreview) {
      const { publicPreview } = await import("./preview");
      assertRequestAuthority(revision, signal);
      const bytes = await publicPreview.documentContent(id);
      assertRequestAuthority(revision, signal);
      return bytes;
    }
    const response = await fetch(
      `/api/documents/${encodeURIComponent(id)}/content${dispatchId ? `?dispatchId=${encodeURIComponent(dispatchId)}` : ""}`,
      {
        credentials: "same-origin",
        signal,
      },
    );
    assertRequestAuthority(revision, signal);
    if (!response.ok) {
      announceSessionExpiry(
        `/documents/${id}/content`,
        response.status,
        revision,
      );
      throw new ApiError(
        "DOCUMENT_UNAVAILABLE",
        "This document cannot be displayed.",
        response.status,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertRequestAuthority(revision, signal);
    return bytes;
  } catch (error) {
    assertRequestAuthority(revision, signal);
    throw error;
  }
}

let csrfToken = "";
let sessionUserId: string | null = null;
let sessionAuthority = "";
let sessionRevision = 0;
let nextAuthorityKey = 0;
const authorityKeys = new Map<string, string>();
const authorityListeners = new Set<() => void>();
type AuthoritySession = {
  user: {
    id: string;
    role?: string;
    supervisorCanApprove?: boolean;
    supervisorCanReport?: boolean;
  };
  organization?: { id: string };
  csrfToken: string;
  permissions?: WorkspacePermissions;
  simulation?: boolean;
  verifiedAccount?: boolean;
  documentAccessAllowed?: boolean;
  documentAccessMode?: string;
  authenticationPolicyVersion?: string | null;
  strongAuthentication?: boolean;
};
function authoritySignature(session: AuthoritySession | null) {
  return session
    ? JSON.stringify([
        session.organization?.id ?? "personal",
        session.user.id,
        session.csrfToken,
        session.user.role,
        session.user.supervisorCanApprove,
        session.user.supervisorCanReport,
        session.permissions,
        session.simulation,
        session.verifiedAccount,
        session.documentAccessAllowed,
        session.documentAccessMode,
        session.authenticationPolicyVersion,
        session.strongAuthentication,
      ])
    : "";
}
/** Opaque in-memory identity. Call without an argument for the current epoch;
 * pass a Session for a stable canonical component scope. Never contains a token. */
export function sessionAuthorityKey(session?: AuthoritySession | null): string {
  if (session === undefined)
    return `${authorityKeys.get(sessionAuthority) ?? "signed-out"}:${sessionRevision}`;
  if (session === null) return "signed-out";
  const signature = authoritySignature(session);
  let key = authorityKeys.get(signature);
  if (!key) {
    key = `authority-${++nextAuthorityKey}`;
    authorityKeys.set(signature, key);
    if (authorityKeys.size > 64) {
      const oldest = [...authorityKeys.keys()].find(
        (candidate) => candidate !== sessionAuthority,
      );
      if (oldest !== undefined) authorityKeys.delete(oldest);
    }
  }
  return key;
}
export const getSessionAuthorityKey = () => sessionAuthorityKey();
export function subscribeSessionAuthority(listener: () => void) {
  authorityListeners.add(listener);
  return () => {
    authorityListeners.delete(listener);
  };
}
export function setSession(session: Session | null, applyPreference = true) {
  const authority = authoritySignature(session);
  // Identity/authority changes supersede old requests, even after A -> B -> A.
  // Reapplying the same session on navigation must still allow current expiry.
  const changed = authority !== sessionAuthority;
  if (changed) {
    sessionRevision += 1;
    invalidateClientLists(true);
  }
  sessionAuthority = authority;
  sessionAuthorityKey(session);
  csrfToken = session?.csrfToken ?? "";
  if (applyPreference && session)
    applyAccountLocale(session.user.preferredLocale);
  else if (
    applyPreference &&
    sessionUserId !== (session?.user.id ?? null) &&
    typeof window !== "undefined"
  )
    initializeLocale(true);
  sessionUserId = session?.user.id ?? null;
  if (changed) for (const listener of authorityListeners) listener();
}
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const revision = sessionRevision;
  const mutation = (init.method ?? "GET") !== "GET";
  if (mutation) invalidateClientLists();
  try {
    assertRequestAuthority(revision, init.signal);
    if (isPublicPreview) {
      const { publicPreview, PreviewError } = await import("./preview");
      assertRequestAuthority(revision, init.signal);
      try {
        const data = await publicPreview.request(path, init);
        assertRequestAuthority(revision, init.signal);
        return data as T;
      } catch (error) {
        assertRequestAuthority(revision, init.signal);
        if (error instanceof PreviewError)
          throw new ApiError(error.code, error.message, error.status);
        throw error;
      }
    }
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Language": getLocale(),
    };
    const method = init.method ?? "GET";
    const form = init.body instanceof FormData;
    if (init.body !== undefined && !form)
      headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
    if (init.key) headers["Idempotency-Key"] = init.key;
    let response: Response;
    try {
      assertRequestAuthority(revision, init.signal);
      response = await fetch(`/api${path}`, {
        method,
        headers,
        credentials: "same-origin",
        body:
          init.body === undefined
            ? undefined
            : form
              ? (init.body as FormData)
              : JSON.stringify(init.body),
        signal: init.signal,
      });
    } catch (error) {
      assertRequestAuthority(revision, init.signal);
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      throw new ApiError(
        "NETWORK",
        "Connection interrupted. Refresh the status before repeating an operation.",
        0,
      );
    }
    assertRequestAuthority(revision, init.signal);
    const data: unknown = await response.json().catch(() => null);
    // A session/account change can abort while an already received body is
    // parsing. Such a response must not expire the new session or update its UI.
    assertRequestAuthority(revision, init.signal);
    if (!response.ok) {
      announceSessionExpiry(path, response.status, revision);
      const failure = data as {
        error?: { code?: string; message?: string };
      } | null;
      throw new ApiError(
        failure?.error?.code ?? "HTTP_ERROR",
        failure?.error?.message ??
          msg("The service returned an error ({0}).", response.status),
        response.status,
      );
    }
    return data as T;
  } catch (error) {
    assertRequestAuthority(revision, init.signal);
    throw error;
  } finally {
    if (mutation) invalidateClientLists();
  }
}
export type RecipientView = {
  [field: string]: string | string[] | undefined;
  email?: string;
  phone?: string;
  name?: string;
  line1?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  addressLines?: string[];
};
export function recipientOf(dispatch: Dispatch): RecipientView {
  try {
    const value: unknown =
      typeof dispatch.recipient_json === "string"
        ? JSON.parse(dispatch.recipient_json)
        : dispatch.recipient_json;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key, item]) =>
          typeof item === "string" ||
          (key === "addressLines" &&
            Array.isArray(item) &&
            item.every((line) => typeof line === "string")),
      ),
    ) as RecipientView;
  } catch {
    return {};
  }
}
export function recipientDisplayLines(recipient: unknown): string[] {
  if (!recipient || typeof recipient !== "object" || Array.isArray(recipient))
    return [];
  const value = recipient as Record<string, unknown>;
  if (
    Array.isArray(value.addressLines) &&
    value.addressLines.every((line) => typeof line === "string")
  )
    return value.addressLines;
  return Object.values(value).filter(
    (line): line is string => typeof line === "string" && !!line,
  );
}
export function recipientLabel(dispatch: Dispatch): string {
  const r = recipientOf(dispatch);
  return (
    r.email ??
    r.phone ??
    (r.addressLines
      ? [r.addressLines[0], r.country]
      : [r.name, r.city, r.country]
    )
      .filter(Boolean)
      .join(", ")
  );
}
/** A scheduled source retains its immutable business status while its active
 * future workflow controls the presentation and available actions. */
export function dispatchPresentationStatus(dispatch: Dispatch): string {
  const status = dispatch.activeSchedule?.status;
  return status
    ? ({
        draft: "schedule_draft",
        approved: "scheduled",
        releasing: "schedule_releasing",
        unknown: "schedule_unknown",
      }[status] ?? "schedule_unknown")
    : dispatch.status;
}
export function date(value?: string): string {
  if (!value) return t.unknown;
  const d = new Date(
    value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value)
      ? value
      : value.includes("T")
        ? `${value}Z`
        : `${value.replace(" ", "T")}Z`,
  );
  return Number.isNaN(d.getTime())
    ? value
    : new Intl.DateTimeFormat(formatLocale(), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
}
/**
 * Native validation for a euro amount typed with either decimal mark, the
 * format euroToMinor() reads. Amount fields are text fields: a number field
 * drops the comma in some browsers, so Chromium turns "1,5" into "15".
 */
export const EURO_INPUT_PATTERN = "\\s*\\d{1,5}(?:[.,]\\d{1,2})?\\s*";
/** Integer cents shown in an amount field, using the interface decimal mark. */
export function minorToEuroInput(minor: number): string {
  return Number.isInteger(minor / 100)
    ? String(minor / 100)
    : (minor / 100).toFixed(2).replace(".", getLocale() === "en" ? "." : ",");
}
/** Euros typed by a person, to integer cents; null when not a valid amount. */
export function euroToMinor(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(normalized)) return null;
  const minor = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(minor) && minor <= 1_000_000 ? minor : null;
}
// Separators are accepted while typing; the server applies the same rule.
export { normalizeFaxNumber } from "../../../packages/contracts/src/fax-number";
/**
 * Native validation while typing: "+", then digits with optional spaces,
 * dots, dashes or a "(0)" trunk prefix. The server has the final word.
 */
export const FAX_INPUT_PATTERN =
  "\\s*\\+[1-9](?:[ .\\-\\u00a0\\u202f]?(?:[0-9]|\\(0\\))){7,16}\\s*";
export function money(minor: number, currency = "EUR"): string {
  return new Intl.NumberFormat(formatLocale(), {
    style: "currency",
    currency,
  }).format(minor / 100);
}

/** Display the frozen quote without rounding each small email to one cent. */
export function quotedMoney(
  dispatch: Pick<
    Dispatch,
    "quote_customer_nanoeur" | "estimated_minor" | "currency" | "options_json"
  >,
): string {
  const nano = dispatch.quote_customer_nanoeur;
  if (
    dispatch.currency !== "EUR" ||
    nano == null ||
    !Number.isSafeInteger(nano) ||
    nano < 0
  )
    return money(dispatch.estimated_minor, dispatch.currency);
  try {
    const options =
      typeof dispatch.options_json === "string"
        ? JSON.parse(dispatch.options_json)
        : dispatch.options_json;
    const hostingFee =
      options?.emailDeliveryMode === "protected_link"
        ? options.protectedDocument?.hostingFeeMinor
        : 0;
    if (
      options?.emailDeliveryMode === "protected_link" &&
      hostingFee !== 0 &&
      hostingFee !== 100
    )
      return money(dispatch.estimated_minor, dispatch.currency);
    return nanoMoney(nano + (hostingFee ?? 0) * 10_000_000);
  } catch {
    return money(dispatch.estimated_minor, dispatch.currency);
  }
}

/** Preserve the same precision as the shared fractional credit ledger. */
export function nanoMoney(nano: number): string {
  if (!Number.isSafeInteger(nano) || nano < 0) return t.unknown;
  const amount = BigInt(nano);
  const formatter = new Intl.NumberFormat(formatLocale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
  const parts = formatter.formatToParts(amount / 1_000_000_000n);
  const fraction = (amount % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return parts
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
export function bytes(size: number): string {
  const units =
    getLocale() === "fr" ? ["octets", "Ko", "Mo"] : ["B", "KB", "MB"];
  const index = size < 1024 ? 0 : size < 1024 * 1024 ? 1 : 2;
  const value = new Intl.NumberFormat(formatLocale(), {
    minimumFractionDigits: index ? 1 : 0,
    maximumFractionDigits: index ? 1 : 0,
  }).format(size / 1024 ** index);
  return `${value} ${units[index]}`;
}
