import {
  DomainError,
  type ActorContext,
  type Mode,
} from "../../../packages/domain/src/index";

/** The final write requires the actual browser credential, not a cached role. */
export function browserAdministratorFence(ctx: ActorContext, mode: Mode) {
  if (
    ctx.actor !== "browser" ||
    ctx.role !== "admin" ||
    !ctx.documentSessionHash ||
    !/^[a-f0-9]{64}$/.test(ctx.documentSessionHash)
  )
    throw new DomainError(
      "ADMIN_REQUIRED",
      "A current browser administrator session is required.",
      403,
    );
  return {
    condition: `EXISTS(SELECT 1 FROM browser_sessions b
      JOIN memberships m ON m.organization_id=b.organization_id AND m.user_id=b.user_id
      JOIN organizations o ON o.id=m.organization_id
      WHERE b.token_hash=? AND b.organization_id=? AND b.user_id=? AND m.role='admin'
      AND o.mode=? AND (?='simulation' OR b.is_development=0)
      AND b.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NOT EXISTS(SELECT 1 FROM account_deletion_requests r WHERE r.user_id=b.user_id AND r.status IN ('processing','completed')))`,
    values: [
      ctx.documentSessionHash,
      ctx.organizationId,
      ctx.userId,
      mode,
      mode,
    ],
  };
}

export async function setBrowserChannelControl(
  db: D1Database,
  ctx: ActorContext,
  mode: Mode,
  channel: "fax" | "email" | "postal",
  enabled: boolean,
) {
  const fence = browserAdministratorFence(ctx, mode);
  // The UPDATE is the authority instant. No concurrent DB change can interleave
  // inside this batch; its audit follows changes(), without a second clock gate
  // that could commit the control but omit its receipt at session expiry.
  const results = await db.batch([
    db
      .prepare(
        `UPDATE channel_controls SET enabled=? WHERE organization_id=? AND channel=? AND ${fence.condition} RETURNING channel`,
      )
      .bind(Number(enabled), ctx.organizationId, channel, ...fence.values),
    db
      .prepare(
        `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at)
      SELECT ?,?,?,'channel.control',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE changes()=1 RETURNING id`,
      )
      .bind(
        crypto.randomUUID(),
        ctx.organizationId,
        ctx.userId,
        channel,
        JSON.stringify({ enabled }),
      ),
  ]);
  if (results[0].results.length !== 1 || results[1].results.length !== 1)
    throw new DomainError(
      "ADMIN_REQUIRED",
      "A current browser administrator session is required.",
      403,
    );
  return { channel, enabled };
}
