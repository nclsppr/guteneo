import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, ArrowRight, LockSimple } from "@phosphor-icons/react";
import { api, isPublicPreview, setSession, type Session } from "./api";
import { Brand } from "./brand";
import { ErrorNotice, Loading, useAction } from "./components";
import { LanguageMenu } from "./language-select";
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
      "Cette invitation est liée à une autre adresse. Rouvrez le lien reçu et connectez-vous avec l’adresse vérifiée qui a reçu l’invitation.",
    ),
    INVITATION_UNAVAILABLE: msg(
      "Cette invitation a expiré, a été révoquée ou a déjà été utilisée. Demandez un nouveau lien à l’administrateur de l’atelier.",
    ),
    INVITATION_EXISTING_MEMBER: msg(
      "Vous êtes déjà membre de cet atelier. Connectez-vous à votre compte et choisissez cet atelier dans Mon compte.",
    ),
    EMAIL_VERIFICATION_REQUIRED: msg(
      "Vérifiez votre adresse avec le lien reçu par e-mail, puis reconnectez-vous.",
    ),
    ACCOUNT_VERIFICATION_REQUIRED: msg(
      "La vérification de votre compte n’a pas été confirmée. Vérifiez votre adresse e-mail, puis reconnectez-vous.",
    ),
    MFA_REQUIRED: msg(
      "La double authentification est nécessaire pour protéger votre espace. Reconnectez-vous pour terminer sa configuration.",
    ),
    IDENTITY_NOT_CONFIGURED: msg(
      "L’ouverture des comptes est en cours de configuration. Réessayez bientôt.",
    ),
    LOGIN_STATE_INVALID: msg(
      "Votre connexion a expiré. Recommencez pour ouvrir votre espace.",
    ),
    LOGIN_EXCHANGE_FAILED: msg(
      "La connexion n’a pas abouti. Vous pouvez réessayer.",
    ),
    LOGIN_RATE_LIMITED: msg(
      "Trop de tentatives de connexion. Réessayez dans une heure.",
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
      <header className="access-header">
        <Brand />
        <LanguageMenu />
      </header>
      <main className="access-main" id="main-content" tabIndex={-1}>
        <div className="access-panel">
          <h1>
            {local
              ? msg("Explorez la démonstration")
              : msg("Reprenons la connexion.")}
          </h1>
          <p className="access-description">
            {local
              ? t.login.body
              : msg("Réessayez pour retrouver la page demandée.")}
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
                        "La connexion n’a pas abouti. Recommencez pour accéder à votre espace.",
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
                  ? msg("Ouverture de la connexion…")
                  : t.login.managed}
                <ArrowRight size={20} aria-hidden="true" />
              </a>
              <p className="access-provider" role="status">
                <LockSimple size={15} aria-hidden="true" />
                {redirecting
                  ? msg("Redirection vers Auth0…")
                  : msg("Connexion sécurisée par Auth0.")}
              </p>
              {locale === "lb" && (
                <p className="access-locale-note">
                  {msg(
                    "Auth0 ne propose pas le luxembourgeois. Une langue de repli sera utilisée pour cette étape.",
                  )}
                </p>
              )}
              {registrationAvailable ? (
                <p className="access-signup">
                  {msg("Première visite ?")}{" "}
                  <a
                    href={`/auth/signup?locale=${locale}&returnTo=${returnTo}`}
                    aria-disabled={redirecting ? true : undefined}
                    onClick={(event) => startRedirect(event, "signup")}
                  >
                    {msg("Créer un compte")}
                  </a>
                </p>
              ) : (
                <p className="access-signup">
                  {msg(
                    "L’inscription sera disponible dès que le service de connexion sera raccordé.",
                  )}
                </p>
              )}
            </>
          )}
        </div>
        <a className="access-back" href="#/">
          <ArrowLeft size={16} aria-hidden="true" />
          {msg("Retour au site")}
        </a>
      </main>
      <footer className="access-footer">
        <a href="/confidentialite/">{msg("Confidentialité")}</a>
        <a href="/conditions/">{msg("Conditions")}</a>
        <a href="/support/">{msg("Assistance")}</a>
      </footer>
    </div>
  );
}
