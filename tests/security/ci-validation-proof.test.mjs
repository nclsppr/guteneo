import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  createValidationProof,
  createRuntimeRecord,
  createValidationReader,
  fullValidationJobs,
  qualifyValidationProof,
  requireReusedJobs,
  readRuntimeRecords,
  runtimeJobs,
  selectValidationProof,
  verifyReusedValidation,
  writeNewProofFile,
} from "../../scripts/ci/validation-proof.mjs";

const sha = (letter) => letter.repeat(40);
const repository = { id: 123, full_name: "nclsppr/guteneo" };
const current = sha("a"),
  base = sha("b"),
  head = sha("c"),
  tested = sha("d"),
  tree = sha("e");
const now = Date.parse("2026-10-30T12:00:00Z");
const toolchain = {
  node: "v24.13.0",
  platform: "linux",
  arch: "x64",
  imageOS: "ubuntu24",
  imageVersion: "20261026.1.0",
};
const context = {
  repository: repository.full_name,
  repositoryId: repository.id,
  sourceCommit: current,
  runId: 100,
  runAttempt: 1,
  event: "push",
  ref: "refs/heads/main",
  toolchain,
};
const recordContext = {
  ...context,
  sourceCommit: tested,
  runId: 10,
  event: "pull_request",
  ref: "refs/pull/42/merge",
};
const evidenceText = JSON.stringify({
  files: 151,
  passed: 3200,
  browser: {
    rows: 9,
    suites: 8,
    discovered: 100,
    passed: 98,
    declaredSkipped: 2,
    evidenceAttempts: ["1"],
  },
});
const successfulJobs = Object.fromEntries([
  ...["qualification", "dependencies", "scanner"].map((name) => [
    name,
    { result: "success" },
  ]),
  ...[
    "pdf-validator",
    "checks",
    "vitest",
    "security",
    "build",
    "browser",
    "distribution-e2e",
    "engineering",
  ].map((name) => [name, { result: "skipped" }]),
]);

async function fixture() {
  const workflow = { id: 7, path: ".github/workflows/ci.yml", state: "active" };
  const pull = {
    number: 42,
    state: "closed",
    merged: true,
    merge_commit_sha: current,
    base: { ref: "main", sha: base, repo: repository },
    head: { ref: "feature", sha: head, repo: repository },
  };
  const run = {
    id: 10,
    run_attempt: 1,
    workflow_id: 7,
    path: workflow.path,
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    repository,
    head_repository: repository,
    head_sha: head,
    head_branch: "feature",
    pull_requests: [{ number: 42 }],
    created_at: "2026-10-30T11:00:00Z",
    run_started_at: "2026-10-30T11:00:00Z",
    updated_at: "2026-10-30T11:15:00Z",
  };
  const manifest = {
    version: "1.1.19",
    scripts: { test: "vitest run", build: "vite build" },
    engines: { node: ">=24.8.0" },
    devDependencies: { vitest: "4.1.12" },
    dependencies: { hono: "4.13.13" },
    overrides: { miniflare: { undici: "7.30.1" } },
  };
  const policy = {
    ci: sha("f"),
    workflows: sha("1"),
    config: sha("2"),
    manifest,
  };
  const state = {
    ref: { ref: "refs/heads/main", object: { sha: current } },
    workflow,
    pull,
    run,
    commits: Object.fromEntries(
      [current, tested].map((value) => [
        value,
        {
          sha: value,
          tree: { sha: tree },
          parents: [{ sha: base }, { sha: head }],
        },
      ]),
    ),
    currentPolicy: structuredClone(policy),
    basePolicy: structuredClone(policy),
    testedPolicy: structuredClone(policy),
    locks: sha("3"),
    testedLocks: sha("3"),
    runs: [run],
    jobs: fullValidationJobs.map((name, index) => ({
      id: index + 1,
      run_id: 10,
      run_attempt: 1,
      name,
      status: "completed",
      conclusion: "success",
    })),
    artifacts: [
      {
        id: 99,
        name: "ci-validation-proof-10-1",
        size_in_bytes: 1024,
        digest: `sha256:${"9".repeat(64)}`,
        expired: false,
        workflow_run: {
          id: 10,
          repository_id: 123,
          head_repository_id: 123,
          head_sha: head,
        },
      },
    ],
  };
  const calls = [];
  const api = async (path) => {
    calls.push(path);
    let value;
    if (path === "git/ref/heads/main") value = state.ref;
    else if (path.startsWith("git/commits/"))
      value = state.commits[path.slice(12)];
    else if (path === `commits/${current}/pulls?per_page=100`)
      value = [state.pull];
    else if (path === "pulls/42") value = state.pull;
    else if (path === "actions/workflows/ci.yml") value = state.workflow;
    else if (path.startsWith("actions/workflows/7/runs?"))
      value = { total_count: state.runs.length, workflow_runs: state.runs };
    else if (path === "actions/runs/10") value = state.run;
    else if (path === "actions/runs/10/attempts/1/jobs?per_page=100")
      value = { total_count: state.jobs.length, jobs: state.jobs };
    else if (path === "actions/runs/10/artifacts?per_page=100")
      value = {
        total_count: state.artifacts.length,
        artifacts: state.artifacts,
      };
    else if (path.startsWith("contents/")) {
      const [file, query] = path.slice(9).split("?"),
        ref = new URLSearchParams(query).get("ref");
      const p =
        ref === base
          ? state.basePolicy
          : ref === tested
            ? state.testedPolicy
            : state.currentPolicy;
      if (file === "")
        value = [{ name: "playwright.config.ts", type: "file", sha: p.config }];
      else if (file === "scripts")
        value = [{ name: "ci", type: "dir", sha: p.ci }];
      else if (file === ".github")
        value = [{ name: "workflows", type: "dir", sha: p.workflows }];
      else if (file === "package.json")
        value = {
          type: "file",
          encoding: "base64",
          content: Buffer.from(JSON.stringify(p.manifest)).toString("base64"),
        };
      else if (file.endsWith("package-lock.json"))
        value = {
          type: "file",
          sha: ref === tested ? state.testedLocks : state.locks,
        };
    }
    assert.notEqual(value, undefined, path);
    return structuredClone(value);
  };
  const proof = await createValidationProof({
    context: recordContext,
    api,
    pullNumber: 42,
    evidenceText,
    runtimeRecords: runtimeJobs.map((job) =>
      createRuntimeRecord(recordContext, job),
    ),
  });
  calls.length = 0;
  return { state, calls, api, proof };
}
const qualify = (f, extra = {}) =>
  qualifyValidationProof({
    context,
    api: f.api,
    proof: f.proof,
    evidenceText,
    now,
    ...extra,
  });
