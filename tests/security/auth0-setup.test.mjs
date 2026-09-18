import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import {
  actionSources,
  AUDIENCE,
  cliJson,
  HOSTED_REFRESH_TOKEN_POLICY,
  makeAuth0Api,
  runSetup,
  setupPlan,
  TENANT,
} from "../../scripts/setup-auth0.mjs";

const hostedRefreshOptions = {
  authPolicy: "verified_email",
  claudeCallback: "https://claude.ai/api/mcp/auth_callback",
  refreshClientKeys: ["claudeHosted"],
};

async function executeActions(sources, event) {
  const calls = [];
  const api = {
    access: { deny: () => calls.push(["deny"]) },
    authentication: {
      challengeWithAny: () => calls.push(["challenge"]),
      enrollWith: () => calls.push(["enroll"]),
    },
    idToken: {
      setCustomClaim: (name, value) => calls.push(["id", name, value]),
    },
    accessToken: {
      setCustomClaim: (name, value) => calls.push(["access", name, value]),
    },
  };
  // Execute both independently as well: neither Action may mint a claim when
  // the other Action would deny the request, even if binding order later changes.
  for (const source of sources) {
    const context = { exports: {}, Date };
    vm.runInNewContext(source, context);
    await context.exports.onExecutePostLogin(event, api);
  }
  return calls;
}

function hostedRefreshEvent(change = {}) {
  return {
    client: { client_id: "claude_hosted_fixture" },
    resource_server: { identifier: AUDIENCE },
    connection: { id: "connection_fixture" },
    user: { email_verified: true },
    transaction: { protocol: "oauth2-refresh-token" },
    // No refresh_token object, session, query or authentication methods: these
    // optional/Enterprise fields cannot become requirements for the Free beta.
    ...change,
  };
}

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

test("hosted refresh is an explicit finite rotating policy with unchanged other clients", () => {
  const baseline = setupPlan({
    authPolicy: "verified_email",
    claudeCallback: hostedRefreshOptions.claudeCallback,
  });
  const selected = setupPlan(hostedRefreshOptions);
  assert.equal(baseline.resourceServer.allow_offline_access, false);
  assert.equal(selected.resourceServer.allow_offline_access, true);
  assert.equal(selected.resourceServer.token_lifetime, 3600);
  assert.equal(selected.resourceServer.token_lifetime_for_web, 3600);
  assert.equal(
    selected.resourceServer.skip_consent_for_verifiable_first_party_clients,
    false,
  );
  assert.deepEqual(HOSTED_REFRESH_TOKEN_POLICY, {
    rotation_type: "rotating",
    expiration_type: "expiring",
    token_lifetime: 7776000,
    infinite_token_lifetime: false,
    idle_token_lifetime: 2592000,
    infinite_idle_token_lifetime: false,
    leeway: 3,
  });
  for (const client of selected.clients) {
    const original = baseline.clients.find((item) => item.key === client.key);
    if (client.key !== "claudeHosted") {
      assert.deepEqual(client, original);
      continue;
    }
    assert.deepEqual(client.body.grant_types, [
      "authorization_code",
      "refresh_token",
    ]);
    assert.deepEqual(client.body.refresh_token, HOSTED_REFRESH_TOKEN_POLICY);
    assert.equal(client.body.token_endpoint_auth_method, "none");
    assert.deepEqual(client.body.callbacks, [
      hostedRefreshOptions.claudeCallback,
    ]);
  }
  for (const refreshClientKeys of [
    ["browser"],
    ["claudeCode"],
    ["cursor"],
    ["unknown"],
    ["claudeHosted", "claudeHosted"],
    "claudeHosted",
  ]) {
    assert.throws(
      () => setupPlan({ ...hostedRefreshOptions, refreshClientKeys }),
      {
        code: "INVALID_REFRESH_CLIENTS",
      },
    );
  }
  assert.throws(
    () =>
      setupPlan({
        authPolicy: "verified_email",
        refreshClientKeys: ["claudeHosted"],
      }),
    {
      code: "REFRESH_CALLBACK_REQUIRED",
    },
  );
  assert.throws(
    () =>
      setupPlan({
        ...hostedRefreshOptions,
        authPolicy: "verified_email_and_mfa",
      }),
    {
      code: "REFRESH_POLICY_REQUIRES_VERIFIED_EMAIL",
    },
  );
  const callbacks = {
    ...hostedRefreshOptions,
    chatgptCallback: "https://chatgpt.com/connector/oauth/fixture",
  };
  assert.deepEqual(
    setupPlan({ ...callbacks, refreshClientKeys: ["chatgpt", "claudeHosted"] }),
    setupPlan({ ...callbacks, refreshClientKeys: ["claudeHosted", "chatgpt"] }),
  );
});

