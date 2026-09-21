import { useEffect, useState } from "react";
import { api, ApiError, type Dispatch } from "./api";
import { go } from "./components";

/** Only the explicit still-analysing result is retried. Neither a transfer nor
 * an approval/send is triggered here, and uncertain responses stop the loop. */
export function usePostalQuote(path: string, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<Error>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    setPending(true);
    setPaused(false);
    setError(undefined);
    async function request() {
      attempts++;
      try {
        const dispatch = await api<Dispatch>(`${path}/quote`, {
          method: "POST",
          // A reload/back navigation resumes the same preparation as well.
          key: `web-postal-quote:${path}`,
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          go(`/app/dispatch/${encodeURIComponent(dispatch.id)}`);
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (
          failure instanceof ApiError &&
          failure.code === "POSTAL_DRAFT_NOT_READY"
        ) {
          if (attempts < 20) {
            timer = setTimeout(() => void request(), 3000);
            return;
          }
          setPaused(true);
        } else {
          setError(
            failure instanceof Error ? failure : new Error(String(failure)),
          );
        }
        setPending(false);
      }
    }
    // Defer the initial request so development StrictMode cannot launch it twice.
    timer = setTimeout(() => void request(), 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, enabled, revision]);
  return {
    pending: enabled && pending,
    paused,
    error,
    retry: () => setRevision((value) => value + 1),
  };
}
