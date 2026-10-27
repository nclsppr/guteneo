import { defaultDashboardAppearance } from "../../../packages/contracts/src/dashboard-appearance";
import { msg } from "./messages";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileText,
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
  Receipt,
  List,
  AddressBook,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  api,
  ApiError,
  canAdminister,
  isPublicPreview,
  permissionsFor,
  SESSION_EXPIRED_EVENT,
  setSession,
  type Session,
} from "./api";
import { t, initializeLocale, useLocale } from "./locale";
import { canonicalPublicLocation } from "../../../packages/contracts/src/public-routes";
import { PublicHomepage } from "./public-homepage";
import {
  isPublicSitePage,
  getPublicSitePageMetadata,
} from "./public-site-metadata";
import { syncPublicSharing } from "./public-sharing";
import { Brand } from "./brand";
import { ErrorNotice, go, Loading, useRoute, useResource } from "./components";
import { PdfCheckPage } from "./pdf-check-offer";
import { Login } from "./login-page";
// This small shell starts the private session read on the first render instead
// of waiting for a second route chunk and an initial Suspense fallback.
import PersonalArea from "./personal-area";
import { personalApi } from "./personal-api";
import { WorkspaceIdentity } from "./workspace-identity";
import { RolePermissionNotice } from "./role-guide";
import { InvitationPage } from "./invitation-page";
import { LegalPage } from "./legal-page";
import { InformationPage, getInformationPages } from "./information-page";
import { DeveloperPage } from "./developer-page";
import { ArticlePage, JournalPage } from "./editorial/pages";
import { getArticles, articlePath } from "./editorial/articles";
import { AssistantsPage } from "./assistants-page";
import { RememberDirectChoice } from "./assistant-state";
import { clearPendingDocumentInvitation } from "./document-invitation";
import {
  DashboardAppearanceProvider,
  useDashboardAppearance,
} from "./dashboard-appearance";
import "./document-studio.css";
import "./secure-documents.css";

const publicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === "true";
let loadedPublicSitePage:
  typeof import("./public-site-pages").PublicSitePage | null = null;
let publicSitePageLoad: Promise<void> | null = null;
/** Retain useful initial HTML while the requested public-detail chunk loads. */
export function preloadPublicSitePage(): Promise<void> {
  return (publicSitePageLoad ??= import("./public-site-pages").then(
    (module) => {
      loadedPublicSitePage = module.PublicSitePage;
    },
  ));
}
const LazyPublicSitePage = lazy(async () => {
  await preloadPublicSitePage();
  return { default: loadedPublicSitePage! };
});

const EmailPreferencesPage = lazy(() => import("./email-preferences"));

const Overview = lazy(() =>
  import("./dispatch-pages").then((module) => ({ default: module.Overview })),
);
const Documents = lazy(() =>
  import("./dispatch-pages").then((module) => ({ default: module.Documents })),
);
const PrepareDispatch = lazy(() =>
  import("./dispatch-pages").then((module) => ({
    default: module.PrepareDispatch,
  })),
);
const DispatchList = lazy(() =>
  import("./dispatch-pages").then((module) => ({
    default: module.DispatchList,
  })),
);
const DispatchDetailPage = lazy(() =>
  import("./dispatch-pages").then((module) => ({
    default: module.DispatchDetailPage,
  })),
);
const Campaigns = lazy(() =>
  import("./workspace-pages").then((module) => ({ default: module.Campaigns })),
);
const CampaignDetail = lazy(() =>
  import("./workspace-pages").then((module) => ({
    default: module.CampaignDetail,
  })),
);
const Senders = lazy(() =>
  import("./workspace-pages").then((module) => ({ default: module.Senders })),
);
const Usage = lazy(() =>
  import("./workspace-pages").then((module) => ({ default: module.Usage })),
);
const Admin = lazy(() =>
  import("./workspace-pages").then((module) => ({ default: module.Admin })),
);
const Billing = lazy(() =>
  import("./billing-page").then((module) => ({ default: module.Billing })),
);
const PostalReviewPage = lazy(() =>
  import("./postal-review-page").then((module) => ({
    default: module.PostalReviewPage,
  })),
);
const Account = lazy(() =>
  import("./account-page").then((module) => ({ default: module.Account })),
);
const TeamAdmin = lazy(() =>
  import("./account-page").then((module) => ({ default: module.TeamAdmin })),
);
const TeamInvitations = lazy(() =>
  import("./team-invitations").then((module) => ({
    default: module.TeamInvitations,
  })),
);
const Connection = lazy(() =>
  import("./assistant-workspace").then((module) => ({
    default: module.Connection,
  })),
);
const DocumentStudio = lazy(() => import("./document-studio"));
const SecureDistributionPage = lazy(() =>
  import("./secure-distribution-pages").then((module) => ({
    default: module.SecureDistributionPage,
  })),
);
const personalPage = (page: string) =>
  /^\/app\/(my-documents|services|personal-account)(\/|$)/.test(
    page.split("?")[0] ?? "",
  );

