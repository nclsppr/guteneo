import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { productionStatus } from "../../scripts/production-status.mjs";

test("every hosted runtime persists explicit logs without automatic URL logs or traces", () => {
  for (const file of [
    "wrangler.live.jsonc",
    "wrangler.production.json.example",
    "wrangler.staging.json.example",
    "apps/documents/wrangler.live.jsonc",
  ]) {
    const parsed = ts.parseConfigFileTextToJson(
      file,
      readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"),
    );
    assert.equal(parsed.error, undefined, file);
    assert.deepEqual(
      parsed.config.observability,
      {
        enabled: true,
        head_sampling_rate: 1,
        redact_query_string: true,
        logs: { enabled: true, invocation_logs: false, persist: true },
        traces: { enabled: false, persist: false },
      },
      file,
    );
    assert.deepEqual(
      parsed.config.version_metadata,
      { binding: "WRANGLER_VERSION_METADATA" },
      file,
    );
    if (file.startsWith("apps/")) {
      assert.equal(parsed.config.workers_dev, false);
      assert.equal(parsed.config.preview_urls, false);
      assert.deepEqual(parsed.config.routes, []);
    }
  }
});

test("scanner persistence remains closed while its SDK can log raw proxy exceptions", () => {
  const file = "apps/scanner/wrangler.jsonc";
  const { config, error } = ts.parseConfigFileTextToJson(
    file,
    readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"),
  );
  assert.equal(error, undefined);
  assert.deepEqual(config.observability, { enabled: false });
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes, []);
  assert.deepEqual(config.version_metadata, {
    binding: "WRANGLER_VERSION_METADATA",
  });
});

test("the operator summary performs only three fixed anonymous reads and projects safe fields", async () => {
  const sentinel = "PRIVATE_TOKEN_EMAIL_PDF";
  const requests = [];
  const responses = [
    { status: "ok", mode: "production", liveSending: false, secret: sentinel },
    {
      mode: "production",
      liveSending: false,
      registration: { enabled: true },
      scanner: "connected",
      secret: sentinel,
    },
    {
      sourceCommit: "a".repeat(40),
      mode: "production",
      publicPreview: false,
      sourceDirty: false,
      secret: sentinel,
    },
  ];
  const result = await productionStatus(async (url, options) => {
    requests.push(url);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.deepEqual(options.headers, { Accept: "application/json" });
    return Response.json(responses.shift());
  });
  assert.deepEqual(requests, [
    "https://guteneo.com/api/health",
    "https://guteneo.com/api/capabilities",
    "https://guteneo.com/release.json",
  ]);
  assert.equal(result.status, "ok");
  assert.equal(result.liveSending, false);
  assert.equal(result.sourceCommit, "a".repeat(40));
  assert.equal(result.deliveryQualification, "not_checked");
  assert.ok(!JSON.stringify(result).includes(sentinel));
});

test("unreachable, preview, oversized, invalid or inconsistent responses fail the summary without exposing raw errors", async () => {
  for (const scenario of [
    "network",
    "preview",
    "oversized",
    "inconsistent",
    "invalid",
  ]) {
    let call = 0;
    const result = await productionStatus(async () => {
      const index = call++;
      if (scenario === "network") throw new Error("PRIVATE_PROVIDER_ERROR");
      if (scenario === "oversized") return new Response("x".repeat(65537));
      if (scenario === "invalid")
        return new Response("PRIVATE_BODY", { status: 503 });
      return Response.json(
        index === 0
          ? { status: "ok", mode: "production", liveSending: false }
          : index === 1
            ? {
                mode: "production",
                liveSending: scenario === "inconsistent",
                registration: { enabled: true },
                scanner: "connected",
              }
            : {
                sourceCommit: "a".repeat(40),
                mode: "production",
                publicPreview: scenario === "preview",
                sourceDirty: false,
              },
      );
    });
    assert.equal(result.status, "attention", scenario);
    assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  }
});
