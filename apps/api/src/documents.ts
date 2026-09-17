import { validatePdf } from "../../../packages/contracts/src/pdf";
export { validatePdf } from "../../../packages/contracts/src/pdf";
import {
  ContentError,
  LIMITS,
  printableHtml,
  safeHeader,
} from "../../../packages/contracts/src/content";
import type {
  DocumentRecord,
  DomainService,
} from "../../../packages/domain/src/index";
import type { Env } from "./env";

export const REVIEW_PDF_MAX_BYTES = 1024 * 1024;
export interface ExactReviewPdf {
  document: DocumentRecord;
  bytes: Uint8Array;
}

type DocumentContext = Parameters<DomainService["registerDocument"]>[0];

async function withinDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let abort: () => void = () => {};
  const expired = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error("DOCUMENT_SCAN_TIMEOUT"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([operation, expired]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

async function boundedJson(
  response: Response,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (
    !response.ok ||
    !response.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("DOCUMENT_SCAN_RESPONSE_INVALID");
  const bytes = await withinDeadline(readLimited(response, 4096), signal);
  const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("DOCUMENT_SCAN_RESPONSE_INVALID");
  return result as Record<string, unknown>;
}

async function reserveScanBudget(
  db: D1Database,
  organizationId: string,
  warm: boolean,
): Promise<void> {
  const result = await db
    .prepare(
      `INSERT INTO document_scan_usage(organization_id,day,rescans,warmups) VALUES(?,?,?,?)
 ON CONFLICT(organization_id,day) DO UPDATE SET rescans=rescans+excluded.rescans,warmups=warmups+excluded.warmups
 WHERE rescans+excluded.rescans<=10 AND warmups+excluded.warmups<=3 RETURNING rescans`,
    )
    .bind(
      organizationId,
      new Date().toISOString().slice(0, 10),
      warm ? 0 : 1,
      warm ? 1 : 0,
    )
    .first();
  if (!result)
    throw new ContentError(
      "SCAN_QUOTA_EXCEEDED",
      "Limite quotidienne d’analyses atteinte. Réessayez demain.",
      429,
    );
}
export async function readLimited(
  response: Response,
  limit = LIMITS.pdfBytes,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!response.ok)
    throw new ContentError(
      "DOWNLOAD_FAILED",
      "Le fichier source est inaccessible.",
      422,
    );
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit)
    throw new ContentError("FILE_TOO_LARGE", "Fichier trop volumineux.", 413);
  if (!response.body) throw new ContentError("EMPTY_DOWNLOAD", "Fichier vide.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await (signal
        ? withinDeadline(reader.read(), signal)
        : reader.read());
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit)
        throw new ContentError(
          "FILE_TOO_LARGE",
          "Fichier trop volumineux.",
          413,
        );
      chunks.push(next.value);
    }
  } finally {
    // Cleanup must not defeat the caller's deadline or replace its integrity error.
    const cancelled = reader.cancel().catch(() => {});
    if (signal) await withinDeadline(cancelled, signal).catch(() => {});
    else await cancelled;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
export function permittedImportUrl(
  raw: string,
  hosts: string | undefined,
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ContentError("INVALID_URL", "URL source invalide.");
  }
  const allowed = (hosts ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !allowed.includes(url.hostname.toLowerCase()) ||
    /^(localhost|.*\.localhost|.*\.local)$|^[\d.]+$|[:\[\]]/i.test(url.hostname)
  )
    throw new ContentError(
      "SOURCE_NOT_ALLOWED",
      "Source non autorisée. Utilisez le téléversement authentifié ou configurez le domaine exact du fournisseur de fichiers.",
    );
  return url;
}
export class DocumentService {
  constructor(
    private env: Env,
    private domain: DomainService,
  ) {}

