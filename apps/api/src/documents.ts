import {
  documentAnalysis,
  type DocumentAnalysis,
} from "../../../packages/contracts/src/document-analysis";
import { validatePdf } from "../../../packages/contracts/src/pdf";
import {
  REVIEW_PAGE_BATCH,
  REVIEW_RESULT_BYTES,
  reviewPagesSchema,
  type ReviewPages,
} from "../../../packages/contracts/src/expert-review";
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
import {
  knownImportHosts,
  type ImportFailureObservation,
  type ImportFailureReason,
  type ImportSourceCategory,
} from "../../../packages/observability/src/index";

export const REVIEW_PDF_MAX_BYTES = 1024 * 1024;
export interface ExactReviewPdf {
  document: DocumentRecord;
  bytes: Uint8Array;
}
export interface ExactReviewPages {
  document: DocumentRecord;
  view: ReviewPages;
}

type DocumentContext = Parameters<DomainService["registerDocument"]>[0];

const MAX_AUTO_ATTEMPTS = 5;
const ANALYSIS_WINDOW_MS = 10 * 60_000;
const SCAN_LEASE_MS = 45_000;
type ScanCode =
  | "scan_pending"
  | "verified"
  | "scanner_unavailable"
  | "scanner_not_ready"
  | "scanner_busy"
  | "scanner_timeout"
  | "scan_incomplete"
  | "signatures_stale"
  | "service_not_configured"
  | "security_rejected"
  | "pdf_rejected"
  | "invalid_response"
  | "integrity_error"
  | "original_unavailable"
  | "access_revoked"
  | "retry_exhausted";
type ScanOutcome =
  | { state: "ready"; code: "verified"; pages: number }
  | { state: "processing" | "blocked"; code: ScanCode };
type AnalysisRow = {
  organization_id: string;
  document_id: string;
  request_user_id: string;
  request_role: "admin" | "member";
  state: DocumentAnalysis["state"];
  code: ScanCode;
  attempts: number;
  deadline_at: number;
  next_attempt_at: number;
};
export type AnalyzedDocument = DocumentRecord & { analysis: DocumentAnalysis };

/** Only allowlisted categories cross the private service boundary. */
async function serviceFailure(
  response: Response,
  signal: AbortSignal,
  parser: boolean,
): Promise<ScanOutcome> {
  if (parser && response.status === 422)
    return { state: "blocked", code: "pdf_rejected" };
  let code: unknown;
  if (
    response.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    try {
      const body = await readLimited(
        new Response(response.body, { headers: response.headers }),
        4096,
        signal,
      );
      const json: unknown = JSON.parse(new TextDecoder().decode(body));
      if (json && typeof json === "object" && "code" in json) code = json.code;
    } catch {
      if (signal.aborted)
        return { state: "processing", code: "scanner_timeout" };
      return { state: "blocked", code: "invalid_response" };
    }
  } else {
    await withinDeadline(
      response.body?.cancel().catch(() => {}) ?? Promise.resolve(),
      signal,
    ).catch(() => {});
  }
  if (code === "SIGNATURES_STALE")
    return { state: "blocked", code: "signatures_stale" };
  if (code === "SCANNER_NOT_READY")
    return { state: "processing", code: "scanner_not_ready" };
  if (code === "SCANNER_BUSY" || response.status === 429)
    return { state: "processing", code: "scanner_busy" };
  if (code === "SCAN_TIMEOUT" || response.status === 504)
    return { state: "processing", code: "scanner_timeout" };
  if (code === "SCAN_INCOMPLETE")
    return { state: "processing", code: "scan_incomplete" };
  if ([502, 503].includes(response.status))
    return { state: "processing", code: "scanner_unavailable" };
  return { state: "blocked", code: "invalid_response" };
}

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
  const bytes = await withinDeadline(
    readLimited(response, 4096, signal),
    signal,
  );
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
function publicImportHostname(hostname: string): string | undefined {
  const value = hostname.toLowerCase();
  if (
    value.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      value,
    )
  )
    return undefined;
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/.test(value))
    return undefined;
  return value;
}

