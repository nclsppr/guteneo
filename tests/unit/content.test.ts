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
  it("normalizes typed fax numbers and refuses a kept trunk prefix", () => {
    const phone = (value: string) => validateRecipient("fax", { phone: value });
    expect(phone("+33 1 23.45-67 89")).toEqual({ phone: "+33123456789" });
    // French typography separates digit groups with non-breaking spaces.
    expect(phone("+33 1 23 45 67 89")).toEqual({
      phone: "+33123456789",
    });
    // "(0)" is the optional trunk prefix; the digits around it are kept.
    expect(phone("+49 (0)30 1234567")).toEqual({ phone: "+49301234567" });
    expect(phone("+352 (26) 12 34 56")).toEqual({ phone: "+35226123456" });
    for (const kept of ["+33 01 23 45 67 89", "+330612345678", "+49030123456"])
      expect(() => phone(kept)).toThrow("Retirez le 0");
    for (const invalid of ["123", "+353 1 234 5678", "0033123456789"])
      expect(() => phone(invalid)).toThrow("Numéro international requis");
  });
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
  it("allows public HTTPS sources without weakening private URL guards", () => {
    for (const url of [
      "http://downloads.provider.com/a",
      "https://127.0.0.1/a",
      "https://user:pass@downloads.provider.com/a",
      "https://[::1]/a",
      "https://downloads.provider.com:444/a",
    ])
      expect(() => permittedImportUrl(url)).toThrow();
    expect(
      permittedImportUrl("https://downloads.provider.com/a?signature=secret")
        .hostname,
    ).toBe("downloads.provider.com");
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
