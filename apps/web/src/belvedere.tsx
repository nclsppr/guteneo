import { APPLICATION_TIME_ZONE } from "./application-time";
import { applicationDay } from "../../../packages/contracts/src/application-time";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowClockwise,
  ArrowUpRight,
  Buildings,
  ChartBar,
  Cloud,
  CurrencyEur,
  GlobeHemisphereWest,
  List,
  PaperPlaneTilt,
  ShieldCheck,
  Users,
  X,
} from "@phosphor-icons/react";
import type { BelvedereFilters } from "../../../packages/contracts/src/belvedere";
import {
  BelvedereError,
  BELVEDERE_ACCESS_EXPIRED,
  periodFilters,
} from "./belvedere-data";
import { bmsg } from "./belvedere-i18n";
import { BrandMark } from "./brand";
import { useLocale, registerLocalePreparation } from "./locale";
import { hasBelvedereLocaleData, loadBelvedereLocaleData } from "./locale-data";
import { ThemeToggle } from "./theme-toggle";
import { ApplicationSwitcher } from "./space-switcher";
import { WorkspaceIdentity } from "./workspace-identity";
import {
  api,
  canAdminister,
  permissionsFor,
  setSession,
  type Session,
} from "./api";
import { WorkspaceRouteProvider } from "./components";
import {
  type View,
  type ViewProps,
  Notice,
  Failure,
  Loading,
} from "./belvedere-view-components";
import { belvedereViewModules } from "./belvedere-view-loader";
import { TableViewScope } from "./table-view-scope";
import "./belvedere.css";
const Overview = lazy(() =>
  belvedereViewModules
    .overview()
    .then((module) => ({ default: module.Overview })),
);
const Workshops = lazy(() =>
  belvedereViewModules
    .workshops()
    .then((module) => ({ default: module.Workshops })),
);
const WorkshopDetail = lazy(() =>
  belvedereViewModules
    .workshops()
    .then((module) => ({ default: module.WorkshopDetail })),
);
const Members = lazy(() =>
  belvedereViewModules
    .members()
    .then((module) => ({ default: module.Members })),
);
const Jobs = lazy(() =>
  belvedereViewModules.jobs().then((module) => ({ default: module.Jobs })),
);
const Connections = lazy(() =>
  belvedereViewModules
    .connections()
    .then((module) => ({ default: module.Connections })),
);
const Finance = lazy(() =>
  belvedereViewModules
    .finance()
    .then((module) => ({ default: module.Finance })),
);
const Infrastructure = lazy(() =>
  belvedereViewModules
    .infrastructure()
    .then((module) => ({ default: module.Infrastructure })),
);
const navigation = [
  { id: "overview", label: "Overview", icon: ChartBar },
  { id: "workshops", label: "Workshops", icon: Buildings },
  { id: "jobs", label: "Dispatches", icon: PaperPlaneTilt },
  { id: "members", label: "Members", icon: Users },
  { id: "connections", label: "Connections", icon: GlobeHemisphereWest },
  { id: "finance", label: "Finances", icon: CurrencyEur },
  { id: "infrastructure", label: "Infrastructure", icon: Cloud },
] as const;

const pageCopy: Record<View, { title: string; description?: string }> = {
  overview: {
    title: "Overview",
  },
  workshops: {
    title: "Workshops",
  },
  jobs: {
    title: "Dispatches",
  },
  members: {
    title: "Members",
  },
  connections: {
    title: "Connections",
    description: "Browser sessions, native apps and assistants.",
  },
  finance: {
    title: "Finances",
    description: "Consumption, receipts and provider costs shown separately.",
  },
  infrastructure: {
    title: "Infrastructure",
  },
};

function readView(): View {
  const value = window.location.hash.slice(1).split(/[/?]/)[0];
  return navigation.some((item) => item.id === value)
    ? (value as View)
    : "overview";
}

function readWorkshop() {
  const route = window.location.hash.slice(1).split("/");
  if (route[0] !== "workshops" || !route[1]) return null;
  try {
    return { id: decodeURIComponent(route[1]), name: "" };
  } catch {
    return null;
  }
}

