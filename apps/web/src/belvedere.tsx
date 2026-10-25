import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Buildings,
  CaretLeft,
  CaretRight,
  ChartBar,
  CheckCircle,
  Cloud,
  CurrencyEur,
  GlobeHemisphereWest,
  List,
  MagnifyingGlass,
  PaperPlaneTilt,
  Monitor,
  ShieldCheck,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type {
  BelvedereConnections,
  BelvedereFilters,
  BelvedereFinance,
  BelvedereMember,
  BelvedereJob,
  BelvedereOverview,
  BelvederePage,
  BelvedereWorkshop,
  BelvedereWorkshopDetail,
} from "../../../packages/contracts/src/belvedere";
import {
  BelvedereError,
  BELVEDERE_ACCESS_EXPIRED,
  channelName,
  countryName,
  dateTime,
  money,
  number,
  periodFilters,
  queryString,
  roleName,
  shortDate,
  statusName,
  useBelvedereResource,
  useDebounced,
} from "./belvedere-data";
import { BelvedereGlobe } from "./belvedere-globe";
import { bmsg, bmsgIn, belvedereNetResultReason } from "./belvedere-i18n";
import { BrandMark } from "./brand";
import { formatLocale, useLocale } from "./locale";
import { ThemeToggle } from "./theme-toggle";
import "./belvedere.css";

type View =
  | "overview"
  | "workshops"
  | "members"
  | "jobs"
  | "connections"
  | "finance"
  | "infrastructure";
