/** One navigation clock for all client continuations. It also observes A -> B -> A
 * when React batches the intermediate route out of the committed tree. */
export const BEFORE_WORKSPACE_NAVIGATION =
  "guteneo:before-workspace-navigation";
const WORKSPACE_SWITCH_PREFLIGHT = "workspace-switch-preflight";

/** Ask the existing dirty-form guards without claiming that a visit departed.
 * A refused server request still belongs to the initiating view. */
export function createWorkspaceSwitchPreflightEvent() {
  return new CustomEvent(BEFORE_WORKSPACE_NAVIGATION, {
    cancelable: true,
    detail: WORKSPACE_SWITCH_PREFLIGHT,
  });
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