export default function Belvedere({
  basePath,
  session,
  sessionExpired = false,
}: {
  basePath: string;
  session?: Session | null;
  sessionExpired?: boolean;
}) {
  useLocale();
  useEffect(
    () =>
      registerLocalePreparation({
        ready: hasBelvedereLocaleData,
        load: loadBelvedereLocaleData,
      }),
    [],
  );
  const [view, setView] = useState<View>(readView);
  const [hash, setHash] = useState(window.location.hash);
  const [filters, setFilters] = useState(() => periodFilters(30, "production"));
  const [period, setPeriod] = useState("30");
  const [revision, setRevision] = useState(0);
  const [accessError, setAccessError] = useState<BelvedereError | null>(null);
  const [logoutError, setLogoutError] = useState<Error | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const integrated = basePath === "/belvedere";
  const [workshop, setWorkshop] = useState<{ id: string; name: string } | null>(
    readWorkshop,
  );
  const lastWorkshopTrigger = useRef<HTMLElement | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    () => window.matchMedia("(min-width: 641px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 641px)");
    const sync = () => setFiltersOpen(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const sidebar = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const navButton = useRef<HTMLButtonElement>(null);
  const demo =
    document.querySelector<HTMLMetaElement>(
      'meta[name="guteneo-belvedere-demo"]',
    )?.content === "true";
  useEffect(() => {
    if (mobileNav)
      sidebar.current
        ?.querySelector<HTMLAnchorElement>('nav a[aria-current="page"]')
        ?.focus();
  }, [mobileNav]);
  useEffect(() => {
    const originalTitle = document.title;
    document.title = "Belvédère — guteneo";
    const change = () => {
      setView(readView());
      setHash(window.location.hash);
      const nextWorkshop = readWorkshop();
      setWorkshop((current) =>
        nextWorkshop
          ? {
              ...nextWorkshop,
              name:
                current?.id === nextWorkshop.id
                  ? current.name
                  : nextWorkshop.name,
            }
          : null,
      );
      setMobileNav(false);
    };
    const expire = (event: Event) => {
      setAccessError(new BelvedereError((event as CustomEvent<number>).detail));
      setWorkshop(null);
    };
    window.addEventListener(BELVEDERE_ACCESS_EXPIRED, expire);
    window.addEventListener("hashchange", change);
    return () => {
      document.title = originalTitle;
      window.removeEventListener("hashchange", change);
      window.removeEventListener(BELVEDERE_ACCESS_EXPIRED, expire);
    };
  }, []);
  useEffect(() => {
    // Sensitive views revalidate when returning to this tab, including a
    // restored page. Multiple browser resume events share one fresh read.
    let lastRevalidation = 0;
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRevalidation < 750) return;
      lastRevalidation = now;
      setRevision((value) => value + 1);
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) revalidate();
    };
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);
    window.addEventListener("pageshow", show);
    return () => {
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("pageshow", show);
    };
  }, []);
  useEffect(() => {
    if (
      view === "workshops" &&
      !workshop?.id &&
      lastWorkshopTrigger.current?.isConnected
    )
      lastWorkshopTrigger.current.focus({ preventScroll: true });
    else main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, workshop?.id]);
  const refresh = () => setRevision((value) => value + 1);
  const props: ViewProps = { basePath, filters, revision, refresh };
  function openWorkshop(item: { id: string; name: string }) {
    lastWorkshopTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setView("workshops");
    setWorkshop(item);
    window.location.hash = `workshops/${encodeURIComponent(item.id)}`;
  }
  function openJobs(jobFilters: Record<string, string> = {}) {
    window.location.hash = `jobs${Object.keys(jobFilters).length ? `?${new URLSearchParams(jobFilters)}` : ""}`;
  }
  function navigate(next: View) {
    if (next === view) {
      setWorkshop(null);
      setMobileNav(false);
    }
    window.location.hash = next;
  }
  const updateWorkshop = useCallback(
    (id: string, name: string) =>
      setWorkshop((current) =>
        current?.id === id && current.name !== name ? { id, name } : current,
      ),
    [],
  );
  const rangeDays =
    (Date.parse(filters.to) - Date.parse(filters.from)) / 86_400_000 + 1;
  const validDates = filters.from <= filters.to && rangeDays <= 366;
  const principal =
    !sessionExpired && !accessError
      ? (session?.user.id ??
        document.querySelector<HTMLMetaElement>(
          'meta[name="guteneo-belvedere-principal"]',
        )?.content)
      : undefined;
  const page = (
    <WorkspaceRouteProvider route={hash}>
      <div
        className={`belvedere app-frame-v2${integrated ? " belvedere-integrated" : ""}`}
      >
        <a
          className="skip-link"
          href="#belvedere-main"
          onClick={(event) => {
            event.preventDefault();
            main.current?.focus();
          }}
        >
          {bmsg("Skip to content")}
        </a>
        <aside
          ref={sidebar}
          className={`bv-sidebar${mobileNav ? " is-open" : ""}`}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              setMobileNav(false);
              navButton.current?.focus();
            }
          }}
        >
          <a
            href="#overview"
            className="bv-identity"
            onClick={() => navigate("overview")}
            aria-label={bmsg("Belvédère, overview")}
          >
            <BrandMark variant="portrait" />
            <span className="brand-wordmark">guteneo</span>
          </a>
          {integrated ? (
            <ApplicationSwitcher
              application="belvedere"
              hasWorkspace={!!session}
              canAdministerWorkspace={
                !!session &&
                !sessionExpired &&
                (canAdminister(session) || permissionsFor(session).viewReports)
              }
              canAccessBelvedere={!sessionExpired}
            />
          ) : (
            <div className="bv-context">
              <ShieldCheck size={20} aria-hidden="true" />
              <div>
                <strong>Belvédère</strong>
                <span>
                  {bmsg("Private area")} · {bmsg("Read-only")}
                </span>
              </div>
            </div>
          )}
          <nav
            id="belvedere-navigation"
            aria-label={bmsg("Belvédère navigation")}
          >
            {navigation.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={view === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={21} aria-hidden="true" />
                <span>{bmsg(label)}</span>
              </a>
            ))}
          </nav>
          <div className="bv-sidebar-foot">
            {integrated ? (
              session && (
                <WorkspaceIdentity
                  session={session}
                  profileHref="/#/app/account"
                  returnTo="/belvedere"
                  logoutPending={loggingOut}
                  onLogout={async () => {
                    setLogoutError(null);
                    setLoggingOut(true);
                    try {
                      await api("/logout", { method: "POST", body: {} });
                      setSession(null);
                      window.location.replace("/");
                    } catch (error) {
                      setLoggingOut(false);
                      setLogoutError(
                        error instanceof Error
                          ? error
                          : new Error(String(error)),
                      );
                    }
                  }}
                />
              )
            ) : (
              <>
                <div className="bv-account">
                  <span className="bv-avatar">NP</span>
                  <span>Nicolas Pieper</span>
                </div>
                <a href={basePath === "" ? "https://guteneo.com/" : "/"}>
                  {bmsg("Back to guteneo")}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </>
            )}
            {logoutError && <p role="alert">{logoutError.message}</p>}
          </div>
        </aside>
        <div className="bv-workspace">
          <header className="bv-topbar">
            <button
              className="bv-mobile-toggle"
              ref={navButton}
              type="button"
              aria-controls="belvedere-navigation"
              aria-expanded={mobileNav}
              aria-label={
                mobileNav ? bmsg("Close navigation") : bmsg("Open navigation")
              }
              onClick={() => setMobileNav(!mobileNav)}
            >
              {mobileNav ? (
                <X size={20} aria-hidden="true" />
              ) : (
                <List size={20} aria-hidden="true" />
              )}
              <span>Belvédère</span>
            </button>
            <span className="bv-topbar-access">
              <ShieldCheck size={15} aria-hidden="true" />
              {bmsg("Personal access")}
            </span>
          </header>
          {demo && (
            <div className="bv-demo" role="note">
              {bmsg("Local demonstration — fictional data, no real services.")}
            </div>
          )}
          <main id="belvedere-main" ref={main} tabIndex={-1}>
            <div className="bv-heading">
              <div>
                <h1>
                  {workshop
                    ? workshop.name || bmsg("Workshop details")
                    : bmsg(pageCopy[view].title)}
                </h1>
                {!workshop && pageCopy[view].description && (
                  <p>{bmsg(pageCopy[view].description)}</p>
                )}
              </div>
              <div className="bv-heading-actions">
                {!integrated && <ThemeToggle />}
                <button
                  className="bv-button bv-refresh"
                  type="button"
                  onClick={refresh}
                  aria-label={bmsg("Refresh data")}
                >
                  <ArrowClockwise size={18} aria-hidden="true" />
                  <span>{bmsg("Refresh")}</span>
                </button>
              </div>
            </div>
            {view !== "infrastructure" && (
              <div className="bv-filterbar">
                <details
                  className="bv-filter-disclosure"
                  open={filtersOpen || period === "custom"}
                  onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
                >
                  <summary>{bmsg("Filters")}</summary>
                  <div className="bv-filter-fields">
                    <label>
                      <span>{bmsg("Period")}</span>
                      <select
                        value={period}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPeriod(value);
                          if (value !== "custom")
                            setFilters(
                              periodFilters(Number(value), filters.mode),
                            );
                        }}
                      >
                        <option value="7">{bmsg("Last 7 days")}</option>
                        <option value="30">{bmsg("Last 30 days")}</option>
                        <option value="90">{bmsg("Last 90 days")}</option>
                        <option value="custom">{bmsg("Custom dates")}</option>
                      </select>
                    </label>
                    <label>
                      <span>{bmsg("Data")}</span>
                      <select
                        value={filters.mode}
                        onChange={(event) =>
                          setFilters({
                            ...filters,
                            mode: event.target
                              .value as BelvedereFilters["mode"],
                          })
                        }
                      >
                        <option value="production">{bmsg("Production")}</option>
                        <option value="simulation">{bmsg("Simulation")}</option>
                      </select>
                    </label>
                  </div>
                </details>
                <span className={`bv-evidence bv-evidence-${filters.mode}`}>
                  <span aria-hidden="true" />
                  {filters.mode === "production"
                    ? bmsg("Production activity")
                    : bmsg("Simulation only")}
                </span>
              </div>
            )}
            {view !== "infrastructure" && period === "custom" && (
              <div className="bv-custom-dates">
                <label>
                  {bmsg("From")}
                  <input
                    type="date"
                    value={filters.from}
                    max={filters.to}
                    onChange={(event) => {
                      if (event.target.value)
                        setFilters({ ...filters, from: event.target.value });
                    }}
                  />
                </label>
                <label>
                  {bmsg("To")}
                  <input
                    type="date"
                    value={filters.to}
                    min={filters.from}
                    max={applicationDay()}
                    onChange={(event) => {
                      if (event.target.value)
                        setFilters({ ...filters, to: event.target.value });
                    }}
                  />
                </label>
                <span>{bmsg("Inclusive dates.")}</span>
              </div>
            )}
            {accessError || sessionExpired ? (
              <Failure
                error={accessError ?? new BelvedereError(403)}
                retry={refresh}
                basePath={basePath}
              />
            ) : !validDates && view !== "infrastructure" ? (
              <Notice tone="warning">
                {bmsg(
                  "Dates must be in chronological order and span no more than 366 days.",
                )}
              </Notice>
            ) : (
              <Suspense fallback={<Loading />}>
                <div
                  className="bv-view"
                  key={`${view}:${filters.from}:${filters.to}:${filters.mode}`}
                >
                  {view === "overview" && (
                    <Overview
                      {...props}
                      navigate={navigate}
                      openJobs={openJobs}
                      openWorkshop={openWorkshop}
                    />
                  )}
                  {view === "workshops" && (
                    <>
                      <div hidden={!!workshop}>
                        <Workshops {...props} openWorkshop={openWorkshop} />
                      </div>
                      {workshop && (
                        <WorkshopDetail
                          {...props}
                          workshopId={workshop.id}
                          back={() => navigate("workshops")}
                          onName={updateWorkshop}
                        />
                      )}
                    </>
                  )}
                  {view === "jobs" && (
                    <Jobs key={hash} {...props} openWorkshop={openWorkshop} />
                  )}
                  {view === "members" && (
                    <Members {...props} openWorkshop={openWorkshop} />
                  )}
                  {view === "connections" && <Connections {...props} />}
                  {view === "finance" && <Finance {...props} />}
                  {view === "infrastructure" && <Infrastructure {...props} />}
                </div>
              </Suspense>
            )}
            <footer className="bv-footer">
              <span>{bmsg("Belvédère by guteneo")}</span>
              <span>
                {bmsg(
                  "Amounts in EUR unless stated · Times shown in: {0}",
                  APPLICATION_TIME_ZONE,
                )}
              </span>
            </footer>
          </main>
        </div>
      </div>
    </WorkspaceRouteProvider>
  );
  return principal && /^[A-Za-z0-9_|:-]{1,200}$/.test(principal) ? (
    <TableViewScope
      key={principal}
      value={{ userId: principal, workspaceId: "platform", area: "platform" }}
    >
      {page}
    </TableViewScope>
  ) : (
    page
  );
}
