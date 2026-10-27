import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LockKey,
  Plus,
  ShieldCheck,
} from "@phosphor-icons/react";
import {
  api,
  ApiError,
  date,
  money,
  permissionsFor,
  type DocumentRecord,
  type Page,
  type Session,
} from "./api";
import {
  ConfirmAction,
  Definition,
  EmptyState,
  EmailPreview,
  ErrorNotice,
  Field,
  go,
  Loading,
  LoadMore,
  PageHeading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import { RolePermissionNotice } from "./role-guide";
import { msg, msgIn } from "./messages";
import {
  defaultLocale,
  normalizeLocale,
} from "../../../packages/contracts/src/locale";
import "./secure-documents.css";
import { SecureAuditHistory } from "./secure-audit-history";
import type { SecureDistributionView } from "../../../packages/contracts/src/secure-distribution";
import { personalApi, personalBlob } from "./personal-api";
import { emailDraftHtml, EmailComposer } from "./email-composer";
import {
  documentEmailDefaults,
  renderTransactionalEmail,
} from "../../../packages/contracts/src/email-template";

type RetentionOption = { days: number; priceMinor: number };
export type SecureCatalog = {
  retention: RetentionOption[];
  personalRetention: RetentionOption[];
  currency: string;
  priceVersion: string;
};
export type SecurePublication = SecureDistributionView;

export function SecureDistributionPage({
  route,
  session,
}: {
  route: string;
  session: Session;
}) {
  const page = route.split("?")[0];
  const permissions = permissionsFor(session);
  if (page === "/app/secure-distributions/new")
    return permissions.prepareDispatches ? (
      <SecureDistributionComposer session={session} />
    ) : (
      <RolePermissionNotice />
    );
  if (page?.startsWith("/app/secure-distribution/"))
    return (
      <SecureDistributionDetail
        key={page}
        id={page.slice("/app/secure-distribution/".length)}
        session={session}
      />
    );
  return <SecureDistributionList canPrepare={permissions.prepareDispatches} />;
}

function publicationStatus(status: string) {
  const labels: Record<string, string> = {
    prepared: msg("Needs checking"),
    draft: msg("Needs checking"),
    approved: msg("Approved, awaiting activation"),
    active: msgIn("secure-distribution", "Active access"),
    revoked: msg("Access revoked"),
    expired: msg("Access expired"),
    pending: msg("Preparation in progress"),
    preparing: msg("Preparation in progress"),
    failed: msg("Preparation failed"),
  };
  return labels[status] ?? msg("Status needs checking");
}

function SecureDistributionList({ canPrepare }: { canPrepare: boolean }) {
  const resource = useResource<Page<SecurePublication>>(
    "/secure-distributions",
  );
  return (
    <div className="secure-document-layout">
      <PageHeading
        title={msg("Secure distributions")}
        intro={msg(
          "Individual access, a defined term and a log of observable events.",
        )}
        action={
          canPrepare && (
            <a className="button primary" href="#/app/secure-distributions/new">
              <Plus size={18} aria-hidden="true" />
              {msg("New share")}
            </a>
          )
        }
      />
      <div className="section-toolbar">
        <p>
          {msg(
            "Revocation blocks new access and does not refund the activated term.",
          )}
        </p>
        <RefreshButton onClick={resource.refresh} />
      </div>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : resource.data?.items.length ? (
        <ul className="secure-document-list">
          {resource.data.items.map((item) => (
            <li key={item.id}>
              <div>
                <h2>{item.source.name}</h2>
                <p>{item.recipient.name || item.recipient.address}</p>
                <span className="secure-document-tag">
                  <LockKey size={14} aria-hidden="true" />
                  {publicationStatus(item.status)}
                </span>
                {item.expiresAt && (
                  <small>
                    {msg("Available until {0}", date(item.expiresAt))}
                  </small>
                )}
              </div>
              <a
                className="button"
                href={`#/app/secure-distribution/${encodeURIComponent(item.id)}`}
              >
                {msg("View share")}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        !resource.error && (
          <EmptyState
            title={msg("No secure distributions")}
            text={msg("Prepare a share from a verified PDF in this workspace.")}
            action={
              canPrepare && (
                <a className="button" href="#/app/secure-distributions/new">
                  {msg("New share")}
                </a>
              )
            }
          />
        )
      )}
      <LoadMore
        path="/secure-distributions"
        data={resource.data}
        onLoaded={resource.setData}
      />
    </div>
  );
}

function SecureDistributionComposer({ session }: { session: Session }) {
  const emailLocale =
    normalizeLocale(session.user.preferredLocale) ?? defaultLocale;
  const catalog = useResource<SecureCatalog>("/secure-distributions/catalog");
  const documents = useResource<Page<DocumentRecord>>("/documents");
  const [documentId, setDocumentId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [retentionDays, setRetentionDays] = useState(30);
  const [allowOriginalDownload, setAllowOriginalDownload] = useState(false);
  const [allowVaultDeposit, setAllowVaultDeposit] = useState(false);
  const [personalRetentionDays, setPersonalRetentionDays] = useState(365);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [html, setHtml] = useState("");
  const [recipientBinding, setRecipientBinding] = useState<
    "verified_email" | "independent"
  >("verified_email");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const action = useAction();
  const readyDocuments =
    documents.data?.items.filter((document) => document.status === "ready") ??
    [];
  const selectedDocument = readyDocuments.find(
    (document) => document.id === documentId,
  );
  const sharedPrice = catalog.data?.retention.find(
    (option) => option.days === retentionDays,
  )?.priceMinor;
  const personalPrice = catalog.data?.personalRetention.find(
    (option) => option.days === personalRetentionDays,
  )?.priceMinor;
  const displayedPrice =
    sharedPrice === undefined ||
    (allowVaultDeposit && personalPrice === undefined)
      ? undefined
      : sharedPrice + (allowVaultDeposit ? (personalPrice ?? 0) : 0);
  function changed() {
    setIdempotencyKey(crypto.randomUUID());
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const prepared = await api<SecurePublication>("/secure-distributions", {
        method: "POST",
        key: idempotencyKey,
        body: {
          documentId,
          recipient: {
            address: recipientAddress.trim(),
            ...(recipientName.trim() ? { name: recipientName.trim() } : {}),
          },
          retentionDays,
          allowOriginalDownload,
          allowVaultDeposit,
          personalRetentionDays,
          recipientBinding,
          ...(subject.trim() ? { subject: subject.trim() } : {}),
          ...(message.trim() ? { message } : {}),
          ...(html.trim() ? { html } : {}),
          notificationLocale: emailLocale,
        },
      });
      go(`/app/secure-distribution/${encodeURIComponent(prepared.id)}`);
    });
  }
  return (
    <div className="secure-document-layout">
      <a className="text-link" href="#/app/secure-distributions">
        <ArrowLeft size={17} aria-hidden="true" />
        {msg("Back to distributions")}
      </a>
      <PageHeading
        title={msg("New secure share")}
        intro={msg(
          "The recipient uses their Guteneo account. Receiving a document grants no permissions in your workspace.",
        )}
      />
      <ErrorNotice
        error={catalog.error ?? documents.error}
        retry={() => {
          catalog.refresh();
          documents.refresh();
        }}
      />
      {catalog.loading || documents.loading ? (
        <Loading />
      ) : (
        catalog.data && (
          <form
            className="secure-document-form secure-distribution-composer"
            aria-busy={action.pending}
            onSubmit={(event) => void prepare(event)}
          >
            <section className="secure-document-panel">
              <h2>{msg("Document and recipient")}</h2>
              <Field
                label={msg("Verified PDF")}
                hint={msg(
                  "The original document remains unchanged. Viewing uses pages prepared for the recipient.",
                )}
              >
                <select
                  value={documentId}
                  required
                  onChange={(event) => {
                    setDocumentId(event.target.value);
                    changed();
                  }}
                >
                  <option value="">{msg("Choose a document")}</option>
                  {readyDocuments.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.name}
                    </option>
                  ))}
                </select>
              </Field>
              <LoadMore
                path="/documents"
                data={documents.data}
                onLoaded={documents.setData}
              />
              {!readyDocuments.length && (
                <p>
                  <a href="#/app/documents">{msg("Import and verify a PDF")}</a>
                </p>
              )}
              <Field label={msg("Recipient name")}>
                <input
                  value={recipientName}
                  autoComplete="off"
                  maxLength={160}
                  onChange={(event) => {
                    setRecipientName(event.target.value);
                    changed();
                  }}
                />
              </Field>
              <Field label={msg("Recipient email address")}>
                <input
                  type="email"
                  value={recipientAddress}
                  required
                  autoComplete="off"
                  maxLength={254}
                  onChange={(event) => {
                    setRecipientAddress(event.target.value);
                    changed();
                  }}
                />
              </Field>
            </section>
            <section className="secure-document-panel">
              <h2>{msg("Term and permissions")}</h2>
              <Field label={msg("Shared access term")}>
                <select
                  value={retentionDays}
                  onChange={(event) => {
                    setRetentionDays(Number(event.target.value));
                    changed();
                  }}
                >
                  {catalog.data.retention.map((option) => (
                    <option key={option.days} value={option.days}>
                      {msg(
                        "{0} days · {1} excluding tax",
                        option.days,
                        money(option.priceMinor),
                      )}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="secure-document-check">
                <input
                  type="checkbox"
                  checked={allowOriginalDownload}
                  onChange={(event) => {
                    setAllowOriginalDownload(event.target.checked);
                    changed();
                  }}
                />
                <span>
                  {msg("Allow download of the original PDF")}
                  <small>
                    {msg(
                      "A downloaded copy cannot be recalled. Its subsequent openings are not tracked.",
                    )}
                  </small>
                </span>
              </label>
              <label className="secure-document-check">
                <input
                  type="checkbox"
                  checked={allowVaultDeposit}
                  onChange={(event) => {
                    setAllowVaultDeposit(event.target.checked);
                    changed();
                  }}
                />
                <span>
                  {msg("Allow a retained personal copy")}
                  <small>
                    {msg(
                      "Once delivered, the copy remains accessible for its own term, even if you revoke the share.",
                    )}{" "}
                    {msg(
                      "The personal copy can be exported, even when downloading the original PDF is disabled.",
                    )}{" "}
                    {msg(
                      "This option is charged on activation, even if the recipient does not save a copy.",
                    )}
                  </small>
                </span>
              </label>
              {allowVaultDeposit && (
                <Field label={msg("Personal copy retention term")}>
                  <select
                    value={personalRetentionDays}
                    onChange={(event) => {
                      setPersonalRetentionDays(Number(event.target.value));
                      changed();
                    }}
                  >
                    {catalog.data.personalRetention.map((option) => (
                      <option key={option.days} value={option.days}>
                        {msg(
                          "{0} days · {1} excluding tax",
                          option.days,
                          money(option.priceMinor),
                        )}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </section>
            <section className="secure-document-panel secure-document-invitation">
              <h2>{msg("Invitation message")}</h2>
              <Field label={msg("Subject (optional)")}>
                <input
                  value={subject}
                  maxLength={250}
                  placeholder={msg("Automatic subject")}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    changed();
                  }}
                />
              </Field>
              <EmailComposer
                text={message}
                html={html}
                onText={(value) => {
                  setMessage(value);
                  changed();
                }}
                onHtml={(value) => {
                  setHtml(value);
                  changed();
                }}
                documentEmail
                documentLink
                notificationLocale={emailLocale}
                textLimit={16000}
              />
              <Field label={msg("Document access")}>
                <select
                  value={recipientBinding}
                  onChange={(event) => {
                    setRecipientBinding(
                      event.target.value as "verified_email" | "independent",
                    );
                    changed();
                  }}
                >
                  <option value="verified_email">
                    {msg("Access with the recipient’s verified address")}
                  </option>
                  <option value="independent">
                    {msg("Independent confirmation by the workspace")}
                  </option>
                </select>
              </Field>
              <EmailPreview
                html={
                  html.trim()
                    ? emailDraftHtml(message, html)
                    : renderTransactionalEmail({
                        text: message.trim()
                          ? message
                          : documentEmailDefaults(
                              session.organization.name,
                              "my_documents",
                              emailLocale,
                            ).text,
                        workspaceName: session.organization.name,
                        documentTitle: selectedDocument?.name,
                        preferencesUrl: "#",
                        locale: emailLocale,
                        accountDocument: { url: "#", retentionDays },
                      })
                }
              />
            </section>
            <div className="secure-document-price">
              <strong>
                {displayedPrice === undefined
                  ? msg("Price to be confirmed")
                  : msg("Retention: {0} excluding tax", money(displayedPrice))}
              </strong>
              <p>{msg("Price per PDF and per recipient.")}</p>
              <p>
                {msg(
                  "Invitation delivery will be added to the final quote. The activated term is payable in full, even after document revocation.",
                )}
              </p>
            </div>
            <button
              className="button primary"
              type="submit"
              disabled={
                action.pending ||
                !selectedDocument ||
                displayedPrice === undefined
              }
            >
              {action.pending
                ? msgIn("secure-distribution", "Preparing…")
                : msg("Prepare and review share")}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <ErrorNotice error={action.error} />
          </form>
        )
      )}
    </div>
  );
}

function SecureDistributionDetail({
  id,
  session,
}: {
  id: string;
  session: Session;
}) {
  const resource = useResource<SecurePublication>(
    `/secure-distributions/${encodeURIComponent(id)}`,
  );
  const action = useAction();
  const [reviewed, setReviewed] = useState(false);
  const [recipientRequested, setRecipientRequested] = useState(false);
  const [quoteRejected, setQuoteRejected] = useState(false);
  const [auditVersion, setAuditVersion] = useState(0);
  const [reviewedClaim, setReviewedClaim] = useState<string | null>(null);
  const [verificationMethod, setVerificationMethod] = useState(
    "independent_channel",
  );
  const permissions = permissionsFor(session);
  const publication = resource.data;
  const needsQuoteRefresh =
    quoteRejected ||
    (publication?.status === "prepared" &&
      Boolean(
        publication.renewal?.replacementId ||
        (publication.renewal?.expiresAt &&
          Date.parse(publication.renewal.expiresAt) <= Date.now()),
      ));
  const claimKey = publication?.pendingClaim
    ? JSON.stringify([
        publication.pendingClaim.recipientUserId,
        publication.pendingClaim.email,
        publication.pendingClaim.createdAt,
      ])
    : null;
  const bindingReviewed = claimKey !== null && reviewedClaim === claimKey;
  const refresh = resource.refresh;
  const shouldPoll =
    (publication?.status === "preparing" || publication?.status === "active") &&
    !resource.loading &&
    !resource.error;
  const pollingDelay = publication?.status === "preparing" ? 3000 : 10000;
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") refresh();
    }, pollingDelay);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setAuditVersion((current) => current + 1);
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shouldPoll, refresh, pollingDelay]);
  async function mutate(operation: "approve" | "activate" | "revoke") {
    await action.run(async () => {
      try {
        await api(
          `/secure-distributions/${encodeURIComponent(id)}/${operation}`,
          {
            method: "POST",
            key: `${id}:${operation}`,
            body:
              operation === "approve"
                ? { reviewed: true, recipientRequested }
                : {},
          },
        );
      } catch (error) {
        if (error instanceof ApiError && error.code === "LIVE_QUOTE_INVALID") {
          setQuoteRejected(true);
          setReviewed(false);
          setRecipientRequested(false);
        }
        throw error;
      }
      resource.refresh();
    });
  }
  async function renewQuote() {
    await action.run(async () => {
      const renewed = await api<SecurePublication>(
        `/secure-distributions/${encodeURIComponent(id)}/renew`,
        { method: "POST", key: `${id}:renew`, body: {} },
      );
      go(`/app/secure-distribution/${encodeURIComponent(renewed.id)}`);
    });
  }
  async function bindRecipient() {
    if (!publication?.pendingClaim) return;
    await action.run(async () => {
      await api(`/secure-distributions/${encodeURIComponent(id)}/bind`, {
        method: "POST",
        body: {
          recipientUserId: publication.pendingClaim!.recipientUserId,
          verificationMethod,
        },
      });
      setReviewedClaim(null);
      resource.refresh();
    });
  }
  return (
    <div className="secure-document-layout">
      <a className="text-link" href="#/app/secure-distributions">
        <ArrowLeft size={17} aria-hidden="true" />
        {msg("Back to distributions")}
      </a>
      <PageHeading
        title={msg("Review secure share")}
        action={
          <RefreshButton
            onClick={() => {
              setAuditVersion((current) => current + 1);
              resource.refresh();
            }}
          />
        }
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !publication ? (
        <Loading />
      ) : (
        publication && (
          <>
            <section className="secure-document-panel">
              <h2>{publication.source.name}</h2>
              <p>
                <span className="secure-document-tag">
                  <LockKey size={14} aria-hidden="true" />
                  {publication.approved && publication.status === "prepared"
                    ? msg("Approved, awaiting activation")
                    : publicationStatus(publication.status)}
                </span>
              </p>
              <dl className="secure-document-facts">
                <Definition label={msg("Recipient")}>
                  {publication.recipient.name && (
                    <>
                      {publication.recipient.name}
                      <br />
                    </>
                  )}
                  {publication.recipient.address}
                </Definition>
                <Definition label={msg("Shared access term")}>
                  {msg("{0} days", publication.policy.retentionDays)}
                </Definition>
                <Definition label={msg("Original PDF")}>
                  {publication.policy.allowOriginalDownload
                    ? msg("Download allowed")
                    : msg("Download disabled")}
                </Definition>
                <Definition label={msg("Personal copy")}>
                  {publication.policy.allowVaultDeposit ? (
                    <>
                      {msg(
                        "Allowed · {0} days",
                        publication.policy.personalRetentionDays,
                      )}
                      <br />
                      <small>
                        {msg(
                          "The personal copy can be exported, even when downloading the original PDF is disabled.",
                        )}
                      </small>
                    </>
                  ) : (
                    msg("Disabled")
                  )}
                </Definition>
                {publication.expiresAt && (
                  <Definition label={msgIn("secure-distribution", "Expiry")}>
                    {date(publication.expiresAt)}
                  </Definition>
                )}
              </dl>
              <div className="secure-document-price">
                <strong>
                  {msg(
                    "{0} excluding tax",
                    money(publication.quote.totalMinor),
                  )}
                </strong>
                <dl className="secure-document-facts">
                  <Definition label={msg("Shared retention")}>
                    {msg(
                      "{0} excluding tax",
                      money(publication.quote.sharedMinor),
                    )}
                  </Definition>
                  <Definition label={msg("Personal retention")}>
                    {msg(
                      "{0} excluding tax",
                      money(publication.quote.personalMinor),
                    )}
                  </Definition>
                  <Definition label={msg("Invitation delivery")}>
                    {msg(
                      "{0} excluding tax",
                      money(publication.quote.transportMinor),
                    )}
                  </Definition>
                </dl>
                <p>
                  {msg(
                    "The activated term is payable in full. Revoking or disabling the share does not entitle you to a refund.",
                  )}
                </p>
              </div>
            </section>
            <section className="secure-document-panel secure-document-invitation">
              <h2>{msg("Invitation message")}</h2>
              <dl className="secure-document-facts">
                <Definition label={msg("Subject")}>
                  {publication.invitation.subject}
                </Definition>
                {publication.recipientFeedback && (
                  <Definition label={msg("Recipient response")}>
                    {msg(
                      publication.recipientFeedback === "reported"
                        ? "Email reported"
                        : "Unsubscribed",
                    )}
                  </Definition>
                )}
                <Definition label={msg("Document access")}>
                  {publication.policy.recipientBinding === "verified_email"
                    ? msg("Access with the recipient’s verified address")
                    : msg("Independent confirmation by the workspace")}
                </Definition>
              </dl>
              {publication.invitation.html ? (
                <EmailPreview html={publication.invitation.html} />
              ) : (
                <p className="secure-document-invitation-message">
                  {publication.invitation.message}
                </p>
              )}
            </section>
            {publication.status === "preparing" && (
              <section className="secure-document-panel" role="status">
                <Loading />
                <p>
                  {msg(
                    "Secure viewing is being prepared. This page updates during processing.",
                  )}
                </p>
              </section>
            )}
            {publication.status === "prepared" && !publication.approved && (
              <>
                <PreparedDistributionPreview
                  publication={publication}
                  session={session}
                />
                <section className="secure-document-panel">
                  <h2>{msg("Share approval")}</h2>
                  <p>
                    {msg(
                      "Review the PDF, recipient, permissions and price. Approval and activation are separate steps.",
                    )}
                  </p>
                  {permissions.approveDispatches ? (
                    <>
                      <label className="secure-document-check">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          disabled={needsQuoteRefresh || action.pending}
                          onChange={(event) =>
                            setReviewed(event.target.checked)
                          }
                        />
                        <span>
                          {msg(
                            "I have reviewed the document, recipient, permissions and price.",
                          )}
                        </span>
                      </label>
                      <label className="secure-document-check">
                        <input
                          type="checkbox"
                          checked={recipientRequested}
                          disabled={needsQuoteRefresh || action.pending}
                          onChange={(event) =>
                            setRecipientRequested(event.target.checked)
                          }
                        />
                        <span>
                          {msg(
                            "I confirm that this recipient requested this email and its document. This delivery is not marketing outreach.",
                          )}
                        </span>
                      </label>
                      <button
                        className="button primary"
                        type="button"
                        disabled={
                          !reviewed ||
                          !recipientRequested ||
                          needsQuoteRefresh ||
                          action.pending
                        }
                        onClick={() => void mutate("approve")}
                      >
                        <ShieldCheck size={18} aria-hidden="true" />
                        {msg("Approve this share")}
                      </button>
                    </>
                  ) : (
                    <RolePermissionNotice />
                  )}
                </section>
              </>
            )}
            {publication.status === "prepared" &&
              publication.approved &&
              permissions.approveDispatches && (
                <section className="secure-document-panel">
                  <h2>{msg("Activate share")}</h2>
                  <p>
                    {msg(
                      "This activates the paid term and prepares the invitation. The price remains payable if you later revoke the share.",
                    )}
                  </p>
                  <ConfirmAction
                    className="button primary"
                    label={msg("Activate share")}
                    question={msg(
                      "Activate this share for {0} excluding tax?",
                      money(publication.quote.totalMinor),
                    )}
                    confirmLabel={msg("Confirm activation")}
                    disabled={action.pending || needsQuoteRefresh}
                    onConfirm={() => void mutate("activate")}
                  />
                </section>
              )}
            {publication.status === "active" &&
              publication.pendingClaim &&
              permissions.approveDispatches && (
                <section className="secure-document-panel">
                  <h2>{msg("Confirm recipient")}</h2>
                  <p>
                    {msg(
                      "This account requested access to your share. Independently verify that it belongs to the intended recipient before confirming.",
                    )}
                  </p>
                  <p>
                    <strong>{publication.pendingClaim.name}</strong>
                    <br />
                    {publication.pendingClaim.email}
                  </p>
                  <Field label={msg("Verification method")}>
                    <select
                      value={verificationMethod}
                      onChange={(event) =>
                        setVerificationMethod(event.target.value)
                      }
                    >
                      <option value="known_relationship">
                        {msg("Known relationship")}
                      </option>
                      <option value="independent_channel">
                        {msg("Known independent channel")}
                      </option>
                      <option value="qualified_identity">
                        {msg("Qualified identity")}
                      </option>
                    </select>
                  </Field>
                  <label className="secure-document-check">
                    <input
                      type="checkbox"
                      checked={bindingReviewed}
                      onChange={(event) =>
                        setReviewedClaim(event.target.checked ? claimKey : null)
                      }
                    />
                    <span>
                      {msg(
                        "I have verified that this account belongs to the intended recipient.",
                      )}
                    </span>
                  </label>
                  <button
                    className="button primary"
                    type="button"
                    disabled={!bindingReviewed || action.pending}
                    onClick={() => void bindRecipient()}
                  >
                    {msg("Confirm association")}
                  </button>
                </section>
              )}
            {publication.recipientBinding === "confirmed" && (
              <p role="status">
                {msg("The recipient is linked to the confirmed account.")}
              </p>
            )}
            {publication.status === "active" &&
              permissions.approveDispatches && (
                <section className="secure-document-panel">
                  <h2>{msg("Manage access")}</h2>
                  <p>
                    {msg(
                      "Revocation blocks new access. It does not delete downloaded files or personal copies already delivered.",
                    )}
                  </p>
                  <ConfirmAction
                    label={msg("Revoke this share")}
                    question={msg("Block new access without a refund?")}
                    confirmLabel={msg("Revoke access")}
                    disabled={action.pending}
                    onConfirm={() => void mutate("revoke")}
                  />
                </section>
              )}
            {needsQuoteRefresh && (
              <section className="secure-document-panel">
                <ErrorNotice
                  error={
                    new Error(
                      msg(
                        "This quote has expired or changed. Refresh it, then review the document and price again.",
                      ),
                    )
                  }
                  focusOnError={
                    action.error instanceof ApiError &&
                    action.error.code === "LIVE_QUOTE_INVALID"
                  }
                />
                {permissions.approveDispatches &&
                  publication.renewal?.available !== false &&
                  (publication.renewal?.replacementId ? (
                    <a
                      className="button primary"
                      href={`#/app/secure-distribution/${encodeURIComponent(publication.renewal.replacementId)}`}
                    >
                      {msg("Review secure share")}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="button primary"
                      disabled={action.pending}
                      onClick={() => void renewQuote()}
                    >
                      {msg("Refresh quote")}
                    </button>
                  ))}
              </section>
            )}
            <ErrorNotice
              error={
                action.error instanceof ApiError &&
                action.error.code === "LIVE_QUOTE_INVALID"
                  ? undefined
                  : action.error
              }
            />
            <section className="secure-document-panel">
              <h2>{msg("Workspace log")}</h2>
              {publication.status === "active" && (
                <p className="field-hint">
                  {msg(
                    "The log updates automatically while this page is visible.",
                  )}
                </p>
              )}
              <p>
                {msg(
                  "A reported display does not prove reading. Transmitting the PDF does not prove that it was saved to disk.",
                )}
              </p>
              <SecureAuditHistory
                key={`${id}:${auditVersion}`}
                events={publication.audit}
                nextCursor={publication.auditNextCursor}
                getOlder={(cursor) =>
                  api(
                    `/secure-distributions/${encodeURIComponent(id)}/events?cursor=${encodeURIComponent(cursor)}`,
                  )
                }
              />
            </section>
          </>
        )
      )}
    </div>
  );
}

