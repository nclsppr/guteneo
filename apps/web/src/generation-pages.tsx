import type {
  GenerationContextPage,
  GenerationRecordContext,
} from "../../../packages/contracts/src/generation-context";
import { msg, msgIn } from "./messages";
import {
  studioRoutes,
  distributionPreparationRoute,
  generationSelectionRoute,
  readGenerationSelection,
} from "./app-routes";
import { DataTable } from "./data-table";
import { useEffect, useRef, useState } from "react";
import type {
  GenerationJobView,
  GenerationResultView,
  Page,
  TemplateView,
} from "../../../packages/contracts/src/template-workflow";
import type { SourceCell } from "../../../packages/contracts/src/datasets";
import { api, date, isPublicPreview } from "./api";
import { t } from "./locale";
import {
  ErrorNotice,
  DateTimezone,
  go,
  Loading,
  LoadMore,
  PageHeading,
  PdfPreview,
  useResource,
  useAction,
  useRoute,
} from "./components";

const stateLabel: Record<string, string> = {
  queued: "Pending",
  running: "Generating",
  completed: "Completed",
  partial: "Partial result",
  failed: "Failed",
  cancelled: "Cancelled",
  generated: "PDF generated",
};
/** Existing state colours: done, in progress or needing attention. */
const stateTone: Record<string, string> = {
  queued: "status-document-processing",
  running: "status-document-processing",
  completed: "status-document-ready",
  partial: "status-document-blocked",
  failed: "status-document-blocked",
  cancelled: "status-document-blocked",
};
function GenerationState({ state }: { state: string }) {
  return (
    <span className={`status ${stateTone[state] ?? ""}`}>
      {msgIn("generation-state", stateLabel[state])}
    </span>
  );
}
/** A generation is named after its template; the version tells V1 from V2. */
function generationName(job: GenerationJobView, templateName?: string) {
  return templateName
    ? `${templateName} · v${job.templateVersion}`
    : msg("Template v") + job.templateVersion;
}
export function GenerationList({ canPrepare }: { canPrepare: boolean }) {
  const resource = useResource<Page<GenerationJobView>>("/generation-jobs");
  // One read in parallel; a missing name falls back to the template version.
  const templates = useResource<Page<TemplateView>>("/templates?limit=100");
  const templateNames = Object.fromEntries(
    (templates.data?.items ?? []).map((template) => [
      template.id,
      template.name,
    ]),
  );
  return (
    <>
      <PageHeading
        title={msg("Generations")}
        intro={msg(
          "Find your generated PDFs here. Generating a PDF does not send it.",
        )}
        action={
          canPrepare && (
            <a className="button primary" href={`#${studioRoutes.templates}`}>
              {msg("Create a document ")}
            </a>
          )
        }
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {!!resource.data?.items.length && <DateTimezone />}
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        <div className="studio-list">
          {!resource.data?.items.length && (
            <p className="studio-list-row">
              {msg("Generated PDFs will appear here.")}
            </p>
          )}
          {resource.data?.items.map((job) => (
            <article className="studio-list-row" key={job.id}>
              <div>
                <h3>
                  <a href={"#" + studioRoutes.generation(job.id)}>
                    {generationName(job, templateNames[job.templateId])}
                  </a>
                </h3>
                <p>
                  {date(job.createdAt)} · {job.generated} / {job.total}{" "}
                  {msg("PDF ")}
                  {job.failed > 0 && (
                    <>
                      {" "}
                      · {job.failed} {msg("error(s) ")}
                    </>
                  )}
                </p>
              </div>
              <GenerationState state={job.state} />
            </article>
          ))}
        </div>
      )}
      <LoadMore
        path="/generation-jobs"
        data={resource.data}
        onLoaded={resource.setData}
      />
    </>
  );
}

