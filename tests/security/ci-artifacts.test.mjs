import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  listRunArtifacts,
  requireWorkflowRun,
  selectArtifacts,
  selectCurrentRunArtifacts,
} from "../../scripts/ci/select-artifacts.mjs";

const context = {
  repository: "owner/repository",
  runId: "123",
  runAttempt: "2",
  revision: "a".repeat(40),
  headSha: "a".repeat(40),
  event: "push",
};
const run = () => ({
  id: 123,
  run_attempt: 2,
  head_sha: context.headSha,
  event: "push",
  repository: { id: 10, full_name: context.repository },
  head_repository: { id: 10 },
});
const artifact = (
  id,
  created_at,
  name = "ci-evidence-browser-iphone-webkit-2",
) => ({
  id,
  name,
  created_at,
  expired: false,
  workflow_run: {
    id: 123,
    head_sha: context.headSha,
    repository_id: 10,
    head_repository_id: 10,
  },
});
const older = () => artifact(900, "2026-10-26T03:07:14Z");
const newer = () => artifact(100, "2026-10-26T03:23:10Z");

test("selects the later creation time despite descending artifact IDs and input order", () => {
  for (const entries of [
    [older(), newer()],
    [newer(), older()],
  ]) {
    const before = structuredClone(entries);
    assert.deepEqual(
      selectArtifacts(entries, "evidence", run(), context.revision).map(
        (entry) => entry.id,
      ),
      [100],
    );
    assert.deepEqual(entries, before);
  }
  assert.deepEqual(
    selectArtifacts(
      [
        older(),
        newer(),
        artifact(50, "2026-10-26T03:07:14Z", "ci-evidence-checks"),
      ],
      "evidence",
      run(),
      context.revision,
    ).map((entry) => entry.name),
    ["ci-evidence-browser-iphone-webkit-2", "ci-evidence-checks"],
  );
});

test("never falls back from expired or invalid newest evidence and refuses ambiguous creation times", () => {
  assert.throws(
    () =>
      selectArtifacts(
        [older(), { ...newer(), expired: true }],
        "evidence",
        run(),
        context.revision,
      ),
    /LATEST_EXPIRED/,
  );
  for (const mutate of [
    (entry) => {
      entry.created_at = "not-a-date";
    },
    (entry) => {
      entry.id = 0;
    },
    (entry) => {
      entry.expired = null;
    },
    (entry) => {
      entry.workflow_run.head_sha = "b".repeat(40);
    },
    (entry) => {
      entry.workflow_run.id = 124;
    },
    (entry) => {
      entry.workflow_run.repository_id = 11;
    },
    (entry) => {
      entry.workflow_run.head_repository_id = 11;
    },
  ]) {
    const invalid = newer();
    mutate(invalid);
    assert.throws(() =>
      selectArtifacts([older(), invalid], "evidence", run(), context.revision),
    );
  }
  assert.throws(
    () =>
      selectArtifacts(
        [newer(), { ...newer(), id: 101 }],
        "evidence",
        run(),
        context.revision,
      ),
    /CREATION_TIME_AMBIGUOUS/,
  );
  assert.equal(
    selectArtifacts(
      [{ ...older(), expired: true }, newer()],
      "evidence",
      run(),
      context.revision,
    )[0].id,
    100,
  );
});

test("build artifacts must name the exact execution revision", () => {
  const build = artifact(
    1,
    "2026-10-26T03:00:00Z",
    `guteneo-browser-builds-${context.revision}`,
  );
  assert.equal(
    selectArtifacts([build], "build", run(), context.revision)[0].id,
    1,
  );
  assert.throws(
    () => selectArtifacts([build], "build", run(), "b".repeat(40)),
    /BUILD_REVISION_INVALID/,
  );
  assert.throws(
    () => selectArtifacts([], "build", run(), context.revision),
    /FAMILY_MISSING/,
  );
});

