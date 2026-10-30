import type { GenerationCorrectionInput } from "../../../packages/contracts/src/generation-context";
import { msg } from "./messages";
import { studioRoutes } from "./app-routes";
import { FileInput } from "./file-input";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowRight, FileText, Plus } from "@phosphor-icons/react";
import type {
  TemplateView,
  Page,
  GenerationJobView,
  TemplatePermission,
} from "../../../packages/contracts/src/template-workflow";
import type { DocxImportResult } from "../../../packages/templates/docx";
import {
  validateTemplateEnvelope,
  type TemplateEnvelope,
  type BusinessField,
  type TemplateBinding,
} from "../../../packages/contracts/src/templates";
import {
  blankTemplate,
  templateGallery,
  textBlock,
  tableBlock,
} from "../../../packages/templates/gallery";
import { api, date, permissionsFor, type Session } from "./api";
import { RolePermissionNotice } from "./role-guide";
import {
  ConfirmAction,
  DateTimezone,
  ErrorNotice,
  BEFORE_WORKSPACE_NAVIGATION,
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
import { BusinessDataForm } from "./template-data-form";
import { reconcileDesignerChange } from "../../../packages/templates/designer";
import { TemplateSettings, TemplateAi } from "./template-settings";

const Designer = lazy(() => import("./template-designer"));
const stateLabel = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};
const permissionLabel: Record<TemplatePermission, string> = {
  use: "Use",
  edit: "Edit",
  publish: "Publish",
  share: "Share",
};

function DeleteTemplateAction({
  model,
  pending,
  dirty = false,
  onDelete,
}: {
  model: TemplateView;
  pending: boolean;
  dirty?: boolean;
  onDelete: () => void;
}) {
  if (!model.canDelete) return null;
  const question = [
    msg("Delete “{0}”?", model.name),
    model.visibility === "private"
      ? msg("This template will be removed from your library.")
      : msg(
          "This shared template will be removed for everyone in the workspace.",
        ),
    msg("Existing PDFs and their history will be kept."),
    ...(dirty ? [msg("Unsaved changes will also be discarded.")] : []),
  ].join(" ");
  return (
    <ConfirmAction
      label={msg("Delete")}
      ariaLabel={msg("Delete template {0}", model.name)}
      question={question}
      confirmLabel={msg("Delete template")}
      dismissLabel={msg("Keep template")}
      disabled={pending}
      onConfirm={onDelete}
    />
  );
}

