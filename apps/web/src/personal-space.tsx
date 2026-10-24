import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Files,
  PaperPlaneTilt,
  ShieldCheck,
  SignOut,
} from "@phosphor-icons/react";
import { Brand } from "./brand";
import { ApiError, date, type Session } from "./api";
import {
  ConfirmAction,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  PageHeading,
  useAction,
} from "./components";
import { LanguageSelect } from "./language-select";
import { LegalLinks } from "./legal-links";
import {
  applyAccountLocale,
  getLocale,
  languageCopy,
  type SupportedLocale,
} from "./locale";
import { msg } from "./messages";
import { personalApi, type PersonalSession } from "./personal-api";
import {
  clearPendingDocumentInvitation,
  personalAuthenticationReturnTo,
} from "./document-invitation";
import "./secure-documents.css";

export function isPersonalRoute(page: string) {
  return /^\/app\/(my-documents|services|personal-account)(\/|$)/.test(page);
}

function authHref(kind: "login" | "signup", fresh = false) {
  const returnTo = personalAuthenticationReturnTo();
  return `/auth/${kind}?context=personal&locale=${getLocale()}&returnTo=${encodeURIComponent(returnTo)}${fresh ? "&fresh=1" : ""}`;
}

export function PersonalSignIn({
  onSignedIn,
  invitationStorageBlocked = false,
}: {
  onSignedIn: (session: PersonalSession) => void;
  invitationStorageBlocked?: boolean;
}) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    window.location.hostname,
  );
  const action = useAction();
  const authCode = new URLSearchParams(window.location.search).get("auth");
  const authenticationMessages: Record<string, string> = {
    EMAIL_VERIFICATION_REQUIRED: msg(
      "Vérifiez votre adresse avec le lien reçu par e-mail, puis reconnectez-vous.",
    ),
    ACCOUNT_VERIFICATION_REQUIRED: msg(
      "La vérification de votre compte n’a pas été confirmée. Vérifiez votre adresse e-mail, puis reconnectez-vous.",
    ),
    MFA_REQUIRED: msg(
      "Reconnectez-vous avec la méthode de sécurité requise pour accéder à vos documents.",
    ),
    STRONG_AUTHENTICATION_REQUIRED: msg(
      "Reconnectez-vous avec la méthode de sécurité requise pour accéder à vos documents.",
    ),
    DOCUMENT_AUTHENTICATION_REQUIRED: msg(
      "Reconnectez-vous à votre compte vérifié pour accéder à vos documents.",
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
  const authenticationError = authCode
    ? new Error(
        authenticationMessages[authCode] ??
          msg("La connexion n’a pas abouti. Vous pouvez réessayer."),
      )
    : undefined;
  const redirectStarted = useRef(false);
  const loginHref = authHref("login");
  useEffect(() => {
    if (
      local ||
      authCode ||
      invitationStorageBlocked ||
      redirectStarted.current
    )
      return;
    redirectStarted.current = true;
    window.location.replace(loginHref);
  }, [local, authCode, loginHref, invitationStorageBlocked]);
  if (!local && !authCode && !invitationStorageBlocked)
    return (
      <div className="initial-loading">
        <Loading />
      </div>
    );
  return (
    <div className="personal-space-login">
      <Brand />
      <LanguageSelect />
      <h1>{msg("Mes documents")}</h1>
      <p>
        {msg(
          "Votre identité de compte et votre accès doivent être vérifiés avant l’affichage du document.",
        )}
      </p>
      <ErrorNotice error={authenticationError} />
      {invitationStorageBlocked && (
        <p role="alert">
          {msg(
            "Ce navigateur ne peut pas conserver le lien pendant la connexion. Connectez-vous, puis rouvrez le lien reçu dans cet onglet.",
          )}
        </p>
      )}
      <div className="secure-document-actions">
        <a className="button primary" href={authHref("login")}>
          {msg("Se connecter à mon compte")}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
        <a className="button" href={authHref("signup")}>
          {msg("Créer mon compte Guteneo")}
        </a>
      </div>
      <p className="field-hint">
        {msg(
          "Votre compte sert aussi à utiliser les services Guteneo. Aucun atelier n’est créé pour consulter vos documents.",
        )}
      </p>
      {local && (
        <div className="secure-document-panel">
          <p>
            {msg("Simulation locale : les comptes et documents sont fictifs.")}
          </p>
          <button
            type="button"
            className="button"
            disabled={action.pending}
            onClick={() =>
              void action.run(async () => {
                const session = await personalApi<PersonalSession>(
                  "/dev/personal-login",
                  undefined,
                  { method: "POST", body: { identity: "recipient" } },
                );
                onSignedIn(session);
              })
            }
          >
            {msg("Ouvrir le compte destinataire fictif")}
          </button>
          <ErrorNotice error={action.error} />
        </div>
      )}
      <LegalLinks />
    </div>
  );
}

export function PersonalSecurityNotice({
  mode = "strong",
}: {
  mode?: "strong" | "verified_account";
}) {
  return (
    <section className="secure-document-panel" role="status">
      <h2>
        {mode === "verified_account"
          ? msg("Vérifiez votre connexion")
          : msg("Connexion renforcée nécessaire")}
      </h2>
      <p>
        {mode === "verified_account"
          ? msg(
              "Reconnectez-vous à votre compte vérifié pour accéder à vos documents.",
            )
          : msg(
              "Reconnectez-vous avec la méthode de sécurité requise pour accéder à vos documents.",
            )}
      </p>
      <a className="button primary" href={authHref("login", true)}>
        <ShieldCheck size={18} aria-hidden="true" />
        {msg("Vérifier mon accès")}
      </a>
    </section>
  );
}

export function PersonalSpace({
  route,
  documents,
  invitationStorageBlocked = false,
}: {
  route: string;
  documents: (
    session: PersonalSession,
    onSessionInvalid: () => void,
  ) => ReactNode;
  invitationStorageBlocked?: boolean;
}) {
  const [session, setPersonalSession] = useState<PersonalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [version, setVersion] = useState(0);
  const action = useAction();
  const page = route.split("?")[0] ?? "/app/my-documents";
  const onSessionInvalid = useCallback(() => {
    setPersonalSession(null);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let lastRead = 0;
    const read = async () => {
      if (
        pending ||
        document.visibilityState === "hidden" ||
        Date.now() - lastRead < 1000
      )
        return;
      pending = true;
      lastRead = Date.now();
      try {
        const current = await personalApi<PersonalSession>(
          "/personal/session",
          undefined,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setPersonalSession(current);
        applyAccountLocale(current.user.preferredLocale);
        setError(undefined);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && [401, 403].includes(cause.status))
          setPersonalSession(null);
        else setError(cause as Error);
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    const onFocus = () => void read();
    void read();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      controller.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [version]);
  if (loading)
    return (
      <div className="initial-loading">
        <Loading />
      </div>
    );
  if (!session)
    return (
      <>
        <ErrorNotice error={error} retry={() => setVersion((n) => n + 1)} />
        <PersonalSignIn
          invitationStorageBlocked={invitationStorageBlocked}
          onSignedIn={(current) => {
            setPersonalSession(current);
            setError(undefined);
          }}
        />
      </>
    );
  async function logout() {
    await action.run(async () => {
      await personalApi("/personal/logout", session!, {
        method: "POST",
        body: {},
      });
      clearPendingDocumentInvitation();
      setPersonalSession(null);
      // Leave the private route and discard workshop state before another
      // authentication screen can restart the provider's SSO flow.
      window.location.replace("/");
    });
  }
  return (
    <div className="personal-space">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        {msg("Aller au contenu")}
      </a>
      <header className="personal-space-header">
        <Brand />
        <nav aria-label={msg("Navigation personnelle")}>
          <a
            href="#/app/my-documents"
            aria-current={
              page.startsWith("/app/my-documents") ? "page" : undefined
            }
          >
            {msg("Mes documents")}
          </a>
          <a
            href="#/app/services"
            aria-current={page === "/app/services" ? "page" : undefined}
          >
            {msg("Utiliser Guteneo")}
          </a>
          <a
            href="#/app/personal-account"
            aria-current={page === "/app/personal-account" ? "page" : undefined}
          >
            {msg("Compte et sécurité")}
          </a>
        </nav>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="personal-space-main"
        key={session.user.id}
      >
        <div className="personal-space-account">
          <p>
            {msg("Connecté avec {0}", session.user.email)}
            <br />
            <small>{msg("Espace personnel")}</small>
          </p>
          <button
            type="button"
            className="button small subtle"
            disabled={action.pending}
            onClick={() => void logout()}
          >
            <SignOut size={18} aria-hidden="true" />
            {msg("Se déconnecter")}
          </button>
        </div>
        {session.simulation && (
          <div className="notice info" role="note">
            <p>
              {msg(
                "Simulation locale : les comptes et documents sont fictifs.",
              )}
            </p>
          </div>
        )}
        <ErrorNotice
          error={error ?? action.error}
          retry={() => setVersion((n) => n + 1)}
        />
        {page === "/app/services" ? (
          <PersonalServices
            session={session}
            next={new URLSearchParams(route.split("?")[1]).get("next")}
          />
        ) : page === "/app/personal-account" ? (
          <PersonalAccount
            session={session}
            onUpdated={() => setVersion((n) => n + 1)}
          />
        ) : (
          documents(session, onSessionInvalid)
        )}
      </main>
      <footer className="personal-space-footer">
        <LegalLinks />
      </footer>
    </div>
  );
}

function PersonalServices({
  session,
  next,
}: {
  session: PersonalSession;
  next: string | null;
}) {
  const [workspaceId, setWorkspaceId] = useState(
    session.workspaces.find((workspace) => workspace.current)?.id ??
      session.workspaces[0]?.id ??
      "",
  );
  const [name, setName] = useState("");
  const [requestedPath, setRequestedPath] = useState(
    next && /^\/app\/(prepare|secure-distributions\/new)(\?|$)/.test(next)
      ? next
      : "/app/prepare",
  );
  const action = useAction();
  async function enter(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      await personalApi<{
        organization: { id: string; name: string };
        session: Session;
      }>(
        workspaceId ? "/personal/workspace/select" : "/personal/workspace",
        session,
        {
          method: "POST",
          body: workspaceId
            ? { organizationId: workspaceId }
            : { name: name.trim() },
        },
      );
      window.location.assign(`/#${requestedPath}`);
    });
  }
  return (
    <div className="secure-document-layout">
      <PageHeading
        title={msg("Utiliser Guteneo")}
        intro={msg(
          "Un seul compte pour vos documents et les services Guteneo.",
        )}
      />
      <p className="secure-document-intro">
        {msg("Vos documents reçus restent accessibles sans achat de service.")}
      </p>
      <div className="personal-space-service-grid">
        <article className="secure-document-panel">
          <PaperPlaneTilt size={28} aria-hidden="true" />
          <h2>{msg("Envoyer des documents")}</h2>
          <p>
            {msg(
              "Préparez un envoi par e-mail, fax ou courrier postal. Vous vérifiez le contenu et le prix avant de confirmer.",
            )}
          </p>
          <button
            className="button"
            type="button"
            onClick={() => {
              setRequestedPath("/app/prepare");
              document.getElementById("personal-workspace-entry")?.focus();
            }}
          >
            {msg("Préparer un envoi")}
          </button>
        </article>
        <article className="secure-document-panel">
          <Files size={28} aria-hidden="true" />
          <h2>{msg("Partager un document sensible")}</h2>
          <p>
            {msg(
              "Accordez un accès individuel à un document et suivez les événements de consultation disponibles.",
            )}
          </p>
          <button
            className="button"
            type="button"
            onClick={() => {
              setRequestedPath("/app/secure-distributions/new");
              document.getElementById("personal-workspace-entry")?.focus();
            }}
          >
            {msg("Nouveau partage")}
          </button>
        </article>
      </div>
      <form
        className="secure-document-panel secure-document-form"
        aria-busy={action.pending}
        onSubmit={(event) => void enter(event)}
      >
        <h2 id="personal-workspace-entry" tabIndex={-1}>
          {session.workspaces.length
            ? msg("Choisir un atelier")
            : msg("Créer mon atelier")}
        </h2>
        {session.workspaces.length ? (
          <Field label={msg("Atelier actif")}>
            <select
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              {session.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
              <option value="">{msg("Créer mon atelier")}</option>
            </select>
          </Field>
        ) : null}
        {!workspaceId && (
          <Field
            label={msg("Nom de votre atelier")}
            hint={msg(
              "Votre espace d’envoi est créé uniquement à votre demande, avec le même compte.",
            )}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={100}
              autoComplete="organization"
            />
          </Field>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={action.pending || (!workspaceId && name.trim().length < 2)}
        >
          {action.pending
            ? msg("Chargement…")
            : workspaceId
              ? msg("Ouvrir mon atelier")
              : msg("Créer mon atelier")}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <ErrorNotice error={action.error} />
      </form>
      <a className="text-link" href="/#tarifs">
        {msg("Découvrir les tarifs")}
      </a>
    </div>
  );
}

type PersonalSessionItem = {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
  mfa: boolean;
  authenticatedAt: number | null;
};
function PersonalAccount({
  session,
  onUpdated,
}: {
  session: PersonalSession;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(session.user.name);
  const [locale, setLocale] = useState<SupportedLocale | "">(
    session.user.preferredLocale ?? "",
  );
  const [saved, setSaved] = useState(false);
  const [sessions, setSessions] = useState<PersonalSessionItem[]>();
  const [sessionsError, setSessionsError] = useState<Error>();
  const [version, setVersion] = useState(0);
  const action = useAction();
  useEffect(() => {
    const controller = new AbortController();
    personalApi<{ items: PersonalSessionItem[] }>(
      "/personal/account/sessions",
      session,
      { signal: controller.signal },
    )
      .then((response) => setSessions(response.items))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSessionsError(error as Error);
      });
    return () => controller.abort();
  }, [session, version]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    await action.run(async () => {
      await personalApi("/personal/account", session, {
        method: "PATCH",
        body: { name: name.trim(), preferredLocale: locale || null },
      });
      applyAccountLocale(locale || null);
      setSaved(true);
      onUpdated();
    });
  }
  return (
    <div className="secure-document-layout">
      <PageHeading
        title={msg("Compte et sécurité")}
        intro={msg(
          "Vos documents et les droits de vos ateliers restent liés à ce compte unique.",
        )}
      />
      <form
        className="secure-document-panel secure-document-form"
        onSubmit={(event) => void save(event)}
        aria-busy={action.pending}
      >
        <h2>{msg("Identité du compte")}</h2>
        <Field label={msg("Nom")}>
          <input
            value={name}
            required
            maxLength={160}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label={msg("Adresse e-mail")}>
          <input
            type="email"
            value={session.user.email}
            readOnly
            autoComplete="email"
          />
        </Field>
        <Field label={languageCopy().preference}>
          <select
            value={locale}
            onChange={(event) =>
              setLocale(event.target.value as SupportedLocale | "")
            }
          >
            <option value="">{languageCopy().automatic}</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="de">Deutsch</option>
            <option value="lb">Lëtzebuergesch</option>
          </select>
        </Field>
        <button
          type="submit"
          className="button"
          disabled={action.pending || !name.trim()}
        >
          {msg("Enregistrer les préférences")}
        </button>
        {saved && <p role="status">{msg("Préférences enregistrées.")}</p>}
        <ErrorNotice error={action.error} />
      </form>
      <section className="secure-document-panel">
        <h2>{msg("Sécurité du compte")}</h2>
        <p>
          {msg(
            "L’accès au contenu est contrôlé par le serveur à chaque opération. Une vérification supplémentaire peut vous être demandée.",
          )}
        </p>
        <a className="button" href={authHref("login", true)}>
          {msg("Gérer ma connexion")}
        </a>
      </section>
      <section className="secure-document-panel">
        <h2>{msg("Sessions actives")}</h2>
        <ErrorNotice
          error={sessionsError}
          retry={() => setVersion((n) => n + 1)}
        />
        {!sessions ? (
          <Loading />
        ) : sessions.length ? (
          <ul className="secure-document-list">
            {sessions.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>
                    {item.current
                      ? msg("Session actuelle")
                      : msg("Session du {0}", date(item.createdAt))}
                  </strong>
                  <small>
                    {msg("Disponible jusqu’au {0}", date(item.expiresAt))}
                  </small>
                </div>
                {!item.current && (
                  <ConfirmAction
                    label={msg("Fermer cette session")}
                    question={msg("Fermer cet accès au compte ?")}
                    confirmLabel={msg("Fermer la session")}
                    disabled={action.pending}
                    onConfirm={() =>
                      void action.run(async () => {
                        await personalApi(
                          `/personal/account/sessions/${encodeURIComponent(item.id)}/revoke`,
                          session,
                          { method: "POST", body: {} },
                        );
                        setVersion((n) => n + 1);
                      })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={msg("Aucune session active")} />
        )}
      </section>
    </div>
  );
}
