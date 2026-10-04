import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize } from "node:path";
import {
  checkCloudAccess,
  createCurlTransport,
  main,
} from "../../scripts/codex-cloud-check.mjs";

const account = "a".repeat(32);
const cfKey = "fixture_cloudflare_secret";
const telnyxKey = "fixture_telnyx_secret";
const env = {
  CLOUDFLARE_ACCOUNT_ID: account,
  CLOUDFLARE_API_TOKEN: cfKey,
  TELNYX_API_KEY: telnyxKey,
};
const privateContent =
  "private_worker_name signed.example/?token=fictional_signature";
const find = (report, service) =>
  report.checks.find((item) => item.service === service);

function healthyTransport(calls = []) {
  return async (request) => {
    calls.push(request);
    assert.equal(request.method, "GET");
    assert.equal(request.redirect, "error");
    if (request.url.endsWith("/tokens/verify"))
      return {
        status: 200,
        body: JSON.stringify({
          success: true,
          errors: [],
          result: { status: "active", id: privateContent },
        }),
      };
    if (request.url.endsWith("/script-settings"))
      return {
        status: 200,
        body: JSON.stringify({
          success: true,
          errors: [],
          result: { tags: [privateContent] },
        }),
      };
    if (request.url.endsWith("/balance"))
      return {
        status: 200,
        body: JSON.stringify({
          data: { balance: "32.15", currency: "USD", privateContent },
        }),
      };
    assert.equal(request.token, undefined);
    return { status: 200, body: privateContent };
  };
}

test("offline requires no network and distinguishes optional missing credentials from required ones", async () => {
  const transport = () => assert.fail("offline must never use transport");
  const optional = await checkCloudAccess({ env: {}, transport });
  assert.equal(optional.ok, true);
  assert.equal(optional.evidence, "configuration_only");
  assert.equal(find(optional, "telnyx").status, "not_configured");
  const required = await checkCloudAccess({
    env: {},
    transport,
    required: ["cloudflare", "telnyx"],
  });
  assert.equal(required.ok, false);
  assert.deepEqual(find(required, "cloudflare").missing, [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
  ]);
  const configured = await checkCloudAccess({
    env,
    transport,
    required: ["cloudflare", "telnyx"],
  });
  assert.equal(configured.ok, true);
  assert.equal(find(configured, "cloudflare").status, "configured_unverified");
  assert.equal(find(configured, "openai-docs").status, "not_checked");
});

test("network checks use only bounded read endpoints and never include OpenAI credentials", async () => {
  const calls = [];
  const report = await checkCloudAccess({
    mode: "network",
    env: {
      ...env,
      OPENAI_API_KEY: "fixture_openai_secret",
      DATASET_OPENAI_API_KEY: "fixture_dataset_secret",
    },
    transport: healthyTransport(calls),
    required: ["cloudflare", "telnyx", "openai-docs"],
  });
  assert.equal(report.ok, true);
  assert.equal(report.evidence, "bounded_read_only_probes");
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://developers.cloudflare.com/workers/",
      "https://developers.telnyx.com/docs/overview",
      "https://developers.openai.com/learn/docs-mcp",
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/guteneo-app/script-settings`,
      "https://api.telnyx.com/v2/balance",
    ],
  );
  assert.equal(find(report, "cloudflare").stage, "worker_settings");
  assert.doesNotMatch(
    JSON.stringify(report),
    /fixture_|private_worker|signed\.example|32\.15|USD|aaaaaaaaaaaaaaaa/,
  );
  assert.doesNotMatch(
    JSON.stringify(calls),
    /fixture_openai_secret|fixture_dataset_secret/,
  );
});

test("account-owned Cloudflare tokens are verified at their scoped endpoint", async () => {
  const calls = [];
  await checkCloudAccess({
    mode: "network",
    env: {
      ...env,
      CLOUDFLARE_TOKEN_OWNER: "account",
      CLOUDFLARE_WORKER_NAME: "guteneo-dev",
    },
    transport: healthyTransport(calls),
  });
  assert.ok(
    calls.some(
      (call) =>
        call.url ===
        `https://api.cloudflare.com/client/v4/accounts/${account}/tokens/verify`,
    ),
  );
  assert.ok(!calls.some((call) => call.url.includes("/user/")));
  assert.ok(
    calls.some((call) =>
      call.url.endsWith("/workers/scripts/guteneo-dev/script-settings"),
    ),
  );
  assert.ok(!calls.some((call) => call.url.endsWith("/workers/scripts")));
});

