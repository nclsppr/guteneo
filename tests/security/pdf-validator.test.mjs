import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = new URL("../../", import.meta.url);
const validator = new URL("apps/pdf-validator/", root);
const source = readFileSync(new URL("src/handler.ts", validator), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { handleRequest, sanitizeResult } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
const sha256 = Buffer.from(
  await crypto.subtle.digest("SHA-256", bytes),
).toString("hex");
const payload = {
  sha256,
  profile: "ua1",
  engine: { name: "veraPDF", version: "1.30.2" },
  compliant: false,
  passedRules: 105,
  failedRules: 1,
  failedChecks: 1,
  truncated: false,
  findings: [
    {
      specification: "ISO 14289-1:2014",
      clause: "7.1",
      testNumber: 3,
      failedChecks: 1,
    },
  ],
};
function env(result = payload, status = 200) {
  return {
    PDF_VALIDATOR_CONTAINER: {
      getByName: () => ({
        fetch: async () => Response.json(result, { status }),
      }),
    },
  };
}
function request(path = "/validate?profile=ua1", body = bytes) {
  return new Request(`https://validator.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body,
  });
}

test("private validator Python report and process security suite passes", () => {
  const result = spawnSync(
    "python3",
    ["-B", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
    {
      cwd: validator,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("worker forwards exact bytes and returns only bounded technical findings", async () => {
  const privatePayload = structuredClone(payload);
  privatePayload.description = "private document";
  privatePayload.findings[0].context = "private location";
  const response = await handleRequest(request(), env(privatePayload));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("worker rejects wrong byte hash, profile, version, count, duplicate, and arbitrary clauses", () => {
  const variants = [
    { sha256: "b".repeat(64) },
    { profile: "2b" },
    { engine: { name: "veraPDF", version: "1.31.0" } },
    { passedRules: 0 },
    { compliant: true },
    { failedChecks: 0 },
    { truncated: true },
    { findings: [{ ...payload.findings[0], clause: "private content" }] },
    {
      findings: [{ ...payload.findings[0], specification: "private content" }],
    },
    { findings: [{ ...payload.findings[0], failedChecks: 2 }] },
  ];
  for (const change of variants)
    assert.throws(() =>
      sanitizeResult({ ...payload, ...change }, sha256, "ua1"),
    );
});

test("worker refuses unsupported profile, duplicate or URL parameters and wrong media", async () => {
  for (const path of [
    "/validate?profile=unknown",
    "/validate?profile=ua1&profile=ua2",
    "/validate?profile=ua1&url=https://example.org",
  ]) {
    assert.equal((await handleRequest(request(path), env())).status, 400);
  }
  const wrongType = request();
  wrongType.headers.set("Content-Type", "text/plain");
  assert.equal((await handleRequest(wrongType, env())).status, 415);
});

test("worker independently bounds declared and streamed input", async () => {
  const tooLarge = request();
  tooLarge.headers.set("Content-Length", String(10 * 1024 * 1024 + 1));
  assert.equal((await handleRequest(tooLarge, env())).status, 413);
  assert.equal(
    (
      await handleRequest(
        request("/validate?profile=ua1", new Uint8Array(10 * 1024 * 1024 + 1)),
        env(),
      )
    ).status,
    413,
  );
});

test("worker rejects empty and over-fragmented request streams before engine access", async () => {
  for (const empty of [false, true]) {
    let reads = 0;
    let called = false;
    const body = new ReadableStream({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(empty ? 0 : 1));
      },
    });
    const response = await handleRequest(
      new Request("https://validator.internal/validate?profile=ua1", {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body,
        duplex: "half",
      }),
      {
        PDF_VALIDATOR_CONTAINER: {
          getByName() {
            called = true;
            throw new Error("Engine must not receive invalid framing");
          },
        },
      },
    );
    assert.equal(response.status, 503);
    assert.equal(called, false);
    assert.ok(reads <= (empty ? 2 : 4098));
  }
});

test("worker independently bounds response stream fragmentation", async () => {
  let reads = 0;
  const response = await handleRequest(request(), {
    PDF_VALIDATOR_CONTAINER: {
      getByName: () => ({
        fetch: async () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                reads += 1;
                controller.enqueue(new Uint8Array([32]));
              },
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      }),
    },
  });
  assert.equal(response.status, 503);
  assert.ok(reads <= 4098);
});

test("UA2 includes fixed tag relationship rules and complete profile totals", () => {
  const result = {
    ...payload,
    profile: "ua2",
    passedRules: 1726,
    findings: [
      {
        specification: "ISO 32005:2023",
        clause: "Table 5. Annot-Aside",
        testNumber: 1,
        failedChecks: 1,
      },
    ],
  };
  assert.deepEqual(sanitizeResult(result, sha256, "ua2"), result);
  assert.throws(() =>
    sanitizeResult({ ...result, passedRules: 105 }, sha256, "ua2"),
  );
});

test("health verifies the pinned engine and removes private response fields", async () => {
  const response = await handleRequest(
    new Request("https://validator.internal/health"),
    env({
      status: "ready",
      engine: payload.engine,
      private: "private details",
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ready",
    engine: payload.engine,
  });
  const unavailable = await handleRequest(
    new Request("https://validator.internal/health"),
    env({ status: "ready", engine: { name: "veraPDF", version: "1.31.0" } }),
  );
  assert.equal(unavailable.status, 503);
});

test("private errors retain only known fixed codes", async () => {
  for (const code of [
    "VALIDATOR_BUSY",
    "VALIDATION_TIMEOUT",
    "VALIDATION_INCOMPLETE",
  ]) {
    const response = await handleRequest(
      request(),
      env({ code, private: "private error" }, 503),
    );
    assert.deepEqual(await response.json(), { code });
  }
  const response = await handleRequest(
    request(),
    env({ code: "private error" }, 503),
  );
  assert.deepEqual(await response.json(), { code: "VALIDATOR_UNAVAILABLE" });
});

test("deployment contract is private, bounded, offline and pinned", () => {
  const { config, error } = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    readFileSync(new URL("wrangler.jsonc", validator), "utf8"),
  );
  assert.equal(error, undefined);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.equal(config.observability.enabled, false);
  assert.equal(config.containers[0].max_instances, 1);
  assert.equal(config.containers[0].constraints.jurisdiction, "eu");
  assert.match(
    readFileSync(new URL("src/index.ts", validator), "utf8"),
    /enableInternet = false/,
  );
  const docker = readFileSync(new URL("Dockerfile", validator), "utf8");
  assert.match(
    docker,
    /FROM eclipse-temurin:21-jre-alpine@sha256:[a-f0-9]{64}/,
  );
  assert.match(docker, /sha256sum -c/);
  assert.match(docker, /test "\$VERAPDF_VERSION" = "1\.30\.2"/);
  assert.match(docker, /USER validator/);
  assert.doesNotMatch(docker, /:latest/);
});
