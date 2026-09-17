import {
  resolveDeliveryPrice,
  makeDeliveryQuote,
  insertDeliveryQuote,
  validateLiveDeliveryQuote,
  deliveryPriceDisclosure,
  type PricingBasis,
  type CommercialFx,
  type LiveDeliveryIdentities,
  type PostalQuoteResolver,
} from "./live-delivery-quotes";
export {
  validateLiveDeliveryQuote,
  emailRateComponents,
  type LiveDeliveryIdentity,
  type LiveDeliveryIdentities,
  type PostalQuoteResolver,
  type PostalQuoteRequest,
} from "./live-delivery-quotes";
import {
  resolveFaxTariff,
  makeFaxQuote,
  insertFaxQuote,
  validateLiveFaxQuote,
  type LiveFaxIdentity,
} from "./live-fax-quotes";
import { ensureCreditPeriod, readWelcomeCredit } from "./welcome-credit";
import { readFaxPricing, readFaxPricingBatch } from "./live-fax-usage";
import type { FaxPricing } from "../../contracts/src/fax-pricing";
export { settleFaxUsage, type OperatorFaxUsageProof } from "./live-fax-usage";
export { validateLiveFaxQuote, type LiveFaxIdentity } from "./live-fax-quotes";
import {
  cleanHtml,
  htmlToText,
  safeHeader,
  validateRecipient,
  LIMITS,
} from "../../contracts/src/content";

export type Channel = "fax" | "email" | "postal";
export type Mode = "simulation" | "production";
export type ActorContext = {
  organizationId: string;
  userId: string;
  role: "admin" | "member" | "viewer";
  actor: "browser" | "mcp" | "system";
};
export type DomainContext = ActorContext;
/** Server-created proof: credentials and current authority are rechecked in the acceptance transaction. */
export type ExpertDispatchAuthority = {
  reviewHash: string;
  connectionId: string;
  condition: string;
  values: (string | number | null)[];
};
export type DocumentRecord = {
  id: string;
  organization_id: string;
  name: string;
  sha256: string;
  size: number;
  pages: number;
  status: "ready" | "quarantined" | "rejected" | "purged";
  source: "import" | "render";
  storage_key: string;
  created_at: string;
};
export type DispatchStatus =
  | "prepared"
  | "queued"
  | "submitting"
  | "submission_unknown"
  | "accepted"
  | "delivered"
  | "failed"
  | "cancelled"
  | "bounced"
  | "complained"
  | "printed"
  | "handed_to_post";
