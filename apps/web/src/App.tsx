import { msg } from "./messages";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowRight,
  Check,
  FileLock,
  FilePdf,
  FileText,
  PaperPlaneTilt,
  Printer,
  SquaresFour,
  Stack,
  Table,
  PlugsConnected,
  ChartBar,
  Wrench,
  Plus,
  Receipt,
  List,
  AddressBook,
  WarningCircle,
  type Icon,
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
import { PublicSitePage } from "./public-site-pages";
import {
  isPublicSitePage,
  getPublicSitePageMetadata,
} from "./public-site-metadata";
import { syncPublicSharing } from "./public-sharing";
import { usePublicLocation } from "./public-navigation";
import { Brand } from "./brand";
import {
  navigationEntryFor,
  spaceHome,
  spaceOf,
  studioRoutes,
  type StudioEntry,
  type WorkshopEntry,
} from "./app-routes";
import {
  ApplicationSwitcher,
  WorkspaceSwitcher,
  type SwitcherWorkspace,
} from "./space-switcher";
import {
  BEFORE_WORKSPACE_NAVIGATION,
  ErrorNotice,
  go,
  Loading,
  useRouteState,
  useResource,
  WorkspaceRouteProvider,
} from "./components";
import { PdfCheckPage } from "./pdf-check-offer";
import { Login } from "./login-page";
import {
  personalApi,
  type PersonalSession,
  type PersonalSessionRead,
} from "./personal-api";
import {
  preloadWorkspaceRoute,
  workspaceRouteModules,
} from "./workspace-route-loader";
import { WorkspaceIdentity } from "./workspace-identity";
import { WorkspaceRouteBoundary } from "./workspace-route-boundary";
import { RolePermissionNotice } from "./role-guide";
import { InvitationPage } from "./invitation-page";
import { LegalPage } from "./legal-page";
import { InformationPage, getInformationPages } from "./information-page";
import { DeveloperPage } from "./developer-page";
import { ArticlePage, JournalPage } from "./editorial/pages";
import { getArticles, articlePath } from "./editorial/articles";
import { getPublicSocialCopy } from "./editorial/social-copy";
import { AssistantsPage } from "./assistants-page";
import { clearPendingDocumentInvitation } from "./document-invitation";
import "./secure-documents.css";

const publicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === "true";
const EmailPreferencesPage = lazy(() => import("./email-preferences"));
const RememberDirectChoice = lazy(() =>
  workspaceRouteModules.dispatch().then((module) => ({
    default: module.RememberDirectChoice,
  })),
);

/** Load personal code and personal authority together, scoped to this visit. */
function PersonalEntry({ route }: { route: string }) {
  const [initialSession, setInitialSession] = useState<PersonalSessionRead>();
  const [area, setArea] = useState<{
    Component: Awaited<
      ReturnType<typeof workspaceRouteModules.personal>
    >["default"];
  }>();
  const [codeError, setCodeError] = useState<Error>();
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    void workspaceRouteModules.personal().then(
      (module) => {
        if (alive) setArea({ Component: module.default });
      },
      (error: Error) => {
        if (alive) setCodeError(error);
      },
    );
    const invalidate = () => controller.abort();
    // A hidden entry waits for the personal shell's normal visible read.
    const read: PersonalSessionRead = {
      signal: controller.signal,
      result: new Promise((resolve) => {
        if (document.visibilityState === "hidden") {
          controller.abort();
          resolve({ error: new DOMException("Entry hidden", "AbortError") });
          return;
        }
        controller.signal.addEventListener(
          "abort",
          () =>
            resolve({
              error: new DOMException("Entry obsolete", "AbortError"),
            }),
          { once: true },
        );
        void personalApi<PersonalSession>("/personal/session", undefined, {
          signal: controller.signal,
        }).then(
          (session) => resolve({ session }),
          (error: Error) => resolve({ error }),
        );
      }),
    };
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    setInitialSession(read);
    return () => {
      alive = false;
      invalidate();
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", invalidate);
    };
  }, []);
  if (codeError) throw codeError;
  // Render resolved code directly: an initial lazy retry can hold Suspense's
  // fallback for another 300 ms after code and identity are already available.
  return area && initialSession ? (
    <area.Component route={route} initialSession={initialSession} />
  ) : (
    <Loading />
  );
}

