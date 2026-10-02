import { msg } from "./messages";
import { scrollStudioTable } from "./studio-table-keyboard";
import { useStudioAiPolicy, StudioAiNotice } from "./studio-ai";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, UploadSimple } from "@phosphor-icons/react";
import type {
  DatasetProfile,
  ProfileSheet,
  DatasetField,
  MappingPlan,
  MappingValidation,
} from "../../../packages/contracts/src/datasets";
import type { BusinessField } from "../../../packages/contracts/src/templates";
import type { DatasetSchemaSuggestion } from "../../../packages/data/schema-ai";
import type {
  DatasetView,
  DatasetProfileView,
  TemplateView,
  MappingView,
  Page,
  GenerationJobView,
} from "../../../packages/contracts/src/template-workflow";
import { api, bytes, date, permissionsFor, type Session } from "./api";
import { RolePermissionNotice } from "./role-guide";
import {
  ErrorNotice,
  Field,
  go,
  Loading,
  LoadMore,
  PageHeading,
  useAction,
  useResource,
} from "./components";

export function DatasetLibrary({ session }: { session: Session }) {
  const canPrepare = permissionsFor(session).prepareDispatches;
  const resource = useResource<Page<DatasetView>>("/datasets");
  const action = useAction();
  const file = useRef<HTMLInputElement>(null);
  const [encoding, setEncoding] = useState("utf-8");
  const [delimiter, setDelimiter] = useState("");
  const [xmlRecordPath, setXmlRecordPath] = useState("");
  async function upload(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const selected = file.current?.files?.[0];
      if (!selected)
        throw new Error(msg("Choisissez un fichier CSV, XLSX, XML ou JSON."));
      if (selected.size > 5 * 1024 * 1024)
        throw new Error(msg("Le fichier dépasse 5 Mo."));
      const form = new FormData();
      form.set("file", selected);
      if (selected.name.toLowerCase().endsWith(".csv")) {
        form.set("encoding", encoding);
        if (delimiter) form.set("delimiter", delimiter);
      }
      if (selected.name.toLowerCase().endsWith(".xml") && xmlRecordPath.trim())
        form.set("xmlRecordPath", xmlRecordPath.trim());
      const dataset = await api<DatasetView>("/datasets", {
        method: "POST",
        body: form,
      });
      go("/app/dataset/" + dataset.id);
    });
  }
  return (
    <>
      <PageHeading
        title={msg("Mes données")}
        intro={msg(
          "Importez votre fichier tel qu’il est. Choisissez les feuilles, les colonnes et les regroupements avant de générer vos documents.",
        )}
      />
      <ErrorNotice error={action.error ?? resource.error} />
      {!canPrepare && <RolePermissionNotice />}
      {canPrepare && (
        <form className="studio-section" onSubmit={(e) => void upload(e)}>
          <h2>{msg("Importer mes données")}</h2>
          <p>
            {msg(
              "CSV, Excel .xlsx, XML ou JSON. Le fichier original reste privé. L’import n’appelle aucune IA et ne prépare aucun envoi. ",
            )}
          </p>
          <Field
            label={msg("Fichier de données")}
            hint={msg(
              "5 Mo maximum, 12 feuilles, 5 000 lignes et 100 000 cellules au maximum.",
            )}
          >
            <input
              ref={file}
              type="file"
              accept=".csv,.xlsx,.xml,.json,text/csv,application/xml,text/xml,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
            />
          </Field>
          <details>
            <summary>{msg("Options CSV")}</summary>
            <div className="studio-mapping-grid">
              <Field label={msg("Encodage CSV")}>
                <select
                  value={encoding}
                  onChange={(e) => setEncoding(e.target.value)}
                >
                  <option value="utf-8">{msg("UTF-8")}</option>
                  <option value="windows-1252">{msg("Windows-1252")}</option>
                </select>
              </Field>
              <Field label={msg("Séparateur CSV")}>
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                >
                  <option value="">{msg("Détection automatique")}</option>
                  <option value=",">{msg("Virgule")}</option>
                  <option value=";">{msg("Point-virgule")}</option>
                  <option value={"\t"}>{msg("Tabulation")}</option>
                  <option value="|">{msg("Barre verticale")}</option>
                </select>
              </Field>
            </div>
          </details>
          <details>
            <summary>{msg("Options XML")}</summary>
            <Field
              label={msg("Chemin des enregistrements XML")}
              hint={msg(
                "Facultatif pour une seule collection. Exemple : /export/clients/client. Si plusieurs collections existent, précisez celle à importer.",
              )}
            >
              <input
                value={xmlRecordPath}
                onChange={(event) => setXmlRecordPath(event.target.value)}
                placeholder="/export/clients/client"
                maxLength={512}
              />
            </Field>
          </details>
          <button className="button primary" disabled={action.pending}>
            <UploadSimple size={18} />
            {action.pending
              ? msg("Analyse technique…")
              : msg("Importer et reconnaître les données")}
          </button>
        </form>
      )}
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        <div className="studio-list">
          {!resource.data?.items.length && (
            <p className="studio-list-row">
              {msg("Vos fichiers apparaîtront ici après import. ")}
            </p>
          )}
          {resource.data?.items.map((item) => (
            <article key={item.id} className="studio-list-row">
              <div>
                <h3>
                  <a href={"#/app/dataset/" + item.id}>{item.name}</a>
                </h3>
                <p>
                  {item.format.toUpperCase()} · {bytes(item.size)} ·{" "}
                  {item.status === "ready"
                    ? msg("Reconnu")
                    : item.status === "quarantined"
                      ? msg("En vérification")
                      : item.status === "purged"
                        ? msg("Supprimé")
                        : msg("Refusé")}{" "}
                  · {date(item.createdAt)}
                </p>
              </div>
              <a className="button small" href={"#/app/dataset/" + item.id}>
                {canPrepare ? msg("Interpréter ") : msg("Ouvrir ")}
                <ArrowRight size={16} />
              </a>
            </article>
          ))}
        </div>
      )}
      <LoadMore
        path="/datasets"
        data={resource.data}
        onLoaded={resource.setData}
      />
      {session.user.role === "admin" && <AiPolicy />}
    </>
  );
}

