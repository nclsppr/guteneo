import { ApiError } from "./api";
import { getLocale } from "./locale";
import { msg } from "./messages";
import type { SupportedLocale } from "../../../packages/contracts/src/locale";
import type { DashboardAppearance } from "../../../packages/contracts/src/dashboard-appearance";

export type PersonalSession = {
  user: {
    id: string;
    name: string;
    email: string;
    preferredLocale?: SupportedLocale | null;
    preferredDashboardAppearance?: DashboardAppearance | null;
  };
  csrfToken: string;
  simulation: boolean;
  mfa: boolean;
  strongAuthentication: boolean;
  authenticationPolicyVersion: string | null;
  amr: string[];
  acr: string | null;
  verifiedAccount: boolean;
  authenticatedAt: number | null;
  workspaces: { id: string; name: string; role: string; current: boolean }[];
};

export async function personalApi<T>(
  path: string,
  session?: Pick<PersonalSession, "csrfToken">,
  init: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": getLocale(),
  };
  if (method !== "GET") headers["X-CSRF-Token"] = session?.csrfToken ?? "";
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.key) headers["Idempotency-Key"] = init.key;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: init.signal,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "NETWORK",
      msg(
        "Connexion interrompue. Actualisez le suivi avant de recommencer une opération.",
      ),
      0,
    );
  }
  const data = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  init.signal?.throwIfAborted();
  if (!response.ok)
    throw new ApiError(
      data?.error?.code ?? "HTTP_ERROR",
      data?.error?.message ??
        msg("Le service a répondu avec une erreur ({0}).", response.status),
      response.status,
    );
  return data as T;
}

/** Fetch private binary content without putting credentials into a URL. */
export async function personalBlob(
  path: string,
  session: Pick<PersonalSession, "csrfToken">,
  init: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
    expectedType?: "image" | "pdf";
  } = {},
): Promise<Blob> {
  const method = init.method ?? "GET";
  const headers: Record<string, string> = { "Accept-Language": getLocale() };
  if (method !== "GET") headers["X-CSRF-Token"] = session.csrfToken;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.key) headers["Idempotency-Key"] = init.key;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: init.signal,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new ApiError(
      "NETWORK",
      msg(
        "Connexion interrompue. Actualisez le suivi avant de recommencer une opération.",
      ),
      0,
    );
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      data?.error?.code ?? "DOCUMENT_UNAVAILABLE",
      data?.error?.message ?? msg("Ce document ne peut pas être affiché."),
      response.status,
    );
  }
  const type = response.headers.get("Content-Type")?.split(";")[0];
  if (
    (init.expectedType === "image" &&
      !["image/png", "image/jpeg", "image/webp"].includes(type ?? "")) ||
    (init.expectedType === "pdf" && type !== "application/pdf")
  )
    throw new ApiError(
      "DOCUMENT_UNAVAILABLE",
      msg("Ce document ne peut pas être affiché."),
      502,
    );
  return response.blob();
}
