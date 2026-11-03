import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  minorToDecimal,
  renderAdministrationExport,
} from "../../apps/api/src/administration-exports";
import type { AdministrationExportData } from "../../apps/api/src/administration";

const empty: AdministrationExportData = {
  overview: null,
  activity: null,
  consumption: null,
  charges: null,
  members: null,
  connections: null,
  audit: null,
};
const input = (
  format: "csv" | "xlsx" | "pdf",
  data: Partial<AdministrationExportData>,
  dataset: "members" | "audit" | "report" | "consumption" = "members",
) => ({
  format,
  dataset,
  locale: "en" as const,
  workspace: {
    id: "synthetic",
    name: "Synthetic workspace",
    mode: "production" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  period: { from: "2026-01-01", to: "2026-01-31" },
  generatedAt: "2026-02-01T00:00:00.000Z",
  data: { ...empty, ...data },
});
const member = (name: string) => ({
  userId: "synthetic",
  name,
  email: "fictional@example.invalid",
  role: "admin",
  canApprove: true,
  canReport: true,
  joinedAt: "2026-01-01T12:30:00.000Z",
  activeConnections: 2,
  lastSeenAt: null,
  approvals: 3,
  lastActivityAt: null,
});
const audits = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `audit_${i}`,
    action: "synthetic.action",
    actor: "Synthetic member",
    resourceId: `ROW_${String(i + 1).padStart(5, "0")}`,
    createdAt: "2026-01-01T12:30:00.000Z",
  }));
async function pdfText(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  const streams = document.context
    .enumerateIndirectObjects()
    .filter(([, object]) => object instanceof PDFRawStream)
    .map(([, object]) =>
      new TextDecoder().decode(
        decodePDFRawStream(object as PDFRawStream).decode(),
      ),
    );
  return {
    pages: document.getPageCount(),
    text: streams
      .flatMap((stream) =>
        [...stream.matchAll(/<([\da-f]+)> Tj/gi)].map((match) =>
          Buffer.from(match[1], "hex").toString("latin1"),
        ),
      )
      .join("\n"),
  };
}

