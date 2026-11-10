import {
  APPLICATION_TIME_ZONE,
  useApplicationTimeDeclared,
} from "./application-time";
import { msg } from "./messages";
import { DataTable, tableTimestamp } from "./data-table";
import { canonicalApplicationRoute } from "./app-routes";
import {
  useCallback,
  useEffect,
  useState,
  useId,
  useRef,
  cloneElement,
  lazy,
  Suspense,
  useTransition,
  createContext,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
  type ReactElement,
  type SetStateAction,
} from "react";
import {
  ArrowClockwise,
  WarningCircle,
  FilePdf,
  ArrowRight,
} from "@phosphor-icons/react";
import {
  api,
  ApiError,
  type Channel,
  type Dispatch,
  type Page,
  recipientLabel,
  dispatchPresentationStatus,
  date,
  getDocumentContent,
  isPublicPreview,
  sessionAuthorityKey,
  subscribeSessionAuthority,
} from "./api";
import { useCurrentClientView } from "./client-write-recovery";
import {
  createRouteNavigationEvent,
  clientNavigationRevision,
  subscribeClientNavigation,
} from "./client-navigation";
import {
  createClientActionController,
  ObsoleteClientAction,
  type ClientActionContext,
} from "./client-action";
import {
  cacheableListPath,
  readClientList,
  dataAfterReadFailure,
} from "./client-resources";
import { recordActionOutcome } from "./action-outcomes";
import { t, getLocale } from "./locale";
import { peekLocaleData } from "./locale-data";
import { pdfCheckErrorMessage } from "./pdf-check-errors";
import { workspaceAuthenticationRecoveryHref } from "./auth-navigation";

export { BEFORE_WORKSPACE_NAVIGATION } from "./client-navigation";
export type { ClientActionContext, ClientActionOutcome } from "./client-action";
export const NAVIGATION_PANEL_OPEN = "guteneo:navigation-panel-open";

