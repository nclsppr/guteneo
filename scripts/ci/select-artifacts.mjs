import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sha = /^[a-f0-9]{40}$/;
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
function requireCondition(condition, code) {
  if (!condition) throw new Error(`CI_ARTIFACT_${code}`);
}

/** The API uses a PR's head SHA; GITHUB_SHA can instead be its merge SHA. */
export function requireWorkflowRun(run, context) {
  requireCondition(
    positiveId(run?.id) &&
      String(run.id) === context.runId &&
      run.run_attempt === Number(context.runAttempt) &&
      run.repository?.full_name === context.repository &&
      positiveId(run.repository?.id) &&
      positiveId(run.head_repository?.id) &&
      sha.test(context.revision ?? "") &&
      sha.test(context.headSha ?? "") &&
      run.head_sha === context.headSha &&
      run.event === context.event,
    "RUN_PROVENANCE_INVALID",
  );
  return run;
}

/** Reject a changing or incomplete paginated inventory rather than guessing. */
export async function listRunArtifacts(fetchPage, maxPages = 100) {
  const artifacts = [];
  const ids = new Set();
  let total;
  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchPage(page);
    requireCondition(
      Number.isSafeInteger(result?.total_count) &&
        result.total_count >= 0 &&
        Array.isArray(result.artifacts) &&
        result.artifacts.length <= 100,
      "LIST_INVALID",
    );
    total ??= result.total_count;
    requireCondition(total === result.total_count, "LIST_CHANGED");
    for (const artifact of result.artifacts) {
      requireCondition(
        positiveId(artifact?.id) && !ids.has(artifact.id),
        "LIST_DUPLICATE_ID",
      );
      ids.add(artifact.id);
      artifacts.push(artifact);
    }
    requireCondition(artifacts.length <= total, "LIST_INVALID");
    if (artifacts.length === total) return artifacts;
    requireCondition(result.artifacts.length > 0, "LIST_INCOMPLETE");
  }
  throw new Error("CI_ARTIFACT_PAGINATION_LIMIT");
}

function matchesFamily(name, family) {
  if (family === "build") return name.startsWith("guteneo-browser-builds-");
  if (family === "vitest") return name.startsWith("ci-vitest-");
  if (family === "evidence") return name.startsWith("ci-evidence-");
  throw new Error("CI_ARTIFACT_FAMILY_INVALID");
}

/** Select by creation time, never ID ordering or whether a result passed. */
export function selectArtifacts(artifacts, family, run, revision) {
  const groups = new Map();
  for (const artifact of artifacts) {
    requireCondition(typeof artifact?.name === "string", "NAME_INVALID");
    if (!matchesFamily(artifact.name, family)) continue;
    requireCondition(
      /^[a-zA-Z0-9_-]+$/.test(artifact.name) &&
        positiveId(artifact.id) &&
        artifact.workflow_run?.id === run.id &&
        artifact.workflow_run?.head_sha === run.head_sha &&
        artifact.workflow_run?.repository_id === run.repository.id &&
        artifact.workflow_run?.head_repository_id === run.head_repository.id,
      "PROVENANCE_INVALID",
    );
    requireCondition(
      typeof artifact.created_at === "string" &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(
          artifact.created_at,
        ) &&
        Number.isFinite(Date.parse(artifact.created_at)) &&
        typeof artifact.expired === "boolean",
      "METADATA_INVALID",
    );
    if (family === "build")
      requireCondition(
        artifact.name === `guteneo-browser-builds-${revision}`,
        "BUILD_REVISION_INVALID",
      );
    const group = groups.get(artifact.name) ?? [];
    group.push(artifact);
    groups.set(artifact.name, group);
  }
  requireCondition(groups.size > 0, "FAMILY_MISSING");
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => {
      group.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      requireCondition(
        group.length === 1 ||
          Date.parse(group[0].created_at) !== Date.parse(group[1].created_at),
        "CREATION_TIME_AMBIGUOUS",
      );
      requireCondition(!group[0].expired, "LATEST_EXPIRED");
      return group[0];
    });
}

export async function selectCurrentRunArtifacts(context, mode, requestJson) {
  requireCondition(mode === "build" || mode === "verify", "MODE_INVALID");
  const prefix = `/repos/${context.repository}/actions/runs/${context.runId}`;
  const run = requireWorkflowRun(await requestJson(prefix), context);
  const artifacts = await listRunArtifacts((page) =>
    requestJson(`${prefix}/artifacts?per_page=100&page=${page}`),
  );
  const families = mode === "build" ? ["build"] : ["vitest", "evidence"];
  return {
    schema: 1,
    mode,
    revision: context.revision,
    artifactHeadSha: run.head_sha,
    runId: context.runId,
    runAttempt: context.runAttempt,
    selected: Object.fromEntries(
      families.map((family) => [
        family,
        selectArtifacts(artifacts, family, run, context.revision),
      ]),
    ),
    // Preserve the inventory of older attempts; never delete or overwrite them.
    observed: artifacts.filter((artifact) =>
      families.some((family) => matchesFamily(artifact.name, family)),
    ),
  };
}

async function main(mode) {
  requireCondition(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
      process.env.GITHUB_REPOSITORY ?? "",
    ) &&
      /^[1-9]\d*$/.test(process.env.GITHUB_RUN_ID ?? "") &&
      /^[1-9]\d*$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") &&
      Boolean(process.env.GITHUB_TOKEN) &&
      Boolean(process.env.GITHUB_OUTPUT),
    "CONTEXT_INVALID",
  );
  const event = process.env.GITHUB_EVENT_NAME;
  requireCondition(
    event === "push" || event === "pull_request",
    "EVENT_INVALID",
  );
  const headSha =
    event === "pull_request"
      ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"))
          .pull_request?.head?.sha
      : process.env.GITHUB_SHA;
  const context = {
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    revision: process.env.GITHUB_SHA,
    event,
    headSha,
  };
  const proof = await selectCurrentRunArtifacts(context, mode, async (path) => {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    requireCondition(response.ok, "API_READ_FAILED");
    return response.json();
  });
  const output = resolve(`test-results/ci/artifact-selection-${mode}.json`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(proof, null, 2) + "\n");
  for (const [family, artifacts] of Object.entries(proof.selected))
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `${family}ArtifactIds=${artifacts.map(({ id }) => id).join(",")}\n`,
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main(process.argv[2]);
  } catch (error) {
    console.error(
      /^CI_ARTIFACT_[A-Z_]+$/.test(error.message)
        ? error.message
        : "CI_ARTIFACT_SELECTION_FAILED",
    );
    process.exitCode = 1;
  }
}
