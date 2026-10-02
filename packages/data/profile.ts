import Papa from "papaparse";
import readXlsxFile from "read-excel-file/universal";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  DATASET_LIMITS,
  XmlRecordPathSchema,
  type DatasetFormat,
  type DatasetProfile,
  type ProfileCell,
  type ProfileSheet,
  type MappingPlan,
} from "../contracts/src/datasets";
import { DatasetError, safeXml, unzipBounded } from "./zip";

export function columnName(column: number): string {
  let result = "";
  while (column > 0) {
    column--;
    result = String.fromCharCode(65 + (column % 26)) + result;
    column = Math.floor(column / 26);
  }
  return result;
}
function columnNumber(address: string): number {
  return [...address.match(/^[A-Z]+/)![0]].reduce(
    (result, char) => result * 26 + char.charCodeAt(0) - 64,
    0,
  );
}
const many = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
type XmlNode = Record<string, unknown>;
function nodes(value: unknown): XmlNode[] {
  return many(value).filter(
    (node): node is XmlNode => typeof node === "object" && node !== null,
  );
}
function obj(value: unknown): XmlNode {
  return value && typeof value === "object" ? (value as XmlNode) : {};
}
function valueText(value: unknown): string {
  return typeof value === "object" && value !== null
    ? String(obj(value)["#text"] ?? "")
    : String(value ?? "");
}
function parseXml(bytes: Uint8Array): XmlNode {
  const xml = safeXml(bytes);
  let depth = 0;
  for (const token of xml.matchAll(/<\/?[A-Za-z_][^>]*>/g)) {
    if (token[0].startsWith("</")) depth--;
    else if (!token[0].endsWith("/>")) depth++;
    if (depth > 64)
      throw new DatasetError("XML_DEPTH_LIMIT", "Structure XML trop profonde.");
  }
  return new XMLParser({
    maxNestedTags: 64,
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: true,
  }).parse(xml) as XmlNode;
}
function makeCell(
  raw: string | null,
  row: number,
  column: number,
  kind: ProfileCell["kind"] = raw === null ? "empty" : "text",
): ProfileCell {
  if (raw !== null && raw.length > DATASET_LIMITS.cellCharacters)
    throw new DatasetError(
      "CELL_TOO_LARGE",
      "Une cellule dépasse 12 000 caractères.",
    );
  return { column, address: `${columnName(column)}${row}`, raw, kind };
}
function sheetFromRows(name: string, rows: (string | null)[][]): ProfileSheet {
  if (
    rows.length > DATASET_LIMITS.rows ||
    rows.some((row) => row.length > DATASET_LIMITS.columns) ||
    rows.reduce((sum, row) => sum + row.length, 0) > DATASET_LIMITS.cells
  )
    throw new DatasetError(
      "DATASET_DIMENSION_LIMIT",
      "Limite de lignes, colonnes ou cellules dépassée.",
    );
  return {
    name,
    hidden: false,
    merges: [],
    headerCandidates: [],
    rows: rows.map((cells, index) => ({
      rowNumber: index + 1,
      hidden: false,
      cells: cells.map((value, column) =>
        makeCell(value, index + 1, column + 1),
      ),
    })),
  };
}
function flatten(
  value: unknown,
  prefix = "",
  out: Record<string, string | null> = {},
  depth = 0,
): Record<string, string | null> {
  if (depth > 8)
    throw new DatasetError("JSON_DEPTH_LIMIT", "Objets JSON trop imbriqués.");
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
        ["__proto__", "prototype", "constructor"].includes(key)
      )
        throw new DatasetError(
          "INVALID_JSON_KEY",
          "Clé JSON non prise en charge.",
        );
      flatten(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    }
  } else {
    if (Array.isArray(value))
      throw new DatasetError(
        "JSON_ARRAY_FIELD",
        "Pour des lignes répétées, fournissez des feuilles JSON distinctes et une jointure explicite.",
      );
    if (typeof value === "number" && !Number.isSafeInteger(value))
      throw new DatasetError(
        "JSON_NUMERIC_PRECISION",
        "Les décimales et grands nombres JSON doivent être des chaînes pour conserver leur précision.",
      );
    out[prefix] = value === null ? null : String(value);
  }
  return out;
}
function parseJson(text: string): ProfileSheet[] {
  // Inspect numeric lexemes before JSON.parse can round them (e.g. 1.0000000000000001).
  for (const token of text.matchAll(
    /"(?:[^"\\]|\\.)*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
  )) {
    if (token[1] && /[.eE]/.test(token[1]))
      throw new DatasetError(
        "JSON_NUMERIC_PRECISION",
        "Les décimales et exposants JSON doivent être des chaînes pour conserver leur précision.",
      );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DatasetError("INVALID_JSON", "JSON invalide.");
  }
  const sheets = Array.isArray(value) ? { Données: value } : value;
  if (!sheets || typeof sheets !== "object")
    throw new DatasetError(
      "INVALID_JSON",
      "Un tableau d’objets ou un objet de feuilles est attendu.",
    );
  return Object.entries(sheets).map(([name, values]) => {
    if (
      !Array.isArray(values) ||
      values.length > DATASET_LIMITS.rows - 1 ||
      values.some((v) => !v || typeof v !== "object" || Array.isArray(v))
    )
      throw new DatasetError(
        "INVALID_JSON_SHEET",
        "Chaque feuille JSON doit contenir un tableau borné d’objets.",
      );
    const records = values.map((record) => flatten(record));
    const keys = [...new Set(records.flatMap(Object.keys))];
    return sheetFromRows(name, [
      keys,
      ...records.map((record) => keys.map((key) => record[key] ?? null)),
    ]);
  });
}

