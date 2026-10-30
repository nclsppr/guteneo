import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import {
  actionSources,
  AUDIENCE,
  makeAuth0Api,
  SCOPES,
  SetupError,
  TENANT,
} from "../../scripts/setup-auth0.mjs";
import { CLAUDE_CLIENT_ID } from "../../scripts/enable-claude-renewal.mjs";
import { OPENAI_REVIEW_CLIENT_ID } from "../../scripts/enable-openai-review-renewal.mjs";
import { runMcpRegistration } from "../../scripts/enable-mcp-registration.mjs";

const PRIVATE = "never-print-provider-secret-or-signed-url?token=private";
const STATIC = ["browser_fixture", CLAUDE_CLIENT_ID];
const REFRESH = [OPENAI_REVIEW_CLIENT_ID, CLAUDE_CLIENT_ID];
const sources = (enabled = false) =>
  actionSources(STATIC, "con_owned", "verified_email", REFRESH, {
    nativeMcpRegistration: enabled,
  }).map((code) =>
    code.replace(
      /const ownClients = \[[^\n]*\];/,
      `const ownClients = ${JSON.stringify(STATIC)};`,
    ),
  );
function fixture() {
  const codes = sources();
  const state = {
    settings: {
      flags: { universal_login: true, unrelated_flag: false },
      resource_parameter_profile: "compatibility",
      unrelated_private_setting: PRIVATE,
    },
    clients: [
      ...STATIC.map((client_id, index) => ({
        client_id,
        global: false,
        name: `Guteneo ${index}`,
        client_metadata: { guteneo_managed_by: "guteneo-setup-v1" },
        grant_types: index
          ? ["authorization_code", "refresh_token"]
          : ["authorization_code"],
        callbacks: [PRIVATE],
        refresh_token: { token_lifetime: 777 },
        client_secret: PRIVATE,
      })),
      {
        client_id: OPENAI_REVIEW_CLIENT_ID,
        global: false,
        name: "Reviewer",
        client_metadata: { guteneo_managed_by: "guteneo-openai-review-v1" },
        grant_types: ["authorization_code", "refresh_token"],
        refresh_token: { token_lifetime: 888 },
        client_secret: PRIVATE,
      },
      {
        client_id: "unrelated",
        global: false,
        callbacks: [PRIVATE],
        grant_types: ["refresh_token"],
        client_secret: PRIVATE,
      },
    ],
    resources: [
      {
        id: "resource_mcp",
        name: "Guteneo MCP",
        identifier: AUDIENCE,
        signing_alg: "RS256",
        token_dialect: "access_token",
        token_lifetime: 3600,
        token_lifetime_for_web: 3600,
        allow_offline_access: true,
        skip_consent_for_verifiable_first_party_clients: false,
        scopes: SCOPES.map((value) => ({ value, description: value })),
        subject_type_authorization: {
          user: { policy: "allow_all" },
          client: { policy: "require_client_grant" },
        },
      },
      { id: "resource_management", identifier: `https://${TENANT}/api/v2/` },
    ],
    connections: [
      {
        id: "con_owned",
        name: "Guteneo-Accounts",
        strategy: "auth0",
        metadata: { guteneo_managed_by: "guteneo-setup-v1" },
        is_domain_connection: false,
        options: { private_setting: PRIVATE },
      },
      {
        id: "con_other",
        name: "Other",
        strategy: "google-oauth2",
        is_domain_connection: false,
      },
    ],
    enabled: {
      con_owned: [...STATIC, OPENAI_REVIEW_CLIENT_ID],
      con_other: ["unrelated"],
    },
    grants: [],
    rules: [],
    hooks: [],
    actions: codes.map((code, index) => ({
      id: `action_${index}`,
      name: [
        "Guteneo - require verified identity",
        "Guteneo - verified identity claims",
      ][index],
      code,
      status: "built",
      runtime: "node22",
      supported_triggers: [
        { id: "post-login", version: "v3", status: "CURRENT" },
      ],
      secrets: [],
      dependencies: [],
      all_changes_deployed: true,
      updated_at: "before",
      deployed_version: { id: `version_${index}`, code },
    })),
    bindings: [
      { id: "binding_0", display_name: "Identity", action: { id: "action_0" } },
      { id: "binding_1", display_name: "Claims", action: { id: "action_1" } },
    ],
  };
  const calls = [];
  let beforeCall;
  const api = {
    async request(method, path, body) {
      calls.push({ method, path, body: structuredClone(body) });
      beforeCall?.({ method, path, body });
      const endpoint = path.split("?")[0];
      if (method === "GET") {
        let result;
        if (endpoint === "tenants/settings") result = state.settings;
        else if (endpoint === "clients") result = state.clients;
        else if (endpoint === "resource-servers") result = state.resources;
        else if (endpoint === "connections") result = state.connections;
        else if (endpoint === "client-grants") result = state.grants;
        else if (endpoint === "rules") result = state.rules;
        else if (endpoint === "hooks") result = state.hooks;
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
        else if (endpoint.includes("/versions/"))
          result = state.actions.find((a) =>
            endpoint.startsWith(`actions/actions/${a.id}/versions/`),
          ).deployed_version;
        else
          result = state.actions.find(
            (a) => endpoint === `actions/actions/${a.id}`,
          );
        assert.notEqual(result, undefined, path);
        return structuredClone(result);
      }
      if (method === "PATCH" && /^actions\/actions\/[^/]+$/.test(endpoint)) {
        assert.deepEqual(Object.keys(body), ["code"]);
        Object.assign(
          state.actions.find((a) => endpoint.endsWith(a.id)),
          body,
          { all_changes_deployed: false, updated_at: "staged" },
        );
      } else if (method === "POST" && endpoint.endsWith("/deploy")) {
        const action = state.actions.find(
          (a) => endpoint === `actions/actions/${a.id}/deploy`,
        );
        action.deployed_version = {
          id: `${action.deployed_version.id}_new`,
          code: action.code,
        };
        action.all_changes_deployed = true;
        action.updated_at = "deployed";
        const binding = state.bindings.find(
          (item) => item.action.id === action.id,
        );
        if (binding) binding.action.updated_at = "derived deployment metadata";
      } else if (method === "PATCH" && endpoint === "connections/con_owned") {
        assert.deepEqual(body, { is_domain_connection: true });
        state.connections[0].is_domain_connection = true;
      } else if (method === "POST" && endpoint === "client-grants") {
        assert.deepEqual(body, {
          default_for: "third_party_clients",
          audience: AUDIENCE,
          subject_type: "user",
          scope: SCOPES,
        });
        state.grants.push({ id: "grant_default", ...structuredClone(body) });
      } else if (method === "PATCH" && endpoint === "tenants/settings") {
        assert.equal(body.dynamic_client_registration_security_mode, "strict");
        Object.assign(state.settings, structuredClone(body));
      } else
        throw new Error(`Unexpected mutation ${method} ${path} ${PRIVATE}`);
      return {};
    },
  };
  return {
    state,
    calls,
    api,
    setBeforeCall: (fn) => {
      beforeCall = fn;
    },
  };
}
const inspect = (f) => runMcpRegistration({ api: f.api });
const apply = (f, expect) =>
  runMcpRegistration({
    api: f.api,
    mode: "apply",
    expect,
    pause: async () => {},
  });
