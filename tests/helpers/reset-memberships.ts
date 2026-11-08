/** Only for disposable Miniflare databases between tests, never application code. */
export async function resetFixtureMemberships(db: D1Database): Promise<void> {
  const triggers = await db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name IN('memberships_keep_last_admin_delete','memberships_keep_last_active_admin_delete') ORDER BY name",
    )
    .all<{ name: string; sql: string }>();
  if (
    !triggers.results.some(
      (trigger) => trigger.name === "memberships_keep_last_admin_delete",
    ) ||
    triggers.results.some((trigger) => !trigger.sql)
  )
    throw new Error("Missing last-admin fixture guard");
  // D1 batches are atomic: the exact deployed guards are restored before any test
  // runs, and a failed reset rolls back the deletion and the schema change.
  await db.batch([
    ...triggers.results.map((trigger) =>
      db.prepare(`DROP TRIGGER ${trigger.name}`),
    ),
    db.prepare("DELETE FROM memberships"),
    ...triggers.results.map((trigger) => db.prepare(trigger.sql)),
  ]);
}
