import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ACCOUNT_ID,
  CONTAINER_ID,
  assertFreshEngine,
} from "../scripts/ci-refresh.mjs";
import {
  checkMaintenance,
  checkSettings,
  currentHealth,
  latestQualifiedRun,
  safeFailureCode,
} from "../scripts/maintenance-status.mjs";

const now = Date.parse("2026-10-23T12:00:00Z");
const sha = "a".repeat(40);
const version = "01234567-89ab-cdef-0123-456789abcdef";
const image = `registry.cloudflare.com/${ACCOUNT_ID}/guteneo-scanner-ci@sha256:${"b".repeat(64)}`;
const buildId = `sha-${sha}-run-123-attempt-1`;
const env = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "nclsppr/guteneo",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "schedule",
  CLOUDFLARE_API_TOKEN: "synthetic-cloud-token",
  GH_TOKEN: "synthetic-gh-token",
  SCANNER_REFRESH_ENABLED: "true",
  SCANNER_TOKEN_EXPIRES_AT: "2027-10-23T00:00:00Z",
};
const run = {
  id: 123,
  run_attempt: 1,
  status: "completed",
  conclusion: "success",
  head_branch: "main",
  head_sha: sha,
  event: "schedule",
  created_at: "2026-10-23T08:17:00Z",
  updated_at: "2026-10-23T08:30:00Z",
};
const engine = {
  name: "ClamAV",
  version: "1.5.4",
  signatureVersion: 28162,
  signatureDate: "2026-10-23T06:24:08+00:00",
};
const deployment = {
  deployments: [
    {
      id: "deployment1",
      created_on: new Date(now).toISOString(),
      versions: [{ version_id: version, percentage: 100 }],
    },
  ],
};
const container = {
  id: CONTAINER_ID,
  name: "guteneo-scanner-clamavcontainer",
  max_instances: 1,
  configuration: { image },
  constraints: { jurisdiction: "eu" },
};
const expected = { workerVersion: version, buildId };
const qualifiedResult = {
  status: "qualified",
  sourceCommit: sha,
  buildId,
  version,
  deploymentId: "deployment1",
  trafficPercent: 100,
  image,
  engine,
  private: true,
  customerDocuments: 0,
  externalSends: 0,
};
const control = { assertRunning() {} };
const healthyResponse = (body = { status: "ready", engine }, headers = {}) =>
  Response.json(body, {
    headers: {
      "x-guteneo-worker-version": version,
      "x-guteneo-scanner-build-id": buildId,
      ...headers,
    },
  });

test("maintenance settings visibly reject missing credentials, disabled schedules and invalid expiry", () => {
  assert.equal(
    checkSettings(env, now, true).tokenExpiresAt,
    "2027-10-23T00:00:00.000Z",
  );
  for (const [field, value, code] of [
    ["GITHUB_REF", "refs/heads/feature", "SCANNER_MAIN_WORKFLOW_REQUIRED"],
    ["GITHUB_REPOSITORY", "someone/fork", "SCANNER_MAIN_WORKFLOW_REQUIRED"],
    ["CLOUDFLARE_API_TOKEN", "", "MISSING_CLOUDFLARE_SCANNER_API_TOKEN"],
    ["GH_TOKEN", "", "MISSING_GITHUB_READ_TOKEN"],
    ["SCANNER_REFRESH_ENABLED", "", "SCANNER_SCHEDULE_NOT_ACTIVATED"],
    ["SCANNER_REFRESH_ENABLED", "false", "SCANNER_SCHEDULE_NOT_ACTIVATED"],
    ["SCANNER_TOKEN_EXPIRES_AT", "", "SCANNER_TOKEN_EXPIRY_REQUIRED"],
    [
      "SCANNER_TOKEN_EXPIRES_AT",
      "2027-02-31T00:00:00Z",
      "SCANNER_TOKEN_EXPIRY_REQUIRED",
    ],
    [
      "SCANNER_TOKEN_EXPIRES_AT",
      "2026-10-23T12:00:00Z",
      "SCANNER_TOKEN_EXPIRED",
    ],
  ])
    assert.throws(
      () => checkSettings({ ...env, [field]: value }, now, true),
      new RegExp(code),
    );
  assert.doesNotThrow(() =>
    checkSettings(
      {
        ...env,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        SCANNER_REFRESH_ENABLED: "",
      },
      now,
    ),
  );
  const expiring = { ...env, SCANNER_TOKEN_EXPIRES_AT: "2026-10-30T00:00:00Z" };
  assert.doesNotThrow(() => checkSettings(expiring, now));
  assert.throws(
    () => checkSettings(expiring, now, true),
    /SCANNER_TOKEN_EXPIRING/,
  );
});

