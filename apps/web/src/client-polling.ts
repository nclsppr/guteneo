import { useEffect, useRef } from "react";

const visibilityListeners = new Set<() => void>();
function visible() {
  return document.visibilityState !== "hidden";
}
function announceVisibility() {
  for (const listener of visibilityListeners) listener();
}
function subscribeVisibility(listener: () => void) {
  if (!visibilityListeners.size)
    document.addEventListener("visibilitychange", announceVisibility);
  visibilityListeners.add(listener);
  return () => {
    visibilityListeners.delete(listener);
    if (!visibilityListeners.size)
      document.removeEventListener("visibilitychange", announceVisibility);
  };
}

export type ReadPollingOptions = {
  enabled: boolean;
  scope: string;
  intervalMs: number;
  maxIntervalMs?: number;
  loading: boolean;
  progress: string;
};

/** Read-only polling: unchanged facts back off, hidden pages make no requests,
 * visibility restoration reads once, and an in-flight read is never replaced. */
export function startAdaptiveReadPolling(
  poll: () => void,
  current: () => Pick<ReadPollingOptions, "loading" | "progress">,
  intervalMs: number,
  maxIntervalMs = 30_000,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let delay = intervalMs;
  let progress = current().progress;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && visible()) timer = setTimeout(tick, delay);
  };
  const tick = () => {
    if (stopped || !visible()) return;
    const value = current();
    if (value.progress !== progress) {
      delay = intervalMs;
      progress = value.progress;
    }
    if (!value.loading) {
      poll();
      delay = Math.min(Math.max(intervalMs, maxIntervalMs), delay * 2);
    }
    schedule();
  };
  const wake = () => {
    clearTimeout(timer);
    if (!visible() || stopped) return;
    delay = intervalMs;
    progress = current().progress;
    if (!current().loading) poll();
    schedule();
  };
  const unsubscribe = subscribeVisibility(wake);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
  };
}

export function useAdaptiveReadPolling(
  poll: () => void,
  options: ReadPollingOptions,
) {
  const latest = useRef({ poll, options });
  latest.current = { poll, options };
  const { enabled, scope, intervalMs, maxIntervalMs } = options;
  useEffect(() => {
    if (!enabled) return;
    return startAdaptiveReadPolling(
      () => latest.current.poll(),
      () => latest.current.options,
      intervalMs,
      maxIntervalMs,
    );
  }, [enabled, scope, intervalMs, maxIntervalMs]);
}
