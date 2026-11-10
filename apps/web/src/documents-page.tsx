import { DataTable, tableTimestamp } from "./data-table";
import { msg } from "./messages";
import { studioRoutes } from "./app-routes";
import { FileInput } from "./file-input";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  UploadSimple,
  FileText,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  api,
  bytes,
  date,
  isPublicPreview,
  type DocumentRecord,
  type Page,
} from "./api";
import { t } from "./locale";
import { PdfValidation } from "./pdf-validation";
import {
  DateTimezone,
  Definition,
  DocumentThumbnail,
  EmptyState,
  ErrorNotice,
  Field,
  go,
  Loading,
  LoadMore,
  PageHeading,
  PdfPreview,
  useAction,
  useResource,
  useRoute,
} from "./components";
import {
  analysisOf,
  DocumentStatus,
  useDocumentFollowup,
} from "./document-followup";

export function Documents({ canPrepare = true }: { canPrepare?: boolean }) {
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
    updateDocumentList((current) => {
      const listed = current?.items.find((item) => item.id === selected.id);
      if (!current || !listed || listed === selected) return current;
      return {
        ...current,
        items: current.items.map((item) =>
          item.id === selected.id ? selected : item,
        ),
      };
    });
  }, [selected, resource.data, updateDocumentList]);
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
    await action.run(async (view) => {
      const chosen = file.current?.files?.[0];
      if (!chosen) return;
      const form = new FormData();
      form.append("file", chosen);
      const document = await view.wait(
        api<DocumentRecord>("/documents", {
          method: "POST",
          body: form,
        }),
        (receipt) => ({
          kind: "saved",
          resourceId: receipt.id,
          route: "/app/documents",
        }),
      );
      go(`/app/documents?document=${encodeURIComponent(document.id)}`);
      setTab(null);
      resource.refresh();
    });
  }
  async function render(event: FormEvent) {
    event.preventDefault();
    await action.run(async (view) => {
      const document = await view.wait(
        api<DocumentRecord>("/documents/render", {
          method: "POST",
          body: { name, html },
        }),
        (receipt) => ({
          kind: "saved",
          resourceId: receipt.id,
          route: "/app/documents",
        }),
      );
      go(`/app/documents?document=${encodeURIComponent(document.id)}`);
      setTab(null);
      resource.refresh();
    });
  }
  async function rescan() {
    if (!selected) return;
    const controller = new AbortController();
    scanRequest.current = controller;
    await action.run(async (view) => {
      try {
        await view.wait(
          api<DocumentRecord>(
            `/documents/${encodeURIComponent(selected.id)}/rescan`,
            { method: "POST", body: {}, signal: controller.signal },
          ),
        );
        if (controller.signal.aborted) return;
        followup.refresh();
        resource.refresh();
      } catch (error) {
        view.checkpoint();
        if (!controller.signal.aborted) throw error;
      }
    });
  }
  return (
    <>
      <PageHeading
        title={t.nav.documents}
        action={
          canPrepare && (
            <div className="button-group">
              {!isPublicPreview && (
                <a className="button" href={`#${studioRoutes.templates}`}>
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
                className={tab || selected ? "button" : "button primary"}
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
              className={`button ${tab ? "" : "primary"} ${selected.status !== "ready" ? "disabled-link" : ""}`}
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
        <DataTable
          viewId="documents"
          label={t.nav.documents}
          items={resource.data.items}
          getRowKey={(item) => item.id}
          filters={[
            {
              saveValue: true,
              id: "status",
              label: t.status,
              value: (item) =>
                (selected?.id === item.id ? selected : item).status,
              options: [
                ...new Set(resource.data.items.map((item) => item.status)),
              ].map((value) => ({ value, label: t.statuses[value] ?? value })),
            },
            {
              id: "source",
              label: t.documents.source,
              value: (item) => (item.source === "import" ? "import" : "render"),
              options: [
                { value: "import", label: t.documents.exact },
                { value: "render", label: t.documents.generated },
              ],
            },
          ]}
          columns={[
            {
              id: "document",
              label: t.document,
              value: (item) => item.name,
              searchValue: (item) => `${item.name} ${item.id}`,
              render: (item) => (
                <>
                  <DocumentThumbnail
                    id={item.id}
                    ready={
                      (selected?.id === item.id ? selected : item).status ===
                      "ready"
                    }
                  />
                  <button
                    className="row-link text-button"
                    onClick={(event) => openDocument(item, event.currentTarget)}
                  >
                    {item.name}
                  </button>
                </>
              ),
            },
            {
              id: "pages",
              label: t.documents.pages,
              value: (item) =>
                (selected?.id === item.id ? selected : item).status === "ready"
                  ? (selected?.id === item.id ? selected : item).pages
                  : null,
              render: (item) =>
                (selected?.id === item.id ? selected : item).status === "ready"
                  ? (selected?.id === item.id ? selected : item).pages
                  : t.documents.pagesUnverified,
            },
            {
              id: "source",
              label: t.documents.source,
              value: (item) =>
                item.source === "import"
                  ? t.documents.exact
                  : t.documents.generated,
            },
            {
              id: "status",
              label: t.status,
              value: (item) =>
                t.statuses[
                  (selected?.id === item.id ? selected : item).status
                ] ?? item.status,
              render: (item) => (
                <DocumentStatus
                  document={selected?.id === item.id ? selected : item}
                />
              ),
            },
            {
              id: "created",
              label: t.created,
              value: (item) => tableTimestamp(item.created_at),
              searchValue: (item) => date(item.created_at),
              render: (item) => date(item.created_at),
              className: "date-cell",
            },
            {
              id: "actions",
              label: t.open,
              value: () => "",
              sortable: false,
              render: (item) => (
                <button
                  className="icon-link"
                  aria-label={`${t.preview} ${item.name}`}
                  onClick={(event) => openDocument(item, event.currentTarget)}
                >
                  <ArrowRight size={20} aria-hidden="true" />
                </button>
              ),
            },
          ]}
        />
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
