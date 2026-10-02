import {
  DATASET_LIMITS,
  type DatasetField,
  type DatasetProfile,
  type MappingPlan,
} from "../contracts/src/datasets";
import {
  prepareTemplateRender,
  validateTemplateData,
  validateTemplateEnvelope,
  type BusinessField,
  type TemplateBinding,
  type TemplateEnvelope,
} from "../contracts/src/templates";
import { blankTemplate, tableBlock, textBlock } from "../templates/gallery";
import {
  suggestMappingWithOpenAI,
  type AIProviderConfig,
  type MappingSuggestion,
} from "./ai";
import { DatasetError } from "./zip";

export type DatasetSchemaField = {
  path: string;
  source: string;
  sheet: string;
  type: DatasetField["type"];
  required: boolean;
  repeated: boolean;
};
export type DatasetSchemaSuggestion = MappingSuggestion & {
  schemaSuggestion: {
    inputSchema: BusinessField;
    envelope: TemplateEnvelope;
    fields: DatasetSchemaField[];
    warnings: string[];
  };
};
export interface DatasetSchemaSuggestionProvider {
  suggest(
    profile: DatasetProfile,
    instruction?: string,
  ): Promise<DatasetSchemaSuggestion>;
}
export const DATASET_SCHEMA_SUGGESTION_LIMITS = Object.freeze({
  scalarFields: 24,
  tables: 4,
  tableColumns: 10,
});

const objectSchema = (): BusinessField => ({
  type: "object",
  properties: {},
  required: [],
});
function addField(
  root: BusinessField,
  path: string,
  field: BusinessField,
  required: boolean,
) {
  const names = path.split(".");
  if (
    names.length > 6 ||
    names.some(
      (name) =>
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ||
        ["constructor", "prototype", "__proto__"].includes(name),
    )
  )
    throw new DatasetError(
      "AI_INVALID_SCHEMA",
      "La proposition contient un chemin incompatible avec le schéma métier.",
    );
  let parent = root;
  for (const [index, name] of names.entries()) {
    if (parent.type !== "object" || !parent.properties)
      throw new DatasetError(
        "AI_INVALID_SCHEMA",
        "Les champs du schéma se chevauchent.",
      );
    if (required && !parent.required!.includes(name))
      parent.required!.push(name);
    if (index === names.length - 1) {
      if (Object.hasOwn(parent.properties, name))
        throw new DatasetError(
          "AI_INVALID_SCHEMA",
          "Un champ métier est proposé plusieurs fois.",
        );
      parent.properties[name] = field;
    } else {
      parent.properties[name] ??= objectSchema();
      parent = parent.properties[name];
    }
  }
}
function primitive(field: DatasetField): BusinessField {
  const type =
    field.type === "integer" || field.type === "minor"
      ? "integer"
      : field.type === "boolean"
        ? "boolean"
        : "string";
  return {
    type,
    title: field.source.slice(0, 100),
    ...(field.type === "date" ? { format: "date" as const } : {}),
    ...(type === "string" ? { maxLength: DATASET_LIMITS.cellCharacters } : {}),
  };
}
function sample(schema: BusinessField): unknown {
  if (schema.type === "object")
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([name, field]) => [
        name,
        sample(field),
      ]),
    );
  if (schema.type === "array") return [sample(schema.items!)];
  if (schema.type === "integer") return 1;
  if (schema.type === "boolean") return true;
  if (schema.format === "date") return "2026-01-01";
  return "Exemple";
}
const bindingFormat = (
  type: DatasetField["type"],
): TemplateBinding["format"] =>
  type === "decimal"
    ? "decimal"
    : type === "date"
      ? "date"
      : ["integer", "minor"].includes(type)
        ? "integer"
        : "text";
function setSample(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const names = path.split(".");
  let parent = root;
  for (const name of names.slice(0, -1))
    parent = parent[name] as Record<string, unknown>;
  parent[names.at(-1)!] = value;
}

type Scalar = { field: DatasetField; path: string; sheet: string };
type Table = { path: string; fields: DatasetField[]; sheet: string };
function shape(mapping: MappingPlan) {
  const scalar: Scalar[] = mapping.fields.map((field) => ({
    field,
    path: field.target,
    sheet: mapping.sourceSheet,
  }));
  const tables: Table[] = [];
  if (mapping.group)
    tables.push({
      path: mapping.group.itemPath,
      fields: mapping.group.fields,
      sheet: mapping.sourceSheet,
    });
  for (const join of mapping.joins) {
    if (join.cardinality === "one-to-many")
      tables.push({
        path: join.target,
        fields: join.fields,
        sheet: join.sheet,
      });
    else
      scalar.push(
        ...join.fields.map((field) => ({
          field,
          path: `${join.target}.${field.target}`,
          sheet: join.sheet,
        })),
      );
  }
  if (
    scalar.length > DATASET_SCHEMA_SUGGESTION_LIMITS.scalarFields ||
    tables.length > DATASET_SCHEMA_SUGGESTION_LIMITS.tables ||
    tables.some(
      (table) =>
        !table.fields.length ||
        table.fields.length > DATASET_SCHEMA_SUGGESTION_LIMITS.tableColumns,
    )
  )
    throw new DatasetError(
      "AI_SCHEMA_LIMIT",
      "La création assistée est limitée à 24 champs simples et 4 tableaux de 10 colonnes. Réduisez les champs demandés ou utilisez le mapping manuel.",
    );
  return { scalar, tables };
}

/** AI selects semantic paths/types; the server constructs a schema of their exact
 * normalized values. There is no arbitrary provider-supplied schema, code or asset.
 * This returns a reviewable candidate only, with no write or publication ability. */