test("invalid IDs, owner modes and header injection stop credentialed requests", async () => {
  for (const override of [
    { CLOUDFLARE_ACCOUNT_ID: "../../private?token=secret" },
    { CLOUDFLARE_TOKEN_OWNER: "auto" },
    { CLOUDFLARE_WORKER_NAME: "guteneo-app/../../other" },
    { CLOUDFLARE_API_TOKEN: "secret\r\nheader=x" },
    { TELNYX_API_KEY: "secret\nurl=https://other.example" },
  ]) {
    const calls = [];
    const report = await checkCloudAccess({
      mode: "network",
      env: { ...env, ...override },
      transport: healthyTransport(calls),
    });
    const service = "TELNYX_API_KEY" in override ? "telnyx" : "cloudflare";
    assert.equal(find(report, service).status, "invalid_configuration");
    assert.equal(report.ok, false);
    assert.ok(
      !calls.some((call) =>
        call.url.includes(
          service === "telnyx" ? "api.telnyx" : "api.cloudflare",
        ),
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(report),
      /secret|other\.example|private/,
    );
  }
});

test("masked provider credentials are rejected before any authenticated curl request and never appear in reports", async () => {
  for (const maskedKey of [
    "fixture_masked_key********",
    "fixture*masked",
    "*",
  ]) {
    const spawned = [];
    const transport = createCurlTransport({
      env: {},
      spawnImpl: (...args) => {
        const fake = fakeCurl("public documentation\n__GUTENEO_STATUS__200");
        spawned.push(fake.observed);
        return fake.spawnImpl(...args);
      },
    });
    const maskedEnv = {
      ...env,
      CLOUDFLARE_API_TOKEN: maskedKey,
      TELNYX_API_KEY: maskedKey,
    };
    const offline = await checkCloudAccess({ env: maskedEnv, transport });
    assert.equal(spawned.length, 0);
    const network = await checkCloudAccess({
      mode: "network",
      env: maskedEnv,
      transport,
    });
    for (const report of [offline, network]) {
      assert.equal(report.ok, false);
      for (const service of ["cloudflare", "telnyx"])
        assert.equal(find(report, service).status, "invalid_configuration");
      assert.ok(!JSON.stringify(report).includes(maskedKey));
    }
    // Only anonymous documentation GETs may reach curl; neither provider is
    // contacted, and no auth header or masked key reaches the process input.
    assert.equal(spawned.length, 3);
    for (const call of spawned) {
      assert.doesNotMatch(
        call.input,
        /Authorization|api\.telnyx|api\.cloudflare|fixture/,
      );
      assert.ok(!call.input.includes(maskedKey));
    }
    for (const url of [
      "https://api.telnyx.com/v2/balance",
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
    ])
      assert.deepEqual(await transport({ url, token: maskedKey }), {
        failure: "invalid_configuration",
      });
    assert.equal(
      spawned.length,
      3,
      "The curl transport must also refuse a masked token when called directly",
    );
  }
});

test("Cloudflare HTTP 200 errors or inactive tokens never become successful account proof", async () => {
  for (const body of [
    { success: false, errors: [{ message: cfKey }] },
    {
      success: true,
      errors: [{ message: cfKey }],
      result: { status: "active" },
    },
    { success: true, result: { status: "active" } },
    { success: true, errors: [], result: { status: "expired" } },
    { success: true, errors: [], result: null },
  ]) {
    const calls = [];
    const fallback = healthyTransport(calls);
    const report = await checkCloudAccess({
      mode: "network",
      env,
      transport: async (request) =>
        request.url.endsWith("/tokens/verify")
          ? { status: 200, body: JSON.stringify(body) }
          : fallback(request),
    });
    assert.equal(report.ok, false);
    assert.notEqual(find(report, "cloudflare").status, "verified_get");
    assert.equal(find(report, "cloudflare").stage, "token");
    assert.ok(!calls.some((call) => call.url.endsWith("/script-settings")));
    assert.doesNotMatch(JSON.stringify(report), /fixture_cloudflare_secret/);
  }
});

test("a valid token alone does not prove permissions on the specific Worker", async () => {
  const fallback = healthyTransport();
  for (const response of [
    { status: 403, body: privateContent },
    {
      status: 200,
      body: JSON.stringify({ success: true, errors: [], result: [] }),
    },
  ]) {
    const report = await checkCloudAccess({
      mode: "network",
      env,
      transport: async (request) =>
        request.url.endsWith("/script-settings") ? response : fallback(request),
    });
    assert.equal(report.ok, false);
    assert.equal(find(report, "cloudflare").stage, "worker_settings");
    assert.notEqual(find(report, "cloudflare").status, "verified_get");
  }
});

test("network, authentication, redirects, malformed bodies and rate limits remain distinguishable without response data", async () => {
  for (const [response, status] of [
    [{ failure: "network_unavailable" }, "network_unavailable"],
    [{ failure: "network_timeout" }, "network_timeout"],
    [{ failure: cfKey }, "transport_failed"],
    [{ status: 401, body: privateContent }, "authentication_rejected"],
    [{ status: 403, body: privateContent }, "access_denied"],
    [
      { status: 302, body: privateContent, location: "https://other.example" },
      "redirect_blocked",
    ],
    [{ status: 429, body: privateContent }, "rate_limited"],
    [{ status: 500, body: privateContent }, "http_failed"],
    [{ status: 200, body: privateContent }, "invalid_response"],
    [
      {
        status: 200,
        body: JSON.stringify({ errors: [{ detail: telnyxKey }] }),
      },
      "provider_rejected",
    ],
    [{ status: 200, body: JSON.stringify({ data: {} }) }, "provider_rejected"],
  ]) {
    let providerCalls = 0;
    const report = await checkCloudAccess({
      mode: "network",
      env: { TELNYX_API_KEY: telnyxKey },
      transport: async (request) => {
        if (!request.token) return { status: 200, body: "public docs" };
        providerCalls++;
        return response;
      },
    });
    assert.equal(report.ok, false);
    assert.equal(find(report, "telnyx").status, status);
    assert.equal(providerCalls, 1, "No retries or redirects may be attempted");
    assert.doesNotMatch(
      JSON.stringify(report),
      /fixture_|private_worker|signed\.example|other\.example/,
    );
  }
  const report = await checkCloudAccess({
    mode: "network",
    env,
    transport: async () => {
      throw new Error(`${cfKey} ${telnyxKey} ${privateContent}`);
    },
  });
  assert.doesNotMatch(
    JSON.stringify(report),
    /fixture_|private_worker|signed\.example/,
  );
});

function fakeCurl(output, exitCode = 0) {
  const observed = {};
  const spawnImpl = (command, args, options) => {
    Object.assign(observed, { command, args, options });
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.kill = () => {
      observed.killed = true;
      child.emit("close", null);
    };
    let input = "";
    child.stdin.on("data", (chunk) => {
      input += chunk.toString();
    });
    child.stdin.on("finish", () => {
      observed.input = input;
      setImmediate(() => {
        child.stdout.write(output);
        child.stdout.end();
        child.emit("close", exitCode);
      });
    });
    return child;
  };
  return { observed, spawnImpl };
}

test("curl keeps auth out of argv/environment, ignores curlrc, bounds transfer and never follows redirects", async () => {
  const fake = fakeCurl("{}\n__GUTENEO_STATUS__302");
  const transport = createCurlTransport({
    spawnImpl: fake.spawnImpl,
    env: {
      ...env,
      PATH: "/usr/bin",
      HTTPS_PROXY: "https://proxy.example:8443",
      NODE_OPTIONS: "--require=unsafe.cjs",
      OPENAI_API_KEY: "openai_secret",
    },
  });
  const response = await transport({
    url: "https://api.telnyx.com/v2/balance",
    token: telnyxKey,
  });
  assert.equal(response.status, 302);
  assert.equal(fake.observed.command, "curl");
  assert.deepEqual(fake.observed.args, ["--disable", "--config", "-"]);
  assert.equal(fake.observed.options.shell, false);
  assert.deepEqual(fake.observed.options.stdio, ["pipe", "pipe", "ignore"]);
  assert.deepEqual(fake.observed.options.env, {
    PATH: "/usr/bin",
    HTTPS_PROXY: "https://proxy.example:8443",
  });
  assert.match(
    fake.observed.input,
    /header = "Authorization: Bearer fixture_telnyx_secret"/,
  );
  assert.match(
    fake.observed.input,
    /connect-timeout = 5\nmax-time = 12\nretry = 0\nmax-redirs = 0/,
  );
  assert.match(fake.observed.input, /proto = "=https"/);
  assert.doesNotMatch(fake.observed.input, /location|verbose|trace|insecure/);
  assert.doesNotMatch(
    JSON.stringify({
      args: fake.observed.args,
      options: fake.observed.options,
      response,
    }),
    /fixture_|openai_secret|unsafe/,
  );
});

test("curl cannot target arbitrary URLs, inject config, leak process errors or accept invalid trailers", async () => {
  let calls = 0;
  const transport = createCurlTransport({
    spawnImpl: () => {
      calls++;
      throw new Error(cfKey);
    },
    env: {},
  });
  for (const request of [
    { url: "https://evil.example" },
    { url: "https://api.telnyx.com/v2/faxes", token: telnyxKey },
    {
      url: "https://api.telnyx.com/v2/balance",
      token: `${telnyxKey}\nverbose`,
    },
  ])
    assert.deepEqual(await transport(request), {
      failure: "invalid_configuration",
    });
  assert.equal(calls, 0);
  assert.deepEqual(
    await transport({
      url: "https://api.telnyx.com/v2/balance",
      token: telnyxKey,
    }),
    { failure: "transport_unavailable" },
  );
  for (const [output, code, failure] of [
    [privateContent, 0, "invalid_response"],
    [privateContent, 28, "network_timeout"],
    [privateContent, 6, "network_unavailable"],
    [privateContent, 60, "network_unavailable"],
    [privateContent, 63, "response_too_large"],
    [privateContent, 1, "transport_failed"],
    ["x".repeat(2 * 1024 * 1024 + 101), 0, "response_too_large"],
  ]) {
    const fake = fakeCurl(output, code);
    assert.deepEqual(
      await createCurlTransport({ spawnImpl: fake.spawnImpl, env: {} })({
        url: "https://api.telnyx.com/v2/balance",
        token: telnyxKey,
      }),
      { failure },
    );
  }
});

test("CLI rejects unknown inputs without reflecting values and defaults to offline", async () => {
  assert.equal(
    (await main([], { env: {}, transport: () => assert.fail() })).mode,
    "offline",
  );
  assert.equal(
    (await main(["--offline", "--require=telnyx"], { env: {} })).ok,
    false,
  );
  for (const args of [
    ["--network", "--offline"],
    ["--require=not-a-service"],
    [`--token=${cfKey}`],
  ])
    await assert.rejects(main(args, { env: {} }));
  const cli = spawnSync(
    process.execPath,
    ["scripts/codex-cloud-check.mjs", `--token=${cfKey}`],
    { cwd: new URL("../..", import.meta.url), encoding: "utf8", env: {} },
  );
  assert.equal(cli.status, 2);
  assert.doesNotMatch(
    `${cli.stdout}${cli.stderr}`,
    /fixture_cloudflare_secret/,
  );
});

test("bootstrap keeps provider credentials out of npm and confines database operations to local scripts", () => {
  const folder = mkdtempSync(join(tmpdir(), "guteneo-cloud-check-"));
  const callsFile = join(folder, "calls.jsonl");
  try {
    // Only npm is replaced: the real bash bootstrap and Node checker run.
    // Dependency hooks receive exactly the environment recorded here.
    writeFileSync(
      join(folder, "npm"),
      `#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify({ args: process.argv.slice(2), env: process.env, configMode: fs.statSync(process.env.XDG_CONFIG_HOME).mode & 0o777, logMode: fs.statSync(process.env.WRANGLER_LOG_PATH).mode & 0o777, cacheMode: fs.statSync(process.env.NPM_CONFIG_CACHE).mode & 0o777 }) + "\\n");\n`,
      { mode: 0o700 },
    );
    const run = spawnSync("bash", ["scripts/codex-cloud-setup.sh"], {
      cwd: new URL("../..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        ...env,
        PATH: `${folder}:${process.env.PATH}`,
        OPENAI_API_KEY: "fixture_openai_secret",
        ARBITRARY_PROVIDER_SECRET: "fixture_unlisted_secret",
        NODE_OPTIONS: "--require=/missing/untrusted-node-hook.cjs",
        LIVE_SENDS_ENABLED: "true",
        MODE: "production",
        CODEX_CLOUD_INSTALL_BROWSER: "0",
        XDG_CONFIG_HOME: "/unwritable/user-config",
        WRANGLER_LOG_PATH: "/unwritable/user-logs",
        NPM_CONFIG_CACHE: "/unwritable/user-cache",
        npm_config_cache: "/unwritable/inherited-cache",
        npm_config_registry: "https://fixture_registry.invalid",
      },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(
      `${run.stdout}${run.stderr}`,
      /fixture_|untrusted-node-hook/,
    );
    const calls = readFileSync(callsFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      calls.map((call) => call.args),
      [["ci"], ["run", "db:migrate"], ["run", "db:seed"], ["run", "build:web"]],
    );
    for (const call of calls) {
      assert.equal(call.env.MODE, "simulation");
      assert.equal(call.env.LIVE_SENDS_ENABLED, "false");
      assert.equal(call.env.ENVIRONMENT, "local");
      assert.equal(call.env.NPM_CONFIG_USERCONFIG, "/dev/null");
      assert.equal(call.configMode, 0o700);
      assert.equal(call.logMode, 0o700);
      assert.equal(call.cacheMode, 0o700);
      assert.equal(call.env.HOME, process.env.HOME);
      assert.notEqual(call.env.XDG_CONFIG_HOME, "/unwritable/user-config");
      assert.notEqual(call.env.WRANGLER_LOG_PATH, "/unwritable/user-logs");
      assert.notEqual(call.env.NPM_CONFIG_CACHE, "/unwritable/user-cache");
      const runtime = dirname(call.env.XDG_CONFIG_HOME);
      assert.equal(dirname(call.env.WRANGLER_LOG_PATH), runtime);
      assert.equal(
        normalize(call.env.NPM_CONFIG_CACHE),
        join(runtime, "npm-cache"),
      );
      assert.match(runtime, /guteneo-codex-cloud\.[a-zA-Z0-9]+$/);
      assert.equal(
        existsSync(runtime),
        false,
        "The per-run runtime directory must be removed on exit",
      );
      for (const key of [
        "CLOUDFLARE_API_TOKEN",
        "TELNYX_API_KEY",
        "OPENAI_API_KEY",
        "ARBITRARY_PROVIDER_SECRET",
        "NODE_OPTIONS",
        "npm_config_cache",
        "npm_config_registry",
      ])
        assert.equal(call.env[key], undefined);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );
  assert.match(packageJson.scripts["db:migrate"], /--local/);
  assert.match(packageJson.scripts["db:seed"], /--local/);
  assert.doesNotMatch(
    packageJson.scripts["db:migrate"] + packageJson.scripts["db:seed"],
    /--remote/,
  );
});

test("bootstrap cleans only its own runtime directory when a dependency step fails", () => {
  const folder = mkdtempSync(join(tmpdir(), "guteneo-cloud-failure-"));
  const runtimeFile = join(folder, "runtime.txt");
  const existingFile = join(folder, "user-config.txt");
  try {
    writeFileSync(existingFile, "Preserve user configuration");
    writeFileSync(
      join(folder, "npm"),
      `#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.writeFileSync(${JSON.stringify(runtimeFile)}, JSON.stringify({ config: process.env.XDG_CONFIG_HOME, cache: process.env.NPM_CONFIG_CACHE, cacheMode: fs.statSync(process.env.NPM_CONFIG_CACHE).mode & 0o777 }));\nprocess.exit(13);\n`,
      { mode: 0o700 },
    );
    const run = spawnSync("bash", ["scripts/codex-cloud-setup.sh"], {
      cwd: new URL("../..", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${folder}:${process.env.PATH}`,
        XDG_CONFIG_HOME: folder,
        WRANGLER_LOG_PATH: folder,
        NPM_CONFIG_CACHE: folder,
      },
    });
    assert.equal(run.status, 13);
    const observed = JSON.parse(readFileSync(runtimeFile, "utf8"));
    const runtime = dirname(observed.config);
    assert.equal(normalize(observed.cache), join(runtime, "npm-cache"));
    assert.equal(observed.cacheMode, 0o700);
    assert.equal(existsSync(observed.cache), false);
    assert.notEqual(runtime, folder);
    assert.equal(existsSync(runtime), false);
    assert.equal(
      readFileSync(existingFile, "utf8"),
      "Preserve user configuration",
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
