import { fullValidationJobs } from "./validation-proof.mjs";
import { execFileSync } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repository = "nclsppr/guteneo";
const sha = /^[a-f0-9]{40}$/;
const id = (value) => Number.isSafeInteger(value) && value > 0;
const manifestPaths = new Set([
  "package.json",
  "package-lock.json",
  "apps/engineering/package.json",
  "apps/engineering/package-lock.json",
  "apps/pdf-validator/package.json",
  "apps/pdf-validator/package-lock.json",
  "apps/scanner/package.json",
  "apps/scanner/package-lock.json",
]);
function demand(condition, code) {
  if (!condition) throw new Error(`DEPENDENCY_RELEASE_${code}`);
}

/** A privileged workflow_run never consumes code or artifacts from a PR run. */
export function requireMainRun(run, context) {
  demand(
    context.repository === repository &&
      id(context.repositoryId) &&
      id(context.runId) &&
      id(context.runAttempt) &&
      sha.test(context.sourceCommit ?? "") &&
      run?.id === context.runId &&
      run.run_attempt === context.runAttempt &&
      run.repository?.id === context.repositoryId &&
      run.repository.full_name === repository &&
      run.head_repository?.id === context.repositoryId &&
      run.head_repository.full_name === repository &&
      run.head_sha === context.sourceCommit &&
      run.head_branch === "main" &&
      run.event === "push" &&
      run.name === "Guteneo checks" &&
      run.path === ".github/workflows/ci.yml" &&
      run.status === "completed" &&
      run.conclusion === "success",
    "SUCCESSFUL_MAIN_RUN_REQUIRED",
  );
}

