import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  DownloadSimple,
  LockKey,
} from "@phosphor-icons/react";
import type {
  PersonalDocumentItem,
  PersonalDocumentView,
} from "../../../packages/contracts/src/secure-distribution";
import { ApiError, date } from "./api";
import {
  ConfirmAction,
  EmptyState,
  ErrorNotice,
  Field,
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
  clearPendingDocumentInvitation,
  pendingDocumentInvitation,
} from "./document-invitation";

function personalDocumentStatus(status: PersonalDocumentItem["status"]) {
  return {
    active: msg("Accès disponible"),
    pending: msg("Association en attente"),
    expired: msg("Accès expiré"),
    revoked: msg("Accès révoqué"),
  }[status];
}

function needsAuthentication(error: Error | undefined) {
  return (
    error instanceof ApiError &&
    [
      "STRONG_AUTHENTICATION_REQUIRED",
      "DOCUMENT_AUTHENTICATION_REQUIRED",
      "FRESH_AUTHENTICATION_REQUIRED",
      "AUTHENTICATION_FRESHNESS_REQUIRED",
      "MFA_REQUIRED",
    ].includes(error.code)
  );
}

export function PersonalDocuments({
  route,
  session,
  onSessionInvalid,
}: {
  route: string;
  session: PersonalSession;
  onSessionInvalid: () => void;
}) {
  const page = route.split("?")[0] ?? "/app/my-documents";
  const query = new URLSearchParams(route.split("?")[1]);
  const [, setInvitationVersion] = useState(0);
  const invitation = pendingDocumentInvitation();
  if (invitation)
    return (
      <ClaimDocumentInvitation
        token={invitation}
        session={session}
        onDismiss={() => {
          clearPendingDocumentInvitation();
          setInvitationVersion((current) => current + 1);
          go("/app/my-documents");
        }}
      />
    );
  const id = page.startsWith("/app/my-documents/")
    ? page.slice("/app/my-documents/".length)
    : "";
  if (id)
    return (
      <PersonalDocumentReader
        key={`${session.user.id}:${id}`}
        id={id}
        session={session}
        onSessionInvalid={onSessionInvalid}
      />
    );
  return (
    <PersonalDocumentList
      key={`${query.get("kind") ?? "shared"}:${query.get("q") ?? ""}`}
      kind={query.get("kind") === "personal" ? "personal" : "shared"}
      search={query.get("q") ?? ""}
      session={session}
      onSessionInvalid={onSessionInvalid}
    />
  );
}

