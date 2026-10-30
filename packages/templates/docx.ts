import { XMLParser, XMLValidator } from "fast-xml-parser";
import { safeXml, unzipBounded } from "../data/zip";
import { blankTemplate, tableBlock, textBlock } from "./gallery";
import {
  TemplateError,
  validateTemplateEnvelope,
  type GraphicBlock,
  type TemplateEnvelope,
} from "../contracts/src/templates";

type XmlNode = Record<string, unknown>;
export type DocxImportResult = {
  envelope: TemplateEnvelope;
  warnings: { code: string; message: string }[];
  provenance: {
    sourceSha256: string;
    format: "docx";
    paragraphs: number;
    tables: number;
    layoutPreserved: false;
  };
};
function boundedXml(bytes: Uint8Array): string {
  const xml = safeXml(bytes);
  let depth = 0,
    nodes = 0;
  for (const token of xml.matchAll(/<[^>]*>/g)) {
    if (++nodes > 30_000)
      throw new TemplateError(
        "DOCX_XML_LIMIT",
        "The Word document exceeds allowed complexity.",
      );
    if (/^<\//.test(token[0])) depth--;
    else if (!/^<[!?]/.test(token[0]) && !/\/>$/.test(token[0])) depth++;
    if (depth > 64 || depth < 0)
      throw new TemplateError(
        "DOCX_XML_LIMIT",
        "The Word structure exceeds allowed depth.",
      );
  }
  return xml;
}
function hasExternalRelationship(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasExternalRelationship);
  if (value && typeof value === "object")
    return Object.entries(value).some(
      ([key, item]) =>
        (key === "@_TargetMode" && String(item).toLowerCase() === "external") ||
        hasExternalRelationship(item),
    );
  return false;
}
const children = (node: unknown): XmlNode[] =>
  Array.isArray(node) ? (node as XmlNode[]) : [];
function childNodes(nodes: XmlNode[], key: string): XmlNode[][] {
  return nodes.filter((node) => key in node).map((node) => children(node[key]));
}
function textOf(nodes: XmlNode[]): string {
  let result = "";
  for (const node of nodes)
    for (const [name, value] of Object.entries(node)) {
      if (name === ":@") continue;
      if (name === "#text") result += String(value);
      else if (name === "tab") result += "  ";
      else if (name === "br" || name === "cr") result += "\n";
      else if (
        !["pPr", "rPr", "tblPr", "tcPr", "trPr", "instrText", "del"].includes(
          name,
        )
      )
        result += textOf(children(value));
    }
  return result;
}
/** DOCX content import, never Office execution or a promise of Word layout fidelity.
 * The business service scans and privately stores the exact original separately. */