test("latest completed refresh must succeed within 30 hours, not hide behind an older success", () => {
  const workflow = { state: "active" };
  assert.equal(
    latestQualifiedRun(workflow, { workflow_runs: [run] }, now).id,
    123,
  );
  assert.throws(
    () =>
      latestQualifiedRun(
        { state: "disabled_manually" },
        { workflow_runs: [run] },
        now,
      ),
    /SCANNER_REFRESH_WORKFLOW_DISABLED/,
  );
  for (const conclusion of ["failure", "skipped", "cancelled", null]) {
    assert.throws(
      () =>
        latestQualifiedRun(
          workflow,
          {
            workflow_runs: [
              run,
              {
                ...run,
                id: 124,
                conclusion,
                created_at: "2026-10-23T10:00:00Z",
              },
            ],
          },
          now,
        ),
      /SCANNER_LATEST_REFRESH_FAILED_OR_SKIPPED/,
    );
  }
  for (const altered of [
    { ...run, updated_at: "2026-10-22T05:59:59Z" },
    { ...run, updated_at: "2026-10-23T12:06:00Z" },
    { ...run, id: "123" },
    { ...run, head_sha: "invalid" },
    { ...run, status: "in_progress" },
    { ...run, head_branch: "feature" },
  ]) {
    assert.throws(
      () => latestQualifiedRun(workflow, { workflow_runs: [altered] }, now),
      /SCANNER_QUALIFIED_REFRESH_MISSING_OR_OVERDUE/,
    );
  }
});