function sheetHeaders(sheet: ProfileSheet | undefined, row: number) {
  return (
    sheet?.rows
      .find((r) => r.rowNumber === row)
      ?.cells.map((c) => c.raw ?? "") ?? []
  );
}
function fieldPaths(
  schema: BusinessField,
  prefix = "",
): { path: string; schema: BusinessField }[] {
  return schema.type === "object"
    ? Object.entries(schema.properties ?? {}).flatMap(([key, child]) =>
        fieldPaths(child, prefix ? prefix + "." + key : key),
      )
    : [{ path: prefix, schema }];
}
function fieldType(schema: BusinessField): DatasetField["type"] {
  return schema.format === "date"
    ? "date"
    : schema.type === "integer"
      ? "integer"
      : schema.type === "number"
        ? "decimal"
        : schema.type === "boolean"
          ? "boolean"
          : "text";
}
function suggestColumn(headers: string[], target: string, title?: string) {
  const normalize = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  return (
    headers.find((h) =>
      [target.split(".").at(-1) ?? target, title ?? ""].some(
        (t) => normalize(t) === normalize(h),
      ),
    ) ?? ""
  );
}
function defaultPlan(profile: DatasetProfile): MappingPlan {
  const sheet = profile.sheets[0],
    header = sheet.headerCandidates[0] ?? sheet.rows[0]?.rowNumber ?? 1;
  return {
    version: 1,
    name: msg("Correspondance de données"),
    sourceSheet: sheet.name,
    headerRow: header,
    recordKey: [],
    fields: [],
    joins: [],
    excludeRows: [],
    includeHidden: false,
    formulaPolicy: "reject",
    expectedHeaders: sheetHeaders(sheet, header),
  };
}
type PagedProfileView = DatasetProfileView & {
  pagination: {
    sheet: string;
    cursor: number;
    limit: number;
    totalRows: number;
    nextCursor: number | null;
    sampleValuesTruncatedAt: number;
    otherSheetsAreHeaderSamples: boolean;
  };
};
function profilePagePath(
  id: string,
  sheet: string,
  cursor: number,
  limit = 30,
) {
  return `/datasets/${id}/profile?${new URLSearchParams({ sheet, cursor: String(cursor), limit: String(limit) })}`;
}

// Header rows remain independent of the currently browsed page. A custom
// header beyond the initial sample is fetched alone, without retaining a file.
function useMappingHeaders(
  id: string,
  profile: DatasetProfile,
  plan: MappingPlan,
) {
  const [loaded, setLoaded] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<Error>();
  const selection = JSON.stringify([
    [plan.sourceSheet, plan.headerRow],
    ...plan.joins.map((join) => [join.sheet, join.headerRow]),
  ]);
  const initial = (sheet: string, row: number) =>
    profile.sheets
      .find((entry) => entry.name === sheet)
      ?.rows.find((entry) => entry.rowNumber === row);
  useEffect(() => {
    const controller = new AbortController();
    const rows = JSON.parse(selection) as [string, number][];
    setError(undefined);
    const missing = rows.filter(
      ([sheet, row]) =>
        Number.isInteger(row) &&
        row > 0 &&
        row <= 5000 &&
        !profile.sheets
          .find((entry) => entry.name === sheet)
          ?.rows.some((entry) => entry.rowNumber === row),
    );
    void Promise.all(
      missing.map(async ([sheet, row]) => {
        const page = await api<PagedProfileView>(
          profilePagePath(id, sheet, row - 1, 1),
          { signal: controller.signal },
        );
        const result = page.profile.sheets
          .find((entry) => entry.name === sheet)
          ?.rows.find((entry) => entry.rowNumber === row);
        if (!result)
          throw new Error(
            msg(
              "La ligne d’en-têtes {0} n’existe pas dans la feuille {1}.",
              row,
              sheet,
            ),
          );
        return [
          JSON.stringify([sheet, row]),
          result.cells.map((cell) => cell.raw ?? ""),
        ] as const;
      }),
    )
      .then((entries) => {
        if (!controller.signal.aborted) setLoaded(Object.fromEntries(entries));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause : new Error(String(cause)));
      });
    return () => controller.abort();
  }, [id, profile, selection]);
  const headers = (sheet: string, row: number) =>
    initial(sheet, row)?.cells.map((cell) => cell.raw ?? "") ??
    loaded[JSON.stringify([sheet, row])] ??
    [];
  const pending = (JSON.parse(selection) as [string, number][]).some(
    ([sheet, row]) =>
      !initial(sheet, row) && !loaded[JSON.stringify([sheet, row])],
  );
  return { headers, pending, error };
}

