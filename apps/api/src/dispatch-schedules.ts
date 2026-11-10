import {
  dispatchScheduleInput, dispatchScheduleApproval, dispatchScheduleCancel,
  SCHEDULE_LIMITS, type DispatchScheduleView, type DispatchScheduleStatus,
} from "../../../packages/contracts/src/dispatch-schedules";
import { canonicalJson, DomainError, sha256, type ActorContext, type Dispatch, type DomainService } from "../../../packages/domain/src/index";
import { lifecycleAuthority, type LifecycleActor } from "./lifecycle-authority";
import { liveSendingEnabled, type LiveProviderEnv } from "./live-providers";
import type { Env } from "./env";

type Environment = Pick<Env,"MODE"|"SCHEDULED_DISPATCH_ENABLED"> & Partial<Env>;
type Row = {
  id: string; organization_id: string; source_dispatch_id: string; created_by: string;
  mode: "simulation" | "production"; channel: "fax" | "email"; snapshot_hash: string;
  execute_at: string; release_until: string; max_total_minor: number;
  request_hash: string; status: DispatchScheduleStatus; revision: number;
  error_code: string | null; created_at: string;
  release_dispatch_id?: string | null; approved_at?: string | null; approved_by?: string | null;
  can_reschedule?: number;
};
const reference = (id: string) => {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new DomainError("INVALID_INPUT", "Invalid schedule reference.");
  return id;
};
export const scheduleCapabilities = (env: Environment) => ({
  enabled: env.SCHEDULED_DISPATCH_ENABLED === "true",
  supported: ["fax", "message_only_email"],
  unsupported: ["secure_distribution", "protected_link", "pdf_email", "postal"],
  approvalKind: "future_browser", approvalSurface: "browser_only",
  horizonDays: SCHEDULE_LIMITS.horizonDays, releaseWindowMinutes: SCHEDULE_LIMITS.releaseWindowMinutes,
});
const recoverableSource = (source: string) => `${source}.status='cancelled' AND ${source}.provider IS NULL AND ${source}.provider_id IS NULL AND ${source}.active_attempt_id IS NULL
 AND NOT EXISTS(SELECT 1 FROM outbox x WHERE x.organization_id=${source}.organization_id AND x.dispatch_id=${source}.id)
 AND NOT EXISTS(SELECT 1 FROM attempts x WHERE x.organization_id=${source}.organization_id AND x.dispatch_id=${source}.id)
 AND EXISTS(SELECT 1 FROM dispatch_schedules prior WHERE prior.organization_id=${source}.organization_id AND prior.source_dispatch_id=${source}.id AND prior.status IN ('blocked','cancelled'))
 AND NOT EXISTS(SELECT 1 FROM dispatch_schedules prior WHERE prior.organization_id=${source}.organization_id AND prior.source_dispatch_id=${source}.id AND prior.status IN ('draft','approved','releasing','released','unknown'))
 AND NOT EXISTS(SELECT 1 FROM dispatch_schedules prior JOIN dispatches released ON released.organization_id=prior.organization_id AND released.prepare_key='schedule:'||prior.id WHERE prior.organization_id=${source}.organization_id AND prior.source_dispatch_id=${source}.id AND (released.status NOT IN ('prepared','cancelled') OR released.provider IS NOT NULL OR released.provider_id IS NOT NULL OR released.active_attempt_id IS NOT NULL OR EXISTS(SELECT 1 FROM outbox x WHERE x.organization_id=released.organization_id AND x.dispatch_id=released.id) OR EXISTS(SELECT 1 FROM attempts x WHERE x.organization_id=released.organization_id AND x.dispatch_id=released.id)))`;
const columns = `s.*,r.dispatch_id AS release_dispatch_id,a.created_at AS approved_at,a.user_id AS approved_by,EXISTS(SELECT 1 FROM dispatches original WHERE original.organization_id=s.organization_id AND original.id=s.source_dispatch_id AND ${recoverableSource("original")}) AS can_reschedule`;
const joins = `LEFT JOIN dispatch_schedule_releases r ON r.organization_id=s.organization_id AND r.schedule_id=s.id LEFT JOIN dispatch_schedule_approvals a ON a.organization_id=s.organization_id AND a.schedule_id=s.id`;

