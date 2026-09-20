import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { actionSources, cliJson, setupPlan, TENANT } from "./setup-auth0.mjs";

const CONNECTION = "Guteneo-Accounts";
const OWNER = "guteneo-openai-review-v1";
const CLIENT_NAME = "Guteneo - OpenAI Review";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PRIVATE = resolve(homedir(), ".local/share/guteneo-openai-review");
const fail = (code) => {
  const error = new Error(code);
  error.code = code;
  throw error;
};
const identifier = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value))
    fail("INVALID_REFERENCE");
  return value;
};

export function validateCallback(value) {
  const url = new URL(value);
  if (
    url.href !== value ||
    url.origin !== "https://chatgpt.com" ||
    !/^\/connector\/oauth\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    fail("INVALID_CALLBACK");
  return value;
}

async function api(method, path, body) {
  const tenants = await cliJson(["tenants", "list", "--json"]);
  const active = tenants.filter((item) => item.active);
  if (active.length !== 1 || active[0].name !== TENANT) fail("WRONG_TENANT");
  if (
    !/^(users(?:-by-email)?|clients|connections|actions|resource-servers)([/?]|$)/.test(
      path,
    )
  )
    fail("INVALID_ENDPOINT");
  return cliJson(["api", method.toLowerCase(), path], body);
}

async function pages(path, collection, request = api) {
  const result = [];
  for (let page = 0; page < 100; page++) {
    const response = await request(
      "GET",
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    const rows = Array.isArray(response) ? response : response[collection];
    if (!Array.isArray(rows)) fail("INVALID_COLLECTION");
    result.push(...rows);
    if (rows.length < 100) return result;
  }
  fail("INVENTORY_LIMIT");
}

async function inventory(request = api) {
  const connections = await pages("connections", "connections", request);
  const own = connections.filter((item) => item.name === CONNECTION);
  if (
    own.length !== 1 ||
    own[0].strategy !== "auth0" ||
    own[0].metadata?.guteneo_managed_by !== "guteneo-setup-v1"
  )
    fail("CONNECTION_NOT_QUALIFIED");
  const clients = await pages(
    "clients?fields=client_id,name,callbacks,client_metadata,app_type,token_endpoint_auth_method,grant_types,oidc_conformant,is_first_party&include_fields=true",
    "clients",
    request,
  );
  const matches = clients.filter((item) => item.name === CLIENT_NAME);
  if (
    matches.length > 1 ||
    matches.some((item) => item.client_metadata?.guteneo_managed_by !== OWNER)
  )
    fail("CLIENT_OWNERSHIP_CONFLICT");
  return { connections, connection: own[0], clients, client: matches[0] };
}

async function privateJson(path, value) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryStat = await stat(directory);
  if ((directoryStat.mode & 0o077) !== 0) fail("PRIVATE_DIRECTORY_PERMISSIONS");
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n");
  } finally {
    await handle.close();
  }
}

async function inputConfig(path) {
  if (!isAbsolute(path)) fail("ABSOLUTE_PRIVATE_CONFIG_REQUIRED");
  const actual = await realpath(path);
  const inside = relative(ROOT, actual);
  if (!inside.startsWith("..") || isAbsolute(inside))
    fail("CONFIG_MUST_BE_OUTSIDE_REPOSITORY");
  if (((await stat(actual)).mode & 0o077) !== 0)
    fail("CONFIG_PERMISSIONS_REQUIRED");
  const value = JSON.parse(await readFile(actual, "utf8"));
  if (
    typeof value.email !== "string" ||
    value.email.length > 254 ||
    !/^[^\s@]+@(?:pieper\.fr|guteneo\.com)$/.test(value.email)
  )
    fail("OPERATOR_EMAIL_REQUIRED");
  return value;
}

export async function inspect({ configPath } = {}) {
  const state = await inventory();
  let account;
  if (configPath) {
    const config = await inputConfig(configPath);
    const users = await api(
      "GET",
      `users-by-email?email=${encodeURIComponent(config.email)}`,
    );
    if (!Array.isArray(users)) fail("INVALID_COLLECTION");
    const own = users.filter((item) =>
      item.identities?.some((identity) => identity.connection === CONNECTION),
    );
    account = {
      existingInDedicatedConnection: own.length,
      existingInAnyConnection: users.length,
      reviewerOwned:
        own.length === 1 && own[0].app_metadata?.guteneo_managed_by === OWNER,
      verified: own.length === 1 && own[0].email_verified === true,
    };
  }
  return {
    tenant: TENANT,
    dedicatedConnection: true,
    reviewerClient: state.client
      ? { clientId: state.client.client_id, callbacks: state.client.callbacks }
      : null,
    existingGuteneoClients: state.clients
      .filter((item) => item.name.startsWith("Guteneo"))
      .map((item) => ({
        name: item.name,
        clientId: item.client_id,
        callbacks: item.callbacks,
        tokenEndpointAuthMethod: item.token_endpoint_auth_method,
      })),
    ...(account ? { account } : {}),
    changed: false,
  };
}

