import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  actionSources,
  AUDIENCE,
  HOSTED_REFRESH_TOKEN_POLICY,
  makeAuth0Api,
  SCOPES,
  setupPlan,
  SetupError,
  TENANT,
} from "./setup-auth0.mjs";

export const OPENAI_REVIEW_CLIENT_ID = "2vjfO7mSnP8TPMh4RRyZCx6r9D8ADXzX";
export const OPENAI_REVIEW_CALLBACK =
  "https://chatgpt.com/connector/oauth/aAwc9dso12_L";
const OWNER = "guteneo-openai-review-v1";
const SETUP_OWNER = "guteneo-setup-v1";
const ACTION_NAMES = [
  "Guteneo - require verified identity",
  "Guteneo - verified identity claims",
];
// Exact pre-renewal verified_email sources, with IDs normalized. Arbitrary
// administrator edits, including pending deployed edits, are never overwritten.
const LEGACY_HASHES = [
  "82ea0208b81cfb1a8f5f938eaadfcedb1b56b723b1933c31f3557263231ce554",
  "23b0e00a4ff2278f9c1b331154b3b563d67802b87d2f490623f7a461ead7888e",
];
const CLIENT_FIELDS = [
  "client_id",
  "name",
  "client_metadata",
  "app_type",
  "token_endpoint_auth_method",
  "callbacks",
  "grant_types",
  "refresh_token",
  "jwt_configuration",
  "is_first_party",
  "oidc_conformant",
];
const RESOURCE_FIELDS = [
  "id",
  "name",
  "identifier",
  "signing_alg",
  "token_dialect",
  "token_lifetime",
  "token_lifetime_for_web",
  "allow_offline_access",
  "skip_consent_for_verifiable_first_party_clients",
  "scopes",
];
const fail = (code, message) => {
  throw new SetupError(code, message);
};
const requireState = (condition) => {
  if (!condition)
    fail(
      "REVIEW_RENEWAL_REQUIRES_REVIEW",
      "Unexpected Auth0 configuration. Inspect the reviewer client, API, connections and both deployed and draft login Actions before continuing.",
    );
};
const canonical = (value) =>
  JSON.stringify(value, function (_key, item) {
    return item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item;
  });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const same = (a, b) => canonical(a) === canonical(b);
const validId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const project = (value, fields) =>
  Object.fromEntries(fields.map((key) => [key, value[key]]));
function one(rows, predicate, key = "id") {
  const selected = rows.filter(predicate);
  requireState(selected.length === 1 && validId(selected[0][key]));
  return selected[0];
}
async function pages(api, path, key, query = "") {
  const rows = [];
  for (let page = 0; page < 100; page++) {
    const response = await api.request(
      "GET",
      `${path}?per_page=100&page=${page}${query}`,
    );
    const part = key ? response?.[key] : response;
    requireState(Array.isArray(part));
    rows.push(...part);
    if (part.length < 100) return rows;
  }
  fail(
    "INVENTORY_LIMIT",
    "Auth0 inventory exceeded the safe inspection limit.",
  );
}