function PreparedDistributionPreview({
  publication,
  session,
}: {
  publication: SecurePublication;
  session: Session;
}) {
  const [page, setPage] = useState(1);
  const [url, setUrl] = useState<string>();
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState<string>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setUrl(undefined);
    setText(undefined);
    setError(undefined);
    if (textMode) {
      personalApi<{ text: string }>(
        `/secure-distributions/${encodeURIComponent(publication.id)}/preview/${page}/text`,
        session,
        { signal: controller.signal },
      )
        .then((result) => setText(result.text))
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(cause as Error);
        });
      return () => controller.abort();
    }
    personalBlob(
      `/secure-distributions/${encodeURIComponent(publication.id)}/preview/${page}`,
      session,
      { signal: controller.signal, expectedType: "image" },
    )
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause as Error);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [publication.id, page, session, textMode]);
  return (
    <section
      className="secure-document-reader"
      aria-label={msg("Shared document preview")}
    >
      <div className="secure-document-reader-toolbar">
        <button
          type="button"
          className="button small"
          aria-pressed={textMode}
          onClick={() => setTextMode((current) => !current)}
        >
          {textMode ? msg("Show pages") : msg("Show accessible text")}
        </button>
        <div className="secure-document-pagination">
          <button
            type="button"
            className="button small"
            aria-label={msg("Previous page")}
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            <span>{msg("Previous page")}</span>
          </button>
          <span>{msg("Page {0} of {1}", page, publication.source.pages)}</span>
          <button
            type="button"
            className="button small"
            aria-label={msg("Next page")}
            disabled={page >= publication.source.pages}
            onClick={() => setPage((current) => current + 1)}
          >
            <ArrowRight size={18} aria-hidden="true" />
            <span>{msg("Next page")}</span>
          </button>
        </div>
      </div>
      <div className="secure-document-pages">
        {error ? (
          <ErrorNotice error={error} />
        ) : textMode && text !== undefined ? (
          <pre className="secure-document-accessible-text">
            {text || msg("No accessible text is available for this page.")}
          </pre>
        ) : url ? (
          <figure className="secure-document-page">
            <img
              src={url}
              alt={msg("Page {0} of the shared document", page)}
              decoding="async"
            />
            <figcaption>{msg("Page {0}", page)}</figcaption>
          </figure>
        ) : (
          <Loading />
        )}
      </div>
    </section>
  );
}
