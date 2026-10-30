import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fullValidationJobs } from "../../scripts/ci/validation-proof.mjs";
import {
  isDependabotMerge,
  qualifyDependencyRelease,
  requestJson,
  requireApplicationDependencyFiles,
  requireDependencyManifestChange,
  requireMainRun,
  requireSuccessfulJobs,
  requiresMcpPackageSynchronization,
} from "../../scripts/ci/dependency-release.mjs";

const sourceCommit = "a".repeat(40);
const context = {
  repository: "nclsppr/guteneo",
  repositoryId: 123,
  runId: 456,
  runAttempt: 2,
  sourceCommit,
};
const repository = { id: context.repositoryId, full_name: context.repository };
const run = {
  id: context.runId,
  run_attempt: context.runAttempt,
  repository,
  head_repository: repository,
  head_sha: sourceCommit,
  head_branch: "main",
  event: "push",
  name: "Guteneo checks",
  path: ".github/workflows/ci.yml",
  status: "completed",
  conclusion: "success",
};
const pull = {
  number: 42,
  state: "closed",
  merged: true,
  merge_commit_sha: sourceCommit,
  user: { login: "dependabot[bot]", type: "Bot" },
  head: {
    ref: "dependabot/npm_and_yarn/example",
    repo: repository,
    sha: "b".repeat(40),
  },
  base: { ref: "main", repo: repository, sha: "c".repeat(40) },
  changed_files: 2,
};
const files = ["package.json", "package-lock.json"].map((filename) => ({
  filename,
  status: "modified",
}));
const originalManifest = {
  name: "guteneo",
  version: "1.1.17",
  scripts: { "deploy:live": "node scripts/deploy-public.mjs live" },
  engines: { node: "^22.22.3 || >=24.8.0" },
  overrides: { miniflare: { undici: "7.30.1" } },
  dependencies: { example: "1.0.0" },
  devDependencies: { testing: "^4.1.12" },
};
const updatedManifest = {
  ...originalManifest,
  dependencies: { example: "1.0.1" },
};
const originalLock = {
  lockfileVersion: 3,
  packages: {
    "": originalManifest,
    "node_modules/example": { version: "1.0.0" },
  },
};
const updatedLock = {
  lockfileVersion: 3,
  packages: {
    "": updatedManifest,
    "node_modules/example": { version: "1.0.1" },
  },
};
const manifestResponse = (manifest, path = "package.json") => {
  const bytes = Buffer.from(JSON.stringify(manifest));
  return {
    type: "file",
    path,
    encoding: "base64",
    content: bytes.toString("base64"),
    size: bytes.length,
  };
};
const jobs = fullValidationJobs.map((name, index) => ({
  id: index + 1,
  run_id: run.id,
  name,
  status: "completed",
  conclusion: "success",
}));

function fixture(overrides = {}) {
  const calls = [];
  let runReads = 0;
  const request = async (path) => {
    calls.push(path);
    if (path === `/repos/nclsppr/guteneo/actions/runs/${run.id}`) {
      const result = overrides.runSequence?.[runReads] ?? overrides.run ?? run;
      runReads++;
      return result;
    }
    if (path.endsWith("/git/ref/heads/main"))
      return { object: { sha: overrides.main ?? sourceCommit } };
    if (path.includes(`/commits/${sourceCommit}/pulls?`))
      return overrides.associations ?? [pull];
    if (path.endsWith(`/pulls/${pull.number}`)) return overrides.pull ?? pull;
    if (path.includes(`/pulls/${pull.number}/files?`))
      return overrides.files ?? files;
    if (path.includes(`/contents/`)) {
      const url = new URL(`https://api.github.com${path}`);
      const filename = url.pathname.split("/contents/")[1];
      const initial = url.searchParams.get("ref") === pull.base.sha;
      if (filename === "package-lock.json")
        return (
          overrides.lockResponse ??
          manifestResponse(
            initial
              ? (overrides.originalLock ?? originalLock)
              : (overrides.updatedLock ?? updatedLock),
            filename,
          )
        );
      return (
        overrides.manifestResponse ??
        manifestResponse(
          initial
            ? (overrides.originalManifest ?? originalManifest)
            : (overrides.updatedManifest ?? updatedManifest),
          filename,
        )
      );
    }
    if (path.includes(`/actions/runs/${run.id}/jobs?filter=latest`)) {
      const page = new URL(`https://api.github.com${path}`).searchParams.get(
        "page",
      );
      return (
        overrides.pages?.[page] ?? {
          total_count: jobs.length,
          jobs: overrides.jobs ?? jobs,
        }
      );
    }
    throw new Error("Unexpected fixture API path");
  };
  return { calls, request };
}

