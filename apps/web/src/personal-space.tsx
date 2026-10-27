import { defaultDashboardAppearance } from "../../../packages/contracts/src/dashboard-appearance";
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
  UserCircle,
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
import { ThemeToggle } from "./theme-toggle";
import { AppearancePreferences } from "./appearance-preferences";
import {
  useDashboardAppearance,
  type DashboardAppearance,
} from "./dashboard-appearance";
import {
  applyAccountLocale,
  getLocale,
  languageCopy,
  type SupportedLocale,
} from "./locale";
import { msg } from "./messages";
import { personalApi, type PersonalSession } from "./personal-api";
import { workspaceInvitationPath } from "./workspace-entry";
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
      "Verify your address using the link in the email, then sign in again.",
    ),
    ACCOUNT_VERIFICATION_REQUIRED: msg(
      "Your account verification could not be confirmed. Verify your email address, then sign in again.",
    ),
    MFA_REQUIRED: msg(
      "Sign in again using the required security method to access your documents.",
    ),
    STRONG_AUTHENTICATION_REQUIRED: msg(
      "Sign in again using the required security method to access your documents.",
    ),
    DOCUMENT_AUTHENTICATION_REQUIRED: msg(
      "Sign in again to your verified account to access your documents.",
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
  const authenticationError = authCode
    ? new Error(
        authenticationMessages[authCode] ??
          msg("Sign-in did not complete. You can try again."),
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
      <h1>{msg("My documents")}</h1>
      <p>
        {msg(
          "Your account identity and access must be verified before the document can be displayed.",
        )}
      </p>
      <ErrorNotice error={authenticationError} />
      {invitationStorageBlocked && (
        <p role="alert">
          {msg(
            "This browser cannot retain the link while you sign in. Sign in, then reopen the received link in this tab.",
          )}
        </p>
      )}
      <div className="secure-document-actions">
        <a className="button primary" href={authHref("login")}>
          {msg("Sign in to my account")}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
        <a className="button" href={authHref("signup")}>
          {msg("Create my Guteneo account")}
        </a>
      </div>
      <p className="field-hint">
        {msg(
          "Your account also gives you access to Guteneo services. No workspace is created to view your documents.",
        )}
      </p>
      {local && (
        <div className="secure-document-panel">
          <p>
            {msg("Local simulation: accounts and documents are fictional.")}
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
            {msg("Open the fictional recipient account")}
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
          ? msg("Verify your sign-in")
          : msg("Stronger sign-in required")}
      </h2>
      <p>
        {mode === "verified_account"
          ? msg(
              "Sign in again to your verified account to access your documents.",
            )
          : msg(
              "Sign in again using the required security method to access your documents.",
            )}
      </p>
      <a className="button primary" href={authHref("login", true)}>
        <ShieldCheck size={18} aria-hidden="true" />
        {msg("Verify my access")}
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
  const sessionReadRevision = useRef(0);
  const { appearance, applyAccountAppearance } = useDashboardAppearance();
  const action = useAction();
  const page = route.split("?")[0] ?? "/app/my-documents";
  const onSessionInvalid = useCallback(() => {
    sessionReadRevision.current += 1;
    setPersonalSession(null);
  }, []);
  useEffect(() => {
    if (session) {
      applyAccountLocale(session.user.preferredLocale);
      applyAccountAppearance(
        session.user.preferredDashboardAppearance ?? defaultDashboardAppearance,
        session.user.id,
      );
    }
  }, [session, applyAccountAppearance]);
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
      const revision = sessionReadRevision.current;
      try {
        const current = await personalApi<PersonalSession>(
          "/personal/session",
          undefined,
          { signal: controller.signal },
        );
        if (
          controller.signal.aborted ||
          revision !== sessionReadRevision.current
        )
          return;
        setPersonalSession(current);
        applyAccountLocale(current.user.preferredLocale);
        setError(undefined);
      } catch (cause) {
        if (
          controller.signal.aborted ||
          revision !== sessionReadRevision.current
        )
          return;
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
            sessionReadRevision.current += 1;
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
      sessionReadRevision.current += 1;
      setPersonalSession(null);
      // Leave the private route and discard workshop state before another
      // authentication screen can restart the provider's SSO flow.
      window.location.replace("/");
    });
  }
  const accountUtility = (
    <div className="personal-space-account">
      <p>
        {appearance === "v2" && <strong>{session.user.name}</strong>}
        {msg("Signed in as {0}", session.user.email)}
      </p>
      <button
        type="button"
        className="button small subtle"
        disabled={action.pending}
        onClick={() => void logout()}
      >
        <SignOut size={18} aria-hidden="true" />
        {msg("Sign out")}
      </button>
    </div>
  );
  return (
    <div
      className={`personal-space${appearance === "v2" ? " personal-space-v2" : ""}`}
      data-appearance={appearance}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        {msg("Skip to content")}
      </a>
      <header className="personal-space-header">
        <Brand />
        <nav aria-label={msg("Personal navigation")}>
          <a
            href="#/app/my-documents"
            aria-current={
              page.startsWith("/app/my-documents") ? "page" : undefined
            }
          >
            <Files size={20} aria-hidden="true" />
            {msg("My documents")}
          </a>
          <a
            href="#/app/services"
            aria-current={page === "/app/services" ? "page" : undefined}
          >
            <PaperPlaneTilt size={20} aria-hidden="true" />
            {msg("Use Guteneo")}
          </a>
          <a
            href="#/app/personal-account"
            aria-current={page === "/app/personal-account" ? "page" : undefined}
          >
            <UserCircle size={20} aria-hidden="true" />
            {msg("Account and security")}
          </a>
        </nav>
        <ThemeToggle />
        {appearance === "v2" && accountUtility}
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="personal-space-main"
        key={session.user.id}
      >
        {appearance !== "v2" && accountUtility}
        {session.simulation && (
          <div className="notice info" role="note">
            <p>
              {msg("Local simulation: accounts and documents are fictional.")}
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
            onUpdated={(current) => {
              // An already running focus read may contain the pre-save profile.
              // Adopt the PATCH session without adding another read waterfall.
              sessionReadRevision.current += 1;
              setError(undefined);
              setPersonalSession((previous) =>
                previous?.user.id === session.user.id &&
                previous.csrfToken === session.csrfToken
                  ? current
                  : previous,
              );
            }}
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
  const [entry, setEntry] = useState<"create" | "join">("create");
  const [invitation, setInvitation] = useState("");
  const [requestedPath, setRequestedPath] = useState(
    next && /^\/app(?:$|\/(prepare|secure-distributions\/new)(\?|$))/.test(next)
      ? next
      : "/app/prepare",
  );
  const action = useAction();
  async function enter(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (!workspaceId && entry === "join") {
        const destination = workspaceInvitationPath(
          invitation,
          window.location.origin,
        );
        if (!destination)
          throw new Error(
            msg("Paste the complete Guteneo workspace invitation link."),
          );
        window.location.assign(destination);
        return;
      }
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
      // The workshop cookie has rotated. Remount Application so its session,
      // tenant and CSRF token all come from the new server session.
      window.history.replaceState(null, "", `/#${requestedPath}`);
      window.location.reload();
    });
  }
  return (
    <div className="secure-document-layout">
      <PageHeading
        title={msg("Use Guteneo")}
        intro={msg("One account for your documents and Guteneo services.")}
      />
      <p className="secure-document-intro">
        {msg(
          "Your received documents remain accessible without purchasing a service.",
        )}
      </p>
      <form
        className="secure-document-panel secure-document-form"
        aria-busy={action.pending}
        onSubmit={(event) => void enter(event)}
      >
        <h2 id="personal-workspace-entry" tabIndex={-1}>
          {session.workspaces.length
            ? msg("Choose a workspace")
            : msg("Create or join a workspace")}
        </h2>
        {session.workspaces.length ? (
          <Field label={msg("Active workspace")}>
            <select
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              {session.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
              <option value="">{msg("Create my workspace")}</option>
            </select>
          </Field>
        ) : null}
        {!workspaceId && (
          <Field label={msg("Workspace setup")}>
            <select
              value={entry}
              disabled={action.pending}
              onChange={(event) =>
                setEntry(event.target.value as "create" | "join")
              }
            >
              <option value="create">{msg("Create my workspace")}</option>
              <option value="join">{msg("Join an existing workspace")}</option>
            </select>
          </Field>
        )}
        {!workspaceId && entry === "create" && (
          <Field
            label={msg("Your workspace name")}
            hint={msg(
              "Your sending workspace is created only when you request it, using the same account.",
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
        {!workspaceId && entry === "join" && (
          <Field
            label={msg("Workspace invitation link")}
            hint={msg(
              "Ask the workspace administrator for an invitation to {0}, then paste the received link.",
              session.user.email,
            )}
          >
            <input
              type="url"
              value={invitation}
              required
              maxLength={2048}
              autoComplete="off"
              spellCheck={false}
              disabled={action.pending}
              onChange={(event) => setInvitation(event.target.value)}
            />
          </Field>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={
            action.pending ||
            (!workspaceId &&
              (entry === "create"
                ? name.trim().length < 2
                : !invitation.trim()))
          }
        >
          {action.pending
            ? msg("Loading…")
            : workspaceId
              ? msg("Open my workspace")
              : entry === "join"
                ? msg("Review invitation")
                : msg("Create my workspace")}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <ErrorNotice error={action.error} />
      </form>
      <div className="personal-space-service-grid">
        <article className="secure-document-panel">
          <PaperPlaneTilt size={28} aria-hidden="true" />
          <h2>{msg("Send documents")}</h2>
          <p>
            {msg(
              "Prepare an email, fax or postal dispatch. Review the content and price before confirming.",
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
            {msg("Prepare a dispatch")}
          </button>
        </article>
        <article className="secure-document-panel">
          <Files size={28} aria-hidden="true" />
          <h2>{msg("Share a sensitive document")}</h2>
          <p>
            {msg(
              "Grant individual access to a document and follow the available viewing events.",
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
            {msg("New share")}
          </button>
        </article>
      </div>
      <a className="text-link" href="/#pricing">
        {msg("View pricing")}
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
  onUpdated: (session: PersonalSession) => void;
}) {
  const [name, setName] = useState(session.user.name);
  const [locale, setLocale] = useState<SupportedLocale | "">(
    session.user.preferredLocale ?? "",
  );
  const [saved, setSaved] = useState(false);
  const [draftAppearance, setDraftAppearance] =
    useState<DashboardAppearance | null>(null);
  const { saveAccountAppearance } = useDashboardAppearance();
  const selectedAppearance =
    draftAppearance ??
    session.user.preferredDashboardAppearance ??
    defaultDashboardAppearance;
  const [sessions, setSessions] = useState<PersonalSessionItem[]>();
  const [sessionsError, setSessionsError] = useState<Error>();
  const [version, setVersion] = useState(0);
  const saveController = useRef<AbortController | null>(null);
  const action = useAction();
  useEffect(
    () => () => saveController.current?.abort(),
    [session.user.id, session.csrfToken],
  );
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
      const controller = new AbortController();
      saveController.current = controller;
      const current = await personalApi<PersonalSession>(
        "/personal/account",
        session,
        {
          method: "PATCH",
          signal: controller.signal,
          body: {
            name: name.trim(),
            preferredLocale: locale || null,
            ...(draftAppearance !== null
              ? { preferredDashboardAppearance: selectedAppearance }
              : {}),
          },
        },
      );
      if (current.user.id !== session.user.id) return;
      if (draftAppearance !== null)
        saveAccountAppearance(
          current.user.preferredDashboardAppearance ??
            defaultDashboardAppearance,
          current.user.id,
        );
      onUpdated(current);
      setDraftAppearance(null);
      setSaved(true);
    });
  }
  return (
    <div className="secure-document-layout personal-account-layout">
      <PageHeading
        title={msg("Account and security")}
        intro={msg(
          "Your documents and workspace permissions remain linked to this single account.",
        )}
      />
      <section
        className="form-panel personal-account-identity"
        aria-labelledby="personal-account-identity-title"
      >
        <h2 id="personal-account-identity-title">{msg("Your account")}</h2>
        <dl className="personal-account-identity-details">
          <div>
            <dt>{msg("Your name")}</dt>
            <dd>{session.user.name}</dd>
          </div>
          <div>
            <dt>{msg("Sign-in email")}</dt>
            <dd>{session.user.email}</dd>
          </div>
        </dl>
        <p className="field-hint">
          {msg(
            "Your sign-in email comes from your identity account. It cannot be changed in Guteneo.",
          )}
        </p>
      </section>
      <form
        className="form-panel personal-account-profile"
        onSubmit={(event) => void save(event)}
        aria-busy={action.pending}
      >
        <h2>{msg("My profile")}</h2>
        <Field label={msg("Your name")}>
          <input
            value={name}
            required
            maxLength={160}
            autoComplete="name"
            disabled={action.pending}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
              action.clear();
            }}
          />
        </Field>
        <AppearancePreferences
          appearance={selectedAppearance}
          disabled={action.pending}
          onAppearanceChange={(next) => {
            setDraftAppearance(next);
            setSaved(false);
            action.clear();
          }}
          language={
            <Field label={languageCopy().preference}>
              <select
                value={locale}
                disabled={action.pending}
                onChange={(event) => {
                  setLocale(event.target.value as SupportedLocale | "");
                  setSaved(false);
                  action.clear();
                }}
              >
                <option value="">{languageCopy().automatic}</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="lb">Lëtzebuergesch</option>
              </select>
            </Field>
          }
        />
        <button
          type="submit"
          className="button primary"
          disabled={action.pending || !name.trim()}
        >
          {action.pending ? msg("Saving…") : msg("Save preferences")}
        </button>
        {saved && <p role="status">{msg("Preferences saved.")}</p>}
        <ErrorNotice error={action.error} />
      </form>
      <div className="personal-account-security-grid">
        <section
          className="form-panel"
          aria-labelledby="personal-account-security-title"
        >
          <h2 id="personal-account-security-title">
            {msg("Account security")}
          </h2>
          <p>
            {msg(
              "The server checks content access for each operation. You may be asked to verify your identity again.",
            )}
          </p>
          <a className="button" href={authHref("login", true)}>
            {msg("Manage sign-in")}
          </a>
        </section>
        <section
          className="form-panel"
          aria-labelledby="personal-account-sessions-title"
        >
          <h2 id="personal-account-sessions-title">{msg("Active sessions")}</h2>
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
                        ? msg("Current session")
                        : msg("Session from {0}", date(item.createdAt))}
                    </strong>
                    <small>
                      {msg("Available until {0}", date(item.expiresAt))}
                    </small>
                  </div>
                  {!item.current && (
                    <ConfirmAction
                      label={msg("Close this session")}
                      question={msg("Close this account session?")}
                      confirmLabel={msg("Close session")}
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
            <EmptyState title={msg("No active sessions")} />
          )}
        </section>
      </div>
    </div>
  );
}
