import { ApiError, isPublicPreview } from "./api";
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
  canAccessBelvedere?: boolean;
  mfa: boolean;
  strongAuthentication: boolean;
  documentAccessAllowed?: boolean;
  documentAccessMode?: "strong" | "verified_account";
  authenticationPolicyVersion: string | null;
  amr: string[];
  acr: string | null;
  verifiedAccount: boolean;
  authenticatedAt: number | null;
  workspaces: { id: string; name: string; role: string; current: boolean }[];
};

/** A single entry read; never cached across personal-area visits or identities. */
export type PersonalSessionRead = {
  result: Promise<
    | { session: PersonalSession; error?: never }
    | { error: Error; session?: never }
  >;
  signal: AbortSignal;
};

async function localPreview() {
  if (
    !isPublicPreview ||
    !import.meta.env.DEV ||
    typeof location === "undefined" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)
  )
    return null;
  const [{ publicPreview, PreviewError }, { createPreviewPersonal }] =
    await Promise.all([import("./preview"), import("./preview-personal")]);
  if (!publicPreview.advancedLocal)
    throw new ApiError(
      "PREVIEW_LOCAL_ONLY",
      "The fictional personal area is unavailable in this context.",
      403,
    );
  return { adapter: createPreviewPersonal(publicPreview), PreviewError };
}

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
  const local = await localPreview();
  if (local) {
    try {
      return (await local.adapter.request(path, {
        ...init,
        csrfToken: session?.csrfToken,
      })) as T;
    } catch (error) {
      if (error instanceof local.PreviewError)
        throw new ApiError(error.code, error.message, error.status);
      throw error;
    }
  }
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
        "Connection interrupted. Refresh the status before repeating an operation.",
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
        msg("The service returned an error ({0}).", response.status),
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
  const local = await localPreview();
  if (local) {
    try {
      const value = await local.adapter.blob(path, {
        ...init,
        csrfToken: session.csrfToken,
      });
      if (
        (init.expectedType === "image" &&
          !["image/png", "image/jpeg", "image/webp"].includes(value.type)) ||
        (init.expectedType === "pdf" && value.type !== "application/pdf")
      )
        throw new ApiError(
          "DOCUMENT_UNAVAILABLE",
          msg("This document cannot be displayed."),
          502,
        );
      return value;
    } catch (error) {
      if (error instanceof local.PreviewError)
        throw new ApiError(error.code, error.message, error.status);
      throw error;
    }
  }
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
        "Connection interrupted. Refresh the status before repeating an operation.",
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
      data?.error?.message ?? msg("This document cannot be displayed."),
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
      msg("This document cannot be displayed."),
      502,
    );
  return response.blob();
}
