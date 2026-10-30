import { z } from "zod";
import {
  secureDistributionInputSchema,
  securePolicySchema,
  secureDistributionQuote,
  SECURE_DISTRIBUTION_PRICE_VERSION,
  SECURE_DISTRIBUTION_LIMITS,
  type SecureDistributionInput,
  type SecureDistributionDescriptor,
  type SecureDistributionView,
  type SecureAuditEvent,
} from "../../../packages/contracts/src/secure-distribution";
import {
  reviewPagesSchema,
  type ReviewPages,
} from "../../../packages/contracts/src/expert-review";
import {
  DomainError,
  actorPermissions,
  membershipPermissionFence,
  canonicalJson,
  type ActorContext,
  type DomainService,
  type DocumentRecord,
  type Dispatch,
} from "../../../packages/domain/src/index";
import type { Env } from "./env";
import {
  putSecureObject,
  secureSha256,
  sealSecureSecret,
  openSecureSecret,
} from "./secure-storage";
import {
  requirePersonalDocumentAuthentication,
  type PersonalPrincipal,
} from "./personal-auth";
import { personalSessionFence } from "./sensitive-session";
import type { PostalAuthority } from "./postal-authority";
import {
  assertNoDocumentUrlPlaceholder,
  cleanEmailHtml,
  htmlToText,
  safeHeader,
} from "../../../packages/contracts/src/content";
import {
  defaultLocale,
  normalizeLocale,
  type SupportedLocale,
} from "../../../packages/contracts/src/locale";
import {
  accountEmailInstructions,
  documentEmailDefaults,
  renderAccountEmailFooter,
  renderTransactionalEmail,
  transactionalEmailText,
} from "../../../packages/contracts/src/email-template";
import { deliveryText } from "../../../packages/contracts/src/delivery-messages";
import { startObservation } from "../../../packages/observability/src/index";

type StoredInvitation = SecureDistributionInput & {
  subject: string;
  message: string;
  notificationLocale: SupportedLocale;
  workspaceName: string;
};

export type SecurePreparationAuthority =
  | {
      kind: "oauth";
      connectionId: string;
      authorizationRevision: number;
      expiresAt: number;
    }
  | { kind: "development"; tokenHash: string; expiresAt: number }
  | { kind: "browser"; sessionHash: string };

export interface SecureDistributionRow {
  id: string;
  organization_id: string;
  source_id: string;
  source_sha256: string;
  source_name: string;
  source_pages: number;
  created_by: string;
  request_key: string;
  request_hash: string;
  recipient_address: string;
  recipient_name: string;
  recipient_user_id: string | null;
  claimed_at: string | null;
  bound_at: string | null;
  token_hash: string;
  sealed_token: string;
  policy_json: string;
  quote_json: string;
  input_json: string;
  service_fee_minor: number;
  price_version: string;
  status: SecureDistributionView["status"];
  dispatch_id: string | null;
  manifest_sha256: string | null;
  original_key: string | null;
  created_at: string;
  prepared_expires_at: string;
  activated_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  error_code: string | null;
  next_page: number;
  lease_token: string | null;
  lease_expires_at: string | null;
  preparation_authority_json: string | null;
}
export interface SecurePageRow {
  page_number: number;
  image_key: string;
  image_sha256: string;
  text_key: string;
  text_sha256: string;
  width: number;
  height: number;
}
const now = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const plus = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86400000).toISOString();
const unavailable = () =>
  new DomainError("NOT_FOUND", "Document unavailable.", 404);
function renewalInput(
  row: SecureDistributionRow,
  dispatch: Pick<Dispatch, "sender_id" | "ceiling_minor">,
) {
  const { workspaceName: _workspaceName, ...stored } = JSON.parse(
    row.input_json,
  ) as StoredInvitation;
  const policy = securePolicySchema.parse(JSON.parse(row.policy_json));
  return secureDistributionInputSchema.parse({
    ...stored,
    ...policy,
    recipientBinding: policy.recipientBinding ?? "independent",
    documentId: row.source_id,
    recipient: {
      address: row.recipient_address,
      ...(row.recipient_name ? { name: row.recipient_name } : {}),
    },
    senderId: dispatch.sender_id ?? undefined,
    costCeilingMinor: dispatch.ceiling_minor,
  });
}
export function secureDistributionAvailable(env: Env) {
  return (
    (env.ENVIRONMENT === "local" && env.MODE === "simulation") ||
    (env.SECURE_DISTRIBUTION_ENABLED === "true" &&
      Boolean(env.SECURE_DOCUMENTS_KEY || env.SECURE_DOCUMENTS_KEYS) &&
      Boolean(env.DOCUMENT_RENDERER))
  );
}
function requestKey(key: string) {
  if (!key || key.length > 200 || /[\r\n\0]/.test(key))
    throw new DomainError(
      "INVALID_IDEMPOTENCY_KEY",
      "An idempotency key is required.",
    );
  return key;
}
export function secureSharedBinding(
  row: Pick<SecureDistributionRow, "organization_id" | "id">,
  suffix: string,
) {
  return `shared:${row.organization_id}:${row.id}:${suffix}`;
}
export async function secureEvent(
  db: D1Database,
  input: {
    organizationId?: string;
    distributionId?: string;
    personalDocumentId?: string;
    userId?: string;
    sessionHash?: string;
    type: string;
    page?: number;
    provenance?: "server" | "browser" | "provider";
    eventId?: string;
  },
) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO secure_document_events(id,organization_id,distribution_id,personal_document_id,user_id,session_hash,type,provenance,page_number,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      input.eventId ?? id("sev"),
      input.organizationId ?? null,
      input.distributionId ?? null,
      input.personalDocumentId ?? null,
      input.userId ?? null,
      input.sessionHash ?? null,
      input.type,
      input.provenance ?? "server",
      input.page ?? null,
      now(),
    )
    .run();
}
export async function secureAudit(
  db: D1Database,
  organizationId: string,
  distributionId: string,
): Promise<SecureAuditEvent[]> {
  const rows = await db
    .prepare(
      "SELECT id,type,created_at,provenance,page_number FROM secure_document_events WHERE organization_id=? AND distribution_id=? ORDER BY created_at DESC,id DESC LIMIT 100",
    )
    .bind(organizationId, distributionId)
    .all<{
      id: string;
      type: string;
      created_at: string;
      provenance: SecureAuditEvent["provenance"];
      page_number: number | null;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    provenance: row.provenance,
    ...(row.page_number ? { page: row.page_number } : {}),
  }));
}