export function Landing() {
  return <PublicHomepage />;
}

function SessionExpiredNotice({ onReconnect }: { onReconnect: () => void }) {
  const local =
    publicPreview ||
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const returnTo = encodeURIComponent("/" + (window.location.hash || "#/app"));
  return (
    <div className="session-expired" role="alert">
      <WarningCircle size={22} aria-hidden="true" />
      <div>
        <strong>{t.sessionExpired.title}</strong>
        <p>{t.sessionExpired.body}</p>
      </div>
      {local ? (
        <button
          type="button"
          className="button small primary"
          onClick={onReconnect}
        >
          {t.sessionExpired.action}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      ) : (
        <a
          className="button small primary"
          href={`/auth/login?returnTo=${returnTo}`}
        >
          {t.sessionExpired.action}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

const navigation = [
  { id: "overview", path: "/app", Icon: SquaresFour },
  { id: "connection", path: "/app/connection", Icon: PlugsConnected },
  { id: "documents", path: "/app/documents", Icon: Files },
  {
    id: "secure-distributions",
    path: "/app/secure-distributions",
    Icon: Files,
  },
  { id: "templates", path: "/app/templates", Icon: FileText },
  { id: "datasets", path: "/app/datasets", Icon: Stack },
  { id: "generations", path: "/app/generations", Icon: SquaresFour },
  { id: "dispatches", path: "/app/dispatches", Icon: PaperPlaneTilt },
  { id: "campaigns", path: "/app/campaigns", Icon: Stack },
  { id: "senders", path: "/app/senders", Icon: AddressBook },
  { id: "usage", path: "/app/usage", Icon: ChartBar },
  { id: "pdfChecks", path: "/app/pdf-checks", Icon: Check },
  { id: "billing", path: "/app/billing", Icon: Receipt },
  { id: "account", path: "/app/account", Icon: UserCircle },
  { id: "admin", path: "/app/admin", Icon: Wrench },
] as const;

export function App() {
  return (
    <DashboardAppearanceProvider>
      <Application />
    </DashboardAppearanceProvider>
  );
}

function Application() {
  const locale = useLocale();
  const route = useRoute();
  const personalRoute = personalPage(route) && !publicPreview;
  const emailPreferencesRoute = route.split("?")[0] === "/email-preferences";
  const workspaceRoute = route.startsWith("/app") && !personalRoute;
  const canonicalLocation = canonicalPublicLocation(
    window.location.pathname,
    window.location.search,
    window.location.hash,
  );
  if (
    canonicalLocation !==
    window.location.pathname + window.location.search + window.location.hash
  )
    window.history.replaceState(window.history.state, "", canonicalLocation);
  const [session, updateSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const { applyAccountAppearance } = useDashboardAppearance();
  useEffect(() => {
    if (session && !isPublicPreview)
      applyAccountAppearance(
        session.user.preferredDashboardAppearance ?? defaultDashboardAppearance,
        session.user.id,
      );
  }, [session, applyAccountAppearance]);
  useEffect(() => {
    // Personal routes authenticate independently. A workshop session must not
    // block their first read or survive a later return to another workshop.
    setReady(false);
    if (personalRoute || emailPreferencesRoute) {
      setSession(null, false);
      updateSession(null);
      return;
    }
    // Public HTML already has its language. No authenticated read may translate
    // an already visible page; private entry resolves its own session below.
    if (!workspaceRoute) {
      setSession(null, false);
      updateSession(null);
      setReady(true);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    api<Session>("/session", { signal: controller.signal })
      .then((s) => {
        if (alive) {
          setSession(s, !isPublicPreview);
          updateSession(s);
        }
      })
      .catch(async () => {
        if (!alive) return;
        // Authentication failed: discard the non-authoritative account hint.
        initializeLocale(true);
        const requested = window.location.hash.slice(1);
        if (
          isPublicPreview ||
          !requested.startsWith("/app") ||
          personalPage(requested)
        )
          return;
        try {
          await personalApi("/personal/session", undefined, {
            signal: controller.signal,
          });
          if (alive)
            go(
              requested === "/app"
                ? "/app/services?next=%2Fapp"
                : `/app/services?next=${encodeURIComponent(requested)}`,
            );
        } catch {
          // No personal account is authenticated; the normal sign-in remains.
        }
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [personalRoute, emailPreferencesRoute, workspaceRoute]);
  useEffect(() => {
    const path = window.location.pathname;
    const information = getInformationPages()[path];
    const publicSitePage = getPublicSitePageMetadata(path);
    const article = getArticles().find(
      (item) => articlePath(item.slug) === path,
    );
    const label =
      publicSitePage?.title ??
      information?.label ??
      article?.title ??
      (path.startsWith("/assistants")
        ? msg("Assistants")
        : path === "/developers/"
          ? msg("Developers")
          : path === "/legal/"
            ? msg("Legal notice")
            : path === "/journal/"
              ? msg("The journal")
              : `${msg("Prepare your documents.")} ${msg("Choose how they travel.")}`);
    document.title = `${emailPreferencesRoute ? msg("Email preferences") : label} | guteneo`;
    const description =
      publicSitePage?.description ??
      information?.description ??
      article?.description ??
      (path === "/"
        ? msg(
            "Email, fax and post. Prepare in Guteneo or with your assistant, review the details, then approve your dispatch.",
          )
        : t.landing.intro);
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", description);
    syncPublicSharing();
  }, [locale, emailPreferencesRoute]);
  if (emailPreferencesRoute)
    return (
      <Suspense fallback={<Loading />}>
        <EmailPreferencesPage key={route} route={route} />
      </Suspense>
    );
  const publicPath = window.location.pathname;
  if (publicPath === "/invitation" || publicPath === "/invitation/")
    return <InvitationPage />;
  const information = getInformationPages()[publicPath];
  if (information) return <InformationPage content={information} />;
  if (publicPath === "/assistants" || publicPath.startsWith("/assistants/"))
    return (
      <AssistantsPage assistantId={publicPath.split("/")[2] || undefined} />
    );
  if (window.location.pathname === "/developers/") return <DeveloperPage />;
  if (isPublicSitePage(publicPath)) {
    const InitialPublicSitePage = loadedPublicSitePage;
    return InitialPublicSitePage ? (
      <InitialPublicSitePage path={publicPath} />
    ) : (
      <Suspense fallback={<Loading />}>
        <LazyPublicSitePage path={publicPath} />
      </Suspense>
    );
  }

  return (
    <WorkspaceApplication
      route={route}
      session={session}
      updateSession={updateSession}
      ready={ready}
    />
  );
}

function WorkspaceApplication({
  route,
  session,
  updateSession,
  ready,
}: {
  route: string;
  session: Session | null;
  updateSession: (session: Session | null) => void;
  ready: boolean;
}) {
  const page = route.split("?")[0] ?? "/";
  const personalRoute = personalPage(page) && !publicPreview;
  useEffect(() => {
    if (
      session &&
      page.startsWith("/app") &&
      !isPublicPreview &&
      !personalRoute
    )
      setSession(session);
  }, [page, session, personalRoute]);
  const { appearance } = useDashboardAppearance();
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
  }>(
    page.startsWith("/app") &&
      !personalRoute &&
      (session || new URLSearchParams(window.location.search).has("auth"))
      ? "/capabilities"
      : null,
  );
  const [logoutError, setLogoutError] = useState<Error>();
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastSessionRead = useRef(0);
  useEffect(() => {
    const expire = () => setSessionExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
  }, []);
  useEffect(() => {
    if (personalRoute) return;
    if (!session && !sessionExpired) return;
    // Cookies are shared across tabs: reconcile a different account/workshop
    // even while this tab's previous session appeared healthy.
    let alive = true;
    let pending = false;
    let recheckRequested = false;
    let recheckTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      if (pending) {
        recheckRequested = true;
        return;
      }
      const now = Date.now();
      const remaining = 1000 - (now - lastSessionRead.current);
      if (remaining > 0) {
        recheckTimer ??= setTimeout(() => {
          recheckTimer = undefined;
          recheck();
        }, remaining);
        return;
      }
      clearTimeout(recheckTimer);
      recheckTimer = undefined;
      lastSessionRead.current = now;
      pending = true;
      api<Session>("/session", { signal: controller.signal })
        .then((current) => {
          if (!alive || recheckRequested) return;
          // Another account or workshop starts with fresh pages.
          if (
            current.user.id !== session?.user.id ||
            current.organization.id !== session?.organization.id
          )
            go("/app");
          setSession(current, !isPublicPreview && page.startsWith("/app"));
          updateSession(current);
          setSessionExpired(false);
        })
        .catch((error: unknown) => {
          if (
            alive &&
            !recheckRequested &&
            error instanceof ApiError &&
            [401, 403].includes(error.status)
          )
            setSessionExpired(true);
        })
        .finally(() => {
          pending = false;
          if (alive && recheckRequested) {
            recheckRequested = false;
            recheck();
          }
        });
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      alive = false;
      clearTimeout(recheckTimer);
      controller.abort();
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [sessionExpired, session, updateSession, page, personalRoute]);
  const pathname = window.location.pathname;
  if (pathname === "/journal/") return <JournalPage />;
  const article = getArticles().find(
    (item) => articlePath(item.slug) === pathname,
  );
  if (article) return <ArticlePage article={article} />;
  if (pathname === "/legal/") return <LegalPage />;
  if (page === "/legal") return <LegalPage />;
  if (!page.startsWith("/app")) return <Landing />;
  if (personalRoute) return <PersonalArea route={route} />;
  if (!ready)
    return (
      <div className="initial-loading">
        <Loading />
      </div>
    );
  if (!session)
    return (
      <Login
        onLogin={(current) => {
          setSessionExpired(false);
          updateSession(current);
        }}
        registrationAvailable={
          capabilities.data?.registration?.enabled === true
        }
      />
    );
  const refreshSession = async () => {
    try {
      const updated = await api<Session>("/session");
      setSession(updated, !isPublicPreview);
      updateSession(updated);
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setSession(null);
        updateSession(null);
      } else throw error;
    }
  };
  const permissions = permissionsFor(session);
  let content;
  if (/^\/app\/(secure-distributions|secure-distribution)(\/|$)/.test(page))
    content = (
      <Suspense fallback={<Loading />}>
        <SecureDistributionPage route={route} session={session} />
      </Suspense>
    );
  else if (
    /^\/app\/(templates|template|datasets|dataset|generations|generation|distribution)(\/|$)/.test(
      page,
    )
  )
    content = (
      <Suspense fallback={<Loading />}>
        <DocumentStudio route={route} session={session} />
      </Suspense>
    );
  else if (page === "/app/documents")
    content = <Documents canPrepare={permissions.prepareDispatches} />;
  else if (page === "/app/prepare" && !permissions.prepareDispatches)
    content = <RolePermissionNotice />;
  else if (page === "/app/prepare")
    content = (
      <>
        {new URLSearchParams(route.split("?")[1]).get("entry") === "direct" && (
          <RememberDirectChoice session={session} />
        )}
        <PrepareDispatch
          simulation={session.simulation}
          workspaceName={session.organization.name}
          emailLocale={session.user.preferredLocale ?? "fr"}
          initialDocument={
            new URLSearchParams(route.split("?")[1]).get("document") ?? ""
          }
        />
      </>
    );
  else if (page.startsWith("/app/postal/"))
    content = (
      <PostalReviewPage
        key={page}
        id={page.slice("/app/postal/".length)}
        canApprove={permissions.approveDispatches}
        canPrepare={permissions.prepareDispatches}
      />
    );
  else if (page === "/app/dispatches")
    content = <DispatchList canPrepare={permissions.prepareDispatches} />;
  else if (page.startsWith("/app/dispatch/"))
    content = (
      <DispatchDetailPage
        id={page.slice("/app/dispatch/".length)}
        simulation={session.simulation}
        canApprove={permissions.approveDispatches}
        canPrepare={permissions.prepareDispatches}
      />
    );
  else if (page === "/app/campaigns")
    content = (
      <Campaigns
        simulation={session.simulation}
        canPrepare={permissions.prepareDispatches}
      />
    );
  else if (page.startsWith("/app/campaign/"))
    content = (
      <CampaignDetail
        id={page.slice("/app/campaign/".length)}
        canPrepare={permissions.prepareDispatches}
      />
    );
  else if (page === "/app/connection" || page.startsWith("/app/connection/"))
    content = (
      <Connection
        session={session}
        assistantId={
          page.slice("/app/connection/".length).replace(/\/$/, "") || undefined
        }
      />
    );
  else if (page === "/app/senders")
    content = (
      <Senders
        canManage={permissions.manageOrganization}
        canPrepare={permissions.prepareDispatches}
      />
    );
  else if (page === "/app/usage")
    content = permissions.viewReports ? (
      <Usage />
    ) : (
      <RolePermissionNotice reports />
    );
  else if (page === "/app/billing") content = <Billing session={session} />;
  else if (page === "/app/pdf-checks" || page === "/app/plan")
    content = <PdfCheckPage session={session} />;
  else if (page === "/app/account")
    content = <Account session={session} onUpdated={refreshSession} />;
  else if (page === "/app/admin" && !permissions.manageMembers)
    content = <RolePermissionNotice />;
  else if (page === "/app/admin")
    content = (
      <Admin>
        <TeamAdmin session={session} onUpdated={refreshSession} />
        {!publicPreview && <TeamInvitations />}
      </Admin>
    );
  else content = <Overview session={session} />;
  const navigationLabel = (id: (typeof navigation)[number]["id"]) =>
    id === "secure-distributions" ? msg("Secure distribution") : t.nav[id];
  const logout = async () => {
    setLogoutError(undefined);
    try {
      await api("/logout", { method: "POST", body: {} });
      clearPendingDocumentInvitation();
      setSession(null);
      // Leave the protected route before Login can restart an Auth0 SSO flow.
      window.location.replace("/");
    } catch (e) {
      setLogoutError(e as Error);
    }
  };
  return (
    <div
      className={appearance === "v2" ? "workspace workspace-v2" : "workspace"}
      data-appearance={appearance}
    >
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
            <small>{msg("Workshop")}</small>
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
              // Native details opens before its queued toggle updates React.
              // Close the DOM too when the state is still already false.
              event.currentTarget.open = false;
              setNavigationOpen(false);
              navigationSummary.current?.focus();
            }
          }}
        >
          <summary ref={navigationSummary}>
            <List size={21} aria-hidden="true" />
            {msg("Workspace navigation")}
          </summary>
          <nav aria-label={msg("Workspace navigation")}>
            {!publicPreview && (
              <a
                className="personal-context-link"
                href="#/app/my-documents"
                title={msg("Personal space")}
              >
                <Files size={21} aria-hidden="true" />
                <span>
                  {msg("My documents")}
                  <span className="sr-only"> — {msg("Personal space")}</span>
                </span>
              </a>
            )}
            {appearance === "v2" &&
              permissions.prepareDispatches &&
              !["/app", "/app/prepare", "/app/dispatches"].includes(page) && (
                <a className="button workspace-create" href="#/app/prepare">
                  <Plus size={19} aria-hidden="true" />
                  {t.dispatch.new}
                </a>
              )}
            {navigation
              .filter((n) => appearance !== "v2" || n.id !== "account")
              .filter(
                (n) =>
                  (!["admin", "billing"].includes(n.id) ||
                    canAdminister(session)) &&
                  (n.id !== "usage" || permissions.viewReports),
              )
              .filter(
                (n) =>
                  !publicPreview ||
                  ![
                    "secure-distributions",
                    "templates",
                    "datasets",
                    "generations",
                  ].includes(n.id),
              )
              .map(({ id, path, Icon }) => (
                <a
                  key={id}
                  href={`#${path}`}
                  onClick={() => {
                    if (window.matchMedia("(max-width: 1024px)").matches) {
                      setNavigationOpen(false);
                      // A changed route moves focus in useRoute. Schedule it
                      // here only when opening the already selected page.
                      if (route === path)
                        requestAnimationFrame(() =>
                          document
                            .getElementById("main-content")
                            ?.focus({ preventScroll: true }),
                        );
                    }
                  }}
                  aria-current={
                    page === path ||
                    (id === "secure-distributions" &&
                      /^\/app\/secure-distributions?(\/|$)/.test(page)) ||
                    (id === "templates" && page.startsWith("/app/template/")) ||
                    (id === "datasets" && page.startsWith("/app/dataset/")) ||
                    (id === "generations" &&
                      (page.startsWith("/app/generation/") ||
                        page.startsWith("/app/distribution/"))) ||
                    (id === "connection" &&
                      page.startsWith("/app/connection/")) ||
                    (id === "dispatches" &&
                      (page.startsWith("/app/dispatch/") ||
                        page === "/app/prepare" ||
                        page.startsWith("/app/postal/")))
                      ? "page"
                      : undefined
                  }
                >
                  <Icon size={21} aria-hidden="true" />
                  <span>{navigationLabel(id)}</span>
                </a>
              ))}
          </nav>
          <button
            type="button"
            className="navigation-logout"
            onClick={() => void logout()}
          >
            <SignOut size={21} aria-hidden="true" />
            {t.login.logout}
          </button>
        </details>
        <div className="sidebar-account">
          <WorkspaceIdentity session={session} />
        </div>
        <div className="sidebar-footer">
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
                  {msg(
                    "Preview in this tab only. Data resets when you reload.",
                  )}
                </span>
              )}
              {capabilities.data?.scanner ===
                "disabled_in_local_simulation" && (
                <span className="scanner-warning">{t.scanDisabled}</span>
              )}
            </p>
          </div>
        )}
        {sessionExpired && (
          <SessionExpiredNotice
            onReconnect={() => {
              // Local and preview sign-in happen in this page; the hash keeps
              // the current route for the next session.
              setSession(null);
              updateSession(null);
              setSessionExpired(false);
            }}
          />
        )}
        {appearance !== "v2" && (
          <div className="app-topbar">
            <span>
              {navigationLabel(
                navigation.find((n) => n.path === page)?.id ??
                  (page === "/app/prepare" ||
                  page.startsWith("/app/dispatch/") ||
                  page.startsWith("/app/postal/")
                    ? "dispatches"
                    : /^\/app\/secure-distributions?(\/|$)/.test(page)
                      ? "secure-distributions"
                      : page.startsWith("/app/template/")
                        ? "templates"
                        : page.startsWith("/app/dataset/")
                          ? "datasets"
                          : page.startsWith("/app/generation/") ||
                              page.startsWith("/app/distribution/")
                            ? "generations"
                            : page.startsWith("/app/connection/")
                              ? "connection"
                              : page.startsWith("/app/campaign/")
                                ? "campaigns"
                                : "overview"),
              )}
            </span>
            {/* These pages already lead to the preparation form themselves. */}
            {permissions.prepareDispatches &&
              !["/app/prepare", "/app/dispatches"].includes(page) && (
                <a className="button small primary" href="#/app/prepare">
                  <Plus size={16} aria-hidden="true" />
                  {t.dispatch.new}
                </a>
              )}
          </div>
        )}
        {/* A new identity starts from fresh pages, without the previous state. */}
        <main
          id="main-content"
          tabIndex={-1}
          key={`${session.organization.id}:${session.user.id}`}
        >
          <ErrorNotice error={logoutError} />
          <Suspense fallback={<Loading />}>{content}</Suspense>
        </main>
        {appearance !== "v2" && (
          <footer className="app-footer">
            <Brand app variant="simple" compact />
            <span>{session.organization.name}</span>
            <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
            <a href="https://status.guteneo.com/">{msg("Service status")}</a>
          </footer>
        )}
      </div>
    </div>
  );
}
