import { useCallback, useEffect, useRef } from "react";
import { BEFORE_WORKSPACE_NAVIGATION } from "./components";

export type WriteRecovery =
  "ready" | "writing" | "read_required" | "reading" | "quote_invalid";
export type WriteRecoveryEvent =
  | "write"
  | "written"
  | "uncertain"
  | "invalidate_quote"
  | "read"
  | "read_failed"
  | "reconciled";

/** Only a fresh status read can reopen a write whose result is unknown. */
export function writeRecoveryTransition(
  state: WriteRecovery,
  event: WriteRecoveryEvent,
): WriteRecovery {
  switch (event) {
    case "write":
      return state === "ready" ? "writing" : state;
    case "written":
      return state === "writing" ? "ready" : state;
    case "uncertain":
      return state === "writing" ? "read_required" : state;
    case "invalidate_quote":
      return state === "writing" ? "quote_invalid" : state;
    case "read":
      return state === "writing" || state === "quote_invalid"
        ? state
        : "reading";
    case "read_failed":
      return state === "reading" ? "read_required" : state;
    case "reconciled":
      return state === "reading" ? "ready" : state;
  }
}

/** Capture each operation, including leaving and returning to the same address.
 * A vetoed dirty-form navigation does not abandon the current operation. */
export function useCurrentClientView(scope: string) {
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mounted = useRef(true);
  const revision = useRef(0);
  const activeHref = useRef("");
  const navigationGuards = useRef(new Map<string, Event>());
  useEffect(() => {
    mounted.current = true;
    activeHref.current = window.location.href;
    const acceptedNavigation = (event: Event) => {
      navigationGuards.current.set(window.location.href, event);
      queueMicrotask(() => {
        if (!event.defaultPrevented) {
          revision.current += 1;
          activeHref.current = window.location.href;
        }
      });
    };
    const changedLocation = (event?: Event) => {
      const observed = event as HashChangeEvent | undefined;
      queueMicrotask(() => {
        const guard = observed?.newURL
          ? navigationGuards.current.get(observed.newURL)
          : undefined;
        if (observed?.newURL) navigationGuards.current.delete(observed.newURL);
        if (guard?.defaultPrevented) return;
        if (
          (observed?.oldURL && observed.oldURL !== observed.newURL) ||
          activeHref.current !== window.location.href
        ) {
          revision.current += 1;
          activeHref.current = window.location.href;
        }
      });
    };
    const historyChanged = () => setTimeout(changedLocation, 0);
    window.addEventListener(BEFORE_WORKSPACE_NAVIGATION, acceptedNavigation);
    window.addEventListener("hashchange", changedLocation);
    window.addEventListener("popstate", historyChanged);
    return () => {
      mounted.current = false;
      revision.current += 1;
      window.removeEventListener(
        BEFORE_WORKSPACE_NAVIGATION,
        acceptedNavigation,
      );
      window.removeEventListener("hashchange", changedLocation);
      window.removeEventListener("popstate", historyChanged);
    };
  }, []);
  return useCallback(() => {
    const startedAt = revision.current;
    const href = window.location.href;
    return () =>
      mounted.current &&
      currentScope.current === scope &&
      revision.current === startedAt &&
      window.location.href === href;
  }, [scope]);
}
