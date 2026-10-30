// One quick_check per table. A single database-wide check compiles every
// table's NOT NULL and CHECK constraints into one program, which exceeds the
// local D1 runtime's memory on CI once the full schema is installed. Per table,
// it still verifies every row's constraints and each table's indexes. D1's
// internal _cf_ tables refuse the pragma and are not part of the schema.
export async function quickCheckTables(database) {
  const tables = await database
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name",
    )
    .all();
  const problems = [];
  for (const { name } of tables.results) {
    const rows = await database
      .prepare(`PRAGMA quick_check("${name.replaceAll('"', '""')}")`)
      .all();
    for (const row of rows.results)
      if (row.quick_check !== "ok")
        problems.push(`${name}: ${row.quick_check}`);
  }
  return problems.length ? problems : "ok";
}