test("only the successful exact same-repository main push CI is trusted", () => {
  requireMainRun(run, context);
  for (const fields of [
    { event: "pull_request" },
    { head_branch: "feature" },
    { conclusion: "failure" },
    { status: "in_progress" },
    { name: "Different workflow" },
    { path: ".github/workflows/other.yml" },
    { head_sha: "b".repeat(40) },
    { run_attempt: 1 },
    { repository: { ...repository, id: 999 } },
    { head_repository: { ...repository, id: 999 } },
  ])
    assert.throws(
      () => requireMainRun({ ...run, ...fields }, context),
      /SUCCESSFUL_MAIN_RUN_REQUIRED/,
    );
});

test("the final merge must be an original bot PR from this repository", () => {
  assert.equal(isDependabotMerge(pull, context), true);
  for (const fields of [
    { merged: false },
    { state: "open" },
    { user: { login: "human", type: "User" } },
    { user: { login: "dependabot[bot]", type: "User" } },
    { merge_commit_sha: "b".repeat(40) },
    { head: { ...pull.head, ref: "human-dependency-update" } },
    { head: { ...pull.head, repo: { id: 999 } } },
    { base: { ...pull.base, ref: "staging" } },
    { base: { ...pull.base, sha: context.sourceCommit } },
    { base: { ...pull.base, sha: undefined } },
    { head: { ...pull.head, sha: undefined } },
  ])
    assert.equal(isDependabotMerge({ ...pull, ...fields }, context), false);
});

test("application manifests are allowed; source, workflow and renamed files fail closed", () => {
  assert.equal(requireApplicationDependencyFiles(files, 2), true);
  assert.equal(
    requireApplicationDependencyFiles(
      [{ filename: "apps/scanner/package-lock.json", status: "modified" }],
      1,
    ),
    false,
  );
  assert.equal(
    requireApplicationDependencyFiles(
      [{ filename: ".github/workflows/ci.yml", status: "modified" }],
      1,
    ),
    false,
  );
  for (const extra of [
    { filename: "apps/api/src/index.ts", status: "modified" },
    { filename: ".github/workflows/ci.yml", status: "modified" },
    {
      filename: "package-lock.json",
      status: "renamed",
      previous_filename: "other.json",
    },
  ])
    assert.throws(
      () => requireApplicationDependencyFiles([files[0], extra], 2),
      /DEPENDENCY_FILES_REQUIRED/,
    );
  assert.throws(
    () => requireApplicationDependencyFiles(files, 3),
    /DEPENDENCY_FILES_REQUIRED/,
  );
  assert.throws(
    () => requireApplicationDependencyFiles([files[0], files[0]], 2),
    /DEPENDENCY_FILES_REQUIRED/,
  );
});

test("required successful aggregate checks and every other job remain mandatory", () => {
  requireSuccessfulJobs(jobs, run.id);
  for (const conclusion of ["failure", "cancelled", "skipped", null])
    assert.throws(
      () =>
        requireSuccessfulJobs(
          [...jobs, { ...jobs[0], id: 99, name: "browser", conclusion }],
          run.id,
        ),
      /ALL_MAIN_JOBS_MUST_SUCCEED/,
    );
  assert.throws(
    () =>
      requireSuccessfulJobs(
        jobs.filter(({ name }) => name !== "verify"),
        run.id,
      ),
    /ALL_MAIN_JOBS_MUST_SUCCEED/,
  );
  assert.throws(
    () => requireSuccessfulJobs([...jobs, jobs[0]], run.id),
    /ALL_MAIN_JOBS_MUST_SUCCEED/,
  );
  assert.throws(
    () =>
      requireSuccessfulJobs(
        jobs.map((job) => ({ ...job, run_id: 999 })),
        run.id,
      ),
    /ALL_MAIN_JOBS_MUST_SUCCEED/,
  );
});

test("full release qualification requires every canonical job exactly once", () => {
  assert.equal(jobs.length, 24);
  assert.equal(requireSuccessfulJobs(jobs, run.id), "full");
  assert.equal(requireSuccessfulJobs([...jobs].reverse(), run.id), "full");
  for (const omitted of fullValidationJobs)
    assert.throws(
      () =>
        requireSuccessfulJobs(
          jobs.filter((job) => job.name !== omitted),
          run.id,
        ),
      /ALL_MAIN_JOBS_MUST_SUCCEED/,
      omitted,
    );
  for (const invalid of [
    jobs.filter((job) => ["scanner", "verify"].includes(job.name)),
    [...jobs, { ...jobs[0], id: 99, name: "foreign" }],
    jobs.map((job, index) => (index === 0 ? { ...job, name: "foreign" } : job)),
    jobs.map((job, index) =>
      index === 0 ? { ...job, name: jobs[1].name } : job,
    ),
  ])
    assert.throws(
      () => requireSuccessfulJobs(invalid, run.id),
      /ALL_MAIN_JOBS_MUST_SUCCEED/,
    );
});

