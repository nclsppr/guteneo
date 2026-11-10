import React from "react";
import ReactDOM from "react-dom/client";
import "./fonts.css";
import {
  applyAccountLocale,
  initializeLocale,
  t,
  useLocale,
  waitForLocale,
  localeReloadLabel,
  getRequestedLocale,
} from "./locale";
import { loadBelvedereLocaleData } from "./locale-data";
import {
  startInitialWorkspaceSession,
  startInitialPersonalSession,
  readInitialWorkspaceSession,
  initialSessionIsCurrent,
  isInitialSessionObsolete,
} from "./client-session-bootstrap";
import {
  preloadWorkspaceRoute,
  workspaceRouteModules,
} from "./workspace-route-loader";
import { ApiError, setSession, type Session } from "./api";
import {
  observePublicLinks,
  registerPublicPageMetadata,
} from "./public-sharing";
import { getPublicPageMetadata } from "./public-page-metadata";
import { initializeTheme } from "./theme";
import { App } from "./App";
import { installPublicNavigation } from "./public-navigation";
import { installInputModality } from "./input-modality";
import "./styles.css";
import "./login-page.css";
import "./protected-document.css";
import "./dashboard-v2.css";
import "./landing-example.css";
import "./public-site-pages.css";

initializeTheme();
installInputModality();
registerPublicPageMetadata(getPublicPageMetadata);

// Crawlable entry links hand off to the existing browser router before rendering.
if (
  window.location.pathname === "/app" ||
  window.location.pathname === "/app/prepare" ||
  window.location.pathname === "/app/plan" ||
  window.location.pathname === "/app/pdf-checks"
) {
  const entry = new URL(window.location.href);
  entry.hash =
    entry.pathname +
    (entry.searchParams.get("entry") === "direct" ? "?entry=direct" : "");
  entry.pathname = "/";
  entry.searchParams.delete("entry");
  window.history.replaceState(window.history.state, "", entry);
}

// Only the authenticated server response supplies this marker. The secret
// address is runtime configuration and is never part of the public bundle.
const belvederePath = document.querySelector<HTMLMetaElement>(
  'meta[name="guteneo-belvedere"]',
)?.content;
const isBelvedere =
  belvederePath !== undefined &&
  window.location.pathname.replace(/\/$/, "") === belvederePath;
const belvedereModule = isBelvedere ? import("./belvedere") : undefined;
void belvedereModule?.catch(() => undefined);
if (isBelvedere)
  void import("./belvedere-view-loader")
    .then((module) => module.preloadBelvedereView(window.location.hash))
    .catch(() => undefined);
async function initializePrivateEntryLocale() {
  for (;;) {
    const href = window.location.href;
    const route = window.location.hash.slice(1);
    if (!route.startsWith("/app")) {
      initializeLocale();
      return;
    }
    const personal =
      /^\/app\/(my-documents|services|personal-account)(\/|$|\?)/.test(route);
    if (personal) void workspaceRouteModules.personal().catch(() => undefined);
    else void preloadWorkspaceRoute(route).catch(() => undefined);
    if (personal && document.visibilityState === "hidden") {
      initializeLocale(true);
      return;
    }
    const request = personal
      ? startInitialPersonalSession()
      : startInitialWorkspaceSession();
    const initial = await request.catch((error: unknown) => {
      if (isInitialSessionObsolete(error)) return "obsolete" as const;
      return null;
    });
    if (initial === "obsolete" || window.location.href !== href) continue;
    if (initial) applyAccountLocale(initial.user.preferredLocale, false);
    else initializeLocale(true);
    await waitForLocale();
    // Focus/visibility can change the account while its language pack loads.
    if (!initialSessionIsCurrent(request) || window.location.href !== href)
      continue;
    return;
  }
}
let entryLocaleReady = true;
if (isBelvedere) {
  applyAccountLocale(
    document.querySelector<HTMLMetaElement>(
      'meta[name="guteneo-account-locale"]',
    )?.content,
  );
  if (belvederePath === "/belvedere") {
    const initial = await startInitialWorkspaceSession().catch(() => null);
    if (initial) applyAccountLocale(initial.user.preferredLocale);
  }
} else if (
  import.meta.env.VITE_PUBLIC_PREVIEW !== "true" &&
  window.location.hash.startsWith("#/app")
) {
  entryLocaleReady = await initializePrivateEntryLocale().then(
    () => true,
    () => false,
  );
} else {
  initializeLocale();
}
// Keep server-rendered public text until the selected locale is complete.
const localeReady =
  entryLocaleReady &&
  (await Promise.all([
    waitForLocale(),
    ...(isBelvedere ? [loadBelvedereLocaleData(getRequestedLocale())] : []),
  ]).then(
    () => true,
    () => false,
  ));
