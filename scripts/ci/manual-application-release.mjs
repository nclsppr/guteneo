import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireMainRun,
  requireSuccessfulJobs,
} from "./dependency-release.mjs";
import { createValidationReader } from "./validation-proof.mjs";
import {
  deployPublic,
  verifyMainSource,
  verifyReleaseTag,
} from "../deploy-public.mjs";

const repository = "nclsppr/guteneo";
const account = "39ac9fada6cba44d9ecf09d467609e69";
const database = "f86235fa-58c1-404f-a9a6-e2d657315854";
const sha = /^[a-f0-9]{40}$/;
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const positive = (value) => Number.isSafeInteger(value) && value > 0;
function demand(condition, code) {
  if (!condition) throw new Error(`MANUAL_RELEASE_${code}`);
}
function exactNumber(value) {
  demand(
    typeof value === "string" &&
      /^[1-9]\d*$/.test(value) &&
      positive(Number(value)),
    "INPUT_INVALID",
  );
  return Number(value);
}
export function manualContext(env, event) {
  demand(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      env.GITHUB_REF === "refs/heads/main" &&
      env.GITHUB_REPOSITORY === repository &&
      env.GH_TOKEN &&
      env.MANUAL_RELEASE_EVIDENCE_DIR,
    "TRUSTED_WORKFLOW_REQUIRED",
  );
  demand(
    sha.test(event?.inputs?.source_commit ?? "") &&
      env.GITHUB_SHA === event.inputs.source_commit,
    "DISPATCH_COMMIT_MISMATCH",
  );
  return {
    repository,
    repositoryId: exactNumber(env.GITHUB_REPOSITORY_ID),
    runId: exactNumber(event.inputs.ci_run_id),
    runAttempt: exactNumber(event.inputs.ci_run_attempt),
    sourceCommit: event.inputs.source_commit,
  };
}

/** Same canonical full/reuse gate as dependency redelivery, without bot eligibility. */
export async function qualifyManualRelease(context, request) {
  const runPath = `actions/runs/${context.runId}`;
  const run = await request(runPath);
  requireMainRun(run, context);
  const currentMain = async () => {
    const main = await request("git/ref/heads/main");
    demand(main?.object?.sha === context.sourceCommit, "MAIN_ADVANCED");
  };
  await currentMain();
  const jobs = [];
  let total;
  for (let page = 1; page <= 20; page++) {
    const response = await request(
      `${runPath}/jobs?filter=latest&per_page=100&page=${page}`,
    );
    demand(
      positive(response?.total_count) &&
        Array.isArray(response.jobs) &&
        response.jobs.length <= 100,
      "JOB_INVENTORY_INVALID",
    );
    total ??= response.total_count;
    demand(
      total === response.total_count &&
        jobs.length + response.jobs.length <= total,
      "JOB_INVENTORY_CHANGED",
    );
    jobs.push(...response.jobs);
    if (jobs.length === total) break;
    demand(response.jobs.length > 0 && page < 20, "JOB_INVENTORY_INCOMPLETE");
  }
  const validationMode = requireSuccessfulJobs(jobs, context.runId);
  requireMainRun(await request(runPath), context);
  await currentMain();
  return {
    sourceCommit: context.sourceCommit,
    runId: context.runId,
    runAttempt: context.runAttempt,
    validationMode,
    jobs: jobs.map(({ id, name, conclusion }) => ({ id, name, conclusion })),
  };
}