export function go(path: string) {
  window.location.hash = path;
}
export function LoadMore<T>({
  path,
  data,
  onLoaded,
}: {
  path: string;
  data?: Page<T>;
  onLoaded: (page: Page<T>) => void;
}) {
  const action = useAction(`${path}:${data?.nextCursor ?? ""}`);
  if (!data?.nextCursor) return null;
  return (
    <>
      <button
        type="button"
        className="button subtle small pagination"
        disabled={action.pending}
        onClick={() =>
          void action.run(async (view) => {
            const next = await view.wait(
              api<Page<T>>(
                `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(data.nextCursor ?? "")}`,
              ),
            );
            onLoaded({
              items: [...data.items, ...next.items],
              nextCursor: next.nextCursor,
            });
          })
        }
      >
        {action.pending ? t.loading : t.dispatch.loadMore}
      </button>
      <ErrorNotice error={action.error} />
    </>
  );
}
function readRoute() {
  const route =
    window.location.hash.slice(1) ||
    (window.location.pathname.startsWith("/app") ? "/app" : "/");
  // Earlier Studio links resolve to their Studio address without a request.
  const canonical = canonicalApplicationRoute(route);
  if (canonical !== route) {
    const url = new URL(window.location.href);
    url.hash = canonical;
    window.history.replaceState(window.history.state, "", url);
  }
  return canonical;
}
const WorkspaceRouteContext = createContext<string | null>(null);
export function WorkspaceRouteProvider({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) {
  return (
    <WorkspaceRouteContext.Provider value={route}>
      {children}
    </WorkspaceRouteContext.Provider>
  );
}
export function useRouteState() {
  const [route, setRoute] = useState(readRoute);
  const [pending, startTransition] = useTransition();
  const focusClaim = useRef<
    { route: string; authority: string; cancelled: boolean } | undefined
  >({ route, authority: sessionAuthorityKey(), cancelled: false });
  useEffect(() => {
    const unsubscribeNavigation = subscribeClientNavigation(() => undefined);
    let acceptedHash = window.location.hash;
    let acceptedRoute = readRoute();
    const update = (event?: Event) => {
      const nextRoute = readRoute();
      const fragmentChanged = window.location.hash !== acceptedHash;
      if (nextRoute !== acceptedRoute) {
        // Let the current screen veto navigation before React replaces it.
        // This covers links, programmatic navigation and browser history alike.
        const previous = new URL(window.location.href);
        previous.hash = acceptedHash;
        const navigation = createRouteNavigationEvent({
          fromHref: previous.href,
          toHref: window.location.href,
        });
        if (!window.dispatchEvent(navigation)) {
          const restore = new URL(window.location.href);
          restore.hash = acceptedHash;
          window.history.replaceState(window.history.state, "", restore);
          return;
        }
        focusClaim.current = {
          route: nextRoute,
          authority: sessionAuthorityKey(),
          cancelled: false,
        };
      }
      acceptedHash = window.location.hash;
      acceptedRoute = nextRoute;
      // Guard the earlier history event, then let the native fragment change
      // settle before starting the route transition and its eventual focus.
      if (event?.type === "popstate" && fragmentChanged) return;
      startTransition(() => setRoute(nextRoute));
    };
    const newerInteraction = () => {
      if (focusClaim.current) focusClaim.current.cancelled = true;
    };
    window.addEventListener("hashchange", update);
    // A fragment history entry can emit popstate before hashchange. Run the
    // same synchronous veto before the navigation clock observes that entry.
    window.addEventListener("popstate", update);
    // A delayed route commit must not steal a newer interaction. Safari may
    // open a clicked panel without moving focus, so focus comparison is not enough.
    document.addEventListener("pointerdown", newerInteraction, true);
    document.addEventListener("keydown", newerInteraction, true);
    document.addEventListener("focusin", newerInteraction, true);
    document.addEventListener(NAVIGATION_PANEL_OPEN, newerInteraction);
    // A fragment may change after the first render but before this effect.
    // Catch up after subscribing without changing the initial scroll position.
    setRoute(readRoute());
    return () => {
      unsubscribeNavigation();
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
      document.removeEventListener("pointerdown", newerInteraction, true);
      document.removeEventListener("keydown", newerInteraction, true);
      document.removeEventListener("focusin", newerInteraction, true);
      document.removeEventListener(NAVIGATION_PANEL_OPEN, newerInteraction);
    };
  }, [startTransition]);
  useLayoutEffect(() => {
    const claim = focusClaim.current;
    if (!route.startsWith("/app")) {
      if (claim?.route === route) focusClaim.current = undefined;
      return;
    }
    if (!claim || pending || claim.route !== route) return;
    // Wait for the requested screen to commit before scrolling its content.
    window.scrollTo(0, 0);
    if (claim.cancelled || readRoute() !== route) {
      if (focusClaim.current === claim) focusClaim.current = undefined;
      return;
    }
    const owned = claim;
    let cancelled = false;
    let frame: number | undefined;
    // Let this event's navigation-clock microtasks settle, then cross one
    // render boundary after pending/inert clears. This is one owned attempt.
    queueMicrotask(() => {
      if (cancelled || focusClaim.current !== owned) return;
      const navigation = clientNavigationRevision();
      frame = requestAnimationFrame(() => {
        if (focusClaim.current !== owned) return;
        focusClaim.current = undefined;
        if (
          cancelled ||
          owned.cancelled ||
          owned.authority !== sessionAuthorityKey() ||
          navigation !== clientNavigationRevision() ||
          readRoute() !== route ||
          document.activeElement?.closest('[role="alert"]')
        )
          return;
        const content = document.getElementById("main-content");
        if (
          content?.isConnected &&
          !content.inert &&
          content.getAttribute("aria-busy") !== "true" &&
          !content.contains(document.activeElement)
        )
          content.focus({ preventScroll: true });
      });
    });
    return () => {
      cancelled = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [route, pending]);
  return { route, pending };
}
export function useRoute() {
  const route = useContext(WorkspaceRouteContext);
  if (route === null)
    throw new Error("Workspace routes require WorkspaceRouteProvider.");
  return route;
}
export function useResource<T>(path: string | null) {
  const authority = useSyncExternalStore(
    subscribeSessionAuthority,
    sessionAuthorityKey,
    sessionAuthorityKey,
  );
  const identity = `${authority}:${path ?? ""}`;
  const [scope, setScope] = useState(() => ({ identity }));
  if (scope.identity !== identity) setScope({ identity });
  const committedScope = useRef<typeof scope | undefined>(scope);
  useLayoutEffect(() => {
    committedScope.current = scope;
    return () => {
      if (committedScope.current === scope) committedScope.current = undefined;
    };
  }, [scope]);
  const [state, setState] = useState<{
    identity: string;
    data?: T;
    error?: Error;
    loading: boolean;
    readOwner?: object;
  }>({ identity, loading: Boolean(path) });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback(
    (value: SetStateAction<T | undefined>) => {
      if (
        committedScope.current !== scope ||
        sessionAuthorityKey() !== authority
      )
        return;
      setState((current) => {
        if (
          committedScope.current !== scope ||
          sessionAuthorityKey() !== authority ||
          current.identity !== identity
        )
          return current;
        const next =
          typeof value === "function"
            ? (value as (previous: T | undefined) => T | undefined)(
                current.data,
              )
            : value;
        // A no-op preserves its active read. A real current result takes
        // ownership without side effects inside this replayable updater.
        if (Object.is(next, current.data)) return current;
        return {
          ...current,
          data: next,
          loading: false,
          readOwner: undefined,
        };
      });
    },
    [authority, identity, scope],
  );
  useEffect(() => {
    if (!path) {
      setState({ identity, loading: false });
      return;
    }
    const controller = new AbortController();
    const owned = {};
    const isCurrentRead = () =>
      !controller.signal.aborted &&
      committedScope.current === scope &&
      sessionAuthorityKey() === authority;
    // A refresh retains this resource. Navigation must never show an editable
    // model from the previous path while the new request is pending or fails.
    setState((current) =>
      isCurrentRead()
        ? {
            identity,
            data: current.identity === identity ? current.data : undefined,
            loading: true,
            readOwner: owned,
          }
        : current,
    );
    const read = (signal: AbortSignal) => api<T>(path, { signal });
    const request = cacheableListPath(path)
      ? readClientList<T>(
          `${identity}:${getLocale()}`,
          read,
          controller.signal,
          version > 0,
        )
      : read(controller.signal);
    request
      .then((data) => {
        if (isCurrentRead())
          setState((current) =>
            isCurrentRead() &&
            current.identity === identity &&
            current.readOwner === owned
              ? { identity, data, loading: false, readOwner: owned }
              : current,
          );
      })
      .catch((error: unknown) => {
        // Aborting fetch is not sufficient when parsing or another transport
        // has already completed. Late successes and failures are both stale.
        if (isCurrentRead())
          setState((current) =>
            isCurrentRead() &&
            current.identity === identity &&
            current.readOwner === owned
              ? {
                  ...current,
                  data: dataAfterReadFailure(current.data, error),
                  error: error as Error,
                  loading: false,
                }
              : current,
          );
      });
    return () => controller.abort();
  }, [path, authority, identity, scope, version]);
  // Effects run after render; hide a different path's data immediately.
  const current = state.identity === identity ? state : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: current?.loading ?? Boolean(path),
    refresh,
    setData,
  };
}
/**
 * Re-read a resource when the person comes back to this tab, for example
 * after preparing a send in their assistant. Reads only; never repeats writes.
 * Coming back fires both `visibilitychange` and `focus`: one read covers both.
 * `enabled = false` keeps what the person loaded until an explicit refresh.
 */
export function useRefreshOnFocus(refresh: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      refresh();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh, enabled]);
}
export function useAction(scope = "") {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error>();
  const captureView = useCurrentClientView(scope);
  const controller = useRef<ReturnType<
    typeof createClientActionController
  > | null>(null);
  controller.current ??= createClientActionController();
  // Stable callbacks: effects may depend on them without re-running.
  const run = useCallback(
    async (action: (context: ClientActionContext) => Promise<void>) => {
      if (controller.current!.pending) return;
      const ownsView = captureView();
      const authority = sessionAuthorityKey();
      setPending(true);
      setError(undefined);
      try {
        await controller.current!.run(action, ownsView, (outcome) => {
          if (sessionAuthorityKey() === authority)
            recordActionOutcome(outcome, authority);
        });
      } catch (err) {
        if (ownsView() && !(err instanceof ObsoleteClientAction))
          setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        // A batched A -> B -> A can keep this mounted instance. The busy latch
        // must clear, while old failures and callback effects remain fenced.
        setPending(false);
      }
    },
    [captureView],
  );
  const clear = useCallback(() => setError(undefined), []);
  return { pending, error, run, clear };
}
export function ErrorNotice({
  error,
  retry,
  focusOnError = true,
}: {
  error?: Error;
  retry?: () => void;
  focusOnError?: boolean;
}) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error && focusOnError) notice.current?.focus();
  }, [error, focusOnError]);
  if (!error) return null;
  const authenticationRecovery =
    error instanceof ApiError &&
    [
      "DOCUMENT_AUTHENTICATION_REQUIRED",
      "STRONG_AUTHENTICATION_REQUIRED",
      "STRONG_BROWSER_APPROVAL_REQUIRED",
      "FRESH_AUTHENTICATION_REQUIRED",
      "AUTHENTICATION_FRESHNESS_REQUIRED",
    ].includes(error.code);
  const quoteRecovery =
    error instanceof ApiError &&
    ["QUOTE_STILL_VALID", "SECURE_QUOTE_RENEWAL_UNSAFE"].includes(error.code);
  const title = authenticationRecovery
    ? msg("Verify your sign-in")
    : t.errorTitle;
  const message =
    error instanceof ApiError
      ? (pdfCheckErrorMessage(error.code) ??
        postalErrorMessage(error.code) ??
        emailErrorMessage(error.code) ??
        generalErrorMessage(error.code) ??
        reviewedServerErrorMessage(error.message))
      : msg(error.message);
  return (
    <div className="notice error" role="alert" tabIndex={-1} ref={notice}>
      <WarningCircle size={22} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {message && message !== title && <p>{message}</p>}
        {error instanceof ApiError &&
          !authenticationRecovery &&
          !quoteRecovery && (
            // The code helps support; it stays out of the sentence a person reads.
            <details className="error-details">
              <summary>{msg("Details")}</summary>
              <small className="mono">{error.code}</small>
            </details>
          )}
        {authenticationRecovery && (
          <a
            className="button primary"
            href={workspaceAuthenticationRecoveryHref(
              !(error instanceof ApiError) ||
                error.code !== "DOCUMENT_AUTHENTICATION_REQUIRED",
            )}
          >
            {t.sessionExpired.action}
          </a>
        )}
        {retry && (
          <button className="text-button" onClick={retry}>
            {t.retry}
          </button>
        )}
      </div>
    </div>
  );
}

