import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/eb-garamond/latin-400.css";
import "@fontsource/eb-garamond/latin-500.css";
import "@fontsource/eb-garamond/latin-400-italic.css";
import { initializeLocale } from "./locale";
import { App } from "./App";
import "./styles.css";
import "./protected-document.css";

initializeLocale();

// Only the authenticated server response supplies this marker. The secret
// address is runtime configuration and is never part of the public bundle.
const belvederePath = document.querySelector<HTMLMetaElement>(
  'meta[name="guteneo-belvedere"]',
)?.content;
const Belvedere = React.lazy(() => import("./belvedere"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {belvederePath &&
    window.location.pathname.replace(/\/$/, "") === belvederePath ? (
      <React.Suspense
        fallback={
          <main className="belvedere-boot" role="status">
            Ouverture de Belvédère…
          </main>
        }
      >
        <Belvedere basePath={belvederePath} />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
