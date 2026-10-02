import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { handleTemplateRender } from "../../apps/documents/src/template-render";
import { invoiceTemplate } from "../../packages/templates/gallery";

describe("Authoritative private pdfme rendering", () => {
  it("renders 1/30/200 rows and long paragraphs in actual isolated Chromium, with all markers, glyphs and no egress", () => {
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/pdfme-spike.ts"],
      { stdio: "pipe", timeout: 90_000 },
    );
    const report = JSON.parse(
      readFileSync("reports/template-engine/proof.json", "utf8"),
    );
    expect(
      report.fixtures.map((fixture: { fixture: string }) => fixture.fixture),
    ).toEqual([
      "invoice-1",
      "invoice-30",
      "invoice-200",
      "letter-long",
      "word-import",
    ]);
    expect(
      report.fixtures.map(
        (fixture: { missingMarkers: number }) => fixture.missingMarkers,
      ),
    ).toEqual([0, 0, 0, 0, 0]);
    expect(
      report.fixtures.map(
        (fixture: { textOutsidePage: number }) => fixture.textOutsidePage,
      ),
    ).toEqual([0, 0, 0, 0, 0]);
    expect(report.fixtures[2].pages).toBeGreaterThan(1);
    expect(report.overlapRejected).toBe(true);
    expect(report.externalRequests).toEqual([]);
  }, 100_000);
  it("rejects invalid templates before starting a browser and enforces a deadline", async () => {
    const launch = vi.fn();
    const invalid = await handleTemplateRender(
      new Request("https://internal/render/template", {
        method: "POST",
        body: "{}",
      }),
      { launch, script: "" },
    );
    expect(invalid.status).toBe(422);
    expect(launch).not.toHaveBeenCalled();
    const envelope = invoiceTemplate();
    const delayed = await handleTemplateRender(
      new Request("https://internal/render/template", {
        method: "POST",
        body: JSON.stringify({ envelope, data: envelope.sampleData }),
      }),
      { launch: () => new Promise(() => undefined), script: "", deadlineMs: 5 },
    );
    expect(delayed.status).toBe(504);
    expect(await delayed.json()).toMatchObject({
      error: { code: "TEMPLATE_RENDER_TIMEOUT" },
    });
  });
  it("cancels an unfinished request stream at the deadline without launching compute", async () => {
    let cancelled = false;
    const launch = vi.fn();
    const request = new Request("https://internal/render/template", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"envelope":'));
        },
        cancel() {
          cancelled = true;
        },
      }),
    } as RequestInit & { duplex: "half" });
    const response = await handleTemplateRender(request, {
      launch,
      script: "",
      deadlineMs: 5,
    });
    expect(response.status).toBe(504);
    expect(cancelled).toBe(true);
    expect(launch).not.toHaveBeenCalled();
  });
});