export async function suggestDatasetSchemaWithOpenAI(
  profile: DatasetProfile,
  config: AIProviderConfig,
  instruction?: string,
): Promise<DatasetSchemaSuggestion> {
  const suggestion = await suggestMappingWithOpenAI(
    profile,
    config,
    instruction ??
      "Propose les chemins et types d’un nouveau schéma métier pour un document par client. Conserve les identifiants en texte et les montants en unités mineures explicites. Au plus 24 champs simples et 4 tableaux de 10 colonnes. N’invente pas de données ni de destinataires.",
  );
  const { scalar, tables } = shape(suggestion.mapping);
  const schema = objectSchema();
  const fields: DatasetSchemaField[] = [];
  const envelope = blankTemplate();
  envelope.name = suggestion.mapping.name.slice(0, 160);
  envelope.description =
    "Brouillon issu d’une proposition de structure. Données d’exemple entièrement synthétiques ; champs, mise en page et correspondance à vérifier avant publication.";
  envelope.definition.schemas = [[]];
  envelope.bindings = [];
  const warnings = [
    "Proposition à relire : aucun modèle ou mapping n’est encore enregistré et aucune publication ni génération n’a eu lieu.",
    "La mise en page initiale est déterministe ; relisez les libellés, les types et les tableaux dans l’éditeur.",
  ];
  for (const [index, entry] of scalar.entries()) {
    addField(
      schema,
      entry.path,
      primitive(entry.field),
      entry.field.required ?? false,
    );
    const block = `field${index + 1}`;
    envelope.definition.schemas[0].push(
      textBlock(block, "Exemple", 20, 32 + index * 9, 170, 8, 10),
    );
    envelope.bindings.push({
      block,
      kind: "value",
      path: entry.path,
      format: bindingFormat(entry.field.type),
      required: entry.field.required ?? false,
      prefix: `${entry.field.source.slice(0, 60)} : `,
    });
    fields.push({
      path: entry.path,
      source: entry.field.source,
      sheet: entry.sheet,
      type: entry.field.type,
      required: entry.field.required ?? false,
      repeated: false,
    });
  }
  for (const [index, table] of tables.entries()) {
    const items = objectSchema();
    for (const field of table.fields) {
      addField(items, field.target, primitive(field), field.required ?? false);
      fields.push({
        path: `${table.path}[].${field.target}`,
        source: field.source,
        sheet: table.sheet,
        type: field.type,
        required: field.required ?? false,
        repeated: true,
      });
    }
    addField(
      schema,
      table.path,
      { type: "array", title: table.path.slice(0, 100), items, maxItems: 500 },
      true,
    );
    const block = `table${index + 1}`;
    // One table per page keeps variable-height repeated data away from scalar blocks.
    envelope.definition.schemas.push([
      tableBlock(
        block,
        table.fields.map((field) => field.source.slice(0, 60)),
        32,
      ),
    ]);
    envelope.bindings.push({
      block,
      kind: "table",
      path: table.path,
      format: "text",
      required: true,
      columns: table.fields.map((field) => ({
        title: field.source.slice(0, 60),
        path: field.target,
        format: bindingFormat(field.type),
        required: field.required ?? false,
      })),
    });
  }
  envelope.inputSchema = schema;
  envelope.sampleData = sample(schema) as Record<string, unknown>;
  // Exact decimal samples must be strings too; no source value is copied.
  for (const entry of scalar)
    if (entry.field.type === "decimal")
      setSample(envelope.sampleData, entry.path, "12.34");
  for (const table of tables) {
    let rows: unknown = envelope.sampleData;
    for (const name of table.path.split("."))
      rows = (rows as Record<string, unknown>)[name];
    for (const field of table.fields)
      if (field.type === "decimal")
        setSample(
          (rows as Record<string, unknown>[])[0],
          field.target,
          "12.34",
        );
  }
  if (fields.some((field) => field.type === "minor"))
    warnings.push(
      "Les montants sont affichés en unités mineures entières. Choisissez explicitement leur devise et leur présentation dans l’éditeur.",
    );
  let validated: TemplateEnvelope;
  try {
    validated = validateTemplateEnvelope(envelope);
    validateTemplateData(validated, validated.sampleData);
    prepareTemplateRender(validated, validated.sampleData);
  } catch {
    throw new DatasetError(
      "AI_INVALID_SCHEMA",
      "La structure proposée ne forme pas un modèle métier valide. Précisez les champs souhaités ou utilisez la création manuelle.",
    );
  }
  const issues = [...suggestion.validation.issues];
  for (const record of suggestion.validation.records) {
    try {
      validateTemplateData(validated, record.data);
    } catch {
      const issue = {
        code: "AI_SCHEMA_DATA_MISMATCH",
        severity: "error" as const,
        message: `Les données de ${record.recordId} ne respectent pas le schéma proposé ; corrigez la correspondance avant génération.`,
      };
      if (issues.length < DATASET_LIMITS.issues) issues.push(issue);
      else issues[issues.length - 1] = issue;
    }
  }
  return {
    ...suggestion,
    status: "needs_review",
    validation: {
      ...suggestion.validation,
      issues,
      status: issues.some((issue) => issue.severity === "error")
        ? "needs_review"
        : suggestion.validation.status,
    },
    schemaSuggestion: {
      inputSchema: validated.inputSchema,
      envelope: validated,
      fields,
      warnings,
    },
  };
}
export class OpenAIDatasetSchemaProvider implements DatasetSchemaSuggestionProvider {
  constructor(private readonly config: AIProviderConfig) {}
  suggest(profile: DatasetProfile, instruction?: string) {
    return suggestDatasetSchemaWithOpenAI(profile, this.config, instruction);
  }
}