/** XML has no implicit XPath, entity definitions, numeric coercion or destructive list flattening. */
function parseXmlDataset(
  bytes: Uint8Array,
  recordPath?: string,
): ProfileSheet[] {
  const xml = safeXml(bytes);
  if (
    recordPath !== undefined &&
    !XmlRecordPathSchema.safeParse(recordPath).success
  )
    throw new DatasetError(
      "INVALID_XML_RECORD_PATH",
      "Le chemin XML doit être absolu, par exemple /export/clients/client, sans expression XPath.",
    );
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(xml))
    throw new DatasetError("INVALID_XML", "Caractères XML interdits.");
  const encoding = xml.match(
    /^\s*<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/i,
  )?.[1];
  if (encoding && !/^utf-?8$/i.test(encoding))
    throw new DatasetError(
      "INVALID_XML_ENCODING",
      "Les fichiers XML doivent utiliser UTF-8.",
    );

  // Tokenize quoted attributes, CDATA and comments correctly before parsing or allocating a tree.
  // Predefined/numeric character references are data; custom entities and all DTDs are forbidden.
  const syntax = xml.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g,
    "",
  );
  for (const ref of syntax.matchAll(/&([^&;\s<]*);?|&/g)) {
    const name = ref[1];
    if (
      !ref[0].endsWith(";") ||
      !/^(?:amp|lt|gt|apos|quot|#\d+|#x[0-9a-fA-F]+)$/.test(name ?? "")
    )
      throw new DatasetError(
        "UNSAFE_XML",
        "Seules les références de caractères XML standard sont acceptées.",
      );
    if (name.startsWith("#")) {
      const code = name.startsWith("#x")
        ? Number.parseInt(name.slice(2), 16)
        : Number(name.slice(1));
      if (
        ![9, 10, 13].includes(code) &&
        !(code >= 0x20 && code <= 0xd7ff) &&
        !(code >= 0xe000 && code <= 0xfffd) &&
        !(code >= 0x10000 && code <= 0x10ffff)
      )
        throw new DatasetError(
          "INVALID_XML",
          "Référence de caractère XML interdite.",
        );
    }
  }
  let depth = 0,
    elements = 0;
  for (const token of syntax.matchAll(
    /<\/?[^!?\s/>](?:[^>"']|"[^"]*"|'[^']*')*>/g,
  )) {
    if (token[0].startsWith("</")) depth--;
    else {
      elements++;
      if (++depth > DATASET_LIMITS.xmlDepth)
        throw new DatasetError(
          "XML_DEPTH_LIMIT",
          "Structure XML trop profonde (32 niveaux maximum).",
        );
      if (/\/\s*>$/.test(token[0])) depth--;
      if (elements > DATASET_LIMITS.xmlElements)
        throw new DatasetError(
          "XML_ELEMENT_LIMIT",
          "Maximum 100 000 éléments XML.",
        );
    }
  }
  if (XMLValidator.validate(xml) !== true)
    throw new DatasetError("INVALID_XML", "Structure XML invalide.");
  let document: XmlNode;
  try {
    document = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: false,
      processEntities: true,
      // fast-xml-parser 5 enables numeric references with this option; the preflight above
      // already rejects every HTML/custom named entity except the five XML names.
      htmlEntities: true,
      ignoreDeclaration: true,
      ignorePiTags: true,
      maxNestedTags: DATASET_LIMITS.xmlDepth,
    }).parse(xml) as XmlNode;
  } catch {
    throw new DatasetError(
      "INVALID_XML",
      "Structure ou noms XML non pris en charge.",
    );
  }
  const children = (node: unknown) =>
    Object.entries(obj(node)).filter(
      ([key]) => !key.startsWith("@_") && key !== "#text",
    );
  const roots = children(document);
  if (roots.length !== 1 || Array.isArray(roots[0][1]))
    throw new DatasetError(
      "INVALID_XML",
      "Le fichier XML doit avoir une seule racine.",
    );
  let records: unknown[];
  if (recordPath) {
    let selected: unknown[] = [document];
    for (const part of recordPath.slice(1).split("/")) {
      selected = selected.flatMap((node) =>
        Object.hasOwn(obj(node), part) ? many(obj(node)[part]) : [],
      );
      if (selected.length >= DATASET_LIMITS.rows)
        throw new DatasetError(
          "DATASET_DIMENSION_LIMIT",
          "Maximum 4 999 enregistrements XML.",
        );
    }
    records = selected;
    if (!records.length)
      throw new DatasetError(
        "XML_RECORD_PATH_NOT_FOUND",
        "Le chemin XML ne sélectionne aucun enregistrement.",
      );
  } else {
    const container = obj(roots[0][1]);
    const entries = children(container);
    const metadata = Object.keys(container).some(
      (key) =>
        key.startsWith("@_") &&
        key !== "@_xmlns" &&
        !key.startsWith("@_xmlns:"),
    );
    if (
      entries.length !== 1 ||
      metadata ||
      String(container["#text"] ?? "").trim()
    )
      throw new DatasetError(
        "XML_RECORD_PATH_REQUIRED",
        "Indiquez le chemin des enregistrements XML, par exemple /export/clients/client.",
      );
    records = many(entries[0][1]);
  }
  if (!records.length || records.length >= DATASET_LIMITS.rows)
    throw new DatasetError(
      "DATASET_DIMENSION_LIMIT",
      "Le fichier doit contenir de 1 à 4 999 enregistrements XML.",
    );

  // Repeated child elements become separate tables joined explicitly by generated source keys.
  // Discover their paths across all records so singleton items use the same table as repeated items.
  const repeatedPaths = new Set<string>();
  const discover = (value: unknown, path = "", nestedList = false): void => {
    if (Array.isArray(value)) {
      if (nestedList)
        throw new DatasetError(
          "XML_NESTED_LIST",
          "Les listes XML imbriquées nécessitent des tables séparées et des clés explicites.",
        );
      repeatedPaths.add(path);
      if (repeatedPaths.size > 8)
        throw new DatasetError(
          "SHEET_LIMIT",
          "Maximum 8 tables XML répétées par import.",
        );
      for (const child of value) discover(child, path, true);
    } else {
      for (const [key, child] of children(value))
        discover(child, path ? `${path}.${key}` : key, nestedList);
    }
  };
  for (const record of records) discover(record);
  const childTables = new Map<string, Record<string, string | null>[]>(
    [...repeatedPaths].map((path) => [path, []]),
  );
  let populatedCells = 0;
  const flattenRecord = (
    record: unknown,
    recordId: string,
    childTable = false,
  ): Record<string, string | null> => {
    if (!record || typeof record !== "object" || Array.isArray(record))
      throw new DatasetError(
        "XML_RECORD_NOT_OBJECT",
        "Chaque enregistrement XML doit contenir des champs ou des attributs ; précisez le chemin des enregistrements.",
      );
    const out: Record<string, string | null> = Object.create(null);
    const add = (path: string, value: unknown) => {
      if (!path || path.length > 256 || Object.hasOwn(out, path))
        throw new DatasetError(
          "INVALID_XML_KEY",
          "Chemin de champ XML ambigu ou trop long.",
        );
      if (
        ++populatedCells > DATASET_LIMITS.cells ||
        Object.keys(out).length >= DATASET_LIMITS.columns
      )
        throw new DatasetError(
          "DATASET_DIMENSION_LIMIT",
          "Limite de colonnes ou cellules XML dépassée.",
        );
      const raw = value === "" ? null : String(value);
      makeCell(raw, 1, 1);
      out[path] = raw;
    };
    const visit = (value: unknown, path: string, nesting: number) => {
      if (nesting > 8)
        throw new DatasetError(
          "XML_FIELD_DEPTH_LIMIT",
          "Champs XML trop imbriqués (8 niveaux maximum).",
        );
      if (!childTable && repeatedPaths.has(path)) {
        const rows = childTables.get(path)!;
        for (const child of many(value)) {
          if (rows.length >= DATASET_LIMITS.rows - 1)
            throw new DatasetError(
              "DATASET_DIMENSION_LIMIT",
              "Maximum 4 999 lignes par table XML.",
            );
          rows.push(
            flattenRecord(
              typeof child === "object" && child !== null
                ? child
                : { "#text": child },
              recordId,
              true,
            ),
          );
        }
        return;
      }
      if (Array.isArray(value))
        throw new DatasetError(
          "XML_NESTED_LIST",
          "Les listes XML imbriquées nécessitent des tables séparées et des clés explicites.",
        );
      if (!value || typeof value !== "object") {
        add(path, value);
        return;
      }
      const fields = children(value);
      const text = obj(value)["#text"];
      if (fields.length && typeof text === "string" && text.trim())
        throw new DatasetError(
          "XML_MIXED_CONTENT",
          "Texte et sous-éléments XML mélangés : fournissez des champs distincts.",
        );
      let attributes = 0;
      for (const [key, child] of Object.entries(value)) {
        if (key === "#text" || key === "@_xmlns" || key.startsWith("@_xmlns:"))
          continue;
        const attribute = key.startsWith("@_");
        const name = attribute ? key.slice(2) : key;
        if (
          !/^[A-Za-z_][A-Za-z0-9_:-]*$/.test(name) ||
          [
            "__proto__",
            "prototype",
            "constructor",
            "__xml_record_id",
            "__xml_parent_id",
          ].includes(name)
        )
          throw new DatasetError(
            "INVALID_XML_KEY",
            "Nom de champ XML non pris en charge ou ambigu.",
          );
        const next = `${path ? `${path}.` : ""}${attribute ? "@" : ""}${name}`;
        if (attribute) {
          attributes++;
          add(next, child);
        } else visit(child, next, nesting + 1);
      }
      if (!fields.length && text !== undefined)
        add(path ? (attributes ? `${path}.#text` : path) : "#text", text);
      else if (!fields.length && !attributes && path) add(path, "");
    };
    visit(record, "", 0);
    if (!Object.keys(out).length)
      throw new DatasetError(
        "XML_EMPTY_RECORD",
        "Enregistrement XML sans champs exploitables.",
      );
    if (childTables.size)
      add(childTable ? "__xml_parent_id" : "__xml_record_id", recordId);
    return out;
  };
  const values = records.map((record, index) =>
    flattenRecord(record, `xml-${index + 1}`),
  );
  const tables = [
    ["Données", values],
    ...[...childTables].map(([path, rows]) => [`Données.${path}`, rows]),
  ] as Array<[string, Record<string, string | null>[]]>;
  return tables.map(([name, rows]) => {
    const keys = [...new Set(rows.flatMap(Object.keys))];
    return sheetFromRows(name, [
      keys,
      ...rows.map((value) => keys.map((key) => value[key] ?? null)),
    ]);
  });
}
async function parseXlsx(bytes: Uint8Array): Promise<ProfileSheet[]> {
  const files = unzipBounded(bytes);
  if (!files["xl/workbook.xml"] || !files["[Content_Types].xml"])
    throw new DatasetError(
      "INVALID_XLSX",
      "Le fichier n’est pas un classeur XLSX.",
    );
  for (const [path, content] of Object.entries(files)) {
    if (/vbaProject|macrosheets|externalLinks|embeddings|activeX/i.test(path))
      throw new DatasetError(
        "ACTIVE_WORKBOOK",
        "Macros, objets embarqués et liens externes non pris en charge.",
      );
    if (path.endsWith(".rels")) {
      const relationships = nodes(
        obj(parseXml(content).Relationships).Relationship,
      );
      if (
        relationships.some(
          (relationship) =>
            String(relationship["@_TargetMode"]).toLowerCase() === "external" ||
            /^[a-z][a-z0-9+.-]*:/i.test(String(relationship["@_Target"])),
        )
      )
        throw new DatasetError(
          "EXTERNAL_WORKBOOK_LINK",
          "Les relations externes du classeur sont interdites.",
        );
    }
    if (path.endsWith(".xml")) safeXml(content);
  }
  if (/macroEnabled/i.test(safeXml(files["[Content_Types].xml"])))
    throw new DatasetError(
      "ACTIVE_WORKBOOK",
      "Classeur à macros non pris en charge.",
    );
  const workbook = obj(parseXml(files["xl/workbook.xml"]).workbook);
  const metas = nodes(obj(workbook.sheets).sheet);
  if (!metas.length || metas.length > DATASET_LIMITS.sheets)
    throw new DatasetError(
      "SHEET_LIMIT",
      "Le classeur doit contenir de 1 à 12 feuilles.",
    );
  const relations = files["xl/_rels/workbook.xml.rels"]
    ? nodes(
        obj(parseXml(files["xl/_rels/workbook.xml.rels"]).Relationships)
          .Relationship,
      )
    : [];
  const styles = files["xl/styles.xml"]
    ? obj(parseXml(files["xl/styles.xml"]).styleSheet)
    : {};
  const formats = new Map(
    nodes(obj(styles.numFmts).numFmt).map((node) => [
      String(node["@_numFmtId"]),
      String(node["@_formatCode"]),
    ]),
  );
  const styleFormats = nodes(obj(styles.cellXfs).xf).map((node) =>
    formats.get(String(node["@_numFmtId"])),
  );
  let rectangularCells = 0;
  const metadata = metas.map((meta, index) => {
    const relation = relations.find((r) => r["@_Id"] === meta["@_r:id"]);
    const target = String(
      relation?.["@_Target"] ?? `worksheets/sheet${index + 1}.xml`,
    );
    const path = target.startsWith("/xl/")
      ? target.slice(1)
      : target.startsWith("xl/")
        ? target
        : `xl/${target}`;
    if (!files[path] || path.includes(".."))
      throw new DatasetError(
        "INVALID_XLSX_RELATION",
        "Relation de feuille invalide.",
      );
    const sheet = obj(parseXml(files[path]).worksheet);
    const rows = nodes(obj(sheet.sheetData).row);
    let maxRow = 0,
      maxColumn = 0;
    for (const row of rows) {
      const rowNumber = Number(row["@_r"]);
      if (
        !Number.isInteger(rowNumber) ||
        rowNumber < 1 ||
        rowNumber > DATASET_LIMITS.rows
      )
        throw new DatasetError(
          "ROW_LIMIT",
          "Numérotation de ligne absente ou limite de 5 000 lignes dépassée.",
        );
      maxRow = Math.max(maxRow, rowNumber);
      for (const cell of nodes(row.c)) {
        const address = String(cell["@_r"]);
        if (
          !/^[A-Z]{1,3}[1-9]\d*$/.test(address) ||
          Number(address.match(/\d+$/)![0]) !== rowNumber
        )
          throw new DatasetError(
            "INVALID_CELL_ADDRESS",
            "Référence de cellule invalide.",
          );
        const column = columnNumber(address);
        if (column > DATASET_LIMITS.columns)
          throw new DatasetError("COLUMN_LIMIT", "Maximum 128 colonnes.");
        maxColumn = Math.max(maxColumn, column);
      }
    }
    rectangularCells += maxRow * maxColumn;
    if (rectangularCells > DATASET_LIMITS.cells)
      throw new DatasetError(
        "CELL_LIMIT",
        "Maximum 100 000 cellules, cellules vides comprises.",
      );
    return { meta, rows, sheet, maxRow, maxColumn };
  });
  let parsed: Awaited<ReturnType<typeof readXlsxFile<string>>>;
  try {
    parsed = await readXlsxFile<string>(bytes.slice().buffer, {
      trim: false,
      parseNumber: (value) => value,
    });
  } catch {
    throw new DatasetError(
      "INVALID_XLSX",
      "Le classeur ne peut pas être interprété. Vérifiez ses types et cellules en erreur.",
    );
  }
  return parsed.map((parsedSheet, index) => {
    const { meta, rows, sheet, maxRow, maxColumn } = metadata[index];
    return {
      name: parsedSheet.sheet,
      hidden: ["hidden", "veryHidden"].includes(String(meta["@_state"])),
      headerCandidates: [],
      merges: nodes(obj(sheet.mergeCells).mergeCell).map((node) =>
        String(node["@_ref"]),
      ),
      rows: Array.from({ length: maxRow }, (_, rowIndex) => {
        const values = Array.from(
          { length: maxColumn },
          (_, column) => parsedSheet.data[rowIndex]?.[column] ?? null,
        );
        const xmlRow = rows.find((row) => Number(row["@_r"]) === rowIndex + 1);
        return {
          rowNumber: rowIndex + 1,
          hidden:
            xmlRow?.["@_hidden"] === "1" || xmlRow?.["@_hidden"] === "true",
          cells: values.map((value, column) => {
            const xmlCell = nodes(xmlRow?.c).find(
              (cell) =>
                String(cell["@_r"]) ===
                `${columnName(column + 1)}${rowIndex + 1}`,
            );
            const format = styleFormats[Number(xmlCell?.["@_s"] ?? -1)];
            let raw =
              value === null
                ? null
                : value instanceof Date
                  ? value.toISOString().slice(0, 10)
                  : String(value);
            const kind: ProfileCell["kind"] =
              value === null
                ? "empty"
                : value instanceof Date
                  ? "date"
                  : typeof value === "boolean"
                    ? "boolean"
                    : xmlCell?.["@_t"] === "n" ||
                        (xmlCell && !xmlCell["@_t"] && xmlCell.v !== undefined)
                      ? "number"
                      : "text";
            if (
              kind === "number" &&
              format &&
              /^0{2,}$/.test(format) &&
              raw &&
              /^\d+$/.test(raw)
            )
              raw = raw.padStart(format.length, "0");
            const cell = makeCell(raw, rowIndex + 1, column + 1, kind);
            if (format) cell.numberFormat = format;
            if (xmlCell && Object.hasOwn(xmlCell, "f")) {
              cell.formula = valueText(xmlCell.f);
              cell.cached =
                Object.hasOwn(xmlCell, "v") && valueText(xmlCell.v) !== "";
            }
            return cell;
          }),
        };
      }),
    };
  });
}

