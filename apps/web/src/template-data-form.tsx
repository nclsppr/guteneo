import { msg } from "./messages";
import { Field } from "./components";

/** The server remains authoritative; this form only edits business data. */
export type FormSchema = {
  type: string;
  title?: string;
  description?: string;
  format?: string;
  properties?: Record<string, FormSchema>;
  required?: string[];
  items?: FormSchema;
  enum?: unknown[];
  default?: unknown;
  maxLength?: number;
};

export function initialData(schema: FormSchema): unknown {
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (schema.type === "object")
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, child]) => [
        key,
        initialData(child),
      ]),
    );
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return false;
  if (["number", "integer"].includes(schema.type)) return undefined;
  return "";
}

function fieldWords(key: string) {
  const words = key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim();
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

export function BusinessDataForm({
  schema,
  value,
  onChange,
  label = msg("Document data"),
  required = false,
  disabled = false,
}: {
  schema: FormSchema;
  value: unknown;
  onChange: (next: unknown) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  // A field without a title shows its key as words, never a raw identifier.
  const title = schema.title ?? (label ? fieldWords(label) : label);
  const absent = value === undefined || value === null || value === "";
  const defaulted =
    absent && schema.default !== undefined ? schema.default : value;
  const mustEnter = required && schema.default === undefined;
  if (schema.type === "object") {
    const object =
      defaulted && typeof defaulted === "object" && !Array.isArray(defaulted)
        ? (defaulted as Record<string, unknown>)
        : {};
    return (
      <fieldset className="business-object" disabled={disabled}>
        <legend>{title}</legend>
        {schema.description && (
          <p className="field-hint">{schema.description}</p>
        )}
        <div className="business-fields">
          {Object.entries(schema.properties ?? {}).map(([key, child]) => (
            <BusinessDataForm
              key={key}
              schema={child}
              label={key}
              required={schema.required?.includes(key)}
              value={object[key]}
              disabled={disabled}
              onChange={(next) => onChange({ ...object, [key]: next })}
            />
          ))}
        </div>
      </fieldset>
    );
  }
  if (schema.type === "array" && schema.items) {
    const items = Array.isArray(defaulted) ? defaulted : [];
    return (
      <fieldset className="business-array" disabled={disabled}>
        <legend>
          {title}{" "}
          <span className="field-hint">
            ({items.length} {msg("rows)")}
          </span>
        </legend>
        {items.map((item, index) => (
          <div className="business-row" key={index}>
            <BusinessDataForm
              schema={schema.items!}
              value={item}
              label={msg("Row {0}", index + 1)}
              disabled={disabled}
              onChange={(next) =>
                onChange(items.map((entry, i) => (i === index ? next : entry)))
              }
            />
            <button
              type="button"
              className="text-button"
              aria-label={msg("Remove row {0} from {1}", index + 1, title)}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              {msg("Remove row ")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button small"
          disabled={disabled || items.length >= 200}
          onClick={() => onChange([...items, initialData(schema.items!)])}
        >
          {msg("Add a row ")}
        </button>
      </fieldset>
    );
  }
  if (schema.type === "boolean")
    return (
      <label className="check-field">
        <input
          type="checkbox"
          checked={defaulted === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        {title}
      </label>
    );
  const numeric = ["number", "integer"].includes(schema.type);
  return (
    <Field
      label={title + (required ? " *" : "")}
      hint={
        [
          schema.description,
          schema.default !== undefined
            ? msg(
                "The declared default value applies if this field is left empty.",
              )
            : undefined,
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      {schema.enum ? (
        <select
          value={value == null ? "" : String(value)}
          required={mustEnter}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              numeric
                ? event.target.value === ""
                  ? undefined
                  : Number(event.target.value)
                : event.target.value,
            )
          }
        >
          <option value="">{msg("Choose…")}</option>
          {schema.enum.map((entry) => (
            <option key={String(entry)} value={String(entry)}>
              {String(entry)}
            </option>
          ))}
        </select>
      ) : schema.type === "string" &&
        !schema.format &&
        (String(value ?? "").includes("\n") ||
          String(value ?? "").length > 120) ? (
        <textarea
          rows={6}
          value={String(value ?? "")}
          required={mustEnter}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          value={value == null ? "" : String(value)}
          required={mustEnter}
          disabled={disabled}
          type={schema.format === "date" ? "date" : numeric ? "number" : "text"}
          step={schema.type === "integer" ? "1" : numeric ? "any" : undefined}
          onChange={(event) =>
            onChange(
              numeric
                ? event.target.value === ""
                  ? undefined
                  : Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}
    </Field>
  );
}
