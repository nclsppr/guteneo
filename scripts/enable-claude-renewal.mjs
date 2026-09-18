import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  actionSources,
  AUDIENCE,
  HOSTED_REFRESH_TOKEN_POLICY,
  makeAuth0Api,
  SCOPES,
  SetupError,
  TENANT,
} from "./setup-auth0.mjs";

export const CLAUDE_CLIENT_ID = "IhJieRsvZBAnl1uJO125X2SPoIHxT8ed";
const OWNER = "guteneo-setup-v1";
const ACTION_NAMES = [
  "Guteneo - require verified identity",
  "Guteneo - verified identity claims",
];
// Exact pre-renewal verified_email renderer, with client/connection IDs normalized.
// Custom or pending Action edits require review; they are never overwritten.
const LEGACY_HASHES = [
  "82ea0208b81cfb1a8f5f938eaadfcedb1b56b723b1933c31f3557263231ce554",
  "23b0e00a4ff2278f9c1b331154b3b563d67802b87d2f490623f7a461ead7888e",
];
const fail = (code, message) => {
  throw new SetupError(code, message);
};
const requireState = (condition) => {
  if (!condition)
    fail(
      "RENEWAL_REQUIRES_REVIEW",
      "Unexpected Auth0 configuration. No further changes were made; inspect the dedicated Claude client, API, connection and login Actions.",
    );
};
const canonical = (value) =>
  JSON.stringify(value, function (key, item) {
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
function one(rows, predicate) {
  const selected = rows.filter(predicate);
  requireState(
    selected.length === 1 && validId(selected[0].id ?? selected[0].client_id),
  );
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
function clientSnapshot(client) {
  return Object.fromEntries(
    [
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
    ].map((key) => [key, client[key]]),
  );
}
function originalClients(code) {
  const match =
    typeof code === "string" && code.match(/const ownClients = (\[[^\n]*\]);/g);
  requireState(match?.length === 1);
  let clients;
  try {
    clients = JSON.parse(match[0].slice("const ownClients = ".length, -1));
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
function verifiedSourceClients(code, index, connectionId, managed) {
  const clients = originalClients(code);
  requireState(
    clients.every((id) => managed.some((item) => item.client_id === id)),
  );
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
    hash(normalized) === LEGACY_HASHES[index] ||
      [[], [CLAUDE_CLIENT_ID]].some(
        (refresh) =>
          code ===
          actionSources(clients, connectionId, "verified_email", refresh)[
            index
          ],
      ),
  );
  return clients;
}
async function inspectClaudeRenewal(api) {
  const clients = await pages(
    api,
    "clients",
    undefined,
    "&fields=client_id,name,client_metadata,app_type,token_endpoint_auth_method,callbacks,grant_types,refresh_token,jwt_configuration,is_first_party,oidc_conformant&include_fields=true",
  );
  const client = one(clients, (item) => item.client_id === CLAUDE_CLIENT_ID);
  const managed = clients.filter(
    (item) => item.client_metadata?.guteneo_managed_by === OWNER,
  );
  requireState(
    client.name === "Guteneo - Claude hosted" &&
      client.client_metadata?.guteneo_managed_by === OWNER &&
      client.client_metadata?.guteneo_component === "claudeHosted",
  );
  requireState(
    managed.filter(
      (item) => item.client_metadata?.guteneo_component === "claudeHosted",
    ).length === 1,
  );
  requireState(
    client.app_type === "regular_web" &&
      client.token_endpoint_auth_method === "none" &&
      client.is_first_party === true &&
      client.oidc_conformant === true,
  );
  requireState(
    same(client.callbacks, ["https://claude.ai/api/mcp/auth_callback"]) &&
      client.jwt_configuration?.alg === "RS256",
  );
  requireState(
    same(client.grant_types, ["authorization_code"]) ||
      same([...client.grant_types].sort(), [
        "authorization_code",
        "refresh_token",
      ]),
  );
  requireState(
    managed.every(
      (item) =>
        validId(item.client_id) &&
        (item.client_id === CLAUDE_CLIENT_ID ||
          !item.grant_types?.includes("refresh_token")),
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
      resource.skip_consent_for_verifiable_first_party_clients === false,
  );
  requireState(
    [resource.token_lifetime, resource.token_lifetime_for_web].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 3600,
    ),
  );
  requireState(
    same(
      resource.scopes?.map((item) => item.value).sort(),
      [...SCOPES].sort(),
    ) && typeof resource.allow_offline_access === "boolean",
  );
  const connection = one(
    await pages(api, "connections"),
    (item) => item.name === "Guteneo-Accounts",
  );
  requireState(
    connection.strategy === "auth0" &&
      connection.metadata?.guteneo_managed_by === OWNER &&
      connection.is_domain_connection === false,
  );
  const enabled = [];
  let next;
  for (let page = 0; page < 100; page++) {
    const response = await api.request(
      "GET",
      `connections/${connection.id}/clients?take=100${next ? `&from=${encodeURIComponent(next)}` : ""}`,
    );
    requireState(Array.isArray(response?.clients));
    enabled.push(...response.clients.map((item) => item.client_id));
    if (!response.next) break;
    requireState(
      typeof response.next === "string" && response.next !== next && page < 99,
    );
    next = response.next;
  }
  requireState(enabled.includes(CLAUDE_CLIENT_ID));
  const inventory = await pages(api, "actions/actions", "actions");
  const actions = ACTION_NAMES.map((name) =>
    one(inventory, (item) => item.name === name),
  );
  const retainedClients = [];
  const deployedSources = [];
  for (const [index, action] of actions.entries()) {
    retainedClients.push(
      ...verifiedSourceClients(action.code, index, connection.id, managed),
    );
    let deployedCode = action.code;
    if (action.all_changes_deployed !== true) {
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
      deployedCode = version.code;
      retainedClients.push(
        ...verifiedSourceClients(deployedCode, index, connection.id, managed),
      );
    }
    deployedSources.push(deployedCode);
  }
  const sources = actionSources(
    [...new Set(retainedClients)],
    connection.id,
    "verified_email",
    [CLAUDE_CLIENT_ID],
  );
  for (const [index, action] of actions.entries()) {
    // A partially completed run may have staged this exact reviewed code. It
    // may be deployed after a fresh fingerprint review; other pending edits fail.
    requireState(
      (action.all_changes_deployed === true ||
        action.code === sources[index]) &&
        action.status === "built" &&
        action.runtime === "node22" &&
        !action.secrets?.length &&
        !action.dependencies?.length,
    );
    requireState(
      action.supported_triggers?.length === 1 &&
        action.supported_triggers[0].id === "post-login" &&
        action.supported_triggers[0].version === "v3",
    );
  }
  const bindings = await pages(
    api,
    "actions/triggers/post-login/bindings",
    "bindings",
  );
  requireState(
    bindings.every(
      (binding) => validId(binding.id) && validId(binding.action?.id),
    ),
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
    clients: managed
      .map(clientSnapshot)
      .sort((a, b) => a.client_id.localeCompare(b.client_id)),
    resource: Object.fromEntries(
      [
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
      ].map((key) => [key, resource[key]]),
    ),
    connection: {
      id: connection.id,
      strategy: connection.strategy,
      metadata: connection.metadata,
      is_domain_connection: connection.is_domain_connection,
      enabled: enabled.sort(),
    },
    actions: actions.map((action, index) => ({
      id: action.id,
      code: hash(action.code),
      deployed_code: hash(deployedSources[index]),
      all_changes_deployed: action.all_changes_deployed,
      updated_at: action.updated_at,
      deployed_version: action.deployed_version?.id,
    })),
    bindings: bindings.map((binding) => ({
      id: binding.id,
      action: binding.action.id,
    })),
  };
  const changes = [
    ...actions.flatMap((action, index) =>
      action.code === sources[index] && action.all_changes_deployed === true
        ? []
        : [
            {
              resource: `actions/actions/${action.id}`,
              operation:
                action.code === sources[index]
                  ? "deploy_reviewed_code"
                  : "update_code_and_deploy",
            },
          ],
    ),
    ...(resource.allow_offline_access
      ? []
      : [
          {
            resource: `resource-servers/${resource.id}`,
            operation: "enable_offline_access",
          },
        ]),
    ...(client.grant_types.includes("refresh_token") &&
    Object.entries(HOSTED_REFRESH_TOKEN_POLICY).every(([key, value]) =>
      same(client.refresh_token?.[key], value),
    )
      ? []
      : [
          {
            resource: `clients/${CLAUDE_CLIENT_ID}`,
            operation: "enable_bounded_rotating_refresh",
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
      clientId: CLAUDE_CLIENT_ID,
      fingerprint: hash(
        canonical({ state, sources, policy: HOSTED_REFRESH_TOKEN_POLICY }),
      ),
      changes,
      refreshTokenPolicy: HOSTED_REFRESH_TOKEN_POLICY,
      accessTokenLifetimeSeconds: resource.token_lifetime,
      reconnectRequired: true,
      automaticRenewalVerified: false,
    },
  };
}
async function waitForAction(api, actionId, code, deployed, pause) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const action = await api.request("GET", `actions/actions/${actionId}`);
    requireState(action.code === code && action.status !== "failed");
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
export async function runClaudeRenewal({
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
    const before = await inspectClaudeRenewal(api);
    if (mode !== "apply") return { mode, ...before.summary };
    if (expect !== before.summary.fingerprint)
      fail(
        "STATE_CHANGED",
        "Auth0 configuration changed since review. No changes were made; inspect again.",
      );
    // Make Actions refresh-aware before enabling any new refresh-token issuance.
    for (const [index, action] of before.actions.entries()) {
      if (
        action.code === before.sources[index] &&
        action.all_changes_deployed === true
      )
        continue;
      if (action.code !== before.sources[index])
        await api.request("PATCH", `actions/actions/${action.id}`, {
          code: before.sources[index],
        });
      await waitForAction(api, action.id, before.sources[index], false, pause);
      await api.request("POST", `actions/actions/${action.id}/deploy`, {});
      await waitForAction(api, action.id, before.sources[index], true, pause);
    }
    // Recheck every guard and ensure that only our Action writes changed state.
    const prepared = await inspectClaudeRenewal(api);
    requireState(
      same(
        { ...before.state, actions: prepared.state.actions },
        prepared.state,
      ),
    );
    requireState(
      !prepared.summary.changes.some((change) =>
        change.resource.startsWith("actions/"),
      ),
    );
    if (!before.resource.allow_offline_access)
      await api.request("PATCH", `resource-servers/${before.resource.id}`, {
        allow_offline_access: true,
      });
    if (
      before.summary.changes.some(
        (change) => change.resource === `clients/${CLAUDE_CLIENT_ID}`,
      )
    )
      await api.request("PATCH", `clients/${CLAUDE_CLIENT_ID}`, {
        grant_types: ["authorization_code", "refresh_token"],
        refresh_token: HOSTED_REFRESH_TOKEN_POLICY,
      });
    const after = await inspectClaudeRenewal(api);
    requireState(
      after.summary.changes.length === 0 &&
        same(before.state.bindings, after.state.bindings),
    );
    const expectedState = structuredClone(prepared.state);
    expectedState.resource.allow_offline_access = true;
    const expectedClient = expectedState.clients.find(
      (client) => client.client_id === CLAUDE_CLIENT_ID,
    );
    const observedClient = after.state.clients.find(
      (client) => client.client_id === CLAUDE_CLIENT_ID,
    );
    expectedClient.grant_types = observedClient.grant_types;
    expectedClient.refresh_token = observedClient.refresh_token;
    requireState(same(expectedState, after.state));
    return { mode, configured: true, ...after.summary };
  } catch (error) {
    if (error instanceof SetupError) throw error;
    fail(
      "RENEWAL_FAILED",
      "Claude renewal setup failed. No mutation was retried and provider output was withheld; inspect the state before continuing.",
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
        await runClaudeRenewal({
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
        code: error instanceof SetupError ? error.code : "RENEWAL_FAILED",
        message:
          error instanceof SetupError
            ? error.message
            : "Claude renewal failed without exposing provider output.",
      }),
    );
    process.exitCode = 1;
  }
}
