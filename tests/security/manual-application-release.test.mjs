import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fullValidationJobs } from "../../scripts/ci/validation-proof.mjs";
import { migrationPlan } from "../../scripts/migrate-remote.mjs";
import {
  createD1Client,
  manualContext,
  migrateReviewedIndexes,
  qualifyManualRelease,
  requireLedger,
  requireReviewedPlan,
  requireSchema,
  requireSchemaReceipt,
} from "../../scripts/ci/manual-application-release.mjs";

const context = {
  repository: "nclsppr/guteneo",
  repositoryId: 123,
  runId: 456,
  runAttempt: 2,
  sourceCommit: "a".repeat(40),
};
const repository = { id: context.repositoryId, full_name: context.repository };
const run = {
  id: context.runId,
  run_attempt: context.runAttempt,
  repository,
  head_repository: repository,
  head_sha: context.sourceCommit,
  head_branch: "main",
  event: "push",
  name: "Guteneo checks",
  path: ".github/workflows/ci.yml",
  status: "completed",
  conclusion: "success",
};
const jobs = fullValidationJobs.map((name, index) => ({
  id: index + 1,
  run_id: context.runId,
  name,
  status: "completed",
  conclusion: "success",
}));
function github(changes = {}) {
  let reads = 0;
  return async (path) => {
    if (path === "git/ref/heads/main")
      return { object: { sha: changes.main ?? context.sourceCommit } };
    if (path === `actions/runs/${context.runId}`)
      return changes.runs?.[reads++] ?? changes.run ?? run;
    if (path.includes("/jobs?"))
      return {
        total_count: (changes.jobs ?? jobs).length,
        jobs: changes.jobs ?? jobs,
      };
    throw new Error("Unexpected fixture read");
  };
}
test("manual workflow accepts only exact current main canonical complete successful CI", async () => {
  const proof = await qualifyManualRelease(context, github());
  assert.equal(proof.validationMode, "full");
  for (const change of [
    { main: "b".repeat(40) },
    { run: { ...run, event: "pull_request" } },
    { run: { ...run, run_attempt: 1 } },
    { jobs: jobs.slice(1) },
    {
      jobs: jobs.map((job) =>
        job.name === "verify" ? { ...job, conclusion: "failure" } : job,
      ),
    },
    { runs: [run, { ...run, status: "in_progress" }] },
  ])
    await assert.rejects(qualifyManualRelease(context, github(change)));
});
test("manual input cannot select a foreign workflow event, checkout or injected numeric id", () => {
  const env = {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: context.repository,
    GITHUB_REPOSITORY_ID: "123",
    GITHUB_SHA: context.sourceCommit,
    GH_TOKEN: "fixture",
    MANUAL_RELEASE_EVIDENCE_DIR: "/tmp/evidence",
  };
  const event = {
    inputs: {
      source_commit: context.sourceCommit,
      ci_run_id: "456",
      ci_run_attempt: "2",
    },
  };
  assert.deepEqual(manualContext(env, event), context);
  for (const changes of [
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_SHA: "b".repeat(40) },
  ])
    assert.throws(() => manualContext({ ...env, ...changes }, event));
  for (const value of ["456;echo secret", "0456", "1e3", "9007199254740992"])
    assert.throws(() =>
      manualContext(env, { inputs: { ...event.inputs, ci_run_id: value } }),
    );
});

