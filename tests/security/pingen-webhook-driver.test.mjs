import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  run,
  filtered,
  DRIVER_MESSAGES,
} from "../../scripts/setup-pingen-webhooks.mjs";

const result = {
  provider: "pingen",
  environment: "production",
  mode: "webhook_setup",
  action: "inspect",
  status: "ok",
  secretPresent: true,
  secretValid: true,
  listComplete: true,
  categories: Object.fromEntries(
    ["issues", "sent", "undeliverable", "delivered"].map((category) => [
      category,
      { configuration: "matched", journal: "registered" },
    ]),
  ),
};

test("rejects arbitrary categories, URLs, extra flags and secrets before connecting", async () => {
  for (const args of [
    ["--register"],
    ["--register", "all"],
    ["--register", "channel_subscriptions"],
    ["--inspect", "https://external.invalid"],
    ["--register", "sent", "secret"],
  ]) {
    let connections = 0;
    await assert.rejects(
      run(args, {
        connect() {
          connections++;
        },
      }),
    );
    assert.equal(connections, 0);
  }
});

test("uses the private binding with exactly one explicit registration and no local credentials", async () => {
  let calls = 0,
    disposed = 0;
  const output = [];
  const code = await run(["--register", "issues"], {
    output: (text) => output.push(text),
    connect: async (options) => {
      assert.match(options.configPath, /setup-pingen-webhooks\.jsonc$/);
      assert.deepEqual(options.envFiles, []);
      assert.equal(options.persist, false);
      return {
        env: {
          PROVIDERS: {
            configurePingenWebhooks(input) {
              calls++;
              assert.deepEqual(input, {
                action: "register",
                category: "issues",
              });
              return { ...result, action: "register" };
            },
          },
        },
        dispose() {
          disposed++;
        },
      };
    },
  });
  assert.equal(code, 0);
  assert.equal(calls, 1);
  assert.equal(disposed, 1);
  assert.equal(JSON.parse(output[0]).notificationsVerified, false);
  const config = JSON.parse(
    (
      await readFile(
        new URL("../../scripts/setup-pingen-webhooks.jsonc", import.meta.url),
        "utf8",
      )
    ).replace(/,\s*([}\]])/g, "$1"),
  );
  assert.equal(config.name, "guteneo-local-pingen-webhook-setup");
  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.routes, []);
  assert.equal(config.observability.enabled, false);
  assert.deepEqual(config.services, [
    {
      binding: "PROVIDERS",
      service: "guteneo-app",
      entrypoint: "ProviderInspection",
      remote: true,
    },
  ]);
});

test("connection timeout never triggers a registration, including after a late connection", async () => {
  let resolve,
    calls = 0,
    disposed = 0;
  const connection = new Promise((done) => {
    resolve = done;
  });
  await assert.rejects(
    run(["--register", "sent"], {
      connect: () => connection,
      connectionTimeoutMs: 10,
    }),
    (error) => error.code === "connection_timeout",
  );
  resolve({
    env: {
      PROVIDERS: {
        configurePingenWebhooks() {
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
});

test("a lost registration result stays unknown and never retries", async () => {
  let calls = 0,
    disposed = 0;
  const output = [];
  await assert.rejects(
    run(["--register", "sent"], {
      output: (text) => output.push(text),
      operationTimeoutMs: 10,
      connect: async () => ({
        env: {
          PROVIDERS: {
            configurePingenWebhooks() {
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
    (error) => error.code === "registration_timeout",
  );
  assert.equal(calls, 1);
  assert.equal(disposed, 1);
  assert.deepEqual(output, []);
  assert.match(DRIVER_MESSAGES.registration_timeout, /Ne pas relancer/);
  assert.match(DRIVER_MESSAGES.registration_timeout, /--inspect/);
});

test("secrets and arbitrary provider messages are removed even from faulty RPC results", () => {
  const raw = {
    ...result,
    signing_key: "PRIVATE",
    token: "SECRET",
    id: "PRIVATE",
    categories: {
      ...result.categories,
      sent: {
        configuration: "matched",
        journal: "registered",
        signing_key: "PRIVATE",
      },
    },
    error: { code: "http_error", httpStatus: 403, message: "SECRET" },
    notificationsVerified: true,
    canSend: true,
  };
  const clean = filtered(raw, "inspect");
  assert.doesNotMatch(JSON.stringify(clean), /PRIVATE|SECRET/);
  assert.deepEqual(clean.error, { code: "http_error", httpStatus: 403 });
  assert.equal(clean.canSend, false);
  assert.equal(clean.notificationsVerified, false);
  assert.throws(() => filtered({ ...result, mode: "other" }, "inspect"));
  assert.throws(() => filtered(result, "register"));
  assert.throws(() =>
    filtered(
      {
        ...result,
        categories: {
          ...result.categories,
          issues: { configuration: "SECRET", journal: "none" },
        },
      },
      "inspect",
    ),
  );
});

test("exceptions containing credentials become a fixed failure with no output", async () => {
  const output = [];
  await assert.rejects(
    run(["--inspect"], {
      output: (text) => output.push(text),
      connect: async () => ({
        env: {
          PROVIDERS: {
            configurePingenWebhooks() {
              throw new Error("SECRET https://signed.invalid");
            },
          },
        },
        dispose() {},
      }),
    }),
    (error) =>
      error.code === "inspection_failed" && !error.message.includes("SECRET"),
  );
  assert.deepEqual(output, []);
});
