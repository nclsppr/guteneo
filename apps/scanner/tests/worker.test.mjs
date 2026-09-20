import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { handleRequest } from "../src/handler.ts";
import { scannerVersionHeader } from "../src/version-header.ts";
import scannerProbe from "./scanner-remote-probe.ts";
import { readFile } from "node:fs/promises";
import { parse } from "jsonc-parser";

const input = new TextEncoder().encode("%PDF-1.4 exact content");
const hash = createHash("sha256").update(input).digest("hex");
function environment(response, pathname = "/scan") {
  let calls = 0;
  return {
    env: {
      SCANNER_CONTAINER: {
        getByName(name) {
          assert.equal(name, "scanner-v1");
          return {
            async fetch(request) {
              calls++;
              assert.equal(new URL(request.url).pathname, pathname);
              if (pathname === "/scan")
                assert.deepEqual(
                  new Uint8Array(await request.arrayBuffer()),
                  input,
                );
              return response();
            },
          };
        },
      },
    },
    calls: () => calls,
  };
}
function pdfRequest(body = input, extraHeaders = {}) {
  return new Request("https://scanner.internal/scan", {
    method: "POST",
    headers: { "Content-Type": "application/pdf", ...extraHeaders },
    body,
  });
}

test("clean and infected verdicts require the exact forwarded byte hash", async () => {
  for (const verdict of ["clean", "infected"]) {
    const { env, calls } = environment(() =>
      Response.json({ sha256: hash, verdict, engine: { name: "ClamAV" } }),
    );
    const response = await handleRequest(pdfRequest(), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).verdict, verdict);
    assert.equal(calls(), 1);
  }
});

test("mismatched hashes and incomplete engine verdicts fail closed", async () => {
  for (const result of [
    { sha256: "wrong", verdict: "clean" },
    { sha256: hash, verdict: "not scanned" },
    { sha256: hash },
  ]) {
    const { env } = environment(() => Response.json(result));
    assert.equal((await handleRequest(pdfRequest(), env)).status, 503);
  }
});

test("upstream errors cannot release a quarantined document", async () => {
  const { env } = environment(() =>
    Response.json({ verdict: "error" }, { status: 503 }),
  );
  assert.equal((await handleRequest(pdfRequest(), env)).status, 503);
});

test("only fixed scanner failure codes cross the private boundary", async () => {
  for (const code of [
    "SCANNER_NOT_READY",
    "SCANNER_BUSY",
    "SIGNATURES_STALE",
    "SCAN_TIMEOUT",
    "SCAN_INCOMPLETE",
  ]) {
    const { env } = environment(() =>
      Response.json(
        { code, verdict: "clean", detail: "private finding or exception" },
        { status: 503 },
      ),
    );
    const response = await handleRequest(pdfRequest(), env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { verdict: "error", code });
  }
});

test("unknown, malformed and oversized scanner failures discard all details", async () => {
  const responses = [
    () => Response.json({ code: "PRIVATE_MALWARE_NAME" }, { status: 503 }),
    () => Response.json({ code: { secret: "private" } }, { status: 503 }),
    () => Response.json(null, { status: 503 }),
    () => Response.json(["SCANNER_BUSY"], { status: 503 }),
    () =>
      new Response('{"code":"SCANNER_BUSY"', {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    () => new Response('{"code":"SCANNER_BUSY"}', { status: 503 }),
    () =>
      Response.json(
        { code: "SCANNER_BUSY", detail: "private".repeat(1024) },
        { status: 503 },
      ),
  ];
  for (const result of responses) {
    const { env } = environment(result);
    const response = await handleRequest(pdfRequest(), env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      verdict: "error",
      code: "SCANNER_UNAVAILABLE",
    });
  }
});

test("health failures receive the same sanitized operational code", async () => {
  const { env } = environment(
    () =>
      Response.json(
        {
          status: "unavailable",
          code: "SCANNER_NOT_READY",
          detail: "private path",
        },
        { status: 503 },
      ),
    "/health",
  );
  const response = await handleRequest(
    new Request("https://scanner.internal/health"),
    env,
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    verdict: "error",
    code: "SCANNER_NOT_READY",
  });
});

test(
  "an incomplete error body cannot outlive cancellation during cleanup",
  { timeout: 1000 },
  async () => {
    const controller = new AbortController();
    let cancelled = false;
    const { env } = environment(
      () =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(
                new TextEncoder().encode('{"code":"SCANNER_BUSY"'),
              );
              setTimeout(() => controller.abort(), 5);
            },
            cancel() {
              cancelled = true;
              return new Promise(() => {});
            },
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    const response = await handleRequest(
      new Request(pdfRequest(), {
        signal: controller.signal,
      }),
      env,
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      verdict: "error",
      code: "SCAN_TIMEOUT",
    });
    assert.equal(cancelled, true);
  },
);

