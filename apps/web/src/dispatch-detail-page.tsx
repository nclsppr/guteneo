import { msg } from "./messages";
import { scheduleSourceSupported } from "./schedule-eligibility";
import { useCurrentClientView } from "./client-write-recovery";
import { useAdaptiveReadPolling } from "./client-polling";
import { RolePermissionNotice } from "./role-guide";
import { formatLocale } from "./locale";
import { FAX_OPERATOR_TEST_NOTICE } from "../../../packages/contracts/src/fax-pricing";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ArrowLeft,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  api,
  isPublicPreview,
  dispatchPresentationStatus,
  ApiError,
  date,
  money,
  nanoMoney,
  quotedMoney,
  recipientOf,
  recipientDisplayLines,
  type Channel,
  type Dispatch,
  type DispatchDetail,
} from "./api";
import {
  ProtectedDocumentSummary,
  protectedDelivery,
} from "./protected-document";
import { t } from "./locale";
import { PostalCutoffNotice } from "./postal-cutoff-notice";
import {
  ChannelLabel,
  ConfirmAction,
  DateTimezone,
  Definition,
  EmailPreview,
  ErrorNotice,
  go,
  Loading,
  PageHeading,
  PdfPreview,
  RefreshButton,
  Status,
  emailErrorMessage,
  useAction,
  useResource,
} from "./components";

