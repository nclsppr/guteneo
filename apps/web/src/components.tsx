import { msg } from "./messages";
import {
  useCallback,
  useEffect,
  useState,
  useId,
  useRef,
  cloneElement,
  lazy,
  Suspense,
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
  date,
  getDocumentContent,
  isPublicPreview,
} from "./api";
import { t } from "./locale";
import { pdfCheckErrorMessage } from "./pdf-check-errors";
import { useDashboardAppearance } from "./dashboard-appearance";

export const BEFORE_WORKSPACE_NAVIGATION =
  "guteneo:before-workspace-navigation";

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
  const action = useAction();
  if (!data?.nextCursor) return null;
  return (
    <>
      <button
        type="button"
        className="button subtle small pagination"
        disabled={action.pending}
        onClick={() =>
          void action.run(async () => {
            const next = await api<Page<T>>(
              `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(data.nextCursor ?? "")}`,
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
  return (
    window.location.hash.slice(1) ||
    (window.location.pathname.startsWith("/app") ? "/app" : "/")
  );
}
export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    let acceptedHash = window.location.hash;
    let acceptedRoute = readRoute();
    const update = () => {
      const nextRoute = readRoute();
      if (nextRoute !== acceptedRoute) {
        // Let the current screen veto navigation before React replaces it.
        // This covers links, programmatic navigation and browser history alike.
        const navigation = new Event(BEFORE_WORKSPACE_NAVIGATION, {
          cancelable: true,
        });
        if (!window.dispatchEvent(navigation)) {
          const restore = new URL(window.location.href);
          restore.hash = acceptedHash;
          window.history.replaceState(window.history.state, "", restore);
          return;
        }
      }
      acceptedHash = window.location.hash;
      acceptedRoute = nextRoute;
      setRoute(nextRoute);
      // Public document fragments already scroll natively. Only workspace
      // navigation replaces the page and needs its scroll position reset.
      if (nextRoute.startsWith("/app")) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    // A fragment may change after the first render but before this effect.
    // Catch up after subscribing without changing the initial scroll position.
    setRoute(readRoute());
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (!route.startsWith("/app")) return;
    // Route changes replace the content without a browser navigation. Keep
    // keyboard and screen-reader users at the newly opened workspace page.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement?.closest('[role="alert"]')) return;
      const content = document.getElementById("main-content");
      // A fast interaction can focus the new page before this frame runs.
      // Preserve it instead of interrupting typing, especially on WebKit.
      if (!content?.contains(document.activeElement))
        content?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [route]);
  return route;
}
export function useResource<T>(path: string | null) {
  const [state, setState] = useState<{
    path: string | null;
    data?: T;
    error?: Error;
    loading: boolean;
  }>({ path, loading: Boolean(path) });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback(
    (value: SetStateAction<T | undefined>) => {
      setState((current) =>
        current.path === path
          ? {
              ...current,
              data:
                typeof value === "function"
                  ? (value as (previous: T | undefined) => T | undefined)(
                      current.data,
                    )
                  : value,
            }
          : current,
      );
    },
    [path],
  );
  useEffect(() => {
    if (!path) {
      setState({ path, loading: false });
      return;
    }
    const controller = new AbortController();
    // A refresh retains this resource. Navigation must never show an editable
    // model from the previous path while the new request is pending or fails.
    setState((current) => ({
      path,
      data: current.path === path ? current.data : undefined,
      loading: true,
    }));
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ path, data, loading: false });
      })
      .catch((error: unknown) => {
        // Aborting fetch is not sufficient when parsing or another transport
        // has already completed. Late successes and failures are both stale.
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            error: error as Error,
            loading: false,
          }));
      });
    return () => controller.abort();
  }, [path, version]);
  // Effects run after render; hide a different path's data immediately.
  const current = state.path === path ? state : undefined;
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
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error>();
  // Stable callbacks: effects may depend on them without re-running.
  const run = useCallback(async (action: () => Promise<void>) => {
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setPending(false);
    }
  }, []);
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
  return (
    <div className="notice error" role="alert" tabIndex={-1} ref={notice}>
      <WarningCircle size={22} aria-hidden="true" />
      <div>
        <strong>{t.errorTitle}</strong>
        <p>
          {error instanceof ApiError
            ? (pdfCheckErrorMessage(error.code) ??
              postalErrorMessage(error.code) ??
              emailErrorMessage(error.code) ??
              generalErrorMessage(error.code) ??
              msg(error.message))
            : msg(error.message)}
        </p>
        {error instanceof ApiError && (
          <small className="mono">{error.code}</small>
        )}
        {error instanceof ApiError &&
          [
            "DOCUMENT_AUTHENTICATION_REQUIRED",
            "STRONG_AUTHENTICATION_REQUIRED",
            "STRONG_BROWSER_APPROVAL_REQUIRED",
            "FRESH_AUTHENTICATION_REQUIRED",
            "AUTHENTICATION_FRESHNESS_REQUIRED",
          ].includes(error.code) && (
            <a
              className="button primary"
              href="/auth/login?fresh=1&returnTo=%2F%23%2Fapp%2Fsecure-distributions"
            >
              {msg("Verify my access")}
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

/** Fixed copy only: provider response bodies can contain private identities. */
function postalErrorMessage(code?: string): string | undefined {
  const messages: Record<string, string> = {
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
export function Loading() {
  return (
    <div className="loading" role="status" aria-label={t.loading}>
      <span />
      <span />
      <span />
      <p>{t.loading}</p>
    </div>
  );
}
/** Local timestamps use the browser timezone; keep its context beside dates. */
export function DateTimezone() {
  const { appearance } = useDashboardAppearance();
  if (appearance !== "v2") return null;
  return (
    <p className="timestamp-context">
      {msg(
        "Times shown in: {0}",
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      )}
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
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FilePdf size={36} weight="light" aria-hidden="true" />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function Status({
  status,
  channel,
}: {
  status: string;
  channel?: Channel;
}) {
  let text = t.statuses[status] ?? status;
  if (status === "delivered" && channel === "email")
    text = t.statuses.email_delivered ?? text;
  if (status === "delivered" && channel === "fax")
    text = t.statuses.fax_delivered ?? text;
  return <span className={`status status-${status}`}>{text}</span>;
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
  canPrepare = true,
}: {
  items: Dispatch[];
  canPrepare?: boolean;
}) {
  const { appearance } = useDashboardAppearance();
  if (!items.length)
    return (
      <EmptyState
        title={t.dispatch.countEmpty}
        action={
          canPrepare &&
          appearance !== "v2" && (
            <a className="button primary" href="#/app/prepare">
              {t.dispatch.new}
              <ArrowRight size={17} />
            </a>
          )
        }
      />
    );
  return (
    <>
      <DateTimezone />
      <div className="table-scroll">
        <table className="responsive-table" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">
                {t.recipient}
              </th>
              <th role="columnheader" scope="col">
                {t.channel}
              </th>
              <th role="columnheader" scope="col">
                {t.status}
              </th>
              <th role="columnheader" scope="col">
                {t.created}
              </th>
              <th role="columnheader" scope="col">
                <span className="sr-only">{t.open}</span>
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {items.map((d) => (
              <tr role="row" key={d.id}>
                <td role="cell">
                  <span className="mobile-cell-label" aria-hidden="true">
                    {t.recipient}
                  </span>
                  <a className="row-link" href={`#/app/dispatch/${d.id}`}>
                    {recipientLabel(d) || d.id}
                    <span className="reference mono">{d.id}</span>
                  </a>
                </td>
                <td role="cell">
                  <span className="mobile-cell-label" aria-hidden="true">
                    {t.channel}
                  </span>
                  <ChannelLabel channel={d.channel} />
                </td>
                <td role="cell">
                  <span className="mobile-cell-label" aria-hidden="true">
                    {t.status}
                  </span>
                  <Status status={d.status} channel={d.channel} />
                  {d.mode === "simulation" && (
                    <small className="sub-label">{t.simulation}</small>
                  )}
                </td>
                <td role="cell" className="date-cell">
                  <span className="mobile-cell-label" aria-hidden="true">
                    {t.created}
                  </span>
                  {date(d.created_at)}
                </td>
                <td role="cell">
                  <span className="mobile-cell-label" aria-hidden="true">
                    {t.open}
                  </span>
                  <a
                    className="icon-link"
                    href={`#/app/dispatch/${d.id}`}
                    aria-label={`${t.open} ${d.id}`}
                  >
                    <ArrowRight size={20} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
const LazyPdfViewer = lazy(() => import("./pdf-viewer"));

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
    await download.run(async () => {
      const bytes = await getDocumentContent(id, undefined, dispatchId);
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
    <Suspense fallback={<Loading />}>
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
  const content = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.6 Georgia,serif;color:#181b22;padding:24px;overflow-wrap:anywhere}img{max-width:100%}</style></head><body>${html}</body></html>`;
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
    SECURE_DISTRIBUTION_NOT_CONFIGURED: msg(
      "Secure distribution is not enabled.",
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