const writes = (f) => f.calls.filter((c) => c.method !== "GET");

test("inspection is inert, fingerprinted and expurgated; no registration or host qualification claimed", async () => {
  const f = fixture();
  const report = await inspect(f);
  assert.equal(writes(f).length, 0);
  assert.match(report.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.blockers, []);
  assert.equal(report.changes.length, 5);
  assert.equal(report.registrationPerformed, false);
  assert.equal(report.hostQualification, "pending");
  assert(!JSON.stringify(report).includes(PRIVATE));
  assert(!JSON.stringify(report).includes("777"));
  assert.equal(report.userConsentRequired, true);
  assert.equal(report.pkceRequired, true);
  assert.equal(report.proposedNativeSecurityMode, "strict");
  assert.equal(report.observedNativeSecurityMode, null);
  assert.equal(report.currentClientCount, 4);
  assert.equal(report.currentApplicationCount, 4);
  assert.equal(report.globalClientCount, 0);
  assert.equal(report.currentFreePlanPolicyLimit, 10);
});

test("apply deploys both exact Actions, promotes only owned connection, grants MCP user scopes, enables strict DCR last", async () => {
  const f = fixture();
  const original = structuredClone(f.state);
  const plan = await inspect(f);
  const report = await apply(f, plan.fingerprint);
  assert.equal(report.configured, true);
  assert.deepEqual(report.changes, []);
  assert.deepEqual(
    writes(f).map((c) => `${c.method} ${c.path}`),
    [
      "PATCH actions/actions/action_0",
      "POST actions/actions/action_0/deploy",
      "PATCH actions/actions/action_1",
      "POST actions/actions/action_1/deploy",
      "PATCH connections/con_owned",
      "POST client-grants",
      "PATCH tenants/settings",
    ],
  );
  assert.deepEqual(f.state.clients, original.clients);
  assert.deepEqual(f.state.resources, original.resources);
  assert.deepEqual(f.state.enabled, original.enabled);
  assert.deepEqual(
    f.state.bindings.map((binding) => ({
      ...binding,
      action: { id: binding.action.id },
    })),
    original.bindings.map((binding) => ({
      ...binding,
      action: { id: binding.action.id },
    })),
  );
  assert.deepEqual(
    f.state.connections[0].options,
    original.connections[0].options,
  );
  assert.deepEqual(f.state.connections[1], original.connections[1]);
  assert.equal(f.state.settings.unrelated_private_setting, PRIVATE);
  assert.equal(f.state.settings.flags.unrelated_flag, false);
  for (const code of f.state.actions.map((a) => a.code)) {
    assert(code.includes(`const ownClients = ${JSON.stringify(STATIC)};`));
    assert(code.includes(`const refreshClients = ${JSON.stringify(REFRESH)};`));
  }
  const count = writes(f).length;
  await apply(f, report.fingerprint);
  assert.equal(writes(f).length, count);
});

