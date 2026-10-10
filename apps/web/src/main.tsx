import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/eb-garamond/latin-400.css";
import "@fontsource/eb-garamond/latin-500.css";
import "@fontsource/eb-garamond/latin-400-italic.css";
import { applyAccountLocale, initializeLocale, t, useLocale } from "./locale";
import { api, ApiError, type Session } from "./api";
import { observePublicLinks } from "./public-sharing";
import { App } from "./App";
import "./styles.css";
import "./protected-document.css";

// Crawlable entry links hand off to the existing browser router before rendering.
if (
  window.location.pathname === "/app" ||
  window.location.pathname === "/app/prepare" ||
  window.location.pathname === "/app/plan"
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
  !!belvederePath &&
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
  applyAccountLocale(null);
} else {
  initializeLocale();
}
observePublicLinks(document.getElementById("root")!);
const Belvedere = React.lazy(() => import("./belvedere"));

function BelvedereEntry({ basePath }: { basePath: string }) {
  useLocale();
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
          if (alive && currentRevision === revision)
            applyAccountLocale(session.user.preferredLocale);
        })
        .catch((error: unknown) => {
          if (
            alive &&
            currentRevision === revision &&
            error instanceof ApiError &&
            [401, 403].includes(error.status)
          )
            applyAccountLocale(null);
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
    return () => {
      alive = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return (
    <React.Suspense
      fallback={
        <main className="belvedere-boot" role="status">
          Belvédère — {t.loading}
        </main>
      }
    >
      <Belvedere basePath={basePath} />
    </React.Suspense>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isBelvedere ? <BelvedereEntry basePath={belvederePath} /> : <App />}
  </React.StrictMode>,
);
