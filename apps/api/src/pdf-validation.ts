import {
  DomainError,
  type ActorContext,
  type DomainService,
  sha256,
} from "../../../packages/domain/src/index";
import { LIMITS } from "../../../packages/contracts/src/content";
import {
  privatePdfValidationResult,
  pdfValidationInput,
  pdfValidationPurchaseInput,
  PDF_VALIDATION_PRICE_MINOR,
  PDF_VALIDATION_TERMS_VERSION,
  pdfManualChecks,
  pdfValidationReportSchema,
  type PdfValidationReport,
} from "../../../packages/contracts/src/pdf-validation";
import { pdfValidationAvailable } from "./pdf-validation-pricing";
import type { Env } from "./env";
import { AuthError } from "./auth";
import type { PostalAuthority as PdfValidationAuthority } from "./postal-authority";

type Row = {
  id: string;
  document_id: string;
  document_sha256: string;
  profile: string;
  status: string;
  result_json: string | null;
};
function fail(code: string, message: string, status = 409): never {
  throw new DomainError(code, message, status);
}
const safeKey = (key: string) => {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key))
    fail("INVALID_IDEMPOTENCY_KEY", "An idempotency key is required.", 400);
  return key;
};
const failure = () =>
  fail(
    "PDF_VALIDATION_FAILED",
    "The check failed. No compliance result was recorded.",
    503,
  );

/** A diagnostic never promotes quarantine, mutates a PDF or approves a send. */
export class PdfValidationService {
  constructor(
    private readonly env: Env,
    private readonly domain: DomainService,
  ) {}

  async list(
    actor: ActorContext,
    documentId: string,
  ): Promise<{ items: PdfValidationReport[] }> {
    // Purchased history follows document visibility without recurring access.
    await this.domain.getDocument(actor, documentId);
    const rows = await this.env.DB.prepare(
      "SELECT result_json FROM pdf_validations WHERE organization_id=? AND document_id=? AND status='complete' ORDER BY created_at DESC,id DESC LIMIT 50",
    )
      .bind(actor.organizationId, documentId)
      .all<{ result_json: string }>();
    return {
      items: rows.results.map((row) =>
        pdfValidationReportSchema.parse(JSON.parse(row.result_json)),
      ),
    };
  }

