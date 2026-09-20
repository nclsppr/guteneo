import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "jsonc-parser";

export const ACCOUNT_ID = "39ac9fada6cba44d9ecf09d467609e69";
export const SCANNER_NAME = "guteneo-scanner";
export const CONTAINER_ID = "a03030c0-8135-4234-8e86-ec7016ec5e16";
const REPOSITORY = "nclsppr/guteneo";
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const scannerDirectory = fileURLToPath(new URL("../", import.meta.url));
const rootDirectory = resolve(scannerDirectory, "../..");
const artifactDirectory = join(scannerDirectory, "dist/ci-refresh");
const wrangler = join(
  scannerDirectory,
  "node_modules/wrangler/bin/wrangler.js",
);
function demand(condition, code) {
  if (!condition) throw new Error(code);
}
function parseOutput(raw, code) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(code);
  }
}

export function assertCiEnvironment(env) {
  demand(env.CLOUDFLARE_API_TOKEN, "MISSING_CLOUDFLARE_SCANNER_API_TOKEN");
  demand(env.GH_TOKEN, "MISSING_GITHUB_READ_TOKEN");
  demand(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_REF === "refs/heads/main" &&
      env.GITHUB_REPOSITORY === REPOSITORY &&
      ["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME),
    "REVIEWED_MAIN_CI_REQUIRED",
  );
  demand(
    env.GITHUB_EVENT_NAME !== "schedule" ||
      env.SCANNER_REFRESH_ENABLED === "true",
    "SCANNER_SCHEDULE_NOT_ACTIVATED",
  );
  demand(
    SHA.test(env.GITHUB_SHA ?? "") &&
      /^\d+$/.test(env.GITHUB_RUN_ID ?? "") &&
      /^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? ""),
    "CI_IDENTITY_INVALID",
  );
  demand(env.CLOUDFLARE_ACCOUNT_ID === ACCOUNT_ID, "SCANNER_ACCOUNT_MISMATCH");
}

