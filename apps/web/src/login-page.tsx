import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, ArrowRight, LockSimple } from "@phosphor-icons/react";
import { api, isPublicPreview, setSession, type Session } from "./api";
import { PublicHeader } from "./public-chrome";
import { LegalLinks } from "./legal-links";
import { ErrorNotice, Loading, useAction } from "./components";
import { getLocale, t, useLocale } from "./locale";
import { msg } from "./messages";

export function Login({
  onLogin,
  registrationAvailable,
}: {
  onLogin: (session: Session) => void;
  registrationAvailable: boolean;
}) {
  useLocale();
  const action = useAction();
  const [redirecting, setRedirecting] = useState<"login" | "signup" | null>(
    null,
  );
  const local =
    isPublicPreview ||
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const authCode = new URLSearchParams(window.location.search).get("auth");
  const returnTo = encodeURIComponent("/" + (window.location.hash || "#/app"));
  const locale = getLocale();
  const redirectStarted = useRef(false);
  const loginHref = `/auth/login?locale=${locale}&${authCode ? "fresh=1&" : ""}returnTo=${returnTo}`;
  const authMessages: Record<string, string> = {
    INVITATION_EMAIL_MISMATCH: msg(
      "This invitation is linked to another address. Reopen the link and sign in with the verified address that received the invitation.",
    ),
    INVITATION_UNAVAILABLE: msg(
      "This invitation has expired, been revoked or already been used. Ask the workspace administrator for a new link.",
    ),
    INVITATION_EXISTING_MEMBER: msg(
      "You already belong to this workspace. Sign in and select it in My account.",
    ),
    EMAIL_VERIFICATION_REQUIRED: msg(
      "Verify your address using the link in the email, then sign in again.",
    ),
    ACCOUNT_VERIFICATION_REQUIRED: msg(
      "Your account verification could not be confirmed. Verify your email address, then sign in again.",
    ),
    MFA_REQUIRED: msg(
      "Two-factor authentication is required to protect your workspace. Sign in again to finish setting it up.",
    ),
    IDENTITY_NOT_CONFIGURED: msg(
      "Account registration is being set up. Please try again soon.",
    ),
    LOGIN_STATE_INVALID: msg(
      "Your sign-in has expired. Start again to access your workspace.",
    ),
    LOGIN_EXCHANGE_FAILED: msg("Sign-in did not complete. You can try again."),
    LOGIN_RATE_LIMITED: msg(
      "Too many sign-in attempts. Try again in one hour.",
    ),
  };

  // Back/forward cache restores the component state as well as the document.
  // Returning from Auth0 must restore usable links, without an automatic retry.
  useEffect(() => {
    const restore = () => setRedirecting(null);
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  // A protected deep link can arrive without going through a public sign-in
  // link. After the session probe, continue directly to Auth0. A returned error
  // deliberately stays here, so an unavailable provider cannot create a loop.
  useEffect(() => {
    if (local || authCode || redirectStarted.current) return;
    redirectStarted.current = true;
    window.location.replace(loginHref);
  }, [local, authCode, loginHref]);

  function startRedirect(
    event: MouseEvent<HTMLAnchorElement>,
    intent: "login" | "signup",
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (redirecting) event.preventDefault();
    else setRedirecting(intent);
  }

  async function login(organization: "atelier" | "studio") {
    await action.run(async () => {
      await api("/dev/login", { method: "POST", body: { organization } });
      const session = await api<Session>("/session");
      setSession(session);
      onLogin(session);
    });
  }

  if (!local && !authCode)
    return (
      <div className="initial-loading">
        <Loading />
      </div>
    );

  return (
    <div className="access-page">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        {t.skip}
      </a>
      <PublicHeader showWorkspaceLink={false} />
      <main className="access-main" id="main-content" tabIndex={-1}>
        <div className="access-panel">
          <h1>
            {local
              ? msg("Explore the demonstration")
              : msg("Let’s try signing in again.")}
          </h1>
          <p className="access-description">
            {local
              ? t.login.body
              : msg("Try again to return to the page you requested.")}
          </p>
          {local ? (
            <>
              <div className="notice info">
                <span className="simulation-stamp">{t.simulation}</span>
                <p>{t.simulationBody}</p>
              </div>
              {(["atelier", "studio"] as const).map((organization) => (
                <button
                  className="organization-button"
                  key={organization}
                  onClick={() => void login(organization)}
                  disabled={action.pending}
                >
                  <span className="organization-initial">
                    {organization === "atelier" ? "A" : "S"}
                  </span>
                  <span>{t.login[organization]}</span>
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              ))}
              <ErrorNotice error={action.error} />
              {action.pending && <p role="status">{t.loading}</p>}
            </>
          ) : (
            <>
              {authCode && (
                <div className="notice warning access-error" role="status">
                  <p>
                    {authMessages[authCode] ??
                      msg(
                        "Sign-in did not complete. Start again to access your workspace.",
                      )}
                  </p>
                </div>
              )}
              <a
                href={loginHref}
                className="button primary access-continue"
                aria-disabled={redirecting ? true : undefined}
                aria-busy={redirecting === "login" ? true : undefined}
                onClick={(event) => startRedirect(event, "login")}
              >
                {redirecting === "login"
                  ? msg("Opening sign-in…")
                  : t.login.managed}
                <ArrowRight size={20} aria-hidden="true" />
              </a>
              <p className="access-provider" role="status">
                <LockSimple size={15} aria-hidden="true" />
                {redirecting
                  ? msg("Redirecting to Auth0…")
                  : msg("Secure sign-in with Auth0.")}
              </p>
              {locale === "lb" && (
                <p className="access-locale-note">
                  {msg(
                    "Auth0 does not support Luxembourgish. A fallback language will be used for this step.",
                  )}
                </p>
              )}
              {registrationAvailable ? (
                <p className="access-signup">
                  {msg("New here?")}{" "}
                  <a
                    href={`/auth/signup?locale=${locale}&returnTo=${returnTo}`}
                    aria-disabled={redirecting ? true : undefined}
                    onClick={(event) => startRedirect(event, "signup")}
                  >
                    {msg("Create an account")}
                  </a>
                </p>
              ) : (
                <p className="access-signup">
                  {msg(
                    "Sign-up will be available once the sign-in service is connected.",
                  )}
                </p>
              )}
            </>
          )}
        </div>
        <a className="access-back" href="/">
          <ArrowLeft size={16} aria-hidden="true" />
          {msg("Back to the website")}
        </a>
      </main>
      <footer className="access-footer">
        <LegalLinks compact />
      </footer>
    </div>
  );
}