/** Private URL details are deliberately discarded, including when fetch throws them. */
export class ImportSourceError extends ContentError {
  readonly sourceHost?: string;
  readonly sourceCategory: ImportSourceCategory;
  constructor(
    code: string,
    readonly reason: ImportFailureReason,
    message: string,
    hostname?: string,
    configured = false,
    status = 400,
  ) {
    const safeHost = hostname ? publicImportHostname(hostname) : undefined;
    super(
      code,
      `${message}${safeHost ? ` Domaine source : ${safeHost}.` : ""}`,
      status,
    );
    this.sourceHost = safeHost;
    this.sourceCategory = safeHost
      ? knownImportHosts.some((host) => host === safeHost)
        ? "known_provider"
        : configured
          ? "configured_host"
          : "unknown_host"
      : "invalid_source";
  }
  observation(): ImportFailureObservation {
    const knownHost = knownImportHosts.find((host) => host === this.sourceHost);
    return {
      reason: this.reason,
      sourceCategory: this.sourceCategory,
      ...(knownHost ? { knownHost } : {}),
    };
  }
}

export function permittedImportUrl(
  raw: string,
  hosts: string | undefined,
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImportSourceError(
      "INVALID_URL",
      "invalid_url",
      "URL source invalide. Joignez de nouveau le PDF pour obtenir une référence de fichier téléchargeable.",
    );
  }
  const allowed = (hosts ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const hostname = url.hostname.toLowerCase();
  let reason: ImportFailureReason | undefined;
  if (url.protocol !== "https:") reason = "invalid_scheme";
  else if (url.username || url.password) reason = "credentials";
  else if (url.port) reason = "port";
  else if (url.hash) reason = "fragment";
  else if (!publicImportHostname(hostname)) reason = "private_host";
  else if (!allowed.length) reason = "missing_configuration";
  else if (!allowed.includes(hostname)) reason = "untrusted_host";
  if (reason)
    throw new ImportSourceError(
      "SOURCE_NOT_ALLOWED",
      reason,
      reason === "missing_configuration"
        ? "L’import distant n’est pas configuré sur Guteneo. L’opérateur doit autoriser le domaine exact du fournisseur de fichiers ; vous pouvez aussi utiliser le téléversement authentifié."
        : "Source non autorisée. Utilisez une URL HTTPS temporaire du fournisseur de fichiers autorisé, ou le téléversement authentifié Guteneo.",
      hostname,
      allowed.includes(hostname),
    );
  return url;
}
export class DocumentService {
  constructor(
    private env: Env,
    private domain: DomainService,
  ) {}

  private async analysisRow(
    ctx: Pick<DocumentContext, "organizationId">,
    id: string,
  ) {
    return this.env.DB.prepare(
      "SELECT * FROM document_analysis WHERE organization_id=? AND document_id=?",
    )
      .bind(ctx.organizationId, id)
      .first<AnalysisRow>();
  }

  private project(
    document: DocumentRecord,
    row: AnalysisRow | null,
  ): AnalyzedDocument {
    const expired =
      row?.state === "processing" &&
      ((row.attempts > 0 && row.deadline_at <= Date.now()) ||
        (row.attempts >= MAX_AUTO_ATTEMPTS &&
          row.next_attempt_at <= Date.now()));
    return {
      ...document,
      analysis: documentAnalysis(
        document.status,
        expired ? "retryable" : row?.state,
        expired ? "retry_exhausted" : row?.code,
      ),
    };
  }

  async get(ctx: DocumentContext, id: string): Promise<AnalyzedDocument> {
    const document = await this.domain.getDocument(ctx, id);
    return this.project(document, await this.analysisRow(ctx, id));
  }

  async list(ctx: DocumentContext, cursor?: string, limit = 30) {
    const page = await this.domain.listDocuments(ctx, cursor, limit);
    const ids = page.items.map((document) => document.id);
    if (!ids.length) return { ...page, items: [] as AnalyzedDocument[] };
    const byId = new Map<string, AnalysisRow>();
    // D1 binds are capped per statement; preserve the domain's full 100-row page.
    for (let offset = 0; offset < ids.length; offset += 90) {
      const chunk = ids.slice(offset, offset + 90);
      const rows = await this.env.DB.prepare(
        `SELECT * FROM document_analysis WHERE organization_id=? AND document_id IN (${chunk.map(() => "?").join(",")})`,
      )
        .bind(ctx.organizationId, ...chunk)
        .all<AnalysisRow>();
      for (const row of rows.results) byId.set(row.document_id, row);
    }
    return {
      ...page,
      items: page.items.map((document) =>
        this.project(document, byId.get(document.id) ?? null),
      ),
    };
  }

