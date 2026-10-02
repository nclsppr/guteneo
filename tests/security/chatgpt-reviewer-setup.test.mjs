import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import vm from "node:vm";
import {
  createClient,
  createUser,
  validateCallback,
} from "../../scripts/prepare-chatgpt-reviewer.mjs";
import { actionSources, setupPlan } from "../../scripts/setup-auth0.mjs";

const callback = "https://chatgpt.com/connector/oauth/review_fixture";
const connection = {
  id: "con_guteneo",
  name: "Guteneo-Accounts",
  strategy: "auth0",
  metadata: { guteneo_managed_by: "guteneo-setup-v1" },
};
const client = {
  client_id: "review_fixture",
  name: "Guteneo - OpenAI Review",
  client_metadata: { guteneo_managed_by: "guteneo-openai-review-v1" },
  callbacks: [callback],
  app_type: "regular_web",
  token_endpoint_auth_method: "none",
  grant_types: ["authorization_code"],
  oidc_conformant: true,
  is_first_party: true,
};

function fixture(options = {}) {
  const calls = [];
  const writes = new Map();
  const setup = setupPlan({
    authPolicy: "verified_email",
    ...options.setupOptions,
  });
  const configuredClients = setup.clients.map(({ body }, index) => ({
    ...body,
    client_id: `setup_client_${index}`,
  }));
  const deployedPlan = setupPlan({
    authPolicy: "verified_email",
    ...(options.deployedSetupOptions ?? options.setupOptions),
  });
  const sources = actionSources(
    deployedPlan.clients.map(
      ({ body }) =>
        configuredClients.find((item) => item.name === body.name).client_id,
    ),
    connection.id,
    setup.authPolicy,
  );
  const clients = [
    ...configuredClients,
    ...(options.existingClient
      ? [structuredClone(options.existingClient)]
      : []),
  ];
  const associations = {
    con_guteneo: options.dedicated ?? false,
    con_other: options.other ?? false,
  };
  const actions = [
    { id: "require_identity", name: "Guteneo - require verified identity" },
    { id: "identity_claims", name: "Guteneo - verified identity claims" },
  ];
  const request = async (method, path, body) => {
    calls.push({ method, path, body: structuredClone(body) });
    if (method === "GET" && path.startsWith("connections?"))
      return [connection, { id: "con_other" }];
    if (method === "GET" && path.startsWith("clients?")) return clients;
    if (method === "GET" && path.startsWith("users-by-email?"))
      return options.users ?? [];
    if (method === "GET" && path.startsWith("resource-servers?"))
      return [
        {
          identifier: "https://guteneo.com/mcp",
          skip_consent_for_verifiable_first_party_clients:
            options.skipConsent ?? false,
        },
      ];
    if (method === "GET" && path.startsWith("actions/actions?"))
      return { actions };
    if (method === "GET" && path.startsWith("actions/triggers/"))
      return {
        bindings: options.unbound ? [] : actions.map((action) => ({ action })),
      };
    if (method === "GET" && path.startsWith("actions/actions/")) {
      const index = actions.findIndex(
        (action) => path === `actions/actions/${action.id}`,
      );
      return {
        deployed_version: {
          code: options.actionCode
            ? options.actionCode(sources[index], index, sources)
            : sources[index],
        },
      };
    }
    if (method === "POST" && path === "clients") {
      if (options.unknownCreation)
        throw Object.assign(new Error("unknown outcome"), { code: "UNKNOWN" });
      const result = {
        ...body,
        client_id: client.client_id,
        client_secret: "fixture-secret",
      };
      clients.push(result);
      return result;
    }
    const association = /^connections\/(con_\w+)\/clients(?:\?(.*))?$/.exec(
      path,
    );
    if (association && method === "PATCH") {
      if (!options.ignoreAssociationWrites)
        associations[association[1]] = body[0].status;
      return {};
    }
    if (association && method === "GET") {
      if (
        options.checkpoint &&
        association[1] === "con_guteneo" &&
        !new URLSearchParams(association[2]).has("from")
      )
        return {
          clients: [{ client_id: "unrelated_fixture" }],
          next: "checkpoint_fixture",
        };
      return {
        clients: associations[association[1]]
          ? [{ client_id: client.client_id }]
          : [],
      };
    }
    if (method === "POST" && path === "users")
      return {
        user_id: "auth0|review_fixture",
        email_verified: false,
        identities: [{ connection: "Guteneo-Accounts" }],
        created_at: "2026-09-21T00:00:00Z",
      };
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  };
  const persist = async (path, value) => {
    const key = basename(path);
    if (writes.has(key))
      throw Object.assign(new Error("exclusive journal exists"), {
        code: "EEXIST",
      });
    writes.set(key, structuredClone(value));
  };
  return { request, persist, calls, writes, clients, sources };
}

