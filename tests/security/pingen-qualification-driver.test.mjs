import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  run,
  filtered,
  DRIVER_MESSAGES,
} from "../../scripts/qualify-pingen-draft.mjs";

const result = {
  provider: "pingen",
  mode: "synthetic_draft_qualification",
  status: "ok",
  state: "created",
  runId: "20260917-synthetic-v1",
  sourceSha256:
    "ee8217b869d6e552df3582ea2f886e4c7889964000ef26c975424ece5ba53385",
};

test("rejects extra input before creating any connection", async () => {
  let connections = 0;
  await assert.rejects(
    run(["--create-synthetic-draft", "arbitrary.pdf"], {
      connect() {
        connections++;
      },
    }),
  );
  assert.equal(connections, 0);
});
test("uses a dedicated private remote binding without local env files or persistence", async () => {
  let disposed = false;
  let seen;
  const output = [];
  const code = await run(["--create-synthetic-draft"], {
    output: (text) => output.push(text),
    connect: async (options) => {
      assert.match(options.configPath, /qualify-pingen-draft\.jsonc$/);
      assert.deepEqual(options.envFiles, []);
      assert.equal(options.persist, false);
      return {
        env: {
          PROVIDERS: {
            qualifyPingenSynthetic(input) {
              seen = input;
              return result;
            },
          },
        },
        dispose() {
          disposed = true;
        },
      };
    },
  });
  assert.equal(code, 0);
  assert.equal(disposed, true);
  assert.deepEqual(seen, { phase: "create" });
  assert.equal(JSON.parse(output[0]).canSend, false);
  const config = JSON.parse(
    (
      await readFile(
        new URL("../../scripts/qualify-pingen-draft.jsonc", import.meta.url),
        "utf8",
      )
    ).replace(/,\s*([}\]])/g, "$1"),
  );
  assert.equal(config.name, "guteneo-local-pingen-draft-qualification");
  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.routes, []);
  assert.equal(config.observability.enabled, false);
  assert.deepEqual(
    config.services.map(({ service, entrypoint, remote }) => ({
      service,
      entrypoint,
      remote,
    })),
    [
      {
        service: "guteneo-app",
        entrypoint: "ProviderInspection",
        remote: true,
      },
    ],
  );
});
test("connection timeout triggers no RPC and disposes a late proxy", async () => {
  let resolve;
  let calls = 0;
  let disposed = 0;
  const promise = new Promise((done) => {
    resolve = done;
  });
  await assert.rejects(
    run(["--create-synthetic-draft"], {
      connectionTimeoutMs: 10,
      connect: () => promise,
    }),
    (error) => error.code === "connection_timeout",
  );
  resolve({
    env: {
      PROVIDERS: {
        qualifyPingenSynthetic() {
          calls++;
        },
      },
    },
    dispose() {
      disposed++;
    },
  });
  await new Promise((done) => setImmediate(done));
  assert.equal(calls, 0);
  assert.equal(disposed, 1);
  assert.match(DRIVER_MESSAGES.connection_timeout, /aucune RPC/);
});
test("timeout after create invocation is unknown and never retries", async () => {
  let calls = 0;
  let disposed = 0;
  const output = [];
  await assert.rejects(
    run(["--create-synthetic-draft"], {
      output: (text) => output.push(text),
      operationTimeoutMs: 10,
      connect: async () => ({
        env: {
          PROVIDERS: {
            qualifyPingenSynthetic() {
              calls++;
              return new Promise(() => {});
            },
          },
        },
        dispose() {
          disposed++;
        },
      }),
    }),
    (error) => error.code === "create_timeout",
  );
  assert.equal(calls, 1);
  assert.equal(disposed, 1);
  assert.deepEqual(output, []);
  assert.match(DRIVER_MESSAGES.create_timeout, /--inspect-created/);
  assert.match(DRIVER_MESSAGES.create_timeout, /Ne pas relancer/);
});
test("an RPC exception containing a secret becomes only a fixed error code", async () => {
  await assert.rejects(
    run(["--create-synthetic-draft"], {
      connect: async () => ({
        env: {
          PROVIDERS: {
            qualifyPingenSynthetic() {
              throw new Error(
                "SECRET_TOKEN=https://signed.invalid/?signature=PRIVATE",
              );
            },
          },
        },
        dispose() {},
      }),
    }),
    (error) =>
      error.code === "create_failed" && !error.message.includes("SECRET"),
  );
});
test("filters unexpected properties, strings and links even from a stale RPC", () => {
  const value = filtered({
    ...result,
    secret: "SECRET",
    providerId: "PRIVATE",
    url: "https://signed.invalid",
    price: { currency: "EUR", minor: 123, secret: "SECRET" },
    error: { code: "http_error", httpStatus: 409, body: "PRIVATE" },
    draft: {
      pages: "PRIVATE",
      addressMatches: "PRIVATE",
      address: "PRIVATE",
      previewRedirectObserved: true,
      location: "SECRET",
    },
  });
  assert.doesNotMatch(JSON.stringify(value), /PRIVATE|SECRET|https:/);
  assert.equal(value.draft.pages, null);
  assert.equal(value.draft.addressMatches, false);
  assert.deepEqual(value.price, { currency: "EUR", minor: 123 });
});

test("rejects a different source/run instead of reporting stale proof", () => {
  assert.throws(() => filtered({ ...result, sourceSha256: "0".repeat(64) }));
  assert.throws(() => filtered({ ...result, runId: "other" }));
});