const Overview = lazy(() =>
  workspaceRouteModules
    .dispatch()
    .then((module) => ({ default: module.Overview })),
);
const Documents = lazy(() =>
  workspaceRouteModules
    .dispatch()
    .then((module) => ({ default: module.Documents })),
);
const PrepareDispatch = lazy(() =>
  workspaceRouteModules.dispatch().then((module) => ({
    default: module.PrepareDispatch,
  })),
);
const DispatchList = lazy(() =>
  workspaceRouteModules.dispatch().then((module) => ({
    default: module.DispatchList,
  })),
);
const DispatchDetailPage = lazy(() =>
  workspaceRouteModules.dispatch().then((module) => ({
    default: module.DispatchDetailPage,
  })),
);
const Campaigns = lazy(() =>
  workspaceRouteModules
    .workspace()
    .then((module) => ({ default: module.Campaigns })),
);
const CampaignDetail = lazy(() =>
  workspaceRouteModules.workspace().then((module) => ({
    default: module.CampaignDetail,
  })),
);
const Senders = lazy(() =>
  workspaceRouteModules
    .workspace()
    .then((module) => ({ default: module.Senders })),
);
const Usage = lazy(() =>
  workspaceRouteModules
    .workspace()
    .then((module) => ({ default: module.Usage })),
);
const Admin = lazy(() =>
  workspaceRouteModules
    .workspace()
    .then((module) => ({ default: module.Admin })),
);
const Billing = lazy(() =>
  workspaceRouteModules
    .billing()
    .then((module) => ({ default: module.Billing })),
);
const PostalReviewPage = lazy(() =>
  workspaceRouteModules.postal().then((module) => ({
    default: module.PostalReviewPage,
  })),
);
const Account = lazy(() =>
  workspaceRouteModules
    .account()
    .then((module) => ({ default: module.Account })),
);
const TeamAdmin = lazy(() =>
  workspaceRouteModules
    .account()
    .then((module) => ({ default: module.TeamAdmin })),
);
const TeamInvitations = lazy(() =>
  workspaceRouteModules.invitations().then((module) => ({
    default: module.TeamInvitations,
  })),
);
const Connection = lazy(() =>
  workspaceRouteModules.connection().then((module) => ({
    default: module.Connection,
  })),
);
const DocumentStudio = lazy(() => workspaceRouteModules.studio());
const DistributionPage = lazy(() => workspaceRouteModules.distribution());
const SecureDistributionPage = lazy(() =>
  workspaceRouteModules.secureDistribution().then((module) => ({
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

// One glyph per destination; workshop documents are the PDF library. Studio
// authoring has its own space and navigation in the same workspace session.
type NavigationItem<Entry> = { id: Entry; path: string; Icon: Icon };
const workshopNavigation: readonly NavigationItem<WorkshopEntry>[] = [
  // Assistants stay immediately after Overview (see ASSISTANT_HUB.md).
  { id: "overview", path: "/app", Icon: SquaresFour },
  { id: "connection", path: "/app/connection", Icon: PlugsConnected },
  { id: "documents", path: "/app/documents", Icon: FilePdf },
  {
    id: "secure-distributions",
    path: "/app/secure-distributions",
    Icon: FileLock,
  },
  { id: "dispatches", path: "/app/dispatches", Icon: PaperPlaneTilt },
  { id: "campaigns", path: "/app/campaigns", Icon: Stack },
  { id: "senders", path: "/app/senders", Icon: AddressBook },
  { id: "usage", path: "/app/usage", Icon: ChartBar },
  { id: "pdfChecks", path: "/app/pdf-checks", Icon: Check },
  { id: "billing", path: "/app/billing", Icon: Receipt },
  { id: "admin", path: "/app/admin", Icon: Wrench },
];
const studioNavigation: readonly NavigationItem<StudioEntry>[] = [
  { id: "templates", path: studioRoutes.templates, Icon: FileText },
  { id: "datasets", path: studioRoutes.datasets, Icon: Table },
  { id: "generations", path: studioRoutes.generations, Icon: Printer },
];

export function App() {
  return <Application />;
}

function Application() {
  const publicLocation = usePublicLocation();
  const locale = useLocale();
  const { route, pending: routePending } = useRouteState();
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
  const [readyContext, setReadyContext] = useState<
    "public" | "workspace" | null
  >(null);
  const ready = readyContext === (workspaceRoute ? "workspace" : "public");
  useEffect(() => {
    // Personal routes authenticate independently. A workshop session must not
    // block their first read or survive a later return to another workshop.
    setReadyContext(null);
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
      setReadyContext("public");
      return;
    }
    // Route code and authority are independent; private reads still wait for
    // the verified session before the requested screen can mount.
    void preloadWorkspaceRoute(window.location.hash.slice(1) || "/app").catch(
      () => undefined,
    );
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
        if (alive) setReadyContext("workspace");
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [personalRoute, emailPreferencesRoute, workspaceRoute]);
  useEffect(() => {
    const path = window.location.pathname;
    const publicCopy = window.location.hash.startsWith("#/")
      ? null
      : getPublicSocialCopy(path, locale);
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
    document.title =
      publicCopy?.title ??
      `${emailPreferencesRoute ? msg("Email preferences") : label} | guteneo`;
    const description =
      publicCopy?.description ??
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
  }, [locale, emailPreferencesRoute, publicLocation]);
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
  if (information)
    return <InformationPage key={publicPath} content={information} />;
  if (publicPath === "/assistants" || publicPath.startsWith("/assistants/"))
    return (
      <AssistantsPage
        key={publicPath}
        assistantId={publicPath.split("/")[2] || undefined}
      />
    );
  if (window.location.pathname === "/developers/") return <DeveloperPage />;
  if (isPublicSitePage(publicPath))
    return <PublicSitePage key={publicPath} path={publicPath} />;

  return (
    <WorkspaceRouteProvider route={route}>
      <WorkspaceApplication
        key={publicPath}
        route={route}
        routePending={routePending}
        session={session}
        updateSession={updateSession}
        ready={ready}
      />
    </WorkspaceRouteProvider>
  );
}

function WorkspaceApplication({
  route,
  routePending,
  session,
  updateSession,
  ready,
}: {
  route: string;
  routePending: boolean;
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
            go(spaceHome[spaceOf(page)]);
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
  if (personalRoute)
    return (
      <WorkspaceRouteBoundary route={route}>
        <PersonalEntry route={route} />
      </WorkspaceRouteBoundary>
    );
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
  else if (/^\/app\/distribution(\/|$)/.test(page))
    content = (
      <Suspense fallback={<Loading />}>
        <DistributionPage
          key={`${session.organization.id}:${session.user.id}:${route}`}
          route={route}
          session={session}
        />
      </Suspense>
    );
  else if (/^\/app\/studio(\/|$)/.test(page))
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
    content = <CampaignDetail id={page.slice("/app/campaign/".length)} />;
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
  const navigationLabel = (id: WorkshopEntry | StudioEntry) =>
    id === "secure-distributions" ? msg("Secure distribution") : t.nav[id];
  const space = spaceOf(page);
  const navigation: readonly NavigationItem<WorkshopEntry | StudioEntry>[] =
    space === "studio" ? studioNavigation : workshopNavigation;
  const navigationName =
    space === "studio"
      ? msg("Studio navigation")
      : msg("Correspondence navigation");
  const enterWorkspace = async (id: string, target: "workshop" | "studio") => {
    // Let a screen with unsaved work refuse before the session changes.
    if (
      !window.dispatchEvent(
        new Event(BEFORE_WORKSPACE_NAVIGATION, { cancelable: true }),
      )
    )
      return;
    const next = await api<Session>("/account/workspace", {
      method: "POST",
      body: { organizationId: id },
    });
    setSession(next, !isPublicPreview);
    // Remount the page for the new workspace before routing, so the previous
    // screen cannot ask a second time.
    flushSync(() => updateSession(next));
    go(spaceHome[target]);
  };
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
    <div className="workspace workspace-v2">
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
        </div>
        <div className="sidebar-context">
          <ApplicationSwitcher
            application={space === "studio" ? "studio" : "workshop"}
            hasWorkspace
            canAccessBelvedere={session.canAccessBelvedere === true}
            preview={publicPreview}
          />
          <WorkspaceSwitcher
            key={session.user.id}
            application={space === "studio" ? "studio" : "workshop"}
            workspace={session.organization}
            identity={[
              session.user.id,
              session.organization.id,
              session.user.role,
              permissions.approveDispatches,
              permissions.viewReports,
            ].join(":")}
            preview={publicPreview}
            loadWorkspaces={async (signal) => {
              const { items } = await api<{ items?: SwitcherWorkspace[] }>(
                "/account/workspaces",
                { signal },
              );
              return Array.isArray(items) ? items : [];
            }}
            enterWorkspace={enterWorkspace}
          />
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
            {navigationName}
          </summary>
          <nav aria-label={navigationName}>
            {/* Present on every workshop page so the entries never move. */}
            {space === "workshop" && permissions.prepareDispatches && (
              <a className="button workspace-create" href="#/app/prepare">
                <Plus size={19} aria-hidden="true" />
                {t.dispatch.new}
              </a>
            )}
            {navigation
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
                    navigationEntryFor(route) === id ? "page" : undefined
                  }
                >
                  <Icon size={21} aria-hidden="true" />
                  <span>{navigationLabel(id)}</span>
                </a>
              ))}
          </nav>
        </details>
        {/* Sign-out lives in the account menu, outside the navigation. */}
        <div className="sidebar-account">
          <WorkspaceIdentity session={session} onLogout={logout} />
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
        {/* A new identity starts from fresh pages, without the previous state. */}
        <main
          id="main-content"
          tabIndex={-1}
          inert={routePending}
          aria-busy={routePending || undefined}
          key={`${session.organization.id}:${session.user.id}`}
        >
          <ErrorNotice error={logoutError} />
          <WorkspaceRouteBoundary route={route}>
            <Suspense fallback={<Loading />}>{content}</Suspense>
          </WorkspaceRouteBoundary>
        </main>
      </div>
    </div>
  );
}