test("reviewer callback is exact and rejects broad, normalized or foreign URLs before any request", async () => {
  assert.equal(validateCallback(callback), callback);
  for (const value of [
    "https://chatgpt.com/connector/oauth/*",
    "https://chatgpt.com/connector/oauth/a?x=1",
    "https://chatgpt.com/connector/oauth/a#x",
    "https://chatgpt.com.evil.invalid/connector/oauth/a",
    "https://chatgpt.com:443/connector/oauth/a",
    "https://user@chatgpt.com/connector/oauth/a",
    "http://chatgpt.com/connector/oauth/a",
    "https://chatgpt.com/connector/oauth/a/../b",
  ]) {
    const f = fixture();
    await assert.rejects(createClient(value, f), { code: "INVALID_CALLBACK" });
    assert.equal(f.calls.length, 0);
    assert.equal(f.writes.size, 0);
  }
});

test("client creation changes only the new client and its own connection associations", async () => {
  const f = fixture({ checkpoint: true });
  const result = await createClient(callback, f);
  assert.equal(result.associationVerified, true);
  assert.equal(result.authenticationTested, false);
  const mutations = f.calls.filter((call) => call.method !== "GET");
  assert.deepEqual(
    mutations.map(({ method, path }) => [method, path]),
    [
      ["POST", "clients"],
      ["PATCH", "connections/con_guteneo/clients"],
      ["PATCH", "connections/con_other/clients"],
    ],
  );
  assert.deepEqual(mutations[0].body.grant_types, ["authorization_code"]);
  assert.equal(mutations[0].body.token_endpoint_auth_method, "none");
  assert.deepEqual(mutations[0].body.callbacks, [callback]);
  assert.deepEqual(mutations[1].body, [
    { client_id: client.client_id, status: true },
  ]);
  assert.deepEqual(mutations[2].body, [
    { client_id: client.client_id, status: false },
  ]);
  assert.equal(
    f.writes.get("reviewer-client-result.json").associationVerified,
    true,
  );
  assert.equal(
    Object.hasOwn(
      f.clients.find((item) => item.client_id === result.clientId),
      "client_secret",
    ),
    false,
  );
  assert.ok(
    !JSON.stringify([...f.writes.values(), result]).includes("fixture-secret"),
  );
  assert.ok(
    f.calls.some((call) => call.path.includes("from=checkpoint_fixture")),
  );
});

test("an existing client is successful only after read-only policy and association qualification", async () => {
  const f = fixture({ existingClient: client, dedicated: true });
  const result = await createClient(callback, f);
  assert.equal(result.created, false);
  assert.equal(result.associationVerified, true);
  assert.ok(f.calls.every((call) => call.method === "GET"));
  assert.equal(f.writes.size, 0);
  for (const options of [
    { dedicated: false },
    { dedicated: true, other: true },
  ]) {
    const partial = fixture({ existingClient: client, ...options });
    await assert.rejects(createClient(callback, partial), {
      code: "CLIENT_ASSOCIATIONS_REQUIRE_RECONCILIATION",
    });
    assert.ok(partial.calls.every((call) => call.method === "GET"));
  }
});

