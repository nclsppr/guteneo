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
      "Empty or oversized PDF (maximum 10 MiB).",
      413,
    );
  if (!new TextDecoder().decode(bytes.subarray(0, 8)).startsWith("%PDF-"))
    throw new ContentError("NOT_PDF", "The file does not contain a PDF.");
  if (
    !new TextDecoder()
      .decode(bytes.subarray(Math.max(0, bytes.length - 1024)))
      .includes("%%EOF")
  )
    throw new ContentError("CORRUPT_PDF", "Truncated or invalid PDF.");
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
      "Unreadable, corrupt or encrypted PDF.",
    );
  }
  if (pdf.isEncrypted)
    throw new ContentError(
      "ENCRYPTED_PDF",
      "Encrypted PDFs are not supported.",
    );
  const pages = pdf.getPageCount();
  if (pages < 1 || pages > LIMITS.pages)
    throw new ContentError(
      "PAGE_LIMIT",
      `The PDF must contain between 1 and ${LIMITS.pages} pages.`,
    );
  const seen = new Set<unknown>();
  let count = 0;
  function inspect(obj: unknown): void {
    if (!obj || seen.has(obj)) return;
    seen.add(obj);
    if (++count > 100000)
      throw new ContentError("COMPLEX_PDF", "PDF is too complex.");
    if (obj instanceof PDFName && forbiddenNames.has(obj.decodeText()))
      throw new ContentError(
        "ACTIVE_PDF",
        "This PDF contains an active feature or an unauthorized attachment.",
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
