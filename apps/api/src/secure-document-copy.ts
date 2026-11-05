import { ContentError, LIMITS } from "../../../packages/contracts/src/content";
import {
  canonicalJson,
  sha256,
  type DocumentRecord,
  type DomainService,
} from "../../../packages/domain/src/index";
import { DocumentService, readLimited } from "./documents";
import type { Env } from "./env";
import type { PostalAuthority } from "./postal-authority";

/** Copying is a browser operation, separate from preparing or approving a share. */
export class SecureDocumentCopyService {
  constructor(
    private readonly env: Env,
    private readonly domain: DomainService,
  ) {}

  async create(authority: PostalAuthority, sourceId: string, key: string) {
    const ctx = authority.context;
    if (ctx.actor !== "browser")
      throw new ContentError(
        "BROWSER_REQUIRED",
        "Open Guteneo in your browser to create a secure copy.",
        403,
      );
    if (!key || key.length > 200 || /[\r\n\0]/.test(key))
      throw new ContentError(
        "INVALID_IDEMPOTENCY_KEY",
        "An idempotency key is required.",
      );
    await authority.assertCurrent();
    await this.domain.authorizeWrite(ctx);
    try {
      await this.env.DB.prepare(
        "SELECT secure_copy_source_id FROM documents LIMIT 0",
      ).all();
    } catch (error) {
      if (/no such column: secure_copy_source_id\b/.test(String(error)))
        throw new ContentError(
          "SECURE_COPY_NOT_AVAILABLE",
          "Secure document copying is not available yet. Try again after the application update.",
          409,
        );
      throw error;
    }
    const source = await this.domain.getDocument(ctx, sourceId);
    const local =
      this.env.ENVIRONMENT === "local" && this.env.MODE === "simulation";
    const sourceFence = {
      condition: `EXISTS(SELECT 1 FROM documents s WHERE s.organization_id=? AND s.id=? AND s.status='ready' AND s.sha256=? AND s.size=? AND s.pages=? AND s.storage_key=? AND s.secure_copy_source_id IS NULL AND (s.access_owner_id IS NULL OR s.access_owner_id=?) AND NOT EXISTS(SELECT 1 FROM secure_distributions d WHERE d.organization_id=s.organization_id AND d.source_id=s.id) AND (?=1 OR EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=s.organization_id AND a.action='document.scan_verified' AND a.resource_id=s.sha256)))`,
      values: [
        ctx.organizationId,
        source.id,
        source.sha256,
        source.size,
        source.pages,
        source.storage_key,
        ctx.userId,
        local ? 1 : 0,
      ],
    };
    const assertSource = async () => {
      await authority.assertCurrent();
      await this.domain.getDocument(ctx, sourceId);
      if (
        !(await this.env.DB.prepare(`SELECT 1 WHERE ${sourceFence.condition}`)
          .bind(...sourceFence.values)
          .first())
      )
        throw new ContentError(
          "SECURE_COPY_SOURCE_UNAVAILABLE",
          "Choose a ready document outside an existing secure workflow. Its exact scan evidence must be available.",
          409,
        );
    };
    await assertSource();
    // The document itself is the durable receipt. Keys are actor/tenant scoped and
    // never stored or logged. Including the source in the receipt detects key reuse.
    const documentId = `doc_${await sha256(canonicalJson([ctx.organizationId, ctx.userId, key, "secure-copy-v1"]))}`;
    const receipt = async () => {
      const row = await this.env.DB.prepare(
        "SELECT * FROM documents WHERE organization_id=? AND id=? AND access_owner_id=?",
      )
        .bind(ctx.organizationId, documentId, ctx.userId)
        .first<DocumentRecord>();
      if (!row) return null;
      if (
        row.secure_copy_source_id !== source.id ||
        row.sha256 !== source.sha256
      )
        throw new ContentError(
          "IDEMPOTENCY_CONFLICT",
          "This idempotency key was used for a different source.",
          409,
        );
      if (row.status === "purged")
        throw new ContentError(
          "SECURE_COPY_PURGED",
          "This copy has expired. Create another copy with a new request.",
          410,
        );
      await assertSource();
      return new DocumentService(this.env, this.domain).get(ctx, row.id);
    };
    const existing = await receipt();
    if (existing) return existing;
    const budget = await this.env.DB.prepare(
      `SELECT 1 FROM content_limits l LEFT JOIN content_usage u ON u.organization_id=l.organization_id AND u.day=? WHERE l.organization_id=? AND COALESCE(u.uploads,0)+1<=l.uploads_per_day AND COALESCE(u.bytes,0)+?<=l.bytes_per_day`,
    )
      .bind(
        new Date().toISOString().slice(0, 10),
        ctx.organizationId,
        source.size,
      )
      .first();
    if (!budget)
      throw new ContentError(
        "CONTENT_QUOTA_EXCEEDED",
        "Document limit reached or document credits have not been granted.",
        429,
      );
    if (
      !Number.isSafeInteger(source.size) ||
      source.size < 20 ||
      source.size > LIMITS.pdfBytes ||
      !source.storage_key.startsWith(`${ctx.organizationId}/documents/`)
    )
      throw new ContentError(
        "DOCUMENT_INTEGRITY_ERROR",
        "The original file's integrity could not be verified.",
        423,
      );
    const object = await this.env.DOCUMENTS.get(source.storage_key);
    if (!object)
      throw new ContentError(
        "DOCUMENT_UNAVAILABLE",
        "The original of this document is unavailable.",
        404,
      );
    if (object.size !== source.size)
      throw new ContentError(
        "DOCUMENT_INTEGRITY_ERROR",
        "The original file's integrity could not be verified.",
        423,
      );
    const bytes = await readLimited(
      new Response(object.body),
      LIMITS.pdfBytes,
      AbortSignal.timeout(15_000),
    );
    if (bytes.length !== source.size || (await sha256(bytes)) !== source.sha256)
      throw new ContentError(
        "DOCUMENT_INTEGRITY_ERROR",
        "The original file's integrity could not be verified.",
        423,
      );
    // The source hash separates concurrent different-source attempts. Conditional
    // put preserves the winner, and uncertain writes are left to orphan cleanup.
    const storageKey = `${ctx.organizationId}/documents/${source.sha256}/${documentId}.pdf`;
    const stored = await this.env.DOCUMENTS.put(storageKey, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { sha256: source.sha256, source: source.source },
    });
    if (!stored) {
      const retained = await this.env.DOCUMENTS.get(storageKey);
      if (
        !retained ||
        retained.size !== source.size ||
        (await sha256(new Uint8Array(await retained.arrayBuffer()))) !==
          source.sha256
      )
        throw new ContentError(
          "DOCUMENT_INTEGRITY_ERROR",
          "The secure copy's integrity could not be verified.",
          423,
        );
    }
    await assertSource();
    const currentAuthority = authority.sql();
    const stamp = new Date().toISOString();
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(
          `INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at,access_owner_id,secure_copy_source_id)
          SELECT ?,?,?,?,?,?,'ready',?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM documents WHERE organization_id=? AND id=?) AND (${sourceFence.condition}) AND (${currentAuthority.condition})`,
        ).bind(
          documentId,
          ctx.organizationId,
          source.name,
          source.sha256,
          source.size,
          source.pages,
          source.source,
          storageKey,
          stamp,
          ctx.userId,
          source.id,
          ctx.organizationId,
          documentId,
          ...sourceFence.values,
          ...currentAuthority.values,
        ),
        this.env.DB.prepare(
          `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'document.secure_copy_created',?,'{}',? WHERE changes()=1`,
        ).bind(
          crypto.randomUUID(),
          ctx.organizationId,
          ctx.userId,
          documentId,
          stamp,
        ),
      ]);
    } catch (error) {
      if (String(error).includes("content_quota_exceeded"))
        throw new ContentError(
          "CONTENT_QUOTA_EXCEEDED",
          "Document limit reached or document credits have not been granted.",
          429,
        );
      // A D1 failure can follow a committed write: retaining the immutable R2
      // candidate allows the same-key retry to recover without deleting a winner.
      throw error;
    }
    const result = await receipt();
    if (!result) {
      await assertSource();
      throw new ContentError(
        "SECURE_COPY_AUTHORITY_CHANGED",
        "Your session or document access changed. Try again from your workspace.",
        403,
      );
    }
    return result;
  }
}