type ViewProps = {
  basePath: string;
  filters: BelvedereFilters;
  revision: number;
  refresh: () => void;
};
const navigation = [
  { id: "overview", label: "Overview", icon: ChartBar },
  { id: "workshops", label: "Workshops", icon: Buildings },
  { id: "jobs", label: "Dispatches", icon: PaperPlaneTilt },
  { id: "members", label: "Members", icon: Users },
  { id: "connections", label: "Connections", icon: GlobeHemisphereWest },
  { id: "finance", label: "Finances", icon: CurrencyEur },
  { id: "infrastructure", label: "Infrastructure", icon: Cloud },
] as const;
const pageCopy: Record<View, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "guteneo activity, from workshops to connections.",
  },
  workshops: {
    title: "Workshops",
    description: "Find every team, its usage and consumption.",
  },
  jobs: {
    title: "Dispatches",
    description:
      "All dispatches, their destination, status and detailed costs.",
  },
  members: {
    title: "Members",
    description: "All members, their workshops and access.",
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
    description: "Service status and available Cloudflare measurements.",
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

export default function Belvedere({ basePath }: { basePath: string }) {
  useLocale();
  const [view, setView] = useState<View>(readView);
  const [hash, setHash] = useState(window.location.hash);
  const [filters, setFilters] = useState(() => periodFilters(30, "production"));
  const [period, setPeriod] = useState("30");
  const [revision, setRevision] = useState(0);
  const [accessError, setAccessError] = useState<BelvedereError | null>(null);
  const [workshop, setWorkshop] = useState<{ id: string; name: string } | null>(
    readWorkshop,
  );
  const lastWorkshopTrigger = useRef<HTMLElement | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
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
  return (
    <div className="belvedere">
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
          if (event.key === "Escape") {
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
        <div className="bv-context">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>Belvédère</strong>
            <span>
              {bmsg("Private area")} · {bmsg("Read-only")}
            </span>
          </div>
        </div>
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
          <div className="bv-account">
            <span className="bv-avatar">NP</span>
            <span>Nicolas Pieper</span>
          </div>
          <a href={basePath === "" ? "https://guteneo.com/" : "/"}>
            {bmsg("Back to guteneo")}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
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
              <p>
                {workshop
                  ? bmsg(
                      "Activity, members and operation details for this workshop.",
                    )
                  : bmsg(pageCopy[view].description)}
              </p>
            </div>
            <div className="bv-heading-actions">
              <ThemeToggle />
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
              <div className="bv-filter-fields">
                <label>
                  <span>{bmsg("Period")}</span>
                  <select
                    value={period}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPeriod(value);
                      if (value !== "custom")
                        setFilters(periodFilters(Number(value), filters.mode));
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
                        mode: event.target.value as BelvedereFilters["mode"],
                      })
                    }
                  >
                    <option value="production">{bmsg("Production")}</option>
                    <option value="simulation">{bmsg("Simulation")}</option>
                  </select>
                </label>
              </div>
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
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => {
                    if (event.target.value)
                      setFilters({ ...filters, to: event.target.value });
                  }}
                />
              </label>
              <span>{bmsg("Inclusive dates, in UTC.")}</span>
            </div>
          )}
          {accessError ? (
            <Failure error={accessError} retry={refresh} basePath={basePath} />
          ) : !validDates && view !== "infrastructure" ? (
            <Notice tone="warning">
              {bmsg(
                "Dates must be in chronological order and span no more than 366 days.",
              )}
            </Notice>
          ) : (
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
          )}
          <footer className="bv-footer">
            <span>{bmsg("Belvédère by guteneo")}</span>
            <span>
              {bmsg("Amounts in EUR unless stated · Dates shown in local time")}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Notice({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "success";
}) {
  return (
    <div className={`bv-notice bv-notice-${tone}`}>
      {tone === "success" ? (
        <CheckCircle size={20} />
      ) : (
        <WarningCircle size={20} />
      )}
      <div>{children}</div>
    </div>
  );
}
function Failure({
  error,
  retry,
  basePath,
}: {
  error: Error;
  retry: () => void;
  basePath: string;
}) {
  const expired =
    error instanceof BelvedereError &&
    (error.status === 401 || error.status === 403 || error.status === 404);
  return (
    <div className="bv-failure" role="alert">
      <WarningCircle size={28} />
      <h2>
        {expired
          ? bmsg("Your access needs to be checked.")
          : bmsg("The data could not be loaded.")}
      </h2>
      <p>
        {expired
          ? bmsg(
              "Your access to Belvédère has expired or is no longer authorised.",
            )
          : bmsg("Reading data failed. You can try again.")}
      </p>
      {expired ? (
        <a className="bv-button bv-button-primary" href={basePath}>
          {bmsg("Check my access")}
          <ArrowRight size={17} />
        </a>
      ) : (
        <button className="bv-button" onClick={retry}>
          <ArrowClockwise size={17} />
          {bmsg("Try again")}
        </button>
      )}
    </div>
  );
}
function Loading({ table = false }: { table?: boolean }) {
  return (
    <div
      className={`bv-loading${table ? " bv-loading-table" : ""}`}
      role="status"
      aria-label={bmsg("Loading data")}
    >
      <span className="sr-only">{bmsg("Loading data…")}</span>
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bv-empty">
      <ChartBar size={27} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function SectionHeading({
  title,
  children,
  aside,
}: {
  title: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="bv-section-heading">
      <div>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {aside}
    </div>
  );
}
function Stat({
  label,
  value,
  children,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`bv-stat${accent ? " bv-stat-accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{children}</small>
    </div>
  );
}
function Status({ value }: { value: string }) {
  const tone = [
    "failed",
    "unknown",
    "submission_unknown",
    "rejected",
    "bounced",
    "complained",
    "reconciliation_required",
  ].includes(value)
    ? "warning"
    : ["delivered", "completed", "active", "authorized"].includes(value)
      ? "success"
      : "neutral";
  return (
    <span className={`bv-status bv-status-${tone}`}>{statusName(value)}</span>
  );
}
function Mode({ mode }: { mode: string }) {
  return (
    <span className={`bv-mode bv-mode-${mode}`}>
      {mode === "production"
        ? bmsg("Production")
        : mode === "simulation"
          ? bmsg("Simulation")
          : mode}
    </span>
  );
}
function Pagination({
  data,
  onChange,
  label = bmsg("results"),
}: {
  data: { total: number; page: number; pageSize: number };
  onChange: (page: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="bv-pagination">
      <span>
        {data.total > 0
          ? bmsg(
              "{0}–{1} of ",
              number((data.page - 1) * data.pageSize + 1),
              number(Math.min(data.page * data.pageSize, data.total)),
            )
          : ""}
        {number(data.total)} {label}
      </span>
      <div>
        <button
          className="bv-icon-button"
          aria-label={bmsg("Previous page")}
          disabled={data.page <= 1}
          onClick={() => onChange(data.page - 1)}
        >
          <CaretLeft size={17} />
        </button>
        <span>
          {bmsg("Page ")}
          {number(data.page)} / {number(pages)}
        </span>
        <button
          className="bv-icon-button"
          aria-label={bmsg("Next page")}
          disabled={data.page >= pages}
          onClick={() => onChange(data.page + 1)}
        >
          <CaretRight size={17} />
        </button>
      </div>
    </div>
  );
}
function Search({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="bv-search">
      <MagnifyingGlass size={18} />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        maxLength={100}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label={bmsg("Clear search")}>
          <X size={15} />
        </button>
      )}
    </label>
  );
}
function DataTable({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      className="bv-table-scroll"
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      <table>{children}</table>
    </div>
  );
}

function Overview(
  props: ViewProps & {
    navigate: (view: View) => void;
    openJobs: (filters?: Record<string, string>) => void;
    openWorkshop: (item: { id: string; name: string }) => void;
  },
) {
  const { basePath, filters, revision, refresh, navigate, openJobs } = props;
  const { data, error } = useBelvedereResource<BelvedereOverview>(
    `${basePath}/api/overview?${queryString(filters)}`,
    revision,
  );
  if (error)
    return <Failure error={error} retry={refresh} basePath={basePath} />;
  if (!data) return <Loading />;
  const { totals } = data;
  return (
    <>
      <div className="bv-stats">
        <Stat
          label={bmsg("Dispatches in this period")}
          value={number(totals.dispatches)}
          accent
        >
          {number(totals.delivered)}
          {bmsg(" delivered · ")}
          {number(totals.pages)}
          {bmsg(" pages")}
        </Stat>
        <Stat
          label={bmsg("Customer consumption")}
          value={money(totals.customerConsumptionMinor)}
        >
          {money(totals.reservedMinor)}
          {bmsg(" reserved")}
        </Stat>
        <Stat label={bmsg("Workshops")} value={number(totals.workshops)}>
          {number(totals.members)}
          {bmsg(" distinct members")}
        </Stat>
        <Stat
          label={bmsg("Active connections")}
          value={number(totals.activeConnections)}
        >
          {bmsg("Unexpired sessions and active authorisations")}
        </Stat>
      </div>
      <BelvedereGlobe
        connections={data.countries}
        distribution={data.distributionCountries}
        onDistributionCountry={(country) =>
          openJobs({ country: country || "unknown" })
        }
      />
      <div className="bv-overview-grid">
        <section className="bv-panel bv-activity">
          <SectionHeading title={bmsg("The pace of activity")}>
            {bmsg("From ")}
            {shortDate(filters.from)}
            {bmsg(" to ")}
            {shortDate(filters.to)}
            {bmsg(" · Daily aggregation in UTC")}
          </SectionHeading>
          <ActivityChart data={data.trend} />
        </section>
        <section className="bv-panel bv-attention">
          <SectionHeading
            title={bmsg("Needs attention")}
            aside={
              <span
                className={`bv-count${totals.attention ? " bv-count-warning" : ""}`}
              >
                {number(totals.attention)}
              </span>
            }
          />
          {data.incidents.length ? (
            <div className="bv-incident-list">
              {data.incidents.map((incident) => (
                <button
                  key={incident.kind}
                  onClick={() =>
                    openJobs({
                      statusGroup:
                        incident.kind === "outbox_delayed"
                          ? "delayed"
                          : "attention",
                    })
                  }
                >
                  <WarningCircle
                    size={19}
                    weight={
                      incident.severity === "critical" ? "fill" : "regular"
                    }
                  />
                  <span>
                    {incidentName(incident.kind)}
                    <small>
                      {incident.severity === "critical"
                        ? bmsg("Verification required")
                        : bmsg("Examine affected dispatches")}
                    </small>
                  </span>
                  <strong>{number(incident.count)}</strong>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="bv-clear">
              <CheckCircle size={32} weight="light" />
              <h3>{bmsg("No dispatches need attention.")}</h3>
              <p>
                {bmsg("The available data shows no incidents in this period.")}
              </p>
            </div>
          )}
          <div className="bv-attention-foot">
            <ShieldCheck size={17} />
            <span>
              {bmsg(
                "Belvédère observes. Business actions stay in the workshops.",
              )}
            </span>
          </div>
        </section>
        <section className="bv-panel">
          <SectionHeading
            title={bmsg("How are dispatches progressing?")}
            aside={
              <button className="bv-text-button" onClick={() => openJobs()}>
                {bmsg("All dispatches")}
                <ArrowUpRight size={16} />
              </button>
            }
          >
            {bmsg("Current state of dispatches created in this period")}
          </SectionHeading>
          <JobStatuses
            statuses={data.statuses}
            onSelect={(status) => openJobs({ status })}
          />
        </section>
        <section className="bv-panel">
          <SectionHeading
            title={bmsg("What is being sent")}
            aside={
              <span className="bv-subtle">
                {number(totals.documents)}
                {bmsg(" documents")}
              </span>
            }
          >
            {bmsg("Dispatch and customer consumption breakdown")}
          </SectionHeading>
          <Channels channels={data.channels} />
          <button
            className="bv-text-button bv-panel-link"
            onClick={() => navigate("finance")}
          >
            {bmsg("View financial details")}
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <p className="bv-source-note">
        {bmsg("Connection countries estimated by Cloudflare.")}{" "}
        {data.telemetry.since
          ? bmsg("Collecting since {0}.", shortDate(data.telemetry.since))
          : bmsg("Collecting from new connections.")}{" "}
        {bmsg(
          "Consumption reflects the current state of dispatches created in this period.",
        )}
      </p>
      <p className="bv-freshness">
        <span aria-hidden="true" />
        {bmsg("Calculated on ")}
        {dateTime(data.generatedAt)}
        {bmsg(
          " · Workshop, member and session totals reflect the current state.",
        )}
      </p>
    </>
  );
}
function incidentName(kind: string) {
  return (
    {
      failed: bmsg("Failed dispatches"),
      unknown: bmsg("Unknown provider outcomes"),
      pending: bmsg("Pending dispatches"),
      stale_outbox: bmsg("Dispatches stuck in the queue"),
      outbox_failed: bmsg("Processing failures"),
      rejected: bmsg("Rejected dispatches"),
      provider_unknown: bmsg("Unknown provider outcomes"),
      dispatch_attention: bmsg("Dispatches to check"),
      outbox_delayed: bmsg("Delayed processing"),
      dispatch_failed: bmsg("Failed dispatches"),
      uncertain: bmsg("Outcomes to confirm"),
    }[kind] || statusName(kind)
  );
}

function ActivityChart({ data }: { data: BelvedereOverview["trend"] }) {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [metric, setMetric] = useState<
    "dispatches" | "consumptionMinor" | "connections"
  >("dispatches");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maximum = Math.max(1, ...data.map((item) => item[metric]));
  const top = Math.max(1, Math.ceil(maximum / 4) * 4);
  const plot = {
    x: compact ? 54 : 64,
    y: 16,
    width: compact ? 484 : 870,
    height: 185,
  };
  const barWidth = plot.width / Math.max(data.length, 1);
  const active = activeIndex === null ? null : data[activeIndex];
  const formatted = (value: number) =>
    metric === "consumptionMinor" ? money(value) : number(value);
  const total = data.reduce((sum, item) => sum + item[metric], 0);
  return (
    <>
      <div className="bv-chart-toolbar">
        <div className="bv-segmented" aria-label={bmsg("Chart metric")}>
          {(
            [
              ["dispatches", bmsg("Dispatches")],
              ["consumptionMinor", bmsg("Consumption")],
              ["connections", bmsg("Connections")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={metric === key}
              onClick={() => {
                setMetric(key);
                setActiveIndex(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="bv-chart-total">
          {formatted(total)}
          <small>{bmsg(" in this period")}</small>
        </span>
      </div>
      {data.length === 0 ? (
        <Empty title={bmsg("Activity will appear here.")}>
          {bmsg("No measurements available for this period.")}
        </Empty>
      ) : (
        <>
          <div className="bv-chart" onMouseLeave={() => setActiveIndex(null)}>
            <svg
              viewBox={compact ? "0 0 560 250" : "0 0 960 250"}
              role="group"
              aria-label={bmsg(
                "Daily trend: {0}",
                metric === "consumptionMinor"
                  ? bmsg("customer consumption in euros")
                  : metric === "dispatches"
                    ? bmsg("deliveries")
                    : bmsg("connections"),
              )}
            >
              {[0, 1, 2, 3, 4].map((tick) => (
                <g key={tick}>
                  <line
                    x1={plot.x}
                    y1={plot.y + plot.height - (tick * plot.height) / 4}
                    x2={plot.x + plot.width}
                    y2={plot.y + plot.height - (tick * plot.height) / 4}
                    className="bv-gridline"
                  />
                  <text
                    x={plot.x - 11}
                    y={plot.y + plot.height - (tick * plot.height) / 4 + 4}
                    textAnchor="end"
                    className="bv-chart-label"
                  >
                    {metric === "consumptionMinor"
                      ? money((tick * top) / 4)
                      : number((tick * top) / 4)}
                  </text>
                </g>
              ))}
              {data.map((item, index) => {
                const height = (item[metric] / top) * plot.height;
                const selected = activeIndex === index;
                return (
                  <g
                    key={item.date}
                    className={`bv-chart-day${selected ? " is-active" : ""}`}
                    tabIndex={0}
                    role="img"
                    aria-label={`${shortDate(item.date)} : ${formatted(item[metric])}`}
                    onFocus={() => setActiveIndex(index)}
                    onBlur={() => setActiveIndex(null)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <rect
                      x={plot.x + index * barWidth}
                      y={plot.y}
                      width={barWidth}
                      height={plot.height}
                      className="bv-chart-hit"
                    />
                    <rect
                      x={plot.x + index * barWidth + barWidth * 0.17}
                      y={
                        plot.y +
                        plot.height -
                        Math.max(height, item[metric] > 0 ? 2 : 0)
                      }
                      width={Math.max(1, barWidth * 0.66)}
                      height={Math.max(height, item[metric] > 0 ? 2 : 0)}
                      rx={1}
                      className="bv-chart-bar"
                    />
                    {(index === 0 ||
                      index === data.length - 1 ||
                      (index %
                        Math.max(
                          1,
                          Math.floor(data.length / (compact ? 2 : 5)),
                        ) ===
                        0 &&
                        index < data.length - 3)) && (
                      <text
                        x={plot.x + index * barWidth + barWidth / 2}
                        y={229}
                        textAnchor={
                          index === 0
                            ? "start"
                            : index === data.length - 1
                              ? "end"
                              : "middle"
                        }
                        className="bv-chart-label"
                      >
                        {shortDate(item.date)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="bv-chart-caption" aria-live="polite">
            <span>
              <span className="bv-legend-dot" />
              {metric === "consumptionMinor"
                ? bmsg("Current customer cost by creation date")
                : metric === "dispatches"
                  ? bmsg("Dispatches created")
                  : bmsg("Established connections")}
            </span>
            <span>
              {active
                ? `${shortDate(active.date)} · ${formatted(active[metric])}`
                : bmsg("Hover over or select a day for details")}
            </span>
          </div>
          <details className="bv-chart-table">
            <summary>{bmsg("Show chart values")}</summary>
            <DataTable label={bmsg("Daily values")}>
              <thead>
                <tr>
                  <th>{bmsg("Date")}</th>
                  <th className="bv-numeric">{bmsg("Dispatches")}</th>
                  <th className="bv-numeric">
                    {bmsgIn("belvedere-plural", "Delivered")}
                  </th>
                  <th className="bv-numeric">{bmsg("Connections")}</th>
                  <th className="bv-numeric">{bmsg("Consumption")}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.date}>
                    <td>{shortDate(item.date)}</td>
                    <td className="bv-numeric">{number(item.dispatches)}</td>
                    <td className="bv-numeric">{number(item.delivered)}</td>
                    <td className="bv-numeric">{number(item.connections)}</td>
                    <td className="bv-numeric">
                      {money(item.consumptionMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </details>
        </>
      )}
    </>
  );
}
function Countries({
  countries,
}: {
  countries: BelvedereOverview["countries"];
}) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...countries].sort((a, b) => b.connections - a.connections);
  const total = sorted.reduce((sum, item) => sum + item.connections, 0);
  const max = Math.max(...sorted.map((item) => item.connections), 1);
  if (!countries.length)
    return (
      <Empty title={bmsg("Geography is yet to be observed.")}>
        {bmsg(
          "Countries will appear with new connections. History without a country remains marked “unspecified”.",
        )}
      </Empty>
    );
  return (
    <div className="bv-countries">
      {sorted.slice(0, showAll ? undefined : 5).map((item) => (
        <div className="bv-country" key={item.country || "unknown"}>
          <span className="bv-country-code">{item.country || "—"}</span>
          <div>
            <span>
              {countryName(item.country)}
              <strong>{number(item.connections)}</strong>
              <small>
                {total
                  ? new Intl.NumberFormat(formatLocale(), {
                      style: "percent",
                      maximumFractionDigits: 1,
                    }).format(item.connections / total)
                  : new Intl.NumberFormat(formatLocale(), {
                      style: "percent",
                      maximumFractionDigits: 1,
                    }).format(0)}
              </small>
            </span>
            <div className="bv-country-track">
              <span style={{ width: `${(item.connections / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
      {sorted.length > 5 && (
        <button className="bv-text-button" onClick={() => setShowAll(!showAll)}>
          {showAll
            ? bmsg("Collapse list")
            : bmsg("View all {0} countries", number(sorted.length))}
          <ArrowDown size={15} />
        </button>
      )}
    </div>
  );
}
function Channels({ channels }: { channels: BelvedereOverview["channels"] }) {
  const total = channels.reduce((sum, channel) => sum + channel.dispatches, 0);
  if (!channels.length)
    return (
      <Empty title={bmsg("No dispatches in this period.")}>
        {bmsg("The channel breakdown will appear after the first dispatches.")}
      </Empty>
    );
  return (
    <div className="bv-channels">
      <div
        className="bv-channel-stack"
        role="img"
        aria-label={channels
          .map((channel) =>
            bmsg(
              "{0}: {1} dispatches",
              channelName(channel.channel),
              number(channel.dispatches),
            ),
          )
          .join(", ")}
      >
        {channels.map((channel, index) => (
          <span
            key={channel.channel}
            className={`bv-channel-color-${index % 3}`}
            style={{
              width: `${total ? (channel.dispatches / total) * 100 : 0}%`,
            }}
          />
        ))}
      </div>
      <div className="bv-channel-head">
        <span>{bmsg("Channel")}</span>
        <span>{bmsg("Dispatches")}</span>
        <span>{bmsg("Consumption")}</span>
      </div>
      {channels.map((channel, index) => (
        <div className="bv-channel-row" key={channel.channel}>
          <span>
            <i className={`bv-channel-color-${index % 3}`} />
            {channelName(channel.channel)}
          </span>
          <strong>{number(channel.dispatches)}</strong>
          <strong>{money(channel.consumptionMinor)}</strong>
        </div>
      ))}
    </div>
  );
}

function Workshops({
  basePath,
  filters,
  revision,
  refresh,
  openWorkshop,
}: ViewProps & { openWorkshop: (item: { id: string; name: string }) => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(query);
  const { data, error } = useBelvedereResource<
    BelvederePage<BelvedereWorkshop>
  >(
    `${basePath}/api/workshops?${queryString(filters, { q: search, page, pageSize: 20 })}`,
    revision,
  );
  return (
    <section className="bv-panel bv-table-panel">
      <SectionHeading
        title={bmsg("All workshops")}
        aside={
          <Search
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={bmsg("Workshop name…")}
            label={bmsg("Search workshops")}
          />
        }
      >
        {data
          ? bmsg("{0} workshops in this view", number(data.total))
          : bmsg("Browsing workshops")}{" "}
        {bmsg("· Activity filtered by period")}
      </SectionHeading>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading table />
      ) : !data.items.length ? (
        <Empty
          title={
            search
              ? bmsg("No matching workshops.")
              : bmsg("No workshops in this mode.")
          }
        >
          {search
            ? bmsg("Try a shorter name or clear the search.")
            : bmsg("Change the data filter to view other workshops.")}
        </Empty>
      ) : (
        <DataTable label={bmsg("Workshops and consumption")}>
          <thead>
            <tr>
              <th>{bmsg("Workshop")}</th>
              <th className="bv-numeric">{bmsg("Members")}</th>
              <th className="bv-numeric">{bmsg("Dispatches")}</th>
              <th className="bv-numeric">{bmsg("Consumption")}</th>
              <th>{bmsg("Needs attention")}</th>
              <th>{bmsg("Last activity")}</th>
              <th>
                <span className="sr-only">{bmsg("Details")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <button
                    className="bv-table-link"
                    onClick={() => openWorkshop(item)}
                  >
                    {item.name}
                  </button>
                  <Mode mode={item.mode} />
                </td>
                <td className="bv-numeric">{number(item.members)}</td>
                <td className="bv-numeric">
                  {number(item.dispatches)}
                  <small>
                    {number(item.pages)}
                    {bmsg(" pages")}
                  </small>
                </td>
                <td className="bv-numeric bv-emphasis">
                  {money(item.consumptionMinor)}
                  <small>
                    {money(item.reservedMinor)}
                    {bmsg(" reserved")}
                  </small>
                </td>
                <td>
                  {item.attention > 0 ? (
                    <span className="bv-status bv-status-warning">
                      {number(item.attention)}
                      {bmsg(" deliveries")}
                    </span>
                  ) : (
                    <span className="bv-table-ok">
                      <CheckCircle size={16} />
                      {bmsg("Nothing to report")}
                    </span>
                  )}
                </td>
                <td className="bv-date-cell">
                  {dateTime(item.lastActivityAt)}
                </td>
                <td>
                  <button
                    className="bv-icon-button"
                    onClick={() => openWorkshop(item)}
                    aria-label={bmsg("View {0}", item.name)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {data && (
        <Pagination data={data} onChange={setPage} label={bmsg("workshops")} />
      )}
    </section>
  );
}
function WorkshopDetail({
  basePath,
  filters,
  revision,
  refresh,
  workshopId,
  back,
  onName,
}: ViewProps & {
  workshopId: string;
  back: () => void;
  onName: (id: string, name: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [membersPage, setMembersPage] = useState(1);
  const { data, error } = useBelvedereResource<BelvedereWorkshopDetail>(
    `${basePath}/api/workshops/${encodeURIComponent(workshopId)}?${queryString(filters, { page, pageSize: 20, membersPage })}`,
    revision,
  );
  useEffect(() => {
    if (data) onName(data.workshop.id, data.workshop.name);
  }, [data, onName]);
  return (
    <>
      <button className="bv-text-button bv-back" onClick={back}>
        <ArrowLeft size={17} />
        {bmsg("All workshops")}
      </button>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="bv-detail-meta">
            <Mode mode={data.workshop.mode} />
            <span>
              {bmsg("Created on ")}
              {shortDate(data.workshop.createdAt)}
            </span>
            <span>
              {bmsg("Last activity: ")}
              {dateTime(data.workshop.lastActivityAt)}
            </span>
          </div>
          <div className="bv-stats">
            <Stat
              label={bmsg("Consumption in this period")}
              value={money(data.workshop.consumptionMinor)}
              accent
            >
              {money(data.workshop.reservedMinor)}
              {bmsg(" reserved")}
            </Stat>
            <Stat
              label={bmsg("Dispatches")}
              value={number(data.workshop.dispatches)}
            >
              {number(data.workshop.attention)}
              {bmsg(" need attention")}
            </Stat>
            <Stat
              label={bmsg("Documents")}
              value={number(data.workshop.documents)}
            >
              {number(data.workshop.pages)}
              {bmsg(" pages")}
            </Stat>
            <Stat
              label={bmsg("Available credit")}
              value={money(data.workshop.availableCreditMinor)}
            >
              {bmsg("Current workshop balance")}
            </Stat>
          </div>
          <div className="bv-detail-grid">
            <section className="bv-panel">
              <SectionHeading title={bmsg("Consumption by channel")}>
                {bmsg("Current amounts for dispatches created in this period")}
              </SectionHeading>
              <Channels channels={data.channels} />
            </section>
            <section className="bv-panel">
              <SectionHeading
                title={bmsg("Workspace members")}
                aside={
                  <span className="bv-count">
                    {number(data.workshop.members)}
                  </span>
                }
              />
              <div className="bv-workshop-members">
                {data.members.length ? (
                  data.members.map((member) => (
                    <div key={member.id}>
                      <span className="bv-avatar">{initials(member.name)}</span>
                      <div>
                        <strong>{member.name}</strong>
                        <span>{member.email}</span>
                      </div>
                      <span>
                        {roleName(
                          member.workshops.find(
                            (item) => item.id === workshopId,
                          )?.role || "",
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <Empty title={bmsg("No members in this view.")}>
                    {bmsg("Members will appear after joining the workshop.")}
                  </Empty>
                )}
              </div>
              {data.membersTotal > data.membersPageSize && (
                <Pagination
                  data={{
                    total: data.membersTotal,
                    page: data.membersPage,
                    pageSize: data.membersPageSize,
                  }}
                  onChange={setMembersPage}
                  label={bmsg("members")}
                />
              )}
            </section>
          </div>
          <section className="bv-panel bv-table-panel">
            <SectionHeading title={bmsg("Dispatch details")}>
              {bmsg(
                "Customer cost, reservation and verified provider cost. Document contents and recipients remain private.",
              )}
            </SectionHeading>
            {data.dispatches.items.length ? (
              <DataTable label={bmsg("Workshop dispatches")}>
                <thead>
                  <tr>
                    <th>{bmsg("Dispatch")}</th>
                    <th>{bmsg("Channel / mode")}</th>
                    <th>{bmsg("Status")}</th>
                    <th className="bv-numeric">{bmsg("Pages")}</th>
                    <th className="bv-numeric">{bmsg("Consumed")}</th>
                    <th className="bv-numeric">{bmsg("Reserved")}</th>
                    <th className="bv-numeric">{bmsg("Provider cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dispatches.items.map((dispatch) => (
                    <tr key={dispatch.id}>
                      <td>
                        <code title={dispatch.id}>{dispatch.id}</code>
                        <small>{dateTime(dispatch.createdAt)}</small>
                      </td>
                      <td>
                        <strong>{channelName(dispatch.channel)}</strong>
                        <Mode mode={dispatch.mode} />
                      </td>
                      <td>
                        <Status value={dispatch.status} />
                      </td>
                      <td className="bv-numeric">
                        {dispatch.pages === null ? "—" : number(dispatch.pages)}
                      </td>
                      <td className="bv-numeric bv-emphasis">
                        {dispatch.customerActualMinor === null ? (
                          <span className="bv-subtle">
                            {bmsg("Not finalised")}
                          </span>
                        ) : (
                          money(dispatch.customerActualMinor)
                        )}
                        <small>
                          {bmsg("Delivery:")}{" "}
                          {money(dispatch.transportActualMinor ?? null)}
                          {bmsg(" · Hosting: ")}
                          {money(dispatch.hostingFeeMinor ?? 0)}
                        </small>
                        <small>
                          {bmsg("Quote: ")}
                          {money(dispatch.estimatedMinor)}
                          <br />
                          {bmsg("Limit: ")}
                          {money(dispatch.ceilingMinor)}
                        </small>
                      </td>
                      <td className="bv-numeric">
                        {money(dispatch.reservedMinor)}
                      </td>
                      <td className="bv-numeric">
                        {dispatch.supplierVerifiedMinor === null ? (
                          <span className="bv-subtle">
                            {bmsg("Unverified")}
                          </span>
                        ) : (
                          money(
                            dispatch.supplierVerifiedMinor,
                            dispatch.supplierCurrency || "EUR",
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <Empty title={bmsg("No dispatches in this period.")}>
                {bmsg("Choose another period to view this workshop’s history.")}
              </Empty>
            )}
            <Pagination
              data={data.dispatches}
              onChange={setPage}
              label={bmsg("deliveries")}
            />
          </section>
        </>
      )}
    </>
  );
}
function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || "?"
  );
}
function Members({
  basePath,
  filters,
  revision,
  refresh,
  openWorkshop,
}: ViewProps & { openWorkshop: (item: { id: string; name: string }) => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebounced(query);
  const { data, error } = useBelvedereResource<BelvederePage<BelvedereMember>>(
    `${basePath}/api/members?${queryString(filters, { q: search, page, pageSize: 20 })}`,
    revision,
  );
  return (
    <section className="bv-panel bv-table-panel">
      <SectionHeading
        title={bmsg("Member directory")}
        aside={
          <Search
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={bmsg("Name or email address…")}
            label={bmsg("Search members")}
          />
        }
      >
        {data ? bmsg("{0} people", number(data.total)) : bmsg("All members")}
        {bmsg(" · Memberships and connections reflect the current state")}
      </SectionHeading>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading table />
      ) : !data.items.length ? (
        <Empty title={bmsg("No matching members.")}>
          {bmsg("Try another name, email address or mode.")}
        </Empty>
      ) : (
        <DataTable label={bmsg("Members and access")}>
          <thead>
            <tr>
              <th>{bmsg("Member")}</th>
              <th>{bmsg("Workshops and roles")}</th>
              <th className="bv-numeric">{bmsg("Active connections")}</th>
              <th>{bmsg("Last observed connection")}</th>
              <th>{bmsg("Registration")}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="bv-person">
                    <span className="bv-avatar">{initials(member.name)}</span>
                    <div>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="bv-memberships">
                    {member.workshops.map((workshop) => (
                      <div key={workshop.id}>
                        <button
                          className="bv-table-link"
                          onClick={() => openWorkshop(workshop)}
                        >
                          {workshop.name}
                          <ArrowUpRight size={13} />
                        </button>
                        <small>
                          {roleName(workshop.role)}
                          {workshop.role === "supervisor" &&
                          (workshop.canApprove || workshop.canReport)
                            ? ` · ${[workshop.canApprove ? bmsg("approval") : "", workshop.canReport ? bmsg("reports") : ""].filter(Boolean).join(", ")}`
                            : ""}
                        </small>
                      </div>
                    ))}
                    {member.workshopsTotal > member.workshops.length && (
                      <small>
                        {number(member.workshops.length)}
                        {bmsg(" workshops shown out of")}{" "}
                        {number(member.workshopsTotal)}
                        {bmsg(". View other memberships from the workshops.")}
                      </small>
                    )}
                  </div>
                </td>
                <td className="bv-numeric">
                  {number(member.activeConnections)}
                </td>
                <td className="bv-date-cell">{dateTime(member.lastSeenAt)}</td>
                <td className="bv-date-cell">{shortDate(member.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {data && (
        <Pagination data={data} onChange={setPage} label={bmsg("members")} />
      )}
    </section>
  );
}
function Connections({ basePath, filters, revision, refresh }: ViewProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"current" | "events">("current");
  const search = useDebounced(query);
  const { data, error } = useBelvedereResource<BelvedereConnections>(
    `${basePath}/api/connections?${queryString(filters, { q: search, page, pageSize: 20 })}`,
    revision,
  );
  if (error)
    return <Failure error={error} retry={refresh} basePath={basePath} />;
  return (
    <>
      <div className="bv-connections-top">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Connection origins")}>
            {bmsg("Events observed in the selected period")}
          </SectionHeading>
          {data ? <Countries countries={data.countries} /> : <Loading table />}
        </section>
        <section className="bv-panel bv-telemetry">
          <GlobeHemisphereWest size={36} weight="light" />
          <h2>{bmsg("Observed geography, never guessed.")}</h2>
          <p>
            {bmsg(
              "Cloudflare provides the country when the connection is established. Older sessions without a measurement keep an unspecified country.",
            )}
          </p>
          <dl>
            <div>
              <dt>{bmsg("Collection started")}</dt>
              <dd>
                {data?.since
                  ? dateTime(data.since)
                  : bmsg("No events collected")}
              </dd>
            </div>
            <div>
              <dt>{bmsg("Retained history")}</dt>
              <dd>
                {data
                  ? bmsg("{0} days", number(data.retentionDays))
                  : bmsg("Loading…")}
              </dd>
            </div>
            <div>
              <dt>{bmsg("Scope")}</dt>
              <dd>{bmsg("Successfully established connections")}</dd>
            </div>
          </dl>
          <p className="bv-source-note">
            {bmsg(
              "A connection represents a session or authorisation, not each request or real-time presence.",
            )}
          </p>
        </section>
      </div>
      <section className="bv-panel bv-table-panel">
        <SectionHeading
          title={bmsg("Access log")}
          aside={
            <Search
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder={bmsg("Person or workshop…")}
              label={bmsg("Search connections")}
            />
          }
        />
        <div
          className="bv-tabs"
          role="group"
          aria-label={bmsg("Connection type")}
        >
          <button
            aria-pressed={tab === "current"}
            onClick={() => {
              setTab("current");
              setPage(1);
            }}
          >
            {bmsg("Current sessions and authorisations")}
            {data && <span>{number(data.current.total)}</span>}
          </button>
          <button
            aria-pressed={tab === "events"}
            onClick={() => {
              setTab("events");
              setPage(1);
            }}
          >
            {bmsg("Connection history")}
            {data && <span>{number(data.events.total)}</span>}
          </button>
        </div>
        {!data ? (
          <Loading table />
        ) : tab === "current" ? (
          <>
            {data.current.items.length ? (
              <DataTable label={bmsg("Current sessions and authorisations")}>
                <thead>
                  <tr>
                    <th>{bmsg("Person / workshop")}</th>
                    <th>{bmsg("Access")}</th>
                    <th>{bmsg("Country")}</th>
                    <th>{bmsg("Status")}</th>
                    <th>{bmsg("Last observed connection")}</th>
                    <th>{bmsg("Expires")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.current.items.map((connection) => (
                    <tr key={connection.id}>
                      <td>
                        <strong>{connection.userName}</strong>
                        <small>{connection.workshopName}</small>
                      </td>
                      <td>
                        <span className="bv-access-kind">
                          <Monitor size={16} />
                          {accessName(connection.kind)}
                        </span>
                        <small>
                          {bmsg("Created on ")}
                          {shortDate(connection.createdAt)}
                        </small>
                      </td>
                      <td>{countryName(connection.country)}</td>
                      <td>
                        <Status value={connection.status} />
                      </td>
                      <td className="bv-date-cell">
                        {dateTime(connection.lastSeenAt)}
                      </td>
                      <td className="bv-date-cell">
                        {connection.expiresAt
                          ? dateTime(connection.expiresAt)
                          : bmsg("No expiry recorded")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <Empty title={bmsg("No sessions in this view.")}>
                {bmsg("Change the filters or view the connection history.")}
              </Empty>
            )}
            <Pagination
              data={data.current}
              onChange={setPage}
              label={bmsg("sessions and authorisations")}
            />
          </>
        ) : (
          <>
            {data.events.items.length ? (
              <DataTable label={bmsg("Connection history")}>
                <thead>
                  <tr>
                    <th>{bmsg("Connection date")}</th>
                    <th>{bmsg("Person")}</th>
                    <th>{bmsg("Workshop")}</th>
                    <th>{bmsg("Access")}</th>
                    <th>{bmsg("Observed country")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.items.map((connection) => (
                    <tr key={connection.id}>
                      <td className="bv-date-cell">
                        {dateTime(connection.occurredAt)}
                      </td>
                      <td>
                        <strong>{connection.userName}</strong>
                      </td>
                      <td>{connection.workshopName}</td>
                      <td>{accessName(connection.kind)}</td>
                      <td>{countryName(connection.country)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <Empty title={bmsg("No new connections observed.")}>
                {bmsg(
                  "Connections established after collection was enabled will appear here.",
                )}
              </Empty>
            )}
            <Pagination
              data={data.events}
              onChange={setPage}
              label={bmsg("connections")}
            />
          </>
        )}
      </section>
    </>
  );
}
function accessName(kind: string) {
  return (
    {
      browser: bmsg("Browser"),
      native: bmsg("Native app"),
      mcp: bmsg("MCP assistant"),
      browser_login: bmsg("Browser"),
      native_login: bmsg("Native app"),
      mcp_authorization: bmsg("MCP assistant"),
    }[kind] || kind
  );
}

function Finance({ basePath, filters, revision, refresh }: ViewProps) {
  const { data, error } = useBelvedereResource<BelvedereFinance>(
    `${basePath}/api/finance?${queryString(filters)}`,
    revision,
  );
  if (error)
    return <Failure error={error} retry={refresh} basePath={basePath} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="bv-finance-summary">
        <section>
          <span className="bv-finance-label">
            {bmsg("Customer consumption recorded in the ledger")}
          </span>
          <strong>{money(data.customerConsumptionMinor)}</strong>
          <p>
            {filters.mode === "production"
              ? bmsg(
                  "Dispatch, hosting, PDF check and legacy plan debits recorded in this period, by ledger date, including dispatches deleted since. These amounts may come from promotional credits.",
                )
              : bmsg(
                  "Simulated dispatch, PDF check and legacy plan consumption by confirmation or ledger date. These are not real receipts.",
                )}
          </p>
          <span className="bv-finance-reserved">
            {money(data.reservedMinor)}
            {bmsg(" currently reserved for dispatches created in this period")}
          </span>
        </section>
        <section>
          <span className="bv-finance-label">{bmsg("Verified receipts")}</span>
          <div className="bv-finance-cash">
            {data.cashStatus === "unconfigured" ? (
              <strong className="bv-unavailable">
                {bmsgIn("belvedere-plural", "Not configured")}
              </strong>
            ) : data.cashReceived.length ? (
              data.cashReceived.map((item) => (
                <strong key={item.currency}>
                  {money(item.amountMinor, item.currency)}
                </strong>
              ))
            ) : (
              <strong>{money(0)}</strong>
            )}
          </div>
          <p>
            {data.cashStatus === "unconfigured"
              ? bmsg(
                  "Verified Stripe payments are not available yet. No revenue is inferred from consumption.",
                )
              : bmsg(
                  "Verified Stripe payments by creation date recorded by Stripe, grouped by currency. This date does not prove bank receipt; promotional credits are excluded.",
                )}
          </p>
        </section>
      </div>
      <div className="bv-finance-grid">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Provider costs")}>
            {bmsg("Provider reconciliations recorded in this period")}
          </SectionHeading>
          <div className="bv-supplier-totals">
            {data.supplierVerified.length ? (
              data.supplierVerified.map((item) => (
                <div key={item.currency}>
                  <span>{item.currency}</span>
                  <strong>{money(item.amountMinor, item.currency)}</strong>
                </div>
              ))
            ) : (
              <p className="bv-subtle">
                {bmsg("No verified provider costs in this period.")}
              </p>
            )}
          </div>
          <Notice
            tone={data.supplierUnverifiedDispatches > 0 ? "warning" : "neutral"}
          >
            {number(data.supplierUnverifiedDispatches)}
            {bmsg(
              " dispatches created in this period without verified provider costs. A missing value does not mean zero cost.",
            )}
          </Notice>
        </section>
        <section className="bv-panel bv-result">
          <SectionHeading title={bmsg("Net profit")} />
          <strong>{bmsg("Cannot be calculated")}</strong>
          <p>{belvedereNetResultReason(data.netResultUnavailableReason)}</p>
          <span className="bv-source-note">
            {bmsg(
              "Receipts, consumption and known costs alone do not establish an accounting result.",
            )}
          </span>
        </section>
      </div>
      <div className="bv-finance-grid">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Consumption by channel")}>
            {bmsg(
              "Volumes: dispatches created in this period. Amounts: debits recorded in the period, excluding legacy plan charges.",
            )}
          </SectionHeading>
          <Channels channels={data.channels} />
          <dl className="bv-finance-lines">
            <div>
              <dt>{bmsg("Legacy PDF plans")}</dt>
              <dd>{money(data.legacyPlanConsumptionMinor)}</dd>
            </div>
          </dl>
          <p className="bv-source-note">
            {number(data.legacyPlanCharges)}{" "}
            {data.legacyPlanCharges === 1
              ? bmsg(
                  "subscription debit recorded in this period, included in total consumption. It is not counted as a dispatch.",
                )
              : bmsg(
                  "subscription debits recorded in this period, included in total consumption. They are not counted as dispatches.",
                )}
          </p>
        </section>
        <section className="bv-panel">
          <SectionHeading title={bmsg("Promotional credits")}>
            {bmsg("Current state of granted credits")}
          </SectionHeading>
          <dl className="bv-finance-lines">
            <div>
              <dt>{bmsg("Total granted")}</dt>
              <dd>{money(data.promotionalGrantedMinor)}</dd>
            </div>
            <div>
              <dt>{bmsg("Remaining balance")}</dt>
              <dd>{money(data.promotionalRemainingMinor)}</dd>
            </div>
          </dl>
          <p className="bv-source-note">
            {bmsg(
              "Promotional credits provide access to the service; they are not receipts.",
            )}
          </p>
        </section>
      </div>
      <section className="bv-panel bv-table-panel">
        <SectionHeading title={bmsg("Monthly summary")}>
          {filters.mode === "production"
            ? bmsg(
                "Debits by ledger month, including PDF checks, legacy plans and the history of deleted dispatches.",
              )
            : bmsg(
                "Simulated consumption by confirmation or ledger month.",
              )}{" "}
          {bmsg("Months at either end of the period may be incomplete.")}
        </SectionHeading>
        {data.monthly.length ? (
          <DataTable label={bmsg("Monthly consumption")}>
            <thead>
              <tr>
                <th>{bmsg("Month")}</th>
                <th className="bv-numeric">{bmsg("Debited dispatches")}</th>
                <th className="bv-numeric">{bmsg("Dispatches and hosting")}</th>
                <th className="bv-numeric">{bmsg("Legacy PDF plans")}</th>
                <th className="bv-numeric">{bmsg("Total consumption")}</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.map((month) => (
                <tr key={month.month}>
                  <td>
                    {new Intl.DateTimeFormat(formatLocale(), {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(
                      new Date(`${month.month.slice(0, 7)}-01T12:00:00Z`),
                    )}
                  </td>
                  <td className="bv-numeric">{number(month.dispatches)}</td>
                  <td className="bv-numeric">
                    {money(
                      month.consumptionMinor - month.legacyPlanConsumptionMinor,
                    )}
                  </td>
                  <td className="bv-numeric">
                    {money(month.legacyPlanConsumptionMinor)}
                  </td>
                  <td className="bv-numeric bv-emphasis">
                    {money(month.consumptionMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <Empty title={bmsg("No consumption recorded in the ledger.")}>
            {bmsg(
              "The summary will appear when workshops consume their credits.",
            )}
          </Empty>
        )}
      </section>
      <p className="bv-freshness">
        {bmsg("Calculated on ")}
        {dateTime(data.generatedAt)}
        {bmsg(" · Quotes and limits remain available in workshop details.")}
      </p>
    </>
  );
}

function Infrastructure({ basePath, revision, refresh }: ViewProps) {
  const [window, setWindow] = useState<"24h" | "7d">("24h");
  const { data, error } = useBelvedereResource<
    import("../../../packages/contracts/src/belvedere-cloudflare").BelvedereCloudflareMetrics
  >(`${basePath}/api/infrastructure?window=${window}`, revision);
  if (error)
    return <Failure error={error} retry={refresh} basePath={basePath} />;
  if (!data) return <Loading />;
  const copy = {
    not_configured: {
      title: bmsg("Cloudflare metrics are not connected yet."),
      description: bmsg(
        "The telemetry source is not configured yet. Once connected on the server, it will show Worker requests and errors.",
      ),
      label: bmsg("Not configured"),
    },
    forbidden: {
      title: bmsg("Access to measurements needs checking."),
      description: bmsg(
        "Cloudflare does not allow reading statistics with the current configuration. Check the connection permissions on the server.",
      ),
      label: bmsg("Access denied"),
    },
    unavailable: {
      title: bmsg("Measurements are temporarily unavailable."),
      description: bmsg(
        "Cloudflare did not return a usable response. Refresh this view to try again.",
      ),
      label: bmsg("Unavailable"),
    },
    no_data: {
      title: bmsg("No measurements in this window."),
      description: bmsg(
        "The connection is configured, but Cloudflare returned no measurements for the selected period.",
      ),
      label: bmsg("No data"),
    },
    ok: {
      title: bmsg("Cloudflare measurements are available."),
      description: bmsg(
        "Measurements aggregated by Cloudflare for the guteneo Worker.",
      ),
      label: bmsg("Connected"),
    },
  }[data.status];
  return (
    <>
      <section className="bv-panel bv-infra-header">
        <div className="bv-infra-service">
          <span className="bv-cloud-icon">
            <Cloud size={30} />
          </span>
          <div>
            <h2>Cloudflare Workers</h2>
            <p>{bmsg("Application execution and reliability")}</p>
          </div>
          <span
            className={`bv-status bv-status-${data.status === "ok" ? "success" : "neutral"}`}
          >
            {copy.label}
          </span>
        </div>
        <label className="bv-infra-window">
          {bmsg("Cloudflare window")}
          <select
            value={window}
            onChange={(event) => setWindow(event.target.value as "24h" | "7d")}
          >
            <option value="24h">{bmsg("Last 24 hours")}</option>
            <option value="7d">{bmsg("Last 7 days")}</option>
          </select>
        </label>
      </section>
      {data.status !== "ok" || !data.metrics ? (
        <section className="bv-infra-empty">
          <Cloud size={60} weight="light" />
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
          <div className="bv-infra-capabilities">
            <span>
              <ChartBar size={19} />
              {bmsg("Request volume")}
            </span>
            <span>
              <WarningCircle size={19} />
              {bmsg("Execution errors")}
            </span>
            <span>
              <ArrowRight size={19} />
              {bmsg("Latency p50 / p99")}
            </span>
          </div>
          {data.status === "unavailable" && (
            <button className="bv-button" onClick={refresh}>
              <ArrowClockwise size={17} />
              {bmsg("Try again")}
            </button>
          )}
        </section>
      ) : (
        <>
          <div className="bv-stats">
            <Stat
              label={bmsg("Worker invocations")}
              value={number(data.metrics.requests)}
              accent
            >
              {number(data.metrics.subrequests)}
              {bmsg(" subrequests")}
            </Stat>
            <Stat
              label={bmsg("Execution errors")}
              value={number(data.metrics.errors)}
            >
              {new Intl.NumberFormat(formatLocale(), {
                style: "percent",
                maximumFractionDigits: 2,
              }).format(data.metrics.errorRate)}{" "}
              {bmsg("of invocations")}
            </Stat>
            <Stat
              label={bmsg("Median latency · p50")}
              value={
                data.metrics.wallTimeP50Milliseconds === null
                  ? bmsg("Unavailable")
                  : `${number(data.metrics.wallTimeP50Milliseconds)} ms`
              }
            >
              {bmsg("Wall-clock execution time")}
            </Stat>
            <Stat
              label={bmsg("High latency · p99")}
              value={
                data.metrics.wallTimeP99Milliseconds === null
                  ? bmsg("Unavailable")
                  : `${number(data.metrics.wallTimeP99Milliseconds)} ms`
              }
            >
              {bmsg("99% of executions below this threshold")}
            </Stat>
          </div>
          <section className="bv-panel">
            <SectionHeading title={bmsg("Hourly requests")}>
              {bmsg("From ")}
              {dateTime(data.startAt)}
              {bmsg(" to ")}
              {dateTime(data.endAt)}
              {bmsg(" · Hours actually returned by Cloudflare")}
            </SectionHeading>
            <InfrastructureChart series={data.series} />
          </section>
        </>
      )}
      <div className="bv-finance-grid">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Measurements with a defined scope.")} />
          <p className="bv-prose">
            {bmsg(
              "These measurements use Cloudflare’s sampled analytics. Errors are Worker execution errors; they do not represent all HTTP error responses.",
            )}
          </p>
          <p className="bv-source-note">
            {bmsg(
              "This window is independent of the workshop period and mode. A missing hour does not mean zero requests.",
            )}
          </p>
        </section>
        <section className="bv-panel">
          <SectionHeading title={bmsg("Service scope")} />
          <p className="bv-prose">
            {bmsg(
              "These statistics cover all access to the configured Worker. They are independent of the workshop mode.",
            )}
          </p>
          <p className="bv-source-note">
            {bmsg(
              "The usage amounts below are a financial source separate from request statistics.",
            )}
          </p>
        </section>
      </div>
      <CloudflareBilling
        basePath={basePath}
        revision={revision}
        refresh={refresh}
      />
      <p className="bv-freshness">
        {bmsg("Last checked: ")}
        {dateTime(data.observedAt)}
        {bmsg(" · Source: Cloudflare GraphQL API")}
      </p>
    </>
  );
}
function InfrastructureChart({
  series,
}: {
  series: import("../../../packages/contracts/src/belvedere-cloudflare").BelvedereCloudflareMetrics["series"];
}) {
  if (!series.length)
    return (
      <Empty title={bmsg("No hourly measurements.")}>
        {bmsg("Points will appear when Cloudflare returns measurements.")}
      </Empty>
    );
  const max = Math.max(...series.map((item) => item.requests), 1);
  return (
    <>
      <div
        className="bv-infra-chart"
        role="img"
        aria-label={bmsg("Hourly request volume, detailed values below")}
      >
        {series.map((item) => (
          <div
            key={item.hour}
            title={bmsg(
              "{0}: {1} requests, {2} errors",
              dateTime(item.hour),
              number(item.requests),
              number(item.errors),
            )}
          >
            <span style={{ height: `${(item.requests / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="bv-chart-caption">
        <span>{dateTime(series[0].hour)}</span>
        <span>{dateTime(series[series.length - 1].hour)}</span>
      </div>
      <details className="bv-chart-table">
        <summary>{bmsg("Show hourly measurements")}</summary>
        <DataTable label={bmsg("Hourly Cloudflare measurements")}>
          <thead>
            <tr>
              <th>{bmsg("Hour")}</th>
              <th className="bv-numeric">{bmsg("Requests")}</th>
              <th className="bv-numeric">{bmsg("Errors")}</th>
              <th className="bv-numeric">{bmsg("Subrequests")}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((item) => (
              <tr key={item.hour}>
                <td>{dateTime(item.hour)}</td>
                <td className="bv-numeric">{number(item.requests)}</td>
                <td className="bv-numeric">{number(item.errors)}</td>
                <td className="bv-numeric">{number(item.subrequests)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </details>
    </>
  );
}

function CloudflareBilling({
  basePath,
  revision,
  refresh,
}: Pick<ViewProps, "basePath" | "revision" | "refresh">) {
  const { data, error } = useBelvedereResource<
    import("../../../packages/contracts/src/belvedere-cloudflare").BelvedereCloudflareBilling
  >(`${basePath}/api/infrastructure/billing`, revision);
  const labels = {
    ok: bmsg("Reported usage"),
    not_configured: bmsg("Not configured"),
    forbidden: bmsg("Access denied"),
    unavailable: bmsg("Unavailable"),
    no_data: bmsg("No data"),
  };
  return (
    <section className="bv-panel bv-table-panel">
      <SectionHeading
        title={bmsg("Billable usage for the Cloudflare account")}
        aside={
          data && (
            <span className="bv-status bv-status-neutral">
              {labels[data.status]}
            </span>
          )
        }
      >
        {bmsg(
          "Current billing cycle, separate from the workshop activity period",
        )}
      </SectionHeading>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading table />
      ) : data.status === "ok" ? (
        <>
          <div className="bv-supplier-totals">
            {data.totals.map((total) => (
              <div key={total.currency}>
                <span>
                  {bmsg("Total ")}
                  {total.currency}
                </span>
                <strong>{money(total.amountMinor, total.currency)}</strong>
                <small className="bv-subtle">
                  {bmsg("Reported: ")}
                  {total.reportedAmountDecimal} {total.currency}
                </small>
              </div>
            ))}
          </div>
          <DataTable label={bmsg("Cloudflare billable usage by service")}>
            <thead>
              <tr>
                <th>{bmsg("Service")}</th>
                <th className="bv-numeric">{bmsg("Billable periods")}</th>
                <th className="bv-numeric">{bmsg("Reported usage")}</th>
                <th className="bv-numeric">{bmsg("Exact source value")}</th>
              </tr>
            </thead>
            <tbody>
              {data.services.map((service) => (
                <tr key={`${service.service}:${service.currency}`}>
                  <td>{service.service}</td>
                  <td className="bv-numeric">
                    {number(service.chargePeriods)}
                  </td>
                  <td className="bv-numeric bv-emphasis">
                    {money(service.amountMinor, service.currency)}
                  </td>
                  <td className="bv-numeric">
                    <code>
                      {service.reportedAmountDecimal} {service.currency}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <p className="bv-source-note">
            {bmsg(
              "Amounts rounded to the nearest minor unit after aggregating each subtotal; no currency conversion.",
            )}{" "}
            {data.firstChargeAt && data.lastChargeAt
              ? bmsg(
                  "Reported periods from {0} to {1}.",
                  dateTime(data.firstChargeAt),
                  dateTime(data.lastChargeAt),
                )
              : bmsg("Charge dates not recorded.")}
          </p>
        </>
      ) : (
        <Empty
          title={
            data.status === "not_configured"
              ? bmsg("Cloudflare costs are not connected yet.")
              : data.status === "forbidden"
                ? bmsg("Billing permissions need to be checked.")
                : data.status === "no_data"
                  ? bmsg("No billable usage reported.")
                  : bmsg("Costs are temporarily unavailable.")
          }
        >
          {data.status === "not_configured"
            ? bmsg(
                "The server connection to the billable usage API is not configured.",
              )
            : data.status === "no_data"
              ? bmsg(
                  "Cloudflare returned no entries for the current cycle; this does not prove there is no charge.",
                )
              : bmsg("Refresh after checking the Cloudflare connection.")}
        </Empty>
      )}
      <div className="bv-billing-note">
        <Notice>
          {bmsg(
            "Measured usage only: excludes subscriptions, taxes and invoice reconciliation. These costs may include other projects hosted on this Cloudflare account; they are not attributed exclusively to guteneo and cannot establish its net profit.",
          )}
        </Notice>
      </div>
    </section>
  );
}

function JobStatuses({
  statuses,
  onSelect,
}: {
  statuses: BelvedereOverview["statuses"];
  onSelect: (status: string) => void;
}) {
  const total = statuses.reduce((sum, item) => sum + item.dispatches, 0);
  const sorted = [...statuses].sort((a, b) => b.dispatches - a.dispatches);
  if (!total)
    return (
      <Empty title={bmsg("No dispatches to break down.")}>
        {bmsg(
          "Statuses will appear when dispatches are created in this period.",
        )}
      </Empty>
    );
  return (
    <div className="bv-job-states">
      {sorted.map((item) => (
        <button key={item.status} onClick={() => onSelect(item.status)}>
          <span>
            <Status value={item.status} />
            <strong>{number(item.dispatches)}</strong>
            <small>
              {new Intl.NumberFormat(formatLocale(), {
                style: "percent",
                maximumFractionDigits: 1,
              }).format(item.dispatches / total)}
            </small>
            <ArrowUpRight size={14} />
          </span>
          <span className="bv-job-state-track">
            <i
              className={`bv-job-state-${item.status}`}
              style={{ width: `${(item.dispatches / total) * 100}%` }}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
const jobStatuses = [
  "prepared",
  "queued",
  "submitting",
  "submission_unknown",
  "accepted",
  "delivered",
  "failed",
  "cancelled",
  "bounced",
  "complained",
  "printed",
  "handed_to_post",
];
function Jobs({
  basePath,
  filters,
  revision,
  refresh,
  openWorkshop,
}: ViewProps & { openWorkshop: (item: { id: string; name: string }) => void }) {
  const initial = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const [query, setQuery] = useState(initial.get("q") || "");
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState(initial.get("channel") || "");
  const [status, setStatus] = useState(initial.get("status") || "");
  const [country, setCountry] = useState(initial.get("country") || "");
  const [statusGroup, setStatusGroup] = useState(
    initial.get("statusGroup") || "",
  );
  const search = useDebounced(query);
  const extra: Record<string, string | number> = {
    q: search,
    page,
    pageSize: 20,
  };
  if (channel) extra.channel = channel;
  if (status) extra.status = status;
  if (country) extra.country = country;
  if (statusGroup) extra.statusGroup = statusGroup;
  const { data, error } = useBelvedereResource<BelvederePage<BelvedereJob>>(
    `${basePath}/api/jobs?${queryString(filters, extra)}`,
    revision,
  );
  const overview = useBelvedereResource<BelvedereOverview>(
    `${basePath}/api/overview?${queryString(filters)}`,
    revision,
  );
  const observedCountries = [
    ...new Set(
      (overview.data?.distributionCountries || []).map(
        (item) => item.country || "unknown",
      ),
    ),
  ];
  if (country && !observedCountries.includes(country))
    observedCountries.push(country);
  const countryOptions = observedCountries.sort((a, b) =>
    countryName(a === "unknown" ? null : a).localeCompare(
      countryName(b === "unknown" ? null : b),
      formatLocale(),
    ),
  );
  function clear() {
    setQuery("");
    setChannel("");
    setStatus("");
    setCountry("");
    setStatusGroup("");
    setPage(1);
  }
  return (
    <>
      <section className="bv-panel bv-table-panel">
        <SectionHeading
          title={bmsg("All dispatches")}
          aside={
            <Search
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder={bmsg("Workshop or dispatch ID…")}
              label={bmsg("Search dispatches")}
            />
          }
        >
          {data
            ? bmsg("{0} dispatches in this view", number(data.total))
            : bmsg("All dispatches log")}{" "}
          {bmsg("· Created in the selected period")}
        </SectionHeading>
        <div className="bv-job-filters">
          <label>
            {bmsg("Channel")}
            <select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{bmsg("All channels")}</option>
              <option value="email">{bmsg("Email")}</option>
              <option value="fax">{bmsg("Fax")}</option>
              <option value="postal">{bmsg("Postal mail")}</option>
            </select>
          </label>
          <label>
            {bmsg("Status")}
            <select
              value={statusGroup ? `group:${statusGroup}` : status}
              onChange={(event) => {
                const value = event.target.value;
                setStatus(value.startsWith("group:") ? "" : value);
                setStatusGroup(
                  value.startsWith("group:") ? value.slice(6) : "",
                );
                setPage(1);
              }}
            >
              <option value="">{bmsg("All statuses")}</option>
              <option value="group:attention">{bmsg("Needs checking")}</option>
              <option value="group:delayed">
                {bmsg("Delayed processing")}
              </option>
              {jobStatuses.map((value) => (
                <option key={value} value={value}>
                  {statusName(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {bmsg("Destination country")}
            <select
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{bmsg("All observed countries")}</option>
              {countryOptions.map((value) => (
                <option key={value} value={value}>
                  {countryName(value === "unknown" ? null : value)}
                </option>
              ))}
            </select>
          </label>
          {(query || channel || status || country || statusGroup) && (
            <button className="bv-text-button" onClick={clear}>
              <X size={14} />
              {bmsg("Reset")}
            </button>
          )}
        </div>
        {statusGroup === "delayed" && (
          <div className="bv-job-explanation">
            <Notice tone="warning">
              {bmsg(
                "Dispatches waiting in the processing queue for over a minute. This view does not trigger any new dispatch or retry.",
              )}
            </Notice>
          </div>
        )}
        {statusGroup === "attention" && (
          <div className="bv-job-explanation">
            <Notice tone="warning">
              {bmsg(
                "Failed or undelivered dispatches, complaints, or unknown provider outcomes. Open the workshop to examine the situation.",
              )}
            </Notice>
          </div>
        )}
        {error ? (
          <Failure error={error} retry={refresh} basePath={basePath} />
        ) : !data ? (
          <Loading table />
        ) : !data.items.length ? (
          <Empty title={bmsg("No matching dispatches.")}>
            {bmsg(
              "Widen the period or remove a filter to find the operations you need.",
            )}
          </Empty>
        ) : (
          <DataTable label={bmsg("All dispatches and their costs")}>
            <thead>
              <tr>
                <th>{bmsg("Dispatch / workshop")}</th>
                <th>{bmsg("Channel")}</th>
                <th>{bmsg("Destination")}</th>
                <th>{bmsg("Status")}</th>
                <th className="bv-numeric">{bmsg("Customer consumption")}</th>
                <th className="bv-numeric">{bmsg("Reserved")}</th>
                <th className="bv-numeric">{bmsg("Provider cost")}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((job) => (
                <tr key={job.id}>
                  <td>
                    <button
                      className="bv-table-link"
                      onClick={() =>
                        openWorkshop({
                          id: job.workshopId,
                          name: job.workshopName,
                        })
                      }
                    >
                      {job.workshopName}
                      <ArrowUpRight size={13} />
                    </button>
                    <code>{job.id}</code>
                    <small>{dateTime(job.createdAt)}</small>
                  </td>
                  <td>
                    <strong>{channelName(job.channel)}</strong>
                    <Mode mode={job.mode} />
                    <small>
                      {job.pages === null
                        ? bmsg("Page count unspecified")
                        : bmsg("{0} pages", number(job.pages))}
                      {job.deliveryMode === "protected_link"
                        ? bmsg(" · Protected link")
                        : job.deliveryMode === "attachment"
                          ? bmsg(" · Attachment")
                          : ""}
                    </small>
                  </td>
                  <td>{countryName(job.destinationCountry)}</td>
                  <td>
                    <Status value={job.status} />
                  </td>
                  <td className="bv-numeric bv-emphasis">
                    {job.customerActualMinor === null ? (
                      <span className="bv-subtle">{bmsg("Not finalised")}</span>
                    ) : (
                      money(job.customerActualMinor)
                    )}
                    <small>
                      {bmsg("Delivery: ")}
                      {money(job.transportActualMinor ?? null)}
                      <br />
                      {bmsg("Hosting: ")}
                      {money(job.hostingFeeMinor ?? 0)}
                    </small>
                  </td>
                  <td className="bv-numeric">
                    {money(job.reservedMinor)}
                    <small>
                      {bmsg("Limit: ")}
                      {money(job.ceilingMinor)}
                    </small>
                  </td>
                  <td className="bv-numeric">
                    {job.supplierVerifiedMinor === null ? (
                      <span className="bv-subtle">{bmsg("Unverified")}</span>
                    ) : (
                      money(
                        job.supplierVerifiedMinor,
                        job.supplierCurrency || "EUR",
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {data && (
          <Pagination
            data={data}
            onChange={setPage}
            label={bmsg("deliveries")}
          />
        )}
      </section>
      <p className="bv-source-note">
        {bmsg(
          "Destination countries come from validated dispatch metadata. Email addresses and older dispatches without a verified country remain “unspecified”. No contents or recipients are displayed.",
        )}
      </p>
    </>
  );
}