test("private health waits through cold start using GET only and binds actual runtime identity", async () => {
  let time = now,
    calls = 0;
  const proof = await currentHealth(control, expected, {
    clock: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    fetcher: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:8799/scanner/health");
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(options.body, undefined);
      calls++;
      return calls === 1
        ? Response.json({ code: "SCANNER_NOT_READY" }, { status: 503 })
        : healthyResponse();
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(proof.engine, engine);
  assert.equal(proof.checkedAt, "2026-10-23T12:00:05.000Z");
});

test("watchdog warns at 42 hours on the real loaded engine without changing qualification", async () => {
  for (const [age, warning] of [
    [42 * 3_600_000 - 1, false],
    [42 * 3_600_000, true],
    [47 * 3_600_000, true],
  ]) {
    const loaded = {
      ...engine,
      signatureDate: new Date(now - age).toISOString(),
    };
    assert.doesNotThrow(() => assertFreshEngine(loaded, now));
    let reads = 0;
    const result = currentHealth(control, expected, {
      clock: () => now,
      fetcher: async (url, init) => {
        reads++;
        assert.equal(url, "http://127.0.0.1:8799/scanner/health");
        assert.equal(init.method, "GET");
        return healthyResponse({ status: "ready", engine: loaded });
      },
      sleep: async () => {
        assert.fail("Signature warning must not retry or refresh");
      },
    });
    if (warning) await assert.rejects(result, /SCANNER_SIGNATURES_EXPIRING/);
    else assert.deepEqual((await result).engine, loaded);
    assert.equal(reads, 1);
  }
  assert.equal(
    safeFailureCode(new Error("SCANNER_SIGNATURES_EXPIRING")),
    "SCANNER_SIGNATURES_EXPIRING",
  );
});

test("health rejects stale signatures and malformed responses instead of retrying into false success", async () => {
  for (const [response, code] of [
    [
      Response.json({ code: "SIGNATURES_STALE" }, { status: 503 }),
      "SCANNER_SIGNATURES_STALE",
    ],
    [
      healthyResponse({
        status: "ready",
        engine: { ...engine, signatureDate: "2026-10-20T06:00:00Z" },
      }),
      "REAL_SIGNATURES_MISSING_OR_STALE",
    ],
    [
      healthyResponse(undefined, { "x-guteneo-worker-version": "wrong" }),
      "SCANNER_RUNTIME_IDENTITY_MISMATCH",
    ],
    [
      healthyResponse(undefined, { "x-guteneo-scanner-build-id": "wrong" }),
      "SCANNER_RUNTIME_IDENTITY_MISMATCH",
    ],
    [new Response("<html>error</html>"), "SCANNER_PRIVATE_HEALTH_INVALID"],
    [
      new Response("{", { headers: { "content-type": "application/json" } }),
      "SCANNER_PRIVATE_HEALTH_INVALID",
    ],
    [
      Response.json({ value: "x".repeat(4097) }),
      "SCANNER_PRIVATE_HEALTH_INVALID",
    ],
    [
      Response.json({ code: "untrusted-server-detail" }, { status: 503 }),
      "SCANNER_PRIVATE_HEALTH_INVALID",
    ],
  ])
    await assert.rejects(
      currentHealth(control, expected, {
        clock: () => now,
        fetcher: async () => response,
        sleep: async () => assert.fail("must not retry"),
      }),
      new RegExp(code),
    );
});

test("health warmup is bounded and never treats an unavailable scanner as healthy", async () => {
  let time = now,
    calls = 0;
  await assert.rejects(
    currentHealth(control, expected, {
      clock: () => time,
      sleep: async (ms) => {
        time += ms;
      },
      fetcher: async () => {
        calls++;
        return Response.json({ code: "SCANNER_UNAVAILABLE" }, { status: 503 });
      },
    }),
    /SCANNER_HEALTH_WARMUP_TIMEOUT/,
  );
  assert.equal(time - now, 300_000);
  assert.equal(calls, 60);
});

function harness(overrides = {}) {
  const calls = [];
  let stopped = 0;
  const request = async (url, token) => {
    calls.push(url);
    assert.equal(
      token,
      url.startsWith("https://api.github.com/")
        ? env.GH_TOKEN
        : env.CLOUDFLARE_API_TOKEN,
    );
    if (url.endsWith("/scanner-refresh.yml")) return { state: "active" };
    if (url.includes("/scanner-refresh.yml/runs?"))
      return { workflow_runs: [run] };
    if (url.includes("/artifacts?"))
      return {
        artifacts: [
          {
            id: 456,
            name: "scanner-refresh-123-1",
            expired: false,
            size_in_bytes: 100,
            workflow_run: { id: 123, head_sha: sha },
          },
        ],
      };
    if (url.endsWith("/deployments")) return structuredClone(deployment);
    if (url.endsWith(`/applications/${CONTAINER_ID}`))
      return structuredClone(container);
    if (url.endsWith("/subdomain"))
      return { enabled: false, previews_enabled: false };
    assert.fail("Unexpected API route");
  };
  return {
    calls,
    request,
    get stopped() {
      return stopped;
    },
    dependencies: {
      env,
      now: () => now,
      request,
      download: async () => structuredClone(qualifiedResult),
      bridge: async () => ({
        ...control,
        stop: async () => {
          stopped++;
        },
      }),
      health: async (actualControl, actualExpected) => {
        assert.deepEqual(actualExpected, expected);
        actualControl.assertRunning();
        return { engine, checkedAt: new Date(now).toISOString() };
      },
      ...overrides,
    },
  };
}

test("watchdog requires qualified artifact, private scope and current runtime; rechecks drift and stops bridge", async () => {
  const h = harness();
  const proof = await checkMaintenance(h.dependencies);
  assert.equal(proof.status, "healthy");
  assert.equal(proof.productionScans, 0);
  assert.equal(proof.latestQualifiedRun, 123);
  assert.equal(proof.workerVersion, version);
  assert.equal(proof.image, image);
  assert.equal(h.stopped, 1);
  assert.equal(h.calls.filter((url) => url.endsWith("/deployments")).length, 2);
  assert.equal(
    h.calls.some((url) => /\/(?:scan|d1|r2|secrets|tokens)(?:\/|$)/.test(url)),
    false,
  );
  const missing = harness();
  await assert.rejects(
    checkMaintenance({
      ...missing.dependencies,
      request: async (url, token) =>
        url.includes("/artifacts?")
          ? { artifacts: [] }
          : missing.request(url, token),
    }),
    /SCANNER_QUALIFICATION_ARTIFACT_MISSING/,
  );
  assert.equal(
    missing.calls.some((url) => url.includes("cloudflare")),
    false,
  );
  const failed = harness({
    health: async () => {
      throw new Error("SCANNER_SIGNATURES_STALE");
    },
  });
  await assert.rejects(
    checkMaintenance(failed.dependencies),
    /SCANNER_SIGNATURES_STALE/,
  );
  assert.equal(failed.stopped, 1);
  const drift = harness();
  let deploymentReads = 0;
  await assert.rejects(
    checkMaintenance({
      ...drift.dependencies,
      request: async (url, token) => {
        const result = await drift.request(url, token);
        if (url.endsWith("/deployments") && ++deploymentReads === 2)
          result.deployments[0].versions[0].percentage = 50;
        return result;
      },
    }),
    /SCANNER_EXACT_VERSION_100_PERCENT_REQUIRED/,
  );
  assert.equal(drift.stopped, 1);
});

test("failure output never reflects arbitrary remote errors or credentials", () => {
  assert.equal(
    safeFailureCode(new Error("token=synthetic-cloud-token")),
    "SCANNER_MAINTENANCE_CHECK_FAILED",
  );
  assert.equal(
    safeFailureCode(new Error("READ_API_FAILED_403")),
    "READ_API_FAILED_403",
  );
  assert.equal(
    safeFailureCode(new Error("SCANNER_SIGNATURES_STALE")),
    "SCANNER_SIGNATURES_STALE",
  );
});

test("a later unqualified deployment or image cannot borrow an older successful run's identity", async () => {
  for (const change of ["version", "image", "deployment", "engine", "proof"]) {
    const h = harness();
    await assert.rejects(
      checkMaintenance({
        ...h.dependencies,
        download: async () => ({
          ...structuredClone(qualifiedResult),
          ...(change === "proof" ? { status: "failed" } : {}),
        }),
        request: async (url, token) => {
          const value = await h.request(url, token);
          if (url.endsWith("/deployments")) {
            if (change === "version")
              value.deployments[0].versions[0].version_id =
                "11111111-1111-1111-1111-111111111111";
            if (change === "deployment")
              value.deployments[0].id = "deployment2";
          }
          if (
            change === "image" &&
            url.endsWith(`/applications/${CONTAINER_ID}`)
          )
            value.configuration.image = image.replace(
              "b".repeat(64),
              "c".repeat(64),
            );
          return value;
        },
        health: async () => ({
          engine:
            change === "engine"
              ? { ...engine, signatureVersion: 28163 }
              : engine,
        }),
      }),
      /SCANNER_(?:EXACT_VERSION_100_PERCENT_REQUIRED|CONTAINER_IMAGE_OR_SCOPE_MISMATCH|QUALIFIED_RUNTIME_CHANGED|QUALIFICATION_ARTIFACT_INVALID)/,
    );
  }
});

test("separate watchdog has a bounded schedule, read-only permissions and no silent activation skip", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/scanner-watchdog.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /43 \*\/6 \* \* \*/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /group: guteneo-production-scanner-refresh/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /queue: max/);
  assert.match(workflow, /maintenance-status.mjs --watchdog/);
  assert.doesNotMatch(
    workflow,
    /permissions:[\s\S]*?\bwrite\b|if:.*SCANNER_REFRESH_ENABLED|wrangler deploy|gh issue|mailto:/,
  );
});

test("watchdog rejects either public endpoint enabled during health warmup and closes the bridge", async () => {
  for (const endpoint of [
    { enabled: true, previews_enabled: false },
    { enabled: false, previews_enabled: true },
  ]) {
    const h = harness();
    let afterHealth = false;
    await assert.rejects(
      checkMaintenance({
        ...h.dependencies,
        health: async (...args) => {
          const result = await h.dependencies.health(...args);
          afterHealth = true;
          return result;
        },
        request: async (url, token) =>
          afterHealth && url.endsWith("/subdomain")
            ? endpoint
            : h.request(url, token),
      }),
      /SCANNER_PUBLIC_ENDPOINT_ENABLED/,
    );
    assert.equal(h.stopped, 1);
  }
});
