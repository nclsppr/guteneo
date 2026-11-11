import { z } from "zod";
import {
  DomainError,
  DomainService,
  membershipPermissionFence,
  type ActorContext,
  type Dispatch,
} from "../../../packages/domain/src/index";
import { approvalDeadline } from "../../../packages/domain/src/dispatch-lifecycle";

/*
 * Scheduled sending. An approver reviews a prepared fax or email dispatch in
 * the browser and chooses when it is accepted. The scheduled_releases row is
 * that human consent: it binds the reviewed fingerprint, so the content,
 * recipient, options and spending ceiling. At the chosen time the minute
 * scheduler:
 *
 * 1. rechecks that the approver still may approve in this workspace;
 * 2. keeps the reviewed dispatch while its quote is valid, or renews an expired
 *    production fax quote with identical PDF, recipient, sender and ceiling;
 *    any other expired quote refuses the release;
 * 3. refuses a renewed quote whose high estimate exceeds the ceiling;
 * 4. writes an ordinary browser approval naming this schedule and runs the
 *    usual atomic acceptance (reservation, quota, outbox).
 *
 * A refusal is final. An unexpected failure marks the release uncertain and is
 * never retried automatically: a person reads the dispatch first. Postal
 * letters, secure distributions and campaign members cannot be scheduled.
 */

export const MIN_LEAD_MINUTES = 5;
export const MAX_LEAD_DAYS = 30;
const RELEASES_PER_TICK = 10;
const NANO_EUR_PER_CENT = 10_000_000;

export const scheduleInput = z
  .object({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    releaseAt: z.iso.datetime({ offset: true }),
    recipientRequested: z.boolean().optional(),
  })
  .strict();

export type ScheduledRelease = {
  id: string;
  dispatch_id: string;
  release_at: string;
  state:
    | "scheduled"
    | "releasing"
    | "released"
    | "refused"
    | "cancelled"
    | "uncertain";
  released_dispatch_id: string | null;
  outcome_code: string | null;
  approver_name: string | null;
  created_at: string;
};

const SELECT_VIEW =
  "SELECT s.id,s.dispatch_id,s.release_at,s.state,s.released_dispatch_id,s.outcome_code,s.created_at,u.name AS approver_name FROM scheduled_releases s LEFT JOIN users u ON u.id=s.approver_id";

/** Only fax and email bind a ceiling rather than an exact price. */
export function schedulable(dispatch: Dispatch) {
  const options = JSON.parse(dispatch.options_json || "{}") as {
    secureDistribution?: unknown;
  };
  return (
    (dispatch.channel === "fax" || dispatch.channel === "email") &&
    !options.secureDistribution &&
    !dispatch.campaign_id
  );
}

