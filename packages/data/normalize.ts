import {
  DATASET_LIMITS,
  MappingPlanSchema,
  type DatasetProfile,
  type DatasetField,
  type DatasetIssue,
  type MappingPlan,
  type MappingValidation,
  type NormalizedRecord,
  type ProfileCell,
  type ProfileSheet,
  type SourceCell,
} from "../contracts/src/datasets";
import { DatasetError } from "./zip";

type Row = ProfileSheet["rows"][number];
type Table = { sheet: ProfileSheet; headers: Map<string, number>; rows: Row[] };
function decimal(value: string, separator: "." | "," | undefined): string {
  const text = value.trim();
  if (text.includes(",") && !separator)
    throw new DatasetError(
      "DECIMAL_CONVENTION_REQUIRED",
      "Choisissez le séparateur décimal ; aucun séparateur de milliers n’est deviné.",
    );
  const normalized = separator === "," ? text.replace(",", ".") : text;
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized) || normalized.length > 100)
    throw new DatasetError(
      "INVALID_DECIMAL",
      "Nombre décimal invalide, groupement ou exposant non autorisé.",
    );
  const [whole, fraction] = normalized.replace(/^\+/, "").split(".");
  return (
    (whole.startsWith("-") && BigInt(whole) === 0n
      ? "-0"
      : BigInt(whole).toString()) +
    (fraction === undefined ? "" : `.${fraction}`)
  );
}
function date(value: string, order?: DatasetField["dateOrder"]): string {
  const text = value.trim();
  let year: number, month: number, day: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text))
    [year, month, day] = text.split("-").map(Number);
  else {
    if (!order)
      throw new DatasetError(
        "DATE_ORDER_REQUIRED",
        "Sélectionnez un ordre de date explicite.",
      );
    const parts = text.split(/[/.\-]/);
    if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p)))
      throw new DatasetError("INVALID_DATE", "Date invalide.");
    const values = parts.map(Number);
    if (order === "YMD") [year, month, day] = values;
    else if (order === "DMY") [day, month, year] = values;
    else [month, day, year] = values;
  }
  if (
    year < 1000 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
    throw new DatasetError("INVALID_DATE", "Date de calendrier invalide.");
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function normalizeCell(
  cell: ProfileCell | undefined,
  field: DatasetField,
  formulaPolicy: MappingPlan["formulaPolicy"],
): string | number | boolean | null {
  if (
    cell?.formula !== undefined &&
    (formulaPolicy !== "cached" || !cell.cached)
  )
    throw new DatasetError(
      cell.cached ? "FORMULA_REQUIRES_REVIEW" : "FORMULA_NO_CACHE",
      "Validez explicitement le résultat en cache ou fournissez une valeur sans formule.",
    );
  if (cell?.kind === "error")
    throw new DatasetError(
      "CELL_ERROR",
      "La cellule source contient une erreur.",
    );
  let raw = cell?.raw;
  if (raw === undefined || raw === null || raw.trim() === "") {
    if (field.defaultValue !== undefined) raw = String(field.defaultValue);
    else if (field.required)
      throw new DatasetError("REQUIRED_VALUE", "Valeur obligatoire absente.");
    else return null;
  }
  if (field.type === "text") return raw;
  if (field.type === "date") return date(raw, field.dateOrder);
  if (field.type === "boolean") {
    if (["true", "1"].includes(raw.trim().toLowerCase())) return true;
    if (["false", "0"].includes(raw.trim().toLowerCase())) return false;
    throw new DatasetError(
      "INVALID_BOOLEAN",
      "Valeur booléenne attendue : true, false, 1 ou 0.",
    );
  }
  const value = decimal(raw, field.decimalSeparator);
  if (field.type === "decimal") return value;
  let exact: bigint;
  if (field.type === "integer") {
    if (value.includes("."))
      throw new DatasetError(
        "INTEGER_REQUIRED",
        "Un entier exact est attendu.",
      );
    exact = BigInt(value);
  } else {
    const scale = field.scale ?? 2;
    const [whole, fraction = ""] = value.split(".");
    if (fraction.length > scale)
      throw new DatasetError(
        "PRECISION_LOSS",
        "La précision dépasse l’échelle déclarée ; aucun arrondi implicite.",
      );
    const negative = raw.trim().startsWith("-");
    exact =
      (BigInt(whole.replace("-", "")) * 10n ** BigInt(scale) +
        BigInt(fraction.padEnd(scale, "0") || "0")) *
      (negative ? -1n : 1n);
  }
  if (
    exact > BigInt(Number.MAX_SAFE_INTEGER) ||
    exact < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new DatasetError(
      "INTEGER_PRECISION_LIMIT",
      "Entier hors de la précision sûre ; utiliser un champ décimal textuel.",
    );
  return Number(exact);
}
function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part]) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = value;
}
function pathsConflict(paths: string[]) {
  return paths.some((path, index) =>
    paths.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        (path === other || path.startsWith(`${other}.`)),
    ),
  );
}

