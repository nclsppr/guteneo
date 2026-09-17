import { useEffect, useRef, useState } from "react";
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
  Receipt,
  List,
} from "@phosphor-icons/react";
import { api, ApiError, setSession, type Session } from "./api";
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
import { Billing } from "./billing-page";
import { PostalReviewPage } from "./postal-review-page";
import { Account, TeamAdmin } from "./account-page";
import { LegalPage } from "./legal-page";
import { DeveloperPage } from "./developer-page";
import { ArticlePage, JournalPage, JournalTeaser } from "./editorial/pages";
import { articles, articlePath } from "./editorial/articles";
import {
  Installation,
  WelcomePricing,
  FrequentlyAsked,
  LuxembourgFooter,
  scrollToSection,
} from "./landing-sections";

const publicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === "true";

function Brand({ app = false }: { app?: boolean }) {
  return (
    <a
      className="brand"
      href={app ? "#/app" : "/"}
      aria-label="guteneo, accueil"
    >
      <span className="brand-mark" aria-hidden="true">
        g
      </span>
      <span>{t.brand}</span>
    </a>
  );
}

export function Landing() {
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
          <a href="#how" onClick={(event) => scrollToSection(event, "how")}>
            {t.landing.navHow}
          </a>
          <a
            href="#installation"
            onClick={(event) => scrollToSection(event, "installation")}
          >
            {t.homepage.navInstallation}
          </a>
          <a
            href="#tarifs"
            onClick={(event) => scrollToSection(event, "tarifs")}
          >
            {t.homepage.navPricing}
          </a>
          <a className="button small" href="#/app">
            {publicPreview ? "Explorer la démo" : t.landing.navApp}
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
              {publicPreview ? "Découvrir l’atelier" : t.landing.cta}
              <ArrowUpRight size={20} />
            </a>
            {publicPreview && (
              <p className="preview-caption">
                Aperçu interactif · Sans inscription · Aucun envoi réel
              </p>
            )}
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
        <section className="process" id="how" tabIndex={-1}>
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
        <Installation />
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
        <WelcomePricing />
        <FrequentlyAsked />
        <JournalTeaser />
        <aside className="landing-note">
          <WarningCircle size={21} aria-hidden="true" />
          <p>
            {publicPreview
              ? t.landing.note
              : "Guteneo ouvre progressivement ses services. Les envois payants seront disponibles après la vérification des expéditeurs, des tarifs et de votre accord."}
          </p>
        </aside>
      </main>
      <LuxembourgFooter />
    </div>
  );
}

function Login({
  onLogin,
  registrationAvailable,
}: {
  onLogin: (session: Session) => void;
  registrationAvailable: boolean;
}) {
  const action = useAction();
  const local =
    publicPreview ||
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const authCode = new URLSearchParams(window.location.search).get("auth");
  const authMessages: Record<string, string> = {
    EMAIL_VERIFICATION_REQUIRED:
      "Vérifiez votre adresse avec le lien reçu par e-mail, puis reconnectez-vous.",
    ACCOUNT_VERIFICATION_REQUIRED:
      "La vérification de votre compte n’a pas été confirmée. Vérifiez votre adresse e-mail, puis reconnectez-vous.",
    MFA_REQUIRED:
      "La double authentification est nécessaire pour protéger votre espace. Reconnectez-vous pour terminer sa configuration.",
    IDENTITY_NOT_CONFIGURED:
      "L’ouverture des comptes est en cours de configuration. Réessayez bientôt.",
    LOGIN_STATE_INVALID:
      "Votre connexion a expiré. Recommencez pour ouvrir votre espace.",
    LOGIN_EXCHANGE_FAILED:
      "La connexion n’a pas abouti. Vous pouvez réessayer.",
    LOGIN_RATE_LIMITED:
      "Trop de tentatives de connexion. Réessayez dans une heure.",
  };
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
          <p>
            {local
              ? t.login.body
              : "Vos documents, vos envois et votre facturation réunis dans un espace personnel et protégé."}
          </p>
          <img src="/press-halftone.webp" width="1200" height="1200" alt="" />
        </div>
        <div className="login-panel">
          <h2>
            {publicPreview
              ? "Explorez la démonstration"
              : local
                ? t.login.local
                : t.login.separator}
          </h2>
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
              <p>
                Un compte personnel, vos documents et le suivi de vos envois
                dans un espace privé.
              </p>
              {authCode && (
                <div className="notice warning" role="status">
                  <p>
                    {authMessages[authCode] ??
                      "La connexion n’a pas abouti. Recommencez pour accéder à votre espace."}
                  </p>
                </div>
              )}
              {registrationAvailable ? (
                <a
                  href={`/auth/signup?returnTo=${encodeURIComponent("/#/app")}`}
                  className="button primary"
                >
                  Créer mon compte
                  <ArrowRight size={18} />
                </a>
              ) : (
                <p className="notice info" role="status">
                  L’inscription sera disponible dès que le service de connexion
                  sera raccordé.
                </p>
              )}
              <p>Vous avez déjà un compte ?</p>
              <a
                href={`/auth/login?${authCode ? "fresh=1&" : ""}returnTo=${encodeURIComponent("/" + (window.location.hash || "#/app"))}`}
                className="button"
              >
                {t.login.managed}
                <ArrowRight size={18} />
              </a>
              <p className="field-hint">
                Adresse e-mail vérifiée requise. Aucun envoi payant sans votre
                accord.
              </p>
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
  { id: "billing", path: "/app/billing", Icon: Receipt },
  { id: "account", path: "/app/account", Icon: UserCircle },
  { id: "admin", path: "/app/admin", Icon: Wrench },
] as const;

