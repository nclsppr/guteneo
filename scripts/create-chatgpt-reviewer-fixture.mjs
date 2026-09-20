import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Deterministic, original PDF fixture. No address, phone, email or real person.
const directory = fileURLToPath(
  new URL("../integrations/chatgpt/fixtures/", import.meta.url),
);
const document = await PDFDocument.create();
const date = new Date("2026-09-21T00:00:00.000Z");
document.setTitle("Guteneo - Synthetic reviewer document");
document.setAuthor("Guteneo");
document.setSubject(
  "Synthetic import and document review fixture; do not send",
);
document.setCreator("Guteneo reviewer fixture generator");
document.setProducer("pdf-lib");
document.setCreationDate(date);
document.setModificationDate(date);
const regular = await document.embedFont(StandardFonts.Helvetica);
const bold = await document.embedFont(StandardFonts.HelveticaBold);
const ink = rgb(0.12, 0.15, 0.2);
const blue = rgb(0.14, 0.31, 0.86);
for (let number = 1; number <= 2; number++) {
  const page = document.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 46, y: 765, width: 503, height: 4, color: blue });
  page.drawText("guteneo", {
    x: 46,
    y: 790,
    size: 20,
    font: bold,
    color: blue,
  });
  page.drawText("SYNTHETIC REVIEW DOCUMENT", {
    x: 46,
    y: 711,
    size: 23,
    font: bold,
    color: ink,
  });
  page.drawText("DO NOT SEND - No real recipient", {
    x: 46,
    y: 679,
    size: 14,
    font: bold,
    color: ink,
  });
  const lines =
    number === 1
      ? [
          "Reference: GUTENEO-OPENAI-REVIEW-20260921",
          "Purpose: import the original PDF and inspect its two pages.",
          "All content in this document is fictional test material.",
          "This fixture contains no personal or confidential information.",
          "No delivery address, telephone number or email is provided.",
          "No transmission, approval or expert mandate is requested.",
          "",
          "Expected controls",
          "1. The imported file has exactly two A4 pages.",
          "2. Its SHA-256 matches the reference computed from this file.",
          "3. Guteneo verifies the PDF before any dispatch preparation.",
          "4. The second page remains visible and legible.",
        ]
      : [
          "Reference: GUTENEO-OPENAI-REVIEW-20260921",
          "This is the second and final page of the original fixture.",
          "Use it to check page order, complete rendering and text clarity.",
          "",
          "Fictional inventory",
          "Paper samples: 3",
          "Blue folders: 2",
          "Review copies: 1",
          "",
          "End of document",
          "No real communication should be produced from this fixture.",
        ];
  for (const [index, line] of lines.entries()) {
    page.drawText(line, {
      x: 46,
      y: 618 - index * 27,
      size: 12,
      font: regular,
      color: ink,
    });
  }
  page.drawText(`Synthetic fixture - Page ${number} / 2`, {
    x: 46,
    y: 43,
    size: 10,
    font: regular,
    color: ink,
  });
}
const bytes = await document.save({ useObjectStreams: false });
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/reviewer-original.pdf`, bytes);
console.log(
  JSON.stringify({
    fixture: "integrations/chatgpt/fixtures/reviewer-original.pdf",
    pages: 2,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    synthetic: true,
    communicationSent: false,
  }),
);
