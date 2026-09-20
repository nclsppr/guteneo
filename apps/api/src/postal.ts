import { z } from "zod";
import {
  ContentError,
  validateRecipient,
} from "../../../packages/contracts/src/content";
import {
  PINGEN_PREFLIGHT_VERSION,
  PINGEN_MAX_BYTES,
  pingenLayout,
} from "../../../packages/contracts/src/pingen-preflight";
import {
  postalReviewInputSchema,
  type PostalReviewInput,
  type PostalReview,
} from "../../../packages/contracts/src/postal-review";
import {
  canonicalJson,
  sha256,
  type DomainService,
  type DocumentRecord,
} from "../../../packages/domain/src/index";
import { inspectPingenReadiness } from "../../../packages/providers/pingen-readiness";
import type { Fetcher as ProviderFetcher } from "../../../packages/providers";
import { preparePostalDraft } from "./live-providers";
import { readLimited } from "./documents";
import type { Env } from "./env";
import type { PostalAuthority } from "./postal-authority";
import { postalAddressLines } from "../../../packages/contracts/src/postal-address-page";
import {
  addressPageForDocument,
  addressPageProvenance,
  assertAddressPageBinding,
} from "./postal-address-page-binding";
import { postalAddressGuidance } from "../../../packages/contracts/src/postal-requirements";