test("wrong grant, missing deployed binding or skipped consent fails before mutations", async () => {
  for (const [options, code] of [
    [
      {
        existingClient: {
          ...client,
          grant_types: ["authorization_code", "password"],
        },
      },
      "EXISTING_CLIENT_REQUIRES_REVIEW",
    ],
    [{ unbound: true }, "ACTION_NOT_BOUND"],
    [{ skipConsent: true }, "RESOURCE_CONSENT_REQUIRES_REVIEW"],
  ]) {
    const f = fixture(options);
    await assert.rejects(createClient(callback, f), { code });
    assert.ok(f.calls.every((call) => call.method === "GET"));
    assert.equal(f.writes.size, 0);
  }
});

test("complete generated deployed Actions qualify with the optional hosted clients", async () => {
  const f = fixture({
    setupOptions: {
      chatgptCallback: "https://chatgpt.com/connector/oauth/existing_fixture",
      claudeCallback: "https://claude.ai/api/mcp/auth_callback",
    },
  });
  assert.equal((await createClient(callback, f)).associationVerified, true);
});

test("newer hosted registrations qualify only with a complete canonical Action pair retaining the core clients", async () => {
  const setupOptions = {
    chatgptCallback: "https://chatgpt.com/connector/oauth/existing_fixture",
    claudeCallback: "https://claude.ai/api/mcp/auth_callback",
  };
  for (const deployedSetupOptions of [
    {},
    { chatgptCallback: setupOptions.chatgptCallback },
    { claudeCallback: setupOptions.claudeCallback },
    setupOptions,
  ]) {
    const f = fixture({ setupOptions, deployedSetupOptions });
    assert.equal((await createClient(callback, f)).associationVerified, true);
  }
  for (const actionCode of [
    // Each source is individually canonical, but the pair has divergent scopes.
    (code, index) =>
      index === 1
        ? actionSources(
            ["setup_client_0", "setup_client_1", "setup_client_2"],
            connection.id,
            "verified_email",
          )[1]
        : code,
    // A canonical generator call still cannot omit one of the mandatory clients.
    (_code, index) =>
      actionSources(
        ["setup_client_0", "setup_client_1"],
        connection.id,
        "verified_email",
      )[index],
    (_code, index) =>
      actionSources(
        [
          "setup_client_0",
          "setup_client_1",
          "setup_client_2",
          "unknown_client",
        ],
        connection.id,
        "verified_email",
      )[index],
  ]) {
    const f = fixture({ setupOptions, actionCode });
    await assert.rejects(createClient(callback, f), {
      code: "DEPLOYED_ACTION_REQUIRES_REVIEW",
    });
    assert.ok(f.calls.every((call) => call.method === "GET"));
    assert.equal(f.writes.size, 0);
  }
});

