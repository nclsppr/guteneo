import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import {
  actionSources,
  AUDIENCE,
  cliJson,
  makeAuth0Api,
  runSetup,
  setupPlan,
  TENANT,
} from "../../scripts/setup-auth0.mjs";

function fixture(overrides = {}) {
  const calls = [];
  const clients = [];
  const actions = [];
  let bindings = [
    {
      id: "binding_original",
      display_name: "Existing login behavior",
      action: { id: "action_original", name: "Existing action" },
    },
  ];
  let secretObject;
  const api = {
    async request(method, path, body) {
      calls.push({ method, path, body: structuredClone(body) });
      if (method === "GET" && path.startsWith("tenants/settings"))
        return {
          resource_parameter_profile: "compatibility",
          customize_mfa_in_postlogin_action: true,
          ...overrides.settings,
        };
      if (method === "GET" && path === "guardian/factors")
        return [{ name: "otp", enabled: true }];
      if (method === "GET" && path.startsWith("clients?")) return clients;
      if (method === "GET" && path.startsWith("resource-servers?")) return [];
      if (method === "GET" && path.startsWith("connections?")) return [];
      if (method === "GET" && path.startsWith("actions/actions?"))
        return { actions };
      if (
        method === "GET" &&
        path.startsWith("actions/triggers/post-login/bindings?")
      )
        return { bindings };
      if (method === "GET" && path === "actions/triggers")
        return {
          triggers: [{ id: "post-login", version: "v3", runtimes: ["node22"] }],
        };
      if (method === "POST" && path === "clients") {
        const result = {
          ...body,
          client_id: `client_${clients.length + 1}`,
          client_secret: "generated-client-secret-fixture",
        };
        clients.push(result);
        return result;
      }
      if (method === "POST" && path === "resource-servers")
        return { id: "resource_fixture", ...body };
      if (method === "POST" && path === "connections")
        return { id: "connection_fixture", ...body };
      if (
        method === "PATCH" &&
        path === "connections/connection_fixture/clients"
      )
        return {};
      if (method === "POST" && path === "actions/actions") {
        const result = { id: `action_${actions.length + 1}`, ...body };
        actions.push(result);
        return result;
      }
      if (method === "GET" && /^actions\/actions\/action_\d+$/.test(path))
        return { status: "built" };
      if (method === "POST" && path.endsWith("/deploy")) return {};
      if (
        method === "PATCH" &&
        path === "actions/triggers/post-login/bindings"
      ) {
        bindings = body.bindings.map((binding, index) =>
          binding.ref.type === "binding_id"
            ? bindings.find((item) => item.id === binding.ref.value)
            : {
                id: `binding_${index}`,
                display_name: binding.display_name,
                action: { id: binding.ref.value, name: binding.display_name },
              },
        );
        return { bindings };
      }
      if (method === "GET" && path.startsWith("clients/client_1?")) {
        secretObject = {
          client_id: "client_1",
          client_secret: "browser-client-secret-fixture",
        };
        return secretObject;
      }
      throw new Error(`Unexpected fixture call: ${method} ${path}`);
    },
  };
  return {
    api,
    calls,
    clients,
    actions,
    get secretObject() {
      return secretObject;
    },
  };
}

test("Auth0 default plan makes no external calls or tenant-wide writes and has precise callback boundaries", async () => {
  const plan = await runSetup({
    api: {
      request() {
        throw new Error("unexpected external access");
      },
    },
  });
  assert.equal(plan.mode, "plan");
  assert.equal(plan.audience, AUDIENCE);
  assert.equal(plan.clients.length, 3);
  assert.deepEqual(plan.clients[0].body.callbacks, [
    "https://guteneo.com/auth/callback",
  ]);
  for (const client of plan.clients)
    assert.deepEqual(client.body.grant_types, ["authorization_code"]);
  assert.equal(plan.clients[1].body.token_endpoint_auth_method, "none");
  assert.equal(
    plan.resourceServer.skip_consent_for_verifiable_first_party_clients,
    false,
  );
  for (const url of [
    "https://attacker.invalid/connector/oauth/a",
    "https://chatgpt.com/connector/oauth/a?secret=yes",
    "https://chatgpt.com.evil.invalid/connector/oauth/a",
    "https://chatgpt.com/connector/oauth/*",
  ])
    assert.throws(() => setupPlan({ chatgptCallback: url }), {
      code: "INVALID_CALLBACK",
    });
  assert.equal(
    setupPlan({
      chatgptCallback: "https://chatgpt.com/connector/oauth/given-callback",
    }).clients.length,
    4,
  );
});

test("Auth0 apply refuses missing tenant prerequisites before creating any resource", async () => {
  const f = fixture({ settings: { customize_mfa_in_postlogin_action: false } });
  await assert.rejects(runSetup({ mode: "apply", api: f.api }), {
    code: "PREREQUISITES_REQUIRED",
  });
  assert.ok(f.calls.every((call) => call.method === "GET"));
});