export async function createUser(
  configPath,
  { request = api, persist = privateJson } = {},
) {
  const config = await inputConfig(configPath);
  await inventory(request);
  const matches = await request(
    "GET",
    `users-by-email?email=${encodeURIComponent(config.email)}`,
  );
  if (!Array.isArray(matches) || matches.length)
    fail("EXISTING_IDENTITY_NOT_MODIFIED");
  const password = `${randomBytes(30).toString("base64url")}Aa9!`;
  const credentialsPath = resolve(PRIVATE, "reviewer-credentials.json");
  // Exclusive creation precedes the request: an unknown create is never retried.
  await persist(credentialsPath, {
    tenant: TENANT,
    connection: CONNECTION,
    email: config.email,
    password,
    createdAt: new Date().toISOString(),
    verificationStatus: "not_verified",
  });
  const user = await request("POST", "users", {
    connection: CONNECTION,
    email: config.email,
    password,
    name: "Guteneo OpenAI Review",
    nickname: "OpenAI Review",
    email_verified: false,
    verify_email: false,
    app_metadata: {
      guteneo_managed_by: OWNER,
      purpose: "openai-marketplace-review",
    },
  });
  if (
    !user.user_id ||
    user.email_verified !== false ||
    !user.identities?.some((item) => item.connection === CONNECTION)
  )
    fail("CREATION_REQUIRES_RECONCILIATION");
  await persist(resolve(PRIVATE, "reviewer-user-result.json"), {
    userId: user.user_id,
    createdAt: user.created_at,
    emailVerified: false,
    verificationEmailRequested: false,
    credentialsPath,
  });
  return {
    created: true,
    credentialsPath,
    verified: false,
    loginQualified: false,
    emailRequested: false,
  };
}

async function qualifyLoginPolicy(state, request) {
  // Current Actions must already enforce the Guteneo API audience and S256.
  // This script never modifies bindings, actions, API scopes, MFA or tenant policy.
  const resources = await pages(
    "resource-servers",
    "resource_servers",
    request,
  );
  const ownResources = resources.filter(
    (item) => item.identifier === "https://guteneo.com/mcp",
  );
  if (
    ownResources.length !== 1 ||
    ownResources[0].skip_consent_for_verifiable_first_party_clients !== false
  )
    fail("RESOURCE_CONSENT_REQUIRES_REVIEW");
  const optionVariants = [{ authPolicy: "verified_email" }];
  for (const [name, callbackOption] of [
    ["Guteneo - ChatGPT", "chatgptCallback"],
    ["Guteneo - Claude hosted", "claudeCallback"],
  ]) {
    const matches = state.clients.filter((client) => client.name === name);
    if (matches.length > 1) fail("ACTION_CLIENTS_REQUIRE_REVIEW");
    if (matches.length) {
      if (
        !Array.isArray(matches[0].callbacks) ||
        matches[0].callbacks.length !== 1
      )
        fail("ACTION_CLIENTS_REQUIRE_REVIEW");
      // A hosted registration can be newer than the deployed Actions. Every
      // accepted variant retains the three original clients and audience guard.
      for (const options of [...optionVariants])
        optionVariants.push({
          ...options,
          [callbackOption]: matches[0].callbacks[0],
        });
    }
  }
  const plans = optionVariants.map(setupPlan);
  const expectedSourcePairs = plans.map((plan) => {
    const clientIds = plan.clients.map(({ body }) => {
      const matches = state.clients.filter(
        (client) => client.name === body.name,
      );
      if (
        matches.length !== 1 ||
        matches[0].client_metadata?.guteneo_managed_by !== "guteneo-setup-v1"
      )
        fail("ACTION_CLIENTS_REQUIRE_REVIEW");
      return identifier(matches[0].client_id);
    });
    return actionSources(clientIds, state.connection.id, plan.authPolicy);
  });
  const actions = await pages("actions/actions", "actions", request);
  const bindings = await pages(
    "actions/triggers/post-login/bindings",
    "bindings",
    request,
  );
  const deployedSources = [];
  for (const name of plans[0].actions) {
    const matches = actions.filter((item) => item.name === name);
    if (matches.length !== 1) fail("ACTION_NOT_QUALIFIED");
    if (!bindings.some((binding) => binding.action?.id === matches[0].id))
      fail("ACTION_NOT_BOUND");
    const action = await request(
      "GET",
      `actions/actions/${identifier(matches[0].id)}`,
    );
    deployedSources.push(action.deployed_version?.code);
  }
  // Both complete deployed sources must match the SAME canonical pair. No
  // normalization, substring evidence or arbitrary historic client list qualifies.
  if (
    !expectedSourcePairs.some((pair) =>
      pair.every((source, index) => source === deployedSources[index]),
    )
  )
    fail("DEPLOYED_ACTION_REQUIRES_REVIEW");
}

