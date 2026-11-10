import type { RouteNavigationIntent } from "./client-navigation";

export type NavigationConfirmationSnapshot = {
  authority: string;
  revision: number;
  href: string;
  scope: string;
};
type Request = {
  snapshot: NavigationConfirmationSnapshot;
  route?: RouteNavigationIntent;
  resolve?: (permitted: boolean) => void;
};

/** Presentation consent to leave a dirty view, never business approval. */
export function createNavigationConfirmationController(environment: {
  snapshot: () => NavigationConfirmationSnapshot;
  navigate: (href: string) => void;
  changed: () => void;
}) {
  let pending: Request | undefined;
  let bypass: Request | undefined;
  const matches = (
    captured: NavigationConfirmationSnapshot,
    current = environment.snapshot(),
  ) =>
    captured.authority === current.authority &&
    captured.revision === current.revision &&
    captured.scope === current.scope &&
    captured.href === current.href;
  const cancel = (notify = true) => {
    const previous = pending;
    pending = undefined;
    bypass = undefined;
    previous?.resolve?.(false);
    if (previous && notify) environment.changed();
  };
  return {
    get pending() {
      return pending;
    },
    route(intent: RouteNavigationIntent) {
      const current = environment.snapshot();
      if (
        bypass?.route?.fromHref === intent.fromHref &&
        bypass.route.toHref === intent.toHref &&
        matches(bypass.snapshot, { ...current, href: intent.fromHref })
      ) {
        bypass = undefined;
        return true;
      }
      bypass = undefined;
      if (!pending) {
        pending = {
          snapshot: { ...current, href: intent.fromHref },
          route: { ...intent },
        };
        environment.changed();
      }
      return false;
    },
    workspace() {
      // A second switch may not borrow the first switch's confirmation.
      if (pending) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        pending = { snapshot: { ...environment.snapshot() }, resolve };
        environment.changed();
      });
    },
    confirm() {
      const request = pending;
      pending = undefined;
      if (!request) return false;
      environment.changed();
      if (!matches(request.snapshot)) {
        request.resolve?.(false);
        return false;
      }
      if (request.route) {
        bypass = request;
        environment.navigate(request.route.toHref);
      } else request.resolve?.(true);
      return true;
    },
    cancel,
  };
}
