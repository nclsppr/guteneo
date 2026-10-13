import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import {
  actionSources,
  AUDIENCE,
  HOSTED_REFRESH_TOKEN_POLICY,
  SCOPES,
  setupPlan,
} from "../../scripts/setup-auth0.mjs";
import {
  OPENAI_REVIEW_CLIENT_ID,
  reviewerRenewalSources,
  runOpenAIReviewRenewal,
} from "../../scripts/enable-openai-review-renewal.mjs";

const SECRET = "never-print-provider-or-client-secret";
function fixture() {
  const core = setupPlan({ authPolicy: "verified_email" }).clients.map(
    ({ body }, index) => ({ ...body, client_id: `core_${index}` }),
  );
  const codes = actionSources(
    core.map((client) => client.client_id),
    "con_guteneo",
    "verified_email",
  );
  const state = {
    clients: [
      ...core,
      {
        client_id: OPENAI_REVIEW_CLIENT_ID,
        name: "Guteneo - OpenAI Review",
        client_metadata: {
          guteneo_managed_by: "guteneo-openai-review-v1",
          guteneo_component: "openai-review",
        },
        app_type: "regular_web",
        token_endpoint_auth_method: "none",
        callbacks: ["https://chatgpt.com/connector/oauth/aAwc9dso12_L"],
        grant_types: ["authorization_code"],
        jwt_configuration: { alg: "RS256", lifetime_in_seconds: 3600 },
        is_first_party: true,
        oidc_conformant: true,
        client_secret: SECRET,
      },
      {
        client_id: "unrelated",
        name: "Another application",
        grant_types: ["refresh_token"],
        client_secret: SECRET,
      },
    ],
    resources: [
      {
        id: "api_guteneo",
        name: "Guteneo MCP",
        identifier: AUDIENCE,
        signing_alg: "RS256",
        token_dialect: "access_token",
        token_lifetime: 3600,
        token_lifetime_for_web: 3600,
        allow_offline_access: false,
        skip_consent_for_verifiable_first_party_clients: false,
        scopes: SCOPES.map((value) => ({ value, description: value })),
      },
    ],
    connections: [
      {
        id: "con_guteneo",
        name: "Guteneo-Accounts",
        strategy: "auth0",
        is_domain_connection: false,
        metadata: { guteneo_managed_by: "guteneo-setup-v1" },
        options: { password: SECRET },
      },
      {
        id: "con_other",
        name: "Other",
        strategy: "google-oauth2",
        is_domain_connection: false,
      },
    ],
    enabled: {
      con_guteneo: core
        .map((item) => item.client_id)
        .concat(OPENAI_REVIEW_CLIENT_ID),
      con_other: ["unrelated"],
    },
    actions: codes.map((code, index) => ({
      id: `action_${index}`,
      name: [
        "Guteneo - require verified identity",
        "Guteneo - verified identity claims",
      ][index],
      code,
      all_changes_deployed: true,
      status: "built",
      runtime: "node22",
      supported_triggers: [
        { id: "post-login", version: "v3", status: "CURRENT" },
      ],
      secrets: [],
      dependencies: [],
      updated_at: "2026-10-13T00:00:00Z",
      deployed_version: { id: `version_${index}`, code },
    })),
    bindings: [
      { id: "binding_other", action: { id: "action_other" } },
      { id: "binding_0", display_name: "Identity", action: { id: "action_0" } },
      { id: "binding_1", display_name: "Claims", action: { id: "action_1" } },
    ],
  };
  const calls = [];
  let beforeCall;
  let tick = 0;
  const api = {
    async request(method, path, body) {
      calls.push({ method, path, body: structuredClone(body) });
      beforeCall?.({ method, path, body });
      const [endpoint] = path.split("?");
      if (method === "GET") {
        let result;
        if (endpoint === "clients") result = state.clients;
        else if (endpoint === "resource-servers") result = state.resources;
        else if (endpoint === "connections") result = state.connections;
        else if (/^connections\/[^/]+\/clients$/.test(endpoint))
          result = {
            clients: state.enabled[endpoint.split("/")[1]].map((client_id) => ({
              client_id,
            })),
          };
        else if (endpoint === "actions/actions")
          result = { actions: state.actions };
        else if (endpoint === "actions/triggers/post-login/bindings")
          result = { bindings: state.bindings };
        else {
          const action = state.actions.find((item) =>
            endpoint.startsWith(`actions/actions/${item.id}`),
          );
          if (action)
            result = endpoint.includes("/versions/")
              ? {
                  id: action.deployed_version.id,
                  code: action.fetchedDeployedCode,
                }
              : action;
        }
        assert.ok(result, `Unexpected fixture read: ${path}`);
        return structuredClone(result);
      }
      if (method === "PATCH" && endpoint.startsWith("actions/actions/")) {
        assert.deepEqual(Object.keys(body), ["code"]);
        const action = state.actions.find(
          (item) => endpoint === `actions/actions/${item.id}`,
        );
        Object.assign(action, body, {
          all_changes_deployed: false,
          updated_at: `update_${++tick}`,
        });
        return {};
      }
      if (method === "POST" && endpoint.endsWith("/deploy")) {
        assert.deepEqual(body, {});
        const action = state.actions.find(
          (item) => endpoint === `actions/actions/${item.id}/deploy`,
        );
        action.all_changes_deployed = true;
        action.updated_at = `deploy_${++tick}`;
        action.deployed_version = {
          id: `version_${tick}_new`,
          code: action.code,
        };
        return {};
      }
      if (method === "PATCH" && endpoint === "resource-servers/api_guteneo") {
        assert.deepEqual(body, { allow_offline_access: true });
        Object.assign(state.resources[0], body);
        return {};
      }
      if (
        method === "PATCH" &&
        endpoint === `clients/${OPENAI_REVIEW_CLIENT_ID}`
      ) {
        assert.deepEqual(Object.keys(body), ["grant_types", "refresh_token"]);
        Object.assign(state.clients[3], body);
        return {};
      }
      throw new Error(`Unexpected fixture mutation: ${method} ${path}`);
    },
  };
  return {
    state,
    calls,
    api,
    setBeforeCall(fn) {
      beforeCall = fn;
    },
  };
}
const mutations = (f) => f.calls.filter((call) => call.method !== "GET");
const inspect = (f) => runOpenAIReviewRenewal({ api: f.api });
const apply = (f, expect) =>
  runOpenAIReviewRenewal({
    api: f.api,
    mode: "apply",
    expect,
    pause: async () => {},
  });
