import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { DomainError } from "../../../packages/domain/src/index";
import type {
  AdministrationExportDataset,
  AdministrationExportFormat,
  AdministrationPeriod,
  AdministrationWorkspace,
} from "../../../packages/contracts/src/administration";
import {
  ADMINISTRATION_EXPORT_ROW_LIMIT,
  ADMINISTRATION_PDF_MAX_ROWS,
} from "../../../packages/contracts/src/administration";
import type { SupportedLocale } from "../../../packages/contracts/src/locale";
import type { AdministrationExportData } from "./administration";
import catalog from "./locales/administration-exports.json";

type CellType = "text" | "code" | "integer" | "money" | "datetime" | "boolean";
type Scalar = string | number | boolean | null;
/** A value typed apart from its column, as in the report summary. */
type Typed = { value: Scalar; type: CellType };
type Cell = Scalar | Typed;
type Column = { label: string; type: CellType };
type Table = { title: string; columns: Column[]; rows: Cell[][] };
const typed = (value: Scalar, type: CellType): Typed => ({ value, type });
/** The value and type a cell renders with. */
function resolve(cell: Cell, column: Column): [Scalar, CellType] {
  return cell !== null && typeof cell === "object"
    ? [cell.value, cell.type]
    : [cell, column.type];
}

// Bound the complete report, not merely each query. This limits synchronous
// serialization, string copies, ZIP buffers and PDF allocation in one request.
const EXPORT_CELL_LIMIT = 4_096;
const EXPORT_TEXT_LIMIT = 4 * 1024 * 1024;
const translations = catalog as Record<string, readonly string[]>;

function translator(locale: SupportedLocale) {
  return (source: string, ...values: (string | number)[]) => {
    const entry = translations[source];
    const text =
      locale === "en" || !entry
        ? source
        : (entry[{ fr: 0, de: 1, lb: 2 }[locale]] ?? source);
    return text.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
      Number(index) < values.length
        ? String(values[Number(index)])
        : placeholder,
    );
  };
}

