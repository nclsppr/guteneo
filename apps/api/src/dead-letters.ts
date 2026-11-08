import {
  DomainError,
  type ActorContext,
  type DomainService,
} from "../../../packages/domain/src/index";
import { browserAdministratorFence } from "./browser-administrator";

export type DeadLetterResolution = {
  id: string;
  dispatchId: string;
  resolvedAt: string;
};

/** Resolve retained diagnostics only after the original command is durably closed. */
export class DeadLetterService {
  constructor(private readonly domain: DomainService) {}

  async resolve(ctx: ActorContext, id: string): Promise<DeadLetterResolution> {
    const fence = browserAdministratorFence(ctx, this.domain.config.mode);
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id))
      throw new DomainError(
        "INVALID_INPUT",
        "Invalid incident reference.",
        400,
      );
    await this.domain.authorizeWrite(ctx);

    const db = this.domain.db;
    const authority = fence.condition;
    const authorityValues = fence.values;
    const read = () =>
      db
        .prepare(
          `SELECT l.id,l.dispatch_id,l.resolved_at,
          EXISTS(SELECT 1 FROM operationally_closed_dispatches closed
            WHERE closed.organization_id=d.organization_id AND closed.dispatch_id=d.id) AS closed
          FROM dead_letters l JOIN dispatches d ON d.id=l.dispatch_id
          WHERE l.id=? AND d.organization_id=? AND ${authority}`,
        )
        .bind(id, ctx.organizationId, ...authorityValues)
        .first<{
          id: string;
          dispatch_id: string;
          resolved_at: string | null;
          closed: number;
        }>();
    const row = await read();
    if (!row)
      throw new DomainError("NOT_FOUND", "Queue incident not found.", 404);
    if (!row.resolved_at && row.closed !== 1)
      throw new DomainError(
        "INCIDENT_STILL_OPEN",
        "Reconcile the original dispatch and its financial holds before resolving this incident.",
        409,
      );
    if (!row.resolved_at) {
      const auditId = `dead_letter_resolved_${id}`;
      // The same atomic batch owns the one resolution receipt and its timestamp.
      // It never changes a dispatch, reservation, outbox or provider attempt.
      // Receipt insertion owns the current-authority decision; changes() binds
      // the state update to that newly inserted receipt. Rechecking the clock
      // in statement two could otherwise leave only the first effect committed.
      await db.batch([
        db
          .prepare(
            `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at)
            SELECT ?,?,?,'dead_letter.resolved',?,'{}',strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE ${authority} AND EXISTS(
              SELECT 1 FROM dead_letters l JOIN operationally_closed_dispatches closed ON closed.dispatch_id=l.dispatch_id
              WHERE l.id=? AND l.resolved_at IS NULL AND closed.organization_id=?
            ) ON CONFLICT(id) DO NOTHING`,
          )
          .bind(
            auditId,
            ctx.organizationId,
            ctx.userId,
            id,
            ...authorityValues,
            id,
            ctx.organizationId,
          ),
        db
          .prepare(
            `UPDATE dead_letters SET resolved_at=(
              SELECT created_at FROM audit_log WHERE id=? AND organization_id=?
              AND resource_id=? AND action='dead_letter.resolved'
            ) WHERE id=? AND resolved_at IS NULL AND changes()=1
            AND EXISTS(SELECT 1 FROM operationally_closed_dispatches closed
              WHERE closed.organization_id=? AND closed.dispatch_id=dead_letters.dispatch_id)
            AND EXISTS(SELECT 1 FROM audit_log WHERE id=? AND organization_id=?
              AND resource_id=dead_letters.id AND action='dead_letter.resolved')`,
          )
          .bind(
            auditId,
            ctx.organizationId,
            id,
            id,
            ctx.organizationId,
            auditId,
            ctx.organizationId,
          ),
      ]);
    }
    const resolved = await read();
    if (!resolved?.resolved_at)
      throw new DomainError(
        "INCIDENT_RESOLUTION_CHANGED",
        "Current authority or incident state changed. Refresh the original incident.",
        409,
      );
    return {
      id: resolved.id,
      dispatchId: resolved.dispatch_id,
      resolvedAt: resolved.resolved_at,
    };
  }
}
