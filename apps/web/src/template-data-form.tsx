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

export function BusinessDataForm({
  schema,
  value,
  onChange,
  label = msg("Données du document"),
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
  const title = schema.title ?? label;
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
            ({items.length} {msg("lignes)")}
          </span>
        </legend>
        {items.map((item, index) => (
          <div className="business-row" key={index}>
            <BusinessDataForm
              schema={schema.items!}
              value={item}
              label={msg("Ligne {0}", index + 1)}
              disabled={disabled}
              onChange={(next) =>
                onChange(items.map((entry, i) => (i === index ? next : entry)))
              }
            />
            <button
              type="button"
              className="text-button"
              aria-label={msg(
                "Supprimer la ligne {0} de {1}",
                index + 1,
                title,
              )}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              {msg("Supprimer la ligne ")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button small"
          disabled={disabled || items.length >= 200}
          onClick={() => onChange([...items, initialData(schema.items!)])}
        >
          {msg("Ajouter une ligne ")}
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
                "La valeur par défaut déclarée s’applique si ce champ reste vide.",
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
          <option value="">{msg("Choisir…")}</option>
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