export type Dispatch = {
  faxPricing?: FaxPricing;
  quote_fingerprint?: string | null;
  quote_expires_at?: string | null;
  quote_customer_nanoeur?: number | null;
  quote_pricing_basis?: PricingBasis | null;
  quote_fx?: CommercialFx | null;
  id: string;
  organization_id: string;
  campaign_id: string | null;
  channel: Channel;
  recipient_json: string;
  document_id: string | null;
  sender_id: string | null;
  sender_address: string;
  subject: string | null;
  html: string | null;
  text: string | null;
  options_json: string;
  status: DispatchStatus;
  mode: Mode;
  estimated_minor: number;
  ceiling_minor: number;
  known_minor: number | null;
  currency: "EUR";
  fingerprint: string;
  prepare_key: string;
  request_hash: string;
  provider: string | null;
  provider_id: string | null;
  lease_until: string | null;
  active_attempt_id: string | null;
  created_at: string;
  updated_at: string;
};
export type PrepareInput = {
  channel: Channel;
  recipient: Record<string, unknown>;
  documentId?: string;
  senderId?: string;
  subject?: string;
  html?: string;
  text?: string;
  options?: Record<string, unknown>;
  campaignId?: string;
  ceilingMinor?: number;
};
export type ProviderEventInput = {
  provider: string;
  eventId: string;
  providerId?: string;
  dispatchId?: string;
  kind:
    | "accepted"
    | "delivered"
    | "failed"
    | "bounced"
    | "complained"
    | "printed"
    | "handed_to_post";
  occurredAt: string;
  payload?: Record<string, unknown>;
};
export type ProviderHook = {
  name: string;
  liveFaxIdentity?: LiveFaxIdentity;
  liveDeliveryIdentity?: LiveDeliveryIdentities;
  submit: (dispatch: Dispatch) => Promise<{
    status: "accepted" | "submission_unknown" | "rejected";
    providerId?: string;
    errorCode?: string;
    events?: ProviderEventInput[];
  }>;
};
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function key(value: string) {
  if (!value || value.length > 200 || /[\r\n\0]/.test(value))
    throw new DomainError(
      "INVALID_IDEMPOTENCY_KEY",
      "Une clé d’idempotence de 1 à 200 caractères est requise.",
    );
  return value;
}
function writable(ctx: ActorContext) {
  if (ctx.role === "viewer")
    throw new DomainError("FORBIDDEN", "Droit de modification requis.", 403);
}
function sqlError(error: unknown): never {
  if (String(error).includes("postal_preflight_required"))
    throw new DomainError(
      "POSTAL_PREFLIGHT_REQUIRED",
      "Le contrôle postal doit être renouvelé.",
      409,
    );
  const message = String(error);
  if (message.includes("expert_approval_invalid"))
    throw new DomainError(
      "EXPERT_APPROVAL_INVALID",
      "La délégation ou la revue a expiré ou a été révoquée.",
      409,
    );
  if (message.includes("expert_budget_exceeded"))
    throw new DomainError(
      "EXPERT_BUDGET_EXCEEDED",
      "Le plafond quotidien du mode expert est atteint.",
      409,
    );
  for (const [needle, code, label, status] of [
    [
      "recipient_request_required",
      "RECIPIENT_REQUEST_REQUIRED",
      "Confirmez que le destinataire a demandé cet e-mail.",
      409,
    ],
    [
      "credit_exhausted",
      "CREDIT_EXHAUSTED",
      "Le crédit de bienvenue disponible est insuffisant. La recharge n’est pas encore disponible.",
      409,
    ],
    [
      "live_quote_invalid",
      "LIVE_QUOTE_INVALID",
      "Le devis fax a expiré ou sa configuration a changé. Renouvelez le devis avant de l’approuver à nouveau.",
      409,
    ],
    [
      "quota_exceeded",
      "QUOTA_EXCEEDED",
      "Crédits ou plafond insuffisants.",
      409,
    ],
    [
      "approval_required",
      "APPROVAL_REQUIRED",
      "Approbation humaine valide requise.",
      409,
    ],
    [
      "channel_disabled",
      "CHANNEL_DISABLED",
      "Ce canal est temporairement désactivé.",
      409,
    ],
    [
      "campaign_frozen",
      "CAMPAIGN_FROZEN",
      "La liste approuvée de cette campagne est figée.",
      409,
    ],
    [
      "document_not_ready",
      "DOCUMENT_QUARANTINED",
      "Le document n’est pas prêt à expédier.",
      409,
    ],
    [
      "sender_not_ready",
      "SENDER_NOT_CONFIGURED",
      "Expéditeur non vérifié.",
      409,
    ],
    [
      "recipient_suppressed",
      "RECIPIENT_SUPPRESSED",
      "Destinataire bloqué pour cette organisation.",
      409,
    ],
    [
      "campaign_too_large",
      "CAMPAIGN_TOO_LARGE",
      "Maximum 500 destinataires.",
      413,
    ],
  ] as const)
    if (message.includes(needle)) throw new DomainError(code, label, status);
  throw error;
}
export class DomainService {
  private now: () => number;
  constructor(
    public readonly db: D1Database,
    public readonly config: {
      mode: Mode;
      now?: () => number;
      liveFaxIdentity?: LiveFaxIdentity;
      liveDeliveryIdentity?: LiveDeliveryIdentities;
      postalQuote?: PostalQuoteResolver;
    },
  ) {
    this.now = config.now ?? Date.now;
  }
  private time() {
    return new Date(this.now()).toISOString();
  }
  private async organization(ctx: ActorContext) {
    const org = await this.db
      .prepare(
        "SELECT o.*,m.role AS membership_role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE o.id=? AND m.user_id=?",
      )
      .bind(ctx.organizationId, ctx.userId)
      .first<{ mode: Mode; membership_role: string }>();
    if (!org || org.membership_role !== ctx.role)
      throw new DomainError(
        "FORBIDDEN",
        "Organisation ou rôle inaccessible.",
        403,
      );
    if (org.mode !== this.config.mode)
      throw new DomainError(
        "MODE_MISMATCH",
        "Environnement et organisation incompatibles.",
        403,
      );
    return org;
  }
  async authorizeWrite(ctx: ActorContext) {
    writable(ctx);
    await this.organization(ctx);
  }
  private audit(
    ctx: ActorContext,
    action: string,
    resourceId: string,
    details: Record<string, unknown> = {},
    fence?: { condition: string; values: (string | number | null)[] },
  ) {
    return this.db
      .prepare(
        `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,?,?,?,? WHERE ${fence?.condition ?? "1=1"}`,
      )
      .bind(
        uid("audit"),
        ctx.organizationId,
        ctx.userId,
        action,
        resourceId,
        canonicalJson(details),
        this.time(),
        ...(fence?.values ?? []),
      );
  }
  async registerDocument(
    ctx: ActorContext,
    input: {
      id?: string;
      name: string;
      sha256: string;
      size: number;
      pages: number;
      status: "ready" | "quarantined" | "rejected";
      source: "import" | "render";
      storageKey: string;
      scanVerified?: boolean;
    },
  ): Promise<DocumentRecord> {
    writable(ctx);
    await this.organization(ctx);
    if (
      !/^[a-f0-9]{64}$/.test(input.sha256) ||
      !Number.isSafeInteger(input.size) ||
      input.size <= 0 ||
      input.size > LIMITS.pdfBytes ||
      !Number.isSafeInteger(input.pages) ||
      input.pages < 0 ||
      (input.status === "ready" && input.pages === 0) ||
      input.pages > LIMITS.pages
    )
      throw new DomainError("INVALID_DOCUMENT", "Métadonnées PDF invalides.");
    if (
      this.config.mode === "production" &&
      input.status === "ready" &&
      !input.scanVerified
    )
      throw new DomainError(
        "SCAN_REQUIRED",
        "Le document doit être analysé avant utilisation.",
        409,
      );
    const id = input.id ?? uid("doc");
    const registered = await this.db
      .prepare(
        "INSERT INTO documents(id,organization_id,name,sha256,size,pages,status,source,storage_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,sha256) WHERE status<>'purged' DO UPDATE SET status=documents.status RETURNING *",
      )
      .bind(
        id,
        ctx.organizationId,
        safeHeader(input.name).slice(0, 200),
        input.sha256,
        input.size,
        input.pages,
        input.status,
        input.source,
        input.storageKey,
        this.time(),
      )
      .first<DocumentRecord>();
    if (!registered)
      throw new DomainError(
        "DOCUMENT_UNAVAILABLE",
        "Document indisponible.",
        409,
      );
    if (input.scanVerified && input.status === "ready") {
      await this.db.batch([
        this.db
          .prepare(
            "UPDATE documents SET status='ready',pages=? WHERE organization_id=? AND id=? AND status='quarantined' AND pages=0",
          )
          .bind(input.pages, ctx.organizationId, registered.id),
        this.audit(ctx, "document.scan_verified", input.sha256, {
          pages: input.pages,
        }),
      ]);
    }
    return (await this.db
      .prepare("SELECT * FROM documents WHERE organization_id=? AND id=?")
      .bind(ctx.organizationId, registered.id)
      .first<DocumentRecord>())!;
  }
  async getDocument(ctx: ActorContext, id: string): Promise<DocumentRecord> {
    await this.organization(ctx);
    const doc = await this.db
      .prepare("SELECT * FROM documents WHERE organization_id=? AND id=?")
      .bind(ctx.organizationId, id)
      .first<DocumentRecord>();
    if (!doc) throw new DomainError("NOT_FOUND", "Document introuvable.", 404);
    return doc;
  }
  async listDocuments(ctx: ActorContext, cursor?: string, limit = 30) {
    await this.organization(ctx);
    return this.page<DocumentRecord>(
      "documents",
      ctx.organizationId,
      cursor,
      limit,
    );
  }
  private async page<T>(
    table: "documents" | "dispatches" | "campaigns",
    org: string,
    cursor?: string,
    limit = 30,
  ) {
    const size = Math.max(1, Math.min(Number(limit) || 30, 100));
    let after: { created_at: string; id: string } | null = null;
    if (cursor) {
      try {
        after = JSON.parse(atob(cursor)) as { created_at: string; id: string };
        if (
          !after ||
          typeof after.created_at !== "string" ||
          typeof after.id !== "string"
        )
          throw Error();
      } catch {
        throw new DomainError("INVALID_CURSOR", "Curseur invalide.");
      }
    }
    const statement = this.db.prepare(
      `SELECT * FROM ${table} WHERE organization_id=? ${after ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""} ORDER BY created_at DESC,id DESC LIMIT ?`,
    );
    const { results } = await (
      after
        ? statement.bind(
            org,
            after.created_at,
            after.created_at,
            after.id,
            size + 1,
          )
        : statement.bind(org, size + 1)
    ).all<T>();
    const items = results.slice(0, size);
    const last = items.at(-1) as { created_at: string; id: string } | undefined;
    return {
      items,
      nextCursor:
        results.length > size && last
          ? btoa(JSON.stringify({ created_at: last.created_at, id: last.id }))
          : null,
    };
  }
  async prepareDispatch(
    ctx: ActorContext,
    input: PrepareInput,
    idempotencyKey: string,
  ): Promise<Dispatch> {
    return this.prepareDispatchInternal(ctx, input, idempotencyKey);
  }
  async renewFaxQuote(
    ctx: ActorContext,
    sourceId: string,
    expected?: {
      documentId: string;
      phone: string;
      ceilingMinor: number;
      senderId?: string;
    },
  ): Promise<Dispatch> {
    writable(ctx);
    const source = await this.dispatch(ctx, sourceId);
    if (
      source.channel !== "fax" ||
      source.mode !== "production" ||
      !source.document_id
    )
      throw new DomainError(
        "FAX_QUOTE_RENEWAL_UNSAFE",
        "Seul un devis fax réel peut être renouvelé ici.",
        409,
      );
    const recipient = JSON.parse(source.recipient_json) as Record<
      string,
      unknown
    >;
    if (
      expected &&
      (expected.documentId !== source.document_id ||
        validateRecipient("fax", { phone: expected.phone }).phone !==
          recipient.phone ||
        expected.ceilingMinor !== source.ceiling_minor ||
        (expected.senderId !== undefined &&
          expected.senderId !== source.sender_id))
    )
      throw new DomainError(
        "RENEWAL_CONTENT_MISMATCH",
        "Le renouvellement doit conserver le PDF, le destinataire, l’expéditeur et le plafond exacts du devis initial.",
        409,
      );
    const idempotencyKey = `fax-renew:${source.id}`;
    const existing = await this.db
      .prepare(
        "SELECT 1 FROM dispatches WHERE organization_id=? AND prepare_key=?",
      )
      .bind(ctx.organizationId, idempotencyKey)
      .first();
    if (!existing) {
      // The transaction below rechecks all submission and funding evidence.
      if (
        source.status !== "prepared" ||
        source.provider ||
        source.provider_id ||
        source.active_attempt_id
      )
        throw new DomainError(
          "FAX_QUOTE_RENEWAL_UNSAFE",
          "La soumission de cet envoi a commencé ou il n’est plus préparé. Consultez son statut sans le réexpédier.",
          409,
        );
      let invalid =
        !!source.quote_expires_at && source.quote_expires_at <= this.time();
      if (!invalid) {
        try {
          await validateLiveFaxQuote(
            this.db,
            source,
            this.config.liveFaxIdentity,
            this.time(),
          );
        } catch (error) {
          if (
            !(error instanceof DomainError) ||
            error.code !== "LIVE_QUOTE_INVALID"
          )
            throw error;
          invalid = true;
        }
      }
      if (!invalid)
        throw new DomainError(
          "QUOTE_STILL_VALID",
          "Ce devis est encore valable. Vérifiez-le avant de l’approuver.",
          409,
        );
    }
    return this.prepareDispatchInternal(
      ctx,
      {
        channel: "fax",
        recipient,
        documentId: source.document_id,
        ...(source.sender_id ? { senderId: source.sender_id } : {}),
        options: JSON.parse(source.options_json) as Record<string, unknown>,
        // A renewal is an individual quote. Never add another member to a
        // campaign whose immutable manifest may already have been approved.
        ceilingMinor: source.ceiling_minor,
      },
      idempotencyKey,
      source,
    );
  }
  private async prepareDispatchInternal(
    ctx: ActorContext,
    input: PrepareInput,
    idempotencyKey: string,
    renewal?: Dispatch,
  ): Promise<Dispatch> {
    writable(ctx);
    await this.organization(ctx);
    key(idempotencyKey);
    if (!["fax", "email", "postal"].includes(input.channel))
      throw new DomainError("INVALID_CHANNEL", "Canal inconnu.");
    const requestHash = await sha256(
      canonicalJson(renewal ? { ...input, renewalOf: renewal.id } : input),
    );
    const existing = await this.db
      .prepare(
        "SELECT * FROM dispatches WHERE organization_id=? AND prepare_key=?",
      )
      .bind(ctx.organizationId, idempotencyKey)
      .first<Dispatch>();
    if (existing) {
      if (existing.request_hash !== requestHash)
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "Cette clé correspond à un contenu différent.",
          409,
        );
      return this.dispatch(ctx, existing.id);
    }
    const recipient = validateRecipient(input.channel, input.recipient);
    const options = input.options ?? {};
    if (canonicalJson(options).length > 8192)
      throw new DomainError("INVALID_OPTIONS", "Options trop volumineuses.");
    if (options.kind === "marketing")
      throw new DomainError(
        "MARKETING_NOT_ENABLED",
        "Campagnes marketing désactivées jusqu’au raccordement de la désinscription.",
        409,
      );
    let document: DocumentRecord | undefined;
    if (input.documentId) {
      document = await this.getDocument(ctx, input.documentId);
      if (document.status !== "ready")
        throw new DomainError(
          "DOCUMENT_QUARANTINED",
          "Le document n’est pas prêt à expédier.",
          409,
        );
    }
    if (input.channel !== "email" && !document)
      throw new DomainError(
        "DOCUMENT_REQUIRED",
        "Un PDF validé est requis pour ce canal.",
      );
    let html: string | null = null,
      text: string | null = null,
      subject: string | null = null;
    if (input.channel === "email") {
      subject = safeHeader(input.subject ?? "");
      if (subject.length > 250)
        throw new DomainError("INVALID_SUBJECT", "Objet trop long.");
      html = cleanHtml(input.html ?? "");
      text = input.text?.trim() || htmlToText(html);
      if (!text || new TextEncoder().encode(text).length > LIMITS.htmlBytes)
        throw new DomainError(
          "INVALID_EMAIL_CONTENT",
          "Version texte vide ou trop longue.",
        );
      if (
        await this.db
          .prepare(
            "SELECT 1 FROM suppressions WHERE organization_id=? AND email=?",
          )
          .bind(ctx.organizationId, recipient.email)
          .first()
      )
        throw new DomainError(
          "RECIPIENT_SUPPRESSED",
          "Ce destinataire est bloqué pour cette organisation.",
          409,
        );
    }
    const sender = input.senderId
      ? await this.db
          .prepare(
            "SELECT * FROM senders WHERE organization_id=? AND id=? AND channel=? AND status=? AND mode=?",
          )
          .bind(
            ctx.organizationId,
            input.senderId,
            input.channel,
            "verified",
            this.config.mode,
          )
          .first<{ id: string; address: string }>()
      : await this.db
          .prepare(
            "SELECT * FROM senders WHERE organization_id=? AND channel=? AND status=? AND mode=? ORDER BY id LIMIT 1",
          )
          .bind(ctx.organizationId, input.channel, "verified", this.config.mode)
          .first<{ id: string; address: string }>();
    if (!sender)
      throw new DomainError(
        "SENDER_NOT_CONFIGURED",
        "Configurez et vérifiez un expéditeur pour ce canal.",
        409,
      );
    const tariff =
      this.config.mode === "production" && input.channel === "fax"
        ? await resolveFaxTariff(
            this.db,
            ctx.organizationId,
            sender.id,
            recipient.phone,
            canonicalJson(options),
            document!.pages,
            this.config.liveFaxIdentity,
            this.time(),
          )
        : undefined;
    const deliveryPrice =
      this.config.mode === "production" && input.channel !== "fax"
        ? await resolveDeliveryPrice(this.db, {
            organizationId: ctx.organizationId,
            senderId: sender.id,
            channel: input.channel,
            recipient,
            options,
            document,
            identity: this.config.liveDeliveryIdentity?.[input.channel],
            postalQuote: this.config.postalQuote,
            now: this.time(),
          })
        : undefined;
    const estimatedMinor = tariff
      ? tariff.customer_minor
      : deliveryPrice
        ? deliveryPrice.amountMinor
        : { fax: 20, email: 1, postal: 150 }[input.channel] *
          (input.channel === "fax" ? (document?.pages ?? 1) : 1);
    const ceilingMinor = input.ceilingMinor ?? estimatedMinor;
    if (
      !Number.isSafeInteger(ceilingMinor) ||
      ceilingMinor < estimatedMinor ||
      ceilingMinor > 1_000_000
    )
      throw new DomainError(
        "INVALID_CEILING",
        "Le plafond doit couvrir l’estimation en centimes.",
      );
    if (input.campaignId) {
      const c = await this.db
        .prepare(
          "SELECT status FROM campaigns WHERE organization_id=? AND id=?",
        )
        .bind(ctx.organizationId, input.campaignId)
        .first<{ status: string }>();
      if (!c) throw new DomainError("NOT_FOUND", "Campagne introuvable.", 404);
      if (c.status !== "draft")
        throw new DomainError(
          "CAMPAIGN_FROZEN",
          "Cette campagne a déjà été approuvée.",
          409,
        );
      const count = await this.db
        .prepare(
          "SELECT count(*) AS n FROM dispatches WHERE organization_id=? AND campaign_id=?",
        )
        .bind(ctx.organizationId, input.campaignId)
        .first<{ n: number }>();
      if ((count?.n ?? 0) >= LIMITS.campaignRows)
        throw new DomainError(
          "CAMPAIGN_TOO_LARGE",
          `Maximum ${LIMITS.campaignRows} destinataires.`,
          413,
        );
    }
    const frozen = {
      channel: input.channel,
      recipient,
      documentId: document?.id ?? null,
      documentSha256: document?.sha256 ?? null,
      senderId: sender.id,
      senderAddress: sender.address,
      subject,
      html,
      text,
      options,
      campaignId: input.campaignId ?? null,
      estimatedMinor,
      ceilingMinor,
      currency: "EUR",
      mode: this.config.mode,
      ...deliveryPriceDisclosure(deliveryPrice),
    };
    const id = uid("dsp"),
      now = this.time();
    const quote = tariff
      ? await makeFaxQuote(id, ctx.organizationId, frozen, tariff, now)
      : deliveryPrice
        ? await makeDeliveryQuote(
            id,
            ctx.organizationId,
            frozen,
            deliveryPrice,
            now,
          )
        : undefined;
    const fingerprint = await sha256(
      canonicalJson({
        ...frozen,
        ...(quote ? { quoteFingerprint: quote.fingerprint } : {}),
      }),
    );
    if (quote) quote.dispatch_fingerprint = fingerprint;
    try {
      const insert = this.db
        .prepare(
          "INSERT INTO dispatches(id,organization_id,campaign_id,channel,recipient_json,document_id,sender_id,sender_address,subject,html,text,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at,quote_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,prepare_key) DO NOTHING",
        )
        .bind(
          id,
          ctx.organizationId,
          input.campaignId ?? null,
          input.channel,
          canonicalJson(recipient),
          document?.id ?? null,
          sender.id,
          sender.address,
          subject,
          html,
          text,
          canonicalJson(options),
          "prepared",
          this.config.mode,
          estimatedMinor,
          ceilingMinor,
          "EUR",
          fingerprint,
          idempotencyKey,
          requestHash,
          now,
          now,
          quote?.fingerprint ?? null,
        );
      const renewalFence = renewal
        ? [
            this.db
              .prepare(
                "SELECT json(CASE WHEN NOT EXISTS(SELECT 1 FROM dispatches WHERE organization_id=? AND prepare_key=? AND request_hash<>?) AND (EXISTS(SELECT 1 FROM dispatches WHERE organization_id=? AND prepare_key=? AND request_hash=?) OR EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=? AND d.id=? AND d.fingerprint=? AND d.status='prepared' AND d.provider IS NULL AND d.provider_id IS NULL AND d.active_attempt_id IS NULL AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.organization_id=d.organization_id AND a.dispatch_id=d.id) AND NOT EXISTS(SELECT 1 FROM outbox o WHERE o.organization_id=d.organization_id AND o.dispatch_id=d.id) AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.organization_id=d.organization_id AND r.dispatch_id=d.id) AND NOT EXISTS(SELECT 1 FROM welcome_credit_reservations r WHERE r.organization_id=d.organization_id AND r.dispatch_id=d.id))) THEN '{}' ELSE 'fax_quote_renewal_unsafe' END)",
              )
              .bind(
                ctx.organizationId,
                idempotencyKey,
                requestHash,
                ctx.organizationId,
                idempotencyKey,
                requestHash,
                ctx.organizationId,
                renewal.id,
                renewal.fingerprint,
              ),
            this.db
              .prepare(
                "UPDATE dispatches SET status='cancelled',updated_at=? WHERE organization_id=? AND id=? AND status='prepared' AND fingerprint=?",
              )
              .bind(now, ctx.organizationId, renewal.id, renewal.fingerprint),
          ]
        : [];
      await this.db.batch([
        ...renewalFence,
        insert,
        ...(quote
          ? [
              "policy_id" in quote
                ? insertDeliveryQuote(this.db, quote)
                : insertFaxQuote(this.db, quote),
            ]
          : []),
        ...(renewal
          ? [
              this.audit(
                ctx,
                "fax.quote_renewed",
                renewal.id,
                {
                  replacementDispatchId: id,
                  approvalInherited: false,
                  ...(renewal.campaign_id
                    ? { originalCampaignId: renewal.campaign_id }
                    : {}),
                },
                {
                  condition:
                    "EXISTS(SELECT 1 FROM dispatches WHERE organization_id=? AND id=? AND prepare_key=?)",
                  values: [ctx.organizationId, id, idempotencyKey],
                },
              ),
            ]
          : []),
      ]);
    } catch (e) {
      if (renewal && String(e).includes("malformed JSON"))
        throw new DomainError(
          "FAX_QUOTE_RENEWAL_UNSAFE",
          "Cet envoi a changé ou sa soumission a commencé. Consultez son statut ; aucun nouveau fax n’a été préparé.",
          409,
        );
      sqlError(e);
    }
    const saved = (await this.db
      .prepare(
        "SELECT * FROM dispatches WHERE organization_id=? AND prepare_key=?",
      )
      .bind(ctx.organizationId, idempotencyKey)
      .first<Dispatch>())!;
    if (saved.request_hash !== requestHash)
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "Cette clé correspond à un contenu différent.",
        409,
      );
    return this.dispatch(ctx, saved.id);
  }
  private async dispatch(ctx: ActorContext, id: string): Promise<Dispatch> {
    await this.organization(ctx);
    const row = await this.db
      .prepare(
        "SELECT d.*,COALESCE(q.expires_at,(SELECT f.expires_at FROM live_fax_quotes_v3 f WHERE f.organization_id=d.organization_id AND f.dispatch_id=d.id),(SELECT f.expires_at FROM live_fax_quotes_v2 f WHERE f.organization_id=d.organization_id AND f.dispatch_id=d.id),(SELECT f.expires_at FROM live_fax_quotes f WHERE f.organization_id=d.organization_id AND f.dispatch_id=d.id)) AS quote_expires_at,q.customer_nanoeur AS quote_customer_nanoeur,q.fiscal_basis AS quote_pricing_basis,json_extract(q.input_json,'$.fx') AS quote_fx_json FROM dispatches d LEFT JOIN live_delivery_quotes q ON q.organization_id=d.organization_id AND q.dispatch_id=d.id WHERE d.organization_id=? AND d.id=?",
      )
      .bind(ctx.organizationId, id)
      .first<Dispatch & { quote_fx_json: string | null }>();
    if (!row) throw new DomainError("NOT_FOUND", "Envoi introuvable.", 404);
    const { quote_fx_json, ...result } = row;
    const fx =
      row.quote_pricing_basis === "public_list_price_ex_tax" && quote_fx_json
        ? (JSON.parse(quote_fx_json) as CommercialFx)
        : null;
    result.quote_fx = fx
      ? {
          numerator: fx.numerator,
          denominator: fx.denominator,
          date: fx.date,
          source: fx.source,
        }
      : null;
    if (row.mode === "production" && row.channel === "fax") {
      const faxPricing = await readFaxPricing(this.db, ctx.organizationId, id);
      if (faxPricing) (result as Dispatch).faxPricing = faxPricing;
    }
    return result;
  }
  async approveDispatch(
    ctx: ActorContext,
    id: string,
    fingerprint: string,
    attestation: { recipientRequested?: boolean } = {},
  ): Promise<Dispatch> {
    writable(ctx);
    if (ctx.actor !== "browser")
      throw new DomainError(
        "HUMAN_APPROVAL_REQUIRED",
        "L’approbation exige une session humaine authentifiée.",
        403,
      );
    return this.approveWithAuthority(ctx, id, fingerprint, attestation);
  }
  async approveExpertDispatch(
    ctx: ActorContext,
    id: string,
    fingerprint: string,
    proof: ExpertDispatchAuthority,
    attestation: { recipientRequested?: boolean } = {},
  ): Promise<Dispatch> {
    writable(ctx);
    if (ctx.actor !== "mcp" || ctx.role !== "admin")
      throw new DomainError(
        "FORBIDDEN",
        "Une délégation expert active est requise.",
        403,
      );
    return this.approveWithAuthority(ctx, id, fingerprint, attestation, proof);
  }
  private async approveWithAuthority(
    ctx: ActorContext,
    id: string,
    fingerprint: string,
    attestation: { recipientRequested?: boolean },
    proof?: ExpertDispatchAuthority,
  ): Promise<Dispatch> {
    const row = await this.dispatch(ctx, id);
    if (row.status !== "prepared")
      throw new DomainError(
        "INVALID_STATE",
        "Cet envoi ne peut plus être approuvé.",
        409,
      );
    if (row.fingerprint !== fingerprint)
      throw new DomainError(
        "FINGERPRINT_MISMATCH",
        "L’aperçu a changé. Rechargez avant approbation.",
        409,
      );
    if (
      row.mode === "production" &&
      row.channel === "email" &&
      attestation.recipientRequested !== true
    )
      throw new DomainError(
        "RECIPIENT_REQUEST_REQUIRED",
        "Confirmez que le destinataire a demandé cet e-mail.",
        409,
      );
    const now = this.time();
    const quote =
      row.mode === "production" && row.channel === "fax"
        ? await validateLiveFaxQuote(
            this.db,
            row,
            this.config.liveFaxIdentity,
            now,
          )
        : row.mode === "production" && row.channel !== "fax"
          ? await validateLiveDeliveryQuote(
              this.db,
              row,
              this.config.liveDeliveryIdentity?.[row.channel],
              now,
            )
          : undefined;
    const review = proof
      ? await this.db
          .prepare(
            "SELECT expires_at FROM valid_expert_dispatch_reviews WHERE token_hash=? AND connection_id=? AND organization_id=? AND user_id=? AND dispatch_id=? AND fingerprint=?",
          )
          .bind(
            proof.reviewHash,
            proof.connectionId,
            ctx.organizationId,
            ctx.userId,
            id,
            fingerprint,
          )
          .first<{ expires_at: string }>()
      : null;
    if (proof && !review)
      throw new DomainError(
        "EXPERT_APPROVAL_INVALID",
        "La revue expert n’est plus valide.",
        409,
      );
    const approvalExpiresAt = new Date(
      Math.min(
        review ? Date.parse(review.expires_at) : Infinity,
        this.now() + 15 * 60_000,
        quote ? Date.parse(quote.expires_at) : Infinity,
      ),
    ).toISOString();
    const statements: D1PreparedStatement[] = [];
    if (row.campaign_id)
      statements.push(
        this.db
          .prepare(
            `UPDATE campaigns SET status='frozen',updated_at=? WHERE organization_id=? AND id=? AND status='draft' AND ${proof?.condition ?? "1=1"}`,
          )
          .bind(
            now,
            ctx.organizationId,
            row.campaign_id,
            ...(proof?.values ?? []),
          ),
      );
    statements.push(
      this.db
        .prepare(
          `INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at,recipient_requested,approval_kind,expert_review_hash) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${proof?.condition ?? "1=1"} ON CONFLICT(organization_id,dispatch_id) DO UPDATE SET user_id=excluded.user_id,fingerprint=excluded.fingerprint,expires_at=excluded.expires_at,created_at=excluded.created_at,recipient_requested=excluded.recipient_requested,approval_kind=excluded.approval_kind,expert_review_hash=excluded.expert_review_hash`,
        )
        .bind(
          uid("approval"),
          ctx.organizationId,
          id,
          ctx.userId,
          fingerprint,
          approvalExpiresAt,
          now,
          attestation.recipientRequested === true ? 1 : 0,
          proof ? "expert" : "browser",
          proof?.reviewHash ?? null,
          ...(proof?.values ?? []),
        ),
      this.audit(
        ctx,
        proof ? "dispatch.expert_approved" : "dispatch.approved",
        id,
        {
          authority: proof ? "delegated" : "browser",
          ...(proof ? { connectionId: proof.connectionId } : {}),
          fingerprint,
          recipientRequested: attestation.recipientRequested === true,
        },
        proof,
      ),
    );
    try {
      const results = await this.db.batch(statements);
      if (results[row.campaign_id ? 1 : 0].meta.changes !== 1)
        throw new DomainError(
          "EXPERT_APPROVAL_INVALID",
          "L’autorisation a changé.",
          409,
        );
    } catch (error) {
      sqlError(error);
    }
    if (row.campaign_id) {
      const members = await this.db
        .prepare(
          "SELECT id,fingerprint FROM dispatches WHERE organization_id=? AND campaign_id=? ORDER BY id",
        )
        .bind(ctx.organizationId, row.campaign_id)
        .all();
      const manifestHash = await sha256(canonicalJson(members.results));
      await this.db
        .prepare(
          "UPDATE campaigns SET manifest_hash=? WHERE organization_id=? AND id=? AND status='frozen' AND manifest_hash IS NULL",
        )
        .bind(manifestHash, ctx.organizationId, row.campaign_id)
        .run();
    }
    return this.dispatch(ctx, id);
  }
  async confirmDispatch(
    ctx: ActorContext,
    id: string,
    idempotencyKey: string,
    proof?: ExpertDispatchAuthority,
  ): Promise<Dispatch> {
    writable(ctx);
    key(idempotencyKey);
    const row = await this.dispatch(ctx, id);
    if (proof && (ctx.actor !== "mcp" || ctx.role !== "admin"))
      throw new DomainError(
        "FORBIDDEN",
        "Une délégation expert active est requise.",
        403,
      );
    const now = this.time();
    if (
      row.mode === "production" &&
      row.channel === "fax" &&
      row.status === "prepared"
    )
      await validateLiveFaxQuote(
        this.db,
        row,
        this.config.liveFaxIdentity,
        now,
      );
    if (
      row.mode === "production" &&
      row.channel !== "fax" &&
      row.status === "prepared"
    )
      await validateLiveDeliveryQuote(
        this.db,
        row,
        this.config.liveDeliveryIdentity?.[row.channel],
        now,
      );
    if (row.channel === "email" && row.status === "prepared") {
      const recipient = JSON.parse(row.recipient_json) as { email: string };
      if (
        await this.db
          .prepare(
            "SELECT 1 FROM suppressions WHERE organization_id=? AND email=?",
          )
          .bind(ctx.organizationId, recipient.email)
          .first()
      )
        throw new DomainError(
          "RECIPIENT_SUPPRESSED",
          "Ce destinataire est bloqué pour cette organisation.",
          409,
        );
    }
    const hash = await sha256(
      canonicalJson({ id, fingerprint: row.fingerprint }),
    );
    const approvalFence = proof
      ? `EXISTS(SELECT 1 FROM approvals a WHERE a.organization_id=? AND a.dispatch_id=? AND a.approval_kind='expert' AND a.expert_review_hash=? AND a.user_id=?) AND (${proof.condition})`
      : "NOT EXISTS(SELECT 1 FROM approvals a WHERE a.organization_id=? AND a.dispatch_id=? AND a.approval_kind='expert')";
    const approvalValues = proof
      ? [ctx.organizationId, id, proof.reviewHash, ctx.userId, ...proof.values]
      : [ctx.organizationId, id];
    try {
      await this.db.batch([
        ensureCreditPeriod(
          this.db,
          ctx.organizationId,
          row.channel,
          now.slice(0, 7),
        ),
        this.db
          .prepare(
            `INSERT INTO idempotency_keys(organization_id,operation,key,request_hash,resource_id,created_at) SELECT ?,?,?,?,?,? WHERE ${approvalFence} ON CONFLICT(organization_id,operation,key) DO NOTHING`,
          )
          .bind(
            ctx.organizationId,
            "confirm",
            idempotencyKey,
            hash,
            id,
            now,
            ...approvalValues,
          ),
        this.db
          .prepare(
            `UPDATE dispatches SET status='queued',updated_at=? WHERE organization_id=? AND id=? AND status='prepared' AND EXISTS(SELECT 1 FROM idempotency_keys WHERE organization_id=? AND operation='confirm' AND key=? AND request_hash=? AND resource_id=?) AND ${approvalFence}`,
          )
          .bind(
            now,
            ctx.organizationId,
            id,
            ctx.organizationId,
            idempotencyKey,
            hash,
            id,
            ...approvalValues,
          ),
      ]);
    } catch (e) {
      sqlError(e);
    }
    const idem = await this.db
      .prepare(
        "SELECT request_hash FROM idempotency_keys WHERE organization_id=? AND operation='confirm' AND key=?",
      )
      .bind(ctx.organizationId, idempotencyKey)
      .first<{ request_hash: string }>();
    if (!idem && row.status === "prepared")
      throw new DomainError(
        "APPROVAL_REQUIRED",
        "L’approbation ou la délégation valide est requise.",
        409,
      );
    if (idem?.request_hash !== hash)
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "Cette clé confirme un autre envoi.",
        409,
      );
    const saved = await this.dispatch(ctx, id);
    if (saved.status === "prepared")
      throw new DomainError(
        "APPROVAL_REQUIRED",
        "Approbation humaine requise.",
        409,
      );
    if (saved.status === "cancelled")
      throw new DomainError("INVALID_STATE", "Cet envoi a été annulé.", 409);
    return saved;
  }
  async getDispatch(ctx: ActorContext, id: string) {
    const dispatch = await this.dispatch(ctx, id);
    const [events, attempts, approval] = await Promise.all([
      this.db
        .prepare(
          "SELECT id,provider,kind,payload_json,occurred_at,received_at,dispatch_id FROM provider_events WHERE organization_id=? AND dispatch_id=? ORDER BY occurred_at,id",
        )
        .bind(ctx.organizationId, id)
        .all(),
      this.db
        .prepare(
          "SELECT id,status,provider,provider_id,error_code,created_at,updated_at FROM attempts WHERE organization_id=? AND dispatch_id=? ORDER BY created_at,id",
        )
        .bind(ctx.organizationId, id)
        .all(),
      this.db
        .prepare(
          "SELECT fingerprint,expires_at,approval_kind FROM approvals WHERE organization_id=? AND dispatch_id=? AND fingerprint=? AND expires_at>?",
        )
        .bind(ctx.organizationId, id, dispatch.fingerprint, this.time())
        .first<{
          fingerprint: string;
          expires_at: string;
          approval_kind: "browser" | "expert";
        }>(),
    ]);
    return {
      dispatch,
      events: events.results,
      attempts: attempts.results,
      approval,
    };
  }
  async listDispatches(ctx: ActorContext, cursor?: string, limit = 30) {
    await this.organization(ctx);
    const page = await this.page<Dispatch>(
      "dispatches",
      ctx.organizationId,
      cursor,
      limit,
    );
    const [pricing, quotes] = await Promise.all([
      readFaxPricingBatch(
        this.db,
        ctx.organizationId,
        page.items
          .filter((d) => d.mode === "production" && d.channel === "fax")
          .map((d) => d.id),
      ),
      this.db
        .prepare(
          "SELECT d.id,COALESCE(q.expires_at,(SELECT f.expires_at FROM live_fax_quotes_v3 f WHERE f.organization_id=d.organization_id AND f.dispatch_id=d.id),(SELECT f.expires_at FROM live_fax_quotes_v2 f WHERE f.organization_id=d.organization_id AND f.dispatch_id=d.id),(SELECT f.expires_at FROM live_fax_quotes f WHERE f.organization_id=d.organization_id AND f.dispatch_id=d.id)) AS quote_expires_at FROM dispatches d LEFT JOIN live_delivery_quotes q ON q.organization_id=d.organization_id AND q.dispatch_id=d.id WHERE d.organization_id=? AND d.id IN (SELECT value FROM json_each(?))",
        )
        .bind(ctx.organizationId, JSON.stringify(page.items.map((d) => d.id)))
        .all<{ id: string; quote_expires_at: string | null }>(),
    ]);
    const expiries = new Map(
      quotes.results.map((quote) => [quote.id, quote.quote_expires_at]),
    );
    for (const row of page.items) {
      row.quote_expires_at = expiries.get(row.id) ?? null;
      const faxPricing = pricing.get(row.id);
      if (faxPricing) row.faxPricing = faxPricing;
    }
    return page;
  }
  async cancelDispatch(ctx: ActorContext, id: string): Promise<Dispatch> {
    writable(ctx);
    await this.dispatch(ctx, id);
    const now = this.time();
    const result = await this.db
      .prepare(
        "UPDATE dispatches SET status='cancelled',updated_at=? WHERE organization_id=? AND id=? AND status IN ('prepared','queued')",
      )
      .bind(now, ctx.organizationId, id)
      .run();
    const row = await this.dispatch(ctx, id);
    if (!result.meta.changes && row.status !== "cancelled")
      throw new DomainError(
        "CANCELLATION_TOO_LATE",
        "Soumission commencée : annulation non garantie, aucune nouvelle expédition déclenchée.",
        409,
      );
    await this.audit(ctx, "dispatch.cancelled", id).run();
    return row;
  }
  async createCampaign(ctx: ActorContext, input: { name: string }) {
    writable(ctx);
    await this.organization(ctx);
    const id = uid("cmp"),
      now = this.time();
    await this.db
      .prepare(
        "INSERT INTO campaigns(id,organization_id,name,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        id,
        ctx.organizationId,
        safeHeader(input.name).slice(0, 150),
        "draft",
        now,
        now,
      )
      .run();
    return (await this.db
      .prepare("SELECT * FROM campaigns WHERE organization_id=? AND id=?")
      .bind(ctx.organizationId, id)
      .first())!;
  }
  async listCampaigns(ctx: ActorContext, cursor?: string, limit = 30) {
    await this.organization(ctx);
    return this.page("campaigns", ctx.organizationId, cursor, limit);
  }
  async getCampaign(ctx: ActorContext, id: string) {
    await this.organization(ctx);
    const campaign = await this.db
      .prepare("SELECT * FROM campaigns WHERE organization_id=? AND id=?")
      .bind(ctx.organizationId, id)
      .first();
    if (!campaign)
      throw new DomainError("NOT_FOUND", "Campagne introuvable.", 404);
    const dispatches = await this.db
      .prepare(
        "SELECT * FROM dispatches WHERE organization_id=? AND campaign_id=? ORDER BY created_at,id LIMIT ?",
      )
      .bind(ctx.organizationId, id, LIMITS.campaignRows)
      .all<Dispatch>();
    return { campaign, dispatches: dispatches.results };
  }
  async listSenders(ctx: ActorContext) {
    await this.organization(ctx);
    return {
      items: (
        await this.db
          .prepare(
            "SELECT id,channel,name,address,status,mode FROM senders WHERE organization_id=? ORDER BY channel,id",
          )
          .bind(ctx.organizationId)
          .all()
      ).results,
    };
  }
  async usage(ctx: ActorContext) {
    await this.organization(ctx);
    return {
      welcomeCredit: await readWelcomeCredit(this.db, ctx.organizationId),
      items: (
        await this.db
          .prepare(
            "SELECT channel,period,limit_count,reserved_count,confirmed_count,limit_minor,reserved_minor,confirmed_minor,currency FROM usage WHERE organization_id=? AND period=? ORDER BY channel",
          )
          .bind(ctx.organizationId, this.time().slice(0, 7))
          .all()
      ).results,
    };
  }
  async admin(ctx: ActorContext) {
    await this.organization(ctx);
    if (ctx.role !== "admin")
      throw new DomainError("FORBIDDEN", "Administrateur requis.", 403);
    const [states, outbox, unknown, audit, controls, deadLetters] =
      await Promise.all([
        this.db
          .prepare(
            "SELECT channel,status,count(*) AS count FROM dispatches WHERE organization_id=? GROUP BY channel,status",
          )
          .bind(ctx.organizationId)
          .all(),
        this.db
          .prepare(
            "SELECT count(*) AS pending,min(created_at) AS oldest_at FROM outbox WHERE organization_id=? AND status='pending'",
          )
          .bind(ctx.organizationId)
          .first(),
        this.db
          .prepare(
            "SELECT id,channel,status,updated_at FROM dispatches WHERE organization_id=? AND status IN ('submission_unknown','submitting') ORDER BY updated_at LIMIT 100",
          )
          .bind(ctx.organizationId)
          .all(),
        this.db
          .prepare(
            "SELECT id,action,resource_id,details_json,created_at FROM audit_log WHERE organization_id=? ORDER BY created_at DESC LIMIT 50",
          )
          .bind(ctx.organizationId)
          .all(),
        this.db
          .prepare(
            "SELECT channel,enabled FROM channel_controls WHERE organization_id=? ORDER BY channel",
          )
          .bind(ctx.organizationId)
          .all<{ channel: Channel; enabled: number }>(),
        this.db
          .prepare(
            "SELECT l.id,l.dispatch_id,l.queue,l.received_at,l.resolved_at FROM dead_letters l JOIN dispatches d ON d.id=l.dispatch_id WHERE d.organization_id=? ORDER BY l.received_at DESC,l.id DESC LIMIT 100",
          )
          .bind(ctx.organizationId)
          .all(),
      ]);
    return {
      states: states.results,
      outbox,
      uncertain: unknown.results,
      audit: audit.results,
      controls: controls.results,
      deadLetters: deadLetters.results,
      simulation: this.config.mode === "simulation",
    };
  }
  /** Publishing may happen twice after a crash; claim in processDispatch is the duplicate barrier. */
  async publishOutbox(
    publish: (message: {
      dispatchId: string;
      organizationId: string;
      channel: Channel;
    }) => Promise<void>,
    limit = 50,
  ) {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM (SELECT o.id,o.dispatch_id,o.organization_id,d.channel,row_number() OVER (PARTITION BY o.organization_id ORDER BY o.created_at,o.id) AS organization_rank FROM outbox o JOIN dispatches d ON d.id=o.dispatch_id WHERE o.status='pending') WHERE organization_rank<=5 ORDER BY organization_rank,id LIMIT ?",
      )
      .bind(Math.max(1, Math.min(limit, 100)))
      .all<{
        id: string;
        dispatch_id: string;
        organization_id: string;
        channel: Channel;
      }>();
    let published = 0;
    for (const row of results) {
      await publish({
        dispatchId: row.dispatch_id,
        organizationId: row.organization_id,
        channel: row.channel,
      });
      await this.db
        .prepare(
          "UPDATE outbox SET status='published',published_at=? WHERE id=? AND status='pending'",
        )
        .bind(this.time(), row.id)
        .run();
      published++;
    }
    return { published };
  }
  /** Internal worker entry. A crash after the claim creates uncertainty, never an automatic resubmit. */
  async processDispatch(
    id: string,
    provider: ProviderHook,
  ): Promise<{ processed: boolean; status: DispatchStatus | string }> {
    const now = this.time(),
      attemptId = uid("att"),
      lease = new Date(this.now() + 120_000).toISOString();
    try {
      await this.db.batch([
        this.db
          .prepare(
            "UPDATE dispatches SET status='submitting',provider=?,active_attempt_id=?,lease_until=?,updated_at=? WHERE id=? AND status='queued' AND mode=?",
          )
          .bind(provider.name, attemptId, lease, now, id, this.config.mode),
        this.db
          .prepare(
            "INSERT INTO attempts(id,dispatch_id,organization_id,provider,status,created_at,updated_at) SELECT ?,id,organization_id,?,'started',?,? FROM dispatches WHERE id=? AND active_attempt_id=? AND status='submitting'",
          )
          .bind(attemptId, provider.name, now, now, id, attemptId),
      ]);
    } catch (error) {
      if (!String(error).includes("live_quote_invalid")) throw error;
      await this.db
        .prepare(
          "UPDATE dispatches SET status='failed',updated_at=? WHERE id=? AND mode='production' AND channel IN ('fax','email','postal') AND status='queued'",
        )
        .bind(now, id)
        .run();
      return { processed: true, status: "failed" };
    }
    const row = await this.db
      .prepare("SELECT * FROM dispatches WHERE id=?")
      .bind(id)
      .first<Dispatch>();
    if (!row || row.active_attempt_id !== attemptId)
      return { processed: false, status: row?.status ?? "not_found" };
    const control = await this.db
      .prepare(
        "SELECT enabled FROM channel_controls WHERE organization_id=? AND channel=?",
      )
      .bind(row.organization_id, row.channel)
      .first<{ enabled: number }>();
    const recipient = JSON.parse(row.recipient_json) as { email?: string };
    const suppressed = recipient.email
      ? await this.db
          .prepare(
            "SELECT 1 FROM suppressions WHERE organization_id=? AND email=?",
          )
          .bind(row.organization_id, recipient.email)
          .first()
      : null;
    const senderReady = await this.db
      .prepare(
        "SELECT 1 FROM senders WHERE organization_id=? AND id=? AND status='verified' AND address=? AND mode=?",
      )
      .bind(row.organization_id, row.sender_id, row.sender_address, row.mode)
      .first();
    const documentReady =
      !row.document_id ||
      (await this.db
        .prepare(
          "SELECT 1 FROM documents WHERE organization_id=? AND id=? AND status='ready'",
        )
        .bind(row.organization_id, row.document_id)
        .first());
    if (!control?.enabled || suppressed || !senderReady || !documentReady) {
      await this.rejectAttempt(
        row,
        attemptId,
        suppressed
          ? "RECIPIENT_SUPPRESSED"
          : !senderReady
            ? "SENDER_NOT_CONFIGURED"
            : !documentReady
              ? "DOCUMENT_QUARANTINED"
              : "CHANNEL_DISABLED",
      );
      return { processed: true, status: "failed" };
    }
    if (row.mode === "production" && row.channel === "fax") {
      try {
        if (provider.name !== "telnyx")
          throw new DomainError(
            "LIVE_QUOTE_INVALID",
            "Fournisseur incompatible.",
            409,
          );
        await validateLiveFaxQuote(
          this.db,
          row,
          provider.liveFaxIdentity,
          this.time(),
        );
      } catch {
        await this.rejectAttempt(row, attemptId, "LIVE_QUOTE_INVALID");
        return { processed: true, status: "failed" };
      }
    }
    if (row.mode === "production" && row.channel !== "fax") {
      try {
        if (provider.name !== (row.channel === "email" ? "ses" : "pingen"))
          throw new DomainError(
            "LIVE_QUOTE_INVALID",
            "Fournisseur incompatible.",
            409,
          );
        await validateLiveDeliveryQuote(
          this.db,
          row,
          provider.liveDeliveryIdentity?.[row.channel],
          this.time(),
        );
      } catch {
        await this.rejectAttempt(row, attemptId, "LIVE_QUOTE_INVALID");
        return { processed: true, status: "failed" };
      }
    }
    let result: Awaited<ReturnType<ProviderHook["submit"]>>;
    try {
      result = await provider.submit(row);
    } catch {
      result = {
        status: "submission_unknown",
        errorCode: "TRANSPORT_OUTCOME_UNKNOWN",
      };
    }
    if (result.status === "accepted" && !result.providerId)
      result = {
        status: "submission_unknown",
        errorCode: "PROVIDER_REFERENCE_MISSING",
      };
    const bound = await this.db
      .prepare("SELECT provider_id FROM dispatches WHERE id=?")
      .bind(id)
      .first<{ provider_id: string | null }>();
    if (
      bound?.provider_id &&
      result.providerId &&
      bound.provider_id !== result.providerId
    ) {
      await this.db
        .prepare(
          "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,NULL,?,?,?,?)",
        )
        .bind(
          uid("audit"),
          row.organization_id,
          "provider.reference_conflict",
          id,
          canonicalJson({
            provider: provider.name,
            bound_reference: bound.provider_id,
            response_reference: result.providerId,
          }),
          this.time(),
        )
        .run();
      result = {
        status: "submission_unknown",
        providerId: bound.provider_id,
        errorCode: "PROVIDER_REFERENCE_CONFLICT",
      };
    }
    if (result.status === "rejected") {
      await this.rejectAttempt(
        row,
        attemptId,
        result.errorCode ?? "PROVIDER_REJECTED",
      );
    } else if (result.status === "submission_unknown") {
      await this.db.batch([
        this.db
          .prepare(
            "UPDATE dispatches SET status='submission_unknown',provider_id=COALESCE(provider_id,?),updated_at=?,lease_until=NULL WHERE id=? AND active_attempt_id=? AND status='submitting' AND (provider_id IS NULL OR provider_id=?)",
          )
          .bind(
            result.providerId ?? null,
            this.time(),
            id,
            attemptId,
            result.providerId ?? null,
          ),
        this.db
          .prepare(
            "UPDATE attempts SET status='unknown',provider_id=COALESCE(provider_id,?),error_code=?,updated_at=? WHERE id=? AND status='started'",
          )
          .bind(
            result.providerId ?? null,
            result.errorCode ?? "SUBMISSION_UNKNOWN",
            this.time(),
            attemptId,
          ),
      ]);
      if (result.providerId)
        await this.reconcileOrphans(provider.name, result.providerId);
    } else {
      await this.db.batch([
        this.db
          .prepare(
            "UPDATE dispatches SET provider_id=COALESCE(provider_id,?),status=CASE WHEN status IN ('submitting','submission_unknown') THEN 'accepted' ELSE status END,lease_until=NULL,updated_at=? WHERE id=? AND active_attempt_id=? AND (provider_id IS NULL OR provider_id=?)",
          )
          .bind(
            result.providerId!,
            this.time(),
            id,
            attemptId,
            result.providerId!,
          ),
        this.db
          .prepare(
            "UPDATE attempts SET status='accepted',provider_id=?,updated_at=? WHERE id=?",
          )
          .bind(result.providerId!, this.time(), attemptId),
      ]);
      await this.ingestEvent({
        provider: provider.name,
        eventId: `submission:${attemptId}`,
        providerId: result.providerId,
        dispatchId: id,
        kind: "accepted",
        occurredAt: this.time(),
        payload: {
          source: "submission_response",
          simulation: row.mode === "simulation",
        },
      });
      await this.reconcileOrphans(provider.name, result.providerId!);
    }
    for (const event of result.events ?? []) await this.ingestEvent(event);
    const updated = await this.db
      .prepare("SELECT status FROM dispatches WHERE id=?")
      .bind(id)
      .first<{ status: DispatchStatus }>();
    return { processed: true, status: updated!.status };
  }
  private async rejectAttempt(
    row: Dispatch,
    attemptId: string,
    errorCode: string,
  ) {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE dispatches SET status='failed',lease_until=NULL,updated_at=? WHERE id=? AND active_attempt_id=? AND status='submitting'",
        )
        .bind(this.time(), row.id, attemptId),
      this.db
        .prepare(
          "UPDATE attempts SET status='rejected',error_code=?,updated_at=? WHERE id=? AND status='started'",
        )
        .bind(errorCode.slice(0, 100), this.time(), attemptId),
    ]);
  }
  /** Only call after verification of the provider signature over the original raw body. */
  async ingestEvent(input: ProviderEventInput) {
    if (
      !input.eventId ||
      input.eventId.length > 250 ||
      !input.provider ||
      ![
        "accepted",
        "delivered",
        "failed",
        "bounced",
        "complained",
        "printed",
        "handed_to_post",
      ].includes(input.kind) ||
      !Number.isFinite(Date.parse(input.occurredAt))
    )
      throw new DomainError("INVALID_EVENT", "Événement fournisseur invalide.");
    const eventId = uid("evt");
    await this.db
      .prepare(
        "INSERT INTO provider_events(id,provider,provider_event_id,provider_id,kind,payload_json,occurred_at,received_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(provider,provider_event_id) DO NOTHING",
      )
      .bind(
        eventId,
        input.provider,
        input.eventId,
        input.providerId ?? null,
        input.kind,
        canonicalJson(input.payload ?? {}),
        new Date(input.occurredAt).toISOString(),
        this.time(),
      )
      .run();
    const saved = await this.db
      .prepare(
        "SELECT id,applied_at,provider_id,kind,payload_json FROM provider_events WHERE provider=? AND provider_event_id=?",
      )
      .bind(input.provider, input.eventId)
      .first<{
        id: string;
        applied_at: string | null;
        provider_id: string | null;
        kind: ProviderEventInput["kind"];
        payload_json: string;
      }>();
    if (saved?.applied_at) return { duplicate: true, applied: true };
    input = {
      ...input,
      providerId: saved!.provider_id ?? undefined,
      kind: saved!.kind,
      payload: JSON.parse(saved!.payload_json) as Record<string, unknown>,
    };
    const dispatch = input.providerId
      ? await this.db
          .prepare(
            "SELECT * FROM dispatches WHERE provider=? AND provider_id=?",
          )
          .bind(input.provider, input.providerId)
          .first<Dispatch>()
      : null;
    // A trusted provider client reference may resolve a very early callback, but can never cross a
    // provider identity or overwrite an already bound different remote resource.
    const early =
      !dispatch && input.dispatchId
        ? await this.db
            .prepare(
              "SELECT * FROM dispatches WHERE id=? AND provider=? AND status IN ('submitting','submission_unknown','accepted') AND (provider_id IS NULL OR provider_id=?)",
            )
            .bind(input.dispatchId, input.provider, input.providerId ?? null)
            .first<Dispatch>()
        : null;
    const target = dispatch ?? early;
    if (!target)
      return { duplicate: saved!.id !== eventId, applied: false, orphan: true };
    const applied = await this.applyEvent(
      saved!.id,
      target,
      input.kind,
      input.providerId,
      input.payload,
    );
    return { duplicate: saved!.id !== eventId, applied };
  }
  private async applyEvent(
    eventId: string,
    row: Dispatch,
    kind: ProviderEventInput["kind"],
    providerId?: string,
    payload?: Record<string, unknown>,
  ) {
    const allowed: Record<Channel, string[]> = {
      fax: ["accepted", "delivered", "failed"],
      email: ["accepted", "delivered", "failed", "bounced", "complained"],
      postal: ["accepted", "printed", "handed_to_post", "delivered", "failed"],
    };
    if (!allowed[row.channel].includes(kind)) return false;
    const now = this.time();
    const ranks: Record<string, number> = {
      prepared: 0,
      queued: 0,
      submitting: 10,
      submission_unknown: 10,
      accepted: 20,
      printed: 30,
      // Postal non-delivery can follow handover, but cannot erase proven delivery.
      failed: row.channel === "postal" ? 45 : 35,
      delivered: 50,
      handed_to_post: 40,
      bounced: 55,
      complained: 60,
      cancelled: 100,
    };
    // Monotonic fact projection is guarded in SQL, so reordered concurrent callbacks cannot regress.
    const statuses = Object.entries(ranks)
      .filter(([, rank]) => rank < (ranks[kind] ?? 0))
      .map(([status]) => status);
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          "UPDATE dispatches SET status=CASE WHEN status IN ('submitting','submission_unknown') AND ?<>'failed' THEN 'accepted' ELSE status END,provider_id=COALESCE(provider_id,?),lease_until=NULL,updated_at=? WHERE id=? AND status NOT IN ('prepared','queued','cancelled') AND (provider_id IS NULL OR provider_id=?)",
        )
        .bind(kind, providerId ?? null, now, row.id, providerId ?? null),
      this.db
        .prepare(
          `UPDATE dispatches SET status=?,lease_until=NULL,updated_at=? WHERE id=? AND (provider_id IS NULL OR provider_id=?) AND status IN (${statuses.map(() => "?").join(",")})`,
        )
        .bind(kind, now, row.id, providerId ?? null, ...statuses),
      this.db
        .prepare(
          "UPDATE provider_events SET organization_id=?,dispatch_id=?,applied_at=? WHERE id=? AND applied_at IS NULL AND EXISTS(SELECT 1 FROM dispatches WHERE id=? AND (provider_id IS NULL OR provider_id=?))",
        )
        .bind(
          row.organization_id,
          row.id,
          now,
          eventId,
          row.id,
          providerId ?? null,
        ),
    ];
    if (
      (kind === "complained" ||
        (kind === "bounced" && payload?.bounceType === "Permanent")) &&
      row.channel === "email"
    ) {
      const email = (JSON.parse(row.recipient_json) as { email: string }).email;
      statements.push(
        this.db
          .prepare(
            "INSERT INTO suppressions(organization_id,email,reason,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM dispatches WHERE id=? AND (provider_id IS NULL OR provider_id=?)) ON CONFLICT(organization_id,email) DO UPDATE SET reason=excluded.reason",
          )
          .bind(
            row.organization_id,
            email,
            kind === "complained" ? "complaint" : "hard_bounce",
            now,
            row.id,
            providerId ?? null,
          ),
      );
    }
    await this.db.batch(statements);
    const saved = await this.db
      .prepare("SELECT applied_at FROM provider_events WHERE id=?")
      .bind(eventId)
      .first<{ applied_at: string | null }>();
    return !!saved?.applied_at;
  }
  async reconcileOrphans(provider: string, providerId: string) {
    const row = await this.db
      .prepare("SELECT * FROM dispatches WHERE provider=? AND provider_id=?")
      .bind(provider, providerId)
      .first<Dispatch>();
    if (!row) return { applied: 0 };
    const events = await this.db
      .prepare(
        "SELECT id,kind,payload_json FROM provider_events WHERE provider=? AND provider_id=? AND applied_at IS NULL ORDER BY occurred_at,id LIMIT 100",
      )
      .bind(provider, providerId)
      .all<{
        id: string;
        kind: ProviderEventInput["kind"];
        payload_json: string;
      }>();
    for (const event of events.results)
      await this.applyEvent(
        event.id,
        row,
        event.kind,
        providerId,
        JSON.parse(event.payload_json) as Record<string, unknown>,
      );
    return { applied: events.results.length };
  }
  async reconcileExpiredLeases(limit = 100) {
    const rows = await this.db
      .prepare(
        "SELECT id,active_attempt_id FROM dispatches WHERE status='submitting' AND lease_until<? ORDER BY lease_until,id LIMIT ?",
      )
      .bind(this.time(), Math.max(1, Math.min(limit, 100)))
      .all<{ id: string; active_attempt_id: string }>();
    for (const row of rows.results)
      await this.db.batch([
        this.db
          .prepare(
            "UPDATE dispatches SET status='submission_unknown',lease_until=NULL,updated_at=? WHERE id=? AND status='submitting' AND lease_until<?",
          )
          .bind(this.time(), row.id, this.time()),
        this.db
          .prepare(
            "UPDATE attempts SET status='unknown',error_code='LEASE_EXPIRED_RECONCILIATION_REQUIRED',updated_at=? WHERE id=? AND status='started'",
          )
          .bind(this.time(), row.active_attempt_id),
      ]);
    return { uncertain: rows.results.length };
  }
  async suppressRecipient(
    ctx: ActorContext,
    email: string,
    reason: "hard_bounce" | "complaint" | "unsubscribe",
  ) {
    writable(ctx);
    await this.organization(ctx);
    const normalized = validateRecipient("email", { email }).email;
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO suppressions(organization_id,email,reason,created_at) VALUES(?,?,?,?) ON CONFLICT(organization_id,email) DO UPDATE SET reason=excluded.reason",
        )
        .bind(ctx.organizationId, normalized, reason, this.time()),
      this.audit(ctx, "recipient.suppressed", "redacted", { reason }),
    ]);
  }
}

