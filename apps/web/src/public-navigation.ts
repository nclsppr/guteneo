import { useLayoutEffect, useSyncExternalStore } from "react";
import site from "../../../packages/contracts/src/public-site.json";
import { requestedPublicLocale } from "../../../packages/contracts/src/public-locales";
import { canonicalPublicFragment } from "../../../packages/contracts/src/public-routes";
import { initializeLocale } from "./locale";

const locationEvent = "guteneo:public-location";
const historyKey = "guteneoPublicNavigation";
type Position = { x: number; y: number };
type EntryPosition = Position & { id?: string };
let nextScroll: { href: string; position?: Position } | undefined;
let managedHref: string | undefined;

/** Native entry bookmarks scroll once; enhanced navigation owns later scrolls. */
export function isPublicNavigationManaged() {
  return typeof window !== "undefined" && managedHref === window.location.href;
}

/** Only ordinary public presentation URLs belong to this browser router. */
export function isPublicNavigationUrl(url: URL): boolean {
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !site.paths.includes(url.pathname) ||
    url.hash.startsWith("#/")
  )
    return false;
  const keys = [...url.searchParams.keys()];
  return (
    keys.every((key) => key === "lang") &&
    (keys.length === 0 ||
      (keys.length === 1 && requestedPublicLocale(url.searchParams) !== null))
  );
}

export function isPublicNavigationClick(
  event: Pick<
    MouseEvent,
    | "button"
    | "metaKey"
    | "ctrlKey"
    | "shiftKey"
    | "altKey"
    | "defaultPrevented"
  >,
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function getPublicNavigationTarget(
  anchor: HTMLAnchorElement,
  current: URL,
): URL | null {
  if (
    !isPublicNavigationUrl(current) ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target.toLowerCase() !== "_self") ||
    anchor.relList.contains("external") ||
    anchor.dataset.publicNavigation === "native"
  )
    return null;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return null;
  let target: URL;
  try {
    target = new URL(href, current);
  } catch {
    return null;
  }
  if (target.origin !== current.origin || !isPublicNavigationUrl(target))
    return null;
  // Locale-preserving links also work before the sharing observer has run.
  const locale = requestedPublicLocale(current.searchParams);
  if (locale && !target.searchParams.has("lang"))
    target.searchParams.set("lang", locale);
  target.hash = canonicalPublicFragment(target.hash);
  if (target.pathname === current.pathname && target.search === current.search)
    return null;
  return target;
}

function snapshot() {
  return window.location.pathname + window.location.search;
}
function subscribe(listener: () => void) {
  window.addEventListener(locationEvent, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(locationEvent, listener);
    window.removeEventListener("popstate", listener);
  };
}

/** The private hash router keeps its own authority and navigation vetoes. */
export function usePublicLocation() {
  const location = useSyncExternalStore(subscribe, snapshot, () => "/");
  useLayoutEffect(() => {
    const pending = nextScroll;
    if (!pending || pending.href !== window.location.href) return;
    nextScroll = undefined;
    let fragment = window.location.hash.slice(1);
    try {
      fragment = decodeURIComponent(fragment);
    } catch {
      // Malformed fragments still retain their ordinary literal destination.
    }
    const target = fragment ? document.getElementById(fragment) : null;
    const main = document.querySelector<HTMLElement>("#root main");
    if (target && !target.hasAttribute("tabindex") && target.tabIndex < 0) {
      target.setAttribute("tabindex", "-1");
      target.addEventListener(
        "blur",
        () => target.removeAttribute("tabindex"),
        {
          once: true,
        },
      );
    }
    (target ?? main)?.focus({ preventScroll: true });
    if (pending.position)
      window.scrollTo(pending.position.x, pending.position.y);
    else if (target) target.scrollIntoView({ behavior: "instant" });
    else window.scrollTo(0, 0);
  }, [location]);
  return location;
}

/** Enhance mounted public links without fetching HTML, sessions or route code. */
export function installPublicNavigation() {
  let activeLocation = snapshot();
  let sequence = 0;
  const positions = new Map<string, Position>();
  const rememberPosition = (id: string, position: Position) => {
    positions.delete(id);
    positions.set(id, position);
    if (positions.size > 64) positions.delete(positions.keys().next().value!);
  };
  const recordPosition = () => {
    if (!isPublicNavigationUrl(new URL(window.location.href))) return;
    const entry = window.history.state?.[historyKey] as
      EntryPosition | undefined;
    if (entry?.id)
      rememberPosition(entry.id, { x: window.scrollX, y: window.scrollY });
  };
  const newPosition = (): EntryPosition => ({
    id: `${Date.now()}-${++sequence}`,
    x: 0,
    y: 0,
  });
  const click = (event: MouseEvent) => {
    if (!isPublicNavigationClick(event) || !(event.target instanceof Element))
      return;
    const anchor = event.target.closest<HTMLAnchorElement>("#root a[href]");
    if (!anchor) return;
    const target = getPublicNavigationTarget(
      anchor,
      new URL(window.location.href),
    );
    if (!target) return;
    event.preventDefault();
    try {
      const state = window.history.state;
      const previous = (state?.[historyKey] ?? newPosition()) as EntryPosition;
      const position = { ...previous, x: window.scrollX, y: window.scrollY };
      if (position.id) rememberPosition(position.id, position);
      window.history.replaceState(
        {
          ...(state && typeof state === "object" ? state : {}),
          [historyKey]: position,
        },
        "",
      );
      window.history.pushState({ [historyKey]: newPosition() }, "", target);
      activeLocation = snapshot();
      nextScroll = { href: target.href };
      managedHref = target.href;
      initializeLocale(false, { useInitialDocumentLocale: false });
      window.dispatchEvent(new Event(locationEvent));
    } catch {
      // Browsers which reject the history mutation retain a complete native path.
      window.location.assign(target.href);
    }
  };
  const restore = () => {
    if (!isPublicNavigationUrl(new URL(window.location.href))) return;
    // Same-document fragments retain the browser's own focus and restoration.
    const location = snapshot();
    if (location === activeLocation) return;
    activeLocation = location;
    const entry = window.history.state?.[historyKey] as
      EntryPosition | undefined;
    const saved = (entry?.id && positions.get(entry.id)) || entry;
    nextScroll = {
      href: window.location.href,
      ...(saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
        ? { position: saved as Position }
        : {}),
    };
    managedHref = window.location.href;
    initializeLocale(false, { useInitialDocumentLocale: false });
    window.dispatchEvent(new Event(locationEvent));
  };
  document.addEventListener("click", click);
  window.addEventListener("popstate", restore);
  window.addEventListener("scroll", recordPosition, { passive: true });
  return () => {
    document.removeEventListener("click", click);
    window.removeEventListener("popstate", restore);
    window.removeEventListener("scroll", recordPosition);
  };
}