export async function profileDataset(
  bytes: Uint8Array,
  format: DatasetFormat,
  options: {
    encoding?: "utf-8" | "windows-1252";
    delimiter?: "," | ";" | "\t" | "|";
    xmlRecordPath?: string;
  } = {},
): Promise<DatasetProfile> {
  if (!bytes.length || bytes.length > DATASET_LIMITS.sourceBytes)
    throw new DatasetError(
      "DATASET_SIZE_LIMIT",
      "Le fichier doit faire entre 1 octet et 5 Mio.",
      413,
    );
  if (!["csv", "xlsx", "json", "xml"].includes(format))
    throw new DatasetError(
      "DATASET_FORMAT",
      "Formats disponibles : CSV, XLSX, JSON, XML.",
    );
  let sheets: ProfileSheet[];
  if (format === "xlsx") sheets = await parseXlsx(bytes);
  else if (format === "xml") {
    if (options.encoding && options.encoding !== "utf-8")
      throw new DatasetError(
        "INVALID_XML_ENCODING",
        "Les fichiers XML doivent utiliser UTF-8.",
      );
    sheets = parseXmlDataset(bytes, options.xmlRecordPath);
  } else {
    let text: string;
    try {
      text = new TextDecoder(options.encoding ?? "utf-8", {
        fatal: true,
      }).decode(bytes);
    } catch {
      throw new DatasetError(
        "DATASET_ENCODING",
        "Encodage invalide : sélectionnez UTF-8 ou Windows-1252 explicitement.",
      );
    }
    if (text.includes("\u0000"))
      throw new DatasetError(
        "DATASET_TYPE",
        "Fichier texte contenant des octets binaires.",
      );
    if (format === "json") sheets = parseJson(text);
    else {
      const rows: (string | null)[][] = [];
      let cells = 0;
      Papa.parse<string[]>(text, {
        delimiter: options.delimiter,
        skipEmptyLines: false,
        dynamicTyping: false,
        step: (parsed, parser) => {
          cells += parsed.data.length;
          if (
            rows.length >= DATASET_LIMITS.rows ||
            parsed.data.length > DATASET_LIMITS.columns ||
            cells > DATASET_LIMITS.cells
          ) {
            parser.abort();
            throw new DatasetError(
              "DATASET_DIMENSION_LIMIT",
              "Limite de lignes, colonnes ou cellules dépassée.",
            );
          }
          if (
            parsed.errors.some(
              (error) => error.code !== "UndetectableDelimiter",
            )
          ) {
            parser.abort();
            throw new DatasetError(
              "INVALID_CSV",
              "Structure CSV invalide. Vérifiez le séparateur et les guillemets.",
            );
          }
          rows.push(parsed.data.map((value) => (value === "" ? null : value)));
        },
      });
      sheets = [sheetFromRows("Données", rows)];
    }
  }
  const profile: DatasetProfile = {
    version: 1,
    format,
    sheets,
    issues: [],
    sourceBytes: bytes.length,
  };
  if (!sheets.length || sheets.length > DATASET_LIMITS.sheets)
    throw new DatasetError("SHEET_LIMIT", "Maximum 12 feuilles.");
  let cells = 0;
  const add = (issue: DatasetProfile["issues"][number]) => {
    if (profile.issues.length < DATASET_LIMITS.issues)
      profile.issues.push(issue);
    else
      profile.issues[DATASET_LIMITS.issues - 1] = {
        code: "PROFILE_ISSUES_TRUNCATED",
        severity: "warning",
        message:
          "Plus de 1 000 points signalés ; l’affichage du profil est limité. La validation parcourt toutes les lignes.",
      };
  };
  if (format === "xml" && sheets.length > 1)
    add({
      code: "XML_REPEATED_TABLES",
      severity: "warning",
      message:
        "Les éléments XML répétés sont conservés dans des tables séparées. Reliez __xml_record_id à __xml_parent_id par une jointure explicite pour inclure leurs lignes dans les PDF.",
    });
  for (const sheet of sheets) {
    if (
      !sheet.name ||
      sheet.name.length > 256 ||
      sheets.filter((candidate) => candidate.name === sheet.name).length !== 1
    )
      throw new DatasetError(
        "INVALID_SHEET_NAME",
        "Nom de feuille absent, dupliqué ou trop long.",
      );
    if (
      sheet.rows.length > DATASET_LIMITS.rows ||
      sheet.rows.some((row) => row.cells.length > DATASET_LIMITS.columns)
    )
      throw new DatasetError(
        "DATASET_DIMENSION_LIMIT",
        "Maximum 5 000 lignes et 128 colonnes.",
      );
    cells += sheet.rows.reduce((count, row) => count + row.cells.length, 0);
    if (cells > DATASET_LIMITS.cells)
      throw new DatasetError("CELL_LIMIT", "Maximum 100 000 cellules.");
    sheet.headerCandidates = sheet.rows
      .slice(0, 30)
      .filter((row) => row.cells.filter((cell) => cell.raw?.trim()).length > 1)
      .sort((a, b) => {
        const score = (row: ProfileSheet["rows"][number]) =>
          row.cells.filter(
            (cell) => cell.raw && /[A-Za-zÀ-ÿ]/.test(cell.raw) && !cell.formula,
          ).length;
        return score(b) - score(a) || a.rowNumber - b.rowNumber;
      })
      .slice(0, 3)
      .map((row) => row.rowNumber);
    if (sheet.hidden)
      add({
        code: "HIDDEN_SHEET",
        severity: "warning",
        message: `Feuille masquée : ${sheet.name}.`,
      });
    if (sheet.merges.length)
      add({
        code: "MERGED_CELLS",
        severity: "warning",
        message: `Cellules fusionnées dans ${sheet.name} : aucune propagation automatique.`,
      });
    for (const row of sheet.rows) {
      if (row.hidden)
        add({
          code: "HIDDEN_ROW",
          severity: "warning",
          message: "Ligne masquée exclue par défaut.",
          source: {
            sheet: sheet.name,
            row: row.rowNumber,
            column: 1,
            address: `A${row.rowNumber}`,
          },
        });
      for (const cell of row.cells) {
        const source = {
          sheet: sheet.name,
          row: row.rowNumber,
          column: cell.column,
          address: cell.address,
        };
        if (cell.formula !== undefined)
          add({
            code: cell.cached ? "FORMULA_CACHED" : "FORMULA_NO_CACHE",
            severity: "warning",
            message: cell.cached
              ? "Formule non exécutée ; valeur en cache à valider explicitement."
              : "Formule sans résultat exploitable.",
            source,
          });
        if (
          cell.raw &&
          /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(cell.raw) &&
          cell.raw
            .split(/[/-]/)
            .slice(0, 2)
            .every((part) => Number(part) <= 12)
        )
          add({
            code: "AMBIGUOUS_DATE",
            severity: "warning",
            message: "Ordre jour/mois à choisir explicitement.",
            source,
          });
        if (cell.raw && /^\s*(subtotal|sous-total|total)\b/i.test(cell.raw))
          add({
            code: "POSSIBLE_SUBTOTAL",
            severity: "warning",
            message:
              "Sous-total possible : sélectionner une exclusion explicite si nécessaire.",
            source,
          });
      }
    }
  }
  return profile;
}

export function datasetStructureSignature(
  profile: DatasetProfile,
  mapping?: MappingPlan,
): string {
  return JSON.stringify(
    profile.sheets
      .map((sheet) => ({
        name: sheet.name,
        headers: (
          sheet.rows
            .find(
              (row) =>
                row.rowNumber ===
                (mapping?.sourceSheet === sheet.name
                  ? mapping.headerRow
                  : (mapping?.joins.find((join) => join.sheet === sheet.name)
                      ?.headerRow ??
                    sheet.headerCandidates[0] ??
                    1)),
            )
            ?.cells.map((cell) => cell.raw?.trim() ?? "") ?? []
        )
          .filter(Boolean)
          .sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}