export type PostalProfile = {
  accountId: string;
  environment: "production" | "sandbox";
  defaultCountry: string;
  addressPosition: "left" | "right";
  version: typeof PINGEN_PREFLIGHT_VERSION;
};
type Row = {
  id: string;
  organization_id: string;
  user_id: string;
  document_id: string;
  document_sha256: string;
  sender_id: string;
  sender_address: string;
  recipient_json: string;
  options_json: string;
  profile_json: string;
  expected_address: string;
  ceiling_minor: number;
  request_hash: string;
  input_hash: string;
  idempotency_key: string;
  status: PostalReview["status"];
  report_json: string | null;
  failure_code: string | null;
  transfer_status: PostalReview["transferStatus"];
  provider_draft_id: string | null;
  processing_until: string;
  expires_at: string;
  transfer_started_at: string | null;
};
const rect = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(210),
  height: z.number().positive().max(297),
});
const reportSchema = z.object({
  version: z.literal(PINGEN_PREFLIGHT_VERSION),
  status: z.enum(["blocked", "review_required"]),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  pages: z.number().int().min(1).max(100).nullable(),
  canSend: z.literal(false),
  issues: z
    .array(
      z.object({
        code: z
          .string()
          .regex(/^POSTAL_[A-Z0-9_]+$/)
          .max(100),
        page: z.number().int().min(1).max(100).optional(),
      }),
    )
    .max(1000),
  requiredReviews: z.array(z.string().max(100)).max(20),
  rendering: z.object({
    dpi: z.literal(144),
    complete: z.boolean(),
    pages: z
      .array(
        z.object({
          page: z.number().int().min(1).max(100),
          width: z.number().int().min(1).max(1300),
          height: z.number().int().min(1).max(1800),
          rasterSha256: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .max(100),
  }),
  address: z
    .object({
      lines: z.array(z.string().max(1000)).max(20),
      issues: z.array(z.string().max(100)).max(100),
      textVisibility: z.literal("not_verified"),
      crop: z.object({
        pngBase64: z
          .string()
          .regex(/^iVBOR[A-Za-z0-9+/=]+$/)
          .max(1_000_000),
        width: z.number().int().positive().max(1300),
        height: z.number().int().positive().max(1800),
        boundsMm: rect,
      }),
    })
    .nullable(),
});
type Report = z.infer<typeof reportSchema>;
// Read historical evidence without promoting it to the current write contract.
const storedReportSchema = reportSchema.extend({
  version: z.enum(["pingen-2026-09-17-v1", PINGEN_PREFLIGHT_VERSION]),
});
type StoredReport = z.infer<typeof storedReportSchema>;
function error(code: string, status = 409): never {
  throw new ContentError(code, code, status);
}
const now = () => new Date().toISOString();
const key = (value: string) => {
  if (!value || value.length > 200 || /[\r\n\0]/.test(value))
    error("INVALID_IDEMPOTENCY_KEY", 400);
  return value;
};
function sqlFailure(failure: unknown): never {
  const message = failure instanceof Error ? failure.message : "";
  if (message.includes("expert_budget_exceeded"))
    error("EXPERT_BUDGET_EXCEEDED", 429);
  if (message.includes("expert_approval_invalid"))
    error("EXPERT_APPROVAL_INVALID", 403);
  if (message.includes("postal_render_quota_exceeded"))
    error("RENDER_QUOTA_EXCEEDED", 429);
  if (message.includes("postal_")) error("POSTAL_PREFLIGHT_STALE");
  throw failure;
}
function expectedAddress(
  recipient: PostalReviewInput["recipient"],
  profile: PostalProfile,
) {
  return postalAddressLines(recipient, profile.defaultCountry).join("\n");
}
const normalized = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("fr-FR");
function addressMatches(
  row: Row,
  report: Pick<Report, "address"> | null,
): boolean {
  return Boolean(
    report?.address &&
    report.address.issues.length === 0 &&
    row.expected_address.split("\n").map(normalized).join("\n") ===
      report.address.lines.map(normalized).join("\n"),
  );
}
function transferConfigured(env: Env) {
  return (
    env.POSTAL_DRAFTS_ENABLED === "true" &&
    env.MODE === "production" &&
    ["production", "staging"].includes(env.ENVIRONMENT) &&
    Boolean(
      env.PINGEN_CLIENT_ID &&
      env.PINGEN_CLIENT_SECRET &&
      env.PINGEN_ORGANIZATION_ID &&
      env.PINGEN_UPLOAD_ORIGINS,
    ) &&
    (env.PINGEN_SANDBOX === "false" ||
      (env.ENVIRONMENT === "staging" && env.PINGEN_SANDBOX === "true"))
  );
}

/** No public-input proof is accepted: all bytes, scan evidence, account profile
 * and authentication fences are obtained by the server. Never sends a letter. */
export class PostalService {
  constructor(
    private env: Env,
    private domain: DomainService,
    private dependencies: {
      fetcher?: ProviderFetcher;
      deadlineMs?: number;
    } = {},
  ) {}

  async requirements(authority: PostalAuthority, country: "FR" | "LU" | "DE") {
    z.enum(["FR", "LU", "DE"]).parse(country);
    await authority.assertCurrent();
    const profile = await this.qualifiedProfile();
    let layout;
    try {
      layout = pingenLayout({
        defaultCountry: profile.defaultCountry,
        country,
        addressPosition: profile.addressPosition,
        printMode: "simplex",
        printSpectrum: "grayscale",
        deliveryProduct: "cheap",
      });
    } catch {
      error("POSTAL_PROFILE_UNQUALIFIED");
    }
    await authority.assertCurrent();
    return {
      provider: "pingen" as const,
      version: PINGEN_PREFLIGHT_VERSION,
      qualified: true as const,
      country,
      profile: {
        defaultCountry: profile.defaultCountry,
        addressPosition: profile.addressPosition,
      },
      layout,
      addressGuidance: postalAddressGuidance({
        defaultCountry: profile.defaultCountry,
        country,
        addressPosition: profile.addressPosition,
        printMode: "simplex",
        printSpectrum: "grayscale",
        deliveryProduct: "cheap",
      }),
      limits: {
        pdfBytes: PINGEN_MAX_BYTES,
        pages: 100,
        pageWidthMm: 210,
        pageHeightMm: 297,
        renderDpi: 144,
      },
      requirements: [
        "Coordonnées en millimètres depuis le coin supérieur gauche. Toutes les pages doivent être A4, sans rotation, recadrage, formulaire, annotation ni contenu actif, avec polices incorporées.",
        "Garder 5 mm blancs sur les quatre bords de chaque page et les coins réservés. Seul le destinataire peut occuper le rectangle adresse ; le reste du rectangle postage doit rester blanc, sans logo, trait ni pixel gris.",
        "Adresse noire, sans empattement, 10–12 points, alignée à gauche, sans ligne vide, avec marge intérieure. Ajouter une dernière ligne de pays en anglais et majuscules pour un destinataire international ; suivre les exigences spécifiques du profil France domestique lorsque sélectionné.",
        "Rendre et examiner toutes les pages à au moins 144 dpi ; comparer le destinataire attendu au texte et à l’image réellement visibles. L’extraction de texte et le contrôle automatique ne prouvent pas seuls cette identité.",
        "L’expéditeur vérifié et le traitement des retours exigent une revue distincte. Ne pas promettre un retour postal : les retours Pingen sont traités numériquement.",
        "Ne jamais corriger ou recomposer un original importé. Pour une nouvelle lettre, générer un nouveau PDF, puis appeler preflight_postal_pdf avec les octets déposés et son identifiant Guteneo.",
        "Papier normal et options simplex/duplex, grayscale/color, cheap/fast seulement si le calculateur du brouillon les accepte. Un brouillon fournisseur et un devis exact ne valent pas approbation ni acceptation d’envoi ; celles-ci suivent la voie navigateur ou un mandat expert préalable. Ce profil n’autorise aucun envoi.",
      ],
      canSend: false as const,
    };
  }

  async qualifiedProfile(): Promise<PostalProfile> {
    if (
      this.env.MODE !== "production" ||
      !["production", "staging"].includes(this.env.ENVIRONMENT) ||
      !["true", "false"].includes(this.env.PINGEN_SANDBOX ?? "") ||
      (this.env.ENVIRONMENT === "production" &&
        this.env.PINGEN_SANDBOX !== "false")
    )
      error("POSTAL_PROFILE_UNQUALIFIED");
    const result = await inspectPingenReadiness(
      {
        clientId: this.env.PINGEN_CLIENT_ID ?? "",
        clientSecret: this.env.PINGEN_CLIENT_SECRET ?? "",
        organisationId: this.env.PINGEN_ORGANIZATION_ID ?? "",
        sandbox: this.env.PINGEN_SANDBOX === "true",
      },
      this.dependencies.fetcher,
    );
    if (
      result.status !== "ok" ||
      !result.authenticated ||
      !result.organisation?.configuredIdMatches ||
      result.organisation.billingCurrency !== "EUR" ||
      !result.organisation.defaultCountry ||
      !result.organisation.defaultAddressPosition ||
      result.organisation.defaultCountry !== this.env.PINGEN_DEFAULT_COUNTRY
    )
      error("POSTAL_PROFILE_UNQUALIFIED");
    return {
      accountId: this.env.PINGEN_ORGANIZATION_ID!,
      environment: result.environment,
      defaultCountry: result.organisation.defaultCountry,
      addressPosition: result.organisation.defaultAddressPosition,
      version: PINGEN_PREFLIGHT_VERSION,
    };
  }

  async exactDocument(organizationId: string, documentId: string) {
    const document = await this.env.DB.prepare(
      "SELECT * FROM documents WHERE organization_id=? AND id=? AND status='ready' AND pages>0 AND size<=?",
    )
      .bind(organizationId, documentId, PINGEN_MAX_BYTES)
      .first<DocumentRecord>();
    if (!document) error("DOCUMENT_NOT_READY");
    const scan = await this.env.DB.prepare(
      "SELECT 1 FROM audit_log WHERE organization_id=? AND action='document.scan_verified' AND resource_id=? LIMIT 1",
    )
      .bind(organizationId, document.sha256)
      .first();
    if (!scan) error("VERIFIED_SCAN_REQUIRED");
    const object = await this.env.DOCUMENTS.get(document.storage_key);
    if (!object || object.size !== document.size)
      error("DOCUMENT_INTEGRITY_MISMATCH");
    const bytes = await readLimited(
      new Response(object.body),
      PINGEN_MAX_BYTES,
    );
    if (
      bytes.length !== document.size ||
      (await sha256(bytes)) !== document.sha256
    )
      error("DOCUMENT_INTEGRITY_MISMATCH");
    return { document, bytes };
  }
  private async sender(organizationId: string, senderId: string) {
    const sender = await this.env.DB.prepare(
      "SELECT address FROM senders WHERE organization_id=? AND id=? AND channel='postal' AND status='verified' AND mode='production'",
    )
      .bind(organizationId, senderId)
      .first<{ address: string }>();
    if (!sender) error("SENDER_NOT_CONFIGURED");
    return sender.address;
  }
  private async row(authority: PostalAuthority, id: string) {
    await authority.assertCurrent();
    const row = await this.env.DB.prepare(
      "SELECT * FROM postal_preflights WHERE organization_id=? AND id=?",
    )
      .bind(authority.context.organizationId, id)
      .first<Row>();
    if (!row) error("POSTAL_PREFLIGHT_NOT_FOUND", 404);
    return row;
  }
  private async current(authority: PostalAuthority, row: Row, profile = false) {
    await authority.assertCurrent();
    await this.domain.authorizeWrite(authority.context);
    if (this.superseded(row, this.report(row)))
      error("POSTAL_PREFLIGHT_VERSION_CHANGED");
    if (row.expires_at <= now()) error("POSTAL_PREFLIGHT_EXPIRED");
    const exact = await this.exactDocument(
      row.organization_id,
      row.document_id,
    );
    if (
      exact.document.sha256 !== row.document_sha256 ||
      (await this.sender(row.organization_id, row.sender_id)) !==
        row.sender_address
    )
      error("POSTAL_PREFLIGHT_STALE");
    await assertAddressPageBinding(this.env.DB, {
      organizationId: row.organization_id,
      documentId: row.document_id,
      sha256: row.document_sha256,
      recipient: JSON.parse(row.recipient_json),
      printMode: JSON.parse(row.options_json).printMode,
      profile: JSON.parse(row.profile_json),
    });
    if (
      profile &&
      canonicalJson(await this.qualifiedProfile()) !== row.profile_json
    )
      error("POSTAL_PROFILE_CHANGED");
    await authority.assertCurrent();
    return exact;
  }
  private report(row: Row): StoredReport | null {
    return row.report_json
      ? storedReportSchema.parse(JSON.parse(row.report_json))
      : null;
  }
  private superseded(row: Row, report: StoredReport | null): boolean {
    return (
      JSON.parse(row.profile_json).version !== PINGEN_PREFLIGHT_VERSION ||
      (report !== null && report.version !== PINGEN_PREFLIGHT_VERSION)
    );
  }

  async get(authority: PostalAuthority, id: string): Promise<PostalReview> {
    const row = await this.row(authority, id);
    const document = await this.domain.getDocument(
      authority.context,
      row.document_id,
    );
    const addressPage = await addressPageForDocument(
      this.env.DB,
      row.organization_id,
      row.document_id,
    );
    const report = this.report(row);
    const superseded = this.superseded(row, report);
    const timedOut =
      row.status === "processing" && row.processing_until <= now();
    const expired = row.expires_at <= now();
    const matches = addressMatches(row, report);
    const complete = Boolean(
      report?.rendering.complete &&
      report.sha256 === document.sha256 &&
      document.status === "ready",
    );
    await authority.assertCurrent();
    return {
      id: row.id,
      fingerprint: row.request_hash,
      ...(addressPage?.generated_document_id
        ? { addressPage: addressPageProvenance(addressPage) }
        : {}),
      status: superseded ? "blocked" : timedOut ? "failed" : row.status,
      document: {
        id: document.id,
        name: document.name,
        sha256: document.sha256,
        pages: document.pages,
        previewUrl: `${this.env.APP_ORIGIN}/api/documents/${encodeURIComponent(document.id)}/content`,
      },
      recipient: JSON.parse(row.recipient_json),
      options: JSON.parse(row.options_json),
      ceilingMinor: row.ceiling_minor,
      reviewUrl: `${this.env.APP_ORIGIN}/#/app/postal/${encodeURIComponent(row.id)}`,
      checks: {
        complete,
        dpi: report?.rendering.dpi ?? null,
        pages:
          report?.rendering.pages.map(({ page, width, height }) => ({
            page,
            width,
            height,
          })) ?? [],
        issues: [
          ...(report?.issues ?? []),
          ...(superseded ? [{ code: "POSTAL_PREFLIGHT_VERSION_CHANGED" }] : []),
          ...(row.failure_code ? [{ code: row.failure_code }] : []),
          ...(timedOut ? [{ code: "POSTAL_RENDER_TIMEOUT" }] : []),
          ...(expired ? [{ code: "POSTAL_PREFLIGHT_EXPIRED" }] : []),
          ...(report?.address && !matches
            ? [{ code: "POSTAL_ADDRESS_MISMATCH" }]
            : []),
        ],
      },
      address: {
        expectedLines: row.expected_address.split("\n"),
        extractedLines: report?.address?.lines ?? [],
        matches,
        textVisibility: "not_verified",
        cropAccess: "authenticated_browser_session_only",
        mcpEmbeddedVisualEvidenceAvailable: false,
        cropUrl: report?.address
          ? `${this.env.APP_ORIGIN}/api/postal/preflights/${encodeURIComponent(row.id)}/address.png`
          : null,
      },
      transferPolicy: {
        canTransferMeaning: "browser_session_only",
        expertTool: "transfer_postal_draft",
        expertAuthority: "separate_active_postal_transfer_mandate_required",
        expertEligibilityEvaluated: false,
        requiresVisualReview: true,
      },
      canTransfer:
        authority.context.actor === "browser" &&
        authority.context.role !== "viewer" &&
        transferConfigured(this.env) &&
        !superseded &&
        !expired &&
        row.status === "review_required" &&
        complete &&
        matches &&
        row.transfer_status === "not_started",
      transferStatus:
        row.transfer_status === "preparing" &&
        row.transfer_started_at !== null &&
        Date.parse(row.transfer_started_at) + 120_000 <= Date.now()
          ? "unknown"
          : row.transfer_status,
      draftId: row.provider_draft_id,
      canSend: false,
    };
  }

  async crop(authority: PostalAuthority, id: string) {
    const row = await this.row(authority, id);
    const report = this.report(row);
    const document = await this.domain.getDocument(
      authority.context,
      row.document_id,
    );
    if (
      document.status !== "ready" ||
      row.expires_at <= now() ||
      !report?.address
    )
      error("POSTAL_ADDRESS_PREVIEW_UNAVAILABLE", 404);
    const raw = atob(report.address.crop.pngBase64);
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    await authority.assertCurrent();
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }

  async create(
    authority: PostalAuthority,
    raw: PostalReviewInput,
    idempotencyKey: string,
  ) {
    await authority.assertCurrent();
    await this.domain.authorizeWrite(authority.context);
    if (!this.env.DOCUMENT_RENDERER) error("POSTAL_RENDERER_UNAVAILABLE", 503);
    const input = postalReviewInputSchema.parse(raw);
    input.recipient = validateRecipient(
      "postal",
      input.recipient,
    ) as PostalReviewInput["recipient"];
    key(idempotencyKey);
    const inputHash = await sha256(canonicalJson(input));
    const replay = await this.env.DB.prepare(
      "SELECT id,input_hash FROM postal_preflights WHERE organization_id=? AND idempotency_key=?",
    )
      .bind(authority.context.organizationId, idempotencyKey)
      .first<{ id: string; input_hash: string }>();
    if (replay) {
      if (replay.input_hash !== inputHash) error("IDEMPOTENCY_CONFLICT");
      return this.get(authority, replay.id);
    }
    const { document, bytes } = await this.exactDocument(
      authority.context.organizationId,
      input.documentId,
    );
    const senderAddress = await this.sender(
      authority.context.organizationId,
      input.senderId,
    );
    const profile = await this.qualifiedProfile();
    await assertAddressPageBinding(this.env.DB, {
      organizationId: authority.context.organizationId,
      documentId: document.id,
      sha256: document.sha256,
      recipient: input.recipient,
      printMode: input.options.printMode,
      profile,
    });
    const options = {
      ...input.options,
      addressPosition: profile.addressPosition,
    };
    const renderOptions = {
      ...options,
      defaultCountry: profile.defaultCountry,
      country: input.recipient.country,
    };
    try {
      pingenLayout(renderOptions);
    } catch {
      error("POSTAL_PROFILE_UNQUALIFIED");
    }
    const requestHash = await sha256(
      canonicalJson({
        ...input,
        options,
        profile,
        documentSha256: document.sha256,
        senderAddress,
      }),
    );
    const id = `pp_${crypto.randomUUID()}`,
      created = now();
    await authority.assertCurrent();
    const fence = authority.sql();
    let inserted;
    try {
      inserted = await this.env.DB.prepare(
        `INSERT INTO postal_preflights(id,organization_id,user_id,document_id,document_sha256,sender_id,sender_address,recipient_json,options_json,profile_json,expected_address,ceiling_minor,request_hash,input_hash,idempotency_key,status,budget_day,processing_until,expires_at,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'processing',?,?,?,?,? WHERE ${fence.condition} AND NOT EXISTS(SELECT 1 FROM postal_preflights WHERE organization_id=? AND idempotency_key=?)`,
      )
        .bind(
          id,
          authority.context.organizationId,
          authority.context.userId,
          document.id,
          document.sha256,
          input.senderId,
          senderAddress,
          canonicalJson(input.recipient),
          canonicalJson(options),
          canonicalJson(profile),
          expectedAddress(input.recipient, profile),
          input.ceilingMinor,
          requestHash,
          inputHash,
          idempotencyKey,
          created.slice(0, 10),
          new Date(Date.now() + 90_000).toISOString(),
          new Date(Date.now() + 86_400_000).toISOString(),
          created,
          created,
          ...fence.values,
          authority.context.organizationId,
          idempotencyKey,
        )
        .run();
    } catch (failure) {
      sqlFailure(failure);
    }
    if (inserted!.meta.changes < 1) {
      await authority.assertCurrent();
      const winner = await this.env.DB.prepare(
        "SELECT id,input_hash FROM postal_preflights WHERE organization_id=? AND idempotency_key=?",
      )
        .bind(authority.context.organizationId, idempotencyKey)
        .first<{ id: string; input_hash: string }>();
      if (!winner || winner.input_hash !== inputHash)
        error("IDEMPOTENCY_CONFLICT");
      return this.get(authority, winner.id);
    }
    try {
      const signal = AbortSignal.timeout(
        this.dependencies.deadlineMs ?? 30_000,
      );
      const operation = (async () => {
        const response = await this.env.DOCUMENT_RENDERER!.fetch(
          new Request("https://documents.internal/preflight/pingen", {
            method: "POST",
            body: bytes as Uint8Array<ArrayBuffer>,
            redirect: "manual",
            signal,
            headers: {
              "Content-Type": "application/pdf",
              "X-Guteneo-Source-Sha256": document.sha256,
              "X-Guteneo-Scan-Sha256": document.sha256,
              "X-Guteneo-Pingen-Options": JSON.stringify(renderOptions),
            },
          }),
        );
        if (response.status !== 200) error("POSTAL_RENDER_FAILED");
        const result = reportSchema.parse(
          JSON.parse(
            new TextDecoder().decode(await readLimited(response, 1_500_000)),
          ),
        );
        if (
          result.sha256 !== document.sha256 ||
          result.pages !== document.pages
        )
          error("POSTAL_RENDER_PROOF_INVALID");
        if (
          result.status === "review_required" &&
          (!result.rendering.complete ||
            result.issues.length ||
            result.rendering.pages.length !== document.pages ||
            !result.address ||
            !result.requiredReviews.includes("printed_recipient_matches"))
        )
          error("POSTAL_RENDER_PROOF_INVALID");
        if (
          result.rendering.complete &&
          (result.rendering.pages.length !== document.pages ||
            result.rendering.pages.some(
              (page, index) =>
                page.page !== index + 1 ||
                page.width < 1190 ||
                page.height < 1683 ||
                page.width * page.height > 2_100_000,
            ))
        )
          error("POSTAL_RENDER_PROOF_INVALID");
        return result;
      })();
      let onAbort: () => void = () => {};
      const timeout = new Promise<never>((_, reject) => {
        onAbort = () =>
          reject(
            new ContentError("POSTAL_RENDER_TIMEOUT", "Analyse interrompue."),
          );
        signal.addEventListener("abort", onAbort, { once: true });
      });
      let report: Report;
      try {
        report = await Promise.race([operation, timeout]);
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
      const row = await this.row(authority, id);
      await this.current(authority, row);
      const matches = addressMatches(row, report);
      if (!matches && report.status === "review_required") {
        report.status = "blocked";
        report.issues.push({ code: "POSTAL_ADDRESS_MISMATCH", page: 1 });
      }
      const finalFence = authority.sql();
      const result = await this.env.DB.prepare(
        `UPDATE postal_preflights SET status=?,report_json=?,updated_at=? WHERE organization_id=? AND id=? AND status='processing' AND processing_until>? AND ${finalFence.condition} AND EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=postal_preflights.organization_id AND d.id=postal_preflights.document_id AND d.status='ready' AND d.sha256=postal_preflights.document_sha256 AND EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=d.organization_id AND a.action='document.scan_verified' AND a.resource_id=d.sha256)) AND EXISTS(SELECT 1 FROM senders s WHERE s.organization_id=postal_preflights.organization_id AND s.id=postal_preflights.sender_id AND s.address=postal_preflights.sender_address AND s.status='verified' AND s.mode='production')`,
      )
        .bind(
          report.status,
          canonicalJson(report),
          now(),
          row.organization_id,
          id,
          now(),
          ...finalFence.values,
        )
        .run();
      if (result.meta.changes !== 1) error("POSTAL_PREFLIGHT_STALE");
    } catch (failure) {
      const safeCode =
        failure instanceof ContentError &&
        ["POSTAL_RENDER_TIMEOUT", "POSTAL_RENDER_PROOF_INVALID"].includes(
          failure.code,
        )
          ? failure.code
          : "POSTAL_RENDER_FAILED";
      await this.env.DB.prepare(
        "UPDATE postal_preflights SET status='failed',failure_code=?,updated_at=? WHERE organization_id=? AND id=? AND status='processing'",
      )
        .bind(safeCode, now(), authority.context.organizationId, id)
        .run();
      await authority.assertCurrent();
    }
    return this.get(authority, id);
  }

  async transfer(
    authority: PostalAuthority,
    id: string,
    consent: { reviewed: true; consentToTransfer: true },
  ) {
    z.object({ reviewed: z.literal(true), consentToTransfer: z.literal(true) })
      .strict()
      .parse(consent);
    if (
      authority.context.actor !== "browser" &&
      !(authority.context.actor === "mcp" && authority.expert)
    )
      error("HUMAN_DOCUMENT_TRANSFER_REQUIRED", 403);
    if (!transferConfigured(this.env)) error("POSTAL_DRAFT_TRANSFER_DISABLED");
    const row = await this.row(authority, id);
    if (row.transfer_status !== "not_started") return this.get(authority, id);
    const report = this.report(row);
    if (
      row.status !== "review_required" ||
      !report?.rendering.complete ||
      !addressMatches(row, report)
    )
      error("POSTAL_PREFLIGHT_REQUIRED");
    await this.current(authority, row, true);
    const fence = authority.sql();
    let results;
    try {
      results = await this.env.DB.batch([
        this.env.DB.prepare(
          `INSERT INTO postal_transfer_consents(preflight_id,organization_id,user_id,fingerprint,reviewed,transfer_only,created_at,consent_kind,expert_connection_id,expert_policy_revision) SELECT ?,?,?,?,1,1,?,?,?,? WHERE ${fence.condition} AND EXISTS(SELECT 1 FROM postal_preflights WHERE organization_id=? AND id=? AND transfer_status='not_started') AND NOT EXISTS(SELECT 1 FROM postal_transfer_consents WHERE preflight_id=?)`,
        ).bind(
          id,
          row.organization_id,
          authority.context.userId,
          row.request_hash,
          now(),
          authority.expert ? "expert" : "browser",
          authority.expert?.connectionId ?? null,
          authority.expert?.policyRevision ?? null,
          ...fence.values,
          row.organization_id,
          id,
          id,
        ),
        this.env.DB.prepare(
          `UPDATE postal_preflights SET transfer_status='preparing',transfer_started_at=?,updated_at=? WHERE organization_id=? AND id=? AND transfer_status='not_started' AND ${fence.condition}`,
        ).bind(now(), now(), row.organization_id, id, ...fence.values),
      ]);
    } catch (failure) {
      sqlFailure(failure);
    }
    if (results![1].meta.changes !== 1) {
      await authority.assertCurrent();
      return this.get(authority, id);
    }
    try {
      const draft = await preparePostalDraft(
        this.env,
        this.domain,
        authority.context,
        {
          documentId: row.document_id,
          senderId: row.sender_id,
          recipient: JSON.parse(row.recipient_json),
          options: JSON.parse(row.options_json),
          ceilingMinor: row.ceiling_minor,
          idempotencyKey: id,
          preflightId: id,
        },
        {
          fetcher: this.dependencies.fetcher,
          transferAuthority: authority.expert ? authority : undefined,
          beforeTransfer: async () => {
            const active = await this.row(authority, id);
            if (active.transfer_status !== "preparing")
              error("POSTAL_PREFLIGHT_STALE");
            await this.current(authority, active, true);
          },
        },
      );
      await authority.assertCurrent();
      const finalFence = authority.sql();
      const result = await this.env.DB.prepare(
        `UPDATE postal_preflights SET transfer_status='prepared',provider_draft_id=?,updated_at=? WHERE organization_id=? AND id=? AND transfer_status='preparing' AND ${finalFence.condition}`,
      )
        .bind(
          draft.providerDraftId,
          now(),
          row.organization_id,
          id,
          ...finalFence.values,
        )
        .run();
      if (result.meta.changes !== 1) error("POSTAL_PREFLIGHT_STALE");
    } catch {
      await this.env.DB.prepare(
        "UPDATE postal_preflights SET transfer_status='unknown',updated_at=? WHERE organization_id=? AND id=? AND transfer_status='preparing'",
      )
        .bind(now(), row.organization_id, id)
        .run();
      await authority.assertCurrent();
    }
    return this.get(authority, id);
  }

  async quote(authority: PostalAuthority, id: string, idempotencyKey: string) {
    key(idempotencyKey);
    const row = await this.row(authority, id);
    if (row.transfer_status !== "prepared" || !row.provider_draft_id)
      error("POSTAL_PREPARED_DRAFT_REQUIRED");
    await this.current(authority, row, true);
    const draft = await this.env.DB.prepare(
      "SELECT provider_id FROM provider_drafts WHERE organization_id=? AND id=? AND status='prepared'",
    )
      .bind(row.organization_id, row.provider_draft_id)
      .first<{ provider_id: string }>();
    if (!draft) error("POSTAL_PREPARED_DRAFT_REQUIRED");
    try {
      const dispatch = await this.domain.prepareDispatch(
        authority.context,
        {
          channel: "postal",
          documentId: row.document_id,
          senderId: row.sender_id,
          recipient: JSON.parse(row.recipient_json),
          ceilingMinor: row.ceiling_minor,
          options: {
            ...JSON.parse(row.options_json),
            providerDraftId: row.provider_draft_id,
            preparedLetterId: draft.provider_id,
            expectedAddress: row.expected_address,
          },
        },
        idempotencyKey,
      );
      await authority.assertCurrent();
      return dispatch;
    } catch (failure) {
      if (
        failure instanceof Error &&
        failure.message.includes("postal_document_not_ready")
      )
        error("POSTAL_DRAFT_NOT_READY");
      throw failure;
    }
  }
}

/** Delete bounded derived page evidence after expiry or original purge. Immutable
 * request metadata remains for idempotency/audit; expired proof never authorizes.
 * No provider call, sending credit mutation or original rewrite. */
export async function cleanupPostalEvidence(db: D1Database) {
  return db
    .prepare(
      "UPDATE postal_preflights SET report_json=NULL WHERE id IN (SELECT p.id FROM postal_preflights p JOIN documents d ON d.organization_id=p.organization_id AND d.id=p.document_id WHERE p.report_json IS NOT NULL AND (p.expires_at<=? OR d.status='purged') ORDER BY p.expires_at,p.id LIMIT 100)",
    )
    .bind(now())
    .run();
}
