import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { unstable_splitSqlQuery } from "wrangler";

// D1's remote query parser currently confuses CASE END with trigger END.
// These exact guard-only CASE expressions have no result or ELSE branch:
// WHERE and CASE WHEN both raise only when the predicate evaluates to true.
// Original migrations stay immutable; only the transport representation changes.
export function normalizeD1TriggerGuards(source) {
  let replacements = 0;
  const sql = source.replace(
    /SELECT CASE WHEN ([^;]+?) THEN RAISE\(ABORT,('(?:''|[^'])*')\) END;/g,
    (_match, predicate, message) => {
      if (/\b(?:CASE|THEN|ELSE|END)\b/i.test(predicate))
        throw new Error("Nested CASE guard needs explicit review");
      replacements++;
      return `SELECT RAISE(ABORT,${message}) WHERE ${predicate};`;
    },
  );
  if (/\bCASE\b/.test(unstable_splitSqlQuery(sql).join("\n")))
    throw new Error("Unsupported CASE expression needs explicit review");
  return { sql, replacements };
}

const digest = (text) => createHash("sha256").update(text).digest("hex");
export async function migrationPlan() {
  const directory = new URL("../migrations/", import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const plan = [];
  for (const name of names) {
    const source = await readFile(new URL(name, directory), "utf8");
    const transformed = normalizeD1TriggerGuards(source);
    const statements = unstable_splitSqlQuery(transformed.sql)
      .map((sql) => sql.trim())
      .map((sql) => (sql.endsWith(";") ? sql : `${sql};`));
    // The migration row is inside the same D1 transaction as every schema write.
    statements.push(`INSERT INTO d1_migrations(name) VALUES('${name}');`);
    plan.push({
      name,
      sourceSha256: digest(source),
      transportSha256: digest(statements.join("\n")),
      replacements: transformed.replacements,
      batch: statements.map((sql) => ({ sql })),
    });
  }
  return plan;
}

export async function verifyTransport(includeSchema = false) {
  const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
  const instance = new Miniflare(
    convertV4MiniflareOptions({
      name: "d1-migration-transport-proof",
      modules: true,
      script: 'export default { fetch() { return new Response("proof") } }',
      compatibilityDate: "2026-09-16",
      d1Databases: ["ORIGINAL", "TRANSPORT"],
    }),
  );
  try {
    const original = await instance.getD1Database("ORIGINAL");
    const transport = await instance.getD1Database("TRANSPORT");
    const plan = await migrationPlan();
    for (const database of [original, transport])
      await database
        .prepare(
          "CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
        )
        .run();
    for (const migration of plan) {
      const source = await readFile(
        new URL(`../migrations/${migration.name}`, import.meta.url),
        "utf8",
      );
      const statements = unstable_splitSqlQuery(source);
      await original.batch([
        ...statements.map((sql) => original.prepare(sql)),
        original
          .prepare("INSERT INTO d1_migrations(name) VALUES(?)")
          .bind(migration.name),
      ]);
      try {
        await transport.batch(
          migration.batch.map(({ sql }) => transport.prepare(sql)),
        );
      } catch (error) {
        throw new Error(`Transport ${migration.name}: ${error.message}`, {
          cause: error,
        });
      }
    }
    const schema = async (database) => {
      const result = await database
        .prepare(
          "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY type,name",
        )
        .all();
      return result.results.map((row) => ({
        ...row,
        sql: row.sql
          ? normalizeD1TriggerGuards(row.sql).sql.replace(/\s+/g, " ").trim()
          : null,
      }));
    };
    const first = await schema(original);
    const second = await schema(transport);
    if (JSON.stringify(first) !== JSON.stringify(second))
      throw new Error("Transport schema differs from source schema");
    const outcomes = [];
    for (const [label, database] of [
      ["original", original],
      ["transport", transport],
    ]) {
      const trigger =
        "CREATE TRIGGER probe BEFORE INSERT ON guard_probe BEGIN SELECT CASE WHEN NEW.value=1 THEN RAISE(ABORT,'guard_rejected') END; END;";
      await database.prepare("CREATE TABLE guard_probe(value INTEGER)").run();
      await database
        .prepare(
          label === "transport"
            ? normalizeD1TriggerGuards(trigger).sql
            : trigger,
        )
        .run();
      const results = [];
      for (const value of [1, 0, null, -1]) {
        try {
          await database
            .prepare("INSERT INTO guard_probe(value) VALUES(?)")
            .bind(value)
            .run();
          results.push("allowed");
        } catch (error) {
          if (!String(error).includes("guard_rejected")) throw error;
          results.push("rejected");
        }
      }
      outcomes.push(results);
      await database.prepare("DROP TABLE guard_probe").run();
      const integrity = await database.prepare("PRAGMA quick_check").first();
      const foreignKeys = await database
        .prepare("PRAGMA foreign_key_check")
        .all();
      if (integrity?.quick_check !== "ok" || foreignKeys.results.length)
        throw new Error("Migration integrity proof failed");
    }
    if (
      JSON.stringify(outcomes[0]) !== JSON.stringify(outcomes[1]) ||
      outcomes[0][0] !== "rejected"
    )
      throw new Error("Guard truth semantics differ");
    return {
      migrations: plan.length,
      normalizedGuards: plan.reduce((n, m) => n + m.replacements, 0),
      schemaObjects: first.length,
      ...(includeSchema ? { schema: first } : {}),
      schemaEquivalent: true,
      guardOutcomes: outcomes[0],
      quickCheck: "ok",
      foreignKeyViolations: 0,
    };
  } finally {
    await instance.dispose();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes("--verify"))
    console.log(
      JSON.stringify(
        await verifyTransport(process.argv.includes("--schema")),
        null,
        2,
      ),
    );
  else {
    const plan = await migrationPlan();
    console.log(
      JSON.stringify(
        process.argv.includes("--json")
          ? plan
          : plan.map(({ batch, ...entry }) => ({
              ...entry,
              statements: batch.length,
            })),
        null,
        2,
      ),
    );
  }
}
