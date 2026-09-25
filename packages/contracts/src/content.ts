import sanitizeHtml from "sanitize-html";
import Papa from "papaparse";
import { z } from "zod";
import { faxNumberProblem, normalizeFaxNumber } from "./fax-number";

export class ContentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const LIMITS = {
  pdfBytes: 10 * 1024 * 1024,
  pages: 100,
  htmlBytes: 128 * 1024,
  csvBytes: 256 * 1024,
  campaignRows: 500,
  attachments: 5,
};
export function boundedText(
  value: string,
  limit: number,
  code = "CONTENT_TOO_LARGE",
): void {
  if (new TextEncoder().encode(value).byteLength > limit)
    throw new ContentError(
      code,
      "Le contenu dépasse la limite autorisée.",
      413,
    );
}
export function safeHeader(value: string): string {
  if (!value.trim() || /[\r\n\x00-\x1f\x7f]/.test(value))
    throw new ContentError("INVALID_HEADER", "En-tête invalide.");
  return value.trim();
}
/** No client CSS, SVG, image, external resource or active markup is retained. */
export function cleanHtml(input: string): string {
  boundedText(input, LIMITS.htmlBytes);
  return sanitizeHtml(input, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "hr",
      "a",
      "span",
      "div",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attribs) => ({
        tagName: "a",
        attribs:
          attribs.href && /^(https:\/\/|mailto:)/i.test(attribs.href)
            ? { href: attribs.href, rel: "noopener noreferrer" }
            : ({} as Record<string, string>),
      }),
    },
    disallowedTagsMode: "discard",
    nonTextTags: ["style", "script", "textarea", "option", "noscript"],
    enforceHtmlBoundary: false,
  });
}
export function htmlToText(html: string): string {
  return sanitizeHtml(
    html.replace(/<(?:br\s*\/?|\/p|\/div|\/h[1-6]|\/li)>/gi, "\n"),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
export function printableHtml(html: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>@page{size:A4;margin:22mm}body{font-family:Arial,sans-serif;color:#171b24;font-size:11pt;line-height:1.55;overflow-wrap:anywhere}h1{font-size:25pt}h2{font-size:18pt}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #aaa;padding:6px}img{max-width:100%}a{color:#1746c2}</style></head><body>${cleanHtml(html)}</body></html>`;
}
export function validateRecipient(
  channel: string,
  recipient: Record<string, unknown>,
): Record<string, string> {
  if (channel === "email") {
    const email = z
      .email()
      .parse(safeHeader(String(recipient.email ?? "")).toLowerCase());
    return { email };
  }
  if (channel === "fax") {
    const phone = normalizeFaxNumber(String(recipient.phone ?? ""));
    const problem = faxNumberProblem(phone);
    if (problem) throw new ContentError("INVALID_PHONE", problem);
    return { phone };
  }
  if (channel === "postal") {
    if (recipient.line2 !== undefined && String(recipient.line2).trim())
      throw new ContentError(
        "ADDRESS_LINE_UNSUPPORTED",
        "Le complément d’adresse n’est pas pris en charge dans ce parcours. Il ne sera pas supprimé silencieusement.",
      );
    const out: Record<string, string> = {};
    for (const key of ["name", "line1", "postalCode", "city", "country"])
      out[key] = safeHeader(String(recipient[key] ?? ""));
    out.country = out.country.toUpperCase();
    if (!["FR", "LU", "DE"].includes(out.country))
      throw new ContentError("COUNTRY_NOT_ALLOWED", "Pays non autorisé.");
    if (Object.values(out).some((v) => v.length > 160))
      throw new ContentError("INVALID_ADDRESS", "Adresse trop longue.");
    return out;
  }
  throw new ContentError("INVALID_CHANNEL", "Canal inconnu.");
}
export function validateCsv(csv: string) {
  boundedText(csv, LIMITS.csvBytes);
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const fields = parsed.meta.fields ?? [];
  const allowed = [
    "channel",
    "email",
    "phone",
    "name",
    "line1",
    "postalCode",
    "city",
    "country",
  ];
  if (fields.some((f) => !allowed.includes(f)) || !fields.includes("channel"))
    throw new ContentError(
      "INVALID_CSV_HEADERS",
      `Colonnes autorisées : ${allowed.join(", ")}.`,
    );
  if (parsed.data.length > LIMITS.campaignRows)
    throw new ContentError(
      "CAMPAIGN_TOO_LARGE",
      `Maximum ${LIMITS.campaignRows} lignes par import.`,
      413,
    );
  const errors: Array<{ line: number; message: string }> = parsed.errors.map(
    (e) => ({ line: (e.row ?? 0) + 2, message: e.message }),
  );
  const rows: Array<{
    line: number;
    channel: string;
    recipient: Record<string, string>;
  }> = [];
  const duplicates: Array<{ line: number; duplicateOf: number }> = [];
  const seen = new Map<string, number>();
  parsed.data.forEach((row, index) => {
    const line = index + 2;
    try {
      if (
        Object.values(row).some(
          (v) => /^[\s]*[=+@-]/.test(v) && !/^\+\d[\d ()-]*$/.test(v),
        )
      )
        throw new Error("Formule CSV interdite.");
      const channel = row.channel.trim().toLowerCase();
      const recipient = validateRecipient(channel, row);
      const key = JSON.stringify({ channel, recipient });
      if (seen.has(key)) duplicates.push({ line, duplicateOf: seen.get(key)! });
      else seen.set(key, line);
      rows.push({ line, channel, recipient });
    } catch (e) {
      errors.push({
        line,
        message: e instanceof Error ? e.message : "Ligne invalide.",
      });
    }
  });
  return {
    rows,
    errors,
    duplicates,
    valid: errors.length === 0 && duplicates.length === 0,
  };
}
