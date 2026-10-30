import { createHash } from "node:crypto";
import {
  appendFile,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const REPOSITORY = "nclsppr/guteneo";
const WORKFLOW = ".github/workflows/ci.yml";
const MAX_BYTES = 131072;
const MAX_API_BYTES = 1048576;
const API_BUDGET_MS = 60000;
const MAX_AGE = 24 * 60 * 60 * 1000;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    object(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
function requireProof(condition, code) {
  if (!condition) throw new Error(`VALIDATION_PROOF_${code}`);
}
function reason(error) {
  return /^VALIDATION_PROOF_[A-Z_]+$/.test(error?.message ?? "")
    ? error.message
    : "VALIDATION_PROOF_UNAVAILABLE";
}
const exactKeys = (value, keys) =>
  object(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());

export const fullValidationJobs = Object.freeze([
  "qualification",
  "dependencies",
  "pdf-validator",
  "scanner",
  "checks",
  ...[1, 2, 3, 4].map((n) => `vitest (${n})`),
  "security",
  "build",
  "engineering",
  ...[1, 2, 3].flatMap((n) => [
    `browser (chromium, chromium, desktop, ${n}, 3)`,
    `browser (mobile-chromium, chromium, ${n}, 3)`,
    `browser (iphone-webkit, chromium webkit, iphone, ${n}, 3)`,
  ]),
  "distribution-e2e (strong, e2e.config.ts, 14)",
  "distribution-e2e (verified_account, e2e.verified-account.config.ts, 2)",
  "verify",
]);
const locks = [
  "package-lock.json",
  "apps/engineering/package-lock.json",
  "apps/pdf-validator/package-lock.json",
  "apps/scanner/package-lock.json",
];
export const runtimeJobs = Object.freeze([
  "dependencies",
  "pdf-validator",
  "scanner",
  "checks",
  "vitest-1",
  "vitest-2",
  "vitest-3",
  "vitest-4",
  "security",
  "build",
  "engineering",
  ...["chromium", "mobile-chromium", "iphone-webkit"].flatMap((project) =>
    [1, 2, 3].map((shard) => `browser-${project}-${shard}`),
  ),
  "distribution-strong",
  "distribution-verified_account",
]);

/** Fixed-origin, bounded JSON reads only; provider errors and credentials never escape. */
export function createValidationReader({
  token,
  fetcher = fetch,
  repository = REPOSITORY,
  clock = Date.now,
} = {}) {
  let calls = 0;
  const deadline = clock() + API_BUDGET_MS;
  const remainingTime = () => {
    const remaining = Math.floor(deadline - clock());
    requireProof(
      Number.isFinite(remaining) && remaining > 0,
      "API_DEADLINE_EXCEEDED",
    );
    return Math.min(15000, remaining);
  };
  requireProof(repository === REPOSITORY, "REPOSITORY_REQUIRED");
  return async (path) => {
    const timeout = remainingTime();
    requireProof(
      ++calls <= 80 &&
        typeof path === "string" &&
        !path.startsWith("/") &&
        !path.includes("..") &&
        !path.includes("#") &&
        /^[A-Za-z0-9_./?=&%-]+$/.test(path),
      "API_REQUEST_INVALID",
    );
    const response = await fetcher(
      `https://api.github.com/repos/${repository}/${path}`,
      {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    remainingTime();
    requireProof(response.ok, "API_UNAVAILABLE");
    const reader = response.body?.getReader();
    requireProof(reader, "API_RESPONSE_INVALID");
    const chunks = [];
    let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read();
        remainingTime();
        if (part.done) break;
        bytes += part.value.byteLength;
        requireProof(bytes <= MAX_API_BYTES, "API_RESPONSE_TOO_LARGE");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("VALIDATION_PROOF_API_RESPONSE_INVALID");
    }
  };
}

function runtime(value) {
  requireProof(
    object(value) &&
      /^v\d+\.\d+\.\d+$/.test(value.node ?? "") &&
      [value.platform, value.arch, value.imageOS, value.imageVersion].every(
        (v) => typeof v === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(v),
      ),
    "TOOLCHAIN_REQUIRED",
  );
  return {
    node: value.node,
    platform: value.platform,
    arch: value.arch,
    imageOS: value.imageOS,
    imageVersion: value.imageVersion,
  };
}
function contextFromEnv(env) {
  return {
    repository: env.GITHUB_REPOSITORY,
    repositoryId: Number(env.GITHUB_REPOSITORY_ID),
    sourceCommit: env.GITHUB_SHA,
    runId: Number(env.GITHUB_RUN_ID),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    event: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF,
    forceFull: env.CI_FORCE_FULL === "true",
    toolchain: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      imageOS: env.ImageOS,
      imageVersion: env.ImageVersion,
    },
  };
}
export function createRuntimeRecord(context, job) {
  validContext(context, false, false);
  requireProof(runtimeJobs.includes(job), "RUNTIME_JOB_INVALID");
  const identity = {
    schema: 1,
    job,
    revision: context.sourceCommit,
    runId: context.runId,
    runAttempt: context.runAttempt,
  };
  try {
    return { ...identity, toolchain: runtime(context.toolchain) };
  } catch (error) {
    return { ...identity, toolchain: null, unavailableReason: reason(error) };
  }
}
export function validateRuntimeRecords(records, context) {
  requireProof(
    Array.isArray(records) &&
      records.length === runtimeJobs.length &&
      new Set(records.map((record) => record?.job)).size === records.length &&
      isDeepStrictEqual(
        records.map((record) => record?.job).sort(),
        [...runtimeJobs].sort(),
      ),
    "RUNTIME_INCOMPLETE",
  );
  for (const record of records) {
    requireProof(
      exactKeys(record, [
        "schema",
        "job",
        "revision",
        "runId",
        "runAttempt",
        "toolchain",
      ]) &&
        record.schema === 1 &&
        record.revision === context.sourceCommit &&
        record.runId === context.runId &&
        record.runAttempt === context.runAttempt &&
        isDeepStrictEqual(record.toolchain, runtime(context.toolchain)),
      "RUNTIME_MISMATCH",
    );
  }
  return [...records].sort((a, b) => a.job.localeCompare(b.job));
}
function validContext(context, main = true, requireRuntime = true) {
  requireProof(
    context?.repository === REPOSITORY &&
      positive(context.repositoryId) &&
      SHA.test(context.sourceCommit ?? "") &&
      positive(context.runId) &&
      positive(context.runAttempt),
    "CONTEXT_REQUIRED",
  );
  if (main)
    requireProof(
      context.event === "push" && context.ref === "refs/heads/main",
      "MAIN_PUSH_REQUIRED",
    );
  if (requireRuntime) runtime(context.toolchain);
}
const sameRepository = (value, context) =>
  value?.id === context.repositoryId && value.full_name === context.repository;
function validCommit(value, sha) {
  requireProof(
    value?.sha === sha &&
      SHA.test(value.tree?.sha ?? "") &&
      Array.isArray(value.parents) &&
      value.parents.every((p) => SHA.test(p.sha ?? "")),
    "COMMIT_INVALID",
  );
  return value;
}
async function sourcePolicy(api, sha) {
  const [root, scripts, github, pkg, lockFiles] = await Promise.all([
    api(`contents/?ref=${sha}`),
    api(`contents/scripts?ref=${sha}`),
    api(`contents/.github?ref=${sha}`),
    api(`contents/package.json?ref=${sha}`),
    Promise.all(
      locks.map(async (path) => {
        const file = await api(`contents/${path}?ref=${sha}`);
        requireProof(
          file?.type === "file" && SHA.test(file.sha ?? ""),
          "LOCK_INVALID",
        );
        return [path, file.sha];
      }),
    ),
  ]);
  requireProof([root, scripts, github].every(Array.isArray), "POLICY_INVALID");
  const directory = (entries, name) => {
    const matches = entries.filter(
      (e) => e.name === name && e.type === "dir" && SHA.test(e.sha ?? ""),
    );
    requireProof(matches.length === 1, "POLICY_INVALID");
    return matches[0].sha;
  };
  requireProof(
    pkg?.type === "file" &&
      pkg.encoding === "base64" &&
      typeof pkg.content === "string" &&
      pkg.content.length <= MAX_BYTES,
    "POLICY_INVALID",
  );
  let manifest;
  try {
    manifest = JSON.parse(Buffer.from(pkg.content, "base64").toString("utf8"));
  } catch {
    throw new Error("VALIDATION_PROOF_POLICY_INVALID");
  }
  requireProof(object(manifest), "POLICY_INVALID");
  const configs = root.filter((entry) =>
    /^(?:(?:playwright|vitest|e2e|eslint|prettier).*config\.[cm]?[jt]s|tsconfig.*\.json|\.npmrc|\.nvmrc)$/.test(
      entry.name,
    ),
  );
  requireProof(
    configs.length > 0 &&
      configs.every((e) => e.type === "file" && SHA.test(e.sha ?? "")),
    "POLICY_INVALID",
  );
  return {
    policy: {
      ci: directory(scripts, "ci"),
      workflows: directory(github, "workflows"),
      configs: Object.fromEntries(configs.map((e) => [e.name, e.sha]).sort()),
      package: {
        scripts: manifest.scripts ?? null,
        engines: manifest.engines ?? null,
        devDependencies: manifest.devDependencies ?? null,
        overrides: manifest.overrides ?? null,
      },
    },
    locks: Object.fromEntries(lockFiles),
  };
}
function requireRun(run, candidate, context, workflow, now) {
  requireProof(
    run?.id === candidate.runId &&
      run.run_attempt === candidate.runAttempt &&
      run.event === "pull_request" &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      run.workflow_id === workflow.id &&
      run.path === WORKFLOW &&
      run.head_sha === candidate.headSha &&
      sameRepository(run.repository, context) &&
      sameRepository(run.head_repository, context) &&
      run.head_branch === candidate.headRef &&
      Array.isArray(run.pull_requests) &&
      (run.pull_requests.length === 0 ||
        run.pull_requests.some((p) => p.number === candidate.pullNumber)),
    "RUN_INVALID",
  );
  const start = Date.parse(run.run_started_at),
    end = Date.parse(run.updated_at);
  requireProof(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= end &&
      end <= now + 30000 &&
      start <= now &&
      now - start <= MAX_AGE &&
      now - end <= MAX_AGE,
    "STALE",
  );
}
function requireFullJobs(body, candidate) {
  requireProof(
    body?.total_count === fullValidationJobs.length &&
      Array.isArray(body.jobs) &&
      body.jobs.length === fullValidationJobs.length &&
      new Set(body.jobs.map((j) => j.id)).size === body.jobs.length &&
      isDeepStrictEqual(
        body.jobs.map((j) => j.name).sort(),
        [...fullValidationJobs].sort(),
      ) &&
      body.jobs.every(
        (j) =>
          positive(j.id) &&
          j.run_id === candidate.runId &&
          j.run_attempt === candidate.runAttempt &&
          j.status === "completed" &&
          j.conclusion === "success",
      ),
    "FULL_JOBS_REQUIRED",
  );
}
function requireArtifact(body, candidate, context) {
  requireProof(
    Number.isSafeInteger(body?.total_count) &&
      body.total_count <= 100 &&
      Array.isArray(body.artifacts) &&
      body.artifacts.length === body.total_count,
    "ARTIFACT_INVALID",
  );
  const matches = body.artifacts.filter(
    (a) =>
      a.name ===
      `ci-validation-proof-${candidate.runId}-${candidate.runAttempt}`,
  );
  requireProof(matches.length === 1, "ARTIFACT_REQUIRED");
  const a = matches[0];
  requireProof(
    positive(a.id) &&
      a.expired === false &&
      positive(a.size_in_bytes) &&
      a.size_in_bytes <= MAX_BYTES &&
      /^sha256:[a-f0-9]{64}$/.test(a.digest ?? "") &&
      a.workflow_run?.id === candidate.runId &&
      a.workflow_run.head_sha === candidate.headSha &&
      a.workflow_run.head_repository_id === context.repositoryId &&
      a.workflow_run.repository_id === context.repositoryId,
    "ARTIFACT_INVALID",
  );
  return { id: a.id, digest: a.digest, size: a.size_in_bytes };
}

async function inspectMain({ context, api }) {
  validContext(context);
  const currentRef = await api("git/ref/heads/main");
  requireProof(
    currentRef?.ref === "refs/heads/main" &&
      currentRef.object?.sha === context.sourceCommit,
    "MAIN_CHANGED",
  );
  const main = validCommit(
    await api(`git/commits/${context.sourceCommit}`),
    context.sourceCommit,
  );
  requireProof(main.parents.length === 2, "ORDINARY_MERGE_REQUIRED");
  const [baseSha, headSha] = main.parents.map((p) => p.sha);
  const associated = await api(
    `commits/${context.sourceCommit}/pulls?per_page=100`,
  );
  requireProof(
    Array.isArray(associated) && associated.length <= 100,
    "PULL_INVALID",
  );
  const merged = associated.filter(
    (p) => p.merge_commit_sha === context.sourceCommit && p.state === "closed",
  );
  requireProof(
    merged.length === 1 && positive(merged[0].number),
    "PULL_REQUIRED",
  );
  const pull = await api(`pulls/${merged[0].number}`);
  requireProof(
    pull?.number === merged[0].number &&
      pull.state === "closed" &&
      pull.merged === true &&
      pull.merge_commit_sha === context.sourceCommit &&
      pull.base?.ref === "main" &&
      pull.base.sha === baseSha &&
      pull.head?.sha === headSha &&
      sameRepository(pull.base.repo, context) &&
      sameRepository(pull.head.repo, context),
    "PULL_INVALID",
  );
  const [workflow, current, base] = await Promise.all([
    api("actions/workflows/ci.yml"),
    sourcePolicy(api, context.sourceCommit),
    sourcePolicy(api, baseSha),
  ]);
  requireProof(
    positive(workflow?.id) &&
      workflow.path === WORKFLOW &&
      workflow.state === "active",
    "WORKFLOW_INVALID",
  );
  requireProof(
    isDeepStrictEqual(current.policy, base.policy),
    "POLICY_CHANGED",
  );
  return { main, pull, workflow, current, baseSha, headSha };
}

/** Any unavailable or ineligible evidence selects a complete fresh run. */
export async function selectValidationProof({
  context,
  api,
  now = Date.now(),
}) {
  try {
    requireProof(context?.forceFull !== true, "FORCE_FULL");
    const inspected = await inspectMain({ context, api });
    const { main, pull, workflow, current, baseSha, headSha } = inspected;
    const response = await api(
      `actions/workflows/${workflow.id}/runs?event=pull_request&head_sha=${headSha}&per_page=100`,
    );
    requireProof(
      Number.isSafeInteger(response?.total_count) &&
        response.total_count <= 100 &&
        Array.isArray(response.workflow_runs) &&
        response.workflow_runs.length === response.total_count,
      "RUNS_INVALID",
    );
    // Never fall back to an older green attempt after a newer run failed or was cancelled.
    const runs = response.workflow_runs
      .filter(
        (r) =>
          r.head_sha === headSha &&
          r.event === "pull_request" &&
          r.workflow_id === workflow.id,
      )
      .sort(
        (a, b) =>
          Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
      );
    requireProof(
      runs.length > 0 && positive(runs[0].id) && positive(runs[0].run_attempt),
      "RUN_REQUIRED",
    );
    requireProof(
      typeof pull.head.ref === "string" &&
        pull.head.ref.length > 0 &&
        pull.head.ref.length <= 250,
      "PULL_INVALID",
    );
    const candidate = {
      runId: runs[0].id,
      runAttempt: runs[0].run_attempt,
      pullNumber: pull.number,
      baseSha,
      headSha,
      headRef: pull.head.ref,
    };
    const run = await api(`actions/runs/${candidate.runId}`);
    requireRun(run, candidate, context, workflow, now);
    const [jobs, artifacts] = await Promise.all([
      api(
        `actions/runs/${candidate.runId}/attempts/${candidate.runAttempt}/jobs?per_page=100`,
      ),
      api(`actions/runs/${candidate.runId}/artifacts?per_page=100`),
    ]);
    requireFullJobs(jobs, candidate);
    const artifact = requireArtifact(artifacts, candidate, context);
    return {
      reused: false,
      candidate: true,
      reason: "VALIDATION_PROOF_CANDIDATE",
      candidateRun: candidate,
      artifact,
      workflow: { id: workflow.id, path: WORKFLOW },
      sourcePolicy: current,
      main: {
        sha: context.sourceCommit,
        tree: main.tree.sha,
        runId: context.runId,
        runAttempt: context.runAttempt,
      },
      toolchain: runtime(context.toolchain),
    };
  } catch (error) {
    return { reused: false, candidate: false, reason: reason(error) };
  }
}

function evidenceSummary(text) {
  requireProof(
    typeof text === "string" && Buffer.byteLength(text) <= MAX_BYTES,
    "EVIDENCE_INVALID",
  );
  let evidence;
  try {
    evidence = JSON.parse(text);
  } catch {
    throw new Error("VALIDATION_PROOF_EVIDENCE_INVALID");
  }
  const b = evidence?.browser;
  requireProof(
    exactKeys(evidence, ["files", "passed", "browser"]) &&
      positive(evidence.files) &&
      positive(evidence.passed) &&
      exactKeys(b, [
        "rows",
        "suites",
        "discovered",
        "passed",
        "declaredSkipped",
        "evidenceAttempts",
      ]) &&
      b.rows === 9 &&
      positive(b.suites) &&
      positive(b.discovered) &&
      positive(b.passed) &&
      Number.isSafeInteger(b.declaredSkipped) &&
      b.declaredSkipped >= 0 &&
      b.passed + b.declaredSkipped === b.discovered &&
      Array.isArray(b.evidenceAttempts) &&
      b.evidenceAttempts.length > 0 &&
      b.evidenceAttempts.length <= 100 &&
      b.evidenceAttempts.every((a) => /^[1-9]\d*$/.test(String(a))),
    "EVIDENCE_INVALID",
  );
  return evidence;
}
export async function createValidationProof({
  context,
  api,
  pullNumber,
  evidenceText,
  runtimeRecords,
  runtimeError,
}) {
  validContext(context, false, false);
  requireProof(
    context.event === "pull_request" &&
      /^refs\/pull\/[1-9]\d*\/merge$/.test(context.ref) &&
      positive(pullNumber) &&
      context.ref === `refs/pull/${pullNumber}/merge`,
    "PR_FULL_RUN_REQUIRED",
  );
  const commit = validCommit(
    await api(`git/commits/${context.sourceCommit}`),
    context.sourceCommit,
  );
  requireProof(commit.parents.length === 2, "ORDINARY_MERGE_REQUIRED");
  const [workflow, source] = await Promise.all([
    api("actions/workflows/ci.yml"),
    sourcePolicy(api, context.sourceCommit),
  ]);
  requireProof(
    positive(workflow?.id) && workflow.path === WORKFLOW,
    "WORKFLOW_INVALID",
  );
  const evidence = evidenceSummary(evidenceText);
  requireProof(
    evidence.browser.evidenceAttempts.every(
      (n) => Number(n) === context.runAttempt,
    ),
    "MIXED_ATTEMPTS",
  );
  let records = [],
    reusable = true,
    unavailableReason = null,
    recordedRuntime = null;
  try {
    recordedRuntime = runtime(context.toolchain);
    requireProof(!runtimeError, "RUNTIME_FILES_INVALID");
    records = validateRuntimeRecords(runtimeRecords, context);
  } catch (error) {
    reusable = false;
    unavailableReason = reason(error);
  }
  const value = {
    schema: 1,
    full: true,
    reusable,
    reason: unavailableReason,
    runtimeRecords: records,
    repository: context.repository,
    repositoryId: context.repositoryId,
    workflow: { id: workflow.id, path: WORKFLOW },
    run: {
      id: context.runId,
      attempt: context.runAttempt,
      event: "pull_request",
    },
    pull: {
      number: pullNumber,
      base: commit.parents[0].sha,
      head: commit.parents[1].sha,
    },
    tested: { commit: context.sourceCommit, tree: commit.tree.sha },
    toolchain: recordedRuntime,
    sourcePolicy: source,
    evidence: { sha256: hash(evidenceText), summary: evidence },
  };
  return { ...value, selfHash: hash(canonical(value)) };
}
async function validateFiles({ selection, proof, evidenceText, context, api }) {
  requireProof(
    selection.candidate === true && object(proof),
    "CANDIDATE_REQUIRED",
  );
  requireProof(
    exactKeys(proof, [
      "schema",
      "full",
      "reusable",
      "reason",
      "runtimeRecords",
      "repository",
      "repositoryId",
      "workflow",
      "run",
      "pull",
      "tested",
      "toolchain",
      "sourcePolicy",
      "evidence",
      "selfHash",
    ]) &&
      exactKeys(proof.run, ["id", "attempt", "event"]) &&
      exactKeys(proof.pull, ["number", "base", "head"]) &&
      exactKeys(proof.tested, ["commit", "tree"]) &&
      exactKeys(proof.evidence, ["sha256", "summary"]),
    "PROOF_INVALID",
  );
  const { selfHash, ...unsigned } = proof;
  requireProof(
    DIGEST.test(selfHash ?? "") && hash(canonical(unsigned)) === selfHash,
    "SELF_HASH_INVALID",
  );
  const c = selection.candidateRun;
  requireProof(
    proof.schema === 1 &&
      proof.full === true &&
      proof.reusable === true &&
      proof.reason === null &&
      proof.repository === context.repository &&
      proof.repositoryId === context.repositoryId &&
      isDeepStrictEqual(proof.workflow, selection.workflow) &&
      proof.run?.id === c.runId &&
      proof.run.attempt === c.runAttempt &&
      proof.run.event === "pull_request" &&
      proof.pull?.number === c.pullNumber &&
      proof.pull.base === c.baseSha &&
      proof.pull.head === c.headSha &&
      SHA.test(proof.tested?.commit ?? "") &&
      proof.tested.tree === selection.main.tree &&
      isDeepStrictEqual(proof.toolchain, runtime(context.toolchain)) &&
      isDeepStrictEqual(proof.sourcePolicy, selection.sourcePolicy),
    "PROOF_MISMATCH",
  );
  const commit = validCommit(
    await api(`git/commits/${proof.tested.commit}`),
    proof.tested.commit,
  );
  validateRuntimeRecords(proof.runtimeRecords, {
    ...context,
    sourceCommit: proof.tested.commit,
    runId: c.runId,
    runAttempt: c.runAttempt,
  });
  requireProof(
    commit.tree.sha === selection.main.tree &&
      commit.parents.length === 2 &&
      commit.parents[0].sha === c.baseSha &&
      commit.parents[1].sha === c.headSha,
    "TESTED_TREE_MISMATCH",
  );
  requireProof(
    proof.evidence?.sha256 === hash(evidenceText) &&
      isDeepStrictEqual(
        proof.evidence.summary,
        evidenceSummary(evidenceText),
      ) &&
      proof.evidence.summary.browser.evidenceAttempts.every(
        (n) => Number(n) === c.runAttempt,
      ),
    "EVIDENCE_MISMATCH",
  );
}
export async function qualifyValidationProof({
  context,
  api,
  proof,
  evidenceText,
  now = Date.now(),
}) {
  try {
    const selection = await selectValidationProof({ context, api, now });
    if (!selection.candidate) return selection;
    await validateFiles({ selection, proof, evidenceText, context, api });
    const sealed = { schema: 1, selection, proof, evidenceText };
    const text = JSON.stringify(sealed);
    requireProof(
      Buffer.byteLength(text) <= MAX_BYTES,
      "SEALED_PROOF_TOO_LARGE",
    );
    return {
      reused: true,
      reason: "VALIDATION_PROOF_REUSED",
      run_id: selection.candidateRun.runId,
      run_attempt: selection.candidateRun.runAttempt,
      artifact_id: selection.artifact.id,
      proof_b64: Buffer.from(text).toString("base64"),
    };
  } catch (error) {
    return { reused: false, reason: reason(error) };
  }
}
export function requireReusedJobs(results) {
  const fresh = ["qualification", "dependencies", "scanner"];
  const skipped = [
    "pdf-validator",
    "checks",
    "vitest",
    "security",
    "build",
    "browser",
    "distribution-e2e",
    "engineering",
  ];
  requireProof(
    object(results) &&
      isDeepStrictEqual(
        Object.keys(results).sort(),
        [...fresh, ...skipped].sort(),
      ) &&
      fresh.every((name) => results[name]?.result === "success") &&
      skipped.every((name) => results[name]?.result === "skipped"),
    "REUSE_JOBS_INVALID",
  );
}
export async function verifyReusedValidation({
  context,
  api,
  sealedBase64,
  jobs,
  now = Date.now(),
}) {
  requireProof(context?.forceFull !== true, "FORCE_FULL");
  requireReusedJobs(jobs);
  requireProof(
    typeof sealedBase64 === "string" &&
      sealedBase64.length <= Math.ceil((MAX_BYTES * 4) / 3) + 4 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(sealedBase64),
    "SEALED_PROOF_INVALID",
  );
  let sealed;
  try {
    sealed = JSON.parse(Buffer.from(sealedBase64, "base64").toString("utf8"));
  } catch {
    throw new Error("VALIDATION_PROOF_SEALED_PROOF_INVALID");
  }
  requireProof(
    sealed?.schema === 1 &&
      sealed.selection?.main?.sha === context.sourceCommit &&
      sealed.selection.main.runId === context.runId &&
      sealed.selection.main.runAttempt === context.runAttempt &&
      isDeepStrictEqual(sealed.selection.toolchain, runtime(context.toolchain)),
    "SEALED_CONTEXT_CHANGED",
  );
  const selection = await selectValidationProof({ context, api, now });
  requireProof(
    selection.candidate === true &&
      isDeepStrictEqual(selection, sealed.selection),
    "REUSE_CHANGED",
  );
  await validateFiles({
    selection,
    proof: sealed.proof,
    evidenceText: sealed.evidenceText,
    context,
    api,
  });
  return {
    schema: 1,
    reused: true,
    full: false,
    sourceCommit: context.sourceCommit,
    tree: selection.main.tree,
    priorRunId: selection.candidateRun.runId,
    priorRunAttempt: selection.candidateRun.runAttempt,
    artifactId: selection.artifact.id,
    artifactDigest: selection.artifact.digest,
    evidenceSha256: sealed.proof.evidence.sha256,
    counts: sealed.proof.evidence.summary,
    toolchain: selection.toolchain,
  };
}

async function regularText(path, limit = MAX_BYTES) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    requireProof(
      stat.isFile() && stat.size > 0 && stat.size <= limit,
      "FILE_INVALID",
    );
    const bytes = await handle.readFile();
    requireProof(bytes.length <= limit, "FILE_INVALID");
    return bytes.toString("utf8");
  } finally {
    await handle.close();
  }
}
/** CLI outputs stay under the current workspace and never replace a path. */
export async function writeNewProofFile(
  path,
  value,
  workspace = process.cwd(),
) {
  const root = await realpath(workspace);
  const target = resolve(root, path);
  const local = relative(root, target);
  requireProof(
    local &&
      local !== ".." &&
      !local.startsWith(`..${sep}`) &&
      !isAbsolute(local),
    "OUTPUT_PATH_INVALID",
  );
  let parent = root;
  for (const part of relative(root, dirname(target))
    .split(sep)
    .filter(Boolean)) {
    parent = join(parent, part);
    try {
      await mkdir(parent, { mode: 0o700 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const stat = await lstat(parent);
    requireProof(
      stat.isDirectory() && !stat.isSymbolicLink(),
      "OUTPUT_PATH_INVALID",
    );
  }
  const file = await open(
    target,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
  } finally {
    await file.close();
  }
}
async function proofDirectory(path) {
  const stat = await lstat(path);
  requireProof(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      isDeepStrictEqual((await readdir(path)).sort(), [
        "proof.json",
        "verified.json",
      ]),
    "ARTIFACT_FILES_INVALID",
  );
  return {
    proof: JSON.parse(await regularText(join(path, "proof.json"))),
    evidenceText: await regularText(join(path, "verified.json")),
  };
}
export async function readRuntimeRecords(path) {
  const records = [];
  const stat = await lstat(path);
  requireProof(
    stat.isDirectory() && !stat.isSymbolicLink(),
    "RUNTIME_FILES_INVALID",
  );
  let inspected = 0;
  async function visit(directory, depth = 0) {
    requireProof(depth <= 20, "RUNTIME_FILES_INVALID");
    const entries = await readdir(directory, { withFileTypes: true });
    inspected += entries.length;
    requireProof(
      entries.length <= 1000 && inspected <= 10000,
      "RUNTIME_FILES_INVALID",
    );
    for (const entry of entries) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await visit(file, depth + 1);
      else if (/^runtime-.*\.json$/.test(entry.name)) {
        requireProof(
          entry.isFile() && records.length < runtimeJobs.length,
          "RUNTIME_FILES_INVALID",
        );
        const record = JSON.parse(await regularText(file, 4096));
        requireProof(
          entry.name === `runtime-${record.job}.json`,
          "RUNTIME_FILES_INVALID",
        );
        records.push(record);
      }
    }
  }
  await visit(path);
  return records;
}
async function emit(value, env) {
  console.log(
    JSON.stringify({
      reused: value.reused === true,
      candidate: value.candidate === true,
      reason: value.reason,
      artifact_id: value.artifact?.id ?? value.artifact_id,
      run_id: value.candidateRun?.runId ?? value.run_id,
      run_attempt: value.candidateRun?.runAttempt ?? value.run_attempt,
    }),
  );
  if (env.GITHUB_OUTPUT) {
    const output = {
      reused: String(value.reused === true),
      reason: value.reason,
      candidate: String(value.candidate === true),
      artifact_id: value.artifact?.id ?? value.artifact_id ?? "",
      run_id: value.candidateRun?.runId ?? value.run_id ?? "",
      run_attempt: value.candidateRun?.runAttempt ?? value.run_attempt ?? "",
      proof_b64: value.proof_b64 ?? "",
    };
    await appendFile(
      env.GITHUB_OUTPUT,
      Object.entries(output)
        .map(([key, item]) => `${key}=${item ?? ""}\n`)
        .join(""),
    );
  }
}
async function main(args, env) {
  const context = contextFromEnv(env),
    api = createValidationReader({ token: env.GITHUB_TOKEN });
  const [command, input, output] = args;
  if (command === "select" && args.length === 1)
    return emit(await selectValidationProof({ context, api }), env);
  if (command === "qualify" && args.length === 2) {
    if (context.forceFull)
      return emit(await selectValidationProof({ context, api }), env);
    let value;
    try {
      value = await qualifyValidationProof({
        context,
        api,
        ...(await proofDirectory(input)),
      });
    } catch (error) {
      value = { reused: false, reason: reason(error) };
    }
    return emit(value, env);
  }
  if (command === "record" && args.length === 3) {
    const event = JSON.parse(
      await regularText(env.GITHUB_EVENT_PATH, MAX_API_BYTES),
    );
    let runtimeRecords, runtimeError;
    try {
      runtimeRecords = await readRuntimeRecords("test-results/ci/evidence");
    } catch {
      runtimeError = true;
    }
    const proof = await createValidationProof({
      context,
      api,
      pullNumber: event.number,
      evidenceText: await regularText(input),
      runtimeRecords,
      runtimeError,
    });
    await writeNewProofFile(output, proof);
    return;
  }
  if (command === "runtime" && args.length === 3) {
    await writeNewProofFile(output, createRuntimeRecord(context, input));
    return;
  }
  if (command === "verify-reused" && args.length === 2) {
    const verified = await verifyReusedValidation({
      context,
      api,
      sealedBase64: env.REUSE_PROOF_B64,
      jobs: JSON.parse(env.CI_JOB_RESULTS || "null"),
    });
    await writeNewProofFile(input, verified);
    return;
  }
  throw new Error("VALIDATION_PROOF_ARGUMENTS_INVALID");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main(process.argv.slice(2), process.env).catch((error) => {
    console.error(reason(error));
    process.exitCode = 1;
  });
}
