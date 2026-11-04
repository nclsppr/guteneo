// @ts-expect-error fontkit 2 ships no type declarations; pdf-lib types its use.
import * as fontkit from "fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import {
  ADMINISTRATION_PDF_FONT_BASE64,
  ADMINISTRATION_PDF_FONT_CODE_POINTS,
} from "./administration-pdf-font-data";

const supported = new Set(ADMINISTRATION_PDF_FONT_CODE_POINTS);

/**
 * The Unicode font of administration PDFs, imported only when a report holds
 * text outside the standard WinAnsi fonts, such as names written in Polish,
 * Czech, Turkish, Romanian, Greek or Cyrillic. The whole pinned font is
 * embedded: pdf-lib can subset only with an older fontkit.
 */
export async function embedUnicodeFont(document: PDFDocument): Promise<{
  font: PDFFont;
  text: (value: string) => string;
}> {
  document.registerFontkit(
    fontkit as Parameters<PDFDocument["registerFontkit"]>[0],
  );
  const bytes = Uint8Array.from(atob(ADMINISTRATION_PDF_FONT_BASE64), (c) =>
    c.charCodeAt(0),
  );
  const font = await document.embedFont(bytes);
  return {
    font,
    // Characters the font cannot draw stay visible as "?" rather than vanish.
    text: (value) =>
      Array.from(value, (character) =>
        supported.has(character.codePointAt(0) ?? 0) ? character : "?",
      ).join(""),
  };
}