export function requireSuccessfulJobs(jobs, runId) {
  const required = ["qualification", "dependencies", "scanner", "verify"];
  const collapsed = [
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
  const exactReuse = (names) =>
    jobs.length === names.length &&
    new Set(jobs.map((job) => job.name)).size === names.length &&
    jobs.every(
      (job) =>
        names.includes(job.name) &&
        job.conclusion ===
          (required.includes(job.name) ? "success" : "skipped"),
    );
  const exactFull = () =>
    jobs.length === fullValidationJobs.length &&
    new Set(jobs.map((job) => job.name)).size === fullValidationJobs.length &&
    jobs.every(
      (job) =>
        fullValidationJobs.includes(job.name) && job.conclusion === "success",
    );
  demand(
    Array.isArray(jobs) &&
      jobs.length > 0 &&
      new Set(jobs.map((job) => job.id)).size === jobs.length &&
      jobs.every(
        (job) =>
          id(job.id) && job.run_id === runId && job.status === "completed",
      ) &&
      ["verify", "scanner"].every(
        (name) => jobs.filter((job) => job.name === name).length === 1,
      ) &&
      (exactFull() || exactReuse(collapsed) || exactReuse(fullValidationJobs)),
    "ALL_MAIN_JOBS_MUST_SUCCEED",
  );
  // The canonical same-main workflow's required verify gate independently checks
  // the sealed full proof; arbitrary skipped/failed or foreign jobs stay closed.
  return exactFull() ? "full" : "reused";
}

export function isDependabotMerge(pull, context) {
  return Boolean(
    id(pull?.number) &&
    pull.state === "closed" &&
    pull.merged === true &&
    pull.merge_commit_sha === context.sourceCommit &&
    pull.user?.login === "dependabot[bot]" &&
    pull.user.type === "Bot" &&
    pull.head?.ref?.startsWith("dependabot/") &&
    pull.head.repo?.id === context.repositoryId &&
    sha.test(pull.head.sha ?? "") &&
    pull.base?.ref === "main" &&
    sha.test(pull.base.sha ?? "") &&
    pull.base.sha !== context.sourceCommit &&
    pull.base.repo?.id === context.repositoryId,
  );
}

/** Workflow/tooling and service updates need their own reviewed release path. */
export function requireApplicationDependencyFiles(files, changedFiles) {
  demand(
    Number.isSafeInteger(changedFiles) &&
      changedFiles > 0 &&
      files.length === changedFiles &&
      new Set(files.map((file) => file.filename)).size === files.length &&
      files.every((file) => typeof file.filename === "string"),
    "DEPENDENCY_FILES_REQUIRED",
  );
  const applicationChanged = files.some(
    (file) =>
      file.filename === "package.json" || file.filename === "package-lock.json",
  );
  if (!applicationChanged) return false;
  demand(
    files.every(
      (file) =>
        manifestPaths.has(file.filename) &&
        file.status === "modified" &&
        !file.previous_filename,
    ),
    "DEPENDENCY_FILES_REQUIRED",
  );
  return true;
}

const dependencySections = new Set([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);
const versionSpecifier =
  /^[~^]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Bot authorship is insufficient: manual script/configuration edits stay manual. */
export function requireDependencyManifestChange(before, after) {
  demand(record(before) && record(after), "MANIFEST_INVALID");
  const configuration = (manifest) =>
    Object.fromEntries(
      Object.entries(manifest).filter(
        ([name]) => !dependencySections.has(name),
      ),
    );
  demand(
    isDeepStrictEqual(configuration(before), configuration(after)),
    "MANIFEST_CONFIGURATION_CHANGED",
  );
  for (const section of dependencySections) {
    demand(
      Object.hasOwn(before, section) === Object.hasOwn(after, section),
      "MANIFEST_DEPENDENCY_SET_CHANGED",
    );
    if (!Object.hasOwn(before, section)) continue;
    const initial = before[section],
      final = after[section];
    demand(
      record(initial) &&
        record(final) &&
        isDeepStrictEqual(
          Object.keys(initial).sort(),
          Object.keys(final).sort(),
        ),
      "MANIFEST_DEPENDENCY_SET_CHANGED",
    );
    for (const name of Object.keys(initial)) {
      demand(
        typeof initial[name] === "string" && typeof final[name] === "string",
        "MANIFEST_VERSION_INVALID",
      );
      if (initial[name] !== final[name])
        demand(
          versionSpecifier.test(initial[name]) &&
            versionSpecifier.test(final[name]),
          "MANIFEST_VERSION_INVALID",
        );
    }
  }
}

const mcpDependency = (name) =>
  name === "agents" || name.startsWith("@modelcontextprotocol/");
const mcpLockPath =
  /(?:^|\/)node_modules\/(?:agents|@modelcontextprotocol\/[^/]+)$/;
function mcpManifestDependencies(manifest) {
  return Object.fromEntries(
    [...dependencySections].map((section) => [
      section,
      Object.fromEntries(
        Object.entries(manifest[section] ?? {}).filter(([name]) =>
          mcpDependency(name),
        ),
      ),
    ]),
  );
}
function mcpLockedPackages(lockfile) {
  demand(record(lockfile?.packages), "LOCKFILE_PACKAGES_INVALID");
  return {
    root: mcpManifestDependencies(lockfile.packages[""] ?? {}),
    packages: Object.fromEntries(
      Object.entries(lockfile.packages).filter(([path]) =>
        mcpLockPath.test(path),
      ),
    ),
  };
}

/** MCP package updates require the separately reviewed plugin/version/archive path. */
export function requiresMcpPackageSynchronization(
  beforeManifest,
  afterManifest,
  beforeLock,
  afterLock,
) {
  return (
    !isDeepStrictEqual(
      mcpManifestDependencies(beforeManifest),
      mcpManifestDependencies(afterManifest),
    ) ||
    !isDeepStrictEqual(
      mcpLockedPackages(beforeLock),
      mcpLockedPackages(afterLock),
    )
  );
}

async function readManifest(request, path, revision) {
  demand(manifestPaths.has(path), "MANIFEST_PATH_INVALID");
  demand(sha.test(revision ?? ""), "MANIFEST_REVISION_INVALID");
  const result = await request(
    `/repos/${repository}/contents/${path}?ref=${revision}`,
  );
  demand(
    result?.type === "file" &&
      result.path === path &&
      result.encoding === "base64" &&
      typeof result.content === "string" &&
      Number.isSafeInteger(result.size) &&
      result.size > 0 &&
      result.size <= (path.endsWith("package-lock.json") ? 1048576 : 262144),
    "MANIFEST_CONTENT_INVALID",
  );
  const content = result.content.replace(/\n/g, "");
  const bytes = Buffer.from(content, "base64");
  demand(
    bytes.length === result.size && bytes.toString("base64") === content,
    "MANIFEST_CONTENT_INVALID",
  );
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("DEPENDENCY_RELEASE_MANIFEST_INVALID");
  }
}

export async function requestJson(path, token, fetcher = fetch) {
  demand(path.startsWith(`/repos/${repository}/`), "API_PATH_INVALID");
  const response = await fetcher(`https://api.github.com${path}`, {
    method: "GET",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "guteneo-dependency-release",
    },
    signal: AbortSignal.timeout(20_000),
  });
  demand(response.ok, `API_READ_FAILED_${response.status}`);
  return response.json();
}

