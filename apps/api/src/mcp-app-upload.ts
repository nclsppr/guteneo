import { ContentError, LIMITS } from "../../../packages/contracts/src/content";
import {
  mcpAppUploadAppendInput,
  mcpAppUploadBeginInput,
  mcpAppUploadIdInput,
  mcpAppUploadView,
  MCP_APP_UPLOAD_MAX_BYTES,
  MCP_APP_UPLOAD_MAX_CALLS,
  MCP_APP_UPLOAD_MAX_PARTS,
  MCP_APP_UPLOAD_PART_BYTES,
  MCP_APP_UPLOAD_PART_MS,
  type McpAppUploadView,
} from "../../../packages/contracts/src/mcp-app-upload";
import type { McpIdentity } from "./auth";
import type { Env } from "./env";
import type { DomainService } from "../../../packages/domain/src/index";
import { DocumentService, readLimited } from "./documents";
import {
  PrivateDocumentUploadService,
  PRIVATE_UPLOAD_LEASE_MS,
  type UploadRow,
} from "./document-upload";

type Stage = {
  organization_id: string;
  upload_id: string;
  user_id: string;
  state: McpAppUploadView["status"];
  part_size: number;
  part_count: number;
  reserved_bytes: number;
  received_bytes: number;
  call_count: number;
  writer_token: string | null;
  writer_expires_at: string | null;
  writer_part_index: number | null;
  error_code: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  cleanup_not_before: string;
  next_cleanup_at: string;
  cleaned_at: string | null;
};
type Part = {
  organization_id: string;
  upload_id: string;
  part_index: number;
  byte_length: number;
  sha256: string;
  object_key: string;
  state: "pending" | "confirmed" | "unknown";
  storage_settled: number;
  put_token: string;
  created_at: string;
  confirmed_at: string | null;
};
export type McpAppUploadGate = (identity: McpIdentity) => Promise<void> | void;
const error = (code: string, message: string, status = 409) =>
  new ContentError(code, message, status);
const now = () => new Date().toISOString();
const token = () => crypto.randomUUID();
const dbNow = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const key = (org: string, id: string, index: number, hash: string) =>
  `${org}/mcp-app-uploads/${id}/${index}-${hash}.part`;