/** Never echo an unreviewed server body into a translated interface. */
function reviewedServerErrorMessage(source: string): string | undefined {
  const key = source.trim();
  const catalog = peekLocaleData(getLocale());
  // Identity translations are omitted from the compiled lookup; their reviewed
  // text is still present in its string table (notably English source messages).
  return catalog &&
    (Object.hasOwn(catalog.messages, key) || catalog.strings.includes(key))
    ? msg(source)
    : undefined;
}

/** Fixed copy only: provider response bodies can contain private identities. */
function postalErrorMessage(code?: string): string | undefined {
  const messages: Record<string, string> = {
    POSTAL_COUNTRY_UNSUPPORTED: msg("Choose a supported postal destination."),
    POSTAL_DESTINATION_UNAVAILABLE: msg(
      "Postal delivery to this country is currently unavailable.",
    ),
    POSTAL_DESTINATION_AVAILABILITY_UNAVAILABLE: msg(
      "Current postal destination availability cannot be verified. No letter was sent.",
    ),
    POSTAL_DRAFT_NOT_READY: msg(
      "The letter is still being analysed. Try the quote again shortly.",
    ),
    POSTAL_DRAFT_TRANSFER_DISABLED: msg(
      "Letter preparation is currently unavailable. You can check the status of an existing draft.",
    ),
    POSTAL_DRAFT_RECONCILIATION_REQUIRED: msg(
      "The transfer outcome needs checking. Contact Guteneo before creating another draft.",
    ),
    POSTAL_DRAFT_ALREADY_USED: msg(
      "This draft is already linked to a delivery. Check its status before continuing.",
    ),
    POSTAL_ADDRESS_MISMATCH: msg(
      "The PDF address does not match the recipient. Check both before continuing.",
    ),
    POSTAL_ADDRESS_PREVIEW_UNAVAILABLE: msg(
      "The address crop is unavailable. Refresh the page to check whether it is ready.",
    ),
    POSTAL_PREFLIGHT_EXPIRED: msg(
      "This check has expired. Have the document checked again before any transfer.",
    ),
    POSTAL_PREFLIGHT_NOT_FOUND: msg(
      "This postal check is not accessible in your workspace.",
    ),
    POSTAL_PREFLIGHT_REQUIRED: msg(
      "The PDF must be checked and reviewed in Guteneo before this step.",
    ),
    POSTAL_PREFLIGHT_STALE: msg(
      "The document or its permissions have changed. Refresh the status before continuing.",
    ),
    POSTAL_PREPARED_DRAFT_REQUIRED: msg(
      "Open the document review to prepare its draft before requesting a quote.",
    ),
    POSTAL_PROFILE_CHANGED: msg(
      "The print settings have changed. A new PDF check is required.",
    ),
    POSTAL_PROFILE_UNQUALIFIED: msg(
      "The print settings cannot be checked right now. Try viewing them again later.",
    ),
    POSTAL_RENDERER_UNAVAILABLE: msg(
      "PDF checking is temporarily unavailable. Your document has not been transferred to the printing provider.",
    ),
    POSTAL_RENDER_FAILED: msg(
      "The PDF check did not complete. Check its status before trying again.",
    ),
    POSTAL_RENDER_TIMEOUT: msg(
      "The PDF check exceeded the time limit. No transfer to the printing provider is authorised.",
    ),
    POSTAL_RENDER_PROOF_INVALID: msg(
      "The PDF check result is incomplete. Transfer remains blocked.",
    ),
  };
  return code ? messages[code] : undefined;
}

