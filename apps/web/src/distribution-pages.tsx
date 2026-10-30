import { msg, msgIn } from "./messages";
import {
  studioRoutes,
  generationSelectionRoute,
  readGenerationSelection,
} from "./app-routes";
import { scrollTable } from "./table-keyboard";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { GenerationContextPage } from "../../../packages/contracts/src/generation-context";
import type {
  GenerationJobView,
  GenerationResultView,
  DistributionView,
  Page,
} from "../../../packages/contracts/src/template-workflow";
import {
  api,
  date,
  isPublicPreview,
  permissionsFor,
  type Session,
  type Channel,
  type Sender,
} from "./api";
import { RolePermissionNotice } from "./role-guide";
import {
  BEFORE_WORKSPACE_NAVIGATION,
  ErrorNotice,
  DateTimezone,
  Field,
  go,
  Loading,
  PageHeading,
  useAction,
  useResource,
} from "./components";
import "./distribution-pages.css";

/** Capture each operation separately: leaving and returning never revives a reply. */
function useCurrentVisit() {
  const mounted = useRef(true);
  const href = useRef(window.location.href);
  const revision = useRef(0);
  const navigationGuards = useRef(new Map<string, Event>());
  useEffect(() => {
    mounted.current = true;
    const acceptedNavigation = (event: Event) => {
      navigationGuards.current.set(window.location.href, event);
      // Navigation guards finish synchronously, including a possible veto.
      queueMicrotask(() => {
        if (!event.defaultPrevented) revision.current += 1;
      });
    };
    const changedLocation = (event?: Event) => {
      const observed = event as HashChangeEvent | undefined;
      queueMicrotask(() => {
        const guard = observed?.newURL
          ? navigationGuards.current.get(observed.newURL)
          : undefined;
        if (observed?.newURL) navigationGuards.current.delete(observed.newURL);
        if (guard?.defaultPrevented) return;
        // WebKit can deliver both events after A→B→A already ended at A.
        // Preserve the observed transition even if reading location sees A.
        if (
          (observed?.oldURL && observed.oldURL !== observed.newURL) ||
          window.location.href !== href.current
        )
          revision.current += 1;
      });
    };
    // Hash navigation dispatches the guarded event. Popstate also invalidates
    // external history changes after the hash guard has had a chance to veto.
    const historyChanged = () => setTimeout(changedLocation, 0);
    window.addEventListener(BEFORE_WORKSPACE_NAVIGATION, acceptedNavigation);
    window.addEventListener("hashchange", changedLocation);
    window.addEventListener("popstate", historyChanged);
    return () => {
      mounted.current = false;
      revision.current += 1;
      window.removeEventListener(
        BEFORE_WORKSPACE_NAVIGATION,
        acceptedNavigation,
      );
      window.removeEventListener("hashchange", changedLocation);
      window.removeEventListener("popstate", historyChanged);
    };
  }, []);
  return () => {
    const startedAt = revision.current;
    return () =>
      mounted.current &&
      revision.current === startedAt &&
      window.location.href === href.current;
  };
}

export default function DistributionPage({
  route,
  session,
}: {
  route: string;
  session: Session;
}) {
  if (isPublicPreview)
    return (
      <p className="notice info">
        {msg(
          "The document studio is available in your private workspace. This public demo does not process files. ",
        )}
      </p>
    );
  const permissions = permissionsFor(session);
  const [path, search = ""] = route.split("?");
  if (path === "/app/distribution/new") {
    if (!permissions.prepareDispatches) return <RolePermissionNotice />;
    return (
      <DistributionPreparation
        route={route}
        jobId={new URLSearchParams(search).get("generation") ?? ""}
      />
    );
  }
  return (
    <DistributionDetail
      id={path.slice("/app/distribution/".length)}
      canPrepare={permissions.prepareDispatches}
      canApprove={permissions.approveDispatches}
    />
  );
}

