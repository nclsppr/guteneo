import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";
import { createNavigationController, isInternalPath } from "./navigation-state";

/**
 * Canonical English paths; a language change never changes a destination.
 * History-based, so the static host serves the same document for every path.
 */
const listeners = new Set<() => void>();
let controller: ReturnType<typeof createNavigationController> | undefined;

function browserLocation(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function navigation() {
  if (controller) return controller;
  controller = createNavigationController(
    {
      location: browserLocation,
      state: () => window.history.state,
      replace: (state, path) => window.history.replaceState(state, "", path),
      push: (state, path) => window.history.pushState(state, "", path),
      go: (delta) => window.history.go(delta),
      confirm: (message) => window.confirm(message),
      notify: () => {
        for (const listener of listeners) listener();
      },
      scroll: () => window.scrollTo({ top: 0 }),
    },
    crypto.randomUUID(),
  );
  window.addEventListener("popstate", () => controller?.pop());
  window.addEventListener("beforeunload", (event) => {
    if (!controller?.dirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  return controller;
}

function location(): string {
  return navigation().snapshot();
}

function subscribe(listener: () => void) {
  navigation();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  return navigation().navigate(to, options);
}

/** Clear the guard after a successful save, before its intentional navigation. */
export function useDirtyNavigation(
  dirty: boolean,
  message: string,
): () => void {
  const current = useRef({ dirty, message });
  current.current = { dirty, message };
  useEffect(
    () =>
      navigation().guard(() =>
        current.current.dirty ? current.current.message : null,
      ),
    [],
  );
  return useCallback(() => {
    current.current.dirty = false;
  }, []);
}

export type Route = {
  path: string;
  /** Path segments without empty parts: "/departures/dsp_1" → two segments. */
  segments: string[];
  query: URLSearchParams;
};

export function parseRoute(value: string): Route {
  const [path = "/", search = ""] = value.split("?");
  let decoded: string[];
  try {
    decoded = path.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    decoded = [];
  }
  return {
    path: path || "/",
    segments: decoded,
    query: new URLSearchParams(search),
  };
}

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, location));
}

/** Only this application's own absolute paths navigate in place. */
export function Link({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === "_blank" ||
      !isInternalPath(href)
    )
      return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={follow} {...rest} />;
}

export function withQuery(
  path: string,
  values: Record<string, string | undefined | null>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
