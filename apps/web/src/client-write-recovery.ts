import { useCallback, useEffect, useRef } from "react";
import {
  clientNavigationRevision,
  subscribeClientNavigation,
} from "./client-navigation";
import { sessionAuthorityKey } from "./api";

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
  const lifetime = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeClientNavigation(() => undefined);
    return () => {
      mounted.current = false;
      lifetime.current += 1;
      unsubscribe();
    };
  }, []);
  return useCallback(() => {
    const startedAt = clientNavigationRevision();
    const mountedAt = lifetime.current;
    const authority = sessionAuthorityKey();
    const href = window.location.href;
    return () =>
      mounted.current &&
      currentScope.current === scope &&
      lifetime.current === mountedAt &&
      sessionAuthorityKey() === authority &&
      clientNavigationRevision() === startedAt &&
      window.location.href === href;
  }, [scope]);
}
