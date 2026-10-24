import { getLocale } from "./locale";

/** Public entry points go straight to the hosted sign-in, including in SSR. */
export function workspaceEntryHref(path = "/app"): string {
  const local =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  if (import.meta.env.VITE_PUBLIC_PREVIEW === "true" || local) return path;
  const route = path.startsWith("/#")
    ? path.slice(2)
    : path.startsWith("#")
      ? path.slice(1)
      : path;
  const returnTo = /^\/app(?:[/?]|$)/.test(route) ? `/#${route}` : "/#/app";
  return `/auth/login?${new URLSearchParams({ locale: getLocale(), returnTo })}`;
}
