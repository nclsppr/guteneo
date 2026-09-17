import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import {
  cleanHtml,
  printableHtml,
  validateCsv,
  safeHeader,
  validateRecipient,
} from "../../packages/contracts/src/content";
import {
  validatePdf,
  permittedImportUrl,
  readLimited,
} from "../../apps/api/src/documents";

describe("content boundary", () => {
  it("rejects an unsupported postal address line instead of silently dropping it", () => {
    expect(() =>
      validateRecipient("postal", {
        name: "Fixture",
        line1: "Adresse fictive",
        line2: "Bâtiment B",
        postalCode: "75000",
        city: "Paris",
        country: "FR",
      }),
    ).toThrow("complément");
  });
  it("removes scripts, CSS, images, SVG and dangerous links before approval", () => {
    const html = cleanHtml(
      '<h1>Hello</h1><script>fetch("http://169.254.169.254")</script><img src="https://tracker.invalid/p"><style>p{background:url(http://localhost)}</style><svg onload="alert(1)"></svg><a href="javascript:alert(1)" onclick="x()">link</a>',
    );
    expect(html).toBe("<h1>Hello</h1><a>link</a>");
    expect(printableHtml(html)).toContain("default-src 'none'");
  });
  it("rejects header injection and active CSV formulas", () => {
    expect(() =>
      safeHeader("subject\r\nBcc: attacker@example.invalid"),
    ).toThrow();
    const result = validateCsv(
      'channel,email\nemail,=HYPERLINK("https://evil.invalid")',
    );
    expect(result.valid).toBe(false);
  });
  it("normalizes recipient rows and detects duplicates without sending", () => {
    const result = validateCsv(
      "channel,email\nemail,HELLO@example.invalid\nemail,hello@example.invalid\nemail,broken",
    );
    expect(result.rows).toHaveLength(2);
    expect(result.duplicates).toEqual([{ line: 3, duplicateOf: 2 }]);
    expect(result.errors[0].line).toBe(4);
  });
  it("refuses arbitrary URLs, localhost, credentials, redirects and insecure schemes", () => {
    for (const url of [
      "http://trusted.example/a",
      "https://127.0.0.1/a",
      "https://trusted.example.evil/a",
      "https://user:pass@trusted.example/a",
      "https://[::1]/a",
      "https://trusted.example:444/a",
    ])
      expect(() => permittedImportUrl(url, "trusted.example")).toThrow();
    expect(() =>
      permittedImportUrl("https://trusted.example/a", undefined),
    ).toThrow();
    expect(
      permittedImportUrl(
        "https://trusted.example/a?signature=secret",
        "trusted.example",
      ).hostname,
    ).toBe("trusted.example");
  });
  it("limits streaming downloads independent of content-length", async () => {
    await expect(
      readLimited(new Response(new Uint8Array(200)), 100),
    ).rejects.toThrow("volumineux");
  });
  it("validates actual PDF bytes without changing their hash", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = await pdf.save();
    const copy = bytes.slice();
    const result = await validatePdf(bytes);
    expect(result.pages).toBe(1);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bytes).toEqual(copy);
    await expect(validatePdf(bytes.subarray(0, 100))).rejects.toThrow();
    await expect(
      validatePdf(new TextEncoder().encode("<html>This is not a PDF</html>")),
    ).rejects.toThrow();
  });
  it("rejects PDF active content through parsed object dictionaries", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.catalog.set(
      PDFName.of("OpenAction"),
      pdf.context.obj({
        S: PDFName.of("JavaScript"),
        JS: PDFString.of("alert(1)"),
      }),
    );
    await expect(validatePdf(await pdf.save())).rejects.toThrow("active");
  });
});