const denyGate: McpAppUploadGate = () => {
  throw error(
    "APP_UPLOAD_DISABLED",
    "Private original import is unavailable.",
    403,
  );
};
async function digest(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
async function bounded<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let abort!: () => void;
  try {
    return await Promise.race([
      promise.then((value) => {
        if (signal.aborted) {
          const body = (value as { body?: ReadableStream } | null)?.body;
          void body?.cancel().catch(() => {});
          throw error(
            "APP_UPLOAD_DEADLINE",
            "Read the same upload status before any further action.",
          );
        }
        return value;
      }),
      new Promise<never>((_, reject) => {
        abort = () =>
          reject(
            error(
              "APP_UPLOAD_DEADLINE",
              "Read the same upload status before any further action.",
            ),
          );
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

/** Disabled unless the server injects its current, bounded activation guard. */
export class McpAppDocumentUploadService {
  private readonly core: PrivateDocumentUploadService;
  constructor(
    private readonly env: Env,
    domain: DomainService,
    private readonly assertEnabled: McpAppUploadGate = denyGate,
    documents?: DocumentService,
  ) {
    this.core = new PrivateDocumentUploadService(env, domain, documents);
    if (
      MCP_APP_UPLOAD_MAX_BYTES > LIMITS.pdfBytes ||
      MCP_APP_UPLOAD_MAX_PARTS * MCP_APP_UPLOAD_PART_BYTES !==
        MCP_APP_UPLOAD_MAX_BYTES
    )
      throw error(
        "APP_UPLOAD_LIMIT_CONFIGURATION",
        "Review the original import limits before activation.",
        503,
      );
  }
  private async gate(identity: McpIdentity, signal?: AbortSignal) {
    signal?.throwIfAborted();
    await this.assertEnabled(identity);
    signal?.throwIfAborted();
  }
  private stage(row: UploadRow) {
    return this.env.DB.prepare(
      "SELECT * FROM mcp_app_document_uploads WHERE organization_id=? AND upload_id=?",
    )
      .bind(row.organization_id, row.id)
      .first<Stage>();
  }
  private async parts(row: UploadRow) {
    return (
      await this.env.DB.prepare(
        "SELECT * FROM mcp_app_document_upload_parts WHERE organization_id=? AND upload_id=? ORDER BY part_index",
      )
        .bind(row.organization_id, row.id)
        .all<Part>()
    ).results;
  }
  private async owned(identity: McpIdentity, id: string, active = false) {
    const row = await this.core.appOwned(identity, id, active),
      stage = await this.stage(row);
    if (!stage)
      throw error(
        "APP_UPLOAD_UNAVAILABLE",
        "Read the same import; do not start a replacement.",
        404,
      );
    return { row, stage };
  }
  private async count(row: UploadRow) {
    const authority = this.core.appAuthority(row, false),
      live = authority.sql();
    const result = await this.env.DB.prepare(
      `UPDATE mcp_app_document_uploads SET call_count=call_count+1,updated_at=? WHERE organization_id=? AND upload_id=? AND call_count<? AND ${live.condition} RETURNING *`,
    )
      .bind(
        now(),
        row.organization_id,
        row.id,
        MCP_APP_UPLOAD_MAX_CALLS,
        ...live.values,
      )
      .first<Stage>();
    if (!result) {
      await authority.assertCurrent();
      throw error(
        "APP_UPLOAD_CALL_LIMIT",
        "The bounded import call budget is exhausted. Stop this import.",
        429,
      );
    }
    return result;
  }
  private async view(
    identity: McpIdentity,
    row: UploadRow,
  ): Promise<McpAppUploadView> {
    const stage = await this.stage(row);
    if (!stage)
      throw error("APP_UPLOAD_UNAVAILABLE", "Import unavailable.", 404);
    const parts = await this.parts(row),
      confirmed = parts.filter((p) => p.state === "confirmed");
    let document: McpAppUploadView["document"];
    if (stage.state === "complete") {
      const receipt = await this.core.appGet(identity, row.id);
      if (receipt.document)
        document = { id: receipt.document.id, status: receipt.document.status };
      if (!document)
        throw error(
          "APP_UPLOAD_UNCONFIRMED",
          "Read this import status again; do not import again.",
        );
    }
    const remainingCalls = MCP_APP_UPLOAD_MAX_CALLS - stage.call_count;
    const nextAction =
      stage.state === "complete"
        ? "get_document"
        : stage.state === "finalizing" || stage.writer_token
          ? "wait"
          : stage.state !== "receiving" || remainingCalls === 0
            ? "stop"
            : confirmed.length === stage.part_count
              ? "finish"
              : "append_part";
    await this.core.appAuthority(row, false).assertCurrent();
    return mcpAppUploadView.parse({
      uploadId: row.id,
      status: stage.state,
      expiresAt: row.expires_at,
      partSize: MCP_APP_UPLOAD_PART_BYTES,
      partCount: stage.part_count,
      confirmedParts: confirmed.map((p) => p.part_index),
      receivedBytes: confirmed.reduce((n, p) => n + p.byte_length, 0),
      remainingCalls,
      nextAction,
      ...(stage.error_code ? { errorCode: stage.error_code } : {}),
      ...(document ? { document } : {}),
    });
  }
  async begin(identity: McpIdentity, value: unknown, signal?: AbortSignal) {
    await this.gate(identity, signal);
    const input = mcpAppUploadBeginInput.parse(value);
    const previous = await this.env.DB.prepare(
      `SELECT u.id FROM private_document_uploads u JOIN mcp_app_document_uploads a ON a.organization_id=u.organization_id AND a.upload_id=u.id WHERE u.organization_id=? AND u.idempotency_key=?`,
    )
      .bind(identity.context.organizationId, input.idempotencyKey)
      .first<{ id: string }>();
    if (previous) {
      const { row } = await this.owned(identity, previous.id);
      if (
        row.file_name !== input.fileName ||
        row.expected_size !== input.size ||
        row.expected_sha256 !== input.sha256
      )
        throw error(
          "UPLOAD_KEY_CONFLICT",
          "This key already identifies another original.",
        );
      await this.count(row);
      await this.reconcile(identity, row, signal);
      return this.view(identity, row);
    }
    const row = await this.core.reserveApp(identity, input);
    if (row.state !== "reserved")
      throw error(
        "APP_UPLOAD_TERMINAL",
        "Read the existing import; do not replace it.",
      );
    const authority = this.core.appAuthority(row);
    await authority.assertCurrent();
    const fence = authority.sql();
    const created = now(),
      cleanAfter = new Date(
        Date.parse(row.expires_at) + PRIVATE_UPLOAD_LEASE_MS,
      ).toISOString();
    const inserted = await this.env.DB.prepare(
      `INSERT INTO mcp_app_document_uploads(organization_id,upload_id,user_id,state,part_size,part_count,reserved_bytes,received_bytes,call_count,expires_at,created_at,updated_at,cleanup_not_before,next_cleanup_at)
      SELECT ?,?,?,'receiving',?,?,?,0,1,?,?,?,?,? WHERE ${fence.condition}
      AND (SELECT COUNT(*) FROM mcp_app_document_uploads WHERE organization_id=? AND user_id=? AND state IN ('receiving','finalizing','unknown') AND expires_at>${dbNow})<1
      AND (SELECT COUNT(*) FROM mcp_app_document_uploads WHERE organization_id=? AND state IN ('receiving','finalizing','unknown') AND expires_at>${dbNow})<20
      AND COALESCE((SELECT SUM(reserved_bytes) FROM mcp_app_document_uploads WHERE organization_id=? AND cleaned_at IS NULL),0)+?<=209715200
      ON CONFLICT(organization_id,upload_id) DO NOTHING RETURNING upload_id`,
    )
      .bind(
        row.organization_id,
        row.id,
        row.user_id,
        MCP_APP_UPLOAD_PART_BYTES,
        Math.ceil(row.expected_size / MCP_APP_UPLOAD_PART_BYTES),
        row.expected_size,
        row.expires_at,
        created,
        created,
        cleanAfter,
        created,
        ...fence.values,
        row.organization_id,
        row.user_id,
        row.organization_id,
        row.organization_id,
        row.expected_size,
      )
      .first();
    if (!inserted) {
      // Concurrent same-key callers converge on the same immutable session.
      if (await this.stage(row)) {
        await this.gate(identity, signal);
        await this.owned(identity, row.id);
        await this.count(row);
        await this.reconcile(identity, row, signal);
        return this.view(identity, row);
      }
      await this.env.DB.prepare(
        "UPDATE private_document_uploads SET state='rejected',capability_hash=NULL,error_code='APP_UPLOAD_LIMIT',updated_at=? WHERE organization_id=? AND id=? AND transport='app' AND state='reserved' AND NOT EXISTS(SELECT 1 FROM mcp_app_document_uploads a WHERE a.organization_id=? AND a.upload_id=?)",
      )
        .bind(now(), row.organization_id, row.id, row.organization_id, row.id)
        .run();
      throw error(
        "APP_UPLOAD_LIMIT",
        "An active import or reserved staging limit prevents another import.",
        429,
      );
    }
    return this.view(identity, row);
  }
  private async terminate(
    row: UploadRow,
    state: "cancelled" | "expired" | "rejected",
    code: string,
  ) {
    // Fence the original writer before clearing/deleting any staging object.
    await this.env.DB.prepare(
      "UPDATE private_document_uploads SET state=CASE WHEN state='reserved' THEN 'rejected' ELSE 'unknown' END,capability_hash=NULL,lease_token=NULL,lease_expires_at=NULL,error_code=?,updated_at=? WHERE organization_id=? AND id=? AND state IN ('reserved','uploading')",
    )
      .bind(code, now(), row.organization_id, row.id)
      .run();
    const originalState = `(SELECT u.state FROM private_document_uploads u WHERE u.organization_id=a.organization_id AND u.id=a.upload_id)`;
    await this.env.DB.prepare(
      `UPDATE mcp_app_document_uploads AS a SET state=CASE ${originalState} WHEN 'complete' THEN 'complete' WHEN 'unknown' THEN 'unknown' ELSE ? END,writer_token=NULL,writer_expires_at=NULL,writer_part_index=NULL,error_code=CASE ${originalState} WHEN 'complete' THEN NULL WHEN 'unknown' THEN 'APP_UPLOAD_UNCONFIRMED' ELSE ? END,updated_at=?,next_cleanup_at=? WHERE organization_id=? AND upload_id=? AND state<>'complete'`,
    )
      .bind(state, code, now(), now(), row.organization_id, row.id)
      .run();
  }
  private async reconcile(
    identity: McpIdentity,
    row: UploadRow,
    signal?: AbortSignal,
  ) {
    let stage = await this.stage(row);
    if (!stage) return;
    const expired = await this.env.DB.prepare(
      `SELECT 1 WHERE ?<=${dbNow} OR ?<=unixepoch('now')`,
    )
      .bind(row.expires_at, row.token_expires_at)
      .first();
    if (expired && ["receiving", "finalizing"].includes(stage.state)) {
      await this.terminate(row, "expired", "APP_UPLOAD_EXPIRED");
      stage = (await this.stage(row))!;
    }
    if (["finalizing", "unknown"].includes(stage.state)) {
      const receipt = await this.core.appGet(identity, row.id);
      if (receipt.status === "complete") {
        await this.env.DB.prepare(
          "UPDATE mcp_app_document_uploads SET state='complete',writer_token=NULL,writer_expires_at=NULL,writer_part_index=NULL,error_code=NULL,updated_at=?,next_cleanup_at=? WHERE organization_id=? AND upload_id=? AND state IN ('finalizing','unknown')",
        )
          .bind(now(), now(), row.organization_id, row.id)
          .run();
        return;
      }
      if (stage.state === "finalizing" && receipt.status === "unknown") {
        await this.env.DB.prepare(
          "UPDATE mcp_app_document_uploads SET state='unknown',writer_token=NULL,writer_expires_at=NULL,writer_part_index=NULL,error_code='APP_UPLOAD_UNCONFIRMED',updated_at=? WHERE organization_id=? AND upload_id=? AND state='finalizing'",
        )
          .bind(now(), row.organization_id, row.id)
          .run();
        return;
      }
      if (receipt.status === "rejected") {
        await this.env.DB.prepare(
          "UPDATE mcp_app_document_uploads SET state='rejected',writer_token=NULL,writer_expires_at=NULL,writer_part_index=NULL,error_code=?,updated_at=?,next_cleanup_at=? WHERE organization_id=? AND upload_id=? AND state IN ('finalizing','unknown')",
        )
          .bind(
            receipt.errorCode ?? "APP_UPLOAD_REJECTED",
            now(),
            now(),
            row.organization_id,
            row.id,
          )
          .run();
        return;
      }
    }
    if (stage.state === "receiving" && stage.writer_token) {
      const elapsed = await this.env.DB.prepare(`SELECT 1 WHERE ?<=${dbNow}`)
        .bind(stage.writer_expires_at)
        .first();
      if (!elapsed) return;
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE mcp_app_document_upload_parts SET state='unknown' WHERE organization_id=? AND upload_id=? AND state='pending' AND put_token=?",
        ).bind(row.organization_id, row.id, stage.writer_token),
        this.env.DB.prepare(
          `UPDATE mcp_app_document_uploads SET state='unknown',writer_token=NULL,writer_expires_at=NULL,writer_part_index=NULL,error_code='APP_PART_UNCONFIRMED',updated_at=? WHERE organization_id=? AND upload_id=? AND writer_token=? AND writer_expires_at<=${dbNow}`,
        ).bind(now(), row.organization_id, row.id, stage.writer_token),
      ]);
      stage = (await this.stage(row))!;
    }
    if (
      stage.state !== "unknown" ||
      stage.error_code !== "APP_PART_UNCONFIRMED" ||
      expired
    )
      return;
    const parts = await this.parts(row),
      part = parts.find((p) => p.state === "unknown");
    if (!part) return;
    const authority = this.core.appAuthority(row);
    await authority.assertCurrent();
    const deadline = AbortSignal.any([
      signal ?? new AbortController().signal,
      AbortSignal.timeout(MCP_APP_UPLOAD_PART_MS),
    ]);
    try {
      const object = await bounded(
        this.env.DOCUMENTS.get(part.object_key),
        deadline,
      );
      if (!object) return;
      const bytes = await readLimited(
        new Response(object.body),
        part.byte_length,
        deadline,
      );
      if (
        bytes.length !== part.byte_length ||
        (await digest(bytes)) !== part.sha256
      )
        return;
      await this.gate(identity, signal);
      await authority.assertCurrent();
      const live = authority.sql();
      await this.env.DB.batch([
        this.env.DB.prepare(
          `UPDATE mcp_app_document_upload_parts SET state='confirmed',storage_settled=1,confirmed_at=? WHERE organization_id=? AND upload_id=? AND part_index=? AND state='unknown' AND ${live.condition}`,
        ).bind(
          now(),
          row.organization_id,
          row.id,
          part.part_index,
          ...live.values,
        ),
        this.env.DB.prepare(
          `UPDATE mcp_app_document_uploads SET state='receiving',received_bytes=?,error_code=NULL,updated_at=? WHERE organization_id=? AND upload_id=? AND state='unknown' AND error_code='APP_PART_UNCONFIRMED' AND ${live.condition} AND EXISTS(SELECT 1 FROM mcp_app_document_upload_parts p WHERE p.organization_id=? AND p.upload_id=? AND p.part_index=? AND p.state='confirmed')`,
        ).bind(
          part.part_index * MCP_APP_UPLOAD_PART_BYTES + part.byte_length,
          now(),
          row.organization_id,
          row.id,
          ...live.values,
          row.organization_id,
          row.id,
          part.part_index,
        ),
      ]);
    } catch {
      /* Unknown object/read outcomes never establish a missing receipt. */
    }
  }
  async get(identity: McpIdentity, value: unknown, signal?: AbortSignal) {
    await this.gate(identity, signal);
    const input = mcpAppUploadIdInput.parse(value);
    const { row } = await this.owned(identity, input.uploadId);
    await this.count(row);
    await this.reconcile(identity, row, signal);
    return this.view(identity, row);
  }
  async append(identity: McpIdentity, value: unknown, signal?: AbortSignal) {
    await this.gate(identity, signal);
    const input = mcpAppUploadAppendInput.parse(value);
    const { row } = await this.owned(identity, input.uploadId, true);
    await this.count(row);
    await this.reconcile(identity, row, signal);
    const stage = (await this.stage(row))!,
      parts = await this.parts(row),
      previous = parts.find((p) => p.part_index === input.partIndex);
    const expected = Math.min(
      MCP_APP_UPLOAD_PART_BYTES,
      row.expected_size - input.partIndex * MCP_APP_UPLOAD_PART_BYTES,
    );
    if (input.partIndex >= stage.part_count || expected < 1)
      throw error(
        "APP_PART_LAYOUT",
        "Part index is outside the immutable layout.",
        422,
      );
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        input.base64,
      )
    )
      throw error("APP_PART_ENCODING", "Use canonical standard base64.", 422);
    const binary = atob(input.base64);
    if (btoa(binary) !== input.base64 || binary.length !== expected)
      throw error(
        "APP_PART_SIZE",
        "Part bytes do not match the fixed layout.",
        422,
      );
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    if ((await digest(bytes)) !== input.sha256)
      throw error(
        "APP_PART_HASH",
        "Part bytes do not match their digest.",
        422,
      );
    if (previous) {
      if (previous.sha256 !== input.sha256 || previous.byte_length !== expected)
        throw error(
          "APP_PART_CONFLICT",
          "This index already identifies different bytes.",
        );
      if (previous.state === "confirmed") return this.view(identity, row);
      return this.view(identity, row);
    }
    if (stage.state !== "receiving" || stage.writer_token)
      return this.view(identity, row);
    if (input.partIndex !== parts.filter((p) => p.state === "confirmed").length)
      throw error("APP_PART_ORDER", "Confirm the preceding part first.");
    const authority = this.core.appAuthority(row);
    await authority.assertCurrent();
    await this.gate(identity, signal);
    const live = authority.sql(),
      writer = token(),
      timestamp = now(),
      until = new Date(
        Math.min(
          Date.now() + MCP_APP_UPLOAD_PART_MS,
          Date.parse(row.expires_at),
        ),
      ).toISOString();
    const claim = await this.env.DB.prepare(
      `UPDATE mcp_app_document_uploads SET writer_token=?,writer_expires_at=?,writer_part_index=?,updated_at=? WHERE organization_id=? AND upload_id=? AND state='receiving' AND writer_token IS NULL AND received_bytes=? AND expires_at>${dbNow} AND ${live.condition} RETURNING *`,
    )
      .bind(
        writer,
        until,
        input.partIndex,
        timestamp,
        row.organization_id,
        row.id,
        input.partIndex * MCP_APP_UPLOAD_PART_BYTES,
        ...live.values,
      )
      .first<Stage>();
    if (!claim) return this.view(identity, row);
    const objectKey = key(
      row.organization_id,
      row.id,
      input.partIndex,
      input.sha256,
    );
    let putStarted = false;
    try {
      await this.env.DB.prepare(
        "INSERT INTO mcp_app_document_upload_parts(organization_id,upload_id,part_index,byte_length,sha256,object_key,state,put_token,created_at) VALUES(?,?,?,?,?,?,'pending',?,?)",
      )
        .bind(
          row.organization_id,
          row.id,
          input.partIndex,
          expected,
          input.sha256,
          objectKey,
          writer,
          timestamp,
        )
        .run();
      const deadline = AbortSignal.any([
        signal ?? new AbortController().signal,
        AbortSignal.timeout(
          Math.max(
            1,
            Math.min(
              MCP_APP_UPLOAD_PART_MS,
              Date.parse(row.expires_at) - Date.now(),
            ),
          ),
        ),
      ]);
      await this.assertPartWriter(row, writer);
      await this.gate(identity, signal);
      deadline.throwIfAborted();
      putStarted = true;
      const stored = await bounded(
        this.env.DOCUMENTS.put(objectKey, bytes, {
          onlyIf: { etagDoesNotMatch: "*" },
          customMetadata: { sha256: input.sha256 },
        }),
        deadline,
      );
      if (!stored) {
        const existing = await bounded(
          this.env.DOCUMENTS.get(objectKey),
          deadline,
        );
        if (!existing)
          throw error(
            "APP_PART_UNCONFIRMED",
            "Read this import status before any further action.",
          );
        const existingBytes = await readLimited(
          new Response(existing.body),
          expected,
          deadline,
        );
        if (
          existingBytes.length !== expected ||
          (await digest(existingBytes)) !== input.sha256
        )
          throw error(
            "APP_PART_HASH",
            "The staged object does not match the original part.",
          );
      }
      await this.gate(identity, signal);
      await authority.assertCurrent();
      const fresh = authority.sql();
      await this.env.DB.batch([
        this.env.DB.prepare(
          `UPDATE mcp_app_document_upload_parts SET state='confirmed',storage_settled=1,confirmed_at=? WHERE organization_id=? AND upload_id=? AND part_index=? AND state='pending' AND put_token=? AND ${fresh.condition} AND EXISTS(SELECT 1 FROM mcp_app_document_uploads a WHERE a.organization_id=? AND a.upload_id=? AND a.state='receiving' AND a.writer_token=? AND a.writer_expires_at>${dbNow})`,
        ).bind(
          now(),
          row.organization_id,
          row.id,
          input.partIndex,
          writer,
          ...fresh.values,
          row.organization_id,
          row.id,
          writer,
        ),
        this.env.DB.prepare(
          `UPDATE mcp_app_document_uploads SET received_bytes=?,writer_token=NULL,writer_expires_at=NULL,writer_part_index=NULL,updated_at=? WHERE organization_id=? AND upload_id=? AND state='receiving' AND writer_token=? AND writer_expires_at>${dbNow} AND ${fresh.condition} AND EXISTS(SELECT 1 FROM mcp_app_document_upload_parts p WHERE p.organization_id=? AND p.upload_id=? AND p.part_index=? AND p.state='confirmed')`,
        ).bind(
          input.partIndex * MCP_APP_UPLOAD_PART_BYTES + expected,
          now(),
          row.organization_id,
          row.id,
          writer,
          ...fresh.values,
          row.organization_id,
          row.id,
          input.partIndex,
        ),
      ]);
    } catch {
      await this.env.DB.batch([
        this.env.DB.prepare(
          "UPDATE private_document_uploads SET state='rejected',capability_hash=NULL,error_code='APP_PART_NOT_ACCEPTED',updated_at=? WHERE organization_id=? AND id=? AND transport='app' AND state='reserved' AND ?=0 AND EXISTS(SELECT 1 FROM mcp_app_document_uploads a WHERE a.organization_id=? AND a.upload_id=? AND a.state='receiving' AND a.writer_token=?)",
        ).bind(
          now(),
          row.organization_id,
          row.id,
          Number(putStarted),
          row.organization_id,
          row.id,
          writer,
        ),
        this.env.DB.prepare(
          "UPDATE mcp_app_document_upload_parts SET state='unknown',storage_settled=CASE WHEN ?=0 THEN 1 ELSE storage_settled END WHERE organization_id=? AND upload_id=? AND part_index=? AND state='pending' AND put_token=?",
        ).bind(
          Number(putStarted),
          row.organization_id,
          row.id,
          input.partIndex,
          writer,
        ),
        this.env.DB.prepare(
          "UPDATE mcp_app_document_uploads SET state=CASE WHEN ?=0 THEN 'rejected' ELSE 'unknown' END,writer_token=NULL,writer_expires_at=NULL,writer_part_index=NULL,error_code=CASE WHEN ?=0 THEN 'APP_PART_NOT_ACCEPTED' ELSE 'APP_PART_UNCONFIRMED' END,updated_at=? WHERE organization_id=? AND upload_id=? AND state='receiving' AND writer_token=?",
        ).bind(
          Number(putStarted),
          Number(putStarted),
          now(),
          row.organization_id,
          row.id,
          writer,
        ),
      ]);
    }
    return this.view(identity, row);
  }
  private async assertPartWriter(row: UploadRow, writer: string) {
    const authority = this.core.appAuthority(row);
    await authority.assertCurrent();
    const live = authority.sql();
    if (
      !(await this.env.DB.prepare(
        `SELECT 1 FROM mcp_app_document_uploads WHERE organization_id=? AND upload_id=? AND state='receiving' AND writer_token=? AND writer_expires_at>${dbNow} AND ${live.condition}`,
      )
        .bind(row.organization_id, row.id, writer, ...live.values)
        .first())
    )
      throw error(
        "APP_UPLOAD_FENCED",
        "The staged writer is no longer current.",
      );
  }
  async finish(identity: McpIdentity, value: unknown, signal?: AbortSignal) {
    await this.gate(identity, signal);
    const input = mcpAppUploadIdInput.parse(value);
    const { row } = await this.owned(identity, input.uploadId);
    await this.count(row);
    await this.reconcile(identity, row, signal);
    const stage = (await this.stage(row))!;
    if (stage.state !== "receiving" || stage.writer_token)
      return this.view(identity, row);
    const parts = await this.parts(row);
    if (
      parts.length !== stage.part_count ||
      parts.some((p, i) => p.state !== "confirmed" || p.part_index !== i) ||
      parts.reduce((n, p) => n + p.byte_length, 0) !== row.expected_size
    )
      throw error(
        "APP_UPLOAD_INCOMPLETE",
        "Confirm every part before finishing.",
      );
    const authority = this.core.appAuthority(row);
    await authority.assertCurrent();
    const live = authority.sql(),
      writer = token();
    const claim = await this.env.DB.prepare(
      `UPDATE mcp_app_document_uploads SET state='finalizing',writer_token=?,writer_expires_at=?,updated_at=? WHERE organization_id=? AND upload_id=? AND state='receiving' AND writer_token IS NULL AND received_bytes=? AND ${live.condition} AND (SELECT COUNT(*) FROM mcp_app_document_uploads WHERE state='finalizing')<1 RETURNING *`,
    )
      .bind(
        writer,
        new Date(
          Math.min(
            Date.now() + PRIVATE_UPLOAD_LEASE_MS,
            Date.parse(row.expires_at),
          ),
        ).toISOString(),
        now(),
        row.organization_id,
        row.id,
        row.expected_size,
        ...live.values,
      )
      .first<Stage>();
    if (!claim) return this.view(identity, row);
    try {
      await this.gate(identity, signal);
      const response = await this.core.acceptApp(
        identity,
        row.id,
        async (deadline) => {
          const bytes = new Uint8Array(row.expected_size);
          let offset = 0;
          for (const part of parts) {
            deadline.throwIfAborted();
            await this.gate(identity, signal);
            await this.assertFinalizer(row, writer);
            const object = await bounded(
              this.env.DOCUMENTS.get(part.object_key),
              deadline,
            );
            if (!object)
              throw error(
                "APP_PART_MISSING",
                "An immutable staged part is unavailable.",
              );
            const chunk = await readLimited(
              new Response(object.body),
              part.byte_length,
              deadline,
            );
            if (
              chunk.length !== part.byte_length ||
              (await digest(chunk)) !== part.sha256
            )
              throw error("APP_PART_HASH", "An immutable staged part differs.");
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          await this.gate(identity, signal);
          await this.assertFinalizer(row, writer);
          return bytes;
        },
        signal ?? new AbortController().signal,
        () => this.gate(identity, signal),
      );
      await response.body?.cancel().catch(() => {});
    } catch {
      /* The shared ledger determines rejection versus uncertain pipeline outcomes. */
    }
    const receipt = await this.core.appGet(identity, row.id);
    const status =
      receipt.status === "complete"
        ? "complete"
        : receipt.status === "rejected"
          ? "rejected"
          : "unknown";
    await this.env.DB.prepare(
      "UPDATE mcp_app_document_uploads SET state=?,writer_token=NULL,writer_expires_at=NULL,writer_part_index=NULL,error_code=?,updated_at=?,next_cleanup_at=? WHERE organization_id=? AND upload_id=? AND state='finalizing' AND writer_token=?",
    )
      .bind(
        status,
        status === "complete"
          ? null
          : (receipt.errorCode ?? "APP_UPLOAD_UNCONFIRMED"),
        now(),
        now(),
        row.organization_id,
        row.id,
        writer,
      )
      .run();
    return this.view(identity, row);
  }
  private async assertFinalizer(row: UploadRow, writer: string) {
    await this.core.appAuthority(row).assertCurrent();
    if (
      !(await this.env.DB.prepare(
        `SELECT 1 FROM mcp_app_document_uploads WHERE organization_id=? AND upload_id=? AND state='finalizing' AND writer_token=? AND writer_expires_at>${dbNow}`,
      )
        .bind(row.organization_id, row.id, writer)
        .first())
    )
      throw error(
        "APP_UPLOAD_FENCED",
        "Read the same import status before any further action.",
      );
  }
  async cancel(identity: McpIdentity, value: unknown, signal?: AbortSignal) {
    await this.gate(identity, signal);
    const input = mcpAppUploadIdInput.parse(value);
    const { row, stage } = await this.owned(identity, input.uploadId);
    await this.count(row);
    if (stage.state === "complete" || row.state === "complete") {
      await this.reconcile(identity, row, signal);
      return this.view(identity, row);
    }
    await this.terminate(row, "cancelled", "APP_UPLOAD_CANCELLED");
    return this.view(identity, row);
  }
}

/** Existing cron may call this before identity/provider gates. No original is deleted. */
export async function cleanupMcpAppDocumentUploads(env: Env) {
  const stats = {
    sessionsInspected: 0,
    partsDeleted: 0,
    sessionsCleaned: 0,
    unresolved: 0,
  };
  const valid = `EXISTS(SELECT 1 FROM private_document_uploads u JOIN authorized_connections c ON c.id=u.connection_id_snapshot AND c.organization_id=u.organization_id AND c.user_id=u.user_id JOIN connection_tool_observations o ON o.connection_id=c.id AND o.organization_id=c.organization_id AND o.user_id=c.user_id JOIN memberships m ON m.organization_id=u.organization_id AND m.user_id=u.user_id JOIN organizations g ON g.id=m.organization_id JOIN auth_identities i ON i.issuer=c.issuer AND i.subject=u.subject AND i.user_id=u.user_id WHERE u.organization_id=a.organization_id AND u.id=a.upload_id AND c.status='active' AND c.client_id=u.client_id AND c.issuer=u.issuer AND c.not_before<=u.token_issued_at AND o.authorization_revision=u.authorization_revision AND m.role=u.member_role AND m.supervisor_can_approve=u.supervisor_can_approve AND m.supervisor_can_report=u.supervisor_can_report AND g.mode=u.mode)`;
  const originalState = `(SELECT u.state FROM private_document_uploads u WHERE u.organization_id=a.organization_id AND u.id=a.upload_id)`;
  const expiredFinalizer = `(a.state='finalizing' AND a.writer_expires_at<=${dbNow})`;
  const sessions = (
    await env.DB.prepare(
      `SELECT a.* FROM mcp_app_document_uploads a WHERE a.cleaned_at IS NULL AND a.next_cleanup_at<=${dbNow} AND (${expiredFinalizer} OR a.state IN ('complete','cancelled','expired','rejected') OR a.expires_at<=${dbNow} OR NOT ${valid}) ORDER BY CASE WHEN ${expiredFinalizer} THEN 0 ELSE 1 END,a.next_cleanup_at LIMIT 2`,
    ).all<Stage>()
  ).results;
  for (const stage of sessions) {
    stats.sessionsInspected++;
    // This batch invalidates any in-flight append/finalizer before object cleanup.
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE private_document_uploads SET state=CASE WHEN state='reserved' THEN 'rejected' ELSE 'unknown' END,capability_hash=NULL,lease_token=NULL,lease_expires_at=NULL,error_code='APP_UPLOAD_CLOSED',updated_at=? WHERE organization_id=? AND id=? AND transport='app' AND state IN ('reserved','uploading') AND EXISTS(SELECT 1 FROM mcp_app_document_uploads a WHERE a.organization_id=? AND a.upload_id=? AND (${expiredFinalizer} OR a.expires_at<=${dbNow} OR NOT ${valid}))`,
      ).bind(
        now(),
        stage.organization_id,
        stage.upload_id,
        stage.organization_id,
        stage.upload_id,
      ),
      env.DB.prepare(
        `UPDATE mcp_app_document_uploads AS a SET state=CASE WHEN ${originalState}='complete' THEN 'complete' WHEN ${originalState}='unknown' THEN 'unknown' WHEN state IN ('complete','cancelled','expired','rejected') THEN state WHEN expires_at<=${dbNow} THEN 'expired' ELSE 'cancelled' END,writer_token=NULL,writer_expires_at=NULL,writer_part_index=NULL,error_code=CASE WHEN ${originalState}='complete' THEN NULL WHEN ${originalState}='unknown' THEN 'APP_UPLOAD_UNCONFIRMED' ELSE 'APP_UPLOAD_CLOSED' END,updated_at=? WHERE organization_id=? AND upload_id=? AND (${expiredFinalizer} OR state IN ('complete','cancelled','expired','rejected') OR expires_at<=${dbNow} OR NOT ${valid})`,
      ).bind(now(), stage.organization_id, stage.upload_id),
    ]);
    const due = await env.DB.prepare(
      `SELECT 1 FROM mcp_app_document_uploads WHERE organization_id=? AND upload_id=? AND cleanup_not_before<=${dbNow}`,
    )
      .bind(stage.organization_id, stage.upload_id)
      .first();
    if (!due) {
      await env.DB.prepare(
        "UPDATE mcp_app_document_uploads SET next_cleanup_at=cleanup_not_before WHERE organization_id=? AND upload_id=?",
      )
        .bind(stage.organization_id, stage.upload_id)
        .run();
      continue;
    }
    const parts = (
      await env.DB.prepare(
        "SELECT * FROM mcp_app_document_upload_parts WHERE organization_id=? AND upload_id=? ORDER BY part_index LIMIT 40",
      )
        .bind(stage.organization_id, stage.upload_id)
        .all<Part>()
    ).results;
    const keys = parts.map((p) =>
      key(stage.organization_id, stage.upload_id, p.part_index, p.sha256),
    );
    if (parts.some((p, i) => p.object_key !== keys[i])) {
      stats.unresolved++;
      continue;
    }
    try {
      // A missing object for an uncertain put does not prove that a late put
      // cannot arrive. Retain the reservation debt and its immutable key manifest.
      let unresolvedPut = false;
      for (let i = 0; i < parts.length; i++)
        if (parts[i].state !== "confirmed" && !parts[i].storage_settled) {
          if (await env.DOCUMENTS.head(keys[i])) {
            await env.DB.prepare(
              "UPDATE mcp_app_document_upload_parts SET storage_settled=1 WHERE organization_id=? AND upload_id=? AND part_index=?",
            )
              .bind(stage.organization_id, stage.upload_id, parts[i].part_index)
              .run();
          } else unresolvedPut = true;
        }
      if (keys.length) await env.DOCUMENTS.delete(keys);
      stats.partsDeleted += keys.length;
      let absent = true;
      for (const k of keys) if (await env.DOCUMENTS.head(k)) absent = false;
      if (unresolvedPut) absent = false;
      await env.DB.prepare(
        `UPDATE mcp_app_document_uploads SET cleaned_at=?,next_cleanup_at=?,updated_at=? WHERE organization_id=? AND upload_id=?`,
      )
        .bind(
          absent ? now() : null,
          new Date(Date.now() + (absent ? 86400000 : 60000)).toISOString(),
          now(),
          stage.organization_id,
          stage.upload_id,
        )
        .run();
      if (absent) stats.sessionsCleaned++;
      else stats.unresolved++;
    } catch {
      stats.unresolved++;
      await env.DB.prepare(
        "UPDATE mcp_app_document_uploads SET cleaned_at=NULL,next_cleanup_at=?,updated_at=? WHERE organization_id=? AND upload_id=?",
      )
        .bind(
          new Date(Date.now() + 60000).toISOString(),
          now(),
          stage.organization_id,
          stage.upload_id,
        )
        .run();
    }
  }
  return stats;
}