test("eligibility binds complete files, main revision, current CI attempt and bot merge", async () => {
  const { request, calls } = fixture();
  const result = await qualifyDependencyRelease(context, request);
  assert.equal(result.eligible, true);
  assert.equal(result.pullRequest, pull.number);
  assert.equal(result.sourceCommit, sourceCommit);
  assert.equal(result.runAttempt, 2);
  assert.ok(calls.some((path) => path.includes("/jobs?filter=latest")));
});

test("successful job results survive a rerun of only failed jobs", async () => {
  const mixed = jobs.map((job, index) => ({
    ...job,
    run_attempt: index === 0 ? 2 : 1,
  }));
  const result = await qualifyDependencyRelease(
    context,
    fixture({ jobs: mixed }).request,
  );
  assert.equal(result.eligible, true);
  assert.equal(result.runAttempt, 2);
});

test("a concurrent rerun invalidates qualification even if its earlier inventory was green", async () => {
  for (const change of [
    { run_attempt: 3 },
    { status: "in_progress", conclusion: null },
    { conclusion: "failure" },
  ])
    await assert.rejects(
      qualifyDependencyRelease(
        context,
        fixture({ runSequence: [run, { ...run, ...change }] }).request,
      ),
      /SUCCESSFUL_MAIN_RUN_REQUIRED/,
    );
});

test("main advancement and ordinary or service-only merges never publish the application", async () => {
  assert.equal(
    (
      await qualifyDependencyRelease(
        context,
        fixture({ main: "b".repeat(40) }).request,
      )
    ).reason,
    "main-advanced",
  );
  assert.equal(
    (
      await qualifyDependencyRelease(
        context,
        fixture({ associations: [] }).request,
      )
    ).reason,
    "not-a-dependabot-merge",
  );
  const service = fixture({
    pull: { ...pull, changed_files: 1 },
    files: [{ filename: "apps/scanner/package.json", status: "modified" }],
  });
  assert.equal(
    (await qualifyDependencyRelease(context, service.request)).reason,
    "application-dependencies-unchanged",
  );
});

test("ambiguous merges, failed jobs and incomplete file lists refuse publication", async () => {
  for (const overrides of [
    { associations: [pull, pull] },
    { pull: { ...pull, merged: false } },
    { files: [files[0]] },
    {
      jobs: jobs.map((job) =>
        job.name === "build" ? { ...job, conclusion: "failure" } : job,
      ),
    },
  ])
    await assert.rejects(
      qualifyDependencyRelease(context, fixture(overrides).request),
      /DEPENDENCY_RELEASE_/,
    );
});

test("job pagination cannot hide a later failed job or a changing inventory", async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({
    ...jobs[0],
    id: index + 1,
    name: index === 1 ? "scanner" : index === 0 ? "verify" : `job-${index}`,
  }));
  const failed = {
    ...jobs[0],
    id: 101,
    name: "browser-last",
    conclusion: "failure",
  };
  await assert.rejects(
    qualifyDependencyRelease(
      context,
      fixture({
        pages: {
          1: { total_count: 101, jobs: first },
          2: { total_count: 101, jobs: [failed] },
        },
      }).request,
    ),
    /ALL_MAIN_JOBS_MUST_SUCCEED/,
  );
  await assert.rejects(
    qualifyDependencyRelease(
      context,
      fixture({
        pages: {
          1: { total_count: 101, jobs: first },
          2: { total_count: 102, jobs: [failed] },
        },
      }).request,
    ),
    /PAGINATION_CHANGED/,
  );
});

test("API reads are bounded to GitHub and never follow credential redirects", async () => {
  let requested;
  await requestJson(
    "/repos/nclsppr/guteneo/git/ref/heads/main",
    "fixture-token",
    async (url, options) => {
      requested = { url, options };
      return { ok: true, json: async () => ({}) };
    },
  );
  assert.equal(
    requested.url,
    "https://api.github.com/repos/nclsppr/guteneo/git/ref/heads/main",
  );
  assert.equal(requested.options.method, "GET");
  assert.equal(requested.options.redirect, "error");
  await assert.rejects(
    requestJson("https://other.example/", "fixture-token"),
    /API_PATH_INVALID/,
  );
  await assert.rejects(
    requestJson(
      "/repos/nclsppr/guteneo/git/ref/heads/main",
      "fixture-token",
      async () => ({ ok: false, status: 403 }),
    ),
    /API_READ_FAILED_403/,
  );
});

