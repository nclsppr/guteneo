import { FAX_OPERATOR_TEST_NOTICE } from "../../../packages/contracts/src/fax-pricing";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { documentAnalysis } from "../../../packages/contracts/src/document-analysis";
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
  ApiError,
  bytes,
  date,
  money,
  nanoMoney,
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
import { OverviewAssistantStart } from "./assistant-workspace";
import { fr as t } from "./i18n";
import type { PostalReview } from "../../../packages/contracts/src/postal-review";
import {
  PostalAddressChoice,
  PostalAddressPageSummary,
  type PostalAddressMode,
} from "./postal-address-page";
import type { PostalAddressPageResult } from "../../../packages/contracts/src/postal-address-page";
import { PostalSetupPanel } from "./postal-setup-panel";
import {
  ChannelLabel,
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
  sesErrorMessage,
  useAction,
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
    processing: "Vérification en cours",
    ready: "PDF prêt",
    retryable: "À vérifier",
    blocked: "PDF indisponible",
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
  const documents = useResource<Page<DocumentRecord>>("/documents");
  const dispatches = useResource<Page<Dispatch>>("/dispatches");
  return (
    <>
      <PageHeading title={t.overview.title} intro={t.overview.intro} />
      <OverviewAssistantStart session={session} />
      <div className="overview-stats">
        <div>
          <span>{t.overview.documents}</span>
          <strong>{documents.data?.items.length ?? "·"}</strong>
        </div>
        <div>
          <span>{t.overview.waiting}</span>
          <strong>
            {dispatches.data?.items.filter((d) =>
              ["prepared", "draft"].includes(d.status),
            ).length ?? "·"}
          </strong>
        </div>
        <div>
          <span>{t.overview.tracked}</span>
          <strong>{dispatches.data?.items.length ?? "·"}</strong>
        </div>
      </div>
      <ErrorNotice
        error={documents.error ?? dispatches.error}
        retry={() => {
          documents.refresh();
          dispatches.refresh();
        }}
      />
      <div className="section-toolbar">
        <h2>{t.overview.recent}</h2>
        <a href="#/app/dispatches" className="text-link">
          {t.overview.all}
          <ArrowRight size={17} />
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
            <a className="button primary" href="#/app/documents">
              {t.documents.import}
              <ArrowRight size={18} />
            </a>
          }
        />
      )}
    </>
  );
}