  async rescan(ctx: DocumentContext, id: string) {
    await this.domain.authorizeWrite(ctx);
    const document = await this.domain.getDocument(ctx, id);
    if (document.status === "ready") return document;
    if (document.status !== "quarantined" || document.pages !== 0)
      throw new ContentError(
        "DOCUMENT_NOT_RESCANABLE",
        "Ce document ne peut pas être analysé de nouveau.",
        409,
      );
    if (!this.env.SCANNER || !this.env.DOCUMENT_RENDERER)
      throw new ContentError(
        "SCANNER_NOT_CONFIGURED",
        "Le service d’analyse doit être raccordé avant de réessayer.",
        503,
      );
    const token = crypto.randomUUID();
    const now = Date.now();
    const lock = await this.env.DB.prepare(
      `INSERT INTO document_scan_locks(organization_id,document_id,token,expires_at) VALUES(?,?,?,?)
 ON CONFLICT(organization_id,document_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
 WHERE expires_at<? RETURNING token`,
    )
      .bind(ctx.organizationId, document.id, token, now + 45_000, now)
      .first();
    if (!lock)
      throw new ContentError(
        "DOCUMENT_SCAN_BUSY",
        "Ce document est déjà en cours d’analyse.",
        409,
      );
    try {
      await reserveScanBudget(this.env.DB, ctx.organizationId, false);
      const signal = AbortSignal.timeout(30_000);
      const object = await withinDeadline(
        this.env.DOCUMENTS.get(document.storage_key),
        signal,
      );
      if (!object)
        throw new ContentError(
          "DOCUMENT_UNAVAILABLE",
          "L’original de ce document est indisponible.",
          404,
        );
      if (
        object.size !== document.size ||
        object.size > LIMITS.pdfBytes ||
        !document.storage_key.startsWith(`${ctx.organizationId}/documents/`)
      )
        throw new ContentError(
          "DOCUMENT_INTEGRITY_ERROR",
          "L’intégrité de l’original n’a pas pu être vérifiée.",
          423,
        );
      const bytes = await withinDeadline(
        readLimited(new Response(object.body), LIMITS.pdfBytes),
        signal,
      );
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            bytes as Uint8Array<ArrayBuffer>,
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (bytes.byteLength !== document.size || hash !== document.sha256)
        throw new ContentError(
          "DOCUMENT_INTEGRITY_ERROR",
          "L’intégrité de l’original n’a pas pu être vérifiée.",
          423,
        );
      let pages = 0;
      try {
        const scan = await withinDeadline(
          this.env.SCANNER.fetch(
            new Request("https://scanner.internal/scan", {
              method: "POST",
              body: bytes as Uint8Array<ArrayBuffer>,
              headers: { "Content-Type": "application/pdf" },
              signal,
            }),
          ),
          signal,
        );
        const scanned = await boundedJson(scan, signal);
        if (scanned.sha256 !== document.sha256 || scanned.verdict !== "clean")
          return await this.domain.getDocument(ctx, id);
        const validated = await withinDeadline(
          this.env.DOCUMENT_RENDERER.fetch(
            new Request("https://documents.internal/validate", {
              method: "POST",
              body: bytes as Uint8Array<ArrayBuffer>,
              headers: { "Content-Type": "application/pdf" },
              signal,
            }),
          ),
          signal,
        );
        const result = await boundedJson(validated, signal);
        if (
          result.sha256 !== document.sha256 ||
          typeof result.pages !== "number" ||
          !Number.isInteger(result.pages) ||
          result.pages < 1 ||
          result.pages > LIMITS.pages
        )
          return await this.domain.getDocument(ctx, id);
        pages = result.pages;
      } catch {
        // Timeout, infected bytes and malformed responses never lift quarantine.
        return await this.domain.getDocument(ctx, id);
      }
      await this.domain.authorizeWrite(ctx);
      const fence =
        "EXISTS(SELECT 1 FROM document_scan_locks WHERE organization_id=? AND document_id=? AND token=? AND expires_at>?)";
      const member =
        "EXISTS(SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND role=? AND role IN ('admin','member'))";
      const guards = [
        ctx.organizationId,
        id,
        token,
        Date.now(),
        ctx.organizationId,
        ctx.userId,
        ctx.role,
      ];
      const result = await this.env.DB.batch([
        this.env.DB.prepare(
          `UPDATE documents SET status='ready',pages=? WHERE organization_id=? AND id=? AND status='quarantined' AND pages=0 AND sha256=? AND size=? AND storage_key=? AND ${fence} AND ${member}`,
        ).bind(
          pages,
          ctx.organizationId,
          id,
          document.sha256,
          document.size,
          document.storage_key,
          ...guards,
        ),
        // Keep the human retry history and the hash-based proof consumed by
        // live providers atomic with promotion of this exact original.
        ...[
          ["document.rescan_verified", id],
          ["document.scan_verified", document.sha256],
        ].map(([action, resourceId]) =>
          this.env.DB.prepare(
            `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE organization_id=? AND id=? AND status='ready' AND pages=? AND sha256=? AND size=? AND storage_key=?) AND ${fence} AND ${member}`,
          ).bind(
            crypto.randomUUID(),
            ctx.organizationId,
            ctx.userId,
            action,
            resourceId,
            JSON.stringify({ pages }),
            new Date().toISOString(),
            ctx.organizationId,
            id,
            pages,
            document.sha256,
            document.size,
            document.storage_key,
            ...guards,
          ),
        ),
      ]);
      const current = await this.domain.getDocument(ctx, id);
      if (result[0].meta.changes !== 1 && current.status === "quarantined")
        throw new ContentError(
          "DOCUMENT_SCAN_EXPIRED",
          "Cette analyse a expiré. Vous pouvez réessayer.",
          409,
        );
      return current;
    } finally {
      await this.env.DB.prepare(
        "DELETE FROM document_scan_locks WHERE organization_id=? AND document_id=? AND token=?",
      )
        .bind(ctx.organizationId, id, token)
        .run();
    }
  }

