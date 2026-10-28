import { msg } from "./messages";
import { FileInput } from "./file-input";
import { useDashboardAppearance } from "./dashboard-appearance";
import { WorkspaceContacts } from "./workspace-contacts";
import { RolePermissionNotice } from "./role-guide";
import { formatLocale } from "./locale";
import type { SupportedLocale } from "../../../packages/contracts/src/locale";
import {
  documentEmailDefaults,
  renderTransactionalEmail,
} from "../../../packages/contracts/src/email-template";
import { FAX_OPERATOR_TEST_NOTICE } from "../../../packages/contracts/src/fax-pricing";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { documentAnalysis } from "../../../packages/contracts/src/document-analysis";
import {
  dispatchGroupNames,
  isDispatchGroup,
  type DispatchOverview,
} from "../../../packages/contracts/src/dispatch-groups";
import {
  ArrowRight,
  Plus,
  UploadSimple,
  FileText,
  Check,
  ArrowLeft,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  api,
  permissionsFor,
  ApiError,
  bytes,
  date,
  EURO_INPUT_PATTERN,
  euroToMinor,
  FAX_INPUT_PATTERN,
  money,
  nanoMoney,
  normalizeFaxNumber,
  quotedMoney,
  isPublicPreview,
  recipientOf,
  type Channel,
  type Dispatch,
  type DispatchDetail,
  type DocumentRecord,
  type Page,
  type Sender,
  type Session,
} from "./api";
import {
  ProtectedDocumentSummary,
  protectedDelivery,
} from "./protected-document";
import { EmailComposer, emailDraftHtml } from "./email-composer";
import {
  DocumentDeliveryChoice,
  type DocumentEmailMode,
} from "./document-delivery-choice";
import type { SecureDistributionView } from "../../../packages/contracts/src/secure-distribution";
import { OverviewAssistantStart } from "./assistant-workspace";
import { t } from "./locale";
import type { PostalReview } from "../../../packages/contracts/src/postal-review";
import {
  PostalAddressChoice,
  PostalAddressPageSummary,
  type PostalAddressMode,
} from "./postal-address-page";
import type { PostalAddressPageResult } from "../../../packages/contracts/src/postal-address-page";
import { PostalSetupPanel } from "./postal-setup-panel";
import { PostalCutoffNotice } from "./postal-cutoff-notice";
import { PdfValidation } from "./pdf-validation";
import {
  ChannelLabel,
  ConfirmAction,
  DateTimezone,
  Definition,
  DispatchTable,
  EmailPreview,
  EmptyState,
  ErrorNotice,
  Field,
  go,
  Loading,
  LoadMore,
  PageHeading,
  PdfPreview,
  RefreshButton,
  Status,
  emailErrorMessage,
  useAction,
  useRefreshOnFocus,
  useResource,
  useRoute,
} from "./components";

function analysisOf(document: DocumentRecord) {
  // Old responses have no evidence that background processing was scheduled.
  // Preserve their useful manual recovery without promising an automatic retry.
  return document.analysis ?? documentAnalysis(document.status);
}

function DocumentStatus({ document }: { document: DocumentRecord }) {
  const analysis = analysisOf(document);
  const labels = {
    processing: msg("Verification in progress"),
    ready: msg("PDF ready"),
    retryable: msg("Needs checking"),
    blocked: msg("PDF unavailable"),
  };
  return (
    <span className={`status status-document-${analysis.state}`}>
      {labels[analysis.state]}
    </span>
  );
}

