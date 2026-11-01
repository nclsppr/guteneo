import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
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
  const persistence = await realpath(
    await mkdtemp(join(tmpdir(), "guteneo-migration-proof-")),
  );
  await chmod(persistence, 0o700);
  const nonce = randomUUID();
  const instance = new Miniflare(
    convertV4MiniflareOptions({
      name: "d1-migration-transport-proof",
      modules: true,
      script: 'export default { fetch() { return new Response("proof") } }',
      compatibilityDate: "2026-09-16",
      d1Databases: ["ORIGINAL", "TRANSPORT"],
      resourcePersistencePath: persistence,
    }),
  );
  let disposed = false;
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
    const rawSchema = async (database) => {
      const result = await database
        .prepare(
          "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY type,name",
        )
        .all();
      return result.results.map((row) => ({
        type: row.type,
        name: row.name,
        sql: row.sql,
      }));
    };
    const schemas = [await rawSchema(original), await rawSchema(transport)];
    const normalizedSchema = (schema) =>
      schema.map((row) => ({
        ...row,
        sql: row.sql
          ? normalizeD1TriggerGuards(row.sql).sql.replace(/\s+/g, " ").trim()
          : null,
      }));
    const first = normalizedSchema(schemas[0]);
    const second = normalizedSchema(schemas[1]);
    if (JSON.stringify(first) !== JSON.stringify(second))
      throw new Error("Transport schema differs from source schema");
    const outcomes = [];
    const expected = [];
    const d1Checks = [];
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
      const checkMode = await database
        .prepare("PRAGMA ignore_check_constraints")
        .first();
      if (checkMode?.ignore_check_constraints !== 0)
        throw new Error(
          "D1 CHECK constraints must be enabled for integrity proof",
        );
      const schema = schemas[label === "original" ? 0 : 1];
      const schemaSha256 = digest(JSON.stringify(schema));
      await database
        .prepare(
          "CREATE TABLE migration_integrity_identity(role TEXT PRIMARY KEY,nonce TEXT NOT NULL,schema_sha256 TEXT NOT NULL)",
        )
        .run();
      await database
        .prepare("INSERT INTO migration_integrity_identity VALUES(?,?,?)")
        .bind(label, nonce, schemaSha256)
        .run();
      const identity = await database
        .prepare(
          "SELECT role,nonce,schema_sha256 FROM migration_integrity_identity",
        )
        .all();
      if (
        identity.results.length !== 1 ||
        identity.results[0].role !== label ||
        identity.results[0].nonce !== nonce ||
        identity.results[0].schema_sha256 !== schemaSha256
      )
        throw new Error("Migration physical database identity differs");
      // The complete schema can exceed D1's VDBE allocation budget even when
      // every table is valid. Keep CHECK enforcement on and exercise every
      // application table through D1; framework-private tables are checked by
      // the native global proof. After shutdown, run that global check on
      // the same SQLite files, including the freelist, using native SQLite.
      let globalQuickCheck = "ok";
      try {
        const result = await database.prepare("PRAGMA quick_check").all();
        if (
          result.results.length !== 1 ||
          result.results[0].quick_check !== "ok"
        )
          throw new Error("Migration global D1 integrity proof failed");
      } catch (error) {
        if (!String(error).includes("SQLITE_NOMEM")) throw error;
        globalQuickCheck = "resource_limit";
      }
      const tables = await database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name",
        )
        .all();
      if (!tables.results.length)
        throw new Error("Migration integrity table inventory is empty");
      const checkedTables = [];
      for (const { name } of tables.results) {
        if (typeof name !== "string" || !name)
          throw new Error("Migration integrity table inventory is invalid");
        const literal = name.replaceAll("'", "''");
        const result = await database
          .prepare(`PRAGMA quick_check('${literal}')`)
          .all();
        if (
          result.results.length !== 1 ||
          result.results[0].quick_check !== "ok"
        )
          throw new Error("Migration D1 table integrity proof failed");
        checkedTables.push(name);
      }
      const foreignKeys = await database
        .prepare("PRAGMA foreign_key_check")
        .all();
      if (foreignKeys.results.length)
        throw new Error("Migration integrity proof failed");
      expected.push({
        role: label,
        schema,
        schemaSha256,
        d1Tables: checkedTables,
      });
      d1Checks.push({
        role: label,
        globalQuickCheck,
        tablesChecked: checkedTables.length,
        checkConstraintsEnabled: true,
        foreignKeyViolations: 0,
      });
    }
    if (
      JSON.stringify(outcomes[0]) !== JSON.stringify(outcomes[1]) ||
      outcomes[0][0] !== "rejected"
    )
      throw new Error("Guard truth semantics differ");
    await instance.dispose();
    disposed = true;
    // The checker identifies every file before its local checkpoint preparation.
    // It verifies CHECKs through native query-only connections, applies committed
    // WAL pages without DML/DDL, then checks these same files globally through
    // immutable read-only connections whose data-file hashes must stay unchanged.
    const physical = JSON.parse(
      execFileSync(
        "python3",
        [
          fileURLToPath(
            new URL("./verify-sqlite-integrity.py", import.meta.url),
          ),
        ],
        {
          input: JSON.stringify({
            version: 1,
            root: persistence,
            nonce,
            expected,
          }),
          encoding: "utf8",
          timeout: 60_000,
          maxBuffer: 2 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        },
      ),
    );
    if (
      physical.version !== 1 ||
      physical.status !== "passed" ||
      physical.kind !== "migration_pair" ||
      physical.checkpointedBeforeReadOnly !== true ||
      physical.hostQueryOnlyConstraintsVerified !== true ||
      physical.databases?.length !== 2 ||
      physical.databases
        .map((entry) => entry.role)
        .sort()
        .join(",") !== "original,transport"
    )
      throw new Error("Migration physical integrity proof is incomplete");
    for (const entry of physical.databases) {
      const checked = expected.find((item) => item.role === entry.role);
      if (
        !checked ||
        !/^[0-9a-f]{64}$/.test(entry.sha256) ||
        entry.tableCount !== checked.d1Tables.length ||
        entry.quickCheck !== "ok" ||
        entry.foreignKeyViolations !== 0
      )
        throw new Error("Migration physical integrity proof is incomplete");
    }
    return {
      migrations: plan.length,
      normalizedGuards: plan.reduce((n, m) => n + m.replacements, 0),
      schemaObjects: first.length,
      ...(includeSchema ? { schema: first } : {}),
      schemaEquivalent: true,
      guardOutcomes: outcomes[0],
      quickCheck: "ok",
      quickCheckMethod: "d1_each_table_and_readonly_persisted_sqlite_global",
      d1Checks,
      physicalSqlite: physical,
      foreignKeyViolations: 0,
    };
  } finally {
    if (!disposed) await instance.dispose();
    await rm(persistence, { recursive: true, force: true });
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