function DatasetPreview({
  value,
  sourceSheet,
}: {
  value: PagedProfileView;
  sourceSheet: string;
}) {
  const [sheet, setSheet] = useState(sourceSheet);
  const [cursor, setCursor] = useState(0);
  const resource = useResource<PagedProfileView>(
    profilePagePath(value.dataset.id, sheet, cursor),
  );
  const matches = (page: PagedProfileView | undefined) =>
    page?.pagination.sheet === sheet && page.pagination.cursor === cursor;
  const current = matches(resource.data)
    ? resource.data
    : matches(value)
      ? value
      : undefined;
  const rows =
    current?.profile.sheets.find((entry) => entry.name === sheet)?.rows ?? [];
  const columns = Math.max(1, ...rows.map((row) => row.cells.length));
  const pagination = current?.pagination;
  return (
    <>
      <Field
        label={msg("Feuille de l’aperçu")}
        hint={msg(
          "Parcourez toutes les feuilles sans modifier votre correspondance.",
        )}
      >
        <select
          value={sheet}
          onChange={(event) => {
            setSheet(event.target.value);
            setCursor(0);
          }}
        >
          {value.profile.sheets.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
              {entry.hidden ? msg(" (masquée)") : ""}
            </option>
          ))}
        </select>
      </Field>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {!current && resource.loading ? (
        <Loading />
      ) : (
        current && (
          <>
            <div
              className="studio-table"
              role="region"
              onKeyDown={scrollStudioTable}
              tabIndex={0}
              aria-label={msg("Aperçu original — ") + sheet}
              aria-busy={resource.loading}
            >
              <table>
                <caption>
                  {msg("Aperçu original — ")}
                  {sheet} {msg(": lignes ")}
                  {rows[0]?.rowNumber ?? 0} {msg("à")}{" "}
                  {rows.at(-1)?.rowNumber ?? 0} {msg("sur ")}
                  {pagination!.totalRows}
                </caption>
                <thead>
                  <tr>
                    <th>{msg("Ligne")}</th>
                    {Array.from({ length: columns }, (_, index) => (
                      <th key={index}>
                        {msg("Colonne ")}
                        {index + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <th scope="row">
                        {row.rowNumber}
                        {row.hidden ? msg(" · masquée") : ""}
                      </th>
                      {Array.from({ length: columns }, (_, index) => {
                        const cell = row.cells[index];
                        return (
                          <td key={index}>
                            {cell?.raw ?? "—"}
                            {cell?.formula && (
                              <span className="studio-meta">
                                {" "}
                                {msg("· formule ")}
                                {cell.cached
                                  ? msg(" (cache)")
                                  : msg(" sans résultat")}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="studio-meta">
              {msg("Les valeurs longues sont limitées à")}{" "}
              {pagination!.sampleValuesTruncatedAt}{" "}
              {msg(
                "caractères dans cet aperçu. Le fichier complet est utilisé pour la validation. ",
              )}
            </p>
          </>
        )
      )}
      <nav
        className="button-group"
        aria-label={msg("Pages de l’aperçu des données")}
      >
        <button
          type="button"
          className="button small"
          disabled={cursor === 0 || resource.loading}
          onClick={() => setCursor(0)}
        >
          {msg("Première page ")}
        </button>
        <button
          type="button"
          className="button small"
          disabled={cursor === 0 || resource.loading}
          onClick={() => setCursor(Math.max(0, cursor - 30))}
        >
          {msg("Page précédente ")}
        </button>
        <button
          type="button"
          className="button small"
          disabled={
            !pagination || pagination.nextCursor === null || resource.loading
          }
          onClick={() => {
            if (pagination?.nextCursor != null)
              setCursor(pagination.nextCursor);
          }}
        >
          {msg("Page suivante ")}
        </button>
      </nav>
    </>
  );
}

function parseExcludedRows(text: string): number[] {
  if (!text.trim()) return [];
  const parts = text.split(",").map((part) => part.trim());
  if (
    parts.some(
      (part) => !/^\d+$/.test(part) || Number(part) < 1 || Number(part) > 5000,
    )
  )
    throw new Error(
      msg(
        "Indiquez des numéros de ligne de 1 à 5 000 séparés par des virgules, par exemple 8, 14.",
      ),
    );
  return [...new Set(parts.map(Number))];
}
export function DatasetMapper({
  id,
  canPrepare,
}: {
  id: string;
  canPrepare: boolean;
}) {
  const resource = useResource<PagedProfileView>(
    "/datasets/" + id + "/profile",
  );
  if (!resource.data)
    return (
      <>
        <PageHeading
          title={msg("Reconnaissance du fichier")}
          intro={msg(
            "Le fichier original est conservé séparément de son interprétation.",
          )}
        />
        <ErrorNotice error={resource.error} retry={resource.refresh} />
        {resource.loading && <Loading />}
        {resource.error && (
          <DatasetRecovery
            id={id}
            onReady={resource.refresh}
            canPrepare={canPrepare}
          />
        )}
      </>
    );
  if (!canPrepare)
    return (
      <>
        <a className="back-link" href="#/app/datasets">
          {msg("← Mes données ")}
        </a>
        <PageHeading title={resource.data.dataset.name} />
        <RolePermissionNotice />
        <DatasetPreview
          value={resource.data}
          sourceSheet={resource.data.profile.sheets[0]?.name ?? ""}
        />
      </>
    );
  return <MappingEditor key={id} value={resource.data} />;
}
function DatasetRecovery({
  id,
  onReady,
  canPrepare,
}: {
  id: string;
  onReady: () => void;
  canPrepare: boolean;
}) {
  const status = useResource<DatasetView>(`/datasets/${id}`);
  const action = useAction();
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!waitSeconds) return;
    const timer = setTimeout(() => setWaitSeconds(waitSeconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);
  useEffect(() => {
    if (status.data?.analysis.retryAfterSeconds)
      setWaitSeconds(status.data.analysis.retryAfterSeconds);
  }, [status.data]);
  return (
    <section className="studio-section">
      <h2>{msg("Vérification de votre fichier")}</h2>
      <ErrorNotice error={action.error ?? status.error} />
      {status.data && (
        <>
          <p>
            {status.data.status === "purged"
              ? msg(
                  "La durée de conservation de cet original est écoulée. Importez à nouveau le fichier si nécessaire.",
                )
              : status.data.status === "rejected"
                ? msg(
                    "Ce fichier n’a pas passé les contrôles. Corrigez le fichier source avant un nouvel import.",
                  )
                : status.data.analysis.running
                  ? msg(
                      "L’analyse est en cours. Le fichier original est conservé ; attendez avant d’actualiser.",
                    )
                  : msg(
                      "L’analyse du fichier n’a pas abouti. Cette étape protège la génération ; un état de vérification ne signifie pas à lui seul que le fichier contient un virus.",
                    )}
          </p>
          <p>
            {status.data.analysis.attempts} {msg("tentative(s) sur")}{" "}
            {status.data.analysis.maxAttempts}.{" "}
            {waitSeconds > 0
              ? msg("Attendez {0} seconde(s).", waitSeconds)
              : ""}
          </p>
          <div className="button-group">
            <button
              className="button"
              disabled={
                !canPrepare ||
                action.pending ||
                waitSeconds > 0 ||
                !status.data.analysis.canRetry
              }
              onClick={() =>
                void action.run(async () => {
                  const next = await api<DatasetView>(
                    `/datasets/${id}/retry-analysis`,
                    { method: "POST", body: {} },
                  );
                  status.setData(next);
                  if (next.status === "ready") onReady();
                })
              }
            >
              {msg("Relancer l’analyse du même fichier ")}
            </button>
            <button
              className="button small"
              onClick={() => {
                status.refresh();
                onReady();
              }}
            >
              {msg("Actualiser l’état ")}
            </button>
            <a className="text-link" href="#/app/datasets">
              {canPrepare
                ? msg("Importer un fichier corrigé ")
                : msg("Mes données ")}
            </a>
          </div>
        </>
      )}
    </section>
  );
}
type DatasetSchemaResponse = Omit<DatasetSchemaSuggestion, "validation"> & {
  validation: Pick<MappingValidation, "status" | "issues" | "documentCount"> & {
    examples: MappingValidation["records"];
  };
};
type ValidationResult = {
  mapping: MappingView;
  status: MappingValidation["status"];
  issues: MappingValidation["issues"];
  documentCount: number;
  examples: MappingValidation["records"];
};
function MappingEditor({ value }: { value: PagedProfileView }) {
  const aiPolicy = useStudioAiPolicy();
  const { dataset, profile } = value;
  const templates = useResource<Page<TemplateView>>("/templates"),
    mappings = useResource<Page<MappingView>>("/mappings"),
    action = useAction();
  const [templateId, setTemplateId] = useState(""),
    [plan, setPlan] = useState<MappingPlan>(defaultPlan(profile));
  const [saved, setSaved] = useState<MappingView>(),
    [validation, setValidation] = useState<ValidationResult>();
  const [arrayPath, setArrayPath] = useState(""),
    [arraySource, setArraySource] = useState("same"),
    [aiMessage, setAiMessage] = useState(""),
    [reuseId, setReuseId] = useState("");
  const [excludeRowsText, setExcludeRowsText] = useState(
    plan.excludeRows.join(", "),
  );
  const [excludeRowsError, setExcludeRowsError] = useState<string>();
  const [schemaGoal, setSchemaGoal] = useState("");
  const [schemaProposal, setSchemaProposal] = useState<DatasetSchemaResponse>();
  const [schemaReviewed, setSchemaReviewed] = useState(false);
  const schemaAdoption = useRef<{
    mapping?: MappingView;
    template?: TemplateView;
  }>({});
  const template = templates.data?.items.find((t) => t.id === templateId);
  const headerRows = useMappingHeaders(dataset.id, profile, plan);
  const headers = headerRows.headers(plan.sourceSheet, plan.headerRow);
  const array = template
    ? fieldPaths(template.envelope.inputSchema).find(
        (f) => f.path === arrayPath && f.schema.type === "array",
      )
    : undefined;
  const incompatibleNumbers = template
    ? (() => {
        const scalar = fieldPaths(template.envelope.inputSchema);
        const incompatible = (
          fields: DatasetField[],
          schema: BusinessField,
          prefix = "",
        ) => {
          const paths = fieldPaths(schema);
          return fields
            .filter(
              (field) =>
                field.source.trim() &&
                field.type === "decimal" &&
                paths.find((path) => path.path === field.target)?.schema
                  .type === "number",
            )
            .map((field) => prefix + field.target);
        };
        const paths = incompatible(plan.fields, template.envelope.inputSchema);
        for (const table of [
          plan.group && {
            target: plan.group.itemPath,
            fields: plan.group.fields,
          },
          ...plan.joins,
        ].filter((entry) => !!entry)) {
          const items = scalar.find((path) => path.path === table.target)
            ?.schema.items;
          if (items)
            paths.push(
              ...incompatible(table.fields, items, table.target + "[]."),
            );
        }
        return paths;
      })()
    : [];
  const generationKey = useRef(crypto.randomUUID());
  function edit(next: MappingPlan) {
    if (next.excludeRows !== plan.excludeRows) {
      setExcludeRowsText(next.excludeRows.join(", "));
      setExcludeRowsError(undefined);
    }
    setPlan(next);
    setValidation(undefined);
    generationKey.current = crypto.randomUUID();
  }
  function selectTemplate(id: string) {
    setTemplateId(id);
    const selected = templates.data?.items.find((t) => t.id === id);
    if (!selected) return;
    edit({
      ...plan,
      fields: fieldPaths(selected.envelope.inputSchema)
        .filter((f) => f.schema.type !== "array")
        .map((f) => ({
          source: suggestColumn(headers, f.path, f.schema.title),
          target: f.path,
          type: fieldType(f.schema),
          required: true,
        })),
      group: undefined,
      joins: [],
    });
    setArrayPath("");
  }
  function configureArray(path: string, source: string) {
    setArrayPath(path);
    setArraySource(source);
    const field = template
      ? fieldPaths(template.envelope.inputSchema).find((f) => f.path === path)
      : undefined;
    if (!field?.schema.items) {
      edit({ ...plan, group: undefined, joins: [] });
      return;
    }
    const sheet = profile.sheets.find((s) => s.name === source),
      row = sheet?.headerCandidates[0] ?? 1;
    const sourceHeaders =
      source === "same" ? headers : headerRows.headers(source, row);
    const fields = fieldPaths(field.schema.items).map((f) => ({
      source: suggestColumn(sourceHeaders, f.path, f.schema.title),
      target: f.path,
      type: fieldType(f.schema),
      required: true,
    }));
    if (source === "same")
      edit({ ...plan, group: { itemPath: path, fields }, joins: [] });
    else
      edit({
        ...plan,
        group: undefined,
        joins: [
          {
            sheet: source,
            headerRow: row,
            parentKey: plan.recordKey[0] ?? "",
            childKey: "",
            target: path,
            cardinality: "one-to-many",
            fields,
            expectedHeaders: sourceHeaders,
            excludeRows: [],
          },
        ],
      });
  }
  async function validate(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (!template)
        throw new Error(
          msg("Choisissez le modèle que ces données alimenteront."),
        );
      if (headerRows.pending || headerRows.error)
        throw new Error(
          msg(
            "Attendez le chargement des en-têtes de chaque feuille avant de valider.",
          ),
        );
      if (incompatibleNumbers.length)
        throw new Error(
          msg(
            "Les décimaux exacts nécessitent un champ texte dans le modèle. Adaptez les champs signalés avant de valider.",
          ),
        );
      const excludeRows = parseExcludedRows(excludeRowsText);
      edit({ ...plan, excludeRows });
      const body = {
        datasetId: dataset.id,
        plan: {
          ...plan,
          excludeRows,
          expectedHeaders: headers,
          joins: plan.joins.map((join) => ({
            ...join,
            expectedHeaders: headerRows.headers(join.sheet, join.headerRow),
          })),
        },
        ...(saved
          ? { mappingId: saved.id, expectedVersion: saved.version }
          : {}),
      };
      const mapping = await api<MappingView>("/mappings", {
        method: "POST",
        body,
      });
      setSaved(mapping);
      setValidation(
        await api<ValidationResult>("/mappings/" + mapping.id + "/validate", {
          method: "POST",
          body: { datasetId: dataset.id, version: mapping.version },
        }),
      );
      mappings.refresh();
    });
  }
  return (
    <>
      <a className="back-link" href="#/app/datasets">
        {msg("← Mes données ")}
      </a>
      <PageHeading
        title={dataset.name}
        intro={msg(
          "Vérifiez les données reconnues, puis leur correspondance avec votre modèle. Chaque client peut regrouper plusieurs lignes.",
        )}
      />
      <ErrorNotice
        error={
          action.error ?? templates.error ?? mappings.error ?? headerRows.error
        }
      />
      <p className="studio-meta">
        {msg("Original privé · ")}
        {bytes(dataset.size)} {msg("· suppression de la source prévue le ")}
        {date(dataset.expiresAt)} · {profile.sheets.length} {msg("feuille(s) ")}
      </p>
      {!!profile.issues.length && (
        <details className="studio-section" open>
          <summary>
            {profile.issues.length} {msg("points signalés dans le fichier ")}
          </summary>
          <ul className="studio-warning-list">
            {profile.issues.slice(0, 50).map((issue, i) => (
              <li key={i}>
                {issue.source &&
                  issue.source.sheet + " " + issue.source.address + " : "}
                {issue.message} <code>{issue.code}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      <form onSubmit={(e) => void validate(e)}>
        <section className="studio-section">
          <h2>{msg("1. Reconnaître la structure")}</h2>
          <div className="studio-mapping-grid">
            <Field label={msg("Feuille principale")}>
              <select
                value={plan.sourceSheet}
                onChange={(e) => {
                  const sheet = profile.sheets.find(
                    (s) => s.name === e.target.value,
                  )!;
                  const row = sheet.headerCandidates[0] ?? 1;
                  edit({
                    ...plan,
                    sourceSheet: sheet.name,
                    headerRow: row,
                    recordKey: [],
                    expectedHeaders: headerRows.headers(sheet.name, row),
                  });
                }}
              >
                {profile.sheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name}>
                    {sheet.name}
                    {sheet.hidden ? msg(" (masquée)") : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={msg("Ligne des en-têtes")}>
              <input
                type="number"
                min={1}
                max={5000}
                value={plan.headerRow}
                onChange={(e) =>
                  edit({
                    ...plan,
                    headerRow: Number(e.target.value),
                    expectedHeaders: headerRows.headers(
                      plan.sourceSheet,
                      Number(e.target.value),
                    ),
                  })
                }
              />
            </Field>
            <Field
              label={msg("Clé du document / client")}
              hint={msg(
                "Plusieurs lignes avec la même clé forment un document.",
              )}
            >
              <select
                value={plan.recordKey[0] ?? ""}
                onChange={(e) =>
                  edit({
                    ...plan,
                    recordKey: e.target.value ? [e.target.value] : [],
                  })
                }
              >
                <option value="">{msg("Une ligne par document")}</option>
                {headers.map((h, i) => (
                  <option key={i} value={h}>
                    {h || msg("Colonne ") + (i + 1) + msg(" vide")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {headerRows.pending && (
            <p role="status">{msg("Chargement des en-têtes sélectionnés…")}</p>
          )}
          <DatasetPreview
            key={plan.sourceSheet}
            value={value}
            sourceSheet={plan.sourceSheet}
          />
          <Field
            label={msg("Lignes à exclure explicitement")}
            hint={msg(
              "Numéros séparés par des virgules : par exemple 8, 14 pour les sous-totaux.",
            )}
          >
            <input
              value={excludeRowsText}
              aria-invalid={!!excludeRowsError}
              aria-describedby={
                excludeRowsError ? "excluded-rows-error" : undefined
              }
              onChange={(event) => {
                setExcludeRowsText(event.target.value);
                setExcludeRowsError(undefined);
                setValidation(undefined);
                generationKey.current = crypto.randomUUID();
              }}
              onBlur={() => {
                try {
                  edit({
                    ...plan,
                    excludeRows: parseExcludedRows(excludeRowsText),
                  });
                } catch (cause) {
                  setExcludeRowsError(
                    cause instanceof Error ? cause.message : String(cause),
                  );
                }
              }}
            />
          </Field>
          {excludeRowsError && (
            <p id="excluded-rows-error" role="alert">
              {excludeRowsError}
            </p>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={plan.includeHidden}
              onChange={(e) =>
                edit({ ...plan, includeHidden: e.target.checked })
              }
            />
            {msg("Inclure les lignes et feuilles masquées ")}
          </label>
          <Field label={msg("Cellules de formule")}>
            <select
              value={plan.formulaPolicy}
              onChange={(e) =>
                edit({
                  ...plan,
                  formulaPolicy: e.target.value as MappingPlan["formulaPolicy"],
                })
              }
            >
              <option value="reject">{msg("Demander une correction")}</option>
              <option value="cached">
                {msg(
                  "Utiliser uniquement le résultat déjà enregistré dans le fichier ",
                )}
              </option>
            </select>
          </Field>
        </section>
        <section className="studio-section">
          <h2>{msg("2. Relier les champs")}</h2>
          <Field label={msg("Modèle à remplir")}>
            <select
              required
              value={templateId}
              onChange={(e) => selectTemplate(e.target.value)}
            >
              <option value="">{msg("Choisir un modèle publié")}</option>
              {templates.data?.items
                .filter((t) => t.state === "published" && t.permissions.use)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {msg("· v")}
                    {t.currentVersion}
                  </option>
                ))}
            </select>
          </Field>
          {templates.data?.nextCursor && (
            <div role="group" aria-label={msg("Autres modèles disponibles")}>
              <LoadMore
                path="/templates"
                data={templates.data}
                onLoaded={templates.setData}
              />
            </div>
          )}
          <Field label={msg("Réutiliser une correspondance enregistrée")}>
            <select
              value={reuseId}
              onChange={(e) => {
                setReuseId(e.target.value);
                if (!e.target.value) {
                  setSaved(undefined);
                  setValidation(undefined);
                  generationKey.current = crypto.randomUUID();
                  return;
                }
                const previous = mappings.data?.items.find(
                  (m) => m.id === e.target.value,
                );
                if (previous) {
                  setSaved(previous);
                  edit(structuredClone(previous.plan));
                  setArrayPath(
                    previous.plan.group?.itemPath ??
                      previous.plan.joins[0]?.target ??
                      "",
                  );
                  setArraySource(previous.plan.joins[0]?.sheet ?? "same");
                }
              }}
            >
              <option value="">{msg("Nouvelle correspondance")}</option>
              {mappings.data?.items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {msg("· v")}
                  {m.version}
                </option>
              ))}
            </select>
          </Field>
          {mappings.data?.nextCursor && (
            <div
              role="group"
              aria-label={msg("Autres correspondances disponibles")}
            >
              <LoadMore
                path="/mappings"
                data={mappings.data}
                onLoaded={mappings.setData}
              />
            </div>
          )}
          <Field label={msg("Nom de la correspondance")}>
            <input
              value={plan.name}
              required
              maxLength={120}
              onChange={(e) => edit({ ...plan, name: e.target.value })}
            />
          </Field>
          {!!incompatibleNumbers.length && (
            <p role="alert">
              {msg("Les champs ")}
              {incompatibleNumbers.join(", ")}{" "}
              {msg(
                "du modèle attendent des nombres, alors que le type « Décimal exact » conserve une chaîne sans arrondi. Pour conserver les décimales, adaptez le modèle avec un champ texte et le format décimal. Pour des montants en unités mineures, utilisez un champ entier et le type « Montant → centimes entiers ». ",
              )}
            </p>
          )}
          <MappingFields
            fields={plan.fields}
            headers={headers}
            onChange={(fields) => edit({ ...plan, fields })}
          />
          {template && (
            <>
              <h3>{msg("Un tableau par document")}</h3>
              <div className="studio-mapping-grid">
                <Field label={msg("Tableau du modèle")}>
                  <select
                    value={arrayPath}
                    onChange={(e) =>
                      configureArray(e.target.value, arraySource)
                    }
                  >
                    <option value="">{msg("Pas de tableau")}</option>
                    {fieldPaths(template.envelope.inputSchema)
                      .filter((f) => f.schema.type === "array")
                      .map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.schema.title ?? f.path}
                        </option>
                      ))}
                  </select>
                </Field>
                {array && (
                  <Field label={msg("Origine des lignes du tableau")}>
                    <select
                      value={arraySource}
                      onChange={(e) =>
                        configureArray(arrayPath, e.target.value)
                      }
                    >
                      <option value="same">
                        {msg("Regrouper la feuille principale ")}
                      </option>
                      {profile.sheets
                        .filter((s) => s.name !== plan.sourceSheet)
                        .map((s) => (
                          <option key={s.name} value={s.name}>
                            {msg("Joindre la feuille ")}
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
              </div>
              {plan.group && (
                <MappingFields
                  fields={plan.group.fields}
                  headers={headers}
                  onChange={(fields) =>
                    edit({ ...plan, group: { ...plan.group!, fields } })
                  }
                />
              )}
              {plan.joins.map((join, i) => (
                <div key={i}>
                  <div className="studio-mapping-grid">
                    <Field label={msg("En-têtes de la feuille liée")}>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={join.headerRow}
                        onChange={(e) =>
                          edit({
                            ...plan,
                            joins: plan.joins.map((j, n) =>
                              n === i
                                ? {
                                    ...j,
                                    headerRow: Number(e.target.value),
                                    expectedHeaders: headerRows.headers(
                                      j.sheet,
                                      Number(e.target.value),
                                    ),
                                  }
                                : j,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label={msg("Clé dans la feuille principale")}>
                      <select
                        required
                        value={join.parentKey}
                        onChange={(e) =>
                          edit({
                            ...plan,
                            joins: plan.joins.map((j, n) =>
                              n === i ? { ...j, parentKey: e.target.value } : j,
                            ),
                          })
                        }
                      >
                        <option value="">{msg("Choisir")}</option>
                        {headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={msg("Clé dans la feuille liée")}>
                      <select
                        required
                        value={join.childKey}
                        onChange={(e) =>
                          edit({
                            ...plan,
                            joins: plan.joins.map((j, n) =>
                              n === i ? { ...j, childKey: e.target.value } : j,
                            ),
                          })
                        }
                      >
                        <option value="">{msg("Choisir")}</option>
                        {headerRows
                          .headers(join.sheet, join.headerRow)
                          .map((h) => (
                            <option key={h}>{h}</option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <MappingFields
                    fields={join.fields}
                    headers={headerRows.headers(join.sheet, join.headerRow)}
                    onChange={(fields) =>
                      edit({
                        ...plan,
                        joins: plan.joins.map((j, n) =>
                          n === i ? { ...j, fields } : j,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </>
          )}
          <button
            className="button primary"
            disabled={
              action.pending ||
              !templateId ||
              headerRows.pending ||
              !!headerRows.error ||
              !!excludeRowsError ||
              !!incompatibleNumbers.length
            }
          >
            {msg("Valider toutes les lignes ")}
          </button>
        </section>
      </form>
      <section className="studio-section">
        <h2>{msg("Aide de l’IA, sur demande")}</h2>
        <StudioAiNotice available={aiPolicy.available} />
        <p>
          {msg(
            "L’analyse envoie des métadonnées et un échantillon limité au fournisseur autorisé par votre organisation. Elle propose une correspondance ; vous gardez la validation. ",
          )}
        </p>
        <button
          className="button"
          disabled={action.pending || !aiPolicy.available}
          onClick={() =>
            void action.run(async () => {
              const result = await api<{
                mapping: MappingPlan;
                ambiguities: string[];
              }>("/datasets/" + dataset.id + "/analyze", {
                method: "POST",
                body: {
                  instruction: template
                    ? "Propose un mapping vers ces chemins métier du modèle choisi, sans inventer de valeurs. Les tableaux demandent des lignes regroupées ou jointes. Champs : " +
                      fieldPaths(template.envelope.inputSchema)
                        .map(
                          (f) =>
                            f.path +
                            ":" +
                            f.schema.type +
                            (f.schema.items
                              ? "[" +
                                fieldPaths(f.schema.items)
                                  .map((i) => i.path + ":" + i.schema.type)
                                  .join(",") +
                                "]"
                              : ""),
                        )
                        .join("; ")
                        .slice(0, 1650)
                    : "Propose une interprétation vérifiable des données ; chaque chemin cible sera relu avant génération.",
                },
              });
              edit(result.mapping);
              setAiMessage(
                msg(
                  "Proposition reçue. Vérifiez chaque champ, puis validez toutes les lignes. ",
                ) + result.ambiguities.join(" "),
              );
            })
          }
        >
          {msg("Demander une proposition IA ")}
        </button>
        {aiMessage && <p role="status">{aiMessage}</p>}
        <h3>{msg("Créer un modèle depuis les données")}</h3>
        <p>
          {msg(
            "Sans modèle existant, l’IA peut proposer les champs métier, leurs types et leurs tableaux. Vous relisez cette structure avant de créer un brouillon privé ; les exemples du modèle seront entièrement synthétiques. ",
          )}
        </p>
        <Field
          label={msg("Décrire le modèle à proposer")}
          hint={msg(
            "Facultatif : indiquez le document souhaité et les lignes à regrouper, sans ajouter de données sensibles.",
          )}
        >
          <textarea
            maxLength={2000}
            rows={3}
            disabled={action.pending}
            value={schemaGoal}
            onChange={(event) => {
              setSchemaGoal(event.target.value);
              setSchemaProposal(undefined);
              setSchemaReviewed(false);
              schemaAdoption.current = {};
            }}
          />
        </Field>
        <button
          type="button"
          className="button"
          disabled={action.pending || !aiPolicy.available}
          onClick={() =>
            void action.run(async () => {
              const result = await api<DatasetSchemaResponse>(
                "/datasets/" + dataset.id + "/analyze",
                {
                  method: "POST",
                  body: {
                    proposeSchema: true,
                    ...(schemaGoal.trim()
                      ? { instruction: schemaGoal.trim() }
                      : {}),
                  },
                },
              );
              setSchemaProposal(result);
              setSchemaReviewed(false);
              schemaAdoption.current = {};
            })
          }
        >
          {msg("Proposer un nouveau modèle avec l’IA ")}
        </button>
        {schemaProposal && (
          <div aria-live="polite">
            <h4>{schemaProposal.schemaSuggestion.envelope.name}</h4>
            <p>
              {msg("Proposition à relire ·")}{" "}
              {schemaProposal.schemaSuggestion.fields.length}{" "}
              {msg("champ(s) ·")} {schemaProposal.validation.documentCount}{" "}
              {msg(
                "document(s) attendu(s). La structure et un exemple synthétique ont été vérifiés par le serveur. ",
              )}
            </p>
            <div
              className="studio-table"
              role="region"
              onKeyDown={scrollStudioTable}
              tabIndex={0}
              aria-label={msg("Champs métier proposés et colonnes source")}
            >
              <table>
                <caption>
                  {msg("Champs métier proposés et colonnes source")}
                </caption>
                <thead>
                  <tr>
                    <th>{msg("Champ du modèle")}</th>
                    <th>{msg("Type")}</th>
                    <th>{msg("Source")}</th>
                    <th>{msg("Règle")}</th>
                  </tr>
                </thead>
                <tbody>
                  {schemaProposal.schemaSuggestion.fields.map((field) => (
                    <tr key={field.path}>
                      <th scope="row">{field.path}</th>
                      <td>
                        {msg(
                          {
                            text: "Texte",
                            integer: "Entier",
                            decimal: "Décimal exact (texte)",
                            minor: "Unités mineures entières",
                            date: "Date",
                            boolean: "Oui / non",
                          }[field.type],
                        )}
                      </td>
                      <td>
                        {field.sheet} · {field.source}
                      </td>
                      <td>
                        {field.repeated ? msg("Dans un tableau · ") : ""}
                        {field.required
                          ? msg("Obligatoire")
                          : msg("Facultatif")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul>
              {[
                ...schemaProposal.schemaSuggestion.warnings,
                ...schemaProposal.ambiguities,
              ].map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
            {schemaProposal.validation.status !== "ready" && (
              <div>
                <p>
                  {msg(
                    "Les données demandent encore une correction. Vous pouvez créer le brouillon ; la correspondance devra être corrigée et validée avant toute génération. ",
                  )}
                </p>
                <ul>
                  {schemaProposal.validation.issues
                    .slice(0, 20)
                    .map((issue, index) => (
                      <li key={index}>{issue.message}</li>
                    ))}
                </ul>
              </div>
            )}
            <label className="check-field">
              <input
                type="checkbox"
                checked={schemaReviewed}
                disabled={action.pending}
                onChange={(event) => setSchemaReviewed(event.target.checked)}
              />
              {msg("J’ai relu les champs et les tableaux proposés. ")}
            </label>
            <button
              type="button"
              className="button primary"
              disabled={action.pending || !schemaReviewed}
              onClick={() =>
                void action.run(async () => {
                  // Keep successful partial adoption on retry; neither resource is published.
                  schemaAdoption.current.mapping ??= await api<MappingView>(
                    "/mappings",
                    {
                      method: "POST",
                      body: {
                        datasetId: dataset.id,
                        plan: schemaProposal.mapping,
                      },
                    },
                  );
                  schemaAdoption.current.template ??= await api<TemplateView>(
                    "/templates",
                    {
                      method: "POST",
                      body: {
                        envelope: schemaProposal.schemaSuggestion.envelope,
                      },
                    },
                  );
                  go("/app/template/" + schemaAdoption.current.template.id);
                })
              }
            >
              {msg("Créer le brouillon privé et sa correspondance ")}
            </button>
            <p className="studio-meta">
              {msg(
                "Le brouillon s’ouvrira dans l’éditeur. La correspondance sera enregistrée sous « ",
              )}
              {schemaProposal.mapping.name}{" "}
              {msg(
                "». La publication et la génération restent des actions séparées. ",
              )}
            </p>
          </div>
        )}
      </section>
      {validation && (
        <section className="studio-section" aria-live="polite">
          <h2>{msg("3. Vérifier avant génération")}</h2>
          <p>
            <strong>
              {validation.documentCount} {msg("document(s) attendu(s)")}
            </strong>{" "}
            ·{" "}
            {validation.status === "ready"
              ? msg("Correspondance validée")
              : msg("Correction nécessaire")}
          </p>
          {!!validation.issues.length && (
            <ul className="studio-warning-list">
              {validation.issues.slice(0, 100).map((issue, i) => (
                <li key={i}>
                  {issue.source &&
                    issue.source.sheet + " " + issue.source.address + " → "}
                  {issue.target && issue.target + " : "}
                  {issue.message} <code>{issue.code}</code>
                </li>
              ))}
            </ul>
          )}
          {validation.examples.map((record) => (
            <details key={record.recordId}>
              <summary>
                {msg("Exemple ")}
                {record.recordId} · {Object.keys(record.provenance).length}{" "}
                {msg("champs tracés ")}
              </summary>
              <dl>
                {Object.entries(record.data).map(([key, entry]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {Array.isArray(entry)
                        ? entry.length + msg(" lignes")
                        : typeof entry === "object"
                          ? JSON.stringify(entry)
                          : String(entry)}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
          <p>
            {msg(
              "Aucun envoi n’est préparé. Les erreurs doivent être corrigées ou leurs lignes explicitement exclues. ",
            )}
          </p>
          <button
            className="button primary"
            disabled={
              action.pending ||
              validation.status !== "ready" ||
              !template ||
              !!incompatibleNumbers.length
            }
            onClick={() =>
              void action.run(async () => {
                const job = await api<GenerationJobView>("/generation-jobs", {
                  method: "POST",
                  key: generationKey.current,
                  body: {
                    mode: "generate_only",
                    templateId,
                    templateVersion: template!.currentVersion,
                    datasetId: dataset.id,
                    mappingId: validation.mapping.id,
                    mappingVersion: validation.mapping.version,
                  },
                });
                go("/app/generation/" + job.id);
              })
            }
          >
            {msg("Générer ")}
            {validation.documentCount} {msg("PDF sans envoi ")}
          </button>
        </section>
      )}
    </>
  );
}

function MappingFields({
  fields,
  headers,
  onChange,
}: {
  fields: DatasetField[];
  headers: string[];
  onChange: (fields: DatasetField[]) => void;
}) {
  function change(index: number, patch: Partial<DatasetField>) {
    onChange(
      fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  }
  return (
    <div>
      {fields.map((field, index) => (
        <fieldset className="business-object" key={index}>
          <legend>
            <code>{field.target}</code>
          </legend>
          <div className="studio-mapping-grid">
            <Field
              label={msg("Champ métier cible ") + (index + 1)}
              hint={msg(
                "Chemin déclaré par le modèle, par exemple customer.name ; pour un tableau, chemin relatif à sa ligne.",
              )}
            >
              <input
                required
                value={field.target}
                onChange={(e) => change(index, { target: e.target.value })}
              />
            </Field>
            <Field label={msg("Colonne pour ") + field.target}>
              <select
                value={field.source}
                required
                onChange={(e) => change(index, { source: e.target.value })}
              >
                <option value="">{msg("Choisir la colonne source")}</option>
                {headers.filter(Boolean).map((header, i) => (
                  <option key={i} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={msg("Type de ") + field.target}>
              <select
                value={field.type}
                onChange={(e) =>
                  change(index, {
                    type: e.target.value as DatasetField["type"],
                  })
                }
              >
                <option value="text">
                  {msg("Texte / identifiant / code postal")}
                </option>
                <option value="integer">{msg("Entier")}</option>
                <option value="minor">
                  {msg("Montant → centimes entiers")}
                </option>
                <option value="decimal">{msg("Décimal exact (chaîne)")}</option>
                <option value="date">{msg("Date")}</option>
                <option value="boolean">{msg("Oui / non")}</option>
              </select>
            </Field>
            {field.type === "date" && (
              <Field label={msg("Ordre de date pour ") + field.target}>
                <select
                  value={field.dateOrder ?? ""}
                  onChange={(e) =>
                    change(index, {
                      dateOrder: (e.target.value ||
                        undefined) as DatasetField["dateOrder"],
                    })
                  }
                >
                  <option value="">{msg("Ne pas deviner")}</option>
                  <option value="DMY">{msg("Jour / mois / année")}</option>
                  <option value="MDY">{msg("Mois / jour / année")}</option>
                  <option value="YMD">{msg("Année / mois / jour")}</option>
                </select>
              </Field>
            )}
            {["decimal", "minor"].includes(field.type) && (
              <Field label={msg("Séparateur décimal pour ") + field.target}>
                <select
                  value={field.decimalSeparator ?? ""}
                  onChange={(e) =>
                    change(index, {
                      decimalSeparator: (e.target.value ||
                        undefined) as DatasetField["decimalSeparator"],
                    })
                  }
                >
                  <option value="">{msg("Ne pas deviner")}</option>
                  <option value=",">{msg("Virgule")}</option>
                  <option value=".">{msg("Point")}</option>
                </select>
              </Field>
            )}
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(e) => change(index, { required: e.target.checked })}
            />
            {msg("Champ obligatoire ")}
          </label>
        </fieldset>
      ))}
    </div>
  );
}

type AiPolicyView = {
  enabled: boolean;
  transferApproved: boolean;
  dailyLimit: number;
  usedToday: number;
  configured: boolean;
  provider: string;
  model: string | null;
  retention: string;
  realProviderQualified: boolean;
};
function AiPolicy() {
  const resource = useResource<AiPolicyView>("/dataset-ai-policy");
  if (!resource.data) return <ErrorNotice error={resource.error} />;
  return (
    <AiPolicyForm
      key={JSON.stringify(resource.data)}
      policy={resource.data}
      onSaved={resource.setData}
    />
  );
}
function AiPolicyForm({
  policy,
  onSaved,
}: {
  policy: AiPolicyView;
  onSaved: (v: AiPolicyView) => void;
}) {
  const [enabled, setEnabled] = useState(policy.enabled),
    [consent, setConsent] = useState(policy.transferApproved),
    [limit, setLimit] = useState(policy.dailyLimit),
    action = useAction();
  return (
    <details className="studio-section">
      <summary>{msg("Administration : analyse IA des données")}</summary>
      <p>
        {msg(
          "Fournisseur : OpenAI, API directe. Seuls des métadonnées et un échantillon borné sont transférés à la demande. La localisation de D1/R2 ne détermine pas celle de ce traitement. Le paramètre store:false ne garantit pas une rétention nulle chez le fournisseur. ",
        )}
      </p>
      <p>
        {policy.configured
          ? msg("Fournisseur configuré.")
          : msg(
              "L’analyse IA est indisponible : aucune configuration fournisseur utilisable.",
            )}{" "}
        {policy.usedToday} {msg("appel(s) comptabilisé(s) aujourd’hui.")}{" "}
        {policy.realProviderQualified
          ? ""
          : msg("La qualité du fournisseur réel n’est pas encore qualifiée.")}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () =>
            onSaved(
              await api<AiPolicyView>("/dataset-ai-policy", {
                method: "PUT",
                body: { enabled, transferApproved: consent, dailyLimit: limit },
              }),
            ),
          );
        }}
      >
        <ErrorNotice error={action.error} />
        <label className="check-field">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          {msg("Activer les demandes d’analyse pour cette organisation ")}
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {msg(
            "J’autorise explicitement le transfert de ces échantillons au fournisseur ",
          )}
        </label>
        <Field label={msg("Maximum d’appels par jour")}>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={limit}
            required
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </Field>
        <button className="button" disabled={action.pending}>
          {msg("Enregistrer la politique de transfert ")}
        </button>
      </form>
    </details>
  );
}
