import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  handlePingenPreflight,
  type PostalBrowser,
} from "../../apps/documents/src/pingen-preflight";
import { validatePdf } from "../../packages/contracts/src/pdf";

const options = {
  defaultCountry: "LU",
  country: "LU",
  addressPosition: "left",
  printMode: "simplex",
  printSpectrum: "grayscale",
  deliveryProduct: "cheap",
};
async function input() {
  const doc = await PDFDocument.create();
  doc.addPage([(210 * 72) / 25.4, (297 * 72) / 25.4]);
  const bytes = new Uint8Array(await doc.save());
  return { bytes, hash: (await validatePdf(bytes)).sha256 };
}
function request(
  bytes: Uint8Array<ArrayBuffer>,
  hash: string,
  headers: Record<string, string> = {},
) {
  return new Request("https://documents.internal/preflight/pingen", {
    method: "POST",
    body: bytes,
    headers: {
      "Content-Type": "application/pdf",
      "X-Guteneo-Source-Sha256": hash,
      "X-Guteneo-Scan-Sha256": hash,
      "X-Guteneo-Pingen-Options": JSON.stringify(options),
      ...headers,
    },
  });
}
const dependencies = () => ({
  launch: vi.fn(async () => {
    throw new Error("engine not expected");
  }),
  scripts: { pdf: "", worker: "" },
});
describe("Private postal preflight boundary", () => {
  it("rejects a missing or mismatched scan assertion before reading or parsing content", async () => {
    const { bytes, hash } = await input();
    for (const scan of ["", "b".repeat(64)]) {
      const deps = dependencies();
      const response = await handlePingenPreflight(
        request(bytes, hash, { "X-Guteneo-Scan-Sha256": scan }),
        deps,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        canSend: false,
        status: "blocked",
      });
      expect(deps.launch).not.toHaveBeenCalled();
    }
  });
  it("recomputes the source hash from exact body bytes before launching the engine", async () => {
    const { bytes } = await input();
    const deps = dependencies();
    const response = await handlePingenPreflight(
      request(bytes, "b".repeat(64)),
      deps,
    );
    expect(await response.json()).toMatchObject({
      status: "blocked",
      issues: [{ code: "POSTAL_RENDER_HASH_MISMATCH" }],
      canSend: false,
    });
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("bounds streamed bytes even when Content-Length is absent or false", async () => {
    for (const headers of [{}, { "Content-Length": "20" }] as Record<
      string,
      string
    >[]) {
      const deps = dependencies();
      const response = await handlePingenPreflight(
        request(new Uint8Array(8_000_001), "a".repeat(64), headers),
        deps,
      );
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({
        issues: [{ code: "POSTAL_PDF_SIZE" }],
      });
      expect(deps.launch).not.toHaveBeenCalled();
    }
  });
  it("does not return private parser diagnostics or launch on malformed PDF", async () => {
    const deps = dependencies();
    const response = await handlePingenPreflight(
      request(
        new TextEncoder().encode("private invalid PDF recipient"),
        "a".repeat(64),
      ),
      deps,
    );
    expect(await response.text()).not.toContain("private invalid");
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("validates strict options rather than accepting a caller-selected DPI, URL or geometry", async () => {
    const { bytes, hash } = await input();
    const deps = dependencies();
    const response = await handlePingenPreflight(
      request(bytes, hash, {
        "X-Guteneo-Pingen-Options": JSON.stringify({ ...options, dpi: 10 }),
      }),
      deps,
    );
    expect(await response.json()).toMatchObject({
      status: "blocked",
      issues: [{ code: "POSTAL_OPTIONS_INVALID" }],
    });
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("stops an incomplete body on deadline without launching or preserving the stream", async () => {
    const cancel = vi.fn();
    const req = new Request(request(new Uint8Array(), "a".repeat(64)), {
      body: new ReadableStream({ cancel }),
      duplex: "half",
    } as RequestInit);
    const deps = dependencies();
    const response = await handlePingenPreflight(req, {
      ...deps,
      deadlineMs: 10,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      canSend: false,
      issues: [{ code: "POSTAL_RENDER_TIMEOUT" }],
    });
    expect(cancel).toHaveBeenCalled();
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("requires the exact private method and route and never permits caching", async () => {
    expect(
      (
        await handlePingenPreflight(
          new Request("https://documents.internal/preflight/pingen"),
          dependencies(),
        )
      ).status,
    ).toBe(404);
    const { bytes, hash } = await input();
    const response = await handlePingenPreflight(
      request(bytes, hash, { "Content-Type": "text/plain" }),
      dependencies(),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it.each([
    "launch",
    "new_page",
    "isolation",
    "navigation",
    "worker_script",
    "pdf_script",
    "open",
    "render",
  ])(
    "returns only the fixed %s failure stage, never browser diagnostics",
    async (stage) => {
      const { bytes, hash } = await input();
      const privateMessage =
        "PRIVATE PDF TEXT https://private.invalid/?secret=TOKEN";
      const at = (current: string) => {
        if (stage === current) throw new Error(privateMessage);
      };
      const close = vi.fn(async () => undefined);
      let script = 0;
      const browser = {
        close,
        async newPage() {
          at("new_page");
          return {
            setDefaultTimeout() {},
            async setBypassServiceWorker() {
              at("isolation");
            },
            async setRequestInterception() {},
            on() {},
            async setOfflineMode() {},
            async goto() {
              at("navigation");
            },
            async addScriptTag() {
              at(script++ === 0 ? "worker_script" : "pdf_script");
            },
            async evaluate(fn: { name: string }) {
              at(fn.name === "openPostalPdf" ? "open" : "render");
              return { sha256: hash, pages: 1 };
            },
          };
        },
      };
      const response = await handlePingenPreflight(request(bytes, hash), {
        launch: async () => {
          at("launch");
          return browser as unknown as PostalBrowser;
        },
        scripts: { pdf: "", worker: "" },
      });
      const report = await response.json();
      expect(response.status).toBe(422);
      expect(report).toMatchObject({
        status: "blocked",
        canSend: false,
        diagnostic: { stage },
        rendering: { complete: false, pages: [] },
        issues: [{ code: "POSTAL_RENDER_FAILED" }],
      });
      expect(JSON.stringify(report)).not.toContain(privateMessage);
      expect(JSON.stringify(report)).not.toContain("TOKEN");
      expect((report as { diagnostic: unknown }).diagnostic).toEqual({ stage });
      expect(close).toHaveBeenCalledTimes(stage === "launch" ? 0 : 1);
    },
  );
});
