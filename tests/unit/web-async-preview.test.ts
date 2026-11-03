import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createPreviewApi } from "../../apps/web/src/preview";
import type { DocumentRecord, Page } from "../../apps/web/src/api";

describe("preview fixture initialization", () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts both independent fixture PDFs together and retains document order", async () => {
    const create = PDFDocument.create.bind(PDFDocument);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const creating = vi
      .spyOn(PDFDocument, "create")
      .mockImplementation(async (options) => {
        await gate;
        return create(options);
      });
    const preview = createPreviewApi();
    const pending = preview.request("/documents") as Promise<
      Page<DocumentRecord>
    >;
    try {
      expect(creating).toHaveBeenCalledTimes(2);
    } finally {
      release();
    }
    const { items } = await pending;
    expect(items.map(({ id, name }) => ({ id, name }))).toEqual([
      {
        id: "preview_atelier_document_1",
        name: "Your correspondence · example.pdf",
      },
      {
        id: "preview_atelier_document_2",
        name: "Workshop invitation · example.pdf",
      },
    ]);
    for (const item of items) {
      const bytes = await preview.documentContent(item.id);
      expect(bytes.length).toBe(item.size);
      expect((await PDFDocument.load(bytes)).getTitle()).toBe(
        `${item.name.replace(" · example.pdf", "")} — Fictional document`,
      );
    }
  });
});
