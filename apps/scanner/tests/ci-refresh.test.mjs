import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "jsonc-parser";
import {
  ACCOUNT_ID,
  CONTAINER_ID,
  assertCiEnvironment,
  assertContainer,
  assertDeployment,
  assertFreshEngine,
  assertRemoteProof,
  deriveConfiguration,
  execute,
  preflightPrivateAccess,
  pushedImage,
  qualifiedMain,
  refreshScanner,
  requestJson,
} from "../scripts/ci-refresh.mjs";

const source = parse(
  await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
);
const sha = "a".repeat(40),
  imageId = `sha256:${"b".repeat(64)}`,
  image = `registry.cloudflare.com/${ACCOUNT_ID}/guteneo-scanner-ci@sha256:${"c".repeat(64)}`;
const version = "01234567-89ab-cdef-0123-456789abcdef";
const buildId = `sha-${sha}-run-123-attempt-1`;
const checkedAt = new Date("2026-09-20T12:00:00.000Z");
const env = {
  GITHUB_ACTIONS: "true",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY: "nclsppr/guteneo",
  GITHUB_EVENT_NAME: "schedule",
  GITHUB_SHA: sha,
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "1",
  CLOUDFLARE_API_TOKEN: "synthetic-cloud-token",
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  GH_TOKEN: "synthetic-gh-token",
  SCANNER_REFRESH_ENABLED: "true",
};
const engine = {
  name: "ClamAV",
  version: "1.5.4",
  signatureVersion: 28129,
  signatureDate: "2026-09-20T06:00:00+00:00",
};
const local = {
  engine,
  buildId,
  cleanPdf: { sha256: "d".repeat(64), verdict: "clean" },
  eicarSha256: "e".repeat(64),
  eicarVerdict: "infected",
  limits: { internet: false },
  documentLogs: 0,
  temporaryFilesRemaining: 0,
};
const remote = {
  status: "passed",
  engine,
  buildId,
  workerVersionId: version,
  cleanPdf: local.cleanPdf,
  eicar: { sha256: local.eicarSha256, verdict: "infected" },
  emptyAndWrongTypeRejected: true,
  customerDocuments: 0,
  externalSends: 0,
};
const deployment = {
  deployments: [
    {
      id: "deployment1",
      created_on: checkedAt.toISOString(),
      versions: [{ version_id: version, percentage: 100 }],
    },
  ],
};
const container = {
  id: CONTAINER_ID,
  name: "guteneo-scanner-clamavcontainer",
  configuration: { image },
  max_instances: 1,
  constraints: { jurisdiction: "eu" },
};
const ciRun = {
  id: 44,
  run_attempt: 1,
  status: "completed",
  conclusion: "success",
  head_sha: sha,
  head_branch: "main",
  event: "push",
};

function harness(overrides = {}) {
  const calls = [],
    writes = new Map();
  let stopped = false,
    pushed = false,
    stopCount = 0;
  const request = async (url, token) => {
    calls.push({ type: "read", url, token });
    if (url.endsWith("/git/ref/heads/main")) return { object: { sha } };
    if (url.includes("/actions/workflows/ci.yml/runs?"))
      return { workflow_runs: [ciRun] };
    if (url.includes("/attempts/1/jobs?"))
      return {
        jobs: ["verify", "scanner"].map((name) => ({
          name,
          status: "completed",
          conclusion: "success",
        })),
      };
    if (url.endsWith(`/containers/applications/${CONTAINER_ID}`))
      return container;
    if (url.endsWith("/deployments")) return deployment;
    if (url.endsWith("/subdomain"))
      return { enabled: false, previews_enabled: false };
    throw new Error("Unexpected API route");
  };
  const run = async (command, args, options = {}) => {
    calls.push({ type: "command", command, args, options });
    if (command === "git") return args[0] === "rev-parse" ? sha : "";
    if (command === "docker") {
      if (args[0] === "image")
        return JSON.stringify([
          {
            Id: imageId,
            Os: "linux",
            Architecture: "amd64",
            RepoDigests: pushed ? [image] : [],
          },
        ]);
      return "";
    }
    if (command === "python3")
      return JSON.stringify(
        args[0] === "tests/qualify_docker.py" ? local : remote,
      );
    if (args[1] === "containers" && args[2] === "push") {
      pushed = true;
      return "Pushed image";
    }
    if (args[1] === "deploy") return `Current Version ID: ${version}`;
    throw new Error("Unexpected command");
  };
  const dependencies = {
    env,
    run,
    request,
    now: () => checkedAt,
    readConfiguration: async () => structuredClone(source),
    write: async (name, value) => writes.set(name, value),
    probe: async () => ({
      authenticatedPrivateBinding: true,
      healthStatus: 503,
      code: "SIGNATURES_STALE",
    }),
    bridge: async () => ({
      assertRunning() {},
      async stop() {
        stopped = true;
        stopCount++;
      },
    }),
    ...overrides,
  };
  return {
    dependencies,
    calls,
    writes,
    request,
    run,
    get stopped() {
      return stopped;
    },
    get stopCount() {
      return stopCount;
    },
  };
}