/** Pure, bounded normalization. This is validation evidence, never human approval or a provider operation. */
export function validateMapping(
  profile: DatasetProfile,
  input: unknown,
): MappingValidation {
  const parsed = MappingPlanSchema.safeParse(input);
  if (!parsed.success)
    throw new DatasetError(
      "INVALID_MAPPING",
      "Mapping invalide : champs, types ou limites non conformes.",
    );
  const mapping = parsed.data;
  const result: MappingValidation = {
    status: "needs_review",
    issues: [],
    documentCount: 0,
    records: [],
    excludedRows: [],
  };
  let issueOverflow = false;
  const issue = (
    code: string,
    message: string,
    source?: SourceCell,
    target?: string,
    severity: DatasetIssue["severity"] = "error",
  ) => {
    if (result.issues.length < DATASET_LIMITS.issues)
      result.issues.push({
        code,
        severity,
        message,
        ...(source ? { source } : {}),
        ...(target ? { target } : {}),
      });
    else issueOverflow = true;
  };
  const source = (sheet: ProfileSheet, row: Row, column = 1): SourceCell => ({
    sheet: sheet.name,
    row: row.rowNumber,
    column,
    address:
      row.cells.find((cell) => cell.column === column)?.address ??
      `?${row.rowNumber}`,
  });
  const getTable = (
    name: string,
    headerRow: number,
    expected: string[] | undefined,
    excludes: number[],
  ): Table | undefined => {
    const sheet = profile.sheets.find((candidate) => candidate.name === name);
    if (!sheet) {
      issue("MISSING_SHEET", "Feuille source absente.");
      return;
    }
    if (sheet.hidden && !mapping.includeHidden) {
      issue(
        "HIDDEN_SHEET_REVIEW",
        "La feuille source est masquée : validez explicitement son inclusion.",
      );
      return;
    }
    const header = sheet.rows.find((row) => row.rowNumber === headerRow);
    if (!header) {
      issue("MISSING_HEADER", "Ligne d’en-tête absente.");
      return;
    }
    const headers = new Map<string, number>();
    for (const cell of header.cells) {
      const label = cell.raw?.trim();
      if (!label) continue;
      if (cell.formula !== undefined)
        issue(
          "FORMULA_HEADER",
          "Une formule ne peut pas définir un en-tête.",
          source(sheet, header, cell.column),
        );
      if (headers.has(label))
        issue(
          "DUPLICATE_HEADER",
          "En-tête dupliqué : source ambiguë.",
          source(sheet, header, cell.column),
        );
      headers.set(label, cell.column);
    }
    if (
      expected &&
      JSON.stringify([...headers.keys()].sort()) !==
        JSON.stringify([...expected].sort())
    )
      issue(
        "STRUCTURE_CHANGED",
        "Les colonnes ont changé ; validez une nouvelle version du mapping.",
      );
    const rows = sheet.rows.filter((row) => {
      if (
        row.rowNumber <= headerRow ||
        !row.cells.some(
          (cell) =>
            (cell.raw !== null && cell.raw !== "") ||
            cell.formula !== undefined,
        )
      )
        return false;
      if (
        excludes.includes(row.rowNumber) ||
        (row.hidden && !mapping.includeHidden)
      ) {
        result.excludedRows.push(source(sheet, row));
        return false;
      }
      return true;
    });
    return { sheet, headers, rows };
  };
  const getCell = (table: Table, row: Row, name: string) =>
    row.cells.find((cell) => cell.column === table.headers.get(name));
  const keyCell = (
    table: Table,
    row: Row,
    name: string,
  ): string | undefined => {
    try {
      return String(
        normalizeCell(
          getCell(table, row, name),
          { source: name, target: "key", type: "text", required: true },
          mapping.formulaPolicy,
        ),
      );
    } catch (error) {
      issue(
        error instanceof DatasetError ? error.code : "INVALID_KEY",
        "Clé absente ou non exploitable.",
        source(table.sheet, row, table.headers.get(name) ?? 1),
      );
      return;
    }
  };
  const checkFields = (table: Table, fields: DatasetField[]) => {
    if (pathsConflict(fields.map((field) => field.target)))
      issue("CONFLICTING_TARGETS", "Des champs de destination se chevauchent.");
    for (const field of fields)
      if (!table.headers.has(field.source))
        issue(
          "MISSING_COLUMN",
          "Colonne source absente.",
          undefined,
          field.target,
        );
  };
  const mapFields = (
    table: Table,
    row: Row,
    fields: DatasetField[],
    record: NormalizedRecord,
    prefix = "",
  ) => {
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      const cell = getCell(table, row, field.source),
        ref = source(table.sheet, row, table.headers.get(field.source) ?? 1),
        target = `${prefix}${field.target}`;
      try {
        setPath(
          data,
          field.target,
          normalizeCell(cell, field, mapping.formulaPolicy),
        );
        (record.provenance[target] ??= []).push(ref);
      } catch (error) {
        issue(
          error instanceof DatasetError ? error.code : "INVALID_VALUE",
          error instanceof DatasetError
            ? error.message
            : "Valeur source invalide.",
          ref,
          target,
        );
      }
    }
    return data;
  };
  const table = getTable(
    mapping.sourceSheet,
    mapping.headerRow,
    mapping.expectedHeaders,
    mapping.excludeRows,
  );
  if (!table) return result;
  checkFields(table, mapping.fields);
  const topPaths = [
    ...mapping.fields.map((field) => field.target),
    ...(mapping.group ? [mapping.group.itemPath] : []),
    ...mapping.joins.map((join) => join.target),
  ];
  if (pathsConflict(topPaths))
    issue(
      "CONFLICTING_TARGETS",
      "Les champs, tableaux ou jointures de destination se chevauchent.",
    );
  if (mapping.group && !mapping.recordKey.length)
    issue("GROUP_KEY_REQUIRED", "Un regroupement exige une clé explicite.");
  if (mapping.group) checkFields(table, mapping.group.fields);
  for (const key of mapping.recordKey)
    if (!table.headers.has(key))
      issue("MISSING_KEY_COLUMN", "Colonne de clé absente.");
  // Reject path/schema errors before setting any property on an output object.
  if (result.issues.some((entry) => entry.severity === "error")) return result;
  const groups = new Map<
    string,
    { record: NormalizedRecord; rows: Row[]; items: Record<string, unknown>[] }
  >();
  for (const row of table.rows) {
    const keyValues = mapping.recordKey.map((key) => keyCell(table, row, key));
    if (keyValues.some((value) => !value?.trim())) {
      issue(
        "EMPTY_RECORD_KEY",
        "Clé de document absente.",
        source(table.sheet, row),
      );
      continue;
    }
    const key = mapping.recordKey.length
      ? JSON.stringify(keyValues)
      : String(row.rowNumber);
    let group = groups.get(key);
    if (group && !mapping.group) {
      issue(
        "DUPLICATE_RECORD_KEY",
        "Clé de document dupliquée ; définissez un regroupement explicite.",
        source(table.sheet, row),
      );
      continue;
    }
    if (!group) {
      if (groups.size >= DATASET_LIMITS.documents) {
        issue("DOCUMENT_LIMIT", "Maximum 500 documents par génération.");
        break;
      }
      group = {
        record: {
          recordId: `record-${row.rowNumber}`,
          data: {},
          provenance: {},
        },
        rows: [],
        items: [],
      };
      groups.set(key, group);
    }
    const fields = mapFields(table, row, mapping.fields, group.record);
    if (
      group.rows.length &&
      JSON.stringify(fields) !== JSON.stringify(group.record.data)
    )
      issue(
        "GROUP_VALUE_CONFLICT",
        "Les champs du document diffèrent entre lignes du groupe.",
        source(table.sheet, row),
      );
    else if (!group.rows.length) group.record.data = fields;
    group.rows.push(row);
    if (mapping.group)
      group.items.push(
        mapFields(
          table,
          row,
          mapping.group.fields,
          group.record,
          `${mapping.group.itemPath}[${group.items.length}].`,
        ),
      );
  }
  for (const group of groups.values())
    if (mapping.group)
      setPath(group.record.data, mapping.group.itemPath, group.items);
  for (const join of mapping.joins) {
    const child = getTable(
      join.sheet,
      join.headerRow,
      join.expectedHeaders,
      join.excludeRows ?? [],
    );
    if (!child) continue;
    checkFields(child, join.fields);
    if (
      !table.headers.has(join.parentKey) ||
      !child.headers.has(join.childKey)
    ) {
      issue("JOIN_KEY_COLUMN", "Une colonne de jointure est absente.");
      continue;
    }
    if (pathsConflict(join.fields.map((field) => field.target))) continue;
    const parents = new Map<
      string,
      typeof groups extends Map<string, infer T> ? T : never
    >();
    for (const group of groups.values()) {
      const keys = new Set(
        group.rows.map((row) => keyCell(table, row, join.parentKey)),
      );
      const key = [...keys][0];
      if (keys.size !== 1 || !key?.trim()) {
        issue(
          "JOIN_PARENT_KEY",
          "Clé parent absente ou incohérente dans un groupe.",
        );
        continue;
      }
      if (parents.has(key)) {
        issue(
          "JOIN_PARENT_CARDINALITY",
          "La clé parent n’est pas unique ; aucun produit cartésien autorisé.",
        );
        continue;
      }
      parents.set(key, group);
    }
    const joined = new Map<string, Record<string, unknown>[]>();
    for (const row of child.rows) {
      const key = keyCell(child, row, join.childKey);
      const parent = key ? parents.get(key) : undefined;
      if (!key || !parent) {
        issue(
          "JOIN_ORPHAN",
          "Ligne enfant sans parent correspondant.",
          source(child.sheet, row),
        );
        continue;
      }
      const entries = joined.get(key) ?? [];
      if (join.cardinality === "one-to-one" && entries.length) {
        issue(
          "JOIN_CHILD_CARDINALITY",
          "La jointure un-à-un possède plusieurs lignes enfants.",
          source(child.sheet, row),
        );
        continue;
      }
      entries.push(
        mapFields(
          child,
          row,
          join.fields,
          parent.record,
          `${join.target}${join.cardinality === "one-to-many" ? `[${entries.length}]` : ""}.`,
        ),
      );
      joined.set(key, entries);
    }
    for (const [key, parent] of parents) {
      const entries = joined.get(key) ?? [];
      if (join.cardinality === "one-to-one" && entries.length !== 1)
        issue(
          "JOIN_MISSING_CHILD",
          "La jointure un-à-un n’a pas de ligne enfant.",
        );
      setPath(
        parent.record.data,
        join.target,
        join.cardinality === "one-to-many" ? entries : (entries[0] ?? null),
      );
    }
  }
  result.records = [...groups.values()].map((group) => group.record);
  result.documentCount = result.records.length;
  if (issueOverflow)
    result.issues[result.issues.length - 1] = {
      code: "ISSUE_LIMIT",
      severity: "error",
      message:
        "Plus de 1 000 anomalies ; corrigez le fichier avant génération.",
    };
  if (
    !result.issues.some((entry) => entry.severity === "error") &&
    result.documentCount > 0
  )
    result.status = "ready";
  if (!result.documentCount)
    issue("EMPTY_DATASET", "Aucun document n’est produit par ce mapping.");
  return result;
}
export const normalizeDataset = validateMapping;
