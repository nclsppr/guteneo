import { describe, expect, it } from "vitest";
import { LIMITS } from "../../packages/contracts/src/content";
import {
  INLINE_PDF_BYTES,
  inlinePdfInput,
  privateDocumentUploadInput,
  privateUploadInput,
} from "../../packages/contracts/src/private-document-upload";
import {
  MCP_APP_UPLOAD_MAX_BYTES,
  MCP_APP_UPLOAD_MAX_CALLS,
  MCP_APP_UPLOAD_MAX_PARTS,
  MCP_APP_UPLOAD_PART_BYTES,
  MCP_APP_UPLOAD_PART_MS,
  MCP_APP_UPLOAD_TTL_SECONDS,
  mcpAppUploadAppendInput,
  mcpAppUploadBeginInput,
  mcpAppUploadIdInput,
  mcpAppUploadOpenerData,
  mcpAppUploadView,
} from "../../packages/contracts/src/mcp-app-upload";
import * as lean from "../../packages/contracts/src/mcp-app-upload-limits";

const uploadId = "upl_11111111-1111-4111-8111-111111111111";
const original = {
  idempotencyKey: "synthetic_original",
  fileName: "synthetic.pdf",
  size: 100,
  sha256: "a".repeat(64),
};
const opener = {
  surface: "guteneo-private-original-v1",
  limits: {
    maxBytes: MCP_APP_UPLOAD_MAX_BYTES,
    partBytes: MCP_APP_UPLOAD_PART_BYTES,
    maxParts: MCP_APP_UPLOAD_MAX_PARTS,
    maxCalls: MCP_APP_UPLOAD_MAX_CALLS,
    expiresWithinSeconds: MCP_APP_UPLOAD_TTL_SECONDS,
  },
};

