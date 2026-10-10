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
import { bmsg } from "./belvedere-i18n";
import { formatLocale, useLocale } from "./locale";
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
  { id: "overview", label: "Synthèse", icon: ChartBar },
  { id: "workshops", label: "Ateliers", icon: Buildings },
  { id: "jobs", label: "Envois", icon: PaperPlaneTilt },
  { id: "members", label: "Membres", icon: Users },
  { id: "connections", label: "Connexions", icon: GlobeHemisphereWest },
  { id: "finance", label: "Finances", icon: CurrencyEur },
  { id: "infrastructure", label: "Infrastructure", icon: Cloud },
] as const;
const pageCopy: Record<View, { title: string; description: string }> = {
  overview: {
    title: "Tout voir, à la bonne hauteur.",
    description: "L’activité de guteneo, des ateliers aux connexions.",
  },
  workshops: {
    title: "Les ateliers, dans le détail.",
    description: "Retrouvez chaque équipe, ses usages et sa consommation.",
  },
  jobs: {
    title: "Chaque envoi, à portée de vue.",
    description:
      "Tous les jobs, leur destination, leur état et leur coût détaillé.",
  },
  members: {
    title: "Les personnes derrière l’activité.",
    description: "Tous les membres, leurs ateliers et leurs accès.",
  },
  connections: {
    title: "Chaque connexion a une origine.",
    description: "Sessions navigateur, applications natives et assistants.",
  },
  finance: {
    title: "Des chiffres qui disent ce qu’ils sont.",
    description: "Consommation, encaissements et coûts fournisseurs distincts.",
  },
  infrastructure: {
    title: "Sous le capot de guteneo.",
    description:
      "L’état des services et les mesures disponibles chez Cloudflare.",
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
  const main = useRef<HTMLElement>(null);
  const navButton = useRef<HTMLButtonElement>(null);
  const demo =
    document.querySelector<HTMLMetaElement>(
      'meta[name="guteneo-belvedere-demo"]',
    )?.content === "true";
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
        {bmsg("Aller au contenu")}
      </a>
      <aside
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
          aria-label={bmsg("Belvédère, synthèse")}
        >
          <img
            src="/brand/guteneo-mark-128.webp"
            width="38"
            height="38"
            alt=""
          />
          <span>
            guteneo<span className="bv-identity-name">Belvédère</span>
          </span>
        </a>
        <nav aria-label={bmsg("Navigation Belvédère")}>
          {navigation.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} weight={view === id ? "fill" : "regular"} />
              <span>{bmsg(label)}</span>
              {view === id && (
                <span className="bv-nav-mark" aria-hidden="true" />
              )}
            </a>
          ))}
        </nav>
        <div className="bv-sidebar-foot">
          <div className="bv-private">
            <ShieldCheck size={18} />
            <span>
              {bmsg("Espace privé")}
              <span>{bmsg("Lecture seule")}</span>
            </span>
          </div>
          <a href="/">
            {bmsg("Retour à guteneo")}
            <ArrowUpRight size={16} />
          </a>
          <div className="bv-account">
            <span className="bv-avatar">NP</span>
            <span>
              Nicolas Pieper<span>{bmsg("Veilleur")}</span>
            </span>
          </div>
        </div>
      </aside>
      <div className="bv-workspace">
        <header className="bv-topbar">
          <button
            className="bv-mobile-toggle"
            ref={navButton}
            aria-expanded={mobileNav}
            aria-label={
              mobileNav
                ? bmsg("Fermer la navigation")
                : bmsg("Ouvrir la navigation")
            }
            onClick={() => setMobileNav(!mobileNav)}
          >
            {mobileNav ? <X size={20} /> : <List size={20} />}
            <span>Belvédère</span>
          </button>
          <div className="bv-breadcrumb">
            <span>Belvédère</span>
            <span aria-hidden="true">/</span>
            <strong>
              {bmsg(navigation.find((item) => item.id === view)?.label ?? "")}
            </strong>
          </div>
          <span className="bv-topbar-access">
            <ShieldCheck size={15} />
            {bmsg("Accès personnel")}
          </span>
        </header>
        {demo && (
          <div className="bv-demo" role="note">
            {bmsg(
              "Démonstration locale — données fictives, aucun service réel.",
            )}
          </div>
        )}
        <main id="belvedere-main" ref={main} tabIndex={-1}>
          <div className="bv-heading">
            <div>
              <h1>
                {workshop
                  ? workshop.name || bmsg("Détail de l’atelier")
                  : bmsg(pageCopy[view].title)}
              </h1>
              <p>
                {workshop
                  ? bmsg(
                      "L’activité, les membres et le détail des opérations de cet atelier.",
                    )
                  : bmsg(pageCopy[view].description)}
              </p>
            </div>
            <button
              className="bv-button bv-refresh"
              onClick={refresh}
              aria-label={bmsg("Actualiser les données")}
            >
              <ArrowClockwise size={17} />
              <span>{bmsg("Actualiser")}</span>
            </button>
          </div>
          {view !== "infrastructure" && (
            <div className="bv-filterbar">
              <div className="bv-filter-fields">
                <label>
                  <span>{bmsg("Période")}</span>
                  <select
                    value={period}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPeriod(value);
                      if (value !== "custom")
                        setFilters(periodFilters(Number(value), filters.mode));
                    }}
                  >
                    <option value="7">{bmsg("7 derniers jours")}</option>
                    <option value="30">{bmsg("30 derniers jours")}</option>
                    <option value="90">{bmsg("90 derniers jours")}</option>
                    <option value="custom">
                      {bmsg("Dates personnalisées")}
                    </option>
                  </select>
                </label>
                <label>
                  <span>{bmsg("Données")}</span>
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
                  ? bmsg("Activité de production")
                  : bmsg("Simulation uniquement")}
              </span>
            </div>
          )}
          {view !== "infrastructure" && period === "custom" && (
            <div className="bv-custom-dates">
              <label>
                {bmsg("Du")}
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
                {bmsg("Au")}
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
              <span>{bmsg("Dates incluses, en UTC.")}</span>
            </div>
          )}
          {accessError ? (
            <Failure error={accessError} retry={refresh} basePath={basePath} />
          ) : !validDates && view !== "infrastructure" ? (
            <Notice tone="warning">
              {bmsg(
                "La période doit être chronologique et ne pas dépasser 366 jours.",
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
            <span>{bmsg("Belvédère par guteneo")}</span>
            <span>
              {bmsg(
                "Montants en EUR sauf indication · Dates affichées en heure locale",
              )}
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
          ? bmsg("Votre accès doit être vérifié.")
          : bmsg("Les données n’ont pas pu être chargées.")}
      </h2>
      <p>
        {expired
          ? bmsg("Votre accès à Belvédère a expiré ou n’est plus autorisé.")
          : bmsg("La lecture des données a échoué. Vous pouvez réessayer.")}
      </p>
      {expired ? (
        <a className="bv-button bv-button-primary" href={basePath}>
          {bmsg("Vérifier mon accès")}
          <ArrowRight size={17} />
        </a>
      ) : (
        <button className="bv-button" onClick={retry}>
          <ArrowClockwise size={17} />
          {bmsg("Réessayer")}
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
      aria-label={bmsg("Chargement des données")}
    >
      <span className="sr-only">{bmsg("Chargement des données…")}</span>
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
  label = bmsg("résultats"),
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
              "{0}–{1} sur ",
              number((data.page - 1) * data.pageSize + 1),
              number(Math.min(data.page * data.pageSize, data.total)),
            )
          : ""}
        {number(data.total)} {label}
      </span>
      <div>
        <button
          className="bv-icon-button"
          aria-label={bmsg("Page précédente")}
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
          aria-label={bmsg("Page suivante")}
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
        <button
          onClick={() => onChange("")}
          aria-label={bmsg("Effacer la recherche")}
        >
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
          label={bmsg("Envois sur la période")}
          value={number(totals.dispatches)}
          accent
        >
          {number(totals.delivered)}
          {bmsg(" livrés · ")}
          {number(totals.pages)}
          {bmsg(" pages")}
        </Stat>
        <Stat
          label={bmsg("Consommation client")}
          value={money(totals.customerConsumptionMinor)}
        >
          {money(totals.reservedMinor)}
          {bmsg(" réservés")}
        </Stat>
        <Stat label={bmsg("Ateliers")} value={number(totals.workshops)}>
          {number(totals.members)}
          {bmsg(" membres distincts")}
        </Stat>
        <Stat
          label={bmsg("Connexions actives")}
          value={number(totals.activeConnections)}
        >
          {bmsg("Sessions non expirées et autorisations actives")}
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
          <SectionHeading title={bmsg("Le rythme de l’activité")}>
            {bmsg("Du ")}
            {shortDate(filters.from)}
            {bmsg(" au ")}
            {shortDate(filters.to)}
            {bmsg(" · agrégation quotidienne UTC")}
          </SectionHeading>
          <ActivityChart data={data.trend} />
        </section>
        <section className="bv-panel bv-attention">
          <SectionHeading
            title={bmsg("À surveiller")}
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
                        ? bmsg("Vérification nécessaire")
                        : bmsg("Examiner les envois concernés")}
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
              <h3>{bmsg("Aucun envoi à surveiller.")}</h3>
              <p>
                {bmsg(
                  "Les données disponibles ne signalent aucun incident sur cette période.",
                )}
              </p>
            </div>
          )}
          <div className="bv-attention-foot">
            <ShieldCheck size={17} />
            <span>
              {bmsg(
                "Le Belvédère observe. Les actions métier restent dans les ateliers.",
              )}
            </span>
          </div>
        </section>
        <section className="bv-panel">
          <SectionHeading
            title={bmsg("Où en sont les envois ?")}
            aside={
              <button className="bv-text-button" onClick={() => openJobs()}>
                {bmsg("Tous les envois")}
                <ArrowUpRight size={16} />
              </button>
            }
          >
            {bmsg("État actuel des envois créés sur la période")}
          </SectionHeading>
          <JobStatuses
            statuses={data.statuses}
            onSelect={(status) => openJobs({ status })}
          />
        </section>
        <section className="bv-panel">
          <SectionHeading
            title={bmsg("Ce qui circule")}
            aside={
              <span className="bv-subtle">
                {number(totals.documents)}
                {bmsg(" documents")}
              </span>
            }
          >
            {bmsg("Répartition des envois et de la consommation client")}
          </SectionHeading>
          <Channels channels={data.channels} />
          <button
            className="bv-text-button bv-panel-link"
            onClick={() => navigate("finance")}
          >
            {bmsg("Voir le détail financier")}
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <p className="bv-source-note">
        {bmsg("Pays de connexion estimés par Cloudflare.")}{" "}
        {data.telemetry.since
          ? bmsg("Collecte depuis le {0}.", shortDate(data.telemetry.since))
          : bmsg("Collecte à partir des nouvelles connexions.")}{" "}
        {bmsg(
          "La consommation correspond à l’état actuel des envois créés sur la période.",
        )}
      </p>
      <p className="bv-freshness">
        <span aria-hidden="true" />
        {bmsg("Calculé le ")}
        {dateTime(data.generatedAt)}
        {bmsg(
          " · Les totaux d’ateliers, membres et sessions décrivent l’état actuel.",
        )}
      </p>
    </>
  );
}
function incidentName(kind: string) {
  return (
    {
      failed: bmsg("Envois en échec"),
      unknown: bmsg("Résultats fournisseurs inconnus"),
      pending: bmsg("Envois en attente"),
      stale_outbox: bmsg("Envois bloqués dans la file"),
      outbox_failed: bmsg("Échecs de traitement"),
      rejected: bmsg("Envois refusés"),
      provider_unknown: bmsg("Résultats fournisseurs inconnus"),
      dispatch_attention: bmsg("Envois à vérifier"),
      outbox_delayed: bmsg("Traitements retardés"),
      dispatch_failed: bmsg("Envois en échec"),
      uncertain: bmsg("Résultats à confirmer"),
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
        <div className="bv-segmented" aria-label={bmsg("Mesure du graphique")}>
          {(
            [
              ["dispatches", bmsg("Envois")],
              ["consumptionMinor", bmsg("Consommation")],
              ["connections", bmsg("Connexions")],
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
          <small>{bmsg(" sur la période")}</small>
        </span>
      </div>
      {data.length === 0 ? (
        <Empty title={bmsg("L’activité se dessinera ici.")}>
          {bmsg("Aucune mesure n’est disponible pour cette période.")}
        </Empty>
      ) : (
        <>
          <div className="bv-chart" onMouseLeave={() => setActiveIndex(null)}>
            <svg
              viewBox={compact ? "0 0 560 250" : "0 0 960 250"}
              role="group"
              aria-label={bmsg(
                "Évolution quotidienne : {0}",
                metric === "consumptionMinor"
                  ? bmsg("consommation client en euros")
                  : metric === "dispatches"
                    ? bmsg("envois")
                    : bmsg("connexions"),
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
                ? bmsg("Coût client actuel, par jour de création")
                : metric === "dispatches"
                  ? bmsg("Envois créés")
                  : bmsg("Connexions établies")}
            </span>
            <span>
              {active
                ? `${shortDate(active.date)} · ${formatted(active[metric])}`
                : bmsg("Survolez ou sélectionnez un jour pour le détail")}
            </span>
          </div>
          <details className="bv-chart-table">
            <summary>{bmsg("Afficher les valeurs du graphique")}</summary>
            <DataTable label={bmsg("Valeurs quotidiennes")}>
              <thead>
                <tr>
                  <th>{bmsg("Date")}</th>
                  <th className="bv-numeric">{bmsg("Envois")}</th>
                  <th className="bv-numeric">{bmsg("Livrés")}</th>
                  <th className="bv-numeric">{bmsg("Connexions")}</th>
                  <th className="bv-numeric">{bmsg("Consommation")}</th>
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
      <Empty title={bmsg("La géographie reste à observer.")}>
        {bmsg(
          "Les pays apparaîtront avec les nouvelles connexions. L’historique sans pays conserve la mention « non renseigné ».",
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
            ? bmsg("Réduire la liste")
            : bmsg("Voir les {0} pays", number(sorted.length))}
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
      <Empty title={bmsg("Aucun envoi sur cette période.")}>
        {bmsg("La répartition par canal apparaîtra après les premiers envois.")}
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
              "{0} : {1} envois",
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
        <span>{bmsg("Canal")}</span>
        <span>{bmsg("Envois")}</span>
        <span>{bmsg("Consommation")}</span>
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
        title={bmsg("Tous les ateliers")}
        aside={
          <Search
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={bmsg("Nom d’un atelier…")}
            label={bmsg("Rechercher un atelier")}
          />
        }
      >
        {data
          ? bmsg("{0} ateliers dans cette vue", number(data.total))
          : bmsg("Consultation des ateliers")}{" "}
        {bmsg("· Activité filtrée sur la période")}
      </SectionHeading>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading table />
      ) : !data.items.length ? (
        <Empty
          title={
            search
              ? bmsg("Aucun atelier ne correspond.")
              : bmsg("Aucun atelier dans ce mode.")
          }
        >
          {search
            ? bmsg("Essayez un nom plus court ou effacez la recherche.")
            : bmsg(
                "Changez le filtre de données pour consulter les autres ateliers.",
              )}
        </Empty>
      ) : (
        <DataTable label={bmsg("Ateliers et consommation")}>
          <thead>
            <tr>
              <th>{bmsg("Atelier")}</th>
              <th className="bv-numeric">{bmsg("Membres")}</th>
              <th className="bv-numeric">{bmsg("Envois")}</th>
              <th className="bv-numeric">{bmsg("Consommation")}</th>
              <th>{bmsg("À surveiller")}</th>
              <th>{bmsg("Dernière activité")}</th>
              <th>
                <span className="sr-only">{bmsg("Détail")}</span>
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
                    {bmsg(" réservés")}
                  </small>
                </td>
                <td>
                  {item.attention > 0 ? (
                    <span className="bv-status bv-status-warning">
                      {number(item.attention)}
                      {bmsg(" envois")}
                    </span>
                  ) : (
                    <span className="bv-table-ok">
                      <CheckCircle size={16} />
                      {bmsg("Rien à signaler")}
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
                    aria-label={bmsg("Consulter {0}", item.name)}
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
        <Pagination data={data} onChange={setPage} label={bmsg("ateliers")} />
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
        {bmsg("Tous les ateliers")}
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
              {bmsg("Créé le ")}
              {shortDate(data.workshop.createdAt)}
            </span>
            <span>
              {bmsg("Dernière activité : ")}
              {dateTime(data.workshop.lastActivityAt)}
            </span>
          </div>
          <div className="bv-stats">
            <Stat
              label={bmsg("Consommation sur la période")}
              value={money(data.workshop.consumptionMinor)}
              accent
            >
              {money(data.workshop.reservedMinor)}
              {bmsg(" réservés")}
            </Stat>
            <Stat
              label={bmsg("Envois")}
              value={number(data.workshop.dispatches)}
            >
              {number(data.workshop.attention)}
              {bmsg(" à surveiller")}
            </Stat>
            <Stat
              label={bmsg("Documents")}
              value={number(data.workshop.documents)}
            >
              {number(data.workshop.pages)}
              {bmsg(" pages")}
            </Stat>
            <Stat
              label={bmsg("Crédit disponible")}
              value={money(data.workshop.availableCreditMinor)}
            >
              {bmsg("Solde actuel de l’atelier")}
            </Stat>
          </div>
          <div className="bv-detail-grid">
            <section className="bv-panel">
              <SectionHeading title={bmsg("Consommation par canal")}>
                {bmsg(
                  "État actuel des montants des envois créés sur la période",
                )}
              </SectionHeading>
              <Channels channels={data.channels} />
            </section>
            <section className="bv-panel">
              <SectionHeading
                title={bmsg("Membres de l’atelier")}
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
                  <Empty title={bmsg("Aucun membre dans la projection.")}>
                    {bmsg(
                      "Les membres apparaîtront après leur rattachement à l’atelier.",
                    )}
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
                  label={bmsg("membres")}
                />
              )}
            </section>
          </div>
          <section className="bv-panel bv-table-panel">
            <SectionHeading title={bmsg("Détail des envois")}>
              {bmsg(
                "Coût client, réservation et coût fournisseur vérifié. Le contenu des documents et les destinataires restent privés.",
              )}
            </SectionHeading>
            {data.dispatches.items.length ? (
              <DataTable label={bmsg("Envois de l’atelier")}>
                <thead>
                  <tr>
                    <th>{bmsg("Envoi")}</th>
                    <th>{bmsg("Canal / mode")}</th>
                    <th>{bmsg("État")}</th>
                    <th className="bv-numeric">{bmsg("Pages")}</th>
                    <th className="bv-numeric">{bmsg("Consommé")}</th>
                    <th className="bv-numeric">{bmsg("Réservé")}</th>
                    <th className="bv-numeric">{bmsg("Coût fournisseur")}</th>
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
                            {bmsg("Non finalisé")}
                          </span>
                        ) : (
                          money(dispatch.customerActualMinor)
                        )}
                        <small>
                          {bmsg("Transport :")}{" "}
                          {money(dispatch.transportActualMinor ?? null)}
                          {bmsg(" · Hébergement : ")}
                          {money(dispatch.hostingFeeMinor ?? 0)}
                        </small>
                        <small>
                          {bmsg("Devis : ")}
                          {money(dispatch.estimatedMinor)}
                          <br />
                          {bmsg("Plafond : ")}
                          {money(dispatch.ceilingMinor)}
                        </small>
                      </td>
                      <td className="bv-numeric">
                        {money(dispatch.reservedMinor)}
                      </td>
                      <td className="bv-numeric">
                        {dispatch.supplierVerifiedMinor === null ? (
                          <span className="bv-subtle">
                            {bmsg("Non vérifié")}
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
              <Empty title={bmsg("Aucun envoi sur cette période.")}>
                {bmsg(
                  "Choisissez une autre période pour consulter l’historique de cet atelier.",
                )}
              </Empty>
            )}
            <Pagination
              data={data.dispatches}
              onChange={setPage}
              label={bmsg("envois")}
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
        title={bmsg("Annuaire des membres")}
        aside={
          <Search
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={bmsg("Nom ou adresse email…")}
            label={bmsg("Rechercher un membre")}
          />
        }
      >
        {data
          ? bmsg("{0} personnes", number(data.total))
          : bmsg("Tous les membres")}
        {bmsg(" · Les appartenances et connexions décrivent l’état actuel")}
      </SectionHeading>
      {error ? (
        <Failure error={error} retry={refresh} basePath={basePath} />
      ) : !data ? (
        <Loading table />
      ) : !data.items.length ? (
        <Empty title={bmsg("Aucun membre ne correspond.")}>
          {bmsg(
            "Essayez un autre nom, une autre adresse email ou un autre mode.",
          )}
        </Empty>
      ) : (
        <DataTable label={bmsg("Membres et accès")}>
          <thead>
            <tr>
              <th>{bmsg("Membre")}</th>
              <th>{bmsg("Ateliers et rôles")}</th>
              <th className="bv-numeric">{bmsg("Connexions actives")}</th>
              <th>{bmsg("Dernière connexion observée")}</th>
              <th>{bmsg("Inscription")}</th>
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
                            ? ` · ${[workshop.canApprove ? bmsg("approbation") : "", workshop.canReport ? bmsg("rapports") : ""].filter(Boolean).join(", ")}`
                            : ""}
                        </small>
                      </div>
                    ))}
                    {member.workshopsTotal > member.workshops.length && (
                      <small>
                        {number(member.workshops.length)}
                        {bmsg(" ateliers affichés sur")}{" "}
                        {number(member.workshopsTotal)}
                        {bmsg(
                          ". Consultez les autres appartenances depuis les ateliers.",
                        )}
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
        <Pagination data={data} onChange={setPage} label={bmsg("membres")} />
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
          <SectionHeading title={bmsg("Origine des connexions")}>
            {bmsg("Événements observés sur la période sélectionnée")}
          </SectionHeading>
          {data ? <Countries countries={data.countries} /> : <Loading table />}
        </section>
        <section className="bv-panel bv-telemetry">
          <GlobeHemisphereWest size={36} weight="light" />
          <h2>{bmsg("Une géographie observée, jamais devinée.")}</h2>
          <p>
            {bmsg(
              "Le pays est fourni par Cloudflare lors de la connexion. Une session ancienne sans mesure conserve un pays non renseigné.",
            )}
          </p>
          <dl>
            <div>
              <dt>{bmsg("Début de la collecte")}</dt>
              <dd>
                {data?.since
                  ? dateTime(data.since)
                  : bmsg("Aucun événement collecté")}
              </dd>
            </div>
            <div>
              <dt>{bmsg("Historique conservé")}</dt>
              <dd>
                {data
                  ? bmsg("{0} jours", number(data.retentionDays))
                  : bmsg("Chargement…")}
              </dd>
            </div>
            <div>
              <dt>{bmsg("Périmètre")}</dt>
              <dd>{bmsg("Connexions établies avec succès")}</dd>
            </div>
          </dl>
          <p className="bv-source-note">
            {bmsg(
              "Une connexion correspond à une session ou une autorisation, pas à chaque requête ni à une présence en temps réel.",
            )}
          </p>
        </section>
      </div>
      <section className="bv-panel bv-table-panel">
        <SectionHeading
          title={bmsg("Journal des accès")}
          aside={
            <Search
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder={bmsg("Personne ou atelier…")}
              label={bmsg("Rechercher une connexion")}
            />
          }
        />
        <div
          className="bv-tabs"
          role="group"
          aria-label={bmsg("Type de connexion")}
        >
          <button
            aria-pressed={tab === "current"}
            onClick={() => {
              setTab("current");
              setPage(1);
            }}
          >
            {bmsg("Sessions et autorisations actuelles")}
            {data && <span>{number(data.current.total)}</span>}
          </button>
          <button
            aria-pressed={tab === "events"}
            onClick={() => {
              setTab("events");
              setPage(1);
            }}
          >
            {bmsg("Historique des connexions")}
            {data && <span>{number(data.events.total)}</span>}
          </button>
        </div>
        {!data ? (
          <Loading table />
        ) : tab === "current" ? (
          <>
            {data.current.items.length ? (
              <DataTable label={bmsg("Sessions et autorisations actuelles")}>
                <thead>
                  <tr>
                    <th>{bmsg("Personne / atelier")}</th>
                    <th>{bmsg("Accès")}</th>
                    <th>{bmsg("Pays")}</th>
                    <th>{bmsg("État")}</th>
                    <th>{bmsg("Dernière connexion observée")}</th>
                    <th>{bmsg("Expiration")}</th>
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
                          {bmsg("Créé le ")}
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
                          : bmsg("Sans expiration renseignée")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <Empty title={bmsg("Aucune session dans cette vue.")}>
                {bmsg(
                  "Changez les filtres ou consultez l’historique des connexions.",
                )}
              </Empty>
            )}
            <Pagination
              data={data.current}
              onChange={setPage}
              label={bmsg("sessions et autorisations")}
            />
          </>
        ) : (
          <>
            {data.events.items.length ? (
              <DataTable label={bmsg("Historique des connexions")}>
                <thead>
                  <tr>
                    <th>{bmsg("Date de connexion")}</th>
                    <th>{bmsg("Personne")}</th>
                    <th>{bmsg("Atelier")}</th>
                    <th>{bmsg("Accès")}</th>
                    <th>{bmsg("Pays observé")}</th>
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
              <Empty title={bmsg("Aucune nouvelle connexion observée.")}>
                {bmsg(
                  "Les connexions établies après l’activation de la collecte apparaîtront ici.",
                )}
              </Empty>
            )}
            <Pagination
              data={data.events}
              onChange={setPage}
              label={bmsg("connexions")}
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
      browser: bmsg("Navigateur"),
      native: bmsg("Application native"),
      mcp: bmsg("Assistant MCP"),
      browser_login: bmsg("Navigateur"),
      native_login: bmsg("Application native"),
      mcp_authorization: bmsg("Assistant MCP"),
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
            {bmsg("Consommation client comptabilisée")}
          </span>
          <strong>{money(data.customerConsumptionMinor)}</strong>
          <p>
            {filters.mode === "production"
              ? bmsg(
                  "Débits des envois, de l’hébergement et d’Horizon enregistrés sur la période, selon leur date de comptabilisation, y compris pour les envois supprimés depuis. Ces montants peuvent provenir de crédits promotionnels.",
                )
              : bmsg(
                  "Consommations simulées des envois et d’Horizon selon leur date de confirmation ou de comptabilisation. Elles ne représentent pas des encaissements réels.",
                )}
          </p>
          <span className="bv-finance-reserved">
            {money(data.reservedMinor)}
            {bmsg(
              " actuellement réservés pour les envois créés sur la période",
            )}
          </span>
        </section>
        <section>
          <span className="bv-finance-label">
            {bmsg("Encaissements vérifiés")}
          </span>
          <div className="bv-finance-cash">
            {data.cashStatus === "unconfigured" ? (
              <strong className="bv-unavailable">
                {bmsg("Non configurés")}
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
                  "Les paiements vérifiés Stripe ne sont pas encore disponibles. Aucun chiffre d’affaires n’est déduit de la consommation.",
                )
              : bmsg(
                  "Paiements Stripe vérifiés selon la date de création enregistrée par Stripe, regroupés par devise. Cette date ne prouve pas leur date de réception bancaire ; les crédits promotionnels sont exclus.",
                )}
          </p>
        </section>
      </div>
      <div className="bv-finance-grid">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Coûts fournisseurs")}>
            {bmsg("Rapprochements fournisseur enregistrés sur la période")}
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
                {bmsg("Aucun coût fournisseur vérifié sur cette période.")}
              </p>
            )}
          </div>
          <Notice
            tone={data.supplierUnverifiedDispatches > 0 ? "warning" : "neutral"}
          >
            {number(data.supplierUnverifiedDispatches)}
            {bmsg(
              " envois créés sur la période sans coût fournisseur vérifié. Une valeur absente ne signifie pas un coût nul.",
            )}
          </Notice>
        </section>
        <section className="bv-panel bv-result">
          <SectionHeading title={bmsg("Résultat net")} />
          <strong>{bmsg("Non calculable")}</strong>
          <p>
            {data.netResultUnavailableReason ||
              bmsg(
                "Les charges complètes ne sont pas encore rapprochées. Le résultat net ne peut pas être calculé de façon fiable.",
              )}
          </p>
          <span className="bv-source-note">
            {bmsg(
              "Les encaissements, la consommation et les coûts connus ne constituent pas à eux seuls un résultat comptable.",
            )}
          </span>
        </section>
      </div>
      <div className="bv-finance-grid">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Consommation par canal")}>
            {bmsg(
              "Volumes : envois créés sur la période. Montants : débits comptabilisés sur la période, hors abonnement Horizon.",
            )}
          </SectionHeading>
          <Channels channels={data.channels} />
          <dl className="bv-finance-lines">
            <div>
              <dt>{bmsg("Abonnement Horizon")}</dt>
              <dd>{money(data.horizonConsumptionMinor)}</dd>
            </div>
          </dl>
          <p className="bv-source-note">
            {number(data.horizonCharges)}{" "}
            {data.horizonCharges === 1
              ? bmsg(
                  "débit d’abonnement comptabilisé sur la période, inclus dans la consommation totale. Il n’est pas compté comme un envoi.",
                )
              : bmsg(
                  "débits d’abonnement comptabilisés sur la période, inclus dans la consommation totale. Ils ne sont pas comptés comme des envois.",
                )}
          </p>
        </section>
        <section className="bv-panel">
          <SectionHeading title={bmsg("Crédits promotionnels")}>
            {bmsg("État actuel des crédits offerts")}
          </SectionHeading>
          <dl className="bv-finance-lines">
            <div>
              <dt>{bmsg("Total accordé")}</dt>
              <dd>{money(data.promotionalGrantedMinor)}</dd>
            </div>
            <div>
              <dt>{bmsg("Solde restant")}</dt>
              <dd>{money(data.promotionalRemainingMinor)}</dd>
            </div>
          </dl>
          <p className="bv-source-note">
            {bmsg(
              "Les crédits promotionnels donnent accès au service ; ils ne constituent pas un encaissement.",
            )}
          </p>
        </section>
      </div>
      <section className="bv-panel bv-table-panel">
        <SectionHeading title={bmsg("Récapitulatif mensuel")}>
          {filters.mode === "production"
            ? bmsg(
                "Débits selon leur mois de comptabilisation, y compris Horizon et l’historique des envois supprimés.",
              )
            : bmsg(
                "Consommations simulées selon leur mois de confirmation ou de comptabilisation.",
              )}{" "}
          {bmsg(
            "Les mois aux extrémités de la période peuvent être incomplets.",
          )}
        </SectionHeading>
        {data.monthly.length ? (
          <DataTable label={bmsg("Consommation mensuelle")}>
            <thead>
              <tr>
                <th>{bmsg("Mois")}</th>
                <th className="bv-numeric">{bmsg("Envois débités")}</th>
                <th className="bv-numeric">{bmsg("Envois et hébergement")}</th>
                <th className="bv-numeric">Horizon</th>
                <th className="bv-numeric">{bmsg("Consommation totale")}</th>
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
                      month.consumptionMinor - month.horizonConsumptionMinor,
                    )}
                  </td>
                  <td className="bv-numeric">
                    {money(month.horizonConsumptionMinor)}
                  </td>
                  <td className="bv-numeric bv-emphasis">
                    {money(month.consumptionMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <Empty title={bmsg("Aucune consommation comptabilisée.")}>
            {bmsg(
              "Le récapitulatif apparaîtra lorsque les ateliers consommeront leurs crédits.",
            )}
          </Empty>
        )}
      </section>
      <p className="bv-freshness">
        {bmsg("Calculé le ")}
        {dateTime(data.generatedAt)}
        {bmsg(
          " · Les devis et plafonds restent consultables dans le détail des ateliers.",
        )}
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
      title: bmsg("Cloudflare attend sa connexion."),
      description: bmsg(
        "La source de télémétrie n’est pas encore configurée. Une fois reliée côté serveur, elle permettra de suivre les requêtes et erreurs du Worker.",
      ),
      label: bmsg("Non configuré"),
    },
    forbidden: {
      title: bmsg("L’accès aux mesures doit être vérifié."),
      description: bmsg(
        "Cloudflare n’autorise pas la lecture des statistiques avec la configuration actuelle. Les permissions de la connexion doivent être vérifiées côté serveur.",
      ),
      label: bmsg("Accès refusé"),
    },
    unavailable: {
      title: bmsg("Les mesures sont momentanément indisponibles."),
      description: bmsg(
        "Cloudflare n’a pas fourni de réponse exploitable. Vous pouvez actualiser cette vue pour réessayer.",
      ),
      label: bmsg("Indisponible"),
    },
    no_data: {
      title: bmsg("Aucune mesure dans cette fenêtre."),
      description: bmsg(
        "La connexion est configurée, mais Cloudflare n’a renvoyé aucune mesure pour la période choisie.",
      ),
      label: bmsg("Sans données"),
    },
    ok: {
      title: bmsg("Les mesures Cloudflare sont disponibles."),
      description: bmsg(
        "Mesures agrégées par Cloudflare pour le Worker de guteneo.",
      ),
      label: bmsg("Connecté"),
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
            <p>{bmsg("Exécution et fiabilité de l’application")}</p>
          </div>
          <span
            className={`bv-status bv-status-${data.status === "ok" ? "success" : "neutral"}`}
          >
            {copy.label}
          </span>
        </div>
        <label className="bv-infra-window">
          {bmsg("Fenêtre Cloudflare")}
          <select
            value={window}
            onChange={(event) => setWindow(event.target.value as "24h" | "7d")}
          >
            <option value="24h">{bmsg("24 dernières heures")}</option>
            <option value="7d">{bmsg("7 derniers jours")}</option>
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
              {bmsg("Volume de requêtes")}
            </span>
            <span>
              <WarningCircle size={19} />
              {bmsg("Erreurs d’exécution")}
            </span>
            <span>
              <ArrowRight size={19} />
              {bmsg("Latence p50 / p99")}
            </span>
          </div>
          {data.status === "unavailable" && (
            <button className="bv-button" onClick={refresh}>
              <ArrowClockwise size={17} />
              {bmsg("Réessayer")}
            </button>
          )}
        </section>
      ) : (
        <>
          <div className="bv-stats">
            <Stat
              label={bmsg("Invocations du Worker")}
              value={number(data.metrics.requests)}
              accent
            >
              {number(data.metrics.subrequests)}
              {bmsg(" sous-requêtes")}
            </Stat>
            <Stat
              label={bmsg("Erreurs d’exécution")}
              value={number(data.metrics.errors)}
            >
              {new Intl.NumberFormat(formatLocale(), {
                style: "percent",
                maximumFractionDigits: 2,
              }).format(data.metrics.errorRate)}{" "}
              {bmsg("des invocations")}
            </Stat>
            <Stat
              label={bmsg("Latence médiane · p50")}
              value={
                data.metrics.wallTimeP50Milliseconds === null
                  ? bmsg("Non disponible")
                  : `${number(data.metrics.wallTimeP50Milliseconds)} ms`
              }
            >
              {bmsg("Temps d’exécution mural")}
            </Stat>
            <Stat
              label={bmsg("Latence haute · p99")}
              value={
                data.metrics.wallTimeP99Milliseconds === null
                  ? bmsg("Non disponible")
                  : `${number(data.metrics.wallTimeP99Milliseconds)} ms`
              }
            >
              {bmsg("99 % des exécutions sous ce seuil")}
            </Stat>
          </div>
          <section className="bv-panel">
            <SectionHeading title={bmsg("Requêtes par heure")}>
              {bmsg("Du ")}
              {dateTime(data.startAt)}
              {bmsg(" au ")}
              {dateTime(data.endAt)}
              {bmsg(" · heures effectivement renvoyées par Cloudflare")}
            </SectionHeading>
            <InfrastructureChart series={data.series} />
          </section>
        </>
      )}
      <div className="bv-finance-grid">
        <section className="bv-panel">
          <SectionHeading title={bmsg("Des mesures, avec leur périmètre.")} />
          <p className="bv-prose">
            {bmsg(
              "Ces mesures utilisent les données analytiques échantillonnées de Cloudflare. Les erreurs sont des erreurs d’exécution du Worker ; elles ne représentent pas l’ensemble des réponses HTTP en erreur.",
            )}
          </p>
          <p className="bv-source-note">
            {bmsg(
              "Cette fenêtre est indépendante de la période et du mode des ateliers. Une heure absente ne signifie pas zéro requête.",
            )}
          </p>
        </section>
        <section className="bv-panel">
          <SectionHeading title={bmsg("Périmètre du service")} />
          <p className="bv-prose">
            {bmsg(
              "Ces statistiques couvrent le Worker configuré, tous ses accès confondus. Elles sont indépendantes du mode des ateliers.",
            )}
          </p>
          <p className="bv-source-note">
            {bmsg(
              "Les montants d’usage ci-dessous sont une source financière distincte des statistiques de requêtes.",
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
        {bmsg("Dernière vérification : ")}
        {dateTime(data.observedAt)}
        {bmsg(" · Source : API GraphQL Cloudflare")}
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
      <Empty title={bmsg("Aucune heure mesurée.")}>
        {bmsg(
          "Les points apparaîtront lorsque Cloudflare retournera des mesures.",
        )}
      </Empty>
    );
  const max = Math.max(...series.map((item) => item.requests), 1);
  return (
    <>
      <div
        className="bv-infra-chart"
        role="img"
        aria-label={bmsg(
          "Volume des requêtes par heure, valeurs détaillées ci-dessous",
        )}
      >
        {series.map((item) => (
          <div
            key={item.hour}
            title={bmsg(
              "{0} : {1} requêtes, {2} erreurs",
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
        <summary>{bmsg("Afficher les mesures horaires")}</summary>
        <DataTable label={bmsg("Mesures Cloudflare par heure")}>
          <thead>
            <tr>
              <th>{bmsg("Heure")}</th>
              <th className="bv-numeric">{bmsg("Requêtes")}</th>
              <th className="bv-numeric">{bmsg("Erreurs")}</th>
              <th className="bv-numeric">{bmsg("Sous-requêtes")}</th>
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
    ok: bmsg("Usage déclaré"),
    not_configured: bmsg("Non configuré"),
    forbidden: bmsg("Accès refusé"),
    unavailable: bmsg("Indisponible"),
    no_data: bmsg("Sans données"),
  };
  return (
    <section className="bv-panel bv-table-panel">
      <SectionHeading
        title={bmsg("Usage facturable du compte Cloudflare")}
        aside={
          data && (
            <span className="bv-status bv-status-neutral">
              {labels[data.status]}
            </span>
          )
        }
      >
        {bmsg(
          "Cycle de facturation en cours, distinct de la période d’activité des ateliers",
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
                  {bmsg("Déclaré : ")}
                  {total.reportedAmountDecimal} {total.currency}
                </small>
              </div>
            ))}
          </div>
          <DataTable label={bmsg("Usage facturable Cloudflare par service")}>
            <thead>
              <tr>
                <th>{bmsg("Service")}</th>
                <th className="bv-numeric">{bmsg("Périodes facturables")}</th>
                <th className="bv-numeric">{bmsg("Usage déclaré")}</th>
                <th className="bv-numeric">{bmsg("Valeur source exacte")}</th>
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
              "Montants arrondis au centime après agrégation de chaque sous-total ; aucune conversion de devise.",
            )}{" "}
            {data.firstChargeAt && data.lastChargeAt
              ? bmsg(
                  "Périodes déclarées du {0} au {1}.",
                  dateTime(data.firstChargeAt),
                  dateTime(data.lastChargeAt),
                )
              : bmsg("Dates des charges non renseignées.")}
          </p>
        </>
      ) : (
        <Empty
          title={
            data.status === "not_configured"
              ? bmsg("Les coûts Cloudflare restent à connecter.")
              : data.status === "forbidden"
                ? bmsg("Les permissions de facturation doivent être vérifiées.")
                : data.status === "no_data"
                  ? bmsg("Aucun usage facturable déclaré.")
                  : bmsg("Les coûts sont momentanément indisponibles.")
          }
        >
          {data.status === "not_configured"
            ? bmsg(
                "La connexion serveur à l’API d’usage facturable n’est pas configurée.",
              )
            : data.status === "no_data"
              ? bmsg(
                  "Cloudflare n’a renvoyé aucune ligne pour le cycle courant ; ce n’est pas une preuve de gratuité.",
                )
              : bmsg(
                  "Actualisez après vérification de la connexion Cloudflare.",
                )}
        </Empty>
      )}
      <div className="bv-billing-note">
        <Notice>
          {bmsg(
            "Usage mesuré uniquement : hors abonnements, taxes et rapprochement de facture. Ces coûts peuvent inclure d’autres projets hébergés sur ce compte Cloudflare ; ils ne sont pas attribués exclusivement à guteneo et ne permettent pas de calculer son bénéfice net.",
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
      <Empty title={bmsg("Aucun envoi à répartir.")}>
        {bmsg(
          "Les états apparaîtront lorsque des envois seront créés sur la période.",
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
          title={bmsg("Tous les envois")}
          aside={
            <Search
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder={bmsg("Atelier ou identifiant d’envoi…")}
              label={bmsg("Rechercher un envoi")}
            />
          }
        >
          {data
            ? bmsg("{0} envois dans cette vue", number(data.total))
            : bmsg("Journal de tous les envois")}{" "}
          {bmsg("· Créés sur la période sélectionnée")}
        </SectionHeading>
        <div className="bv-job-filters">
          <label>
            {bmsg("Canal")}
            <select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{bmsg("Tous les canaux")}</option>
              <option value="email">{bmsg("Email")}</option>
              <option value="fax">{bmsg("Fax")}</option>
              <option value="postal">{bmsg("Courrier postal")}</option>
            </select>
          </label>
          <label>
            {bmsg("État")}
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
              <option value="">{bmsg("Tous les états")}</option>
              <option value="group:attention">{bmsg("À vérifier")}</option>
              <option value="group:delayed">
                {bmsg("Traitements retardés")}
              </option>
              {jobStatuses.map((value) => (
                <option key={value} value={value}>
                  {statusName(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {bmsg("Pays de destination")}
            <select
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{bmsg("Tous les pays observés")}</option>
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
              {bmsg("Réinitialiser")}
            </button>
          )}
        </div>
        {statusGroup === "delayed" && (
          <div className="bv-job-explanation">
            <Notice tone="warning">
              {bmsg(
                "Envois dont le traitement attend depuis plus d’une minute dans la file. Aucun nouvel envoi ni aucune relance n’est déclenché depuis cette vue.",
              )}
            </Notice>
          </div>
        )}
        {statusGroup === "attention" && (
          <div className="bv-job-explanation">
            <Notice tone="warning">
              {bmsg(
                "Envois en échec, non distribués, signalés par une plainte ou dont le résultat fournisseur est inconnu. Ouvrez l’atelier pour examiner la situation.",
              )}
            </Notice>
          </div>
        )}
        {error ? (
          <Failure error={error} retry={refresh} basePath={basePath} />
        ) : !data ? (
          <Loading table />
        ) : !data.items.length ? (
          <Empty title={bmsg("Aucun envoi ne correspond.")}>
            {bmsg(
              "Élargissez la période ou retirez un filtre pour retrouver les opérations recherchées.",
            )}
          </Empty>
        ) : (
          <DataTable label={bmsg("Tous les envois et leurs coûts")}>
            <thead>
              <tr>
                <th>{bmsg("Envoi / atelier")}</th>
                <th>{bmsg("Canal")}</th>
                <th>{bmsg("Destination")}</th>
                <th>{bmsg("État")}</th>
                <th className="bv-numeric">{bmsg("Consommation client")}</th>
                <th className="bv-numeric">{bmsg("Réservé")}</th>
                <th className="bv-numeric">{bmsg("Coût fournisseur")}</th>
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
                        ? bmsg("Pages non renseignées")
                        : bmsg("{0} pages", number(job.pages))}
                      {job.deliveryMode === "protected_link"
                        ? bmsg(" · Lien protégé")
                        : job.deliveryMode === "attachment"
                          ? bmsg(" · Pièce jointe")
                          : ""}
                    </small>
                  </td>
                  <td>{countryName(job.destinationCountry)}</td>
                  <td>
                    <Status value={job.status} />
                  </td>
                  <td className="bv-numeric bv-emphasis">
                    {job.customerActualMinor === null ? (
                      <span className="bv-subtle">{bmsg("Non finalisé")}</span>
                    ) : (
                      money(job.customerActualMinor)
                    )}
                    <small>
                      {bmsg("Transport : ")}
                      {money(job.transportActualMinor ?? null)}
                      <br />
                      {bmsg("Hébergement : ")}
                      {money(job.hostingFeeMinor ?? 0)}
                    </small>
                  </td>
                  <td className="bv-numeric">
                    {money(job.reservedMinor)}
                    <small>
                      {bmsg("Plafond : ")}
                      {money(job.ceilingMinor)}
                    </small>
                  </td>
                  <td className="bv-numeric">
                    {job.supplierVerifiedMinor === null ? (
                      <span className="bv-subtle">{bmsg("Non vérifié")}</span>
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
          <Pagination data={data} onChange={setPage} label={bmsg("envois")} />
        )}
      </section>
      <p className="bv-source-note">
        {bmsg(
          "Les pays de destination proviennent des métadonnées validées des envois. Les adresses email et les envois anciens sans pays vérifié restent « non renseignés ». Aucun contenu ni destinataire n’est affiché.",
        )}
      </p>
    </>
  );
}
