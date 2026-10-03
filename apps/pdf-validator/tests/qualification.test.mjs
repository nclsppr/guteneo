import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  ENGINE,
  loadReferenceCorpus,
  loadBenchmarkCorpus,
  assertReferenceResult,
} from "../scripts/reference-corpus.mjs";

function compile(path, replace = (value) => value) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(replace(compiled)).toString("base64")}`
  );
}
const { default: bridge } = await compile("../qualification/worker.ts");
const probeToken = "a".repeat(64);
const probeHeaders = { "X-Horizon-Qualification-Token": probeToken };
const { ValidatorQualification } = await compile(
  "../src/qualification.ts",
  (source) =>
    source.replace(
      'import { WorkerEntrypoint } from "cloudflare:workers";',
      "class WorkerEntrypoint { constructor(env) { this.env = env; } }",
    ),
);

test("official reference corpus pins all six positive and negative profiles and sanitized local evidence", () => {
  const fixtures = loadReferenceCorpus();
  assert.equal(fixtures.length, 12);
  const proof = JSON.parse(
    readFileSync(
      new URL("references/local-cli-proof.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(proof.kind, "local-official-reference-cli");
  assert.equal(proof.engine.version, ENGINE.version);
  assert.equal(proof.fixtures.length, fixtures.length);
  const docker = JSON.parse(
    readFileSync(
      new URL("references/local-docker-proof.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(docker.runtimeNetwork, "none");
  assert.equal(docker.readOnlyRoot, true);
  assert.equal(docker.temporaryFilesRemaining, 0);
  assert.equal(docker.containerLogsEmpty, true);
  assert.deepEqual(
    docker.concurrency.map((result) => result.status).sort(),
    [200, 503],
  );
  assert.deepEqual(docker.syntheticProcessDeadline, {
    code: "VALIDATION_TIMEOUT",
    temporaryDirectories: 0,
  });
  for (const fixture of fixtures) {
    const observed = proof.fixtures.find((item) => item.id === fixture.id);
    const result = {
      ...fixture.profiles[0],
      sha256: observed.sha256,
      engine: ENGINE,
      truncated: false,
    };
    assertReferenceResult(result, fixture, fixture.profiles[0]);
    for (const key of [
      "compliant",
      "passedRules",
      "failedRules",
      "failedChecks",
      "findings",
    ])
      assert.deepEqual(observed[key], fixture.profiles[0][key]);
    const containerResult = docker.references.find(
      (item) => item.id === fixture.id,
    );
    const sanitizedContainerResult = { ...containerResult };
    delete sanitizedContainerResult.id;
    assertReferenceResult(
      sanitizedContainerResult,
      fixture,
      fixture.profiles[0],
    );
    assert.throws(() =>
      assertReferenceResult(
        { ...result, compliant: !result.compliant },
        fixture,
        fixture.profiles[0],
      ),
    );
    assert.throws(() =>
      assertReferenceResult(
        { ...result, sha256: "f".repeat(64) },
        fixture,
        fixture.profiles[0],
      ),
    );
    assert.throws(() =>
      assertReferenceResult(
        { ...result, extractedText: "private" },
        fixture,
        fixture.profiles[0],
      ),
    );
  }
});

test("near-limit benchmark regenerates 100-page non-customer bytes and pins six real complete profile results", () => {
  const [fixture] = loadBenchmarkCorpus();
  assert.equal(fixture.pageCount, 100);
  assert.equal(fixture.sizeBytes, 10366823);
  const proof = JSON.parse(
    readFileSync(
      new URL("benchmark-fixtures/local-cli-proof.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(proof.results.length, 6);
  for (const expected of fixture.profiles) {
    const observed = proof.results.find(
      (item) => item.profile === expected.profile,
    );
    assert.equal(observed.sha256, fixture.sha256);
    assert.equal(
      observed.passedRules + observed.failedRules,
      expected.passedRules + expected.failedRules,
    );
    assert.equal(observed.compliant, false);
    const technicalResult = { ...observed };
    delete technicalResult.exitCode;
    delete technicalResult.seconds;
    assertReferenceResult(technicalResult, fixture, expected);
  }
});

test("economic basic qualification retains exact profile results under its real CPU/RAM limits", () => {
  const base = new URL("benchmark-fixtures/", import.meta.url);
  const summary = JSON.parse(
    readFileSync(new URL("local-resource-proof.json", base), "utf8"),
  );
  assert.equal(summary.hosted, false);
  assert.deepEqual(summary.candidate, {
    instanceType: "basic",
    idleSeconds: 5,
    javaHeapMiB: 384,
  });
  const fixtures = [...loadReferenceCorpus(), ...loadBenchmarkCorpus()];
  for (const run of summary.runs) {
    const bytes = readFileSync(new URL(run.proofFile, base));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      run.proofSha256,
    );
    const proof = JSON.parse(bytes.toString("utf8"));
    assert.equal(proof.references.length, 18);
    assert.equal(proof.temporaryFilesRemaining, 0);
    assert.equal(proof.containerLogsEmpty, true);
    assert.equal(proof.resourceLimits.swapDisabled, true);
    assert.equal(
      proof.resourceLimits.cpu,
      run.instanceType === "basic" ? 0.25 : 0.5,
    );
    assert.equal(
      proof.resourceLimits.memoryBytes,
      (run.instanceType === "basic" ? 1 : 4) * 1024 ** 3,
    );
    for (const observed of proof.references) {
      const fixture = fixtures.find((item) => item.id === observed.id);
      const expected = fixture.profiles.find(
        (item) => item.profile === observed.profile,
      );
      const technicalResult = { ...observed };
      for (const key of ["id", "milliseconds", "cpuMicroseconds"])
        delete technicalResult[key];
      assertReferenceResult(technicalResult, fixture, expected);
      assert.ok(observed.milliseconds < 40000);
    }
  }
});

test("qualification bridge rejects every non-loopback destination and arbitrary path before private bindings", async () => {
  let calls = 0;
  const env = {
    HORIZON_QUALIFICATION_TOKEN: probeToken,
    PDF_VALIDATOR: {
      fetch: () => {
        calls++;
        throw new Error("must not call");
      },
    },
  };
  for (const origin of [
    "https://guteneo.com",
    "http://0.0.0.0",
    "http://127.0.0.2",
    "http://localhost.attacker.example",
  ])
    assert.equal(
      (
        await bridge.fetch(
          new Request(`${origin}/health`, { headers: probeHeaders }),
          env,
        )
      ).status,
      403,
    );
  assert.equal(
    (
      await bridge.fetch(
        new Request("http://127.0.0.1:8891/arbitrary", {
          headers: probeHeaders,
        }),
        env,
      )
    ).status,
    404,
  );
  assert.equal(calls, 0);
});

test("every local probe route requires the configured per-run credential before any binding access", async () => {
  let calls = 0;
  const routes = [
    ["GET", "/release"],
    ["GET", "/state"],
    ["GET", "/privacy"],
    ["POST", "/stop"],
    ["POST", "/process-deadline"],
    ["GET", "/health"],
    ["POST", "/validate?profile=ua1"],
    ["GET", "/arbitrary"],
  ];
  function environment(token) {
    return Object.defineProperties(
      { HORIZON_QUALIFICATION_TOKEN: token },
      {
        PDF_VALIDATOR: {
          get() {
            calls++;
            throw new Error("must not access");
          },
        },
        QUALIFICATION: {
          get() {
            calls++;
            throw new Error("must not access");
          },
        },
      },
    );
  }
  const cases = [
    [undefined, probeHeaders],
    ["", probeHeaders],
    ["malformed", probeHeaders],
    [probeToken, {}],
    [probeToken, { "X-Horizon-Qualification-Token": "b".repeat(64) }],
    [probeToken, { "X-Horizon-Qualification-Token": "malformed" }],
  ];
  for (const [method, path] of routes) {
    for (const [configured, headers] of cases) {
      const response = await bridge.fetch(
        new Request(`http://127.0.0.1:8891${path}`, {
          method,
          headers,
        }),
        environment(configured),
      );
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        code: "LOCAL_PROBE_UNAUTHORIZED",
      });
    }
    // Even a browser that somehow acquired a valid credential is never a
    // permitted caller. This includes same-loopback, opaque and empty Origin.
    for (const origin of [
      "https://attacker.example",
      "http://127.0.0.1:8891",
      "null",
      "",
    ]) {
      const response = await bridge.fetch(
        new Request(`http://127.0.0.1:8891${path}`, {
          method,
          headers: { ...probeHeaders, Origin: origin },
        }),
        environment(probeToken),
      );
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        code: "LOCAL_PROBE_ORIGIN_FORBIDDEN",
      });
    }
  }
  assert.equal(calls, 0);
});

