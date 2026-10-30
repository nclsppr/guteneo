import type { GenerationRecordContext } from "../../../packages/contracts/src/generation-context";
import { msg, msgIn } from "./messages";
import {
  studioRoutes,
  distributionPreparationRoute,
  generationSelectionRoute,
  readGenerationSelection,
} from "./app-routes";
import { scrollTable } from "./table-keyboard";
import { useEffect, useRef, useState } from "react";
import type {
  GenerationJobView,
  GenerationResultView,
  Page,
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
export function GenerationList({ canPrepare }: { canPrepare: boolean }) {
  const resource = useResource<Page<GenerationJobView>>("/generation-jobs");
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
                    {msgIn("generation-state", stateLabel[job.state])} ·{" "}
                    {job.generated} / {job.total} {msg("PDF ")}
                  </a>
                </h3>
                <p>
                  {date(job.createdAt)} {msg("· template v")}
                  {job.templateVersion} · {job.failed} {msg("error(s) ")}
                </p>
              </div>
              <a
                className="button small"
                href={"#" + studioRoutes.generation(job.id)}
              >
                {msg("Track ")}
              </a>
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
  const context = useResource<{ items: GenerationRecordContext[] }>(
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
        title={msgIn("generation-state", stateLabel[current.state])}
        intro={
          msg("Template v") +
          current.templateVersion +
          " · " +
          date(current.createdAt)
        }
      />
      <ErrorNotice error={action.error ?? job.error ?? results.error} />
      <ErrorNotice error={context.error} focusOnError={false} />
      {canPrepare && (
        <div className="button-group">
          <a
            className="button"
            href={`#${studioRoutes.template(current.templateId)}?generation=${encodeURIComponent(id)}`}
          >
            {msg("Correct and create a new version")}
          </a>
          {current.datasetId && (
            <a
              className="button"
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
      <div
        className="studio-table studio-generation-results"
        role="region"
        aria-busy={results.loading}
        onKeyDown={scrollTable}
        tabIndex={0}
        aria-label={msg("Results of this generation")}
      >
        <table>
          <caption>{msg("Results of this generation")}</caption>
          <thead>
            <tr>
              <th>{msg("Selection")}</th>
              <th>{msg("Document")}</th>
              <th>{msg("Status")}</th>
              <th>{msg("Exact PDF")}</th>
              <th>{msg("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {results.data?.items.map((result) => (
              <tr key={result.recordId}>
                <td>
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
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, result.recordId]
                          : selected.filter((s) => s !== result.recordId),
                      )
                    }
                  />
                </td>
                <th scope="row">
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
                </th>
                <td>
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
                </td>
                <td>
                  {result.documentId ? (
                    <>
                      <a href={"#/app/documents?document=" + result.documentId}>
                        {msg("Open the document ")}
                      </a>
                      <p
                        className="studio-meta"
                        title={result.documentHash ?? undefined}
                      >
                        {result.documentHash?.slice(0, 16)}…
                      </p>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <div className="studio-generation-actions">
                    <button
                      className="text-button"
                      onClick={() => setTraceRecord(result.recordId)}
                    >
                      {msg("View provenance ")}
                    </button>
                    {result.documentId && result.documentStatus === "ready" && (
                      <button
                        className="button small"
                        onClick={() => setPreviewId(result.documentId!)}
                      >
                        {msg("View PDF ")}
                      </button>
                    )}
                    {canPrepare && (
                      <a
                        className="text-link"
                        href={`#${studioRoutes.template(current.templateId)}?${new URLSearchParams({ generation: id, record: result.recordId })}`}
                      >
                        {msg("Correct data")}
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
        <section className="studio-section">
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
      {canPrepare && !!ready.length && (
        <div className="studio-toolbar">
          <button
            className="button"
            onClick={() => setSelected(ready.map((r) => r.recordId))}
          >
            {msg("Select displayed verified PDFs ")}
          </button>
          <button
            className="button primary"
            disabled={!selected.length || active}
            onClick={() => {
              const current = new URL(window.location.href);
              current.hash = generationSelectionRoute(id, selected);
              window.history.replaceState(window.history.state, "", current);
              go(distributionPreparationRoute(id, selected));
            }}
          >
            {msg("Prepare distribution (")}
            {selected.length})
          </button>
        </div>
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
          <div
            className="studio-table"
            role="region"
            onKeyDown={scrollTable}
            tabIndex={0}
            aria-label={msg("Provenance of ") + recordId}
          >
            <table>
              <thead>
                <tr>
                  <th>{msg("Data field")}</th>
                  <th>{msg("Source cells")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(trace.data.provenance).map(([field, cells]) => (
                  <tr key={field}>
                    <th scope="row">{field}</th>
                    <td>
                      {cells.map((c, i) => (
                        <span key={i}>
                          {i ? " ; " : ""}
                          {c.sheet} · {c.address} {msg("(row ")}
                          {c.row})
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
