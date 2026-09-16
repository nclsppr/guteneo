import { PDFDocument, PDFDict, PDFArray, PDFName, PDFStream } from "pdf-lib";
import { ContentError, LIMITS } from "./content";
const forbiddenNames = new Set([
  "JavaScript",
  "JS",
  "AA",
  "OpenAction",
  "Launch",
  "EmbeddedFile",
  "EmbeddedFiles",
  "RichMedia",
  "XFA",
  "SubmitForm",
  "ImportData",
]);
export async function validatePdf(
  bytes: Uint8Array,
): Promise<{ pages: number; sha256: string }> {
  if (bytes.byteLength < 20 || bytes.byteLength > LIMITS.pdfBytes)
    throw new ContentError(
      "PDF_SIZE",
      "PDF vide ou trop volumineux (maximum 10 Mio).",
      413,
    );
  if (!new TextDecoder().decode(bytes.subarray(0, 8)).startsWith("%PDF-"))
    throw new ContentError("NOT_PDF", "Le fichier ne contient pas un PDF.");
  if (
    !new TextDecoder()
      .decode(bytes.subarray(Math.max(0, bytes.length - 1024)))
      .includes("%%EOF")
  )
    throw new ContentError("CORRUPT_PDF", "PDF tronqué ou invalide.");
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
  } catch {
    throw new ContentError(
      "UNSUPPORTED_PDF",
      "PDF illisible, corrompu ou chiffré.",
    );
  }
  if (pdf.isEncrypted)
    throw new ContentError(
      "ENCRYPTED_PDF",
      "Les PDF chiffrés ne sont pas pris en charge.",
    );
  const pages = pdf.getPageCount();
  if (pages < 1 || pages > LIMITS.pages)
    throw new ContentError(
      "PAGE_LIMIT",
      `Le PDF doit contenir entre 1 et ${LIMITS.pages} pages.`,
    );
  const seen = new Set<unknown>();
  let count = 0;
  function inspect(obj: unknown): void {
    if (!obj || seen.has(obj)) return;
    seen.add(obj);
    if (++count > 100000)
      throw new ContentError("COMPLEX_PDF", "PDF trop complexe.");
    if (obj instanceof PDFName && forbiddenNames.has(obj.decodeText()))
      throw new ContentError(
        "ACTIVE_PDF",
        "Ce PDF contient une fonction active ou une pièce jointe non autorisée.",
      );
    if (obj instanceof PDFDict)
      for (const [key, val] of obj.entries()) {
        inspect(key);
        inspect(val);
      }
    if (obj instanceof PDFArray) for (const val of obj.asArray()) inspect(val);
    if (obj instanceof PDFStream) inspect(obj.dict);
  }
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) inspect(obj);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>,
  );
  return {
    pages,
    sha256: Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
