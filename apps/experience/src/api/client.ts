import { API_ORIGIN } from "../config";

/**
 * Browser authority only. Every request goes to the Guteneo application
 * origin with its existing host-only session cookie; this experience never
 * sees, stores or forwards a credential. Writes add the session's CSRF token,
 * and the server still checks origin, membership and role on each call.
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public fields?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const SESSION_EXPIRED_EVENT = "guteneo-experience:session-expired";

let csrfToken = "";
let acceptLanguage = "fr";
// A changed identity or workspace makes every in-flight answer obsolete.
let authorityEpoch = 0;
let authorityIdentity: string | null = null;
const authorityListeners = new Set<() => void>();

export function setCsrfToken(token: string | null | undefined): void {
  csrfToken = token ?? "";
}

export function setRequestLocale(locale: string): void {
  acceptLanguage = locale;
}

export function advanceAuthority(): void {
  authorityEpoch += 1;
  authorityIdentity = null;
  csrfToken = "";
  for (const listener of authorityListeners) listener();
}

export function currentAuthority(): number {
  return authorityEpoch;
}

/** Only a successfully read server session may establish the current identity. */
export function synchronizeAuthority(identity: string): number {
  if (identity !== authorityIdentity) {
    advanceAuthority();
    authorityIdentity = identity;
  }
  return authorityEpoch;
}

export function subscribeAuthority(listener: () => void): () => void {
  authorityListeners.add(listener);
  return () => {
    authorityListeners.delete(listener);
  };
}

// Reading these while signed out is expected; it is not an expired session.
const PROBES = ["/session", "/personal/session", "/capabilities"];

function announceExpiry(path: string, status: number, epoch: number): void {
  if (status !== 401 || epoch !== authorityEpoch) return;
  if (PROBES.includes(path.split("?")[0] ?? "")) return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

function obsolete(): DOMException {
  return new DOMException(
    "This request belongs to a previous session.",
    "AbortError",
  );
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Idempotency key for a retried write of the same intent. */
  key?: string;
  signal?: AbortSignal;
};

async function send(
  path: string,
  options: RequestOptions,
  accept: string,
): Promise<{ response: Response; epoch: number }> {
  const epoch = authorityEpoch;
  const method = options.method ?? "GET";
  const form = options.body instanceof FormData;
  // A read carries only safelisted headers, so the browser needs no preflight.
  const headers: Record<string, string> = {
    Accept: accept,
    "Accept-Language": acceptLanguage,
  };
  if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  if (options.body !== undefined && !form)
    headers["Content-Type"] = "application/json";
  if (options.key) headers["Idempotency-Key"] = options.key;
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}/api${path}`, {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: options.signal,
      body:
        options.body === undefined
          ? undefined
          : form
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    });
  } catch (error) {
    if (epoch !== authorityEpoch) throw obsolete();
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError("NETWORK", "The service could not be reached.", 0);
  }
  if (epoch !== authorityEpoch) throw obsolete();
  return { response, epoch };
}

async function failure(
  response: Response,
  path: string,
  epoch: number,
): Promise<ApiError> {
  const data = (await response.json().catch(() => null)) as {
    error?: {
      code?: string;
      message?: string;
      fields?: { path: string; message: string }[];
    };
  } | null;
  if (epoch !== authorityEpoch) throw obsolete();
  announceExpiry(path, response.status, epoch);
  return new ApiError(
    data?.error?.code ?? "HTTP_ERROR",
    data?.error?.message ??
      `The service returned an error (${response.status}).`,
    response.status,
    data?.error?.fields,
  );
}

export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { response, epoch } = await send(path, options, "application/json");
  if (!response.ok) throw await failure(response, path, epoch);
  const data = (await response.json().catch(() => null)) as T;
  if (epoch !== authorityEpoch) throw obsolete();
  return data;
}

/** Private bytes (a PDF, a page image) read with the session, never by URL. */
export async function apiBlob(
  path: string,
  options: RequestOptions = {},
): Promise<Blob> {
  const { response, epoch } = await send(path, options, "*/*");
  if (!response.ok) throw await failure(response, path, epoch);
  const blob = await response.blob();
  if (epoch !== authorityEpoch) throw obsolete();
  return blob;
}

/** One key per user intent; a retry of the same intent reuses it. */
export function intentKey(): string {
  return crypto.randomUUID();
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
