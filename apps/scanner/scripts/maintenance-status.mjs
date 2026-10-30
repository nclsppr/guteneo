import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { downloadQualification } from "./qualification-artifact.mjs";
import {
  ACCOUNT_ID,
  CONTAINER_ID,
  SCANNER_NAME,
  assertContainer,
  assertDeployment,
  assertFreshEngine,
  requestJson,
  startBridge,
} from "./ci-refresh.mjs";

const REPOSITORY = "nclsppr/guteneo";
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}$/;
const MAX_REFRESH_AGE_MS = 30 * 3_600_000;
const EXPIRY_WARNING_MS = 14 * 24 * 3_600_000;
const WARMUP_MS = 5 * 60_000;
const HEALTH_URL = "http://127.0.0.1:8799/scanner/health";
const WARMUP_CODES = new Set([
  "SCANNER_NOT_READY",
  "SCANNER_UNAVAILABLE",
  "SCANNER_BUSY",
  "SCAN_TIMEOUT",
]);
const ERROR_CODES = new Set([
  "SCANNER_MAIN_WORKFLOW_REQUIRED",
  "SCANNER_SCHEDULE_NOT_ACTIVATED",
  "MISSING_CLOUDFLARE_SCANNER_API_TOKEN",
  "MISSING_GITHUB_READ_TOKEN",
  "SCANNER_TOKEN_EXPIRY_REQUIRED",
  "SCANNER_TOKEN_EXPIRED",
  "SCANNER_TOKEN_EXPIRING",
  "SCANNER_REFRESH_WORKFLOW_DISABLED",
  "SCANNER_REFRESH_RUNS_INVALID",
  "SCANNER_LATEST_REFRESH_FAILED_OR_SKIPPED",
  "SCANNER_QUALIFIED_REFRESH_MISSING_OR_OVERDUE",
  "SCANNER_QUALIFICATION_ARTIFACT_MISSING",
  "SCANNER_QUALIFICATION_ARTIFACT_INVALID",
  "SCANNER_QUALIFIED_RUNTIME_CHANGED",
  "SCANNER_CURRENT_IMAGE_INVALID",
  "SCANNER_PUBLIC_ENDPOINT_ENABLED",
  "SCANNER_PRIVATE_HEALTH_INVALID",
  "SCANNER_SIGNATURES_STALE",
  "SCANNER_HEALTH_WARMUP_TIMEOUT",
  "SCANNER_RUNTIME_IDENTITY_MISMATCH",
  "SCANNER_EXACT_VERSION_100_PERCENT_REQUIRED",
  "SCANNER_CONTAINER_IMAGE_OR_SCOPE_MISMATCH",
  "REAL_SIGNATURES_MISSING_OR_STALE",
  "SCANNER_PRIVATE_BRIDGE_STOPPED",
]);
const demand = (condition, code) => {
  if (!condition) throw new Error(code);
};
const pause = (milliseconds) =>
  new Promise((done) => setTimeout(done, milliseconds));

export function safeFailureCode(error) {
  return ERROR_CODES.has(error?.message) ||
    /^READ_API_FAILED_[0-9]{3}$/.test(error?.message ?? "")
    ? error.message
    : "SCANNER_MAINTENANCE_CHECK_FAILED";
}

export function checkSettings(env, at = Date.now(), watchdog = false) {
  demand(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_REPOSITORY === REPOSITORY &&
      env.GITHUB_REF === "refs/heads/main",
    "SCANNER_MAIN_WORKFLOW_REQUIRED",
  );
  demand(env.CLOUDFLARE_API_TOKEN, "MISSING_CLOUDFLARE_SCANNER_API_TOKEN");
  demand(env.GH_TOKEN, "MISSING_GITHUB_READ_TOKEN");
  if (watchdog || env.GITHUB_EVENT_NAME === "schedule")
    demand(
      env.SCANNER_REFRESH_ENABLED === "true",
      "SCANNER_SCHEDULE_NOT_ACTIVATED",
    );
  const expires = Date.parse(env.SCANNER_TOKEN_EXPIRES_AT ?? "");
  demand(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(
      env.SCANNER_TOKEN_EXPIRES_AT ?? "",
    ) &&
      Number.isFinite(expires) &&
      new Date(expires).toISOString().replace(".000Z", "Z") ===
        env.SCANNER_TOKEN_EXPIRES_AT,
    "SCANNER_TOKEN_EXPIRY_REQUIRED",
  );
  demand(expires > at, "SCANNER_TOKEN_EXPIRED");
  if (watchdog)
    demand(expires - at > EXPIRY_WARNING_MS, "SCANNER_TOKEN_EXPIRING");
  return { tokenExpiresAt: new Date(expires).toISOString() };
}