describe("bounded private-original App contracts", () => {
  it("aligns the lean browser bounds with the unchanged original and inline limits", () => {
    expect(MCP_APP_UPLOAD_PART_BYTES).toBe(256 * 1024);
    expect(MCP_APP_UPLOAD_MAX_PARTS).toBe(40);
    expect(MCP_APP_UPLOAD_MAX_BYTES).toBe(LIMITS.pdfBytes);
    expect(MCP_APP_UPLOAD_MAX_BYTES).toBe(
      MCP_APP_UPLOAD_PART_BYTES * MCP_APP_UPLOAD_MAX_PARTS,
    );
    expect(MCP_APP_UPLOAD_MAX_CALLS).toBe(64);
    expect(MCP_APP_UPLOAD_PART_MS).toBe(10_000);
    expect(MCP_APP_UPLOAD_TTL_SECONDS).toBe(300);
    expect(lean).toMatchObject({
      MCP_APP_UPLOAD_MAX_BYTES,
      MCP_APP_UPLOAD_PART_BYTES,
      MCP_APP_UPLOAD_MAX_PARTS,
      MCP_APP_UPLOAD_MAX_CALLS,
      MCP_APP_UPLOAD_PART_MS,
      MCP_APP_UPLOAD_TTL_SECONDS,
    });
    expect(mcpAppUploadBeginInput.parse(original)).toEqual(
      privateDocumentUploadInput.parse(original),
    );
    expect(privateUploadInput).toBe(privateDocumentUploadInput);
    expect(INLINE_PDF_BYTES).toBe(65_536);
    expect(
      inlinePdfInput.safeParse({
        ...original,
        size: INLINE_PDF_BYTES + 1,
        base64: "AAAA".repeat(8),
      }).success,
    ).toBe(false);
  });

  it("accepts only immutable original metadata within the shared PDF bound", () => {
    for (const size of [20, LIMITS.pdfBytes])
      expect(mcpAppUploadBeginInput.parse({ ...original, size }).size).toBe(
        size,
      );
    for (const invalid of [
      { ...original, size: 19 },
      { ...original, size: LIMITS.pdfBytes + 1 },
      { ...original, size: 20.5 },
      { ...original, fileName: "../synthetic.pdf" },
      { ...original, fileName: "synthetic.pdf\n" },
      { ...original, sha256: "A".repeat(64) },
      { ...original, idempotencyKey: "short" },
      { ...original, organizationId: "other" },
      { ...original, userId: "other" },
      { ...original, sourceUrl: "https://example.invalid/original.pdf" },
      { ...original, base64: "AAAA" },
      { ...original, chunks: [] },
    ])
      expect(mcpAppUploadBeginInput.safeParse(invalid).success).toBe(false);
  });

  it("bounds append indexes and encoded characters without widening the whole-file contract", () => {
    const base64 = Buffer.alloc(MCP_APP_UPLOAD_PART_BYTES).toString("base64");
    expect(base64.length).toBe(349_528);
    for (const partIndex of [0, MCP_APP_UPLOAD_MAX_PARTS - 1])
      expect(
        mcpAppUploadAppendInput.parse({
          uploadId,
          partIndex,
          base64,
          sha256: original.sha256,
        }).partIndex,
      ).toBe(partIndex);
    const part = { uploadId, partIndex: 0, base64, sha256: original.sha256 };
    for (const invalid of [
      { ...part, partIndex: -1 },
      { ...part, partIndex: MCP_APP_UPLOAD_MAX_PARTS },
      { ...part, partIndex: 0.5 },
      { ...part, base64: "AAA" },
      { ...part, base64: base64 + "AAAA" },
      { ...part, sha256: "forged" },
      { ...part, offset: 0 },
      { ...part, organizationId: "other" },
      { ...part, isFinal: true },
    ])
      expect(mcpAppUploadAppendInput.safeParse(invalid).success).toBe(false);
    // Encoded length alone cannot establish decoded length at a padding boundary.
    // The service must also reject an oversized decoded part before storage.
    expect(
      Buffer.alloc(MCP_APP_UPLOAD_PART_BYTES + 1).toString("base64").length,
    ).toBe(base64.length);
  });

  it("keeps upload-ID callbacks strict and rejects authority or destination arguments", () => {
    expect(mcpAppUploadIdInput.parse({ uploadId })).toEqual({ uploadId });
    for (const invalid of [
      { uploadId: "../other" },
      { uploadId, organizationId: "other" },
      { uploadId, capability: "a".repeat(64) },
      { uploadId, url: "https://example.invalid" },
      { uploadId, expectedRevision: 2 },
    ])
      expect(mcpAppUploadIdInput.safeParse(invalid).success).toBe(false);
  });

  it("allows only the fixed opener surface, four locales and literal protocol limits", () => {
    expect(mcpAppUploadOpenerData.parse(opener)).toEqual(opener);
    for (const locale of ["fr", "en", "de", "lb"])
      expect(mcpAppUploadOpenerData.parse({ ...opener, locale }).locale).toBe(
        locale,
      );
    for (const invalid of [
      { ...opener, surface: "another-surface" },
      { ...opener, locale: "es" },
      { ...opener, fileName: original.fileName },
      {
        ...opener,
        limits: { ...opener.limits, maxBytes: LIMITS.pdfBytes + 1 },
      },
      { ...opener, limits: { ...opener.limits, maxParts: 41 } },
      { ...opener, limits: { ...opener.limits, maxCalls: 65 } },
      { ...opener, limits: { ...opener.limits, expiresWithinSeconds: 301 } },
      { ...opener, limits: { ...opener.limits, transportUrl: "/content" } },
    ])
      expect(mcpAppUploadOpenerData.safeParse(invalid).success).toBe(false);
  });

  it("limits receipts to bounded progress and minimal registered-document identity", () => {
    const view = {
      uploadId,
      status: "complete",
      expiresAt: "2026-10-26T12:05:00.000Z",
      partSize: MCP_APP_UPLOAD_PART_BYTES,
      partCount: 1,
      confirmedParts: [0],
      receivedBytes: original.size,
      remainingCalls: 60,
      nextAction: "get_document",
      document: { id: "doc_synthetic", status: "quarantined" },
    };
    expect(mcpAppUploadView.parse(view)).toEqual(view);
    for (const invalid of [
      { ...view, partSize: MCP_APP_UPLOAD_PART_BYTES + 1 },
      { ...view, partCount: 0 },
      { ...view, partCount: 41 },
      { ...view, confirmedParts: [40] },
      { ...view, receivedBytes: LIMITS.pdfBytes + 1 },
      { ...view, remainingCalls: 65 },
      { ...view, remainingCalls: -1 },
      { ...view, status: "prepared" },
      { ...view, nextAction: "resend_original" },
      { ...view, fileName: original.fileName },
      { ...view, base64: "AAAA" },
      { ...view, upload: { capability: "a".repeat(64) } },
      { ...view, document: { ...view.document, storage_key: "internal" } },
    ])
      expect(mcpAppUploadView.safeParse(invalid).success).toBe(false);
  });
});