/** Scheduling never calls a provider; only ordinary atomic acceptance queues work. */
export class DispatchScheduleService {
  constructor(private readonly env: Environment, private readonly domain: DomainService) {}
  private view(row: Row): DispatchScheduleView {
    return { id: row.id, dispatchId: row.source_dispatch_id, releaseDispatchId: row.release_dispatch_id ?? null,
      channel: row.channel, status: row.status, revision: row.revision, snapshotHash: row.snapshot_hash,
      executeAt: row.execute_at, releaseUntil: row.release_until, maxTotalMinor: row.max_total_minor, currency: "EUR",
      approvalKind: row.approved_at ? "future_browser" : null, approvedAt: row.approved_at ?? null,
      approvedBy: row.approved_by ?? null, errorCode: row.error_code,
      releaseEnabled: this.env.SCHEDULED_DISPATCH_ENABLED === "true", canReschedule: row.can_reschedule === 1, createdAt: row.created_at };
  }
  private async row(ctx: LifecycleActor, id: string) {
    await this.domain.authorizeWrite(ctx);
    const authority = lifecycleAuthority(ctx, this.env.MODE);
    const row = await this.domain.db.prepare(`SELECT ${columns} FROM dispatch_schedules s ${joins} WHERE s.organization_id=? AND s.id=? AND (s.created_by=? OR ?='admin' OR (?='supervisor' AND ?=1)) AND ${authority.condition}`)
      .bind(ctx.organizationId, reference(id), ctx.userId, ctx.role, ctx.role, Number(Boolean(ctx.supervisorCanApprove)), ...authority.values).first<Row>();
    if (!row) throw new DomainError("NOT_FOUND", "Dispatch schedule not found.", 404);
    await this.domain.getDispatch(ctx, row.source_dispatch_id);
    return row;
  }
  async get(ctx: LifecycleActor, id: string) { return this.view(await this.row(ctx, id)); }
  async list(ctx: LifecycleActor, cursor?: string, limit = 30) {
    await this.domain.authorizeWrite(ctx);
    if (cursor) reference(cursor);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new DomainError("INVALID_INPUT", "Choose a page size from 1 to 100.");
    const authority = lifecycleAuthority(ctx, this.env.MODE);
    const rows = await this.domain.db.prepare(`SELECT ${columns} FROM dispatch_schedules s ${joins} WHERE s.organization_id=? AND s.id>? AND (s.created_by=? OR ?='admin' OR (?='supervisor' AND ?=1)) AND ${authority.condition} ORDER BY s.id LIMIT ?`)
      .bind(ctx.organizationId, cursor ?? "", ctx.userId, ctx.role, ctx.role, Number(Boolean(ctx.supervisorCanApprove)), ...authority.values, limit + 1).all<Row>();
    return { items: rows.results.slice(0, limit).map((row) => this.view(row)), nextCursor: rows.results.length > limit ? rows.results[limit - 1].id : null };
  }
  async create(ctx: LifecycleActor, input: unknown, key: string) {
    await this.domain.authorizeWrite(ctx);
    if (!key || key.length > 200 || /[\r\n\0]/.test(key)) throw new DomainError("IDEMPOTENCY_REQUIRED", "A stable idempotency key is required.");
    const value = dispatchScheduleInput.parse(input), executeAt = new Date(value.executeAt).toISOString();
    const source = (await this.domain.getDispatch(ctx, value.dispatchId)).dispatch;
    this.supported(source);
    const existing = await this.domain.db.prepare("SELECT id,request_hash FROM dispatch_schedules WHERE organization_id=? AND request_key=?").bind(ctx.organizationId, key).first<Row>();
    const requestHash = await sha256(canonicalJson({ ...value, executeAt }));
    if (existing) {
      if (existing.request_hash !== requestHash) throw new DomainError("IDEMPOTENCY_CONFLICT", "This key belongs to a different schedule.", 409);
      return this.get(ctx, existing.id);
    }
    if (source.document_id) {
      // Review access through a dispatch does not grant source preparation
      // access. Release uses this same principal without a review context.
      const document = await this.domain.getDocument(ctx, source.document_id);
      if (document.status !== "ready")
        throw new DomainError("DOCUMENT_QUARANTINED", "The document is not ready for dispatch.", 409);
    }
    const now = Date.now();
    if (Date.parse(executeAt) < now + 60_000 || Date.parse(executeAt) > now + SCHEDULE_LIMITS.horizonDays * 86400_000)
      throw new DomainError("SCHEDULE_TIME_INVALID", "Choose a time from one minute to thirty days in the future.");
    const recoverable = source.status === "cancelled" && !!await this.domain.db.prepare(`SELECT 1 FROM dispatches original WHERE original.organization_id=? AND original.id=? AND ${recoverableSource("original")}`).bind(ctx.organizationId,source.id).first();
    if ((!recoverable && source.status !== "prepared") || source.provider || source.provider_id || source.active_attempt_id)
      throw new DomainError("SCHEDULE_SOURCE_UNAVAILABLE", "Only an unsubmitted prepared dispatch can be scheduled.", 409);
    if (value.maxTotalMinor < source.estimated_minor)
      throw new DomainError("SCHEDULE_CAP_TOO_LOW", "The future spending cap must cover the current estimate.", 409);
    const releaseUntil = new Date(Date.parse(executeAt) + SCHEDULE_LIMITS.releaseWindowMinutes * 60_000).toISOString();
    const snapshot = await sha256(canonicalJson({ dispatchId: source.id, fingerprint: source.fingerprint, executeAt, releaseUntil, maxTotalMinor: value.maxTotalMinor, creator: ctx.userId }));
    const authority = lifecycleAuthority(ctx, this.env.MODE), id = `sch_${crypto.randomUUID()}`, time = new Date(now).toISOString();
    try {
      await this.domain.db.batch([
        this.domain.db.prepare(`INSERT INTO dispatch_schedules(id,organization_id,source_dispatch_id,created_by,mode,channel,snapshot_hash,execute_at,release_until,max_total_minor,request_key,request_hash,status,revision,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'draft',1,?,? WHERE ${authority.condition} AND EXISTS(SELECT 1 FROM dispatches d WHERE d.organization_id=? AND d.id=? AND (d.status='prepared' OR (${recoverableSource("d")})) AND d.provider IS NULL AND d.provider_id IS NULL AND d.active_attempt_id IS NULL AND (d.document_id IS NULL OR EXISTS(SELECT 1 FROM documents doc WHERE doc.organization_id=d.organization_id AND doc.id=d.document_id AND doc.status='ready' AND (doc.access_owner_id IS NULL OR doc.access_owner_id=?))) AND NOT EXISTS(SELECT 1 FROM attempts x WHERE x.organization_id=d.organization_id AND x.dispatch_id=d.id) AND NOT EXISTS(SELECT 1 FROM outbox o WHERE o.organization_id=d.organization_id AND o.dispatch_id=d.id)) AND (SELECT count(*) FROM dispatch_schedules WHERE organization_id=? AND status IN ('draft','approved','releasing','unknown'))<100 ON CONFLICT(organization_id,request_key) DO NOTHING`)
          .bind(id, ctx.organizationId, source.id, ctx.userId, this.env.MODE, source.channel, snapshot, executeAt, releaseUntil, value.maxTotalMinor, key, requestHash, time, time, ...authority.values, ctx.organizationId, source.id, ctx.userId, ctx.organizationId),
        this.audit(ctx, "schedule.created", id, time),
        this.domain.db.prepare("UPDATE dispatches SET status='cancelled',updated_at=? WHERE organization_id=? AND status='prepared' AND provider IS NULL AND provider_id IS NULL AND active_attempt_id IS NULL AND prepare_key IN (SELECT 'schedule:'||prior.id FROM dispatch_schedules prior WHERE prior.organization_id=? AND prior.source_dispatch_id=? AND prior.id<>?) AND EXISTS(SELECT 1 FROM dispatch_schedules current WHERE current.organization_id=? AND current.id=?) AND NOT EXISTS(SELECT 1 FROM outbox x WHERE x.organization_id=dispatches.organization_id AND x.dispatch_id=dispatches.id) AND NOT EXISTS(SELECT 1 FROM attempts x WHERE x.organization_id=dispatches.organization_id AND x.dispatch_id=dispatches.id)")
          .bind(time,ctx.organizationId,ctx.organizationId,source.id,id,ctx.organizationId,id),
      ]);
    } catch (error) {
      if (String(error).includes("dispatch_schedule_active_source" ) || String(error).includes("dispatch_schedules.organization_id, dispatch_schedules.source_dispatch_id"))
        throw new DomainError("SCHEDULE_ALREADY_EXISTS", "This dispatch already has an active schedule.", 409);
      throw error;
    }
    const stored = await this.domain.db.prepare("SELECT id FROM dispatch_schedules WHERE organization_id=? AND request_key=?").bind(ctx.organizationId, key).first<Row>();
    if (!stored) throw new DomainError("SCHEDULE_SOURCE_UNAVAILABLE", "The source, current authority or schedule limit changed.", 409);
    return this.get(ctx, stored.id);
  }
  async approve(ctx: LifecycleActor, id: string, input: unknown) {
    if (this.env.SCHEDULED_DISPATCH_ENABLED !== "true")
      throw new DomainError("SCHEDULE_RELEASE_DISABLED", "Future approval is unavailable while automatic release is disabled. The schedule remains a draft.", 409);
    if (ctx.actor !== "browser" || !ctx.documentSessionHash || !/^[a-f0-9]{64}$/.test(ctx.documentSessionHash))
      throw new DomainError("BROWSER_REQUIRED", "Future spending approval requires the authenticated human browser.", 403);
    await this.domain.authorizeApproval(ctx);
    const value = dispatchScheduleApproval.parse(input), row = await this.row(ctx, id);
    if (row.status === "approved" && row.approved_by === ctx.userId && row.snapshot_hash === value.snapshotHash) return this.view(row);
    if (row.status !== "draft" || row.revision !== value.expectedRevision || row.snapshot_hash !== value.snapshotHash)
      throw new DomainError("SCHEDULE_CHANGED", "Refresh and review the exact schedule before approving.", 409);
    if (Date.parse(row.release_until) <= Date.now())
      throw new DomainError("SCHEDULE_WINDOW_EXPIRED", "This schedule's release window has ended. Prepare a new schedule for a new explicit review.", 409);
    if (row.channel === "email" && value.recipientRequested !== true)
      throw new DomainError("RECIPIENT_REQUEST_REQUIRED", "Confirm that this recipient requested the scheduled email.", 409);
    const authority = lifecycleAuthority(ctx, this.env.MODE, "approveDispatches"), now = new Date().toISOString();
    await this.domain.db.batch([
      this.domain.db.prepare(`INSERT INTO dispatch_schedule_approvals(schedule_id,organization_id,user_id,approval_kind,browser_session_hash,snapshot_hash,recipient_requested,created_at) SELECT ?,?,?,'future_browser',?,?,?,? WHERE ${authority.condition} AND EXISTS(SELECT 1 FROM dispatch_schedules WHERE organization_id=? AND id=? AND status='draft' AND revision=? AND snapshot_hash=? AND release_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(schedule_id) DO NOTHING`)
        .bind(id, ctx.organizationId, ctx.userId, ctx.documentSessionHash, row.snapshot_hash, Number(value.recipientRequested === true), now, ...authority.values, ctx.organizationId, id, value.expectedRevision, value.snapshotHash),
      this.domain.db.prepare("UPDATE dispatch_schedules SET status='approved',revision=revision+1,updated_at=? WHERE organization_id=? AND id=? AND status='draft' AND changes()=1")
        .bind(now, ctx.organizationId, id),
      this.domain.db.prepare("UPDATE dispatches SET status='cancelled',updated_at=? WHERE organization_id=? AND id=? AND status IN ('prepared','cancelled') AND EXISTS(SELECT 1 FROM dispatch_schedules WHERE organization_id=? AND id=? AND status='approved')")
        .bind(now, ctx.organizationId, row.source_dispatch_id, ctx.organizationId, id),
      this.audit(ctx, "schedule.approved", id, now),
    ]);
    const result = await this.get(ctx, id);
    if (result.status === "draft" && Date.parse(result.releaseUntil) <= Date.now())
      throw new DomainError("SCHEDULE_WINDOW_EXPIRED", "This schedule's release window ended before approval. Prepare a new schedule for a new explicit review.", 409);
    if (result.status !== "approved") throw new DomainError("SCHEDULE_CHANGED", "Schedule or browser approval authority changed.", 409);
    return result;
  }
  async cancel(ctx: LifecycleActor, id: string, input: unknown) {
    const row = await this.row(ctx, id), value = dispatchScheduleCancel.parse(input);
    if (row.status === "cancelled") return this.view(row);
    if (row.status === "released" || row.status === "blocked" || row.revision !== value.expectedRevision)
      throw new DomainError("SCHEDULE_CHANGED", "Refresh this schedule. An accepted release follows the ordinary dispatch cancellation rules.", 409);
    if (row.created_by !== ctx.userId && row.approved_by !== ctx.userId && ctx.role !== "admin")
      throw new DomainError("FORBIDDEN", "Only the preparer, approver or administrator may cancel this schedule.", 403);
    const authority = lifecycleAuthority(ctx, this.env.MODE), now = new Date().toISOString();
    await this.domain.db.batch([
      this.domain.db.prepare(`UPDATE dispatch_schedules SET status='cancelled',revision=revision+1,updated_at=? WHERE organization_id=? AND id=? AND revision=? AND status IN ('draft','approved','releasing','unknown') AND NOT EXISTS(SELECT 1 FROM dispatch_schedule_releases r JOIN dispatches d ON d.organization_id=r.organization_id AND d.id=r.dispatch_id WHERE r.organization_id=dispatch_schedules.organization_id AND r.schedule_id=dispatch_schedules.id AND d.status<>'prepared') AND ${authority.condition}`)
        .bind(now, ctx.organizationId, id, value.expectedRevision, ...authority.values),
      this.domain.db.prepare("UPDATE dispatch_schedule_approvals SET revoked_at=? WHERE organization_id=? AND schedule_id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM dispatch_schedules WHERE organization_id=? AND id=? AND status='cancelled')")
        .bind(now, ctx.organizationId, id, ctx.organizationId, id),
      this.audit(ctx, "schedule.cancelled", id, now),
    ]);
    const result = await this.get(ctx, id);
    if (result.status !== "cancelled") throw new DomainError("SCHEDULE_CHANGED", "The schedule changed before cancellation.", 409);
    return result;
  }
  async processDue(limit = 5) {
    if (this.env.SCHEDULED_DISPATCH_ENABLED !== "true") return { processed: 0, enabled: false };
    limit = Math.max(1, Math.min(20, Math.trunc(limit)));
    const db = this.domain.db, now = new Date().toISOString();
    await db.prepare("UPDATE dispatch_schedules SET status='blocked',error_code='SCHEDULE_WINDOW_EXPIRED',revision=revision+1,updated_at=? WHERE id IN (SELECT id FROM dispatch_schedules WHERE status='approved' AND release_until<=? ORDER BY release_until LIMIT 20)").bind(now, now).run();
    await db.prepare("UPDATE dispatch_schedules SET status='unknown',error_code='SCHEDULE_RELEASE_UNKNOWN',revision=revision+1,updated_at=? WHERE id IN (SELECT id FROM dispatch_schedules WHERE status='releasing' AND release_started_at<? ORDER BY release_started_at LIMIT 20)").bind(now, new Date(Date.now() - 120_000).toISOString()).run();
    const due = await db.prepare("SELECT s.*,a.user_id AS approved_by FROM dispatch_schedules s JOIN dispatch_schedule_approvals a ON a.organization_id=s.organization_id AND a.schedule_id=s.id WHERE s.status='approved' AND s.mode=? AND s.execute_at<=? AND s.release_until>? AND a.revoked_at IS NULL ORDER BY s.execute_at,s.id LIMIT ?")
      .bind(this.env.MODE, now, now, limit).all<Row>();
    let processed = 0;
    for (const schedule of due.results) {
      const claimed = await db.prepare("UPDATE dispatch_schedules SET status='releasing',revision=revision+1,release_started_at=?,updated_at=? WHERE organization_id=? AND id=? AND status='approved' RETURNING id")
        .bind(now, now, schedule.organization_id, schedule.id).first();
      if (!claimed) continue;
      processed++;
      try {
        if (this.env.MODE === "production" && !liveSendingEnabled(this.env as LiveProviderEnv, schedule.channel))
          throw new DomainError("SCHEDULE_PROVIDER_UNAVAILABLE", "The current production transport is not activated for this scheduled channel.", 409);
        const creator = await this.principal(schedule.organization_id, schedule.created_by), approver = await this.principal(schedule.organization_id, schedule.approved_by!);
        await this.domain.authorizeWrite(creator);
        await this.domain.authorizeApproval(approver);
        await this.domain.getDispatch(approver, schedule.source_dispatch_id);
        const source = (await this.domain.getDispatch(creator, schedule.source_dispatch_id)).dispatch;
        this.supported(source);
        const options = JSON.parse(source.options_json) as Record<string, unknown>;
        delete options.replyTo;
        const release = await this.domain.prepareDispatch(creator, {
          channel: source.channel, recipient: JSON.parse(source.recipient_json),
          ...(source.document_id ? { documentId: source.document_id } : {}),
          ...(source.sender_id ? { senderId: source.sender_id } : {}),
          ...(source.subject ? { subject: source.subject } : {}),
          ...(source.html ? { html: source.html } : {}),
          ...(source.text ? { text: source.text } : {}),
          options, ceilingMinor: schedule.max_total_minor,
        }, `schedule:${schedule.id}`);
        if (release.estimated_minor > schedule.max_total_minor || release.ceiling_minor > schedule.max_total_minor)
          throw new DomainError("SCHEDULE_CAP_EXCEEDED", "The fresh quote exceeds the approved total spending cap.", 409);
        if (release.recipient_json !== source.recipient_json || release.sender_id !== source.sender_id || release.sender_address !== source.sender_address || release.document_id !== source.document_id || release.options_json !== source.options_json || release.subject !== source.subject || release.html !== source.html || release.text !== source.text)
          throw new DomainError("SCHEDULE_CONTENT_CHANGED", "Fresh preparation no longer matches the reviewed schedule.", 409);
        await db.prepare("INSERT INTO dispatch_schedule_releases(schedule_id,organization_id,dispatch_id,fingerprint,created_at) VALUES(?,?,?,?,?) ON CONFLICT(schedule_id) DO NOTHING")
          .bind(schedule.id, schedule.organization_id, release.id, release.fingerprint, new Date().toISOString()).run();
        await this.domain.confirmDispatch(approver, release.id, `schedule:${schedule.id}:accept`, undefined, {
          condition: "EXISTS(SELECT 1 FROM valid_future_dispatch_releases f WHERE f.organization_id=? AND f.schedule_id=? AND f.dispatch_id=? AND f.fingerprint=?)",
          values: [schedule.organization_id, schedule.id, release.id, release.fingerprint],
        });
      } catch (error) {
        const code = error instanceof Error && "code" in error ? String(error.code) : "SCHEDULE_RELEASE_UNKNOWN";
        await db.prepare("UPDATE dispatch_schedules SET status=?,error_code=?,revision=revision+1,updated_at=? WHERE organization_id=? AND id=? AND status='releasing'")
          .bind(code === "SCHEDULE_RELEASE_UNKNOWN" ? "unknown" : "blocked", code, new Date().toISOString(), schedule.organization_id, schedule.id).run();
      }
    }
    return { processed, enabled: true };
  }
  private supported(source: Dispatch) {
    const options = JSON.parse(source.options_json) as Record<string, unknown>;
    if (source.channel === "postal" || (source.channel === "email" && source.document_id) || options.secureDistribution || options.protectedDocument || options.emailDeliveryMode === "protected_link")
      throw new DomainError("SCHEDULE_CHANNEL_UNSUPPORTED", "Only ordinary fax and message-only email support future approval. Secure, PDF email and postal workflows require their current review and freshness gates.", 409);
    if (source.faxPricing?.executionScope === "review_prepare_only")
      throw new DomainError("FAX_REVIEW_PREPARATION_ONLY", "Review-only preparation cannot be scheduled.", 409);
  }
  private async principal(organizationId: string, userId: string): Promise<ActorContext> {
    const membership = await this.domain.db.prepare("SELECT role,supervisor_can_approve,supervisor_can_report FROM memberships WHERE organization_id=? AND user_id=?").bind(organizationId, userId)
      .first<{ role: ActorContext["role"]; supervisor_can_approve: number; supervisor_can_report: number }>();
    if (!membership) throw new DomainError("MEMBERSHIP_CHANGED", "The scheduled actor no longer belongs to this workspace.", 403);
    return { organizationId, userId, role: membership.role, actor: "system", supervisorCanApprove: membership.supervisor_can_approve === 1, supervisorCanReport: membership.supervisor_can_report === 1 };
  }
  private audit(ctx: ActorContext, action: string, id: string, time: string) {
    return this.domain.db.prepare("INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,?,?,'{}',? WHERE changes()=1")
      .bind(crypto.randomUUID(), ctx.organizationId, ctx.userId, action, id, time);
  }
}