describe("bounded administration serializers", () => {
  it("preserves large safe-integer cents in PDF/CSV and refuses XLSX precision loss", async () => {
    const value = Number.MAX_SAFE_INTEGER;
    const data: Partial<AdministrationExportData> = {
      consumption: {
        generatedAt: "2026-02-01T00:00:00.000Z",
        period: { from: "2026-01-01", to: "2026-01-31" },
        basis: "posted_ledger",
        totalMinor: value,
        reservedMinor: 0,
        credit: null,
        services: [{ service: "pdf_check", charges: 1, amountMinor: value }],
        channels: [],
        daily: [],
        monthly: [],
      },
      charges: [
        {
          chargedAt: "2026-01-01T00:00:00.000Z",
          service: "pdf_check",
          dispatchId: null,
          amountMinor: value,
        },
      ],
    };
    const rendered = await renderAdministrationExport(
      input("pdf", data, "consumption"),
    );
    const text = (await pdfText(rendered.body as Uint8Array)).text;
    expect(text).toContain("90,071,992,547,409.91");
    expect(text).not.toContain("90,071,992,547,409.90");
    expect(
      (await renderAdministrationExport(input("csv", data, "consumption")))
        .body,
    ).toContain("90071992547409.91");
    await expect(
      renderAdministrationExport(input("xlsx", data, "consumption")),
    ).rejects.toMatchObject({ code: "INVALID_REPORT_AMOUNT" });
  });
  it("refuses unsafe monetary values rather than rounding or emitting invalid numbers", () => {
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(() => minorToDecimal(value)).toThrow();
    expect(minorToDecimal(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
    expect(minorToDecimal(-101)).toBe("-1.01");
  });
  it("guards CSV formulas after whitespace and quotes commas, newlines and quotes", async () => {
    const names = [
      "=1+1",
      "+SUM(1,2)",
      "-1+2",
      "@SUM(1,2)",
      "\t=1",
      "\r=1",
      "\n=1",
      "  =1",
      'ordinary,"quoted"\nname',
    ];
    const result = await renderAdministrationExport(
      input("csv", { members: names.map(member) }),
    );
    expect(typeof result.body).toBe("string");
    const csv = result.body as string;
    for (const name of names.slice(0, -1))
      expect(csv).toContain(("'" + name).replaceAll('"', '""'));
    expect(csv).toContain('"ordinary,""quoted""\nname"');
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("produces valid OOXML with inline formula-like text, typed numeric cells and sheet relationships", async () => {
    const result = await renderAdministrationExport(
      input("xlsx", { members: [member("=SUM(1,2)<>&\u0000\ud800")] }),
    );
    const files = unzipSync(result.body as Uint8Array);
    for (const [name, bytes] of Object.entries(files))
      if (name.endsWith(".xml") || name.endsWith(".rels"))
        expect(XMLValidator.validate(strFromU8(bytes)), name).toBe(true);
    const source = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(source).not.toMatch(/<f[ >]/);
    expect(source).toContain('r="A2" t="inlineStr"');
    expect(source).toContain("=SUM(1,2)&lt;&gt;&amp;");
    expect(source).not.toMatch(/\u0000|\ud800/);
    expect(source).toContain('<c r="G2" s="4"><v>2</v></c>');
    expect(source).toContain('<autoFilter ref="A1:J2"/>');
    const parser = new XMLParser({ ignoreAttributes: false });
    const workbook = parser.parse(strFromU8(files["xl/workbook.xml"]));
    expect(workbook.workbook.sheets.sheet["@_name"]).toBe("Members");
    expect(workbook.workbook.sheets.sheet["@_r:id"]).toBe("rId1");
    expect(strFromU8(files["xl/_rels/workbook.xml.rels"])).toContain(
      'Target="worksheets/sheet1.xml"',
    );
  });
  it("accepts 10,000 rows and refuses 10,001, oversized cells and complete-report text limits", async () => {
    expect(
      (
        await renderAdministrationExport(
          input("csv", { audit: audits(10_000) }, "audit"),
        )
      ).rows,
    ).toBe(10_000);
    for (const candidate of [
      input("csv", { audit: audits(10_001) }, "audit"),
      input("xlsx", { members: [member("x".repeat(4097))] }),
      input("xlsx", {
        members: Array.from({ length: 1100 }, () => member("x".repeat(4096))),
      }),
      input(
        "xlsx",
        {
          audit: audits(6000),
          members: Array.from({ length: 4001 }, () => member("Synthetic")),
        },
        "report",
      ),
    ])
      await expect(renderAdministrationExport(candidate)).rejects.toMatchObject(
        { code: "EXPORT_TOO_LARGE", status: 422 },
      );
  });
  it("limits PDF drawing to 500 rows and prints the exact omitted count", async () => {
    const result = await renderAdministrationExport(
      input("pdf", { audit: audits(501) }, "audit"),
    );
    const pdf = await pdfText(result.body as Uint8Array);
    expect(pdf.pages).toBeLessThanOrEqual(17);
    expect(pdf.text).toContain("ROW_00500");
    expect(pdf.text).not.toContain("ROW_00501");
    expect(pdf.text).toContain("Showing the first 500 of 501 rows.");
    expect(pdf.text).not.toContain("exclude tax");
    expect(pdf.text).toContain("guteneo");
  });
  it("shares the PDF drawing budget across report tables and marks the remainder", async () => {
    const result = await renderAdministrationExport(
      input(
        "pdf",
        {
          members: Array.from({ length: 350 }, () => member("Synthetic")),
          audit: audits(350),
        },
        "report",
      ),
    );
    const pdf = await pdfText(result.body as Uint8Array);
    expect(pdf.pages).toBeLessThanOrEqual(17);
    expect(pdf.text).toContain("ROW_00150");
    expect(pdf.text).not.toContain("ROW_00151");
    expect(pdf.text).toContain("Showing the first 150 of 350 rows.");
  });
});
