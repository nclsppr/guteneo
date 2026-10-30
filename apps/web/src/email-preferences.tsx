import { useEffect, useState } from "react";
import { PublicHeader, PublicFooter } from "./public-chrome";
import { msg } from "./messages";
import { api } from "./api";
import "./public-site-pages.css";

export default function EmailPreferencesPage({ route }: { route: string }) {
  const [token] = useState(
    () => new URLSearchParams(route.split("?")[1]).get("token") ?? "",
  );
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<"unsubscribed" | "reported" | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // The capability never enters an HTTP query, sign-in URL or public link.
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}#/email-preferences`,
    );
    const previous = document.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    const robots = previous ?? document.createElement("meta");
    const content = robots.content;
    robots.name = "robots";
    robots.content = "noindex,nofollow,noarchive";
    if (!previous) document.head.appendChild(robots);
    return () => {
      if (previous) robots.content = content;
      else robots.remove();
    };
  }, []);
  async function submit(action: "unsubscribe" | "report") {
    setPending(true);
    setFailed(false);
    try {
      const response = await api<{ feedback: "unsubscribed" | "reported" }>(
        "/email-preferences",
        { method: "POST", body: { token, action } },
      );
      setResult(response.feedback);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  const valid = /^[a-f0-9]{64}$/.test(token);
  return (
    <div className="landing public-site public-detail">
      <PublicHeader />
      <main id="main-content" className="public-detail-heading">
        <h1>{msg("Email preferences")}</h1>
        {result ? (
          <div role="status">
            <p>
              {msg(result === "reported" ? "Email reported" : "Unsubscribed")}
            </p>
            <p>
              {msg(
                "You will no longer receive emails from this workspace. Your existing documents remain accessible.",
              )}
            </p>
          </div>
        ) : (
          <>
            <p>
              {msg(
                "Stop emails from the workspace that sent this message. Reporting an unwanted email also stops these messages.",
              )}
            </p>
            {valid ? (
              <div className="actions">
                <button
                  className="button primary"
                  disabled={pending}
                  onClick={() => void submit("unsubscribe")}
                >
                  {msg("Unsubscribe")}
                </button>
                <button
                  className="button"
                  disabled={pending}
                  onClick={() => void submit("report")}
                >
                  {msg("Report an unwanted email")}
                </button>
              </div>
            ) : (
              <p role="alert">
                {msg("Reopen the preference link in the email you received.")}
              </p>
            )}
            {failed && (
              <p role="alert">
                {msg(
                  "The request could not be completed. Reopen the email link or try again.",
                )}
              </p>
            )}
          </>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
