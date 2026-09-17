import type { FaxPricing } from "../../../packages/contracts/src/fax-pricing";

export type Channel = "fax" | "email" | "postal";
export type Session = {
  organization: { id: string; name: string };
  user: { id: string; name: string; role: string };
  csrfToken: string;
  simulation: boolean;
  verifiedAccount?: boolean;
};
export type DocumentRecord = {
  id: string;
  name: string;
  sha256: string;
  size: number;
  pages: number;
  status: string;
  source: string;
  created_at: string;
};
export type Dispatch = {
  id: string;
  channel: Channel;
  recipient_json: string | Record<string, string>;
  document_id?: string;
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
  approval?: { fingerprint: string; expires_at: string } | null;
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
export type ExpertApprovalPolicy = {
  enabled: boolean;
  revision: number;
  channels: Channel[];
  maxPerDispatchMinor: number;
  maxDailyMinor: number;
  maxDailyCount: number;
  expiresAt: string;
  updatedAt: string;
};
export type ExpertApprovalConnection = {
  connectionId: string;
  clientId: string;
  status: "active" | "revoked";
  policy: ExpertApprovalPolicy | null;
  usage: { count: number; ceilingMinor: number };
};
export type ExpertApprovalSettings = {
  canManage: boolean;
  day: string;
  connections: ExpertApprovalConnection[];
};

export const isPublicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === "true";

export async function getDocumentContent(
  id: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (isPublicPreview) {
    signal?.throwIfAborted();
    const { publicPreview } = await import("./preview");
    const bytes = await publicPreview.documentContent(id);
    signal?.throwIfAborted();
    return bytes;
  }
  const response = await fetch(
    `/api/documents/${encodeURIComponent(id)}/content`,
    {
      credentials: "same-origin",
      signal,
    },
  );
  if (!response.ok)
    throw new ApiError(
      "DOCUMENT_UNAVAILABLE",
      "Ce document ne peut pas être affiché.",
      response.status,
    );
  return new Uint8Array(await response.arrayBuffer());
}

let csrfToken = "";
export function setSession(session: Session | null) {
  csrfToken = session?.csrfToken ?? "";
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
  if (isPublicPreview) {
    const { publicPreview, PreviewError } = await import("./preview");
    try {
      return (await publicPreview.request(path, init)) as T;
    } catch (error) {
      if (error instanceof PreviewError)
        throw new ApiError(error.code, error.message, error.status);
      throw error;
    }
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  const method = init.method ?? "GET";
  const form = init.body instanceof FormData;
  if (init.body !== undefined && !form)
    headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  if (init.key) headers["Idempotency-Key"] = init.key;
  let response: Response;
  try {
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
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "NETWORK",
      "Connexion interrompue. Actualisez le suivi avant de recommencer une opération.",
      0,
    );
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = data as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      failure?.error?.code ?? "HTTP_ERROR",
      failure?.error?.message ??
        `Le service a répondu avec une erreur (${response.status}).`,
      response.status,
    );
  }
  return data as T;
}
export function recipientOf(dispatch: Dispatch): Record<string, string> {
  if (typeof dispatch.recipient_json !== "string")
    return dispatch.recipient_json ?? {};
  try {
    return JSON.parse(dispatch.recipient_json) as Record<string, string>;
  } catch {
    return {};
  }
}
export function recipientLabel(dispatch: Dispatch): string {
  const r = recipientOf(dispatch);
  return (
    r.email ?? r.phone ?? [r.name, r.city, r.country].filter(Boolean).join(", ")
  );
}
export function date(value?: string): string {
  if (!value) return "Non disponible";
  const d = new Date(
    value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value)
      ? value
      : value.includes("T")
        ? `${value}Z`
        : `${value.replace(" ", "T")}Z`,
  );
  return Number.isNaN(d.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
}
export function money(minor: number, currency = "EUR"): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(
    minor / 100,
  );
}

/** Display the frozen quote without rounding each small email to one cent. */
export function quotedMoney(
  dispatch: Pick<
    Dispatch,
    "quote_customer_nanoeur" | "estimated_minor" | "currency"
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
  return nanoMoney(nano);
}

/** Preserve the same precision as the shared fractional credit ledger. */
export function nanoMoney(nano: number): string {
  if (!Number.isSafeInteger(nano) || nano < 0) return "Indisponible";
  const amount = BigInt(nano);
  const whole = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(amount / 1_000_000_000n);
  const fraction = (amount % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${whole},${fraction}\u00a0€`;
}
export function bytes(size: number): string {
  return size < 1024
    ? `${size} octets`
    : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} Ko`
      : `${(size / 1024 / 1024).toFixed(1)} Mo`;
}