test("dependency-only manifest changes preserve every executable and configuration field", () => {
  requireDependencyManifestChange(originalManifest, updatedManifest);
  requireDependencyManifestChange(originalManifest, {
    ...originalManifest,
    devDependencies: { testing: "^5.0.5" },
  });
  for (const altered of [
    { ...updatedManifest, scripts: { "deploy:live": "echo changed" } },
    {
      ...updatedManifest,
      scripts: { ...updatedManifest.scripts, preinstall: "echo changed" },
    },
    { ...updatedManifest, engines: { node: ">=18" } },
    { ...updatedManifest, overrides: {} },
    { ...updatedManifest, name: "changed" },
    { ...updatedManifest, version: "2.0.0" },
    { ...updatedManifest, bin: "changed.js" },
  ])
    assert.throws(
      () => requireDependencyManifestChange(originalManifest, altered),
      /MANIFEST_CONFIGURATION_CHANGED/,
    );
  for (const dependencies of [{}, { example: "1.0.1", injected: "1.0.0" }])
    assert.throws(
      () =>
        requireDependencyManifestChange(originalManifest, {
          ...updatedManifest,
          dependencies,
        }),
      /MANIFEST_DEPENDENCY_SET_CHANGED/,
    );
  for (const example of [
    "file:../../private",
    "https://example.invalid/package.tgz",
    "github:example/injected",
    "npm:other@1.0.0",
  ])
    assert.throws(
      () =>
        requireDependencyManifestChange(originalManifest, {
          ...updatedManifest,
          dependencies: { example },
        }),
      /MANIFEST_VERSION_INVALID/,
    );
});

test("qualification reads SHA-pinned base and merged manifests and rejects manual script edits", async () => {
  const { calls, request } = fixture();
  assert.equal(
    (await qualifyDependencyRelease(context, request)).eligible,
    true,
  );
  for (const revision of [pull.base.sha, context.sourceCommit])
    assert.ok(
      calls.includes(
        `/repos/nclsppr/guteneo/contents/package.json?ref=${revision}`,
      ),
    );
  for (const updatedManifest of [
    { ...originalManifest, scripts: { "deploy:live": "echo changed" } },
    { ...originalManifest, engines: { node: ">=18" } },
    { ...originalManifest, overrides: {} },
  ])
    await assert.rejects(
      qualifyDependencyRelease(context, fixture({ updatedManifest }).request),
      /MANIFEST_CONFIGURATION_CHANGED/,
    );
  await assert.rejects(
    qualifyDependencyRelease(
      context,
      fixture({
        manifestResponse: {
          ...manifestResponse(originalManifest),
          path: "wrong.json",
        },
      }).request,
    ),
    /MANIFEST_CONTENT_INVALID/,
  );
});

test("genuine bot MCP manifest changes require synchronized plugin publication", async () => {
  for (const name of [
    "agents",
    "@modelcontextprotocol/client",
    "@modelcontextprotocol/ext-apps",
  ]) {
    const before = {
      ...originalManifest,
      dependencies: { ...originalManifest.dependencies, [name]: "2.3.1" },
    };
    const after = {
      ...before,
      dependencies: { ...before.dependencies, [name]: "2.4.0" },
    };
    const { calls, request } = fixture({
      originalManifest: before,
      updatedManifest: after,
    });
    const result = await qualifyDependencyRelease(context, request);
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "mcp-package-synchronization-required");
    assert.equal(
      calls.some((path) => path.includes("/jobs?")),
      false,
    );
  }
});