function setCode(action, code) {
  action.code = code;
  action.deployed_version.code = code;
}

test("default inspection is GET-only with a redacted state-and-change fingerprint", async () => {
  const f = fixture();
  const result = await inspect(f);
  assert.deepEqual(mutations(f), []);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.changes.length, 4);
  assert.deepEqual(result.refreshTokenPolicy, HOSTED_REFRESH_TOKEN_POLICY);
  assert.equal(result.automaticRenewalVerified, false);
  assert.equal(result.deliveryPolicy, "prepare_only_unchanged");
  assert.equal(
    result.callback,
    "https://chatgpt.com/connector/oauth/aAwc9dso12_L",
  );
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.ok(
    f.calls
      .filter((call) => call.path.startsWith("clients?"))
      .every((call) => !call.path.includes("client_secret")),
  );
});

test("refuses the legacy generic reviewer callback during inspection and apply without rewriting it", async () => {
  const f = fixture();
  const plan = await inspect(f);
  f.state.clients[3].callbacks = [
    "https://chatgpt.com/connector/oauth_callback",
  ];
  const original = structuredClone(f.state);
  for (const attempt of [() => inspect(f), () => apply(f, plan.fingerprint)])
    await assert.rejects(attempt, { code: "REVIEW_RENEWAL_REQUIRES_REVIEW" });
  assert.deepEqual(f.state, original);
  assert.deepEqual(mutations(f), []);
});