export function TemplateLibrary({
  startBlank,
  canPrepare,
}: {
  startBlank: boolean;
  canPrepare: boolean;
}) {
  const templates = useResource<Page<TemplateView>>("/templates");
  const action = useAction();
  const [name, setName] = useState(msg("My document"));
  const [showBlank, setShowBlank] = useState(startBlank);
  const file = useRef<HTMLInputElement>(null);
  const libraryHeading = useRef<HTMLHeadingElement>(null);
  const [deletedName, setDeletedName] = useState<string>();
  const [importWarnings, setImportWarnings] = useState<
    DocxImportResult["warnings"]
  >([]);
  const [importedTemplateId, setImportedTemplateId] = useState<string>();
  async function create(envelope: TemplateEnvelope) {
    await action.run(async () => {
      const result = await api<TemplateView>("/templates", {
        method: "POST",
        body: { envelope },
      });
      go(studioRoutes.template(result.id));
    });
  }
  async function remove(model: TemplateView) {
    await action.run(async () => {
      await api<{ id: string; deleted: true }>(`/templates/${model.id}`, {
        method: "DELETE",
        body: { expectedRevision: model.revision },
      });
      templates.setData((current) =>
        current
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== model.id),
            }
          : current,
      );
      setDeletedName(model.name);
      libraryHeading.current?.focus();
      templates.refresh();
    });
  }
  async function importWord(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const source = file.current?.files?.[0];
      if (!source) throw new Error(msg("Choose a Word .docx file."));
      if (source.size > 5 * 1024 * 1024)
        throw new Error(msg("The Word document exceeds 5 MB."));
      const form = new FormData();
      form.set("file", source);
      const result = await api<{
        template: TemplateView;
        warnings: DocxImportResult["warnings"];
      }>("/templates/import-docx", { method: "POST", body: form });
      setImportWarnings(result.warnings);
      setImportedTemplateId(result.template.id);
      if (result.warnings.length) templates.refresh();
      else go(studioRoutes.template(result.template.id));
    });
  }
  return (
    <>
      <PageHeading
        title={msg("Templates")}
        intro={msg(
          "One page, your variables, as many documents as you need. You can keep editing your templates on the web, through the API and with your assistant.",
        )}
        action={
          canPrepare && (
            <button
              className={showBlank ? "button" : "button primary"}
              aria-expanded={showBlank}
              aria-controls={showBlank ? "blank-template-form" : undefined}
              onClick={() => setShowBlank(!showBlank)}
            >
              <Plus size={18} />
              {msg("Create a document ")}
            </button>
          )
        }
      />
      <ErrorNotice error={action.error ?? templates.error} />
      {!canPrepare && <RolePermissionNotice />}
      {canPrepare && showBlank && (
        <form
          id="blank-template-form"
          className="studio-section"
          onSubmit={(e) => {
            e.preventDefault();
            void create({ ...blankTemplate(), name });
          }}
        >
          <h2>{msg("Start with a blank page")}</h2>
          <Field label={msg("Template name")}>
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <button className="button primary" disabled={action.pending}>
            {msg("Create the template ")}
          </button>
        </form>
      )}
      <h2>{msg("Demo templates")}</h2>
      <p className="studio-demo-intro">
        {msg(
          "These examples contain only fictional data. Create a private copy, edit it in the studio and delete it when you no longer need it.",
        )}
      </p>
      <div className="studio-gallery">
        {templateGallery().map(({ id, envelope }) => (
          <article key={id}>
            <div className="studio-miniature" aria-hidden="true">
              <FileText size={17} />
              <span />
              <span />
              <span />
            </div>
            <h3>{msg(envelope.name)}</h3>
            <p>{msg(envelope.description ?? "")}</p>
            <button
              className="button"
              disabled={action.pending || !canPrepare}
              aria-label={msg(
                "Create my private copy of {0}",
                msg(envelope.name),
              )}
              onClick={() => void create(envelope)}
            >
              {msg("Create my private copy ")}
              <ArrowRight size={17} />
            </button>
          </article>
        ))}
      </div>
      <div className="section-toolbar">
        <h2 ref={libraryHeading} tabIndex={-1}>
          {msg("Your templates")}
        </h2>
        <a href={`#${studioRoutes.datasets}`} className="text-link">
          {canPrepare ? msg("Import my data ") : msg("Data ")}
          <ArrowRight size={17} />
        </a>
      </div>
      {deletedName && (
        <p role="status" className="studio-saved">
          {msg("Template “{0}” was deleted.", deletedName)}
        </p>
      )}
      {!!templates.data?.items.length && <DateTimezone />}
      {templates.loading && !templates.data ? (
        <Loading />
      ) : (
        <div className="studio-list">
          {!templates.data?.items.length && (
            <p className="studio-list-row">
              {msg("Your library is ready for its first template. ")}
            </p>
          )}
          {templates.data?.items.map((item) => (
            <article className="studio-list-row" key={item.id}>
              <div>
                <h3>
                  <a href={`#${studioRoutes.template(item.id)}`}>{item.name}</a>
                </h3>
                <p>
                  {msg(stateLabel[item.state])} ·{" "}
                  {item.currentVersion
                    ? msg("Version {0}", item.currentVersion)
                    : msg("Not published yet")}{" "}
                  ·{" "}
                  {item.visibility === "private"
                    ? msg("Private")
                    : msg("Shared")}{" "}
                  · {date(item.updatedAt)}
                </p>
              </div>
              <div className="studio-list-actions">
                <a
                  className="button small"
                  href={`#${studioRoutes.template(item.id)}`}
                >
                  {msg("Open ")}
                </a>
                {canPrepare && (
                  <DeleteTemplateAction
                    model={item}
                    pending={action.pending}
                    onDelete={() => void remove(item)}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <LoadMore
        path="/templates"
        data={templates.data}
        onLoaded={templates.setData}
      />
      {canPrepare && (
        <form className="studio-section" onSubmit={(e) => void importWord(e)}>
          <h2>{msg("From Word")}</h2>
          <p>
            {msg(
              "Import a .docx file as editable blocks. Check the layout and conversion warnings before publishing. The older .doc format is not supported. ",
            )}
          </p>
          <Field
            label={msg("Word file (.docx)")}
            hint={msg("Maximum 5 MB. No data is sent to AI during import.")}
          >
            <FileInput
              ref={file}
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              required
            />
          </Field>
          <button className="button" disabled={action.pending}>
            {msg("Import Word ")}
          </button>
          {!!importWarnings.length && importedTemplateId && (
            <div role="status">
              <p>
                {msg(
                  "The template has been imported into your library. Please check: ",
                )}
              </p>
              <ul>
                {importWarnings.map((warning, i) => (
                  <li key={i}>
                    {msg(warning.message)} <code>{warning.code}</code>
                  </li>
                ))}
              </ul>
              <a
                className="button"
                href={"#" + studioRoutes.template(importedTemplateId)}
              >
                {msg("Open the imported Word template ")}
              </a>
            </div>
          )}
        </form>
      )}
    </>
  );
}

export function TemplateEditor({
  id,
  session,
}: {
  id: string;
  session: Session;
}) {
  const query = new URLSearchParams(useRoute().split("?")[1]);
  const generationId = query.get("generation");
  const recordId = query.get("record");
  const correctionRequested = Boolean(generationId && recordId);
  const sourceGeneration = useResource<GenerationJobView>(
    generationId
      ? `/generation-jobs/${encodeURIComponent(generationId)}`
      : null,
  );
  const correction = useResource<GenerationCorrectionInput>(
    generationId && recordId
      ? `/generation-jobs/${encodeURIComponent(generationId)}/record-context?${new URLSearchParams({ recordId })}`
      : null,
  );
  const resource = useResource<TemplateView>(
    correctionRequested ? null : `/templates/${id}`,
  );
  const sourceTemplate = useResource<TemplateView>(
    recordId && sourceGeneration.data
      ? `/templates/${encodeURIComponent(sourceGeneration.data.templateId)}?version=${sourceGeneration.data.templateVersion}`
      : null,
  );
  const generationScope = JSON.stringify([id, generationId, recordId]);
  const [generationData, setGenerationData] = useState<{
    scope: string;
    data: Record<string, unknown>;
  }>();
  if (
    (!correctionRequested && !resource.data) ||
    (generationId && !sourceGeneration.data) ||
    (correctionRequested && (!correction.data || !sourceTemplate.data))
  )
    return (
      <>
        <ErrorNotice
          error={
            resource.error ??
            sourceGeneration.error ??
            correction.error ??
            sourceTemplate.error
          }
        />
        {resource.error && (
          <a className="back-link" href={`#${studioRoutes.templates}`}>
            {msg("← Templates ")}
          </a>
        )}
        {(resource.loading ||
          sourceGeneration.loading ||
          correction.loading ||
          sourceTemplate.loading) && <Loading />}
      </>
    );
  if (correction.data && sourceGeneration.data && sourceTemplate.data)
    return (
      <GenerationDataCorrection
        key={generationScope}
        source={sourceGeneration.data}
        template={sourceTemplate.data}
        record={correction.data}
        canPrepare={permissionsFor(session).prepareDispatches}
      />
    );
  if (!resource.data) return <Loading />;
  return (
    <EditorBody
      key={`${generationScope}:${resource.data.revision}`}
      model={resource.data}
      sourceGeneration={sourceGeneration.data}
      correctionError={sourceGeneration.error ?? correction.error}
      generationData={
        generationData?.scope === generationScope
          ? generationData.data
          : undefined
      }
      onGenerationData={(data) =>
        setGenerationData({ scope: generationScope, data })
      }
      session={session}
      onSaved={(next) => resource.setData(next)}
    />
  );
}

function GenerationDataCorrection({
  source,
  template,
  record,
  canPrepare,
}: {
  source: GenerationJobView;
  template: TemplateView;
  record: GenerationCorrectionInput;
  canPrepare: boolean;
}) {
  const [data, setData] = useState(() => structuredClone(record.data));
  const key = useRef(crypto.randomUUID());
  const previousInput = useRef("");
  const generated = useRef(false);
  const action = useAction();
  const dirty = JSON.stringify(data) !== JSON.stringify(record.data);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (generated.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const guard = (event: Event) => {
      if (
        !generated.current &&
        !window.confirm(msg("Leave this correction and lose unsaved changes?"))
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
  return (
    <>
      <a className="back-link" href={`#${studioRoutes.generation(source.id)}`}>
        {msg("← Original generation")}
      </a>
      <PageHeading
        title={msg("Correct data")}
        intro={`${record.name ?? record.recordId} · ${template.name} · v${source.templateVersion}`}
      />
      <p className="field-hint">
        {msg(
          "Generating creates a new PDF for this document only; the original generation and its PDFs stay unchanged. To change the layout or text of every document, create a new template version.",
        )}
      </p>
      <ErrorNotice error={action.error} />
      <form
        className="studio-section"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            const body = {
              templateId: source.templateId,
              templateVersion: source.templateVersion,
              mode: "generate_only",
              records: [{ recordId: record.recordId, data }],
            };
            const serialized = JSON.stringify(body);
            if (previousInput.current && previousInput.current !== serialized)
              key.current = crypto.randomUUID();
            previousInput.current = serialized;
            const generation = await api<GenerationJobView>(
              "/generation-jobs",
              { method: "POST", key: key.current, body },
            );
            generated.current = true;
            go(studioRoutes.generation(generation.id));
          });
        }}
      >
        <BusinessDataForm
          schema={template.envelope.inputSchema}
          disabled={!canPrepare || action.pending}
          value={data}
          onChange={(next) => setData(next as Record<string, unknown>)}
        />
        <div className="button-group">
          <button
            className="button primary"
            disabled={
              !canPrepare || !template.permissions.use || action.pending
            }
          >
            {msg("Generate PDF without sending ")}
          </button>
          <a
            className="button"
            href={`#${studioRoutes.template(source.templateId)}?generation=${encodeURIComponent(source.id)}`}
          >
            {msg("Correct and create a new version")}
          </a>
        </div>
      </form>
    </>
  );
}

function flatten(
  schema: BusinessField,
  prefix = "",
): { path: string; schema: BusinessField }[] {
  if (schema.type !== "object") return [{ path: prefix, schema }];
  return Object.entries(schema.properties ?? {}).flatMap(([name, child]) =>
    flatten(child, prefix ? `${prefix}.${name}` : name),
  );
}

function EditorBody({
  model,
  session,
  onSaved,
  sourceGeneration,
  correctionError,
  generationData,
  onGenerationData,
}: {
  model: TemplateView;
  session: Session;
  onSaved: (value: TemplateView) => void;
  sourceGeneration?: GenerationJobView;
  correctionError?: Error;
  generationData?: Record<string, unknown>;
  onGenerationData: (data: Record<string, unknown>) => void;
}) {
  const [envelope, setEnvelope] = useState<TemplateEnvelope>(
    structuredClone(model.envelope),
  );
  const [history, setHistory] = useState<TemplateEnvelope[]>([]);
  const [future, setFuture] = useState<TemplateEnvelope[]>([]);
  const [tab, setTab] = useState<"design" | "data" | "share">("design");
  const [data, setData] = useState<Record<string, unknown>>(
    structuredClone(generationData ?? model.envelope.sampleData),
  );
  const [fieldName, setFieldName] = useState("");
  const [fieldTitle, setFieldTitle] = useState("");
  const [designerPending, setDesignerPending] = useState(false);
  const [fieldType, setFieldType] = useState<
    "string" | "integer" | "date" | "array"
  >("string");
  const [previewId, setPreviewId] = useState<string>();
  const action = useAction();
  const dirty = JSON.stringify(envelope) !== JSON.stringify(model.envelope);
  const canPrepare = permissionsFor(session).prepareDispatches;
  const editable =
    canPrepare && model.permissions.edit && model.state !== "archived";
  const generationKey = useRef(crypto.randomUUID());
  const generationInput = useRef("");
  const deletionComplete = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (deletionComplete.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const guardNavigation = (event: Event) => {
      if (deletionComplete.current) return;
      if (!window.confirm(msg("Leave this template and lose unsaved changes?")))
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener(BEFORE_WORKSPACE_NAVIGATION, guardNavigation);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener(BEFORE_WORKSPACE_NAVIGATION, guardNavigation);
    };
  }, [dirty]);
  function change(next: TemplateEnvelope) {
    setHistory((h) => [...h.slice(-29), structuredClone(envelope)]);
    setFuture([]);
    setEnvelope(next);
  }
  async function save() {
    if (designerPending) return;
    await action.run(async () => {
      validateTemplateEnvelope(envelope);
      onSaved(
        await api<TemplateView>(`/templates/${model.id}`, {
          method: "PATCH",
          body: { expectedRevision: model.revision, envelope },
        }),
      );
    });
  }
  async function publish() {
    if (designerPending) return;
    await action.run(async () => {
      if (dirty)
        throw new Error(msg("Save the draft before publishing this version."));
      onSaved(
        await api<TemplateView>(`/templates/${model.id}/publish`, {
          method: "POST",
          body: { expectedRevision: model.revision },
        }),
      );
    });
  }
  async function generate(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      if (dirty || !model.currentVersion || model.state !== "published")
        throw new Error(
          msg("Save and publish your template before generating documents."),
        );
      const payload = {
        templateId: model.id,
        templateVersion: model.currentVersion,
        mode: "generate_only",
        records: [{ recordId: "document-1", data }],
      };
      const serialized = JSON.stringify(payload);
      if (generationInput.current && generationInput.current !== serialized)
        generationKey.current = crypto.randomUUID();
      generationInput.current = serialized;
      const job = await api<GenerationJobView>("/generation-jobs", {
        method: "POST",
        key: generationKey.current,
        body: payload,
      });
      go(studioRoutes.generation(job.id));
    });
  }
  function addField() {
    void action.run(async () => {
      if (
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName) ||
        ["constructor", "prototype"].includes(fieldName)
      )
        throw new Error(
          msg("Use a simple identifier, such as customerReference."),
        );
      if (envelope.inputSchema.properties?.[fieldName])
        throw new Error(msg("This variable already exists."));
      const next = structuredClone(envelope);
      const blockName = `field_${fieldName}`;
      let page = next.definition.schemas.at(-1)!;
      let y = Math.max(
        next.definition.basePdf.padding[0],
        ...page.map((block) => block.position.y + block.height + 8),
      );
      if (
        y + 24 >
        next.definition.basePdf.height - next.definition.basePdf.padding[2]
      ) {
        page = [];
        next.definition.schemas.push(page);
        y = next.definition.basePdf.padding[0];
      }
      const field: BusinessField =
        fieldType === "array"
          ? {
              type: "array",
              title: fieldTitle || fieldName,
              items: {
                type: "object",
                properties: {
                  description: { type: "string", title: msg("Description") },
                },
                required: ["description"],
              },
            }
          : {
              type: fieldType === "date" ? "string" : fieldType,
              title: fieldTitle || fieldName,
              ...(fieldType === "date" ? { format: "date" as const } : {}),
            };
      next.inputSchema.properties = {
        ...next.inputSchema.properties,
        [fieldName]: field,
      };
      next.inputSchema.required = [
        ...(next.inputSchema.required ?? []),
        fieldName,
      ];
      next.sampleData[fieldName] =
        fieldType === "array"
          ? [{ description: msg("Example") }]
          : fieldType === "integer"
            ? 1
            : fieldType === "date"
              ? "2026-09-21"
              : msg("Example");
      if (fieldType === "array") {
        page.push(tableBlock(blockName, [msg("Description")], y));
        next.bindings.push({
          block: blockName,
          kind: "table",
          path: fieldName,
          format: "text",
          required: true,
          columns: [
            {
              title: msg("Description"),
              path: "description",
              format: "text",
              required: true,
            },
          ],
        });
      } else {
        page.push(textBlock(blockName, "Example", 20, y, 170));
        next.bindings.push({
          block: blockName,
          kind: "value",
          path: fieldName,
          format:
            fieldType === "integer"
              ? "integer"
              : fieldType === "date"
                ? "date"
                : "text",
          required: true,
        });
      }
      change(validateTemplateEnvelope(next));
      const nextData = { ...data, [fieldName]: next.sampleData[fieldName] };
      setData(nextData);
      onGenerationData(nextData);
      setFieldName("");
      setFieldTitle("");
    });
  }
  return (
    <>
      <a className="back-link" href={`#${studioRoutes.templates}`}>
        {msg("← Templates ")}
      </a>
      <PageHeading
        title={model.name}
        intro={msg(
          "{0} · {1}. Publishing freezes a version; the next edit opens a new draft.",
          msg(stateLabel[model.state]),
          model.currentVersion
            ? msg("Published version {0}", model.currentVersion)
            : msg("No published version"),
        )}
      />
      <ErrorNotice error={action.error ?? correctionError} />
      {sourceGeneration && (
        <div className="button-group">
          <a
            className="back-link"
            href={`#${studioRoutes.generation(sourceGeneration.id)}`}
          >
            {msg("← Original generation")}
          </a>
          {sourceGeneration.datasetId && (
            <a
              className="button"
              href={`#${studioRoutes.dataset(sourceGeneration.datasetId)}?${new URLSearchParams(
                {
                  template: model.id,
                  ...(model.currentVersion
                    ? { version: String(model.currentVersion) }
                    : {}),
                  ...(sourceGeneration.mappingId
                    ? {
                        mapping: sourceGeneration.mappingId,
                        mappingVersion: String(sourceGeneration.mappingVersion),
                      }
                    : {}),
                  generation: sourceGeneration.id,
                },
              )}`}
            >
              {msg("Use this version with the same data")}
            </a>
          )}
        </div>
      )}
      <nav className="studio-tabs" aria-label={msg("Template sections")}>
        {(
          [
            ["design", msg("Template")],
            ["data", msg("Data and generation")],
            ["share", msg("Sharing")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className="button small"
            aria-current={tab === value ? "page" : undefined}
            disabled={
              designerPending || (value === "share" && (dirty || !canPrepare))
            }
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "design" && (
        <>
          <div className="studio-toolbar">
            <Field label={msg("Template name")}>
              <input
                value={envelope.name}
                maxLength={160}
                disabled={!editable}
                onChange={(e) => change({ ...envelope, name: e.target.value })}
              />
            </Field>
            <button
              className="button small"
              disabled={!editable || !history.length}
              onClick={() => {
                const prev = history.at(-1)!;
                setFuture([envelope, ...future]);
                setHistory(history.slice(0, -1));
                setEnvelope(prev);
              }}
            >
              {msg("Undo")}
            </button>
            <button
              className="button small"
              disabled={!editable || !future.length}
              onClick={() => {
                setHistory([...history, envelope]);
                setEnvelope(future[0]);
                setFuture(future.slice(1));
              }}
            >
              {msg("Redo ")}
            </button>
            <button
              className="button primary"
              disabled={
                !editable || !dirty || action.pending || designerPending
              }
              onClick={() => void save()}
            >
              {msg("Save draft ")}
            </button>
            <button
              className="button"
              disabled={
                !canPrepare ||
                designerPending ||
                !model.permissions.publish ||
                dirty ||
                model.state === "archived" ||
                action.pending
              }
              onClick={() => void publish()}
            >
              {msg("Publish version ")}
            </button>
          </div>
          <p
            className={dirty ? "studio-unsaved" : "studio-saved"}
            role="status"
          >
            {designerPending
              ? msg("Applying the editor changes…")
              : dirty
                ? msg(
                    "Unsaved changes. Save before publishing or leaving the studio.",
                  )
                : msg("All changes are saved.")}
          </p>
          <div className="studio-layout studio-editor-layout">
            <div className="studio-main">
              {editable ? (
                <Suspense fallback={<Loading />}>
                  <Designer
                    definition={envelope.definition}
                    onPendingChange={setDesignerPending}
                    onChange={(definition) => {
                      change(reconcileDesignerChange(envelope, definition));
                    }}
                  />
                </Suspense>
              ) : (
                <p className="notice info">
                  {msg(
                    "This template is read-only. Your permissions allow the actions shown above. ",
                  )}
                </p>
              )}
            </div>
            <aside className="studio-side">
              <h2>{msg("Business variables")}</h2>
              <p className="field-hint">
                {msg(
                  "Variables contain the data specific to each document. Edit fixed text directly on the page. ",
                )}
              </p>
              {flatten(envelope.inputSchema).map(({ path, schema }) => (
                <p key={path}>
                  <strong>{schema.title ?? path}</strong>
                  <br />
                  <code>{path}</code>{" "}
                  <span className="studio-meta">
                    {schema.type === "array"
                      ? msg("Repeating table")
                      : (schema.format ?? schema.type)}
                  </span>
                </p>
              ))}
              {editable && (
                <fieldset disabled={action.pending}>
                  <legend>{msg("Add a variable")}</legend>
                  <Field label={msg("Label")}>
                    <input
                      value={fieldTitle}
                      onChange={(e) => setFieldTitle(e.target.value)}
                    />
                  </Field>
                  <Field
                    label={msg("Identifier")}
                    hint={msg("Example: customerReference")}
                  >
                    <input
                      value={fieldName}
                      onChange={(e) => setFieldName(e.target.value)}
                    />
                  </Field>
                  <Field label={msg("Variable type")}>
                    <select
                      value={fieldType}
                      onChange={(e) =>
                        setFieldType(e.target.value as typeof fieldType)
                      }
                    >
                      <option value="string">{msg("Text")}</option>
                      <option value="integer">{msg("Integer / cents")}</option>
                      <option value="date">{msg("Date")}</option>
                      <option value="array">{msg("Table of rows")}</option>
                    </select>
                  </Field>
                  <button
                    type="button"
                    className="button small"
                    onClick={addField}
                  >
                    {msg("Add to document ")}
                  </button>
                </fieldset>
              )}
            </aside>
          </div>
          <TemplateSettings
            envelope={envelope}
            disabled={!editable}
            onChange={change}
          />
          <TemplateAi
            id={model.id}
            revision={model.revision}
            disabled={!editable || dirty}
            onApply={change}
          />
          <BindingEditor
            envelope={envelope}
            disabled={!editable}
            onChange={change}
          />
        </>
      )}
      {tab === "data" && (
        <form className="studio-section" onSubmit={(e) => void generate(e)}>
          <h2>{msg("Create your PDF")}</h2>
          <p>
            {msg(
              "The data below belongs to this generation. It does not replace the template’s shared synthetic examples. ",
            )}
          </p>
          <BusinessDataForm
            schema={envelope.inputSchema}
            disabled={!canPrepare}
            value={data}
            onChange={(value) => {
              const nextData = value as Record<string, unknown>;
              setData(nextData);
              onGenerationData(nextData);
            }}
          />
          <p className="field-hint">
            {msg(
              "A separate PDF, checked and saved in your documents. No dispatch is made and no sending credit is reserved. ",
            )}
          </p>
          {(!model.currentVersion || model.state !== "published" || dirty) && (
            <p className="notice info">
              {msg("Save and publish your template to generate documents. ")}
            </p>
          )}
          <div className="button-group">
            <button
              type="button"
              className="button"
              disabled={
                action.pending || !canPrepare || !model.permissions.use || dirty
              }
              onClick={() =>
                void action.run(async () => {
                  const result = await api<{ id: string }>(
                    `/templates/${model.id}/preview`,
                    {
                      method: "POST",
                      body: { expectedRevision: model.revision, data },
                    },
                  );
                  setPreviewId(result.id);
                })
              }
            >
              {msg("Check a PDF preview ")}
            </button>
            <button
              className="button primary"
              disabled={
                action.pending ||
                !canPrepare ||
                !model.permissions.use ||
                dirty ||
                model.state !== "published"
              }
            >
              {msg("Generate PDF without sending ")}
            </button>
            <a
              className="button"
              href={`#${studioRoutes.datasets}?${new URLSearchParams({ template: model.id, ...(model.currentVersion ? { version: String(model.currentVersion) } : {}) })}`}
            >
              {msg("Use a data file ")}
            </a>
          </div>
          {previewId && (
            <div className="studio-result-preview">
              <PdfPreview id={previewId} />
            </div>
          )}
        </form>
      )}
      {tab === "share" && canPrepare && (
        <SharingPanel model={model} onSaved={onSaved} />
      )}
      <div className="studio-toolbar">
        <button
          className="button small"
          disabled={
            action.pending || !canPrepare || !model.permissions.use || dirty
          }
          onClick={() =>
            void action.run(async () => {
              const copy = await api<TemplateView>(
                `/templates/${model.id}/duplicate`,
                { method: "POST", body: {} },
              );
              go(studioRoutes.template(copy.id));
            })
          }
        >
          {msg("Duplicate template ")}
        </button>
        <button
          className="text-button"
          disabled={
            action.pending ||
            !canPrepare ||
            dirty ||
            !model.permissions.publish ||
            model.state === "archived"
          }
          onClick={() =>
            void action.run(async () => {
              onSaved(
                await api<TemplateView>(`/templates/${model.id}/archive`, {
                  method: "POST",
                  body: { expectedRevision: model.revision },
                }),
              );
            })
          }
        >
          {msg("Archive ")}
        </button>
        {canPrepare && (
          <DeleteTemplateAction
            model={model}
            pending={action.pending}
            dirty={dirty}
            onDelete={() =>
              void action.run(async () => {
                await api<{ id: string; deleted: true }>(
                  `/templates/${model.id}`,
                  {
                    method: "DELETE",
                    body: { expectedRevision: model.revision },
                  },
                );
                deletionComplete.current = true;
                go(studioRoutes.templates);
              })
            }
          />
        )}
      </div>
    </>
  );
}

function BindingEditor({
  envelope,
  disabled,
  onChange,
}: {
  envelope: TemplateEnvelope;
  disabled: boolean;
  onChange: (v: TemplateEnvelope) => void;
}) {
  function update(index: number, binding: TemplateBinding) {
    const next = structuredClone(envelope);
    next.bindings[index] = binding;
    onChange(next);
  }
  return (
    <details className="studio-section">
      <summary>{msg("Bindings and table columns")}</summary>
      <p>
        {msg(
          "Link each block to a business variable. Amounts are integers in cents. ",
        )}
      </p>
      {envelope.bindings.map((binding, index) => (
        <fieldset
          key={binding.block}
          disabled={disabled}
          className="business-object"
        >
          <legend>{binding.block}</legend>
          <Field label={msg("Variable for block {0}", binding.block)}>
            <select
              value={binding.path}
              onChange={(e) =>
                update(index, { ...binding, path: e.target.value })
              }
            >
              {flatten(envelope.inputSchema)
                .filter((f) =>
                  binding.kind === "value"
                    ? f.schema.type !== "array"
                    : f.schema.type === "array",
                )
                .map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.schema.title ?? f.path} · {f.path}
                  </option>
                ))}
            </select>
          </Field>
          {binding.columns?.map((column, i) => (
            <div className="studio-binding" key={i}>
              <Field label={msg("Column {0} title", i + 1)}>
                <input
                  value={column.title}
                  onChange={(e) => {
                    const next = structuredClone(envelope);
                    next.bindings[index].columns![i].title = e.target.value;
                    const block = next.definition.schemas
                      .flat()
                      .find((b) => b.name === binding.block)!;
                    block.head = next.bindings[index].columns!.map(
                      (c) => c.title,
                    );
                    onChange(next);
                  }}
                />
              </Field>
              <Field label={msg("Column {0} field", i + 1)}>
                <input
                  value={column.path}
                  onChange={(e) =>
                    update(index, {
                      ...binding,
                      columns: binding.columns!.map((c, j) =>
                        j === i ? { ...c, path: e.target.value } : c,
                      ),
                    })
                  }
                />
              </Field>
            </div>
          ))}
        </fieldset>
      ))}
    </details>
  );
}

type Grant = {
  userId: string;
  use: boolean;
  edit: boolean;
  publish: boolean;
  share: boolean;
};
function SharingPanel({
  model,
  onSaved,
}: {
  model: TemplateView;
  onSaved: (v: TemplateView) => void;
}) {
  const resource = useResource<{
    members: { userId: string; name: string }[];
    grants: Grant[];
  }>(model.permissions.share ? `/templates/${model.id}/sharing` : null);
  const [visibility, setVisibility] = useState(model.visibility);
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const action = useAction();
  const current = grants ?? resource.data?.grants ?? [];
  return (
    <form
      className="studio-section"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(async () =>
          onSaved(
            await api<TemplateView>(`/templates/${model.id}/share`, {
              method: "POST",
              body: {
                expectedRevision: model.revision,
                visibility,
                syntheticSamplesConfirmed: confirmed,
                grants: current,
              },
            }),
          ),
        );
      }}
    >
      <h2>{msg("Share template")}</h2>
      <p>
        {msg(
          "Sharing includes all fixed text, images and examples in the template, including content imported from Word. Check their contents. Data files, generation values and generated PDFs remain private. ",
        )}
      </p>
      <ErrorNotice error={action.error ?? resource.error} />
      <fieldset disabled={!model.permissions.share || action.pending}>
        <Field label={msg("Visibility")}>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          >
            <option value="private">{msg("Private")}</option>
            <option value="organization">
              {msg("Everyone in the organisation can use it ")}
            </option>
            <option value="selected">{msg("Selected members")}</option>
          </select>
        </Field>
        <div className="studio-permissions">
          {resource.data?.members
            .filter((m) => m.userId !== model.ownerId)
            .map((member) => (
              <div className="studio-permission-row" key={member.userId}>
                <strong>{member.name}</strong>
                {(Object.keys(permissionLabel) as TemplatePermission[]).map(
                  (permission) => (
                    <label key={permission}>
                      <input
                        type="checkbox"
                        checked={
                          current.find((g) => g.userId === member.userId)?.[
                            permission
                          ] ?? false
                        }
                        onChange={(e) => {
                          const grant = current.find(
                            (g) => g.userId === member.userId,
                          ) ?? {
                            userId: member.userId,
                            use: false,
                            edit: false,
                            publish: false,
                            share: false,
                          };
                          setGrants([
                            ...current.filter(
                              (g) => g.userId !== member.userId,
                            ),
                            { ...grant, [permission]: e.target.checked },
                          ]);
                        }}
                      />{" "}
                      {msg(permissionLabel[permission])}
                    </label>
                  ),
                )}
              </div>
            ))}
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={confirmed}
            required
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {msg(
            "I have checked that the shared examples contain only authorised synthetic data. ",
          )}
        </label>
        <button className="button primary" disabled={!confirmed}>
          {msg("Save sharing settings ")}
        </button>
      </fieldset>
    </form>
  );
}