export function emailErrorMessage(code?: string): string | undefined {
  if (!code) return undefined;
  const messages: Record<string, string> = {
    INVALID_DOCUMENT_URL_PLACEHOLDER:
      "Use {{document_url}} exactly as the link address in your custom HTML.",
    DOCUMENT_URL_NOT_AVAILABLE:
      "Select a PDF and enable its protected link to use {{document_url}}.",
    EMAIL_ATTACHMENT_TOO_LARGE:
      "This PDF exceeds the 10 MB email limit. Choose a PDF of at most 10 MB.",
    PROTECTED_DOCUMENTS_NOT_CONFIGURED:
      "Protected sharing is temporarily unavailable. Keep this PDF and try again later.",
    PROTECTED_DOCUMENTS_PRODUCTION_REQUIRED:
      "Protected links are available in your real workspace. The demonstration publishes no documents.",
    PROTECTED_DOCUMENT_UNAVAILABLE:
      "This protected share has expired, been revoked or is no longer available. Check its status before preparing a new share.",
    INVALID_PROTECTION_DURATION:
      "Choose 1, 7 or 30 days for the protected link.",
    INVALID_EMAIL_PROVIDER:
      "The email service is misconfigured. Contact the Guteneo team before preparing another dispatch.",
    RESEND_NOT_CONFIGURED:
      "The Guteneo team must still verify the Resend email connection. This dispatch was not submitted.",
    RESEND_TRANSPORT_DISABLED:
      "Resend dispatches are not yet enabled. This dispatch was not submitted.",
    RESEND_SENDER_DOMAIN_MISMATCH:
      "The sender address must use the verified guteneo.com domain. Have it corrected before preparing another dispatch.",
    RESEND_LIMITS_NOT_CONFIGURED:
      "The Guteneo team must still configure Resend sending limits. This dispatch was not submitted.",
    RESEND_ACCOUNT_LIMIT_OR_POLICY:
      "Resend sending capacity has been reached or its authorisation needs checking. This dispatch was not submitted. Contact Guteneo.",
    RESEND_LIMITS_UNAVAILABLE:
      "The email capacity check is temporarily unavailable. This dispatch was not submitted.",
    RESEND_AUTHORIZATION_FAILED:
      "Resend refused access to the sending service. The Guteneo team must check the connection before another attempt.",
    RESEND_DAILY_QUOTA_EXCEEDED:
      "The Resend daily email limit has been reached. This message was refused; it will not be retried automatically.",
    RESEND_MONTHLY_QUOTA_EXCEEDED:
      "The Resend monthly email limit has been reached. This message was refused. Contact the Guteneo team.",
    RESEND_RATE_EXCEEDED:
      "Resend is temporarily limiting sending requests. This message was refused; it will not be retried automatically.",
    RESEND_REQUEST_REJECTED:
      "Resend refused this message. Check its content and addresses before preparing a new version.",
    RESEND_RESPONSE_UNKNOWN:
      "The Resend response does not confirm the outcome. Do not recreate this dispatch: its status must be checked to avoid a duplicate. Its credit remains reserved.",
  };
  return Object.hasOwn(messages, code)
    ? msg(messages[code])
    : sesErrorMessage(code);
}

