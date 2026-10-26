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
    throw new ContentError(code, "Content exceeds the allowed limit.", 413);
}
export function safeHeader(value: string): string {
  if (!value.trim() || /[\r\n\x00-\x1f\x7f]/.test(value))
    throw new ContentError("INVALID_HEADER", "Invalid header.");
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

export const DOCUMENT_URL_PLACEHOLDER = "{{document_url}}";
const emailColor =
  /^(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?|black|white|transparent|inherit)$/i;
const emailLength = /^(?:0|(?:\d{1,3}(?:\.\d{1,2})?)(?:px|pt|em|rem|%))$/i;
const emailSpacing =
  /^(?:0|(?:\d{1,3}(?:\.\d{1,2})?)(?:px|pt|em|rem))(?:\s+(?:0|(?:\d{1,3}(?:\.\d{1,2})?)(?:px|pt|em|rem))){0,3}$/i;
const emailBorder =
  /^(?:0|none|\d{1,2}px\s+(?:solid|dashed|dotted)\s+(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?|black|white|transparent))$/i;
const emailStyles = {
  color: [emailColor],
  "background-color": [emailColor],
  "font-family": [
    /^(?:(?:Arial|Helvetica|Georgia|Verdana|Tahoma|Times New Roman|sans-serif|serif|monospace)(?:,\s*)?)+$/i,
  ],
  "font-size": [/^\d{1,2}(?:\.\d{1,2})?(?:px|pt|em|rem|%)$/i],
  "font-weight": [/^(?:normal|bold|[1-9]00)$/],
  "font-style": [/^(?:normal|italic)$/],
  "line-height": [/^(?:normal|[0-9](?:\.\d{1,2})?|\d{1,2}(?:px|pt))$/i],
  "text-align": [/^(?:left|right|center|justify)$/],
  "text-decoration": [/^(?:none|underline|line-through)$/],
  "vertical-align": [/^(?:top|middle|bottom|baseline)$/],
  display: [/^(?:block|inline|inline-block|table|table-row|table-cell)$/],
  padding: [emailSpacing],
  margin: [emailSpacing],
  "padding-top": [emailLength],
  "padding-right": [emailLength],
  "padding-bottom": [emailLength],
  "padding-left": [emailLength],
  "margin-top": [emailLength],
  "margin-right": [emailLength],
  "margin-bottom": [emailLength],
  "margin-left": [emailLength],
  border: [emailBorder],
  "border-top": [emailBorder],
  "border-right": [emailBorder],
  "border-bottom": [emailBorder],
  "border-left": [emailBorder],
  "border-radius": [emailLength],
  width: [emailLength],
  "max-width": [emailLength],
  "border-collapse": [/^(?:collapse|separate)$/],
  "border-spacing": [emailSpacing],
};
const markerSyntax =
  /\{+\s*document(?:[^a-z0-9]|$)|\bdocument_[a-z0-9_]*\s*\}+/i;
const decodedMarkerBraces = (value: string) =>
  value
    .replace(/&#(?:0*123|x0*7b);?/gi, "{")
    .replace(/&#(?:0*125|x0*7d);?/gi, "}");

/** Reject unresolved template syntax in places that cannot receive the private URL. */
export function assertNoDocumentUrlPlaceholder(value: string): void {
  if (markerSyntax.test(decodedMarkerBraces(value)))
    throw new ContentError(
      "INVALID_DOCUMENT_URL_PLACEHOLDER",
      "Use {{document_url}} only as the exact href of an HTML anchor.",
    );
}

/** Email-only CSS allowlist. Document rendering keeps the stricter cleanHtml. */
export function cleanEmailHtml(
  input: string,
  options: { allowDocumentUrlPlaceholder?: boolean; documentUrl?: string } = {},
): { html: string; hasDocumentUrlPlaceholder: boolean } {
  boundedText(input, LIMITS.htmlBytes);
  const markerCount = input.split(DOCUMENT_URL_PLACEHOLDER).length - 1;
  assertNoDocumentUrlPlaceholder(
    input.replaceAll(DOCUMENT_URL_PLACEHOLDER, ""),
  );
  if (options.documentUrl && !/^https:\/\//i.test(options.documentUrl))
    throw new ContentError(
      "INVALID_DOCUMENT_URL",
      "The protected document URL is invalid.",
    );
  let resolved = 0;
  const html = sanitizeHtml(input, {
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
      "tfoot",
      "tr",
      "td",
      "th",
      "hr",
      "a",
      "span",
      "div",
    ],
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "rel", "style"],
      table: [
        "role",
        "width",
        "cellpadding",
        "cellspacing",
        "border",
        "align",
        "style",
      ],
      td: ["colspan", "rowspan", "align", "valign", "width", "style"],
      th: ["colspan", "rowspan", "align", "valign", "width", "style"],
    },
    allowedStyles: { "*": emailStyles },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    transformTags: {
      "*": (tagName, attributes) => {
        const attribs = { ...attributes };
        for (const [name, value] of Object.entries(attribs)) {
          if (
            tagName === "a" &&
            name === "href" &&
            value === DOCUMENT_URL_PLACEHOLDER
          ) {
            if (!options.allowDocumentUrlPlaceholder && !options.documentUrl)
              throw new ContentError(
                "DOCUMENT_URL_NOT_AVAILABLE",
                "The document URL placeholder requires protected-link email.",
              );
            resolved += 1;
            attribs.href = options.documentUrl ?? DOCUMENT_URL_PLACEHOLDER;
          } else assertNoDocumentUrlPlaceholder(value);
        }
        if (tagName === "a") {
          if (
            attribs.href &&
            (/^(https:\/\/|mailto:)/i.test(attribs.href) ||
              attribs.href === DOCUMENT_URL_PLACEHOLDER)
          )
            attribs.rel = "noopener noreferrer";
          else delete attribs.href;
        }
        return { tagName, attribs };
      },
    },
    textFilter: (text) => {
      assertNoDocumentUrlPlaceholder(text);
      return text;
    },
    exclusiveFilter: (frame) => {
      if (
        frame.tag === "a" &&
        (frame.attribs.href === DOCUMENT_URL_PLACEHOLDER ||
          (options.documentUrl &&
            frame.attribs.href === options.documentUrl)) &&
        !frame.text.trim()
      )
        throw new ContentError(
          "INVALID_DOCUMENT_URL_PLACEHOLDER",
          "The protected document link must have a readable label.",
        );
      return false;
    },
    disallowedTagsMode: "discard",
    nonTextTags: ["style", "script", "textarea", "option", "noscript"],
    enforceHtmlBoundary: false,
  });
  if (resolved !== markerCount)
    throw new ContentError(
      "INVALID_DOCUMENT_URL_PLACEHOLDER",
      "Use {{document_url}} only as the exact href of an HTML anchor.",
    );
  return { html, hasDocumentUrlPlaceholder: resolved > 0 };
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>@page{size:A4;margin:22mm}body{font-family:Arial,sans-serif;color:#171b24;font-size:11pt;line-height:1.55;overflow-wrap:anywhere}h1{font-size:25pt}h2{font-size:18pt}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #aaa;padding:6px}img{max-width:100%}a{color:#1746c2}</style></head><body>${cleanHtml(html)}</body></html>`;
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
        "An additional address line is not supported in this flow. It will not be silently removed.",
      );
    const out: Record<string, string> = {};
    for (const key of ["name", "line1", "postalCode", "city", "country"])
      out[key] = safeHeader(String(recipient[key] ?? ""));
    out.country = out.country.toUpperCase();
    if (!["FR", "LU", "DE"].includes(out.country))
      throw new ContentError(
        "COUNTRY_NOT_ALLOWED",
        "This country is not supported.",
      );
    if (Object.values(out).some((v) => v.length > 160))
      throw new ContentError("INVALID_ADDRESS", "The address is too long.");
    return out;
  }
  throw new ContentError("INVALID_CHANNEL", "Unknown delivery channel.");
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
      `Allowed columns: ${allowed.join(", ")}.`,
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
        throw new Error("CSV formulas are not allowed.");
      const channel = row.channel.trim().toLowerCase();
      const recipient = validateRecipient(channel, row);
      const key = JSON.stringify({ channel, recipient });
      if (seen.has(key)) duplicates.push({ line, duplicateOf: seen.get(key)! });
      else seen.set(key, line);
      rows.push({ line, channel, recipient });
    } catch (e) {
      errors.push({
        line,
        message: e instanceof Error ? e.message : "Invalid row.",
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
