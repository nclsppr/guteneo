import { z } from "zod";
import { privateDocumentUploadInput } from "./private-document-upload";
import {
  MCP_APP_UPLOAD_MAX_BYTES,
  MCP_APP_UPLOAD_PART_BYTES,
  MCP_APP_UPLOAD_MAX_PARTS,
  MCP_APP_UPLOAD_MAX_CALLS,
  MCP_APP_UPLOAD_TTL_SECONDS,
} from "./mcp-app-upload-limits";
export {
  MCP_APP_UPLOAD_MAX_BYTES,
  MCP_APP_UPLOAD_PART_BYTES,
  MCP_APP_UPLOAD_MAX_PARTS,
  MCP_APP_UPLOAD_MAX_CALLS,
  MCP_APP_UPLOAD_PART_MS,
  MCP_APP_UPLOAD_TTL_SECONDS,
} from "./mcp-app-upload-limits";
export const mcpAppUploadOpenerData = z
  .object({
    surface: z.literal("guteneo-private-original-v1"),
    locale: z.enum(["fr", "en", "de", "lb"]).optional(),
    limits: z
      .object({
        maxBytes: z.literal(MCP_APP_UPLOAD_MAX_BYTES),
        partBytes: z.literal(MCP_APP_UPLOAD_PART_BYTES),
        maxParts: z.literal(MCP_APP_UPLOAD_MAX_PARTS),
        maxCalls: z.literal(MCP_APP_UPLOAD_MAX_CALLS),
        expiresWithinSeconds: z.literal(MCP_APP_UPLOAD_TTL_SECONDS),
      })
      .strict(),
  })
  .strict();
export type McpAppUploadOpenerData = z.infer<typeof mcpAppUploadOpenerData>;
export const mcpAppUploadBeginInput = privateDocumentUploadInput.extend({
  size: privateDocumentUploadInput.shape.size.max(MCP_APP_UPLOAD_MAX_BYTES),
});
export const mcpAppUploadIdInput = z
  .object({
    uploadId: z.string().regex(/^upl_[a-f0-9-]{36}$/),
  })
  .strict();
export const mcpAppUploadAppendInput = mcpAppUploadIdInput.extend({
  partIndex: z
    .number()
    .int()
    .min(0)
    .max(MCP_APP_UPLOAD_MAX_PARTS - 1),
  base64: z
    .string()
    .min(4)
    .max(4 * Math.ceil(MCP_APP_UPLOAD_PART_BYTES / 3))
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const mcpAppUploadStatuses = [
  "receiving",
  "finalizing",
  "complete",
  "cancelled",
  "expired",
  "rejected",
  "unknown",
] as const;
export const mcpAppUploadView = z
  .object({
    uploadId: mcpAppUploadIdInput.shape.uploadId,
    status: z.enum(mcpAppUploadStatuses),
    expiresAt: z.string().datetime(),
    partSize: z.literal(MCP_APP_UPLOAD_PART_BYTES),
    partCount: z.number().int().min(1).max(MCP_APP_UPLOAD_MAX_PARTS),
    confirmedParts: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MCP_APP_UPLOAD_MAX_PARTS - 1),
      )
      .max(MCP_APP_UPLOAD_MAX_PARTS),
    receivedBytes: z
      .number()
      .int()
      .min(0)
      .max(MCP_APP_UPLOAD_PART_BYTES * MCP_APP_UPLOAD_MAX_PARTS),
    remainingCalls: z.number().int().min(0).max(MCP_APP_UPLOAD_MAX_CALLS),
    nextAction: z.enum([
      "append_part",
      "wait",
      "finish",
      "get_document",
      "stop",
    ]),
    errorCode: z.string().optional(),
    document: z
      .object({
        id: z.string(),
        status: z.enum(["ready", "quarantined", "rejected", "purged"]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type McpAppUploadBeginInput = z.infer<typeof mcpAppUploadBeginInput>;
export type McpAppUploadAppendInput = z.infer<typeof mcpAppUploadAppendInput>;
export type McpAppUploadIdInput = z.infer<typeof mcpAppUploadIdInput>;
export type McpAppUploadView = z.infer<typeof mcpAppUploadView>;