test("requires the dedicated credential, reviewed main CI and explicit scheduled activation", () => {
  assert.doesNotThrow(() => assertCiEnvironment(env));
  assert.throws(
    () => assertCiEnvironment({ ...env, CLOUDFLARE_API_TOKEN: "" }),
    /MISSING_CLOUDFLARE_SCANNER_API_TOKEN/,
  );
  assert.throws(
    () => assertCiEnvironment({ ...env, GITHUB_REF: "refs/heads/feature" }),
    /REVIEWED_MAIN_CI_REQUIRED/,
  );
  assert.throws(
    () => assertCiEnvironment({ ...env, GITHUB_EVENT_NAME: "pull_request" }),
    /REVIEWED_MAIN_CI_REQUIRED/,
  );
  assert.throws(
    () => assertCiEnvironment({ ...env, SCANNER_REFRESH_ENABLED: "" }),
    /SCANNER_SCHEDULE_NOT_ACTIVATED/,
  );
  assert.doesNotThrow(() =>
    assertCiEnvironment({
      ...env,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      SCANNER_REFRESH_ENABLED: "",
    }),
  );
  assert.throws(
    () => assertCiEnvironment({ ...env, CLOUDFLARE_ACCOUNT_ID: "another" }),
    /SCANNER_ACCOUNT_MISMATCH/,
  );
});

test("requires the latest exact-main CI attempt with both verify and scanner successful", async () => {
  const h = harness();
  assert.deepEqual(await qualifiedMain(env, h.request), {
    runId: 44,
    attempt: 1,
    sourceCommit: sha,
  });
  await assert.rejects(
    qualifiedMain(env, async (url, token) =>
      url.includes("/runs?")
        ? {
            workflow_runs: [
              ciRun,
              { ...ciRun, id: 45, status: "in_progress", conclusion: null },
            ],
          }
        : h.request(url, token),
    ),
    /EXACT_MAIN_CI_SUCCESS_REQUIRED/,
  );
  await assert.rejects(
    qualifiedMain(env, async (url, token) =>
      url.includes("/jobs?")
        ? {
            jobs: [
              { name: "verify", status: "completed", conclusion: "success" },
            ],
          }
        : h.request(url, token),
    ),
    /EXACT_MAIN_SCANNER_SUCCESS_REQUIRED/,
  );
  await assert.rejects(
    qualifiedMain(env, async (url, token) =>
      url.endsWith("/git/ref/heads/main")
        ? { object: { sha: "f".repeat(40) } }
        : h.request(url, token),
    ),
    /MAIN_CHANGED_OR_SOURCE_UNREVIEWED/,
  );
});

