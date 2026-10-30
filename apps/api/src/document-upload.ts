import { decodeJwt } from "jose";
import { ContentError } from "../../../packages/contracts/src/content";
import {
  privateUploadInput,
  inlinePdfInput,
  type PrivateUploadInput,
  type InlinePdfInput,
} from "../../../packages/contracts/src/private-document-upload";
export {
  privateUploadInput,
  inlinePdfInput,
  INLINE_PDF_BYTES,
  type PrivateUploadInput,
  type InlinePdfInput,
} from "../../../packages/contracts/src/private-document-upload";
import type {
  ActorContext,
  DomainService,
  DocumentRecord,
} from "../../../packages/domain/src/index";
import {
  AuthError,
  authenticationPolicy,
  auth0Issuer,
  hasMfa,
  hasVerifiedAccount,
  hashSecret,
  requireScope,
  verifiedMcpTokenIssuer,
  type McpIdentity,
} from "./auth";
import { DocumentService, readLimited } from "./documents";
import type { Env } from "./env";
import { postalMcpAuthority } from "./postal-authority";
import privateUploadClient from "../../../packages/contracts/src/private-upload-client.json";

export const PRIVATE_UPLOAD_TTL_MS = 5 * 60_000;
export const PRIVATE_UPLOAD_BODY_MS = 30_000;
export const PRIVATE_UPLOAD_LEASE_MS = 90_000;
export const PRIVATE_UPLOAD_HEADER = "X-Guteneo-Upload-Capability";
export type UploadRow = {
  id: string;
  transport: "binary" | "app";
  organization_id: string;
  user_id: string;
  client_id: string;
  connection_id_snapshot: string;
  authorization_revision: number;
  issuer: string;
  token_issuer: string;
  subject: string;
  token_issued_at: number;
  token_expires_at: number;
  member_role: ActorContext["role"];
  supervisor_can_approve: number;
  supervisor_can_report: number;
  authentication_policy: string;
  verified_account: number;
  mfa: number;
  mode: string;
  idempotency_key: string;
  file_name: string;
  expected_size: number;
  expected_sha256: string;
  capability_hash: string | null;
  state: "reserved" | "uploading" | "complete" | "rejected" | "unknown";
  planned_document_id: string;
  document_id: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  error_code: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};
export type PrivateUploadView = {
  uploadId: string;
  status: UploadRow["state"];
  expiresAt: string;
  nextAction: "upload_exact_bytes" | "wait" | "get_document" | "do_not_retry";
  retryAfterSeconds?: number;
  errorCode?: string;
  document?: DocumentRecord;
  upload?: {
    method: "PUT";
    url: string;
    capabilityHeader: typeof PRIVATE_UPLOAD_HEADER;
    capability: string;
    client: typeof privateUploadClient;
  };
};
export type PrivateUploadReceipt = Omit<PrivateUploadView, "upload">;
const iso = () => new Date().toISOString();
const deny = () =>
  new AuthError(
    "UPLOAD_AUTHORITY_CHANGED",
    "This upload is no longer authorized. Read its status through your connected account.",
    403,
  );
const fail = (code: string, message: string, status = 409) =>
  new ContentError(code, message, status);