/** JSON APIs are read-only; no token, response text or arbitrary URL is logged. */
export async function requestJson(url, token, fetcher = fetch) {
  const response = await fetcher(url, {
    method: "GET",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "guteneo-scanner-refresh",
      ...(url.startsWith("https://api.github.com/")
        ? { "X-GitHub-Api-Version": "2022-11-28" }
        : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  demand(response.ok, `READ_API_FAILED_${response.status}`);
  const reader = response.body?.getReader();
  demand(reader, "READ_API_BODY_MISSING");
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      demand(size <= 2_000_000, "READ_API_BODY_TOO_LARGE");
      parts.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new Error("READ_API_JSON_INVALID");
  }
  if (url.startsWith("https://api.cloudflare.com/")) {
    demand(
      body.success === true && body.result !== undefined,
      "CLOUDFLARE_READ_FAILED",
    );
    return body.result;
  }
  return body;
}

export async function qualifiedMain(env, request = requestJson) {
  const base = `https://api.github.com/repos/${REPOSITORY}`;
  const head = await request(`${base}/git/ref/heads/main`, env.GH_TOKEN);
  demand(
    head.object?.sha === env.GITHUB_SHA,
    "MAIN_CHANGED_OR_SOURCE_UNREVIEWED",
  );
  const runs = await request(
    `${base}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${env.GITHUB_SHA}&per_page=100`,
    env.GH_TOKEN,
  );
  const run = runs.workflow_runs
    ?.filter(
      (candidate) =>
        candidate.head_sha === env.GITHUB_SHA &&
        candidate.head_branch === "main" &&
        candidate.event === "push",
    )
    .sort((a, b) => b.id - a.id)[0];
  demand(
    run?.status === "completed" &&
      run.conclusion === "success" &&
      Number.isSafeInteger(run.id) &&
      Number.isSafeInteger(run.run_attempt),
    "EXACT_MAIN_CI_SUCCESS_REQUIRED",
  );
  const jobs = await request(
    `${base}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
    env.GH_TOKEN,
  );
  for (const name of ["verify", "scanner"])
    demand(
      jobs.jobs?.some(
        (job) =>
          job.name === name &&
          job.status === "completed" &&
          job.conclusion === "success",
      ),
      `EXACT_MAIN_${name.toUpperCase()}_SUCCESS_REQUIRED`,
    );
  return {
    runId: run.id,
    attempt: run.run_attempt,
    sourceCommit: env.GITHUB_SHA,
  };
}

export function deriveConfiguration(
  source,
  image,
  refresh,
  directory = scannerDirectory,
  configDirectory = join(directory, "dist/ci-refresh"),
) {
  demand(
    source.name === SCANNER_NAME &&
      source.account_id === ACCOUNT_ID &&
      source.main === "src/index.ts",
    "SCANNER_CONFIGURATION_IDENTITY_INVALID",
  );
  demand(
    source.workers_dev === false &&
      source.preview_urls === false &&
      Array.isArray(source.routes) &&
      source.routes.length === 0,
    "SCANNER_MUST_REMAIN_PRIVATE",
  );
  demand(
    source.containers?.length === 1 &&
      source.containers[0].class_name === "ClamAvContainer" &&
      source.containers[0].max_instances === 1 &&
      source.containers[0].constraints?.jurisdiction === "eu",
    "SCANNER_CONTAINER_SCOPE_INVALID",
  );
  demand(
    new RegExp(
      `^registry\\.cloudflare\\.com/${ACCOUNT_ID}/guteneo-scanner-ci@sha256:[a-f0-9]{64}$`,
    ).test(image),
    "SCANNER_IMMUTABLE_IMAGE_REQUIRED",
  );
  const config = structuredClone(source);
  config.$schema = join(directory, "node_modules/wrangler/config-schema.json");
  config.main = join(directory, "src/index.ts");
  config.containers[0].image = image;
  // A build input, not a claim about the daemon's signature date.
  config.containers[0].image_vars = { SIGNATURE_REFRESH: refresh };
  // Wrangler joins tsconfig to configDir even when given an absolute path.
  config.tsconfig = relative(configDirectory, join(directory, "tsconfig.json"));
  return config;
}

export function imageIdentity(raw) {
  const [image] = parseOutput(raw, "SCANNER_IMAGE_JSON_INVALID");
  demand(
    image?.Os === "linux" &&
      image.Architecture === "amd64" &&
      DIGEST.test(image.Id ?? ""),
    "SCANNER_IMAGE_IDENTITY_INVALID",
  );
  return image;
}

export function pushedImage(raw, expectedId) {
  const image = imageIdentity(raw);
  demand(image.Id === expectedId, "QUALIFIED_IMAGE_CHANGED");
  const prefix = `registry.cloudflare.com/${ACCOUNT_ID}/guteneo-scanner-ci@`;
  const matches =
    image.RepoDigests?.filter(
      (digest) =>
        digest.startsWith(prefix) && DIGEST.test(digest.slice(prefix.length)),
    ) ?? [];
  demand(matches.length === 1, "PUSHED_IMAGE_DIGEST_MISSING_OR_AMBIGUOUS");
  return matches[0];
}

export function assertFreshEngine(engine, at = Date.now()) {
  const age = at - Date.parse(engine?.signatureDate);
  demand(
    engine?.name === "ClamAV" &&
      typeof engine.version === "string" &&
      Number.isSafeInteger(engine.signatureVersion) &&
      engine.signatureVersion > 0 &&
      Number.isFinite(age) &&
      age >= -300_000 &&
      age <= 48 * 3_600_000,
    "REAL_SIGNATURES_MISSING_OR_STALE",
  );
}

export function assertRemoteProof(
  local,
  remote,
  version,
  buildId,
  at = Date.now(),
) {
  assertFreshEngine(local.engine, at);
  assertFreshEngine(remote.engine, at);
  demand(
    local.buildId === buildId && remote.buildId === buildId,
    "REMOTE_SCANNER_BUILD_MISMATCH",
  );
  demand(remote.workerVersionId === version, "REMOTE_SCANNER_VERSION_MISMATCH");
  for (const key of ["name", "version", "signatureVersion", "signatureDate"])
    demand(
      remote.engine[key] === local.engine[key],
      "REMOTE_ENGINE_DIFFERS_FROM_QUALIFIED_IMAGE",
    );
  demand(
    remote.status === "passed" &&
      remote.emptyAndWrongTypeRejected === true &&
      remote.customerDocuments === 0 &&
      remote.externalSends === 0 &&
      remote.cleanPdf?.verdict === "clean" &&
      remote.cleanPdf.sha256 === local.cleanPdf?.sha256 &&
      remote.eicar?.verdict === "infected" &&
      remote.eicar.sha256 === local.eicarSha256,
    "REMOTE_SCANNER_VERDICTS_MISMATCH",
  );
}

export function assertDeployment(deployments, version) {
  const latest = [...(deployments.deployments ?? [])].sort(
    (a, b) => Date.parse(b.created_on) - Date.parse(a.created_on),
  )[0];
  demand(
    UUID.test(version ?? "") &&
      latest?.versions?.length === 1 &&
      latest.versions[0].version_id === version &&
      latest.versions[0].percentage === 100,
    "SCANNER_EXACT_VERSION_100_PERCENT_REQUIRED",
  );
  return latest.id;
}

export function assertContainer(application, image) {
  demand(
    application?.id === CONTAINER_ID &&
      application.configuration?.image === image &&
      application.max_instances === 1 &&
      application.constraints?.jurisdiction === "eu",
    "SCANNER_CONTAINER_IMAGE_OR_SCOPE_MISMATCH",
  );
}

function childEnvironment(env, cloud = false) {
  const result = { ...env, CI: "true", WRANGLER_SEND_METRICS: "false" };
  delete result.GH_TOKEN;
  delete result.GITHUB_TOKEN;
  delete result.CLOUDFLARE_SCANNER_API_TOKEN;
  if (!cloud) delete result.CLOUDFLARE_API_TOKEN;
  return result;
}

/** Commands never interpolate shell syntax or reveal credential-bearing output. */
export function execute(command, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? scannerDirectory,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    let size = 0;
    let stopped = false;
    const timer = setTimeout(
      () => {
        stopped = true;
        child.kill("SIGKILL");
        reject(new Error("SCANNER_REFRESH_COMMAND_TIMEOUT"));
      },
      options.timeoutMs ?? 20 * 60_000,
    );
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        size += chunk.length;
        if (size > 10_000_000) {
          stopped = true;
          child.kill("SIGKILL");
          clearTimeout(timer);
          reject(new Error("SCANNER_REFRESH_COMMAND_OUTPUT_LIMIT"));
        } else if (stream === child.stdout) chunks.push(chunk);
      });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("SCANNER_REFRESH_COMMAND_START_FAILED"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (stopped) return;
      if (code !== 0)
        reject(
          new Error(
            `SCANNER_REFRESH_COMMAND_FAILED_${command.split("/").at(-1)}_${args[0]}_${code}`,
          ),
        );
      else accept(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

async function startBridge(env) {
  const child = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--config",
      "tests/wrangler.scanner-remote.jsonc",
      "--ip",
      "127.0.0.1",
      "--port",
      "8799",
    ],
    {
      cwd: scannerDirectory,
      env: childEnvironment(env, true),
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  let failure;
  child.once("error", () => {
    failure = true;
  });
  return {
    assertRunning() {
      demand(
        !failure && child.exitCode === null && !child.killed,
        "SCANNER_PRIVATE_BRIDGE_STOPPED",
      );
    },
    async stop() {
      if (child.exitCode !== null) return;
      await new Promise((resolveStop) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
        child.once("close", () => {
          clearTimeout(timer);
          resolveStop();
        });
        child.kill("SIGTERM");
      });
    },
  };
}

/** Establish remote-binding authority before the first registry/deployment write.
 * An old unavailable/stale scanner is allowed here: refreshing it is the task.
 * HTML, redirects, auth failures and arbitrary 503s never count as access proof.
 */
export async function preflightPrivateAccess(
  control,
  {
    fetcher = fetch,
    pause = (ms) => new Promise((done) => setTimeout(done, ms)),
    clock = Date.now,
    timeoutMs = 90_000,
  } = {},
) {
  const deadline = clock() + timeoutMs;
  while (clock() < deadline) {
    control.assertRunning();
    let response;
    try {
      response = await fetcher("http://127.0.0.1:8799/scanner/health", {
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
        throw new Error("SCANNER_PRIVATE_BRIDGE_REQUEST_FAILED");
      await pause(Math.min(1000, Math.max(0, deadline - clock())));
      continue;
    }
    demand(
      response.headers.get("content-type")?.split(";")[0].trim() ===
        "application/json",
      "SCANNER_PRIVATE_BRIDGE_ACCESS_DENIED",
    );
    const reader = response.body?.getReader();
    demand(reader, "SCANNER_PRIVATE_BRIDGE_ACCESS_DENIED");
    let size = 0;
    const chunks = [];
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        demand(size <= 4096, "SCANNER_PRIVATE_BRIDGE_RESPONSE_INVALID");
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("SCANNER_PRIVATE_BRIDGE_RESPONSE_INVALID");
    }
    control.assertRunning();
    if (
      response.status === 200 &&
      payload?.status === "ready" &&
      payload.engine?.name === "ClamAV"
    )
      return { authenticatedPrivateBinding: true, healthStatus: 200 };
    if (
      response.status === 503 &&
      [
        "SCANNER_NOT_READY",
        "SCANNER_UNAVAILABLE",
        "SCANNER_BUSY",
        "SIGNATURES_STALE",
        "SCAN_TIMEOUT",
        "SCAN_INCOMPLETE",
      ].includes(payload?.code)
    )
      return {
        authenticatedPrivateBinding: true,
        healthStatus: 503,
        code: payload.code,
      };
    throw new Error("SCANNER_PRIVATE_BRIDGE_ACCESS_DENIED");
  }
  throw new Error("SCANNER_PRIVATE_BRIDGE_ACCESS_TIMEOUT");
}

async function writeArtifact(name, value) {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    join(artifactDirectory, name),
    `${JSON.stringify(value, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export async function refreshScanner({
  env = process.env,
  run = execute,
  request = requestJson,
  write = writeArtifact,
  bridge = startBridge,
  probe = preflightPrivateAccess,
  now = () => new Date(),
  readConfiguration = async () => {
    const errors = [];
    const config = parse(
      await readFile(join(scannerDirectory, "wrangler.jsonc"), "utf8"),
      errors,
      { allowTrailingComma: true },
    );
    demand(errors.length === 0, "SCANNER_JSONC_INVALID");
    return config;
  },
  progress = () => {},
} = {}) {
  assertCiEnvironment(env);
  const safeEnv = childEnvironment(env);
  const cloudEnv = childEnvironment(env, true);
  const sourceCheck = async () => {
    demand(
      (
        await run("git", ["rev-parse", "HEAD"], {
          cwd: rootDirectory,
          env: safeEnv,
        })
      ).trim() === env.GITHUB_SHA,
      "CHECKOUT_SOURCE_MISMATCH",
    );
    demand(
      (
        await run("git", ["status", "--porcelain", "--untracked-files=all"], {
          cwd: rootDirectory,
          env: safeEnv,
        })
      ).trim() === "",
      "CLEAN_REVIEWED_CHECKOUT_REQUIRED",
    );
    return qualifiedMain(env, request);
  };
  const ci = await sourceCheck();
  const refresh = now().toISOString();
  const buildId = `sha-${env.GITHUB_SHA}-run-${env.GITHUB_RUN_ID}-attempt-${env.GITHUB_RUN_ATTEMPT}`;
  const tag = `guteneo-scanner-ci:${env.GITHUB_SHA.slice(0, 12)}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const api = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;
  const cf = (path) => request(`${api}${path}`, env.CLOUDFLARE_API_TOKEN);
  const baseline = await cf(`/containers/applications/${CONTAINER_ID}`);
  demand(baseline.id === CONTAINER_ID, "EXISTING_SCANNER_CONTAINER_REQUIRED");
  const source = await readConfiguration();
  // Validate every invariant before any Docker build or remote mutation.
  deriveConfiguration(
    source,
    `registry.cloudflare.com/${ACCOUNT_ID}/guteneo-scanner-ci@sha256:${"0".repeat(64)}`,
    refresh,
  );
  const accessBridge = await bridge(env);
  try {
    await write("private-access.json", await probe(accessBridge));
  } finally {
    await accessBridge.stop();
  }
  progress("Building fresh Linux amd64 scanner image.");
  await run(
    "docker",
    [
      "build",
      "--pull",
      "--no-cache",
      "--platform",
      "linux/amd64",
      "--build-arg",
      `SIGNATURE_REFRESH=${refresh}`,
      "--build-arg",
      `SCANNER_BUILD_ID=${buildId}`,
      "-t",
      "guteneo-scanner:local",
      ".",
    ],
    { env: safeEnv },
  );
  const initial = imageIdentity(
    await run("docker", ["image", "inspect", "guteneo-scanner:local"], {
      env: safeEnv,
    }),
  );
  const local = parseOutput(
    await run("python3", ["tests/qualify_docker.py"], {
      env: safeEnv,
      timeoutMs: 5 * 60_000,
    }),
    "LOCAL_QUALIFICATION_JSON_INVALID",
  );
  assertFreshEngine(local.engine, now().getTime());
  demand(local.buildId === buildId, "LOCAL_SCANNER_BUILD_MISMATCH");
  demand(
    local.cleanPdf?.verdict === "clean" &&
      local.eicarVerdict === "infected" &&
      local.limits?.internet === false &&
      local.documentLogs === 0 &&
      local.temporaryFilesRemaining === 0,
    "LOCAL_DOCKER_QUALIFICATION_INCOMPLETE",
  );
  demand(
    imageIdentity(
      await run("docker", ["image", "inspect", "guteneo-scanner:local"], {
        env: safeEnv,
      }),
    ).Id === initial.Id,
    "QUALIFIED_IMAGE_CHANGED",
  );
  await write("local-qualification.json", local);
  // Do not publish source superseded while the expensive real image test ran.
  await sourceCheck();
  await run("docker", ["tag", initial.Id, tag], { env: safeEnv });
  progress("Publishing the exact qualified scanner image.");
  await run(
    process.execPath,
    [wrangler, "containers", "push", tag, "--config", "wrangler.jsonc"],
    { env: cloudEnv },
  );
  const image = pushedImage(
    await run("docker", ["image", "inspect", tag], { env: safeEnv }),
    initial.Id,
  );
  const derived = deriveConfiguration(source, image, refresh);
  await write("wrangler.json", derived);
  await write("publication.json", {
    sourceCommit: env.GITHUB_SHA,
    ci,
    refresh,
    buildId,
    imageId: initial.Id,
    image,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    stage: "image_qualified_and_pushed",
  });
  await sourceCheck();
  const output = await run(
    process.execPath,
    [
      wrangler,
      "deploy",
      "--config",
      join(artifactDirectory, "wrangler.json"),
      "--containers-rollout",
      "immediate",
      "--message",
      `Scanner refresh ${env.GITHUB_SHA} run ${env.GITHUB_RUN_ID}/${env.GITHUB_RUN_ATTEMPT}`,
    ],
    // Wrangler normalizes tsconfig relative to cwd before esbuild resolves it
    // against configDir. Keep those directories identical for the derived file.
    { env: cloudEnv, cwd: artifactDirectory },
  );
  const version = output.match(/Current Version ID:\s*([a-f0-9-]{36})/)?.[1];
  demand(UUID.test(version ?? ""), "DEPLOYED_SCANNER_VERSION_MISSING");
  const deploymentId = assertDeployment(
    await cf(`/workers/scripts/${SCANNER_NAME}/deployments`),
    version,
  );
  assertContainer(await cf(`/containers/applications/${CONTAINER_ID}`), image);
  const subdomain = await cf(`/workers/scripts/${SCANNER_NAME}/subdomain`);
  demand(
    subdomain.enabled === false && subdomain.previews_enabled === false,
    "SCANNER_PUBLIC_ENDPOINT_ENABLED",
  );
  await write("deployment.json", {
    version,
    deploymentId,
    trafficPercent: 100,
    buildId,
    image,
    private: true,
  });
  progress(
    "Qualifying the deployed scanner through its private service binding.",
  );
  const localBridge = await bridge(env);
  let remote;
  try {
    localBridge.assertRunning();
    remote = parseOutput(
      await run(
        "python3",
        [
          "tests/qualify_scanner_remote.py",
          "--require-worker-version",
          "--expected-build-id",
          buildId,
          "--expected-worker-version",
          version,
        ],
        { env: safeEnv, timeoutMs: 7 * 60_000 },
      ),
      "REMOTE_QUALIFICATION_JSON_INVALID",
    );
    localBridge.assertRunning();
    assertRemoteProof(local, remote, version, buildId, now().getTime());
    // Repeat after the runtime proof: configuration and traffic must still match.
    assertDeployment(
      await cf(`/workers/scripts/${SCANNER_NAME}/deployments`),
      version,
    );
    assertContainer(
      await cf(`/containers/applications/${CONTAINER_ID}`),
      image,
    );
  } finally {
    await localBridge.stop();
  }
  await write("remote-qualification.json", remote);
  const evidence = {
    sourceCommit: env.GITHUB_SHA,
    ci,
    refresh,
    buildId,
    imageId: initial.Id,
    image,
    version,
    deploymentId,
    trafficPercent: 100,
    engine: remote.engine,
    private: true,
    customerDocuments: 0,
    externalSends: 0,
    status: "qualified",
  };
  await write("result.json", evidence);
  return evidence;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 2) {
    console.error("Usage: node apps/scanner/scripts/ci-refresh.mjs");
    process.exitCode = 1;
  } else
    try {
      const result = await refreshScanner({
        progress: (message) => console.log(message),
      });
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "SCANNER_REFRESH_FAILED",
      );
      process.exitCode = 1;
    }
}