/** Exact decimal from integer minor units; no floating-point rounding. */
export function minorToDecimal(minor: number) {
  if (!Number.isSafeInteger(minor))
    throw new DomainError(
      "INVALID_REPORT_AMOUNT",
      "Report amounts must be safe integer minor units.",
      422,
    );
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

const codeLabels: Record<string, string> = {
  email: "Email",
  fax: "Fax",
  postal: "Postal mail",
  unknown: "Unknown",
  prepared: "Prepared",
  queued: "Queued",
  submitting: "Submitting",
  submission_unknown: "Outcome unknown",
  accepted: "Accepted",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
  bounced: "Bounced",
  complained: "Complaint",
  printed: "Printed",
  handed_to_post: "Handed to the post",
  admin: "Administrator",
  supervisor: "Supervisor",
  member: "Member",
  viewer: "Observer",
  browser: "Browser",
  native: "Mobile app",
  mcp: "Assistant (MCP)",
  dispatch: "Dispatches",
  pdf_check: "PDF checks",
  secure_distribution: "Secure distribution",
  legacy_plan: "Legacy plan",
  none: "No document",
  attachment: "Attachment",
  protected_link: "Protected link",
  current_access: "Current access",
  sign_in: "Sign-in",
};

function tables(
  dataset: AdministrationExportDataset,
  input: ExportInput,
  t: ReturnType<typeof translator>,
): Table[] {
  const { data } = input;
  const result: Table[] = [];
  const overview = data.overview;
  if (overview) {
    const totals = overview.totals;
    result.push({
      title: t("Summary"),
      columns: [
        { label: t("Indicator"), type: "text" },
        { label: t("Value"), type: "text" },
      ],
      rows: [
        [t("Workspace"), input.workspace.name],
        [
          t("Mode"),
          t(
            input.workspace.mode === "production" ? "Production" : "Simulation",
          ),
        ],
        [t("Period"), `${input.period.from} – ${input.period.to}`],
        [t("Generated (UTC)"), typed(input.generatedAt, "datetime")],
        [t("Dispatches"), typed(totals.dispatches, "integer")],
        [t("Delivered"), typed(totals.delivered, "integer")],
        [t("Needing attention"), typed(totals.attention, "integer")],
        [t("Pages"), typed(totals.pages, "integer")],
        [t("Consumption (EUR)"), typed(totals.consumptionMinor, "money")],
        [t("Reserved (EUR)"), typed(totals.reservedMinor, "money")],
        [t("Documents imported"), typed(totals.documents, "integer")],
        [t("Secure shares activated"), typed(totals.secureShares, "integer")],
        [t("Members"), typed(totals.members, "integer")],
        [t("Active access"), typed(totals.activeConnections, "integer")],
        ...(overview.credit
          ? [
              [
                t("Promotional credit available (EUR)"),
                typed(overview.credit.availableMinor, "money"),
              ],
            ]
          : []),
      ],
    });
    result.push({
      title: t("Channels"),
      columns: [
        { label: t("Channel"), type: "code" },
        { label: t("Dispatches"), type: "integer" },
        { label: t("Consumption (EUR)"), type: "money" },
        { label: t("Reserved (EUR)"), type: "money" },
      ],
      rows: overview.channels.map((row) => [
        row.channel,
        row.dispatches,
        row.consumptionMinor,
        row.reservedMinor,
      ]),
    });
    result.push({
      title: t("Statuses"),
      columns: [
        { label: t("Status"), type: "code" },
        { label: t("Dispatches"), type: "integer" },
      ],
      rows: overview.statuses.map((row) => [row.status, row.dispatches]),
    });
  }
  if (data.activity)
    result.push({
      title: t("Activity"),
      columns: [
        { label: t("Reference"), type: "text" },
        { label: t("Created (UTC)"), type: "datetime" },
        { label: t("Updated (UTC)"), type: "datetime" },
        { label: t("Channel"), type: "code" },
        { label: t("Status"), type: "code" },
        { label: t("Pages"), type: "integer" },
        { label: t("Email delivery"), type: "code" },
        { label: t("Destination country"), type: "text" },
        { label: t("Estimate (EUR)"), type: "money" },
        { label: t("Ceiling (EUR)"), type: "money" },
        { label: t("Consumption (EUR)"), type: "money" },
        { label: t("Reserved (EUR)"), type: "money" },
        { label: t("Approved by"), type: "text" },
        { label: t("Campaign"), type: "text" },
      ],
      rows: data.activity.map((row) => [
        row.id,
        row.createdAt,
        row.updatedAt,
        row.channel,
        row.status,
        row.pages,
        row.deliveryMode,
        row.destinationCountry,
        row.estimatedMinor,
        row.ceilingMinor,
        row.consumptionMinor,
        row.reservedMinor,
        row.approvedBy,
        row.campaignId,
      ]),
    });
  if (data.consumption) {
    // CSV keeps one table per file: the individual charges.
    if (input.format !== "csv") {
      result.push({
        title: t("Consumption by service"),
        columns: [
          { label: t("Service"), type: "code" },
          { label: t("Charges"), type: "integer" },
          { label: t("Amount (EUR)"), type: "money" },
        ],
        rows: data.consumption.services.map((row) => [
          row.service,
          row.charges,
          row.amountMinor,
        ]),
      });
      result.push({
        title: t("Consumption by channel"),
        columns: [
          { label: t("Channel"), type: "code" },
          { label: t("Dispatches"), type: "integer" },
          { label: t("Amount (EUR)"), type: "money" },
        ],
        rows: data.consumption.channels.map((row) => [
          row.channel,
          row.dispatches,
          row.consumptionMinor,
        ]),
      });
      result.push({
        title: t("Daily consumption"),
        columns: [
          { label: t("Date"), type: "text" },
          { label: t("Charges"), type: "integer" },
          { label: t("Amount (EUR)"), type: "money" },
        ],
        rows: data.consumption.daily.map((row) => [
          row.date,
          row.charges,
          row.amountMinor,
        ]),
      });
    }
    if (data.charges && (input.format !== "pdf" || dataset === "consumption"))
      result.push({
        title: t("Charges"),
        columns: [
          { label: t("Charged (UTC)"), type: "datetime" },
          { label: t("Service"), type: "code" },
          { label: t("Reference"), type: "text" },
          { label: t("Amount (EUR)"), type: "money" },
        ],
        rows: data.charges.map((row) => [
          row.chargedAt,
          row.service,
          row.dispatchId,
          row.amountMinor,
        ]),
      });
  }
  if (data.members)
    result.push({
      title: t("Members"),
      columns: [
        { label: t("Member"), type: "text" },
        { label: t("Email"), type: "text" },
        { label: t("Role"), type: "code" },
        { label: t("Can approve"), type: "boolean" },
        { label: t("Can read reports"), type: "boolean" },
        { label: t("Joined (UTC)"), type: "datetime" },
        { label: t("Active access"), type: "integer" },
        { label: t("Last seen (UTC)"), type: "datetime" },
        { label: t("Approvals in period"), type: "integer" },
        { label: t("Last activity (UTC)"), type: "datetime" },
      ],
      rows: data.members.map((row) => [
        row.name,
        row.email,
        row.role,
        row.canApprove,
        row.canReport,
        row.joinedAt,
        row.activeConnections,
        row.lastSeenAt,
        row.approvals,
        row.lastActivityAt,
      ]),
    });
  if (data.connections)
    result.push({
      title: t("Connections"),
      columns: [
        { label: t("Record"), type: "code" },
        { label: t("Access type"), type: "code" },
        { label: t("Member"), type: "text" },
        { label: t("Date"), type: "datetime" },
        { label: t("Expires (UTC)"), type: "datetime" },
        { label: t("Last seen (UTC)"), type: "datetime" },
      ],
      rows: [
        ...data.connections.current.items.map((row) => [
          "current_access",
          row.kind,
          row.userName,
          row.createdAt,
          row.expiresAt,
          row.lastSeenAt,
        ]),
        ...data.connections.events.items.map((row) => [
          "sign_in",
          row.kind,
          row.userName,
          row.occurredAt,
          null,
          null,
        ]),
      ],
    });
  if (data.audit)
    result.push({
      title: t("Audit log"),
      columns: [
        { label: t("Time (UTC)"), type: "datetime" },
        { label: t("Action"), type: "text" },
        { label: t("Actor"), type: "text" },
        { label: t("Resource"), type: "text" },
      ],
      rows: data.audit.map((row) => [
        row.createdAt,
        row.action,
        row.actor,
        row.resourceId,
      ]),
    });
  return result;
}

// ---- CSV -------------------------------------------------------------------

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
/** Spreadsheet applications evaluate these leading characters as formulas. */
const FORMULA_START = /^(?:[\t\r\n]|\s*[=+\-@])/;
function csvCell(value: Scalar, type: CellType) {
  if (value === null || value === undefined) return "";
  let text =
    type === "money" && typeof value === "number"
      ? minorToDecimal(value)
      : type === "boolean"
        ? value
          ? "true"
          : "false"
        : String(value);
  if (type !== "money" && type !== "integer" && FORMULA_START.test(text))
    text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csv(table: Table) {
  const lines = [
    table.columns.map((column) => csvCell(column.label, "text")).join(","),
    ...table.rows.map((row) =>
      row
        .map((value, index) => csvCell(...resolve(value, table.columns[index])))
        .join(","),
    ),
  ];
  // The byte-order mark lets spreadsheet applications detect UTF-8.
  return `${BYTE_ORDER_MARK}${lines.join("\r\n")}\r\n`;
}

// ---- XLSX (Office Open XML) ------------------------------------------------

// Characters XML 1.0 cannot carry at all are dropped.
const xmlCharacter = (character: string) => {
  const code = character.codePointAt(0) ?? 0;
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
};
const xml = (value: string) =>
  Array.from(value)
    .filter(xmlCharacter)
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function columnName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
const excelSerial = (iso: string) => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time / 86_400_000 + 25_569 : null;
};
function sheetName(title: string, used: Set<string>) {
  const base =
    title
      .replace(/[[\]:*?/\\]/g, " ")
      .slice(0, 31)
      .trim() || "Sheet";
  let name = base,
    suffix = 2;
  while (used.has(name.toLowerCase()))
    name = `${base.slice(0, 28)} ${suffix++}`;
  used.add(name.toLowerCase());
  return name;
}
function sheetXml(table: Table, label: (code: string) => string) {
  const shown = (value: Scalar, type: CellType) =>
    type === "boolean"
      ? label(value ? "Yes" : "No")
      : type === "code"
        ? label(codeLabels[String(value)] ?? String(value))
        : String(value);
  const cell = (value: Scalar, type: CellType, ref: string, style = 0) => {
    if (value === null || value === undefined) return "";
    if (type === "money" && typeof value === "number")
      return `<c r="${ref}" s="2"><v>${minorToDecimal(value)}</v></c>`;
    if (type === "integer" && typeof value === "number")
      return `<c r="${ref}" s="4"><v>${Math.trunc(value)}</v></c>`;
    if (type === "datetime" && typeof value === "string") {
      const serial = excelSerial(value);
      if (serial !== null) return `<c r="${ref}" s="3"><v>${serial}</v></c>`;
    }
    const text = shown(value, type);
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  };
  const header = table.columns
    .map((column, index) =>
      cell(column.label, "text", `${columnName(index)}1`, 1),
    )
    .join("");
  const body = table.rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 2}">${row
          .map((value, index) =>
            cell(
              ...resolve(value, table.columns[index]),
              `${columnName(index)}${rowIndex + 2}`,
            ),
          )
          .join("")}</row>`,
    )
    .join("");
  // Fit each column to its longest label or value, within a readable bound.
  const longest = table.columns.map((column) => column.label.length);
  for (const row of table.rows)
    row.forEach((item, index) => {
      const [value, type] = resolve(item, table.columns[index]);
      if (value === null || value === undefined) return;
      const length =
        type === "datetime"
          ? 16
          : type === "money" && typeof value === "number"
            ? minorToDecimal(value).length + 3
            : type === "integer"
              ? String(value).length + 2
              : shown(value, type).length;
      if (length > longest[index]) longest[index] = length;
    });
  const widths = longest
    .map((length, index) => {
      const width = Math.min(60, Math.max(10, length + 2));
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");
  const last = `${columnName(table.columns.length - 1)}${table.rows.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData><row r="1">${header}</row>${body}</sheetData>${table.rows.length ? `<autoFilter ref="A1:${last}"/>` : ""}</worksheet>`;
}
function xlsx(sheets: Table[], label: (code: string) => string) {
  const used = new Set<string>();
  const names = sheets.map((sheet) => sheetName(sheet.title, used));
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    // 0 default · 1 bold header · 2 money · 3 UTC date-time · 4 integer
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet, label);
  });
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, content]) => [name, strToU8(content)]),
    ),
    { level: 1, mtime: new Date("2026-01-01T00:00:00Z") },
  );
}

// ---- PDF -------------------------------------------------------------------

// The standard fonts draw WinAnsi only. Product copy in the four languages
// stays within it; names and workspace text outside it use the embedded
// Unicode font, loaded only for the files that need it.
const OUTSIDE_WIN_ANSI =
  /[^\u0020-\u007E\u00A0-\u00FF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;
const OUTSIDE_WIN_ANSI_ALL = new RegExp(OUTSIDE_WIN_ANSI.source, "g");
const flatText = (value: string) => value.replace(/\s+/g, " ");
type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
  unicode: { font: PDFFont; text: (value: string) => string } | null;
};
/** The font and drawable text for one string, keeping bold where possible. */
function pdfRun(value: string, fonts: PdfFonts, standard: PDFFont) {
  const flat = flatText(value);
  if (!OUTSIDE_WIN_ANSI.test(flat)) return { text: flat, font: standard };
  if (fonts.unicode)
    return { text: fonts.unicode.text(flat), font: fonts.unicode.font };
  return { text: flat.replace(OUTSIDE_WIN_ANSI_ALL, "?"), font: standard };
}
/** Words, also broken after hyphens, each marking a preceding space. */
function tokens(text: string) {
  return text
    .split(" ")
    .flatMap((word) =>
      word.split(/(?<=-)/).map((part, index) => ({ part, space: index === 0 })),
    );
}
/** At most `lines` lines broken at spaces and hyphens; the last is shortened. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
  lines: number,
) {
  if (lines === 1) return [fit(text, font, size, width)];
  const result: string[] = [];
  let current = "";
  for (const { part, space } of tokens(text)) {
    const next = current ? `${current}${space ? " " : ""}${part}` : part;
    if (!current || font.widthOfTextAtSize(next, size) <= width) current = next;
    else {
      result.push(current);
      current = part;
    }
  }
  result.push(current);
  return [...result.slice(0, lines - 1), result.slice(lines - 1).join(" ")]
    .slice(0, result.length)
    .map((line) => fit(line, font, size, width));
}
/**
 * Integer water-filling: every table receives up to the same share of the
 * row budget, so small tables print whole and the largest share the rest.
 */
export function pdfRowShares(sizes: readonly number[], budget: number) {
  const shares = sizes.map(() => 0);
  let remaining = budget;
  let open = sizes.flatMap((size, index) => (size > 0 ? [index] : []));
  while (remaining > 0 && open.length) {
    const each = Math.max(1, Math.floor(remaining / open.length));
    for (const index of open) {
      const grant = Math.min(each, sizes[index] - shares[index], remaining);
      shares[index] += grant;
      remaining -= grant;
    }
    open = open.filter((index) => shares[index] < sizes[index]);
  }
  return shares;
}
/** Widths from content: spare room is spread, overflow trims the widest. */
function columnWidths(natural: number[], available: number) {
  const total = natural.reduce((sum, value) => sum + value, 0);
  if (total <= available)
    return natural.map((value) => (value * available) / total);
  const sorted = [...natural].sort((a, b) => a - b);
  let remaining = available,
    cap = available / natural.length;
  for (const [index, value] of sorted.entries()) {
    const each = remaining / (sorted.length - index);
    if (value >= each) {
      cap = each;
      break;
    }
    remaining -= value;
  }
  return natural.map((value) => Math.min(value, cap));
}
function fit(text: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let low = 0,
    high = text.length;
  while (low < high) {
    const end = Math.ceil((low + high) / 2);
    if (font.widthOfTextAtSize(`${text.slice(0, end)}…`, size) <= width)
      low = end;
    else high = end - 1;
  }
  return `${text.slice(0, low)}…`;
}
async function pdf(
  title: string,
  input: ExportInput,
  sheets: Table[],
  t: ReturnType<typeof translator>,
) {
  const document = await PDFDocument.create();
  document.setTitle(`${input.workspace.name} · ${title}`);
  document.setProducer("Guteneo");
  document.setCreationDate(new Date(input.generatedAt));
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const fonts: PdfFonts = { regular, bold, unicode: null };
  const [width, height] = [841.89, 595.28];
  const margin = 36;
  const ink = rgb(0.09, 0.1, 0.13),
    muted = rgb(0.36, 0.37, 0.41),
    line = rgb(0.85, 0.85, 0.82),
    accent = rgb(0.13, 0.27, 0.69);
  const locale = input.locale === "lb" ? "de-LU" : input.locale;
  const number = new Intl.NumberFormat(locale);
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  });
  const exactMoney = (value: number) => {
    const cents = BigInt(value),
      absolute = cents < 0n ? -cents : cents;
    return money
      .formatToParts(value < 0 ? -1 : 1)
      .map((part) =>
        part.type === "integer"
          ? number.format(absolute / 100n)
          : part.type === "fraction"
            ? String(absolute % 100n).padStart(2, "0")
            : part.value,
      )
      .join("");
  };
  // Four-digit years and a 24-hour clock read the same in every language.
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  const day = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const display = (cell: Cell, column: Column) => {
    const [value, type] = resolve(cell, column);
    if (value === null || value === undefined || value === "") return "—";
    if (type === "money" && typeof value === "number") return exactMoney(value);
    if (type === "integer" && typeof value === "number")
      return number.format(value);
    if (type === "boolean") return t(value ? "Yes" : "No");
    if (type === "code") return t(codeLabels[String(value)] ?? String(value));
    if (type === "datetime" && typeof value === "string") {
      const time = Date.parse(value);
      return Number.isFinite(time) ? dateTime.format(time) : value;
    }
    return String(value);
  };
  const shares = pdfRowShares(
    sheets.map((table) => table.rows.length),
    ADMINISTRATION_PDF_MAX_ROWS,
  );
  const drawnRows = sheets.map((table, tableIndex) =>
    table.rows
      .slice(0, shares[tableIndex])
      .map((row) =>
        row.map((value, index) => display(value, table.columns[index])),
      ),
  );
  if (
    [
      input.workspace.name,
      ...sheets.flatMap((table) => [
        table.title,
        ...table.columns.map((column) => column.label),
      ]),
      ...drawnRows.flat(2),
    ].some((value) => OUTSIDE_WIN_ANSI.test(flatText(value)))
  )
    fonts.unicode = await (
      await import("./administration-pdf-font")
    ).embedUnicodeFont(document);
  let page = document.addPage([width, height]);
  let y = height - margin;
  const newPage = () => {
    page = document.addPage([width, height]);
    y = height - margin;
  };
  const write = (
    text: string,
    options: { font?: PDFFont; size?: number; color?: typeof ink; x?: number },
  ) => {
    const size = options.size ?? 9;
    const run = pdfRun(text, fonts, options.font ?? regular);
    page.drawText(fit(run.text, run.font, size, width - 2 * margin), {
      x: options.x ?? margin,
      y,
      size,
      font: run.font,
      color: options.color ?? ink,
    });
  };
  write(`guteneo · ${input.workspace.name}`, { font: bold, size: 18 });
  y -= 22;
  write(title, { font: bold, size: 12, color: accent });
  y -= 16;
  write(
    `${t(
      "Period: {0} – {1}",
      day.format(Date.parse(`${input.period.from}T00:00:00Z`)),
      day.format(Date.parse(`${input.period.to}T00:00:00Z`)),
    )} · ${t(
      "Generated (UTC): {0}",
      dateTime.format(Date.parse(input.generatedAt)),
    )}`,
    { color: muted },
  );
  y -= 13;
  if (input.workspace.mode === "simulation") {
    write(
      t(
        "Simulation workspace: fictional activity, no real delivery or charge.",
      ),
      { font: bold, color: accent },
    );
    y -= 13;
  }
  write(
    t(
      "Consumption uses posted charge dates; dispatch counts use creation dates. No recipient, document title or message content is included.",
    ),
    { color: muted, size: 8 },
  );
  y -= 22;
  const rowHeight = 14;
  const measure = (value: string, font: PDFFont) => {
    const run = pdfRun(value, fonts, font);
    return run.font.widthOfTextAtSize(run.text, 8);
  };
  for (const [tableIndex, table] of sheets.entries()) {
    if (y < margin + 60) newPage();
    write(table.title, { font: bold, size: 11 });
    y -= 16;
    const rows = drawnRows[tableIndex];
    // A header needs its longest word and may use two lines; a value one.
    const widths = columnWidths(
      table.columns.map(
        (column, index) =>
          6 +
          Math.max(
            measure(column.label, bold) / 2,
            ...tokens(flatText(column.label)).map(({ part }) =>
              measure(part, bold),
            ),
            ...rows.map((row) => measure(row[index], regular)),
          ),
      ),
      width - 2 * margin,
    );
    // Headers may take two lines; values keep one line per row.
    const drawRow = (
      cells: string[],
      font: PDFFont,
      color = ink,
      lines = 1,
    ) => {
      const runs = cells.map((text, index) => {
        const run = pdfRun(text, fonts, font);
        return {
          font: run.font,
          lines: wrap(run.text, run.font, 8, widths[index] - 6, lines),
        };
      });
      const extra = (Math.max(...runs.map((run) => run.lines.length)) - 1) * 9;
      let x = margin;
      runs.forEach((run, index) => {
        run.lines.forEach((text, position) =>
          page.drawText(text, {
            x,
            y: y - position * 9,
            size: 8,
            font: run.font,
            color,
          }),
        );
        x += widths[index];
      });
      page.drawLine({
        start: { x: margin, y: y - extra - 4 },
        end: { x: width - margin, y: y - extra - 4 },
        thickness: 0.5,
        color: line,
      });
      y -= rowHeight + extra;
    };
    const header = () =>
      drawRow(
        table.columns.map((column) => column.label),
        bold,
        muted,
        2,
      );
    header();
    if (!table.rows.length) {
      write(t("No rows for this period."), { color: muted, size: 8 });
      y -= rowHeight;
    }
    const shown = rows.length;
    for (const row of rows) {
      if (y < margin + rowHeight) {
        newPage();
        header();
      }
      drawRow(row, regular);
    }
    if (table.rows.length > shown) {
      if (y < margin + rowHeight) newPage();
      write(
        t(
          "Showing the first {0} of {1} rows. Use the Excel or CSV export for the complete list.",
          number.format(shown),
          number.format(table.rows.length),
        ),
        { color: accent, size: 8 },
      );
      y -= rowHeight;
    }
    y -= 12;
  }
  const pages = document.getPages();
  pages.forEach((current, index) =>
    current.drawText(t("Page {0} of {1}", index + 1, pages.length), {
      x: width - margin - 80,
      y: margin / 2,
      size: 8,
      font: regular,
      color: muted,
    }),
  );
  return document.save();
}

type ExportInput = {
  dataset: AdministrationExportDataset;
  format: AdministrationExportFormat;
  locale: SupportedLocale;
  workspace: AdministrationWorkspace;
  period: AdministrationPeriod;
  generatedAt: string;
  data: AdministrationExportData;
};

const datasetTitles: Record<AdministrationExportDataset, string> = {
  report: "Workspace report",
  activity: "Activity",
  consumption: "Consumption",
  members: "Members",
  connections: "Connections",
  audit: "Audit log",
};

export async function renderAdministrationExport(input: ExportInput) {
  const t = translator(input.locale);
  if (input.format === "csv" && input.dataset === "report")
    throw new DomainError(
      "EXPORT_FORMAT_UNAVAILABLE",
      "A CSV file holds one table. Choose Excel or PDF for the full report.",
      400,
    );
  const sheets = tables(input.dataset, input, t);
  const rows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  const encoder = new TextEncoder();
  let bytes = encoder.encode(input.workspace.name).length;
  if (
    input.workspace.name.length > EXPORT_CELL_LIMIT ||
    rows > ADMINISTRATION_EXPORT_ROW_LIMIT
  )
    throw new DomainError(
      "EXPORT_TOO_LARGE",
      "Choose a shorter period or a single export dataset.",
      422,
    );
  for (const sheet of sheets)
    for (const row of sheet.rows)
      for (const [index, item] of row.entries()) {
        const [value, type] = resolve(item, sheet.columns[index]);
        if (typeof value === "number" && !Number.isSafeInteger(value))
          throw new DomainError(
            "INVALID_REPORT_AMOUNT",
            "Report values must be safe integers.",
            422,
          );
        if (
          input.format === "xlsx" &&
          type === "money" &&
          typeof value === "number" &&
          Math.abs(value) > 999_999_999_999_999
        )
          throw new DomainError(
            "INVALID_REPORT_AMOUNT",
            "This amount exceeds spreadsheet numeric precision. Use CSV.",
            422,
          );
        const text = value === null ? "" : String(value);
        bytes += encoder.encode(text).length;
        if (text.length > EXPORT_CELL_LIMIT || bytes > EXPORT_TEXT_LIMIT)
          throw new DomainError(
            "EXPORT_TOO_LARGE",
            "This export exceeds its text limit. Choose a shorter period or a single dataset.",
            422,
          );
      }
  const slug = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .toLowerCase() || "workspace";
  const base = `guteneo-${slug(input.workspace.name)}-${input.dataset}-${input.period.from}-${input.period.to}${input.workspace.mode === "simulation" ? "-simulation" : ""}`;
  if (input.format === "csv")
    return {
      body: csv(sheets[0]),
      contentType: "text/csv; charset=utf-8",
      filename: `${base}.csv`,
      rows,
    };
  if (input.format === "xlsx")
    return {
      body: xlsx(sheets, (code) => t(code)),
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${base}.xlsx`,
      rows,
    };
  return {
    body: await pdf(t(datasetTitles[input.dataset]), input, sheets, t),
    contentType: "application/pdf",
    filename: `${base}.pdf`,
    rows,
  };
}