const plan = await migrationPlan();
const schema = [
  { type: "table", name: "audit_log", sql: "CREATE TABLE audit_log(id TEXT)" },
  {
    type: "table",
    name: "pdf_validations",
    sql: "CREATE TABLE pdf_validations(id TEXT)",
  },
  ...plan.slice(80).map((entry) => ({
    type: "index",
    name: entry.name.startsWith("0081")
      ? "approval_request_receipts"
      : "pdf_validation_history",
    sql: entry.batch[0].sql.replace(/^\s*--[^\n]*(?:\n|$)/gm, "").trim(),
  })),
];
function d1Fixture({
  applied = 80,
  drift = false,
  quick = "ok",
  loseResponse = false,
} = {}) {
  const calls = [];
  let count = applied;
  const request = async (operation, batch) => {
    calls.push({ operation, batch });
    if (operation === "bookmark") return "00000001-00000002-bookmark";
    if (
      batch[0].sql.startsWith("CREATE") ||
      batch[0].sql.includes("CREATE INDEX")
    ) {
      assert.equal(batch.length, 2);
      assert.equal(batch[1].sql, plan[count].batch[1].sql);
      count++;
      if (loseResponse) throw new Error("MANUAL_RELEASE_D1_RESPONSE_UNKNOWN");
      return batch.map(() => ({ success: true, results: [] }));
    }
    return batch.map(({ sql }) => ({
      success: true,
      results: sql.startsWith("SELECT name FROM d1_migrations")
        ? plan.slice(0, count).map(({ name }) => ({ name }))
        : sql.startsWith("SELECT type,name,sql")
          ? schema
              .filter(
                (row) => count === 82 || row.name !== "pdf_validation_history",
              )
              .filter(
                (row) =>
                  count >= 81 || row.name !== "approval_request_receipts",
              )
              .map((row) =>
                drift && row.name === "audit_log"
                  ? { ...row, sql: "CREATE TABLE audit_log(id INTEGER)" }
                  : row,
              )
          : sql === "PRAGMA foreign_keys"
            ? [{ foreign_keys: 1 }]
            : sql === "PRAGMA ignore_check_constraints"
              ? [{ ignore_check_constraints: 0 }]
              : sql === "PRAGMA quick_check"
                ? [{ quick_check: quick }]
                : sql === "PRAGMA foreign_key_check"
                  ? []
                  : assert.fail("Unexpected SQL"),
    }));
  };
  return { request, calls, count: () => count };
}
test("source boundary permits exactly the two additive indexes and exact ledger prefix", () => {
  requireReviewedPlan(plan);
  assert.equal(
    requireLedger(
      plan.slice(0, 80).map(({ name }) => ({ name })),
      plan,
    ),
    80,
  );
  for (const altered of [
    plan.slice(0, 81),
    [...plan, { name: "0083_unreviewed.sql" }],
    plan.map((entry, index) =>
      index === 81
        ? {
            ...entry,
            batch: [{ sql: "DELETE FROM pdf_validations;" }, entry.batch[1]],
          }
        : entry,
    ),
  ])
    assert.throws(() => requireReviewedPlan(altered));
  for (const rows of [
    plan.slice(0, 79),
    [...plan.slice(0, 80), plan[81]],
    [...plan, plan[81]],
  ])
    assert.throws(() =>
      requireLedger(
        rows.map(({ name }) => ({ name })),
        plan,
      ),
    );
  assert.throws(
    () =>
      requireSchema(
        [{ type: "table", name: "other", sql: "CREATE TABLE other(id TEXT)" }],
        schema,
        82,
      ),
    /SCHEMA_MISMATCH/,
  );
});
test("schema first applies each missing index and ledger row in one batch then independently reads integrity", async () => {
  for (const applied of [80, 81, 82]) {
    const fixture = d1Fixture({ applied });
    const evidence = [];
    let checks = 0;
    const proof = await migrateReviewedIndexes({
      plan,
      expectedSchema: schema,
      request: fixture.request,
      ensureCurrent: async () => {
        checks++;
      },
      record: async (value) => evidence.push(structuredClone(value)),
    });
    assert.equal(proof.status, "schema-verified");
    assert.equal(proof.after.applied, 82);
    assert.equal(fixture.count(), 82);
    assert.equal(proof.migrations.length, 82 - applied);
    assert.equal(proof.quickCheck, "ok");
    assert.equal(proof.foreignKeyViolations, 0);
    assert.equal(checks, 2 + 82 - applied);
    assert.equal(
      evidence[0].preMigrationBookmark,
      "00000001-00000002-bookmark",
    );
    assert.equal(
      evidence.filter((entry) => entry.status === "migration-in-flight").length,
      82 - applied,
    );
  }
});
test("unknown mutation outcome stops without retry; schema drift and integrity failure never verify", async () => {
  const fixture = d1Fixture({ loseResponse: true });
  await assert.rejects(
    migrateReviewedIndexes({
      plan,
      expectedSchema: schema,
      request: fixture.request,
      ensureCurrent: async () => {},
    }),
    /RESPONSE_UNKNOWN/,
  );
  assert.equal(fixture.count(), 81);
  assert.equal(
    fixture.calls.filter(({ batch }) =>
      batch?.some(({ sql }) => sql.includes("CREATE INDEX")),
    ).length,
    1,
  );
  for (const change of [{ drift: true }, { quick: "corrupt" }]) {
    const failed = d1Fixture(change);
    await assert.rejects(
      migrateReviewedIndexes({
        plan,
        expectedSchema: schema,
        request: failed.request,
        ensureCurrent: async () => {},
      }),
    );
    if (change.drift) assert.equal(failed.count(), 80);
  }
});
test("source advancement before a mutation stops with no schema write", async () => {
  const fixture = d1Fixture();
  let checks = 0;
  await assert.rejects(
    migrateReviewedIndexes({
      plan,
      expectedSchema: schema,
      request: fixture.request,
      ensureCurrent: async () => {
        if (++checks === 2) throw new Error("MANUAL_RELEASE_MAIN_ADVANCED");
      },
    }),
    /MAIN_ADVANCED/,
  );
  assert.equal(fixture.count(), 80);
});
test("Cloudflare client fails closed on missing credentials, refusal, malformed response and redirect", async () => {
  assert.throws(() => createD1Client(""), /D1_CREDENTIAL_REQUIRED/);
  for (const response of [
    new Response("private error body", { status: 403 }),
    Response.json({ success: false, errors: [{ message: "private" }] }),
    Response.json({ success: true, result: [] }),
  ])
    await assert.rejects(
      createD1Client("synthetic-token", async (url, options) => {
        assert.match(
          url,
          /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/39ac9fada6cba44d9ecf09d467609e69\/d1\/database\/f86235fa-58c1-404f-a9a6-e2d657315854\//,
        );
        assert.equal(options.redirect, "error");
        return response;
      })("query", [{ sql: "SELECT 1" }]),
      /^Error: MANUAL_RELEASE_D1_(REQUEST_REFUSED|QUERY_FAILED)$/,
    );
});
test("publication consumes only matching successful same-dispatch schema evidence", () => {
  const qualification = {
    workflowRunId: 500,
    workflowRunAttempt: 1,
    version: "1.2.3",
  };
  const evidence = {
    ...context,
    ...qualification,
    status: "schema-verified",
    after: { applied: 82, schemaSha256: "a".repeat(64) },
    quickCheck: "ok",
    foreignKeyViolations: 0,
  };
  requireSchemaReceipt(evidence, context, qualification);
  for (const change of [
    { status: "migration-in-flight" },
    { sourceCommit: "b".repeat(40) },
    { workflowRunAttempt: 2 },
    { runAttempt: 1 },
    { version: "1.2.2" },
    { after: { applied: 81 } },
    { quickCheck: "resource_limit" },
  ])
    assert.throws(
      () =>
        requireSchemaReceipt(
          { ...evidence, ...change },
          context,
          qualification,
        ),
      /SAME_RUN_SCHEMA_PROOF_REQUIRED/,
    );
});
test("manual workflow stays isolated from dependency release and scopes credentials to each operation", async () => {
  const workflow = await readFile(
    new URL(
      "../../.github/workflows/manual-application-release.yml",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(
    workflow,
    /workflow_run:|pull_request:|contents: write|actions: write|CLOUDFLARE_SCANNER_API_TOKEN/,
  );
  assert.match(
    workflow,
    /group: guteneo-production-application\n  cancel-in-progress: false/,
  );
  assert.match(workflow, /CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.match(workflow, /manual-application-release\.mjs schema/);
  assert.match(workflow, /manual-application-release\.mjs publish/);
  const automatic = await readFile(
    new URL("../../.github/workflows/dependency-release.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    automatic,
    /manual-application-release|D1_MIGRATION|workflow_dispatch/,
  );
});