  async validate(
    authority: PdfValidationAuthority,
    documentId: string,
    input: unknown,
    key: string,
  ): Promise<PdfValidationReport> {
    await authority.assertCurrent();
    const actor = authority.context;
    const profile = pdfValidationInput.shape.profile.parse(
      input && typeof input === "object"
        ? (input as Record<string, unknown>).profile
        : undefined,
    );
    safeKey(key);
    const document = await this.domain.getDocument(actor, documentId);
    const previous = await this.getByKey(actor, key);
    if (previous)
      return this.replay(previous, documentId, profile, document.sha256);
    if (actor.actor !== "browser")
      fail(
        "PDF_VALIDATION_BROWSER_PURCHASE_REQUIRED",
        `Review the exact PDF, profile and per-check price at ${this.env.APP_ORIGIN}/#/app/documents?document=${encodeURIComponent(documentId)}. An assistant cannot approve this purchase.`,
        403,
      );
    if (actor.role !== "admin")
      fail(
        "PDF_VALIDATION_ADMIN_REQUIRED",
        "A workspace administrator must approve this paid check in the browser.",
        403,
      );
    if (!pdfValidationAvailable(this.env))
      fail(
        "PDF_VALIDATION_UNAVAILABLE",
        "Paid PDF checks are not available for this workspace.",
        503,
      );
    const purchase =
      input && typeof input === "object"
        ? (input as Record<string, unknown>).purchase
        : undefined;
    if (
      !purchase ||
      typeof purchase !== "object" ||
      (purchase as Record<string, unknown>).confirmed !== true
    )
      fail(
        "PDF_VALIDATION_PURCHASE_REQUIRED",
        "Review the exact PDF, profile and price, then confirm this one check.",
        400,
      );
    const priced = purchase as Record<string, unknown>;
    if (
      priced.priceMinor !== PDF_VALIDATION_PRICE_MINOR ||
      priced.currency !== "EUR" ||
      priced.termsVersion !== PDF_VALIDATION_TERMS_VERSION
    )
      fail(
        "PDF_VALIDATION_PRICE_CHANGED",
        "The price or purchase terms changed. Review the current price before confirming.",
      );
    if (
      !pdfValidationPurchaseInput.safeParse(input).success ||
      priced.documentSha256 !== document.sha256
    )
      fail(
        "PDF_VALIDATION_PURCHASE_REQUIRED",
        "Confirm the current exact PDF, profile and price.",
        400,
      );
    if (document.status !== "ready")
      fail(
        "DOCUMENT_NOT_READY",
        "The PDF must complete its security verification.",
      );
    if (
      !this.env.PDF_VALIDATOR ||
      (this.env.MODE === "production" && !this.env.SCANNER)
    )
      fail(
        "PDF_VALIDATOR_CONFIGURATION_REQUIRED",
        "The PDF checking service must be configured.",
        503,
      );
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      "UPDATE pdf_validations SET status='error' WHERE organization_id=? AND status='processing' AND deadline_at<=?",
    )
      .bind(actor.organizationId, now)
      .run();
    const id = crypto.randomUUID();
    try {
      const fence = authority.sql();
      const claimed = await this.env.DB.prepare(
        `INSERT INTO pdf_validations(organization_id,id,document_id,document_sha256,request_user_id,profile,evidence,idempotency_key,period,status,created_at,deadline_at,purchase_terms_version,purchase_price_minor,purchase_source) SELECT ?,?,?,?,?,?,?,?,?,'processing',?,?,?,?,'browser_administrator' WHERE ${fence.condition} RETURNING id`,
      )
        .bind(
          actor.organizationId,
          id,
          documentId,
          document.sha256,
          actor.userId,
          profile,
          this.env.MODE,
          key,
          now.slice(0, 7),
          now,
          new Date(Date.now() + 60_000).toISOString(),
          PDF_VALIDATION_TERMS_VERSION,
          PDF_VALIDATION_PRICE_MINOR,
          ...fence.values,
        )
        .first<{ id: string }>();
      if (claimed?.id !== id)
        fail("FORBIDDEN", "Your session or permissions have changed.", 403);
    } catch (error) {
      const concurrent = await this.getByKey(actor, key);
      if (concurrent)
        return this.replay(concurrent, documentId, profile, document.sha256);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("pdf_validation_credit_insufficient"))
        fail(
          "PDF_VALIDATION_CREDIT_INSUFFICIENT",
          "There are not enough available credits for this check. Existing reservations remain protected.",
          409,
        );
      if (message.includes("pdf_validation_busy"))
        fail(
          "PDF_VALIDATION_BUSY",
          "Two checks are already in progress. View the reports before retrying.",
        );
      if (message.includes("pdf_validation_authority"))
        fail(
          "FORBIDDEN",
          "Permissions or the approved purchase have changed.",
          403,
        );
      throw error;
    }
    try {
      const object = await this.env.DOCUMENTS.get(document.storage_key);
      if (
        !object ||
        object.size > LIMITS.pdfBytes ||
        object.size !== document.size
      )
        return failure();
      const bytes = new Uint8Array(await object.arrayBuffer());
      if ((await sha256(bytes)) !== document.sha256) return failure();
      const signal = AbortSignal.timeout(50_000);
      let abort = () => {};
      const aborted = new Promise<never>((_, reject) => {
        abort = () => reject(new Error("TIMEOUT"));
        signal.addEventListener("abort", abort, { once: true });
      });
      try {
        // No URL downloads, document names or content in service metadata.
        const request = new Request(
          `https://pdf-validator.internal/validate?profile=${profile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": String(bytes.length),
            },
            body: bytes,
            signal,
          },
        );
        const response = await Promise.race([
          this.env.PDF_VALIDATOR.fetch(request),
          aborted,
        ]);
        if (
          !response.ok ||
          response.headers.get("content-type")?.split(";")[0] !==
            "application/json" ||
          !response.body
        )
          return failure();
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        let chunkCount = 0;
        try {
          while (true) {
            const next = await Promise.race([reader.read(), aborted]);
            if (next.done) break;
            if (++chunkCount > 4096 || next.value.byteLength === 0)
              return failure();
            size += next.value.byteLength;
            if (size > 131_072) return failure();
            chunks.push(next.value);
          }
        } finally {
          void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        const joined = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          joined.set(chunk, offset);
          offset += chunk.length;
        }
        const parsed = privatePdfValidationResult.safeParse(
          JSON.parse(new TextDecoder().decode(joined)),
        );
        if (
          !parsed.success ||
          parsed.data.sha256 !== document.sha256 ||
          parsed.data.profile !== profile
        )
          return failure();
        const report: PdfValidationReport = {
          ...parsed.data,
          id,
          documentId,
          createdAt: now,
          evidence: this.env.MODE,
          status: parsed.data.compliant ? "passed" : "failed",
          manualReviewRequired: true,
          manualChecks: pdfManualChecks.map((check) => ({ ...check })),
          certification: false,
        };
        // Current authority and exact originals can change while the engine runs.
        await authority.assertCurrent();
        const current = await this.domain.getDocument(actor, documentId);
        if (current.status !== "ready" || current.sha256 !== document.sha256)
          return failure();
        const finished = new Date().toISOString();
        const fence = authority.sql();
        const write = await this.env.DB.prepare(
          `UPDATE pdf_validations SET status='complete',result_json=?,completed_at=? WHERE organization_id=? AND id=? AND status='processing' AND deadline_at>? AND (${fence.condition}) AND EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN documents d ON d.organization_id=m.organization_id WHERE m.organization_id=pdf_validations.organization_id AND m.user_id=? AND m.user_id=pdf_validations.request_user_id AND m.role='admin' AND o.mode=pdf_validations.evidence AND d.id=pdf_validations.document_id AND d.sha256=pdf_validations.document_sha256 AND d.status='ready' AND (d.access_owner_id IS NULL OR d.access_owner_id=m.user_id))`,
        )
          .bind(
            JSON.stringify(report),
            finished,
            actor.organizationId,
            id,
            finished,
            ...fence.values,
            actor.userId,
          )
          .run();
        if (write.meta.changes !== 1)
          fail(
            "FORBIDDEN",
            "Permissions changed during the check. No credits were consumed.",
            403,
          );
        return report;
      } finally {
        signal.removeEventListener("abort", abort);
      }
    } catch (error) {
      await this.env.DB.prepare(
        "UPDATE pdf_validations SET status='error' WHERE organization_id=? AND id=? AND status='processing'",
      )
        .bind(actor.organizationId, id)
        .run();
      if (error instanceof DomainError || error instanceof AuthError)
        throw error;
      return failure();
    }
  }

  private async getByKey(actor: ActorContext, key: string) {
    return this.env.DB.prepare(
      "SELECT id,document_id,document_sha256,profile,status,result_json FROM pdf_validations WHERE organization_id=? AND idempotency_key=?",
    )
      .bind(actor.organizationId, key)
      .first<Row>();
  }
  private replay(
    row: Row,
    documentId: string,
    profile: string,
    documentSha256: string,
  ): PdfValidationReport {
    if (
      row.document_id !== documentId ||
      row.profile !== profile ||
      row.document_sha256 !== documentSha256
    )
      fail("IDEMPOTENCY_CONFLICT", "This key belongs to another check.");
    if (row.status === "complete" && row.result_json)
      return pdfValidationReportSchema.parse(JSON.parse(row.result_json));
    if (row.status === "processing")
      fail(
        "PDF_VALIDATION_BUSY",
        "The check is already in progress. View the reports before retrying.",
      );
    return failure();
  }
}