export function App() {
  if (window.location.pathname === "/developpeurs/") return <DeveloperPage />;
  return <WorkspaceApplication />;
}

function WorkspaceApplication() {
  const route = useRoute();
  const navigationSummary = useRef<HTMLElement>(null);
  const [navigationOpen, setNavigationOpen] = useState(
    () => window.matchMedia("(min-width: 1025px)").matches,
  );
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1025px)");
    const update = () => setNavigationOpen(desktop.matches);
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (window.matchMedia("(max-width: 1024px)").matches)
      setNavigationOpen(false);
  }, [route]);
  const capabilities = useResource<{
    scanner: string;
    registration?: { enabled: boolean };
  }>("/capabilities");
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
  const pathname = window.location.pathname;
  if (pathname === "/journal/") return <JournalPage />;
  const article = articles.find((item) => articlePath(item.slug) === pathname);
  if (article) return <ArticlePage article={article} />;
  if (pathname === "/mentions-legales/") return <LegalPage />;
  if (page === "/mentions-legales") return <LegalPage />;
  if (!page.startsWith("/app")) return <Landing />;
  if (!ready)
    return (
      <div className="initial-loading">
        <Loading />
      </div>
    );
  if (!session)
    return (
      <Login
        onLogin={updateSession}
        registrationAvailable={
          capabilities.data?.registration?.enabled === true
        }
      />
    );
  const refreshSession = async () => {
    try {
      const updated = await api<Session>("/session");
      setSession(updated);
      updateSession(updated);
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setSession(null);
        updateSession(null);
      } else throw error;
    }
  };
  let content;
  if (page === "/app/documents") content = <Documents />;
  else if (page === "/app/prepare")
    content = (
      <PrepareDispatch
        simulation={session.simulation}
        initialDocument={
          new URLSearchParams(route.split("?")[1]).get("document") ?? ""
        }
      />
    );
  else if (page.startsWith("/app/postal/"))
    content = (
      <PostalReviewPage key={page} id={page.slice("/app/postal/".length)} />
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
  else if (page === "/app/billing") content = <Billing session={session} />;
  else if (page === "/app/account")
    content = <Account session={session} onUpdated={refreshSession} />;
  else if (page === "/app/admin")
    content = (
      <Admin>
        <TeamAdmin session={session} onUpdated={refreshSession} />
      </Admin>
    );
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
        <details
          className="workspace-navigation"
          open={navigationOpen}
          onToggle={(event) => setNavigationOpen(event.currentTarget.open)}
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              window.matchMedia("(max-width: 1024px)").matches
            ) {
              event.preventDefault();
              setNavigationOpen(false);
              navigationSummary.current?.focus();
            }
          }}
        >
          <summary ref={navigationSummary}>
            <List size={21} aria-hidden="true" />
            Navigation de l’atelier
          </summary>
          <nav aria-label="Navigation de l’atelier">
            {navigation
              .filter(
                (n) =>
                  !["admin", "billing"].includes(n.id) ||
                  ["admin", "owner", "platform_operator"].includes(
                    session.user.role,
                  ),
              )
              .map(({ id, path, Icon }) => (
                <a
                  key={id}
                  href={`#${path}`}
                  onClick={() => {
                    if (window.matchMedia("(max-width: 1024px)").matches) {
                      setNavigationOpen(false);
                      requestAnimationFrame(() =>
                        document
                          .getElementById("main-content")
                          ?.focus({ preventScroll: true }),
                      );
                    }
                  }}
                  aria-current={
                    page === path ||
                    (id === "dispatches" &&
                      (page.startsWith("/app/dispatch/") ||
                        page === "/app/prepare" ||
                        page.startsWith("/app/postal/")))
                      ? "page"
                      : undefined
                  }
                >
                  <Icon size={21} aria-hidden="true" />
                  <span>{t.nav[id]}</span>
                </a>
              ))}
          </nav>
        </details>
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
              {publicPreview && (
                <span className="scanner-warning">
                  Aperçu dans cet onglet uniquement. Les données sont
                  réinitialisées au rechargement.
                </span>
              )}
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
                  (page === "/app/prepare" ||
                  page.startsWith("/app/dispatch/") ||
                  page.startsWith("/app/postal/")
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
