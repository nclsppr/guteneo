declare const __GUTENEO_API_ORIGIN__: string;

/** The Guteneo application origin: every API call and sign-in goes there. */
export const API_ORIGIN: string = __GUTENEO_API_ORIGIN__;

/** The proper name of this experience; the host name stays configuration. */
export const EXPERIENCE_NAME = "gare";

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Local development entry is only ever offered against a loopback API. */
export const API_IS_LOOPBACK = LOOPBACK_HOSTS.includes(
  new URL(API_ORIGIN).hostname,
);

/** A page of the main web application, for the few journeys that stay there. */
export function classicUrl(route: string): string {
  return `${API_ORIGIN}/#${route.startsWith("/") ? route : `/${route}`}`;
}

/**
 * Sign-in always happens on the application origin. The bridge path hands
 * the browser back to this experience at `path` once the session exists.
 */
export function signInUrl(
  path: string,
  locale: string,
  options: { signup?: boolean; fresh?: boolean; switchAccount?: boolean } = {},
): string {
  const url = new URL(
    options.signup ? "/auth/signup" : "/auth/login",
    API_ORIGIN,
  );
  url.searchParams.set(
    "returnTo",
    `/auth/experience?path=${encodeURIComponent(path)}`,
  );
  url.searchParams.set("locale", locale);
  if (options.fresh) url.searchParams.set("fresh", "1");
  if (options.switchAccount) url.searchParams.set("intent", "switch-account");
  return url.href;
}