test("derives an ignored immutable-image configuration without changing reviewed source or privacy", () => {
  const original = structuredClone(source);
  const derived = deriveConfiguration(
    source,
    image,
    checkedAt.toISOString(),
    "/fixture/scanner",
  );
  assert.deepEqual(source, original);
  assert.equal(derived.containers[0].image, image);
  assert.equal(derived.main, "/fixture/scanner/src/index.ts");
  assert.equal(derived.tsconfig, "../../tsconfig.json");
  assert.equal(derived.workers_dev, false);
  assert.equal(derived.preview_urls, false);
  assert.deepEqual(derived.routes, []);
  assert.equal(
    derived.containers[0].image_vars.SIGNATURE_REFRESH,
    checkedAt.toISOString(),
  );
  assert.throws(
    () =>
      deriveConfiguration(
        source,
        "registry.cloudflare.com/example:latest",
        "time",
      ),
    /IMMUTABLE_IMAGE_REQUIRED/,
  );
  assert.throws(
    () =>
      deriveConfiguration({ ...source, name: "guteneo-app" }, image, "time"),
    /IDENTITY_INVALID/,
  );
  assert.throws(
    () => deriveConfiguration({ ...source, workers_dev: true }, image, "time"),
    /MUST_REMAIN_PRIVATE/,
  );
});

test("binds the pushed digest to the exact tested local image ID and Linux amd64 platform", () => {
  const raw = JSON.stringify([
    { Id: imageId, Os: "linux", Architecture: "amd64", RepoDigests: [image] },
  ]);
  assert.equal(pushedImage(raw, imageId), image);
  assert.throws(
    () => pushedImage(raw, `sha256:${"a".repeat(64)}`),
    /QUALIFIED_IMAGE_CHANGED/,
  );
  assert.throws(
    () => pushedImage(raw.replace('"amd64"', '"arm64"'), imageId),
    /IMAGE_IDENTITY_INVALID/,
  );
  assert.throws(
    () =>
      pushedImage(
        raw.replace(
          image,
          `registry.cloudflare.com/wrong/scanner@sha256:${"c".repeat(64)}`,
        ),
        imageId,
      ),
    /DIGEST_MISSING_OR_AMBIGUOUS/,
  );
});

test("verifies actual signature date, runtime version, exact clean and harmless EICAR results", () => {
  assert.doesNotThrow(() =>
    assertRemoteProof(local, remote, version, buildId, checkedAt.getTime()),
  );
  assert.throws(
    () =>
      assertFreshEngine(
        { ...engine, signatureDate: "2026-09-17T06:00:00Z" },
        checkedAt.getTime(),
      ),
    /SIGNATURES_MISSING_OR_STALE/,
  );
  assert.throws(
    () =>
      assertFreshEngine(
        { ...engine, signatureDate: "2026-09-21T06:00:00Z" },
        checkedAt.getTime(),
      ),
    /SIGNATURES_MISSING_OR_STALE/,
  );
  assert.throws(
    () =>
      assertRemoteProof(
        local,
        { ...remote, workerVersionId: null },
        version,
        buildId,
        checkedAt.getTime(),
      ),
    /VERSION_MISMATCH/,
  );
  assert.throws(
    () =>
      assertRemoteProof(
        local,
        { ...remote, engine: { ...engine, signatureVersion: 28130 } },
        version,
        buildId,
        checkedAt.getTime(),
      ),
    /ENGINE_DIFFERS/,
  );
  assert.throws(
    () =>
      assertRemoteProof(
        local,
        { ...remote, eicar: { ...remote.eicar, verdict: "clean" } },
        version,
        buildId,
        checkedAt.getTime(),
      ),
    /VERDICTS_MISMATCH/,
  );
  assert.throws(
    () =>
      assertRemoteProof(
        local,
        { ...remote, buildId: `sha-${sha}-run-122-attempt-1` },
        version,
        buildId,
        checkedAt.getTime(),
      ),
    /BUILD_MISMATCH/,
  );
});

test("requires 100 percent exact worker version and the unchanged existing container scope", () => {
  assert.equal(assertDeployment(deployment, version), "deployment1");
  assert.throws(
    () =>
      assertDeployment(
        {
          deployments: [
            {
              ...deployment.deployments[0],
              versions: [{ version_id: version, percentage: 50 }],
            },
          ],
        },
        version,
      ),
    /100_PERCENT_REQUIRED/,
  );
  assert.doesNotThrow(() => assertContainer(container, image));
  assert.throws(
    () =>
      assertContainer(
        { ...container, configuration: { image: "other" } },
        image,
      ),
    /IMAGE_OR_SCOPE_MISMATCH/,
  );
  assert.throws(
    () => assertContainer({ ...container, max_instances: 2 }, image),
    /IMAGE_OR_SCOPE_MISMATCH/,
  );
});