export function Documents() {
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
  useEffect(() => {
    if (selected) documentHeading.current?.focus();
  }, [selected?.id]);
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
          <div className="button-group">
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
              className="button primary"
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
        }
      />
      {isPublicPreview && (
        <p className="notice info">
          Explorez les PDF d’exemple ci-dessous. L’import de fichiers et la
          création de PDF seront disponibles dans votre espace privé.
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
      {tab && (
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
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  ref={file}
                />
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
                documentTrigger.current?.focus();
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
                <h3>{analysis.title}</h3>
                <p>{analysis.message}</p>
              </div>
              {analysis.state === "processing" && !followup.issue && (
                <p className="document-followup-hint">
                  {t.documents.followupAutomatic}
                </p>
              )}
              {!isPublicPreview && analysis.nextAction === "rescan" && (
                <button
                  className="button"
                  disabled={action.pending || followup.loading}
                  onClick={() => void rescan()}
                >
                  {action.pending ? t.documents.rescanning : t.documents.rescan}
                </button>
              )}
              {!isPublicPreview &&
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
          {selected.status === "ready" && <PdfPreview id={selected.id} />}
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
          <a
            className={`button primary ${selected.status !== "ready" ? "disabled-link" : ""}`}
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
        </section>
      )}
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
        <EmptyState
          title={t.documents.emptyTitle}
          text={t.documents.emptyBody}
        />
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
}: {
  initialDocument: string;
  simulation: boolean;
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
    new URLSearchParams(route.split("?")[1]).get("channel") === "postal"
      ? "postal"
      : "fax",
  );
  const [documentId, setDocumentId] = useState(initialDocument);
  const [senderId, setSenderId] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [ceiling, setCeiling] = useState("500");
  const [postalBudget, setPostalBudget] = useState("5");
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
  async function prepare() {
    if (submitting.current) return;
    submitting.current = true;
    await action.run(async () => {
      if (documentUnavailable)
        throw new Error("Vérifiez le PDF avant de préparer l’envoi.");
      const target =
        channel === "fax"
          ? { phone: recipient.phone ?? "" }
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
            "Les options du courrier ne sont pas encore disponibles. Réessayez leur chargement.",
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
            "Attendez la vérification du PDF final avant le contrôle postal.",
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
            ceilingMinor: Number(ceiling),
          },
        });
        go(`/app/postal/${encodeURIComponent(review.id)}`);
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
          subject: channel === "email" ? subject : undefined,
          html: channel === "email" ? html : undefined,
          text: channel === "email" ? text : undefined,
          ceilingMinor: Number(ceiling),
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
          channel === "postal" ? "Préparez votre courrier." : t.dispatch.title
        }
        intro={
          channel === "postal"
            ? "Choisissez le PDF, son destinataire et la fenêtre de l’enveloppe. Vous vérifierez ensuite le document et le prix avant l’envoi."
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
          <legend className="sr-only">Préparation de l’envoi</legend>
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
                    setPostalBudget(String(Number(ceiling) / 100));
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
                    {initial.loading ? "Chargement du PDF…" : "PDF à vérifier"}
                  </option>
                )}
              {available.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name} · {d.pages} p.
                </option>
              ))}
            </select>
          </Field>
          {documentUnavailable && !initial.loading && (
            <p className="field-hint" id="prepare-document-unavailable">
              Ce PDF doit être vérifié avant de préparer l’envoi.{" "}
              <a
                href={`#/app/documents?document=${encodeURIComponent(documentId)}`}
              >
                Voir le suivi du PDF
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
                    : "Aucun expéditeur validé pour ce canal"}
                </option>
              )}
            </select>
          </Field>
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
              hint="Format international : + suivi de l’indicatif du pays et du numéro, sans espaces (ex. +352…)."
            >
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                pattern="\+[1-9][0-9]{7,14}"
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
              <Field label={t.dispatch.subject}>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  maxLength={200}
                />
              </Field>
              <Field label={t.dispatch.html}>
                <textarea
                  rows={6}
                  className="code-input"
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  required
                />
              </Field>
              <Field label={t.dispatch.text} hint={t.dispatch.textHelp}>
                <textarea
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  required
                />
              </Field>
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
            </>
          )}
          {channel === "postal" && !simulation && (
            <fieldset className="postal-form-options">
              <legend>Impression et distribution</legend>
              <Field label="Faces imprimées">
                <select
                  value={printMode}
                  onChange={(event) =>
                    setPrintMode(event.target.value as "simplex" | "duplex")
                  }
                >
                  <option value="simplex">Recto</option>
                  <option value="duplex">Recto verso</option>
                </select>
              </Field>
              <Field label="Couleurs">
                <select
                  value={printSpectrum}
                  onChange={(event) =>
                    setPrintSpectrum(
                      event.target.value as "grayscale" | "color",
                    )
                  }
                >
                  <option value="grayscale">Noir et blanc</option>
                  <option value="color">Couleur</option>
                </select>
              </Field>
              <Field
                label="Distribution souhaitée"
                hint="La disponibilité et le prix seront confirmés par le devis."
              >
                <select
                  value={deliveryProduct}
                  onChange={(event) =>
                    setDeliveryProduct(event.target.value as "cheap" | "fast")
                  }
                >
                  <option value="cheap">Économique</option>
                  <option value="fast">Rapide</option>
                </select>
              </Field>
              <p className="field-hint">
                Vous vérifierez le document et son adresse avant de demander le
                prix de l’envoi.
              </p>
            </fieldset>
          )}
          {channel === "postal" && !simulation ? (
            <details className="postal-budget">
              <summary>Budget maximum : {money(Number(ceiling))}</summary>
              <Field
                label="Budget maximum en euros"
                hint="Le prix exact vous sera présenté avant l’envoi. Modifiez ce plafond si nécessaire."
              >
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  max="10000"
                  value={postalBudget}
                  onChange={(event) => {
                    setPostalBudget(event.target.value);
                    setCeiling(
                      String(Math.round(Number(event.target.value) * 100)),
                    );
                  }}
                  required
                />
              </Field>
            </details>
          ) : (
            <Field label={t.dispatch.ceiling} hint={t.dispatch.ceilingHelp}>
              <input
                type="number"
                inputMode="numeric"
                value={ceiling}
                onChange={(e) => setCeiling(e.target.value)}
                min="0"
                step="1"
                max="1000000"
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
                ? "Création du PDF final…"
                : t.dispatch.preparing
              : addsAddressPage && !generated
                ? generationAttempted
                  ? "Réessayer la création du PDF"
                  : "Préparer le courrier"
                : addsAddressPage && !generatedReady
                  ? "Vérification du PDF final…"
                  : channel === "postal" && !simulation
                    ? "Préparer le courrier"
                    : t.dispatch.prepare}
            <ArrowRight size={18} />
          </button>
          {addsAddressPage &&
            generationAttempted &&
            !generated &&
            !action.pending && (
              <p className="field-hint">
                Réessayez sans modifier les champs pour retrouver la même
                création et éviter un doublon.
              </p>
            )}
          {channel !== "email" && !documentId && (
            <p id="prepare-document-required" className="field-hint">
              Choisissez un document pour pouvoir préparer cet envoi.
            </p>
          )}
          {!simulation && !selectedSender && (
            <p id="prepare-sender-required" className="field-hint">
              {channel === "postal"
                ? t.postalSetup.required
                : "Un expéditeur doit être validé pour ce canal avant la préparation."}{" "}
              <a href="#/app/senders">
                {channel === "postal"
                  ? t.postalSetup.setupLink
                  : "Consulter les expéditeurs"}
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
                  <h2>{generatedAnalysis.title}</h2>
                  <p>{generatedAnalysis.message}</p>
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
                      Actualiser la vérification
                    </button>
                  )}
                  {(generatedAnalysis.state === "retryable" ||
                    generatedAnalysis.state === "blocked") && (
                    <p>
                      <a
                        href={`#/app/documents?document=${encodeURIComponent(finalDocument.id)}`}
                      >
                        Reprendre le suivi de ce PDF
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
                  Créez le PDF avec la page d’adresse pour afficher l’aperçu
                  exact du courrier complet.
                </p>
              </div>
            )
          ) : channel === "email" && html ? (
            <>
              <h2>{t.dispatch.htmlPreview}</h2>
              <EmailPreview html={html} />
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

export function DispatchList() {
  const resource = useResource<Page<Dispatch>>("/dispatches");
  return (
    <>
      <PageHeading
        title={t.dispatch.listTitle}
        intro={t.dispatch.listIntro}
        action={
          <a className="button primary" href="#/app/prepare">
            <Plus size={18} />
            {t.dispatch.new}
          </a>
        }
      />
      <div className="section-toolbar">
        <span>{t.nav.dispatches}</span>
        <RefreshButton onClick={resource.refresh} disabled={resource.loading} />
      </div>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        resource.data && <DispatchTable items={resource.data.items} />
      )}
      <LoadMore
        path="/dispatches"
        data={resource.data}
        onLoaded={resource.setData}
      />
    </>
  );
}