test("a new client outside the historical list still requires verified email, S256 and Guteneo connection for the exact audience", async () => {
  const f = fixture();
  const execute = f.sources.map((code) => {
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
  const event = {
    client: { client_id: client.client_id },
    resource_server: { identifier: "https://guteneo.com/mcp" },
    connection: { id: connection.id },
    user: { email_verified: true },
    transaction: { protocol: "oidc-basic-profile" },
    request: {
      query: { code_challenge: "a".repeat(43), code_challenge_method: "S256" },
    },
  };
  for (const action of execute) await action(event, api);
  assert.deepEqual(calls, [
    ["id", "https://guteneo.com/verified_account", true],
    ["access", "https://guteneo.com/verified_account", true],
  ]);
  for (const change of [
    { user: { email_verified: false } },
    { connection: { id: "unrelated_connection" } },
    { request: { query: {} } },
    {
      request: {
        query: {
          code_challenge: "a".repeat(43),
          code_challenge_method: "plain",
        },
      },
    },
    { resource_server: { identifier: "https://unrelated.invalid/mcp" } },
    { resource_server: undefined },
  ]) {
    calls.length = 0;
    for (const action of execute) await action({ ...event, ...change }, api);
    assert.ok(calls.every((call) => call === "deny"));
  }
});

test("deployed Action drift, commented guards and reversed predicates fail before any mutation", async () => {
  for (const actionCode of [
    (code, index) =>
      index === 0 ? `${code}// unreviewed deployed change\n` : code,
    (code, index) =>
      index === 0
        ? `/*${code}*/\nexports.onExecutePostLogin = async () => {};\n`
        : code,
    (code, index) =>
      index === 0
        ? code.replace(
            "if (event.user?.email_verified !== true) return;",
            "// event.user?.email_verified !== true\n  if (event.user?.email_verified === true) return;",
          )
        : code,
  ]) {
    const f = fixture({ actionCode });
    await assert.rejects(createClient(callback, f), {
      code: "DEPLOYED_ACTION_REQUIRES_REVIEW",
    });
    assert.ok(f.calls.every((call) => call.method === "GET"));
    assert.equal(f.writes.size, 0);
  }
});

test("the claims Action must emit both reviewed signed claims and cannot reuse the guard Action", async () => {
  for (const actionCode of [
    (code, index) =>
      index === 1
        ? code.replace(
            "  api.idToken.setCustomClaim('https://guteneo.com/verified_account', true);\n",
            "",
          )
        : code,
    (code, index) =>
      index === 1
        ? code.replace(
            "  api.accessToken.setCustomClaim('https://guteneo.com/verified_account', true);\n",
            "",
          )
        : code,
    (code, index, sources) => (index === 1 ? sources[0] : code),
  ]) {
    const f = fixture({ actionCode });
    await assert.rejects(createClient(callback, f), {
      code: "DEPLOYED_ACTION_REQUIRES_REVIEW",
    });
    assert.ok(f.calls.every((call) => call.method === "GET"));
    assert.equal(f.writes.size, 0);
  }
});

test("ignored association writes cannot create a false ready result", async () => {
  const f = fixture({ ignoreAssociationWrites: true });
  await assert.rejects(createClient(callback, f), {
    code: "CLIENT_ASSOCIATIONS_REQUIRE_RECONCILIATION",
  });
  assert.ok(!f.writes.has("reviewer-client-result.json"));
});

test("unknown client creation is journalled before POST and cannot be blindly retried", async () => {
  const f = fixture({ unknownCreation: true });
  await assert.rejects(createClient(callback, f), { code: "UNKNOWN" });
  assert.ok(f.writes.has("reviewer-client-intent.json"));
  await assert.rejects(createClient(callback, f), { code: "EEXIST" });
  assert.equal(f.calls.filter((call) => call.method === "POST").length, 1);
});

test("existing identities in any connection are never reused or modified", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guteneo-reviewer-test-"));
  const path = join(directory, "input.json");
  try {
    await writeFile(
      path,
      JSON.stringify({ email: "synthetic-review-fixture@pieper.fr" }),
      { mode: 0o600 },
    );
    const f = fixture({
      users: [{ identities: [{ connection: "unrelated_connection" }] }],
    });
    await assert.rejects(createUser(path, f), {
      code: "EXISTING_IDENTITY_NOT_MODIFIED",
    });
    assert.ok(f.calls.every((call) => call.method === "GET"));
    assert.equal(f.writes.size, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reviewer creation remains unverified and keeps generated credentials out of the result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guteneo-reviewer-test-"));
  const path = join(directory, "input.json");
  try {
    await writeFile(
      path,
      JSON.stringify({ email: "synthetic-review-fixture@pieper.fr" }),
      { mode: 0o600 },
    );
    const f = fixture();
    const result = await createUser(path, f);
    const post = f.calls.find((call) => call.method === "POST");
    assert.equal(post.path, "users");
    assert.equal(post.body.email_verified, false);
    assert.equal(post.body.verify_email, false);
    assert.equal(
      f.writes.get("reviewer-credentials.json").password,
      post.body.password,
    );
    assert.ok(post.body.password.length >= 40);
    assert.equal(result.verified, false);
    assert.equal(result.loginQualified, false);
    assert.deepEqual(result.deliveryRestriction, {
      policy: "prepare_only",
      table: "restricted_delivery_identities",
      exactIdentityFields: ["issuer", "subject"],
      verification: "not_checked_by_this_script",
      requiredBeforeCredentialHandoff: true,
      credentialHandoffQualified: false,
    });
    assert.ok(!JSON.stringify(result).includes(post.body.password));
    assert.ok(!JSON.stringify(result).includes(post.body.email));
    assert.deepEqual(
      f.calls.filter((call) => call.method !== "GET").map((call) => call.path),
      ["users"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
