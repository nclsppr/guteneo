/** Successful connections only. A MCP observation is at most one per client/day. */
export function connectionCountry(request: Request): string | null {
  const country = (request as Request & { cf?: { country?: unknown } }).cf
    ?.country;
  return typeof country === "string" &&
    /^[A-Z]{2}$/.test(country) &&
    country !== "XX" &&
    country !== "T1"
    ? country
    : null;
}
export async function recordConnectionEvent(
  db: D1Database,
  request: Request,
  event: {
    organizationId: string;
    userId: string;
    kind: "browser" | "native" | "mcp";
    connectionId: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO connection_events(id,organization_id,user_id,kind,connection_id,country,occurred_at,day)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM memberships WHERE organization_id=? AND user_id=?)`,
    )
    .bind(
      crypto.randomUUID(),
      event.organizationId,
      event.userId,
      event.kind,
      event.connectionId,
      connectionCountry(request),
      now,
      now.slice(0, 10),
      event.organizationId,
      event.userId,
    )
    .run();
}
export async function cleanupBelvedereTelemetry(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  await db.batch([
    db
      .prepare(
        "DELETE FROM connection_events WHERE id IN (SELECT id FROM connection_events WHERE occurred_at<? LIMIT 1000)",
      )
      .bind(cutoff),
    db
      .prepare(
        "DELETE FROM platform_access_audit WHERE id IN (SELECT id FROM platform_access_audit WHERE occurred_at<? LIMIT 1000)",
      )
      .bind(cutoff),
  ]);
}
