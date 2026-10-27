import { getLocale } from "./locale";

function workspaceReturnTo(path: string): string {
  const route = path.startsWith("/#")
    ? path.slice(2)
    : path.startsWith("#")
      ? path.slice(1)
      : path;
  return route.length <= 2048 &&
    /^\/app(?:[/?]|$)/.test(route) &&
    !/[\\\u0000-\u0020]/.test(route)
    ? `/#${route}`
    : "/#/app";
}

/** A fresh browser sign-in returns to the current share without resuming a write. */
export function freshWorkspaceAuthenticationHref(): string {
  const path =
    typeof window === "undefined"
      ? "/app"
      : window.location.hash || window.location.pathname;
  // Only a persisted application path crosses the sign-in handoff. Query and
  // secondary fragment values may contain invitation secrets or private input.
  const route = path.replace(/^#/, "").split(/[?#]/)[0] ?? "/app";
  return `/auth/login?${new URLSearchParams({
    fresh: "1",
    locale: getLocale(),
    returnTo: workspaceReturnTo(route),
  })}`;
}

/** Public entry points go straight to the hosted sign-in, including in SSR. */
export function workspaceEntryHref(path = "/app"): string {
  const local =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  if (import.meta.env.VITE_PUBLIC_PREVIEW === "true" || local) return path;
  const returnTo = workspaceReturnTo(path);
  return `/auth/login?${new URLSearchParams({ locale: getLocale(), returnTo })}`;
}
