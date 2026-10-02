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
        "Le document Word dépasse la complexité autorisée.",
      );
    if (/^<\//.test(token[0])) depth--;
    else if (!/^<[!?]/.test(token[0]) && !/\/>$/.test(token[0])) depth++;
    if (depth > 64 || depth < 0)
      throw new TemplateError(
        "DOCX_XML_LIMIT",
        "La structure Word dépasse la profondeur autorisée.",
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
      "Utilisez un fichier .docx. Les anciens fichiers .doc et les macros .docm ne sont pas pris en charge.",
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
      "Le fichier n’est pas un document Word DOCX reconnu.",
    );
  const contentTypes = boundedXml(files["[Content_Types].xml"]);
  if (
    !contentTypes.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    )
  )
    throw new TemplateError("DOCX_INVALID", "Type principal DOCX invalide.");
  for (const [entry, content] of Object.entries(files)) {
    if (
      /vbaProject|embeddings\/|activeX\//i.test(entry) ||
      /macroEnabled|vbaProject|activeX/i.test(contentTypes)
    )
      throw new TemplateError(
        "DOCX_ACTIVE_CONTENT",
        "Retirez les macros, objets incorporés et contrôles actifs avant l’import.",
      );
    if (entry.endsWith(".rels")) {
      const relationships = boundedXml(content);
      if (XMLValidator.validate(relationships) !== true)
        throw new TemplateError("DOCX_INVALID", "Relations Word invalides.");
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
          "Retirez les liens ou ressources externes du document avant l’import.",
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
      "Les champs automatiques et contenus incorporés ne sont pas importables.",
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
    throw new TemplateError("DOCX_INVALID", "Corps du document absent.");
  const envelope = blankTemplate();
  envelope.name =
    name.replace(/\.docx$/i, "").slice(0, 160) || "Document Word importé";
  envelope.description =
    "Contenu Word importé dans un modèle éditable. Vérifiez la mise en page et les variables avant publication.";
  envelope.definition.basePdf.staticSchema = [];
  const warnings: DocxImportResult["warnings"] = [
    {
      code: "DOCX_LAYOUT_REVIEW",
      message:
        "Paragraphes et tableaux importés comme blocs éditables. Styles Word, sauts de page, images, en-têtes, pieds de page, notes et champs automatiques ne sont pas reproduits. Vérifiez le PDF final avant publication.",
    },
  ];
  if (/<(?:\w+:)?(?:drawing|pict)\b/i.test(xml))
    warnings.push({
      code: "DOCX_IMAGES_OMITTED",
      message:
        "Les images Word n’ont pas été importées ; ajoutez un logo PNG/JPEG dans le studio.",
    });
  let y = 25,
    paragraphs = 0,
    tables = 0,
    characters = 0;
  function add(block: GraphicBlock) {
    if (envelope.definition.schemas.flat().length >= 90)
      throw new TemplateError(
        "DOCX_BLOCK_LIMIT",
        "Le document dépasse 90 blocs. Scindez-le avant l’import.",
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
          "Le document dépasse les limites de texte importable.",
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
        block.content = "Texte importé";
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
          "Les cellules fusionnées Word doivent être séparées avant l’import.",
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
          "Tableau trop volumineux ou cellules fusionnées irrégulières. Simplifiez le tableau avant l’import.",
        );
      characters += rows.flat().reduce((sum, cell) => sum + cell.length, 0);
      if (characters > 50_000 || rows.flat().some((cell) => cell.length > 2000))
        throw new TemplateError("DOCX_TEXT_LIMIT", "Tableau trop volumineux.");
      if (rows.flat().some((cell) => cell.includes("{")))
        throw new TemplateError(
          "DOCX_TABLE_VARIABLES",
          "Remplacez les accolades dans le tableau Word ; configurez les colonnes variables dans le studio.",
        );
      const block = tableBlock(`table_${++tables}`, rows[0], y);
      block.content = JSON.stringify(rows.slice(1));
      block.readOnly = true;
      if (rows[0].some((cell) => cell.length > 100)) {
        block.head = rows[0].map((_cell, index) => `Colonne ${index + 1}`);
        block.content = JSON.stringify(rows);
        warnings.push({
          code: "DOCX_TABLE_HEADER",
          message:
            "Un tableau contient une première ligne longue ; des noms de colonnes neutres ont été ajoutés et toutes les lignes conservées.",
        });
      }
      add(block);
    }
  }
  if (!paragraphs && !tables)
    throw new TemplateError(
      "DOCX_EMPTY",
      "Aucun paragraphe ou tableau importable n’a été trouvé.",
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