/** Status reads only: scanning and its bounded recovery belong to the server. */
function useDocumentFollowup(id: string | null, preview?: DocumentRecord) {
  const [document, setDocument] = useState<DocumentRecord>();
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<"network" | "paused" | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    setDocument((current) => (current?.id === id ? current : undefined));
    setIssue(null);
    if (!id) {
      setLoading(false);
      return;
    }
    if (isPublicPreview) {
      setDocument(preview);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let nextRead: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => {
      controller.abort();
      clearTimeout(nextRead);
      setLoading(false);
      setIssue("paused");
    }, 10 * 60_000);
    async function readStatus() {
      try {
        const current = await api<DocumentRecord>(
          `/documents/${encodeURIComponent(id!)}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setDocument(current);
        setLoading(false);
        if (
          current.status !== "ready" &&
          current.analysis?.state === "processing"
        ) {
          nextRead = setTimeout(() => void readStatus(), 15_000);
        } else clearTimeout(deadline);
      } catch {
        if (controller.signal.aborted) return;
        clearTimeout(deadline);
        setLoading(false);
        setIssue("network");
      }
    }
    setLoading(true);
    void readStatus();
    return () => {
      controller.abort();
      clearTimeout(nextRead);
      clearTimeout(deadline);
    };
  }, [id, revision, preview]);
  return {
    document: document?.id === id ? document : undefined,
    loading,
    issue,
    refresh,
  };
}

export function Overview({ session }: { session: Session }) {
  const { appearance } = useDashboardAppearance();
  const permissions = permissionsFor(session);
  const overview = useResource<DispatchOverview>(
    permissions.viewReports ? "/overview" : null,
  );
  const dispatches = useResource<Page<Dispatch>>("/dispatches?limit=6");
  const refreshOverview = overview.refresh;
  const refreshDispatches = dispatches.refresh;
  const refresh = useCallback(() => {
    refreshOverview();
    refreshDispatches();
  }, [refreshOverview, refreshDispatches]);
  useRefreshOnFocus(refresh);
  const counts = overview.data;
  const attention = counts?.dispatches.attention ?? 0;
  const dailyOverview =
    appearance === "v2" &&
    ((counts?.dispatches.total ?? 0) > 0 ||
      (dispatches.data?.items.length ?? 0) > 0);
  const stats = [
    {
      href: "#/app/documents",
      label: t.overview.documents,
      value: counts?.documents,
    },
    {
      href: "#/app/dispatches?group=approval",
      label: t.overview.waiting,
      value: counts?.dispatches.approval,
    },
    {
      href: "#/app/dispatches?group=attention",
      label: t.overview.attention,
      value: counts?.dispatches.attention,
      warning: attention > 0,
    },
    {
      href: "#/app/dispatches",
      label: t.overview.tracked,
      value: counts?.dispatches.total,
    },
  ];
  const contacts = (
    <WorkspaceContacts key="contacts" session={session} compact />
  );
  const attentionNotice = attention > 0 && (
    <div
      key="attention"
      className="notice warning overview-attention"
      role="status"
    >
      <WarningCircle size={22} aria-hidden="true" />
      <div>
        <strong>{t.overview.attentionTitle}</strong>
        <p>{t.overview.attentionBody}</p>
        <a className="text-link" href="#/app/dispatches?group=attention">
          {t.overview.attentionAction}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
  const assistantStart =
    permissions.prepareDispatches &&
    (dailyOverview ? (
      <div className="dashboard-daily-shortcuts" key="assistant">
        <a className="text-link" href="#/app/connection">
          {msg("View my connections")}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
    ) : (
      <OverviewAssistantStart key="assistant" session={session} />
    ));
  const studioLinks = !isPublicPreview && permissions.prepareDispatches && (
    <nav
      key="studio"
      className="studio-entry-links"
      aria-label={msg("Create personalised documents")}
    >
      <a className="button" href="#/app/templates?new=blank">
        {msg("Create a document")} <ArrowRight size={17} />
      </a>
      <a className="button" href="#/app/templates">
        {msg("Use a template")} <ArrowRight size={17} />
      </a>
      <a className="button" href="#/app/datasets">
        {msg("Import my data")} <ArrowRight size={17} />
      </a>
    </nav>
  );
  const activity = (
    <Fragment key="activity">
      {permissions.viewReports && (
        <ul className="overview-stats" aria-label={t.overview.statsLabel}>
          {stats.map((stat) => (
            <li key={stat.href}>
              <a
                href={stat.href}
                className={stat.warning ? "stat-warning" : undefined}
              >
                <span>{stat.label}</span>
                <strong>{stat.value ?? "·"}</strong>
              </a>
            </li>
          ))}
        </ul>
      )}
      <ErrorNotice error={overview.error ?? dispatches.error} retry={refresh} />
      <div className="section-toolbar">
        <h2>{t.overview.recent}</h2>
        <a href="#/app/dispatches" className="text-link">
          {t.overview.all}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
      {dispatches.loading && !dispatches.data ? (
        <Loading />
      ) : dispatches.data?.items.length ? (
        <DispatchTable items={dispatches.data.items.slice(0, 6)} />
      ) : (
        <EmptyState
          title={t.overview.emptyTitle}
          text={t.overview.emptyBody}
          action={
            permissions.prepareDispatches && (
              <a
                className={appearance === "v2" ? "button" : "button primary"}
                href="#/app/documents"
              >
                {t.documents.import}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            )
          }
        />
      )}
    </Fragment>
  );
  // Keyed regions move without remounting the contact directory. Existing
  // workshops lead with their work; classic and empty workshops retain the
  // full introductory order (docs/ASSISTANT_HUB.md).
  const regions = dailyOverview
    ? [attentionNotice, activity, assistantStart, studioLinks, contacts]
    : [contacts, attentionNotice, assistantStart, studioLinks, activity];
  return (
    <>
      <div className="dashboard-editorial-heading">
        <PageHeading
          title={t.overview.title}
          intro={t.overview.intro}
          action={
            appearance === "v2" &&
            permissions.prepareDispatches && (
              <a className="button primary" href="#/app/prepare">
                <Plus size={18} aria-hidden="true" />
                {t.dispatch.new}
              </a>
            )
          }
        />
      </div>
      {regions}
    </>
  );
}

export function Documents({ canPrepare = true }: { canPrepare?: boolean }) {
  const { appearance } = useDashboardAppearance();
  const resource = useResource<Page<DocumentRecord>>("/documents");
  const action = useAction();
  const route = useRoute();
  const selectedId = new URLSearchParams(route.split("?")[1]).get("document");
  const followup = useDocumentFollowup(
    selectedId,
    isPublicPreview
      ? resource.data?.items.find((item) => item.id === selectedId)
      : undefined,
  );
  const selected = followup.document;
  const analysis = selected ? analysisOf(selected) : undefined;
  const updateDocumentList = resource.setData;
  useEffect(() => {
    if (!selected || isPublicPreview) return;
    updateDocumentList((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === selected.id ? selected : item,
            ),
          }
        : current,
    );
  }, [selected, updateDocumentList]);
  const [tab, setTab] = useState<"import" | "render" | null>(null);
  const [name, setName] = useState("");
  const [html, setHtml] = useState(t.documents.defaultHtml);
  const scanRequest = useRef<AbortController | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const documentHeading = useRef<HTMLHeadingElement>(null);
  const documentTrigger = useRef<HTMLButtonElement | null>(null);
  const previousSelection = useRef(selectedId);
  const loadedDocumentId = selected?.id;
  useEffect(() => {
    if (loadedDocumentId) documentHeading.current?.focus();
  }, [loadedDocumentId]);
  useEffect(() => {
    const closed = previousSelection.current && !selectedId;
    previousSelection.current = selectedId;
    if (
      closed &&
      documentTrigger.current?.isConnected &&
      !document.activeElement?.closest('[role="alert"]')
    )
      documentTrigger.current.focus();
  }, [selectedId]);
  useEffect(() => {
    if (tab === "import") file.current?.focus();
  }, [tab]);
  useEffect(() => () => scanRequest.current?.abort(), [selectedId]);
  function openDocument(document: DocumentRecord, trigger: HTMLButtonElement) {
    documentTrigger.current = trigger;
    action.clear();
    go(`/app/documents?document=${encodeURIComponent(document.id)}`);
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const chosen = file.current?.files?.[0];
      if (!chosen) return;
      const form = new FormData();
      form.append("file", chosen);
      const document = await api<DocumentRecord>("/documents", {
        method: "POST",
        body: form,
      });
      go(`/app/documents?document=${encodeURIComponent(document.id)}`);
      setTab(null);
      resource.refresh();
    });
  }
  async function render(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const document = await api<DocumentRecord>("/documents/render", {
        method: "POST",
        body: { name, html },
      });
      go(`/app/documents?document=${encodeURIComponent(document.id)}`);
      setTab(null);
      resource.refresh();
    });
  }
  async function rescan() {
    if (!selected) return;
    const controller = new AbortController();
    scanRequest.current = controller;
    await action.run(async () => {
      try {
        await api<DocumentRecord>(
          `/documents/${encodeURIComponent(selected.id)}/rescan`,
          { method: "POST", body: {}, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        followup.refresh();
        resource.refresh();
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
    });
  }
  return (
    <>
      <PageHeading
        title={t.documents.title}
        intro={t.documents.intro}
        action={
          canPrepare && (
            <div className="button-group">
              {!isPublicPreview && (
                <a className="button" href="#/app/templates">
                  {msg("Use a template")}
                </a>
              )}
              <button
                className="button"
                disabled={isPublicPreview}
                onClick={() => {
                  setTab("render");
                  action.clear();
                }}
              >
                <FileText size={18} />
                {t.documents.render}
              </button>
              <button
                className={
                  appearance === "v2" && (tab || selected)
                    ? "button"
                    : "button primary"
                }
                disabled={isPublicPreview}
                onClick={() => {
                  setTab("import");
                  action.clear();
                }}
              >
                <UploadSimple size={18} />
                {t.documents.import}
              </button>
            </div>
          )
        }
      />
      {isPublicPreview && (
        <p className="notice info">
          {msg(
            "Explore the example PDFs below. File import and PDF creation will be available in your private workspace.",
          )}
        </p>
      )}
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      <ErrorNotice error={action.error} />
      {followup.loading && !selected && <Loading />}
      {followup.issue && (
        <div className="notice warning document-followup-notice" role="status">
          <WarningCircle size={22} aria-hidden="true" />
          <div>
            <strong>
              {followup.issue === "network"
                ? t.documents.followupUnavailable
                : t.documents.followupPaused}
            </strong>
            <p>
              {selected
                ? t.documents.followupRecovery
                : t.documents.followupLoadError}
            </p>
            <button
              className="button"
              onClick={followup.refresh}
              disabled={followup.loading}
            >
              {t.documents.refreshStatus}
            </button>
          </div>
        </div>
      )}
      {canPrepare && tab && (
        <section className="form-panel">
          <div className="section-toolbar">
            <h2>
              {tab === "import"
                ? t.documents.uploadTitle
                : t.documents.renderTitle}
            </h2>
            <button className="text-button" onClick={() => setTab(null)}>
              {t.close}
            </button>
          </div>
          {tab === "import" ? (
            <form onSubmit={(e) => void upload(e)}>
              <p>{t.documents.uploadBody}</p>
              <Field label={t.documents.file} hint={t.documents.fileHint}>
                <FileInput accept="application/pdf,.pdf" required ref={file} />
              </Field>
              <button className="button primary" disabled={action.pending}>
                {action.pending ? t.loading : t.documents.upload}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void render(e)}>
              <Field label={t.documents.name}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.documents.namePlaceholder}
                  required
                  maxLength={160}
                />
              </Field>
              <Field label={t.documents.html} hint={t.documents.htmlHint}>
                <textarea
                  className="code-input"
                  rows={9}
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  required
                  maxLength={150000}
                />
              </Field>
              <button className="button primary" disabled={action.pending}>
                {action.pending ? t.loading : t.documents.renderAction}
              </button>
            </form>
          )}
        </section>
      )}
      {selected && analysis && (
        <section className="document-detail">
          <div className="section-toolbar">
            <div>
              <h2 ref={documentHeading} tabIndex={-1}>
                {selected.name}
              </h2>
              <DocumentStatus document={selected} />
            </div>
            <button
              className="text-button"
              onClick={() => {
                go("/app/documents");
                action.clear();
              }}
            >
              {t.close}
            </button>
          </div>
          <div
            className={`notice document-analysis ${analysis.state === "blocked" || analysis.state === "retryable" ? "warning" : "info"}`}
          >
            {analysis.state === "ready" ? (
              <ShieldCheck size={22} aria-hidden="true" />
            ) : (
              <FileText size={22} aria-hidden="true" />
            )}
            <div>
              <div role="status" aria-live="polite" aria-atomic="true">
                <h3>{msg(analysis.title)}</h3>
                <p>{msg(analysis.message)}</p>
              </div>
              {analysis.state === "processing" && !followup.issue && (
                <p className="document-followup-hint">
                  {t.documents.followupAutomatic}
                </p>
              )}
              {canPrepare &&
                !isPublicPreview &&
                analysis.nextAction === "rescan" && (
                  <button
                    className="button"
                    disabled={action.pending || followup.loading}
                    onClick={() => void rescan()}
                  >
                    {action.pending
                      ? t.documents.rescanning
                      : t.documents.rescan}
                  </button>
                )}
              {canPrepare &&
                !isPublicPreview &&
                analysis.nextAction === "replace_document" && (
                  <button
                    className="button"
                    onClick={() => {
                      setTab("import");
                      action.clear();
                    }}
                  >
                    {t.documents.chooseAnother}
                  </button>
                )}
              {(analysis.nextAction === "contact_support" ||
                analysis.state === "retryable") && (
                <a
                  className="text-link document-support"
                  href="mailto:guteneo@pieper.fr"
                >
                  {t.documents.contactSupport}
                </a>
              )}
            </div>
          </div>
          {selected.status === "ready" && (
            <PdfPreview id={selected.id} stableViewport />
          )}
          <dl className="document-metadata">
            <Definition label={t.documents.pages}>
              {selected.status === "ready"
                ? selected.pages
                : t.documents.pagesUnverified}
            </Definition>
            <Definition label={t.documents.size}>
              {bytes(selected.size)}
            </Definition>
            <Definition label={t.documents.source}>
              {selected.source === "import"
                ? t.documents.exact
                : t.documents.generated}
            </Definition>
            <Definition label={t.documents.integrity}>
              <code>{selected.sha256}</code>
            </Definition>
          </dl>
          <PdfValidation
            key={selected.id}
            document={selected}
            canValidate={canPrepare}
          />
          {canPrepare && (
            <a
              className={`button ${appearance === "v2" && tab ? "" : "primary"} ${selected.status !== "ready" ? "disabled-link" : ""}`}
              href={
                selected.status !== "ready"
                  ? undefined
                  : `#/app/prepare?document=${selected.id}`
              }
              tabIndex={selected.status !== "ready" ? -1 : undefined}
              aria-disabled={selected.status !== "ready"}
            >
              {t.documents.ready}
              <ArrowRight size={18} />
            </a>
          )}
        </section>
      )}
      {!!resource.data?.items.length && <DateTimezone />}
      {resource.loading && !resource.data ? (
        <Loading />
      ) : resource.data?.items.length ? (
        <div className="table-scroll">
          <table className="responsive-table" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  {t.document}
                </th>
                <th role="columnheader" scope="col">
                  {t.documents.pages}
                </th>
                <th role="columnheader" scope="col">
                  {t.documents.source}
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
              {resource.data.items.map((d) => (
                <tr role="row" key={d.id}>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.document}
                    </span>
                    <button
                      className="row-link text-button"
                      onClick={(event) => openDocument(d, event.currentTarget)}
                    >
                      {d.name}
                      <span className="reference mono">{d.id}</span>
                    </button>
                  </td>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.documents.pages}
                    </span>
                    {(selected?.id === d.id ? selected : d).status === "ready"
                      ? (selected?.id === d.id ? selected : d).pages
                      : t.documents.pagesUnverified}
                  </td>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.documents.source}
                    </span>
                    {d.source === "import"
                      ? t.documents.exact
                      : t.documents.generated}
                  </td>
                  <td role="cell">
                    <span className="mobile-cell-label" aria-hidden="true">
                      {t.status}
                    </span>
                    <DocumentStatus
                      document={selected?.id === d.id ? selected : d}
                    />
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
                    <button
                      className="icon-link"
                      aria-label={`${t.preview} ${d.name}`}
                      onClick={(event) => openDocument(d, event.currentTarget)}
                    >
                      <ArrowRight size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dashboard-document-empty">
          <EmptyState
            title={t.documents.emptyTitle}
            text={t.documents.emptyBody}
          />
        </div>
      )}
      <LoadMore
        path="/documents"
        data={resource.data}
        onLoaded={resource.setData}
      />
    </>
  );
}