export function DispatchDetailPage({
  id,
  identity,
  simulation,
  canApprove = true,
  canPrepare = true,
}: {
  id: string;
  identity: string;
  simulation: boolean;
  canApprove?: boolean;
  canPrepare?: boolean;
}) {
  const resource = useResource<DispatchDetail>(
    `/dispatches/${encodeURIComponent(id)}`,
  );
  const action = useAction();
  const [consent, setConsent] = useState(false);
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [decisionMoved, setDecisionMoved] = useState(false);
  const decisionPointer = useRef<
    { element: Element; top: number; left: number } | undefined
  >(undefined);
  const [recipientRequested, setRecipientRequested] = useState(false);
  const d =
    resource.data?.dispatch.id === id ? resource.data.dispatch : undefined;
  const [quoteClock, setQuoteClock] = useState(Date.now);
  const [invalidQuoteId, setInvalidQuoteId] = useState<string>();
  const [postalReadRequired, setPostalReadRequired] = useState(false);
  const postalSending = useRef(false);
  const postalViewRevision = useRef(0);
  const clearAction = action.clear;
  const fingerprint = d?.fingerprint;
  const currentView = useCurrentClientView(
    JSON.stringify([identity, id, fingerprint]),
  );
  useEffect(() => {
    setConsent(false);
    setReferenceCopied(false);
    setDecisionMoved(false);
    decisionPointer.current = undefined;
    setRecipientRequested(false);
    setInvalidQuoteId(undefined);
    setPostalReadRequired(false);
    postalViewRevision.current += 1;
    clearAction();
    return () => {
      postalViewRevision.current += 1;
    };
  }, [id, fingerprint, clearAction]);
  useEffect(() => {
    const expiry = d?.quote_expires_at ? Date.parse(d.quote_expires_at) : NaN;
    if (
      (d?.channel !== "fax" && d?.channel !== "postal") ||
      d.status !== "prepared" ||
      !Number.isFinite(expiry) ||
      expiry <= Date.now()
    )
      return;
    const remaining = expiry - Date.now();
    const timeout = window.setTimeout(
      () => {
        setQuoteClock(Date.now());
        if (Date.now() >= expiry) setConsent(false);
      },
      (remaining > 60000 ? remaining - 60000 : remaining) + 25,
    );
    const wake = () => setQuoteClock(Date.now());
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [d?.quote_expires_at, d?.channel, d?.status, quoteClock]);
  useEffect(() => {
    const expiresAt = resource.data?.approval?.expires_at;
    if (!expiresAt) return;
    const delay = Math.max(0, Date.parse(expiresAt) - Date.now()) + 100;
    const timeout = window.setTimeout(resource.refresh, delay);
    return () => window.clearTimeout(timeout);
  }, [resource.data?.approval?.expires_at, resource.refresh]);
  const dispatchStatus = d?.status;
  const settlementStatus = d?.faxPricing?.settlement.status;
  useAdaptiveReadPolling(resource.refresh, {
    enabled:
      !!dispatchStatus &&
      (["accepted", "queued", "submitting", "submitted", "sending"].includes(
        dispatchStatus,
      ) ||
        settlementStatus === "reserved"),
    scope: `${identity}:${id}`,
    intervalMs: ["delivered", "failed", "cancelled"].includes(
      dispatchStatus ?? "",
    )
      ? 15_000
      : 3_000,
    loading: resource.loading,
    progress: `${dispatchStatus}:${settlementStatus}:${d?.updated_at}`,
  });
  if (!d && !resource.error) return <Loading />;
  if (!d)
    return <ErrorNotice error={resource.error} retry={resource.refresh} />;
  const target = recipientOf(d);
  let postalOptions: Record<string, unknown> | undefined;
  if (d.channel === "postal") {
    try {
      const options =
        typeof d.options_json === "string"
          ? (JSON.parse(d.options_json) as unknown)
          : d.options_json;
      if (options && typeof options === "object" && !Array.isArray(options))
        postalOptions = options as Record<string, unknown>;
    } catch {
      // Historical or incomplete records must not imply printing defaults.
    }
  }
  const postalOptionSummary = [
    postalOptions?.printMode === "duplex"
      ? msg("Double-sided")
      : postalOptions?.printMode === "simplex"
        ? msg("Single-sided")
        : undefined,
    postalOptions?.printSpectrum === "color"
      ? msg("Colour")
      : postalOptions?.printSpectrum === "grayscale"
        ? msg("Black and white")
        : undefined,
    postalOptions?.deliveryProduct === "fast"
      ? msg("Priority delivery")
      : postalOptions?.deliveryProduct === "cheap"
        ? msg("Economy delivery")
        : undefined,
    postalOptions?.addressPosition === "right"
      ? msg("Window on the right")
      : postalOptions?.addressPosition === "left"
        ? msg("Window on the left")
        : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const faxPricing =
    d.channel === "fax" &&
    d.mode === "production" &&
    d.faxPricing?.version === 3
      ? d.faxPricing
      : null;
  const reviewPreparationOnly =
    faxPricing?.executionScope === "review_prepare_only";
  const activeSchedule = resource.data?.activeSchedule;
  const pendingApproval =
    !activeSchedule &&
    !reviewPreparationOnly &&
    ["prepared", "draft"].includes(d.status);
  const quoteExpired =
    (d.channel === "fax" || d.channel === "postal") &&
    d.mode === "production" &&
    !!d.quote_expires_at &&
    Date.parse(d.quote_expires_at) <= Date.now();
  const quoteBlocked =
    (pendingApproval || reviewPreparationOnly) &&
    (quoteExpired || invalidQuoteId === d.id);
  const renewalAllowed =
    quoteBlocked &&
    d.channel === "fax" &&
    d.status === "prepared" &&
    resource.data?.attempts.length === 0;
  const expiringSoon =
    pendingApproval &&
    (d.channel === "fax" || d.channel === "postal") &&
    d.mode === "production" &&
    !quoteBlocked &&
    !!d.quote_expires_at &&
    Date.parse(d.quote_expires_at) - Date.now() <= 60000;
  const emailAttestationRequired =
    d.channel === "email" && d.mode === "production";
  const approved =
    pendingApproval &&
    !quoteBlocked &&
    resource.data?.approval?.approval_kind !== "expert" &&
    resource.data?.approval?.fingerprint === d.fingerprint &&
    Date.parse(resource.data.approval.expires_at) > Date.now();
  const uncertain = ["submission_unknown", "reconciliation_required"].includes(
    d.status,
  );
  // The server only honours a cancellation before provider submission.
  const cancelAllowed =
    !activeSchedule && ["prepared", "queued"].includes(d.status);
  const postalPriceUnavailable =
    d.channel === "postal" &&
    d.mode === "production" &&
    (d.currency !== "EUR" ||
      !Number.isSafeInteger(d.quote_customer_nanoeur) ||
      (d.quote_customer_nanoeur ?? -1) < 0 ||
      !Number.isFinite(Date.parse(d.quote_expires_at ?? "")));
  const postalSendLabel = `${d.mode === "simulation" ? msg("Simulate sending for") : msg("Send for")} ${quotedMoney(d)}${d.quote_pricing_basis === "public_list_price_ex_tax" ? msg(" excl. tax") : ""}`;
  async function readPostalOutcome(revision: number) {
    const isCurrent = currentView();
    const current = await api<DispatchDetail>(
      `/dispatches/${encodeURIComponent(id)}`,
    );
    if (!isCurrent() || postalViewRevision.current !== revision) return;
    if (current?.dispatch?.id !== id)
      throw new Error(
        msg(
          "Tracking for this letter is unavailable. Refresh it before continuing.",
        ),
      );
    resource.setData(current);
    setPostalReadRequired(false);
    return current;
  }
  async function sendPostal() {
    if (
      postalSending.current ||
      !d ||
      d.channel !== "postal" ||
      !pendingApproval ||
      postalPriceUnavailable ||
      quoteBlocked ||
      postalReadRequired ||
      resource.loading ||
      (d.mode === "production" &&
        Date.parse(d.quote_expires_at ?? "") <= Date.now())
    )
      return;
    postalSending.current = true;
    const isCurrent = currentView();
    const revision = postalViewRevision.current;
    await action.run(async (view) => {
      try {
        if (!approved)
          await view.wait(
            api(`/dispatches/${encodeURIComponent(id)}/approve`, {
              method: "POST",
              body: { fingerprint: d.fingerprint },
            }),
          );
        if (!isCurrent() || postalViewRevision.current !== revision) {
          setPostalReadRequired(true);
          return;
        }
        // The same human click approves this immutable version and requests
        // acceptance. This stable key also protects an explicit later retry.
        await view.wait(
          api(`/dispatches/${encodeURIComponent(id)}/confirm`, {
            method: "POST",
            key: `web-confirm:${id}`,
            body: {},
          }),
        );
        if (!isCurrent() || postalViewRevision.current !== revision) {
          setPostalReadRequired(true);
          return;
        }
        setPostalReadRequired(true);
        await view.wait(readPostalOutcome(revision));
      } catch (error) {
        if (!isCurrent() || postalViewRevision.current !== revision) {
          setPostalReadRequired(true);
          return;
        }
        if (error instanceof ApiError && error.code === "LIVE_QUOTE_INVALID")
          setInvalidQuoteId(id);
        // A lost response can follow committed acceptance. Only read status;
        // never automatically repeat approval or submission after uncertainty.
        setPostalReadRequired(true);
        try {
          const current = await view.wait(readPostalOutcome(revision));
          if (
            current &&
            !["prepared", "draft"].includes(current.dispatch.status)
          )
            return;
        } catch {
          view.checkpoint();
          // Keep sending blocked until the user can read the current state.
        }
        throw error;
      } finally {
        postalSending.current = false;
      }
    });
  }
  async function checkPostalOutcome() {
    const revision = postalViewRevision.current;
    await action.run(async (view) => {
      await view.wait(readPostalOutcome(revision));
    });
  }
  async function approve() {
    const isCurrent = currentView();
    await action.run(async (view) => {
      try {
        await view.wait(
          api(`/dispatches/${encodeURIComponent(id)}/approve`, {
            method: "POST",
            body: {
              fingerprint: d?.fingerprint,
              ...(emailAttestationRequired ? { recipientRequested } : {}),
            },
          }),
          () => ({
            kind: "dispatch_approved",
            resourceId: id,
            route: `/app/dispatch/${encodeURIComponent(id)}`,
          }),
        );
        if (!isCurrent()) return;
        if (d?.channel === "email") {
          try {
            await view.wait(
              api(`/dispatches/${encodeURIComponent(id)}/confirm`, {
                method: "POST",
                key: `web-confirm:${id}`,
                body: {},
              }),
            );
          } finally {
            // If acceptance is interrupted, read the same dispatch and expose
            // its approved state for an idempotent retry; never prepare again.
            if (isCurrent()) resource.refresh();
          }
        } else resource.refresh();
      } catch (error) {
        view.checkpoint();
        if (!isCurrent()) return;
        if (error instanceof ApiError && error.code === "LIVE_QUOTE_INVALID") {
          setInvalidQuoteId(id);
          setConsent(false);
          resource.refresh();
        }
        throw error;
      }
    });
  }
  async function confirm() {
    const isCurrent = currentView();
    await action.run(async (view) => {
      try {
        await view.wait(
          api(`/dispatches/${encodeURIComponent(id)}/confirm`, {
            method: "POST",
            key: `web-confirm:${id}`,
            body: {},
          }),
        );
        if (isCurrent()) resource.refresh();
      } catch (error) {
        view.checkpoint();
        if (!isCurrent()) return;
        if (error instanceof ApiError && error.code === "LIVE_QUOTE_INVALID") {
          setInvalidQuoteId(id);
          setConsent(false);
          resource.refresh();
        }
        throw error;
      }
    });
  }
  async function renewQuote() {
    const isCurrent = currentView();
    await action.run(async (view) => {
      const replacement = await view.wait(
        api<Dispatch>(`/dispatches/${encodeURIComponent(id)}/renew-quote`, {
          method: "POST",
          key: `web-renew:${id}`,
          body: {},
        }),
        (receipt) => ({
          kind: "quote_renewed",
          resourceId: receipt.id,
          route: `/app/dispatch/${encodeURIComponent(receipt.id)}`,
        }),
      );
      if (!isCurrent()) return;
      setConsent(false);
      setRecipientRequested(false);
      go(`/app/dispatch/${encodeURIComponent(replacement.id)}`);
    });
  }
  async function requestApproval() {
    const isCurrent = currentView();
    await action.run(async (view) => {
      await view.wait(
        api(`/dispatches/${encodeURIComponent(id)}/request-approval`, {
          method: "POST",
          body: {},
        }),
      );
      if (isCurrent()) resource.refresh();
    });
  }
  async function cancel() {
    await action.run(async (view) => {
      await view.wait(
        api(`/dispatches/${encodeURIComponent(id)}/cancel`, {
          method: "POST",
          body: {},
        }),
        () => ({
          kind: "dispatch_cancelled",
          resourceId: id,
          route: `/app/dispatch/${encodeURIComponent(id)}`,
        }),
      );
      resource.refresh();
    });
  }
  const events = resource.data?.events ?? [];
  const latestAttempt = resource.data?.attempts.at(-1) as
    | (NonNullable<typeof resource.data>["attempts"][number] & {
        error_code?: string;
      })
    | undefined;
  const providerNotice = [
    "failed",
    "submission_unknown",
    "reconciliation_required",
  ].includes(d.status)
    ? emailErrorMessage(latestAttempt?.error_code)
    : undefined;
  const timeline = (
    <section className="timeline-section">
      <h2>{t.dispatch.timeline}</h2>
      {!events.length ? (
        <p className="muted">{t.dispatch.noEvents}</p>
      ) : (
        <ol className="timeline">
          {events.map((event) => {
            const record = event as typeof event & {
              kind?: string;
              occurred_at?: string;
              received_at?: string;
            };
            const name =
              record.kind ??
              event.type ??
              event.event_type ??
              event.status ??
              t.status;
            return (
              <li key={event.id}>
                <span className="timeline-mark" aria-hidden="true" />
                <div>
                  <strong>
                    {(name === "delivered" && d.channel === "email"
                      ? t.statuses.email_delivered
                      : name === "delivered" && d.channel === "fax"
                        ? t.statuses.fax_delivered
                        : t.statuses[name]) ??
                      sentenceCase(
                        name.replaceAll(".", " · ").replaceAll("_", " "),
                      )}
                  </strong>
                  <time>
                    {date(
                      record.occurred_at ??
                        event.created_at ??
                        record.received_at,
                    )}
                  </time>
                  {event.detail && <p>{event.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <details
        className="technical-details"
        hidden={!resource.data?.attempts.length}
      >
        <summary>{t.dispatch.attempts}</summary>
        {!resource.data?.attempts.length ? (
          <p>{t.dispatch.noAttempts}</p>
        ) : (
          <ul className="attempts">
            {resource.data.attempts.map((attempt) => (
              <li key={attempt.id}>
                <span>
                  {d.channel === "postal"
                    ? msg("Guteneo postal service")
                    : attempt.provider}
                </span>
                <Status status={attempt.status} />
                <time>{date(attempt.created_at)}</time>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
  const approvalPrice = faxPricing
    ? msg("up to {0}", money(faxPricing.ceilingMinor))
    : quotedMoney(d);
  return (
    <>
      <a className="back-link" href="#/app/dispatches">
        <ArrowLeft size={17} />
        {t.nav.dispatches}
      </a>
      <PageHeading
        title={
          pendingApproval || approved
            ? t.dispatch.reviewTitle
            : [t.channels[d.channel], recipientDisplayLines(target)[0]]
                .filter(Boolean)
                .join(" — ")
        }
        intro={
          pendingApproval || approved ? undefined : t.dispatch.deliveryNote
        }
        action={
          <RefreshButton
            onClick={resource.refresh}
            disabled={
              resource.loading || (d.channel === "postal" && action.pending)
            }
          />
        }
      />
      <DispatchSteps
        status={
          approved
            ? "approved"
            : dispatchPresentationStatus({ ...d, activeSchedule })
        }
        channel={d.channel}
      />
      <div className="dispatch-reference">
        <Status
          status={
            approved
              ? "approved"
              : dispatchPresentationStatus({ ...d, activeSchedule })
          }
          channel={d.channel}
        />
        {d.mode === "simulation" && (
          <span className="simulation-stamp">{t.simulation}</span>
        )}
        <button
          type="button"
          className="text-button mono dispatch-copy-reference"
          aria-label={msg("Copy reference {0}", d.id)}
          onClick={() => {
            const isCurrent = currentView();
            void navigator.clipboard
              ?.writeText(d.id)
              .then(() => {
                if (isCurrent()) setReferenceCopied(true);
              })
              .catch(() => {
                // The visible reference remains selectable when clipboard access is unavailable.
              });
          }}
        >
          {d.id}
        </button>
        {referenceCopied && (
          <span className="field-hint" role="status">
            {msg("Reference copied.")}
          </span>
        )}
      </div>
      {canPrepare &&
        !isPublicPreview &&
        !activeSchedule &&
        d.status === "prepared" &&
        scheduleSourceSupported(d) && (
          <p>
            <a
              className="button subtle"
              href={`#/app/schedules/new?dispatch=${encodeURIComponent(d.id)}`}
            >
              {msg("Schedule this dispatch")}
            </a>
          </p>
        )}
      {activeSchedule && (
        <section className="notice info">
          <p>
            {msg(
              "Immediate sending is held by this schedule. Review or cancel the schedule to change future authority.",
            )}
          </p>
          <p>
            {date(activeSchedule.executeAt)} ·{" "}
            {money(activeSchedule.maxTotalMinor)}
          </p>
          <a
            className="button subtle"
            href={`#/app/schedules/${activeSchedule.id}`}
          >
            {msg("Open schedule")}
          </a>
        </section>
      )}
      {d.recipient_feedback && (
        <p className="notice info">
          {msg("Recipient response")}:{" "}
          {msg(
            d.recipient_feedback === "reported"
              ? "Email reported"
              : "Unsubscribed",
          )}
        </p>
      )}
      <p className="field-hint">{t.dispatch.channelNotes[d.channel]}</p>
      <ErrorNotice error={action.error ?? resource.error} />
      {(quoteBlocked || expiringSoon) && (
        <section className="notice warning" role="status" aria-atomic="true">
          <WarningCircle size={25} aria-hidden="true" />
          <div>
            <strong>
              {quoteExpired
                ? msg("This quote has expired.")
                : quoteBlocked
                  ? msg("This quote is no longer valid.")
                  : msg("This quote expires in less than a minute.")}
            </strong>
            <p>
              {quoteBlocked
                ? d.channel === "postal"
                  ? msg(
                      "Prepare a new quote, then check its price before sending. This letter will not be sent using the expired quote.",
                    )
                  : msg(
                      "Prepare a new quote with the same PDF, recipient and cap. You must review and approve this new version before anything is sent.",
                    )
                : msg(
                    "Approve it before the displayed deadline, or renew it after it expires.",
                  )}
            </p>
            {quoteBlocked && d.campaign_id && (
              <p>
                {msg(
                  "This renewal creates an individual quote outside the original campaign. The campaign retains its history; you must approve this new delivery separately.",
                )}
              </p>
            )}
            {canPrepare && renewalAllowed && (
              <button
                className="button primary"
                disabled={action.pending || resource.loading}
                onClick={() => void renewQuote()}
              >
                {action.pending ? msg("Renewing quote…") : msg("Renew quote")}
              </button>
            )}
            {canPrepare && quoteBlocked && d.channel === "postal" && (
              <a
                className="button primary"
                href={`#/app/prepare?channel=postal${d.document_id ? `&document=${encodeURIComponent(d.document_id)}` : ""}`}
              >
                {msg("Prepare a new quote")}
              </a>
            )}
          </div>
        </section>
      )}
      {providerNotice && (
        <div className="notice warning" role="status">
          <WarningCircle size={25} aria-hidden="true" />
          <p>{providerNotice}</p>
        </div>
      )}
      {uncertain && (
        <div className="notice warning">
          <WarningCircle size={25} />
          <p>
            {t.dispatch.uncertain} {t.dispatch.uncertainNext}
          </p>
        </div>
      )}
      {postalReadRequired && (
        <section className="notice warning" role="status">
          <p>
            {msg(
              "The response was interrupted. Check this letter’s tracking before taking further action; it may already have been accepted.",
            )}
          </p>
          <button
            className="button secondary"
            disabled={action.pending}
            onClick={() => void checkPostalOutcome()}
          >
            {action.pending ? msg("Checking status…") : msg("Check status")}
          </button>
        </section>
      )}
      {(!pendingApproval || approved) && timeline}
      <div className="dispatch-detail-layout dispatch-review-regions">
        <section className="dispatch-review-facts">
          <dl className="dispatch-facts">
            <Definition label={t.channel}>
              <ChannelLabel channel={d.channel} />
            </Definition>
            <Definition label={t.dispatch.recipientDetails}>
              <address>
                {recipientDisplayLines(target).map((value, index) => (
                  <span key={index}>{value}</span>
                ))}
              </address>
            </Definition>
            {d.subject && (
              <Definition label={t.dispatch.subject}>{d.subject}</Definition>
            )}
            <Definition label={t.dispatch.sender}>
              {d.sender_address ?? t.unknown}
            </Definition>
            {postalOptionSummary && (
              <Definition label={msg("Letter options")}>
                {postalOptionSummary}
              </Definition>
            )}
            <Definition
              label={
                faxPricing
                  ? msg("Estimated range excl. tax")
                  : d.channel === "postal" &&
                      d.quote_pricing_basis === "public_list_price_ex_tax"
                    ? t.postalSetup.quote
                    : protectedDelivery(d)
                      ? msg("Estimated total, email and hosting")
                      : t.dispatch.estimate
              }
            >
              {faxPricing ? (
                <>
                  {nanoMoney(faxPricing.estimatedLowNanoeur)} {msg(" to")}{" "}
                  {nanoMoney(faxPricing.estimatedHighNanoeur)}
                </>
              ) : (
                quotedMoney(d)
              )}
            </Definition>
            <Definition label={t.dispatch.ceilingLabel}>
              {money(d.ceiling_minor, d.currency)}
            </Definition>
            {faxPricing?.settlement.status === "reserved" && (
              <Definition label={msg("Reserved credit")}>
                {money(faxPricing.ceilingMinor)}
              </Definition>
            )}
            {faxPricing?.settlement.status === "settled" && (
              <>
                <Definition label={msg("Verified usage excl. tax")}>
                  {faxPricing.settlement.customerNanoeur == null
                    ? t.unknown
                    : nanoMoney(faxPricing.settlement.customerNanoeur)}
                </Definition>
                <Definition label={msg("Balance deduction")}>
                  {faxPricing.settlement.chargedMinor == null
                    ? t.unknown
                    : money(faxPricing.settlement.chargedMinor)}
                </Definition>
              </>
            )}
            {d.quote_expires_at && (
              <Definition label={msg("Quote valid until")}>
                {date(d.quote_expires_at)}
              </Definition>
            )}
            <Definition label={t.created}>{date(d.created_at)}</Definition>
          </dl>
          <DateTimezone />
          {pendingApproval &&
            d.channel === "postal" &&
            d.mode === "production" && (
              <PostalCutoffNotice
                country={target.country}
                deliveryProduct={postalOptions?.deliveryProduct}
              />
            )}
          {d.mode === "simulation" && (
            <p className="field-hint">{t.simulationCost}</p>
          )}
          {faxPricing && (
            <div className="notice info" role="status" aria-atomic="true">
              {faxPricing.routeQualification === "operator_authorized_test" && (
                <p>{msg(faxPricing.routeNotice ?? FAX_OPERATOR_TEST_NOTICE)}</p>
              )}
              <p>
                {reviewPreparationOnly
                  ? msg(
                      "This estimate is for viewing only. No delivery or credit reservation is possible.",
                    )
                  : faxPricing.settlement.status === "settled"
                    ? msg(
                        "Settlement for this fax is complete. Unused reserved credit is available again. Fractions of a cent are accumulated with your other deliveries before deducting from the balance.",
                      )
                    : faxPricing.settlement.status === "released"
                      ? msg(
                          "The reservation was released without a deduction for this delivery.",
                        )
                      : faxPricing.settlement.status === "reserved"
                        ? msg(
                            "Settlement is in progress. Credit remains reserved until usage is verified, even if transmission is already complete. There is no need to resend the fax.",
                          )
                        : msg(
                            "The cost depends on transmission time. Your usage will not exceed {0}. This cap will be reserved on confirmation; only credit actually used will be deducted after usage verification.",
                            money(faxPricing.ceilingMinor),
                          )}{" "}
                {msg(
                  "Amounts exclude tax and use your beta credit; no payment is charged.",
                )}
              </p>
            </div>
          )}
          {d.mode === "production" && d.quote_customer_nanoeur != null && (
            <p className="field-hint">
              {msg(
                "This price is added to your previous deliveries. Total usage is rounded up to the next cent; fractions of a cent are accumulated across deliveries. The displayed cap remains reserved until the outcome is known.",
              )}
            </p>
          )}
          {d.quote_pricing_basis === "public_list_price_ex_tax" && (
            <p className="field-hint">
              {d.channel === "postal"
                ? t.postalSetup.quoteNote
                : msg(
                    "Reference email rate excluding tax. The euro price is fixed for this quote.",
                  )}
              {d.channel === "email" && d.quote_fx && (
                <>
                  {" "}
                  {msg("Conversion on ")}
                  {d.quote_fx.date.split("-").reverse().join("/")}{" "}
                  {msg(": USD 1 ≈")}{" "}
                  {new Intl.NumberFormat(formatLocale(), {
                    maximumFractionDigits: 8,
                  }).format(d.quote_fx.numerator / d.quote_fx.denominator)}{" "}
                  {msg("EUR, using the ECB reference rate.")}
                </>
              )}
            </p>
          )}
          <ProtectedDocumentSummary
            dispatch={d}
            onUpdated={resource.refresh}
            canManage={canPrepare}
            canRevoke={canApprove}
          />
        </section>
        <section className="content-preview">
          {d.html && (
            <>
              <h2>{t.dispatch.htmlPreview}</h2>
              <EmailPreview html={d.html} />
              <details className="text-version">
                <summary>{t.dispatch.textPreview}</summary>
                <pre>{d.text}</pre>
              </details>
            </>
          )}
          {d.document_id && (
            <PdfPreview
              id={d.document_id}
              dispatchId={d.id}
              title={t.dispatch.documentPreview}
            />
          )}
        </section>
        <section
          className="dispatch-review-actions"
          onPointerDownCapture={(event) => {
            const element = (event.target as Element).closest(
              "input, button, label",
            );
            decisionPointer.current = element
              ? {
                  element,
                  top: element.getBoundingClientRect().top,
                  left: element.getBoundingClientRect().left,
                }
              : undefined;
          }}
          onClickCapture={(event) => {
            const pointer = decisionPointer.current;
            decisionPointer.current = undefined;
            if (!pointer || event.detail === 0) return;
            const box = pointer.element.getBoundingClientRect();
            if (
              Math.abs(box.top - pointer.top) > 1 ||
              Math.abs(box.left - pointer.left) > 1
            ) {
              event.preventDefault();
              event.stopPropagation();
              setDecisionMoved(true);
            } else setDecisionMoved(false);
          }}
        >
          {decisionMoved && (
            <p className="notice warning" role="status">
              {msg("The layout changed. Check the document and try again.")}
            </p>
          )}
          {pendingApproval && !canApprove && <RolePermissionNotice approval />}
          {pendingApproval &&
            !approved &&
            !canApprove &&
            canPrepare &&
            !isPublicPreview &&
            (resource.data?.approvalRequest ? (
              <p className="field-hint" role="status">
                {msg(
                  "Approval requested on {0}.",
                  date(resource.data.approvalRequest.requested_at),
                )}
              </p>
            ) : (
              <button
                className="button"
                disabled={action.pending}
                onClick={() => void requestApproval()}
              >
                {msg("Ask for approval")}
              </button>
            ))}
          {pendingApproval && canApprove && resource.data?.approvalRequest && (
            <p className="notice info" role="note">
              {msg(
                "{0} asked for approval on {1}.",
                resource.data.approvalRequest.requested_by ?? msg("A member"),
                date(resource.data.approvalRequest.requested_at),
              )}
            </p>
          )}
          {canApprove &&
            pendingApproval &&
            resource.data?.approval?.approval_kind === "expert" && (
              <p className="notice info">
                {msg(
                  "This delivery was reviewed under your expert delegation. The assistant still needs to confirm acceptance. You can also review and approve it here.",
                )}
              </p>
            )}
          {canApprove && pendingApproval && d.channel === "postal" && (
            <section className="approval-panel">
              <p>
                {msg(
                  "Check the PDF and the recipient’s address. This button approves this version and its price, then",
                )}
                {d.mode === "simulation"
                  ? msg(" starts its simulation.")
                  : msg(" sends it.")}
              </p>
              {postalPriceUnavailable && (
                <p role="status">
                  {msg(
                    "The exact price for this letter is unavailable. Refresh the quote before sending.",
                  )}
                </p>
              )}
              <button
                className="button primary full"
                disabled={
                  quoteBlocked ||
                  postalPriceUnavailable ||
                  postalReadRequired ||
                  action.pending ||
                  resource.loading
                }
                onClick={() => void sendPostal()}
              >
                <ArrowRight size={18} />
                {action.pending
                  ? msg("Sending…")
                  : postalPriceUnavailable
                    ? msg("Price unavailable")
                    : postalSendLabel}
              </button>
            </section>
          )}
          {canApprove &&
            pendingApproval &&
            !approved &&
            d.channel !== "postal" && (
              <section className="approval-panel">
                <p>{t.dispatch.approvalExplain}</p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={quoteBlocked}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    {faxPricing
                      ? msg(
                          "I have checked the content and recipient. I accept variable usage, up to {0}, for this version of the fax.",
                          money(faxPricing.ceilingMinor),
                        )
                      : t.dispatch.approvalCheck}
                  </span>
                </label>
                {emailAttestationRequired && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={recipientRequested}
                      onChange={(e) => setRecipientRequested(e.target.checked)}
                    />
                    <span>
                      {msg(
                        "I confirm that this recipient requested this email and its document. This delivery is not marketing outreach.",
                      )}
                    </span>
                  </label>
                )}
                <button
                  className="button primary full"
                  disabled={
                    !consent ||
                    quoteBlocked ||
                    (emailAttestationRequired && !recipientRequested) ||
                    action.pending ||
                    resource.loading
                  }
                  onClick={() => void approve()}
                >
                  <Check size={18} />
                  {action.pending
                    ? t.loading
                    : d.channel === "email"
                      ? simulation
                        ? msg("Approve and simulate the dispatch")
                        : msg("Approve and send")
                      : t.dispatch.approve}
                  {!action.pending && (
                    <span className="approval-price">{approvalPrice}</span>
                  )}
                </button>
              </section>
            )}
          {canApprove &&
            approved &&
            !reviewPreparationOnly &&
            d.channel !== "postal" && (
              <section className="approval-panel">
                <p>
                  <Check size={18} />
                  {t.dispatch.approved}
                </p>
                <button
                  className="button primary full"
                  disabled={action.pending}
                  onClick={() => void confirm()}
                >
                  {action.pending
                    ? t.loading
                    : simulation
                      ? t.dispatch.confirm
                      : t.dispatch.confirmReal}
                  {!action.pending && (
                    <span className="approval-price">{approvalPrice}</span>
                  )}
                  <ArrowRight size={18} />
                </button>
              </section>
            )}
          {canApprove && cancelAllowed && (
            <div className="cancel-button">
              <ConfirmAction
                className="text-button"
                disabled={
                  action.pending ||
                  (d.channel === "postal" && postalReadRequired)
                }
                label={t.dispatch.cancelAction}
                question={t.dispatch.cancelQuestion}
                confirmLabel={t.dispatch.cancelConfirm}
                onConfirm={() => void cancel()}
              />
            </div>
          )}
          <details className="technical-details">
            <summary>
              {pendingApproval ? t.dispatch.version : t.dispatch.versionDetails}
            </summary>
            <p>{t.dispatch.noChange}</p>
            <dl>
              <Definition label={t.dispatch.fingerprint}>
                <code>{d.fingerprint}</code>
              </Definition>
              {d.document_id && (
                <Definition label={t.document}>
                  <code>{d.document_id}</code>
                </Definition>
              )}
            </dl>
          </details>
        </section>
      </div>
      {pendingApproval && !approved && timeline}
    </>
  );
}

/** Where a dispatch stands, as four steps; exceptional outcomes keep the badge alone. */
function DispatchSteps({
  status,
  channel,
}: {
  status: string;
  channel: Channel;
}) {
  const position: Record<string, number> = {
    draft: 0,
    prepared: 0,
    approved: 1,
    accepted: 2,
    queued: 2,
    submitting: 2,
    submitted: 2,
    sending: 2,
    printed: 2,
    dispatched: 2,
    delivered: 4,
  };
  const current = position[status];
  if (current === undefined) return null;
  const steps = [
    t.statuses.prepared,
    t.statuses.approved,
    t.statuses.sending,
    channel === "email"
      ? t.statuses.email_delivered
      : channel === "fax"
        ? t.statuses.fax_delivered
        : t.statuses.delivered,
  ];
  return (
    <ol className="dispatch-steps" aria-label={t.dispatch.stepsLabel}>
      {steps.map((label, index) => (
        <li
          key={index}
          data-state={
            index < current ? "done" : index === current ? "current" : "todo"
          }
          aria-current={index === current ? "step" : undefined}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

/** An unlisted provider event keeps its words, in sentence case like badges. */
function sentenceCase(text: string) {
  const lower = text.toLocaleLowerCase(formatLocale());
  return lower.charAt(0).toLocaleUpperCase(formatLocale()) + lower.slice(1);
}