test("setup binds only explicitly selected hosted clients into the refresh Actions", async () => {
  const f = fixture();
  await runSetup({
    mode: "apply",
    options: hostedRefreshOptions,
    api: f.api,
    writer: async () => {},
  });
  const hosted = f.clients.find(
    (client) => client.client_metadata.guteneo_component === "claudeHosted",
  );
  assert.ok(hosted);
  const sources = f.actions.map((action) => action.code);
  const success = await executeActions(
    sources,
    hostedRefreshEvent({ client: { client_id: hosted.client_id } }),
  );
  assert.deepEqual(success, [
    ["id", "https://guteneo.com/verified_account", true],
    ["access", "https://guteneo.com/verified_account", true],
  ]);
  for (const other of f.clients.filter((client) => client !== hosted)) {
    assert.deepEqual(other.grant_types, ["authorization_code"]);
    assert.equal(other.refresh_token, undefined);
    assert.deepEqual(
      await executeActions(
        sources,
        hostedRefreshEvent({ client: { client_id: other.client_id } }),
      ),
      [["deny"], ["deny"]],
    );
  }
  const resource = f.calls.find(
    (call) => call.method === "POST" && call.path === "resource-servers",
  );
  assert.equal(resource.body.allow_offline_access, true);
  assert.ok(
    f.calls
      .filter((call) => call.method !== "GET")
      .every((call) => !/^(tenants|guardian)/.test(call.path)),
  );
});

test("full setup refuses to silently remove an existing hosted refresh grant", async () => {
  const f = fixture();
  f.clients.push({
    client_id: "claude_hosted_fixture",
    name: "Guteneo - Claude hosted",
    client_metadata: {
      guteneo_managed_by: "guteneo-setup-v1",
      guteneo_component: "claudeHosted",
    },
    grant_types: ["authorization_code", "refresh_token"],
  });
  const report = await runSetup({
    mode: "inspect",
    options: { authPolicy: "verified_email" },
    api: f.api,
  });
  assert.ok(
    report.blockers.includes(
      "existing_refresh_client_requires_explicit_selection",
    ),
  );
  await assert.rejects(
    runSetup({
      mode: "apply",
      options: { authPolicy: "verified_email" },
      api: f.api,
    }),
    { code: "PREREQUISITES_REQUIRED" },
  );
  assert.ok(f.calls.every((call) => call.method === "GET"));
  const selected = await runSetup({
    mode: "inspect",
    options: hostedRefreshOptions,
    api: f.api,
  });
  assert.deepEqual(selected.blockers, []);
});

test("hosted refresh rechecks verified identity without extending MFA or requiring Enterprise event fields", async () => {
  const sources = actionSources(
    ["browser_fixture"],
    "connection_fixture",
    "verified_email",
    ["claude_hosted_fixture"],
  );
  const expected = [
    ["id", "https://guteneo.com/verified_account", true],
    ["access", "https://guteneo.com/verified_account", true],
  ];
  assert.deepEqual(
    await executeActions(sources, hostedRefreshEvent()),
    expected,
  );
  assert.deepEqual(
    await executeActions(
      sources,
      hostedRefreshEvent({
        authentication: {
          methods: [{ name: "mfa", timestamp: new Date().toISOString() }],
        },
      }),
    ),
    expected,
  );
  for (const change of [
    { client: { client_id: "browser_fixture" } },
    { client: { client_id: "unapproved_hosted_fixture" } },
    { resource_server: undefined },
    { resource_server: { identifier: "https://other.invalid/api" } },
    { connection: undefined },
    { connection: { id: "other_connection" } },
    { user: undefined },
    { user: { email_verified: false } },
    { user: { email_verified: "true" } },
  ]) {
    assert.deepEqual(
      await executeActions(sources, hostedRefreshEvent(change)),
      [["deny"], ["deny"]],
    );
  }
  const unscoped = hostedRefreshEvent({
    client: { client_id: "unrelated_fixture" },
    resource_server: { identifier: "https://unrelated.invalid/api" },
  });
  assert.deepEqual(await executeActions(sources, unscoped), []);
  const disabled = actionSources(
    ["browser_fixture", "claude_hosted_fixture"],
    "connection_fixture",
    "verified_email",
  );
  assert.deepEqual(await executeActions(disabled, hostedRefreshEvent()), [
    ["deny"],
    ["deny"],
  ]);
});