export function PrepareDispatch({
  initialDocument,
  simulation,
  workspaceName,
  emailLocale,
}: {
  initialDocument: string;
  simulation: boolean;
  workspaceName: string;
  emailLocale: SupportedLocale;
}) {
  const documents = useResource<Page<DocumentRecord>>("/documents");
  const initial = useResource<DocumentRecord>(
    initialDocument && !isPublicPreview
      ? `/documents/${encodeURIComponent(initialDocument)}`
      : null,
  );
  const senders = useResource<{ items: Sender[] }>("/senders");
  const action = useAction();
  const route = useRoute();
  const key = useRef(crypto.randomUUID());
  const [channel, setChannel] = useState<Channel>(() =>
    ["postal", "email"].includes(
      new URLSearchParams(route.split("?")[1]).get("channel") ?? "",
    )
      ? (new URLSearchParams(route.split("?")[1]).get("channel") as Channel)
      : "fax",
  );
  const [documentId, setDocumentId] = useState(initialDocument);
  const [emailDeliveryMode, setEmailDeliveryMode] = useState<DocumentEmailMode>(
    isPublicPreview ? "attachment" : "my_documents",
  );
  const [retentionDays, setRetentionDays] = useState<7 | 30 | 90 | 365>(7);
  const [allowOriginalDownload, setAllowOriginalDownload] = useState(true);
  const [uploaded, setUploaded] = useState<DocumentRecord>();
  const uploadFollowup = useDocumentFollowup(uploaded?.id ?? null);
  const uploadedDocument = uploadFollowup.document ?? uploaded;
  const [senderId, setSenderId] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  // One budget in euros for every channel; the API receives integer cents.
  const [budget, setBudget] = useState("5");
  const ceilingMinor = euroToMinor(budget);
  const [printMode, setPrintMode] = useState<"simplex" | "duplex">("simplex");
  const [printSpectrum, setPrintSpectrum] = useState<"grayscale" | "color">(
    "grayscale",
  );
  const [deliveryProduct, setDeliveryProduct] = useState<"cheap" | "fast">(
    "cheap",
  );
  const [recipient, setRecipient] = useState<Record<string, string>>({
    country: "FR",
  });
  const [addressMode, setAddressMode] = useState<PostalAddressMode>("document");
  const [addressPosition, setAddressPosition] = useState<"left" | "right">();
  const requirements = useResource<{
    profile: {
      addressPosition: "left" | "right";
      addressPositions: ("left" | "right")[];
    };
  }>(
    channel === "postal" && !simulation
      ? `/postal/requirements?country=${encodeURIComponent(recipient.country ?? "FR")}`
      : null,
  );
  const positions = requirements.data?.profile.addressPositions ?? [];
  const selectedPosition =
    addressPosition && positions.includes(addressPosition)
      ? addressPosition
      : requirements.data?.profile.addressPosition;
  const [generated, setGenerated] = useState<PostalAddressPageResult>();
  const [generationAttempted, setGenerationAttempted] = useState(false);
  const [continueGenerated, setContinueGenerated] = useState(false);
  const generationKey = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const addsAddressPage =
    channel === "postal" &&
    !simulation &&
    addressMode === "generated_address_page";
  const generatedFollowup = useDocumentFollowup(
    addsAddressPage ? (generated?.document.id ?? null) : null,
  );
  const finalDocument = generatedFollowup.document ?? generated?.document;
  const generatedAnalysis = finalDocument
    ? analysisOf(finalDocument)
    : undefined;
  const generatedReady =
    !!finalDocument &&
    finalDocument.status === "ready" &&
    generatedAnalysis?.state === "ready" &&
    !generatedFollowup.issue;
  const candidates = new Map(
    (documents.data?.items ?? []).map((item) => [item.id, item]),
  );
  if (initial.data?.id === initialDocument)
    candidates.set(initial.data.id, initial.data);
  if (uploadedDocument) candidates.set(uploadedDocument.id, uploadedDocument);
  const available = [...candidates.values()].filter(
    (item) => item.status === "ready",
  );
  const documentUnavailable =
    !!documentId && !available.some((item) => item.id === documentId);
  const matchingSenders =
    senders.data?.items.filter((s) => s.channel === channel) ?? [];
  const selectedSender =
    matchingSenders.find((s) => s.id === senderId)?.id ??
    matchingSenders[0]?.id;
  const handlePostalSetupStatus = useCallback(() => {}, []);
  const setAddress = (field: string, value: string) => {
    setRecipient((r) => ({ ...r, [field]: value }));
    key.current = crypto.randomUUID();
  };
  async function importForDispatch(file: File | undefined) {
    if (!file) return;
    await action.run(async () => {
      const form = new FormData();
      form.append("file", file);
      const imported = await api<DocumentRecord>("/documents", {
        method: "POST",
        body: form,
      });
      setUploaded(imported);
      setDocumentId(imported.id);
      documents.refresh();
    });
  }
  async function prepare() {
    if (submitting.current) return;
    submitting.current = true;
    await action.run(async () => {
      if (documentUnavailable)
        throw new Error(msg("Check the PDF before preparing the delivery."));
      if (ceilingMinor === null) throw new Error(t.dispatch.ceilingInvalid);
      const target =
        channel === "fax"
          ? { phone: normalizeFaxNumber(recipient.phone ?? "") }
          : channel === "email"
            ? { email: recipient.email ?? "" }
            : {
                name: recipient.name ?? "",
                line1: recipient.line1 ?? "",
                postalCode: recipient.postalCode ?? "",
                city: recipient.city ?? "",
                country: recipient.country ?? "FR",
              };
      if (channel === "postal" && !simulation) {
        if (requirements.loading || requirements.error || !selectedPosition)
          throw new Error(
            msg(
              "Letter options are not available yet. Try loading them again.",
            ),
          );
        if (addsAddressPage && !generated) {
          setGenerationAttempted(true);
          const result = await api<PostalAddressPageResult>(
            "/postal/address-pages",
            {
              method: "POST",
              key: generationKey.current,
              body: {
                documentId,
                recipient: target,
                printMode,
                addressPosition: selectedPosition,
              },
            },
          );
          setGenerated(result);
          setContinueGenerated(true);
          return;
        }
        if (addsAddressPage && !generatedReady)
          throw new Error(
            msg(
              "Wait for the final PDF to be verified before the postal check.",
            ),
          );
        const review = await api<PostalReview>("/postal/preflights", {
          method: "POST",
          key: key.current,
          body: {
            documentId: addsAddressPage ? finalDocument!.id : documentId,
            senderId: selectedSender,
            recipient: target,
            options: {
              printMode,
              printSpectrum,
              deliveryProduct,
              addressPosition: selectedPosition,
            },
            ceilingMinor,
          },
        });
        go(`/app/postal/${encodeURIComponent(review.id)}`);
        return;
      }
      if (
        channel === "email" &&
        documentId &&
        emailDeliveryMode === "my_documents"
      ) {
        const distribution = await api<SecureDistributionView>(
          "/secure-distributions",
          {
            method: "POST",
            key: key.current,
            body: {
              documentId,
              senderId: selectedSender,
              recipient: { address: recipient.email },
              retentionDays,
              allowOriginalDownload,
              recipientBinding: "verified_email",
              ...(subject.trim() ? { subject } : {}),
              ...(text.trim() ? { message: text } : {}),
              ...(html.trim() ? { html } : {}),
              notificationLocale: emailLocale,
              costCeilingMinor: ceilingMinor,
            },
          },
        );
        go(`/app/secure-distribution/${encodeURIComponent(distribution.id)}`);
        return;
      }
      const dispatch = await api<Dispatch>("/dispatches", {
        method: "POST",
        key: key.current,
        body: {
          channel,
          recipient: target,
          documentId: documentId || undefined,
          senderId: selectedSender,
          subject: channel === "email" && subject.trim() ? subject : undefined,
          html: channel === "email" && html.trim() ? html : undefined,
          text: channel === "email" && text.trim() ? text : undefined,
          options:
            channel === "email" && documentId
              ? { emailDeliveryMode: "attachment" }
              : undefined,
          ceilingMinor,
        },
      });
      go(`/app/dispatch/${dispatch.id}`);
    });
    submitting.current = false;
  }
  useEffect(() => {
    if (
      !continueGenerated ||
      !addsAddressPage ||
      !generatedReady ||
      action.pending
    )
      return;
    // The user's preparation request continues after the final PDF scan. It
    // still stops at the exact-document review, before any external transfer.
    setContinueGenerated(false);
    void prepare();
    // Runs on these transitions only; `prepare` is this render's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueGenerated, addsAddressPage, generatedReady, action.pending]);
  const changed = () => {
    key.current = crypto.randomUUID();
    generationKey.current = crypto.randomUUID();
    setGenerated(undefined);
    setGenerationAttempted(false);
    setContinueGenerated(false);
    action.clear();
  };
  return (
    <>
      <PageHeading
        title={
          channel === "postal" ? msg("Prepare your letter.") : t.dispatch.title
        }
        intro={
          channel === "postal"
            ? msg(
                "Choose the PDF, its recipient and the envelope window. You will then check the document and price before sending.",
              )
            : t.dispatch.intro
        }
      />
      <ErrorNotice
        error={
          documents.error ?? initial.error ?? senders.error ?? action.error
        }
      />
      {channel === "postal" && !simulation && (
        <ErrorNotice error={requirements.error} retry={requirements.refresh} />
      )}
      {channel === "postal" &&
        !simulation &&
        !senders.loading &&
        !senders.error &&
        !selectedSender && (
          <PostalSetupPanel
            onUpdated={senders.refresh}
            onStatus={handlePostalSetupStatus}
          />
        )}
      <form
        className="prepare-layout"
        onSubmit={(event) => {
          event.preventDefault();
          void prepare();
        }}
        aria-busy={action.pending}
      >
        <fieldset
          className="prepare-fields"
          disabled={action.pending}
          onChange={changed}
        >
          <legend className="sr-only">{msg("Delivery preparation")}</legend>
          <fieldset className="channel-selector">
            <legend>{t.channel}</legend>
            {(["fax", "email", "postal"] as const).map((c) => (
              <label key={c}>
                <input
                  type="radio"
                  name="channel"
                  value={c}
                  checked={channel === c}
                  onChange={() => {
                    setChannel(c);
                    setSenderId("");
                  }}
                />
                <span>{t.channels[c]}</span>
              </label>
            ))}
          </fieldset>
          <Field
            label={channel === "email" ? t.dispatch.attachment : t.document}
          >
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              required={channel !== "email"}
            >
              <option value="">
                {channel === "email"
                  ? t.dispatch.none
                  : t.dispatch.chooseDocument}
              </option>
              {initialDocument &&
                !available.some((d) => d.id === initialDocument) && (
                  <option value={initialDocument} disabled>
                    {initial.loading
                      ? msg("Loading PDF…")
                      : msg("PDF needs checking")}
                  </option>
                )}
              {uploadedDocument && uploadedDocument.status !== "ready" && (
                <option value={uploadedDocument.id} disabled>
                  {uploadedDocument.name} · vérification en cours
                </option>
              )}
              {available.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name} · {d.pages} {msg(" pp.")}
                </option>
              ))}
            </select>
          </Field>
          {!isPublicPreview && (
            <Field
              label={msg("Or import a PDF")}
              hint={msg(
                "Your file is checked here, without leaving preparation.",
              )}
            >
              <FileInput
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  void importForDispatch(event.target.files?.[0])
                }
              />
            </Field>
          )}
          {documentUnavailable && !initial.loading && (
            <p
              className="field-hint"
              id="prepare-document-unavailable"
              role="status"
            >
              {uploadedDocument?.id === documentId
                ? msg(analysisOf(uploadedDocument).message)
                : msg(
                    "This PDF must be verified before preparing the delivery.",
                  )}{" "}
              <a
                href={`#/app/documents?document=${encodeURIComponent(documentId)}`}
              >
                {msg("View PDF status")}
              </a>
            </p>
          )}
          <LoadMore
            path="/documents"
            data={documents.data}
            onLoaded={documents.setData}
          />
          {!available.length && channel !== "email" && (
            <p className="field-hint">
              {t.dispatch.noDocument}{" "}
              <a href="#/app/documents">{t.documents.import}</a>
            </p>
          )}
          {channel === "email" && documentId && !documentUnavailable && (
            <DocumentDeliveryChoice
              mode={emailDeliveryMode}
              days={retentionDays}
              allowDownload={allowOriginalDownload}
              onMode={(value) => {
                setEmailDeliveryMode(value);
                changed();
              }}
              onDays={(value) => {
                setRetentionDays(value);
                changed();
              }}
              onDownload={(value) => {
                setAllowOriginalDownload(value);
                changed();
              }}
              preview={isPublicPreview}
            />
          )}
          <Field label={t.dispatch.sender}>
            <select
              value={selectedSender ?? ""}
              onChange={(e) => setSenderId(e.target.value)}
            >
              {matchingSenders.length ? (
                matchingSenders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? s.address ?? s.id}
                  </option>
                ))
              ) : (
                <option value="">
                  {simulation
                    ? t.dispatch.defaultSender
                    : msg("No verified sender for this channel")}
                </option>
              )}
            </select>
          </Field>
          {channel === "email" && !simulation && selectedSender && (
            <p className="field-hint">
              {msg(
                "Sent by Guteneo. Recipient replies arrive at your verified email address.",
              )}
            </p>
          )}
          <div className="form-divider" />
          {channel === "postal" && !simulation && (
            <PostalAddressChoice
              mode={addressMode}
              onChange={setAddressMode}
              printMode={printMode}
              addressPosition={selectedPosition ?? "left"}
              positions={positions}
              onPositionChange={setAddressPosition}
            />
          )}
          {channel === "fax" ? (
            <Field
              label={t.dispatch.phone}
              hint={msg(
                "International format: + followed by the country code and number (e.g. +352 …), without the national 0. Spaces, dots and dashes are removed during preparation.",
              )}
            >
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                pattern={FAX_INPUT_PATTERN}
                placeholder={t.dispatch.phonePlaceholder}
                value={recipient.phone ?? ""}
                onChange={(e) => setAddress("phone", e.target.value)}
                required
              />
            </Field>
          ) : channel === "email" ? (
            <>
              <Field label={t.dispatch.email}>
                <input
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t.dispatch.emailPlaceholder}
                  value={recipient.email ?? ""}
                  onChange={(e) => setAddress("email", e.target.value)}
                  required
                />
              </Field>
              <Field
                label={
                  documentId ? msg("Subject (optional)") : t.dispatch.subject
                }
              >
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required={!documentId}
                  placeholder={
                    documentId ? msg("Automatic subject") : undefined
                  }
                  maxLength={200}
                />
              </Field>
              <EmailComposer
                text={text}
                html={html}
                onText={setText}
                onHtml={(value) => {
                  setHtml(value);
                  changed();
                }}
                documentEmail={!!documentId}
                textLimit={
                  documentId && emailDeliveryMode === "my_documents"
                    ? 16000
                    : 150000
                }
                documentLink={
                  !!documentId && emailDeliveryMode === "my_documents"
                }
                notificationLocale={emailLocale}
              />
            </>
          ) : (
            <>
              <Field label={t.dispatch.postalName}>
                <input
                  value={recipient.name ?? ""}
                  onChange={(e) => setAddress("name", e.target.value)}
                  required
                  maxLength={200}
                  autoComplete="name"
                />
              </Field>
              <Field label={t.dispatch.line1}>
                <input
                  value={recipient.line1 ?? ""}
                  onChange={(e) => setAddress("line1", e.target.value)}
                  required
                  maxLength={200}
                  autoComplete="address-line1"
                />
              </Field>
              <div className="field-row">
                <Field label={t.dispatch.postalCode}>
                  <input
                    value={recipient.postalCode ?? ""}
                    onChange={(e) => setAddress("postalCode", e.target.value)}
                    required
                    maxLength={30}
                    autoComplete="postal-code"
                  />
                </Field>
                <Field label={t.dispatch.city}>
                  <input
                    value={recipient.city ?? ""}
                    onChange={(e) => setAddress("city", e.target.value)}
                    required
                    maxLength={200}
                    autoComplete="address-level2"
                  />
                </Field>
              </div>
              <Field label={t.dispatch.country}>
                <select
                  value={recipient.country}
                  onChange={(e) => setAddress("country", e.target.value)}
                >
                  {Object.entries(t.dispatch.countries).map(([code, name]) => (
                    <option value={code} key={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              {!simulation && (
                <PostalCutoffNotice
                  country={recipient.country}
                  deliveryProduct={deliveryProduct}
                />
              )}
            </>
          )}
          {channel === "postal" && !simulation && (
            <fieldset className="postal-form-options">
              <legend>{msg("Printing and delivery")}</legend>
              <Field label={msg("Printed sides")}>
                <select
                  value={printMode}
                  onChange={(event) =>
                    setPrintMode(event.target.value as "simplex" | "duplex")
                  }
                >
                  <option value="simplex">{msg("Single-sided")}</option>
                  <option value="duplex">{msg("Double-sided")}</option>
                </select>
              </Field>
              <Field label={msg("Colours")}>
                <select
                  value={printSpectrum}
                  onChange={(event) =>
                    setPrintSpectrum(
                      event.target.value as "grayscale" | "color",
                    )
                  }
                >
                  <option value="grayscale">{msg("Black and white")}</option>
                  <option value="color">{msg("Colour")}</option>
                </select>
              </Field>
              <Field
                label={msg("Preferred delivery")}
                hint={msg(
                  "Availability and price will be confirmed by the quote.",
                )}
              >
                <select
                  value={deliveryProduct}
                  onChange={(event) =>
                    setDeliveryProduct(event.target.value as "cheap" | "fast")
                  }
                >
                  <option value="cheap">{msg("Economy")}</option>
                  <option value="fast">{msg("Priority")}</option>
                </select>
              </Field>
              <p className="field-hint">
                {msg(
                  "You will check the document and its address before requesting the delivery price.",
                )}
              </p>
            </fieldset>
          )}
          {channel === "postal" && !simulation ? (
            <details className="postal-budget">
              <summary>
                {msg("Maximum budget: ")}
                {ceilingMinor === null
                  ? msg("to be specified")
                  : money(ceilingMinor)}
              </summary>
              <Field
                label={msg("Maximum budget in euros")}
                hint={msg(
                  "The exact price will be shown before sending. Adjust this cap if needed.",
                )}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  pattern={EURO_INPUT_PATTERN}
                  title={t.dispatch.ceilingFormat}
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  required
                />
              </Field>
            </details>
          ) : (
            <Field label={t.dispatch.ceiling} hint={t.dispatch.ceilingHelp}>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                pattern={EURO_INPUT_PATTERN}
                title={t.dispatch.ceilingFormat}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                required
              />
            </Field>
          )}
          <button
            className="button primary full"
            disabled={
              action.pending ||
              (channel === "postal" &&
                !simulation &&
                (requirements.loading ||
                  !!requirements.error ||
                  !selectedPosition)) ||
              (addsAddressPage && !!generated && !generatedReady) ||
              documentUnavailable ||
              (channel !== "email" && !documentId) ||
              (!simulation && !selectedSender)
            }
            aria-describedby={
              [
                channel !== "email" && !documentId
                  ? "prepare-document-required"
                  : "",
                documentUnavailable ? "prepare-document-unavailable" : "",
                !simulation && !selectedSender ? "prepare-sender-required" : "",
                addsAddressPage && generated && !generatedReady
                  ? "postal-generated-status"
                  : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          >
            {action.pending
              ? addsAddressPage && !generated
                ? msg("Creating the final PDF…")
                : t.dispatch.preparing
              : addsAddressPage && !generated
                ? generationAttempted
                  ? msg("Retry PDF creation")
                  : msg("Prepare the letter")
                : addsAddressPage && !generatedReady
                  ? msg("Verifying the final PDF…")
                  : channel === "postal" && !simulation
                    ? msg("Prepare the letter")
                    : t.dispatch.prepare}
            <ArrowRight size={18} />
          </button>
          {addsAddressPage &&
            generationAttempted &&
            !generated &&
            !action.pending && (
              <p className="field-hint">
                {msg(
                  "Try again without changing the fields to retrieve the same creation and avoid a duplicate.",
                )}
              </p>
            )}
          {channel !== "email" && !documentId && (
            <p id="prepare-document-required" className="field-hint">
              {msg("Choose a document to prepare this delivery.")}
            </p>
          )}
          {!simulation && !selectedSender && (
            <p id="prepare-sender-required" className="field-hint">
              {channel === "postal"
                ? t.postalSetup.required
                : msg(
                    "A sender must be verified for this channel before preparation.",
                  )}{" "}
              <a href="#/app/senders">
                {channel === "postal"
                  ? t.postalSetup.setupLink
                  : msg("View senders")}
              </a>
              .
            </p>
          )}
        </fieldset>
        <aside className="prepare-preview">
          {addsAddressPage ? (
            generated && finalDocument && generatedAnalysis ? (
              <>
                <div
                  id="postal-generated-status"
                  className="postal-generated-status"
                  role="status"
                  aria-live="polite"
                >
                  <h2>{msg(generatedAnalysis.title)}</h2>
                  <p>{msg(generatedAnalysis.message)}</p>
                  {generatedFollowup.issue && (
                    <p>
                      {generatedFollowup.issue === "network"
                        ? t.documents.followupUnavailable
                        : t.documents.followupPaused}
                    </p>
                  )}
                  {(!generatedReady || generatedFollowup.issue) && (
                    <button
                      className="button small"
                      type="button"
                      onClick={generatedFollowup.refresh}
                      disabled={generatedFollowup.loading}
                    >
                      {msg("Refresh verification")}
                    </button>
                  )}
                  {(generatedAnalysis.state === "retryable" ||
                    generatedAnalysis.state === "blocked") && (
                    <p>
                      <a
                        href={`#/app/documents?document=${encodeURIComponent(finalDocument.id)}`}
                      >
                        {msg("Resume tracking this PDF")}
                      </a>
                    </p>
                  )}
                </div>
                {generatedReady && (
                  <>
                    <PostalAddressPageSummary
                      document={finalDocument}
                      provenance={generated.provenance}
                    />
                    <PdfPreview id={finalDocument.id} />
                  </>
                )}
              </>
            ) : (
              <div className="preview-empty postal-generated-empty">
                <FileText size={54} weight="light" aria-hidden="true" />
                <p>
                  {msg(
                    "Create the PDF with the address page to display the exact preview of the complete letter.",
                  )}
                </p>
              </div>
            )
          ) : channel === "email" && (documentId || text || html) ? (
            <>
              <h2>{t.dispatch.htmlPreview}</h2>
              <EmailPreview
                html={
                  documentId && !html.trim()
                    ? renderTransactionalEmail({
                        text: text.trim()
                          ? text
                          : documentEmailDefaults(
                              workspaceName,
                              emailDeliveryMode,
                              emailLocale,
                            ).text,
                        workspaceName,
                        documentTitle: candidates.get(documentId)?.name,
                        preferencesUrl: "#",
                        locale: emailLocale,
                        ...(emailDeliveryMode === "my_documents"
                          ? { accountDocument: { url: "#", retentionDays } }
                          : {}),
                      })
                    : emailDraftHtml(text, html)
                }
              />
              {!!documentId && emailDeliveryMode === "my_documents" && (
                <p className="field-hint">
                  {msg(
                    "The final button will open My documents for the recipient’s account.",
                  )}
                </p>
              )}
            </>
          ) : documentId && !documentUnavailable ? (
            <PdfPreview id={documentId} />
          ) : (
            <div className="preview-empty">
              <FileText size={54} weight="light" />
              <p>{t.dispatch.chooseDocument}</p>
            </div>
          )}
          <div className="approval-explainer">
            <ShieldCheck size={25} weight="light" />
            <p>{t.dispatch.approvalExplain}</p>
          </div>
        </aside>
      </form>
    </>
  );
}

export function DispatchList({ canPrepare = true }: { canPrepare?: boolean }) {
  const route = useRoute();
  const requested = new URLSearchParams(route.split("?")[1]).get("group");
  const group = isDispatchGroup(requested) ? requested : undefined;
  const path = group ? `/dispatches?group=${group}` : "/dispatches";
  return (
    <>
      <PageHeading
        title={t.dispatch.listTitle}
        intro={t.dispatch.listIntro}
        action={
          canPrepare && (
            <a className="button primary" href="#/app/prepare">
              <Plus size={18} aria-hidden="true" />
              {t.dispatch.new}
            </a>
          )
        }
      />
      {/* A new key per filter: never show the previous selection's rows. */}
      <DispatchListResults
        key={path}
        path={path}
        filtered={!!group}
        canPrepare={canPrepare}
      >
        <nav className="dispatch-filter" aria-label={t.dispatch.filterLabel}>
          {([undefined, ...dispatchGroupNames] as const).map((item) => (
            <a
              key={item ?? "all"}
              href={
                item ? `#/app/dispatches?group=${item}` : "#/app/dispatches"
              }
              aria-current={item === group ? "page" : undefined}
            >
              {t.dispatch.groups[item ?? "all"]}
            </a>
          ))}
        </nav>
      </DispatchListResults>
    </>
  );
}

function DispatchListResults({
  canPrepare,
  path,
  filtered,
  children,
}: {
  path: string;
  filtered: boolean;
  canPrepare: boolean;
  children: ReactNode;
}) {
  const resource = useResource<Page<Dispatch>>(path);
  // Pages added with "load more" stay until an explicit refresh: re-reading
  // the first page on focus would drop them and move the reading position.
  const [extended, setExtended] = useState(false);
  const refresh = resource.refresh;
  const reload = useCallback(() => {
    setExtended(false);
    refresh();
  }, [refresh]);
  useRefreshOnFocus(refresh, !extended);
  return (
    <>
      <div className="section-toolbar">
        {children}
        <RefreshButton onClick={reload} disabled={resource.loading} />
      </div>
      <ErrorNotice error={resource.error} retry={reload} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        resource.data &&
        (filtered && !resource.data.items.length ? (
          <p className="empty-inline">{t.dispatch.groupEmpty}</p>
        ) : (
          <DispatchTable items={resource.data.items} canPrepare={canPrepare} />
        ))
      )}
      <LoadMore
        path={path}
        data={resource.data}
        onLoaded={(page) => {
          setExtended(true);
          resource.setData(page);
        }}
      />
    </>
  );
}

export function DispatchDetailPage({
  id,
  simulation,
  canApprove = true,
  canPrepare = true,
}: {
  id: string;
  simulation: boolean;
  canApprove?: boolean;
  canPrepare?: boolean;
}) {
  const resource = useResource<DispatchDetail>(
    `/dispatches/${encodeURIComponent(id)}`,
  );
  const action = useAction();
  const [consent, setConsent] = useState(false);
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
  useEffect(() => {
    setConsent(false);
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
  useEffect(() => {
    if (
      !dispatchStatus ||
      (!["accepted", "queued", "submitting", "submitted", "sending"].includes(
        dispatchStatus,
      ) &&
        settlementStatus !== "reserved")
    )
      return;
    const interval = window.setInterval(
      resource.refresh,
      ["delivered", "failed", "cancelled"].includes(dispatchStatus)
        ? 15000
        : 3000,
    );
    return () => window.clearInterval(interval);
  }, [dispatchStatus, settlementStatus, resource.refresh]);
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
  const pendingApproval =
    !reviewPreparationOnly && ["prepared", "draft"].includes(d.status);
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
  const cancelAllowed = ["prepared", "queued"].includes(d.status);
  const postalPriceUnavailable =
    d.channel === "postal" &&
    d.mode === "production" &&
    (d.currency !== "EUR" ||
      !Number.isSafeInteger(d.quote_customer_nanoeur) ||
      (d.quote_customer_nanoeur ?? -1) < 0 ||
      !Number.isFinite(Date.parse(d.quote_expires_at ?? "")));
  const postalSendLabel = `${d.mode === "simulation" ? msg("Simulate sending for") : msg("Send for")} ${quotedMoney(d)}${d.quote_pricing_basis === "public_list_price_ex_tax" ? msg(" excl. tax") : ""}`;
  async function readPostalOutcome(revision: number) {
    const current = await api<DispatchDetail>(
      `/dispatches/${encodeURIComponent(id)}`,
    );
    if (postalViewRevision.current !== revision) return;
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
    const revision = postalViewRevision.current;
    await action.run(async () => {
      try {
        if (!approved)
          await api(`/dispatches/${encodeURIComponent(id)}/approve`, {
            method: "POST",
            body: { fingerprint: d.fingerprint },
          });
        if (postalViewRevision.current !== revision) return;
        // The same human click approves this immutable version and requests
        // acceptance. This stable key also protects an explicit later retry.
        await api(`/dispatches/${encodeURIComponent(id)}/confirm`, {
          method: "POST",
          key: `web-confirm:${id}`,
          body: {},
        });
        if (postalViewRevision.current !== revision) return;
        setPostalReadRequired(true);
        await readPostalOutcome(revision);
      } catch (error) {
        if (postalViewRevision.current !== revision) return;
        if (error instanceof ApiError && error.code === "LIVE_QUOTE_INVALID")
          setInvalidQuoteId(id);
        // A lost response can follow committed acceptance. Only read status;
        // never automatically repeat approval or submission after uncertainty.
        setPostalReadRequired(true);
        try {
          const current = await readPostalOutcome(revision);
          if (
            current &&
            !["prepared", "draft"].includes(current.dispatch.status)
          )
            return;
        } catch {
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
    await action.run(async () => {
      await readPostalOutcome(revision);
    });
  }
  async function approve() {
    await action.run(async () => {
      try {
        await api(`/dispatches/${encodeURIComponent(id)}/approve`, {
          method: "POST",
          body: {
            fingerprint: d?.fingerprint,
            ...(emailAttestationRequired ? { recipientRequested } : {}),
          },
        });
        if (d?.channel === "email") {
          try {
            await api(`/dispatches/${encodeURIComponent(id)}/confirm`, {
              method: "POST",
              key: `web-confirm:${id}`,
              body: {},
            });
          } finally {
            // If acceptance is interrupted, read the same dispatch and expose
            // its approved state for an idempotent retry; never prepare again.
            resource.refresh();
          }
        } else resource.refresh();
      } catch (error) {
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
    await action.run(async () => {
      try {
        await api(`/dispatches/${encodeURIComponent(id)}/confirm`, {
          method: "POST",
          key: `web-confirm:${id}`,
          body: {},
        });
        resource.refresh();
      } catch (error) {
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
    await action.run(async () => {
      const replacement = await api<Dispatch>(
        `/dispatches/${encodeURIComponent(id)}/renew-quote`,
        { method: "POST", key: `web-renew:${id}`, body: {} },
      );
      setConsent(false);
      setRecipientRequested(false);
      go(`/app/dispatch/${encodeURIComponent(replacement.id)}`);
    });
  }
  async function cancel() {
    await action.run(async () => {
      await api(`/dispatches/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        body: {},
      });
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
            : t.dispatch.listTitle
        }
        intro={
          pendingApproval || approved
            ? t.dispatch.reviewIntro
            : t.dispatch.deliveryNote
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
      <div className="dispatch-reference">
        <code>{d.id}</code>
        <Status status={approved ? "approved" : d.status} channel={d.channel} />
        {d.mode === "simulation" && (
          <span className="simulation-stamp">{t.simulation}</span>
        )}
      </div>
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
          <p>{t.dispatch.uncertain}</p>
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
      <div className="dispatch-detail-layout dispatch-review-regions">
        <section className="dispatch-review-facts">
          <dl className="dispatch-facts">
            <Definition label={t.channel}>
              <ChannelLabel channel={d.channel} />
            </Definition>
            <Definition label={t.dispatch.recipientDetails}>
              <address>
                {Object.values(target)
                  .filter(Boolean)
                  .map((value, index) => (
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
              stableViewport
            />
          )}
        </section>
        <section className="dispatch-review-actions">
          {pendingApproval && !canApprove && <RolePermissionNotice />}
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
            <summary>{t.dispatch.version}</summary>
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
      <section className="timeline-section">
        <h2>{t.dispatch.timeline}</h2>
        {(events.length > 0 || !!resource.data?.attempts.length) && (
          <DateTimezone />
        )}
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
                        name.replaceAll(".", " · ").replaceAll("_", " ")}
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
        <details className="technical-details">
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
    </>
  );
}
