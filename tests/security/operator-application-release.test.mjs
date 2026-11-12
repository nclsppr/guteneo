import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fullValidationJobs } from "../../scripts/ci/validation-proof.mjs";
import { migrationPlan } from "../../scripts/migrate-remote.mjs";
import {
  createOperatorGithubReader,
  createWranglerD1Client,
  operatorContext,
  releaseWithOperator,
  requireNoActivePublishers,
  requireOperatorIdentity,
  requireOperatorEnvironment,
  requireWranglerVersion,
} from "../../scripts/operator-application-release.mjs";

const context = {
  repository: "nclsppr/guteneo",
  sourceCommit: "a".repeat(40),
  runId: 456,
  runAttempt: 1,
};
const identity = {
  loggedIn: true,
  authType: "OAuth Token",
  accounts: [{ id: "39ac9fada6cba44d9ecf09d467609e69" }],
  tokenPermissions: [
    "account:read",
    "user:read",
    "workers_scripts:write",
    "workers_routes:write",
    "d1:write",
    "zone:read",
    "offline_access",
  ],
};
const plan = await migrationPlan();
test("operator requires the exact reviewed installed Wrangler version", async () => {
  const metadata = JSON.parse(
    await readFile(
      new URL("../../node_modules/wrangler/package.json", import.meta.url),
      "utf8",
    ),
  );
  requireWranglerVersion(metadata.version);
  for (const version of ["4.151.0", "4.153.0", "4.152.0-extra", undefined])
    assert.throws(
      () => requireWranglerVersion(version),
      /REVIEWED_WRANGLER_VERSION_REQUIRED/,
    );
});