test("Actions deploy before offline access and reviewer grant; other clients, scopes, associations and bindings stay exact", async () => {
  const f = fixture();
  const original = structuredClone(f.state);
  const plan = await inspect(f);
  const result = await apply(f, plan.fingerprint);
  assert.equal(result.configured, true);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(
    mutations(f).map(({ method, path }) => `${method} ${path}`),
    [
      "PATCH actions/actions/action_0",
      "POST actions/actions/action_0/deploy",
      "PATCH actions/actions/action_1",
      "POST actions/actions/action_1/deploy",
      "PATCH resource-servers/api_guteneo",
      `PATCH clients/${OPENAI_REVIEW_CLIENT_ID}`,
    ],
  );
  for (const index of [0, 1, 2, 4])
    assert.deepEqual(f.state.clients[index], original.clients[index]);
  assert.deepEqual(f.state.connections, original.connections);
  assert.deepEqual(f.state.enabled, original.enabled);
  assert.deepEqual(f.state.bindings, original.bindings);
  assert.deepEqual(f.state.resources[0], {
    ...original.resources[0],
    allow_offline_access: true,
  });
  assert.deepEqual(f.state.clients[3], {
    ...original.clients[3],
    grant_types: ["authorization_code", "refresh_token"],
    refresh_token: HOSTED_REFRESH_TOKEN_POLICY,
  });
  for (const action of f.state.actions) {
    assert.ok(
      action.code.includes('const ownClients = ["core_0","core_1","core_2"];'),
    );
    assert.ok(
      action.code.includes(
        `const refreshClients = ["${OPENAI_REVIEW_CLIENT_ID}"];`,
      ),
    );
  }
  const count = mutations(f).length;
  await apply(f, result.fingerprint);
  assert.equal(mutations(f).length, count);
});

test("exact legacy pre-refresh sources migrate with their original clients preserved", async () => {
  const f = fixture();
  for (const action of f.state.actions) {
    const start = action.code.indexOf("const isRefresh =");
    const end = action.code.indexOf(
      "\n  if (event.user?.email_verified !== true) return;",
      start,
    );
    setCode(
      action,
      (
        action.code.slice(0, start) +
        "const query = event.request?.query || {};\n  if (event.transaction?.protocol !== 'oidc-basic-profile' || query.code_challenge_method !== 'S256' || typeof query.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(query.code_challenge)) { api.access.deny('Guteneo requires an authorization code with S256 PKCE.'); return; }" +
        action.code.slice(end)
      ).replace("const completed = !isRefresh &&", "const completed ="),
    );
  }
  const plan = await inspect(f);
  assert.equal((await apply(f, plan.fingerprint)).configured, true);
});

test("source acceptance binds the complete same historical core pair, including optional hosted registrations", async () => {
  const f = fixture();
  const hosted = setupPlan({
    authPolicy: "verified_email",
    claudeCallback: "https://claude.ai/api/mcp/auth_callback",
  }).clients.at(-1).body;
  f.state.clients.push({ ...hosted, client_id: "claude_hosted" });
  const sources = actionSources(
    ["core_0", "core_1", "core_2", "claude_hosted"],
    "con_guteneo",
    "verified_email",
  );
  f.state.actions.forEach((action, index) => setCode(action, sources[index]));
  const plan = await inspect(f);
  await apply(f, plan.fingerprint);
  assert.ok(
    f.state.actions.every((action) =>
      action.code.includes(
        'const ownClients = ["core_0","core_1","core_2","claude_hosted"];',
      ),
    ),
  );
});

