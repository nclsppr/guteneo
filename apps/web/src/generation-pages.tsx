import { msg } from "./messages";
import { scrollStudioTable } from "./studio-table-keyboard";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  GenerationJobView,
  GenerationResultView,
  DistributionView,
  Page,
} from "../../../packages/contracts/src/template-workflow";
import type { SourceCell } from "../../../packages/contracts/src/datasets";
import { api, date, type Channel, type Sender } from "./api";
import {
  ErrorNotice,
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
  queued: "En attente",
  running: "Génération en cours",
  completed: "Terminée",
  partial: "Résultat partiel",
  failed: "Échec",
  cancelled: "Annulée",
  generated: "PDF généré",
};
export function GenerationList({ canPrepare }: { canPrepare: boolean }) {
  const resource = useResource<Page<GenerationJobView>>("/generation-jobs");
  return (
    <>
      <PageHeading
        title={msg("Générations")}
        intro={msg(
          "Chaque résultat conserve son identifiant, sa version de modèle et son PDF exact. La génération ne déclenche aucun envoi.",
        )}
        action={
          canPrepare && (
            <a className="button primary" href="#/app/templates">
              {msg("Créer un document ")}
            </a>
          )
        }
      />
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        <div className="studio-list">
          {!resource.data?.items.length && (
            <p className="studio-list-row">
              {msg("Les PDF générés apparaîtront ici.")}
            </p>
          )}
          {resource.data?.items.map((job) => (
            <article className="studio-list-row" key={job.id}>
              <div>
                <h3>
                  <a href={"#/app/generation/" + job.id}>
                    {msg(stateLabel[job.state])} · {job.generated} / {job.total}{" "}
                    {msg("PDF ")}
                  </a>
                </h3>
                <p>
                  {date(job.createdAt)} {msg("· modèle v")}
                  {job.templateVersion} · {job.failed} {msg("erreur(s) ")}
                </p>
              </div>
              <a className="button small" href={"#/app/generation/" + job.id}>
                {msg("Suivre ")}
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
  const active = job.data && ["queued", "running"].includes(job.data.state);
  const refreshJob = job.refresh,
    refreshResults = results.refresh;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      refreshJob();
      refreshResults();
    }, 4000);
    return () => clearInterval(timer);
  }, [active, refreshJob, refreshResults]);
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
        {msg("← Générations ")}
      </a>
      <PageHeading
        title={msg(stateLabel[current.state])}
        intro={
          msg("Modèle v") +
          current.templateVersion +
          " · " +
          date(current.createdAt) +
          msg(
            ". Les documents sont associés à leur recordId, indépendamment de leur ordre de fin.",
          )
        }
      />
      <ErrorNotice error={action.error ?? job.error ?? results.error} />
      <section className="studio-section">
        <h2>
          {current.generated} / {current.total} {msg("PDF générés ")}
        </h2>
        <progress
          className="studio-progress"
          value={current.generated + current.failed + current.cancelled}
          max={current.total}
          aria-label={msg("Progression de la génération")}
        />
        <p role="status">
          {current.pending} {msg("en attente · ")}
          {current.failed} {msg("erreur(s) ·")} {current.cancelled}{" "}
          {msg("annulé(s). Aucun crédit d’envoi réservé. ")}
        </p>
        <div className="button-group">
          <button
            className="button small"
            onClick={() => {
              job.refresh();
              results.refresh();
            }}
          >
            {msg("Actualiser le suivi ")}
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
              {msg("Annuler les éléments restants ")}
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
              {msg("Reprendre les échecs affichés ")}
            </button>
          )}
        </div>
      </section>
      <div
        className="studio-table"
        role="region"
        onKeyDown={scrollStudioTable}
        tabIndex={0}
        aria-label={msg("Résultats de cette génération")}
      >
        <table>
          <caption>{msg("Résultats de cette génération")}</caption>
          <thead>
            <tr>
              <th>{msg("Sélection")}</th>
              <th>{msg("Record")}</th>
              <th>{msg("État")}</th>
              <th>{msg("PDF exact")}</th>
              <th>{msg("Action")}</th>
            </tr>
          </thead>
          <tbody>
            {results.data?.items.map((result) => (
              <tr key={result.recordId}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={msg("Sélectionner ") + result.recordId}
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
                  {msg(stateLabel[result.state])}
                  {result.documentStatus &&
                    " · " +
                      (result.documentStatus === "ready"
                        ? msg("vérifié")
                        : result.documentStatus)}
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
                        {msg("Ouvrir le document ")}
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
                    {msg("Voir la provenance ")}
                  </button>
                  {result.documentId && result.documentStatus === "ready" && (
                    <button
                      className="button small"
                      onClick={() => setPreviewId(result.documentId!)}
                    >
                      {msg("Voir le PDF ")}
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
            <h2>{msg("PDF final")}</h2>
            <button
              className="text-button"
              onClick={() => setPreviewId(undefined)}
            >
              {msg("Fermer l’aperçu ")}
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
            {msg("Sélectionner les PDF vérifiés affichés ")}
          </button>
          <button
            className="button primary"
            disabled={!selected.length || active}
            onClick={() => setDistributing(true)}
          >
            {msg("Préparer une distribution (")}
            {selected.length})
          </button>
        </div>
      )}
      {canPrepare && active && (
        <p className="field-hint">
          {msg(
            "La distribution sera disponible à la fin du job. Les PDF déjà prêts restent consultables. ",
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
  fax: [["phone", "Numéro international"]],
  email: [["email", "Adresse e-mail"]],
  postal: [
    ["name", "Nom"],
    ["line1", "Adresse"],
    ["postalCode", "Code postal"],
    ["city", "Ville"],
    ["country", "Pays (FR, LU ou DE)"],
  ],
};
function channelLabel(channel: Channel) {
  return msg(
    { fax: "Fax", email: "E-mail", postal: "Courrier postal" }[channel],
  );
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
            "Une distribution est limitée à 500 associations document / destination. Réduisez la sélection ou le nombre de destinations.",
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
            "Choisissez au moins un document pour chaque destination, ou retirez cette destination.",
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
            "Chaque PDF sélectionné doit avoir une destination. Fermez ce formulaire pour modifier la sélection si nécessaire.",
          ),
        );
      if (
        destinations.some(
          (destination) =>
            destination.channel === "data" && !destination.dataChannels.length,
        )
      )
        throw new Error(
          msg("Choisissez les canaux présents dans vos données."),
        );
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
        <h2>{msg("Distribution facultative")}</h2>
        <button className="text-button" type="button" onClick={onClose}>
          {msg("Fermer ")}
        </button>
      </div>
      <p>
        {recordIds.length} {msg("PDF sélectionnés · ")}
        {associationCount}{" "}
        {msg(
          "associations sur 500 maximum. Chaque PDF et destination forme un envoi distinct. Les devis, vérifications et approbations d’envoi auront lieu ensuite. ",
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
          <Field label={msg("Documents pour la destination ") + (index + 1)}>
            <select
              value={destination.records === "all" ? "all" : "selection"}
              onChange={(e) =>
                update(destination.id, {
                  records: e.target.value === "all" ? "all" : [...recordIds],
                })
              }
            >
              <option value="all">{msg("Tous les PDF sélectionnés")}</option>
              <option value="selection">
                {msg("Choisir les documents concernés")}
              </option>
            </select>
          </Field>
          {destination.records !== "all" && (
            <div
              className="studio-record-selection"
              role="group"
              aria-label={
                msg("Documents concernés par la destination ") + (index + 1)
              }
            >
              <p className="field-hint">
                {msg(
                  "Cette destination s’appliquera uniquement aux documents cochés. ",
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
            <Field label={msg("Canal ") + (index + 1)}>
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
                <option value="email">{msg("E-mail")}</option>
                <option value="postal">{msg("Courrier postal")}</option>
                <option value="data">{msg("Depuis les données")}</option>
              </select>
            </Field>
            <Field label={msg("Destinataire ") + (index + 1)}>
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
                  {msg("Même destinataire pour les documents concernés ")}
                </option>
                <option value="data">
                  {msg("Destinataire issu des données")}
                </option>
              </select>
            </Field>
            {destination.channel !== "data" && (
              <Field label={msg("Expéditeur ") + (index + 1)}>
                <select
                  required={destination.channel === "postal"}
                  value={destination.senderId}
                  onChange={(e) =>
                    update(destination.id, { senderId: e.target.value })
                  }
                >
                  <option value="">
                    {destination.channel === "postal"
                      ? msg("Choisir un profil postal vérifié")
                      : msg("Profil vérifié par défaut")}
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
                label={msg("Champ du canal")}
                hint={msg(
                  "Chemin dans les données figées contenant exactement fax, email ou postal, par exemple delivery.channel.",
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
                  "Choisissez les canaux présents dans vos données. Pour chaque canal, reliez ses champs de destinataire ; ils ne seront lus que pour les lignes qui utilisent ce canal.",
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
                        {msg("Destinataires {0}", channelLabel(channel))}
                      </legend>
                      <div className="studio-mapping-grid">
                        {recipientFields[channel].map(([field, label]) => (
                          <Field
                            key={field}
                            label={msg("Champ métier → ") + msg(label)}
                            hint={msg(
                              "Chemin dans les données figées, par exemple customer.email",
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
                        <Field
                          label={msg("Expéditeur {0}", channelLabel(channel))}
                        >
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
                                ? msg("Choisir un profil postal vérifié")
                                : msg("Profil vérifié par défaut")}
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
                    (destination.mode === "data"
                      ? msg("Champ métier → ")
                      : "") + msg(label)
                  }
                  hint={
                    destination.mode === "data"
                      ? msg(
                          "Chemin dans les données figées, par exemple customer.email",
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
                <Field label={msg("Impression")}>
                  <select
                    value={destination.printMode}
                    onChange={(e) =>
                      update(destination.id, {
                        printMode: e.target.value as Destination["printMode"],
                      })
                    }
                  >
                    <option value="simplex">{msg("Recto")}</option>
                    <option value="duplex">{msg("Recto verso")}</option>
                  </select>
                </Field>
                <Field label={msg("Couleur")}>
                  <select
                    value={destination.printSpectrum}
                    onChange={(e) =>
                      update(destination.id, {
                        printSpectrum: e.target
                          .value as Destination["printSpectrum"],
                      })
                    }
                  >
                    <option value="grayscale">{msg("Niveaux de gris")}</option>
                    <option value="color">{msg("Couleur")}</option>
                  </select>
                </Field>
                <Field label={msg("Acheminement")}>
                  <select
                    value={destination.deliveryProduct}
                    onChange={(e) =>
                      update(destination.id, {
                        deliveryProduct: e.target
                          .value as Destination["deliveryProduct"],
                      })
                    }
                  >
                    <option value="cheap">{msg("Économique")}</option>
                    <option value="fast">{msg("Rapide")}</option>
                  </select>
                </Field>
              </div>
              <p className="field-hint">
                {msg(
                  "Le manifeste conserve ces options. Chaque lettre passera ensuite par le contrôle postal du PDF exact et les consentements existants avant tout transfert. ",
                )}
              </p>
            </>
          )}
          {(destination.channel === "email" ||
            (destination.channel === "data" &&
              destination.dataChannels.includes("email"))) && (
            <>
              <Field label={msg("Objet de l’e-mail")}>
                <input
                  required
                  value={destination.subject}
                  onChange={(e) =>
                    update(destination.id, { subject: e.target.value })
                  }
                />
              </Field>
              <Field
                label={msg("Corps de l’e-mail")}
                hint={msg(
                  "Chaque e-mail comporte uniquement le PDF de son record. Aucun CC/BCC.",
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
          <Field label={msg("Plafond par envoi (centimes d’euro)")}>
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
              {msg("Retirer cette destination ")}
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
        {msg("Ajouter une destination ou un canal ")}
      </button>
      {multichannelDocuments > 0 && (
        <label className="check-field">
          <input
            type="checkbox"
            required
            checked={multi}
            onChange={(e) => setMulti(e.target.checked)}
          />
          {msg(
            "Je demande explicitement l’utilisation de plusieurs canaux pour",
          )}{" "}
          {multichannelDocuments} {msg("PDF. ")}
        </label>
      )}
      <p className="field-hint">
        {msg(
          "La préparation rend les PDF sélectionnés consultables par les approbateurs de cet atelier pour examiner ces demandes. Elle ne déclenche aucun envoi.",
        )}
      </p>
      <p className="field-hint">
        {msg(
          "La préparation ne vaut pas approbation. Les canaux ou tarifs non disponibles restent bloqués avec une erreur explicite. ",
        )}
      </p>
      <button className="button primary" disabled={action.pending}>
        {msg("Préparer les associations et les devis ")}
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
  const resource = useResource<DistributionView>("/distribution-plans/" + id);
  const action = useAction();
  const keys = useRef<Record<string, string>>({});
  return (
    <>
      <PageHeading
        title={msg("Distribution préparée")}
        intro={msg(
          "Le manifeste fige chaque record, PDF, hash, canal et destinataire. Chaque envoi conserve ses contrôles et son approbation.",
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
              {msg("Actualiser la distribution ")}
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
                {msg("Préparer les 3 associations suivantes ( ")}
                {resource.data.pendingCount} {msg("restantes) ")}
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
                {msg("Réessayer les préparations en erreur ")}
              </button>
            )}
          </div>
          <p className="studio-meta">
            {msg("Empreinte du manifeste : ")}
            <code>{resource.data.manifestHash}</code>
          </p>
          <div
            className="studio-table"
            role="region"
            onKeyDown={scrollStudioTable}
            tabIndex={0}
            aria-label={msg("Distribution préparée")}
          >
            <table>
              <thead>
                <tr>
                  <th>{msg("Record")}</th>
                  <th>{msg("Document")}</th>
                  <th>{msg("Canal / destination")}</th>
                  <th>{msg("Suite du parcours")}</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.entries.map((entry) => (
                  <tr key={entry.entryId}>
                    <th scope="row">{entry.recordId}</th>
                    <td>
                      <a href={"#/app/documents?document=" + entry.documentId}>
                        {msg("PDF · modèle v")}
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
                            ? msg("Vérifier le devis et approuver ")
                            : msg("Ouvrir ")}
                        </a>
                      ) : entry.postalDispatchId ? (
                        <a
                          className="button small"
                          href={"#/app/dispatch/" + entry.postalDispatchId}
                        >
                          {msg("Vérifier le devis postal final ")}
                        </a>
                      ) : entry.postalReviewId ? (
                        <>
                          <p>
                            {msg("Contrôle postal : ")}
                            {entry.postalReviewStatus}
                          </p>
                          <a
                            className="button small"
                            href={"#/app/postal/" + entry.postalReviewId}
                          >
                            {canPrepare
                              ? msg("Vérifier la lettre et poursuivre ")
                              : msg("Ouvrir ")}
                          </a>
                        </>
                      ) : (
                        <>
                          <p>
                            {entry.errorCode ? (
                              <>
                                {msg("Préparation bloquée :")}{" "}
                                <code>{entry.errorCode}</code>
                              </>
                            ) : (
                              "Association en attente de préparation."
                            )}
                          </p>
                          {canPrepare && entry.channel === "postal" && (
                            <>
                              <p className="field-hint">
                                {msg(
                                  "Vérifiez l’adresse, les zones réservées et les pages finales dans le parcours postal. ",
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
                                {msg("Contrôler cette lettre ")}
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
            {msg("Revenir aux PDF ")}
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
          {msg("Provenance de ")}
          {recordId}
        </h2>
        <button className="text-button" onClick={onClose}>
          {msg("Fermer la provenance ")}
        </button>
      </div>
      <ErrorNotice error={trace.error} />
      {trace.loading && !trace.data && <Loading />}
      {trace.data && (
        <>
          <p>
            {msg("Modèle v")}
            {trace.data.templateVersion}
            {trace.data.mappingVersion
              ? msg(" · Correspondance v{0}", trace.data.mappingVersion)
              : msg(" · Données saisies directement")}
          </p>
          <p className="studio-meta">
            {msg("Empreinte des données : ")}
            <code>{trace.data.inputHash}</code>
          </p>
          {trace.data.sourceHash && (
            <p className="studio-meta">
              {msg("Empreinte du fichier : ")}
              <code>{trace.data.sourceHash}</code>
            </p>
          )}
          <div
            className="studio-table"
            role="region"
            onKeyDown={scrollStudioTable}
            tabIndex={0}
            aria-label={msg("Provenance de ") + recordId}
          >
            <table>
              <thead>
                <tr>
                  <th>{msg("Champ métier")}</th>
                  <th>{msg("Cellules sources")}</th>
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
                          {c.sheet} · {c.address} {msg("(ligne ")}
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
            {msg("Rendu :")}{" "}
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
