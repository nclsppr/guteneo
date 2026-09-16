import { validatePdf } from "../../../packages/contracts/src/pdf";
export { validatePdf } from "../../../packages/contracts/src/pdf";
import {
  ContentError,
  LIMITS,
  printableHtml,
  safeHeader,
} from "../../../packages/contracts/src/content";
import type { DomainService } from "../../../packages/domain/src/index";
import type { Env } from "./env";

type DocumentContext = Parameters<DomainService["registerDocument"]>[0];
export async function readLimited(
  response: Response,
  limit = LIMITS.pdfBytes,
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
      const next = await reader.read();
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
    await reader.cancel();
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
    const storageKey = `${ctx.organizationId}/documents/${sha256}.pdf`;
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
    return this.domain.registerDocument(ctx, {
      name,
      sha256,
      size: input.bytes.length,
      pages,
      status,
      source,
      storageKey,
      scanVerified,
    });
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
      redirect: "error",
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
