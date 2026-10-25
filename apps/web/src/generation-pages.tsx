import { msg, msgIn } from "./messages";
import { useDashboardAppearance } from "./dashboard-appearance";
import { scrollStudioTable } from "./studio-table-keyboard";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  GenerationJobView,
  GenerationResultView,
  DistributionView,
  Page,
} from "../../../packages/contracts/src/template-workflow";
import type { SourceCell } from "../../../packages/contracts/src/datasets";
import { api, date, isPublicPreview, type Channel, type Sender } from "./api";
import { t } from "./locale";
import {
  ErrorNotice,
  DateTimezone,
  Field,
  go,
  Loading,
  LoadMore,
  PageHeading,
  PdfPreview,
  useAction,
  useResource,
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
  const { appearance } = useDashboardAppearance();
  const resource = useResource<Page<GenerationJobView>>("/generation-jobs");
  return (
    <>
      <PageHeading
        title={msg("Generations")}
        intro={msg(
          appearance === "v2"
            ? "Find your generated PDFs here. Generating a PDF does not send it."
            : "Each result retains its identifier, template version and exact PDF. Generation does not send anything.",
        )}
        action={
          canPrepare && (
            <a className="button primary" href="#/app/templates">
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
                  <a href={"#/app/generation/" + job.id}>
                    {msgIn("generation-state", stateLabel[job.state])} ·{" "}
                    {job.generated} / {job.total} {msg("PDF ")}
                  </a>
                </h3>
                <p>
                  {date(job.createdAt)} {msg("· template v")}
                  {job.templateVersion} · {job.failed} {msg("error(s) ")}
                </p>
              </div>
              <a className="button small" href={"#/app/generation/" + job.id}>
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
  const action = useAction(),
    [previewId, setPreviewId] = useState<string>(),
    [selected, setSelected] = useState<string[]>([]),
    [distributing, setDistributing] = useState(false),
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
      <a className="back-link" href="#/app/generations">
        {msg("← Generations ")}
      </a>
      <PageHeading
        title={msgIn("generation-state", stateLabel[current.state])}
        intro={
          msg("Template v") +
          current.templateVersion +
          " · " +
          date(current.createdAt) +
          msg(
            ". Documents are linked to their recordId, regardless of completion order.",
          )
        }
      />
      <ErrorNotice error={action.error ?? job.error ?? results.error} />
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
        className="studio-table"
        role="region"
        onKeyDown={scrollStudioTable}
        tabIndex={0}
        aria-label={msg("Results of this generation")}
      >
        <table>
          <caption>{msg("Results of this generation")}</caption>
          <thead>
            <tr>
              <th>{msg("Selection")}</th>
              <th>{msg("Record")}</th>
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
                    aria-label={msg("Select ") + result.recordId}
                    checked={selected.includes(result.recordId)}
                    disabled={
                      !canPrepare ||
                      result.state !== "generated" ||
                      result.documentStatus !== "ready" ||
                      distributing
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
                  <code>{result.recordId}</code>
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
        onLoaded={results.setData}
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
      {canPrepare && !!ready.length && !distributing && (
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
            onClick={() => setDistributing(true)}
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
      {canPrepare && distributing && (
        <DistributionForm
          jobId={id}
          recordIds={selected}
          recordDocuments={Object.fromEntries(
            ready.map((result) => [result.recordId, result.documentId!]),
          )}
          onClose={() => setDistributing(false)}
        />
      )}
    </>
  );
}

type Destination = {
  id: string;
  records: "all" | string[];
  channel: Channel | "data";
  channelField: string;
  dataChannels: Channel[];
  valuesByChannel: Record<Channel, Record<string, string>>;
  sendersByChannel: Record<Channel, string>;
  mode: "common" | "data";
  values: Record<string, string>;
  senderId: string;
  subject: string;
  text: string;
  ceilingMinor: number;
  printMode: "simplex" | "duplex";
  printSpectrum: "grayscale" | "color";
  deliveryProduct: "cheap" | "fast";
};
const recipientFields: Record<Channel, [string, string][]> = {
  fax: [["phone", "International number"]],
  email: [["email", "Email address"]],
  postal: [
    ["name", "Name"],
    ["line1", "Address"],
    ["postalCode", "Postal code"],
    ["city", "City"],
    ["country", "Country (FR, LU or DE)"],
  ],
};
function channelLabel(channel: Channel) {
  return msg({ fax: "Fax", email: "Email", postal: "Post" }[channel]);
}
function postalOptions(destination: Destination) {
  return {
    printMode: destination.printMode,
    printSpectrum: destination.printSpectrum,
    deliveryProduct: destination.deliveryProduct,
  };
}
function newDestination(): Destination {
  return {
    id: crypto.randomUUID(),
    records: "all",
    channel: "fax",
    channelField: "delivery.channel",
    dataChannels: [],
    valuesByChannel: { fax: {}, email: {}, postal: {} },
    sendersByChannel: { fax: "", email: "", postal: "" },
    mode: "common",
    values: {},
    senderId: "",
    subject: "",
    text: "",
    ceilingMinor: 200,
    printMode: "simplex",
    printSpectrum: "grayscale",
    deliveryProduct: "cheap",
  };
}
function DistributionForm({
  jobId,
  recordIds,
  recordDocuments,
  onClose,
}: {
  jobId: string;
  recordIds: string[];
  recordDocuments: Record<string, string>;
  onClose: () => void;
}) {
  const [destinations, setDestinations] = useState<Destination[]>([
    newDestination(),
  ]);
  const [multi, setMulti] = useState(false),
    action = useAction(),
    senders = useResource<{ items: Sender[] }>("/senders");
  const key = useRef(crypto.randomUUID()),
    last = useRef("");
  const applies = (destination: Destination, recordId: string) =>
    destination.records === "all" || destination.records.includes(recordId);
  const associationCount = destinations.reduce(
    (count, destination) =>
      count +
      recordIds.filter((recordId) => applies(destination, recordId)).length,
    0,
  );
  // The service binds the approval to the physical artifact. Identical records
  // may reuse one private document, so all its channels need explicit intent.
  const channelsByDocument = new Map<string, Set<Channel>>();
  const associationsByDocument = new Map<string, number>();
  for (const recordId of recordIds) {
    const documentId = recordDocuments[recordId];
    const channels = channelsByDocument.get(documentId) ?? new Set<Channel>();
    for (const destination of destinations)
      if (applies(destination, recordId)) {
        for (const channel of destination.channel === "data"
          ? destination.dataChannels
          : [destination.channel])
          channels.add(channel);
        associationsByDocument.set(
          documentId,
          (associationsByDocument.get(documentId) ?? 0) + 1,
        );
      }
    channelsByDocument.set(documentId, channels);
  }
  const multichannelDocuments = [...channelsByDocument.entries()].filter(
    ([documentId, channels]) =>
      channels.size > 1 && (associationsByDocument.get(documentId) ?? 0) > 1,
  ).length;
  function update(id: string, patch: Partial<Destination>) {
    setDestinations((d) =>
      d.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    );
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (associationCount > 500)
        throw new Error(
          msg(
            "A distribution is limited to 500 document/destination pairs. Reduce the selection or the number of destinations.",
          ),
        );
      if (
        destinations.some(
          (destination) =>
            !recordIds.some((recordId) => applies(destination, recordId)),
        )
      )
        throw new Error(
          msg(
            "Choose at least one document for each destination, or remove that destination.",
          ),
        );
      if (
        recordIds.some(
          (recordId) =>
            !destinations.some((destination) => applies(destination, recordId)),
        )
      )
        throw new Error(
          msg(
            "Each selected PDF must have a destination. Close this form to change the selection if needed.",
          ),
        );
      if (
        destinations.some(
          (destination) =>
            destination.channel === "data" && !destination.dataChannels.length,
        )
      )
        throw new Error(msg("Choose the channels present in your data."));
      const entries = recordIds.flatMap((recordId, recordIndex) =>
        destinations.flatMap((destination, destinationIndex) =>
          applies(destination, recordId)
            ? [
                {
                  entryId:
                    "record-" +
                    recordIndex +
                    "-destination-" +
                    destinationIndex,
                  recordId,
                  ...(destination.channel === "data"
                    ? {
                        channelField: destination.channelField.trim(),
                        recipientFieldsByChannel: Object.fromEntries(
                          destination.dataChannels.map((channel) => [
                            channel,
                            destination.valuesByChannel[channel],
                          ]),
                        ),
                        senderIdsByChannel: Object.fromEntries(
                          destination.dataChannels
                            .filter(
                              (channel) =>
                                destination.sendersByChannel[channel],
                            )
                            .map((channel) => [
                              channel,
                              destination.sendersByChannel[channel],
                            ]),
                        ),
                      }
                    : {
                        channel: destination.channel,
                        ...(destination.mode === "common"
                          ? { recipient: destination.values }
                          : { recipientFields: destination.values }),
                        senderId: destination.senderId || undefined,
                      }),
                  ceilingMinor: destination.ceilingMinor,
                  ...(destination.channel === "postal" ||
                  (destination.channel === "data" &&
                    destination.dataChannels.includes("postal"))
                    ? {
                        [destination.channel === "data"
                          ? "optionsByChannel"
                          : "options"]:
                          destination.channel === "data"
                            ? { postal: postalOptions(destination) }
                            : postalOptions(destination),
                      }
                    : {}),
                  ...(destination.channel === "email" ||
                  (destination.channel === "data" &&
                    destination.dataChannels.includes("email"))
                    ? {
                        subject: destination.subject,
                        text: destination.text,
                        html:
                          "<p>" +
                          destination.text
                            .replaceAll("&", "&amp;")
                            .replaceAll("<", "&lt;")
                            .replaceAll(">", "&gt;")
                            .replaceAll("\n", "<br>") +
                          "</p>",
                      }
                    : {}),
                },
              ]
            : [],
        ),
      );
      const body = {
          jobId,
          entries,
          explicitMultichannel: multichannelDocuments > 0 && multi,
        },
        serialized = JSON.stringify(body);
      if (last.current && last.current !== serialized)
        key.current = crypto.randomUUID();
      last.current = serialized;
      const result = await api<DistributionView>("/distribution-plans", {
        method: "POST",
        key: key.current,
        body,
      });
      go("/app/distribution/" + result.id);
    });
  }
  return (
    <form className="studio-section" onSubmit={(e) => void prepare(e)}>
      <div className="section-toolbar">
        <h2>{msg("Optional distribution")}</h2>
        <button className="text-button" type="button" onClick={onClose}>
          {msg("Close ")}
        </button>
      </div>
      <p>
        {recordIds.length} {msg("PDFs selected · ")}
        {associationCount}{" "}
        {msg(
          "pairs out of a maximum of 500. Each PDF/destination pair forms a separate send. Quotes, checks and sending approvals follow later. ",
        )}
      </p>
      <ErrorNotice error={action.error ?? senders.error} />
      {destinations.map((destination, index) => (
        <fieldset
          className="business-object"
          key={destination.id}
          disabled={action.pending}
        >
          <legend>
            {msg("Destination ")}
            {index + 1}
          </legend>
          <Field label={msg("Documents for this destination ") + (index + 1)}>
            <select
              value={destination.records === "all" ? "all" : "selection"}
              onChange={(e) =>
                update(destination.id, {
                  records: e.target.value === "all" ? "all" : [...recordIds],
                })
              }
            >
              <option value="all">{msg("All selected PDFs")}</option>
              <option value="selection">
                {msg("Choose the documents to include")}
              </option>
            </select>
          </Field>
          {destination.records !== "all" && (
            <div
              className="studio-record-selection"
              role="group"
              aria-label={
                msgIn("distribution", "Documents for this destination ") +
                (index + 1)
              }
            >
              <p className="field-hint">
                {msg(
                  "This destination applies only to the checked documents. ",
                )}
              </p>
              {recordIds.map((recordId) => (
                <label key={recordId} className="check-field">
                  <input
                    type="checkbox"
                    checked={applies(destination, recordId)}
                    onChange={(e) =>
                      update(destination.id, {
                        records: e.target.checked
                          ? [
                              ...(destination.records === "all"
                                ? recordIds
                                : destination.records),
                              recordId,
                            ]
                          : (destination.records === "all"
                              ? recordIds
                              : destination.records
                            ).filter((id) => id !== recordId),
                      })
                    }
                  />
                  {recordId}
                </label>
              ))}
            </div>
          )}
          <div className="studio-mapping-grid">
            <Field label={msg("Channel ") + (index + 1)}>
              <select
                value={destination.channel}
                onChange={(e) =>
                  update(destination.id, {
                    channel: e.target.value as Destination["channel"],
                    ...(e.target.value === "data"
                      ? { mode: "data" as const }
                      : {}),
                    values: {},
                    senderId: "",
                  })
                }
              >
                <option value="fax">{msg("Fax")}</option>
                <option value="email">{msg("Email")}</option>
                <option value="postal">{msg("Post")}</option>
                <option value="data">{msg("From the data")}</option>
              </select>
            </Field>
            <Field label={msg("Recipient ") + (index + 1)}>
              <select
                value={destination.mode}
                disabled={destination.channel === "data"}
                onChange={(e) =>
                  update(destination.id, {
                    mode: e.target.value as Destination["mode"],
                    values: {},
                  })
                }
              >
                <option value="common">
                  {msg("Same recipient for these documents ")}
                </option>
                <option value="data">{msg("Recipient from the data")}</option>
              </select>
            </Field>
            {destination.channel !== "data" && (
              <Field label={msg("Sender ") + (index + 1)}>
                <select
                  required={destination.channel === "postal"}
                  value={destination.senderId}
                  onChange={(e) =>
                    update(destination.id, { senderId: e.target.value })
                  }
                >
                  <option value="">
                    {destination.channel === "postal"
                      ? msg("Choose a verified postal profile")
                      : msg("Default verified profile")}
                  </option>
                  {senders.data?.items
                    .filter((s) => s.channel === destination.channel)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name ?? s.address ?? s.id}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
          {destination.channel === "data" && (
            <>
              <Field
                label={msg("Channel field")}
                hint={msg(
                  "Path in the frozen data containing exactly fax, email or postal, for example delivery.channel.",
                )}
              >
                <input
                  required
                  value={destination.channelField}
                  maxLength={240}
                  onChange={(event) =>
                    update(destination.id, { channelField: event.target.value })
                  }
                />
              </Field>
              <p>
                {msg(
                  "Choose the channels present in your data. Map each channel’s recipient fields; they are only read for records using that channel.",
                )}
              </p>
              {(["fax", "email", "postal"] as const).map((channel) => (
                <div key={channel} className="studio-channel-mapping">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={destination.dataChannels.includes(channel)}
                      onChange={(event) =>
                        update(destination.id, {
                          dataChannels: event.target.checked
                            ? [...destination.dataChannels, channel]
                            : destination.dataChannels.filter(
                                (entry) => entry !== channel,
                              ),
                        })
                      }
                    />
                    {channelLabel(channel)}
                  </label>
                  {destination.dataChannels.includes(channel) && (
                    <fieldset className="business-object">
                      <legend>
                        {msg("{0} recipients", channelLabel(channel))}
                      </legend>
                      <div className="studio-mapping-grid">
                        {recipientFields[channel].map(([field, label]) => (
                          <Field
                            key={field}
                            label={msg("Data field → ") + msg(label)}
                            hint={msg(
                              "Path in the frozen data, for example customer.email",
                            )}
                          >
                            <input
                              required
                              value={
                                destination.valuesByChannel[channel][field] ??
                                ""
                              }
                              onChange={(event) =>
                                update(destination.id, {
                                  valuesByChannel: {
                                    ...destination.valuesByChannel,
                                    [channel]: {
                                      ...destination.valuesByChannel[channel],
                                      [field]: event.target.value,
                                    },
                                  },
                                })
                              }
                            />
                          </Field>
                        ))}
                        <Field label={msg("{0} sender", channelLabel(channel))}>
                          <select
                            required={channel === "postal"}
                            value={destination.sendersByChannel[channel]}
                            onChange={(event) =>
                              update(destination.id, {
                                sendersByChannel: {
                                  ...destination.sendersByChannel,
                                  [channel]: event.target.value,
                                },
                              })
                            }
                          >
                            <option value="">
                              {channel === "postal"
                                ? msg("Choose a verified postal profile")
                                : msg("Default verified profile")}
                            </option>
                            {senders.data?.items
                              .filter((sender) => sender.channel === channel)
                              .map((sender) => (
                                <option key={sender.id} value={sender.id}>
                                  {sender.name ?? sender.address ?? sender.id}
                                </option>
                              ))}
                          </select>
                        </Field>
                      </div>
                    </fieldset>
                  )}
                </div>
              ))}
            </>
          )}
          {destination.channel !== "data" && (
            <div className="studio-mapping-grid">
              {recipientFields[destination.channel].map(([field, label]) => (
                <Field
                  key={field}
                  label={
                    (destination.mode === "data" ? msg("Data field → ") : "") +
                    msg(label)
                  }
                  hint={
                    destination.mode === "data"
                      ? msg(
                          "Path in the frozen data, for example customer.email",
                        )
                      : undefined
                  }
                >
                  <input
                    required
                    value={destination.values[field] ?? ""}
                    onChange={(e) =>
                      update(destination.id, {
                        values: {
                          ...destination.values,
                          [field]: e.target.value,
                        },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          )}
          {(destination.channel === "postal" ||
            (destination.channel === "data" &&
              destination.dataChannels.includes("postal"))) && (
            <>
              <div className="studio-mapping-grid">
                <Field label={msg("Printing")}>
                  <select
                    value={destination.printMode}
                    onChange={(e) =>
                      update(destination.id, {
                        printMode: e.target.value as Destination["printMode"],
                      })
                    }
                  >
                    <option value="simplex">{msg("Single-sided")}</option>
                    <option value="duplex">{msg("Double-sided")}</option>
                  </select>
                </Field>
                <Field label={msg("Colour")}>
                  <select
                    value={destination.printSpectrum}
                    onChange={(e) =>
                      update(destination.id, {
                        printSpectrum: e.target
                          .value as Destination["printSpectrum"],
                      })
                    }
                  >
                    <option value="grayscale">{msg("Greyscale")}</option>
                    <option value="color">{msg("Colour")}</option>
                  </select>
                </Field>
                <Field label={msg("Delivery speed")}>
                  <select
                    value={destination.deliveryProduct}
                    onChange={(e) =>
                      update(destination.id, {
                        deliveryProduct: e.target
                          .value as Destination["deliveryProduct"],
                      })
                    }
                  >
                    <option value="cheap">{msg("Economy")}</option>
                    <option value="fast">{msg("Priority")}</option>
                  </select>
                </Field>
              </div>
              <p className="field-hint">
                {msg(
                  "The manifest retains these options. Each letter then goes through the postal checks for its exact PDF and the existing consent process before any transfer. ",
                )}
              </p>
            </>
          )}
          {(destination.channel === "email" ||
            (destination.channel === "data" &&
              destination.dataChannels.includes("email"))) && (
            <>
              <Field label={msgIn("single-email", "Email subject")}>
                <input
                  required
                  value={destination.subject}
                  onChange={(e) =>
                    update(destination.id, { subject: e.target.value })
                  }
                />
              </Field>
              <Field
                label={msg("Email body")}
                hint={msg(
                  "Each email contains only its record’s PDF. No CC/BCC.",
                )}
              >
                <textarea
                  required
                  rows={4}
                  value={destination.text}
                  onChange={(e) =>
                    update(destination.id, { text: e.target.value })
                  }
                />
              </Field>
            </>
          )}
          <Field label={msg("Limit per send (euro cents)")}>
            <input
              type="number"
              min={0}
              max={1000000}
              step={1}
              required
              value={destination.ceilingMinor}
              onChange={(e) =>
                update(destination.id, { ceilingMinor: Number(e.target.value) })
              }
            />
          </Field>
          {destinations.length > 1 && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setDestinations((d) => d.filter((v) => v.id !== destination.id))
              }
            >
              {msg("Remove this destination ")}
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="button small"
        disabled={destinations.length >= 500 || action.pending}
        onClick={() => setDestinations([...destinations, newDestination()])}
      >
        {msg("Add a destination or channel ")}
      </button>
      {multichannelDocuments > 0 && (
        <label className="check-field">
          <input
            type="checkbox"
            required
            checked={multi}
            onChange={(e) => setMulti(e.target.checked)}
          />
          {msg("I explicitly request the use of multiple channels for")}{" "}
          {multichannelDocuments} {msg("PDFs. ")}
        </label>
      )}
      <p className="field-hint">
        {msg(
          "Preparing the distribution lets authorized approvers in this workspace view the selected PDFs to review these requests. It does not send anything.",
        )}
      </p>
      <p className="field-hint">
        {msg(
          "Preparation is not approval. Unavailable channels or rates remain blocked with an explicit error. ",
        )}
      </p>
      <button className="button primary" disabled={action.pending}>
        {msg("Prepare pairs and quotes ")}
      </button>
    </form>
  );
}

export function DistributionDetail({
  id,
  canPrepare,
  canApprove,
}: {
  id: string;
  canPrepare: boolean;
  canApprove: boolean;
}) {
  const { appearance } = useDashboardAppearance();
  const resource = useResource<DistributionView>("/distribution-plans/" + id);
  const action = useAction();
  const keys = useRef<Record<string, string>>({});
  return (
    <>
      {appearance === "v2" && (
        <a className="back-link" href="#/app/generations">
          {msg("← Generations ")}
        </a>
      )}
      <PageHeading
        title={msg("Distribution prepared")}
        intro={msg(
          "The manifest freezes each record, PDF, hash, channel and recipient. Each send retains its checks and approval.",
        )}
      />
      <ErrorNotice
        error={action.error ?? resource.error}
        retry={resource.refresh}
      />
      {resource.loading && !resource.data && <Loading />}
      {resource.data && (
        <>
          <div className="studio-toolbar">
            <button className="button small" onClick={resource.refresh}>
              {msg("Refresh distribution ")}
            </button>
            {canPrepare && resource.data.pendingCount > 0 && (
              <button
                className="button"
                disabled={action.pending}
                onClick={() =>
                  void action.run(async () =>
                    resource.setData(
                      await api<DistributionView>(
                        `/distribution-plans/${id}/resume`,
                        { method: "POST", body: { retryFailed: false } },
                      ),
                    ),
                  )
                }
              >
                {msg("Prepare the next 3 pairs ( ")}
                {resource.data.pendingCount} {msg("remaining) ")}
              </button>
            )}
            {canPrepare && resource.data.errorCount > 0 && (
              <button
                className="button small"
                disabled={action.pending}
                onClick={() =>
                  void action.run(async () =>
                    resource.setData(
                      await api<DistributionView>(
                        `/distribution-plans/${id}/resume`,
                        { method: "POST", body: { retryFailed: true } },
                      ),
                    ),
                  )
                }
              >
                {msg("Retry failed preparations ")}
              </button>
            )}
          </div>
          <p className="studio-meta">
            {msg("Manifest hash: ")}
            <code>{resource.data.manifestHash}</code>
          </p>
          <div
            className="studio-table"
            role="region"
            onKeyDown={scrollStudioTable}
            tabIndex={0}
            aria-label={msg("Distribution prepared")}
          >
            <table>
              <thead>
                <tr>
                  <th>{msg("Record")}</th>
                  <th>{msg("Document")}</th>
                  <th>{msg("Channel / destination")}</th>
                  <th>{msg("Next steps")}</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.entries.map((entry) => (
                  <tr key={entry.entryId}>
                    <th scope="row">{entry.recordId}</th>
                    <td>
                      <a href={"#/app/documents?document=" + entry.documentId}>
                        {msg("PDF · template v")}
                        {entry.templateVersion}
                      </a>
                      <p className="studio-meta">
                        {entry.documentHash.slice(0, 16)}…
                      </p>
                    </td>
                    <td>
                      {entry.channel}
                      <p>{Object.values(entry.recipient ?? {}).join(" · ")}</p>
                    </td>
                    <td>
                      {entry.dispatchId ? (
                        <a
                          className="button small"
                          href={"#/app/dispatch/" + entry.dispatchId}
                        >
                          {canApprove
                            ? msg("Review quote and approve ")
                            : msg("Open ")}
                        </a>
                      ) : entry.postalDispatchId ? (
                        <a
                          className="button small"
                          href={"#/app/dispatch/" + entry.postalDispatchId}
                        >
                          {msg("Review the final postal quote ")}
                        </a>
                      ) : entry.postalReviewId ? (
                        <>
                          <p>
                            {msg("Postal check: ")}
                            {entry.postalReviewStatus}
                          </p>
                          <a
                            className="button small"
                            href={"#/app/postal/" + entry.postalReviewId}
                          >
                            {canPrepare
                              ? msg("Review the letter and continue ")
                              : msg("Open ")}
                          </a>
                        </>
                      ) : (
                        <>
                          <p>
                            {entry.errorCode ? (
                              <>
                                {msg("Preparation blocked:")}{" "}
                                <code>{entry.errorCode}</code>
                              </>
                            ) : (
                              msg("Association pending preparation.")
                            )}
                          </p>
                          {canPrepare && entry.channel === "postal" && (
                            <>
                              <p className="field-hint">
                                {msg(
                                  "Check the address, reserved areas and final pages in the postal workflow. ",
                                )}
                              </p>
                              <button
                                className="button small"
                                disabled={action.pending}
                                onClick={() =>
                                  void action.run(async () => {
                                    keys.current[entry.entryId] ??=
                                      crypto.randomUUID();
                                    const next = await api<DistributionView>(
                                      `/distribution-plans/${id}/entries/${encodeURIComponent(entry.entryId)}/postal-preflight`,
                                      {
                                        method: "POST",
                                        key: keys.current[entry.entryId],
                                        body: {},
                                      },
                                    );
                                    resource.setData(next);
                                    const updated = next.entries.find(
                                      (e) => e.entryId === entry.entryId,
                                    );
                                    if (updated?.postalReviewId)
                                      go(
                                        "/app/postal/" + updated.postalReviewId,
                                      );
                                  })
                                }
                              >
                                {msg("Check this letter ")}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a
            className="button"
            href={"#/app/generation/" + resource.data.jobId}
          >
            {msg("Back to PDFs ")}
          </a>
        </>
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
            onKeyDown={scrollStudioTable}
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
