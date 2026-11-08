import { useEffect, useState } from "react";
import { api, ApiError, type Dispatch } from "./api";
import { go } from "./components";
import { useCurrentClientView } from "./client-write-recovery";
import {
  postalQuoteOutcome,
  type PostalQuoteState,
} from "./postal-quote-state";

/** Only the explicit still-analysing result is retried. Neither a transfer nor
 * an approval/send is triggered here, and uncertain responses stop the loop. */
export function usePostalQuote(path: string, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    state: PostalQuoteState;
  }>({ path, state: { phase: "idle" } });
  const currentView = useCurrentClientView(path);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const isCurrent = currentView();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    setResult({ path, state: { phase: "pending", attempts: 0 } });
    async function request() {
      attempts++;
      try {
        const dispatch = await api<Dispatch>(`${path}/quote`, {
          method: "POST",
          // A reload/back navigation resumes the same preparation as well.
          key: `web-postal-quote:${path}`,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!isCurrent()) {
          setResult({ path, state: { phase: "paused" } });
          return;
        }
        go(`/app/dispatch/${encodeURIComponent(dispatch.id)}`);
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (!isCurrent()) {
          setResult({ path, state: { phase: "paused" } });
          return;
        }
        const outcome = postalQuoteOutcome(
          attempts,
          failure instanceof ApiError &&
            failure.code === "POSTAL_DRAFT_NOT_READY"
            ? "not_ready"
            : failure instanceof Error
              ? failure
              : new Error(String(failure)),
        );
        setResult({ path, state: outcome });
        if (outcome.phase === "pending")
          timer = setTimeout(() => void request(), 3000);
      }
    }
    // Defer the initial request so development StrictMode cannot launch it twice.
    timer = setTimeout(() => void request(), 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, enabled, revision, currentView]);
  const state: PostalQuoteState =
    enabled && result.path === path ? result.state : { phase: "idle" };
  return {
    pending: state.phase === "pending",
    paused: state.phase === "paused",
    error: state.phase === "failed" ? state.error : undefined,
    retry: () => setRevision((value) => value + 1),
  };
}
