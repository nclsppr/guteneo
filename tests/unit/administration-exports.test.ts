import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  minorToDecimal,
  pdfRowShares,
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
    expect(pdf.text).toContain("ROW_00250");
    expect(pdf.text).not.toContain("ROW_00251");
    expect(
      pdf.text.split("Showing the first 250 of 350 rows.").length - 1,
    ).toBe(2);
  });

  it("prints small report tables whole before sharing the rest", () => {
    // Summary, channels, statuses, activity, services, channels, days,
    // members, connections and audit of a busy month.
    const sizes = [15, 3, 6, 809, 1, 3, 29, 6, 160, 225];
    const shares = pdfRowShares(sizes, 500);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(500);
    for (const index of [0, 1, 2, 4, 5, 6, 7])
      expect(shares[index]).toBe(sizes[index]);
    expect(Math.min(shares[3], shares[8], shares[9])).toBeGreaterThan(140);
    expect(pdfRowShares([0, 2, 0], 500)).toEqual([0, 2, 0]);
    expect(pdfRowShares([600, 600], 500)).toEqual([250, 250]);
  });
});

describe("administration PDF characters", () => {
  // pdf.js decodes the embedded font's Unicode map, like a reader would.
  async function readableText(bytes: Uint8Array) {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await getDocument({
      data: bytes.slice(),
      useSystemFonts: false,
      standardFontDataUrl: new URL(
        "../../node_modules/pdfjs-dist/standard_fonts/",
        import.meta.url,
      ).pathname,
    }).promise;
    const pages: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const content = await (await document.getPage(index)).getTextContent();
      pages.push(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      );
    }
    return pages.join("\n");
  }
  const fontNames = async (bytes: Uint8Array) =>
    (await PDFDocument.load(bytes)).context
      .enumerateIndirectObjects()
      .map(([, object]) => String(object))
      .filter((value) => value.includes("/BaseFont"))
      .join(" ");

  it("keeps names outside WinAnsi readable with the embedded Unicode font", async () => {
    const names = [
      "Łukasz Dvořák",
      "Gülşen Yılmaz",
      "Анна Петрова",
      "Ștefan Țepeș",
    ];
    const result = await renderAdministrationExport({
      ...input("pdf", { members: names.map(member) }),
      workspace: {
        id: "synthetic",
        name: "Biuro Łódź",
        mode: "simulation" as const,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const bytes = result.body as Uint8Array;
    const text = await readableText(bytes);
    for (const name of [...names, "Biuro Łódź"]) expect(text).toContain(name);
    expect(text).not.toContain("?ukasz");
    expect(await fontNames(bytes)).toMatch(/Roboto/);
  });

  it("keeps the standard fonts when every drawn character is WinAnsi", async () => {
    const result = await renderAdministrationExport({
      ...input("pdf", {
        members: ["Élodie Müller", "Jean-François Bœuf", "Ëmer Lëtzebuerg"].map(
          member,
        ),
      }),
      locale: "lb" as const,
    });
    const bytes = result.body as Uint8Array;
    const text = await readableText(bytes);
    expect(text).toContain("Élodie Müller");
    expect(text).toContain("Jean-François Bœuf");
    expect(await fontNames(bytes)).not.toMatch(/Roboto/);
  });

  it("marks characters the embedded font cannot draw instead of dropping them", async () => {
    const result = await renderAdministrationExport(
      input("pdf", { members: [member("田中 Łukasz")] }),
    );
    const text = await readableText(result.body as Uint8Array);
    expect(text).toContain("?? Łukasz");
  });
});

describe("administration PDF font data", () => {
  it("embeds exactly the pinned pdfme Roboto bytes and coverage", async () => {
    const { createHash } = await import("node:crypto");
    const { readFile } = await import("node:fs/promises");
    const font =
      await import("../../apps/api/src/administration-pdf-font-data");
    const coverage = JSON.parse(
      await readFile(
        new URL("../../packages/templates/font-coverage.json", import.meta.url),
        "utf8",
      ),
    );
    const bytes = Buffer.from(font.ADMINISTRATION_PDF_FONT_BASE64, "base64");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      coverage.fontSha256,
    );
    expect(font.ADMINISTRATION_PDF_FONT_SHA256).toBe(coverage.fontSha256);
    expect(font.ADMINISTRATION_PDF_FONT_CODE_POINTS).toEqual(
      coverage.codePoints,
    );
  });
});