export function sesErrorMessage(code?: string): string | undefined {
  if (!code) return undefined;
  const messages: Record<string, string> = {
    SES_ACCOUNT_DAILY_LIMIT: msg(
      "Guteneo’s email sending capacity has been reached. This delivery was not submitted. Try again later by preparing a new delivery.",
    ),
    SES_ACCOUNT_RATE_LIMIT: msg(
      "The email service is already processing a delivery or has just processed one. This delivery was not submitted. Wait before preparing a new delivery.",
    ),
    SES_DAILY_QUOTA_EXCEEDED: msg(
      "AWS rejected this delivery because the email quota for the last 24 hours has been reached. No delivery was accepted. Try again later by preparing a new delivery.",
    ),
    SES_RATE_EXCEEDED: msg(
      "AWS rejected this delivery because requests are too close together. No delivery was accepted. Wait before preparing a new delivery.",
    ),
    SES_THROTTLED: msg(
      "AWS is temporarily limiting sending requests. This message was rejected and will not be resent automatically.",
    ),
    SES_IDENTITY_NOT_VERIFIED: msg(
      "AWS rejected this delivery: an address or domain is unverified. During the restricted SES phase, recipients must also be verified. No delivery was accepted.",
    ),
    SES_SENDER_NOT_VERIFIED: msg(
      "The sending domain still needs verification with AWS. No delivery was accepted. The Guteneo team must correct the connection.",
    ),
    SES_MESSAGE_REJECTED: msg(
      "AWS rejected the message. No delivery was accepted. Check its content and addresses before preparing a new version.",
    ),
    SES_REQUEST_REJECTED: msg(
      "AWS rejected the sending request. No delivery was accepted. The content and settings must be checked before preparing a new version.",
    ),
    SES_ACCOUNT_SUSPENDED: msg(
      "AWS has suspended sending for this account. This message was rejected. The Guteneo team must restore the service before any further attempt.",
    ),
    SES_SENDING_PAUSED: msg(
      "Email sending is currently suspended at AWS. This message was rejected and will not be resent automatically.",
    ),
    SES_RESOURCE_LIMIT: msg(
      "AWS rejected this delivery because of a service limit. The Guteneo team must check its configuration before any further attempt.",
    ),
    SES_CONFIGURATION_MISSING: msg(
      "The required sending configuration is unavailable at AWS. This message was rejected. The Guteneo team must correct the connection.",
    ),
    SES_AUTHORIZATION_FAILED: msg(
      "AWS does not authorise this connection to send emails. This message was rejected. The Guteneo team must check the service’s permissions.",
    ),
    SES_LIMITS_NOT_CONFIGURED: msg(
      "The email account limits are not configured yet. This delivery was not submitted.",
    ),
    SES_LIMITS_UNAVAILABLE: msg(
      "The email capacity check is temporarily unavailable. This dispatch was not submitted.",
    ),
    SES_ACTIVE_ATTEMPT_REQUIRED: msg(
      "This attempt can no longer be submitted. Check its status before taking any other action.",
    ),
    SES_NOT_CONFIGURED: msg(
      "The email connection is not ready yet. This delivery was not submitted.",
    ),
    SES_ACCOUNT_REQUIRED: msg(
      "The AWS sending account must be identified before this email can be submitted. The Guteneo team must complete the connection.",
    ),
    SES_IDENTITY_REQUIRED: msg(
      "The email account identity and its tracking still need qualification. This delivery was not submitted.",
    ),
    SES_RECIPIENT_NOT_QUALIFIED: msg(
      "This recipient is not yet authorised for the restricted sending phase. Their address must be verified with AWS and qualified by the Guteneo team. This delivery was not submitted.",
    ),
    SES_MODE_REQUIRED: msg(
      "The AWS account’s sending mode must be qualified before this email can be submitted.",
    ),
    SES_RESPONSE_UNKNOWN: msg(
      "AWS’s response did not confirm the outcome. Do not recreate this delivery: its status must be checked to avoid a duplicate. Its credit remains reserved.",
    ),
    SES_ATTEMPT_ALREADY_RESERVED: msg(
      "This attempt has already been handled. Do not recreate this delivery: check its status to avoid a duplicate.",
    ),
  };
  return Object.hasOwn(messages, code) ? messages[code] : undefined;
}
export function Loading({
  shape = "page",
}: {
  shape?: "page" | "table" | "form" | "document";
}) {
  return (
    <div
      className={`loading loading-shape-${shape}`}
      role="status"
      aria-label={t.loading}
    >
      <div className="loading-skeleton" aria-hidden="true">
        <span className="loading-skeleton-heading" />
        {shape === "table" ? (
          <div className="loading-skeleton-table">
            {[0, 1, 2].map((row) => (
              <div className="loading-skeleton-row" key={row}>
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : shape === "form" ? (
          <>
            {[0, 1, 2].map((field) => (
              <div className="loading-skeleton-field" key={field}>
                <span />
                <span />
              </div>
            ))}
          </>
        ) : shape === "document" ? (
          <div className="loading-skeleton-document" />
        ) : (
          <div className="loading-skeleton-panels">
            <span />
            <span />
          </div>
        )}
      </div>
      <p className="loading-label">{t.loading}</p>
    </div>
  );
}
/** The application frame declares its shared timezone once. */
export function DateTimezone() {
  const declared = useApplicationTimeDeclared();
  if (declared) return null;
  return (
    <p className="timestamp-context" id="application-time-context">
      {msg("Times shown in: {0}", APPLICATION_TIME_ZONE)}
    </p>
  );
}

export function PageHeading({
  title,
  intro,
  action,
}: {
  title: string;
  intro?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {action && <div className="page-heading-actions">{action}</div>}
    </header>
  );
}
export function EmptyState({
  title,
  text,
  action,
  icon,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
  /** Defaults to the PDF glyph; pass the glyph of the page's own object. */
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ?? <FilePdf size={36} weight="light" aria-hidden="true" />}
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** The one disclosure row: label, chevron and a full-width hit area. */
export function Disclosure({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`disclosure ${className}`.trim()}>
      <summary>{label}</summary>
      {children}
    </details>
  );
}
function dispatchStatusText(status: string, channel?: Channel) {
  if (status === "schedule_draft")
    return msg("Waiting for scheduled spending approval");
  if (status === "scheduled") return msg("Scheduled spending approved");
  if (status === "schedule_releasing")
    return msg("Checking release conditions");
  if (status === "schedule_unknown")
    return msg("Unknown outcome, review required");
  let text = t.statuses[status] ?? status;
  if (status === "delivered" && channel === "email")
    text = t.statuses.email_delivered ?? text;
  if (status === "delivered" && channel === "fax")
    text = t.statuses.fax_delivered ?? text;
  return text;
}
export function Status({
  status,
  channel,
}: {
  status: string;
  channel?: Channel;
}) {
  const tone =
    (
      {
        schedule_draft: "draft",
        scheduled: "queued",
        schedule_releasing: "submitting",
        schedule_unknown: "submission_unknown",
      } as Record<string, string>
    )[status] ?? status;
  return (
    <span className={`status status-${tone}`}>
      {dispatchStatusText(status, channel)}
    </span>
  );
}
export function ChannelLabel({ channel }: { channel: Channel }) {
  return (
    <span className="channel-label">{t.channels[channel] ?? channel}</span>
  );
}
export function RefreshButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="button subtle small"
      onClick={onClick}
      disabled={disabled}
    >
      <ArrowClockwise size={16} aria-hidden="true" />
      {t.refresh}
    </button>
  );
}
export function DispatchTable({
  items,
  emptyAction,
  statusFilter = true,
  className,
  timezoneNote = true,
}: {
  items: Dispatch[];
  className?: string;
  /** False when a table above on the same page already states the zone. */
  timezoneNote?: boolean;
  /** False where the page already filters by status group. */
  statusFilter?: boolean;
  /** The next step when the list is empty. */
  emptyAction?: ReactNode;
}) {
  if (!items.length)
    return <EmptyState title={t.dispatch.countEmpty} action={emptyAction} />;
  return (
    <>
      {timezoneNote && <DateTimezone />}
      <DataTable
        viewId="dispatches"
        label={t.nav.dispatches}
        className={className}
        items={items}
        getRowKey={(item) => item.id}
        filters={[
          {
            saveValue: true,
            id: "channel",
            label: t.channel,
            value: (item) => item.channel,
            options: [...new Set(items.map((item) => item.channel))].map(
              (value) => ({ value, label: t.channels[value] ?? value }),
            ),
          },
          ...(statusFilter
            ? [
                {
                  saveValue: true,
                  id: "status",
                  label: t.status,
                  value: dispatchPresentationStatus,
                  options: [
                    ...new Set(items.map(dispatchPresentationStatus)),
                  ].map((value) => ({
                    value,
                    label: dispatchStatusText(value),
                  })),
                },
              ]
            : []),
        ]}
        columns={[
          {
            id: "recipient",
            label: t.recipient,
            value: (item) => recipientLabel(item) || item.id,
            searchValue: (item) => `${recipientLabel(item)} ${item.id}`,
            render: (item) => (
              <a className="row-link" href={`#/app/dispatch/${item.id}`}>
                {recipientLabel(item) || item.id}
              </a>
            ),
          },
          {
            id: "channel",
            label: t.channel,
            value: (item) => t.channels[item.channel] ?? item.channel,
            render: (item) => <ChannelLabel channel={item.channel} />,
          },
          {
            id: "status",
            label: t.status,
            value: (item) =>
              dispatchStatusText(
                dispatchPresentationStatus(item),
                item.channel,
              ),
            searchValue: (item) =>
              `${dispatchStatusText(dispatchPresentationStatus(item), item.channel)} ${item.mode === "simulation" ? t.simulation : ""}`,
            render: (item) => (
              <>
                <Status
                  status={dispatchPresentationStatus(item)}
                  channel={item.channel}
                />
                {item.mode === "simulation" && (
                  <small className="sub-label">{t.simulation}</small>
                )}
              </>
            ),
          },
          {
            id: "created",
            label: t.created,
            value: (item) => tableTimestamp(item.created_at),
            searchValue: (item) => date(item.created_at),
            className: "date-cell",
            render: (item) => date(item.created_at),
          },
          {
            id: "actions",
            label: t.open,
            value: () => "",
            sortable: false,
            render: (item) => (
              <a
                className="icon-link"
                href={`#/app/dispatch/${item.id}`}
                aria-label={`${t.open} ${item.id}`}
              >
                <ArrowRight size={20} aria-hidden="true" />
              </a>
            ),
          },
        ]}
      />
    </>
  );
}
const LazyPdfViewer = lazy(() => import("./pdf-viewer"));
const LazyPdfThumbnail = lazy(() => import("./pdf-thumbnail"));

/** First page of a ready PDF, read and drawn only once its row is on screen. */
export function DocumentThumbnail({
  id,
  ready,
}: {
  id: string;
  ready: boolean;
}) {
  const frame = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ready || seen || !frame.current) return;
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [ready, seen]);
  return (
    <span className="document-thumbnail" ref={frame} aria-hidden="true">
      <FilePdf size={20} weight="light" />
      {seen && (
        <Suspense fallback={null}>
          <LazyPdfThumbnail id={id} />
        </Suspense>
      )}
    </span>
  );
}

