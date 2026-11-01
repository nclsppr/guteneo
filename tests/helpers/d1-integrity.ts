import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Miniflare } from "miniflare";

const marker = "migration_integrity_identity";
const markerSql =
  "CREATE TABLE migration_integrity_identity(role TEXT PRIMARY KEY,nonce TEXT NOT NULL,schema_sha256 TEXT NOT NULL)";
const tablesSql =
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name";

async function checkTables(database: D1Database) {
  const mode = await database
    .prepare("PRAGMA ignore_check_constraints")
    .first<{ ignore_check_constraints: number }>();
  if (mode?.ignore_check_constraints !== 0)
    throw new Error("D1 fixture CHECK enforcement is disabled");
  try {
    const result = await database.prepare("PRAGMA quick_check").all();
    if (result.results.length !== 1 || result.results[0].quick_check !== "ok")
      throw new Error("D1 fixture global integrity failed");
  } catch (error) {
    if (!String(error).includes("SQLITE_NOMEM")) throw error;
    // Every application table is still checked by the actual D1 engine below.
    // The fixture's complete physical file is checked after its final mutation.
  }
  const tables = await database.prepare(tablesSql).all<{ name: string }>();
  if (!tables.results.length) throw new Error("D1 fixture has no tables");
  const checked = [];
  for (const { name } of tables.results) {
    if (typeof name !== "string" || !name)
      throw new Error("D1 fixture table inventory is invalid");
    const literal = name.replaceAll("'", "''");
    const result = await database
      .prepare(`PRAGMA quick_check('${literal}')`)
      .all();
    if (result.results.length !== 1 || result.results[0].quick_check !== "ok")
      throw new Error("D1 fixture table integrity failed");
    checked.push(name);
  }
  const foreignKeys = await database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.results.length)
    throw new Error("D1 fixture foreign key integrity failed");
  return checked;
}

export interface D1IntegrityFixture {
  persistencePath: string;
  check(database: D1Database): Promise<{ quick_check: "ok" }>;
  dispose(instance: Miniflare, database: D1Database): Promise<void>;
}

/** Preserve global physical integrity evidence for populated migration fixtures.
 * Each historical assertion checks every D1 application table. The final hook
 * additionally checks the same persisted file after all test mutations, using
 * the migration verifier's strict identity/checkpoint/native-global protocol.
 */
export async function createD1IntegrityFixture(): Promise<D1IntegrityFixture> {
  const persistencePath = await realpath(
    await mkdtemp(join(tmpdir(), "guteneo-migration-proof-")),
  );
  await chmod(persistencePath, 0o700);
  const nonce = randomUUID();
  let requested = false;
  return {
    persistencePath,
    async check(database) {
      await checkTables(database);
      requested = true;
      return { quick_check: "ok" };
    },
    async dispose(instance, database) {
      let disposed = false;
      try {
        if (!requested) return;
        const rows = await database
          .prepare(
            "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY type,name",
          )
          .all<{ type: string; name: string; sql: string | null }>();
        const schema = rows.results.map(({ type, name, sql }) => ({
          type,
          name,
          sql,
        }));
        if (!schema.length || schema.some(({ name }) => name === marker))
          throw new Error("D1 fixture integrity identity is ambiguous");
        const schemaSha256 = createHash("sha256")
          .update(JSON.stringify(schema))
          .digest("hex");
        await database.prepare(markerSql).run();
        await database
          .prepare(`INSERT INTO ${marker} VALUES(?,?,?)`)
          .bind("fixture", nonce, schemaSha256)
          .run();
        const identity = await database
          .prepare(`SELECT role,nonce,schema_sha256 FROM ${marker}`)
          .all<{ role: string; nonce: string; schema_sha256: string }>();
        if (
          identity.results.length !== 1 ||
          identity.results[0].role !== "fixture" ||
          identity.results[0].nonce !== nonce ||
          identity.results[0].schema_sha256 !== schemaSha256
        )
          throw new Error("D1 fixture physical identity differs");
        const d1Tables = await checkTables(database);
        await instance.dispose();
        disposed = true;
        const proof = JSON.parse(
          execFileSync(
            "python3",
            [
              fileURLToPath(
                new URL(
                  "../../scripts/verify-sqlite-integrity.py",
                  import.meta.url,
                ),
              ),
            ],
            {
              input: JSON.stringify({
                version: 1,
                kind: "isolated_fixture",
                root: persistencePath,
                nonce,
                expected: [{ role: "fixture", schema, schemaSha256, d1Tables }],
              }),
              encoding: "utf8",
              timeout: 60_000,
              maxBuffer: 2 * 1024 * 1024,
              stdio: ["pipe", "pipe", "pipe"],
            },
          ),
        );
        const file = proof.databases?.[0];
        if (
          proof.version !== 1 ||
          proof.status !== "passed" ||
          proof.kind !== "isolated_fixture" ||
          proof.checkpointedBeforeReadOnly !== true ||
          proof.hostQueryOnlyConstraintsVerified !== true ||
          proof.databases?.length !== 1 ||
          file?.role !== "fixture" ||
          !/^[0-9a-f]{64}$/.test(file.sha256) ||
          file.tableCount !== d1Tables.length ||
          file.quickCheck !== "ok" ||
          file.foreignKeyViolations !== 0
        )
          throw new Error("D1 fixture physical integrity proof is incomplete");
      } finally {
        if (!disposed) await instance.dispose();
        await rm(persistencePath, { recursive: true, force: true });
      }
    },
  };
}
