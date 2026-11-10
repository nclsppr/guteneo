import {
  api,
  getSessionAuthorityKey,
  subscribeSessionAuthority,
  type Session,
} from "./api";
import { personalApi, type PersonalSession } from "./personal-api";
import {
  clientNavigationRevision,
  subscribeClientNavigation,
} from "./client-navigation";

type InitialRead<T> = {
  href: string;
  promise: Promise<T>;
  invalid: boolean;
  authority: string;
  navigation: number;
  dispose: () => void;
};
let workspace: InitialRead<Session> | undefined;
let personal: InitialRead<PersonalSession> | undefined;
function initialRead<T>(promise: Promise<T>): InitialRead<T> {
  const value: InitialRead<T> = {
    href: window.location.href,
    promise,
    invalid: false,
    authority: getSessionAuthorityKey(),
    navigation: clientNavigationRevision(),
    dispose: () => undefined,
  };
  const invalidate = () => {
    value.invalid = true;
  };
  const navigation = subscribeClientNavigation(invalidate);
  const authority = subscribeSessionAuthority(invalidate);
  window.addEventListener("focus", invalidate);
  document.addEventListener("visibilitychange", invalidate);
  const expiry = setTimeout(() => value.dispose(), 10_000);
  value.dispose = () => {
    value.invalid = true;
    clearTimeout(expiry);
    navigation();
    authority();
    window.removeEventListener("focus", invalidate);
    document.removeEventListener("visibilitychange", invalidate);
  };
  return value;
}
const usable = <T>(initial: InitialRead<T> | undefined) =>
  initial &&
  !initial.invalid &&
  initial.href === window.location.href &&
  initial.authority === getSessionAuthorityKey() &&
  initial.navigation === clientNavigationRevision();

/** Entry-only handoff, not a reusable authentication cache. React StrictMode's
 * two immediate subscriptions share it; later revalidation always uses HTTP. */
export function startInitialWorkspaceSession() {
  const promise = api<Session>("/session");
  workspace?.dispose();
  workspace = initialRead(promise);
  return promise;
}
export function startInitialPersonalSession() {
  const promise = personalApi<PersonalSession>("/personal/session");
  personal?.dispose();
  personal = initialRead(promise);
  return promise;
}
export async function readInitialWorkspaceSession(signal: AbortSignal) {
  const initial = usable(workspace) ? workspace : undefined;
  if (initial)
    setTimeout(() => {
      initial.dispose();
      if (workspace === initial) workspace = undefined;
    }, 0);
  const value = await (initial?.promise ??
    api<Session>("/session", { signal }));
  signal.throwIfAborted();
  return initial?.invalid ? api<Session>("/session", { signal }) : value;
}
export async function readInitialPersonalSession(signal: AbortSignal) {
  const initial = usable(personal) ? personal : undefined;
  if (initial)
    setTimeout(() => {
      initial.dispose();
      if (personal === initial) personal = undefined;
    }, 0);
  const value = await (initial?.promise ??
    personalApi<PersonalSession>("/personal/session", undefined, { signal }));
  signal.throwIfAborted();
  return initial?.invalid
    ? personalApi<PersonalSession>("/personal/session", undefined, { signal })
    : value;
}