test("refresh support cannot bypass initial PKCE or silently renew a legacy MFA session", async () => {
  const sources = actionSources(
    ["browser_fixture"],
    "connection_fixture",
    "verified_email",
    ["claude_hosted_fixture"],
  );
  const initial = hostedRefreshEvent({
    transaction: { protocol: "oidc-basic-profile" },
    request: {
      query: { code_challenge: "a".repeat(43), code_challenge_method: "S256" },
    },
  });
  assert.deepEqual(await executeActions(sources, initial), [
    ["id", "https://guteneo.com/verified_account", true],
    ["access", "https://guteneo.com/verified_account", true],
  ]);
  for (const change of [
    { request: undefined },
    {
      request: {
        query: {
          code_challenge: "a".repeat(43),
          code_challenge_method: "plain",
        },
      },
    },
    {
      request: {
        query: {
          code_challenge: "a".repeat(42),
          code_challenge_method: "S256",
        },
      },
    },
    { request: { body: { grant_type: "refresh_token" } } },
    { transaction: undefined },
    { transaction: { protocol: "oauth2-password" } },
    { transaction: { protocol: "oauth2-access-token" } },
  ]) {
    assert.deepEqual(await executeActions(sources, { ...initial, ...change }), [
      ["deny"],
      ["deny"],
    ]);
  }
  const legacy = actionSources(
    ["browser_fixture"],
    "connection_fixture",
    "verified_email_and_mfa",
    ["claude_hosted_fixture"],
  );
  const freshMfa = hostedRefreshEvent({
    authentication: {
      methods: [{ name: "mfa", timestamp: new Date().toISOString() }],
    },
  });
  assert.deepEqual(await executeActions(legacy, freshMfa), [
    ["deny"],
    ["deny"],
  ]);
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
    ["id", "https://guteneo.com/verified_account", true],
    ["access", "https://guteneo.com/verified_account", true],
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

test("free beta requires scoped verified identity and PKCE without inventing MFA", async () => {
  const plan = setupPlan({ authPolicy: "verified_email" });
  assert.equal(plan.authPolicy, "verified_email");
  assert.ok(!plan.prerequisites.some((item) => item.includes("OTP factor")));
  assert.throws(() => setupPlan({ authPolicy: "unverified" }), {
    code: "INVALID_AUTH_POLICY",
  });
  const execute = actionSources(
    ["client_fixture"],
    "connection_fixture",
    "verified_email",
  ).map((code) => {
    const context = { exports: {}, Date };
    vm.runInNewContext(code, context);
    return context.exports.onExecutePostLogin;
  });
  const calls = [];
  const api = {
    access: { deny: () => calls.push("deny") },
    authentication: {
      challengeWithAny: () => calls.push("challenge"),
      enrollWith: () => calls.push("enroll"),
    },
    idToken: {
      setCustomClaim: (name, value) => calls.push(["id", name, value]),
    },
    accessToken: {
      setCustomClaim: (name, value) => calls.push(["access", name, value]),
    },
  };
  const base = {
    client: { client_id: "client_fixture" },
    connection: { id: "connection_fixture" },
    user: { email_verified: true },
    transaction: { protocol: "oidc-basic-profile" },
    request: {
      query: { code_challenge: "b".repeat(43), code_challenge_method: "S256" },
    },
    authentication: {
      methods: [{ name: "pwd", timestamp: new Date().toISOString() }],
    },
  };
  for (const action of execute) await action(base, api);
  assert.deepEqual(calls, [
    ["id", "https://guteneo.com/verified_account", true],
    ["access", "https://guteneo.com/verified_account", true],
  ]);
  for (const change of [
    { user: { email_verified: false } },
    { client: { client_id: "unrelated" } },
    { connection: { id: "wrong" } },
    { request: { query: {} } },
  ]) {
    calls.length = 0;
    for (const action of execute) await action({ ...base, ...change }, api);
    assert.ok(calls.every((call) => call === "deny"));
  }
  const fixtureState = fixture({
    settings: { customize_mfa_in_postlogin_action: false },
  });
  const report = await runSetup({
    mode: "inspect",
    options: { authPolicy: "verified_email" },
    api: fixtureState.api,
  });
  assert.deepEqual(report.blockers, []);
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