test("Auth0 apply preserves existing login order, scopes Guteneo Actions and imports secret only in memory", async () => {
  const f = fixture();
  let written;
  const result = await runSetup({
    mode: "apply",
    api: f.api,
    writer: async (values, config) => {
      assert.equal(config, "wrangler.live.jsonc");
      assert.equal(values.AUTH0_CLIENT_SECRET, "browser-client-secret-fixture");
      assert.equal(values.AUTH0_DOMAIN, TENANT);
      written = values;
    },
  });
  assert.equal(result.configured, true);
  assert.equal(result.humanLoginVerified, false);
  assert.ok(!JSON.stringify(result).includes("secret-fixture"));
  assert.deepEqual(written, {});
  assert.ok(!Object.hasOwn(f.secretObject, "client_secret"));
  const update = f.calls.find(
    (call) =>
      call.method === "PATCH" && call.path.endsWith("post-login/bindings"),
  );
  assert.equal(update.body.bindings[0].ref.type, "binding_id");
  assert.ok(
    update.body.bindings.every((binding) => !Object.hasOwn(binding, "secrets")),
  );
  assert.deepEqual(
    update.body.bindings.map((binding) => binding.ref.value),
    ["binding_original", "action_1", "action_2"],
  );
  assert.ok(
    f.calls
      .filter((call) => call.method !== "GET")
      .every((call) => !/^(tenants|guardian)/.test(call.path)),
  );
});

test("Auth0 failed secret import erases credentials and never returns a child or credential error", async () => {
  const f = fixture();
  let written;
  await assert.rejects(
    runSetup({
      mode: "apply",
      api: f.api,
      writer: async (values) => {
        written = values;
        throw new Error("browser-client-secret-fixture");
      },
    }),
    (error) =>
      error.code === "CLOUDFLARE_SECRET_UPLOAD_FAILED" &&
      !String(error).includes("secret-fixture"),
  );
  assert.deepEqual(written, {});
  assert.ok(!Object.hasOwn(f.secretObject, "client_secret"));
});

test("MFA Actions leave unrelated applications alone and cannot assert consent or MFA before completed proof", async () => {
  const sources = actionSources(["client_fixture"], "connection_fixture");
  const execute = sources.map((code) => {
    const context = { exports: {}, Date };
    vm.runInNewContext(code, context);
    return context.exports.onExecutePostLogin;
  });
  const operations = [];
  const api = {
    access: { deny: (message) => operations.push(["deny", message]) },
    authentication: {
      challengeWithAny: (factors) => operations.push(["challenge", factors]),
      enrollWith: (factor) => operations.push(["enroll", factor]),
    },
    idToken: {
      setCustomClaim: (name, value) => operations.push(["id", name, value]),
    },
    accessToken: {
      setCustomClaim: (name, value) => operations.push(["access", name, value]),
    },
  };
  const event = {
    client: { client_id: "client_fixture" },
    connection: { id: "connection_fixture" },
    user: { email_verified: true, enrolledFactors: [] },
    transaction: { protocol: "oidc-basic-profile" },
    request: {
      query: { code_challenge: "a".repeat(43), code_challenge_method: "S256" },
    },
  };
  await execute[0]({ ...event, client: { client_id: "unrelated" } }, api);
  await execute[1]({ ...event, client: { client_id: "unrelated" } }, api);
  assert.deepEqual(operations, []);
  await execute[0]({ ...event, request: { query: {} } }, api);
  assert.equal(operations[0][0], "deny");
  operations.length = 0;
  await execute[0](event, api);
  assert.equal(operations[0][0], "enroll");
  await execute[1](event, api);
  assert.equal(operations[1][0], "deny");
  assert.ok(!operations.some(([type]) => type === "id" || type === "access"));
  operations.length = 0;
  await execute[1](
    {
      ...event,
      authentication: {
        methods: [{ name: "mfa", timestamp: new Date().toISOString() }],
      },
    },
    api,
  );
  assert.deepEqual(operations, [
    ["id", "https://guteneo.com/mfa", true],
    ["access", "https://guteneo.com/mfa", true],
  ]);
  operations.length = 0;
  await execute[1](
    {
      ...event,
      authentication: {
        methods: [{ name: "mfa", timestamp: "2020-01-01T00:00:00Z" }],
      },
    },
    api,
  );
  assert.equal(operations[0][0], "deny");
});

test("Auth0 CLI checks exact active tenant before sending any API request", async () => {
  const calls = [];
  const api = makeAuth0Api(async (args) => {
    calls.push(args);
    return [{ name: "unrelated.auth0.com", active: true }];
  });
  await assert.rejects(api.request("GET", "clients"), { code: "WRONG_TENANT" });
  assert.equal(calls.length, 1);
});

test("Auth0 CLI transport sends bodies over stdin, accepts 204 and suppresses failed provider output", async () => {
  let stdin = "";
  let args;
  const child = (command, receivedArgs, options) => {
    assert.equal(command, "auth0");
    args = receivedArgs;
    assert.deepEqual(options.stdio, ["pipe", "pipe", "ignore"]);
    const process = new EventEmitter();
    process.stdout = new PassThrough();
    process.stdin = new PassThrough();
    process.kill = () => {};
    process.stdin.on("data", (bytes) => {
      stdin += bytes;
    });
    process.stdin.on("finish", () =>
      queueMicrotask(() => process.emit("close", 0)),
    );
    return process;
  };
  assert.deepEqual(
    await cliJson(
      ["api", "patch", "connections/fixture/clients"],
      { sample: "private-fixture" },
      child,
    ),
    {},
  );
  assert.ok(!args.join(" ").includes("private-fixture"));
  assert.equal(JSON.parse(stdin).sample, "private-fixture");
  const failedChild = (...parameters) => {
    const process = child(...parameters);
    process.stdin.removeAllListeners("finish");
    process.stdin.on("finish", () =>
      queueMicrotask(() => {
        process.stdout.write("private-provider-output-fixture");
        process.emit("close", 1);
      }),
    );
    return process;
  };
  await assert.rejects(
    cliJson(["api", "get", "clients"], undefined, failedChild),
    (error) =>
      error.code === "AUTH0_CLI_FAILED" &&
      !String(error).includes("private-provider-output-fixture"),
  );
});