for (const [name, change] of [
  [
    "reviewer callback",
    (s) => {
      s.clients[3].callbacks = ["https://chatgpt.com/connector/oauth/other"];
    },
  ],
  [
    "reviewer owner",
    (s) => {
      s.clients[3].client_metadata.guteneo_managed_by = "other";
    },
  ],
  [
    "reviewer component",
    (s) => {
      s.clients[3].client_metadata.guteneo_component = "chatgpt";
    },
  ],
  [
    "reviewer ID",
    (s) => {
      s.clients[3].client_id = "other";
    },
  ],
  [
    "confidential reviewer",
    (s) => {
      s.clients[3].token_endpoint_auth_method = "client_secret_post";
    },
  ],
  [
    "duplicate reviewer",
    (s) => {
      s.clients.push({ ...s.clients[3], client_id: "duplicate" });
    },
  ],
  [
    "JWT lifetime",
    (s) => {
      s.clients[3].jwt_configuration.lifetime_in_seconds = 3601;
    },
  ],
  [
    "JWT algorithm",
    (s) => {
      s.clients[3].jwt_configuration.alg = "HS256";
    },
  ],
  [
    "API lifetime",
    (s) => {
      s.resources[0].token_lifetime_for_web = 7200;
    },
  ],
  [
    "API audience",
    (s) => {
      s.resources[0].identifier += "/";
    },
  ],
  [
    "API scope",
    (s) => {
      s.resources[0].scopes.push({ value: "admin" });
    },
  ],
  [
    "API consent",
    (s) => {
      s.resources[0].skip_consent_for_verifiable_first_party_clients = true;
    },
  ],
  [
    "other managed refresh client",
    (s) => {
      s.clients[0].grant_types.push("refresh_token");
    },
  ],
  [
    "foreign renewal allowlist",
    (s) => {
      actionSources(
        ["core_0", "core_1", "core_2"],
        "con_guteneo",
        "verified_email",
        ["core_0"],
      ).forEach((code, i) => setCode(s.actions[i], code));
    },
  ],
  [
    "wrong connection owner",
    (s) => {
      s.connections[0].metadata.guteneo_managed_by = "other";
    },
  ],
  [
    "domain connection",
    (s) => {
      s.connections[0].is_domain_connection = true;
    },
  ],
  [
    "missing reviewer association",
    (s) => {
      s.enabled.con_guteneo.pop();
    },
  ],
  [
    "foreign reviewer association",
    (s) => {
      s.enabled.con_other.push(OPENAI_REVIEW_CLIENT_ID);
    },
  ],
  [
    "reversed bindings",
    (s) => {
      s.bindings.reverse();
    },
  ],
  [
    "duplicate binding",
    (s) => {
      s.bindings.push({ id: "duplicate", action: { id: "action_0" } });
    },
  ],
  [
    "unreviewed Action draft",
    (s) => {
      s.actions[0].code += "// administrator restriction\n";
    },
  ],
  [
    "unreviewed deployed code",
    (s) => {
      s.actions[0].deployed_version.code += "// administrator restriction\n";
    },
  ],
  [
    "pending legacy draft",
    (s) => {
      s.actions[0].all_changes_deployed = false;
    },
  ],
  [
    "Action secret",
    (s) => {
      s.actions[0].secrets = [{ name: "secret" }];
    },
  ],
  [
    "Action dependency",
    (s) => {
      s.actions[0].dependencies = [{ name: "dependency" }];
    },
  ],
  [
    "Action runtime",
    (s) => {
      s.actions[0].runtime = "node18";
    },
  ],
  [
    "MFA policy",
    (s) => {
      actionSources(
        ["core_0", "core_1", "core_2"],
        "con_guteneo",
        "verified_email_and_mfa",
      ).forEach((code, i) => setCode(s.actions[i], code));
    },
  ],
  [
    "missing core client in source",
    (s) => {
      actionSources(
        ["core_0", "core_1"],
        "con_guteneo",
        "verified_email",
      ).forEach((code, i) => setCode(s.actions[i], code));
    },
  ],
  [
    "divergent source pair",
    (s) => {
      setCode(
        s.actions[1],
        actionSources(["core_0", "core_1"], "con_guteneo", "verified_email")[1],
      );
    },
  ],
  [
    "refresh grant before live gates",
    (s) => {
      s.clients[3].grant_types.push("refresh_token");
      s.clients[3].refresh_token = HOSTED_REFRESH_TOKEN_POLICY;
    },
  ],
])
  test(`refuses ${name} before any mutation`, async () => {
    const f = fixture();
    const plan = await inspect(f);
    change(f.state);
    await assert.rejects(apply(f, plan.fingerprint), {
      code: "REVIEW_RENEWAL_REQUIRES_REVIEW",
    });
    assert.deepEqual(mutations(f), []);
  });