test("apply requires an explicit matching reviewed fingerprint and has no implicit consent", async () => {
  const f = fixture();
  for (const options of [
    { mode: "apply" },
    { mode: "apply", expect: "bad" },
    { mode: "inspect", expect: "a".repeat(64) },
  ])
    await assert.rejects(runMcpRegistration({ api: f.api, ...options }), {
      code: "INVALID_ARGUMENTS",
    });
  const before = await inspect(f);
  f.state.clients[0].callbacks.push("https://changed.example/callback");
  await assert.rejects(apply(f, before.fingerprint), { code: "STATE_CHANGED" });
  assert.equal(writes(f).length, 0);
});

test("missing legacy hook read evidence is a visible blocker and prevents every mutation", async () => {
  const f = fixture();
  f.setBeforeCall(({ path }) => {
    if (path.startsWith("hooks?"))
      throw new SetupError("AUTH0_CLI_FAILED", `provider withheld ${PRIVATE}`);
  });
  const report = await inspect(f);
  assert.deepEqual(report.blockers, [
    "hooks_inventory_unverified_manual_review_required",
  ]);
  assert(!JSON.stringify(report).includes(PRIVATE));
  await assert.rejects(apply(f, report.fingerprint), {
    code: "REGISTRATION_BLOCKED",
  });
  assert.equal(writes(f).length, 0);
});

test("the verified Free-plan application limit blocks open registration with only one or zero slots left", async () => {
  for (const count of [9, 10]) {
    const f = fixture();
    while (f.state.clients.length < count)
      f.state.clients.push({
        client_id: `unrelated_${f.state.clients.length}`,
        global: false,
        is_first_party: true,
      });
    const plan = await inspect(f);
    assert.equal(plan.currentClientCount, count);
    assert.equal(plan.currentApplicationCount, count);
    assert.equal(plan.proposedOpenRegistration, true);
    assert(plan.blockers.includes("capacity_requires_review"));
    await assert.rejects(apply(f, plan.fingerprint), {
      code: "REGISTRATION_BLOCKED",
    });
    assert.equal(writes(f).length, 0);
  }
});

test("capacity counts ordinary Applications using only trusted global flags while retaining all client rows in the fingerprint", async () => {
  const f = fixture();
  while (f.state.clients.length < 8)
    f.state.clients.push({
      client_id: `ordinary_${f.state.clients.length}`,
      global: false,
    });
  // Names deliberately suggest the opposite classification.
  f.state.clients[3].name = "All Applications";
  f.state.clients.push({
    client_id: "system_fixture",
    name: "An ordinary named application",
    global: true,
  });
  const plan = await inspect(f);
  assert.equal(plan.currentClientCount, 9);
  assert.equal(plan.currentApplicationCount, 8);
  assert.equal(plan.globalClientCount, 1);
  assert(!plan.blockers.includes("capacity_requires_review"));
  assert(
    f.calls.some(
      (call) =>
        call.path.startsWith("clients?") &&
        new URLSearchParams(call.path.split("?")[1])
          .get("fields")
          .split(",")
          .includes("global"),
    ),
  );
  f.state.clients[8].name = "Another system name";
  const changed = await inspect(f);
  assert.notEqual(changed.fingerprint, plan.fingerprint);
  assert.equal(changed.currentApplicationCount, 8);
  f.state.clients.push({ client_id: "ordinary_ninth", global: false });
  const full = await inspect(f);
  assert.equal(full.currentClientCount, 10);
  assert.equal(full.currentApplicationCount, 9);
  assert.equal(full.globalClientCount, 1);
  assert(full.blockers.includes("capacity_requires_review"));
  assert.equal(writes(f).length, 0);
});