test("run identity fences the attempt, event, repository and API head independently of PR merge SHA", () => {
  assert.equal(requireWorkflowRun(run(), context).id, 123);
  for (const altered of [
    { ...context, runId: "124" },
    { ...context, runAttempt: "3" },
    { ...context, repository: "other/repository" },
    { ...context, event: "pull_request" },
    { ...context, headSha: "b".repeat(40) },
    { ...context, revision: "invalid" },
  ])
    assert.throws(
      () => requireWorkflowRun(run(), altered),
      /RUN_PROVENANCE_INVALID/,
    );
  const prContext = {
    ...context,
    event: "pull_request",
    revision: "c".repeat(40),
  };
  const prRun = {
    ...run(),
    event: "pull_request",
    head_repository: { id: 20 },
  };
  requireWorkflowRun(prRun, prContext);
  const prArtifact = newer();
  prArtifact.workflow_run.head_repository_id = 20;
  assert.equal(
    selectArtifacts([prArtifact], "evidence", prRun, prContext.revision)[0].id,
    100,
  );
});

test("lists every page and rejects duplicate IDs, changed counts and incomplete inventories", async () => {
  const calls = [];
  const entries = Array.from({ length: 101 }, (_, index) =>
    artifact(index + 1, "2026-10-26T03:00:00Z"),
  );
  assert.equal(
    (
      await listRunArtifacts(async (page) => {
        calls.push(page);
        return {
          total_count: 101,
          artifacts: entries.slice((page - 1) * 100, page * 100),
        };
      })
    ).length,
    101,
  );
  assert.deepEqual(calls, [1, 2]);
  await assert.rejects(
    listRunArtifacts(async () => ({
      total_count: 2,
      artifacts: [older(), older()],
    })),
    /LIST_DUPLICATE_ID/,
  );
  await assert.rejects(
    listRunArtifacts(async (page) => ({
      total_count: page === 1 ? 2 : 3,
      artifacts: [artifact(page, "2026-10-26T03:00:00Z")],
    })),
    /LIST_CHANGED/,
  );
  await assert.rejects(
    listRunArtifacts(async () => ({ total_count: 1, artifacts: [] })),
    /LIST_INCOMPLETE/,
  );
  await assert.rejects(
    listRunArtifacts(async () => ({ total_count: 2, artifacts: [older()] }), 1),
    /PAGINATION_LIMIT/,
  );
});

test("preserves older attempt metadata while choosing IDs without inspecting passed/failed test content", async () => {
  const entries = [
    older(),
    newer(),
    artifact(101, "2026-10-26T03:00:00Z", "ci-vitest-1"),
  ];
  const calls = [];
  const proof = await selectCurrentRunArtifacts(
    context,
    "verify",
    async (path) => {
      calls.push(path);
      return path.includes("/artifacts?")
        ? { total_count: entries.length, artifacts: entries }
        : run();
    },
  );
  assert.equal(proof.observed.length, 3);
  assert.equal(proof.selected.evidence[0].id, 100);
  assert.equal(proof.selected.vitest[0].id, 101);
  assert.equal(proof.runAttempt, "2");
  assert.equal(calls.length, 2);
});

test("workflow downloads exact IDs with narrowly scoped read permission and retains complete verification", async () => {
  const source = await readFile(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.equal(
    (source.match(/node scripts\/ci\/select-artifacts\.mjs build/g) ?? [])
      .length,
    2,
  );
  assert.equal((source.match(/actions: read/g) ?? []).length, 4);
  assert.match(source, /node scripts\/ci\/select-artifacts\.mjs verify/);
  assert.match(
    source,
    /artifact-ids: \$\{\{ steps\.artifacts\.outputs\.vitestArtifactIds \}\}/,
  );
  assert.match(
    source,
    /artifact-ids: \$\{\{ steps\.artifacts\.outputs\.evidenceArtifactIds \}\}/,
  );
  assert.doesNotMatch(source, /pattern: ci-(?:vitest|evidence)-\*/);
  assert.match(source, /node scripts\/ci\/verify-results\.mjs/);
  assert.match(
    source,
    /npx vitest run --merge-reports=test-results\/ci\/blobs/,
  );
});