function ClaimDocumentInvitation({
  token,
  session,
  onDismiss,
}: {
  token: string;
  session: PersonalSession;
  onDismiss: () => void;
}) {
  const action = useAction();
  const [pending, setPending] = useState(false);
  async function claim() {
    await action.run(async () => {
      if (pendingDocumentInvitation() !== token)
        throw new ApiError(
          "INVITATION_HANDOFF_EXPIRED",
          msg(
            "Le délai de connexion de cette invitation est dépassé. Rouvrez le lien reçu pour reprendre.",
          ),
          410,
        );
      const result = await personalApi<{ id: string; status: string }>(
        "/personal/documents/claim",
        session,
        { method: "POST", body: { token }, key: crypto.randomUUID() },
      );
      clearPendingDocumentInvitation();
      // Invitation secrets are only exchanged in the request body and removed
      // from history before opening the account-bound document identifier.
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}#/app/my-documents`,
      );
      if (result.id) go(`/app/my-documents/${encodeURIComponent(result.id)}`);
      else setPending(true);
    });
  }
  return (
    <div className="secure-document-layout">
      <PageHeading
        title={msg("Un document vous a été adressé")}
        intro={msg(
          "Vérifiez le compte connecté avant de demander l’accès. L’invitation ne donne aucun droit dans l’atelier expéditeur.",
        )}
      />
      <section className="secure-document-panel">
        <h2>{msg("Connecté avec {0}", session.user.email)}</h2>
        <p>
          {msg(
            "L’atelier peut devoir confirmer l’association à votre compte avant de vous donner accès au contenu.",
          )}
        </p>
        {!session.strongAuthentication ? (
          <PersonalSecurityNotice />
        ) : pending ? (
          <p role="status">
            {msg("Votre demande d’accès attend la confirmation de l’atelier.")}
          </p>
        ) : (
          <button
            type="button"
            className="button primary"
            disabled={action.pending}
            onClick={() => void claim()}
          >
            {action.pending
              ? msg("Vérification en cours…")
              : msg("Demander l’accès au document")}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
        {needsAuthentication(action.error) ? (
          <PersonalSecurityNotice />
        ) : (
          <ErrorNotice error={action.error} />
        )}
      </section>
      <a className="text-link" href="#/app/my-documents" onClick={onDismiss}>
        {msg("Revenir à mes documents")}
      </a>
    </div>
  );
}

function PersonalDocumentList({
  kind,
  search,
  session,
  onSessionInvalid,
}: {
  kind: "shared" | "personal";
  search: string;
  session: PersonalSession;
  onSessionInvalid: () => void;
}) {
  const [items, setItems] = useState<PersonalDocumentItem[]>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [searchInput, setSearchInput] = useState(search);
  const more = useAction();
  const params = new URLSearchParams({ kind });
  if (search) params.set("q", search);
  const listPath = `/personal/documents?${params.toString()}`;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    personalApi<{ items: PersonalDocumentItem[]; nextCursor: string | null }>(
      listPath,
      session,
      { signal: controller.signal },
    )
      .then((response) => {
        setItems(response.items);
        setNextCursor(response.nextCursor);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause as Error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session, version, listPath, onSessionInvalid]);
  const visibleItems = items?.filter((item) => item.kind === kind);
  async function loadMore() {
    if (!nextCursor) return;
    await more.run(async () => {
      const next = await personalApi<{
        items: PersonalDocumentItem[];
        nextCursor: string | null;
      }>(`${listPath}&cursor=${encodeURIComponent(nextCursor)}`, session);
      setItems((previous) => [...(previous ?? []), ...next.items]);
      setNextCursor(next.nextCursor);
    });
  }
  return (
    <div className="secure-document-layout">
      <PageHeading
        title={msg("Mes documents")}
        intro={msg(
          "Un seul compte pour vos documents et les services Guteneo.",
        )}
        action={<RefreshButton onClick={() => setVersion((n) => n + 1)} />}
      />
      <nav
        className="secure-document-tabs"
        aria-label={msg("Catégories de documents")}
      >
        <a
          href={`#/app/my-documents${search ? `?q=${encodeURIComponent(search)}` : ""}`}
          aria-current={kind === "shared" ? "page" : undefined}
        >
          {msg("Partagés avec moi")}
        </a>
        <a
          href={`#/app/my-documents?kind=personal${search ? `&q=${encodeURIComponent(search)}` : ""}`}
          aria-current={kind === "personal" ? "page" : undefined}
        >
          {msg("Copies conservées")}
        </a>
      </nav>
      <form
        className="secure-document-search"
        onSubmit={(event) => {
          event.preventDefault();
          const next = new URLSearchParams({ kind });
          if (searchInput.trim()) next.set("q", searchInput.trim());
          go(`/app/my-documents?${next.toString()}`);
        }}
        role="search"
      >
        <Field label={msg("Rechercher dans mes documents")}>
          <input
            type="search"
            value={searchInput}
            maxLength={200}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </Field>
        <button className="button" type="submit">
          {msg("Rechercher")}
        </button>
      </form>
      <p className="secure-document-intro">
        {kind === "shared"
          ? msg(
              "Ces documents restent sous le contrôle de leur expéditeur. Leur accès peut expirer ou être révoqué.",
            )
          : msg(
              "Ces copies vous ont été remises pour la durée indiquée. L’atelier ne peut plus les retirer.",
            )}
      </p>
      {needsAuthentication(error) ? (
        <PersonalSecurityNotice />
      ) : (
        <ErrorNotice error={error} retry={() => setVersion((n) => n + 1)} />
      )}
      {error instanceof ApiError && error.status === 401 && (
        <button className="button" type="button" onClick={onSessionInvalid}>
          {msg("Se connecter à mon compte")}
        </button>
      )}
      {loading && !items ? (
        <Loading />
      ) : visibleItems?.length ? (
        <ul className="secure-document-list">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <div>
                <h2>
                  {item.status === "pending"
                    ? msg("Document en attente de vérification")
                    : item.title}
                </h2>
                <p>
                  {msg("Expéditeur")} : {item.sender}
                </p>
                <span className="secure-document-tag">
                  <LockKey size={14} aria-hidden="true" />
                  {personalDocumentStatus(item.status)}
                </span>
                <small>
                  {kind === "personal"
                    ? msg("Conservation jusqu’au {0}", date(item.expiresAt))
                    : msg("Disponible jusqu’au {0}", date(item.expiresAt))}
                </small>
              </div>
              <a
                className="button"
                href={`#/app/my-documents/${encodeURIComponent(item.id)}`}
              >
                {msg("Ouvrir le document")}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        !error &&
        !loading &&
        !nextCursor && (
          <EmptyState
            title={
              kind === "personal"
                ? msg("Aucune copie conservée")
                : msg("Aucun document partagé")
            }
            text={
              kind === "personal"
                ? msg(
                    "Vous pourrez conserver une copie si l’atelier expéditeur l’autorise.",
                  )
                : msg(
                    "Les documents qui vous sont attribués apparaîtront ici après validation de votre accès.",
                  )
            }
          />
        )
      )}
      {nextCursor && (
        <button
          className="button"
          type="button"
          disabled={more.pending}
          onClick={() => void loadMore()}
        >
          {more.pending
            ? msg("Chargement…")
            : msg("Afficher les documents suivants")}
        </button>
      )}
      <ErrorNotice error={more.error} />
    </div>
  );
}

function PersonalDocumentReader({
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
        {msg("Revenir à mes documents")}
      </a>
      <PageHeading
        title={
          document?.status === "pending"
            ? msg("Document en attente de vérification")
            : (document?.title ?? msg("Document reçu"))
        }
        action={<RefreshButton onClick={() => setVersion((n) => n + 1)} />}
      />
      {needsAuthentication(error) ? (
        <PersonalSecurityNotice />
      ) : (
        <ErrorNotice error={error} retry={() => setVersion((n) => n + 1)} />
      )}
      {error instanceof ApiError && error.status === 401 && (
        <button className="button" type="button" onClick={onSessionInvalid}>
          {msg("Se connecter à mon compte")}
        </button>
      )}
      {loading && !document ? (
        <Loading />
      ) : (
        document && (
          <>
            <section className="secure-document-panel">
              <p>
                {msg("Expéditeur")} : <strong>{document.sender}</strong>
              </p>
              <p>
                {document.kind === "personal"
                  ? msg("Conservation jusqu’au {0}", date(document.expiresAt))
                  : msg("Disponible jusqu’au {0}", date(document.expiresAt))}
              </p>
              {document.status === "pending" ? (
                <p role="status">
                  {msg(
                    "Votre demande d’accès attend la confirmation de l’atelier.",
                  )}
                </p>
              ) : document.status !== "active" ? (
                <p role="status">{personalDocumentStatus(document.status)}</p>
              ) : (
                <p>
                  {document.kind === "shared"
                    ? msg(
                        "L’atelier reçoit un journal des accès autorisés et des affichages déclarés. Les captures d’écran ne sont pas détectées.",
                      )
                    : msg(
                        "Vos consultations de cette copie personnelle ne sont pas communiquées à l’atelier expéditeur.",
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
                    {textMode
                      ? msg("Afficher les pages")
                      : msg("Afficher le texte accessible")}
                  </button>
                  <span>{msg("{0} page(s)", document.pages.length)}</span>
                  <div className="secure-document-actions">
                    {document.allowOriginalDownload && (
                      <ConfirmAction
                        label={
                          <>
                            <DownloadSimple size={18} aria-hidden="true" />
                            {document.kind === "personal"
                              ? msg("Exporter ma copie")
                              : msg("Télécharger le PDF original")}
                          </>
                        }
                        question={msg(
                          "Le fichier quittera le contrôle de Guteneo. Continuer ?",
                        )}
                        confirmLabel={msg("Lancer le téléchargement")}
                        disabled={action.pending}
                        onConfirm={() => void download()}
                      />
                    )}
                  </div>
                </div>
                {downloadStarted && (
                  <p role="status">
                    {msg(
                      "Téléchargement lancé. Guteneo ne peut pas confirmer l’enregistrement sur votre appareil.",
                    )}
                  </p>
                )}
                {textMode ? (
                  <section
                    aria-label={msg("Texte accessible du document")}
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
                      <h2>{msg("Conserver une copie personnelle")}</h2>
                      <p>
                        {msg(
                          "Cette copie sera exportable et conservée pendant {0} jours à partir de sa remise. L’atelier ne pourra plus la retirer.",
                          document.policy.personalRetentionDays,
                        )}
                      </p>
                      {depositPreparing && (
                        <p role="status">
                          {msg(
                            "La copie est en préparation. Actualisez le suivi avant de réessayer.",
                          )}
                        </p>
                      )}
                      <ConfirmAction
                        label={
                          depositPreparing
                            ? msg("Reprendre la préparation de ma copie")
                            : msg("Conserver une copie")
                        }
                        question={msg(
                          depositPreparing
                            ? "Reprendre cette opération sans créer de nouvelle copie ?"
                            : "Accepter la remise de cette copie dans votre espace personnel ?",
                        )}
                        confirmLabel={
                          depositPreparing
                            ? msg("Reprendre la préparation")
                            : msg("Accepter et conserver")
                        }
                        disabled={action.pending}
                        onConfirm={() => void deposit()}
                      />
                    </section>
                  )}
                {(document.depositedDocumentId || deposited) && (
                  <section className="secure-document-panel" role="status">
                    <h2>{msg("Copie conservée")}</h2>
                    {deposited && (
                      <p>
                        {msg(
                          "Conservation jusqu’au {0}",
                          date(deposited.expiresAt),
                        )}
                      </p>
                    )}
                    <a
                      className="button"
                      href={`#/app/my-documents/${encodeURIComponent(document.depositedDocumentId || deposited!.id)}`}
                    >
                      {msg("Ouvrir ma copie personnelle")}
                    </a>
                  </section>
                )}
                {needsAuthentication(action.error) ? (
                  <PersonalSecurityNotice />
                ) : (
                  <ErrorNotice error={action.error} />
                )}
                {document.kind === "personal" && (
                  <section className="secure-document-panel">
                    <h2>{msg("Gérer ma copie personnelle")}</h2>
                    <p>
                      {msg(
                        "La suppression retire votre copie de cet espace. Elle ne supprime pas l’original de l’atelier ni les fichiers déjà téléchargés.",
                      )}
                    </p>
                    <ConfirmAction
                      label={msg("Supprimer ma copie")}
                      question={msg("Supprimer cette copie personnelle ?")}
                      confirmLabel={msg("Confirmer la suppression")}
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
                  <h2>{msg("Mon historique d’accès")}</h2>
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
            {msg("Afficher le texte de la page {0}", page.number)}
          </button>
          {visible && <Loading />}
        </>
      ) : (
        <pre className="secure-document-accessible-text">
          {text ||
            msg("Aucun texte accessible n’est disponible pour cette page.")}
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
            "Page {0}. Le texte accessible est disponible avec le bouton au-dessus du document.",
            page.number,
          )}
          onLoad={() => setLoaded(true)}
          onError={() => {
            const cause = new ApiError(
              "DOCUMENT_UNAVAILABLE",
              msg("Ce document ne peut pas être affiché."),
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
