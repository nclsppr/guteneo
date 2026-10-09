/** Successful connections only. A MCP observation is at most one per client/day. */
type ConnectionEvent = {
  organizationId: string;
  userId: string;
  kind: "browser" | "native" | "mcp";
  connectionId: string;
};
type ObservationCacheEntry = { expiresAt: number; pending: Promise<void> };
const OBSERVATION_TTL_MS = 15 * 60_000;
const MAX_OBSERVATIONS = 256;
// This cache only suppresses optional telemetry writes. Authentication and
// current membership/connection authority are always checked independently.
const observations = new WeakMap<
  D1Database,
  Map<string, ObservationCacheEntry>
>();

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
  event: ConnectionEvent,
): Promise<void> {
  const timestamp = Date.now();
  const now = new Date(timestamp).toISOString();
  const day = now.slice(0, 10);
  let cache = observations.get(db);
  if (!cache) {
    cache = new Map();
    observations.set(db, cache);
  }
  const key = JSON.stringify([
    event.organizationId,
    event.userId,
    event.kind,
    event.connectionId,
    day,
  ]);
  const previous = cache.get(key);
  if (previous && previous.expiresAt > timestamp) {
    await previous.pending;
    return;
  }
  cache.delete(key);
  while (cache.size >= MAX_OBSERVATIONS)
    cache.delete(cache.keys().next().value!);
  const entry: ObservationCacheEntry = {
    expiresAt: timestamp + OBSERVATION_TTL_MS,
    pending: Promise.resolve(),
  };
  cache.set(key, entry);
  entry.pending = Promise.resolve()
    .then(async () => {
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
          day,
          event.organizationId,
          event.userId,
        )
        .run();
    })
    .catch(() => {
      // Logging is optional: never fail identity or a business operation, and
      // allow a later authenticated request to retry only this observation.
      if (cache.get(key) === entry) cache.delete(key);
    });
  await entry.pending;
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