test("missing or nonboolean global classification refuses capacity qualification without guessing from names", async () => {
  for (const global of [undefined, null, "false", 0]) {
    const f = fixture();
    f.state.clients[3].global = global;
    f.state.clients[3].name = "All Applications";
    await assert.rejects(inspect(f), { code: "REGISTRATION_REQUIRES_REVIEW" });
    assert.equal(writes(f).length, 0);
  }
});

for (const [name, change] of [
  [
    "active rules",
    (s) => {
      s.rules.push({ id: "rule", enabled: true, script: PRIVATE });
    },
  ],
  [
    "legacy hooks",
    (s) => {
      s.hooks.push({ id: "hook", enabled: true });
    },
  ],
])
  test(`${name} block activation without claiming a successful compatibility check`, async () => {
    const f = fixture();
    change(f.state);
    const plan = await inspect(f);
    assert.equal(plan.blockers.length, 1);
    await assert.rejects(apply(f, plan.fingerprint), {
      code: "REGISTRATION_BLOCKED",
    });
    assert.equal(writes(f).length, 0);
  });

for (const [name, change] of [
  [
    "custom draft",
    (s) => {
      s.actions[0].code += "\n// custom";
    },
  ],
  [
    "unknown deployed version",
    (s) => {
      s.actions[0].deployed_version.code += "\n// custom";
    },
  ],
  [
    "unbuilt Action",
    (s) => {
      s.actions[0].status = "pending";
    },
  ],
  [
    "Action dependency",
    (s) => {
      s.actions[0].dependencies.push({ name: "unknown" });
    },
  ],
  [
    "Action binding drift",
    (s) => {
      s.bindings.reverse();
    },
  ],
  [
    "extra active Action",
    (s) => {
      s.bindings.push({
        id: "unknown_binding",
        action: { id: "unknown_action" },
      });
    },
  ],
  [
    "another domain connection",
    (s) => {
      s.connections[1].is_domain_connection = true;
    },
  ],
  [
    "unowned account connection",
    (s) => {
      s.connections[0].metadata.guteneo_managed_by = "other";
    },
  ],
  [
    "consent disabled",
    (s) => {
      s.resources[0].skip_consent_for_verifiable_first_party_clients = true;
    },
  ],
  [
    "different API scopes",
    (s) => {
      s.resources[0].scopes.pop();
    },
  ],
  [
    "overlong access token",
    (s) => {
      s.resources[0].token_lifetime = 7200;
    },
  ],
  [
    "resource parameter disabled",
    (s) => {
      s.settings.resource_parameter_profile = "disabled";
    },
  ],
  [
    "classic login",
    (s) => {
      s.settings.flags.universal_login = false;
    },
  ],
  [
    "unknown tenant security mode",
    (s) => {
      s.settings.dynamic_client_registration_security_mode = PRIVATE;
    },
  ],
  [
    "another API",
    (s) => {
      s.resources.push({
        id: "resource_other",
        identifier: "https://other.example/api",
      });
    },
  ],
  [
    "new managed refresh issuer",
    (s) => {
      s.clients[0].grant_types.push("refresh_token");
    },
  ],
])
  test(`refuses ${name} before writing`, async () => {
    const f = fixture();
    change(f.state);
    await assert.rejects(inspect(f), { code: "REGISTRATION_REQUIRES_REVIEW" });
    assert.equal(writes(f).length, 0);
  });