export class ScheduledReleaseService {
  constructor(
    private readonly db: D1Database,
    private readonly domain: DomainService,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** The latest schedule of a dispatch, for anyone who may read it. */
  async read(ctx: ActorContext, dispatchId: string) {
    await this.domain.getDispatch(ctx, dispatchId);
    const row = await this.db
      .prepare(
        `${SELECT_VIEW} WHERE s.organization_id=? AND s.dispatch_id=? ORDER BY s.created_at DESC,s.id DESC LIMIT 1`,
      )
      .bind(ctx.organizationId, dispatchId)
      .first<ScheduledRelease>();
    return { schedule: row ?? null };
  }

  async schedule(
    ctx: ActorContext,
    dispatchId: string,
    input: z.infer<typeof scheduleInput>,
  ) {
    await this.domain.authorizeApproval(ctx);
    if (ctx.actor !== "browser")
      throw new DomainError(
        "HUMAN_APPROVAL_REQUIRED",
        "Scheduling requires an authenticated human session.",
        403,
      );
    const { dispatch } = await this.domain.getDispatch(ctx, dispatchId);
    if (!schedulable(dispatch))
      throw new DomainError(
        "SCHEDULE_UNSUPPORTED",
        "Only an individual fax or email can be scheduled.",
        409,
      );
    if (dispatch.status !== "prepared")
      throw new DomainError(
        "INVALID_STATE",
        "Only a dispatch awaiting approval can be scheduled.",
        409,
      );
    if (dispatch.fingerprint !== input.fingerprint)
      throw new DomainError(
        "VERSION_CHANGED",
        "This version is no longer the one awaiting approval. Review it again.",
        409,
      );
    const releaseAt = Date.parse(input.releaseAt);
    if (
      releaseAt < this.now() + MIN_LEAD_MINUTES * 60_000 ||
      releaseAt > this.now() + MAX_LEAD_DAYS * 86_400_000
    )
      throw new DomainError(
        "SCHEDULE_OUT_OF_RANGE",
        "Choose a time between five minutes and thirty days from now.",
      );
    const authority = membershipPermissionFence(ctx, "approveDispatches");
    const id = `sch_${crypto.randomUUID()}`;
    const now = new Date(this.now()).toISOString();
    const release = new Date(releaseAt).toISOString();
    const [inserted] = await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO scheduled_releases(id,organization_id,dispatch_id,fingerprint,approver_id,recipient_requested,release_at,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${authority.condition}`,
        )
        .bind(
          id,
          ctx.organizationId,
          dispatchId,
          input.fingerprint,
          ctx.userId,
          input.recipientRequested ? 1 : 0,
          release,
          now,
          ...authority.values,
        ),
      this.db
        .prepare(
          "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'dispatch.scheduled',?,?,? WHERE changes()=1",
        )
        .bind(
          crypto.randomUUID(),
          ctx.organizationId,
          ctx.userId,
          dispatchId,
          JSON.stringify({
            fingerprint: input.fingerprint,
            releaseAt: release,
          }),
          now,
        ),
    ]);
    if (!inserted?.meta.changes)
      throw new DomainError(
        "ALREADY_SCHEDULED",
        "This dispatch is already scheduled. Cancel that schedule first.",
        409,
      );
    return this.read(ctx, dispatchId);
  }

  async cancel(ctx: ActorContext, dispatchId: string) {
    await this.domain.authorizeApproval(ctx);
    const authority = membershipPermissionFence(ctx, "approveDispatches");
    const now = new Date(this.now()).toISOString();
    const [cancelled] = await this.db.batch([
      this.db
        .prepare(
          `UPDATE scheduled_releases SET state='cancelled',outcome_code='CANCELLED',decided_at=? WHERE organization_id=? AND dispatch_id=? AND state='scheduled' AND ${authority.condition}`,
        )
        .bind(now, ctx.organizationId, dispatchId, ...authority.values),
      this.db
        .prepare(
          "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'dispatch.schedule_cancelled',?,'{}',? WHERE changes()=1",
        )
        .bind(
          crypto.randomUUID(),
          ctx.organizationId,
          ctx.userId,
          dispatchId,
          now,
        ),
    ]);
    if (!cancelled?.meta.changes)
      throw new DomainError(
        "NOT_SCHEDULED",
        "This dispatch has no schedule left to cancel.",
        409,
      );
    return this.read(ctx, dispatchId);
  }

  /** Releases due schedules; called by the minute scheduler. */
  async releaseDue() {
    const counts = {
      scheduledReleased: 0,
      scheduledRefused: 0,
      scheduledUncertain: 0,
    };
    const at = new Date(this.now()).toISOString();
    const due = await this.db
      .prepare(
        `SELECT id,organization_id,dispatch_id,fingerprint,approver_id,recipient_requested FROM scheduled_releases WHERE state='scheduled' AND release_at<=? ORDER BY release_at LIMIT ${RELEASES_PER_TICK}`,
      )
      .bind(at)
      .all<{
        id: string;
        organization_id: string;
        dispatch_id: string;
        fingerprint: string;
        approver_id: string;
        recipient_requested: number;
      }>();
    for (const item of due.results) {
      const claim = await this.db
        .prepare(
          "UPDATE scheduled_releases SET state='releasing' WHERE id=? AND state='scheduled'",
        )
        .bind(item.id)
        .run();
      if (!claim.meta.changes) continue;
      const outcome = await this.release(item).catch((error: unknown) =>
        error instanceof DomainError
          ? { state: "refused" as const, code: error.code }
          : { state: "uncertain" as const, code: "RELEASE_UNCERTAIN" },
      );
      const decided = new Date(this.now()).toISOString();
      await this.db.batch([
        this.db
          .prepare(
            "UPDATE scheduled_releases SET state=?,outcome_code=?,released_dispatch_id=?,decided_at=? WHERE id=? AND state='releasing'",
          )
          .bind(
            outcome.state,
            outcome.code,
            "dispatchId" in outcome ? outcome.dispatchId : null,
            decided,
            item.id,
          ),
        this.db
          .prepare(
            "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,NULL,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            item.organization_id,
            `dispatch.schedule_${outcome.state}`,
            item.dispatch_id,
            JSON.stringify({ code: outcome.code, scheduleId: item.id }),
            decided,
          ),
      ]);
      if (outcome.state === "released") counts.scheduledReleased += 1;
      else if (outcome.state === "uncertain") counts.scheduledUncertain += 1;
      else counts.scheduledRefused += 1;
    }
    return counts;
  }

  private async release(item: {
    id: string;
    organization_id: string;
    dispatch_id: string;
    fingerprint: string;
    approver_id: string;
    recipient_requested: number;
  }): Promise<
    | { state: "released"; code: "RELEASED"; dispatchId: string }
    | { state: "cancelled" | "refused"; code: string }
  > {
    const member = await this.db
      .prepare(
        "SELECT role,supervisor_can_approve,supervisor_can_report FROM memberships WHERE organization_id=? AND user_id=?",
      )
      .bind(item.organization_id, item.approver_id)
      .first<{
        role: ActorContext["role"];
        supervisor_can_approve: number;
        supervisor_can_report: number;
      }>();
    if (!member) return { state: "refused", code: "APPROVER_NOT_AUTHORIZED" };
    // The approver's current membership, acting through the scheduler.
    const ctx: ActorContext = {
      organizationId: item.organization_id,
      userId: item.approver_id,
      role: member.role,
      supervisorCanApprove: member.supervisor_can_approve === 1,
      supervisorCanReport: member.supervisor_can_report === 1,
      actor: "system",
    };
    try {
      await this.domain.authorizeApproval(ctx);
    } catch {
      return { state: "refused", code: "APPROVER_NOT_AUTHORIZED" };
    }
    const { dispatch: source } = await this.domain.getDispatch(
      ctx,
      item.dispatch_id,
    );
    if (source.status !== "prepared")
      return { state: "cancelled", code: "DISPATCH_NOT_PREPARED" };
    if (source.fingerprint !== item.fingerprint || !schedulable(source))
      return { state: "refused", code: "VERSION_CHANGED" };
    let target = source;
    const expired =
      !!source.quote_expires_at &&
      Date.parse(source.quote_expires_at) <= this.now() + 60_000;
    if (expired) {
      if (source.channel !== "fax" || source.mode !== "production")
        return { state: "refused", code: "QUOTE_EXPIRED" };
      const recipient = JSON.parse(source.recipient_json) as { phone: string };
      // Renewal itself refuses any change of PDF, recipient, sender or ceiling.
      target = await this.domain.renewFaxQuote(ctx, source.id, {
        documentId: source.document_id!,
        phone: recipient.phone,
        ceilingMinor: source.ceiling_minor,
        ...(source.sender_id ? { senderId: source.sender_id } : {}),
      });
      const high = target.faxPricing?.estimatedHighNanoeur;
      if (
        target.ceiling_minor !== source.ceiling_minor ||
        (high !== undefined && high > source.ceiling_minor * NANO_EUR_PER_CENT)
      )
        return { state: "refused", code: "QUOTE_ABOVE_CEILING" };
    }
    const authority = membershipPermissionFence(ctx, "approveDispatches");
    const now = new Date(this.now()).toISOString();
    const approved = await this.db
      .prepare(
        `INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at,recipient_requested,approval_kind,expert_review_hash,secure_approval_evidence_id,scheduled_release_id) SELECT ?,?,?,?,?,?,?,?,'browser',NULL,NULL,? WHERE ${authority.condition} ON CONFLICT(organization_id,dispatch_id) DO UPDATE SET user_id=excluded.user_id,fingerprint=excluded.fingerprint,expires_at=excluded.expires_at,created_at=excluded.created_at,recipient_requested=excluded.recipient_requested,approval_kind=excluded.approval_kind,expert_review_hash=NULL,secure_approval_evidence_id=NULL,scheduled_release_id=excluded.scheduled_release_id`,
      )
      .bind(
        `approval_${crypto.randomUUID()}`,
        item.organization_id,
        target.id,
        item.approver_id,
        target.fingerprint,
        approvalDeadline({
          createdAt: now,
          quoteExpiresAt: target.quote_expires_at ?? undefined,
        }),
        now,
        item.recipient_requested,
        item.id,
        ...authority.values,
      )
      .run();
    if (!approved.meta.changes)
      return { state: "refused", code: "APPROVER_NOT_AUTHORIZED" };
    try {
      await this.domain.confirmDispatch(ctx, target.id, `scheduled:${item.id}`);
    } catch (error) {
      // A refused acceptance committed nothing: withdraw the approval this
      // release wrote, so no one can accept the version on its strength.
      if (error instanceof DomainError)
        await this.db
          .prepare(
            "DELETE FROM approvals WHERE organization_id=? AND dispatch_id=? AND scheduled_release_id=?",
          )
          .bind(item.organization_id, target.id, item.id)
          .run();
      throw error;
    }
    return { state: "released", code: "RELEASED", dispatchId: target.id };
  }
}
