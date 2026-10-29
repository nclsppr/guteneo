import React from "react";
import ReactDOM from "react-dom/client";
import "./fonts.css";
import { applyAccountLocale, initializeLocale, t, useLocale } from "./locale";
import { api, ApiError, setSession, type Session } from "./api";
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
if (isBelvedere) {
  applyAccountLocale(
    document.querySelector<HTMLMetaElement>(
      'meta[name="guteneo-account-locale"]',
    )?.content,
  );
} else if (
  import.meta.env.VITE_PUBLIC_PREVIEW !== "true" &&
  window.location.hash.startsWith("#/app")
) {
  applyAccountLocale(null, false);
} else {
  initializeLocale();
}
observePublicLinks(document.getElementById("root")!);
const Belvedere = React.lazy(() => import("./belvedere"));

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
      api<Session>("/session", { signal: controller.signal })
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
      {isBelvedere ? <BelvedereEntry basePath={belvederePath} /> : <App />}
    </React.StrictMode>,
  );
  if (!isBelvedere) installPublicNavigation();
}

// Every public route is ready together; native SSR links work before this mount.
renderApplication();