test("lockfile-only MCP upgrades include nested package entries and require plugin synchronization", async () => {
  for (const path of [
    "node_modules/agents",
    "node_modules/@modelcontextprotocol/sdk",
    "node_modules/example/node_modules/agents",
    "node_modules/example/node_modules/@modelcontextprotocol/server",
  ]) {
    const initial = {
      ...originalLock,
      packages: {
        ...originalLock.packages,
        [path]: { version: "2.3.1", integrity: "fixture" },
      },
    };
    const final = {
      ...initial,
      packages: {
        ...initial.packages,
        [path]: { version: "2.4.0", integrity: "updated-fixture" },
      },
    };
    const { calls, request } = fixture({
      pull: { ...pull, changed_files: 1 },
      files: [{ filename: "package-lock.json", status: "modified" }],
      originalLock: initial,
      updatedLock: final,
    });
    const result = await qualifyDependencyRelease(context, request);
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "mcp-package-synchronization-required");
    for (const revision of [pull.base.sha, context.sourceCommit])
      assert.ok(
        calls.includes(
          `/repos/nclsppr/guteneo/contents/package-lock.json?ref=${revision}`,
        ),
      );
  }
  const rootMetadataChanged = {
    ...originalLock,
    packages: {
      ...originalLock.packages,
      "": { dependencies: { "@modelcontextprotocol/sdk": "2.4.0" } },
    },
  };
  assert.equal(
    requiresMcpPackageSynchronization(
      originalManifest,
      originalManifest,
      originalLock,
      rootMetadataChanged,
    ),
    true,
  );
});

test("unchanged MCP packages preserve automatic release for unrelated dependency updates", async () => {
  const mcpEntry = { version: "2.3.1", integrity: "fixture" };
  const initial = {
    ...originalLock,
    packages: {
      ...originalLock.packages,
      "node_modules/@modelcontextprotocol/client": mcpEntry,
    },
  };
  const final = {
    ...updatedLock,
    packages: {
      ...updatedLock.packages,
      "node_modules/@modelcontextprotocol/client": { ...mcpEntry },
    },
  };
  assert.equal(
    (
      await qualifyDependencyRelease(
        context,
        fixture({ originalLock: initial, updatedLock: final }).request,
      )
    ).eligible,
    true,
  );
});

test("workflow serializes releases, gives CI no production secret and reuses the release guard", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/dependency-release.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \[Guteneo checks\]/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /npm run deploy:live 2>&1 \| tee/);
  assert.match(workflow, /set -o pipefail/);
  assert.match(workflow, /dependency-release\.log/);
  assert.match(workflow, /secrets.CLOUDFLARE_APP_RELEASE_API_TOKEN/);
  assert.match(workflow, /ref: main/);
  assert.doesNotMatch(
    workflow,
    /^    env:\n\s+DEPENDENCY_RELEASE_EVIDENCE:.*runner\.temp/m,
  );
  assert.match(
    workflow,
    /DEPENDENCY_RELEASE_EVIDENCE=\$RUNNER_TEMP\/dependency-release\.json.*GITHUB_ENV/,
  );
  assert.equal(workflow.includes("CLOUDFLARE_SCANNER_API_TOKEN"), false);
  assert.equal(workflow.includes("pull_request_target"), false);
  assert.equal(workflow.includes("actions/download-artifact"), false);
  assert.equal(workflow.includes("gh pr merge"), false);
  assert.equal(workflow.includes("workflow_dispatch:"), false);
});

test("dependency release accepts only the canonical successful reused-proof gate shape", () => {
  const required = new Set([
    "qualification",
    "dependencies",
    "scanner",
    "verify",
  ]);
  const names = [
    ...required,
    "pdf-validator",
    "checks",
    "vitest",
    "security",
    "build",
    "browser",
    "distribution-e2e",
    "engineering",
  ];
  const jobs = names.map((name, index) => ({
    id: index + 1,
    run_id: run.id,
    name,
    status: "completed",
    conclusion: required.has(name) ? "success" : "skipped",
  }));
  assert.equal(requireSuccessfulJobs(jobs, run.id), "reused");
  const expanded = fullValidationJobs.map((name, index) => ({
    id: index + 1,
    run_id: run.id,
    name,
    status: "completed",
    conclusion: required.has(name) ? "success" : "skipped",
  }));
  assert.equal(requireSuccessfulJobs(expanded, run.id), "reused");
  for (const name of required) {
    assert.throws(() =>
      requireSuccessfulJobs(
        jobs.map((job) =>
          job.name === name ? { ...job, conclusion: "skipped" } : job,
        ),
        run.id,
      ),
    );
  }
  for (const conclusion of ["failure", "cancelled", "timed_out", null])
    assert.throws(() =>
      requireSuccessfulJobs(
        jobs.map((job) =>
          job.name === "browser" ? { ...job, conclusion } : job,
        ),
        run.id,
      ),
    );
  assert.throws(() => requireSuccessfulJobs(jobs.slice(1), run.id));
  assert.throws(() =>
    requireSuccessfulJobs(
      [...jobs, { ...jobs[0], id: 99, name: "foreign" }],
      run.id,
    ),
  );
});
