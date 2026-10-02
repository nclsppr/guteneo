import { msg } from "./messages";
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
  validateTemplateImage,
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
import { api, date, type Session } from "./api";
import {
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
} from "./components";
import { BusinessDataForm } from "./template-data-form";
import { reconcileDesignerChange } from "../../../packages/templates/designer";
import { TemplateSettings, TemplateAi } from "./template-settings";

const Designer = lazy(() => import("./template-designer"));
const stateLabel = {
  draft: "Brouillon",
  published: "Publié",
  archived: "Archivé",
};
const permissionLabel: Record<TemplatePermission, string> = {
  use: "Utiliser",
  edit: "Modifier",
  publish: "Publier",
  share: "Partager",
};

export function TemplateLibrary({ startBlank }: { startBlank: boolean }) {
  const templates = useResource<Page<TemplateView>>("/templates");
  const action = useAction();
  const [name, setName] = useState(msg("Mon document"));
  const [showBlank, setShowBlank] = useState(startBlank);
  const file = useRef<HTMLInputElement>(null);
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
      go(`/app/template/${result.id}`);
    });
  }
  async function importWord(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const source = file.current?.files?.[0];
      if (!source) throw new Error(msg("Choisissez un fichier Word .docx."));
      if (source.size > 5 * 1024 * 1024)
        throw new Error(msg("Le document Word dépasse 5 Mo."));
      const form = new FormData();
      form.set("file", source);
      const result = await api<{
        template: TemplateView;
        warnings: DocxImportResult["warnings"];
      }>("/templates/import-docx", { method: "POST", body: form });
      setImportWarnings(result.warnings);
      setImportedTemplateId(result.template.id);
      if (result.warnings.length) templates.refresh();
      else go(`/app/template/${result.template.id}`);
    });
  }
  return (
    <>
      <PageHeading
        title={msg("Modèles")}
        intro={msg(
          "Une page, vos variables, autant de documents que nécessaire. Vos modèles restent rééditables depuis le web, l’API et votre assistant.",
        )}
        action={
          <button
            className="button primary"
            onClick={() => setShowBlank(!showBlank)}
          >
            <Plus size={18} />
            {msg("Créer un document ")}
          </button>
        }
      />
      <ErrorNotice error={action.error ?? templates.error} />
      {showBlank && (
        <form
          className="studio-section"
          onSubmit={(e) => {
            e.preventDefault();
            void create({ ...blankTemplate(), name });
          }}
        >
          <h2>{msg("Partir d’une page vierge")}</h2>
          <Field label={msg("Nom du modèle")}>
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <button className="button primary" disabled={action.pending}>
            {msg("Ouvrir le studio ")}
          </button>
        </form>
      )}
      <h2>{msg("Une base pour commencer")}</h2>
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
              disabled={action.pending}
              onClick={() => void create(envelope)}
            >
              {msg("Utiliser ce modèle ")}
              <ArrowRight size={17} />
            </button>
          </article>
        ))}
      </div>
      <div className="section-toolbar">
        <h2>{msg("Vos modèles")}</h2>
        <a href="#/app/datasets" className="text-link">
          {msg("Importer mes données ")}
          <ArrowRight size={17} />
        </a>
      </div>
      {templates.loading && !templates.data ? (
        <Loading />
      ) : (
        <div className="studio-list">
          {!templates.data?.items.length && (
            <p className="studio-list-row">
              {msg(
                "Votre bibliothèque est prête à accueillir son premier modèle. ",
              )}
            </p>
          )}
          {templates.data?.items.map((item) => (
            <article className="studio-list-row" key={item.id}>
              <div>
                <h3>
                  <a href={`#/app/template/${item.id}`}>{item.name}</a>
                </h3>
                <p>
                  {msg(stateLabel[item.state])} ·{" "}
                  {item.currentVersion
                    ? msg("Version {0}", item.currentVersion)
                    : msg("À publier")}{" "}
                  ·{" "}
                  {item.visibility === "private"
                    ? msg("Privé")
                    : msg("Partagé")}{" "}
                  · {date(item.updatedAt)}
                </p>
              </div>
              <a className="button small" href={`#/app/template/${item.id}`}>
                {msg("Ouvrir ")}
              </a>
            </article>
          ))}
        </div>
      )}
      <LoadMore
        path="/templates"
        data={templates.data}
        onLoaded={templates.setData}
      />
      <form className="studio-section" onSubmit={(e) => void importWord(e)}>
        <h2>{msg("À partir de Word")}</h2>
        <p>
          {msg(
            "Importez le contenu d’un fichier .docx en blocs rééditables. Vérifiez la mise en page et les avertissements de conversion avant publication. L’ancien format .doc n’est pas pris en charge. ",
          )}
        </p>
        <Field
          label={msg("Fichier Word (.docx)")}
          hint={msg("5 Mo maximum. Aucun transfert vers une IA à l’import.")}
        >
          <input
            ref={file}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
          />
        </Field>
        <button className="button" disabled={action.pending}>
          {msg("Importer Word ")}
        </button>
        {!!importWarnings.length && (
          <div role="status">
            <p>
              {msg(
                "Le modèle a été importé dans votre bibliothèque. Points à vérifier : ",
              )}
            </p>
            <ul>
              {importWarnings.map((warning, i) => (
                <li key={i}>
                  {warning.message} <code>{warning.code}</code>
                </li>
              ))}
            </ul>
            <a className="button" href={"#/app/template/" + importedTemplateId}>
              {msg("Ouvrir le modèle Word importé ")}
            </a>
          </div>
        )}
      </form>
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
  const resource = useResource<TemplateView>(`/templates/${id}`);
  if (!resource.data)
    return (
      <>
        <ErrorNotice error={resource.error} />
        {resource.loading && <Loading />}
      </>
    );
  return (
    <EditorBody
      key={`${id}:${resource.data.revision}`}
      model={resource.data}
      session={session}
      onSaved={(next) => resource.setData(next)}
    />
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
  session: _session,
  onSaved,
}: {
  model: TemplateView;
  session: Session;
  onSaved: (value: TemplateView) => void;
}) {
  const [envelope, setEnvelope] = useState<TemplateEnvelope>(
    structuredClone(model.envelope),
  );
  const [history, setHistory] = useState<TemplateEnvelope[]>([]);
  const [future, setFuture] = useState<TemplateEnvelope[]>([]);
  const [tab, setTab] = useState<"design" | "data" | "share">("design");
  const [data, setData] = useState<Record<string, unknown>>(
    structuredClone(model.envelope.sampleData),
  );
  const [fieldName, setFieldName] = useState("");
  const [fieldTitle, setFieldTitle] = useState("");
  const [fieldType, setFieldType] = useState<
    "string" | "integer" | "date" | "array"
  >("string");
  const [previewId, setPreviewId] = useState<string>();
  const action = useAction();
  const dirty = JSON.stringify(envelope) !== JSON.stringify(model.envelope);
  const editable = model.permissions.edit && model.state !== "archived";
  const generationKey = useRef(crypto.randomUUID());
  const generationInput = useRef("");
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardNavigation = (event: Event) => {
      if (
        !window.confirm(
          msg(
            "Quitter le studio et perdre les modifications non enregistrées ?",
          ),
        )
      )
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
    await action.run(async () => {
      if (dirty)
        throw new Error(
          msg("Enregistrez le brouillon avant de publier cette version."),
        );
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
          msg("Enregistrez puis publiez votre modèle avant la génération."),
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
      go(`/app/generation/${job.id}`);
    });
  }
  function addField() {
    void action.run(async () => {
      if (
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(fieldName) ||
        ["constructor", "prototype"].includes(fieldName)
      )
        throw new Error(
          msg("Utilisez un identifiant simple, par exemple referenceClient."),
        );
      if (envelope.inputSchema.properties?.[fieldName])
        throw new Error(msg("Cette variable existe déjà."));
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
          ? [{ description: msg("Exemple") }]
          : fieldType === "integer"
            ? 1
            : fieldType === "date"
              ? "2026-09-21"
              : msg("Exemple");
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
        page.push(textBlock(blockName, "Exemple", 20, y, 170));
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
      setData({ ...data, [fieldName]: next.sampleData[fieldName] });
      setFieldName("");
      setFieldTitle("");
    });
  }
  return (
    <>
      <a className="back-link" href="#/app/templates">
        {msg("← Modèles ")}
      </a>
      <PageHeading
        title={model.name}
        intro={msg(
          "{0} · {1}. La publication fige une version ; la modification suivante ouvre un nouveau brouillon.",
          msg(stateLabel[model.state]),
          model.currentVersion
            ? msg("Version publiée {0}", model.currentVersion)
            : msg("Aucune version publiée"),
        )}
      />
      <ErrorNotice error={action.error} />
      <nav className="studio-tabs" aria-label={msg("Studio documentaire")}>
        {(
          [
            ["design", msg("Modèle")],
            ["data", msg("Données et génération")],
            ["share", msg("Partage")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className="button small"
            aria-current={tab === value ? "page" : undefined}
            disabled={value === "share" && dirty}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "design" && (
        <>
          <div className="studio-toolbar">
            <Field label={msg("Nom du modèle")}>
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
              {msg("Annuler la modification")}
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
              {msg("Rétablir ")}
            </button>
            <button
              className="button primary"
              disabled={!editable || !dirty || action.pending}
              onClick={() => void save()}
            >
              {msg("Enregistrer le brouillon ")}
            </button>
            <button
              className="button"
              disabled={
                !model.permissions.publish ||
                dirty ||
                model.state === "archived" ||
                action.pending
              }
              onClick={() => void publish()}
            >
              {msg("Publier la version ")}
            </button>
          </div>
          <p
            className={dirty ? "studio-unsaved" : "studio-saved"}
            role="status"
          >
            {dirty
              ? msg(
                  "Modifications non enregistrées. Enregistrez avant de publier ou de quitter le studio.",
                )
              : msg("Toutes les modifications sont enregistrées.")}
          </p>
          <div className="studio-layout studio-editor-layout">
            <div className="studio-main">
              {editable ? (
                <Suspense fallback={<Loading />}>
                  <Designer
                    definition={envelope.definition}
                    onChange={(definition) => {
                      change(reconcileDesignerChange(envelope, definition));
                    }}
                  />
                </Suspense>
              ) : (
                <p className="notice info">
                  {msg(
                    "Ce modèle est en consultation. Vos droits permettent les actions indiquées ci-dessus. ",
                  )}
                </p>
              )}
            </div>
            <aside className="studio-side">
              <h2>{msg("Variables métier")}</h2>
              <p className="field-hint">
                {msg(
                  "Les variables sont les données propres à chaque document. Les textes fixes se modifient directement sur la page. ",
                )}
              </p>
              {flatten(envelope.inputSchema).map(({ path, schema }) => (
                <p key={path}>
                  <strong>{schema.title ?? path}</strong>
                  <br />
                  <code>{path}</code>{" "}
                  <span className="studio-meta">
                    {schema.type === "array"
                      ? msg("Tableau répétable")
                      : (schema.format ?? schema.type)}
                  </span>
                </p>
              ))}
              {editable && (
                <fieldset disabled={action.pending}>
                  <legend>{msg("Ajouter une variable")}</legend>
                  <Field label={msg("Libellé")}>
                    <input
                      value={fieldTitle}
                      onChange={(e) => setFieldTitle(e.target.value)}
                    />
                  </Field>
                  <Field
                    label={msg("Identifiant")}
                    hint={msg("Exemple : referenceClient")}
                  >
                    <input
                      value={fieldName}
                      onChange={(e) => setFieldName(e.target.value)}
                    />
                  </Field>
                  <Field label={msg("Type de variable")}>
                    <select
                      value={fieldType}
                      onChange={(e) =>
                        setFieldType(e.target.value as typeof fieldType)
                      }
                    >
                      <option value="string">{msg("Texte")}</option>
                      <option value="integer">
                        {msg("Nombre entier / centimes")}
                      </option>
                      <option value="date">{msg("Date")}</option>
                      <option value="array">{msg("Tableau de lignes")}</option>
                    </select>
                  </Field>
                  <button
                    type="button"
                    className="button small"
                    onClick={addField}
                  >
                    {msg("Ajouter au document ")}
                  </button>
                  <Field
                    label={msg("Ajouter votre logo")}
                    hint={msg("PNG ou JPEG, 250 Ko et 4 mégapixels maximum.")}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file)
                          void action.run(async () => {
                            if (file.size > 250 * 1024)
                              throw new Error(msg("Le logo dépasse 250 Ko."));
                            const content = await new Promise<string>(
                              (resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () =>
                                  resolve(String(reader.result));
                                reader.onerror = () =>
                                  reject(new Error(msg("Fichier illisible.")));
                                reader.readAsDataURL(file);
                              },
                            );
                            validateTemplateImage(content);
                            const next = structuredClone(envelope);
                            next.definition.schemas[0].push({
                              name: `logo_${next.definition.schemas.flat().length}`,
                              type: "image",
                              content,
                              position: { x: 20, y: 25 },
                              width: 40,
                              height: 20,
                              readOnly: true,
                            });
                            change(validateTemplateEnvelope(next));
                          });
                      }}
                    />
                  </Field>
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
          <h2>{msg("Créer votre PDF")}</h2>
          <p>
            {msg(
              "Les données ci-dessous appartiennent à cette génération. Elles ne remplacent pas les exemples synthétiques partagés du modèle. ",
            )}
          </p>
          <BusinessDataForm
            schema={envelope.inputSchema}
            value={data}
            onChange={(value) => setData(value as Record<string, unknown>)}
          />
          <p className="field-hint">
            {msg(
              "Un PDF distinct, contrôlé et conservé dans vos documents. Aucun envoi ni crédit d’envoi réservé. ",
            )}
          </p>
          {(!model.currentVersion || model.state !== "published" || dirty) && (
            <p className="notice info">
              {msg(
                "Enregistrez et publiez votre modèle pour pouvoir le générer. ",
              )}
            </p>
          )}
          <div className="button-group">
            <button
              type="button"
              className="button"
              disabled={action.pending || !model.permissions.use || dirty}
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
              {msg("Vérifier un aperçu PDF ")}
            </button>
            <button
              className="button primary"
              disabled={
                action.pending ||
                !model.permissions.use ||
                dirty ||
                model.state !== "published"
              }
            >
              {msg("Générer le PDF sans envoi ")}
            </button>
            <a className="button" href="#/app/datasets">
              {msg("Utiliser un fichier de données ")}
            </a>
          </div>
          {previewId && (
            <div className="studio-result-preview">
              <PdfPreview id={previewId} />
            </div>
          )}
        </form>
      )}
      {tab === "share" && <SharingPanel model={model} onSaved={onSaved} />}
      <div className="studio-toolbar">
        <button
          className="button small"
          disabled={action.pending || !model.permissions.use || dirty}
          onClick={() =>
            void action.run(async () => {
              const copy = await api<TemplateView>(
                `/templates/${model.id}/duplicate`,
                { method: "POST", body: {} },
              );
              go(`/app/template/${copy.id}`);
            })
          }
        >
          {msg("Dupliquer le modèle ")}
        </button>
        <button
          className="text-button"
          disabled={
            action.pending ||
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
          {msg("Archiver ")}
        </button>
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
      <summary>{msg("Liaisons et colonnes des tableaux")}</summary>
      <p>
        {msg(
          "Reliez chaque bloc à une variable métier. Les montants sont des entiers en centimes. ",
        )}
      </p>
      {envelope.bindings.map((binding, index) => (
        <fieldset
          key={binding.block}
          disabled={disabled}
          className="business-object"
        >
          <legend>{binding.block}</legend>
          <Field label={msg("Variable du bloc {0}", binding.block)}>
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
              <Field label={msg("Titre de colonne {0}", i + 1)}>
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
              <Field label={msg("Champ de colonne {0}", i + 1)}>
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
      <h2>{msg("Partager le modèle")}</h2>
      <p>
        {msg(
          "Le partage inclut tous les textes fixes, images et exemples du modèle, y compris ceux importés de Word. Vérifiez leur contenu. Les fichiers de données, leurs valeurs de génération et les PDF produits restent privés. ",
        )}
      </p>
      <ErrorNotice error={action.error ?? resource.error} />
      <fieldset disabled={!model.permissions.share || action.pending}>
        <Field label={msg("Visibilité")}>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          >
            <option value="private">{msg("Privé")}</option>
            <option value="organization">
              {msg("Toute l’organisation peut utiliser ")}
            </option>
            <option value="selected">{msg("Membres sélectionnés")}</option>
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
            "J’ai vérifié que les exemples partagés ne contiennent que des données synthétiques autorisées. ",
          )}
        </label>
        <button className="button primary" disabled={!confirmed}>
          {msg("Enregistrer le partage ")}
        </button>
      </fieldset>
    </form>
  );
}