export function latestQualifiedRun(workflow, response, at = Date.now()) {
  demand(workflow?.state === "active", "SCANNER_REFRESH_WORKFLOW_DISABLED");
  demand(
    Array.isArray(response?.workflow_runs),
    "SCANNER_REFRESH_RUNS_INVALID",
  );
  const runs = response.workflow_runs
    .filter(
      (run) =>
        run.head_branch === "main" &&
        ["schedule", "workflow_dispatch"].includes(run.event),
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const completed = runs.find((run) => run.status === "completed");
  demand(
    !completed || completed.conclusion === "success",
    "SCANNER_LATEST_REFRESH_FAILED_OR_SKIPPED",
  );
  const run = completed;
  const age = at - Date.parse(run?.updated_at);
  demand(
    run &&
      Number.isSafeInteger(run.id) &&
      run.id > 0 &&
      Number.isSafeInteger(run.run_attempt) &&
      run.run_attempt > 0 &&
      SHA.test(run.head_sha ?? "") &&
      Number.isFinite(age) &&
      age >= -300_000 &&
      age <= MAX_REFRESH_AGE_MS,
    "SCANNER_QUALIFIED_REFRESH_MISSING_OR_OVERDUE",
  );
  return run;
}

async function readHealth(response) {
  demand(
    response.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    "SCANNER_PRIVATE_HEALTH_INVALID",
  );
  const reader = response.body?.getReader();
  demand(reader, "SCANNER_PRIVATE_HEALTH_INVALID");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      demand(size <= 4096, "SCANNER_PRIVATE_HEALTH_INVALID");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("SCANNER_PRIVATE_HEALTH_INVALID");
  }
}

export async function currentHealth(
  control,
  expected,
  { fetcher = fetch, sleep = pause, clock = Date.now } = {},
) {
  const deadline = clock() + WARMUP_MS;
  while (clock() < deadline) {
    control.assertRunning();
    let response;
    try {
      response = await fetcher(HEALTH_URL, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(30_000, deadline - clock())),
        ),
      });
    } catch (error) {
      if (
        !(error instanceof TypeError) &&
        !["AbortError", "TimeoutError"].includes(error?.name)
      )
        throw error;
      await sleep(Math.min(5000, Math.max(0, deadline - clock())));
      continue;
    }
    const body = await readHealth(response);
    control.assertRunning();
    if (response.status === 200) {
      demand(body?.status === "ready", "SCANNER_PRIVATE_HEALTH_INVALID");
      assertFreshEngine(body.engine, clock());
      demand(
        response.headers.get("x-guteneo-worker-version") ===
          expected.workerVersion &&
          response.headers.get("x-guteneo-scanner-build-id") ===
            expected.buildId,
        "SCANNER_RUNTIME_IDENTITY_MISMATCH",
      );
      return {
        engine: Object.fromEntries(
          ["name", "version", "signatureVersion", "signatureDate"].map(
            (key) => [key, body.engine[key]],
          ),
        ),
        checkedAt: new Date(clock()).toISOString(),
      };
    }
    if (response.status === 503 && body?.code === "SIGNATURES_STALE")
      throw new Error("SCANNER_SIGNATURES_STALE");
    demand(
      response.status === 503 && WARMUP_CODES.has(body?.code),
      "SCANNER_PRIVATE_HEALTH_INVALID",
    );
    await sleep(Math.min(5000, Math.max(0, deadline - clock())));
  }
  throw new Error("SCANNER_HEALTH_WARMUP_TIMEOUT");
}