for (const [name, extra] of [
  ["machine-to-machine", { subject_type: "client" }],
  ["Management API", { audience: `https://${TENANT}/api/v2/` }],
  ["all scopes", { allow_all_scopes: true }],
  ["extra scope", { scope: [...SCOPES, "read:users"] }],
  ["per-client default", { client_id: "unrelated" }],
  ["organization wildcard", { allow_any_organization: true }],
])
  test(`rejects a pre-existing ${name} third-party grant`, async () => {
    const f = fixture();
    f.state.grants.push({
      id: "grant_existing",
      default_for: "third_party_clients",
      audience: AUDIENCE,
      subject_type: "user",
      scope: [...SCOPES],
      ...extra,
    });
    await assert.rejects(inspect(f), { code: "REGISTRATION_REQUIRES_REVIEW" });
    assert.equal(writes(f).length, 0);
  });

test("concurrent callback drift detected by fresh inspection stops before the first mutation", async () => {
  const f = fixture();
  const plan = await inspect(f);
  let settingsReads = 0;
  f.setBeforeCall(({ method, path }) => {
    if (
      method === "GET" &&
      path === "tenants/settings" &&
      ++settingsReads === 2
    )
      f.state.clients[0].callbacks.push(PRIVATE);
  });
  await assert.rejects(apply(f, plan.fingerprint), {
    code: "REGISTRATION_REQUIRES_REVIEW",
  });
  assert.equal(writes(f).length, 0);
});

test("concurrent unrelated binding change after the first deployment stops before the next action", async () => {
  const f = fixture();
  const plan = await inspect(f);
  f.setBeforeCall(({ method, path }) => {
    if (method === "POST" && path.endsWith("action_0/deploy"))
      f.state.bindings[1].display_name = "changed by another admin";
  });
  await assert.rejects(apply(f, plan.fingerprint), {
    code: "REGISTRATION_REQUIRES_REVIEW",
  });
  assert.equal(writes(f).length, 2);
  assert.equal(
    f.state.settings.flags.enable_dynamic_client_registration,
    undefined,
  );
});

test("a live version or flow changed during the draft build stops before deployment", async () => {
  for (const alter of [
    (s) => {
      s.bindings[1].display_name = "other administrator";
    },
    (s) => {
      s.actions[0].deployed_version = {
        id: "version_new_admin",
        code: s.actions[0].deployed_version.code,
      };
    },
  ]) {
    const f = fixture();
    const plan = await inspect(f);
    f.setBeforeCall(({ method, path }) => {
      if (method === "PATCH" && path.endsWith("action_0")) alter(f.state);
    });
    await assert.rejects(apply(f, plan.fingerprint), {
      code: "REGISTRATION_REQUIRES_REVIEW",
    });
    assert.equal(writes(f).length, 1);
  }
});

test("a provider-shaped SetupError cannot export provider text", async () => {
  const f = fixture();
  f.setBeforeCall(() => {
    throw new SetupError("AUTH0_CLI_FAILED", PRIVATE);
  });
  await assert.rejects(
    inspect(f),
    (e) => e.code === "REGISTRATION_FAILED" && !String(e).includes(PRIVATE),
  );
  assert.equal(writes(f).length, 0);
});

test("uncertain mutation is never retried, provider output is suppressed, fresh reviewed exact staged code can resume", async () => {
  const f = fixture();
  const plan = await inspect(f);
  f.setBeforeCall(({ method, path, body }) => {
    if (method === "PATCH" && path.endsWith("action_0")) {
      Object.assign(f.state.actions[0], body, { all_changes_deployed: false });
      throw new Error(PRIVATE);
    }
  });
  await assert.rejects(
    apply(f, plan.fingerprint),
    (e) => e.code === "REGISTRATION_FAILED" && !String(e).includes(PRIVATE),
  );
  assert.equal(writes(f).length, 1);
  f.setBeforeCall(undefined);
  const next = await inspect(f);
  assert.notEqual(next.fingerprint, plan.fingerprint);
  await apply(f, next.fingerprint);
  assert.equal(
    writes(f).filter((c) => c.method === "PATCH" && c.path.endsWith("action_0"))
      .length,
    1,
  );
});

