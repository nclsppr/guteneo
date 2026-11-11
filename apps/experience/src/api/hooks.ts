import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  api,
  ApiError,
  currentAuthority,
  isAbort,
  subscribeAuthority,
  type RequestOptions,
} from "./client";

/** Private models are discarded synchronously, before effects fetch replacements. */
export function useAuthority(): number {
  return useSyncExternalStore(
    subscribeAuthority,
    currentAuthority,
    currentAuthority,
  );
}

function privateReadRefused(error: unknown): boolean {
  return (
    error instanceof ApiError && [401, 403, 404, 410].includes(error.status)
  );
}

export type Resource<T> = {
  data: T | undefined;
  error: Error | undefined;
  /** True only for the first read of a path; refreshes keep the last data. */
  loading: boolean;
  refresh: () => Promise<void>;
  setData: (value: T) => void;
};

type PollOptions = {
  /** Base interval while the watched fact keeps changing. */
  every: number;
  /** Unchanged answers back off up to this ceiling. Default 30 s. */
  ceiling?: number;
};

/**
 * Read one API path. Passing `null` reads nothing. With `poll`, an unchanged
 * answer doubles the wait, a hidden tab makes no request at all, and coming
 * back to the tab reads once: watching costs as few requests as possible.
 */
export function useResource<T>(
  path: string | null,
  poll?: PollOptions | false,
): Resource<T> {
  const authority = useAuthority();
  const [state, setState] = useState<{
    authority: number;
    path: string | null;
    data: T | undefined;
    error: Error | undefined;
    loading: boolean;
  }>({
    authority,
    path,
    data: undefined,
    error: undefined,
    loading: path !== null,
  });
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const fingerprint = useRef("");

  const read = useCallback(
    async (quiet: boolean) => {
      if (path === null || authority !== currentAuthority()) return;
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      inFlight.current = true;
      if (!quiet)
        setState((previous) =>
          previous.path === path && previous.authority === authority
            ? { ...previous, error: undefined }
            : {
                authority,
                path,
                data: undefined,
                error: undefined,
                loading: true,
              },
        );
      try {
        const data = await api<T>(path, { signal: current.signal });
        if (current.signal.aborted || authority !== currentAuthority()) return;
        fingerprint.current = JSON.stringify(data);
        setState({ authority, path, data, error: undefined, loading: false });
      } catch (error) {
        if (
          isAbort(error) ||
          current.signal.aborted ||
          authority !== currentAuthority()
        )
          return;
        setState((previous) => ({
          path,
          authority,
          // A failed refresh keeps what the reader was already looking at.
          data:
            !privateReadRefused(error) &&
            previous.path === path &&
            previous.authority === authority
              ? previous.data
              : undefined,
          error: error as Error,
          loading: false,
        }));
      } finally {
        if (controller.current === current) inFlight.current = false;
      }
    },
    [path, authority],
  );

  useEffect(() => {
    if (path === null) {
      setState({
        authority,
        path,
        data: undefined,
        error: undefined,
        loading: false,
      });
      return;
    }
    void read(false);
    return () => controller.current?.abort();
  }, [path, read, authority]);

  const every = poll ? poll.every : 0;
  const ceiling = poll ? (poll.ceiling ?? 30_000) : 0;
  useEffect(() => {
    if (!every || path === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = every;
    let last = fingerprint.current;
    let stopped = false;
    const visible = () => document.visibilityState !== "hidden";
    const schedule = () => {
      clearTimeout(timer);
      if (!stopped && visible()) timer = setTimeout(tick, delay);
    };
    const tick = async () => {
      if (stopped || !visible()) return;
      if (!inFlight.current) {
        await read(true);
        if (fingerprint.current !== last) {
          last = fingerprint.current;
          delay = every;
        } else delay = Math.min(Math.max(every, ceiling), delay * 2);
      }
      schedule();
    };
    const wake = () => {
      clearTimeout(timer);
      if (stopped || !visible()) return;
      delay = every;
      void tick();
    };
    document.addEventListener("visibilitychange", wake);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [every, ceiling, path, read]);

  const refresh = useCallback(() => read(true), [read]);
  const setData = useCallback(
    (value: T) => {
      if (authority !== currentAuthority()) return;
      // An explicit result is newer than any read already in progress.
      controller.current?.abort();
      controller.current = null;
      inFlight.current = false;
      fingerprint.current = JSON.stringify(value);
      setState({
        authority,
        path,
        data: value,
        error: undefined,
        loading: false,
      });
    },
    [path, authority],
  );
  // A path change is visible in the same render, before the effect runs.
  const stale = state.path !== path || state.authority !== authority;
  return {
    data: stale ? undefined : state.data,
    error: stale ? undefined : state.error,
    loading: stale ? path !== null : state.loading,
    refresh,
    setData,
  };
}

export type Page<T> = { items: T[]; nextCursor: string | null };

/** Cursor pages accumulated in order; `more()` appends the next one. */
export function usePages<T>(path: string | null, poll?: PollOptions | false) {
  const authority = useAuthority();
  const first = useResource<Page<T>>(path, poll);
  const pendingPage = useRef<{
    path: string;
    authority: number;
    cursor: string;
  } | null>(null);
  const [extra, setExtra] = useState<{
    authority: number;
    base: Page<T> | undefined;
    path: string | null;
    items: T[];
    cursor: string | null;
    loading: boolean;
    error?: Error;
  }>({
    authority,
    base: undefined,
    path,
    items: [],
    cursor: null,
    loading: false,
  });
  const current =
    extra.path === path &&
    extra.authority === authority &&
    extra.base === first.data
      ? extra
      : undefined;
  const cursor = current ? current.cursor : (first.data?.nextCursor ?? null);
  const more = useCallback(async () => {
    if (
      !path ||
      !cursor ||
      current?.loading ||
      (pendingPage.current?.path === path &&
        pendingPage.current.authority === authority &&
        pendingPage.current.cursor === cursor) ||
      authority !== currentAuthority()
    )
      return;
    const operation = { path, authority, cursor };
    pendingPage.current = operation;
    setExtra((previous) => ({
      authority,
      base: first.data,
      path,
      items:
        previous.path === path &&
        previous.authority === authority &&
        previous.base === first.data
          ? previous.items
          : [],
      cursor,
      loading: true,
    }));
    try {
      const separator = path.includes("?") ? "&" : "?";
      const page = await api<Page<T>>(
        `${path}${separator}cursor=${encodeURIComponent(cursor)}`,
      );
      if (authority !== currentAuthority() || pendingPage.current !== operation)
        return;
      setExtra((previous) => ({
        authority,
        base: first.data,
        path,
        items: [
          ...(previous.path === path &&
          previous.authority === authority &&
          previous.base === first.data
            ? previous.items
            : []),
          ...page.items,
        ],
        cursor: page.nextCursor,
        loading: false,
      }));
    } catch (error) {
      if (
        isAbort(error) ||
        authority !== currentAuthority() ||
        pendingPage.current !== operation
      )
        return;
      setExtra((previous) => ({
        ...previous,
        items: privateReadRefused(error) ? [] : previous.items,
        loading: false,
        error: error as Error,
      }));
    } finally {
      if (pendingPage.current === operation) pendingPage.current = null;
    }
  }, [path, cursor, authority, current?.loading, first.data]);
  const refused = privateReadRefused(current?.error ?? first.error);
  return {
    ...first,
    data: refused ? undefined : first.data,
    items: refused
      ? []
      : [...(first.data?.items ?? []), ...(current?.items ?? [])],
    hasMore: !refused && Boolean(cursor),
    loadingMore: current?.loading ?? false,
    error: current?.error ?? first.error,
    more,
  };
}

/** One write at a time, with its failure kept for the reader to act on. */
export function useAction() {
  const authority = useAuthority();
  const [state, setState] = useState<{
    authority: number;
    pending: boolean;
    error?: Error;
  }>({ authority, pending: false });
  const busy = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = useCallback(
    async <R>(work: () => Promise<R>): Promise<R | undefined> => {
      if (busy.current === authority || authority !== currentAuthority())
        return undefined;
      busy.current = authority;
      setState({ authority, pending: true });
      try {
        const result = await work();
        return authority === currentAuthority() && alive.current
          ? result
          : undefined;
      } catch (failure) {
        if (
          !isAbort(failure) &&
          alive.current &&
          authority === currentAuthority()
        )
          setState({ authority, pending: false, error: failure as Error });
        return undefined;
      } finally {
        if (busy.current === authority) busy.current = null;
        if (alive.current && authority === currentAuthority())
          setState((previous) => ({ ...previous, pending: false }));
      }
    },
    [authority],
  );
  const clear = useCallback(() => {
    if (authority === currentAuthority())
      setState((previous) => ({ ...previous, error: undefined }));
  }, [authority]);
  return {
    run,
    pending: state.authority === authority && state.pending,
    error: state.authority === authority ? state.error : undefined,
    clear,
  };
}

export function write<T>(path: string, options: RequestOptions): Promise<T> {
  return api<T>(path, { method: "POST", ...options });
}