export async function importDocxTemplate(
  bytes: Uint8Array,
  name: string,
): Promise<DocxImportResult> {
  if (!name.toLowerCase().endsWith(".docx"))
    throw new TemplateError(
      "DOCX_FORMAT_REQUIRED",
      "Use a .docx file. Legacy .doc files and .docm macros are unsupported.",
    );
  const files = unzipBounded(bytes, {
    sourceBytes: 5 * 1024 * 1024,
    expandedBytes: 12 * 1024 * 1024,
    entryBytes: 3 * 1024 * 1024,
    entries: 200,
  });
  if (!files["[Content_Types].xml"] || !files["word/document.xml"])
    throw new TemplateError(
      "DOCX_INVALID",
      "The file is not a recognised Word DOCX document.",
    );
  const contentTypes = boundedXml(files["[Content_Types].xml"]);
  if (
    !contentTypes.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    )
  )
    throw new TemplateError("DOCX_INVALID", "Invalid DOCX main content type.");
  for (const [entry, content] of Object.entries(files)) {
    if (
      /vbaProject|embeddings\/|activeX\//i.test(entry) ||
      /macroEnabled|vbaProject|activeX/i.test(contentTypes)
    )
      throw new TemplateError(
        "DOCX_ACTIVE_CONTENT",
        "Remove macros, embedded objects and active controls before import.",
      );
    if (entry.endsWith(".rels")) {
      const relationships = boundedXml(content);
      if (XMLValidator.validate(relationships) !== true)
        throw new TemplateError("DOCX_INVALID", "Invalid Word relationships.");
      if (
        hasExternalRelationship(
          new XMLParser({
            ignoreAttributes: false,
            removeNSPrefix: true,
          }).parse(relationships),
        )
      )
        throw new TemplateError(
          "DOCX_EXTERNAL_RELATIONSHIP",
          "Remove external links/resources before import.",
        );
    }
  }
  const xml = boundedXml(files["word/document.xml"]);
  if (
    XMLValidator.validate(xml) !== true ||
    /<(?:\w+:)?(?:altChunk|fldSimple|instrText|object|control)\b/i.test(xml)
  )
    throw new TemplateError(
      "DOCX_ACTIVE_CONTENT",
      "Automatic fields and embedded content cannot be imported.",
    );
  const parsed = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
  }).parse(xml) as XmlNode[];
  const body = childNodes(childNodes(parsed, "document")[0] ?? [], "body")[0];
  if (!body)
    throw new TemplateError("DOCX_INVALID", "Document body is missing.");
  const envelope = blankTemplate();
  envelope.name =
    name.replace(/\.docx$/i, "").slice(0, 160) || "Imported Word document";
  envelope.description =
    "Word content imported into an editable template. Check layout/variables before publication.";
  envelope.definition.basePdf.staticSchema = [];
  const warnings: DocxImportResult["warnings"] = [
    {
      code: "DOCX_LAYOUT_REVIEW",
      message:
        "Paragraphs/tables imported as editable blocks. Word styles, page breaks, images, headers, footers, notes and automatic fields are not reproduced. Check the final PDF before publication.",
    },
  ];
  if (/<(?:\w+:)?(?:drawing|pict)\b/i.test(xml))
    warnings.push({
      code: "DOCX_IMAGES_OMITTED",
      message:
        "Word images were not imported; add a PNG/JPEG logo in the studio.",
    });
  let y = 25,
    paragraphs = 0,
    tables = 0,
    characters = 0;
  function add(block: GraphicBlock) {
    if (envelope.definition.schemas.flat().length >= 90)
      throw new TemplateError(
        "DOCX_BLOCK_LIMIT",
        "The document exceeds 90 blocks. Split it before import.",
      );
    if (y + block.height > 272) {
      envelope.definition.schemas.push([]);
      y = 25;
    }
    block.position.y = y;
    y += block.height + 5;
    envelope.definition.schemas.at(-1)!.push(block);
  }
  for (const node of body) {
    if (node.p) {
      const text = textOf(children(node.p)).trim();
      if (!text) continue;
      characters += text.length;
      if (characters > 50_000 || text.length > 10_000)
        throw new TemplateError(
          "DOCX_TEXT_LIMIT",
          "The document exceeds importable text limits.",
        );
      const block = textBlock(
        `paragraph_${++paragraphs}`,
        text,
        20,
        y,
        170,
        10,
      );
      // Literal Word braces are data, never engine expressions. A default binding
      // preserves their text while leaving the block editable in the studio.
      if (text.includes("{")) {
        const field = `paragraph_${paragraphs}`;
        block.content = "Imported text";
        block.readOnly = false;
        envelope.inputSchema.properties![field] = {
          type: "string",
          default: text,
          title: `Paragraphe ${paragraphs}`,
        };
        envelope.bindings.push({
          block: block.name,
          kind: "value",
          path: field,
          format: "text",
          required: false,
        });
      }
      add(block);
    } else if (node.tbl) {
      // Word spans can leave a rectangular row count while changing cell
      // meaning. Do not silently flatten horizontal or vertical merges.
      if (/"(?:gridSpan|vMerge|hMerge)"\s*:/.test(JSON.stringify(node.tbl)))
        throw new TemplateError(
          "DOCX_TABLE_STRUCTURE",
          "Split merged Word cells before import.",
        );
      const rows = childNodes(children(node.tbl), "tr").map((row) =>
        childNodes(row, "tc").map((cell) =>
          childNodes(cell, "p")
            .map((p) => textOf(p).trim())
            .join("\n"),
        ),
      );
      if (!rows.length || !rows[0].length) continue;
      const width = Math.max(...rows.map((row) => row.length));
      if (
        width > 20 ||
        rows.length > 200 ||
        rows.some((row) => row.length !== width)
      )
        throw new TemplateError(
          "DOCX_TABLE_STRUCTURE",
          "The table is too large or has irregular merged cells. Simplify it before import.",
        );
      characters += rows.flat().reduce((sum, cell) => sum + cell.length, 0);
      if (characters > 50_000 || rows.flat().some((cell) => cell.length > 2000))
        throw new TemplateError("DOCX_TEXT_LIMIT", "Table is too large.");
      if (rows.flat().some((cell) => cell.includes("{")))
        throw new TemplateError(
          "DOCX_TABLE_VARIABLES",
          "Replace braces in the Word table; configure variable columns in the studio.",
        );
      const block = tableBlock(`table_${++tables}`, rows[0], y);
      block.content = JSON.stringify(rows.slice(1));
      block.readOnly = true;
      if (rows[0].some((cell) => cell.length > 100)) {
        block.head = rows[0].map((_cell, index) => `Column ${index + 1}`);
        block.content = JSON.stringify(rows);
        warnings.push({
          code: "DOCX_TABLE_HEADER",
          message:
            "A table has a long first row; neutral column names were added and all rows retained.",
        });
      }
      add(block);
    }
  }
  if (!paragraphs && !tables)
    throw new TemplateError(
      "DOCX_EMPTY",
      "No importable paragraph/table found.",
    );
  const sourceSha256 = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    envelope: validateTemplateEnvelope(envelope),
    warnings,
    provenance: {
      sourceSha256,
      format: "docx",
      paragraphs,
      tables,
      layoutPreserved: false,
    },
  };
}
