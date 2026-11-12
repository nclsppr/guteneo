import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  House,
  List,
  Moon,
  Sun,
  UserCircle,
  SpeakerHigh,
  SpeakerSlash,
} from "@phosphor-icons/react";
import {
  I18nProvider,
  initialLocale,
  loadCatalog,
  localeNames,
  supportedLocales,
  useI18n,
  useT,
  type SupportedLocale,
} from "./i18n";
import { SessionProvider, useSession, useReadySession } from "./session";
import { useResource } from "./api/hooks";
import type { Overview } from "./api/types";
import { API_ORIGIN, signInUrl } from "./config";
import { Link, useRoute, type Route } from "./router";
import { visibleSections, sectionOf, type Section } from "./sections";
import { Brand } from "./components/brand";
import { SplitFlap } from "./components/split-flap";
import {
  Announcer,
  Dialog,
  ErrorNotice,
  Empty,
  Notice,
  Sign,
} from "./components/ui";
import { setLight, useLight } from "./theme";
import { setSoundEnabled, soundEnabled, subscribeSound } from "./sound";
import "./design/base.css";
import "./design/station.css";

const DeparturesPage = lazy(() =>
  import("./pages/traffic").then((m) => ({ default: m.DeparturesPage })),
);
const CounterPage = lazy(() =>
  import("./pages/traffic").then((m) => ({ default: m.CounterPage })),
);
const DocumentsPage = lazy(() =>
  import("./pages/documents").then((m) => ({ default: m.DocumentsPage })),
);
const ArrivalsPage = lazy(() =>
  import("./pages/documents").then((m) => ({ default: m.ArrivalsPage })),
);
const DestinationsPage = lazy(() =>
  import("./pages/workspaces").then((m) => ({ default: m.DestinationsPage })),
);
const TimetablePage = lazy(() =>
  import("./pages/workspaces").then((m) => ({ default: m.TimetablePage })),
);
const StudioPage = lazy(() =>
  import("./pages/workspaces").then((m) => ({ default: m.StudioPage })),
);
const OfficePage = lazy(() =>
  import("./pages/workspaces").then((m) => ({ default: m.OfficePage })),
);
const LockersPage = lazy(() =>
  import("./pages/workspaces").then((m) => ({ default: m.LockersPage })),
);
const AccountPage = lazy(() =>
  import("./pages/workspaces").then((m) => ({ default: m.AccountPage })),
);