function secret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function digest(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function privateUploadPath(path: string) {
  return /^\/api\/document-uploads\/upl_[a-f0-9-]{36}\/content$/.test(path);
}

/** No persisted bearer or general-purpose signing secret. Authority snapshots are
 * created only from authenticateMcp's verified identity and fenced against live rows. */
export class PrivateDocumentUploadService {
  constructor(
    private readonly env: Env,
    domain: DomainService,
    private readonly documents = new DocumentService(env, domain),
  ) {}

  private origin() {
    const url = new URL(this.env.APP_ORIGIN);
    if (
      url.origin !== this.env.APP_ORIGIN ||
      (this.env.ENVIRONMENT === "production" &&
        url.origin !== "https://guteneo.com") ||
      (url.protocol !== "https:" &&
        !(
          this.env.ENVIRONMENT === "local" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    )
      throw fail(
        "UPLOAD_CONFIGURATION_INVALID",
        "The private upload origin is not configured.",
        503,
      );
    return url.origin;
  }

  private context(row: UploadRow): ActorContext {
    return {
      organizationId: row.organization_id,
      userId: row.user_id,
      role: row.member_role,
      supervisorCanApprove: row.supervisor_can_approve === 1,
      supervisorCanReport: row.supervisor_can_report === 1,
      actor: "mcp",
    };
  }
  private fence(row: UploadRow, active = true) {
    return {
      condition: `EXISTS(SELECT 1 FROM authorized_connections uc
        JOIN connection_tool_observations uo ON uo.connection_id=uc.id AND uo.organization_id=uc.organization_id AND uo.user_id=uc.user_id
        JOIN memberships um ON um.organization_id=uc.organization_id AND um.user_id=uc.user_id
        JOIN organizations ug ON ug.id=um.organization_id
        JOIN auth_identities ui ON ui.issuer=uc.issuer AND ui.user_id=um.user_id AND ui.subject=?
        WHERE uc.id=? AND uc.issuer=? AND uc.client_id=? AND uc.organization_id=? AND uc.user_id=?
        AND uc.status='active' AND uc.not_before<=? AND uo.authorization_revision=?
        AND um.role=? AND um.role IN ('admin','supervisor','member') AND um.supervisor_can_approve=? AND um.supervisor_can_report=?
        AND ug.mode=? AND ?=? AND ?=? AND (?='verified_email' AND ?=1 OR ?='verified_email_and_mfa' AND (um.role<>'admin' OR ?=1))
        ${active ? "AND ?>unixepoch('now') AND ?>strftime('%Y-%m-%dT%H:%M:%fZ','now')" : ""})`,
      values: [
        row.subject,
        row.connection_id_snapshot,
        row.issuer,
        row.client_id,
        row.organization_id,
        row.user_id,
        row.token_issued_at,
        row.authorization_revision,
        row.member_role,
        row.supervisor_can_approve,
        row.supervisor_can_report,
        this.env.MODE,
        row.mode,
        this.env.MODE,
        row.authentication_policy,
        authenticationPolicy(this.env),
        row.authentication_policy,
        row.verified_account,
        row.authentication_policy,
        row.mfa,
        ...(active ? [row.token_expires_at, row.expires_at] : []),
      ] as (string | number | null)[],
    };
  }
  private async assertCurrent(row: UploadRow, active = true) {
    if (row.issuer !== auth0Issuer(this.env)) throw deny();
    try {
      verifiedMcpTokenIssuer(
        { verifiedTokenIssuer: row.token_issuer },
        this.env,
      );
    } catch {
      throw deny();
    }
    if (
      active &&
      (row.token_expires_at * 1000 <= Date.now() ||
        Date.parse(row.expires_at) <= Date.now())
    )
      throw deny();
    const fence = this.fence(row, active);
    if (
      !(await this.env.DB.prepare(`SELECT 1 WHERE ${fence.condition}`)
        .bind(...fence.values)
        .first())
    )
      throw deny();
  }
  private async owned(identity: McpIdentity, uploadId: string) {
    requireScope(identity, "documents:write");
    const row = await this.env.DB.prepare(
      "SELECT * FROM private_document_uploads WHERE organization_id=? AND id=? AND user_id=? AND client_id=?",
    )
      .bind(
        identity.context.organizationId,
        uploadId,
        identity.context.userId,
        identity.clientId,
      )
      .first<UploadRow>();
    if (
      !row ||
      !identity.connectionObservation ||
      row.connection_id_snapshot !==
        identity.connectionObservation.connectionId ||
      row.authorization_revision !==
        identity.connectionObservation.authorizationRevision
    )
      throw deny();
    // Status can outlive the old token/short capability, under a fresh current OAuth request.
    await postalMcpAuthority(identity, this.env, "documents:write");
    await this.assertCurrent(row, false);
    return row;
  }
  async begin(
    identity: McpIdentity,
    value: PrivateUploadInput,
  ): Promise<PrivateUploadView> {
    return this.beginTransport(identity, value, "binary");
  }
  /** Internal adapter seam; never returns a binary grant to an App caller. */
  async reserveApp(
    identity: McpIdentity,
    value: PrivateUploadInput,
  ): Promise<UploadRow> {
    const view = await this.beginTransport(identity, value, "app");
    return this.owned(identity, view.uploadId);
  }
  async appOwned(identity: McpIdentity, uploadId: string, active = true) {
    const row = await this.owned(identity, uploadId);
    if (row.transport !== "app") throw deny();
    await this.assertCurrent(row, active);
    return row;
  }
  appAuthority(row: UploadRow, active = true) {
    if (row.transport !== "app") throw deny();
    return {
      sql: () => this.fence(row, active),
      assertCurrent: () => this.assertCurrent(row, active),
    };
  }
  private async beginTransport(
    identity: McpIdentity,
    value: PrivateUploadInput,
    transport: "binary" | "app",
  ): Promise<PrivateUploadView> {
    const input = privateUploadInput.parse(value);
    const origin = this.origin();
    if (
      !identity.connectionObservation ||
      identity.token.startsWith("gtn_dev_")
    )
      throw deny();
    await postalMcpAuthority(identity, this.env, "documents:write");
    const claims = decodeJwt(identity.token);
    if (
      claims.iss !== verifiedMcpTokenIssuer(identity, this.env) ||
      typeof claims.sub !== "string" ||
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp !== identity.expiresAt
    )
      throw deny();
    const timestamp = iso();
    const expiry = Math.min(
      Date.now() + PRIVATE_UPLOAD_TTL_MS,
      identity.expiresAt * 1000,
    );
    if (expiry <= Date.now()) throw deny();
    const capability = secret();
    const row: UploadRow = {
      id: `upl_${crypto.randomUUID()}`,
      transport,
      organization_id: identity.context.organizationId,
      user_id: identity.context.userId,
      client_id: identity.clientId,
      connection_id_snapshot: identity.connectionObservation.connectionId,
      authorization_revision:
        identity.connectionObservation.authorizationRevision,
      issuer: auth0Issuer(this.env),
      token_issuer: verifiedMcpTokenIssuer(identity, this.env),
      subject: claims.sub,
      token_issued_at: claims.iat!,
      token_expires_at: claims.exp!,
      member_role: identity.context.role,
      supervisor_can_approve: Number(
        identity.context.supervisorCanApprove ?? false,
      ),
      supervisor_can_report: Number(
        identity.context.supervisorCanReport ?? false,
      ),
      authentication_policy: authenticationPolicy(this.env),
      verified_account: Number(hasVerifiedAccount(claims)),
      mfa: Number(hasMfa(claims)),
      mode: this.env.MODE,
      idempotency_key: input.idempotencyKey,
      file_name: input.fileName,
      expected_size: input.size,
      expected_sha256: input.sha256,
      capability_hash: await hashSecret(capability),
      state: "reserved",
      planned_document_id: `doc_${crypto.randomUUID()}`,
      document_id: null,
      lease_token: null,
      lease_expires_at: null,
      error_code: null,
      expires_at: new Date(expiry).toISOString(),
      created_at: timestamp,
      updated_at: timestamp,
    };
    const authority = this.fence(row);
    const columns = Object.keys(row);
    await this.env.DB.prepare(
      `INSERT INTO private_document_uploads(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE ${authority.condition}
      AND (SELECT COUNT(*) FROM private_document_uploads WHERE organization_id=? AND state IN ('reserved','uploading') AND expires_at>?)<20
      AND (SELECT COUNT(*) FROM private_document_uploads WHERE organization_id=? AND created_at>=?)<200
      ON CONFLICT(organization_id,idempotency_key) DO NOTHING`,
    )
      .bind(
        ...Object.values(row),
        ...authority.values,
        row.organization_id,
        timestamp,
        row.organization_id,
        `${timestamp.slice(0, 10)}T00:00:00.000Z`,
      )
      .run();
    const existing = await this.env.DB.prepare(
      "SELECT * FROM private_document_uploads WHERE organization_id=? AND idempotency_key=?",
    )
      .bind(row.organization_id, row.idempotency_key)
      .first<UploadRow>();
    if (!existing)
      throw fail(
        "UPLOAD_LIMIT_REACHED",
        "Too many pending or daily private uploads. Read an existing upload before creating another.",
        429,
      );
    if (
      existing.transport !== transport ||
      existing.user_id !== row.user_id ||
      existing.client_id !== row.client_id ||
      existing.connection_id_snapshot !== row.connection_id_snapshot ||
      existing.authorization_revision !== row.authorization_revision ||
      existing.file_name !== row.file_name ||
      existing.expected_size !== row.expected_size ||
      existing.expected_sha256 !== row.expected_sha256
    )
      throw fail(
        "UPLOAD_KEY_CONFLICT",
        "This key already identifies a different original or connection.",
      );
    await this.assertCurrent(existing, false);
    if (existing.state !== "reserved" || existing.expires_at <= timestamp)
      return this.result(identity, await this.reconcile(existing));
    const current = this.fence(existing);
    const renewed = await this.env.DB.prepare(
      `UPDATE private_document_uploads SET capability_hash=?,updated_at=? WHERE organization_id=? AND id=? AND state='reserved' AND expires_at>? AND ${current.condition} RETURNING *`,
    )
      .bind(
        row.capability_hash,
        timestamp,
        row.organization_id,
        existing.id,
        timestamp,
        ...current.values,
      )
      .first<UploadRow>();
    if (!renewed)
      return this.result(
        identity,
        await this.reconcile(await this.owned(identity, existing.id)),
      );
    if (transport === "app") return this.view(renewed);
    return {
      ...(await this.view(renewed)),
      upload: {
        method: "PUT",
        url: new URL(`/api/document-uploads/${renewed.id}/content`, origin)
          .href,
        capabilityHeader: PRIVATE_UPLOAD_HEADER,
        capability,
        client: privateUploadClient,
      },
    };
  }
  async get(identity: McpIdentity, uploadId: string) {
    return this.getTransport(identity, uploadId, "binary");
  }
  async appGet(identity: McpIdentity, uploadId: string) {
    return this.getTransport(identity, uploadId, "app");
  }
  private async getTransport(
    identity: McpIdentity,
    uploadId: string,
    transport: UploadRow["transport"],
  ) {
    const row = await this.owned(identity, uploadId);
    if (row.transport !== transport) throw deny();
    return this.result(identity, await this.reconcile(row));
  }
  async importInlinePdf(
    identity: McpIdentity,
    value: InlinePdfInput,
    signal?: AbortSignal,
  ): Promise<PrivateUploadReceipt> {
    requireScope(identity, "documents:write");
    signal?.throwIfAborted();
    const { base64, ...input } = inlinePdfInput.parse(value);
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        base64,
      )
    )
      throw fail(
        "INLINE_PDF_ENCODING_INVALID",
        "Use canonical standard base64 of the selected original PDF, without whitespace or a data URI.",
        422,
      );
    const binary = atob(base64);
    if (btoa(binary) !== base64)
      throw fail(
        "INLINE_PDF_ENCODING_INVALID",
        "The original PDF base64 encoding is not canonical.",
        422,
      );
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (
      bytes.byteLength !== input.size ||
      (await digest(bytes)) !== input.sha256
    )
      throw fail(
        "INLINE_PDF_INTEGRITY_MISMATCH",
        "Compute the byte size and SHA-256 against the selected original PDF. Do not repair, reconstruct or retry it with a new key.",
        422,
      );
    if (binary.slice(0, 5) !== "%PDF-")
      throw fail(
        "INLINE_PDF_NOT_PDF",
        "The selected original is not a PDF.",
        422,
      );
    signal?.throwIfAborted();
    // Reuse the same durable reservation, claim, quota and exact-byte pipeline.
    // The upload-only grant remains in server memory, never in this tool's result.
    const { upload, ...reservation } = await this.begin(identity, input);
    if (!upload) return reservation;
    signal?.throwIfAborted();
    const received = await this.receive(
      new Request(upload.url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(bytes.byteLength),
          [PRIVATE_UPLOAD_HEADER]: upload.capability,
        },
        body: bytes,
        signal,
      }),
    );
    await received.body?.cancel().catch(() => {});
    const { upload: unusedGrant, ...receipt } = await this.get(
      identity,
      reservation.uploadId,
    );
    void unusedGrant;
    return receipt;
  }
  private async result(identity: McpIdentity, row: UploadRow) {
    const result = await this.view(row);
    await postalMcpAuthority(identity, this.env, "documents:write");
    await this.assertCurrent(row, false);
    return result;
  }
  private async reconcile(row: UploadRow): Promise<UploadRow> {
    if (row.state === "reserved" && row.expires_at <= iso()) {
      await this.env.DB.prepare(
        "UPDATE private_document_uploads SET state='rejected',capability_hash=NULL,error_code='UPLOAD_EXPIRED',updated_at=? WHERE organization_id=? AND id=? AND state='reserved' AND expires_at<=?",
      )
        .bind(iso(), row.organization_id, row.id, iso())
        .run();
    } else if (row.state === "uploading" && row.lease_expires_at! <= iso()) {
      // Fence the dead writer before resolving any registration or owned object.
      await this.env.DB.prepare(
        "UPDATE private_document_uploads SET state='unknown',lease_token=NULL,lease_expires_at=NULL,error_code='UPLOAD_UNCONFIRMED',updated_at=? WHERE organization_id=? AND id=? AND state='uploading' AND lease_expires_at<=?",
      )
        .bind(iso(), row.organization_id, row.id, iso())
        .run();
    }
    const current = await this.env.DB.prepare(
      "SELECT * FROM private_document_uploads WHERE organization_id=? AND id=?",
    )
      .bind(row.organization_id, row.id)
      .first<UploadRow>();
    if (current?.state === "unknown") {
      const document = await this.env.DB.prepare(
        "SELECT id FROM documents WHERE organization_id=? AND sha256=? AND size=? AND access_owner_id=? AND status<>'purged'",
      )
        .bind(
          current.organization_id,
          current.expected_sha256,
          current.expected_size,
          current.user_id,
        )
        .first<{ id: string }>();
      if (document) {
        const authority = this.fence(current, false);
        const recovered = await this.env.DB.prepare(
          `UPDATE private_document_uploads SET state='complete',document_id=?,error_code=NULL,updated_at=? WHERE organization_id=? AND id=? AND state='unknown' AND ${authority.condition} RETURNING *`,
        )
          .bind(
            document.id,
            iso(),
            current.organization_id,
            current.id,
            ...authority.values,
          )
          .first<UploadRow>();
        if (recovered) return recovered;
      } else {
        // Only this attempt's exact unregistered object may be removed. The
        // terminal ledger fences late registration; never delete deduplicated data.
        const key = `${current.organization_id}/documents/${current.expected_sha256}/${current.planned_document_id}.pdf`;
        const retained = await this.env.DB.prepare(
          "SELECT 1 FROM documents WHERE organization_id=? AND storage_key=?",
        )
          .bind(current.organization_id, key)
          .first();
        if (!retained) await this.env.DOCUMENTS.delete(key);
      }
    }
    return current!;
  }
  private async view(row: UploadRow): Promise<PrivateUploadView> {
    const view: PrivateUploadView = {
      uploadId: row.id,
      status: row.state,
      expiresAt: row.expires_at,
      nextAction:
        row.state === "reserved"
          ? "upload_exact_bytes"
          : row.state === "uploading"
            ? "wait"
            : row.state === "complete"
              ? "get_document"
              : "do_not_retry",
      ...(row.state === "uploading" ? { retryAfterSeconds: 5 } : {}),
      ...(row.error_code ? { errorCode: row.error_code } : {}),
    };
    if (row.document_id)
      view.document = await this.documents.get(
        this.context(row),
        row.document_id,
      );
    return view;
  }
  async receive(request: Request): Promise<Response> {
    try {
      return await this.receiveOnce(request);
    } finally {
      void request.body?.cancel().catch(() => {});
    }
  }
  private async receiveOnce(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    };
    if (
      !privateUploadPath(url.pathname) ||
      url.origin !== this.origin() ||
      url.search ||
      url.hash ||
      request.method !== "PUT" ||
      request.headers.has("Cookie") ||
      request.headers.has("Authorization") ||
      request.headers.has("Origin") ||
      request.headers.get("content-type")?.toLowerCase() !==
        "application/pdf" ||
      request.headers.has("content-encoding")
    ) {
      void request.body?.cancel().catch(() => {});
      return Response.json(
        {
          error: {
            code: "UPLOAD_REQUEST_DENIED",
            message:
              "Use the exact private upload request supplied by Guteneo.",
          },
        },
        { status: 403, headers },
      );
    }
    const capability = request.headers.get(PRIVATE_UPLOAD_HEADER) ?? "";
    if (!/^[a-f0-9]{64}$/.test(capability)) {
      void request.body?.cancel().catch(() => {});
      return Response.json(
        {
          error: {
            code: "UPLOAD_CAPABILITY_INVALID",
            message: "The upload capability is unavailable.",
          },
        },
        { status: 403, headers },
      );
    }
    const uploadId = url.pathname.split("/")[3];
    const row = await this.env.DB.prepare(
      "SELECT * FROM private_document_uploads WHERE id=? AND capability_hash=? AND state='reserved'",
    )
      .bind(uploadId, await hashSecret(capability))
      .first<UploadRow>();
    if (!row || row.transport !== "binary") {
      void request.body?.cancel().catch(() => {});
      return Response.json(
        {
          error: {
            code: "UPLOAD_CAPABILITY_INVALID",
            message:
              "Read this upload through the connected MCP before any further action.",
          },
        },
        { status: 403, headers },
      );
    }
    return this.acceptReserved(
      row,
      (signal) =>
        readLimited(new Response(request.body), row.expected_size, signal),
      request.signal,
      request.headers.get("content-length"),
      headers,
    );
  }
  async acceptApp(
    identity: McpIdentity,
    uploadId: string,
    consume: (signal: AbortSignal) => Promise<Uint8Array>,
    signal: AbortSignal,
    assertTransportCurrent: () => Promise<void>,
  ): Promise<Response> {
    const row = await this.appOwned(identity, uploadId);
    return this.acceptReserved(
      row,
      consume,
      signal,
      String(row.expected_size),
      {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "no-referrer",
      },
      assertTransportCurrent,
    );
  }
  private async acceptReserved(
    row: UploadRow,
    consume: (signal: AbortSignal) => Promise<Uint8Array>,
    requestSignal: AbortSignal,
    contentLength: string | null,
    headers: Record<string, string>,
    assertTransportCurrent?: () => Promise<void>,
  ): Promise<Response> {
    const uploadId = row.id;
    let pipelineStarted = false;
    let ownedLease: string | undefined;
    try {
      await assertTransportCurrent?.();
      await this.assertCurrent(row);
      const fence = this.fence(row);
      const lease = secret();
      const claimed = await this.env.DB.prepare(
        `UPDATE private_document_uploads SET state='uploading',capability_hash=NULL,lease_token=?,lease_expires_at=?,updated_at=? WHERE organization_id=? AND id=? AND state='reserved' AND capability_hash=? AND ${fence.condition} RETURNING *`,
      )
        .bind(
          lease,
          new Date(
            Math.min(
              Date.now() + PRIVATE_UPLOAD_LEASE_MS,
              Date.parse(row.expires_at),
            ),
          ).toISOString(),
          iso(),
          row.organization_id,
          row.id,
          row.capability_hash,
          ...fence.values,
        )
        .first<UploadRow>();
      if (!claimed)
        throw fail(
          "UPLOAD_ALREADY_STARTED",
          "Read the same upload through MCP; do not repeat the binary request.",
        );
      row = claimed;
      ownedLease = lease;
      const length = contentLength;
      if (
        length !== null &&
        (!/^\d+$/.test(length) || Number(length) !== row.expected_size)
      )
        throw fail(
          "UPLOAD_SIZE_MISMATCH",
          "The original PDF size differs from the reservation.",
          422,
        );
      const signal = AbortSignal.any([
        requestSignal,
        AbortSignal.timeout(
          Math.max(
            1,
            Math.min(
              PRIVATE_UPLOAD_BODY_MS,
              Date.parse(row.expires_at) - Date.now(),
            ),
          ),
        ),
      ]);
      const bytes = await consume(signal);
      if (
        bytes.byteLength !== row.expected_size ||
        (await digest(bytes as Uint8Array<ArrayBuffer>)) !== row.expected_sha256
      )
        throw fail(
          "UPLOAD_INTEGRITY_MISMATCH",
          "The received PDF differs from the reserved original.",
          422,
        );
      if (!new TextDecoder().decode(bytes.subarray(0, 5)).startsWith("%PDF-"))
        throw fail(
          "UPLOAD_NOT_PDF",
          "The received original is not a PDF.",
          422,
        );
      const activeRow = row;
      const authority = {
        sql: () => {
          const live = this.fence(activeRow);
          return {
            condition: `${live.condition} AND EXISTS(SELECT 1 FROM private_document_uploads ul WHERE ul.organization_id=? AND ul.id=? AND ul.state='uploading' AND ul.lease_token=? AND ul.lease_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
            values: [
              ...live.values,
              activeRow.organization_id,
              activeRow.id,
              lease,
            ],
          };
        },
        assertCurrent: async () => {
          await assertTransportCurrent?.();
          if (requestSignal.aborted) throw deny();
          const condition = authority.sql();
          if (
            !(await this.env.DB.prepare(`SELECT 1 WHERE ${condition.condition}`)
              .bind(...condition.values)
              .first())
          )
            throw deny();
        },
      };
      await authority.assertCurrent();
      pipelineStarted = true;
      const document = await this.documents.upload(
        this.context(row),
        { name: row.file_name, bytes, privateToCreator: true },
        "import",
        { documentId: row.planned_document_id, authority },
      );
      if (
        document.organization_id !== row.organization_id ||
        document.access_owner_id !== row.user_id ||
        document.sha256 !== row.expected_sha256 ||
        document.size !== row.expected_size
      )
        throw fail(
          "UPLOAD_INTEGRITY_MISMATCH",
          "The registered PDF does not match the reserved original.",
        );
      await authority.assertCurrent();
      const final = authority.sql();
      const complete = await this.env.DB.prepare(
        `UPDATE private_document_uploads SET state='complete',document_id=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE organization_id=? AND id=? AND ${final.condition} RETURNING id`,
      )
        .bind(document.id, iso(), row.organization_id, row.id, ...final.values)
        .first();
      if (!complete) throw deny();
      return Response.json(
        { uploadId, status: "received" },
        { status: 202, headers },
      );
    } catch (error) {
      if (row && ownedLease) {
        await this.env.DB.prepare(
          "UPDATE private_document_uploads SET state=?,capability_hash=NULL,lease_token=NULL,lease_expires_at=NULL,error_code=?,updated_at=? WHERE organization_id=? AND id=? AND state='uploading' AND lease_token=?",
        )
          .bind(
            pipelineStarted ? "unknown" : "rejected",
            pipelineStarted ? "UPLOAD_UNCONFIRMED" : "UPLOAD_REJECTED",
            iso(),
            row.organization_id,
            row.id,
            ownedLease,
          )
          .run();
      }
      const known =
        !pipelineStarted &&
        (error instanceof ContentError || error instanceof AuthError);
      return Response.json(
        {
          error: {
            code: known ? error.code : "UPLOAD_UNCONFIRMED",
            message: known
              ? error.message
              : "The import outcome must be checked through get_document_upload with the same uploadId. Do not upload again.",
          },
        },
        { status: known ? error.status : 409, headers },
      );
    }
  }
}