test("fingerprint rejects valid drift in other client policy, API lifetime, connection associations and binding labels", async () => {
  for (const change of [
    (s) => {
      s.clients[4].name = "Renamed application";
    },
    (s) => {
      s.clients[4].refresh_token = { token_lifetime: 100 };
    },
    (s) => {
      s.resources[0].token_lifetime = 1800;
    },
    (s) => {
      s.enabled.con_other.push("another");
    },
    (s) => {
      s.bindings[0].display_name = "Renamed binding";
    },
  ]) {
    const f = fixture();
    const plan = await inspect(f);
    change(f.state);
    await assert.rejects(apply(f, plan.fingerprint), { code: "STATE_CHANGED" });
    assert.deepEqual(mutations(f), []);
  }
});

for (const path of [
  "actions/actions/action_0",
  "actions/actions/action_0/deploy",
  "actions/actions/action_1",
  "actions/actions/action_1/deploy",
  "resource-servers/api_guteneo",
  `clients/${OPENAI_REVIEW_CLIENT_ID}`,
]) {
  test(`failure at ${path} stops all subsequent writes without retries or provider output`, async () => {
    const f = fixture();
    const plan = await inspect(f);
    f.setBeforeCall((call) => {
      if (call.method !== "GET" && call.path === path) throw new Error(SECRET);
    });
    await assert.rejects(
      apply(f, plan.fingerprint),
      (error) =>
        error.code === "REVIEW_RENEWAL_FAILED" &&
        !error.message.includes(SECRET),
    );
    assert.equal(mutations(f).filter((call) => call.path === path).length, 1);
    assert.equal(mutations(f).at(-1).path, path);
    f.setBeforeCall(undefined);
    const recovery = await inspect(f);
    const count = mutations(f).length;
    if (recovery.fingerprint !== plan.fingerprint)
      await assert.rejects(apply(f, plan.fingerprint), {
        code: "STATE_CHANGED",
      });
    assert.equal(mutations(f).length, count);
    const result = await apply(f, recovery.fingerprint);
    assert.equal(result.configured, true);
    assert.ok(
      mutations(f)
        .slice(count)
        .every(
          (call) =>
            !["connections", "bindings", "secrets"].some((part) =>
              call.path.includes(part),
            ),
        ),
    );
    if (
      !recovery.changes.some(
        (change) => change.resource === "actions/actions/action_0",
      )
    )
      assert.ok(
        mutations(f)
          .slice(count)
          .every((call) => !call.path.startsWith("actions/actions/action_0")),
      );
  });
}

test("unknown provider success is not retried; a new inspection can recognize the exact final state", async () => {
  const f = fixture();
  const plan = await inspect(f);
  f.setBeforeCall(({ method, path, body }) => {
    if (method === "PATCH" && path === `clients/${OPENAI_REVIEW_CLIENT_ID}`) {
      Object.assign(f.state.clients[3], body);
      throw new Error(SECRET);
    }
  });
  await assert.rejects(apply(f, plan.fingerprint), {
    code: "REVIEW_RENEWAL_FAILED",
  });
  assert.equal(
    mutations(f).filter((call) => call.path.startsWith("clients/")).length,
    1,
  );
  f.setBeforeCall(undefined);
  const recovery = await inspect(f);
  assert.deepEqual(recovery.changes, []);
  const count = mutations(f).length;
  await apply(f, recovery.fingerprint);
  assert.equal(mutations(f).length, count);
});

test("concurrent untouched state drift stops before writing the next Action or enabling refresh issuance", async () => {
  for (const change of [
    (s) => {
      s.clients[4].name += " changed";
    },
    (s) => {
      s.bindings.unshift({ id: "new_binding", action: { id: "new_action" } });
    },
    (s) => {
      s.actions[1].code += "// concurrent admin edit\n";
    },
    (s) => {
      s.actions[0].supported_triggers[0].status = "changed";
    },
  ]) {
    const f = fixture();
    const plan = await inspect(f);
    f.setBeforeCall(({ method, path }) => {
      if (method === "POST" && path === "actions/actions/action_0/deploy")
        change(f.state);
    });
    await assert.rejects(apply(f, plan.fingerprint), {
      code: "REVIEW_RENEWAL_REQUIRES_REVIEW",
    });
    assert.ok(
      mutations(f).every((call) =>
        call.path.startsWith("actions/actions/action_0"),
      ),
    );
  }
});