const rehash = (proof) => {
  const rest = structuredClone(proof);
  delete rest.selfHash;
  const canonical = JSON.stringify(rest, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
  proof.selfHash = createHash("sha256").update(canonical).digest("hex");
};

test("selection exposes one exact proof artifact without treating it as qualified", async () => {
  const f = await fixture();
  const value = await selectValidationProof({ context, api: f.api, now });
  assert.equal(value.candidate, true);
  assert.equal(value.reused, false);
  assert.equal(value.artifact.id, 99);
  assert.equal(value.proof_b64, undefined);
});

test("an explicit full run bypasses proof selection and qualification without API calls", async () => {
  const f = await fixture();
  const forcedContext = { ...context, forceFull: true };
  const expected = {
    reused: false,
    candidate: false,
    reason: "VALIDATION_PROOF_FORCE_FULL",
  };
  assert.deepEqual(
    await selectValidationProof({ context: forcedContext, api: f.api, now }),
    expected,
  );
  assert.deepEqual(await qualify(f, { context: forcedContext }), expected);
  assert.deepEqual(f.calls, []);
  for (const forceFull of [undefined, false, "true", "false", 1]) {
    assert.equal(
      (await qualify(f, { context: { ...context, forceFull } })).reused,
      true,
    );
  }
});

test("select and qualify CLI honor only the exact true force flag before reading artifacts or GitHub", async () => {
  const folder = await mkdtemp(join(tmpdir(), "guteneo-force-full-"));
  try {
    const script = resolve("scripts/ci/validation-proof.mjs");
    const preload = join(folder, "api.mjs");
    await writeFile(
      preload,
      `import {writeFileSync} from 'node:fs';
globalThis.fetch=async()=>{writeFileSync(new URL('./api-called',import.meta.url),'called');throw Error('private-provider-output');};`,
    );
    for (const command of ["select", "qualify"]) {
      const output = join(folder, `${command}.txt`);
      const child = spawnSync(
        process.execPath,
        [
          "--import",
          preload,
          script,
          command,
          ...(command === "qualify" ? ["absent-artifact-directory"] : []),
        ],
        {
          cwd: folder,
          env: { CI_FORCE_FULL: "true", GITHUB_OUTPUT: output },
          encoding: "utf8",
        },
      );
      assert.equal(child.status, 0, child.stderr);
      assert.equal(JSON.parse(child.stdout).reused, false);
      assert.match(child.stdout, /VALIDATION_PROOF_FORCE_FULL/);
      assert.match(await readFile(output, "utf8"), /^reused=false$/m);
      assert.doesNotMatch(
        child.stdout + child.stderr,
        /private-provider-output/,
      );
    }
    await assert.rejects(readFile(join(folder, "api-called")), {
      code: "ENOENT",
    });
    for (const flag of [undefined, "false", "TRUE", "1", "true "]) {
      const child = spawnSync(process.execPath, [script, "select"], {
        cwd: folder,
        env: flag === undefined ? {} : { CI_FORCE_FULL: flag },
        encoding: "utf8",
      });
      assert.equal(child.status, 0, child.stderr);
      assert.doesNotMatch(child.stdout, /VALIDATION_PROOF_FORCE_FULL/);
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("same-tree ordinary main merge reuses only successful full PR evidence and seals this main run", async () => {
  const f = await fixture(),
    value = await qualify(f);
  assert.equal(value.reused, true);
  assert.equal(value.artifact_id, 99);
  const verified = await verifyReusedValidation({
    context,
    api: f.api,
    sealedBase64: value.proof_b64,
    jobs: successfulJobs,
    now,
  });
  assert.equal(verified.reused, true);
  assert.equal(verified.full, false);
  assert.equal(verified.sourceCommit, current);
  assert.equal(verified.priorRunId, 10);
  assert.equal(verified.counts.passed, 3200);
  assert(
    f.calls.every((path) => !path.includes("/zip") && !path.includes("logs")),
  );
});
test("GitHub's empty merged-PR run association is independently bound by head, branch, parents and tree", async () => {
  const f = await fixture();
  f.state.run.pull_requests = [];
  assert.equal((await qualify(f)).reused, true);
});
test("version and runtime dependency changes do not change validation policy", async () => {
  const f = await fixture();
  f.state.basePolicy.manifest.version = "1.1.18";
  f.state.basePolicy.manifest.dependencies.hono = "4.13.12";
  assert.equal((await qualify(f)).reused, true);
});
for (const [name, change] of [
  [
    "PR event",
    (_s, c) => {
      c.event = "pull_request";
      c.ref = "refs/pull/42/merge";
    },
  ],
  [
    "wrong repository",
    (_s, c) => {
      c.repository = "other/repo";
    },
  ],
  [
    "advanced main",
    (s) => {
      s.ref.object.sha = sha("4");
    },
  ],
  [
    "squash or rebase",
    (s) => {
      s.commits[current].parents.pop();
    },
  ],
  [
    "different merge base",
    (s) => {
      s.pull.base.sha = sha("4");
    },
  ],
  [
    "different merged head",
    (s) => {
      s.pull.head.sha = sha("4");
    },
  ],
  [
    "fork",
    (s) => {
      s.pull.head.repo = { ...repository, id: 999 };
    },
  ],
  [
    "not actually merged",
    (s) => {
      s.pull.merged = false;
    },
  ],
  [
    "wrong target",
    (s) => {
      s.pull.base.ref = "release";
    },
  ],
  [
    "CI helper change",
    (s) => {
      s.basePolicy.ci = sha("4");
    },
  ],
  [
    "workflow change",
    (s) => {
      s.basePolicy.workflows = sha("4");
    },
  ],
  [
    "test configuration change",
    (s) => {
      s.basePolicy.config = sha("4");
    },
  ],
  [
    "test script change",
    (s) => {
      s.basePolicy.manifest.scripts.test = "true";
    },
  ],
  [
    "Node policy change",
    (s) => {
      s.basePolicy.manifest.engines.node = ">=22";
    },
  ],
  [
    "devtool change",
    (s) => {
      s.basePolicy.manifest.devDependencies.vitest = "4.1.11";
    },
  ],
  [
    "transport override change",
    (s) => {
      s.basePolicy.manifest.overrides.miniflare.undici = "7.30.0";
    },
  ],
  [
    "unsuccessful run",
    (s) => {
      s.run.conclusion = "failure";
    },
  ],
  [
    "running run",
    (s) => {
      s.run.status = "in_progress";
    },
  ],
  [
    "other workflow",
    (s) => {
      s.run.workflow_id = 8;
    },
  ],
  [
    "fork run",
    (s) => {
      s.run.head_repository = { ...repository, id: 999 };
    },
  ],
  [
    "wrong PR association",
    (s) => {
      s.run.pull_requests = [{ number: 99 }];
    },
  ],
  [
    "wrong branch",
    (s) => {
      s.run.head_branch = "other";
    },
  ],
  [
    "expired proof",
    (s) => {
      s.run.run_started_at = "2026-10-28T12:00:00Z";
    },
  ],
  [
    "future completion",
    (s) => {
      s.run.updated_at = "2026-10-31T12:00:00Z";
    },
  ],
  [
    "failed job",
    (s) => {
      s.jobs[3].conclusion = "failure";
    },
  ],
  [
    "skipped job",
    (s) => {
      s.jobs[3].conclusion = "skipped";
    },
  ],
  [
    "missing job",
    (s) => {
      s.jobs.pop();
    },
  ],
  [
    "duplicated job",
    (s) => {
      s.jobs[1] = s.jobs[0];
    },
  ],
  [
    "wrong job attempt",
    (s) => {
      s.jobs[1].run_attempt = 2;
    },
  ],
  [
    "missing proof artifact",
    (s) => {
      s.artifacts = [];
    },
  ],
  [
    "duplicated proof artifact",
    (s) => {
      s.artifacts.push({ ...s.artifacts[0], id: 100 });
    },
  ],
  [
    "expired artifact",
    (s) => {
      s.artifacts[0].expired = true;
    },
  ],
  [
    "oversized artifact",
    (s) => {
      s.artifacts[0].size_in_bytes = 200000;
    },
  ],
  [
    "missing API archive digest",
    (s) => {
      delete s.artifacts[0].digest;
    },
  ],
  [
    "foreign artifact",
    (s) => {
      s.artifacts[0].workflow_run.head_repository_id = 999;
    },
  ],
])
  test(`selects a complete fresh run for ${name}`, async () => {
    const f = await fixture(),
      c = structuredClone(context);
    change(f.state, c);
    const result = await qualify(f, { context: c });
    assert.equal(result.reused, false);
    assert.match(result.reason, /^VALIDATION_PROOF_/);
  });

test("a newer failed same-head run prevents using an older successful result", async () => {
  const f = await fixture();
  f.state.runs.push({
    ...f.state.run,
    id: 11,
    created_at: "2026-10-30T11:30:00Z",
    conclusion: "failure",
  });
  const result = await qualify(f);
  assert.equal(result.reused, false);
});
for (const [name, change] of [
  [
    "self hash",
    (p) => {
      p.selfHash = "0".repeat(64);
    },
  ],
  [
    "reused chain",
    (p) => {
      p.full = false;
      rehash(p);
    },
  ],
  [
    "tested tree",
    (p) => {
      p.tested.tree = sha("4");
      rehash(p);
    },
  ],
  [
    "tested commit",
    (p) => {
      p.tested.commit = sha("4");
      rehash(p);
    },
  ],
  [
    "different actual Node",
    (p) => {
      p.toolchain.node = "v24.12.0";
      rehash(p);
    },
  ],
  [
    "different runner OS",
    (p) => {
      p.toolchain.imageOS = "ubuntu26";
      rehash(p);
    },
  ],
  [
    "different runner image",
    (p) => {
      p.toolchain.imageVersion = "20261027.1.0";
      rehash(p);
    },
  ],
  [
    "mixed retries",
    (p) => {
      p.run.attempt = 2;
      rehash(p);
    },
  ],
  [
    "different lock",
    (p) => {
      p.sourcePolicy.locks["package-lock.json"] = sha("4");
      rehash(p);
    },
  ],
  [
    "forged evidence digest",
    (p) => {
      p.evidence.sha256 = "0".repeat(64);
      rehash(p);
    },
  ],
  [
    "extra secret-shaped field",
    (p) => {
      p.private = "never-echo-this";
      rehash(p);
    },
  ],
])
  test(`rejects ${name} even when an artifact is present`, async () => {
    const f = await fixture();
    change(f.proof);
    assert.equal((await qualify(f)).reused, false);
  });
test("the GitHub API tested commit must have the actual base/head parents and exact current tree", async () => {
  for (const modify of [
    (c) => {
      c.tree.sha = sha("4");
    },
    (c) => {
      c.parents.reverse();
    },
  ]) {
    const f = await fixture();
    modify(f.state.commits[tested]);
    assert.equal((await qualify(f)).reused, false);
  }
});
test("proof evidence must be complete bounded counters from exactly one attempt", async () => {
  for (const modify of [
    (v) => {
      v.browser.rows = 8;
    },
    (v) => {
      v.browser.passed = 0;
    },
    (v) => {
      v.browser.declaredSkipped = 3;
    },
    (v) => {
      v.browser.evidenceAttempts = ["1", "2"];
    },
    (v) => {
      v.secret = "private";
    },
    (v) => {
      v.files = 0;
    },
  ]) {
    const f = await fixture(),
      v = JSON.parse(evidenceText);
    modify(v);
    await assert.rejects(
      createValidationProof({
        context: recordContext,
        api: f.api,
        pullNumber: 42,
        evidenceText: JSON.stringify(v),
      }),
      /^Error: VALIDATION_PROOF_/,
    );
  }
});
test("recording a reused or non-PR run cannot create eligible full evidence", async () => {
  const f = await fixture();
  await assert.rejects(
    createValidationProof({
      context,
      api: f.api,
      pullNumber: 42,
      evidenceText,
    }),
    /PR_FULL_RUN_REQUIRED/,
  );
});
test("every full suite records one exact uniform toolchain or the full proof is explicitly nonreusable", async () => {
  const f = await fixture();
  for (const modify of [
    (r) => {
      r.pop();
    },
    (r) => {
      r.push(r[0]);
    },
    (r) => {
      r[0].job = "unknown";
    },
    (r) => {
      r[0].revision = current;
    },
    (r) => {
      r[0].runId = 11;
    },
    (r) => {
      r[0].runAttempt = 2;
    },
    (r) => {
      r[0].toolchain.node = "v24.12.0";
    },
    (r) => {
      r[0].toolchain.platform = "darwin";
    },
    (r) => {
      r[0].toolchain.arch = "arm64";
    },
    (r) => {
      r[0].toolchain.imageOS = "ubuntu26";
    },
    (r) => {
      r[0].toolchain.imageVersion = "20261027.1.0";
    },
    (r) => {
      r[0].private = "not-included-in-proof";
    },
  ]) {
    const records = runtimeJobs.map((job) =>
      createRuntimeRecord(recordContext, job),
    );
    modify(records);
    const proof = await createValidationProof({
      context: recordContext,
      api: f.api,
      pullNumber: 42,
      evidenceText,
      runtimeRecords: records,
    });
    assert.equal(proof.full, true);
    assert.equal(proof.reusable, false);
    assert.match(proof.reason, /^VALIDATION_PROOF_RUNTIME_/);
    assert.deepEqual(proof.runtimeRecords, []);
    assert.doesNotMatch(JSON.stringify(proof), /not-included-in-proof/);
    assert.equal((await qualify(f, { proof })).reused, false);
  }
  const missing = await createValidationProof({
    context: recordContext,
    api: f.api,
    pullNumber: 42,
    evidenceText,
  });
  assert.equal(missing.full, true);
  assert.equal(missing.reusable, false);
  const invalidFiles = await createValidationProof({
    context: recordContext,
    api: f.api,
    pullNumber: 42,
    evidenceText,
    runtimeError: true,
  });
  assert.equal(invalidFiles.reusable, false);
  assert.equal(invalidFiles.reason, "VALIDATION_PROOF_RUNTIME_FILES_INVALID");
});
test("qualifying rechecks every embedded runtime even if the proof self hash is recomputed", async () => {
  const f = await fixture();
  f.proof.runtimeRecords[0].toolchain.arch = "arm64";
  rehash(f.proof);
  assert.equal((await qualify(f)).reused, false);
});
test("missing runner-image metadata preserves full test evidence but never qualifies for reuse", async () => {
  const f = await fixture();
  const absent = {
    ...recordContext,
    toolchain: { ...toolchain, imageVersion: undefined },
  };
  const record = createRuntimeRecord(absent, "scanner");
  assert.equal(record.toolchain, null);
  assert.equal(record.unavailableReason, "VALIDATION_PROOF_TOOLCHAIN_REQUIRED");
  const proof = await createValidationProof({
    context: absent,
    api: f.api,
    pullNumber: 42,
    evidenceText,
    runtimeRecords: runtimeJobs.map((job) =>
      createRuntimeRecord(recordContext, job),
    ),
  });
  assert.equal(proof.full, true);
  assert.equal(proof.reusable, false);
  assert.equal(proof.reason, "VALIDATION_PROOF_TOOLCHAIN_REQUIRED");
  assert.equal((await qualify(f, { proof })).reused, false);
});
test("runtime CLI captures only the exact finite identity and refuses unknown jobs or overwrites", async () => {
  const folder = await mkdtemp(join(tmpdir(), "guteneo-runtime-"));
  try {
    const file = "new/deep/runtime-scanner.json";
    const script = resolve("scripts/ci/validation-proof.mjs");
    const env = {
      GITHUB_REPOSITORY: repository.full_name,
      GITHUB_REPOSITORY_ID: "123",
      GITHUB_SHA: tested,
      GITHUB_RUN_ID: "10",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF: "refs/pull/42/merge",
      ImageOS: "ubuntu24",
      ImageVersion: "20261026.1.0",
      UNRELATED_SECRET: "must-not-be-retained",
    };
    const child = spawnSync(
      process.execPath,
      [script, "runtime", "scanner", file],
      { encoding: "utf8", env, cwd: folder },
    );
    assert.equal(child.status, 0);
    const records = await readRuntimeRecords(join(folder, "new/deep"));
    assert.equal(records.length, 1);
    assert.equal(records[0].job, "scanner");
    assert.deepEqual(records[0].toolchain, {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      imageOS: env.ImageOS,
      imageVersion: env.ImageVersion,
    });
    assert.doesNotMatch(
      JSON.stringify(records) + child.stdout + child.stderr,
      /must-not-be-retained/,
    );
    const absentImage = { ...env };
    delete absentImage.ImageVersion;
    const unavailable = spawnSync(
      process.execPath,
      [
        script,
        "runtime",
        "dependencies",
        "missing-image/runtime-dependencies.json",
      ],
      { encoding: "utf8", env: absentImage, cwd: folder },
    );
    assert.equal(unavailable.status, 0, unavailable.stderr);
    const unavailableRecord = JSON.parse(
      await readFile(
        join(folder, "missing-image/runtime-dependencies.json"),
        "utf8",
      ),
    );
    assert.equal(unavailableRecord.toolchain, null);
    assert.equal(
      unavailableRecord.unavailableReason,
      "VALIDATION_PROOF_TOOLCHAIN_REQUIRED",
    );
    assert.notEqual(
      spawnSync(process.execPath, [script, "runtime", "scanner", file], {
        env,
        cwd: folder,
      }).status,
      0,
    );
    assert.throws(
      () => createRuntimeRecord(recordContext, "unknown"),
      /RUNTIME_JOB_INVALID/,
    );
    await writeFile(
      join(folder, "runtime-wrong.json"),
      JSON.stringify(records[0]),
    );
    await assert.rejects(readRuntimeRecords(folder), /RUNTIME_FILES_INVALID/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("API failure falls back without leaking provider output", async () => {
  const result = await qualifyValidationProof({
    context,
    api: async () => {
      throw Error("private-token-provider-body");
    },
    proof: {},
    evidenceText,
    now,
  });
  assert.deepEqual(result, {
    reused: false,
    candidate: false,
    reason: "VALIDATION_PROOF_UNAVAILABLE",
  });
});
test("proof output creation makes absent parents but refuses overwrite, outside paths and symlink parents", async () => {
  const folder = await mkdtemp(join(tmpdir(), "guteneo-proof-output-"));
  const outside = await mkdtemp(join(tmpdir(), "guteneo-proof-outside-"));
  try {
    await writeNewProofFile("new/deep/proof.json", { value: 1 }, folder);
    assert.deepEqual(
      JSON.parse(await readFile(join(folder, "new/deep/proof.json"), "utf8")),
      { value: 1 },
    );
    await assert.rejects(
      writeNewProofFile("new/deep/proof.json", { value: 2 }, folder),
      { code: "EEXIST" },
    );
    await assert.rejects(
      writeNewProofFile("../escape.json", {}, folder),
      /OUTPUT_PATH_INVALID/,
    );
    await symlink(outside, join(folder, "escape"));
    await assert.rejects(
      writeNewProofFile("escape/proof.json", {}, folder),
      /OUTPUT_PATH_INVALID/,
    );
    await assert.rejects(readFile(join(outside, "proof.json")), {
      code: "ENOENT",
    });
    await symlink(join(outside, "target.json"), join(folder, "linked.json"));
    await assert.rejects(writeNewProofFile("linked.json", {}, folder), {
      code: "EEXIST",
    });
    await assert.rejects(readFile(join(outside, "target.json")), {
      code: "ENOENT",
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
test("verify-reused CLI writes a genuine rechecked result into a fresh output directory", async () => {
  const f = await fixture();
  const folder = await mkdtemp(join(tmpdir(), "guteneo-reused-cli-"));
  try {
    f.state.run.created_at = new Date(Date.now() - 600000).toISOString();
    f.state.run.run_started_at = f.state.run.created_at;
    f.state.run.updated_at = new Date(Date.now() - 500000).toISOString();
    const actualToolchain = {
      ...toolchain,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    };
    const mainContext = { ...context, toolchain: actualToolchain };
    const prContext = { ...recordContext, toolchain: actualToolchain };
    const proof = await createValidationProof({
      context: prContext,
      api: f.api,
      pullNumber: 42,
      evidenceText,
      runtimeRecords: runtimeJobs.map((job) =>
        createRuntimeRecord(prContext, job),
      ),
    });
    const qualified = await qualifyValidationProof({
      context: mainContext,
      api: f.api,
      proof,
      evidenceText,
    });
    assert.equal(qualified.reused, true);
    const responses = Object.fromEntries(
      await Promise.all(
        [...new Set(f.calls)].map(async (path) => [path, await f.api(path)]),
      ),
    );
    await writeFile(join(folder, "responses.json"), JSON.stringify(responses));
    await writeFile(
      join(folder, "api.mjs"),
      `import {readFile} from 'node:fs/promises';
const responses=JSON.parse(await readFile(new URL('./responses.json',import.meta.url),'utf8'));
globalThis.fetch=async(url)=>{const key=String(url).replace('https://api.github.com/repos/nclsppr/guteneo/','');
if(!Object.hasOwn(responses,key))throw Error('Missing fixture');return new Response(JSON.stringify(responses[key]));};`,
    );
    const env = {
      GITHUB_REPOSITORY: repository.full_name,
      GITHUB_REPOSITORY_ID: "123",
      GITHUB_SHA: current,
      GITHUB_RUN_ID: "100",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
      ImageOS: actualToolchain.imageOS,
      ImageVersion: actualToolchain.imageVersion,
      REUSE_PROOF_B64: qualified.proof_b64,
      CI_JOB_RESULTS: JSON.stringify(successfulJobs),
    };
    const args = [
      "--import",
      join(folder, "api.mjs"),
      resolve("scripts/ci/validation-proof.mjs"),
      "verify-reused",
      "fresh/ci/verified.json",
    ];
    await writeFile(
      join(folder, "no-api.mjs"),
      `import {writeFileSync} from 'node:fs';
globalThis.fetch=async()=>{writeFileSync(new URL('./api-called',import.meta.url),'called');throw Error('private-provider-output');};`,
    );
    const forced = spawnSync(
      process.execPath,
      ["--import", join(folder, "no-api.mjs"), ...args.slice(2)],
      { cwd: folder, env: { ...env, CI_FORCE_FULL: "true" }, encoding: "utf8" },
    );
    assert.equal(forced.status, 1);
    assert.match(forced.stderr, /VALIDATION_PROOF_FORCE_FULL/);
    await assert.rejects(readFile(join(folder, "api-called")), {
      code: "ENOENT",
    });
    await assert.rejects(readFile(join(folder, "fresh/ci/verified.json")), {
      code: "ENOENT",
    });
    const child = spawnSync(process.execPath, args, {
      cwd: folder,
      env,
      encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);
    const value = JSON.parse(
      await readFile(join(folder, "fresh/ci/verified.json"), "utf8"),
    );
    assert.equal(value.reused, true);
    assert.equal(value.priorRunId, 10);
    assert.equal(
      spawnSync(process.execPath, args, { cwd: folder, env }).status,
      1,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
test("the final reused gate rejects changed source, runtime, run, API evidence and prior attempt", async () => {
  for (const change of [
    (f, c) => {
      c.sourceCommit = sha("4");
    },
    (f, c) => {
      c.runId = 101;
    },
    (f, c) => {
      c.runAttempt = 2;
    },
    (f, c) => {
      c.toolchain.node = "v24.14.0";
    },
    (f) => {
      f.state.run.run_attempt = 2;
    },
    (f) => {
      f.state.artifacts[0].digest = `sha256:${"8".repeat(64)}`;
    },
  ]) {
    const f = await fixture(),
      selected = await qualify(f),
      c = structuredClone(context);
    change(f, c);
    await assert.rejects(
      verifyReusedValidation({
        context: c,
        api: f.api,
        sealedBase64: selected.proof_b64,
        jobs: successfulJobs,
        now,
      }),
      /^Error: VALIDATION_PROOF_/,
    );
  }
});
test("fresh dependencies and scanner must succeed and every reused heavy job must be explicitly skipped", () => {
  requireReusedJobs(successfulJobs);
  for (const name of Object.keys(successfulJobs)) {
    const value = structuredClone(successfulJobs);
    value[name].result = "cancelled";
    assert.throws(() => requireReusedJobs(value), /REUSE_JOBS_INVALID/);
  }
  assert.throws(
    () =>
      requireReusedJobs({ ...successfulJobs, extra: { result: "success" } }),
    /REUSE_JOBS_INVALID/,
  );
});
test("fixed-origin JSON reader bounds bytes, requests and endpoints and never follows redirects", async () => {
  const calls = [];
  const api = createValidationReader({
    token: "private-test-token",
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true }));
    },
  });
  assert.deepEqual(await api("actions/runs/10"), { ok: true });
  assert.equal(
    calls[0].url,
    "https://api.github.com/repos/nclsppr/guteneo/actions/runs/10",
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.redirect, "error");
  for (const path of [
    "https://other.invalid/",
    "../secrets",
    "/actions",
    "clients#private",
  ])
    await assert.rejects(api(path), /API_REQUEST_INVALID/);
  const large = createValidationReader({
    fetcher: async () => new Response("x".repeat(1048577)),
  });
  await assert.rejects(large("actions/runs/10"), /API_RESPONSE_TOO_LARGE/);
  const failed = createValidationReader({
    fetcher: async () => new Response("private provider text", { status: 403 }),
  });
  await assert.rejects(failed("actions/runs/10"), {
    message: "VALIDATION_PROOF_API_UNAVAILABLE",
  });
});
test("the reader shares one minute across requests and shortens the final request timeout", async (t) => {
  let elapsed = 0;
  const calls = [],
    timeouts = [];
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, "timeout", (duration) => {
    timeouts.push(duration);
    return timeout(duration);
  });
  const api = createValidationReader({
    token: "private-deadline-token",
    clock: () => elapsed,
    fetcher: async (url) => {
      calls.push(url);
      elapsed += 5000;
      return new Response("{}");
    },
  });
  await api("actions/runs/10");
  elapsed = 50000;
  await api("actions/runs/10");
  assert.deepEqual(timeouts, [15000, 10000]);
  elapsed = 60000;
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(api("actions/runs/10"), {
      message: "VALIDATION_PROOF_API_DEADLINE_EXCEEDED",
    });
  }
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => !url.includes("private-deadline-token")));
});
test("a body that reaches the reader deadline is rejected and cancelled before parsing", async () => {
  let elapsed = 0,
    cancelled = false;
  const api = createValidationReader({
    clock: () => elapsed,
    fetcher: async () => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            elapsed = 60000;
            return { done: false, value: Buffer.from("private-provider-body") };
          },
          cancel: async () => {
            cancelled = true;
          },
        }),
      },
    }),
  });
  await assert.rejects(api("actions/runs/10"), {
    message: "VALIDATION_PROOF_API_DEADLINE_EXCEEDED",
  });
  assert.equal(cancelled, true);
});
test("an exhausted reader falls back during qualification and fails the final reused gate without any API call", async () => {
  const f = await fixture(),
    qualified = await qualify(f);
  let elapsed = 0,
    calls = 0;
  const api = createValidationReader({
    token: "private-deadline-token",
    clock: () => elapsed,
    fetcher: async () => {
      calls++;
      throw Error("private-provider-body");
    },
  });
  elapsed = 60000;
  const expected = {
    reused: false,
    candidate: false,
    reason: "VALIDATION_PROOF_API_DEADLINE_EXCEEDED",
  };
  assert.deepEqual(
    await selectValidationProof({ context, api, now }),
    expected,
  );
  assert.deepEqual(await qualify(f, { api }), expected);
  await assert.rejects(
    verifyReusedValidation({
      context,
      api,
      sealedBase64: qualified.proof_b64,
      jobs: successfulJobs,
      now,
    }),
    { message: "VALIDATION_PROOF_REUSE_CHANGED" },
  );
  assert.equal(calls, 0);
});
test("qualify CLI treats absent files, symlinks and unexpected artifact files as full fallback without executing them", async () => {
  const folder = await mkdtemp(join(tmpdir(), "guteneo-proof-"));
  const script = "scripts/ci/validation-proof.mjs";
  try {
    await writeFile(join(folder, "verified.json"), evidenceText);
    await writeFile(join(folder, "outside.json"), "{}");
    await symlink(join(folder, "outside.json"), join(folder, "proof.json"));
    const child = spawnSync(process.execPath, [script, "qualify", folder], {
      encoding: "utf8",
      env: {},
    });
    assert.equal(child.status, 0);
    assert.equal(JSON.parse(child.stdout).reused, false);
    assert.doesNotMatch(
      child.stdout + child.stderr,
      /never-echo-this|private-test-token/,
    );
    const missing = spawnSync(
      process.execPath,
      [script, "qualify", join(folder, "absent")],
      { encoding: "utf8", env: {} },
    );
    assert.equal(missing.status, 0);
    assert.equal(JSON.parse(missing.stdout).reused, false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
