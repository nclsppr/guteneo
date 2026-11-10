import { ApplicationTimeScope } from "./application-time";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  ArrowRight,
  Files,
  PaperPlaneTilt,
  ShieldCheck,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { Brand } from "./brand";
import { sessionAuthorityKey, ApiError, date, type Session } from "./api";
import {
  ConfirmAction,
  DateTimezone,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  PageHeading,
  useAction,
} from "./components";
import { LanguageSelect } from "./language-select";
import { LegalLinks } from "./legal-links";
import { WorkspaceIdentity } from "./workspace-identity";
import { AppearancePreferences } from "./appearance-preferences";
import {
  applyAccountLocale,
  initializeLocale,
  getLocale,
  languageCopy,
  type SupportedLocale,
} from "./locale";
import { msg } from "./messages";
import {
  personalApi,
  type PersonalSession,
  type PersonalSessionRead,
} from "./personal-api";
import { ApplicationSwitcher } from "./space-switcher";
import {
  workspaceDestination,
  workspaceInvitationPath,
} from "./workspace-entry";
import {
  clearPendingDocumentInvitation,
  personalAuthenticationReturnTo,
} from "./document-invitation";
import "./secure-documents.css";

/** Server-projected rights only choose navigation; Administration rechecks them. */
function canOpenAdministration(
  workspace: PersonalSession["workspaces"][number],
) {
  return workspace.role === "admin" || workspace.canViewReports === true;
}

export function isPersonalRoute(page: string) {
  return /^\/app\/(my-documents|services|personal-account)(\/|$)/.test(page);
}

function isPageHidden() {
  return document.visibilityState === "hidden";
}

const PersonalFocusRefresh = createContext<
  ((identity: string, refresh: () => void) => () => void) | null
>(null);

