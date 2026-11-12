/** History ownership is independent of React so traversal recovery can be tested. */
const STATE_KEY = "guteneoExperienceNavigation";

type Entry = { session: string; index: number };
export type NavigationPort = {
  location: () => string;
  state: () => unknown;
  replace: (state: Record<string, unknown>, path: string) => void;
  push: (state: Record<string, unknown>, path: string) => void;
  go: (delta: number) => void;
  confirm: (message: string) => boolean;
  notify: () => void;
  scroll: () => void;
};

function entry(value: unknown): Entry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[STATE_KEY];
  if (!candidate || typeof candidate !== "object") return null;
  const state = candidate as Record<string, unknown>;
  return typeof state.session === "string" &&
    state.session.length > 0 &&
    Number.isSafeInteger(state.index)
    ? { session: state.session, index: state.index as number }
    : null;
}

function withEntry(value: unknown, marker: Entry): Record<string, unknown> {
  return {
    ...(value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}),
    [STATE_KEY]: marker,
  };
}

export function isInternalPath(value: string | undefined): value is string {
  return Boolean(
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u001f]/.test(value),
  );
}

/**
 * A rejected traversal restores the original entry without publishing its target
 * to React. The restoration popstate is consumed, not prompted a second time.
 */
export function createNavigationController(
  port: NavigationPort,
  sessionId: string,
) {
  const initial = entry(port.state());
  const session = initial?.session ?? sessionId;
  let index = initial?.index ?? 0;
  let snapshot = port.location();
  let restoring = false;
  let acceptedState = withEntry(port.state(), { session, index });
  const guards = new Map<symbol, () => string | null>();
  port.replace(acceptedState, snapshot);

  const message = () => {
    for (const read of [...guards.values()].reverse()) {
      const value = read();
      if (value) return value;
    }
    return null;
  };
  const allowed = () => {
    const value = message();
    return !value || port.confirm(value);
  };
  const restore = (target: Entry | null) => {
    if (target?.session === session && target.index !== index) {
      restoring = true;
      port.go(index - target.index);
    } else {
      // An unrelated history writer has no usable delta. Preserve the form and
      // take ownership of this entry; never loop history.go(0) or reload it.
      port.replace(acceptedState, snapshot);
      restoring = false;
    }
  };

  return {
    snapshot: () => snapshot,
    dirty: () => message() !== null,
    guard(read: () => string | null) {
      const key = Symbol();
      guards.set(key, read);
      return () => {
        guards.delete(key);
      };
    },
    navigate(to: string, options: { replace?: boolean } = {}) {
      if (!isInternalPath(to) || restoring) return false;
      if (to === snapshot) return true;
      if (!allowed()) return false;
      if (!options.replace) index += 1;
      acceptedState = withEntry(options.replace ? port.state() : null, {
        session,
        index,
      });
      if (options.replace) port.replace(acceptedState, to);
      else port.push(acceptedState, to);
      snapshot = port.location();
      port.notify();
      if (!options.replace) port.scroll();
      return true;
    },
    pop() {
      const target = entry(port.state());
      const path = port.location();
      if (restoring) {
        if (
          target?.session === session &&
          target.index === index &&
          path === snapshot
        ) {
          restoring = false;
          return;
        }
        restore(target);
        return;
      }
      if (path === snapshot) {
        // Hash-only entries have the same route and do not abandon the form.
        if (target?.session === session) index = target.index;
        acceptedState = withEntry(port.state(), { session, index });
        port.replace(acceptedState, path);
        return;
      }
      if (!allowed()) {
        restore(target);
        return;
      }
      index = target?.session === session ? target.index : index + 1;
      snapshot = path;
      acceptedState = withEntry(port.state(), { session, index });
      port.replace(acceptedState, path);
      port.notify();
    },
  };
}