test("declared and actual size are bounded before starting compute", async () => {
  const { env, calls } = environment(() => {
    throw new Error("must not start");
  });
  assert.equal(
    (
      await handleRequest(
        pdfRequest(input, { "Content-Length": "10485761" }),
        env,
      )
    ).status,
    413,
  );
  assert.equal(
    (await handleRequest(pdfRequest(new Uint8Array(10485761)), env)).status,
    413,
  );
  assert.equal(calls(), 0);
});

test("empty bodies, wrong media types and unknown routes do not invoke ClamAV", async () => {
  const { env, calls } = environment(() => {
    throw new Error("must not start");
  });
  assert.equal(
    (await handleRequest(pdfRequest(new Uint8Array()), env)).status,
    400,
  );
  assert.equal(
    (
      await handleRequest(
        new Request("https://scanner.internal/scan", {
          method: "POST",
          body: input,
        }),
        env,
      )
    ).status,
    415,
  );
  assert.equal(
    (await handleRequest(new Request("https://scanner.internal/api"), env))
      .status,
    404,
  );
  assert.equal(calls(), 0);
});

test("oversized upstream JSON is rejected", async () => {
  const { env } = environment(() => new Response(" ".repeat(4097)));
  const response = await handleRequest(pdfRequest(), env);
  assert.notEqual(response.status, 200);
});

test("scanner qualification header uses only the executing Worker's valid metadata", async () => {
  const version = "C753AFC4-9310-4738-B3F2-5110F55F611E";
  for (const metadata of [
    undefined,
    {},
    { id: "private invalid value" },
    { id: version },
  ]) {
    const response = scannerVersionHeader(
      new Response("unchanged", {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "x-guteneo-worker-version": "untrusted upstream",
        },
      }),
      { WRANGLER_VERSION_METADATA: metadata },
    );
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "unchanged");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      response.headers.get("x-guteneo-worker-version"),
      metadata?.id === version ? version.toLowerCase() : null,
    );
  }
});

test("health and exact scan success relay only the actual container's validated image identity", async () => {
  const buildId = `sha-${"a".repeat(40)}-run-123456-attempt-1`;
  for (const pathname of ["/health", "/scan"]) {
    for (const value of [null, "private invalid identity", buildId]) {
      const payload =
        pathname === "/health"
          ? { status: "ready", engine: { name: "ClamAV" } }
          : { sha256: hash, verdict: "clean", engine: { name: "ClamAV" } };
      const { env } = environment(
        () =>
          Response.json(payload, {
            headers: value
              ? {
                  "x-guteneo-scanner-build-id": value,
                  "x-private-header": "private",
                }
              : {},
          }),
        pathname,
      );
      const request =
        pathname === "/health"
          ? new Request("https://scanner.internal/health")
          : pdfRequest();
      // The request cannot choose the build identity reported in the response.
      request.headers.set("x-guteneo-scanner-build-id", "forged");
      const response = await handleRequest(request, env);
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("x-guteneo-scanner-build-id"),
        value === buildId ? buildId : null,
      );
      assert.equal(response.headers.get("x-private-header"), null);
      assert.deepEqual(await response.json(), payload);
    }
  }
});

test("scanner-only bridge cannot reach document services or arbitrary remote paths", async () => {
  const calls = [];
  const env = {
    SCANNER: {
      async fetch(request) {
        calls.push({
          url: request.url,
          method: request.method,
          body: await request.text(),
        });
        return new Response("scanner fixture");
      },
    },
  };
  for (const [url, method, status] of [
    ["https://public.example/scanner/health", "GET", 403],
    ["http://127.0.0.1:8799/documents/validate", "POST", 404],
    ["http://127.0.0.1:8799/scanner/other", "GET", 404],
    ["http://127.0.0.1:8799/scanner/scan", "GET", 404],
    ["http://127.0.0.1:8799/scanner/health?path=scan", "GET", 404],
  ]) {
    const response = await scannerProbe.fetch(
      new Request(url, { method }),
      env,
    );
    assert.equal(response.status, status);
  }
  assert.equal(calls.length, 0);
  await scannerProbe.fetch(
    new Request("http://127.0.0.1:8799/scanner/health"),
    env,
  );
  await scannerProbe.fetch(
    new Request("http://127.0.0.1:8799/scanner/scan", {
      method: "POST",
      body: "synthetic",
    }),
    env,
  );
  assert.deepEqual(calls, [
    { url: "https://scanner.internal/health", method: "GET", body: "" },
    { url: "https://scanner.internal/scan", method: "POST", body: "synthetic" },
  ]);
});

test("scanner qualification configuration has no document or public binding", async () => {
  const errors = [];
  const config = parse(
    await readFile(
      new URL("./wrangler.scanner-remote.jsonc", import.meta.url),
      "utf8",
    ),
    errors,
    { allowTrailingComma: true },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(config.services, [
    { binding: "SCANNER", service: "guteneo-scanner", remote: true },
  ]);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.equal(config.observability.enabled, false);
  assert.deepEqual(config.dev, { ip: "127.0.0.1", port: 8799 });
});
