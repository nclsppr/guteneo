import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  actionSources,
  AUDIENCE,
  HOSTED_REFRESH_TOKEN_POLICY,
  SCOPES,
} from "../../scripts/setup-auth0.mjs";
import {
  CLAUDE_CLIENT_ID,
  runClaudeRenewal,
} from "../../scripts/enable-claude-renewal.mjs";

const SECRET = "must-never-print-provider-secret";
const OWNER = "guteneo-setup-v1";
function fixture() {
  const state = {
    clients: [
      {
        client_id: "browser_fixture",
        name: "Guteneo - Browser",
        client_metadata: {
          guteneo_managed_by: OWNER,
          guteneo_component: "browser",
        },
        grant_types: ["authorization_code"],
        client_secret: SECRET,
      },
      {
        client_id: CLAUDE_CLIENT_ID,
        name: "Guteneo - Claude hosted",
        client_metadata: {
          guteneo_managed_by: OWNER,
          guteneo_component: "claudeHosted",
        },
        app_type: "regular_web",
        token_endpoint_auth_method: "none",
        callbacks: ["https://claude.ai/api/mcp/auth_callback"],
        grant_types: ["authorization_code"],
        jwt_configuration: { alg: "RS256", lifetime_in_seconds: 3600 },
        is_first_party: true,
        oidc_conformant: true,
        client_secret: SECRET,
      },
      {
        client_id: "unrelated_client",
        name: "Another app",
        grant_types: ["refresh_token"],
        client_secret: SECRET,
      },
    ],
    resources: [
      {
        id: "api_fixture",
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
        id: "connection_fixture",
        name: "Guteneo-Accounts",
        strategy: "auth0",
        is_domain_connection: false,
        metadata: { guteneo_managed_by: OWNER },
        options: { password: SECRET },
      },
    ],
    enabled: [
      { client_id: CLAUDE_CLIENT_ID },
      { client_id: "browser_fixture" },
    ],
    actions: actionSources(
      ["browser_fixture"],
      "connection_fixture",
      "verified_email",
    ).map((code, index) => ({
      id: `action_${index}`,
      name: [
        "Guteneo - require verified identity",
        "Guteneo - verified identity claims",
      ][index],
      code,
      all_changes_deployed: true,
      status: "built",
      runtime: "node22",
      supported_triggers: [{ id: "post-login", version: "v3" }],
      secrets: [],
      dependencies: [],
      updated_at: "2026-09-17T00:00:00Z",
      deployed_version: { id: `version_${index}`, code },
    })),
    bindings: [
      { id: "binding_unrelated", action: { id: "action_unrelated" } },
      { id: "binding_0", action: { id: "action_0" } },
      { id: "binding_1", action: { id: "action_1" } },
    ],
  };
  const calls = [];
  let beforeCall;
  const api = {
    async request(method, path, body) {
      calls.push({ method, path, body: structuredClone(body) });
      beforeCall?.({ method, path, body });
      const [endpoint] = path.split("?");
      if (method === "GET") {
        if (endpoint.includes("/versions/")) {
          const action = state.actions.find((item) =>
            endpoint.startsWith(`actions/actions/${item.id}/versions/`),
          );
          return {
            id: action.deployed_version.id,
            code: action.deployedVersionCode,
          };
        }
        const result =
          endpoint === "clients"
            ? state.clients
            : endpoint === "resource-servers"
              ? state.resources
              : endpoint === "connections"
                ? state.connections
                : endpoint.endsWith("/clients")
                  ? { clients: state.enabled }
                  : endpoint === "actions/actions"
                    ? { actions: state.actions }
                    : endpoint === "actions/triggers/post-login/bindings"
                      ? { bindings: state.bindings }
                      : state.actions.find(
                          (item) => endpoint === `actions/actions/${item.id}`,
                        );
        if (!result) throw new Error(`Unexpected fixture read: ${path}`);
        return structuredClone(result);
      }
      if (method === "PATCH" && endpoint.startsWith("actions/actions/")) {
        const action = state.actions.find(
          (item) => endpoint === `actions/actions/${item.id}`,
        );
        assert.deepEqual(Object.keys(body), ["code"]);
        Object.assign(action, body, {
          all_changes_deployed: false,
          updated_at: "2026-09-18T00:00:00Z",
        });
        return structuredClone(action);
      }
      if (method === "POST" && endpoint.endsWith("/deploy")) {
        const action = state.actions.find(
          (item) => endpoint === `actions/actions/${item.id}/deploy`,
        );
        action.all_changes_deployed = true;
        action.deployed_version.id += "_new";
        action.deployed_version.code = action.code;
        return {};
      }
      if (method === "PATCH" && endpoint === "resource-servers/api_fixture") {
        Object.assign(state.resources[0], body);
        return {};
      }
      if (method === "PATCH" && endpoint === `clients/${CLAUDE_CLIENT_ID}`) {
        Object.assign(state.clients[1], body);
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
const inspect = (f) => runClaudeRenewal({ api: f.api });
const apply = (f, expect) =>
  runClaudeRenewal({
    api: f.api,
    mode: "apply",
    expect,
    pause: async () => {},
  });

test("default inspection is GET-only, redacted, and exposes exact proposed mutations", async () => {
  const f = fixture();
  const result = await inspect(f);
  assert.deepEqual(mutations(f), []);
  assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(result.changes.length, 4);
  assert.deepEqual(result.refreshTokenPolicy, HOSTED_REFRESH_TOKEN_POLICY);
  assert.equal(result.automaticRenewalVerified, false);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.ok(
    f.calls.every(
      (call) => !/guardian|tenants|secrets|bindings.*PATCH/.test(call.path),
    ),
  );
});

test("apply deploys Actions first, preserves other resources, and reruns without writes", async () => {
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
      "PATCH resource-servers/api_fixture",
      `PATCH clients/${CLAUDE_CLIENT_ID}`,
    ],
  );
  assert.deepEqual(f.state.clients[0], original.clients[0]);
  assert.deepEqual(f.state.clients[2], original.clients[2]);
  assert.deepEqual(f.state.connections, original.connections);
  assert.deepEqual(f.state.bindings, original.bindings);
  assert.deepEqual(
    f.state.clients[1].refresh_token,
    HOSTED_REFRESH_TOKEN_POLICY,
  );
  assert.equal(f.state.resources[0].token_lifetime, 3600);
  assert.ok(
    f.state.actions.every(
      (action) =>
        action.code.includes(
          `const ownClients = ["browser_fixture","${CLAUDE_CLIENT_ID}"];`,
        ) &&
        action.code.includes(`const refreshClients = ["${CLAUDE_CLIENT_ID}"];`),
    ),
  );
  const before = mutations(f).length;
  await apply(f, result.fingerprint);
  assert.equal(mutations(f).length, before);
});

test("exact pre-renewal source remains migratable without trusting arbitrary legacy edits", async () => {
  const f = fixture();
  for (const action of f.state.actions) {
    const start = action.code.indexOf("const isRefresh =");
    const end = action.code.indexOf(
      "\n  if (event.user?.email_verified !== true) return;",
      start,
    );
    action.code =
      action.code.slice(0, start) +
      "const query = event.request?.query || {};\n  if (event.transaction?.protocol !== 'oidc-basic-profile' || query.code_challenge_method !== 'S256' || typeof query.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(query.code_challenge)) { api.access.deny('Guteneo requires an authorization code with S256 PKCE.'); return; }" +
      action.code.slice(end);
    action.code = action.code.replace(
      "const completed = !isRefresh &&",
      "const completed =",
    );
  }
  const result = await inspect(f);
  assert.equal(result.changes.length, 4);
  await apply(f, result.fingerprint);
  assert.equal(mutations(f).length, 6);
});

test("preserves Auth0 trigger metadata without enrolling other managed clients in Action enforcement", async () => {
  const f = fixture();
  for (const action of f.state.actions)
    action.supported_triggers[0].status = "CURRENT";
  f.state.clients.push({
    client_id: "new_managed_client",
    name: "Guteneo - New integration",
    client_metadata: { guteneo_managed_by: OWNER, guteneo_component: "new" },
    grant_types: ["authorization_code"],
  });
  const original = structuredClone(f.state.clients.at(-1));
  const plan = await inspect(f);
  await apply(f, plan.fingerprint);
  assert.deepEqual(f.state.clients.at(-1), original);
  for (const action of f.state.actions) {
    assert.equal(action.code.includes("new_managed_client"), false);
    assert.equal(action.supported_triggers[0].status, "CURRENT");
  }
});

for (const [name, change] of [
  [
    "callback",
    (s) => {
      s.clients[1].callbacks = ["https://attacker.invalid/callback"];
    },
  ],
  [
    "client owner",
    (s) => {
      s.clients[1].client_metadata.guteneo_managed_by = "other";
    },
  ],
  [
    "client component",
    (s) => {
      s.clients[1].client_metadata.guteneo_component = "browser";
    },
  ],
  [
    "audience",
    (s) => {
      s.resources[0].identifier = "https://other.invalid/mcp";
    },
  ],
  [
    "pending Action",
    (s) => {
      s.actions[0].all_changes_deployed = false;
    },
  ],
  [
    "custom Action source",
    (s) => {
      s.actions[0].code += "// private change\n";
    },
  ],
  [
    "MFA Action policy",
    (s) => {
      const source = actionSources(
        ["browser_fixture"],
        "connection_fixture",
        "verified_email_and_mfa",
      );
      s.actions.forEach((action, index) => {
        action.code = source[index];
      });
    },
  ],
  [
    "other managed refresh client",
    (s) => {
      s.clients[0].grant_types.push("refresh_token");
    },
  ],
  [
    "unexpected refresh allowlist",
    (s) => {
      const source = actionSources(
        ["browser_fixture"],
        "connection_fixture",
        "verified_email",
        ["browser_fixture"],
      );
      s.actions.forEach((action, index) => {
        action.code = source[index];
      });
    },
  ],
  [
    "disabled connection",
    (s) => {
      s.enabled = [];
    },
  ],
  [
    "domain connection",
    (s) => {
      s.connections[0].is_domain_connection = true;
    },
  ],
  [
    "reordered flow",
    (s) => {
      s.bindings.reverse();
    },
  ],
  [
    "extended access token",
    (s) => {
      s.resources[0].token_lifetime = 86400;
    },
  ],
  [
    "skipped consent",
    (s) => {
      s.resources[0].skip_consent_for_verifiable_first_party_clients = true;
    },
  ],
]) {
  test(`refuses ${name} before any mutation`, async () => {
    const f = fixture();
    const plan = await inspect(f);
    change(f.state);
    await assert.rejects(apply(f, plan.fingerprint), {
      code: "RENEWAL_REQUIRES_REVIEW",
    });
    assert.deepEqual(mutations(f), []);
  });
}

test("review fingerprint binds both provider state and proposed policy", async () => {
  const f = fixture();
  const plan = await inspect(f);
  f.state.resources[0].token_lifetime = 1800;
  await assert.rejects(apply(f, plan.fingerprint), { code: "STATE_CHANGED" });
  assert.deepEqual(mutations(f), []);
  await assert.rejects(apply(f), { code: "INVALID_ARGUMENTS" });
});

for (const path of [
  "actions/actions/action_0",
  "actions/actions/action_0/deploy",
  "resource-servers/api_fixture",
  `clients/${CLAUDE_CLIENT_ID}`,
]) {
  test(`provider failure at ${path} is never retried or printed`, async () => {
    const f = fixture();
    const plan = await inspect(f);
    f.setBeforeCall((call) => {
      if (call.method !== "GET" && call.path === path) throw new Error(SECRET);
    });
    await assert.rejects(
      apply(f, plan.fingerprint),
      (error) =>
        error.code === "RENEWAL_FAILED" && !error.message.includes(SECRET),
    );
    assert.equal(mutations(f).filter((call) => call.path === path).length, 1);
    assert.equal(mutations(f).at(-1).path, path);
  });
}

test("concurrent login flow change stops before enabling new refresh issuance", async () => {
  const f = fixture();
  const plan = await inspect(f);
  f.setBeforeCall(({ method, path }) => {
    if (method === "POST" && path === "actions/actions/action_1/deploy")
      f.state.bindings.unshift({
        id: "new_binding",
        action: { id: "new_action" },
      });
  });
  await assert.rejects(apply(f, plan.fingerprint), {
    code: "RENEWAL_REQUIRES_REVIEW",
  });
  assert.ok(
    mutations(f).every((call) => call.path.startsWith("actions/actions/")),
  );
});

for (const interruptedPath of [
  "actions/actions/action_1",
  "actions/actions/action_1/deploy",
]) {
  test(`a reviewed partial migration resumes after failure at ${interruptedPath}`, async () => {
    const f = fixture();
    const plan = await inspect(f);
    f.setBeforeCall(({ method, path }) => {
      if (method !== "GET" && path === interruptedPath) throw new Error(SECRET);
    });
    await assert.rejects(apply(f, plan.fingerprint), {
      code: "RENEWAL_FAILED",
    });
    f.setBeforeCall(undefined);
    const recovery = await inspect(f);
    assert.ok(
      recovery.changes.every(
        (change) => change.resource !== "actions/actions/action_0",
      ),
    );
    const beforeRecovery = mutations(f).length;
    assert.equal((await apply(f, recovery.fingerprint)).configured, true);
    const recoveryWrites = mutations(f).slice(beforeRecovery);
    assert.ok(
      recoveryWrites.every(
        (call) => !call.path.startsWith("actions/actions/action_0"),
      ),
    );
    if (interruptedPath.endsWith("/deploy"))
      assert.equal(recoveryWrites[0].path, interruptedPath);
  });
}

for (const embedded of [true, false]) {
  test(`a known pending draft cannot overwrite customized deployed code (${embedded ? "embedded" : "fetched"} version)`, async () => {
    const f = fixture();
    const candidate = actionSources(
      ["browser_fixture"],
      "connection_fixture",
      "verified_email",
      [CLAUDE_CLIENT_ID],
    );
    const action = f.state.actions[0];
    action.all_changes_deployed = false;
    action.code = candidate[0];
    if (embedded)
      action.deployed_version.code += "\n// custom published restriction\n";
    else {
      action.deployedVersionCode =
        action.deployed_version.code + "\n// custom published restriction\n";
      delete action.deployed_version.code;
    }
    await assert.rejects(apply(f, "0".repeat(64)), {
      code: "RENEWAL_REQUIRES_REVIEW",
    });
    assert.deepEqual(mutations(f), []);
  });
}

test("partial recovery fetches and fingerprints a missing deployed version source", async () => {
  const f = fixture();
  const action = f.state.actions[0];
  action.all_changes_deployed = false;
  action.deployedVersionCode = action.deployed_version.code;
  delete action.deployed_version.code;
  action.code = actionSources(
    ["browser_fixture"],
    "connection_fixture",
    "verified_email",
    [CLAUDE_CLIENT_ID],
  )[0];
  const plan = await inspect(f);
  assert.ok(
    f.calls.some(
      (call) => call.path === "actions/actions/action_0/versions/version_0",
    ),
  );
  assert.equal((await apply(f, plan.fingerprint)).configured, true);
});

test("CLI rejects an unreviewed apply before invoking Auth0", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/enable-claude-renewal.mjs", "--apply"],
    { encoding: "utf8", env: { ...process.env, PATH: "" } },
  );
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).code, "INVALID_ARGUMENTS");
  assert.equal(result.stdout, "");
});
