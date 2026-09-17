import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { handleRequest } from "../src/handler.ts";

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