  private async lock(organizationId: string, id: string, token: string) {
    const now = Date.now();
    return this.env.DB.prepare(
      `INSERT INTO document_scan_locks(organization_id,document_id,token,expires_at) VALUES(?,?,?,?)
 ON CONFLICT(organization_id,document_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
 WHERE expires_at<=? RETURNING token`,
    )
      .bind(organizationId, id, token, now + SCAN_LEASE_MS, now)
      .first();
  }

  private async unlock(organizationId: string, id: string, token: string) {
    await this.env.DB.prepare(
      "DELETE FROM document_scan_locks WHERE organization_id=? AND document_id=? AND token=?",
    )
      .bind(organizationId, id, token)
      .run();
  }

  /** Only explicit retry can start a new bounded recovery cycle. Duplicate imports cannot reset it. */
  private async startAnalysis(
    ctx: DocumentContext,
    id: string,
    outcome: ScanOutcome,
    restart = false,
  ) {
    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO document_analysis(organization_id,document_id,request_user_id,request_role,state,code,attempts,deadline_at,next_attempt_at,updated_at)
 SELECT ?,?,?,?,?,?,0,?,?,? WHERE EXISTS(SELECT 1 FROM documents WHERE organization_id=? AND id=? AND status='quarantined' AND pages=0)
 ON CONFLICT(organization_id,document_id) DO UPDATE SET request_user_id=excluded.request_user_id,request_role=excluded.request_role,state=excluded.state,code=excluded.code,attempts=0,deadline_at=excluded.deadline_at,next_attempt_at=excluded.next_attempt_at,updated_at=excluded.updated_at
 WHERE ?=1 AND (document_analysis.state<>'processing' OR (document_analysis.attempts>0 AND document_analysis.deadline_at<=?) OR (document_analysis.attempts>=5 AND document_analysis.next_attempt_at<=?))`,
    )
      .bind(
        ctx.organizationId,
        id,
        ctx.userId,
        ctx.role,
        outcome.state,
        outcome.code,
        now + ANALYSIS_WINDOW_MS,
        now + SCAN_LEASE_MS,
        now,
        ctx.organizationId,
        id,
        restart ? 1 : 0,
        now,
        now,
      )
      .run();
  }

  private async finishAnalysis(
    ctx: DocumentContext,
    id: string,
    token: string,
    outcome: ScanOutcome,
    attempts: number,
  ) {
    const now = Date.now();
    const row = await this.analysisRow(ctx, id);
    const exhausted =
      outcome.state === "processing" &&
      (attempts >= MAX_AUTO_ATTEMPTS ||
        !row ||
        (attempts > 0 && row.deadline_at <= now));
    await this.env.DB.prepare(
      `UPDATE document_analysis SET state=?,code=?,next_attempt_at=?,updated_at=?
 WHERE organization_id=? AND document_id=?
 AND EXISTS(SELECT 1 FROM document_scan_locks WHERE organization_id=? AND document_id=? AND token=? AND expires_at>?)`,
    )
      .bind(
        exhausted ? "retryable" : outcome.state,
        exhausted ? "retry_exhausted" : outcome.code,
        now + 30_000,
        now,
        ctx.organizationId,
        id,
        ctx.organizationId,
        id,
        token,
        now,
      )
      .run();
  }

  private async scanBytes(
    bytes: Uint8Array,
    hash: string,
    signal: AbortSignal,
  ): Promise<ScanOutcome> {
    if (!this.env.SCANNER || !this.env.DOCUMENT_RENDERER)
      return { state: "blocked", code: "service_not_configured" };
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
      if (!scan.ok) return await serviceFailure(scan, signal, false);
      const scanned = await boundedJson(scan, signal);
      if (scanned.sha256 !== hash)
        return { state: "blocked", code: "integrity_error" };
      if (scanned.verdict === "infected")
        return { state: "blocked", code: "security_rejected" };
      if (scanned.verdict !== "clean")
        return { state: "blocked", code: "invalid_response" };
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
      if (!validated.ok) return await serviceFailure(validated, signal, true);
      const result = await boundedJson(validated, signal);
      if (result.sha256 !== hash)
        return { state: "blocked", code: "integrity_error" };
      if (
        typeof result.pages !== "number" ||
        !Number.isInteger(result.pages) ||
        result.pages < 1 ||
        result.pages > LIMITS.pages
      )
        return { state: "blocked", code: "invalid_response" };
      return { state: "ready", code: "verified", pages: result.pages };
    } catch (error) {
      if (signal.aborted)
        return { state: "processing", code: "scanner_timeout" };
      if (
        error instanceof SyntaxError ||
        (error instanceof Error &&
          error.message === "DOCUMENT_SCAN_RESPONSE_INVALID") ||
        error instanceof ContentError
      )
        return { state: "blocked", code: "invalid_response" };
      return { state: "processing", code: "scanner_unavailable" };
    }
  }

  private async originalBytes(
    ctx: DocumentContext,
    document: DocumentRecord,
    signal: AbortSignal,
  ) {
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
    const bytes = await readLimited(
      new Response(object.body),
      LIMITS.pdfBytes,
      signal,
    );
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    if (bytes.byteLength !== document.size || hash !== document.sha256)
      throw new ContentError(
        "DOCUMENT_INTEGRITY_ERROR",
        "L’intégrité de l’original n’a pas pu être vérifiée.",
        423,
      );
    return bytes;
  }

  private async promote(
    ctx: DocumentContext,
    document: DocumentRecord,
    token: string,
    pages: number,
    automatic: boolean,
  ) {
    await this.domain.authorizeWrite(ctx);
    const now = Date.now();
    const fence =
      "EXISTS(SELECT 1 FROM document_scan_locks WHERE organization_id=? AND document_id=? AND token=? AND expires_at>?)";
    const member =
      "EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=? AND m.role=? AND m.role IN ('admin','member') AND o.mode=?)";
    const recovery =
      "EXISTS(SELECT 1 FROM document_analysis WHERE organization_id=? AND document_id=? AND state='processing' AND deadline_at>?)";
    const condition = `${fence} AND ${member} AND ${recovery}`;
    const guards = [
      ctx.organizationId,
      document.id,
      token,
      now,
      ctx.organizationId,
      ctx.userId,
      ctx.role,
      this.env.MODE,
      ctx.organizationId,
      document.id,
      now,
    ];
    const exact = [
      ctx.organizationId,
      document.id,
      pages,
      document.sha256,
      document.size,
      document.storage_key,
    ];
    const result = await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE documents SET status='ready',pages=? WHERE organization_id=? AND id=? AND status='quarantined' AND pages=0 AND sha256=? AND size=? AND storage_key=? AND ${condition}`,
      ).bind(
        pages,
        ctx.organizationId,
        document.id,
        document.sha256,
        document.size,
        document.storage_key,
        ...guards,
      ),
      ...[
        [
          automatic ? "document.analysis_verified" : "document.rescan_verified",
          document.id,
        ],
        ["document.scan_verified", document.sha256],
      ].map(([action, resourceId]) =>
        this.env.DB.prepare(
          `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM documents WHERE organization_id=? AND id=? AND status='ready' AND pages=? AND sha256=? AND size=? AND storage_key=?) AND ${condition}`,
        ).bind(
          crypto.randomUUID(),
          ctx.organizationId,
          automatic ? null : ctx.userId,
          action,
          resourceId,
          JSON.stringify(automatic ? { pages, actor: "system" } : { pages }),
          new Date(now).toISOString(),
          ...exact,
          ...guards,
        ),
      ),
      this.env.DB.prepare(
        `UPDATE document_analysis SET state='ready',code='verified',updated_at=? WHERE organization_id=? AND document_id=? AND EXISTS(SELECT 1 FROM documents WHERE organization_id=? AND id=? AND status='ready') AND ${condition}`,
      ).bind(
        now,
        ctx.organizationId,
        document.id,
        ctx.organizationId,
        document.id,
        ...guards,
      ),
    ]);
    const current = await this.domain.getDocument(ctx, document.id);
    if (current.status !== "ready" && current.status !== "quarantined")
      await this.finishAnalysis(
        ctx,
        document.id,
        token,
        { state: "blocked", code: "original_unavailable" },
        0,
      );
    if (result[0].meta.changes !== 1 && current.status === "quarantined")
      throw new ContentError(
        "DOCUMENT_SCAN_EXPIRED",
        "Cette analyse a expiré. Vous pouvez réessayer.",
        409,
      );
    return current;
  }

  async rescan(ctx: DocumentContext, id: string): Promise<AnalyzedDocument> {
    await this.domain.authorizeWrite(ctx);
    const document = await this.get(ctx, id);
    if (document.status === "ready") return document;
    if (document.status !== "quarantined" || document.pages !== 0)
      throw new ContentError(
        "DOCUMENT_NOT_RESCANABLE",
        "Ce document ne peut pas être analysé de nouveau.",
        409,
      );
    if (document.analysis.state === "processing") return document;
    if (!this.env.SCANNER || !this.env.DOCUMENT_RENDERER) {
      await this.startAnalysis(
        ctx,
        id,
        { state: "blocked", code: "service_not_configured" },
        true,
      );
      throw new ContentError(
        "SCANNER_NOT_CONFIGURED",
        "Le service d’analyse doit être raccordé avant de réessayer.",
        503,
      );
    }
    const token = crypto.randomUUID();
    if (!(await this.lock(ctx.organizationId, id, token)))
      return {
        ...document,
        analysis: documentAnalysis(
          document.status,
          "processing",
          "scanner_busy",
        ),
      };
    try {
      // A second request may have read the previous state before the first completed.
      const latest = await this.get(ctx, id);
      if (latest.status === "ready" || latest.analysis.state === "processing")
        return latest;
      await reserveScanBudget(this.env.DB, ctx.organizationId, false);
      await this.startAnalysis(
        ctx,
        id,
        { state: "processing", code: "scan_pending" },
        true,
      );
      const signal = AbortSignal.timeout(30_000);
      let outcome: ScanOutcome;
      try {
        const bytes = await this.originalBytes(ctx, document, signal);
        outcome = await this.scanBytes(bytes, document.sha256, signal);
      } catch (error) {
        outcome =
          error instanceof ContentError
            ? {
                state: "blocked",
                code:
                  error.code === "DOCUMENT_UNAVAILABLE"
                    ? "original_unavailable"
                    : "integrity_error",
              }
            : {
                state: "processing",
                code: signal.aborted
                  ? "scanner_timeout"
                  : "scanner_unavailable",
              };
        await this.finishAnalysis(ctx, id, token, outcome, 0);
        if (error instanceof ContentError) throw error;
      }
      if (outcome.state === "ready")
        await this.promote(ctx, document, token, outcome.pages, false);
      else await this.finishAnalysis(ctx, id, token, outcome, 0);
      return await this.get(ctx, id);
    } finally {
      await this.unlock(ctx.organizationId, id, token);
    }
  }

  /** The existing minute cron drains durable, bounded PDF-only work. Never approves or sends. */
  async processPendingScans(limit = 3): Promise<{ processed: number }> {
    const now = Date.now();
    // Queue time does not consume the recovery window. The first claimed retry
    // starts it; expired/crashed attempts that already started remain bounded.
    await this.env.DB.prepare(
      `UPDATE document_analysis SET state='retryable',code='retry_exhausted',updated_at=?
 WHERE (organization_id,document_id) IN (
 SELECT a.organization_id,a.document_id FROM document_analysis a WHERE a.state='processing'
 AND ((a.attempts>0 AND a.deadline_at<=?) OR (a.attempts>=? AND a.next_attempt_at<=?))
 AND NOT EXISTS(SELECT 1 FROM document_scan_locks l WHERE l.organization_id=a.organization_id AND l.document_id=a.document_id AND l.expires_at>?)
 ORDER BY a.deadline_at,a.organization_id,a.document_id LIMIT 100)`,
    )
      .bind(now, now, MAX_AUTO_ATTEMPTS, now, now)
      .run();
    const rows = await this.env.DB.prepare(
      "SELECT * FROM document_analysis WHERE state='processing' AND next_attempt_at<=? AND (attempts=0 OR deadline_at>?) AND attempts<? ORDER BY next_attempt_at,organization_id,document_id LIMIT ?",
    )
      .bind(
        now,
        now,
        MAX_AUTO_ATTEMPTS,
        Math.max(1, Math.min(Math.floor(limit) || 3, 10)),
      )
      .all<AnalysisRow>();
    let processed = 0;
    for (const row of rows.results) {
      const token = crypto.randomUUID();
      if (!(await this.lock(row.organization_id, row.document_id, token)))
        continue;
      try {
        const claimTime = Date.now();
        const claimed = await this.env.DB.prepare(
          `UPDATE document_analysis SET deadline_at=CASE WHEN attempts=0 THEN ? ELSE deadline_at END,attempts=attempts+1,next_attempt_at=?,updated_at=? WHERE organization_id=? AND document_id=? AND state='processing' AND next_attempt_at<=? AND (attempts=0 OR deadline_at>?) AND attempts<?
 AND EXISTS(SELECT 1 FROM document_scan_locks WHERE organization_id=? AND document_id=? AND token=? AND expires_at>?) RETURNING *`,
        )
          .bind(
            claimTime + ANALYSIS_WINDOW_MS,
            claimTime + SCAN_LEASE_MS,
            claimTime,
            row.organization_id,
            row.document_id,
            claimTime,
            claimTime,
            MAX_AUTO_ATTEMPTS,
            row.organization_id,
            row.document_id,
            token,
            claimTime,
          )
          .first<AnalysisRow>();
        if (!claimed) continue;
        processed++;
        const ctx: DocumentContext = {
          organizationId: claimed.organization_id,
          userId: claimed.request_user_id,
          role: claimed.request_role,
          actor: "system",
        };
        let document: DocumentRecord;
        try {
          await this.domain.authorizeWrite(ctx);
          document = await this.domain.getDocument(ctx, row.document_id);
        } catch {
          await this.finishAnalysis(
            ctx,
            row.document_id,
            token,
            { state: "blocked", code: "access_revoked" },
            claimed.attempts,
          );
          continue;
        }
        if (document.status !== "quarantined" || document.pages !== 0) {
          await this.finishAnalysis(
            ctx,
            row.document_id,
            token,
            document.status === "ready"
              ? { state: "ready", code: "verified", pages: document.pages }
              : { state: "blocked", code: "original_unavailable" },
            claimed.attempts,
          );
          continue;
        }
        const signal = AbortSignal.timeout(
          Math.max(1, Math.min(30_000, claimed.deadline_at - Date.now())),
        );
        let outcome: ScanOutcome;
        try {
          const bytes = await this.originalBytes(ctx, document, signal);
          outcome = await this.scanBytes(bytes, document.sha256, signal);
        } catch (error) {
          outcome =
            error instanceof ContentError
              ? {
                  state: "blocked",
                  code:
                    error.code === "DOCUMENT_UNAVAILABLE"
                      ? "original_unavailable"
                      : "integrity_error",
                }
              : {
                  state: "processing",
                  code: signal.aborted
                    ? "scanner_timeout"
                    : "scanner_unavailable",
                };
        }
        if (outcome.state === "ready") {
          try {
            await this.promote(ctx, document, token, outcome.pages, true);
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              "code" in error &&
              error.code === "FORBIDDEN"
            )
              await this.finishAnalysis(
                ctx,
                row.document_id,
                token,
                { state: "blocked", code: "access_revoked" },
                claimed.attempts,
              );
            else throw error;
          }
        } else
          await this.finishAnalysis(
            ctx,
            row.document_id,
            token,
            outcome,
            claimed.attempts,
          );
      } finally {
        await this.unlock(row.organization_id, row.document_id, token);
      }
    }
    return { processed };
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
    const outcome: ScanOutcome = local
      ? { state: "ready", code: "verified", pages }
      : await this.scanBytes(input.bytes, sha256, AbortSignal.timeout(30_000));
    if (outcome.state === "ready") {
      pages = outcome.pages;
      status = "ready";
      scanVerified = !local;
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
    if (document.status === "quarantined")
      await this.startAnalysis(ctx, document.id, outcome);
    return this.project(document, await this.analysisRow(ctx, document.id));
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
    // One deadline covers connection, streamed body and cancellation, even if a provider ignores abort.
    const signal = AbortSignal.timeout(15_000);
    let response: Response | undefined;
    let bytes: Uint8Array;
    try {
      response = await withinDeadline(
        fetch(url, {
          redirect: "manual",
          signal,
          headers: { Accept: "application/pdf" },
        }),
        signal,
      );
      if (response.status >= 300 && response.status < 400)
        throw new ImportSourceError(
          "SOURCE_REDIRECT_NOT_ALLOWED",
          "redirect_rejected",
          "Le fournisseur a redirigé le téléchargement. Joignez de nouveau le PDF pour obtenir un lien direct ; les redirections ne sont pas suivies.",
          url.hostname,
          true,
          422,
        );
      if ([401, 403, 404, 410].includes(response.status))
        throw new ImportSourceError(
          "SOURCE_EXPIRED_OR_UNAVAILABLE",
          "source_expired",
          "Le lien temporaire est expiré ou inaccessible. Joignez de nouveau le PDF et relancez import_document avec la nouvelle référence de fichier.",
          url.hostname,
          true,
          422,
        );
      if (response.status === 408 || response.status === 504)
        throw new ImportSourceError(
          "SOURCE_DOWNLOAD_TIMEOUT",
          "download_timeout",
          "Le téléchargement du PDF a dépassé le délai autorisé. Joignez de nouveau le PDF et réessayez l’import.",
          url.hostname,
          true,
          408,
        );
      bytes = await withinDeadline(
        readLimited(response, LIMITS.pdfBytes, signal),
        signal,
      );
    } catch (error) {
      if (error instanceof ImportSourceError) throw error;
      if (signal.aborted)
        throw new ImportSourceError(
          "SOURCE_DOWNLOAD_TIMEOUT",
          "download_timeout",
          "Le téléchargement du PDF a dépassé le délai de 15 secondes. Joignez de nouveau le PDF et réessayez l’import.",
          url.hostname,
          true,
          408,
        );
      if (error instanceof ContentError && error.code !== "DOWNLOAD_FAILED")
        throw error;
      throw new ImportSourceError(
        "DOWNLOAD_FAILED",
        "download_failed",
        "Le fichier source est inaccessible. Joignez de nouveau le PDF pour renouveler son lien temporaire, puis réessayez l’import.",
        url.hostname,
        true,
        422,
      );
    } finally {
      if (response?.body && !response.body.locked) {
        await withinDeadline(
          response.body.cancel().catch(() => {}),
          signal,
        ).catch(() => {});
      }
    }
    return this.upload(ctx, { name: file.file_name ?? "document.pdf", bytes });
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
    return this.readReviewOriginal(ctx, id, REVIEW_PDF_MAX_BYTES);
  }
  private async readReviewOriginal(
    ctx: DocumentContext,
    id: string,
    maximumBytes: number,
  ): Promise<ExactReviewPdf> {
    const document = await this.domain.getDocument(ctx, id);
    const fallback =
      " Aucune approbation ne peut être donnée tant que cette vérification échoue.";
    if (document.status !== "ready" || document.pages < 1)
      throw new ContentError(
        "DOCUMENT_QUARANTINED",
        "PDF non prêt pour la revue." + fallback,
        423,
      );
    if (document.size > maximumBytes)
      throw new ContentError(
        "EXPERT_DOCUMENT_TOO_LARGE",
        `Cette lecture accepte un PDF de ${maximumBytes / (1024 * 1024)} Mio maximum, sans troncature.` +
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
        maximumBytes,
        signal,
      );
    } catch (error) {
      if (error instanceof ContentError && error.code === "FILE_TOO_LARGE")
        throw new ContentError(
          "EXPERT_DOCUMENT_TOO_LARGE",
          "Le PDF dépasse la taille autorisée ; aucun extrait n’a été retourné." +
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
  /** Bounded page views from the same verified original; never a replacement PDF. */
  async getReviewPages(
    ctx: DocumentContext,
    id: string,
    startPage: number,
  ): Promise<ExactReviewPages> {
    const exact = await this.readReviewOriginal(ctx, id, LIMITS.pdfBytes);
    if (
      !Number.isInteger(startPage) ||
      startPage < 1 ||
      startPage > exact.document.pages
    )
      throw new ContentError(
        "REVIEW_PAGE_RANGE",
        "Cette page n’existe pas dans le PDF.",
      );
    const pageCount = Math.min(
      REVIEW_PAGE_BATCH,
      exact.document.pages - startPage + 1,
    );
    const path = `/review-pages?startPage=${startPage}&pageCount=${pageCount}`;
    const signal = AbortSignal.timeout(30_000);
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-Guteneo-Source-Sha256": exact.document.sha256,
        "X-Guteneo-Scan-Sha256": exact.document.sha256,
      },
      body: exact.bytes as Uint8Array<ArrayBuffer>,
      signal,
    };
    let response: Response;
    let raw: Uint8Array;
    try {
      if (this.env.DOCUMENT_RENDERER) {
        response = await withinDeadline(
          this.env.DOCUMENT_RENDERER.fetch(
            new Request(`https://documents.internal${path}`, init),
          ),
          signal,
        );
      } else if (
        this.env.ENVIRONMENT === "local" &&
        this.env.MODE === "simulation" &&
        this.env.DOCUMENT_RENDERER_URL
      ) {
        const base = new URL(this.env.DOCUMENT_RENDERER_URL);
        if (!["localhost", "127.0.0.1"].includes(base.hostname))
          throw new ContentError(
            "RENDERER_NOT_CONFIGURED",
            "Le lecteur PDF local est indisponible.",
            503,
          );
        response = await withinDeadline(
          fetch(new Request(new URL(path, base), init)),
          signal,
        );
      } else {
        throw new ContentError(
          "RENDERER_NOT_CONFIGURED",
          "La lecture des pages du PDF est temporairement indisponible. Le document reste enregistré.",
          503,
        );
      }
      raw = await readLimited(
        new Response(response.body, { headers: response.headers }),
        REVIEW_RESULT_BYTES,
        signal,
      );
    } catch (error) {
      if (error instanceof ContentError && error.code === "FILE_TOO_LARGE")
        throw new ContentError(
          "REVIEW_RESULT_SIZE",
          "Ces pages dépassent le budget du lecteur de la conversation.",
          413,
        );
      if (error instanceof ContentError) throw error;
      throw new ContentError(
        signal.aborted ? "REVIEW_RENDER_TIMEOUT" : "REVIEW_RENDER_FAILED",
        "La lecture des pages est temporairement indisponible. Le même PDF reste enregistré.",
        503,
      );
    }
    if (!response.ok) {
      let code = "REVIEW_RENDER_FAILED";
      try {
        const detail = JSON.parse(new TextDecoder().decode(raw)) as {
          error?: { code?: string };
        };
        if (
          [
            "REVIEW_UNSUPPORTED_CONTENT",
            "REVIEW_IMAGE_BUDGET",
            "REVIEW_RENDER_TIMEOUT",
            "REVIEW_PAGE_RANGE",
            "REVIEW_PDF_INVALID",
            "REVIEW_RESULT_SIZE",
          ].includes(detail.error?.code ?? "")
        )
          code = detail.error!.code!;
      } catch {
        /* Never expose raw renderer failures or document text. */
      }
      throw new ContentError(
        code,
        code === "REVIEW_UNSUPPORTED_CONTENT"
          ? "Ce PDF contient des éléments que le lecteur de la conversation ne peut pas restituer fidèlement. Aucun envoi n’a été autorisé."
          : "La lecture de ces pages n’a pas abouti. Le PDF reste enregistré ; reprenez la revue du même envoi.",
        422,
      );
    }
    let view: ReviewPages;
    try {
      view = reviewPagesSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
      if (
        view.sha256 !== exact.document.sha256 ||
        view.totalPages !== exact.document.pages ||
        view.startPage !== startPage ||
        view.pageCount !== pageCount ||
        view.pages.length !== pageCount ||
        view.nextPage !==
          (startPage + pageCount > view.totalPages
            ? null
            : startPage + pageCount)
      )
        throw new Error("mismatch");
      for (const [offset, page] of view.pages.entries()) {
        if (
          page.page !== startPage + offset ||
          page.width * page.height > 2_100_000
        )
          throw new Error("mismatch");
        const decoded = Uint8Array.from(atob(page.imageBase64), (char) =>
          char.charCodeAt(0),
        );
        if (
          decoded[0] !== 0xff ||
          decoded[1] !== 0xd8 ||
          decoded.at(-2) !== 0xff ||
          decoded.at(-1) !== 0xd9
        )
          throw new Error("invalid image");
        const imageHash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", decoded)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        if (imageHash !== page.imageSha256)
          throw new Error("invalid image hash");
      }
    } catch {
      throw new ContentError(
        "DOCUMENT_INTEGRITY_ERROR",
        "La lecture fidèle de ces pages n’a pas pu être vérifiée.",
        423,
      );
    }
    // The caller also fences OAuth authority and the canonical scan proof after rendering.
    const current = await this.domain.getDocument(ctx, id);
    if (
      current.status !== "ready" ||
      current.sha256 !== exact.document.sha256 ||
      current.size !== exact.document.size ||
      current.pages !== exact.document.pages ||
      current.storage_key !== exact.document.storage_key
    )
      throw new ContentError(
        "DOCUMENT_INTEGRITY_ERROR",
        "Le PDF a changé pendant la lecture.",
        423,
      );
    return { document: exact.document, view };
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