const reviewedIndexes = [
  {
    name: "0081_approval_request_lookup.sql",
    index: "approval_request_receipts",
    sql: "CREATE INDEX approval_request_receipts ON audit_log(organization_id,resource_id) WHERE action='dispatch.approval_requested';",
  },
  {
    name: "0082_pdf_validation_history.sql",
    index: "pdf_validation_history",
    sql: "CREATE INDEX pdf_validation_history ON pdf_validations(organization_id,created_at DESC,id DESC);",
  },
];
const stripComments = (sql) => sql.replace(/^\s*--[^\n]*(?:\n|$)/gm, "").trim();
const normalizeSql = (sql) => sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
export function requireReviewedPlan(plan) {
  demand(
    Array.isArray(plan) &&
      plan.length === 82 &&
      plan.every((entry, index) =>
        entry.name.startsWith(`${String(index + 1).padStart(4, "0")}_`),
      ),
    "REVIEWED_MIGRATION_PLAN_REQUIRED",
  );
  for (const [offset, reviewed] of reviewedIndexes.entries()) {
    const entry = plan[80 + offset];
    demand(
      entry.name === reviewed.name &&
        entry.replacements === 0 &&
        /^[a-f0-9]{64}$/.test(entry.sourceSha256) &&
        /^[a-f0-9]{64}$/.test(entry.transportSha256) &&
        entry.batch?.length === 2 &&
        normalizeSql(stripComments(entry.batch[0].sql)) ===
          normalizeSql(reviewed.sql) &&
        entry.batch[1].sql ===
          `INSERT INTO d1_migrations(name) VALUES('${reviewed.name}');`,
      "ONLY_REVIEWED_INDEX_MIGRATIONS_ALLOWED",
    );
  }
}
export function requireLedger(rows, plan) {
  demand(
    Array.isArray(rows) &&
      rows.length >= 80 &&
      rows.length <= 82 &&
      rows.every((row, index) => row.name === plan[index]?.name),
    "EXACT_MIGRATION_PREFIX_REQUIRED",
  );
  return rows.length;
}
function comparableSchema(rows) {
  demand(
    Array.isArray(rows) &&
      rows.length > 0 &&
      rows.length <= 2000 &&
      rows.every(
        (row) =>
          typeof row.name === "string" &&
          ["table", "index", "trigger", "view"].includes(row.type) &&
          (row.sql === null || typeof row.sql === "string"),
      ),
    "SCHEMA_INVALID",
  );
  return rows
    .filter((row) => row.name !== "d1_migrations")
    .map(({ type, name, sql }) => ({
      type,
      name,
      sql: sql === null ? null : normalizeSql(sql),
    }))
    .sort(
      (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
    );
}
export function requireSchema(rows, expected, applied) {
  const absent = new Set(
    reviewedIndexes.slice(applied - 80).map((entry) => entry.index),
  );
  const wanted = comparableSchema(expected).filter(
    (row) => !absent.has(row.name),
  );
  const actual = comparableSchema(rows);
  demand(JSON.stringify(actual) === JSON.stringify(wanted), "SCHEMA_MISMATCH");
  return digest(actual);
}

/** Fixed existing database only; no arbitrary URL, SQL CLI or retry is exposed. */
export function createD1Client(token, fetcher = fetch) {
  demand(
    typeof token === "string" && token.length > 0,
    "D1_CREDENTIAL_REQUIRED",
  );
  const origin = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}`;
  return async (operation, batch) => {
    demand(
      operation === "bookmark" || operation === "query",
      "D1_OPERATION_INVALID",
    );
    let response;
    try {
      response = await fetcher(
        operation === "bookmark"
          ? `${origin}/time_travel/bookmark`
          : `${origin}/query`,
        {
          method: operation === "bookmark" ? "GET" : "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          ...(operation === "query" ? { body: JSON.stringify({ batch }) } : {}),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch {
      throw new Error("MANUAL_RELEASE_D1_RESPONSE_UNKNOWN");
    }
    demand(response.ok, "D1_REQUEST_REFUSED");
    const reader = response.body?.getReader();
    demand(reader, "D1_RESPONSE_INVALID");
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        demand(size <= 4 * 1024 * 1024, "D1_RESPONSE_TOO_LARGE");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("MANUAL_RELEASE_D1_RESPONSE_INVALID");
    }
    demand(body.success === true, "D1_QUERY_FAILED");
    if (operation === "bookmark") {
      demand(
        typeof body.result?.bookmark === "string" &&
          /^[A-Za-z0-9-]{1,200}$/.test(body.result.bookmark),
        "BOOKMARK_REQUIRED",
      );
      return body.result.bookmark;
    }
    demand(
      Array.isArray(body.result) &&
        body.result.length === batch.length &&
        body.result.every(
          (entry) => entry.success === true && Array.isArray(entry.results),
        ),
      "D1_QUERY_FAILED",
    );
    return body.result;
  };
}

const ledgerSql = "SELECT name FROM d1_migrations ORDER BY id";
const schemaSql =
  "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY type,name";
/** Schema first. A lost mutation response stops; inspect the ledger before rerun. */
export async function migrateReviewedIndexes({
  plan,
  expectedSchema,
  request,
  ensureCurrent,
  record = async () => {},
}) {
  requireReviewedPlan(plan);
  const query = async (sql) => (await request("query", [{ sql }]))[0].results;
  const inspect = async () => {
    const results = await request("query", [
      { sql: ledgerSql },
      { sql: schemaSql },
      { sql: "PRAGMA foreign_keys" },
      { sql: "PRAGMA ignore_check_constraints" },
    ]);
    const applied = requireLedger(results[0].results, plan);
    const schemaSha256 = requireSchema(
      results[1].results,
      expectedSchema,
      applied,
    );
    demand(
      results[2].results.length === 1 &&
        results[2].results[0].foreign_keys === 1 &&
        results[3].results.length === 1 &&
        results[3].results[0].ignore_check_constraints === 0,
      "DATABASE_CONSTRAINTS_REQUIRED",
    );
    return { applied, schemaSha256 };
  };
  await ensureCurrent();
  const before = await inspect();
  const bookmark = await request("bookmark");
  const evidence = {
    status: "schema-pending",
    before,
    preMigrationBookmark: bookmark,
    migrations: [],
  };
  await record(evidence);
  for (const migration of plan.slice(before.applied)) {
    await ensureCurrent();
    // Readback before each write also fences another completed migration/operator.
    const current = await inspect();
    demand(
      current.applied === before.applied + evidence.migrations.length,
      "MIGRATION_LEDGER_CHANGED",
    );
    evidence.status = "migration-in-flight";
    evidence.attemptedMigration = migration.name;
    await record(evidence);
    await request("query", migration.batch);
    evidence.status = "schema-pending";
    delete evidence.attemptedMigration;
    evidence.migrations.push({
      name: migration.name,
      sourceSha256: migration.sourceSha256,
      transportSha256: migration.transportSha256,
    });
    await record(evidence);
  }
  const after = await inspect();
  demand(after.applied === 82, "MIGRATION_READBACK_FAILED");
  const quick = await query("PRAGMA quick_check");
  demand(
    quick.length === 1 && quick[0].quick_check === "ok",
    "GLOBAL_INTEGRITY_REQUIRED",
  );
  demand(
    (await query("PRAGMA foreign_key_check")).length === 0,
    "FOREIGN_KEY_VIOLATION",
  );
  await ensureCurrent();
  const result = {
    ...evidence,
    status: "schema-verified",
    after,
    postMigrationBookmark: await request("bookmark"),
    quickCheck: "ok",
    foreignKeyViolations: 0,
    verifiedAt: new Date().toISOString(),
  };
  await record(result);
  return result;
}

export function requireSchemaReceipt(schema, context, qualification) {
  demand(
    schema.status === "schema-verified" &&
      schema.sourceCommit === context.sourceCommit &&
      schema.runId === context.runId &&
      schema.runAttempt === context.runAttempt &&
      schema.workflowRunId === qualification.workflowRunId &&
      schema.workflowRunAttempt === qualification.workflowRunAttempt &&
      schema.version === qualification.version &&
      schema.after?.applied === 82 &&
      /^[a-f0-9]{64}$/.test(schema.after?.schemaSha256 ?? "") &&
      schema.quickCheck === "ok" &&
      schema.foreignKeyViolations === 0,
    "SAME_RUN_SCHEMA_PROOF_REQUIRED",
  );
}

async function main(env) {
  const command = process.argv[2];
  demand(
    ["qualify", "schema", "publish"].includes(command) &&
      process.argv.length === 3,
    "COMMAND_INVALID",
  );
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const context = manualContext(env, event);
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const output = resolve(env.MANUAL_RELEASE_EVIDENCE_DIR);
  demand(
    output.startsWith(`${resolve(env.RUNNER_TEMP)}/`),
    "RUNNER_EVIDENCE_REQUIRED",
  );
  await mkdir(output, { recursive: true, mode: 0o700 });
  const write = (name, value) =>
    writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n");
  const qualify = async () => {
    demand(
      verifyMainSource(root) === context.sourceCommit,
      "CHECKOUT_COMMIT_MISMATCH",
    );
    const result = await qualifyManualRelease(
      context,
      createValidationReader({ token: env.GH_TOKEN }),
    );
    const anchor = await verifyReleaseTag(root, context.sourceCommit);
    const evidence = {
      ...result,
      version: anchor.version,
      tag: anchor.tag,
      workflowRunId: exactNumber(env.GITHUB_RUN_ID),
      workflowRunAttempt: exactNumber(env.GITHUB_RUN_ATTEMPT),
    };
    await write("qualification.json", evidence);
    return evidence;
  };
  const qualification = await qualify();
  if (command === "qualify") return;
  if (command === "schema") {
    demand(env.CLOUDFLARE_D1_MIGRATION_API_TOKEN, "D1_CREDENTIAL_REQUIRED");
    const { migrationPlan, verifyTransport } =
      await import("../migrate-remote.mjs");
    const plan = await migrationPlan();
    requireReviewedPlan(plan);
    const proof = await verifyTransport(true);
    demand(
      proof.schemaEquivalent === true &&
        proof.quickCheck === "ok" &&
        proof.foreignKeyViolations === 0 &&
        Array.isArray(proof.schema),
      "LOCAL_MIGRATION_PROOF_REQUIRED",
    );
    await migrateReviewedIndexes({
      plan,
      expectedSchema: proof.schema,
      request: createD1Client(env.CLOUDFLARE_D1_MIGRATION_API_TOKEN),
      ensureCurrent: qualify,
      record: (evidence) =>
        write("schema.json", { ...qualification, ...evidence }),
    });
    return;
  }
  demand(env.CLOUDFLARE_API_TOKEN, "APPLICATION_CREDENTIAL_REQUIRED");
  const schema = JSON.parse(
    await readFile(join(output, "schema.json"), "utf8"),
  );
  requireSchemaReceipt(schema, context, qualification);
  await write("publication.json", {
    ...qualification,
    status: "publication-started",
  });
  await deployPublic("live", { root });
  await write("publication.json", {
    ...qualification,
    status: "served-release-verified",
    schemaSha256: schema.after.schemaSha256,
    verifiedAt: new Date().toISOString(),
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(process.env);
  } catch (error) {
    // Never print Git/Cloudflare stderr, credentials, SQL rows or remote error bodies.
    console.error(
      /^(MANUAL_RELEASE|DEPENDENCY_RELEASE|VALIDATION_PROOF|RELEASE)_[A-Z_0-9]+$/.test(
        error?.message ?? "",
      )
        ? error.message
        : "MANUAL_RELEASE_FAILED",
    );
    process.exitCode = 1;
  }
}
