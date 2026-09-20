import { describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { loadPdfScripts } from "../../apps/documents/pdfjs-assets.mjs";
import {
  addressFontSupports,
  handlePostalAddressPage,
} from "../../apps/documents/src/postal-address-page";
import { validatePdf } from "../../packages/contracts/src/pdf";

const { addressFont } = await loadPdfScripts();
const options = {
  recipient: {
    name: "ATELIER EXEMPLE",
    line1: "Rue du Test 12",
    postalCode: "L-1234",
    city: "LUXEMBOURG",
    country: "LU",
  },
  defaultCountry: "LU",
  addressPosition: "left",
  printMode: "simplex",
};
const deps = () => ({
  fontBase64: addressFont,
  launch: vi.fn(async () => {
    throw new Error("PRIVATE_RENDERER_DETAIL");
  }),
});
async function source(pages = 1, mutate?: (pdf: PDFDocument) => void) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pages; index++)
    pdf.addPage([(210 * 72) / 25.4, (297 * 72) / 25.4]);
  mutate?.(pdf);
  const bytes = new Uint8Array(await pdf.save());
  return { bytes, hash: (await validatePdf(bytes)).sha256 };
}
function request(
  bytes: Uint8Array<ArrayBuffer>,
  hash: string,
  headers: Record<string, string> = {},
) {
  return new Request("https://documents.internal/postal-address-page", {
    method: "POST",
    body: bytes,
    headers: {
      "Content-Type": "application/pdf",
      "X-Guteneo-Source-Sha256": hash,
      "X-Guteneo-Scan-Sha256": hash,
      "X-Guteneo-Postal-Address-Page": encodeURIComponent(
        JSON.stringify(options),
      ),
      ...headers,
    },
  });
}
describe("Private postal address page boundary", () => {
  it("requires a matching exact source scan before parsing or browser use", async () => {
    const input = await source();
    for (const scan of ["", "b".repeat(64)]) {
      const dependencies = deps();
      const response = await handlePostalAddressPage(
        request(input.bytes, input.hash, { "X-Guteneo-Scan-Sha256": scan }),
        dependencies,
      );
      expect(response.status).toBe(400);
      expect(dependencies.launch).not.toHaveBeenCalled();
    }
  });
  it("recomputes the source hash before composing", async () => {
    const { bytes } = await source();
    const dependencies = deps();
    const response = await handlePostalAddressPage(
      request(bytes, "a".repeat(64)),
      dependencies,
    );
    expect(await response.json()).toEqual({
      error: { code: "POSTAL_ADDRESS_PAGE_HASH_MISMATCH" },
    });
    expect(dependencies.launch).not.toHaveBeenCalled();
  });
  it("rejects caller geometry, extra fields and malformed metadata", async () => {
    const input = await source();
    for (const metadata of [
      "%",
      JSON.stringify({ ...options, x: 0 }),
      JSON.stringify({
        ...options,
        recipient: { ...options.recipient, url: "https://private.invalid" },
      }),
    ]) {
      const dependencies = deps();
      const response = await handlePostalAddressPage(
        request(input.bytes, input.hash, {
          "X-Guteneo-Postal-Address-Page": metadata,
        }),
        dependencies,
      );
      expect(response.status).toBe(400);
      expect(dependencies.launch).not.toHaveBeenCalled();
    }
  });
  it("bounds actual streamed bytes despite absent or misleading Content-Length", async () => {
    for (const headers of [{}, { "Content-Length": "1" }] as Record<
      string,
      string
    >[]) {
      const dependencies = deps();
      const response = await handlePostalAddressPage(
        request(new Uint8Array(8_000_001), "a".repeat(64), headers),
        dependencies,
      );
      expect(response.status).toBe(413);
      expect(dependencies.launch).not.toHaveBeenCalled();
    }
  });
  it.each(["simplex", "duplex"])(
    "caps the final page count before %s composition",
    async (printMode) => {
      const input = await source(printMode === "duplex" ? 99 : 100);
      const dependencies = deps();
      const response = await handlePostalAddressPage(
        request(input.bytes, input.hash, {
          "X-Guteneo-Postal-Address-Page": encodeURIComponent(
            JSON.stringify({ ...options, printMode }),
          ),
        }),
        dependencies,
      );
      expect(await response.json()).toEqual({
        error: { code: "POSTAL_ADDRESS_PAGE_PAGE_LIMIT" },
      });
      expect(dependencies.launch).not.toHaveBeenCalled();
    },
  );
  it.each(["AcroForm", "OCProperties"])(
    "rejects %s rather than losing interactive or optional content while copying",
    async (key) => {
      const input = await source(1, (pdf) =>
        pdf.catalog.set(PDFName.of(key), pdf.context.obj({})),
      );
      const dependencies = deps();
      const response = await handlePostalAddressPage(
        request(input.bytes, input.hash),
        dependencies,
      );
      expect(await response.json()).toEqual({
        error: { code: "POSTAL_ADDRESS_PAGE_SOURCE_UNSUPPORTED" },
      });
      expect(dependencies.launch).not.toHaveBeenCalled();
    },
  );
  it("rejects PDF actions, page annotations and corrupted content before browser use", async () => {
    const annotated = await source(1, (pdf) =>
      pdf
        .getPage(0)
        .node.set(
          PDFName.of("Annots"),
          pdf.context.obj([{ Type: "Annot", Subtype: "Text" }]),
        ),
    );
    const active = await PDFDocument.create();
    active.addPage([(210 * 72) / 25.4, (297 * 72) / 25.4]);
    active.catalog.set(
      PDFName.of("OpenAction"),
      active.context.obj({ S: "JavaScript", JS: "PRIVATE_ACTION" }),
    );
    for (const bytes of [
      annotated.bytes,
      new Uint8Array(await active.save()),
      new TextEncoder().encode("%PDF-1.7 corrupt PRIVATE CONTENT %%EOF"),
    ]) {
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      const dependencies = deps();
      const response = await handlePostalAddressPage(
        request(bytes, hash),
        dependencies,
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: { code: "POSTAL_ADDRESS_PAGE_SOURCE_UNSUPPORTED" },
      });
      expect(dependencies.launch).not.toHaveBeenCalled();
    }
  });
  it("rejects unsupported glyphs before a browser can silently substitute a font", async () => {
    expect(
      addressFontSupports(addressFont, ["Élodie Müller Straße 12 ŒUVRE"]),
    ).toBe(true);
    expect(addressFontSupports(addressFont, ["😀"])).toBe(false);
    const input = await source();
    const dependencies = deps();
    const response = await handlePostalAddressPage(
      request(input.bytes, input.hash, {
        "X-Guteneo-Postal-Address-Page": encodeURIComponent(
          JSON.stringify({
            ...options,
            recipient: { ...options.recipient, name: "EXEMPLE 😀" },
          }),
        ),
      }),
      dependencies,
    );
    expect(await response.json()).toEqual({
      error: { code: "POSTAL_ADDRESS_PAGE_GLYPH_UNSUPPORTED" },
    });
    expect(dependencies.launch).not.toHaveBeenCalled();
  });
  it("does not disclose renderer exceptions or cache any result", async () => {
    const input = await source();
    const response = await handlePostalAddressPage(
      request(input.bytes, input.hash),
      deps(),
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "POSTAL_ADDRESS_PAGE_RENDER_FAILED" },
    });
  });
  it("cancels an incomplete body on the bounded deadline", async () => {
    const cancel = vi.fn();
    const input = request(new Uint8Array(), "a".repeat(64));
    const dependencies = deps();
    const response = await handlePostalAddressPage(
      new Request(input, {
        body: new ReadableStream({ cancel }),
        duplex: "half",
      } as RequestInit),
      { ...dependencies, deadlineMs: 10 },
    );
    expect(await response.json()).toEqual({
      error: { code: "POSTAL_ADDRESS_PAGE_RENDER_TIMEOUT" },
    });
    expect(cancel).toHaveBeenCalled();
    expect(dependencies.launch).not.toHaveBeenCalled();
  });
});