/** Deterministic, explicitly labelled simulator. No network access or physical transport. */
export function simulationProvider(
  channel: Channel,
  options: {
    outcome?: "success" | "rejected" | "unknown";
    now?: () => number;
  } = {},
): ProviderHook {
  const provider = `simulation:${channel}`;
  return {
    name: provider,
    submit: async (dispatch) => {
      if (dispatch.mode !== "simulation")
        throw new DomainError(
          "SIMULATION_FORBIDDEN",
          "Simulation interdite pour une organisation de production.",
          403,
        );
      if (options.outcome === "unknown")
        return {
          status: "submission_unknown",
          errorCode: "SIMULATED_RESPONSE_LOSS",
        };
      if (options.outcome === "rejected")
        return { status: "rejected", errorCode: "SIMULATED_REJECTION" };
      const providerId = `sim_${dispatch.id}`;
      const occurredAt = new Date((options.now ?? Date.now)()).toISOString();
      const kind = channel === "postal" ? "handed_to_post" : "delivered";
      return {
        status: "accepted",
        providerId,
        events: [
          {
            provider,
            eventId: `${providerId}:${kind}`,
            providerId,
            dispatchId: dispatch.id,
            kind,
            occurredAt,
            payload: {
              simulation: true,
              result:
                channel === "postal"
                  ? "Remise à la poste simulée, aucune lettre expédiée."
                  : "Transmission simulée, aucun message envoyé.",
            },
          },
        ],
      };
    },
  };
}