observePublicLinks(document.getElementById("root")!);
const Belvedere = React.lazy(() => belvedereModule ?? import("./belvedere"));

function BelvedereEntry({ basePath }: { basePath: string }) {
  useLocale();
  const integrated = basePath === "/belvedere";
  const [session, updateSession] = React.useState<Session | null>(null);
  const [sessionExpired, expireSession] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    let pending = false;
    let queued = false;
    let revision = 0;
    let lastRead = 0;
    let timer: number | undefined;
    const controller = new AbortController();
    const schedule = () => {
      if (
        !alive ||
        !queued ||
        pending ||
        timer !== undefined ||
        document.visibilityState !== "visible"
      )
        return;
      const delay = Math.max(0, 1000 - (Date.now() - lastRead));
      if (delay > 0)
        timer = window.setTimeout(() => {
          timer = undefined;
          if (alive && queued && document.visibilityState === "visible") read();
        }, delay);
      else read();
    };
    const read = () => {
      pending = true;
      queued = false;
      lastRead = Date.now();
      const currentRevision = revision;
      readInitialWorkspaceSession(controller.signal)
        .then((session) => {
          if (alive && currentRevision === revision) {
            applyAccountLocale(session.user.preferredLocale);
            if (integrated) {
              setSession(session);
              updateSession(session);
              expireSession(session.canAccessBelvedere !== true);
            }
          }
        })
        .catch((error: unknown) => {
          if (
            alive &&
            currentRevision === revision &&
            error instanceof ApiError &&
            [401, 403].includes(error.status)
          ) {
            applyAccountLocale(null);
            if (integrated) {
              setSession(null);
              updateSession(null);
              expireSession(true);
            }
          }
        })
        .finally(() => {
          pending = false;
          schedule();
        });
    };
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      // Every return invalidates the in-flight snapshot, including rapid ones.
      revision += 1;
      queued = true;
      schedule();
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", refresh);
    // The private shell proves entry. Read identity/CSRF alongside the first
    // view, without making any business read depend on this account request.
    if (integrated) read();
    return () => {
      alive = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [integrated]);
  return (
    <React.Suspense
      fallback={
        <main className="belvedere-boot" role="status">
          Belvédère — {t.loading}
        </main>
      }
    >
      <Belvedere
        basePath={basePath}
        session={session}
        sessionExpired={sessionExpired}
      />
    </React.Suspense>
  );
}

function renderApplication() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <LocaleLoadBoundary>
        <React.Suspense
          fallback={<main className="locale-loading" aria-busy="true" />}
        >
          {isBelvedere ? <BelvedereEntry basePath={belvederePath} /> : <App />}
        </React.Suspense>
      </LocaleLoadBoundary>
    </React.StrictMode>,
  );
  if (!isBelvedere) installPublicNavigation();
}

// Every public route is ready together; native SSR links work before this mount.
class LocaleLoadBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main>
        <button
          type="button"
          className="button"
          onClick={() => location.reload()}
        >
          {localeReloadLabel()}
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
if (localeReady) renderApplication();
else {
  // Keep readable SSR content and working native links when a language asset
  // is unavailable; an explicit reload requests the current release again.
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "button";
  retry.textContent = localeReloadLabel();
  retry.addEventListener("click", () => location.reload());
  document.getElementById("root")!.appendChild(retry);
}