export function DispatchDetailPage({
  id,
  simulation,
}: {
  id: string;
  simulation: boolean;
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
  useEffect(() => {
    setConsent(false);
    setRecipientRequested(false);
    setInvalidQuoteId(undefined);
    setPostalReadRequired(false);
    postalViewRevision.current += 1;
    action.clear();
    return () => {
      postalViewRevision.current += 1;
    };
  }, [id, d?.fingerprint]);
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
  useEffect(() => {
    if (
      !d ||
      (!["accepted", "queued", "submitting", "submitted", "sending"].includes(
        d.status,
      ) &&
        d.faxPricing?.settlement.status !== "reserved")
    )
      return;
    const interval = window.setInterval(
      resource.refresh,
      ["delivered", "failed", "cancelled"].includes(d.status) ? 15000 : 3000,
    );
    return () => window.clearInterval(interval);
  }, [d?.status, d?.faxPricing?.settlement.status, resource.refresh]);
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
      ? "Recto verso"
      : postalOptions?.printMode === "simplex"
        ? "Recto"
        : undefined,
    postalOptions?.printSpectrum === "color"
      ? "Couleur"
      : postalOptions?.printSpectrum === "grayscale"
        ? "Noir et blanc"
        : undefined,
    postalOptions?.deliveryProduct === "fast"
      ? "Distribution rapide"
      : postalOptions?.deliveryProduct === "cheap"
        ? "Distribution économique"
        : undefined,
    postalOptions?.addressPosition === "right"
      ? "Fenêtre à droite"
      : postalOptions?.addressPosition === "left"
        ? "Fenêtre à gauche"
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
  const pendingApproval = ["prepared", "draft"].includes(d.status);
  const quoteExpired =
    (d.channel === "fax" || d.channel === "postal") &&
    d.mode === "production" &&
    !!d.quote_expires_at &&
    Date.parse(d.quote_expires_at) <= Date.now();
  const quoteBlocked =
    pendingApproval && (quoteExpired || invalidQuoteId === d.id);
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
  const cancelAllowed = [
    "prepared",
    "draft",
    "approved",
    "accepted",
    "queued",
  ].includes(d.status);
  const postalPriceUnavailable =
    d.channel === "postal" &&
    d.mode === "production" &&
    (d.currency !== "EUR" ||
      !Number.isSafeInteger(d.quote_customer_nanoeur) ||
      (d.quote_customer_nanoeur ?? -1) < 0 ||
      !Number.isFinite(Date.parse(d.quote_expires_at ?? "")));
  const postalSendLabel = `${d.mode === "simulation" ? "Simuler l’envoi pour" : "Envoyer pour"} ${quotedMoney(d)}${d.quote_pricing_basis === "public_list_price_ex_tax" ? " HT" : ""}`;
  async function readPostalOutcome(revision: number) {
    const current = await api<DispatchDetail>(
      `/dispatches/${encodeURIComponent(id)}`,
    );
    if (postalViewRevision.current !== revision) return;
    if (current?.dispatch?.id !== id)
      throw new Error(
        "Le suivi de ce courrier est indisponible. Actualisez-le avant de continuer.",
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
    ? sesErrorMessage(latestAttempt?.error_code)
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
      <p className="field-hint">{t.dispatch.channelNotes[d.channel]}</p>
      <ErrorNotice error={action.error ?? resource.error} />
      {(quoteBlocked || expiringSoon) && (
        <section className="notice warning" role="status" aria-atomic="true">
          <WarningCircle size={25} aria-hidden="true" />
          <div>
            <strong>
              {quoteExpired
                ? "Ce devis a expiré."
                : quoteBlocked
                  ? "Ce devis n’est plus valable."
                  : "Ce devis expire dans moins d’une minute."}
            </strong>
            <p>
              {quoteBlocked
                ? d.channel === "postal"
                  ? "Préparez un nouveau devis, puis vérifiez son prix avant l’envoi. Ce courrier ne sera pas envoyé avec le devis expiré."
                  : "Préparez un nouveau devis avec le même PDF, le même destinataire et le même plafond. Vous devrez vérifier et approuver cette nouvelle version avant tout envoi."
                : "Validez-le avant l’échéance affichée, ou renouvelez-le après son expiration."}
            </p>
            {quoteBlocked && d.campaign_id && (
              <p>
                Ce renouvellement créera un devis individuel, hors de la
                campagne d’origine. La campagne conservera son historique ; vous
                devrez approuver ce nouvel envoi séparément.
              </p>
            )}
            {renewalAllowed && (
              <button
                className="button primary"
                disabled={action.pending || resource.loading}
                onClick={() => void renewQuote()}
              >
                {action.pending
                  ? "Renouvellement du devis…"
                  : "Renouveler le devis"}
              </button>
            )}
            {quoteBlocked && d.channel === "postal" && (
              <a
                className="button primary"
                href={`#/app/prepare?channel=postal${d.document_id ? `&document=${encodeURIComponent(d.document_id)}` : ""}`}
              >
                Préparer un nouveau devis
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
            La réponse a été interrompue. Vérifiez le suivi de ce courrier avant
            toute nouvelle action ; il a peut-être déjà été accepté.
          </p>
          <button
            className="button secondary"
            disabled={action.pending}
            onClick={() => void checkPostalOutcome()}
          >
            {action.pending ? "Vérification du suivi…" : "Vérifier le suivi"}
          </button>
        </section>
      )}
      <div className="dispatch-detail-layout">
        <section>
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
              <Definition label="Options du courrier">
                {postalOptionSummary}
              </Definition>
            )}
            <Definition
              label={
                faxPricing
                  ? "Fourchette estimée HT"
                  : d.channel === "postal" &&
                      d.quote_pricing_basis === "public_list_price_ex_tax"
                    ? t.postalSetup.quote
                    : t.dispatch.estimate
              }
            >
              {faxPricing ? (
                <>
                  {nanoMoney(faxPricing.estimatedLowNanoeur)} à{" "}
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
              <Definition label="Crédits en réserve">
                {money(faxPricing.ceilingMinor)}
              </Definition>
            )}
            {faxPricing?.settlement.status === "settled" && (
              <>
                <Definition label="Consommation validée HT">
                  {faxPricing.settlement.customerNanoeur == null
                    ? t.unknown
                    : nanoMoney(faxPricing.settlement.customerNanoeur)}
                </Definition>
                <Definition label="Débit du solde">
                  {faxPricing.settlement.chargedMinor == null
                    ? t.unknown
                    : money(faxPricing.settlement.chargedMinor)}
                </Definition>
              </>
            )}
            {d.quote_expires_at && (
              <Definition label="Devis valable jusqu’au">
                {date(d.quote_expires_at)}
              </Definition>
            )}
            <Definition label={t.created}>{date(d.created_at)}</Definition>
          </dl>
          {d.mode === "simulation" && (
            <p className="field-hint">{t.simulationCost}</p>
          )}
          {faxPricing && (
            <div className="notice info" role="status" aria-atomic="true">
              {faxPricing.routeQualification === "operator_authorized_test" && (
                <p>{FAX_OPERATOR_TEST_NOTICE}</p>
              )}
              <p>
                {faxPricing.settlement.status === "settled"
                  ? "Le décompte de ce fax est terminé. Les crédits réservés non consommés sont à nouveau disponibles. Les fractions de centime sont cumulées avec vos autres envois avant le débit du solde."
                  : faxPricing.settlement.status === "released"
                    ? "La réservation a été libérée sans débit pour cet envoi."
                    : faxPricing.settlement.status === "reserved"
                      ? "Le décompte est en cours. Les crédits restent réservés jusqu’à la vérification de l’usage, même si la transmission est déjà terminée. Il n’est pas nécessaire de renvoyer le fax."
                      : `Le coût dépend de la durée de transmission. Votre consommation ne dépassera pas ${money(faxPricing.ceilingMinor)}. Ce plafond sera réservé à la confirmation ; seuls les crédits consommés seront déduits après vérification de l’usage.`}{" "}
                Montants hors taxes, sur vos crédits de bêta ; aucun paiement
                n’est prélevé.
              </p>
            </div>
          )}
          {d.mode === "production" && d.quote_customer_nanoeur != null && (
            <p className="field-hint">
              Ce prix s’ajoute à vos envois précédents. La consommation totale
              est arrondie au centime supérieur ; les fractions de centime sont
              cumulées entre les envois. Le plafond affiché reste réservé
              jusqu’au résultat.
            </p>
          )}
          {d.quote_pricing_basis === "public_list_price_ex_tax" && (
            <p className="field-hint">
              {d.channel === "postal"
                ? t.postalSetup.quoteNote
                : "Tarif de référence SES hors taxes. Le prix en euros est fixé pour ce devis."}
              {d.channel === "email" && d.quote_fx && (
                <>
                  {" "}
                  Conversion du {d.quote_fx.date
                    .split("-")
                    .reverse()
                    .join("/")}{" "}
                  : 1 USD ≈{" "}
                  {new Intl.NumberFormat("fr-FR", {
                    maximumFractionDigits: 8,
                  }).format(d.quote_fx.numerator / d.quote_fx.denominator)}{" "}
                  EUR, selon le taux de référence BCE.
                </>
              )}
            </p>
          )}
          {pendingApproval &&
            resource.data?.approval?.approval_kind === "expert" && (
              <p className="notice info">
                Cet envoi a été revu sous votre délégation expert. L’assistant
                doit encore en confirmer l’acceptation. Vous pouvez aussi le
                vérifier et l’approuver ici.
              </p>
            )}
          {pendingApproval && d.channel === "postal" && (
            <section className="approval-panel">
              <p>
                Vérifiez le PDF et l’adresse du destinataire. Ce bouton approuve
                cette version et son prix, puis
                {d.mode === "simulation"
                  ? " lance sa simulation."
                  : " déclenche son envoi."}
              </p>
              {postalPriceUnavailable && (
                <p role="status">
                  Le prix exact de ce courrier est indisponible. Actualisez le
                  devis avant de l’envoyer.
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
                  ? "Envoi en cours…"
                  : postalPriceUnavailable
                    ? "Prix indisponible"
                    : postalSendLabel}
              </button>
            </section>
          )}
          {pendingApproval && !approved && d.channel !== "postal" && (
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
                    ? `J’ai vérifié le contenu et le destinataire. J’accepte une consommation variable, dans la limite de ${money(faxPricing.ceilingMinor)}, pour cette version du fax.`
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
                    Je confirme que ce destinataire a demandé cet e-mail et son
                    document. Cet envoi ne constitue pas une prospection.
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
                {action.pending ? t.loading : t.dispatch.approve}
              </button>
            </section>
          )}
          {approved && d.channel !== "postal" && (
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
          {cancelAllowed && (
            <button
              className="text-button cancel-button"
              disabled={
                action.pending || (d.channel === "postal" && postalReadRequired)
              }
              onClick={() => void cancel()}
            >
              {t.dispatch.cancelAction}
            </button>
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
            <PdfPreview id={d.document_id} title={t.dispatch.documentPreview} />
          )}
        </section>
      </div>
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
                      ? "Service courrier Guteneo"
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