test("orchestrates qualify then exact-image push then scanner-only deploy and private verification", async () => {
  const h = harness();
  const result = await refreshScanner(h.dependencies);
  assert.equal(result.status, "qualified");
  assert.equal(result.sourceCommit, sha);
  assert.equal(result.image, image);
  assert.equal(result.trafficPercent, 100);
  assert.equal(h.stopped, true);
  assert.equal(h.stopCount, 2);
  const commands = h.calls.filter((call) => call.type === "command");
  const dockerBuild = commands.find(
    (c) => c.command === "docker" && c.args[0] === "build",
  );
  assert.ok(dockerBuild.args.includes("--no-cache"));
  assert.ok(dockerBuild.args.includes("--pull"));
  assert.ok(dockerBuild.args.includes("linux/amd64"));
  const qualifyIndex = commands.findIndex(
    (c) => c.args[0] === "tests/qualify_docker.py",
  );
  const pushIndex = commands.findIndex((c) => c.args[1] === "containers");
  const deployIndex = commands.findIndex((c) => c.args[1] === "deploy");
  assert.ok(qualifyIndex < pushIndex && pushIndex < deployIndex);
  assert.deepEqual(
    commands.filter((c) => c.args[1] === "deploy").map((c) => c.args.at(-1)),
    [`Scanner refresh ${sha} run 123/1`],
  );
  assert.ok(commands[deployIndex].args.includes("--containers-rollout"));
  const derivedPath =
    commands[deployIndex].args[
      commands[deployIndex].args.indexOf("--config") + 1
    ];
  assert.equal(
    commands[deployIndex].options.cwd,
    derivedPath.slice(0, derivedPath.lastIndexOf("/")),
  );
  assert.equal(commands[pushIndex].options.cwd, undefined);
  for (const c of commands) {
    assert.equal(c.options.env.GH_TOKEN, undefined);
    if (c.command === "docker" || c.command === "python3")
      assert.equal(c.options.env.CLOUDFLARE_API_TOKEN, undefined);
  }
  assert.equal(h.writes.get("wrangler.json").containers[0].image, image);
  assert.deepEqual(
    [...h.writes.keys()],
    [
      "private-access.json",
      "local-qualification.json",
      "wrangler.json",
      "publication.json",
      "deployment.json",
      "remote-qualification.json",
      "result.json",
    ],
  );
  assert.ok(
    !JSON.stringify([...h.writes.values()]).includes(env.CLOUDFLARE_API_TOKEN),
  );
});

test("publishes nothing when source gets superseded during the Docker qualification", async () => {
  const h = harness();
  let reads = 0;
  await assert.rejects(
    refreshScanner({
      ...h.dependencies,
      request: async (url, token) =>
        url.endsWith("/git/ref/heads/main") && ++reads > 1
          ? { object: { sha: "f".repeat(40) } }
          : h.request(url, token),
    }),
    /MAIN_CHANGED_OR_SOURCE_UNREVIEWED/,
  );
  assert.equal(
    h.calls.some((c) => c.type === "command" && c.args[1] === "containers"),
    false,
  );
  assert.equal(
    h.calls.some((c) => c.type === "command" && c.args[1] === "deploy"),
    false,
  );
});

test("refuses a dirty checkout and never trusts a failed real Docker qualification", async () => {
  const dirty = harness();
  await assert.rejects(
    refreshScanner({
      ...dirty.dependencies,
      run: async (cmd, args, opts) =>
        cmd === "git" && args[0] === "status"
          ? " M apps/scanner/src/index.ts"
          : dirty.run(cmd, args, opts),
    }),
    /CLEAN_REVIEWED_CHECKOUT_REQUIRED/,
  );
  assert.equal(
    dirty.calls.some((c) => c.command === "docker"),
    false,
  );
  const bad = harness();
  await assert.rejects(
    refreshScanner({
      ...bad.dependencies,
      run: async (cmd, args, opts) =>
        args[0] === "tests/qualify_docker.py"
          ? JSON.stringify({ ...local, eicarVerdict: "clean" })
          : bad.run(cmd, args, opts),
    }),
    /LOCAL_DOCKER_QUALIFICATION_INCOMPLETE/,
  );
  assert.equal(
    bad.calls.some((c) => c.type === "command" && c.args[1] === "containers"),
    false,
  );
});