/** Personal reads resume only after the parent has verified this identity. */
export function usePersonalFocusRefresh(
  refresh: () => void,
  identity: string,
  enabled = true,
) {
  const subscribe = useContext(PersonalFocusRefresh);
  useEffect(() => {
    if (enabled) return subscribe?.(identity, refresh);
  }, [subscribe, identity, refresh, enabled]);
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
  const action = useAction("personal-sign-in");
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
              void action.run(async (view) => {
                const session = await view.wait(
                  personalApi<PersonalSession>(
                    "/dev/personal-login",
                    undefined,
                    { method: "POST", body: { identity: "recipient" } },
                  ),
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
      <a
        className="button primary"
        href={authHref("login", mode !== "verified_account")}
      >
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
  initialSession,
}: {
  route: string;
  documents: (
    session: PersonalSession,
    onSessionInvalid: () => void,
  ) => ReactNode;
  invitationStorageBlocked?: boolean;
  initialSession?: PersonalSessionRead;
}) {
  const [session, setPersonalSession] = useState<PersonalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [version, setVersion] = useState(0);
  const [sessionRevalidating, setSessionRevalidating] = useState(false);
  const sessionRevalidation = useRef(false);
  const currentSession = useRef(session);
  currentSession.current = session;
  const focusRefreshers = useRef(
    new Set<{ identity: string; refresh: () => void }>(),
  );
  const subscribeFocusRefresh = useCallback(
    (identity: string, refresh: () => void) => {
      const subscriber = { identity, refresh };
      focusRefreshers.current.add(subscriber);
      return () => {
        focusRefreshers.current.delete(subscriber);
      };
    },
    [],
  );
  const sessionReadRevision = useRef(0);
  const entryReadConsumed = useRef(false);
  const action = useAction(sessionAuthorityKey(session));
  const page = route.split("?")[0] ?? "/app/my-documents";
  const onSessionInvalid = useCallback(() => {
    sessionReadRevision.current += 1;
    sessionRevalidation.current = false;
    setSessionRevalidating(false);
    setPersonalSession(null);
    initializeLocale(true);
  }, []);
  useEffect(() => {
    if (session) applyAccountLocale(session.user.preferredLocale);
  }, [session]);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let revalidateAfterRead = false;
    let lastFocusRead = 0;
    let focusTimer: number | undefined;
    const requestFocusRead = () => {
      if (pending) {
        revalidateAfterRead = true;
        return;
      }
      const remaining = Math.max(0, 1000 - (Date.now() - lastFocusRead));
      if (remaining) {
        if (focusTimer === undefined)
          focusTimer = window.setTimeout(() => {
            focusTimer = undefined;
            if (!controller.signal.aborted && !isPageHidden()) {
              lastFocusRead = Date.now();
              void read();
            }
          }, remaining);
      } else {
        lastFocusRead = Date.now();
        void read();
      }
    };
    const read = async () => {
      if (pending || isPageHidden()) return;
      pending = true;
      const revision = sessionReadRevision.current;
      const previousIdentity = currentSession.current
        ? sessionAuthorityKey(currentSession.current)
        : undefined;
      let verified: PersonalSession | undefined;
      try {
        let current: PersonalSession;
        if (
          initialSession &&
          !entryReadConsumed.current &&
          !initialSession.signal.aborted
        ) {
          entryReadConsumed.current = true;
          const result = await initialSession.result;
          if (initialSession.signal.aborted) {
            if (isPageHidden()) return;
            current = await personalApi<PersonalSession>(
              "/personal/session",
              undefined,
              { signal: controller.signal },
            );
          } else {
            if (result.error) throw result.error;
            current = result.session;
          }
        } else {
          current = await personalApi<PersonalSession>(
            "/personal/session",
            undefined,
            { signal: controller.signal },
          );
        }
        if (
          controller.signal.aborted ||
          revision !== sessionReadRevision.current
        )
          return;
        // Retain the same identity object and mounted state when unchanged;
        // eligible lists refresh only after this verified cycle completes.
        setPersonalSession((previous) =>
          previous && JSON.stringify(previous) === JSON.stringify(current)
            ? previous
            : current,
        );
        applyAccountLocale(current.user.preferredLocale);
        setError(undefined);
        verified = current;
      } catch (cause) {
        if (
          controller.signal.aborted ||
          revision !== sessionReadRevision.current
        )
          return;
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
          sessionRevalidation.current = false;
          setSessionRevalidating(false);
          setPersonalSession(null);
          initializeLocale(true);
        } else setError(cause as Error);
      } finally {
        pending = false;
        if (
          sessionRevalidation.current &&
          revision !== sessionReadRevision.current
        )
          revalidateAfterRead = true;
        if (!controller.signal.aborted && revalidateAfterRead) {
          revalidateAfterRead = false;
          requestFocusRead();
        } else if (!controller.signal.aborted && !isPageHidden()) {
          setLoading(false);
          if (verified) {
            sessionRevalidation.current = false;
            setSessionRevalidating(false);
            const identity = sessionAuthorityKey(verified);
            if (identity === previousIdentity)
              for (const subscriber of focusRefreshers.current)
                if (subscriber.identity === identity) subscriber.refresh();
          }
        }
      }
    };
    const onFocus = (event: Event) => {
      // Capture the window wake before child list listeners, not field focus.
      if (event.type === "focus" && event.target !== window) return;
      if (isPageHidden()) {
        lastFocusRead = 0;
        if (focusTimer !== undefined) window.clearTimeout(focusTimer);
        focusTimer = undefined;
        return;
      }
      sessionRevalidation.current = true;
      // Keep editor/list state mounted while making private data unavailable
      // until the parent can authorize subsequent child refreshes.
      flushSync(() => {
        setSessionRevalidating(true);
        setError(undefined);
      });
      // Coalescing delays a read within the bounded window; it never drops a
      // real wake or lends an unverified identity to a child list refresh.
      requestFocusRead();
    };
    void read();
    window.addEventListener("focus", onFocus, true);
    document.addEventListener("visibilitychange", onFocus, true);
    return () => {
      controller.abort();
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
      window.removeEventListener("focus", onFocus, true);
      document.removeEventListener("visibilitychange", onFocus, true);
    };
  }, [version, initialSession]);
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
            sessionRevalidation.current = false;
            setSessionRevalidating(false);
            setPersonalSession(current);
            setError(undefined);
          }}
        />
      </>
    );
  async function logout() {
    await action.run(async (view) => {
      await view.wait(
        personalApi("/personal/logout", session!, {
          method: "POST",
          body: {},
        }),
      );
      clearPendingDocumentInvitation();
      initializeLocale(true);
      sessionReadRevision.current += 1;
      setPersonalSession(null);
      // Leave the private route and discard workshop state before another
      // authentication screen can restart the provider's SSO flow.
      window.location.replace("/");
    });
  }
  const currentWorkspace =
    session.workspaces.find((workspace) => workspace.current) ?? null;
  return (
    <div className="personal-space personal-space-v2 app-frame-v2">
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
        <div className="sidebar-context">
          <ApplicationSwitcher
            application="personal"
            hasWorkspace={currentWorkspace !== null}
            canAdministerWorkspace={
              currentWorkspace
                ? canOpenAdministration(currentWorkspace)
                : session.workspaces.some(canOpenAdministration)
            }
            canAccessBelvedere={session.canAccessBelvedere === true}
          />
        </div>
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
          {/* Without a workspace; the space switcher reaches services otherwise. */}
          {!session.workspaces.length && (
            <a
              href="#/app/services"
              aria-current={page === "/app/services" ? "page" : undefined}
            >
              <PaperPlaneTilt size={20} aria-hidden="true" />
              {msg("Use Guteneo")}
            </a>
          )}
        </nav>
        <div className="sidebar-account">
          <WorkspaceIdentity
            session={session}
            profileHref="#/app/personal-account"
            profileLabel={msg("Account and security")}
            authenticationContext="personal"
            returnTo={personalAuthenticationReturnTo()}
            onLogout={logout}
            logoutPending={action.pending}
          />
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="personal-space-main"
        key={session.user.id}
        aria-busy={sessionRevalidating || undefined}
      >
        <DateTimezone />
        <ErrorNotice
          error={error ?? action.error}
          retry={() => setVersion((n) => n + 1)}
        />
        {sessionRevalidating && !error && <Loading />}
        <div
          className="personal-session-content"
          hidden={sessionRevalidating}
          inert={sessionRevalidating}
        >
          <PersonalFocusRefresh.Provider value={subscribeFocusRefresh}>
            <ApplicationTimeScope>
              {session.simulation && (
                <div className="notice info" role="note">
                  <p>
                    {msg(
                      "Local simulation: accounts and documents are fictional.",
                    )}
                  </p>
                </div>
              )}
              {page === "/app/services" ? (
                <PersonalServices
                  key={route}
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
            </ApplicationTimeScope>
          </PersonalFocusRefresh.Provider>
        </div>
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
  const requested = workspaceDestination(next);
  const [destination, setDestination] = useState(
    requested ?? { path: "/app/prepare", kind: "prepare" as const },
  );
  // Administration needs report rights in the chosen workspace; creating a
  // workspace makes its creator an administrator, so it stays available.
  const eligible = session.workspaces.filter(
    (workspace) =>
      destination.kind !== "administration" || canOpenAdministration(workspace),
  );
  const [chosenWorkspace, setWorkspaceId] = useState(
    session.workspaces.find((workspace) => workspace.current)?.id ??
      session.workspaces[0]?.id ??
      "",
  );
  const workspaceId = eligible.some((item) => item.id === chosenWorkspace)
    ? chosenWorkspace
    : (eligible[0]?.id ?? "");
  const [name, setName] = useState("");
  const [entry, setEntry] = useState<"create" | "join">("create");
  const [invitation, setInvitation] = useState("");
  const action = useAction(sessionAuthorityKey(session));
  async function enter(event: FormEvent) {
    event.preventDefault();
    await action.run(async (view) => {
      if (!workspaceId && entry === "join") {
        const invitationPath = workspaceInvitationPath(
          invitation,
          window.location.origin,
        );
        if (!invitationPath)
          throw new Error(
            msg("Paste the complete Guteneo workspace invitation link."),
          );
        window.location.assign(invitationPath);
        return;
      }
      await view.wait(
        personalApi<{
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
        ),
      );
      // The workshop cookie has rotated. Remount Application so its session,
      // tenant and CSRF token all come from the new server session.
      window.history.replaceState(null, "", `/#${destination.path}`);
      window.location.reload();
    });
  }
  const choices = [
    {
      path: "/app/prepare",
      kind: "prepare" as const,
      Icon: PaperPlaneTilt,
      title: msg("Send documents"),
      text: msg(
        "Prepare an email, fax or postal dispatch. Review the content and price before confirming.",
      ),
      action: msg("Prepare a dispatch"),
    },
    {
      path: "/app/secure-distributions/new",
      kind: "share" as const,
      Icon: Files,
      title: msg("Share a sensitive document"),
      text: msg(
        "Grant individual access to a document and follow the available viewing events.",
      ),
      action: msg("New share"),
    },
    {
      path: "/app/administration",
      kind: "administration" as const,
      Icon: SlidersHorizontal,
      title: msg("Manage a workspace"),
      text: msg(
        "Follow activity and consumption, manage members and billing, and download reports.",
      ),
      action: msg("Open Administration"),
    },
  ];
  const chosen = choices.find((choice) => choice.kind === destination.kind);
  return (
    <div className="secure-document-layout">
      <PageHeading title={msg("Use Guteneo")} />
      <p className="secure-document-intro">
        {msg(
          "Your received documents remain accessible without purchasing a service.",
        )}
      </p>
      <form
        className="secure-document-panel secure-document-form"
        aria-busy={action.pending}
        aria-describedby="personal-workspace-destination"
        onSubmit={(event) => void enter(event)}
      >
        <h2 id="personal-workspace-entry" tabIndex={-1}>
          {eligible.length
            ? msg("Choose a workspace")
            : msg("Create or join a workspace")}
        </h2>
        <p id="personal-workspace-destination" className="field-hint">
          {chosen
            ? msg("Next: {0}", chosen.title)
            : msg("Next: your workspace")}
        </p>
        {destination.kind === "administration" &&
          session.workspaces.length > eligible.length && (
            <p className="field-hint" role="note">
              {msg(
                "Only workspaces where your role includes reports are listed. Ask an administrator for this permission.",
              )}
            </p>
          )}
        {eligible.length ? (
          <Field label={msg("Active workspace")}>
            <select
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              {eligible.map((workspace) => (
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
              "You become its administrator. Its sending channels start closed and nothing is charged without your explicit approval.",
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
      {/* The workspace form stays first; these choices only change where it
          opens, and choosing one returns focus to the form. */}
      <div
        className="personal-space-service-grid"
        role="group"
        aria-label={msg("What would you like to do?")}
      >
        {choices.map((choice) => (
          <article
            key={choice.kind}
            className="secure-document-panel"
            data-selected={destination.kind === choice.kind || undefined}
          >
            <choice.Icon size={28} aria-hidden="true" />
            <h2>{choice.title}</h2>
            <p>{choice.text}</p>
            <button
              className="button"
              type="button"
              aria-pressed={destination.kind === choice.kind}
              onClick={() => {
                setDestination({ path: choice.path, kind: choice.kind });
                document.getElementById("personal-workspace-entry")?.focus();
              }}
            >
              {choice.action}
            </button>
          </article>
        ))}
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
  const [sessions, setSessions] = useState<PersonalSessionItem[]>();
  const [sessionsError, setSessionsError] = useState<Error>();
  const [version, setVersion] = useState(0);
  const saveController = useRef<AbortController | null>(null);
  const action = useAction(sessionAuthorityKey(session));
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
    await action.run(async (view) => {
      const controller = new AbortController();
      saveController.current = controller;
      const current = await view.wait(
        personalApi<PersonalSession>("/personal/account", session, {
          method: "PATCH",
          signal: controller.signal,
          body: {
            name: name.trim(),
            preferredLocale: locale || null,
          },
        }),
      );
      if (current.user.id !== session.user.id) return;
      onUpdated(current);
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
                        void action.run(async (view) => {
                          await view.wait(
                            personalApi(
                              `/personal/account/sessions/${encodeURIComponent(item.id)}/revoke`,
                              session,
                              { method: "POST", body: {} },
                            ),
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