const schema = [
  { type: "table", name: "audit_log", sql: "CREATE TABLE audit_log(id TEXT)" },
  ...plan.slice(80).map((entry, index) => ({
    type: "index",
    name: index ? "pdf_validation_history" : "approval_request_receipts",
    sql: entry.batch[0].sql,
  })),
];
function fixture(changes = {}) {
  const evidence = [];
  const writes = [];
  let applied = 80;
  let published = 0;
  let sourceCalls = 0;
  let checks = 0;
  const repository = { id: 123, full_name: context.repository };
  const api = async (path) => {
    if (path.startsWith("actions/runs?"))
      return { total_count: 0, workflow_runs: [] };
    if (path === "git/ref/heads/main")
      return { object: { sha: context.sourceCommit } };
    if (path === `actions/runs/${context.runId}`)
      return {
        id: 456,
        run_attempt: 1,
        repository,
        head_repository: repository,
        head_sha: context.sourceCommit,
        head_branch: "main",
        event: "push",
        name: "Guteneo checks",
        path: ".github/workflows/ci.yml",
        status: "completed",
        conclusion: changes.ciFailed ? "failure" : "success",
      };
    if (path.includes("/jobs?"))
      return {
        total_count: fullValidationJobs.length,
        jobs: fullValidationJobs.map((name, index) => ({
          id: index + 1,
          run_id: 456,
          name,
          status: "completed",
          conclusion: "success",
        })),
      };
    assert.fail(path);
  };
  const request = async (operation, batch) => {
    if (operation === "bookmark") return "00000001-00000002-bookmark";
    if (batch[0].sql.includes("CREATE INDEX")) {
      writes.push(batch);
      applied++;
      if (changes.lostResponse)
        throw new Error("OPERATOR_RELEASE_D1_RESPONSE_UNKNOWN");
      return batch.map(() => ({ success: true, results: [] }));
    }
    return batch.map(({ sql }) => ({
      success: true,
      results: sql.startsWith("SELECT name")
        ? plan.slice(0, applied).map(({ name }) => ({ name }))
        : sql.startsWith("SELECT type")
          ? schema.filter(
              (row) =>
                row.type === "table" ||
                (row.name === "approval_request_receipts"
                  ? applied >= 81
                  : applied === 82),
            )
          : sql === "PRAGMA foreign_keys"
            ? [{ foreign_keys: 1 }]
            : sql === "PRAGMA ignore_check_constraints"
              ? [{ ignore_check_constraints: 0 }]
              : sql === "PRAGMA quick_check"
                ? (++checks,
                  [{ quick_check: changes.corrupt ? "corrupt" : "ok" }])
                : sql === "PRAGMA foreign_key_check"
                  ? changes.foreignKey
                    ? [{ table: "audit_log", rowid: 1 }]
                    : []
                  : assert.fail(sql),
    }));
  };
  return {
    evidence,
    writes,
    published: () => published,
    checks: () => checks,
    options: {
      context,
      reader: () => api,
      request,
      identity: async () => changes.identity ?? identity,
      source: () => {
        sourceCalls++;
        return changes.advancedAt && sourceCalls >= changes.advancedAt
          ? "b".repeat(40)
          : context.sourceCommit;
      },
      tag: async () => ({ version: "1.2.5", tag: "v1.2.5" }),
      plan: async () => plan,
      transport: async () => ({
        schemaEquivalent: !changes.badTransport,
        quickCheck: "ok",
        foreignKeyViolations: 0,
        schema,
      }),
      record: async (name, value) =>
        evidence.push({ name, value: structuredClone(value) }),
      publish: async (target, options) => {
        assert.equal(target, "live");
        await options.beforePublish();
        published++;
        return { sourceCommit: context.sourceCommit };
      },
    },
  };
}
test("operator inputs and OAuth identity cannot select other accounts, credentials or wider scopes", () => {
  const args = [
    "--confirm-production",
    "--commit",
    context.sourceCommit,
    "--ci-run-id",
    "456",
    "--ci-run-attempt",
    "1",
  ];
  assert.deepEqual(operatorContext(args), context);
  for (const input of [
    args.slice(1),
    [...args, "--skip-checks"],
    args.map((v) => (v === "456" ? "0456" : v)),
    args.map((v) => (v === context.sourceCommit ? "main" : v)),
  ])
    assert.throws(() => operatorContext(input));
  requireOperatorIdentity(identity);
  for (const changed of [
    { authType: "API Token" },
    { accounts: [{ id: "other" }] },
    { tokenPermissions: [...identity.tokenPermissions, "workers:write"] },
    { tokenPermissions: identity.tokenPermissions.slice(1) },
  ])
    assert.throws(() => requireOperatorIdentity({ ...identity, ...changed }));
});
test("operator CLI D1 sends one atomic command batch, fixed config and no token argument", async () => {
  const calls = [];
  const client = createWranglerD1Client({
    root: "/fixture",
    env: {},
    execute: async (command, args) => {
      calls.push({ command, args });
      return JSON.stringify(
        args.includes("time-travel")
          ? { bookmark: "bookmark-1" }
          : [
              { success: true, results: [] },
              { success: true, results: [] },
            ],
      );
    },
  });
  await client("query", plan[80].batch);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].args[calls[0].args.indexOf("--command") + 1],
    plan[80].batch.map(({ sql }) => sql.trim().replace(/;?$/, ";")).join("\n"),
  );
  assert.deepEqual(calls[0].args.slice(-2), [
    "--config",
    "wrangler.live.jsonc",
  ]);
  assert.ok(calls[0].args.includes("--remote"));
  assert.ok(!calls[0].args.includes("--file"));
  assert.equal(await client("bookmark"), "bookmark-1");
  await assert.rejects(client("restore"), /OPERATION_INVALID/);
});
test("implicit environment files, endpoint aliases and plaintext/log overrides fail closed", async () => {
  const absent = async () => {
    const error = new Error();
    error.code = "ENOENT";
    throw error;
  };
  await requireOperatorEnvironment({}, "/fixture", absent);
  for (const name of [
    "CF_ACCOUNT_ID",
    "CF_API_BASE_URL",
    "CLOUDFLARE_ENV",
    "WRANGLER_API_ENVIRONMENT",
    "WRANGLER_CI_OVERRIDE_NAME",
    "WRANGLER_TOKEN_URL",
  ])
    await assert.rejects(
      requireOperatorEnvironment({ [name]: "override" }, "/fixture", absent),
      /AMBIENT_CREDENTIAL_OVERRIDE/,
    );
  for (const name of ["CLOUDFLARE_AUTH_USE_KEYRING", "WRANGLER_LOG_SANITIZE"])
    await assert.rejects(
      requireOperatorEnvironment({ [name]: "false" }, "/fixture", absent),
      /ENCRYPTED_PROFILE_REQUIRED/,
    );
  await assert.rejects(
    requireOperatorEnvironment({}, "/fixture", async () => ({})),
    /IMPLICIT_ENV_FILE/,
  );
});
test("CLI response failures never retry or leak output", async () => {
  for (const value of [
    "private output",
    "[]",
    JSON.stringify([{ success: false, results: [] }]),
  ]) {
    let calls = 0;
    const client = createWranglerD1Client({
      execute: async () => {
        calls++;
        return value;
      },
    });
    await assert.rejects(
      client("query", [{ sql: "SELECT 1" }]),
      /OPERATOR_RELEASE_D1_(RESPONSE_UNKNOWN|QUERY_FAILED)/,
    );
    assert.equal(calls, 1);
  }
  const client = createWranglerD1Client({
    execute: async () => {
      throw new Error("secret stderr");
    },
  });
  await assert.rejects(client("query", plan[80].batch), {
    message: "OPERATOR_RELEASE_D1_RESPONSE_UNKNOWN",
  });
});
test("GitHub metadata uses existing gh authentication on the fixed host", async () => {
  const reader = createOperatorGithubReader({
    execute: async (command, args) => {
      assert.equal(command, "gh");
      assert.deepEqual(args, [
        "api",
        "--hostname",
        "github.com",
        "repos/nclsppr/guteneo/actions/runs/456",
      ]);
      return "{}";
    },
  });
  assert.deepEqual(await reader("actions/runs/456"), {});
  await assert.rejects(reader("../other"));
});
test("active production publishers and incomplete inventories stop the operator", async () => {
  for (const response of [
    {
      total_count: 1,
      workflow_runs: [
        { path: ".github/workflows/manual-application-release.yml" },
      ],
    },
    { total_count: 101, workflow_runs: [] },
  ])
    await assert.rejects(requireNoActivePublishers(async () => response));
});
test("operator retains source-bound proofs, checks integrity before and after, and rechecks before publication", async () => {
  const f = fixture();
  await releaseWithOperator(f.options);
  assert.equal(f.writes.length, 2);
  assert.deepEqual(
    f.writes,
    plan.slice(80).map(({ batch }) => batch),
  );
  assert.equal(f.checks(), 2);
  assert.equal(f.published(), 1);
  const final = f.evidence.at(-1);
  assert.equal(final.value.status, "served-release-verified");
  assert.equal(final.value.sourceCommit, context.sourceCommit);
  assert.ok(
    f.evidence.some(({ value }) => value.status === "migration-in-flight"),
  );
});
test("failed identity, CI, transport or pre-integrity prevents mutations and publication", async () => {
  for (const changes of [
    { identity: { ...identity, authType: "API Token" } },
    { ciFailed: true },
    { badTransport: true },
    { corrupt: true },
    { foreignKey: true },
    { advancedAt: 1 },
  ]) {
    const f = fixture(changes);
    await assert.rejects(releaseWithOperator(f.options));
    assert.equal(f.writes.length, 0);
    assert.equal(f.published(), 0);
  }
});
test("unknown migration and main advancement before publication fail without publish", async () => {
  const lost = fixture({ lostResponse: true });
  await assert.rejects(releaseWithOperator(lost.options), /RESPONSE_UNKNOWN/);
  assert.equal(lost.writes.length, 1);
  assert.equal(lost.published(), 0);
  const advanced = fixture({ advancedAt: 7 });
  await assert.rejects(releaseWithOperator(advanced.options), /SOURCE_CHANGED/);
  assert.equal(advanced.published(), 0);
});
test("a widened OAuth profile after local qualification cannot mutate production", async () => {
  const f = fixture();
  let localFinished = false;
  const original = f.options.transport;
  f.options.transport = async () => {
    const value = await original();
    localFinished = true;
    return value;
  };
  f.options.identity = async () =>
    localFinished
      ? {
          ...identity,
          tokenPermissions: [...identity.tokenPermissions, "workers:write"],
        }
      : identity;
  await assert.rejects(
    releaseWithOperator(f.options),
    /EXISTING_SCOPED_OAUTH_REQUIRED/,
  );
  assert.equal(f.writes.length, 0);
  assert.equal(f.published(), 0);
});