test("authenticated CLI probe can call private RPC without browser-origin permission", async () => {
  let calls = 0;
  const response = await bridge.fetch(
    new Request("http://127.0.0.1:8891/stop", {
      method: "POST",
      headers: probeHeaders,
    }),
    {
      HORIZON_QUALIFICATION_TOKEN: probeToken,
      QUALIFICATION: {
        stop: async () => {
          calls++;
          return { status: "stopped" };
        },
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "stopped" });
  assert.equal(calls, 1);
});

test("local bridge targets only the fixed private validator with unchanged diagnostic bytes", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 45]);
  const response = await bridge.fetch(
    new Request("http://127.0.0.1:8891/validate?profile=ua1", {
      method: "POST",
      body: bytes,
      headers: { "Content-Type": "application/pdf", ...probeHeaders },
    }),
    {
      HORIZON_QUALIFICATION_TOKEN: probeToken,
      PDF_VALIDATOR: {
        fetch: async (request) => {
          assert.equal(
            request.url,
            "https://validator.internal/validate?profile=ua1",
          );
          assert.equal(
            request.headers.has("X-Horizon-Qualification-Token"),
            false,
          );
          assert.equal(request.headers.get("Content-Type"), "application/pdf");
          assert.deepEqual(new Uint8Array(await request.arrayBuffer()), bytes);
          return Response.json({ code: "VALIDATOR_BUSY" }, { status: 503 });
        },
      },
    },
  );
  assert.deepEqual(await response.json(), { code: "VALIDATOR_BUSY" });
});

