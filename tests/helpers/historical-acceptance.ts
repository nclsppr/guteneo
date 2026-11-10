import type { ActorContext, Dispatch } from "../../packages/domain/src/index";

/** Populate an existing approval/financial commitment before the current runtime
 * schema exists. Every real historical SQL guard and reservation/outbox trigger
 * stays enabled. Current-schema tests must use DomainService instead. */
export async function seedHistoricalAcceptance(
  db: D1Database,
  actor: ActorContext,
  dispatch: Dispatch,
): Promise<Dispatch> {
  const createdAt = dispatch.created_at;
  const expiresAt = new Date(Math.min(
    Date.parse(createdAt) + 60_000,
    dispatch.quote_expires_at ? Date.parse(dispatch.quote_expires_at) : Infinity,
  )).toISOString();
  const result = await db.batch([
    db.prepare("INSERT INTO approvals(id,organization_id,dispatch_id,user_id,fingerprint,expires_at,created_at,recipient_requested,approval_kind) VALUES(?,?,?,?,?,?,?,1,'browser')")
      .bind(crypto.randomUUID(), actor.organizationId, dispatch.id, actor.userId, dispatch.fingerprint, expiresAt, createdAt),
    db.prepare("SELECT changes() AS changed"),
    db.prepare("UPDATE dispatches SET status='queued',updated_at=? WHERE organization_id=? AND id=? AND status='prepared'")
      .bind(createdAt, actor.organizationId, dispatch.id),
    db.prepare("SELECT changes() AS changed"),
  ]);
  // D1 meta.changes includes trigger writes. SQL changes() retains the last
  // top-level statement's count after those financial/outbox triggers return.
  if ((result[1].results[0] as { changed: number }).changed !== 1 || (result[3].results[0] as { changed: number }).changed !== 1)
    throw new Error("Historical approval and acceptance did not commit exactly once.");
  return { ...dispatch, status: "queued", updated_at: createdAt };
}
