import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, DownloadSimple } from "@phosphor-icons/react";
import type { PersonalDocumentView } from "../../../packages/contracts/src/secure-distribution";
import { ApiError, date } from "./api";
import {
  ConfirmAction,
  ErrorNotice,
  go,
  Loading,
  PageHeading,
  RefreshButton,
  useAction,
} from "./components";
import { msg } from "./messages";
import {
  personalApi,
  personalBlob,
  type PersonalSession,
} from "./personal-api";
import { PersonalSecurityNotice } from "./personal-space";
import { SecureAuditHistory } from "./secure-audit-history";
import {
  needsAuthentication,
  personalDocumentStatus,
} from "./personal-document-status";

export function PersonalDocumentReader({
  id,
  session,
  onSessionInvalid,
}: {
  id: string;
  session: PersonalSession;
  onSessionInvalid: () => void;
}) {
  const [document, setDocument] = useState<PersonalDocumentView>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [textMode, setTextMode] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [deposited, setDeposited] = useState<{
    id: string;
    expiresAt: string;
  }>();
  const [depositPreparing, setDepositPreparing] = useState(false);
  const [depositKey] = useState(() => crypto.randomUUID());
  const action = useAction();
  useEffect(() => {
    const controller = new AbortController();
    setError(undefined);
    setLoading(true);
    personalApi<PersonalDocumentView>(
      `/personal/documents/${encodeURIComponent(id)}`,
      session,
      { signal: controller.signal },
    )
      .then(setDocument)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setDocument(undefined);
        setError(cause as Error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, session, version, onSessionInvalid]);
  const awaitingDeposit =
    depositPreparing && !document?.depositedDocumentId && !loading && !error;
  useEffect(() => {
    if (!awaitingDeposit) return;
    const refresh = () => {
      if (window.document.visibilityState === "visible")
        setVersion((current) => current + 1);
    };
    const timer = setTimeout(refresh, 3000);
    window.document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.document.removeEventListener("visibilitychange", refresh);
    };
  }, [awaitingDeposit]);
  async function download() {
    await action.run(async () => {
      const blob = await personalBlob(
        `/personal/documents/${encodeURIComponent(id)}/download`,
        session,
        {
          method: "POST",
          body: {},
          key: crypto.randomUUID(),
          expectedType: "pdf",
        },
      );
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document?.title || "document.pdf";
      anchor.rel = "noreferrer";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setDownloadStarted(true);
    });
  }
  async function deposit() {
    await action.run(async () => {
      const result = await personalApi<{
        id: string;
        status: string;
        expiresAt: string;
      }>(`/personal/documents/${encodeURIComponent(id)}/deposit`, session, {
        method: "POST",
        body: {},
        key: depositKey,
      });
      if (result.status === "active") {
        setDepositPreparing(false);
        setDeposited({ id: result.id, expiresAt: result.expiresAt });
      } else {
        setDepositPreparing(true);
        setVersion((n) => n + 1);
      }
    });
  }
  const contentFailure = useCallback((cause: Error) => {
    setError(cause);
    if (
      cause instanceof ApiError &&
      [401, 403, 404, 410].includes(cause.status)
    )
      setDocument(undefined);
  }, []);
  return (
    <div className="secure-document-layout">
      <a
        className="text-link"
        href={
          document?.kind === "personal"
            ? "#/app/my-documents?kind=personal"
            : "#/app/my-documents"
        }
      >
        <ArrowLeft size={17} aria-hidden="true" />
        {msg("Back to my documents")}
      </a>
      <PageHeading
        title={
          document?.status === "pending"
            ? msg("Document awaiting verification")
            : (document?.title ?? msg("Received document"))
        }
        action={<RefreshButton onClick={() => setVersion((n) => n + 1)} />}
      />
      {needsAuthentication(error) ? (
        <PersonalSecurityNotice mode={session.documentAccessMode} />
      ) : (
        <ErrorNotice error={error} retry={() => setVersion((n) => n + 1)} />
      )}
      {error instanceof ApiError && error.status === 401 && (
        <button className="button" type="button" onClick={onSessionInvalid}>
          {msg("Sign in to my account")}
        </button>
      )}
      {loading && !document ? (
        <Loading />
      ) : (
        document && (
          <>
            <section className="secure-document-panel">
              <p>
                {msg("Sender")} : <strong>{document.sender}</strong>
              </p>
              <p>
                {document.kind === "personal"
                  ? msg("Retained until {0}", date(document.expiresAt))
                  : msg("Available until {0}", date(document.expiresAt))}
              </p>
              {document.status === "pending" ? (
                <p role="status">
                  {msg(
                    "Your access request is awaiting confirmation from the workspace.",
                  )}
                </p>
              ) : document.status !== "active" ? (
                <p role="status">{personalDocumentStatus(document.status)}</p>
              ) : (
                <p>
                  {document.kind === "shared"
                    ? msg(
                        "The workspace receives a log of authorized access and reported displays. Screenshots are not detected.",
                      )
                    : msg(
                        "Your views of this personal copy are not shared with the sending workspace.",
                      )}
                </p>
              )}
            </section>
            {document.status === "active" && (
              <>
                <div className="secure-document-reader-toolbar">
                  <button
                    type="button"
                    className="button small"
                    aria-pressed={textMode}
                    onClick={() => setTextMode((current) => !current)}
                  >
                    {textMode ? msg("Show pages") : msg("Show accessible text")}
                  </button>
                  <span>{msg("{0} page(s)", document.pages.length)}</span>
                  <div className="secure-document-actions">
                    {document.allowOriginalDownload && (
                      <ConfirmAction
                        label={
                          <>
                            <DownloadSimple size={18} aria-hidden="true" />
                            {document.kind === "personal"
                              ? msg("Export my copy")
                              : msg("Download the original PDF")}
                          </>
                        }
                        question={msg(
                          "The file will leave Guteneo’s control. Continue?",
                        )}
                        confirmLabel={msg("Start download")}
                        disabled={action.pending}
                        onConfirm={() => void download()}
                      />
                    )}
                  </div>
                </div>
                {downloadStarted && (
                  <p role="status">
                    {msg(
                      "Download started. Guteneo cannot confirm that it was saved on your device.",
                    )}
                  </p>
                )}
                {textMode ? (
                  <section
                    aria-label={msg("Accessible document text")}
                    className="secure-document-layout"
                  >
                    {document.pages.map((page) => (
                      <AccessiblePage
                        key={`${page.number}:${version}`}
                        documentId={id}
                        page={page}
                        session={session}
                        onFailure={contentFailure}
                      />
                    ))}
                  </section>
                ) : (
                  <div className="secure-document-pages">
                    {document.pages.map((page) => (
                      <PrivatePage
                        key={`${page.number}:${version}`}
                        documentId={id}
                        page={page}
                        session={session}
                        onFailure={contentFailure}
                      />
                    ))}
                  </div>
                )}
                {document.kind === "shared" &&
                  document.allowVaultDeposit &&
                  !document.depositedDocumentId &&
                  !deposited && (
                    <section className="secure-document-panel">
                      <h2>{msg("Save a personal copy")}</h2>
                      <p>
                        {msg(
                          "This copy can be exported and will be retained for {0} days from delivery. The workspace will no longer be able to withdraw it.",
                          document.policy.personalRetentionDays,
                        )}
                      </p>
                      {depositPreparing && (
                        <p role="status">
                          {msg(
                            "The copy is being prepared. Refresh its status before trying again.",
                          )}
                        </p>
                      )}
                      <ConfirmAction
                        label={
                          depositPreparing
                            ? msg("Resume preparation of my copy")
                            : msg("Save a copy")
                        }
                        question={msg(
                          depositPreparing
                            ? "Resume this operation without creating another copy?"
                            : "Accept delivery of this copy to your personal space?",
                        )}
                        confirmLabel={
                          depositPreparing
                            ? msg("Resume preparation")
                            : msg("Accept and save")
                        }
                        disabled={action.pending}
                        onConfirm={() => void deposit()}
                      />
                    </section>
                  )}
                {(document.depositedDocumentId || deposited) && (
                  <section className="secure-document-panel" role="status">
                    <h2>{msg("Copy saved")}</h2>
                    {deposited && (
                      <p>
                        {msg("Retained until {0}", date(deposited.expiresAt))}
                      </p>
                    )}
                    <a
                      className="button"
                      href={`#/app/my-documents/${encodeURIComponent(document.depositedDocumentId || deposited!.id)}`}
                    >
                      {msg("Open my personal copy")}
                    </a>
                  </section>
                )}
                {needsAuthentication(action.error) ? (
                  <PersonalSecurityNotice mode={session.documentAccessMode} />
                ) : (
                  <ErrorNotice error={action.error} />
                )}
                {document.kind === "personal" && (
                  <section className="secure-document-panel">
                    <h2>{msg("Manage my personal copy")}</h2>
                    <p>
                      {msg(
                        "Deleting removes your copy from this space. It does not delete the workspace original or files already downloaded.",
                      )}
                    </p>
                    <ConfirmAction
                      label={msg("Delete my copy")}
                      question={msg("Delete this personal copy?")}
                      confirmLabel={msg("Confirm deletion")}
                      disabled={action.pending}
                      onConfirm={() =>
                        void action.run(async () => {
                          await personalApi(
                            `/personal/documents/${encodeURIComponent(id)}/delete`,
                            session,
                            {
                              method: "POST",
                              body: {},
                              key: crypto.randomUUID(),
                            },
                          );
                          go("/app/my-documents?kind=personal");
                        })
                      }
                    />
                  </section>
                )}
                <section className="secure-document-panel">
                  <h2>{msg("My access history")}</h2>
                  <SecureAuditHistory
                    key={`${id}:${version}`}
                    events={document.audit}
                    nextCursor={document.auditNextCursor}
                    getOlder={(cursor) =>
                      personalApi(
                        `/personal/documents/${encodeURIComponent(id)}/events?cursor=${encodeURIComponent(cursor)}`,
                        session,
                      )
                    }
                  />
                </section>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}

function AccessiblePage({
  documentId,
  page,
  session,
  onFailure,
}: {
  documentId: string;
  page: PersonalDocumentView["pages"][number];
  session: PersonalSession;
  onFailure: (error: Error) => void;
}) {
  const element = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState<string>();
  const [error, setError] = useState<Error>();
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    personalApi<{ text: string }>(
      `/personal/documents/${encodeURIComponent(documentId)}/pages/${page.number}/text`,
      session,
      { signal: controller.signal },
    )
      .then((result) => setText(result.text))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause as Error);
          onFailure(cause as Error);
        }
      });
    return () => controller.abort();
  }, [visible, documentId, page.number, session, onFailure]);
  useEffect(() => {
    if (text === undefined || !element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void personalApi(
          `/personal/documents/${encodeURIComponent(documentId)}/events`,
          session,
          {
            method: "POST",
            body: { type: "page_displayed", page: page.number },
            key: crypto.randomUUID(),
          },
        ).catch(() => {
          /* Client reports remain best effort. */
        });
      },
      { threshold: 0.01 },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [text, documentId, page.number, session]);
  return (
    <section
      ref={element}
      style={{ minHeight: text === undefined ? 260 : undefined }}
    >
      <h2>{msg("Page {0}", page.number)}</h2>
      {error ? (
        <ErrorNotice error={error} />
      ) : text === undefined ? (
        <>
          <button
            className="button small"
            type="button"
            disabled={visible}
            onClick={() => setVisible(true)}
          >
            {msg("Show text for page {0}", page.number)}
          </button>
          {visible && <Loading />}
        </>
      ) : (
        <pre className="secure-document-accessible-text">
          {text || msg("No accessible text is available for this page.")}
        </pre>
      )}
    </section>
  );
}

function PrivatePage({
  documentId,
  page,
  session,
  onFailure,
}: {
  documentId: string;
  page: PersonalDocumentView["pages"][number];
  session: PersonalSession;
  onFailure: (error: Error) => void;
}) {
  const figure = useRef<HTMLElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const reported = useRef(false);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<Error>();
  useEffect(() => {
    const element = figure.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    // The manifest is not allowed to direct a credentialed fetch to another
    // origin or to an original PDF route. All page delivery stays gated here.
    personalBlob(
      `/personal/documents/${encodeURIComponent(documentId)}/pages/${page.number}`,
      session,
      { signal: controller.signal, expectedType: "image" },
    )
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause as Error);
          onFailure(cause as Error);
        }
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [visible, documentId, page.number, session, onFailure]);
  useEffect(() => {
    if (!loaded || reported.current || !image.current) return;
    const element = image.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (reported.current || !entries.some((entry) => entry.isIntersecting))
          return;
        reported.current = true;
        observer.disconnect();
        void personalApi(
          `/personal/documents/${encodeURIComponent(documentId)}/events`,
          session,
          {
            method: "POST",
            body: { type: "page_displayed", page: page.number },
            key: `${documentId}:page-displayed:${page.number}:${crypto.randomUUID()}`,
          },
        ).catch(() => {
          // This observation is best effort. A lost browser report is not
          // promoted to a server proof or retried as a new user action.
        });
      },
      { threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [loaded, documentId, page.number, session]);
  return (
    <figure
      ref={figure}
      className="secure-document-page"
      style={{ minHeight: url ? undefined : `${Math.min(400, page.height)}px` }}
    >
      {error ? (
        <ErrorNotice error={error} />
      ) : url ? (
        <img
          ref={image}
          src={url}
          width={page.width}
          height={page.height}
          decoding="async"
          alt={msg(
            "Page {0}. Accessible text is available using the button above the document.",
            page.number,
          )}
          onLoad={() => setLoaded(true)}
          onError={() => {
            const cause = new ApiError(
              "DOCUMENT_UNAVAILABLE",
              msg("This document cannot be displayed."),
              502,
            );
            setError(cause);
            onFailure(cause);
          }}
        />
      ) : (
        <Loading />
      )}
      <figcaption>{msg("Page {0}", page.number)}</figcaption>
    </figure>
  );
}
