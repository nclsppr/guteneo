import { msg, msgIn } from "./messages";
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
        <summary>{msg("Language, header, footer and new columns")}</summary>
        <ErrorNotice error={action.error} />
        <fieldset disabled={disabled}>
          <Field label={msg("Language for dates and amounts")}>
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
                    ? msg("Repeating header")
                    : b.name === "footer"
                      ? msg("Repeating footer")
                      : b.name
                }
                hint={msg(
                  "Available counters: {currentPage} and {totalPages}.",
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
              <h3>{msg("Add a data column")}</h3>
              <p>
                {msg(
                  "The column creates a field you can reuse in forms, the API and file mappings. ",
                )}
              </p>
              <div className="studio-mapping-grid">
                <Field label={msg("Target table")}>
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
                <Field label={msg("New column label")}>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field label={msg("New column identifier")}>
                  <input
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="tvaCentimes"
                  />
                </Field>
              </div>
              <Field label={msg("New column format")}>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                >
                  <option value="text">{msg("Text")}</option>
                  <option value="integer">{msg("Integer")}</option>
                  <option value="money">{msg("Amount in euro cents")}</option>
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
                {msg("Add this column ")}
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
  text: "Text",
  integer: "Integer",
  decimal: "Decimal",
  date: "Date",
  money: "Amount in cents",
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
      <Field label={msg("Format for {0}", label)}>
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
        <Field label={msg("Currency for {0}", label)}>
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
          <option value="">{msg("Choose a value")}</option>
          <option value="true">{msg("Yes")}</option>
          <option value="false">{msg("No")}</option>
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
    throw new Error(msg("Enter a value before applying the rule."));
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
      <summary>{msg("Formats, calculations and conditions")}</summary>
      <p>
        {msg(
          "Choose the value a block displays, its format and its rules. Sums and products use exact integers only; amounts are expressed in cents. ",
        )}
      </p>
      {binding ? (
        <>
          <Field label={msg("Block to configure")}>
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
          {msg("Add a data variable to the document to configure its rules. ")}
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
        {msg("Block rules ")}
        {binding.block}
      </legend>
      <ErrorNotice error={action.error} />
      {binding.kind !== "table" && (
        <Field label={msg("Block content")}>
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
            <option value="value">{msg("Field value")}</option>
            <option value="sum">{msg("Sum of table rows")}</option>
          </select>
        </Field>
      )}
      <Field label={msg("Block source")}>
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
          <option value="">{msg("Choose a field")}</option>
          <FieldChoices fields={draft.kind === "value" ? scalar : arrays} />
        </select>
      </Field>
      {draft.kind === "sum" && (
        <div className="studio-mapping-grid">
          <Field label={msg("Value to sum")}>
            <select
              value={draft.valuePath ?? ""}
              onChange={(event) => update({ valuePath: event.target.value })}
            >
              <option value="">{msg("Choose an integer value")}</option>
              <FieldChoices fields={integers} />
            </select>
          </Field>
          <Field label={msg("Multiply each value by")}>
            <select
              value={draft.multiplyBy ?? ""}
              onChange={(event) =>
                update({ multiplyBy: event.target.value || undefined })
              }
            >
              <option value="">{msg("No multiplier")}</option>
              <FieldChoices fields={integers} />
            </select>
          </Field>
        </div>
      )}
      {draft.kind !== "table" && (
        <>
          <FormatControls
            value={draft}
            label={msg("this block")}
            onChange={update}
          />
          <div className="studio-mapping-grid">
            <Field label={msg("Text before the value")}>
              <input
                value={draft.prefix ?? ""}
                maxLength={200}
                onChange={(event) => update({ prefix: event.target.value })}
              />
            </Field>
            <Field label={msg("Text after the value")}>
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
        {msg("Block if the block’s source is missing ")}
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
            {msg("Set a fallback value for this block ")}
          </label>
          {hasFallback && (
            <ScalarValue
              schema={source}
              label={msg("Block fallback value")}
              value={draft.default}
              onChange={(value) =>
                update({ default: value as TemplateBinding["default"] })
              }
            />
          )}
          <p className="field-hint">
            {msg(
              "A fallback value does not make a required data field optional. The data rules below apply before rendering. ",
            )}
          </p>
        </>
      )}
      {draft.kind === "table" &&
        draft.columns?.map((entry, index) => (
          <fieldset className="business-object" key={index}>
            <legend>
              {msg("Column ")}
              {index + 1} · {entry.title}
            </legend>
            <Field
              label={msgIn("table-settings", "Column {0} title", index + 1)}
            >
              <input
                value={entry.title}
                maxLength={100}
                onChange={(event) =>
                  column(index, { title: event.target.value })
                }
              />
            </Field>
            <Field label={msg("Column {0} source", index + 1)}>
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
              label={msg("column {0}", index + 1)}
              onChange={(value) => column(index, value)}
            />
            <Field label={msg("Multiply column {0} by", index + 1)}>
              <select
                value={entry.multiplyBy ?? ""}
                onChange={(event) =>
                  column(index, { multiplyBy: event.target.value || undefined })
                }
              >
                <option value="">{msg("No multiplier")}</option>
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
              {msg("Column ")}
              {index + 1} {msg("required ")}
            </label>
          </fieldset>
        ))}
      <Field label={msg("Show this block")}>
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
                  msg("Add a data field before defining a condition."),
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
          <option value="always">{msg("Always")}</option>
          <option value="equals" disabled={!scalar.length}>
            {msg("When a field equals a value ")}
          </option>
          <option value="missing" disabled={!scalar.length}>
            {msg("When a field is missing ")}
          </option>
        </select>
      </Field>
      {draft.when && (
        <>
          <Field label={msg("Condition field")}>
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
              label={msg("Value required to show the block")}
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
              "A false condition hides the entire block. A missing value is neither zero nor “No”. A required field must always be filled in. ",
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
              if (!source) throw new Error(msg("Choose a source field."));
              candidate.default = validateDeclaredValue(
                envelope,
                source,
                candidate.default,
              ) as TemplateBinding["default"];
            } else delete candidate.default;
            if (candidate.when && candidate.when.equals !== null) {
              if (!conditional)
                throw new Error(msg("Choose the condition field."));
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
        {msg("Apply block rules ")}
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
      <summary>{msg("Required fields and default values")}</summary>
      <p>
        {msg(
          "These rules apply to the form, the API and document generation. A default value applies only when a field is missing or empty. Example data remains unchanged. ",
        )}
      </p>
      {rule ? (
        <>
          <Field label={msg("Data field to configure")}>
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
        <p>{msg("Add data variables to the template first.")}</p>
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
        {msg("Rules for ")}
        {rule.schema.title ?? rule.path}
      </legend>
      <ErrorNotice error={action.error} />
      <label className="check-field">
        <input
          type="checkbox"
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
        />
        {msg("Required data field ")}
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
        {msg("Set a default value ")}
      </label>
      {hasDefault && (
        <ScalarValue
          schema={rule.schema}
          value={value}
          onChange={setValue}
          label={msg("Declared default value")}
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
        {msg("Apply field rules ")}
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
      <summary>{msg("Ask AI for a change")}</summary>
      <p>
        {msg(
          "An explicit OpenAI request sends a limited preview of the template and your instructions. It requires configuration and administrator authorization. Review the proposal in the studio. ",
        )}
      </p>
      <ErrorNotice error={action.error} />
      <StudioAiNotice available={aiPolicy.available} />
      <Field
        label={msg("Requested change")}
        hint={msg(
          "Save your changes first. Do not include personal data in the instruction.",
        )}
      >
        <textarea
          rows={3}
          maxLength={2000}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={msg(
            "Move the signature down and rephrase the fixed closing text.",
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
        {msg("Get a proposal ")}
      </button>
      {proposal && (
        <div role="status">
          <h3>{msg("Proposal to review")}</h3>
          <p>
            {proposal.patches.length} {msg("change(s) ")}
            {proposal.galleryId
              ? msg(", proposed base: {0}", proposal.galleryId)
              : ""}
            {msg(". No draft saved. ")}
          </p>
          <ul>
            {proposal.patches.map((patch, index) => (
              <li key={index}>
                {msg(
                  {
                    set_text: "Edit text",
                    move_block: "Move block",
                    remove_block: "Remove block",
                    set_binding: "Edit business binding",
                    add_table_column: "Add column",
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
                    <summary>{msg("Proposed binding details")}</summary>
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
            {msg("Apply to the local draft ")}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setProposal(undefined)}
          >
            {msg("Discard ")}
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
        {msg("Source: ")}
        {binding.path}. {binding.required ? msg("Required.") : msg("Optional.")}{" "}
        {msg("Format:")} {msg(formatNames[binding.format])}
        {binding.format === "money" ? ` (${binding.currency ?? "EUR"})` : ""}.
      </p>
      {binding.kind === "sum" && (
        <p>
          {msg("Sum of ")}
          {binding.valuePath}
          {binding.multiplyBy
            ? msg(" × {0}, row by row", binding.multiplyBy)
            : ""}
          .
        </p>
      )}
      {binding.default !== undefined && (
        <p>
          {msg("Fallback value: ")}
          {String(binding.default)}.
        </p>
      )}
      {(binding.prefix || binding.suffix) && (
        <p>
          {msg("Text before: “ ")}
          {binding.prefix ?? ""} {msg("”. Text after: “")}{" "}
          {binding.suffix ?? ""} ».
        </p>
      )}
      <p>
        {binding.when
          ? binding.when.equals === null
            ? msg("Visible when {0} is missing.", binding.when.path)
            : msg(
                "Visible when {0} equals “{1}”.",
                binding.when.path,
                typeof binding.when.equals === "boolean"
                  ? binding.when.equals
                    ? msg("Yes")
                    : msg("No")
                  : binding.when.equals,
              )
          : msg("Always visible.")}
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
              · {column.required ? "required" : "facultative"}.
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
