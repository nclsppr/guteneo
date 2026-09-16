import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  EnvelopeSimple,
  Printer,
  PaperPlaneTilt,
  SquaresFour,
  Files,
  Stack,
  PlugsConnected,
  UserCircle,
  ChartBar,
  Wrench,
  Plus,
  SignOut,
  WarningCircle,
} from "@phosphor-icons/react";
import { api, setSession, type Session } from "./api";
import { fr as t } from "./i18n";
import {
  ErrorNotice,
  Loading,
  useAction,
  useRoute,
  useResource,
} from "./components";
import {
  Overview,
  Documents,
  PrepareDispatch,
  DispatchList,
  DispatchDetailPage,
} from "./dispatch-pages";
import {
  Campaigns,
  CampaignDetail,
  Connection,
  Senders,
  Usage,
  Admin,
} from "./workspace-pages";

function Brand({ app = false }: { app?: boolean }) {
  return (
    <a
      className="brand"
      href={app ? "#/app" : "#/"}
      aria-label="Guteneo, accueil"
    >
      <span className="brand-mark" aria-hidden="true">
        g
      </span>
      <span>{t.brand}</span>
    </a>
  );
}

function Landing() {
  return (
    <div className="landing">
      <a
        className="skip-link"
        href="#landing-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("landing-main")?.focus();
          document.getElementById("landing-main")?.scrollIntoView();
        }}
      >
        {t.skip}
      </a>
      <header className="site-header">
        <Brand />
        <nav aria-label="Navigation principale">
          <a
            href="#how"
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById("how")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {t.landing.navHow}
          </a>
          <a className="button small" href="#/app">
            {t.landing.navApp}
            <ArrowUpRight size={16} />
          </a>
        </nav>
      </header>
      <main id="landing-main" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">{t.landing.eyebrow}</p>
            <h1>
              {t.landing.title}
              <br />
              <em>{t.landing.titleItalic}</em>
            </h1>
            <p className="hero-intro">{t.landing.intro}</p>
            <a className="button primary" href="#/app">
              {t.landing.cta}
              <ArrowUpRight size={20} />
            </a>
          </div>
          <div className="hero-art">
            <img
              src="/press-halftone.webp"
              alt={t.landing.imageAlt}
              width="1200"
              height="1200"
              fetchPriority="high"
            />
          </div>
        </section>
        <p className="hero-caption">{t.landing.caption}</p>
        <section className="process" id="how">
          <div className="section-heading">
            <h2>
              {t.landing.processTitle}
              <br />
              <em>{t.landing.processTitleItalic}</em>
            </h2>
            <p>{t.landing.processIntro}</p>
          </div>
          <div className="process-steps">
            {t.landing.steps.map((step, index) => (
              <article key={step.title}>
                <span className="step-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="channel-section" id="channels">
          <h2>
            {t.landing.channelsTitle}
            <br />
            <em>{t.landing.channelsItalic}</em>
          </h2>
          <div className="channel-list">
            {(["fax", "email", "postal"] as const).map((channel) => {
              const Icon =
                channel === "fax"
                  ? Printer
                  : channel === "email"
                    ? EnvelopeSimple
                    : PaperPlaneTilt;
              return (
                <article key={channel}>
                  <Icon size={34} weight="light" aria-hidden="true" />
                  <div>
                    <h3>{t.channels[channel]}</h3>
                    <p>{t.landing.channelText[channel]}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <aside className="landing-note">
          <WarningCircle size={21} aria-hidden="true" />
          <p>{t.landing.note}</p>
        </aside>
      </main>
      <footer className="site-footer">
        <Brand />
        <p>{t.landing.footer}</p>
        <a href="#/app">
          {t.landing.footerLink}
          <ArrowRight size={18} />
        </a>
      </footer>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const action = useAction();
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    window.location.hostname,
  );
  async function login(organization: "atelier" | "studio") {
    await action.run(async () => {
      await api("/dev/login", { method: "POST", body: { organization } });
      const session = await api<Session>("/session");
      setSession(session);
      onLogin(session);
    });
  }
  return (
    <div className="login-page">
      <header className="site-header">
        <Brand />
        <a href="#/">
          {t.back}
          <ArrowUpRight size={17} />
        </a>
      </header>
      <main className="login-layout">
        <div className="login-intro">
          <h1>{t.login.title}</h1>
          <p>{t.login.body}</p>
          <img src="/press-halftone.webp" width="1200" height="1200" alt="" />
        </div>
        <div className="login-panel">
          <h2>{local ? t.login.local : t.login.separator}</h2>
          {local ? (
            <>
              <div className="notice info">
                <span className="simulation-stamp">{t.simulation}</span>
                <p>{t.simulationBody}</p>
              </div>
              <button
                className="organization-button"
                onClick={() => void login("atelier")}
                disabled={action.pending}
              >
                <span className="organization-initial">A</span>
                <span>{t.login.atelier}</span>
                <ArrowRight size={22} />
              </button>
              <button
                className="organization-button"
                onClick={() => void login("studio")}
                disabled={action.pending}
              >
                <span className="organization-initial">S</span>
                <span>{t.login.studio}</span>
                <ArrowRight size={22} />
              </button>
            </>
          ) : (
            <>
              <p>{t.login.managedBody}</p>
              <a
                href={`/auth/login?returnTo=${encodeURIComponent("/" + (window.location.hash || "#/app"))}`}
                className="button primary"
              >
                {t.login.managed}
                <ArrowRight size={18} />
              </a>
            </>
          )}
          <ErrorNotice error={action.error} />
          {action.pending && <p role="status">{t.loading}</p>}
        </div>
      </main>
    </div>
  );
}

const navigation = [
  { id: "overview", path: "/app", Icon: SquaresFour },
  { id: "documents", path: "/app/documents", Icon: Files },
  { id: "dispatches", path: "/app/dispatches", Icon: PaperPlaneTilt },
  { id: "campaigns", path: "/app/campaigns", Icon: Stack },
  { id: "connection", path: "/app/connection", Icon: PlugsConnected },
  { id: "senders", path: "/app/senders", Icon: UserCircle },
  { id: "usage", path: "/app/usage", Icon: ChartBar },
  { id: "admin", path: "/app/admin", Icon: Wrench },
] as const;

export function App() {
  const route = useRoute();
  const capabilities = useResource<{ scanner: string }>("/capabilities");
  const [session, updateSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [logoutError, setLogoutError] = useState<Error>();
  useEffect(() => {
    let alive = true;
    api<Session>("/session")
      .then((s) => {
        if (alive) {
          setSession(s);
          updateSession(s);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const page = route.split("?")[0] ?? "/";
  if (!page.startsWith("/app")) return <Landing />;
  if (!ready)
    return (
      <div className="initial-loading">
        <Loading />
      </div>
    );
  if (!session) return <Login onLogin={updateSession} />;
  let content;
  if (page === "/app/documents") content = <Documents />;
  else if (page === "/app/prepare")
    content = (
      <PrepareDispatch
        initialDocument={
          new URLSearchParams(route.split("?")[1]).get("document") ?? ""
        }
      />
    );
  else if (page === "/app/dispatches") content = <DispatchList />;
  else if (page.startsWith("/app/dispatch/"))
    content = (
      <DispatchDetailPage
        id={page.slice("/app/dispatch/".length)}
        simulation={session.simulation}
      />
    );
  else if (page === "/app/campaigns") content = <Campaigns />;
  else if (page.startsWith("/app/campaign/"))
    content = <CampaignDetail id={page.slice("/app/campaign/".length)} />;
  else if (page === "/app/connection") content = <Connection />;
  else if (page === "/app/senders") content = <Senders />;
  else if (page === "/app/usage") content = <Usage />;
  else if (page === "/app/admin") content = <Admin />;
  else content = <Overview />;
  const logout = async () => {
    setLogoutError(undefined);
    try {
      await api("/logout", { method: "POST", body: {} });
      setSession(null);
      updateSession(null);
    } catch (e) {
      setLogoutError(e as Error);
    }
  };
  return (
    <div className="workspace">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        {t.skip}
      </a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand app />
          <span className="atelier-label">{t.atelier}</span>
        </div>
        <div className="organization">
          <span className="organization-initial">
            {session.organization.name.slice(0, 1)}
          </span>
          <div>
            <strong>{session.organization.name}</strong>
            <small>{session.user.name}</small>
          </div>
        </div>
        <nav aria-label="Navigation de l’atelier">
          {navigation
            .filter(
              (n) =>
                n.id !== "admin" ||
                ["admin", "owner", "platform_operator"].includes(
                  session.user.role,
                ),
            )
            .map(({ id, path, Icon }) => (
              <a
                key={id}
                href={`#${path}`}
                aria-current={
                  page === path ||
                  (id === "dispatches" &&
                    (page.startsWith("/app/dispatch/") ||
                      page === "/app/prepare"))
                    ? "page"
                    : undefined
                }
              >
                <Icon size={21} aria-hidden="true" />
                <span>{t.nav[id]}</span>
              </a>
            ))}
        </nav>
        <div className="sidebar-footer">
          <p>{t.tagline}</p>
          <button onClick={() => void logout()}>
            <SignOut size={19} />
            {t.login.logout}
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        {session.simulation && (
          <div className="simulation-banner" role="note">
            <span className="simulation-stamp">{t.simulation}</span>
            <p>
              {t.simulationBody}
              {capabilities.data?.scanner ===
                "disabled_in_local_simulation" && (
                <span className="scanner-warning">{t.scanDisabled}</span>
              )}
            </p>
          </div>
        )}
        <div className="app-topbar">
          <button
            className="mobile-logout icon-link"
            aria-label={t.login.logout}
            onClick={() => void logout()}
          >
            <SignOut size={19} />
          </button>
          <span>
            {
              t.nav[
                navigation.find((n) => n.path === page)?.id ??
                  (page === "/app/prepare" || page.startsWith("/app/dispatch/")
                    ? "dispatches"
                    : page.startsWith("/app/campaign/")
                      ? "campaigns"
                      : "overview")
              ]
            }
          </span>
          <a className="button small primary" href="#/app/prepare">
            <Plus size={16} />
            {t.dispatch.new}
          </a>
        </div>
        <main id="main-content" tabIndex={-1}>
          <ErrorNotice error={logoutError} />
          {content}
        </main>
        <footer className="app-footer">
          <span>{t.brand}</span>
          <span>{session.organization.name}</span>
          <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </footer>
      </div>
    </div>
  );
}
