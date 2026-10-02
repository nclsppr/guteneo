/**
 * Current service against a pre-0042 schema, only for historical upgrade proofs.
 * All such fixtures are administrators and the old schema had no supervisor
 * options. Project those absent options as false without altering historical
 * tables, writes, triggers or the migration under test.
 */
export function historicalRoleProjection(db: D1Database): D1Database {
  return new Proxy(db, {
    get(target, property) {
      if (property === "prepare")
        return (sql: string) =>
          target.prepare(
            sql
              .replaceAll(
                "m.supervisor_can_approve,m.supervisor_can_report",
                "0 AS supervisor_can_approve,0 AS supervisor_can_report",
              )
              .replace(/\b[a-z_]+\.supervisor_can_approve\b/g, "0")
              .replace(/\b[a-z_]+\.supervisor_can_report\b/g, "0"),
          );
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
