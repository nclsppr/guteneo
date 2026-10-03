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

// Crawlable entry links hand off to the existing browser router before rendering.
if (
  window.location.pathname === "/app" ||
  window.location.pathname === "/app/prepare"
) {
  const entry = new URL(window.location.href);
  entry.hash =
    entry.pathname +
    (entry.searchParams.get("entry") === "direct" ? "?entry=direct" : "");
  entry.pathname = "/";
  entry.searchParams.delete("entry");
  window.history.replaceState(window.history.state, "", entry);
}

initializeLocale();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
