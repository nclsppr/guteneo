import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  createPreviewApi,
  type PreviewAccount,
} from "../../apps/web/src/preview";
import type { PreviewDataCounts } from "../../apps/web/src/preview-data";
import type { DocumentRecord, Page, Session } from "../../apps/web/src/api";
import type {
  DatasetView,
  GenerationJobView,
  GenerationResultView,
  TemplateView,
} from "../../packages/contracts/src/template-workflow";
import { validateTemplateEnvelope } from "../../packages/contracts/src/templates";

const counts: PreviewDataCounts = {
  documents: 100,
  dispatches: 100,
  templates: 100,
  datasets: 100,
  generations: 100,
};
const settings = (
  account: PreviewAccount = "admin",
  seed = "scenario-test",
  volume = counts,
) => ({ account, seed, counts: volume });

describe("explicit local browser scenarios", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Local fictional scenarios cannot contact a backend.");
      }),
    ),
  );
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps local profile configuration unavailable in the ordinary public preview", async () => {
    const preview = createPreviewApi();
    await expect(
      preview.configure(settings("belvedere")),
    ).rejects.toMatchObject({ code: "PREVIEW_LOCAL_ONLY", status: 403 });
    expect(
      ((await preview.request("/session")) as Session).canAccessBelvedere,
    ).not.toBe(true);
    expect(preview.configuration()).toEqual({
      account: "admin",
      seed: "guteneo-local",
      counts: null,
    });
  });

  for (const account of [
    "admin",
    "supervisor",
    "member",
    "viewer",
    "belvedere",
  ] as const) {
    it(`projects the existing ${account} workspace rights without inventing a fifth role`, async () => {
      const preview = createPreviewApi({ advancedLocal: true });
      const session = await preview.configure(settings(account));
      expect(session.user.role).toBe(
        account === "belvedere" ? "viewer" : account,
      );
      expect(session.canAccessBelvedere === true).toBe(account === "belvedere");
      expect(session.permissions?.prepareDispatches).toBe(
        ["admin", "supervisor", "member"].includes(account),
      );
      expect(session.permissions?.approveDispatches).toBe(
        ["admin", "supervisor"].includes(account),
      );
      expect(session.permissions?.manageOrganization).toBe(account === "admin");
      if (account !== "admin")
        await expect(preview.request("/admin")).rejects.toMatchObject({
          code: "FORBIDDEN",
          status: 403,
        });
      if (!["admin", "supervisor"].includes(account))
        await expect(preview.request("/usage")).rejects.toMatchObject({
          code: "FORBIDDEN",
          status: 403,
        });
      await expect(
        preview.request("/dispatches/fictional/approve", {
          method: "POST",
          body: {},
        }),
      ).rejects.toMatchObject({
        code: ["admin", "supervisor"].includes(account)
          ? "PREVIEW_VOLUME_READ_ONLY"
          : "FORBIDDEN",
      });
    });
  }

  it("reads a billion-sized logical collection in bounded deterministic pages without creating PDFs", async () => {
    const createPdf = vi.spyOn(PDFDocument, "create");
    const preview = createPreviewApi({ advancedLocal: true });
    const huge = Object.fromEntries(
      Object.keys(counts).map((key) => [key, 1_000_000_000]),
    ) as PreviewDataCounts;
    await preview.configure(settings("admin", "large-demo", huge));
    const first = (await preview.request(
      "/documents?limit=1000",
    )) as Page<DocumentRecord> & { total: number };
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(1_000_000_000);
    expect(first.nextCursor).toBeTruthy();
    const second = (await preview.request(
      `/documents?cursor=${encodeURIComponent(first.nextCursor!)}`,
    )) as Page<DocumentRecord>;
    expect(second.items).toHaveLength(50);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    const template = (await preview.request(
      "/templates",
    )) as Page<TemplateView>;
    expect(template.items).toHaveLength(50);
    expect(() =>
      validateTemplateEnvelope(template.items[0].envelope),
    ).not.toThrow();
    expect(createPdf).not.toHaveBeenCalled();
    await preview.configure(settings("admin", "large-demo", huge));
    expect(
      ((await preview.request("/documents")) as Page<DocumentRecord>).items,
    ).toEqual(first.items);
  });

  it("rejects foreign cursors and record IDs across seeds, collections and workspaces", async () => {
    const preview = createPreviewApi({ advancedLocal: true });
    await preview.configure(settings());
    const first = (await preview.request("/documents")) as Page<DocumentRecord>;
    await expect(
      preview.request(
        `/templates?cursor=${encodeURIComponent(first.nextCursor!)}`,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PREVIEW_CURSOR" });
    await preview.request("/dev/login", {
      method: "POST",
      body: { organization: "studio" },
    });
    await expect(
      preview.request(`/documents/${first.items[0].id}`),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND", status: 404 });
    await expect(
      preview.request(
        `/documents?cursor=${encodeURIComponent(first.nextCursor!)}`,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PREVIEW_CURSOR" });
    await preview.configure(settings("admin", "different-seed"));
    await expect(
      preview.request(`/documents/${first.items[0].id}`),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
  });

  it("serves complete bounded Studio detail, source-page and generation-result contracts", async () => {
    const preview = createPreviewApi({ advancedLocal: true });
    await preview.configure(settings());
    const datasets = (await preview.request("/datasets")) as Page<DatasetView>;
    const dataset = datasets.items.find((entry) => entry.status === "ready")!;
    const profile = (await preview.request(
      `/datasets/${dataset.id}/profile?cursor=30&limit=30`,
    )) as {
      profile: { sheets: { rows: { rowNumber: number }[] }[] };
      pagination: { cursor: number; nextCursor: number; totalRows: number };
    };
    expect(profile.profile.sheets[0].rows).toHaveLength(30);
    expect(profile.profile.sheets[0].rows[0].rowNumber).toBe(31);
    expect(profile.pagination).toMatchObject({
      cursor: 30,
      nextCursor: 60,
      totalRows: 500,
    });
    const jobs = (await preview.request(
      "/generation-jobs",
    )) as Page<GenerationJobView>;
    const job = jobs.items.find((entry) => entry.total > 50)!;
    const results = (await preview.request(
      `/generation-jobs/${job.id}/results`,
    )) as Page<GenerationResultView>;
    expect(results.items).toHaveLength(50);
    expect(results.nextCursor).toBeTruthy();
    const following = (await preview.request(
      `/generation-jobs/${job.id}/results?cursor=${encodeURIComponent(results.nextCursor!)}`,
    )) as Page<GenerationResultView>;
    expect(following.items[0].recordId).not.toBe(results.items[0].recordId);
    const context = (await preview.request(
      `/generation-jobs/${job.id}/record-context?recordId=${results.items[0].recordId}`,
    )) as { recordId: string; data: { subject: string } };
    expect(context.recordId).toBe(results.items[0].recordId);
    expect(context.data.subject).toContain("Fictional");
    await expect(
      preview.request(
        `/generation-jobs/${jobs.items.find((other) => other.id !== job.id)!.id}/results?cursor=${results.nextCursor}`,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PREVIEW_CURSOR" });
    expect(await preview.request("/dataset-ai-policy")).toMatchObject({
      configured: false,
      enabled: false,
      transferApproved: false,
      realProviderQualified: false,
    });
  });

  it("materializes only a requested ready fictional PDF and reports its exact bytes", async () => {
    const preview = createPreviewApi({ advancedLocal: true });
    await preview.configure(settings());
    const list = (await preview.request("/documents")) as Page<DocumentRecord>;
    const document = list.items.find((entry) => entry.status === "ready")!;
    const blocked = list.items.find((entry) => entry.status !== "ready")!;
    await expect(preview.documentContent(blocked.id)).rejects.toMatchObject({
      code: "DOCUMENT_NOT_READY",
    });
    const bytes = await preview.documentContent(document.id);
    const exact = (await preview.request(
      `/documents/${document.id}`,
    )) as DocumentRecord;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    expect(exact.size).toBe(bytes.length);
    expect(exact.sha256).toBe(
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    );
    expect(exact.pages).toBe(1);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("coalesces concurrent same-PDF reads without duplicate cache entries or lost bytes", async () => {
    const preview = createPreviewApi({ advancedLocal: true });
    await preview.configure(settings());
    const documents = (await preview.request(
      "/documents",
    )) as Page<DocumentRecord>;
    const ready = documents.items.filter((entry) => entry.status === "ready");
    const create = vi.spyOn(PDFDocument, "create");
    const duplicateReads = await Promise.all(
      Array.from({ length: 40 }, () => preview.documentContent(ready[0].id)),
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      duplicateReads.every(
        (bytes) => bytes.length === duplicateReads[0].length,
      ),
    ).toBe(true);
    for (const document of ready.slice(1, 19))
      expect(
        (await preview.documentContent(document.id)).length,
      ).toBeGreaterThan(0);
    expect((await preview.documentContent(ready[0].id)).length).toBeGreaterThan(
      0,
    );
    expect(
      ((await preview.request(`/documents/${ready[0].id}`)) as DocumentRecord)
        .pages,
    ).toBe(1);
  });

  it("bounds distinct in-flight PDFs and rejects an old scenario's pending materialization", async () => {
    const preview = createPreviewApi({ advancedLocal: true });
    await preview.configure(settings());
    const documents = (await preview.request(
      "/documents",
    )) as Page<DocumentRecord>;
    const ready = documents.items.filter((entry) => entry.status === "ready");
    const original = PDFDocument.create;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const create = vi
      .spyOn(PDFDocument, "create")
      .mockImplementation(async (...arguments_) => {
        await gate;
        return original(...arguments_);
      });
    const pending = ready
      .slice(0, 16)
      .map((document) =>
        preview.documentContent(document.id).catch((error: unknown) => error),
      );
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(16));
    await expect(preview.documentContent(ready[16].id)).rejects.toMatchObject({
      code: "PREVIEW_PDF_LIMIT",
      status: 429,
    });
    await preview.configure(settings("admin", "different pending scenario"));
    release();
    for (const result of await Promise.all(pending))
      expect(result).toMatchObject({
        code: "PREVIEW_SCENARIO_CHANGED",
        status: 409,
      });
    await expect(
      preview.request(`/documents/${ready[0].id}`),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
  });

  it("configuration validation and copied settings cannot mutate the active dataset", async () => {
    const preview = createPreviewApi({ advancedLocal: true });
    await preview.configure(settings());
    const snapshot = preview.configuration();
    snapshot.counts!.documents = 0;
    expect(preview.configuration().counts?.documents).toBe(100);
    await expect(
      preview.configure(
        settings("admin", "valid", { ...counts, documents: -1 }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_PREVIEW_DATA" });
    expect(preview.configuration().counts?.documents).toBe(100);
    const older = preview.request("/documents");
    await preview.configure(settings("viewer", "next"));
    await expect(older).rejects.toMatchObject({
      code: "PREVIEW_SCENARIO_CHANGED",
    });
  });
});
