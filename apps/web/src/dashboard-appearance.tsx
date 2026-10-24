import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isDashboardAppearance,
  type DashboardAppearance,
} from "../../../packages/contracts/src/dashboard-appearance";

export type { DashboardAppearance } from "../../../packages/contracts/src/dashboard-appearance";
export const dashboardAppearanceStorageKey = "guteneo.dashboard.appearance";

type AppearanceStorage = Pick<Storage, "getItem" | "setItem">;
type AppearanceContext = {
  appearance: DashboardAppearance;
  setAppearance: (appearance: DashboardAppearance) => void;
  applyAccountAppearance: (
    appearance: DashboardAppearance,
    userId: string,
  ) => void;
  saveAccountAppearance: (
    appearance: DashboardAppearance,
    userId: string,
  ) => void;
};

const DashboardAppearanceContext = createContext<AppearanceContext>({
  appearance: "classic",
  setAppearance: () => undefined,
  applyAccountAppearance: () => undefined,
  saveAccountAppearance: () => undefined,
});

function requestedAppearance(search: string): DashboardAppearance | undefined {
  const parameters = new URLSearchParams(search);
  // English links are canonical; an old bookmark remains an inbound alias.
  const values = parameters.getAll(
    parameters.has("appearance") ? "appearance" : "atelier",
  );
  const requested = values.length === 1 ? values[0] : undefined;
  return isDashboardAppearance(requested) ? requested : undefined;
}

function saveAppearance(
  appearance: DashboardAppearance,
  storage?: AppearanceStorage,
) {
  try {
    storage?.setItem(dashboardAppearanceStorageKey, appearance);
  } catch {
    // Storage may be disabled. The current page still retains its choice.
  }
}

export function initialDashboardAppearance(
  search: string,
  storage?: AppearanceStorage,
): DashboardAppearance {
  const requested = requestedAppearance(search);
  if (requested) {
    // Persist on first render, including the public page before sign-in.
    // Authentication and dispatch payloads remain independent of appearance.
    saveAppearance(requested, storage);
    return requested;
  }
  try {
    const stored = storage?.getItem(dashboardAppearanceStorageKey);
    if (isDashboardAppearance(stored)) return stored;
  } catch {
    // A blocked or unavailable store falls back to the current presentation.
  }
  return "classic";
}

export function dashboardAppearanceUrl(
  href: string,
  appearance: DashboardAppearance,
): string {
  const url = new URL(href);
  url.searchParams.delete("atelier");
  url.searchParams.set("appearance", appearance);
  return `${url.pathname}${url.search}${url.hash}`;
}

function browserStorage(): AppearanceStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function DashboardAppearanceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [appearance, updateAppearance] = useState<DashboardAppearance>(() =>
    initialDashboardAppearance(
      typeof window === "undefined" ? "" : window.location.search,
      browserStorage(),
    ),
  );
  const requested = useRef(
    requestedAppearance(
      typeof window === "undefined" ? "" : window.location.search,
    ),
  );
  const accountUser = useRef<string | undefined>(undefined);
  const accountPreference = useRef<DashboardAppearance | undefined>(undefined);
  useEffect(() => {
    if (!requested.current) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("atelier"))
        window.history.replaceState(
          window.history.state,
          "",
          dashboardAppearanceUrl(url.href, requested.current),
        );
    } catch {
      // Inbound aliases remain usable when browser history is restricted.
    }
  }, []);
  const removeRequestedAppearance = useCallback(() => {
    requested.current = undefined;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("atelier");
      url.searchParams.delete("appearance");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    } catch {
      // A restricted history API never blocks a saved personal preference.
    }
  }, []);
  const setAppearance = useCallback((next: DashboardAppearance) => {
    if (!isDashboardAppearance(next)) return;
    saveAppearance(next, browserStorage());
    updateAppearance(next);
    try {
      window.history.replaceState(
        window.history.state,
        "",
        dashboardAppearanceUrl(window.location.href, next),
      );
    } catch {
      // A restricted history API must not prevent changing presentation.
    }
  }, []);
  const applyAccountAppearance = useCallback(
    (next: DashboardAppearance, userId: string) => {
      if (!isDashboardAppearance(next)) return;
      if (
        (accountUser.current && accountUser.current !== userId) ||
        (accountUser.current === userId &&
          accountPreference.current !== undefined &&
          accountPreference.current !== next)
      )
        removeRequestedAppearance();
      accountUser.current = userId;
      accountPreference.current = next;
      const selected = requested.current ?? next;
      saveAppearance(selected, browserStorage());
      updateAppearance(selected);
    },
    [removeRequestedAppearance],
  );
  const saveAccountAppearance = useCallback(
    (next: DashboardAppearance, userId: string) => {
      if (!isDashboardAppearance(next)) return;
      accountUser.current = userId;
      accountPreference.current = next;
      // The account becomes authoritative after a successful profile save. An old
      // testing link must not override it on the next visit or account switch.
      removeRequestedAppearance();
      saveAppearance(next, browserStorage());
      updateAppearance(next);
    },
    [removeRequestedAppearance],
  );
  const value = useMemo(
    () => ({
      appearance,
      setAppearance,
      applyAccountAppearance,
      saveAccountAppearance,
    }),
    [appearance, setAppearance, applyAccountAppearance, saveAccountAppearance],
  );
  return (
    <DashboardAppearanceContext.Provider value={value}>
      {children}
    </DashboardAppearanceContext.Provider>
  );
}

export function useDashboardAppearance() {
  return useContext(DashboardAppearanceContext);
}