export async function checkMaintenance({
  env = process.env,
  request = requestJson,
  bridge = startBridge,
  health = currentHealth,
  download = downloadQualification,
  now = Date.now,
} = {}) {
  const settings = checkSettings(env, now(), true);
  const github = `https://api.github.com/repos/${REPOSITORY}`;
  const workflow = await request(
    `${github}/actions/workflows/scanner-refresh.yml`,
    env.GH_TOKEN,
  );
  const runs = await request(
    `${github}/actions/workflows/scanner-refresh.yml/runs?branch=main&per_page=100`,
    env.GH_TOKEN,
  );
  const run = latestQualifiedRun(workflow, runs, now());
  const artifacts = await request(
    `${github}/actions/runs/${run.id}/artifacts?per_page=100`,
    env.GH_TOKEN,
  );
  const matching = artifacts?.artifacts?.filter(
    (artifact) =>
      artifact.name === `scanner-refresh-${run.id}-${run.run_attempt}` &&
      artifact.expired === false &&
      artifact.size_in_bytes > 0,
  );
  demand(matching?.length === 1, "SCANNER_QUALIFICATION_ARTIFACT_MISSING");
  const artifact = matching[0];
  demand(
    artifact.workflow_run?.id === run.id &&
      artifact.workflow_run?.head_sha === run.head_sha,
    "SCANNER_QUALIFICATION_ARTIFACT_INVALID",
  );
  const qualified = await download(artifact, env.GH_TOKEN);
  const buildId = `sha-${run.head_sha}-run-${run.id}-attempt-${run.run_attempt}`;
  demand(
    qualified?.status === "qualified" &&
      qualified.sourceCommit === run.head_sha &&
      qualified.buildId === buildId &&
      UUID.test(qualified.version ?? "") &&
      typeof qualified.deploymentId === "string" &&
      qualified.deploymentId.length > 0 &&
      qualified.trafficPercent === 100 &&
      qualified.private === true &&
      qualified.customerDocuments === 0 &&
      qualified.externalSends === 0,
    "SCANNER_QUALIFICATION_ARTIFACT_INVALID",
  );
  assertFreshEngine(qualified.engine, now());
  const api = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;
  const cloud = (path) => request(`${api}${path}`, env.CLOUDFLARE_API_TOKEN);
  const deployments = await cloud(
    `/workers/scripts/${SCANNER_NAME}/deployments`,
  );
  const workerVersion = qualified.version;
  demand(
    assertDeployment(deployments, workerVersion) === qualified.deploymentId,
    "SCANNER_QUALIFIED_RUNTIME_CHANGED",
  );
  const container = await cloud(`/containers/applications/${CONTAINER_ID}`);
  const image = qualified.image;
  demand(
    new RegExp(
      `^registry\\.cloudflare\\.com/${ACCOUNT_ID}/guteneo-scanner-ci@sha256:[a-f0-9]{64}$`,
    ).test(image ?? ""),
    "SCANNER_CURRENT_IMAGE_INVALID",
  );
  assertContainer(container, image);
  const endpoint = await cloud(`/workers/scripts/${SCANNER_NAME}/subdomain`);
  demand(
    endpoint?.enabled === false && endpoint?.previews_enabled === false,
    "SCANNER_PUBLIC_ENDPOINT_ENABLED",
  );
  const control = await bridge(env);
  let observed;
  try {
    observed = await health(control, { workerVersion, buildId });
    demand(
      ["name", "version", "signatureVersion", "signatureDate"].every(
        (key) => observed.engine?.[key] === qualified.engine[key],
      ),
      "SCANNER_QUALIFIED_RUNTIME_CHANGED",
    );
    demand(
      assertDeployment(
        await cloud(`/workers/scripts/${SCANNER_NAME}/deployments`),
        workerVersion,
      ) === qualified.deploymentId,
      "SCANNER_QUALIFIED_RUNTIME_CHANGED",
    );
    assertContainer(
      await cloud(`/containers/applications/${CONTAINER_ID}`),
      image,
    );
    const finalEndpoint = await cloud(
      `/workers/scripts/${SCANNER_NAME}/subdomain`,
    );
    demand(
      finalEndpoint?.enabled === false &&
        finalEndpoint?.previews_enabled === false,
      "SCANNER_PUBLIC_ENDPOINT_ENABLED",
    );
  } finally {
    await control.stop();
  }
  return {
    schemaVersion: 1,
    status: "healthy",
    checkedAt: new Date(now()).toISOString(),
    ...settings,
    latestQualifiedRun: run.id,
    latestQualifiedAttempt: run.run_attempt,
    sourceCommit: run.head_sha,
    workerVersion,
    buildId,
    image,
    ...observed,
    maximumRefreshAgeHours: 30,
    maximumSignatureAgeHours: 48,
    productionScans: 0,
    customerDocuments: 0,
    externalSends: 0,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let result;
  try {
    if (
      process.argv.length !== 3 ||
      !["--check-settings", "--watchdog"].includes(process.argv[2])
    )
      throw new Error("SCANNER_MAINTENANCE_CHECK_FAILED");
    result =
      process.argv[2] === "--check-settings"
        ? { status: "configured", ...checkSettings(process.env) }
        : await checkMaintenance();
  } catch (error) {
    result = {
      schemaVersion: 1,
      status: "failed",
      checkedAt: new Date().toISOString(),
      code: safeFailureCode(error),
    };
    console.error(
      `::error title=Private scanner maintenance::${result.code}. Inspect the scanner workflow and its run summary.`,
    );
    process.exitCode = 1;
  }
  const directory = fileURLToPath(
    new URL("../dist/maintenance/", import.meta.url),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}result.json`,
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
}
