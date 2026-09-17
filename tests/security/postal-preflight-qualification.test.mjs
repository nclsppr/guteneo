import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  main,
  EXPECTED_PREFLIGHT_VERSION,
  privateJson,
  qualifyPostalPreflight,
  summarizeReport,
} from "../../scripts/qualify-postal-preflight.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixtures = {
  clean: new TextEncoder().encode("%PDF-1.7\n" + "fixture".repeat(30)),
  corner: new TextEncoder().encode("%PDF-1.7\ncorner"),
};
const expectedAddress = [
  "ATELIER EXEMPLE",
  "Rue du Test 12",
  "L-1234 LUXEMBOURG",
];
function harness(scanOverride, preflightVersion = EXPECTED_PREFLIGHT_VERSION) {
  const calls = [];
  const env = {
    SCANNER: {
      async fetch(url, request) {
        calls.push({
          service: "scanner",
          path: new URL(url).pathname,
          request,
        });
        if (new URL(url).pathname === "/health")
          return Response.json({ status: "ready" });
        return Response.json(
          scanOverride ?? { verdict: "clean", sha256: digest(request.body) },
        );
      },
    },
    DOCUMENT_RENDERER: {
      async fetch(url, request) {
        calls.push({
          service: "renderer",
          path: new URL(url).pathname,
          request,
        });
        const mismatch =
          request.headers["X-Guteneo-Source-Sha256"] !== digest(request.body);
        const corner = request.body === fixtures.corner;
        const invalid = request.body.length === 64;
        return Response.json({
          version: preflightVersion,
          status: mismatch || corner || invalid ? "blocked" : "review_required",
          canSend: false,
          sha256: invalid ? null : digest(request.body),
          issues: mismatch
            ? [{ code: "POSTAL_RENDER_HASH_MISMATCH" }]
            : corner
              ? [{ code: "POSTAL_CORNER_CONTENT", page: 2 }]
              : invalid
                ? [{ code: "POSTAL_PDF_INVALID" }]
                : [],
          rendering: {
            dpi: 144,
            complete: !mismatch && !invalid,
            pages:
              mismatch || invalid
                ? []
                : [1, 2].map((page) => ({
                    page,
                    width: 1191,
                    height: 1684,
                    rasterSha256: "a".repeat(64),
                  })),
          },
          address: {
            lines: expectedAddress,
            crop: { pngBase64: "iVBORsynthetic" },
          },
          requiredReviews: ["printed_recipient_matches"],
        });
      },
    },
  };
  return { calls, env };
}
test("remote configuration has only private scanner and renderer capabilities", () => {
  const config = JSON.parse(
    readFileSync(
      new URL("../../scripts/qualify-postal-preflight.jsonc", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    Object.keys(config).sort(),
    [
      "$schema",
      "name",
      "account_id",
      "compatibility_date",
      "workers_dev",
      "preview_urls",
      "routes",
      "services",
      "observability",
    ].sort(),
  );
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.deepEqual(config.services, [
    { binding: "SCANNER", service: "guteneo-scanner", remote: true },
    {
      binding: "DOCUMENT_RENDERER",
      service: "guteneo-documents",
      remote: true,
    },
  ]);
});
test("bounded named cases call scanner before exact-byte rendering and never a provider", async () => {
  const { env, calls } = harness();
  const result = await qualifyPostalPreflight(env, fixtures);
  assert.equal(result.passed, true);
  assert.equal(result.canSend, false);
  assert.equal(result.scanRequests, 3);
  assert.equal(result.renderRequests, 4);
  assert.equal(calls.length, 8);
  assert.ok(calls.every((call) => call.request.redirect === "manual"));
  assert.deepEqual(
    calls.map((call) => call.path),
    [
      "/health",
      "/scan",
      "/preflight/pingen",
      "/scan",
      "/preflight/pingen",
      "/preflight/pingen",
      "/scan",
      "/preflight/pingen",
    ],
  );
  assert.equal(calls[1].request.body, calls[2].request.body);
  assert.equal(calls[3].request.body, calls[4].request.body);
  assert.equal(calls[6].request.body, calls[7].request.body);
  assert.equal(
    calls[2].request.headers["X-Guteneo-Scan-Sha256"],
    digest(fixtures.clean),
  );
});
test("qualification version follows the shipped contract and rejects a complete legacy renderer", async () => {
  const contract = readFileSync(
    new URL(
      "../../packages/contracts/src/pingen-preflight.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    contract.match(/export const PINGEN_PREFLIGHT_VERSION = "([^"]+)"/)?.[1],
    EXPECTED_PREFLIGHT_VERSION,
  );
  for (const version of [
    "pingen-2026-09-17-v1",
    null,
    "UNTRUSTED-VERSION-MUST-NOT-PRINT",
  ]) {
    const { env } = harness(undefined, version);
    const result = await qualifyPostalPreflight(env, fixtures);
    assert.equal(result.passed, false);
    assert.equal(result.expectedPreflightVersion, EXPECTED_PREFLIGHT_VERSION);
    assert.ok(
      result.cases.every(
        (item) =>
          item.preflightVersion === "unexpected" && item.passed === false,
      ),
    );
    assert.equal(JSON.stringify(result).includes("UNTRUSTED-VERSION"), false);
  }
});
test("scan mismatch, infection or malformed verdict never reaches renderer", async () => {
  for (const scan of [
    { verdict: "clean", sha256: "f".repeat(64) },
    { verdict: "infected", sha256: digest(fixtures.clean) },
    { verdict: "unknown" },
  ]) {
    const { env, calls } = harness(scan);
    await assert.rejects(
      qualifyPostalPreflight(env, fixtures),
      /QUALIFICATION_EXACT_SCAN_REQUIRED/,
    );
    assert.equal(calls.filter((call) => call.service === "renderer").length, 0);
  }
});
test("summaries omit untrusted text, hashes, crops, URLs and arbitrary issue strings", () => {
  const privateMarker = "PRIVATE-MUST-NEVER-PRINT";
  const result = summarizeReport(
    "clean_two_pages",
    {
      status: 200,
      body: {
        version: privateMarker,
        status: privateMarker,
        canSend: privateMarker,
        sha256: privateMarker,
        rendering: {
          dpi: privateMarker,
          complete: false,
          pages: [
            {
              page: privateMarker,
              width: privateMarker,
              height: privateMarker,
              rasterSha256: privateMarker,
              url: privateMarker,
            },
          ],
        },
        issues: [
          { code: privateMarker, page: privateMarker, message: privateMarker },
        ],
        address: { lines: [privateMarker], crop: { pngBase64: privateMarker } },
        error: privateMarker,
        token: privateMarker,
        engine: privateMarker,
      },
    },
    "a".repeat(64),
  );
  assert.equal(JSON.stringify(result).includes(privateMarker), false);
  assert.deepEqual(result.issues, [{ code: "UNRECOGNIZED_ISSUE" }]);
});
test("raw transport error and cleanup error cannot appear in CLI output; proxy disposed", async () => {
  let disposed = false;
  const lines = [];
  const result = await main({
    fixtures: async () => fixtures,
    createProxy: async () => ({
      env: {
        SCANNER: {
          fetch() {
            throw new Error("PRIVATE-TOKEN");
          },
        },
      },
      dispose: async () => {
        disposed = true;
        throw new Error("PRIVATE-DISPOSAL");
      },
    }),
    output: (line) => lines.push(line),
  });
  assert.equal(result, 1);
  assert.equal(disposed, true);
  assert.equal(lines.join("").includes("PRIVATE"), false);
  assert.equal(JSON.parse(lines[0]).code, "QUALIFICATION_SCANNER_NOT_READY");
});
test("health attempts are bounded and failed health produces no body uploads", async () => {
  let calls = 0;
  await assert.rejects(
    qualifyPostalPreflight(
      {
        SCANNER: {
          async fetch(url, init) {
            calls++;
            assert.equal(new URL(url).pathname, "/health");
            assert.equal(init.body, undefined);
            return Response.json({ status: "unavailable" }, { status: 503 });
          },
        },
      },
      fixtures,
      { healthRetryDelayMs: 0 },
    ),
    /QUALIFICATION_SCANNER_NOT_READY/,
  );
  assert.equal(calls, 3);
});
test("a warming scanner is retried before any PDF upload and can become ready", async () => {
  const { env, calls } = harness();
  const originalFetch = env.SCANNER.fetch;
  let healthRequests = 0;
  env.SCANNER.fetch = async (url, request) => {
    if (new URL(url).pathname === "/health" && ++healthRequests <= 2) {
      calls.push({ service: "scanner", path: "/health", request });
      return Response.json({ status: "unavailable" }, { status: 503 });
    }
    return originalFetch(url, request);
  };
  const result = await qualifyPostalPreflight(env, fixtures, {
    healthRetryDelayMs: 0,
  });
  assert.equal(result.passed, true);
  assert.equal(result.healthRequests, 3);
  assert.deepEqual(
    calls.slice(0, 4).map((call) => call.path),
    ["/health", "/health", "/health", "/scan"],
  );
  assert.ok(calls.slice(0, 3).every((call) => call.request.body === undefined));
});
test("private reader rejects arbitrary routes, verbs, oversized and malformed responses", async () => {
  const forbidden = {
    fetch() {
      throw new Error("should not be reached");
    },
  };
  await assert.rejects(
    privateJson(forbidden, "/letters", { method: "POST" }),
    /QUALIFICATION_PATH_INVALID/,
  );
  await assert.rejects(
    privateJson(forbidden, "/scan", { method: "GET" }),
    /QUALIFICATION_PATH_INVALID/,
  );
  await assert.rejects(
    privateJson(
      { fetch: async () => new Response("x".repeat(100)) },
      "/health",
      {},
      { maximumBytes: 10 },
    ),
    /QUALIFICATION_RESPONSE_TOO_LARGE/,
  );
  await assert.rejects(
    privateJson(
      { fetch: async () => new Response("private invalid json") },
      "/health",
    ),
    /QUALIFICATION_RESPONSE_INVALID/,
  );
});
test("hung fetch and hung response stream terminate under the explicit deadline", async () => {
  await assert.rejects(
    privateJson(
      { fetch: () => new Promise(() => {}) },
      "/health",
      {},
      { timeoutMs: 5 },
    ),
    /QUALIFICATION_TIMEOUT/,
  );
  let cancelled = false;
  await assert.rejects(
    privateJson(
      {
        fetch: async () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
          ),
      },
      "/health",
      {},
      { timeoutMs: 5 },
    ),
    /QUALIFICATION_TIMEOUT/,
  );
  assert.equal(cancelled, true);
});
test(
  "setup deadlines stop stalled fixtures and dispose a late proxy without uploads",
  { timeout: 1_000 },
  async () => {
    for (const stalledStage of ["fixtures", "proxy"]) {
      const lines = [];
      let proxyCalls = 0;
      let releaseProxy;
      let finishDisposal;
      const initializing = new Promise((resolve) => {
        releaseProxy = resolve;
      });
      const disposed = new Promise((resolve) => {
        finishDisposal = resolve;
      });
      const { env, calls } = harness();
      const result = await main({
        fixtures: () =>
          stalledStage === "fixtures"
            ? new Promise(() => {})
            : Promise.resolve(fixtures),
        createProxy: (options) => {
          proxyCalls++;
          assert.equal(options.persist, false);
          assert.deepEqual(options.envFiles, []);
          return initializing;
        },
        output: (line) => lines.push(line),
        setupTimeoutMs: 5,
        cleanupTimeoutMs: 5,
      });
      assert.equal(result, 1);
      assert.deepEqual(
        lines.map((line) => JSON.parse(line)),
        [{ passed: false, code: "QUALIFICATION_TIMEOUT" }],
      );
      assert.equal(proxyCalls, stalledStage === "proxy" ? 1 : 0);
      if (stalledStage === "proxy") {
        releaseProxy({
          env,
          dispose: async () => {
            finishDisposal();
          },
        });
        await disposed;
      }
      assert.equal(calls.length, 0);
    }
  },
);
test(
  "qualification returns within its cleanup budget when proxy disposal never resolves",
  { timeout: 1_000 },
  async () => {
    const { env, calls } = harness();
    const lines = [];
    let disposeCalls = 0;
    const result = await main({
      fixtures: async () => fixtures,
      createProxy: async () => ({
        env,
        dispose: () => {
          disposeCalls++;
          return new Promise(() => {});
        },
      }),
      output: (line) => lines.push(line),
      setupTimeoutMs: 20,
      cleanupTimeoutMs: 5,
    });
    assert.equal(result, 0);
    assert.equal(disposeCalls, 1);
    assert.equal(calls.length, 8);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).passed, true);
  },
);

test("redirect is rejected without following or exposing Location", async () => {
  await assert.rejects(
    privateJson(
      {
        fetch: async () =>
          new Response(null, {
            status: 302,
            headers: { Location: "https://private.invalid/token" },
          }),
      },
      "/health",
    ),
    /QUALIFICATION_REDIRECT_FORBIDDEN/,
  );
});
