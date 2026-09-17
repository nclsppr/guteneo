/** Only for disposable Miniflare databases between tests, never application code. */
export async function resetFixtureMemberships(db: D1Database): Promise<void> {
  const trigger = await db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='memberships_keep_last_admin_delete'",
    )
    .first<{ sql: string }>();
  if (!trigger?.sql) throw new Error("Missing last-admin fixture guard");
  // D1 batches are atomic: the exact deployed guard is restored before any test
  // runs, and a failed reset rolls back the deletion and the schema change.
  await db.batch([
    db.prepare("DROP TRIGGER memberships_keep_last_admin_delete"),
    db.prepare("DELETE FROM memberships"),
    db.prepare(trigger.sql),
  ]);
}