  async warmScanner(
    ctx: DocumentContext,
  ): Promise<{ status: "ready" | "not_ready"; retryAfterSeconds: number }> {
    await this.domain.authorizeWrite(ctx);
    if (ctx.actor !== "browser" || ctx.role !== "admin")
      throw new ContentError(
        "SCANNER_ADMIN_REQUIRED",
        "Seul un administrateur peut préparer le service d’analyse depuis son navigateur.",
        403,
      );
    if (!this.env.SCANNER)
      throw new ContentError(
        "SCANNER_NOT_CONFIGURED",
        "Le service d’analyse n’est pas raccordé.",
        503,
      );
    await reserveScanBudget(this.env.DB, ctx.organizationId, true);
    const signal = AbortSignal.timeout(30_000);
    try {
      const response = await withinDeadline(
        this.env.SCANNER.fetch(
          new Request("https://scanner.internal/health", { signal }),
        ),
        signal,
      );
      const result = await boundedJson(response, signal);
      if (result.status === "ready")
        return { status: "ready", retryAfterSeconds: 0 };
    } catch {
      /* Starting a cold scanner may exceed this request's deadline. */
    }
    return { status: "not_ready", retryAfterSeconds: 15 };
  }

  async upload(
    ctx: DocumentContext,
    input: { name: string; bytes: Uint8Array },
    source: "import" | "render" = "import",
  ) {
    await this.domain.authorizeWrite(ctx);
    await reserveContentBudget(
      this.env.DB,
      ctx.organizationId,
      input.bytes.length,
      false,
    );
    const name = safeHeader(input.name).slice(0, 180);
    if (
      input.bytes.length < 20 ||
      input.bytes.length > LIMITS.pdfBytes ||
      !new TextDecoder().decode(input.bytes.subarray(0, 8)).startsWith("%PDF-")
    )
      throw new ContentError("NOT_PDF", "PDF absent ou trop volumineux.");
    const local =
      this.env.ENVIRONMENT === "local" && this.env.MODE === "simulation";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      input.bytes as Uint8Array<ArrayBuffer>,
    );
    const sha256 = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    let pages = 0,
      status: "ready" | "quarantined" = "quarantined",
      scanVerified = false;
    if (local) {
      pages = (await validatePdf(input.bytes)).pages;
      status = "ready";
    }
    // Production bytes are stored without parsing. Only an exact clean scan unlocks isolated validation.
    const documentId = `doc_${crypto.randomUUID()}`;
    // Each version owns its object. A resumed purge of an older version cannot delete a re-import.
    const storageKey = `${ctx.organizationId}/documents/${sha256}/${documentId}.pdf`;
    await this.env.DOCUMENTS.put(storageKey, input.bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { sha256, source },
    });
    if (!local && this.env.SCANNER && this.env.DOCUMENT_RENDERER) {
      try {
        const scan = await this.env.SCANNER.fetch(
          new Request("https://scanner.internal/scan", {
            method: "POST",
            body: input.bytes as Uint8Array<ArrayBuffer>,
            headers: { "Content-Type": "application/pdf" },
            signal: AbortSignal.timeout(30000),
          }),
        );
        if (scan.ok) {
          const result = (await scan.json()) as {
            sha256?: string;
            verdict?: string;
          };
          if (result.sha256 === sha256 && result.verdict === "clean") {
            const validated = await this.env.DOCUMENT_RENDERER.fetch(
              new Request("https://documents.internal/validate", {
                method: "POST",
                body: input.bytes as Uint8Array<ArrayBuffer>,
                headers: { "Content-Type": "application/pdf" },
                signal: AbortSignal.timeout(20000),
              }),
            );
            if (validated.ok) {
              const result = (await validated.json()) as {
                sha256: string;
                pages: number;
              };
              if (
                result.sha256 === sha256 &&
                Number.isInteger(result.pages) &&
                result.pages > 0 &&
                result.pages <= LIMITS.pages
              ) {
                pages = result.pages;
                status = "ready";
                scanVerified = true;
              }
            }
          }
        }
      } catch {
        /* Keep quarantine. A failed scan is never a clean verdict. */
      }
    }
    const document = await this.domain.registerDocument(ctx, {
      id: documentId,
      name,
      sha256,
      size: input.bytes.length,
      pages,
      status,
      source,
      storageKey,
      scanVerified,
    });
    if (document.storage_key !== storageKey) {
      // Only discard our known losing candidate. An uncertain registration is left for orphan cleanup.
      try {
        await this.env.DOCUMENTS.delete(storageKey);
      } catch {
        /* Orphan maintenance retries this cleanup without affecting the retained document. */
      }
    }
    return document;
  }
  async importFile(
    ctx: DocumentContext,
    file: {
      download_url: string;
      file_id: string;
      mime_type?: string;
      file_name?: string;
    },
  ) {
    await this.domain.authorizeWrite(ctx);
    if (file.mime_type && file.mime_type !== "application/pdf")
      throw new ContentError("NOT_PDF", "Seuls les PDF sont acceptés.");
    const url = permittedImportUrl(
      file.download_url,
      this.env.IMPORT_ALLOWED_HOSTS,
    );
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/pdf" },
    });
    return this.upload(ctx, {
      name: file.file_name ?? "document.pdf",
      bytes: await readLimited(response),
    });
  }
  async render(ctx: DocumentContext, input: { name: string; html: string }) {
    await this.domain.authorizeWrite(ctx);
    await reserveContentBudget(this.env.DB, ctx.organizationId, 0, true);
    const request = new Request("https://documents.internal/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: printableHtml(input.html) }),
      signal: AbortSignal.timeout(25000),
    });
    let response: Response;
    if (this.env.DOCUMENT_RENDERER)
      response = await this.env.DOCUMENT_RENDERER.fetch(request);
    else if (
      this.env.ENVIRONMENT === "local" &&
      this.env.MODE === "simulation" &&
      this.env.DOCUMENT_RENDERER_URL
    ) {
      const url = new URL(this.env.DOCUMENT_RENDERER_URL);
      if (!["127.0.0.1", "localhost"].includes(url.hostname))
        throw new ContentError(
          "INVALID_RENDERER",
          "Le moteur local doit être sur loopback.",
          503,
        );
      response = await fetch(new Request(new URL("/render", url), request));
    } else
      throw new ContentError(
        "RENDERER_NOT_CONFIGURED",
        "Le moteur PDF n’est pas raccordé.",
        503,
      );
    return this.upload(
      ctx,
      {
        name: input.name.endsWith(".pdf") ? input.name : `${input.name}.pdf`,
        bytes: await readLimited(response),
      },
      "render",
    );
  }
  /** Private exact bytes for an OAuth review, never a URL or a claim of model comprehension. */
  async getReviewContent(
    ctx: DocumentContext,
    id: string,
  ): Promise<ExactReviewPdf> {
    const document = await this.domain.getDocument(ctx, id);
    const fallback = " Ouvrez la revue dans Guteneo pour continuer.";
    if (document.status !== "ready" || document.pages < 1)
      throw new ContentError(
        "DOCUMENT_QUARANTINED",
        "PDF non prêt pour la revue." + fallback,
        423,
      );
    if (document.size > REVIEW_PDF_MAX_BYTES)
      throw new ContentError(
        "EXPERT_DOCUMENT_TOO_LARGE",
        "La revue MCP accepte un PDF de 1 Mio maximum, sans troncature." +
          fallback,
        413,
      );
    if (
      !Number.isSafeInteger(document.size) ||
      document.size < 1 ||
      !document.storage_key.startsWith(`${ctx.organizationId}/documents/`)
    )
      throw new ContentError(
        "DOCUMENT_INTEGRITY_ERROR",
        "Original PDF non vérifiable." + fallback,
        423,
      );
    const local =
      this.env.ENVIRONMENT === "local" && this.env.MODE === "simulation";
    const assertProof = async () => {
      const current = await this.domain.getDocument(ctx, id);
      if (
        current.status !== "ready" ||
        current.sha256 !== document.sha256 ||
        current.size !== document.size ||
        current.storage_key !== document.storage_key ||
        current.pages !== document.pages ||
        (!local &&
          !(await this.env.DB.prepare(
            "SELECT 1 FROM audit_log WHERE organization_id=? AND action='document.scan_verified' AND resource_id=?",
          )
            .bind(ctx.organizationId, document.sha256)
            .first()))
      )
        throw new ContentError(
          "DOCUMENT_INTEGRITY_ERROR",
          "La preuve du PDF exact est indisponible." + fallback,
          423,
        );
    };
    await assertProof();
    let bytes: Uint8Array;
    try {
      const signal = AbortSignal.timeout(15_000);
      const object = await withinDeadline(
        this.env.DOCUMENTS.get(document.storage_key),
        signal,
      );
      if (!object)
        throw new ContentError(
          "DOCUMENT_UNAVAILABLE",
          "Original PDF indisponible." + fallback,
          404,
        );
      if (object.size !== document.size) {
        await withinDeadline(
          object.body.cancel().catch(() => {}),
          signal,
        ).catch(() => {});
        throw new ContentError(
          "DOCUMENT_INTEGRITY_ERROR",
          "La taille du PDF a changé." + fallback,
          423,
        );
      }
      bytes = await readLimited(
        new Response(object.body),
        REVIEW_PDF_MAX_BYTES,
        signal,
      );
    } catch (error) {
      if (error instanceof ContentError && error.code === "FILE_TOO_LARGE")
        throw new ContentError(
          "EXPERT_DOCUMENT_TOO_LARGE",
          "Le PDF dépasse la limite de 1 Mio ; aucun extrait n’a été retourné." +
            fallback,
          413,
        );
      if (error instanceof ContentError) throw error;
      throw new ContentError(
        "DOCUMENT_UNAVAILABLE",
        "La lecture du PDF n’a pas abouti." + fallback,
        503,
      );
    }
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    if (bytes.byteLength !== document.size || hash !== document.sha256)
      throw new ContentError(
        "DOCUMENT_INTEGRITY_ERROR",
        "L’intégrité du PDF exact n’a pas pu être vérifiée." + fallback,
        423,
      );
    await assertProof();
    return { document, bytes };
  }
  async getContent(ctx: DocumentContext, id: string) {
    const document = await this.domain.getDocument(ctx, id);
    if (document.status !== "ready")
      throw new ContentError(
        "DOCUMENT_QUARANTINED",
        "Document en quarantaine : aperçu et envoi bloqués.",
        423,
      );
    const object = await this.env.DOCUMENTS.get(document.storage_key);
    if (!object)
      throw new ContentError(
        "DOCUMENT_UNAVAILABLE",
        "Document indisponible.",
        404,
      );
    await this.env.DB.prepare(
      "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        ctx.organizationId,
        ctx.userId,
        "document.viewed",
        document.id,
        "{}",
        new Date().toISOString(),
      )
      .run();
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="document.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Document-SHA256": document.sha256,
      },
    });
  }
}