export class SecureDistributionService {
  constructor(
    public readonly env: Env,
    public readonly domain: DomainService,
    private readonly authority?: PostalAuthority,
    private readonly preparationAuthority?: SecurePreparationAuthority,
  ) {}
  private permissionFence(
    ctx: ActorContext,
    permission: "prepareDispatches" | "approveDispatches",
  ) {
    const membership = membershipPermissionFence(ctx, permission),
      credential = this.authority?.sql();
    return credential
      ? {
          condition: `(${membership.condition}) AND (${credential.condition})`,
          values: [...membership.values, ...credential.values],
        }
      : membership;
  }
  private async member(
    ctx: ActorContext,
    permission?: "prepareDispatches" | "approveDispatches",
  ) {
    if (ctx.actor === "mcp" && !this.authority)
      throw new DomainError(
        "FORBIDDEN",
        "Current OAuth authorization is required.",
        403,
      );
    await this.authority?.assertCurrent();
    if (permission && !actorPermissions(ctx)[permission])
      throw new DomainError(
        "FORBIDDEN",
        "Your role does not permit this operation.",
        403,
      );
    const row = await this.env.DB.prepare(
      "SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=? AND m.role=? AND m.supervisor_can_approve=? AND m.supervisor_can_report=? AND o.mode=? AND (?=0 OR (m.role='admin' OR (m.role='supervisor' AND m.supervisor_can_approve=1)))",
    )
      .bind(
        ctx.organizationId,
        ctx.userId,
        ctx.role,
        Number(ctx.supervisorCanApprove ?? false),
        Number(ctx.supervisorCanReport ?? false),
        this.env.MODE,
        Number(permission === "approveDispatches"),
      )
      .first();
    if (!row)
      throw new DomainError("FORBIDDEN", "Your access has changed.", 403);
  }
  async row(ctx: ActorContext, distributionId: string) {
    await this.member(ctx);
    const authority = this.authority?.sql();
    const row = await this.env.DB.prepare(
      `SELECT s.* FROM secure_distributions s JOIN memberships current_member ON current_member.organization_id=s.organization_id AND current_member.user_id=? WHERE s.organization_id=? AND s.id=? AND current_member.role=? AND current_member.supervisor_can_approve=? AND current_member.supervisor_can_report=? AND (s.created_by=? OR current_member.role='admin' OR (current_member.role='supervisor' AND current_member.supervisor_can_approve=1)) ${authority ? `AND (${authority.condition})` : ""}`,
    )
      .bind(
        ctx.userId,
        ctx.organizationId,
        distributionId,
        ctx.role,
        Number(ctx.supervisorCanApprove ?? false),
        Number(ctx.supervisorCanReport ?? false),
        ctx.userId,
        ...(authority?.values ?? []),
      )
      .first<SecureDistributionRow>();
    if (!row) throw unavailable();
    return row;
  }
  async get(
    ctx: ActorContext,
    distributionId: string,
    includeAudit = true,
  ): Promise<SecureDistributionView> {
    const row = await this.row(ctx, distributionId);
    const dispatch = row.dispatch_id
      ? await this.domain.getDispatch(ctx, row.dispatch_id)
      : null;
    const claimant =
      row.recipient_user_id && !row.bound_at
        ? await this.env.DB.prepare("SELECT name,email FROM users WHERE id=?")
            .bind(row.recipient_user_id)
            .first<{ name: string; email: string }>()
        : null;
    const expired = row.status === "active" && row.expires_at! <= now();
    const [renewal, audit] = await Promise.all([
      includeAudit &&
      ctx.actor === "browser" &&
      row.status === "prepared" &&
      dispatch
        ? this.env.DB.prepare(
            "SELECT (SELECT id FROM secure_distributions WHERE organization_id=? AND request_key=? AND request_hash=?) AS replacement_id,EXISTS(SELECT 1 FROM secure_document_events WHERE organization_id=? AND distribution_id=? AND id=? AND type='quote_renewal_started') AS started",
          )
            .bind(
              ctx.organizationId,
              `secure-renew:${row.id}`,
              await secureSha256(
                canonicalJson(renewalInput(row, dispatch.dispatch)),
              ),
              ctx.organizationId,
              row.id,
              `secure_quote_renewal_${row.id}`,
            )
            .first<{ replacement_id: string | null; started: number }>()
        : null,
      includeAudit
        ? this.events(ctx, row.id, { limit: 100 })
        : { items: [], nextCursor: null },
    ]);
    return {
      id: row.id,
      dispatchId: row.dispatch_id,
      recipientFeedback: dispatch?.dispatch.recipient_feedback ?? null,
      status: expired
        ? "expired"
        : row.status === "prepared" && !row.dispatch_id
          ? "preparing"
          : row.status,
      title: row.source_name,
      source: {
        id: row.source_id,
        name: row.source_name,
        pages: row.source_pages,
        sha256: row.source_sha256,
      },
      recipient: {
        address: row.recipient_address,
        ...(row.recipient_name ? { name: row.recipient_name } : {}),
      },
      invitation: {
        subject: (JSON.parse(row.input_json) as StoredInvitation).subject,
        message: (JSON.parse(row.input_json) as StoredInvitation).message,
        ...(includeAudit && ctx.actor === "browser" && dispatch?.dispatch.html
          ? { html: dispatch.dispatch.html }
          : {}),
      },
      policy: JSON.parse(row.policy_json),
      quote: JSON.parse(row.quote_json),
      expiresAt: row.expires_at,
      approvalUrl: row.dispatch_id
        ? `${this.env.APP_ORIGIN}/#/app/secure-distribution/${row.id}`
        : null,
      recipientUserId: row.recipient_user_id,
      recipientBinding: row.bound_at ? "confirmed" : "pending",
      approved: Boolean(dispatch?.approval),
      ...(renewal && dispatch
        ? {
            renewal: {
              expiresAt: dispatch.dispatch.quote_expires_at ?? null,
              replacementId: renewal.started ? renewal.replacement_id : null,
              available:
                actorPermissions(ctx).approveDispatches &&
                (dispatch.dispatch.status === "prepared" ||
                  (dispatch.dispatch.status === "cancelled" &&
                    Boolean(renewal.started))),
            },
          }
        : {}),
      approval: dispatch?.approval
        ? {
            fingerprint: dispatch.approval.fingerprint,
            expiresAt: dispatch.approval.expires_at,
          }
        : null,
      pendingClaim: claimant
        ? {
            recipientUserId: row.recipient_user_id!,
            name: claimant.name,
            email: claimant.email,
            createdAt: row.claimed_at!,
          }
        : null,
      audit: audit.items,
      auditNextCursor: audit.nextCursor,
    };
  }
  async list(
    ctx: ActorContext,
    query: { cursor?: string; limit?: number } = {},
  ) {
    await this.member(ctx);
    const limit = Math.min(50, Math.max(1, query.limit ?? 30));
    const cursorSchema = z.object({ createdAt: z.string(), id: z.string() });
    let cursor: ReturnType<typeof cursorSchema.safeParse> | null = null;
    try {
      cursor = query.cursor
        ? cursorSchema.safeParse(JSON.parse(atob(query.cursor)))
        : null;
    } catch {
      throw new DomainError("INVALID_CURSOR", "Invalid cursor.");
    }
    if (cursor && !cursor.success)
      throw new DomainError("INVALID_CURSOR", "Invalid cursor.");
    const after = cursor?.success ? cursor.data : null;
    const rows = await this.env.DB.prepare(
      `SELECT id,created_at FROM secure_distributions WHERE organization_id=? AND (created_by=? OR ?=1)
      ${after ? "AND (created_at<? OR (created_at=? AND id<?))" : ""} ORDER BY created_at DESC,id DESC LIMIT ?`,
    )
      .bind(
        ctx.organizationId,
        ctx.userId,
        Number(actorPermissions(ctx).approveDispatches),
        ...(after ? [after.createdAt, after.createdAt, after.id] : []),
        limit + 1,
      )
      .all<{ id: string; created_at: string }>();
    const items = await Promise.all(
      rows.results.slice(0, limit).map((row) => this.get(ctx, row.id, false)),
    );
    const last = rows.results.slice(0, limit).at(-1);
    return {
      items,
      nextCursor:
        rows.results.length > limit && last
          ? btoa(JSON.stringify({ createdAt: last.created_at, id: last.id }))
          : null,
    };
  }
  async events(
    ctx: ActorContext,
    distributionId: string,
    query: { cursor?: string; limit?: number } = {},
  ) {
    await this.row(ctx, distributionId);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    let after: { createdAt: string; id: string } | null = null;
    if (query.cursor)
      try {
        after = JSON.parse(atob(query.cursor));
        if (
          !after ||
          typeof after.createdAt !== "string" ||
          typeof after.id !== "string"
        )
          throw new Error();
      } catch {
        throw new DomainError("INVALID_CURSOR", "Invalid cursor.");
      }
    const rows = await this.env.DB.prepare(
      `SELECT id,type,created_at,provenance,page_number,user_id,(SELECT name FROM users WHERE users.id=secure_document_events.user_id) AS actor_name FROM secure_document_events WHERE organization_id=? AND distribution_id=? ${after ? "AND (created_at<? OR (created_at=? AND id<?))" : ""} ORDER BY created_at DESC,id DESC LIMIT ?`,
    )
      .bind(
        ctx.organizationId,
        distributionId,
        ...(after ? [after.createdAt, after.createdAt, after.id] : []),
        limit + 1,
      )
      .all<{
        id: string;
        type: string;
        created_at: string;
        provenance: SecureAuditEvent["provenance"];
        page_number: number | null;
        user_id: string | null;
        actor_name: string | null;
      }>();
    const slice = rows.results.slice(0, limit),
      last = slice.at(-1);
    return {
      items: slice.map((event) => ({
        id: event.id,
        type: event.type,
        createdAt: event.created_at,
        provenance: event.provenance,
        ...(event.page_number ? { page: event.page_number } : {}),
        ...(event.user_id ? { actorUserId: event.user_id } : {}),
        ...(event.actor_name ? { actorName: event.actor_name } : {}),
      })),
      nextCursor:
        rows.results.length > limit && last
          ? btoa(JSON.stringify({ createdAt: last.created_at, id: last.id }))
          : null,
    };
  }
  private async assertSourceCanBecomeSensitive(
    ctx: ActorContext,
    sourceId: string,
  ) {
    const exposure = await this.env.DB.prepare(
      `SELECT
      EXISTS(SELECT 1 FROM protected_document_hostings WHERE organization_id=? AND document_id=? AND status IN ('draft','active') AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS hosting,
      EXISTS(SELECT 1 FROM postal_address_pages WHERE organization_id=? AND source_document_id=?) AS derived,
      (EXISTS(SELECT 1 FROM postal_preflights WHERE organization_id=? AND document_id=?) OR
       EXISTS(SELECT 1 FROM dispatches WHERE organization_id=? AND document_id=?) OR
       EXISTS(SELECT 1 FROM provider_drafts WHERE organization_id=? AND document_id=?)) AS outbound`,
    )
      .bind(
        ctx.organizationId,
        sourceId,
        ctx.organizationId,
        sourceId,
        ctx.organizationId,
        sourceId,
        ctx.organizationId,
        sourceId,
        ctx.organizationId,
        sourceId,
      )
      .first<{ hosting: number; derived: number; outbound: number }>();
    if (exposure?.hosting)
      throw new DomainError(
        "SECURE_SOURCE_LEGACY_LINK",
        "Revoke the existing protected link before preparing a sensitive distribution of this document.",
        409,
      );
    if (exposure?.derived)
      throw new DomainError(
        "SECURE_SOURCE_LEGACY_DERIVATION",
        "This document has a derived postal preparation. Choose a document dedicated to sensitive distribution.",
        409,
      );
    if (exposure?.outbound)
      throw new DomainError(
        "SECURE_SOURCE_LEGACY_OUTBOUND",
        "This document is already used in another dispatch workflow. Choose a document dedicated to sensitive distribution.",
        409,
      );
  }
  async prepare(
    ctx: ActorContext,
    raw: SecureDistributionInput,
    key: string,
  ): Promise<SecureDistributionView> {
    if (!secureDistributionAvailable(this.env))
      throw new DomainError(
        "SECURE_DISTRIBUTION_NOT_CONFIGURED",
        "Secure distribution is not enabled.",
        409,
      );
    await this.member(ctx, "prepareDispatches");
    requestKey(key);
    const input = secureDistributionInputSchema.parse(raw);
    input.recipient.address = input.recipient.address.toLowerCase();
    const requestHash = await secureSha256(canonicalJson(input));
    const existing = await this.env.DB.prepare(
      "SELECT id,request_hash,policy_json FROM secure_distributions WHERE organization_id=? AND request_key=?",
    )
      .bind(ctx.organizationId, key)
      .first<{ id: string; request_hash: string; policy_json: string }>();
    if (existing) {
      const legacyHash =
        !JSON.parse(existing.policy_json).recipientBinding &&
        !input.recipientBinding &&
        input.html === undefined
          ? await secureSha256(
              canonicalJson({
                ...input,
                subject:
                  input.subject?.trim() ?? "A document is available in Guteneo",
                message:
                  input.message?.trim() ??
                  "A document has been addressed to you in your Guteneo space.",
                notificationLocale: input.notificationLocale ?? "fr",
              }),
            )
          : null;
      if (
        existing.request_hash !== requestHash &&
        existing.request_hash !== legacyHash
      )
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "This key belongs to another distribution.",
          409,
        );
      return this.get(ctx, existing.id);
    }
    assertNoDocumentUrlPlaceholder(input.subject ?? "");
    assertNoDocumentUrlPlaceholder(input.message ?? "");
    const customHtml = input.html?.trim()
      ? cleanEmailHtml(input.html, { allowDocumentUrlPlaceholder: true }).html
      : undefined;
    if (customHtml !== undefined && !htmlToText(customHtml).trim())
      throw new DomainError(
        "INVALID_EMAIL_CONTENT",
        "Custom HTML must contain readable message content.",
      );
    const sender = await this.env.DB.prepare(
      "SELECT o.name,u.preferred_locale FROM organizations o JOIN memberships m ON m.organization_id=o.id JOIN users u ON u.id=m.user_id WHERE o.id=? AND u.id=?",
    )
      .bind(ctx.organizationId, ctx.userId)
      .first<{ name: string; preferred_locale: string | null }>();
    if (!sender) throw unavailable();
    const locale =
      input.notificationLocale ??
      normalizeLocale(sender.preferred_locale) ??
      defaultLocale;
    const defaults = documentEmailDefaults(sender.name, "my_documents", locale);
    const invitation: StoredInvitation = {
      ...input,
      subject: safeHeader(
        input.subject?.trim() ? input.subject : defaults.subject,
      ),
      message: input.message?.trim()
        ? input.message
        : customHtml
          ? htmlToText(customHtml)
          : defaults.text,
      ...(customHtml ? { html: customHtml } : {}),
      notificationLocale: locale,
      workspaceName: sender.name,
    };
    if (
      await this.env.DB.prepare(
        "SELECT 1 FROM suppressions WHERE organization_id=? AND email=?",
      )
        .bind(ctx.organizationId, input.recipient.address)
        .first()
    )
      throw new DomainError(
        "RECIPIENT_SUPPRESSED",
        "This recipient is blocked for this organisation.",
        409,
      );
    const source = await this.domain.getDocument(ctx, input.documentId);
    if (
      source.status !== "ready" ||
      source.size > SECURE_DISTRIBUTION_LIMITS.pdfBytes ||
      source.pages < 1 ||
      source.pages > SECURE_DISTRIBUTION_LIMITS.pages
    )
      throw new DomainError(
        "DOCUMENT_NOT_READY",
        "Choose a scanned PDF with no more than 100 pages and 10 MiB.",
        409,
      );
    await this.assertSourceCanBecomeSensitive(ctx, source.id);
    const policy = securePolicySchema.parse({
      retentionDays: input.retentionDays,
      allowOriginalDownload: input.allowOriginalDownload,
      allowVaultDeposit: input.allowVaultDeposit,
      personalRetentionDays: input.personalRetentionDays,
      recipientBinding: input.recipientBinding ?? "verified_email",
    });
    const quote = secureDistributionQuote(policy);
    if (
      input.costCeilingMinor !== undefined &&
      input.costCeilingMinor < quote.totalMinor
    )
      throw new DomainError(
        "INVALID_CEILING",
        "The ceiling must cover the retention price.",
      );
    const distributionId = id("sd"),
      createdAt = now();
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const fence = this.permissionFence(ctx, "prepareDispatches");
    const preparationAuthority =
      this.preparationAuthority ??
      (ctx.documentSessionHash
        ? { kind: "browser" as const, sessionHash: ctx.documentSessionHash }
        : null);
    if (ctx.actor === "mcp" && !preparationAuthority)
      throw new DomainError(
        "FORBIDDEN",
        "Current authorization is required.",
        403,
      );
    let inserted: { id: string } | null;
    try {
      inserted = await this.env.DB.prepare(
        `INSERT INTO secure_distributions(
      id,organization_id,source_id,source_sha256,source_name,source_pages,created_by,request_key,request_hash,
      recipient_address,recipient_name,token_hash,sealed_token,policy_json,quote_json,input_json,service_fee_minor,price_version,status,created_at,prepared_expires_at,preparation_authority_json)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'preparing',?,?,? WHERE ${fence.condition}
      AND (SELECT count(*) FROM secure_distributions WHERE organization_id=? AND created_at>=?)<100
      ON CONFLICT(organization_id,request_key) DO NOTHING RETURNING id`,
      )
        .bind(
          distributionId,
          ctx.organizationId,
          source.id,
          source.sha256,
          source.name,
          source.pages,
          ctx.userId,
          key,
          requestHash,
          input.recipient.address,
          input.recipient.name ?? "",
          await secureSha256(token),
          await sealSecureSecret(
            this.env,
            `${ctx.organizationId}:${distributionId}`,
            token,
          ),
          canonicalJson(policy),
          JSON.stringify(quote),
          JSON.stringify(invitation),
          quote.sharedMinor + quote.personalMinor,
          SECURE_DISTRIBUTION_PRICE_VERSION,
          createdAt,
          plus(createdAt, 1),
          preparationAuthority ? JSON.stringify(preparationAuthority) : null,
          ...fence.values,
          ctx.organizationId,
          createdAt.slice(0, 10),
        )
        .first<{ id: string }>();
    } catch (error) {
      // The database guard closes the race with legacy hosting/derivation writes.
      // Project its current cause without returning SQL or recipient information.
      await this.assertSourceCanBecomeSensitive(ctx, source.id);
      throw error;
    }
    if (!inserted) {
      const raced = await this.env.DB.prepare(
        "SELECT id,request_hash FROM secure_distributions WHERE organization_id=? AND request_key=?",
      )
        .bind(ctx.organizationId, key)
        .first<{ id: string; request_hash: string }>();
      if (raced?.request_hash === requestHash) return this.get(ctx, raced.id);
      throw new DomainError(
        "SECURE_DISTRIBUTION_LIMIT",
        "The daily preparation limit has been reached or your permissions have changed.",
        429,
      );
    }
    await secureEvent(this.env.DB, {
      organizationId: ctx.organizationId,
      distributionId,
      userId: ctx.userId,
      type: "preparation_started",
    });
    await this.env.DISPATCH_QUEUE.send({
      dispatchId: `secure_render:${distributionId}`,
    });
    return this.get(ctx, distributionId);
  }
  private async exactSource(row: SecureDistributionRow) {
    const source = await this.env.DB.prepare(
      "SELECT * FROM documents WHERE organization_id=? AND id=? AND status='ready' AND sha256=?",
    )
      .bind(row.organization_id, row.source_id, row.source_sha256)
      .first<DocumentRecord>();
    if (!source)
      throw new DomainError(
        "DOCUMENT_UNAVAILABLE",
        "The source document is no longer available.",
        409,
      );
    if (
      !(this.env.ENVIRONMENT === "local" && this.env.MODE === "simulation") &&
      !(await this.env.DB.prepare(
        "SELECT 1 FROM audit_log WHERE organization_id=? AND resource_id=? AND action='document.scan_verified'",
      )
        .bind(row.organization_id, row.source_sha256)
        .first())
    )
      throw new DomainError(
        "DOCUMENT_SCAN_REQUIRED",
        "The document scan must be qualified.",
        409,
      );
    const object = await this.env.DOCUMENTS.get(source.storage_key);
    if (
      !object ||
      object.size !== source.size ||
      source.size > SECURE_DISTRIBUTION_LIMITS.pdfBytes
    )
      throw unavailable();
    const bytes = new Uint8Array(await object.arrayBuffer());
    if ((await secureSha256(bytes)) !== row.source_sha256)
      throw new DomainError(
        "DOCUMENT_INTEGRITY_ERROR",
        "The source document has changed.",
        423,
      );
    return { source, bytes };
  }
  async processRender(distributionId: string) {
    const incomplete = await this.env.DB.prepare(
      "SELECT 1 FROM secure_distributions WHERE id=? AND status='prepared' AND dispatch_id IS NULL AND prepared_expires_at>?",
    )
      .bind(distributionId, now())
      .first();
    if (incomplete) {
      await this.finishPreparation(distributionId);
      return;
    }
    const lease = id("lease"),
      time = now();
    const row = await this.env.DB.prepare(
      `UPDATE secure_distributions SET lease_token=?,lease_expires_at=?
      WHERE id=? AND status='preparing' AND prepared_expires_at>? AND (lease_expires_at IS NULL OR lease_expires_at<?) RETURNING *`,
    )
      .bind(
        lease,
        new Date(Date.now() + 60000).toISOString(),
        distributionId,
        time,
        time,
      )
      .first<SecureDistributionRow>();
    if (!row) return;
    try {
      await this.assertPreparationAuthority(row);
      const membership = await this.env.DB.prepare(
        "SELECT role,supervisor_can_approve,supervisor_can_report FROM memberships WHERE organization_id=? AND user_id=? AND role IN ('admin','supervisor','member')",
      )
        .bind(row.organization_id, row.created_by)
        .first<{
          role: ActorContext["role"];
          supervisor_can_approve: number;
          supervisor_can_report: number;
        }>();
      if (!membership)
        throw new DomainError(
          "PREPARATION_ACCESS_REVOKED",
          "The preparation has lost its authorization.",
          409,
        );
      const { bytes } = await this.exactSource(row);
      const originalKey = `secure/shared/${row.organization_id}/${row.id}/original.bin`;
      if (!row.original_key) {
        await putSecureObject(
          this.env,
          originalKey,
          secureSharedBinding(row, "original"),
          bytes,
          "application/pdf",
        );
        await this.env.DB.prepare(
          "UPDATE secure_distributions SET original_key=? WHERE organization_id=? AND id=? AND status='preparing' AND lease_token=?",
        )
          .bind(originalKey, row.organization_id, row.id, lease)
          .run();
      }
      const count = Math.min(3, row.source_pages - row.next_page + 1);
      if (count > 0) {
        const target = `https://guteneo-documents.invalid/secure-pages?startPage=${row.next_page}&pageCount=${count}`;
        const request = new Request(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/pdf",
            "X-Guteneo-Source-Sha256": row.source_sha256,
            "X-Guteneo-Scan-Sha256": row.source_sha256,
            "X-Guteneo-Watermark": row.id,
          },
          body: new Uint8Array(bytes).buffer,
          signal: AbortSignal.timeout(30000),
        });
        const response = this.env.DOCUMENT_RENDERER
          ? await this.env.DOCUMENT_RENDERER.fetch(request)
          : this.env.ENVIRONMENT === "local" &&
              this.env.MODE === "simulation" &&
              this.env.DOCUMENT_RENDERER_URL
            ? await fetch(
                new Request(
                  `${this.env.DOCUMENT_RENDERER_URL}/secure-pages?startPage=${row.next_page}&pageCount=${count}`,
                  request,
                ),
              )
            : null;
        if (!response?.ok)
          throw new DomainError(
            "SECURE_RENDER_FAILED",
            "This PDF cannot be prepared for secure viewing.",
            422,
          );
        const body = await response.text();
        if (body.length > 1536 * 1024)
          throw new DomainError(
            "SECURE_RENDER_SIZE",
            "The rendered output exceeds the limit.",
            413,
          );
        const report = reviewPagesSchema.parse(JSON.parse(body));
        if (
          report.sha256 !== row.source_sha256 ||
          report.totalPages !== row.source_pages ||
          report.startPage !== row.next_page ||
          report.pages.length !== count
        )
          throw new DomainError(
            "SECURE_RENDER_INTEGRITY",
            "The rendered output does not match the document.",
            423,
          );
        await this.persistPages(row, report, lease);
      }
      const nextPage = row.next_page + count;
      await this.env.DB.prepare(
        "UPDATE secure_distributions SET next_page=?,lease_token=NULL,lease_expires_at=NULL WHERE organization_id=? AND id=? AND status='preparing' AND lease_token=?",
      )
        .bind(nextPage, row.organization_id, row.id, lease)
        .run();
      if (nextPage <= row.source_pages)
        await this.env.DISPATCH_QUEUE.send({
          dispatchId: `secure_render:${row.id}`,
        });
      else await this.finishPreparation(row.id);
    } catch (error) {
      const code =
        error instanceof DomainError ? error.code : "SECURE_PREPARATION_FAILED";
      const failed = await this.env.DB.prepare(
        "UPDATE secure_distributions SET status='failed',error_code=?,lease_token=NULL,lease_expires_at=NULL WHERE organization_id=? AND id=? AND (status='preparing' OR (status='prepared' AND dispatch_id IS NULL)) AND (lease_token=? OR lease_token IS NULL)",
      )
        .bind(code, row.organization_id, row.id, lease)
        .run();
      if (failed.meta.changes === 1) this.observePreparationFailure();
      await secureEvent(this.env.DB, {
        organizationId: row.organization_id,
        distributionId: row.id,
        type: "preparation_failed",
      });
    }
  }
  private async persistPages(
    row: SecureDistributionRow,
    report: ReviewPages,
    lease: string,
  ) {
    for (const page of report.pages) {
      if (page.textTruncated)
        throw new DomainError(
          "SECURE_TEXT_UNSUPPORTED",
          "The text layer is too large.",
          422,
        );
      const image = Uint8Array.from(atob(page.imageBase64), (char) =>
        char.charCodeAt(0),
      );
      if ((await secureSha256(image)) !== page.imageSha256)
        throw new DomainError(
          "SECURE_RENDER_INTEGRITY",
          "The rendered output has changed.",
          423,
        );
      const prefix = `secure/shared/${row.organization_id}/${row.id}/${page.page}`;
      const imageKey = `${prefix}.image`,
        textKey = `${prefix}.text`;
      const text = new TextEncoder().encode(page.text);
      const [imageProof, textProof] = await Promise.all([
        putSecureObject(
          this.env,
          imageKey,
          secureSharedBinding(row, `page:${page.page}:image`),
          image,
          "image/jpeg",
        ),
        putSecureObject(
          this.env,
          textKey,
          secureSharedBinding(row, `page:${page.page}:text`),
          text,
          "text/plain;charset=utf-8",
        ),
      ]);
      await this.env.DB.prepare(
        `INSERT INTO secure_distribution_pages(organization_id,distribution_id,page_number,image_key,image_sha256,text_key,text_sha256,width,height,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM secure_distributions WHERE organization_id=? AND id=? AND status='preparing' AND lease_token=?)
        ON CONFLICT(organization_id,distribution_id,page_number) DO NOTHING`,
      )
        .bind(
          row.organization_id,
          row.id,
          page.page,
          imageKey,
          imageProof.sha256,
          textKey,
          textProof.sha256,
          page.width,
          page.height,
          now(),
          row.organization_id,
          row.id,
          lease,
        )
        .run();
    }
  }
  private async finishPreparation(distributionId: string) {
    const row = await this.env.DB.prepare(
      "SELECT * FROM secure_distributions WHERE id=? AND (status='preparing' OR (status='prepared' AND dispatch_id IS NULL)) AND prepared_expires_at>?",
    )
      .bind(distributionId, now())
      .first<SecureDistributionRow>();
    if (!row) return;
    await this.assertPreparationAuthority(row);
    const pages = await this.env.DB.prepare(
      "SELECT page_number,image_sha256,text_sha256,width,height FROM secure_distribution_pages WHERE organization_id=? AND distribution_id=? ORDER BY page_number",
    )
      .bind(row.organization_id, row.id)
      .all();
    if (pages.results.length !== row.source_pages)
      throw new DomainError(
        "SECURE_MANIFEST_INCOMPLETE",
        "Every page must be prepared.",
        409,
      );
    const manifestSha = await secureSha256(
      canonicalJson({
        version: "secure-pages-v1",
        sourceSha256: row.source_sha256,
        pages: pages.results,
      }),
    );
    await this.env.DB.prepare(
      "UPDATE secure_distributions SET manifest_sha256=?,status='prepared' WHERE organization_id=? AND id=? AND status='preparing' AND manifest_sha256 IS NULL",
    )
      .bind(manifestSha, row.organization_id, row.id)
      .run();
    const member = await this.env.DB.prepare(
      "SELECT role,supervisor_can_approve,supervisor_can_report FROM memberships WHERE organization_id=? AND user_id=?",
    )
      .bind(row.organization_id, row.created_by)
      .first<{
        role: ActorContext["role"];
        supervisor_can_approve: number;
        supervisor_can_report: number;
      }>();
    if (!member) throw unavailable();
    const ctx: ActorContext = {
      organizationId: row.organization_id,
      userId: row.created_by,
      role: member.role,
      actor: "browser",
      supervisorCanApprove: Boolean(member.supervisor_can_approve),
      supervisorCanReport: Boolean(member.supervisor_can_report),
    };
    const input: StoredInvitation = JSON.parse(row.input_json);
    const descriptor: SecureDistributionDescriptor = {
      distributionId: row.id,
      sourceId: row.source_id,
      sourceSha256: row.source_sha256,
      manifestSha256: manifestSha,
      policy: JSON.parse(row.policy_json),
      serviceFeeMinor: row.service_fee_minor,
      priceVersion: SECURE_DISTRIBUTION_PRICE_VERSION,
      preparedExpiresAt: row.prepared_expires_at,
    };
    const token = await openSecureSecret(
      this.env,
      `${row.organization_id}:${row.id}`,
      row.sealed_token,
    );
    const locale = input.notificationLocale ?? defaultLocale;
    const invitation = `${this.env.APP_ORIGIN}/?lang=${locale}#/app/my-documents?invitation=${token}`;
    const accountDocument = {
      url: invitation,
      retentionDays: descriptor.policy.retentionDays,
    };
    const customHtml = input.html?.trim()
      ? cleanEmailHtml(input.html, { documentUrl: invitation })
      : null;
    const html = customHtml
      ? customHtml.html +
        renderAccountEmailFooter(
          accountDocument,
          locale,
          !customHtml.hasDocumentUrlPlaceholder,
        )
      : renderTransactionalEmail({
          text: input.message,
          workspaceName: input.workspaceName ?? "",
          locale,
          accountDocument,
          documentTitle: row.source_name,
        });
    const text = `${transactionalEmailText({ text: input.message, workspaceName: input.workspaceName ?? "", locale, documentTitle: row.source_name })}\n\n${deliveryText("Open in My documents", locale)}: ${invitation}\n${accountEmailInstructions(descriptor.policy.retentionDays, locale)}`;
    const dispatch = await this.domain.prepareSecureDistributionDispatch(
      ctx,
      {
        channel: "email",
        recipient: { email: row.recipient_address },
        subject: input.subject,
        senderId: input.senderId,
        text,
        html,
        ceilingMinor: input.costCeilingMinor,
      },
      `secure_${row.id}`,
      descriptor,
      locale,
    );
    const quote = secureDistributionQuote(
      descriptor.policy,
      dispatch.estimated_minor - row.service_fee_minor,
    );
    // This is the only price update: final transport is known before any approval.
    await this.env.DB.prepare(
      "UPDATE secure_distributions SET dispatch_id=?,quote_json=? WHERE organization_id=? AND id=? AND status='prepared' AND dispatch_id IS NULL",
    )
      .bind(dispatch.id, JSON.stringify(quote), row.organization_id, row.id)
      .run();
    await secureEvent(this.env.DB, {
      organizationId: row.organization_id,
      distributionId: row.id,
      userId: row.created_by,
      type: "preparation_completed",
      eventId: `secure_prepared_${row.id}`,
    });
  }
  async failRender(distributionId: string) {
    const failed = await this.env.DB.prepare(
      "UPDATE secure_distributions SET status='failed',error_code='SECURE_RENDER_RETRY_EXHAUSTED',lease_token=NULL,lease_expires_at=NULL WHERE id=? AND (status='preparing' OR (status='prepared' AND dispatch_id IS NULL))",
    )
      .bind(distributionId)
      .run();
    if (failed.meta.changes === 1) this.observePreparationFailure();
  }
  private observePreparationFailure() {
    const observation = startObservation(
      this.env,
      "app",
      "queue",
      "distribution",
    );
    observation.setCode("SECURE_PREPARATION_FAILED");
    observation.finish(undefined, { failed: 1 });
  }
  private async assertPreparationAuthority(row: SecureDistributionRow) {
    const snapshot: SecurePreparationAuthority | null =
      row.preparation_authority_json
        ? JSON.parse(row.preparation_authority_json)
        : null;
    if (!snapshot) {
      if (this.env.ENVIRONMENT === "local" && this.env.MODE === "simulation")
        return;
      throw unavailable();
    }
    const current =
      snapshot.kind === "oauth"
        ? await this.env.DB.prepare(
            "SELECT 1 FROM authorized_connections c JOIN connection_tool_observations o ON o.connection_id=c.id AND o.organization_id=c.organization_id AND o.user_id=c.user_id WHERE c.id=? AND c.organization_id=? AND c.user_id=? AND c.status='active' AND o.authorization_revision=? AND ?>CAST(strftime('%s','now') AS INTEGER)",
          )
            .bind(
              snapshot.connectionId,
              row.organization_id,
              row.created_by,
              snapshot.authorizationRevision,
              snapshot.expiresAt,
            )
            .first()
        : snapshot.kind === "development"
          ? this.env.ENVIRONMENT === "local" &&
            this.env.MODE === "simulation" &&
            (await this.env.DB.prepare(
              "SELECT 1 FROM development_mcp_tokens WHERE token_hash=? AND organization_id=? AND user_id=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            )
              .bind(snapshot.tokenHash, row.organization_id, row.created_by)
              .first())
          : await this.env.DB.prepare(
              "SELECT 1 FROM browser_sessions WHERE token_hash=? AND organization_id=? AND user_id=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')",
            )
              .bind(snapshot.sessionHash, row.organization_id, row.created_by)
              .first();
    if (!current)
      throw new DomainError(
        "PREPARATION_ACCESS_REVOKED",
        "The preparation has lost its authorization.",
        403,
      );
  }
  /** Database rows are the durable job source; queue publication can safely repeat. */
  async recoverPending() {
    const rows = await this.env.DB.prepare(
      "SELECT id FROM secure_distributions WHERE (status='preparing' OR (status='prepared' AND dispatch_id IS NULL)) AND prepared_expires_at>? AND (lease_expires_at IS NULL OR lease_expires_at<?) ORDER BY created_at LIMIT 10",
    )
      .bind(now(), now())
      .all<{ id: string }>();
    for (const row of rows.results)
      await this.env.DISPATCH_QUEUE.send({
        dispatchId: `secure_render:${row.id}`,
      });
    await this.env.DB.prepare(
      "UPDATE secure_distributions SET status='expired',error_code='PREPARATION_EXPIRED' WHERE id IN (SELECT id FROM secure_distributions WHERE status IN ('preparing','prepared') AND prepared_expires_at<? LIMIT 100)",
    )
      .bind(now())
      .run();
  }
  /** Replace an unsubmitted quote without rewriting its immutable preparation. */
  async renew(
    ctx: ActorContext,
    distributionId: string,
    principal: PersonalPrincipal,
  ): Promise<SecureDistributionView> {
    requirePersonalDocumentAuthentication(principal, this.env);
    if (ctx.actor !== "browser" || principal.userId !== ctx.userId)
      throw new DomainError(
        "BROWSER_REQUIRED",
        "Renew this preparation in Guteneo.",
        403,
      );
    await this.member(ctx, "approveDispatches");
    const row = await this.row(ctx, distributionId);
    if (!row.dispatch_id || row.status !== "prepared")
      throw new DomainError(
        "SECURE_QUOTE_RENEWAL_UNSAFE",
        "Only an unsubmitted preparation can be renewed.",
        409,
      );
    const key = `secure-renew:${row.id}`;
    const { dispatch } = await this.domain.getDispatch(ctx, row.dispatch_id);
    const marker = `secure_quote_renewal_${row.id}`;
    const fence = this.permissionFence(ctx, "approveDispatches"),
      session = personalSessionFence(principal, 900, this.env);
    const currentCancellation = () =>
      this.env.DB.prepare(
        `SELECT 1 FROM dispatches d JOIN secure_distributions s ON s.organization_id=d.organization_id AND s.dispatch_id=d.id
         JOIN secure_document_events e ON e.organization_id=s.organization_id AND e.distribution_id=s.id AND e.id=? AND e.type='quote_renewal_started'
         WHERE d.organization_id=? AND d.id=? AND d.status='cancelled' AND s.status='prepared'
         AND d.provider IS NULL AND d.provider_id IS NULL AND d.active_attempt_id IS NULL
         AND NOT EXISTS(SELECT 1 FROM attempts WHERE organization_id=d.organization_id AND dispatch_id=d.id)
         AND ${fence.condition} AND ${session.condition}`,
      )
        .bind(
          marker,
          ctx.organizationId,
          dispatch.id,
          ...fence.values,
          ...session.values,
        )
        .first();
    const started = await this.env.DB.prepare(
      "SELECT 1 FROM secure_document_events WHERE organization_id=? AND distribution_id=? AND id=? AND type='quote_renewal_started'",
    )
      .bind(ctx.organizationId, row.id, marker)
      .first();
    if (
      dispatch.status !== "prepared" &&
      !(dispatch.status === "cancelled" && started)
    )
      throw new DomainError(
        "SECURE_QUOTE_RENEWAL_UNSAFE",
        "Submission has started or this preparation is no longer renewable.",
        409,
      );
    if (dispatch.status === "prepared") {
      const validation = await this.domain.validateDispatch(ctx, dispatch.id);
      if (
        row.prepared_expires_at > now() &&
        !validation.checks.some(
          (check) =>
            check.id === "quote" &&
            check.status === "blocked" &&
            check.code === "LIVE_QUOTE_INVALID",
        ) &&
        !(await currentCancellation())
      )
        throw new DomainError(
          "QUOTE_STILL_VALID",
          "This quote is still valid. Review it before approval.",
          409,
        );
    }
    // Check ordinary source access before superseding the old preparation.
    // Renewal never elevates a reviewer into the source owner's authority.
    await this.domain.getDocument(ctx, row.source_id);
    await this.exactSource(row);
    const input = renewalInput(row, dispatch);
    const existing = await this.env.DB.prepare(
      "SELECT id,request_hash FROM secure_distributions WHERE organization_id=? AND request_key=?",
    )
      .bind(ctx.organizationId, key)
      .first<{ id: string; request_hash: string }>();
    if (existing) {
      if (existing.request_hash !== (await secureSha256(canonicalJson(input))))
        throw new DomainError(
          "IDEMPOTENCY_CONFLICT",
          "This key belongs to another distribution.",
          409,
        );
      // Another request may have completed while source verification awaited.
      // Reuse only its current guarded cancellation, never the earlier snapshot.
      if (!(await currentCancellation()))
        throw new DomainError(
          "SECURE_QUOTE_RENEWAL_UNSAFE",
          "The preparation or your access changed. Read its current status before continuing.",
          409,
        );
      return this.get(ctx, existing.id);
    }
    // The cancellation and its resume marker are one transaction. A racing
    // acceptance wins or loses this guard; accepted/attempted work never renews.
    await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE dispatches SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE organization_id=? AND id=? AND status='prepared'
         AND provider IS NULL AND provider_id IS NULL AND active_attempt_id IS NULL
         AND NOT EXISTS(SELECT 1 FROM attempts WHERE organization_id=dispatches.organization_id AND dispatch_id=dispatches.id)
         AND NOT EXISTS(SELECT 1 FROM reservations WHERE organization_id=dispatches.organization_id AND dispatch_id=dispatches.id)
         AND NOT EXISTS(SELECT 1 FROM welcome_credit_reservations WHERE organization_id=dispatches.organization_id AND dispatch_id=dispatches.id)
         AND NOT EXISTS(SELECT 1 FROM outbox WHERE organization_id=dispatches.organization_id AND dispatch_id=dispatches.id)
         AND EXISTS(SELECT 1 FROM secure_distributions s WHERE s.organization_id=dispatches.organization_id AND s.id=? AND s.dispatch_id=dispatches.id AND s.status='prepared')
         AND ${fence.condition} AND ${session.condition}`,
      ).bind(
        ctx.organizationId,
        dispatch.id,
        row.id,
        ...fence.values,
        ...session.values,
      ),
      this.env.DB.prepare(
        "INSERT INTO secure_document_events(id,organization_id,distribution_id,user_id,session_hash,type,provenance,created_at) SELECT ?,?,?,?,?,'quote_renewal_started','browser',strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE changes()=1",
      ).bind(
        marker,
        ctx.organizationId,
        row.id,
        ctx.userId,
        principal.tokenHash,
      ),
    ]);
    const safe = await currentCancellation();
    if (!safe)
      throw new DomainError(
        "SECURE_QUOTE_RENEWAL_UNSAFE",
        "The preparation or your access changed. Read its current status before continuing.",
        409,
      );
    // A later failure is resumable with this same source/key. No approval,
    // reservation or provider work is transferred to the replacement.
    return this.prepare(ctx, input, key);
  }
  async approve(
    ctx: ActorContext,
    distributionId: string,
    principal: PersonalPrincipal,
    reviewed: boolean,
    recipientRequested = false,
  ) {
    requirePersonalDocumentAuthentication(principal, this.env);
    if (ctx.actor !== "browser" || principal.userId !== ctx.userId || !reviewed)
      throw new DomainError(
        "HUMAN_APPROVAL_REQUIRED",
        "Review the document and its terms before approving.",
        403,
      );
    const row = await this.row(ctx, distributionId);
    if (!row.dispatch_id || row.status !== "prepared")
      throw new DomainError(
        "INVALID_STATE",
        "The preparation must be complete.",
        409,
      );
    const dispatch = await this.domain.getDispatch(ctx, row.dispatch_id);
    await this.domain.approveDispatch(
      ctx,
      row.dispatch_id,
      dispatch.dispatch.fingerprint,
      { recipientRequested },
    );
    return this.get(ctx, distributionId);
  }
  async confirm(ctx: ActorContext, distributionId: string, key: string) {
    const row = await this.row(ctx, distributionId);
    if (!row.dispatch_id)
      throw new DomainError(
        "INVALID_STATE",
        "The preparation is not complete.",
        409,
      );
    const proof = await this.env.DB.prepare(
      "SELECT 1 FROM approvals WHERE organization_id=? AND dispatch_id=? AND approval_kind='browser' AND expires_at>?",
    )
      .bind(ctx.organizationId, row.dispatch_id, now())
      .first();
    if (!proof)
      throw new DomainError(
        "HUMAN_APPROVAL_REQUIRED",
        "Human approval in Guteneo is required.",
        403,
      );
    await this.domain.confirmDispatch(
      ctx,
      row.dispatch_id,
      requestKey(key),
      undefined,
      this.authority?.sql(),
    );
    return this.get(ctx, distributionId);
  }
  async revoke(ctx: ActorContext, distributionId: string) {
    await this.member(ctx, "approveDispatches");
    const row = await this.row(ctx, distributionId),
      fence = this.permissionFence(ctx, "approveDispatches");
    await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE secure_distributions SET status='revoked',revoked_at=? WHERE organization_id=? AND id=? AND status IN ('preparing','prepared','active') AND ${fence.condition}`,
      ).bind(now(), ctx.organizationId, row.id, ...fence.values),
      this.env.DB.prepare(
        `INSERT OR IGNORE INTO secure_document_events(id,organization_id,distribution_id,user_id,type,provenance,created_at) SELECT ?,?,?,?,'access_revoked','server',? WHERE EXISTS(SELECT 1 FROM secure_distributions WHERE organization_id=? AND id=? AND status='revoked') AND ${fence.condition}`,
      ).bind(
        `secure_revoked_${row.id}`,
        ctx.organizationId,
        row.id,
        ctx.userId,
        now(),
        ctx.organizationId,
        row.id,
        ...fence.values,
      ),
    ]);
    return this.get(ctx, distributionId);
  }
  async bind(
    ctx: ActorContext,
    distributionId: string,
    principal: PersonalPrincipal,
    input: { recipientUserId: string; verificationMethod: string },
  ) {
    requirePersonalDocumentAuthentication(principal, this.env);
    if (ctx.actor !== "browser" || principal.userId !== ctx.userId)
      throw new DomainError(
        "HUMAN_APPROVAL_REQUIRED",
        "Recipient verification requires the browser.",
        403,
      );
    await this.member(ctx, "approveDispatches");
    const row = await this.row(ctx, distributionId),
      fence = this.permissionFence(ctx, "approveDispatches"),
      session = personalSessionFence(principal, 900, this.env);
    if (row.recipient_user_id !== input.recipientUserId || !row.claimed_at)
      throw unavailable();
    await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE secure_distributions SET bound_at=?,binding_by=?,binding_method=?
      WHERE organization_id=? AND id=? AND recipient_user_id=? AND bound_at IS NULL AND status='active' AND expires_at>? AND ${fence.condition} AND ${session.condition}`,
      ).bind(
        now(),
        ctx.userId,
        input.verificationMethod,
        ctx.organizationId,
        row.id,
        input.recipientUserId,
        now(),
        ...fence.values,
        ...session.values,
      ),
      this.env.DB.prepare(
        `INSERT OR IGNORE INTO secure_document_events(id,organization_id,distribution_id,user_id,type,provenance,created_at) SELECT ?,?,?,?,'recipient_binding_confirmed','server',? WHERE EXISTS(SELECT 1 FROM secure_distributions WHERE organization_id=? AND id=? AND recipient_user_id=? AND bound_at IS NOT NULL AND binding_by=?) AND ${fence.condition} AND ${session.condition}`,
      ).bind(
        `secure_bound_${row.id}`,
        ctx.organizationId,
        row.id,
        ctx.userId,
        now(),
        ctx.organizationId,
        row.id,
        input.recipientUserId,
        ctx.userId,
        ...fence.values,
        ...session.values,
      ),
    ]);
    return this.get(ctx, distributionId);
  }
}
