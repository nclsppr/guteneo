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
  cancel: () => void;
};
let workspace: InitialRead<Session> | undefined;
let personal: InitialRead<PersonalSession> | undefined;

class InitialSessionObsoleteError extends DOMException {
  constructor() {
    super("The initial session belongs to an obsolete entry.", "AbortError");
  }
}
export function isInitialSessionObsolete(error: unknown) {
  return error instanceof InitialSessionObsoleteError;
}

/** Parsing and test transports may ignore abort; release the entry immediately
 * while retaining rejection handlers on the obsolete underlying request. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    work.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(signal.reason);
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(signal.aborted ? signal.reason : error);
      },
    );
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

function initialRead<T>(
  read: (signal: AbortSignal) => Promise<T>,
): InitialRead<T> {
  const controller = new AbortController();
  const promise = untilAborted(read(controller.signal), controller.signal);
  const value: InitialRead<T> = {
    href: window.location.href,
    promise,
    invalid: false,
    authority: getSessionAuthorityKey(),
    navigation: clientNavigationRevision(),
    dispose: () => undefined,
    cancel: () => undefined,
  };
  const invalidate = () => {
    value.invalid = true;
    controller.abort(new InitialSessionObsoleteError());
  };
  const navigation = subscribeClientNavigation(invalidate);
  const authority = subscribeSessionAuthority(invalidate);
  window.addEventListener("focus", invalidate);
  document.addEventListener("visibilitychange", invalidate);
  const expiry = setTimeout(() => {
    value.invalid = true;
    controller.abort(new DOMException("Initial session expired", "AbortError"));
    value.dispose();
  }, 10_000);
  value.dispose = () => {
    value.invalid = true;
    clearTimeout(expiry);
    navigation();
    authority();
    window.removeEventListener("focus", invalidate);
    document.removeEventListener("visibilitychange", invalidate);
  };
  value.cancel = () => {
    invalidate();
    value.dispose();
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
  workspace?.cancel();
  workspace = initialRead((signal) => api<Session>("/session", { signal }));
  return workspace.promise;
}
export function startInitialPersonalSession() {
  personal?.cancel();
  personal = initialRead((signal) =>
    personalApi<PersonalSession>("/personal/session", undefined, { signal }),
  );
  return personal.promise;
}

export function initialSessionIsCurrent(promise: Promise<unknown>) {
  return Boolean(
    (workspace?.promise === promise && usable(workspace)) ||
    (personal?.promise === promise && usable(personal)),
  );
}
export async function readInitialWorkspaceSession(signal: AbortSignal) {
  const initial = usable(workspace) ? workspace : undefined;
  if (initial)
    setTimeout(() => {
      initial.dispose();
      if (workspace === initial) workspace = undefined;
    }, 0);
  const value = await untilAborted(
    initial?.promise ?? api<Session>("/session", { signal }),
    signal,
  );
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
  const value = await untilAborted(
    initial?.promise ??
      personalApi<PersonalSession>("/personal/session", undefined, { signal }),
    signal,
  );
  signal.throwIfAborted();
  return initial?.invalid
    ? personalApi<PersonalSession>("/personal/session", undefined, { signal })
    : value;
}