export function PdfPreview({
  id,
  title = t.preview,
  dispatchId,
  stableViewport = false,
}: {
  id: string;
  title?: string;
  dispatchId?: string;
  stableViewport?: boolean;
}) {
  const download = useAction();
  async function downloadSample() {
    await download.run(async (view) => {
      const bytes = await view.wait(
        getDocumentContent(id, undefined, dispatchId),
      );
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "guteneo-demonstration.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    });
  }
  const viewer = (
    <Suspense fallback={<Loading shape="document" />}>
      <LazyPdfViewer id={id} dispatchId={dispatchId} />
    </Suspense>
  );
  return (
    <div className="pdf-preview">
      <div className="preview-label">
        <FilePdf size={18} aria-hidden="true" />
        <span>{title}</span>
        {isPublicPreview ? (
          <button
            className="pdf-download"
            onClick={() => void downloadSample()}
            disabled={download.pending}
          >
            {msg("Download the example PDF ")}
            <ArrowRight size={15} />
          </button>
        ) : (
          <a
            href={`/api/documents/${encodeURIComponent(id)}/content${dispatchId ? `?dispatchId=${encodeURIComponent(dispatchId)}` : ""}`}
            target="_blank"
            rel="noreferrer"
          >
            {t.download}
            <ArrowRight size={15} />
          </a>
        )}
      </div>
      {stableViewport ? (
        <div
          className="pdf-preview-viewport"
          role="region"
          aria-label={title}
          tabIndex={0}
        >
          {viewer}
        </div>
      ) : (
        viewer
      )}
      <ErrorNotice error={download.error} />
      <p className="field-hint">
        {isPublicPreview
          ? msg("Fictional document provided to explore the demo.")
          : t.documents.pdfFallback}
      </p>
    </div>
  );
}
export function EmailPreview({ html }: { html: string }) {
  const content = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.6 Georgia,serif;color:#181b22;margin:0;padding:24px;overflow-wrap:anywhere}body:has(>table[role="presentation"]){padding:0}img{max-width:100%}</style></head><body>${html}</body></html>`;
  return (
    <iframe
      className="email-preview"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={content}
      title={t.dispatch.htmlPreview}
    />
  );
}
/**
 * Two-step inline confirmation for consequential actions (cancel, pause,
 * revoke). No modal: the question and both choices stay in the page flow,
 * focus moves to the confirmation and Escape returns to the trigger.
 */
export function ConfirmAction({
  label,
  question,
  confirmLabel,
  onConfirm,
  disabled,
  className = "button small",
  ariaLabel,
  dismissLabel = t.confirmDismiss,
}: {
  label: ReactNode;
  question: string;
  confirmLabel: string;
  dismissLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const questionId = useId();
  const returnFocus = useRef(false);
  useEffect(() => {
    if (asking) confirmButton.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [asking]);
  const close = () => {
    returnFocus.current = true;
    setAsking(false);
  };
  if (!asking)
    return (
      <button
        ref={trigger}
        type="button"
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  return (
    <span
      className="confirm-action"
      role="group"
      aria-labelledby={questionId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <span id={questionId} className="confirm-action-question">
        {question}
      </span>
      <button
        ref={confirmButton}
        type="button"
        className="button small danger"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="button small subtle" onClick={close}>
        {dismissLabel}
      </button>
    </span>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        "aria-describedby":
          [children.props["aria-describedby"], hint ? `${id}-help` : undefined]
            .filter(Boolean)
            .join(" ") || undefined,
      })}
      {hint && <small id={`${id}-help`}>{hint}</small>}
    </div>
  );
}
export function Definition({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="definition">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function generalErrorMessage(code: string): string | undefined {
  const labels: Record<string, string> = {
    INVALID_INPUT: msg("Check the form fields."),
    AUTH_REJECTED: msg(
      "Your session has expired. Sign in again before continuing.",
    ),
    UNAUTHORIZED: msg(
      "Your session has expired. Sign in again before continuing.",
    ),
    FORBIDDEN: msg("This action is not permitted for your account."),
    CSRF_REJECTED: msg(
      "Your session has changed. Reload the page before trying again.",
    ),
    STRONG_AUTHENTICATION_REQUIRED: msg(
      "Sign in again using the required security method to access your documents.",
    ),
    DOCUMENT_AUTHENTICATION_REQUIRED: msg(
      "Sign in again to your verified account to access your documents.",
    ),
    STRONG_BROWSER_APPROVAL_REQUIRED: msg(
      "Sign in again to verify your access. You will return to this page.",
    ),
    FRESH_AUTHENTICATION_REQUIRED: msg(
      "Sign in again to verify your access. You will return to this page.",
    ),
    AUTHENTICATION_FRESHNESS_REQUIRED: msg(
      "Sign in again to verify your access. You will return to this page.",
    ),
    SECURE_DISTRIBUTION_NOT_CONFIGURED: msg(
      "Secure distribution is not enabled.",
    ),
    QUOTE_STILL_VALID: msg(
      "This quote is still valid. Review the document and price before approving.",
    ),
    SECURE_QUOTE_RENEWAL_UNSAFE: msg(
      "This share has changed or submission has started. Refresh its status before continuing.",
    ),
    SECURE_STORAGE_NOT_CONFIGURED: msg(
      "The document is temporarily unavailable.",
    ),
    SECURE_STORAGE_INTEGRITY: msg("The document is temporarily unavailable."),
    ORIGINAL_DOWNLOAD_FORBIDDEN: msg(
      "Downloading the original PDF is not allowed.",
    ),
    PERSONAL_COPY_FORBIDDEN: msg(
      "The workspace has not allowed a personal copy.",
    ),
    PERSONAL_COPY_UNAVAILABLE: msg("The copy is no longer available."),
    SECURE_DISTRIBUTION_LIMIT: msg(
      "The daily preparation limit was reached or your permissions have changed.",
    ),
    SECURE_SOURCE_LEGACY_LINK: msg(
      "Revoke the existing protected link before preparing a secure distribution of this document.",
    ),
    SECURE_SOURCE_LEGACY_DERIVATION: msg(
      "This document has been used to prepare postal mail. Choose a separate document for secure distribution.",
    ),
    SECURE_SOURCE_LEGACY_OUTBOUND: msg(
      "This document is already used in another sending workflow. Choose a separate document for secure distribution.",
    ),
    SENSITIVE_SOURCE_LEGACY_FORBIDDEN: msg(
      "This sensitive document cannot be used in this workflow.",
    ),
  };
  return labels[code] ? msg(labels[code]) : undefined;
}

/** Read-only rendering of an operator diagnostic payload. */
export function Diagnostics({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="muted">{t.unknown}</span>;
  if (typeof value !== "object")
    return (
      <span>
        {typeof value === "boolean" ? (value ? t.yes : t.no) : String(value)}
      </span>
    );
  if (Array.isArray(value))
    return (
      <ul className="diagnostic-list">
        {value.map((item, i) => (
          <li key={i}>
            <Diagnostics value={item} />
          </li>
        ))}
      </ul>
    );
  return (
    <dl className="diagnostics">
      {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
        <div key={key}>
          <dt>{key.replaceAll("_", " ")}</dt>
          <dd>
            <Diagnostics value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
