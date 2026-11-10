/** One navigation clock for all client continuations. It also observes A -> B -> A
 * when React batches the intermediate route out of the committed tree. */
export const BEFORE_WORKSPACE_NAVIGATION =
  "guteneo:before-workspace-navigation";
const WORKSPACE_SWITCH_PREFLIGHT = "workspace-switch-preflight";
const preflights = new WeakMap<Event, (() => Promise<boolean>)[]>();
export type RouteNavigationIntent = { fromHref: string; toHref: string };
const routes = new WeakMap<Event, RouteNavigationIntent>();

/** The router, not a page or URL parameter, owns the exact resumable visit. */
export function createRouteNavigationEvent(intent: RouteNavigationIntent) {
  const event = new Event(BEFORE_WORKSPACE_NAVIGATION, { cancelable: true });
  routes.set(event, { ...intent });
  return event;
}
export const routeNavigationIntent = (event: Event) => routes.get(event);

/** Ask the existing dirty-form guards without claiming that a visit departed.
 * A refused server request still belongs to the initiating view. */
export function createWorkspaceSwitchPreflightEvent() {
  const event = new CustomEvent(BEFORE_WORKSPACE_NAVIGATION, {
    cancelable: true,
    detail: WORKSPACE_SWITCH_PREFLIGHT,
  });
  preflights.set(event, []);
  return event;
}

/** Deferred guards do not cancel the event: an independent hard veto still wins. */
export function deferWorkspaceSwitch(
  event: Event,
  decide: () => Promise<boolean>,
) {
  const decisions = preflights.get(event);
  if (!decisions) return false;
  decisions.push(decide);
  return true;
}

export async function confirmWorkspaceSwitch(event: Event) {
  const decisions = preflights.get(event);
  if (!decisions) return false;
  const accepted = window.dispatchEvent(event);
  preflights.delete(event);
  if (!accepted) return false;
  const permitted = await Promise.all(
    decisions.map((decide) =>
      Promise.resolve()
        .then(decide)
        .catch(() => false),
    ),
  );
  return permitted.every(Boolean) && !event.defaultPrevented;
}

let revision = 0;
let activeHref = "";
const listeners = new Set<() => void>();
const guards = new Map<string, Event>();
let stop: (() => void) | undefined;

function changed() {
  revision += 1;
  activeHref = window.location.href;
  for (const listener of listeners) listener();
}

export function subscribeClientNavigation(listener: () => void) {
  listeners.add(listener);
  if (!stop && typeof window !== "undefined") {
    activeHref = window.location.href;
    const before = (event: Event) => {
      if ((event as CustomEvent<unknown>).detail === WORKSPACE_SWITCH_PREFLIGHT)
        return;
      const href = window.location.href;
      guards.set(href, event);
      // Keep the short handoff bounded even when no hash event follows.
      if (guards.size > 32) guards.delete(guards.keys().next().value!);
      queueMicrotask(() => {
        if (!event.defaultPrevented) changed();
      });
    };
    const location = (event?: Event) => {
      const observed = event as HashChangeEvent | undefined;
      queueMicrotask(() => {
        const guard = observed?.newURL
          ? guards.get(observed.newURL)
          : undefined;
        if (observed?.newURL) guards.delete(observed.newURL);
        if (guard?.defaultPrevented) {
          activeHref = window.location.href;
          return;
        }
        if (
          (observed?.oldURL && observed.oldURL !== observed.newURL) ||
          activeHref !== window.location.href
        )
          changed();
      });
    };
    const history = () => queueMicrotask(() => location());
    window.addEventListener(BEFORE_WORKSPACE_NAVIGATION, before);
    window.addEventListener("hashchange", location);
    window.addEventListener("popstate", history);
    stop = () => {
      window.removeEventListener(BEFORE_WORKSPACE_NAVIGATION, before);
      window.removeEventListener("hashchange", location);
      window.removeEventListener("popstate", history);
      guards.clear();
      stop = undefined;
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stop?.();
  };
}

export function clientNavigationRevision() {
  return revision;
}