test("a reviewed pending draft still checks its fetched live source and resumes only its remaining deployment", async () => {
  const f = fixture();
  const action = f.state.actions[0];
  action.fetchedDeployedCode = action.deployed_version.code;
  delete action.deployed_version.code;
  action.code = reviewerRenewalSources(
    ["core_0", "core_1", "core_2"],
    "con_guteneo",
  )[0];
  action.all_changes_deployed = false;
  const plan = await inspect(f);
  assert.ok(f.calls.some((call) => call.path.includes("/versions/")));
  await apply(f, plan.fingerprint);
  assert.equal(mutations(f)[0].path, "actions/actions/action_0/deploy");
  assert.equal(
    mutations(f).some(
      (call) =>
        call.method === "PATCH" && call.path === "actions/actions/action_0",
    ),
    false,
  );
});

test("a known staged draft never authorizes overwriting unknown deployed administrator code", async () => {
  const f = fixture();
  f.state.actions[0].deployed_version.code +=
    "// exact administrator restriction\n";
  f.state.actions[0].code = reviewerRenewalSources(
    ["core_0", "core_1", "core_2"],
    "con_guteneo",
  )[0];
  f.state.actions[0].all_changes_deployed = false;
  await assert.rejects(inspect(f), { code: "REVIEW_RENEWAL_REQUIRES_REVIEW" });
  assert.deepEqual(mutations(f), []);
});

test("the reviewed Actions allow only reviewer refresh for the exact resource and connection while retaining initial S256 gates", async () => {
  const executors = reviewerRenewalSources(
    ["core_0", "core_1", "core_2"],
    "con_guteneo",
  ).map((code) => {
    const context = { exports: {}, Date };
    vm.runInNewContext(code, context);
    return context.exports.onExecutePostLogin;
  });
  const event = {
    client: { client_id: OPENAI_REVIEW_CLIENT_ID },
    resource_server: { identifier: AUDIENCE },
    connection: { id: "con_guteneo" },
    user: { email_verified: true },
    transaction: { protocol: "oauth2-refresh-token" },
  };
  async function execute(value) {
    const calls = [];
    const api = {
      access: { deny: () => calls.push("deny") },
      idToken: { setCustomClaim: (key, val) => calls.push(["id", key, val]) },
      accessToken: {
        setCustomClaim: (key, val) => calls.push(["access", key, val]),
      },
    };
    for (const executor of executors) await executor(value, api);
    return calls;
  }
  assert.deepEqual(await execute(event), [
    ["id", "https://guteneo.com/verified_account", true],
    ["access", "https://guteneo.com/verified_account", true],
  ]);
  for (const change of [
    { client: { client_id: "core_0" } },
    { connection: { id: "con_other" } },
    { user: { email_verified: false } },
    { resource_server: { identifier: "https://other.invalid/mcp" } },
    { resource_server: undefined },
    { transaction: { protocol: "oidc-basic-profile" } },
  ])
    assert.ok(
      (await execute({ ...event, ...change })).every((call) => call === "deny"),
    );
  const initial = {
    ...event,
    transaction: { protocol: "oidc-basic-profile" },
    request: {
      query: { code_challenge_method: "S256", code_challenge: "a".repeat(43) },
    },
  };
  assert.equal((await execute(initial)).length, 2);
  assert.ok(
    (
      await execute({
        ...initial,
        request: {
          query: {
            code_challenge_method: "plain",
            code_challenge: "a".repeat(43),
          },
        },
      })
    ).every((call) => call === "deny"),
  );
  assert.deepEqual(
    await execute({ ...initial, resource_server: undefined }),
    [],
  );
});

test("CLI rejects apply without an exact fingerprint before invoking Auth0", () => {
  for (const args of [
    ["--apply"],
    ["--apply", "--expect", "bad"],
    ["--inspect", "--expect", "a".repeat(64)],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/enable-openai-review-renewal.mjs", ...args],
      { encoding: "utf8", env: { ...process.env, PATH: "" } },
    );
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).code, "INVALID_ARGUMENTS");
    assert.equal(result.stdout, "");
  }
});