test("fails remote mismatch with retained deployment evidence and always closes private bridge", async () => {
  const h = harness();
  await assert.rejects(
    refreshScanner({
      ...h.dependencies,
      run: async (cmd, args, opts) =>
        args[0] === "tests/qualify_scanner_remote.py"
          ? JSON.stringify({ ...remote, workerVersionId: null })
          : h.run(cmd, args, opts),
    }),
    /REMOTE_SCANNER_VERSION_MISMATCH/,
  );
  assert.equal(h.stopped, true);
  assert.equal(h.stopCount, 2);
  assert.ok(h.writes.has("deployment.json"));
  assert.equal(h.writes.has("result.json"), false);
  assert.equal(
    h.calls.filter((c) => c.type === "command" && c.args[1] === "deploy")
      .length,
    1,
  );
});

test("API and subprocess failures never disclose tokens or upstream response bodies", async () => {
  await assert.rejects(
    requestJson(
      "https://api.cloudflare.com/client/v4/accounts/fixture",
      "synthetic-secret",
      async () => new Response("secret-body", { status: 403 }),
    ),
    (error) => error.message === "READ_API_FAILED_403",
  );
  await assert.rejects(
    execute(
      process.execPath,
      ["-e", "process.stderr.write('synthetic-secret');process.exit(2)"],
      { env: { PATH: process.env.PATH }, timeoutMs: 1000 },
    ),
    (error) => !error.message.includes("synthetic-secret"),
  );
});

test("pre-publication binding probe accepts an old scanner but rejects HTML, auth and arbitrary errors", async () => {
  const control = { assertRunning() {} };
  assert.deepEqual(
    await preflightPrivateAccess(control, {
      fetcher: async () => Response.json({ status: "ready", engine }),
    }),
    { authenticatedPrivateBinding: true, healthStatus: 200 },
  );
  assert.deepEqual(
    await preflightPrivateAccess(control, {
      fetcher: async () =>
        Response.json(
          { verdict: "error", code: "SIGNATURES_STALE" },
          { status: 503 },
        ),
    }),
    {
      authenticatedPrivateBinding: true,
      healthStatus: 503,
      code: "SIGNATURES_STALE",
    },
  );
  for (const response of [
    new Response("login", { status: 403 }),
    Response.json({ code: "ACCESS_DENIED" }, { status: 503 }),
    Response.json({ status: "ready", engine }, { status: 401 }),
  ])
    await assert.rejects(
      preflightPrivateAccess(control, { fetcher: async () => response }),
      /ACCESS_DENIED/,
    );
  const h = harness();
  await assert.rejects(
    refreshScanner({
      ...h.dependencies,
      probe: async () => {
        throw new Error("SCANNER_PRIVATE_BRIDGE_ACCESS_DENIED");
      },
    }),
    /ACCESS_DENIED/,
  );
  assert.equal(h.stopCount, 1);
  assert.equal(
    h.calls.some((c) => c.command === "docker"),
    false,
  );
  assert.equal(
    h.calls.some((c) => c.type === "command" && c.args[1] === "containers"),
    false,
  );
});

test("workflow stays opt-in on schedule, read-only in GitHub and non-cancellable during publication", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/scanner-refresh.yml", import.meta.url),
    "utf8",
  ).catch(() =>
    readFile(
      new URL(
        "../../../../.github/workflows/scanner-refresh.yml",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.match(workflow, /cron: "17 8 \* \* \*"/);
  assert.match(workflow, /vars\.SCANNER_REFRESH_ENABLED == 'true'/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /actions: read/);
  assert.doesNotMatch(workflow, /(contents|actions|pull-requests): write/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /secrets\.CLOUDFLARE_SCANNER_API_TOKEN/);
  assert.doesNotMatch(workflow, /pull_request:|git (push|commit)|deploy:live/);
});