test("qualification RPC is disabled by default before any container access or stop", async () => {
  let calls = 0;
  for (const flag of [undefined, "false", "TRUE", "1"]) {
    const qualification = new ValidatorQualification({
      QUALIFICATION_ENABLED: flag,
      PDF_VALIDATOR_CONTAINER: {
        getByName: () => {
          calls++;
          throw new Error("must not call");
        },
      },
    });
    for (const method of [
      "release",
      "state",
      "stop",
      "privacy",
      "processDeadline",
    ])
      await assert.rejects(qualification[method](), /QUALIFICATION_DISABLED/);
  }
  assert.equal(calls, 0);
});

test("qualification RPC exposes bounded state/counts and never container metadata or paths", async () => {
  let stops = 0;
  const qualification = new ValidatorQualification({
    QUALIFICATION_ENABLED: "true",
    PDF_VALIDATOR_CONTAINER: {
      getByName: (name) => {
        assert.equal(name, "pdf-validator-v1");
        return {
          getState: async () => ({
            status: "stopped",
            exitCode: 99,
            secret: "private",
          }),
          stop: async () => {
            stops++;
          },
          fetch: async (request) =>
            Response.json(
              request.url.endsWith("process-deadline")
                ? {
                    code: "VALIDATION_TIMEOUT",
                    temporaryDirectories: 0,
                    path: "private",
                  }
                : { temporaryDirectories: 0, path: "private" },
            ),
        };
      },
    },
  });
  assert.deepEqual(await qualification.state(), { status: "stopped" });
  assert.deepEqual(await qualification.stop(), { status: "stopped" });
  assert.equal(stops, 1);
  assert.deepEqual(await qualification.privacy(), { temporaryDirectories: 0 });
  assert.deepEqual(await qualification.processDeadline(), {
    code: "VALIDATION_TIMEOUT",
    temporaryDirectories: 0,
  });
});

test("private qualification observes the actual source/version metadata instead of trusting supplied proof labels", async () => {
  const env = {
    QUALIFICATION_ENABLED: "true",
    SOURCE_COMMIT: "a".repeat(40),
    CF_VERSION_METADATA: { id: "12345678-1234-1234-1234-123456789abc" },
  };
  assert.deepEqual(await new ValidatorQualification(env).release(), {
    sourceCommit: env.SOURCE_COMMIT,
    workerVersion: env.CF_VERSION_METADATA.id,
  });
  for (const change of [
    { SOURCE_COMMIT: "" },
    { CF_VERSION_METADATA: undefined },
    { CF_VERSION_METADATA: { id: "invalid" } },
  ])
    await assert.rejects(
      new ValidatorQualification({ ...env, ...change }).release(),
      /QUALIFICATION_INVALID_RELEASE/,
    );
});

test("probe config uses the explicit production account, authenticated remote bindings and no public routes", () => {
  const { config, error } = ts.parseConfigFileTextToJson(
    "qualification/wrangler.jsonc",
    readFileSync(
      new URL("../qualification/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(error, undefined);
  assert.equal(config.account_id, "39ac9fada6cba44d9ecf09d467609e69");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.observability.enabled, false);
  assert.deepEqual(config.routes, []);
  assert.equal(config.dev.ip, "127.0.0.1");
  for (const binding of config.services) {
    assert.equal(binding.service, "guteneo-pdf-validator");
    assert.equal(binding.remote, true);
  }
  assert.equal(
    config.services.find((binding) => binding.binding === "QUALIFICATION")
      .entrypoint,
    "ValidatorQualification",
  );
});