function Preferences() {
  const { locale, setLocale, t } = useI18n();
  const { light } = useLight();
  const sound = useSyncExternalStore(subscribeSound, soundEnabled);
  const [error, setError] = useState<unknown>();
  return (
    <div className="preferences">
      <label className="locale-picker">
        <span className="visually-hidden">{t("shell.language")}</span>
        <select
          aria-label={t("shell.language")}
          value={locale}
          onChange={(event) =>
            void setLocale(event.target.value as SupportedLocale).catch(
              setError,
            )
          }
        >
          {supportedLocales.map((value) => (
            <option value={value} key={value}>
              {localeNames[value]}
            </option>
          ))}
        </select>
      </label>
      <button
        className="icon-button"
        onClick={() => setLight(light === "night" ? "day" : "night")}
        aria-label={t(light === "night" ? "shell.day" : "shell.night")}
      >
        {light === "night" ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <button
        className="icon-button sound-control"
        onClick={() => setSoundEnabled(!sound)}
        aria-label={t("shell.sound")}
        aria-pressed={sound}
      >
        {sound ? <SpeakerHigh size={20} /> : <SpeakerSlash size={20} />}
      </button>
      {error ? <span role="alert">{t("error.NETWORK")}</span> : null}
    </div>
  );
}

function Loading() {
  const t = useT();
  return (
    <div className="station-loading" role="status" aria-live="polite">
      <span className="visually-hidden">{t("state.loading")}</span>
      <div className="skeleton sign-skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

function Hall({ route }: { route: Route }) {
  const { locale, t } = useI18n();
  const { state, refresh, developmentEntry, developmentSignIn } = useSession();
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const login = signInUrl(
    route.path === "/"
      ? "/departures"
      : route.path + (route.query.size ? `?${route.query}` : ""),
    locale,
  );
  const services = [
    { key: "send", path: "/counter", board: "hall.board.send", track: "01" },
    {
      key: "receive",
      path: "/arrivals",
      board: "hall.board.receive",
      track: "02",
    },
    { key: "create", path: "/studio", board: "hall.board.create", track: "03" },
  ];
  return (
    <div className="hall-wrap">
      <header className="hall-header">
        <Brand />
        <Preferences />
        <a className="button is-small" href={login}>
          {t("action.signIn")}
          <ArrowUpRight size={18} />
        </a>
      </header>
      <main id="main" className="hall-main">
        <section className="hall-hero">
          <div className="hall-invitation">
            <p className="station-name">
              gare<span> / guteneo</span>
            </p>
            <h1>{t("hall.title")}</h1>
            <p className="hall-copy">{t("hall.description")}</p>
            <a className="button is-signal hall-cta" href={login}>
              {t("hall.start")}
              <ArrowUpRight size={24} />
            </a>
            <p className="hall-return">
              <a href={API_ORIGIN}>{t("hall.classic")}</a>
            </p>
          </div>
          <div className="hall-board">
            <div className="hall-board-top">
              <span>{t("hall.board.title")}</span>
              <ArrowUpRight size={34} weight="bold" />
            </div>
            <div className="hall-board-labels">
              <span>{t("hall.board.track")}</span>
              <span>{t("hall.board.destination")}</span>
            </div>
            {services.map((service) => (
              <a
                className="hall-board-row"
                key={service.key}
                href={signInUrl(service.path, locale)}
              >
                <span className="hall-board-track">{service.track}</span>
                <div>
                  <span className="visually-hidden">{t(service.board)}</span>
                  <SplitFlap text={t(service.board)} cells={11} size="lg" />
                  <p>{t(`hall.${service.key}.description`)}</p>
                </div>
                <ArrowUpRight className="hall-board-arrow" size={22} />
              </a>
            ))}
            <div className="hall-board-bottom">
              <span>{t("hall.board.bottom")}</span>
              <span className="board-line" aria-hidden="true" />
            </div>
          </div>
        </section>
        <div className="hall-manifesto">
          <p>{t("hall.promise")}</p>
          <span className="caps">{t("hall.channels")}</span>
        </div>
        {state.status === "unreachable" && (
          <ErrorNotice error={state.error} retry={() => void refresh()} />
        )}
        <ErrorNotice error={error} />
        {developmentEntry && (
          <section className="local-entry">
            <Notice>{t("hall.simulation")}</Notice>
            <button
              className="button"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void developmentSignIn("atelier")
                  .catch(setError)
                  .finally(() => setPending(false));
              }}
            >
              {t("hall.localEntry")}
            </button>
          </section>
        )}
      </main>
      <footer className="hall-footer">
        <span>guteneo · gare</span>
        <nav aria-label={t("shell.footer")}>
          <a href={`${API_ORIGIN}/pricing`}>{t("footer.pricing")}</a>
          <a href={`${API_ORIGIN}/support`}>{t("footer.support")}</a>
          <a href={`${API_ORIGIN}/privacy`}>{t("footer.privacy")}</a>
          <a href={`${API_ORIGIN}/terms`}>{t("footer.terms")}</a>
        </nav>
      </footer>
    </div>
  );
}

function StationNavigation({
  items,
  path,
  onNavigate,
}: {
  items: Section[];
  path: string;
  onNavigate?: () => void;
}) {
  const t = useT();
  return (
    <nav className="rail-nav" aria-label={t("shell.navigation")}>
      <Link
        className={`rail-item${path === "/" ? " is-current" : ""}`}
        href="/"
        aria-current={path === "/" ? "page" : undefined}
        onClick={onNavigate}
      >
        <span className="rail-track">G</span>
        <House size={20} />
        <span>{t("shell.hall")}</span>
      </Link>
      {items.map((section) => (
        <Link
          className={`rail-item${sectionOf(path)?.id === section.id ? " is-current" : ""}`}
          href={section.path}
          key={section.id}
          onClick={onNavigate}
          aria-current={sectionOf(path)?.id === section.id ? "page" : undefined}
        >
          <span className="rail-track">{section.track}</span>
          <section.icon size={20} />
          <span>{t(`section.${section.id}`)}</span>
        </Link>
      ))}
    </nav>
  );
}

function Welcome() {
  const { workspace, personal } = useReadySession();
  const t = useT();
  const overview = useResource<Overview>(workspace ? "/overview" : null);
  const items = visibleSections(workspace, personal);
  return (
    <>
      <Sign title={t("welcome.title")} />
      <p className="welcome-intro">{t("welcome.description")}</p>
      {workspace && (
        <section className="welcome-board" aria-label={t("welcome.activity")}>
          <div>
            <span className="caps">{t("welcome.workspace")}</span>
            <h2>{workspace.organization.name}</h2>
          </div>
          <div className="welcome-count">
            <span className="caps">{t("section.departures")}</span>
            <strong>{overview.data?.dispatches.total ?? "·"}</strong>
          </div>
          <div className="welcome-count">
            <span className="caps">{t("section.documents")}</span>
            <strong>{overview.data?.documents ?? "·"}</strong>
          </div>
        </section>
      )}
      <ErrorNotice error={overview.error} retry={overview.refresh} />
      <div className="station-map">
        {items.map((section) => (
          <Link
            href={section.path}
            className="station-map-item"
            key={section.id}
          >
            <span className="map-track">
              {String(section.track).padStart(2, "0")}
            </span>
            <div>
              <h2>{t(`section.${section.id}`)}</h2>
              <p>{t(`description.${section.id}`)}</p>
            </div>
            <section.icon size={28} />
            <ArrowRight className="map-arrow" size={22} />
          </Link>
        ))}
      </div>
    </>
  );
}

function Page({ route }: { route: Route }) {
  const { workspace, personal } = useReadySession();
  const t = useT();
  if (route.path === "/") return <Welcome />;
  if (route.path === "/account") return <AccountPage />;
  const section = sectionOf(route.path);
  if (!section)
    return (
      <>
        <Sign title={t("state.notFound")} />
        <Link className="button" href="/">
          {t("shell.hall")}
        </Link>
      </>
    );
  if (
    !visibleSections(workspace, personal).some((item) => item.id === section.id)
  )
    return (
      <>
        <Sign title={t(`section.${section.id}`)} />
        <Empty title={t("state.noAccess")}>
          <Link className="button" href="/account">
            {t("shell.account")}
          </Link>
        </Empty>
      </>
    );
  switch (section.id) {
    case "departures":
      return <DeparturesPage route={route} />;
    case "counter":
      return <CounterPage route={route} />;
    case "arrivals":
      return <ArrivalsPage />;
    case "documents":
      return <DocumentsPage />;
    case "destinations":
      return <DestinationsPage />;
    case "timetable":
      return <TimetablePage />;
    case "studio":
      return <StudioPage />;
    case "office":
      return <OfficePage />;
    case "lockers":
      return <LockersPage />;
  }
}

function Station({ route }: { route: Route }) {
  const { workspace, personal, signOut, expired } = useReadySession();
  const { locale, t } = useI18n();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<unknown>();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(route.path);
  const items = visibleSections(workspace, personal);
  useEffect(() => {
    if (previousPath.current !== route.path) {
      previousPath.current = route.path;
      main.current?.focus();
    }
    document.title = `${sectionOf(route.path) ? t(`section.${sectionOf(route.path)!.id}`) : t("shell.hall")} · gare · guteneo`;
  }, [route.path, t]);
  return (
    <div className="station">
      <a className="skip" href="#main">
        {t("shell.skip")}
      </a>
      <aside className="rail">
        <Brand />
        <span className="rail-name">gare</span>
        <StationNavigation items={items} path={route.path} />
        <div className="rail-foot">
          <span className="workspace-label">
            {workspace?.organization.name ?? personal?.user.name}
          </span>
          <Link className="account-link" href="/account">
            <UserCircle size={22} />
            {t("shell.account")}
          </Link>
          <Preferences />
          <button
            className="link sign-out"
            onClick={() => void signOut().catch(setError)}
          >
            {t("action.signOut")}
          </button>
        </div>
      </aside>
      <div className="concourse">
        <header className="overhead">
          <Brand />
          <Preferences />
        </header>
        <main id="main" className="platform" ref={main} tabIndex={-1}>
          {workspace?.simulation || personal?.simulation ? (
            <div className="simulation-band">{t("state.simulation")}</div>
          ) : null}
          {expired && (
            <Notice tone="danger">
              <a
                href={signInUrl(
                  route.path + (route.query.size ? `?${route.query}` : ""),
                  locale,
                )}
              >
                {t("state.expired")}
              </a>
            </Notice>
          )}
          <ErrorNotice error={error} />
          <Suspense fallback={<Loading />}>
            <Page route={route} />
          </Suspense>
        </main>
      </div>
      <nav className="dock" aria-label={t("shell.quickNavigation")}>
        {items.slice(0, 3).map((section) => (
          <Link
            key={section.id}
            className={`dock-item${sectionOf(route.path)?.id === section.id ? " is-current" : ""}`}
            href={section.path}
          >
            <section.icon size={22} />
            <span>{t(`section.${section.id}`)}</span>
          </Link>
        ))}
        <Link
          className={`dock-item${route.path === "/account" ? " is-current" : ""}`}
          href="/account"
        >
          <UserCircle size={22} />
          <span>{t("shell.account")}</span>
        </Link>
        <button
          className="dock-item"
          onClick={() => setMenu(true)}
          aria-expanded={menu}
        >
          <List size={22} />
          <span>{t("shell.menu")}</span>
        </button>
      </nav>
      {menu && (
        <Dialog title={t("shell.navigation")} onClose={() => setMenu(false)}>
          <StationNavigation
            items={items}
            path={route.path}
            onNavigate={() => setMenu(false)}
          />
          <button
            className="button"
            onClick={() => void signOut().catch(setError)}
          >
            {t("action.signOut")}
          </button>
        </Dialog>
      )}
    </div>
  );
}

class ViewBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function App() {
  const route = useRoute();
  const { state } = useSession();
  const t = useT();
  return (
    <ViewBoundary
      key={route.path}
      fallback={
        <div className="fatal-error">
          <h1>{t("state.failed")}</h1>
          <p>{t("error.INTERNAL_ERROR")}</p>
          <button className="button" onClick={() => window.location.reload()}>
            {t("action.retry")}
          </button>
        </div>
      }
    >
      {state.status === "loading" ? (
        <Loading />
      ) : state.status === "ready" ? (
        <Station route={route} />
      ) : (
        <Hall route={route} />
      )}
    </ViewBoundary>
  );
}

async function start() {
  const locale = initialLocale();
  const catalog = await loadCatalog(locale);
  createRoot(document.getElementById("root")!).render(
    <I18nProvider locale={locale} catalog={catalog}>
      <SessionProvider>
        <Announcer>
          <App />
        </Announcer>
      </SessionProvider>
    </I18nProvider>,
  );
}
void start().catch(() => {
  const root = document.getElementById("root")!;
  const text = {
    fr: "Le chargement a échoué. Rechargez cette page.",
    en: "Loading failed. Please reload this page.",
    de: "Das Laden ist fehlgeschlagen. Bitte laden Sie die Seite neu.",
    lb: "D'Luede feelgeschloen. Luet dës Säit nei.",
  };
  root.textContent = text[initialLocale()];
  root.setAttribute("role", "alert");
});