async function listPages(request, path, field) {
  const entries = [];
  let total;
  for (let page = 1; page <= 100; page++) {
    const result = await request(
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    const values = field ? result?.[field] : result;
    demand(Array.isArray(values) && values.length <= 100, "PAGINATION_INVALID");
    if (field) {
      demand(
        Number.isSafeInteger(result.total_count) && result.total_count >= 0,
        "PAGINATION_INVALID",
      );
      total ??= result.total_count;
      demand(total === result.total_count, "PAGINATION_CHANGED");
    }
    entries.push(...values);
    if (field) {
      demand(entries.length <= total, "PAGINATION_INVALID");
      if (entries.length === total) return entries;
      demand(values.length > 0, "PAGINATION_INCOMPLETE");
    } else if (values.length < 100) return entries;
  }
  throw new Error("DEPENDENCY_RELEASE_PAGINATION_LIMIT");
}

export async function qualifyDependencyRelease(context, request) {
  const base = `/repos/${repository}`;
  const run = await request(`${base}/actions/runs/${context.runId}`);
  requireMainRun(run, context);
  const main = await request(`${base}/git/ref/heads/main`);
  demand(sha.test(main.object?.sha ?? ""), "MAIN_REFERENCE_INVALID");
  // An older successful run must never publish a newer, unchecked main checkout.
  if (main.object.sha !== context.sourceCommit)
    return {
      eligible: false,
      reason: "main-advanced",
      sourceCommit: context.sourceCommit,
    };
  const associations = await listPages(
    request,
    `${base}/commits/${context.sourceCommit}/pulls`,
  );
  const matches = associations.filter(
    (pull) =>
      pull.merge_commit_sha === context.sourceCommit &&
      pull.user?.login === "dependabot[bot]",
  );
  if (!matches.length)
    return {
      eligible: false,
      reason: "not-a-dependabot-merge",
      sourceCommit: context.sourceCommit,
    };
  demand(matches.length === 1 && id(matches[0].number), "MERGE_AMBIGUOUS");
  const pull = await request(`${base}/pulls/${matches[0].number}`);
  demand(isDependabotMerge(pull, context), "DEPENDABOT_MERGE_REQUIRED");
  const files = await listPages(request, `${base}/pulls/${pull.number}/files`);
  const applicationChanged = requireApplicationDependencyFiles(
    files,
    pull.changed_files,
  );
  if (!applicationChanged)
    return {
      eligible: false,
      reason: "application-dependencies-unchanged",
      sourceCommit: context.sourceCommit,
    };
  const beforeManifest = await readManifest(
    request,
    "package.json",
    pull.base.sha,
  );
  const afterManifest = await readManifest(
    request,
    "package.json",
    context.sourceCommit,
  );
  requireDependencyManifestChange(beforeManifest, afterManifest);
  const beforeLock = await readManifest(
    request,
    "package-lock.json",
    pull.base.sha,
  );
  const afterLock = await readManifest(
    request,
    "package-lock.json",
    context.sourceCommit,
  );
  if (
    requiresMcpPackageSynchronization(
      beforeManifest,
      afterManifest,
      beforeLock,
      afterLock,
    )
  )
    return {
      eligible: false,
      reason: "mcp-package-synchronization-required",
      sourceCommit: context.sourceCommit,
    };
  for (const file of files.filter(
    ({ filename }) =>
      filename !== "package.json" && filename.endsWith("package.json"),
  )) {
    const before = await readManifest(request, file.filename, pull.base.sha);
    const after = await readManifest(
      request,
      file.filename,
      context.sourceCommit,
    );
    requireDependencyManifestChange(before, after);
  }
  const jobs = await listPages(
    request,
    `${base}/actions/runs/${run.id}/jobs?filter=latest`,
    "jobs",
  );
  const validationMode = requireSuccessfulJobs(jobs, run.id);
  // Successful jobs may belong to earlier attempts after retrying only failures.
  // Recheck the run so a concurrent retry cannot change the selected inventory.
  requireMainRun(await request(`${base}/actions/runs/${run.id}`), context);
  return {
    eligible: true,
    reason: "tested-application-dependency-merge",
    sourceCommit: context.sourceCommit,
    pullRequest: pull.number,
    runId: run.id,
    runAttempt: run.run_attempt,
    validationMode,
    jobs: jobs.map(({ id: jobId, name, conclusion }) => ({
      id: jobId,
      name,
      conclusion,
    })),
  };
}

async function main(env) {
  demand(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_EVENT_NAME === "workflow_run" &&
      env.GITHUB_REPOSITORY === repository &&
      env.GITHUB_REF === "refs/heads/main" &&
      env.GH_TOKEN &&
      env.GITHUB_OUTPUT &&
      env.DEPENDENCY_RELEASE_EVIDENCE,
    "TRUSTED_WORKFLOW_REQUIRED",
  );
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  demand(event.action === "completed", "COMPLETED_EVENT_REQUIRED");
  const context = {
    repository: env.GITHUB_REPOSITORY,
    repositoryId: Number(env.GITHUB_REPOSITORY_ID),
    runId: event.workflow_run?.id,
    runAttempt: event.workflow_run?.run_attempt,
    sourceCommit: event.workflow_run?.head_sha,
  };
  const report = await qualifyDependencyRelease(context, (path) =>
    requestJson(path, env.GH_TOKEN),
  );
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  demand(
    !report.eligible || head === context.sourceCommit,
    "CHECKOUT_COMMIT_MISMATCH",
  );
  await writeFile(
    env.DEPENDENCY_RELEASE_EVIDENCE,
    JSON.stringify(report, null, 2) + "\n",
  );
  await appendFile(env.GITHUB_OUTPUT, `eligible=${report.eligible}\n`);
  console.log(`Dependency release: ${report.reason}.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(process.env);
  } catch (error) {
    console.error(
      /^DEPENDENCY_RELEASE_[A-Z_0-9]+$/.test(error.message)
        ? error.message
        : "DEPENDENCY_RELEASE_FAILED",
    );
    process.exitCode = 1;
  }
}