// Keep the historical initial-login client list exactly intact. The reviewer
// already reaches these gates through ownResource; only its refresh flow changes.
export function reviewerRenewalSources(clientIds, connectionId) {
  return actionSources(clientIds, connectionId, "verified_email", [
    OPENAI_REVIEW_CLIENT_ID,
  ]).map((code) =>
    code.replace(
      /const ownClients = \[[^\n]*\];/,
      `const ownClients = ${JSON.stringify(clientIds)};`,
    ),
  );
}
function originalClients(code) {
  const matches =
    typeof code === "string" && code.match(/const ownClients = (\[[^\n]*\]);/g);
  requireState(matches?.length === 1);
  let clients;
  try {
    clients = JSON.parse(matches[0].slice("const ownClients = ".length, -1));
  } catch {
    requireState(false);
  }
  requireState(
    Array.isArray(clients) &&
      clients.length > 0 &&
      clients.every(validId) &&
      new Set(clients).size === clients.length,
  );
  return clients;
}
function baselineLists(clients) {
  let variants = [{ authPolicy: "verified_email" }];
  for (const [name, option] of [
    ["Guteneo - ChatGPT", "chatgptCallback"],
    ["Guteneo - Claude hosted", "claudeCallback"],
  ]) {
    const matches = clients.filter((client) => client.name === name);
    requireState(matches.length <= 1);
    if (matches.length) {
      requireState(matches[0].callbacks?.length === 1);
      variants = [
        ...variants,
        ...variants.map((variant) => ({
          ...variant,
          [option]: matches[0].callbacks[0],
        })),
      ];
    }
  }
  return variants.map((options) =>
    setupPlan(options).clients.map(({ body }) => {
      const client = one(
        clients,
        (item) => item.name === body.name,
        "client_id",
      );
      requireState(
        client.client_metadata?.guteneo_managed_by === SETUP_OWNER &&
          client.client_metadata?.guteneo_component ===
            body.client_metadata.guteneo_component,
      );
      return client.client_id;
    }),
  );
}
function verifySource(code, index, connectionId, lists) {
  const clients = originalClients(code);
  requireState(lists.some((list) => same(list, clients)));
  const generated = actionSources(clients, connectionId, "verified_email")[
    index
  ];
  const renewed = reviewerRenewalSources(clients, connectionId)[index];
  const normalized = code
    .replace(
      /const ownClients = \[[^\n]*\];/,
      'const ownClients = ["__CLIENTS__"];',
    )
    .replace(
      `event.connection?.id !== ${JSON.stringify(connectionId)}`,
      'event.connection?.id !== "__CONNECTION__"',
    );
  requireState(
    code === generated ||
      code === renewed ||
      hash(normalized) === LEGACY_HASHES[index],
  );
  return clients;
}
function actionGuard(action) {
  requireState(
    validId(action.id) &&
      action.status === "built" &&
      action.runtime === "node22" &&
      Array.isArray(action.secrets) &&
      action.secrets.length === 0 &&
      Array.isArray(action.dependencies) &&
      action.dependencies.length === 0 &&
      action.supported_triggers?.length === 1 &&
      action.supported_triggers[0].id === "post-login" &&
      action.supported_triggers[0].version === "v3" &&
      typeof action.all_changes_deployed === "boolean",
  );
}
async function enabledClients(api, connectionId) {
  const ids = [];
  const visited = new Set();
  let next;
  for (let page = 0; page < 100; page++) {
    const response = await api.request(
      "GET",
      `connections/${connectionId}/clients?take=100${next ? `&from=${encodeURIComponent(next)}` : ""}`,
    );
    requireState(
      Array.isArray(response?.clients) &&
        response.clients.every((item) => validId(item.client_id)),
    );
    ids.push(...response.clients.map((item) => item.client_id));
    if (response.next === undefined) {
      requireState(new Set(ids).size === ids.length);
      return ids.sort();
    }
    requireState(
      typeof response.next === "string" &&
        response.next.length > 0 &&
        !visited.has(response.next),
    );
    visited.add(response.next);
    next = response.next;
  }
  fail(
    "INVENTORY_LIMIT",
    "Auth0 connection inventory exceeded the safe inspection limit.",
  );
}
async function inspectOpenAIReviewRenewal(api) {
  const clients = await pages(
    api,
    "clients",
    undefined,
    `&fields=${CLIENT_FIELDS.join(",")}&include_fields=true`,
  );
  requireState(
    clients.every((item) => validId(item.client_id)) &&
      new Set(clients.map((item) => item.client_id)).size === clients.length,
  );
  const client = one(
    clients,
    (item) => item.client_id === OPENAI_REVIEW_CLIENT_ID,
    "client_id",
  );
  requireState(
    client.name === "Guteneo - OpenAI Review" &&
      client.client_metadata?.guteneo_managed_by === OWNER &&
      client.client_metadata?.guteneo_component === "openai-review",
  );
  requireState(
    clients.filter(
      (item) =>
        item.client_metadata?.guteneo_managed_by === OWNER &&
        item.client_metadata?.guteneo_component === "openai-review",
    ).length === 1 &&
      clients.filter((item) => item.name === client.name).length === 1,
  );
  requireState(
    client.app_type === "regular_web" &&
      client.token_endpoint_auth_method === "none" &&
      client.is_first_party === true &&
      client.oidc_conformant === true &&
      same(client.callbacks, [OPENAI_REVIEW_CALLBACK]),
  );
  requireState(
    client.jwt_configuration?.alg === "RS256" &&
      Number.isInteger(client.jwt_configuration.lifetime_in_seconds) &&
      client.jwt_configuration.lifetime_in_seconds > 0 &&
      client.jwt_configuration.lifetime_in_seconds <= 3600,
  );
  const hasRefresh =
    Array.isArray(client.grant_types) &&
    same([...client.grant_types].sort(), [
      "authorization_code",
      "refresh_token",
    ]);
  requireState(
    same(client.grant_types, ["authorization_code"]) ||
      (hasRefresh && same(client.refresh_token, HOSTED_REFRESH_TOKEN_POLICY)),
  );
  // A new allowlist must never revoke another active Guteneo renewal pathway.
  // Unrelated OAuth applications remain untouched and are included in the hash.
  requireState(
    clients.every(
      (item) =>
        item.client_id === OPENAI_REVIEW_CLIENT_ID ||
        ![OWNER, SETUP_OWNER].includes(
          item.client_metadata?.guteneo_managed_by,
        ) ||
        !item.grant_types?.includes("refresh_token"),
    ),
  );
  const resource = one(
    await pages(api, "resource-servers"),
    (item) => item.identifier === AUDIENCE,
  );
  requireState(
    resource.name === "Guteneo MCP" &&
      resource.signing_alg === "RS256" &&
      resource.token_dialect === "access_token" &&
      resource.skip_consent_for_verifiable_first_party_clients === false &&
      typeof resource.allow_offline_access === "boolean",
  );
  requireState(
    [resource.token_lifetime, resource.token_lifetime_for_web].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 3600,
    ) &&
      same(
        resource.scopes?.map((item) => item.value).sort(),
        [...SCOPES].sort(),
      ),
  );
  const connections = await pages(api, "connections");
  requireState(
    connections.every((item) => validId(item.id)) &&
      new Set(connections.map((item) => item.id)).size === connections.length,
  );
  const connection = one(
    connections,
    (item) => item.name === "Guteneo-Accounts",
  );
  requireState(
    connection.strategy === "auth0" &&
      connection.metadata?.guteneo_managed_by === SETUP_OWNER &&
      connection.is_domain_connection === false,
  );
  const connectionState = [];
  for (const item of connections) {
    const enabled = await enabledClients(api, item.id);
    requireState(
      enabled.includes(OPENAI_REVIEW_CLIENT_ID) === (item.id === connection.id),
    );
    connectionState.push({
      ...project(item, [
        "id",
        "name",
        "strategy",
        "metadata",
        "is_domain_connection",
      ]),
      enabled,
    });
  }
  const lists = baselineLists(clients);
  const inventory = await pages(api, "actions/actions", "actions");
  const actions = [];
  const deployedSources = [];
  let retainedClients;
  for (const [index, name] of ACTION_NAMES.entries()) {
    const listed = one(inventory, (item) => item.name === name);
    const action = await api.request("GET", `actions/actions/${listed.id}`);
    requireState(action?.id === listed.id && action.name === name);
    actionGuard(action);
    const sourceClients = verifySource(
      action.code,
      index,
      connection.id,
      lists,
    );
    retainedClients ??= sourceClients;
    requireState(same(sourceClients, retainedClients));
    const versionId = action.deployed_version?.id;
    requireState(validId(versionId));
    const version =
      typeof action.deployed_version.code === "string"
        ? action.deployed_version
        : await api.request(
            "GET",
            `actions/actions/${action.id}/versions/${versionId}`,
          );
    requireState(version?.id === versionId);
    requireState(
      same(
        verifySource(version.code, index, connection.id, lists),
        retainedClients,
      ),
    );
    requireState(
      action.all_changes_deployed
        ? action.code === version.code
        : action.code ===
            reviewerRenewalSources(retainedClients, connection.id)[index],
    );
    actions.push(action);
    deployedSources.push(version.code);
  }
  const sources = reviewerRenewalSources(retainedClients, connection.id);
  // A client with refresh issuance must already have both reviewed Actions live.
  requireState(
    !hasRefresh ||
      (resource.allow_offline_access &&
        actions.every(
          (action, index) =>
            action.all_changes_deployed &&
            action.code === sources[index] &&
            deployedSources[index] === sources[index],
        )),
  );
  const bindings = await pages(
    api,
    "actions/triggers/post-login/bindings",
    "bindings",
  );
  requireState(
    bindings.every(
      (binding) => validId(binding.id) && validId(binding.action?.id),
    ) &&
      new Set(bindings.map((binding) => binding.id)).size === bindings.length,
  );
  const positions = actions.map((action) =>
    bindings.flatMap((binding, index) =>
      binding.action.id === action.id ? [index] : [],
    ),
  );
  requireState(
    positions.every((position) => position.length === 1) &&
      positions[0][0] < positions[1][0],
  );
  const state = {
    clients: clients
      .map((item) => project(item, CLIENT_FIELDS))
      .sort((a, b) => a.client_id.localeCompare(b.client_id)),
    resource: project(resource, RESOURCE_FIELDS),
    connections: connectionState.sort((a, b) => a.id.localeCompare(b.id)),
    actions: actions.map((action, index) => ({
      ...project(action, [
        "id",
        "name",
        "runtime",
        "status",
        "supported_triggers",
        "all_changes_deployed",
        "updated_at",
      ]),
      code: hash(action.code),
      deployed_code: hash(deployedSources[index]),
      deployed_version: action.deployed_version.id,
    })),
    bindings: bindings.map((binding) => ({
      ...project(binding, ["id", "display_name"]),
      action: binding.action.id,
    })),
  };
  const changes = [
    ...actions.flatMap((action, index) =>
      action.code === sources[index] && action.all_changes_deployed
        ? []
        : [
            {
              resource: `actions/actions/${action.id}`,
              operation:
                action.code === sources[index]
                  ? "deploy_reviewed_code"
                  : "update_code_and_deploy",
              beforeCodeSha256: hash(action.code),
              deployedCodeSha256: hash(deployedSources[index]),
              afterCodeSha256: hash(sources[index]),
            },
          ],
    ),
    ...(resource.allow_offline_access
      ? []
      : [
          {
            resource: `resource-servers/${resource.id}`,
            operation: "enable_offline_access",
            before: false,
            after: true,
          },
        ]),
    ...(hasRefresh
      ? []
      : [
          {
            resource: `clients/${OPENAI_REVIEW_CLIENT_ID}`,
            operation: "enable_bounded_rotating_refresh",
            before: { grant_types: client.grant_types },
            after: {
              grant_types: ["authorization_code", "refresh_token"],
              refresh_token: HOSTED_REFRESH_TOKEN_POLICY,
            },
          },
        ]),
  ];
  return {
    client,
    resource,
    actions,
    sources,
    state,
    summary: {
      tenant: TENANT,
      audience: AUDIENCE,
      clientId: OPENAI_REVIEW_CLIENT_ID,
      callback: OPENAI_REVIEW_CALLBACK,
      fingerprint: hash(
        canonical({
          state,
          changes,
          sources,
          policy: HOSTED_REFRESH_TOKEN_POLICY,
        }),
      ),
      changes,
      refreshTokenPolicy: HOSTED_REFRESH_TOKEN_POLICY,
      accessTokenLifetimeSeconds: resource.token_lifetime,
      reconnectRequired: true,
      automaticRenewalVerified: false,
      deliveryPolicy: "prepare_only_unchanged",
    },
  };
}
async function waitForAction(api, actionId, code, deployed, pause) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const action = await api.request("GET", `actions/actions/${actionId}`);
    requireState(
      action?.id === actionId &&
        action.code === code &&
        action.status !== "failed",
    );
    if (
      action.status === "built" &&
      (!deployed || action.all_changes_deployed === true)
    )
      return;
    await pause(1000);
  }
  fail(
    "ACTION_PENDING",
    "An Action build or deployment is pending. No mutation was retried; inspect before continuing.",
  );
}
export async function runOpenAIReviewRenewal({
  mode = "inspect",
  expect,
  api = makeAuth0Api(),
  pause = (ms) => new Promise((done) => setTimeout(done, ms)),
} = {}) {
  try {
    if (
      !["plan", "inspect", "apply"].includes(mode) ||
      (mode === "apply"
        ? !/^[a-f0-9]{64}$/.test(expect ?? "")
        : expect !== undefined)
    )
      fail(
        "INVALID_ARGUMENTS",
        "Inspect first; apply requires --apply --expect followed by the reviewed fingerprint.",
      );
    const before = await inspectOpenAIReviewRenewal(api);
    if (mode !== "apply") return { mode, ...before.summary };
    if (expect !== before.summary.fingerprint)
      fail(
        "STATE_CHANGED",
        "Auth0 configuration changed since review. No changes were made; inspect again.",
      );
    let expectedState = before.state;
    const recheck = async () => {
      const observed = await inspectOpenAIReviewRenewal(api);
      requireState(same(expectedState, observed.state));
      return observed;
    };
    const acceptActionWrite = async (index, deployed) => {
      const observed = await inspectOpenAIReviewRenewal(api);
      const expected = structuredClone(expectedState);
      const action = observed.state.actions[index];
      const previous = expected.actions[index];
      requireState(
        action.code === hash(before.sources[index]) &&
          (deployed
            ? action.all_changes_deployed &&
              action.deployed_code === action.code
            : !action.all_changes_deployed &&
              action.deployed_code === previous.deployed_code &&
              action.deployed_version === previous.deployed_version),
      );
      // Only reviewed code, deployment identity and its timestamp may change.
      for (const key of [
        "code",
        "deployed_code",
        "all_changes_deployed",
        "updated_at",
        "deployed_version",
      ])
        previous[key] = action[key];
      requireState(same(expected, observed.state));
      expectedState = observed.state;
    };
    // Deploy both refresh gates before allowing any new refresh-token issuance.
    for (const [index, action] of before.actions.entries()) {
      if (action.code === before.sources[index] && action.all_changes_deployed)
        continue;
      await recheck();
      if (action.code !== before.sources[index]) {
        await api.request("PATCH", `actions/actions/${action.id}`, {
          code: before.sources[index],
        });
        await waitForAction(
          api,
          action.id,
          before.sources[index],
          false,
          pause,
        );
        await acceptActionWrite(index, false);
        await recheck();
      }
      await api.request("POST", `actions/actions/${action.id}/deploy`, {});
      await waitForAction(api, action.id, before.sources[index], true, pause);
      await acceptActionWrite(index, true);
    }
    const prepared = await recheck();
    requireState(
      !prepared.summary.changes.some((change) =>
        change.resource.startsWith("actions/"),
      ),
    );
    if (!before.resource.allow_offline_access) {
      await api.request("PATCH", `resource-servers/${before.resource.id}`, {
        allow_offline_access: true,
      });
      expectedState = structuredClone(expectedState);
      expectedState.resource.allow_offline_access = true;
      await recheck();
    }
    if (!before.client.grant_types.includes("refresh_token")) {
      await api.request("PATCH", `clients/${OPENAI_REVIEW_CLIENT_ID}`, {
        grant_types: ["authorization_code", "refresh_token"],
        refresh_token: HOSTED_REFRESH_TOKEN_POLICY,
      });
      expectedState = structuredClone(expectedState);
      const target = expectedState.clients.find(
        (item) => item.client_id === OPENAI_REVIEW_CLIENT_ID,
      );
      target.grant_types = ["authorization_code", "refresh_token"];
      target.refresh_token = HOSTED_REFRESH_TOKEN_POLICY;
    }
    const after = await recheck();
    requireState(after.summary.changes.length === 0);
    return { mode, configured: true, ...after.summary };
  } catch (error) {
    if (error instanceof SetupError) throw error;
    fail(
      "REVIEW_RENEWAL_FAILED",
      "OpenAI reviewer renewal setup failed. No mutation was retried and provider output was withheld; inspect the state before continuing.",
    );
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    const inspect =
      args.length === 0 ||
      (args.length === 1 && ["--plan", "--inspect"].includes(args[0]));
    const apply =
      args.length === 3 && args[0] === "--apply" && args[1] === "--expect";
    if (!inspect && !apply)
      fail(
        "INVALID_ARGUMENTS",
        "Use --inspect or --apply --expect REVIEWED_FINGERPRINT.",
      );
    console.log(
      JSON.stringify(
        await runOpenAIReviewRenewal({
          mode: apply ? "apply" : "inspect",
          expect: apply ? args[2] : undefined,
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        code:
          error instanceof SetupError ? error.code : "REVIEW_RENEWAL_FAILED",
        message:
          error instanceof SetupError
            ? error.message
            : "OpenAI reviewer renewal failed without exposing provider output.",
        blindRetryAllowed: false,
      }),
    );
    process.exitCode = 1;
  }
}