function qualifyClient(client, callback) {
  if (
    JSON.stringify(client.callbacks) !== JSON.stringify([callback]) ||
    JSON.stringify(client.grant_types) !==
      JSON.stringify(["authorization_code"]) ||
    client.token_endpoint_auth_method !== "none" ||
    client.app_type !== "regular_web" ||
    client.oidc_conformant !== true ||
    client.is_first_party !== true
  )
    fail("EXISTING_CLIENT_REQUIRES_REVIEW");
  identifier(client.client_id);
}

async function qualifyAssociations(state, clientId, request) {
  for (const connection of state.connections) {
    let cursor;
    let found = false;
    const visited = new Set();
    for (let page = 0; ; page++) {
      if (page >= 100) fail("INVENTORY_LIMIT");
      const query = new URLSearchParams({
        take: "1000",
        ...(cursor ? { from: cursor } : {}),
      });
      const response = await request(
        "GET",
        `connections/${identifier(connection.id)}/clients?${query}`,
      );
      if (!Array.isArray(response.clients)) fail("INVALID_COLLECTION");
      found ||= response.clients.some((item) => item.client_id === clientId);
      if (response.next === undefined) break;
      if (
        typeof response.next !== "string" ||
        !response.next ||
        visited.has(response.next)
      )
        fail("INVALID_PAGINATION");
      visited.add(response.next);
      cursor = response.next;
    }
    if (found !== (connection.id === state.connection.id))
      fail("CLIENT_ASSOCIATIONS_REQUIRE_RECONCILIATION");
  }
}

export async function createClient(
  callback,
  { request = api, persist = privateJson } = {},
) {
  validateCallback(callback);
  const state = await inventory(request);
  if (state.client) qualifyClient(state.client, callback);
  await qualifyLoginPolicy(state, request);
  if (state.client) {
    await qualifyAssociations(state, state.client.client_id, request);
    return {
      created: false,
      clientId: state.client.client_id,
      callback,
      associationVerified: true,
      authenticationTested: false,
      changes: [],
    };
  }
  // An exclusive journal entry prevents a blind retry after an unknown POST outcome.
  await persist(resolve(PRIVATE, "reviewer-client-intent.json"), {
    callback,
    startedAt: new Date().toISOString(),
    automaticRetryAllowed: false,
  });
  const client = await request("POST", "clients", {
    name: CLIENT_NAME,
    app_type: "regular_web",
    token_endpoint_auth_method: "none",
    callbacks: [callback],
    grant_types: ["authorization_code"],
    oidc_conformant: true,
    is_first_party: true,
    logo_uri: "https://guteneo.com/brand/guteneo-mark.png",
    description:
      "Dedicated Guteneo registration for OpenAI marketplace review. S256 PKCE and verified-account policies remain required.",
    client_metadata: {
      guteneo_managed_by: OWNER,
      guteneo_component: "openai-review",
    },
    jwt_configuration: { alg: "RS256", lifetime_in_seconds: 3600 },
  });
  const clientId = identifier(client.client_id);
  delete client.client_secret;
  await persist(resolve(PRIVATE, "reviewer-client-created.json"), {
    clientId,
    callback,
    createdAt: new Date().toISOString(),
    associationVerified: false,
  });
  for (const connection of state.connections) {
    await request("PATCH", `connections/${identifier(connection.id)}/clients`, [
      {
        client_id: clientId,
        status: connection.id === state.connection.id,
      },
    ]);
  }
  const updated = await inventory(request);
  if (!updated.client || updated.client.client_id !== clientId)
    fail("CLIENT_REQUIRES_RECONCILIATION");
  qualifyClient(updated.client, callback);
  await qualifyAssociations(updated, clientId, request);
  await persist(resolve(PRIVATE, "reviewer-client-result.json"), {
    clientId,
    callback,
    configuredAt: new Date().toISOString(),
    associationVerified: true,
    authenticationTested: false,
    tenantWideSettingsChanged: false,
  });
  return {
    created: true,
    clientId,
    callback,
    associationVerified: true,
    authenticationTested: false,
    tenantWideSettingsChanged: false,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [mode, argument] = process.argv.slice(2);
    let result;
    if (!mode)
      result = {
        offlinePlan: true,
        commands: [
          "--inspect [ABSOLUTE_PRIVATE_CONFIG_JSON]",
          "--create-user ABSOLUTE_PRIVATE_CONFIG_JSON",
          "--create-client EXACT_CHATGPT_CALLBACK",
        ],
        privateConfig: {
          requiredField: "email",
          permittedDomains: ["pieper.fr", "guteneo.com"],
          mode: "0600",
          outsideRepository: true,
        },
        identityPolicy:
          "Create an unverified dedicated database user without sending verification email. Never mark email verified. Real browser login remains separate.",
        noTenantWideChanges: true,
      };
    else if (mode === "--inspect")
      result = await inspect({ configPath: argument });
    else if (mode === "--create-user" && argument)
      result = await createUser(argument);
    else if (mode === "--create-client" && argument)
      result = await createClient(argument);
    else fail("INVALID_ARGUMENTS");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        code: error.code || "REVIEWER_SETUP_FAILED",
        detailsWithheld: true,
        blindRetryAllowed: false,
      }),
    );
    process.exitCode = 1;
  }
}
