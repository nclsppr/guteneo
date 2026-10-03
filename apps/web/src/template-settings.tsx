import { msg } from "./messages";
import { useStudioAiPolicy, StudioAiNotice } from "./studio-ai";
import { useState } from "react";
import {
  applyTemplatePatch,
  prepareTemplateRender,
  validateTemplateData,
  validateTemplateEnvelope,
  type BusinessField,
  type TemplateBinding,
  type TemplateColumn,
  type TemplateEnvelope,
} from "../../../packages/contracts/src/templates";
import type { TemplateSuggestion } from "../../../packages/data/template-ai";
import { api } from "./api";
import { ErrorNotice, Field, useAction } from "./components";
import { BusinessDataForm } from "./template-data-form";

export function TemplateSettings({
  envelope,
  onChange,
  disabled,
}: {
  envelope: TemplateEnvelope;
  onChange: (next: TemplateEnvelope) => void;
  disabled: boolean;
}) {
  const [block, setBlock] = useState(
    envelope.bindings.find((b) => b.kind === "table")?.block ?? "",
  );
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<"text" | "integer" | "money">("text");
  const action = useAction();
  const selectedTable =
    envelope.bindings.find((b) => b.kind === "table" && b.block === block)
      ?.block ??
    envelope.bindings.find((b) => b.kind === "table")?.block ??
    "";
  return (
    <>
      <details className="studio-section">
        <summary>
          {msg("Langue, en-tête, pied de page et nouvelles colonnes")}
        </summary>
        <ErrorNotice error={action.error} />
        <fieldset disabled={disabled}>
          <Field label={msg("Langue des dates et montants")}>
            <select
              value={envelope.locale}
              onChange={(e) =>
                onChange({
                  ...envelope,
                  locale: e.target.value as TemplateEnvelope["locale"],
                })
              }
            >
              <option value="fr-FR">{msg("Français")}</option>
              <option value="de-DE">{msg("Deutsch")}</option>
              <option value="en-GB">{msg("English")}</option>
            </select>
          </Field>
          {(envelope.definition.basePdf.staticSchema ?? [])
            .filter((b) => b.type === "text")
            .map((b) => (
              <Field
                key={b.name}
                label={
                  b.name === "header"
                    ? msg("En-tête répété")
                    : b.name === "footer"
                      ? msg("Pied de page répété")
                      : b.name
                }
                hint={msg(
                  "Compteurs disponibles : {currentPage} et {totalPages}.",
                )}
              >
                <input
                  value={b.content ?? ""}
                  maxLength={200}
                  onChange={(e) => {
                    const next = structuredClone(envelope);
                    next.definition.basePdf.staticSchema!.find(
                      (x) => x.name === b.name,
                    )!.content = e.target.value;
                    onChange(next);
                  }}
                />
              </Field>
            ))}
          {envelope.bindings.some((b) => b.kind === "table") && (
            <>
              <h3>{msg("Ajouter une colonne métier")}</h3>
              <p>
                {msg(
                  "La colonne crée un champ réutilisable dans les formulaires, l’API et les correspondances de fichiers. ",
                )}
              </p>
              <div className="studio-mapping-grid">
                <Field label={msg("Tableau cible")}>
                  <select
                    value={selectedTable}
                    onChange={(e) => setBlock(e.target.value)}
                  >
                    {envelope.bindings
                      .filter((b) => b.kind === "table")
                      .map((b) => (
                        <option key={b.block} value={b.block}>
                          {b.block} · {b.path}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={msg("Libellé de la nouvelle colonne")}>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field label={msg("Identifiant de la nouvelle colonne")}>
                  <input
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="tvaCentimes"
                  />
                </Field>
              </div>
              <Field label={msg("Format de la nouvelle colonne")}>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                >
                  <option value="text">{msg("Texte")}</option>
                  <option value="integer">{msg("Entier")}</option>
                  <option value="money">
                    {msg("Montant en centimes EUR")}
                  </option>
                </select>
              </Field>
              <button
                className="button small"
                type="button"
                disabled={!path || !title || action.pending}
                onClick={() =>
                  void action.run(async () => {
                    const next = applyTemplatePatch(envelope, {
                      op: "add_table_column",
                      block: selectedTable,
                      column: {
                        path,
                        title,
                        format,
                        required: false,
                        ...(format === "money" ? { currency: "EUR" } : {}),
                      },
                      field: {
                        type: format === "text" ? "string" : "integer",
                        title,
                      },
                    });
                    onChange(next);
                    setPath("");
                    setTitle("");
                  })
                }
              >
                {msg("Ajouter cette colonne ")}
              </button>
            </>
          )}
        </fieldset>
      </details>
      <AdvancedBindings
        envelope={envelope}
        onChange={onChange}
        disabled={disabled}
      />
      <BusinessRules
        envelope={envelope}
        onChange={onChange}
        disabled={disabled}
      />
    </>
  );
}
type SettingsProps = {
  envelope: TemplateEnvelope;
  onChange: (next: TemplateEnvelope) => void;
  disabled: boolean;
};
type NamedField = { path: string; schema: BusinessField };
function bindingFields(schema: BusinessField, prefix = ""): NamedField[] {
  return schema.type === "object"
    ? Object.entries(schema.properties ?? {}).flatMap(([name, child]) =>
        bindingFields(child, prefix ? `${prefix}.${name}` : name),
      )
    : [{ path: prefix, schema }];
}
function fieldAt(schema: BusinessField, path: string) {
  return path
    .split(".")
    .reduce<BusinessField | undefined>(
      (field, part) => field?.properties?.[part],
      schema,
    );
}
const formatNames: Record<TemplateBinding["format"], string> = {
  text: "Texte",
  integer: "Entier",
  decimal: "Décimal",
  date: "Date",
  money: "Montant en centimes",
};
function FormatControls({
  value,
  label,
  onChange,
}: {
  value: Pick<TemplateBinding, "format" | "currency">;
  label: string;
  onChange: (value: Pick<TemplateBinding, "format" | "currency">) => void;
}) {
  return (
    <div className="studio-mapping-grid">
      <Field label={msg("Format de {0}", label)}>
        <select
          value={value.format}
          onChange={(event) =>
            onChange({
              ...value,
              format: event.target.value as TemplateBinding["format"],
            })
          }
        >
          {Object.entries(formatNames).map(([key, title]) => (
            <option key={key} value={key}>
              {msg(title)}
            </option>
          ))}
        </select>
      </Field>
      {value.format === "money" && (
        <Field label={msg("Devise de {0}", label)}>
          <select
            value={value.currency ?? "EUR"}
            onChange={(event) =>
              onChange({
                ...value,
                currency: event.target.value as TemplateBinding["currency"],
              })
            }
          >
            {["EUR", "CHF", "GBP", "USD"].map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}
function ScalarValue({
  schema,
  value,
  onChange,
  label,
}: {
  schema: BusinessField;
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
}) {
  if (schema.type === "boolean")
    return (
      <Field label={label}>
        <select
          value={value === undefined ? "" : String(value)}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? undefined
                : event.target.value === "true",
            )
          }
        >
          <option value="">{msg("Choisir une valeur")}</option>
          <option value="true">{msg("Oui")}</option>
          <option value="false">{msg("Non")}</option>
        </select>
      </Field>
    );
  return (
    <BusinessDataForm
      schema={{ ...schema, title: label }}
      value={value}
      onChange={onChange}
    />
  );
}
function validateDeclaredValue(
  envelope: TemplateEnvelope,
  schema: BusinessField,
  value: unknown,
) {
  if (value === undefined)
    throw new Error(msg("Déclarez une valeur avant d’appliquer la règle."));
  const field = structuredClone(schema);
  // Reusing the server normalizer validates date, enum, precision, lengths and
  // nested values. The explicit default permits an intentionally empty string.
  field.default = value;
  return validateTemplateData(
    {
      ...envelope,
      inputSchema: {
        type: "object",
        properties: { value: field },
        required: ["value"],
      },
    },
    {},
  ).value;
}
function FieldChoices({ fields }: { fields: NamedField[] }) {
  return (
    <>
      {fields.map(({ path, schema }) => (
        <option key={path} value={path}>
          {schema.title ? `${schema.title} · ${path}` : path}
        </option>
      ))}
    </>
  );
}
function AdvancedBindings(props: SettingsProps) {
  const [selected, setSelected] = useState(
    props.envelope.bindings[0]?.block ?? "",
  );
  const binding =
    props.envelope.bindings.find((entry) => entry.block === selected) ??
    props.envelope.bindings[0];
  return (
    <details className="studio-section">
      <summary>{msg("Formats, calculs et conditions")}</summary>
      <p>
        {msg(
          "Choisissez la valeur affichée par un bloc, son format et ses règles. Les sommes et produits utilisent uniquement des entiers exacts ; les montants sont exprimés en centimes. ",
        )}
      </p>
      {binding ? (
        <>
          <Field label={msg("Bloc à configurer")}>
            <select
              disabled={props.disabled}
              value={binding.block}
              onChange={(event) => setSelected(event.target.value)}
            >
              {props.envelope.bindings.map((entry) => (
                <option key={entry.block} value={entry.block}>
                  {entry.block} · {entry.path}
                </option>
              ))}
            </select>
          </Field>
          <BindingRuleEditor
            key={JSON.stringify(binding)}
            {...props}
            binding={binding}
          />
        </>
      ) : (
        <p>
          {msg(
            "Ajoutez une variable métier au document pour configurer ses règles. ",
          )}
        </p>
      )}
    </details>
  );
}
function BindingRuleEditor({
  envelope,
  onChange,
  disabled,
  binding,
}: SettingsProps & { binding: TemplateBinding }) {
  const [draft, setDraft] = useState(structuredClone(binding));
  const [hasFallback, setHasFallback] = useState(binding.default !== undefined);
  const action = useAction();
  const fields = bindingFields(envelope.inputSchema),
    scalar = fields.filter((entry) => entry.schema.type !== "array");
  const arrays = fields.filter(
    (entry) =>
      entry.schema.type === "array" && entry.schema.items?.type === "object",
  );
  const source = fieldAt(envelope.inputSchema, draft.path);
  const itemFields = source?.items ? bindingFields(source.items) : [];
  const integers = itemFields.filter(
    (entry) => entry.schema.type === "integer",
  );
  const conditional = draft.when
    ? fieldAt(envelope.inputSchema, draft.when.path)
    : undefined;
  function update(patch: Partial<TemplateBinding>) {
    setDraft({ ...draft, ...patch });
  }
  function column(index: number, patch: Partial<TemplateColumn>) {
    update({
      columns: draft.columns!.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      ),
    });
  }
  return (
    <fieldset disabled={disabled || action.pending} className="business-object">
      <legend>
        {msg("Règles du bloc ")}
        {binding.block}
      </legend>
      <ErrorNotice error={action.error} />
      {binding.kind !== "table" && (
        <Field label={msg("Contenu du bloc")}>
          <select
            value={draft.kind}
            onChange={(event) => {
              const kind = event.target.value as "value" | "sum";
              const path = (kind === "sum" ? arrays : scalar)[0]?.path ?? "";
              update({
                kind,
                path,
                valuePath: undefined,
                multiplyBy: undefined,
                default: undefined,
              });
              setHasFallback(false);
            }}
          >
            <option value="value">{msg("Valeur d’un champ")}</option>
            <option value="sum">{msg("Total des lignes d’un tableau")}</option>
          </select>
        </Field>
      )}
      <Field label={msg("Source du bloc")}>
        <select
          value={draft.path}
          onChange={(event) =>
            update({
              path: event.target.value,
              ...(draft.kind === "sum"
                ? { valuePath: undefined, multiplyBy: undefined }
                : {}),
            })
          }
        >
          <option value="">{msg("Choisir un champ")}</option>
          <FieldChoices fields={draft.kind === "value" ? scalar : arrays} />
        </select>
      </Field>
      {draft.kind === "sum" && (
        <div className="studio-mapping-grid">
          <Field label={msg("Valeur à additionner")}>
            <select
              value={draft.valuePath ?? ""}
              onChange={(event) => update({ valuePath: event.target.value })}
            >
              <option value="">{msg("Choisir une valeur entière")}</option>
              <FieldChoices fields={integers} />
            </select>
          </Field>
          <Field label={msg("Multiplier chaque valeur par")}>
            <select
              value={draft.multiplyBy ?? ""}
              onChange={(event) =>
                update({ multiplyBy: event.target.value || undefined })
              }
            >
              <option value="">{msg("Aucun multiplicateur")}</option>
              <FieldChoices fields={integers} />
            </select>
          </Field>
        </div>
      )}
      {draft.kind !== "table" && (
        <>
          <FormatControls
            value={draft}
            label={msg("ce bloc")}
            onChange={update}
          />
          <div className="studio-mapping-grid">
            <Field label={msg("Texte avant la valeur")}>
              <input
                value={draft.prefix ?? ""}
                maxLength={200}
                onChange={(event) => update({ prefix: event.target.value })}
              />
            </Field>
            <Field label={msg("Texte après la valeur")}>
              <input
                value={draft.suffix ?? ""}
                maxLength={200}
                onChange={(event) => update({ suffix: event.target.value })}
              />
            </Field>
          </div>
        </>
      )}
      <label className="check-field">
        <input
          type="checkbox"
          checked={draft.required}
          onChange={(event) => update({ required: event.target.checked })}
        />
        {msg("Bloquer si la source du bloc est absente ")}
      </label>
      {draft.kind === "value" && source && (
        <>
          <label className="check-field">
            <input
              type="checkbox"
              checked={hasFallback}
              onChange={(event) => {
                setHasFallback(event.target.checked);
                if (!event.target.checked) update({ default: undefined });
              }}
            />
            {msg("Déclarer une valeur de remplacement pour ce bloc ")}
          </label>
          {hasFallback && (
            <ScalarValue
              schema={source}
              label={msg("Valeur de remplacement du bloc")}
              value={draft.default}
              onChange={(value) =>
                update({ default: value as TemplateBinding["default"] })
              }
            />
          )}
          <p className="field-hint">
            {msg(
              "La valeur de remplacement ne rend pas facultatif un champ métier obligatoire. Les règles métier ci-dessous s’appliquent avant le rendu. ",
            )}
          </p>
        </>
      )}
      {draft.kind === "table" &&
        draft.columns?.map((entry, index) => (
          <fieldset className="business-object" key={index}>
            <legend>
              {msg("Colonne ")}
              {index + 1} · {entry.title}
            </legend>
            <Field label={msg("Titre de la colonne {0}", index + 1)}>
              <input
                value={entry.title}
                maxLength={100}
                onChange={(event) =>
                  column(index, { title: event.target.value })
                }
              />
            </Field>
            <Field label={msg("Source de la colonne {0}", index + 1)}>
              <select
                value={entry.path}
                onChange={(event) =>
                  column(index, { path: event.target.value })
                }
              >
                <FieldChoices
                  fields={itemFields.filter(
                    (field) => field.schema.type !== "array",
                  )}
                />
              </select>
            </Field>
            <FormatControls
              value={entry}
              label={msg("la colonne {0}", index + 1)}
              onChange={(value) => column(index, value)}
            />
            <Field label={msg("Multiplier la colonne {0} par", index + 1)}>
              <select
                value={entry.multiplyBy ?? ""}
                onChange={(event) =>
                  column(index, { multiplyBy: event.target.value || undefined })
                }
              >
                <option value="">{msg("Aucun multiplicateur")}</option>
                <FieldChoices fields={integers} />
              </select>
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                checked={entry.required}
                onChange={(event) =>
                  column(index, { required: event.target.checked })
                }
              />
              {msg("Colonne ")}
              {index + 1} {msg("obligatoire ")}
            </label>
          </fieldset>
        ))}
      <Field label={msg("Afficher ce bloc")}>
        <select
          value={
            draft.when
              ? draft.when.equals === null
                ? "missing"
                : "equals"
              : "always"
          }
          onChange={(event) => {
            if (event.target.value === "always") update({ when: undefined });
            else {
              const path = draft.when?.path ?? scalar[0]?.path;
              if (!path)
                throw new Error(
                  msg(
                    "Ajoutez un champ métier avant de définir une condition.",
                  ),
                );
              const schema = fieldAt(envelope.inputSchema, path)!;
              update({
                when: {
                  path,
                  equals:
                    event.target.value === "missing"
                      ? null
                      : schema.type === "boolean"
                        ? false
                        : ["integer", "number"].includes(schema.type)
                          ? 0
                          : "",
                },
              });
            }
          }}
        >
          <option value="always">{msg("Toujours")}</option>
          <option value="equals" disabled={!scalar.length}>
            {msg("Quand un champ est égal à une valeur ")}
          </option>
          <option value="missing" disabled={!scalar.length}>
            {msg("Quand un champ est absent ")}
          </option>
        </select>
      </Field>
      {draft.when && (
        <>
          <Field label={msg("Champ de la condition")}>
            <select
              value={draft.when.path}
              onChange={(event) => {
                const schema = fieldAt(
                  envelope.inputSchema,
                  event.target.value,
                )!;
                update({
                  when: {
                    path: event.target.value,
                    equals:
                      draft.when!.equals === null
                        ? null
                        : schema.type === "boolean"
                          ? false
                          : ["integer", "number"].includes(schema.type)
                            ? 0
                            : "",
                  },
                });
              }}
            >
              <FieldChoices fields={scalar} />
            </select>
          </Field>
          {draft.when.equals !== null && conditional && (
            <ScalarValue
              schema={conditional}
              label={msg("Valeur attendue pour afficher le bloc")}
              value={draft.when.equals}
              onChange={(value) =>
                update({
                  when: {
                    ...draft.when!,
                    equals: value as string | number | boolean,
                  },
                })
              }
            />
          )}
          <p className="field-hint">
            {msg(
              "Une condition fausse masque le bloc complet. Une valeur absente n’est ni zéro ni « Non ». Un champ déclaré obligatoire doit toujours être renseigné. ",
            )}
          </p>
        </>
      )}
      <button
        className="button small"
        type="button"
        onClick={() =>
          void action.run(async () => {
            const next = structuredClone(envelope),
              candidate = structuredClone(draft);
            if (candidate.kind === "value" && hasFallback) {
              if (!source) throw new Error(msg("Choisissez un champ source."));
              candidate.default = validateDeclaredValue(
                envelope,
                source,
                candidate.default,
              ) as TemplateBinding["default"];
            } else delete candidate.default;
            if (candidate.when && candidate.when.equals !== null) {
              if (!conditional)
                throw new Error(msg("Choisissez le champ de la condition."));
              candidate.when.equals = validateDeclaredValue(
                envelope,
                conditional,
                candidate.when.equals,
              ) as string | number | boolean;
            }
            next.bindings = next.bindings.map((entry) =>
              entry.block === binding.block ? candidate : entry,
            );
            if (candidate.columns)
              next.definition.schemas
                .flat()
                .find((entry) => entry.name === binding.block)!.head =
                candidate.columns.map((entry) => entry.title);
            validateTemplateEnvelope(next);
            prepareTemplateRender(next, next.sampleData);
            onChange(next);
          })
        }
      >
        {msg("Appliquer les règles du bloc ")}
      </button>
    </fieldset>
  );
}

type BusinessRule = {
  path: string;
  parts: string[];
  schema: BusinessField;
  required: boolean;
};
function businessRules(
  schema: BusinessField,
  parts: string[] = [],
): BusinessRule[] {
  if (schema.type === "array" && schema.items)
    return businessRules(schema.items, [...parts, "[]"]);
  if (schema.type !== "object") return [];
  return Object.entries(schema.properties ?? {}).flatMap(([name, field]) => {
    const target = [...parts, name];
    return [
      {
        path: target.join(".").replaceAll(".[]", "[]"),
        parts: target,
        schema: field,
        required: schema.required?.includes(name) ?? false,
      },
      ...businessRules(field, target),
    ];
  });
}
function ruleAt(schema: BusinessField, parts: string[]) {
  return parts.reduce(
    (field, part) => (part === "[]" ? field.items! : field.properties![part]),
    schema,
  );
}
function BusinessRules(props: SettingsProps) {
  const rules = businessRules(props.envelope.inputSchema),
    [selected, setSelected] = useState("");
  const rule = rules.find((entry) => entry.path === selected) ?? rules[0];
  return (
    <details className="studio-section">
      <summary>{msg("Champs requis et valeurs par défaut")}</summary>
      <p>
        {msg(
          "Ces règles sont partagées par le formulaire, l’API et les générations. Une valeur par défaut s’applique uniquement lorsqu’un champ est absent ou vide. Aucune donnée d’exemple n’est modifiée. ",
        )}
      </p>
      {rule ? (
        <>
          <Field label={msg("Champ métier à configurer")}>
            <select
              disabled={props.disabled}
              value={rule.path}
              onChange={(event) => setSelected(event.target.value)}
            >
              {rules.map((entry) => (
                <option key={entry.path} value={entry.path}>
                  {entry.schema.title
                    ? `${entry.schema.title} · ${entry.path}`
                    : entry.path}
                </option>
              ))}
            </select>
          </Field>
          <BusinessRuleEditor
            key={JSON.stringify(rule)}
            {...props}
            rule={rule}
          />
        </>
      ) : (
        <p>{msg("Ajoutez d’abord des variables métier au modèle.")}</p>
      )}
    </details>
  );
}
function BusinessRuleEditor({
  envelope,
  disabled,
  onChange,
  rule,
}: SettingsProps & { rule: BusinessRule }) {
  const [required, setRequired] = useState(rule.required),
    [hasDefault, setHasDefault] = useState(rule.schema.default !== undefined);
  const [value, setValue] = useState<unknown>(
    structuredClone(rule.schema.default),
  );
  const action = useAction();
  return (
    <fieldset className="business-object" disabled={disabled || action.pending}>
      <legend>
        {msg("Règles de ")}
        {rule.schema.title ?? rule.path}
      </legend>
      <ErrorNotice error={action.error} />
      <label className="check-field">
        <input
          type="checkbox"
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
        />
        {msg("Champ métier obligatoire ")}
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={hasDefault}
          onChange={(event) => {
            setHasDefault(event.target.checked);
            if (event.target.checked && value === undefined)
              setValue(
                rule.schema.type === "object"
                  ? {}
                  : rule.schema.type === "array"
                    ? []
                    : rule.schema.type === "string"
                      ? ""
                      : undefined,
              );
          }}
        />
        {msg("Déclarer une valeur par défaut ")}
      </label>
      {hasDefault && (
        <ScalarValue
          schema={rule.schema}
          value={value}
          onChange={setValue}
          label={msg("Valeur par défaut déclarée")}
        />
      )}
      <button
        className="button small"
        type="button"
        onClick={() =>
          void action.run(async () => {
            const next = structuredClone(envelope),
              field = ruleAt(next.inputSchema, rule.parts),
              parent = ruleAt(next.inputSchema, rule.parts.slice(0, -1)),
              name = rule.parts.at(-1)!;
            const names = new Set(parent.required ?? []);
            if (required) names.add(name);
            else names.delete(name);
            parent.required = [...names];
            if (hasDefault)
              field.default = validateDeclaredValue(
                envelope,
                rule.schema,
                value,
              );
            else delete field.default;
            validateTemplateEnvelope(next);
            prepareTemplateRender(next, next.sampleData);
            onChange(next);
          })
        }
      >
        {msg("Appliquer les règles du champ ")}
      </button>
    </fieldset>
  );
}

export function TemplateAi({
  id,
  revision,
  disabled,
  onApply,
}: {
  id: string;
  revision: number;
  disabled: boolean;
  onApply: (next: TemplateEnvelope) => void;
}) {
  const aiPolicy = useStudioAiPolicy();
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<TemplateSuggestion>();
  const action = useAction();
  return (
    <details className="studio-section">
      <summary>{msg("Demander une modification à l’IA")}</summary>
      <p>
        {msg(
          "Un appel explicite à OpenAI transmet un aperçu borné du modèle et vos instructions. Il exige une configuration et une autorisation administrateur. La proposition reste à vérifier dans le studio. ",
        )}
      </p>
      <ErrorNotice error={action.error} />
      <StudioAiNotice available={aiPolicy.available} />
      <Field
        label={msg("Modification souhaitée")}
        hint={msg(
          "Enregistrez d’abord vos modifications. Évitez toute donnée personnelle dans l’instruction.",
        )}
      >
        <textarea
          rows={3}
          maxLength={2000}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={msg(
            "Déplace la signature plus bas et reformule le texte fixe de conclusion.",
          )}
        />
      </Field>
      <button
        type="button"
        className="button"
        disabled={
          disabled ||
          !aiPolicy.available ||
          !instruction.trim() ||
          action.pending
        }
        onClick={() =>
          void action.run(async () => {
            setProposal(undefined);
            setProposal(
              await api<TemplateSuggestion>(`/templates/${id}/suggest`, {
                method: "POST",
                body: { expectedRevision: revision, instruction },
              }),
            );
          })
        }
      >
        {msg("Obtenir une proposition ")}
      </button>
      {proposal && (
        <div role="status">
          <h3>{msg("Proposition à vérifier")}</h3>
          <p>
            {proposal.patches.length} {msg("modification(s) ")}
            {proposal.galleryId
              ? msg(", base proposée : {0}", proposal.galleryId)
              : ""}
            {msg(". Aucun brouillon enregistré. ")}
          </p>
          <ul>
            {proposal.patches.map((patch, index) => (
              <li key={index}>
                {msg(
                  {
                    set_text: "Modifier le texte",
                    move_block: "Déplacer le bloc",
                    remove_block: "Supprimer le bloc",
                    set_binding: "Modifier la liaison métier",
                    add_table_column: "Ajouter une colonne",
                  }[patch.op],
                )}{" "}
                · {"block" in patch ? patch.block : patch.binding.block}
                {patch.op === "set_text" ? ` : ${patch.text}` : ""}
                {patch.op === "move_block"
                  ? msg(" → X {0} mm, Y {1} mm", patch.x, patch.y)
                  : ""}
                {patch.op === "set_binding"
                  ? ` → ${patch.binding.path} (${patch.binding.kind}, ${patch.binding.format})`
                  : ""}
                {patch.op === "add_table_column"
                  ? ` → ${patch.column.title} : ${patch.column.path} (${patch.column.format})`
                  : ""}
                {patch.op === "set_binding" && (
                  <details>
                    <summary>{msg("Détails de la liaison proposée")}</summary>
                    <BindingSummary binding={patch.binding} />
                  </details>
                )}
              </li>
            ))}
            {proposal.warnings.map((warning, index) => (
              <li key={`w${index}`}>{warning}</li>
            ))}
          </ul>
          <button
            type="button"
            className="button primary"
            disabled={disabled}
            onClick={() => {
              onApply(proposal.envelope);
              setProposal(undefined);
            }}
          >
            {msg("Appliquer dans le brouillon local ")}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setProposal(undefined)}
          >
            {msg("Écarter ")}
          </button>
        </div>
      )}
    </details>
  );
}

function BindingSummary({ binding }: { binding: TemplateBinding }) {
  return (
    <>
      <p>
        {msg("Source : ")}
        {binding.path}.{" "}
        {binding.required ? msg("Obligatoire.") : msg("Facultative.")}{" "}
        {msg("Format :")} {msg(formatNames[binding.format])}
        {binding.format === "money" ? ` (${binding.currency ?? "EUR"})` : ""}.
      </p>
      {binding.kind === "sum" && (
        <p>
          {msg("Somme de ")}
          {binding.valuePath}
          {binding.multiplyBy
            ? msg(" × {0}, ligne par ligne", binding.multiplyBy)
            : ""}
          .
        </p>
      )}
      {binding.default !== undefined && (
        <p>
          {msg("Valeur de remplacement : ")}
          {String(binding.default)}.
        </p>
      )}
      {(binding.prefix || binding.suffix) && (
        <p>
          {msg("Texte avant : « ")}
          {binding.prefix ?? ""} {msg("». Texte après : «")}{" "}
          {binding.suffix ?? ""} ».
        </p>
      )}
      <p>
        {binding.when
          ? binding.when.equals === null
            ? msg("Visible si {0} est absent.", binding.when.path)
            : msg(
                "Visible si {0} vaut « {1} ».",
                binding.when.path,
                typeof binding.when.equals === "boolean"
                  ? binding.when.equals
                    ? msg("Oui")
                    : msg("Non")
                  : binding.when.equals,
              )
          : msg("Toujours visible.")}
      </p>
      {binding.columns && (
        <ul>
          {binding.columns.map((column, index) => (
            <li key={index}>
              {column.title} : {column.path}
              {column.multiplyBy ? ` × ${column.multiplyBy}` : ""} ·{" "}
              {msg(formatNames[column.format])}
              {column.format === "money"
                ? ` (${column.currency ?? "EUR"})`
                : ""}{" "}
              · {column.required ? "obligatoire" : "facultative"}.
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