export function GenerationDetail({
  id,
  canPrepare,
}: {
  id: string;
  canPrepare: boolean;
}) {
  const job = useResource<GenerationJobView>("/generation-jobs/" + id);
  const results = useResource<Page<GenerationResultView>>(
    "/generation-jobs/" + id + "/results",
  );
  const [contextCursor, setContextCursor] = useState<string>();
  const context = useResource<GenerationContextPage>(
    `/generation-jobs/${id}/record-context${contextCursor ? "?" + new URLSearchParams({ cursor: contextCursor }) : ""}`,
  );
  const [contexts, setContexts] = useState<{
    id: string;
    records: Record<string, GenerationRecordContext>;
  }>({ id, records: {} });
  useEffect(() => {
    if (context.data)
      setContexts((previous) => ({
        id,
        records: {
          ...(previous.id === id ? previous.records : {}),
          ...Object.fromEntries(
            context.data!.items.map((record) => [record.recordId, record]),
          ),
        },
      }));
  }, [id, context.data]);
  const recordContexts = contexts.id === id ? contexts.records : {};
  const recordLabels = Object.fromEntries(
    Object.values(recordContexts).map((record) => [
      record.recordId,
      [record.name, record.subject, record.reference]
        .filter(Boolean)
        .join(" · ") || record.recordId,
    ]),
  );
  const incomingSelection = readGenerationSelection(useRoute());
  const action = useAction(),
    [previewId, setPreviewId] = useState<string>(),
    previewSection = useRef<HTMLElement>(null),
    [selected, setSelected] = useState<string[]>(incomingSelection.recordIds),
    [traceRecord, setTraceRecord] = useState<string>();
  const [verificationPaused, setVerificationPaused] = useState(false);
  const [followupRevision, setFollowupRevision] = useState(0);
  const [visible, setVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const verificationBudget = useRef<
    | { id: string; revision: number; expiresAt: number; reads: number }
    | undefined
  >(undefined);
  const active = job.data && ["queued", "running"].includes(job.data.state);
  const verificationPending =
    results.data?.items.some(
      (result) =>
        result.state === "generated" &&
        result.documentId &&
        result.documentStatus !== "ready" &&
        result.documentAnalysis?.state === "processing" &&
        result.documentAnalysis.nextAction === "wait",
    ) ?? false;
  const refreshJob = job.refresh,
    refreshResults = results.refresh;
  // The preview opens below the results: bring it into view.
  useEffect(() => {
    if (previewId) previewSection.current?.scrollIntoView({ block: "start" });
  }, [previewId]);
  useEffect(() => {
    verificationBudget.current = undefined;
    setVerificationPaused(false);
  }, [id]);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      refreshJob();
      refreshResults();
    }, 4000);
    return () => clearInterval(timer);
  }, [active, refreshJob, refreshResults]);
  useEffect(() => {
    if (
      isPublicPreview ||
      active ||
      !verificationPending ||
      !visible ||
      job.error ||
      results.error ||
      verificationPaused
    )
      return;
    if (
      verificationBudget.current?.id !== id ||
      verificationBudget.current.revision !== followupRevision
    )
      verificationBudget.current = {
        id,
        revision: followupRevision,
        expiresAt: Date.now() + 2 * 60_000,
        reads: 0,
      };
    const budget = verificationBudget.current;
    const remaining = budget.expiresAt - Date.now();
    if (remaining <= 0 || budget.reads >= 8) {
      setVerificationPaused(true);
      return;
    }
    const deadline = setTimeout(() => setVerificationPaused(true), remaining);
    const nextRead = results.loading
      ? undefined
      : setTimeout(() => {
          if (document.visibilityState === "hidden") return;
          if (Date.now() >= budget.expiresAt || budget.reads >= 8) {
            setVerificationPaused(true);
            return;
          }
          budget.reads += 1;
          refreshResults();
        }, 15_000);
    return () => {
      clearTimeout(deadline);
      clearTimeout(nextRead);
    };
  }, [
    id,
    active,
    verificationPending,
    visible,
    job.error,
    results.error,
    results.loading,
    verificationPaused,
    followupRevision,
    refreshResults,
  ]);
  if (!job.data)
    return (
      <>
        <ErrorNotice error={job.error} />
        {job.loading && <Loading />}
      </>
    );
  const current = job.data;
  const ready =
    results.data?.items.filter(
      (r) => r.state === "generated" && r.documentStatus === "ready",
    ) ?? [];
  return (
    <>
      <a className="back-link" href={`#${studioRoutes.generations}`}>
        {msg("← Generations ")}
      </a>
      <PageHeading
        title={generationName(current, context.data?.templateName ?? undefined)}
        intro={date(current.createdAt)}
        action={<GenerationState state={current.state} />}
      />
      <ErrorNotice error={action.error ?? job.error ?? results.error} />
      <ErrorNotice error={context.error} focusOnError={false} />
      {canPrepare && (
        <div className="button-group">
          <a
            className="button small"
            href={`#${studioRoutes.template(current.templateId)}?generation=${encodeURIComponent(id)}`}
          >
            {msg("Correct and create a new version")}
          </a>
          {current.datasetId && (
            <a
              className="button small"
              href={`#${studioRoutes.dataset(current.datasetId)}?${new URLSearchParams(
                {
                  template: current.templateId,
                  version: String(current.templateVersion),
                  ...(current.mappingId
                    ? {
                        mapping: current.mappingId,
                        mappingVersion: String(current.mappingVersion),
                      }
                    : {}),
                  generation: id,
                },
              )}`}
            >
              {msg("Correct source data")}
            </a>
          )}
        </div>
      )}
      <DateTimezone />
      <section className="studio-section">
        <h2>
          {current.generated} / {current.total} {msg("Generated PDFs ")}
        </h2>
        <progress
          className="studio-progress"
          value={current.generated + current.failed + current.cancelled}
          max={current.total}
          aria-label={msg("Generation progress")}
        />
        <p role="status">
          {current.pending} {msg("pending · ")}
          {current.failed} {msg("error(s) ·")} {current.cancelled}{" "}
          {msg("cancelled. No sending credits reserved. ")}
        </p>
        <div className="button-group">
          <button
            className="button small"
            onClick={() => {
              setVerificationPaused(false);
              setFollowupRevision((revision) => revision + 1);
              job.refresh();
              results.refresh();
            }}
          >
            {msg("Refresh progress ")}
          </button>
          {canPrepare && active && (
            <button
              className="button small"
              disabled={action.pending}
              onClick={() =>
                void action.run(async () => {
                  await api("/generation-jobs/" + id + "/cancel", {
                    method: "POST",
                    body: {},
                  });
                  job.refresh();
                  results.refresh();
                })
              }
            >
              {msg("Cancel remaining items ")}
            </button>
          )}
          {canPrepare && !!current.failed && (
            <button
              className="button small"
              disabled={action.pending || active}
              onClick={() =>
                void action.run(async () => {
                  const recordIds =
                    results.data?.items
                      .filter((r) => r.state === "failed")
                      .map((r) => r.recordId) ?? [];
                  await api("/generation-jobs/" + id + "/retry", {
                    method: "POST",
                    body: { recordIds },
                  });
                  job.refresh();
                  results.refresh();
                })
              }
            >
              {msg("Retry displayed failures ")}
            </button>
          )}
        </div>
        {verificationPending && (
          <p role="status" className="field-hint">
            {verificationPaused || results.error || job.error
              ? t.documents.followupPaused
              : msg("PDF verification in progress")}
          </p>
        )}
      </section>
      <DataTable<GenerationResultView>
        label={msg("Results of this generation")}
        items={results.data?.items ?? []}
        getRowKey={(result) => result.recordId}
        ariaBusy={results.loading}
        toolbar={(visibleItems) =>
          canPrepare &&
          !!ready.length && (
            <div className="studio-toolbar">
              <button
                type="button"
                className="button"
                disabled={
                  !visibleItems.some(
                    (result) =>
                      result.state === "generated" &&
                      result.documentStatus === "ready",
                  )
                }
                onClick={() =>
                  setSelected((previous) => [
                    ...new Set([
                      ...previous,
                      ...visibleItems
                        .filter(
                          (result) =>
                            result.state === "generated" &&
                            result.documentStatus === "ready",
                        )
                        .map((result) => result.recordId),
                    ]),
                  ])
                }
              >
                {msg("Select displayed verified PDFs ")}
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!selected.length || active}
                onClick={() => {
                  const current = new URL(window.location.href);
                  current.hash = generationSelectionRoute(id, selected);
                  window.history.replaceState(
                    window.history.state,
                    "",
                    current,
                  );
                  go(distributionPreparationRoute(id, selected));
                }}
              >
                {msg("Prepare distribution (")}
                {selected.length})
              </button>
            </div>
          )
        }
        filters={[
          {
            id: "state",
            label: msg("Status"),
            value: (result) => result.state,
            options: [
              ...new Set(
                (results.data?.items ?? []).map((result) => result.state),
              ),
            ].map((state) => ({
              value: state,
              label: msgIn("generation-state", stateLabel[state]),
            })),
          },
        ]}
        columns={[
          {
            id: "document",
            label: msg("Document"),
            value: (result) =>
              recordContexts[result.recordId]?.name ?? result.recordId,
            searchValue: (result) =>
              [
                result.recordId,
                recordContexts[result.recordId]?.name,
                recordContexts[result.recordId]?.subject,
                recordContexts[result.recordId]?.reference,
              ]
                .filter(Boolean)
                .join(" "),
            render: (result) => (
              <>
                <strong>
                  {recordContexts[result.recordId]?.name ?? result.recordId}
                </strong>
                {recordContexts[result.recordId]?.subject && (
                  <div>{recordContexts[result.recordId].subject}</div>
                )}
                {recordContexts[result.recordId]?.reference && (
                  <div className="studio-meta">
                    {recordContexts[result.recordId].reference}
                  </div>
                )}
              </>
            ),
          },
          {
            id: "selection",
            label: msg("Selection"),
            value: () => "",
            sortable: false,
            render: (result) => (
              <input
                type="checkbox"
                aria-label={
                  msg("Select ") +
                  result.recordId +
                  (recordLabels[result.recordId] &&
                  recordLabels[result.recordId] !== result.recordId
                    ? " · " + recordLabels[result.recordId]
                    : "")
                }
                checked={selected.includes(result.recordId)}
                disabled={
                  !canPrepare ||
                  result.state !== "generated" ||
                  result.documentStatus !== "ready"
                }
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((previous) =>
                    checked
                      ? [...new Set([...previous, result.recordId])]
                      : previous.filter(
                          (recordId) => recordId !== result.recordId,
                        ),
                  );
                }}
              />
            ),
          },
          {
            id: "status",
            label: msg("Status"),
            value: (result) =>
              msgIn("generation-state", stateLabel[result.state]) +
              (result.documentStatus === "ready" ? " " + msg("verified") : ""),
            searchValue: (result) =>
              [
                msgIn("generation-state", stateLabel[result.state]),
                result.documentStatus === "ready"
                  ? msg("verified")
                  : result.documentStatus,
                result.documentAnalysis && msg(result.documentAnalysis.title),
                result.documentAnalysis && msg(result.documentAnalysis.message),
                result.errorCode,
              ]
                .filter(Boolean)
                .join(" "),
            render: (result) => (
              <>
                {msgIn("generation-state", stateLabel[result.state])}
                {result.documentStatus === "ready" && " · " + msg("verified")}
                {result.documentAnalysis &&
                  result.documentStatus !== "ready" && (
                    <div className="studio-meta">
                      <p>{msg(result.documentAnalysis.title)}</p>
                      <p>{msg(result.documentAnalysis.message)}</p>
                    </div>
                  )}
                {!result.documentAnalysis &&
                  result.documentStatus &&
                  result.documentStatus !== "ready" && (
                    <p className="studio-meta">{msg("Needs checking")}</p>
                  )}
                {result.errorCode && (
                  <p>
                    <code>{result.errorCode}</code>
                  </p>
                )}
              </>
            ),
          },
          {
            id: "actions",
            label: msg("Action"),
            value: () => "",
            sortable: false,
            render: (result) => (
              <div className="studio-generation-actions">
                {result.documentId && result.documentStatus === "ready" && (
                  <button
                    className="text-button"
                    onClick={() => setPreviewId(result.documentId!)}
                  >
                    {msg("View PDF ")}
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => setTraceRecord(result.recordId)}
                >
                  {msg("View provenance ")}
                </button>
                {canPrepare && (
                  <a
                    className="text-link"
                    href={`#${studioRoutes.template(current.templateId)}?${new URLSearchParams({ generation: id, record: result.recordId })}`}
                  >
                    {msg("Correct data")}
                  </a>
                )}
              </div>
            ),
          },
        ]}
      />
      {traceRecord && (
        <GenerationProvenance
          jobId={id}
          recordId={traceRecord}
          onClose={() => setTraceRecord(undefined)}
        />
      )}
      <LoadMore
        path={"/generation-jobs/" + id + "/results"}
        data={results.data}
        onLoaded={(page) => {
          setContextCursor(results.data?.items.at(-1)?.recordId);
          results.setData(page);
        }}
      />
      {previewId && (
        <section className="studio-section" ref={previewSection}>
          <div className="section-toolbar">
            <h2>{msg("Final PDF")}</h2>
            <button
              className="text-button"
              onClick={() => setPreviewId(undefined)}
            >
              {msg("Close preview ")}
            </button>
          </div>
          <PdfPreview id={previewId} />
        </section>
      )}
      {canPrepare && active && (
        <p className="field-hint">
          {msg(
            "Distribution will be available when the job finishes. PDFs that are already ready remain available to view. ",
          )}
        </p>
      )}
    </>
  );
}

