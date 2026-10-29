import { msg, msgIn } from "./messages";
import { studioRoutes } from "./app-routes";
import { FileInput } from "./file-input";
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
import { resolveDatasetSheet } from "../../../packages/contracts/src/datasets";
import { retainUnchangedRowExclusions } from "../../../packages/data/replacement";
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
  DateTimezone,
  ErrorNotice,
  Field,
  go,
  Loading,
  LoadMore,
  PageHeading,
  useAction,
  useResource,
  useRoute,
} from "./components";

function datasetContext(route: string) {
  const source = new URLSearchParams(route.split("?")[1]);
  const context = new URLSearchParams();
  for (const key of [
    "template",
    "version",
    "mapping",
    "mappingVersion",
    "generation",
    "encoding",
    "delimiter",
    "xmlRecordPath",
    "reviewRows",
  ])
    if (source.get(key)) context.set(key, source.get(key)!);
  return context;
}
function withDatasetContext(path: string, context: URLSearchParams) {
  return path + (context.size ? "?" + context.toString() : "");
}

export function DatasetLibrary({ session }: { session: Session }) {
  const context = datasetContext(useRoute());
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
        throw new Error(msg("Choose a CSV, XLSX, XML or JSON file."));
      if (selected.size > 5 * 1024 * 1024)
        throw new Error(msg("The file exceeds 5 MB."));
      const form = new FormData();
      form.set("file", selected);
      if (selected.name.toLowerCase().endsWith(".csv")) {
        form.set("encoding", encoding);
        context.set("encoding", encoding);
        context.set("delimiter", delimiter);
        if (delimiter) form.set("delimiter", delimiter);
      }
      if (
        selected.name.toLowerCase().endsWith(".xml") &&
        xmlRecordPath.trim()
      ) {
        form.set("xmlRecordPath", xmlRecordPath.trim());
        context.set("xmlRecordPath", xmlRecordPath.trim());
      }
      const dataset = await api<DatasetView>("/datasets", {
        method: "POST",
        body: form,
      });
      go(withDatasetContext(studioRoutes.dataset(dataset.id), context));
    });
  }
  return (
    <>
      <PageHeading
        title={msg("Data")}
        intro={msg(
          "Import your file as it is. Choose sheets, columns and groups before generating your documents.",
        )}
      />
      <ErrorNotice error={action.error ?? resource.error} />
      {!canPrepare && <RolePermissionNotice />}
      {canPrepare && (
        <form className="studio-section" onSubmit={(e) => void upload(e)}>
          <h2>{msg("Import my data")}</h2>
          <p>
            {msg(
              "CSV, Excel .xlsx, XML or JSON. The original file stays private. Importing does not call AI or prepare any sends. ",
            )}
          </p>
          <Field
            label={msg("Data file")}
            hint={msg("Maximum 5 MB, 12 sheets, 5,000 rows and 100,000 cells.")}
          >
            <FileInput
              ref={file}
              accept=".csv,.xlsx,.xml,.json,text/csv,application/xml,text/xml,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
            />
          </Field>
          <details>
            <summary>{msg("CSV options")}</summary>
            <div className="studio-mapping-grid">
              <Field label={msg("CSV encoding")}>
                <select
                  value={encoding}
                  onChange={(e) => setEncoding(e.target.value)}
                >
                  <option value="utf-8">{msg("UTF-8")}</option>
                  <option value="windows-1252">{msg("Windows-1252")}</option>
                </select>
              </Field>
              <Field label={msg("CSV delimiter")}>
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                >
                  <option value="">{msg("Detect automatically")}</option>
                  <option value=",">{msg("Comma")}</option>
                  <option value=";">{msg("Semicolon")}</option>
                  <option value={"\t"}>{msg("Tab")}</option>
                  <option value="|">{msg("Vertical bar")}</option>
                </select>
              </Field>
            </div>
          </details>
          <details>
            <summary>{msg("XML options")}</summary>
            <Field
              label={msg("XML record path")}
              hint={msg(
                "Optional for a single collection. Example: /export/clients/client. If there are multiple collections, specify which one to import.",
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
              ? msg("Checking file…")
              : msg("Import and recognise data")}
          </button>
        </form>
      )}
      {!!resource.data?.items.length && <DateTimezone />}
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        <div className="studio-list">
          {!resource.data?.items.length && (
            <p className="studio-list-row">
              {msg("Your files will appear here after import. ")}
            </p>
          )}
          {resource.data?.items.map((item) => (
            <article key={item.id} className="studio-list-row">
              <div>
                <h3>
                  <a
                    href={
                      "#" +
                      withDatasetContext(studioRoutes.dataset(item.id), context)
                    }
                  >
                    {item.name}
                  </a>
                </h3>
                <p>
                  {item.format.toUpperCase()} · {bytes(item.size)} ·{" "}
                  {item.status === "ready"
                    ? msg("Recognised")
                    : item.status === "quarantined"
                      ? msg("Being checked")
                      : item.status === "purged"
                        ? msg("Deleted")
                        : msg("Rejected")}{" "}
                  · {date(item.createdAt)}
                </p>
              </div>
              <a
                className="button small"
                href={
                  "#" +
                  withDatasetContext(studioRoutes.dataset(item.id), context)
                }
              >
                {canPrepare ? msg("Map data ") : msg("Open ")}
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
    name: msg("Data mapping"),
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
    resolveDatasetSheet(profile, sheet)?.rows.find(
      (entry) => entry.rowNumber === row,
    );
  useEffect(() => {
    const controller = new AbortController();
    const rows = JSON.parse(selection) as [string, number][];
    setError(undefined);
    const missing = rows.filter(
      ([sheet, row]) =>
        Number.isInteger(row) &&
        row > 0 &&
        row <= 5000 &&
        !resolveDatasetSheet(profile, sheet)?.rows.some(
          (entry) => entry.rowNumber === row,
        ),
    );
    void Promise.all(
      missing.map(async ([sheet, row]) => {
        const page = await api<PagedProfileView>(
          profilePagePath(
            id,
            resolveDatasetSheet(profile, sheet)?.name ?? sheet,
            row - 1,
            1,
          ),
          { signal: controller.signal },
        );
        const result = resolveDatasetSheet(page.profile, sheet)?.rows.find(
          (entry) => entry.rowNumber === row,
        );
        if (!result)
          throw new Error(
            msg("Header row {0} does not exist in sheet {1}.", row, sheet),
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
  const [sheet, setSheet] = useState(
    resolveDatasetSheet(value.profile, sourceSheet)?.name ?? sourceSheet,
  );
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
        label={msg("Preview sheet")}
        hint={msg("Browse all sheets without changing your mapping.")}
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
              {entry.hidden ? msg(" (hidden)") : ""}
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
              aria-label={msg("Original preview — ") + sheet}
              aria-busy={resource.loading}
            >
              <table>
                <caption>
                  {msg("Original preview — ")}
                  {sheet} {msg(": rows ")}
                  {rows[0]?.rowNumber ?? 0} {msg("to")}{" "}
                  {rows.at(-1)?.rowNumber ?? 0} {msg("of ")}
                  {pagination!.totalRows}
                </caption>
                <thead>
                  <tr>
                    <th>{msg("Row")}</th>
                    {Array.from({ length: columns }, (_, index) => (
                      <th key={index}>
                        {msg("Column ")}
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
                        {row.hidden ? msg(" · hidden") : ""}
                      </th>
                      {Array.from({ length: columns }, (_, index) => {
                        const cell = row.cells[index];
                        return (
                          <td key={index}>
                            {cell?.raw ?? "—"}
                            {cell?.formula && (
                              <span className="studio-meta">
                                {" "}
                                {msg("· formula ")}
                                {cell.cached
                                  ? msg(" (cached)")
                                  : msg(" no result")}
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
              {msg("Long values are limited to")}{" "}
              {pagination!.sampleValuesTruncatedAt}{" "}
              {msg(
                "characters in this preview. Validation uses the complete file. ",
              )}
            </p>
          </>
        )
      )}
      <nav className="button-group" aria-label={msg("Data preview pages")}>
        <button
          type="button"
          className="button small"
          disabled={cursor === 0 || resource.loading}
          onClick={() => setCursor(0)}
        >
          {msg("First page ")}
        </button>
        <button
          type="button"
          className="button small"
          disabled={cursor === 0 || resource.loading}
          onClick={() => setCursor(Math.max(0, cursor - 30))}
        >
          {msg("Previous page ")}
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
          {msg("Next page ")}
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
        "Enter row numbers from 1 to 5,000 separated by commas, for example 8, 14.",
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
          title={msg("File recognition")}
          intro={msg(
            "The original file is stored separately from its interpretation.",
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
        <a className="back-link" href={`#${studioRoutes.datasets}`}>
          {msg("← Data ")}
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
      <h2>{msg("Checking your file")}</h2>
      <ErrorNotice error={action.error ?? status.error} />
      {status.data && (
        <>
          <p>
            {status.data.status === "purged"
              ? msg(
                  "This original has reached the end of its retention period. Import the file again if needed.",
                )
              : status.data.status === "rejected"
                ? msg(
                    "This file did not pass the checks. Correct the source file before importing it again.",
                  )
                : status.data.analysis.running
                  ? msg(
                      "Analysis is in progress. The original file is retained; please wait before refreshing.",
                    )
                  : msg(
                      "The file analysis did not complete. This step protects generation; a verification status alone does not mean the file contains a virus.",
                    )}
          </p>
          <p>
            {status.data.analysis.attempts} {msg("attempt(s) of")}{" "}
            {status.data.analysis.maxAttempts}.{" "}
            {waitSeconds > 0 ? msg("Wait {0} second(s).", waitSeconds) : ""}
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
              {msg("Retry analysis of the same file ")}
            </button>
            <button
              className="button small"
              onClick={() => {
                status.refresh();
                onReady();
              }}
            >
              {msg("Refresh status ")}
            </button>
            <a className="text-link" href={`#${studioRoutes.datasets}`}>
              {canPrepare ? msg("Import a corrected file ") : msg("Data ")}
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
  const context = datasetContext(useRoute());
  const templates = useResource<Page<TemplateView>>("/templates"),
    mappings = useResource<Page<MappingView>>("/mappings"),
    action = useAction();
  const [templateId, setTemplateId] = useState(context.get("template") ?? ""),
    [plan, setPlan] = useState<MappingPlan>(defaultPlan(profile));
  const [templateVersion, setTemplateVersion] = useState<number | undefined>(
    Number(context.get("version")) || undefined,
  );
  const chosenTemplate = useResource<TemplateView>(
    templateId
      ? `/templates/${encodeURIComponent(templateId)}${templateVersion ? "?version=" + templateVersion : ""}`
      : null,
  );
  const previousMapping = useResource<MappingView>(
    context.get("mapping")
      ? `/mappings/${encodeURIComponent(context.get("mapping")!)}${context.get("mappingVersion") ? "?version=" + context.get("mappingVersion") : ""}`
      : null,
  );
  const initialized = useRef(false);
  const [rowsReviewed, setRowsReviewed] = useState(
    context.get("reviewRows") !== "1",
  );
  const replacement = useRef<HTMLInputElement>(null);
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
  const template = chosenTemplate.data;
  const headerRows = useMappingHeaders(dataset.id, profile, plan);
  const headers = headerRows.headers(plan.sourceSheet, plan.headerRow);
  function sourceIdentity(
    source: MappingValidation["issues"][number]["source"],
  ) {
    if (!source) return "";
    const sheet = resolveDatasetSheet(profile, source.sheet);
    const row = sheet?.rows.find((entry) => entry.rowNumber === source.row);
    if (!row) return "";
    const header = headerRows.headers(source.sheet, plan.headerRow);
    const name = plan.fields.find((field) =>
      /(?:^|\.)(name|fullName|nom|address)$/.test(field.target),
    );
    const index = name ? header.indexOf(name.source) : -1;
    return index >= 0 ? (row.cells[index]?.raw?.split(/\r?\n/)[0] ?? "") : "";
  }
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
  useEffect(() => {
    if (initialized.current || (templateId && !chosenTemplate.data)) return;
    if (context.get("mapping") && !previousMapping.data) return;
    initialized.current = true;
    if (previousMapping.data) {
      const previous = previousMapping.data;
      setSaved(previous);
      setReuseId(previous.id);
      setPlan(structuredClone(previous.plan));
      setExcludeRowsText(previous.plan.excludeRows.join(", "));
      setArrayPath(
        previous.plan.group?.itemPath ?? previous.plan.joins[0]?.target ?? "",
      );
      setArraySource(previous.plan.joins[0]?.sheet ?? "same");
    } else if (chosenTemplate.data) {
      const selected = chosenTemplate.data;
      setPlan((current) => ({
        ...current,
        fields: fieldPaths(selected.envelope.inputSchema)
          .filter((field) => field.schema.type !== "array")
          .map((field) => ({
            source: suggestColumn(
              sheetHeaders(profile.sheets[0], current.headerRow),
              field.path,
              field.schema.title,
            ),
            target: field.path,
            type: fieldType(field.schema),
            required: true,
          })),
      }));
    }
  }, [chosenTemplate.data, previousMapping.data, templateId, profile, context]);
  function edit(next: MappingPlan) {
    if (next.excludeRows !== plan.excludeRows) {
      setExcludeRowsText(next.excludeRows.join(", "));
      setExcludeRowsError(undefined);
    }
    setPlan(next);
    setValidation(undefined);
    generationKey.current = crypto.randomUUID();
  }
  function mappingRevision() {
    // A generation's mapping snapshot is immutable history. Corrections fork
    // it instead of competing with a newer version of that reusable mapping.
    return saved &&
      !(context.get("mappingVersion") && context.get("mapping") === saved.id)
      ? { mappingId: saved.id, expectedVersion: saved.version }
      : {};
  }
  function selectTemplate(id: string) {
    setTemplateId(id);
    const selected = templates.data?.items.find((t) => t.id === id);
    setTemplateVersion(selected?.currentVersion ?? undefined);
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
    const sheet = resolveDatasetSheet(profile, source),
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
      if (!rowsReviewed)
        throw new Error(
          msg(
            "Row exclusions could not be matched to this file. Review them before validating.",
          ),
        );
      if (!template)
        throw new Error(msg("Choose the template these data will populate."));
      if (headerRows.pending || headerRows.error)
        throw new Error(
          msg("Wait for the headers of every sheet to load before validating."),
        );
      if (incompatibleNumbers.length)
        throw new Error(
          msg(
            "Exact decimals require a text field in the template. Adjust the marked fields before validating.",
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
        ...mappingRevision(),
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
  async function replaceFile() {
    await action.run(async () => {
      const file = replacement.current?.files?.[0];
      if (!file) throw new Error(msg("Choose a CSV, XLSX, XML or JSON file."));
      if (file.size > 5 * 1024 * 1024)
        throw new Error(msg("The file exceeds 5 MB."));
      const excludeRows = parseExcludedRows(excludeRowsText);
      const form = new FormData();
      form.set("file", file);
      if (file.name.toLowerCase().endsWith(".csv")) {
        form.set("encoding", context.get("encoding") ?? "utf-8");
        if (context.get("delimiter"))
          form.set("delimiter", context.get("delimiter")!);
      }
      if (
        file.name.toLowerCase().endsWith(".xml") &&
        context.get("xmlRecordPath")
      )
        form.set("xmlRecordPath", context.get("xmlRecordPath")!);
      const next = await api<DatasetView>("/datasets", {
        method: "POST",
        body: form,
      });
      const replacementProfile = await api<PagedProfileView>(
        `/datasets/${next.id}/profile`,
      );
      const keepRows = (sheetName: string, rows: number[]) =>
        retainUnchangedRowExclusions({
          before: resolveDatasetSheet(profile, sheetName),
          after: resolveDatasetSheet(replacementProfile.profile, sheetName),
          rows,
          structureUnchanged: Boolean(
            dataset.structureHash &&
            dataset.structureHash === next.structureHash,
          ),
          rowCountUnchanged:
            value.pagination.sheet === sheetName &&
            replacementProfile.pagination.sheet === sheetName &&
            value.pagination.totalRows ===
              replacementProfile.pagination.totalRows,
          previewCellLimit: value.pagination.sampleValuesTruncatedAt,
        });
      const nextRows = keepRows(plan.sourceSheet, excludeRows);
      const nextJoins = plan.joins.map((join) => ({
        ...join,
        excludeRows: keepRows(join.sheet, join.excludeRows ?? []),
      }));
      const needsReview =
        nextRows.length !== excludeRows.length ||
        nextJoins.some(
          (join, index) =>
            join.excludeRows.length !==
            (plan.joins[index].excludeRows?.length ?? 0),
        );
      const mapping = await api<MappingView>("/mappings", {
        method: "POST",
        body: {
          datasetId: next.id,
          plan: { ...plan, excludeRows: nextRows, joins: nextJoins },
          ...mappingRevision(),
        },
      });
      const nextContext = new URLSearchParams(context);
      if (needsReview) nextContext.set("reviewRows", "1");
      else nextContext.delete("reviewRows");
      if (templateId) nextContext.set("template", templateId);
      if (template?.currentVersion)
        nextContext.set("version", String(template.currentVersion));
      nextContext.set("mapping", mapping.id);
      nextContext.set("mappingVersion", String(mapping.version));
      go(withDatasetContext(studioRoutes.dataset(next.id), nextContext));
    });
  }
  return (
    <>
      <a className="back-link" href={`#${studioRoutes.datasets}`}>
        {msg("← Data ")}
      </a>
      <PageHeading
        title={dataset.name}
        intro={msg(
          "Check the recognised data, then their mapping to your template. Each customer can group several rows.",
        )}
      />
      <ErrorNotice
        error={
          action.error ??
          chosenTemplate.error ??
          previousMapping.error ??
          templates.error ??
          mappings.error ??
          headerRows.error
        }
      />
      <p className="studio-meta">
        {msg("Private original · ")}
        {bytes(dataset.size)} {msg("· source deletion scheduled for ")}
        {date(dataset.expiresAt)} · {profile.sheets.length} {msg("sheet(s) ")}
      </p>
      <DateTimezone />
      <details className="studio-section">
        <summary>{msg("Replace the data file")}</summary>
        <Field label={msg("Corrected data file")}>
          <FileInput ref={replacement} accept=".csv,.xlsx,.xml,.json" />
        </Field>
        <button
          type="button"
          className="button"
          disabled={action.pending}
          onClick={() => void replaceFile()}
        >
          {msg("Import and keep my mapping")}
        </button>
      </details>
      {!!profile.issues.length && (
        <details className="studio-section" open>
          <summary>
            {profile.issues.length} {msg("issues flagged in the file ")}
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
          <h2>{msg("1. Recognise the structure")}</h2>
          <div className="studio-mapping-grid">
            <Field label={msg("Main sheet")}>
              <select
                value={
                  resolveDatasetSheet(profile, plan.sourceSheet)?.name ??
                  plan.sourceSheet
                }
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
                    {sheet.hidden ? msg(" (hidden)") : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={msg("Header row")}>
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
              label={msg("Document / customer key")}
              hint={msg("Rows with the same key form one document.")}
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
                <option value="">{msg("One row per document")}</option>
                {headers.map((h, i) => (
                  <option key={i} value={h}>
                    {h || msg("Column ") + (i + 1) + msg(" empty")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {headerRows.pending && (
            <p role="status">{msg("Loading selected headers…")}</p>
          )}
          <DatasetPreview
            key={plan.sourceSheet}
            value={value}
            sourceSheet={plan.sourceSheet}
          />
          <Field
            label={msg("Rows to explicitly exclude")}
            hint={msg(
              "Comma-separated numbers: for example 8, 14 for subtotals.",
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
          {context.get("reviewRows") === "1" && (
            <div className="notice warning">
              <p>
                {msg(
                  "Row exclusions could not be matched to this file. Review them before validating.",
                )}
              </p>
              <label className="check-field">
                <input
                  type="checkbox"
                  required
                  checked={rowsReviewed}
                  onChange={(event) => setRowsReviewed(event.target.checked)}
                />
                {msg("I reviewed the row exclusions for this file.")}
              </label>
            </div>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={plan.includeHidden}
              onChange={(e) =>
                edit({ ...plan, includeHidden: e.target.checked })
              }
            />
            {msg("Include hidden rows and sheets ")}
          </label>
          <Field label={msg("Formula cells")}>
            <select
              value={plan.formulaPolicy}
              onChange={(e) =>
                edit({
                  ...plan,
                  formulaPolicy: e.target.value as MappingPlan["formulaPolicy"],
                })
              }
            >
              <option value="reject">{msg("Require a correction")}</option>
              <option value="cached">
                {msg("Use only the result already saved in the file ")}
              </option>
            </select>
          </Field>
        </section>
        <section className="studio-section">
          <h2>{msg("2. Map fields")}</h2>
          <Field label={msg("Template to populate")}>
            <select
              required
              value={templateId}
              onChange={(e) => selectTemplate(e.target.value)}
            >
              <option value="">{msg("Choose a published template")}</option>
              {templates.data?.items
                .filter((t) => t.state === "published" && t.permissions.use)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {msg("· v")}
                    {t.id === templateId
                      ? (template?.currentVersion ?? t.currentVersion)
                      : t.currentVersion}
                  </option>
                ))}
              {template &&
                !templates.data?.items.some(
                  (item) => item.id === template.id,
                ) && (
                  <option value={template.id}>
                    {template.name} {msg("· v")}
                    {template.currentVersion}
                  </option>
                )}
            </select>
          </Field>
          {templates.data?.nextCursor && (
            <div role="group" aria-label={msg("More available templates")}>
              <LoadMore
                path="/templates"
                data={templates.data}
                onLoaded={templates.setData}
              />
            </div>
          )}
          <Field label={msg("Reuse a saved mapping")}>
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
              <option value="">{msg("New mapping")}</option>
              {mappings.data?.items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {msg("· v")}
                  {m.version}
                </option>
              ))}
            </select>
          </Field>
          {mappings.data?.nextCursor && (
            <div role="group" aria-label={msg("More available mappings")}>
              <LoadMore
                path="/mappings"
                data={mappings.data}
                onLoaded={mappings.setData}
              />
            </div>
          )}
          <Field label={msg("Mapping name")}>
            <input
              value={plan.name}
              required
              maxLength={120}
              onChange={(e) => edit({ ...plan, name: e.target.value })}
            />
          </Field>
          {!!incompatibleNumbers.length && (
            <p role="alert">
              {msg("The fields ")}
              {incompatibleNumbers.join(", ")}{" "}
              {msg(
                "in the template expect numbers, while “Exact decimal” preserves a string without rounding. To retain decimal places, use a text field with decimal formatting. For amounts in minor units, use an integer field and “Amount → integer cents”. ",
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
              <h3>{msg("One table per document")}</h3>
              <div className="studio-mapping-grid">
                <Field label={msg("Template table")}>
                  <select
                    value={arrayPath}
                    onChange={(e) =>
                      configureArray(e.target.value, arraySource)
                    }
                  >
                    <option value="">{msg("No table")}</option>
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
                  <Field label={msg("Source of table rows")}>
                    <select
                      value={
                        arraySource === "same"
                          ? "same"
                          : (resolveDatasetSheet(profile, arraySource)?.name ??
                            arraySource)
                      }
                      onChange={(e) =>
                        configureArray(arrayPath, e.target.value)
                      }
                    >
                      <option value="same">
                        {msg("Group the main sheet ")}
                      </option>
                      {profile.sheets
                        .filter(
                          (s) =>
                            s !==
                            resolveDatasetSheet(profile, plan.sourceSheet),
                        )
                        .map((s) => (
                          <option key={s.name} value={s.name}>
                            {msg("Join sheet ")}
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
                    <Field label={msg("Linked sheet headers")}>
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
                    <Field label={msg("Key in the main sheet")}>
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
                        <option value="">{msg("Choose")}</option>
                        {headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label={msg("Key in the linked sheet")}>
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
                        <option value="">{msg("Choose")}</option>
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
              !rowsReviewed ||
              !templateId ||
              headerRows.pending ||
              !!headerRows.error ||
              !!excludeRowsError ||
              !!incompatibleNumbers.length
            }
          >
            {msg("Validate all rows ")}
          </button>
        </section>
      </form>
      <section className="studio-section">
        <h2>{msg("AI help, on request")}</h2>
        <StudioAiNotice available={aiPolicy.available} />
        <p>
          {msg(
            "Analysis sends metadata and a limited sample to the provider authorised by your organisation. It proposes a mapping; you remain responsible for validation. ",
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
                    ? "Propose a mapping to these business paths in the selected template without inventing values. Tables require grouped or joined rows. Fields: " +
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
                    : "Propose a verifiable interpretation of the data; every target path will be reviewed before generation.",
                },
              });
              edit(result.mapping);
              setAiMessage(
                msg(
                  "Proposal received. Check each field, then validate all rows. ",
                ) + result.ambiguities.join(" "),
              );
            })
          }
        >
          {msg("Request an AI proposal ")}
        </button>
        {aiMessage && <p role="status">{aiMessage}</p>}
        <h3>{msg("Create a template from data")}</h3>
        <p>
          {msg(
            "Without an existing template, AI can propose business fields, their types and tables. Review this structure before creating a private draft; the template examples will be entirely synthetic. ",
          )}
        </p>
        <Field
          label={msg("Describe the template to propose")}
          hint={msg(
            "Optional: describe the document and the rows to group, without adding sensitive data.",
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
          {msg("Propose a new template with AI ")}
        </button>
        {schemaProposal && (
          <div aria-live="polite">
            <h4>{schemaProposal.schemaSuggestion.envelope.name}</h4>
            <p>
              {msg("Proposal to review ·")}{" "}
              {schemaProposal.schemaSuggestion.fields.length}{" "}
              {msg("field(s) ·")} {schemaProposal.validation.documentCount}{" "}
              {msg(
                "expected document(s). The structure and a synthetic example have been checked by the server. ",
              )}
            </p>
            <div
              className="studio-table"
              role="region"
              onKeyDown={scrollStudioTable}
              tabIndex={0}
              aria-label={msg("Proposed fields and source columns")}
            >
              <table>
                <caption>{msg("Proposed fields and source columns")}</caption>
                <thead>
                  <tr>
                    <th>{msg("Template field")}</th>
                    <th>{msg("Type")}</th>
                    <th>{msgIn("document-source", "Source")}</th>
                    <th>{msg("Rule")}</th>
                  </tr>
                </thead>
                <tbody>
                  {schemaProposal.schemaSuggestion.fields.map((field) => (
                    <tr key={field.path}>
                      <th scope="row">{field.path}</th>
                      <td>
                        {msg(
                          {
                            text: "Text",
                            integer: "Integer",
                            decimal: "Exact decimal (text)",
                            minor: "Integer minor units",
                            date: "Date",
                            boolean: "Yes / no",
                          }[field.type],
                        )}
                      </td>
                      <td>
                        {field.sheet} · {field.source}
                      </td>
                      <td>
                        {field.repeated ? msg("In a table · ") : ""}
                        {field.required ? msg("Required") : msg("Optional")}
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
                    "The data still need correction. You can create the draft; the mapping must be corrected and validated before any generation. ",
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
              {msg("I have reviewed the proposed fields and tables. ")}
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
                  go(studioRoutes.template(schemaAdoption.current.template.id));
                })
              }
            >
              {msg("Create the private draft and its mapping ")}
            </button>
            <p className="studio-meta">
              {msg(
                "The draft will open in the editor. The mapping will be saved as “ ",
              )}
              {schemaProposal.mapping.name}{" "}
              {msg("”. Publishing and generation remain separate actions. ")}
            </p>
          </div>
        )}
      </section>
      {validation && (
        <section className="studio-section" aria-live="polite">
          <h2>{msg("3. Check before generation")}</h2>
          <p>
            <strong>
              {validation.documentCount} {msg("expected document(s)")}
            </strong>{" "}
            ·{" "}
            {validation.status === "ready"
              ? msg("Mapping validated")
              : msg("Correction needed")}
          </p>
          {!!validation.issues.length && (
            <ul className="studio-warning-list">
              {validation.issues.slice(0, 100).map((issue, i) => (
                <li key={i}>
                  {sourceIdentity(issue.source) && (
                    <strong>{sourceIdentity(issue.source)} · </strong>
                  )}
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
                {msg("Example ")}
                {record.recordId} · {Object.keys(record.provenance).length}{" "}
                {msg("traced fields ")}
              </summary>
              <dl>
                {Object.entries(record.data).map(([key, entry]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {Array.isArray(entry)
                        ? entry.length + msg(" rows")
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
              "No send is prepared. Errors must be corrected or their rows explicitly excluded. ",
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
                go(studioRoutes.generation(job.id));
              })
            }
          >
            {msg("Generate ")}
            {validation.documentCount} {msg("PDFs without sending ")}
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
              label={msg("Target field ") + (index + 1)}
              hint={msg(
                "Path declared by the template, for example customer.name; for a table, a path relative to its row.",
              )}
            >
              <input
                required
                value={field.target}
                onChange={(e) => change(index, { target: e.target.value })}
              />
            </Field>
            <Field label={msg("Column for ") + field.target}>
              <select
                value={field.source}
                required
                onChange={(e) => change(index, { source: e.target.value })}
              >
                <option value="">{msg("Choose the source column")}</option>
                {headers.filter(Boolean).map((header, i) => (
                  <option key={i} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={msg("Type of ") + field.target}>
              <select
                value={field.type}
                onChange={(e) =>
                  change(index, {
                    type: e.target.value as DatasetField["type"],
                  })
                }
              >
                <option value="text">
                  {msg("Text / identifier / postal code")}
                </option>
                <option value="integer">{msg("Integer")}</option>
                <option value="minor">{msg("Amount → integer cents")}</option>
                <option value="decimal">{msg("Exact decimal (string)")}</option>
                <option value="date">{msg("Date")}</option>
                <option value="boolean">{msg("Yes / no")}</option>
              </select>
            </Field>
            {field.type === "date" && (
              <Field label={msg("Date order for ") + field.target}>
                <select
                  value={field.dateOrder ?? ""}
                  onChange={(e) =>
                    change(index, {
                      dateOrder: (e.target.value ||
                        undefined) as DatasetField["dateOrder"],
                    })
                  }
                >
                  <option value="">{msg("Do not guess")}</option>
                  <option value="DMY">{msg("Day / month / year")}</option>
                  <option value="MDY">{msg("Month / day / year")}</option>
                  <option value="YMD">{msg("Year / month / day")}</option>
                </select>
              </Field>
            )}
            {["decimal", "minor"].includes(field.type) && (
              <Field label={msg("Decimal separator for ") + field.target}>
                <select
                  value={field.decimalSeparator ?? ""}
                  onChange={(e) =>
                    change(index, {
                      decimalSeparator: (e.target.value ||
                        undefined) as DatasetField["decimalSeparator"],
                    })
                  }
                >
                  <option value="">{msg("Do not guess")}</option>
                  <option value=",">{msg("Comma")}</option>
                  <option value=".">{msg("Period")}</option>
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
            {msg("Required field ")}
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
      <summary>{msg("Administration: AI data analysis")}</summary>
      <p>
        {msg(
          "Provider: OpenAI, direct API. Only metadata and a bounded sample are transferred on request. The location of D1/R2 does not determine where this processing takes place. The store:false setting does not guarantee zero retention by the provider. ",
        )}
      </p>
      <p>
        {policy.configured
          ? msg("Provider configured.")
          : msg(
              "AI analysis is unavailable: no usable provider configuration.",
            )}{" "}
        {policy.usedToday} {msg("call(s) counted today.")}{" "}
        {policy.realProviderQualified
          ? ""
          : msg("The real provider’s quality has not yet been qualified.")}
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
          {msg("Enable analysis requests for this organisation ")}
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {msg(
            "I explicitly authorise transfer of these samples to the provider ",
          )}
        </label>
        <Field label={msg("Maximum calls per day")}>
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
          {msg("Save transfer policy ")}
        </button>
      </form>
    </details>
  );
}