function usePreparationSelection(
  jobId: string,
  recordIds: string[],
  valid: boolean,
) {
  const selection = JSON.stringify(recordIds);
  const scope = JSON.stringify([jobId, selection, valid]);
  const [state, setState] = useState<{
    scope: string;
    loading: boolean;
    records?: GenerationResultView[];
    labels?: Record<string, string>;
    templateName?: string | null;
    error?: Error;
  }>({ scope, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ scope, loading: true });
    if (!jobId || !valid || !JSON.parse(selection).length) {
      setState({ scope, loading: false });
      return () => controller.abort();
    }
    void (async () => {
      const wanted = JSON.parse(selection) as string[];
      const found = new Map<string, GenerationResultView>();
      const labels: Record<string, string> = Object.create(null);
      let templateName: string | null = null;
      let cursor: string | null = null;
      const seen = new Set<string>();
      for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
        const query: string =
          "?" +
          new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) });
        const [records, context]: [
          Page<GenerationResultView>,
          GenerationContextPage,
        ] = await Promise.all([
          api<Page<GenerationResultView>>(
            `/generation-jobs/${encodeURIComponent(jobId)}/results${query}`,
            { signal: controller.signal },
          ),
          api<GenerationContextPage>(
            `/generation-jobs/${encodeURIComponent(jobId)}/record-context${query}`,
            { signal: controller.signal },
          ),
        ]);
        if (!Array.isArray(records.items) || !Array.isArray(context.items))
          throw new Error(
            msg(
              "The selected PDFs are no longer available. Return to the generation and choose them again.",
            ),
          );
        templateName ??= context.templateName ?? null;
        for (const record of records.items) found.set(record.recordId, record);
        for (const record of context.items)
          labels[record.recordId] =
            [record.name, record.subject, record.reference]
              .filter(Boolean)
              .join(" · ") || record.recordId;
        if (wanted.every((id) => found.has(id))) break;
        if (!records.nextCursor || seen.has(records.nextCursor)) break;
        seen.add(records.nextCursor);
        cursor = records.nextCursor;
      }
      const records = wanted.map((id) => found.get(id));
      if (
        records.some(
          (record) =>
            !record ||
            record.state !== "generated" ||
            record.documentStatus !== "ready" ||
            !record.documentId ||
            !record.documentHash,
        )
      )
        throw new Error(
          msg(
            "The selected PDFs are no longer available. Return to the generation and choose them again.",
          ),
        );
      if (!controller.signal.aborted)
        setState({
          scope,
          loading: false,
          records: records as GenerationResultView[],
          labels,
          templateName,
        });
    })().catch((error: unknown) => {
      if (!controller.signal.aborted)
        setState({
          scope,
          loading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
    });
    return () => controller.abort();
  }, [jobId, selection, valid, scope]);
  return state.scope === scope ? state : { scope, loading: true };
}