export async function reserveContentBudget(
  db: D1Database,
  organizationId: string,
  bytes: number,
  render: boolean,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const result = await db
    .prepare(
      `INSERT INTO content_usage(organization_id,day,uploads,bytes,renders)
 SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM content_limits WHERE organization_id=? AND uploads_per_day>=? AND bytes_per_day>=? AND renders_per_day>=?)
 ON CONFLICT(organization_id,day) DO UPDATE SET uploads=uploads+excluded.uploads,bytes=bytes+excluded.bytes,renders=renders+excluded.renders
 WHERE uploads+excluded.uploads<=(SELECT uploads_per_day FROM content_limits WHERE organization_id=excluded.organization_id)
 AND bytes+excluded.bytes<=(SELECT bytes_per_day FROM content_limits WHERE organization_id=excluded.organization_id)
 AND renders+excluded.renders<=(SELECT renders_per_day FROM content_limits WHERE organization_id=excluded.organization_id)
 RETURNING uploads`,
    )
    .bind(
      organizationId,
      day,
      render ? 0 : 1,
      bytes,
      render ? 1 : 0,
      organizationId,
      render ? 0 : 1,
      bytes,
      render ? 1 : 0,
    )
    .first();
  if (!result)
    throw new ContentError(
      "CONTENT_QUOTA_EXCEEDED",
      "Limite documentaire atteinte ou crédits documentaires non attribués.",
      429,
    );
}