async function execute(code, event, allowIdToken) {
  const context = { exports: {}, Date };
  vm.runInNewContext(code, context);
  const calls = [];
  const api = {
    access: { deny: (message) => calls.push(["deny", message]) },
    accessToken: {
      setCustomClaim: (...args) => calls.push(["access", ...args]),
    },
  };
  if (allowIdToken)
    api.idToken = { setCustomClaim: (...args) => calls.push(["id", ...args]) };
  await context.exports.onExecutePostLogin(event, api);
  return calls;
}
const event = {
  client: { client_id: "tpc_fixture" },
  connection: { id: "con_owned" },
  resource_server: { identifier: AUDIENCE },
  user: { email_verified: true },
  transaction: { protocol: "oidc-basic-profile" },
  request: {
    query: { code_challenge_method: "S256", code_challenge: "x".repeat(43) },
  },
};
test("native code and refresh Actions use trusted tpc client identity, verified email, exact connection and audience without ID token access", async () => {
  for (const protocol of ["oidc-basic-profile", "oauth2-refresh-token"]) {
    const e = { ...event, transaction: { protocol } };
    for (const [index, code] of sources(true).entries()) {
      const calls = await execute(code, e, false);
      assert.deepEqual(
        calls,
        index ? [["access", "https://guteneo.com/verified_account", true]] : [],
      );
    }
  }
});
test("native Action denies unverified, wrong-resource, wrong-connection, missing/invalid PKCE and fake protocol cases", async () => {
  for (const change of [
    { user: { email_verified: false } },
    { user: {} },
    { connection: { id: "wrong" } },
    { resource_server: { identifier: "https://other.example" } },
    { resource_server: undefined },
    {
      request: {
        query: {
          code_challenge_method: "plain",
          code_challenge: "x".repeat(43),
        },
      },
    },
    { request: { query: {} } },
    { transaction: { protocol: "oauth2-password" } },
  ])
    for (const code of sources(true)) {
      const calls = await execute(code, { ...event, ...change }, false);
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], "deny");
    }
});
test("request metadata cannot impersonate a native client and old disabled renderer stays byte-identical", async () => {
  const e = {
    ...event,
    client: {
      client_id: "unapproved",
      metadata: { client_id: "tpc_forged", is_first_party: false },
    },
    transaction: { protocol: "oauth2-refresh-token" },
    request: {
      body: { client_id: "tpc_forged", grant_type: "authorization_code" },
    },
  };
  for (const code of sources(true))
    assert.equal((await execute(code, e, false))[0][0], "deny");
  assert.deepEqual(
    actionSources(STATIC, "con_owned", "verified_email", REFRESH),
    actionSources(STATIC, "con_owned", "verified_email", REFRESH, {
      nativeMcpRegistration: false,
    }),
  );
  for (const code of sources(false))
    assert.equal(
      (
        await execute(
          code,
          { ...event, transaction: { protocol: "oauth2-refresh-token" } },
          true,
        )
      )[0][0],
      "deny",
    );
});
test("existing reviewer and Claude refresh lists retain their access/ID claims after enabling native registration", async () => {
  for (const client_id of REFRESH)
    for (const code of sources(true).slice(1)) {
      const calls = await execute(
        code,
        {
          ...event,
          client: { client_id },
          transaction: { protocol: "oauth2-refresh-token" },
        },
        true,
      );
      assert.deepEqual(calls, [
        ["id", "https://guteneo.com/verified_account", true],
        ["access", "https://guteneo.com/verified_account", true],
      ]);
    }
  assert.throws(
    () =>
      actionSources(STATIC, "con_owned", "verified_email_and_mfa", [], {
        nativeMcpRegistration: true,
      }),
    { code: "INVALID_REGISTRATION_POLICY" },
  );
});
test("extended management transport keeps legacy hooks/rules read-only and grant operations bounded", async () => {
  const calls = [];
  const api = makeAuth0Api(async (args) => {
    calls.push(args);
    return args[0] === "tenants" ? [{ name: TENANT, active: true }] : [];
  });
  await api.request("GET", "rules?enabled=true");
  await api.request("GET", "hooks?per_page=100");
  await api.request("GET", "client-grants");
  for (const [method, path] of [
    ["POST", "rules"],
    ["PATCH", "hooks"],
    ["DELETE", "client-grants/grant"],
    ["PATCH", "client-grants/grant"],
  ])
    await assert.rejects(api.request(method, path), {
      code: "INVALID_ENDPOINT",
    });
  assert.equal(calls.filter((args) => args[0] === "api").length, 3);
});
test("CLI rejects malformed apply and consent flags before any Auth0 command", () => {
  for (const args of [
    ["--apply"],
    ["--yes"],
    ["--apply", "--expect", "invalid"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/enable-mcp-registration.mjs", ...args],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /INVALID_ARGUMENTS/);
    assert.equal(result.stdout, "");
  }
});