function DistributionPreparation({
  route,
  jobId,
}: {
  route: string;
  jobId: string;
}) {
  const selection = readGenerationSelection(route);
  const source = useResource<GenerationJobView>(
    jobId ? `/generation-jobs/${encodeURIComponent(jobId)}` : null,
  );
  const selected = usePreparationSelection(
    jobId,
    selection.recordIds,
    selection.valid,
  );
  const returnTo = generationSelectionRoute(jobId, selection.recordIds);
  const active =
    source.data && ["queued", "running"].includes(source.data.state);
  return (
    <>
      <a
        className="back-link"
        href={"#" + (jobId ? returnTo : studioRoutes.generations)}
      >
        {msg("Back to PDFs ")}
      </a>
      <PageHeading
        title={msg("Prepare distribution (") + selection.recordIds.length + ")"}
        intro={
          source.data
            ? `${selected.templateName ? `${selected.templateName} · v${source.data.templateVersion}` : msg("Template v") + source.data.templateVersion} · ${date(source.data.createdAt)}`
            : undefined
        }
      />
      <ErrorNotice error={source.error ?? selected.error} />
      {(!selection.valid || !selection.recordIds.length) && (
        <p className="notice info">
          {msg("Select at least one verified PDF in Studio.")}
        </p>
      )}
      {(source.loading || selected.loading) &&
        selection.recordIds.length > 0 && <Loading />}
      {active && (
        <p className="notice info">
          {msg(
            "Distribution will be available when the job finishes. PDFs that are already ready remain available to view. ",
          )}
        </p>
      )}
      {source.data?.id === jobId &&
        !active &&
        !selected.error &&
        !selected.loading &&
        !!selected.records?.length && (
          <>
            <DateTimezone />
            <DistributionForm
              jobId={jobId}
              recordIds={selection.recordIds}
              recordDocuments={Object.fromEntries(
                selected.records.map((record) => [
                  record.recordId,
                  record.documentId!,
                ]),
              )}
              recordLabels={selected.labels ?? {}}
              onClose={() => go(returnTo)}
            />
          </>
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
/** Each destination starts with no document, including a one-PDF selection. */
function newDestination(): Destination {
  return {
    id: crypto.randomUUID(),
    records: [],
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
  recordLabels,
  onClose,
}: {
  jobId: string;
  recordIds: string[];
  recordDocuments: Record<string, string>;
  recordLabels: Record<string, string>;
  onClose: () => void;
}) {
  const currentVisit = useCurrentVisit();
  const [destinations, setDestinations] = useState<Destination[]>([
    newDestination(),
  ]);
  const [multi, setMulti] = useState(false),
    action = useAction(),
    senders = useResource<{ items: Sender[] }>("/senders");
  const key = useRef(crypto.randomUUID()),
    last = useRef(""),
    summaryId = useId();
  const prepared = useRef(false);
  const initialDraft = useRef(JSON.stringify({ destinations, multi }));
  const dirty =
    JSON.stringify({ destinations, multi }) !== initialDraft.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (prepared.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const guard = (event: Event) => {
      if (
        !prepared.current &&
        !window.confirm(msg("Leave this preparation and lose unsaved changes?"))
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener(BEFORE_WORKSPACE_NAVIGATION, guard);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener(BEFORE_WORKSPACE_NAVIGATION, guard);
    };
  }, [dirty]);
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
    const isCurrentVisit = currentVisit();
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
      if (!isCurrentVisit()) return;
      prepared.current = true;
      go("/app/distribution/" + result.id);
    });
  }
  return (
    <form className="distribution-section" onSubmit={(e) => void prepare(e)}>
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
          className="distribution-destination"
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
                  records: e.target.value === "all" ? "all" : [],
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
              className="distribution-record-selection"
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
                  {recordLabels[recordId] ?? recordId}
                  {recordLabels[recordId] &&
                    recordLabels[recordId] !== recordId && (
                      <span className="distribution-meta"> · {recordId}</span>
                    )}
                </label>
              ))}
            </div>
          )}
          <div className="distribution-mapping-grid">
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
                <option value="common">{msg("One recipient")}</option>
                <option value="data">{msg("From each document’s data")}</option>
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
                <div key={channel} className="distribution-channel-mapping">
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
                    <fieldset className="distribution-destination">
                      <legend>
                        {msg("{0} recipients", channelLabel(channel))}
                      </legend>
                      <div className="distribution-mapping-grid">
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
            <div className="distribution-mapping-grid">
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
              <div className="distribution-mapping-grid">
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
          {/* Euros on screen; integer cents in the request. */}
          <Field label={msg("Cap per delivery (€)")}>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={10000}
              step={0.01}
              required
              value={destination.ceilingMinor / 100}
              onChange={(e) =>
                update(destination.id, {
                  ceilingMinor: Math.round(Number(e.target.value) * 100),
                })
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
      <section className="distribution-summary" aria-labelledby={summaryId}>
        <h3 id={summaryId}>{msg("What will be prepared")}</h3>
        <ul>
          {destinations.map((destination, index) => {
            const documents = recordIds.filter((recordId) =>
              applies(destination, recordId),
            );
            return (
              <li key={destination.id}>
                {msg(
                  "Destination {0} · {1}: {2}",
                  index + 1,
                  (destination.channel === "data"
                    ? destination.dataChannels
                    : [destination.channel]
                  )
                    .map(channelLabel)
                    .join(", ") || "—",
                  documents.length
                    ? documents
                        .map((recordId) => recordLabels[recordId] ?? recordId)
                        .join(", ")
                    : msg("no document chosen"),
                )}
              </li>
            );
          })}
        </ul>
        <div className="notice warning">
          <div>
            <p>
              {msg(
                "Preparing freezes this whole generation batch, including PDFs not selected here: their failures can no longer be retried in it. Retry them first, or correct them in a new generation.",
              )}
            </p>
            <p>
              {msg(
                "Preparing the distribution lets authorized approvers in this workspace view the selected PDFs to review these requests. It does not send anything.",
              )}
            </p>
            <p>
              {msg(
                "Preparation is not approval. Unavailable channels or rates remain blocked with an explicit error. ",
              )}
            </p>
          </div>
        </div>
      </section>
      <div className="button-group">
        <button className="button primary" disabled={action.pending}>
          {msg("Prepare pairs and quotes ")}
        </button>
        <button className="button" type="button" onClick={onClose}>
          {msg("Close ")}
        </button>
      </div>
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
  const currentVisit = useCurrentVisit();
  const resource = useResource<DistributionView>("/distribution-plans/" + id);
  const action = useAction();
  const keys = useRef<Record<string, string>>({});
  return (
    <>
      <a className="back-link" href={`#${studioRoutes.generations}`}>
        {msg("← Generations ")}
      </a>
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
          <div className="distribution-toolbar">
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
          <p className="distribution-meta">
            {msg("Manifest hash: ")}
            <code>{resource.data.manifestHash}</code>
          </p>
          <div
            className="distribution-table"
            role="region"
            onKeyDown={scrollTable}
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
                      <p className="distribution-meta">
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
                                    const isCurrentVisit = currentVisit();
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
                                    if (!isCurrentVisit()) return;
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
            href={"#" + studioRoutes.generation(resource.data.jobId)}
          >
            {msg("Back to PDFs ")}
          </a>
        </>
      )}
    </>
  );
}