type ProvenanceView = {
  recordId: string;
  templateVersion: number;
  mappingVersion: number | null;
  sourceHash: string | null;
  inputHash: string;
  provenance: Record<string, SourceCell[]>;
  renderMetadata: Record<string, unknown>;
};
function GenerationProvenance({
  jobId,
  recordId,
  onClose,
}: {
  jobId: string;
  recordId: string;
  onClose: () => void;
}) {
  const trace = useResource<ProvenanceView>(
    `/generation-jobs/${jobId}/provenance?recordId=${encodeURIComponent(recordId)}`,
  );
  return (
    <section className="studio-section">
      <div className="section-toolbar">
        <h2>
          {msg("Provenance of ")}
          {recordId}
        </h2>
        <button className="text-button" onClick={onClose}>
          {msg("Close provenance ")}
        </button>
      </div>
      <ErrorNotice error={trace.error} />
      {trace.loading && !trace.data && <Loading />}
      {trace.data && (
        <>
          <p>
            {msg("Template v")}
            {trace.data.templateVersion}
            {trace.data.mappingVersion
              ? msg(" · Mapping v{0}", trace.data.mappingVersion)
              : msg(" · Data entered directly")}
          </p>
          <p className="studio-meta">
            {msg("Data hash: ")}
            <code>{trace.data.inputHash}</code>
          </p>
          {trace.data.sourceHash && (
            <p className="studio-meta">
              {msg("File hash: ")}
              <code>{trace.data.sourceHash}</code>
            </p>
          )}
          <DataTable
            label={msg("Provenance of ") + recordId}
            items={Object.entries(trace.data.provenance)}
            getRowKey={([field]) => field}
            columns={[
              {
                id: "field",
                label: msg("Data field"),
                value: ([field]) => field,
              },
              {
                id: "source",
                label: msg("Source cells"),
                value: ([, cells]) =>
                  cells
                    .map((cell) => `${cell.sheet} ${cell.address} ${cell.row}`)
                    .join(" "),
                render: ([, cells]) =>
                  cells.map((cell, index) => (
                    <span key={index}>
                      {index ? " ; " : ""}
                      {cell.sheet} · {cell.address} {msg("(row ")}
                      {cell.row})
                    </span>
                  )),
              },
            ]}
          />
          <p className="studio-meta">
            {msg("Rendering:")}{" "}
            {Object.entries(trace.data.renderMetadata)
              .filter(
                ([, value]) =>
                  typeof value === "string" || typeof value === "number",
              )
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ")}
          </p>
        </>
      )}
    </section>
  );
}
