import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  createProbeFetch,
  readProbeCredential,
  probeFailureMessage,
} from "./probe-credentials.mjs";
import {
  ENGINE,
  loadReferenceCorpus,
  loadBenchmarkCorpus,
  assertReferenceResult,
} from "./reference-corpus.mjs";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://127.0.0.1:8891" },
    "source-commit": { type: "string" },
    "worker-version": { type: "string" },
    proof: { type: "string" },
  },
});
const base = new URL(values["base-url"]);
assert.equal(base.protocol, "http:");
assert.ok(
  ["127.0.0.1", "localhost"].includes(base.hostname),
  "Probe must remain on loopback",
);
assert.equal(base.username + base.password + base.search + base.hash, "");
assert.equal(base.pathname, "/");
assert.match(values["source-commit"] ?? "", /^[a-f0-9]{40}$/);
assert.match(
  values["worker-version"] ?? "",
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
);
assert.ok(
  values.proof,
  "Provide an explicit local --proof file; reports are never published",
);

// Shared only with this local Wrangler process via gitignored mode-0600
// qualification/.dev.vars; never supplied as an argument or sent to Cloudflare.
const probeToken = readProbeCredential();
const probeFetch = createProbeFetch(base, probeToken);

const references = loadReferenceCorpus();
const benchmarks = loadBenchmarkCorpus();
const fixtures = [...references, ...benchmarks];
const proof = {
  observedAt: new Date().toISOString(),
  evidence:
    "Hosted private Cloudflare service via authenticated Wrangler remote bindings; official non-customer references",
  accountId: "39ac9fada6cba44d9ecf09d467609e69",
  service: "guteneo-pdf-validator",
  sourceCommit: values["source-commit"],
  workerVersion: values["worker-version"],
  engine: ENGINE,
  status: "running",
  checks: {},
  references: [],
  benchmarks: [],
  limits: {
    workerMilliseconds: 45000,
    bodyMilliseconds: 5000,
    processMilliseconds: 40000,
    maximumBytes: 10 * 1024 * 1024,
  },
};
async function closedGate() {
  await Promise.all(
    ["https://guteneo.com", "https://guteneo-app.nclsppr.workers.dev"].map(
      async (origin) => {
        const response = await fetch(`${origin}/api/capabilities`, {
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.mode, "production");
        assert.equal(
          result.horizon?.available,
          false,
          "Refuse to stop a validator available to customers",
        );
      },
    ),
  );
}
async function call(path, body, media = "application/pdf", extraHeaders = {}) {
  const started = performance.now();
  const response = await probeFetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? extraHeaders
        : { "Content-Type": media, ...extraHeaders },
    ...(body === undefined ? {} : { body }),
    signal: AbortSignal.timeout(48000),
  });
  const text = await response.text();
  assert.ok(Buffer.byteLength(text) <= 32768);
  assert.equal(
    response.headers.get("content-type")?.split(";")[0],
    "application/json",
  );
  return {
    status: response.status,
    milliseconds: Math.round(performance.now() - started),
    body: JSON.parse(text),
  };
}
async function stopForColdStart() {
  await closedGate();
  const release = await call("/release");
  assert.equal(release.status, 200);
  assert.deepEqual(release.body, {
    sourceCommit: values["source-commit"],
    workerVersion: values["worker-version"],
  });
  proof.checks.release = release.body;
  const stopped = await call("/stop", new Uint8Array());
  assert.equal(
    stopped.status,
    200,
    "Enable qualification RPC only for this prelaunch run",
  );
  const deadline = performance.now() + 20000;
  for (;;) {
    const state = await call("/state");
    assert.equal(state.status, 200);
    if (["stopped", "stopped_with_code"].includes(state.body.status))
      return state.body.status;
    assert.ok(
      performance.now() < deadline,
      "Container did not stop within the bounded cold-start setup",
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
try {
  await closedGate();
  proof.checks.coldHealthStoppedState = await stopForColdStart();
  const health = await call("/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: "ready", engine: ENGINE });
  assert.ok(health.milliseconds <= 45000);
  proof.checks.coldHealth = health;
  proof.checks.coldValidationStoppedState = await stopForColdStart();
  const positive = fixtures.find((fixture) => fixture.id === "verapdf-2b-pass");
  const cold = await call("/validate?profile=2b", positive.bytes);
  assert.equal(cold.status, 200);
  assertReferenceResult(cold.body, positive, positive.profiles[0]);
  assert.ok(cold.milliseconds <= 45000);
  proof.checks.coldValidation = {
    milliseconds: cold.milliseconds,
    sha256: cold.body.sha256,
    compliant: cold.body.compliant,
  };
  proof.checks.coldLargeValidationStoppedState = await stopForColdStart();
  const large = benchmarks[0];
  const largeExpected = large.profiles.find(
    (expected) => expected.profile === "ua2",
  );
  const coldLarge = await call("/validate?profile=ua2", large.bytes);
  assert.equal(coldLarge.status, 200);
  assertReferenceResult(coldLarge.body, large, largeExpected);
  assert.ok(coldLarge.milliseconds <= 45000);
  proof.checks.coldLargeValidation = {
    milliseconds: coldLarge.milliseconds,
    sha256: coldLarge.body.sha256,
    pageCount: large.pageCount,
    sizeBytes: large.sizeBytes,
  };
  for (const fixture of fixtures) {
    for (const expected of fixture.profiles) {
      const observed = await call(
        `/validate?profile=${expected.profile}`,
        fixture.bytes,
        "application/pdf",
        {
          Authorization: "synthetic-do-not-forward",
          "X-Private-Probe": "synthetic-do-not-echo",
        },
      );
      assert.equal(observed.status, 200, fixture.id);
      assertReferenceResult(observed.body, fixture, expected);
      const observations = fixture.pageCount
        ? proof.benchmarks
        : proof.references;
      observations.push({
        id: fixture.id,
        milliseconds: observed.milliseconds,
        ...observed.body,
      });
    }
  }
  const outcomes = await Promise.all([
    call("/validate?profile=2b", positive.bytes),
    call("/validate?profile=2b", positive.bytes),
  ]);
  assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 503]);
  const busy = outcomes.find((result) => result.status === 503);
  assert.deepEqual(busy.body, { code: "VALIDATOR_BUSY" });
  assertReferenceResult(
    outcomes.find((result) => result.status === 200).body,
    positive,
    positive.profiles[0],
  );
  proof.checks.concurrency = outcomes.map(({ status, milliseconds, body }) => ({
    status,
    milliseconds,
    ...(status === 503 ? { code: body.code } : { sha256: body.sha256 }),
  }));
  const rejectionCases = [
    [
      "unknownProfile",
      "/validate?profile=unknown",
      positive.bytes,
      "application/pdf",
      400,
      "INVALID_PROFILE",
    ],
    [
      "duplicateProfile",
      "/validate?profile=ua1&profile=ua2",
      positive.bytes,
      "application/pdf",
      400,
      "INVALID_PROFILE",
    ],
    [
      "urlParameter",
      "/validate?profile=ua1&url=https://example.org",
      positive.bytes,
      "application/pdf",
      400,
      "INVALID_PROFILE",
    ],
    [
      "wrongMedia",
      "/validate?profile=ua1",
      positive.bytes,
      "text/plain",
      415,
      "PDF_CONTENT_TYPE_REQUIRED",
    ],
    [
      "oversizedBody",
      "/validate?profile=ua1",
      Buffer.alloc(10 * 1024 * 1024 + 1, 32),
      "application/pdf",
      413,
      "BODY_TOO_LARGE",
    ],
    [
      "invalidPdf",
      "/validate?profile=ua1",
      Buffer.from("synthetic-invalid-pdf"),
      "application/pdf",
      400,
      "INVALID_PDF",
    ],
    [
      "incompletePdf",
      "/validate?profile=ua1",
      Buffer.from("%PDF-1.7\n%%EOF"),
      "application/pdf",
      503,
      "VALIDATION_INCOMPLETE",
    ],
    [
      "emptyDeclaredBody",
      "/validate?profile=ua1",
      Buffer.alloc(0),
      "application/pdf",
      413,
      "BODY_TOO_LARGE",
    ],
  ];
  proof.checks.rejections = [];
  for (const [id, path, bytes, media, status, code] of rejectionCases) {
    const observed = await call(path, bytes, media);
    assert.equal(observed.status, status, id);
    assert.deepEqual(observed.body, { code }, id);
    proof.checks.rejections.push({
      id,
      status,
      code,
      milliseconds: observed.milliseconds,
    });
  }
  const deadline = await call("/process-deadline", new Uint8Array());
  assert.equal(deadline.status, 200);
  assert.deepEqual(deadline.body, {
    code: "VALIDATION_TIMEOUT",
    temporaryDirectories: 0,
  });
  proof.checks.syntheticProcessDeadline = deadline;
  const privacy = await call("/privacy");
  assert.equal(privacy.status, 200);
  assert.deepEqual(privacy.body, { temporaryDirectories: 0 });
  proof.checks.temporaryFileCleanup = privacy.body;
  // State RPC reads Durable Object metadata without sending traffic to the
  // container; polling must not keep an idle validator awake.
  const idleStarted = performance.now();
  for (;;) {
    const state = await call("/state");
    assert.equal(state.status, 200);
    if (["stopped", "stopped_with_code"].includes(state.body.status)) break;
    assert.ok(
      performance.now() - idleStarted <= 15000,
      "Container did not automatically sleep after its 5-second idle window",
    );
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  proof.checks.automaticIdleStopMilliseconds = Math.round(
    performance.now() - idleStarted,
  );
  const wake = await call("/health");
  assert.equal(wake.status, 200);
  assert.deepEqual(wake.body, { status: "ready", engine: ENGINE });
  assert.ok(wake.milliseconds <= 45000);
  proof.checks.automaticIdleWake = wake;
  await closedGate();
  proof.status = "passed";
  writeFileSync(values.proof, JSON.stringify(proof, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(
    "Hosted private qualification passed: 12 pinned references, six 100-page near-limit checks, cold starts, idle stop/wake, concurrency, rejection, process deadline and temporary-file cleanup.",
  );
} catch (error) {
  proof.status = "failed";
  proof.failure = probeFailureMessage(error, probeToken);
  writeFileSync(values.proof, JSON.stringify(proof, null, 2) + "\n", {
    mode: 0o600,
  });
  console.error(
    "Hosted private qualification failed; inspect the private proof file. Do not enable Horizon.",
  );
  process.exitCode = 1;
}
