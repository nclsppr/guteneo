import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeCloudflareSecrets } from "./secure-setup.mjs";

export const TENANT = "pieper.eu.auth0.com";
export const AUDIENCE = "https://guteneo.com/mcp";
const OWNER = "guteneo-setup-v1";
const CONNECTION = "Guteneo-Accounts";
const ACTION_NAMES = [
  "Guteneo - require verified identity",
  "Guteneo - verified identity claims",
];
const LEGACY_ACTION_NAMES = [
  "Guteneo - require MFA",
  "Guteneo - verified MFA claims",
];

function authPolicy(options = {}) {
  const policy = options.authPolicy ?? "verified_email_and_mfa";
  if (!["verified_email", "verified_email_and_mfa"].includes(policy))
    fail(
      "INVALID_AUTH_POLICY",
      "Choose verified_email or verified_email_and_mfa.",
    );
  return policy;
}
function ownedAction(actions, index) {
  return unique(
    actions,
    (item) =>
      [ACTION_NAMES[index], LEGACY_ACTION_NAMES[index]].includes(item.name),
    "Action",
  );
}
export const SCOPES = [
  "documents:read",
  "documents:write",
  "dispatches:prepare",
  "dispatches:send",
  "dispatches:read",
];
export const LOGIN_SCOPES = [
  "read:tenant_settings",
  "read:guardian_factors",
  "read:clients",
  "create:clients",
  "update:clients",
  "read:client_keys",
  "read:resource_servers",
  "create:resource_servers",
  "update:resource_servers",
  "read:connections",
  "create:connections",
  "update:connections",
  "read:actions",
  "create:actions",
  "update:actions",
];

export class SetupError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function fail(code, message) {
  throw new SetupError(code, message);
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function id(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value))
    fail("INVALID_RESPONSE", "Auth0 returned an invalid resource reference.");
  return encodeURIComponent(value);
}
function list(value, key) {
  const result = Array.isArray(value) ? value : value?.[key];
  if (!Array.isArray(result))
    fail("INVALID_RESPONSE", "Auth0 returned an unexpected collection.");
  return result;
}
function unique(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length > 1)
    fail("AMBIGUOUS_RESOURCE", `Multiple ${label} resources require review.`);
  return matches[0];
}

// Child stdout can contain a client secret. It is parsed in memory only; neither
// stdout nor stderr is forwarded, and no provider response is included in errors.
export function cliJson(args, payload, spawnChild = spawn) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnChild("auth0", args, {
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks = [];
    let size = 0;
    let rejected = false;
    const error = () => {
      if (rejected) return;
      rejected = true;
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
      reject(
        new SetupError(
          "AUTH0_CLI_FAILED",
          "Auth0 command failed. Check the session, permissions and request parameters; provider output was withheld.",
        ),
      );
    };
    const timeout = setTimeout(() => {
      child.kill();
      error();
    }, 30_000);
    child.once("error", () => {
      clearTimeout(timeout);
      error();
    });
    child.stdout.on("data", (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        child.kill();
        error();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (rejected) return;
      if (code !== 0) {
        error();
        return;
      }
      const bytes = Buffer.concat(chunks);
      try {
        const raw = bytes.toString("utf8").trim();
        const value = raw ? JSON.parse(raw) : {};
        if (object(value) && (value.error || value.statusCode >= 400)) {
          error();
          return;
        }
        resolvePromise(value);
      } catch {
        error();
      } finally {
        bytes.fill(0);
        for (const chunk of chunks) chunk.fill(0);
        chunks.length = 0;
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(
      payload === undefined ? undefined : JSON.stringify(payload),
    );
  });
}

export function makeAuth0Api(run = cliJson) {
  return {
    async request(method, path, body) {
      // The installed CLI selects the active tenant. Recheck before every call
      // and never switch its selection or accept an arbitrary destination.
      const tenants = list(await run(["tenants", "list", "--json"]));
      const active = tenants.filter((tenant) => tenant.active === true);
      if (active.length !== 1 || active[0].name !== TENANT)
        fail(
          "WRONG_TENANT",
          `Select ${TENANT} in the Auth0 CLI before continuing.`,
        );
      if (
        !/^(clients|resource-servers|connections|actions|tenants\/settings|guardian\/factors)([/?]|$)/.test(
          path,
        )
      )
        fail("INVALID_ENDPOINT", "Unsupported setup endpoint.");
      return run(["api", method.toLowerCase(), path], body);
    },
  };
}

function clientSpecs(options) {
  const clients = [
    {
      key: "browser",
      name: "Guteneo - Browser",
      app_type: "regular_web",
      token_endpoint_auth_method: "client_secret_post",
      callbacks: ["https://guteneo.com/auth/callback"],
    },
    {
      key: "claudeCode",
      name: "Guteneo - Claude Code",
      app_type: "native",
      token_endpoint_auth_method: "none",
      callbacks: ["http://localhost:8788/callback"],
    },
    {
      key: "cursor",
      name: "Guteneo - Cursor",
      app_type: "native",
      token_endpoint_auth_method: "none",
      callbacks: [
        "http://localhost:8787/callback",
        "https://www.cursor.com/agents/mcp/oauth/callback",
      ],
    },
  ];
  for (const [key, callback, host, pattern] of [
    [
      "chatgpt",
      options.chatgptCallback,
      "chatgpt.com",
      /^\/(?:connector\/oauth\/[A-Za-z0-9_-]{1,200}|connector_platform_oauth_redirect)$/,
    ],
    [
      "claudeHosted",
      options.claudeCallback,
      "claude.ai",
      /^\/api\/mcp\/auth_callback$/,
    ],
  ]) {
    if (callback === undefined) continue;
    let url;
    try {
      url = new URL(callback);
    } catch {
      fail(
        "INVALID_CALLBACK",
        "Copy the exact callback from the assistant's connection setup.",
      );
    }
    if (
      url.href !== callback ||
      url.protocol !== "https:" ||
      url.host !== host ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !pattern.test(url.pathname)
    )
      fail(
        "INVALID_CALLBACK",
        "The callback is outside the documented assistant endpoints.",
      );
    clients.push({
      key,
      name: `Guteneo - ${key === "chatgpt" ? "ChatGPT" : "Claude hosted"}`,
      app_type: "regular_web",
      token_endpoint_auth_method: "none",
      callbacks: [callback],
    });
  }
  return clients.map(({ key, ...client }) => ({
    key,
    body: {
      ...client,
      logo_uri: "https://guteneo.com/brand/guteneo-portrait.png",
      description:
        "Guteneo-owned OAuth registration. Consent and browser approval remain required.",
      client_metadata: { guteneo_managed_by: OWNER, guteneo_component: key },
      is_first_party: true,
      oidc_conformant: true,
      grant_types: ["authorization_code"],
      jwt_configuration: { alg: "RS256", lifetime_in_seconds: 3600 },
      ...(key === "browser"
        ? {
            allowed_logout_urls: ["https://guteneo.com/"],
            web_origins: ["https://guteneo.com"],
          }
        : {}),
    },
  }));
}

export function setupPlan(options = {}) {
  const policy = authPolicy(options);
  return {
    mode: "plan",
    tenant: TENANT,
    audience: AUDIENCE,
    authPolicy: policy,
    resourceServer: {
      name: "Guteneo MCP",
      identifier: AUDIENCE,
      signing_alg: "RS256",
      token_dialect: "access_token",
      token_lifetime: 3600,
      token_lifetime_for_web: 3600,
      allow_offline_access: false,
      skip_consent_for_verifiable_first_party_clients: false,
      scopes: SCOPES.map((value) => ({
        value,
        description: value.replaceAll(":", " · "),
      })),
    },
    clients: clientSpecs(options),
    connection: {
      name: CONNECTION,
      strategy: "auth0",
      is_domain_connection: false,
      metadata: { guteneo_managed_by: OWNER },
      options: {
        disable_signup: false,
        requires_username: false,
        brute_force_protection: true,
      },
    },
    actions: ACTION_NAMES,
    prerequisites: [
      "Official CLI login to the exact tenant with documented management scopes",
      "resource_parameter_profile = compatibility",
      ...(policy === "verified_email_and_mfa"
        ? ["customize_mfa_in_postlogin_action = true", "OTP factor enabled"]
        : [
            "Application AUTH0_AUTH_POLICY = verified_email; signed verified-account claim required",
          ]),
      "Existing Action bindings must be preservable without replacing private binding configuration",
    ],
    cloudflareSecretNames: [
      "AUTH0_DOMAIN",
      "AUTH0_AUDIENCE",
      "AUTH0_CLIENT_ID",
      "AUTH0_CLIENT_SECRET",
    ],
    pendingCallbacks: [
      !options.chatgptCallback && "ChatGPT exact callback",
      !options.claudeCallback && "Claude hosted exact callback",
    ].filter(Boolean),
    refreshTokens:
      "Not enabled in this initial setup; reconnect after one hour.",
    humanLoginVerified: false,
  };
}

export function actionSources(
  clientIds,
  connectionId,
  policy = "verified_email_and_mfa",
) {
  authPolicy({ authPolicy: policy });
  if (!Array.isArray(clientIds) || !clientIds.length)
    fail("INVALID_CLIENTS", "OAuth clients are required.");
  clientIds.forEach(id);
  id(connectionId);
  const scope = `const ownClients = ${JSON.stringify(clientIds)};\n  const ownResource = event.resource_server?.identifier === ${JSON.stringify(AUDIENCE)};\n  if (!ownClients.includes(event.client?.client_id) && !ownResource) return;\n  if (event.connection?.id !== ${JSON.stringify(connectionId)}) { api.access.deny('Use the Guteneo account connection.'); return; }`;
  const pkce = `const query = event.request?.query || {};\n  if (event.transaction?.protocol !== 'oidc-basic-profile' || query.code_challenge_method !== 'S256' || typeof query.code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(query.code_challenge)) { api.access.deny('Guteneo requires an authorization code with S256 PKCE.'); return; }`;
  const challenge =
    policy === "verified_email_and_mfa"
      ? `const factors = (event.user.enrolledFactors || []).filter((factor) => ['otp','webauthn-roaming','webauthn-platform','push-notification','phone','duo'].includes(factor.type));\n  if (factors.length) api.authentication.challengeWithAny(factors.map(({type}) => ({type})));\n  else api.authentication.enrollWith({type:'otp'});`
      : "// Free beta: verified account required; no paid MFA enrollment.";
  const requireMfa =
    policy === "verified_email_and_mfa"
      ? "if (!completed) { api.access.deny('Complete multi-factor authentication to access Guteneo.'); return; }"
      : "";
  return [
    `// ${OWNER}\nexports.onExecutePostLogin = async (event, api) => {\n  ${scope}\n  ${pkce}\n  if (event.user?.email_verified !== true) return;\n  ${challenge}\n};\n`,
    `// ${OWNER}\nexports.onExecutePostLogin = async (event, api) => {\n  ${scope}\n  ${pkce}\n  if (event.user?.email_verified !== true) return;\n  const completed = (event.authentication?.methods || []).some((method) => method.name === 'mfa' && Number.isFinite(Date.parse(method.timestamp)) && Date.now() - Date.parse(method.timestamp) >= -30000 && Date.now() - Date.parse(method.timestamp) <= 300000);\n  ${requireMfa}\n  api.idToken.setCustomClaim('https://guteneo.com/verified_account', true);\n  api.accessToken.setCustomClaim('https://guteneo.com/verified_account', true);\n  if (completed) {\n    api.idToken.setCustomClaim('https://guteneo.com/mfa', true);\n    api.accessToken.setCustomClaim('https://guteneo.com/mfa', true);\n  }\n};\n`,
  ];
}

async function pages(api, path, key, extra = {}) {
  const items = [];
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({
      per_page: "100",
      page: String(page),
      ...extra,
    });
    const part = list(await api.request("GET", `${path}?${params}`), key);
    items.push(...part);
    if (part.length < 100) return items;
  }
  fail("INVENTORY_LIMIT", "Tenant inventory exceeded the safe setup limit.");
}
function bindingRefs(bindings, ownIds = []) {
  return bindings
    .filter((binding) => !ownIds.includes(binding.action?.id))
    .map((binding) => {
      if (!binding.id || !binding.action?.id)
        fail(
          "BINDINGS_REQUIRE_REVIEW",
          "An existing binding has no reusable identity. Review the flow before appending Guteneo Actions.",
        );
      id(binding.action.id);
      id(binding.id);
      return {
        ref: { type: "binding_id", value: binding.id },
        display_name: binding.display_name || binding.action.name,
      };
    });
}

export async function inspectSetup(api, options = {}) {
  const plan = setupPlan(options);
  // Auth0 returns these current settings, but its fields query allowlist rejects
  // some of their names. Keep the full response private and inspect only below.
  const settings = await api.request("GET", "tenants/settings");
  const factors = list(await api.request("GET", "guardian/factors"));
  const blockers = [];
  if (settings.resource_parameter_profile !== "compatibility")
    blockers.push("resource_parameter_profile");
  if (
    plan.authPolicy === "verified_email_and_mfa" &&
    settings.customize_mfa_in_postlogin_action !== true
  )
    blockers.push("customize_mfa_in_postlogin_action");
  if (
    plan.authPolicy === "verified_email_and_mfa" &&
    !factors.some((factor) => factor.name === "otp" && factor.enabled === true)
  )
    blockers.push("otp_factor");
  if (
    options.chatgptCallback?.endsWith("/connector_platform_oauth_redirect") &&
    settings.authorization_response_iss_parameter_supported !== true
  )
    blockers.push("chatgpt_callback_requires_response_iss");
  const clients = await pages(api, "clients", undefined, {
    fields: "client_id,name,client_metadata",
    include_fields: "true",
  });
  const resources = await pages(api, "resource-servers");
  // is_domain_connection exists in responses but not in the fields allowlist.
  // Keep connection options private while inspecting their ownership guards.
  const connections = await pages(api, "connections");
  const actions = await pages(api, "actions/actions", "actions");
  const bindings = await pages(
    api,
    "actions/triggers/post-login/bindings",
    "bindings",
  );
  try {
    bindingRefs(bindings);
  } catch (error) {
    if (error instanceof SetupError) blockers.push(error.code);
    else throw error;
  }
  const trigger = list(
    await api.request("GET", "actions/triggers"),
    "triggers",
  ).find(
    (item) => item.id === "post-login" && item.runtimes?.includes("node22"),
  );
  if (!trigger?.version) blockers.push("post_login_node22_runtime");
  for (const spec of plan.clients) {
    const found = unique(
      clients,
      (client) => client.name === spec.body.name,
      "client",
    );
    if (
      found &&
      (found.client_metadata?.guteneo_managed_by !== OWNER ||
        found.client_metadata?.guteneo_component !== spec.key)
    )
      blockers.push(`unowned_client_${spec.key}`);
  }
  const resource = unique(
    resources,
    (item) => item.identifier === AUDIENCE,
    "API",
  );
  if (resource && resource.name !== plan.resourceServer.name)
    blockers.push("unowned_api");
  const connection = unique(
    connections,
    (item) => item.name === CONNECTION,
    "database connection",
  );
  if (
    connection &&
    (connection.metadata?.guteneo_managed_by !== OWNER ||
      connection.strategy !== "auth0" ||
      connection.options?.disable_signup === true ||
      connection.is_domain_connection === true)
  )
    blockers.push("unowned_or_incompatible_database_connection");
  for (let index = 0; index < ACTION_NAMES.length; index++) {
    const action = ownedAction(actions, index);
    if (action && !action.code?.startsWith(`// ${OWNER}\n`))
      blockers.push("unowned_action");
  }
  return {
    plan,
    blockers,
    clients,
    resource,
    connection,
    connections,
    actions,
    bindings,
    trigger,
  };
}

async function ensureBuilt(api, actionId) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const action = await api.request("GET", `actions/actions/${id(actionId)}`);
    if (action.status === "built") return;
    if (action.status === "failed")
      fail(
        "ACTION_BUILD_FAILED",
        "A Guteneo Action did not build; no raw build output was displayed.",
      );
    await new Promise((done) => setTimeout(done, 1000));
  }
  fail(
    "ACTION_BUILD_PENDING",
    "The Action build has not completed. Inspect then rerun; no mutation was retried.",
  );
}

export async function runSetup({
  mode = "plan",
  options = {},
  api = makeAuth0Api(),
  writer = writeCloudflareSecrets,
} = {}) {
  if (mode === "plan") return setupPlan(options);
  if (!["inspect", "apply"].includes(mode))
    fail("INVALID_MODE", "Use plan, inspect or apply.");
  const inventory = await inspectSetup(api, options);
  const summary = {
    mode,
    tenant: TENANT,
    blockers: inventory.blockers,
    counts: {
      clients: inventory.clients.filter(
        (item) => item.client_metadata?.guteneo_managed_by === OWNER,
      ).length,
      actions: inventory.actions.filter((item) =>
        [...ACTION_NAMES, ...LEGACY_ACTION_NAMES].includes(item.name),
      ).length,
    },
    humanLoginVerified: false,
  };
  if (mode === "inspect") return summary;
  if (inventory.blockers.length)
    fail(
      "PREREQUISITES_REQUIRED",
      `Setup made no changes. Resolve these inspected prerequisites: ${inventory.blockers.join(", ")}. Tenant-wide settings are never changed by this utility.`,
    );
  const { plan } = inventory;
  const clientIds = {};
  for (const spec of plan.clients) {
    const existing = inventory.clients.find(
      (client) => client.name === spec.body.name,
    );
    const client = await api.request(
      existing ? "PATCH" : "POST",
      existing ? `clients/${id(existing.client_id)}` : "clients",
      spec.body,
    );
    clientIds[spec.key] = client.client_id || existing?.client_id;
    id(clientIds[spec.key]);
    if (object(client)) delete client.client_secret;
  }
  if (inventory.resource) {
    const body = { ...plan.resourceServer };
    delete body.identifier;
    await api.request(
      "PATCH",
      `resource-servers/${id(inventory.resource.id)}`,
      body,
    );
  } else await api.request("POST", "resource-servers", plan.resourceServer);
  const connection =
    inventory.connection ||
    (await api.request("POST", "connections", plan.connection));
  id(connection.id);
  // Dedicated connection associations are added independently. Unrelated
  // connection configuration and existing enabled clients are never replaced.
  await api.request(
    "PATCH",
    `connections/${id(connection.id)}/clients`,
    Object.values(clientIds).map((client_id) => ({ client_id, status: true })),
  );
  for (const other of inventory.connections.filter(
    (item) => item.id !== connection.id,
  )) {
    await api.request(
      "PATCH",
      `connections/${id(other.id)}/clients`,
      Object.values(clientIds).map((client_id) => ({
        client_id,
        status: false,
      })),
    );
  }
  const sources = actionSources(
    Object.values(clientIds),
    connection.id,
    plan.authPolicy,
  );
  const actionIds = [];
  for (let index = 0; index < ACTION_NAMES.length; index++) {
    const existing = ownedAction(inventory.actions, index);
    const body = {
      name: ACTION_NAMES[index],
      code: sources[index],
      runtime: "node22",
      supported_triggers: [
        { id: "post-login", version: inventory.trigger.version },
      ],
      dependencies: [],
      secrets: [],
    };
    const action = await api.request(
      existing ? "PATCH" : "POST",
      existing ? `actions/actions/${id(existing.id)}` : "actions/actions",
      body,
    );
    const actionId = action.id || existing?.id;
    id(actionId);
    actionIds.push(actionId);
    await ensureBuilt(api, actionId);
    await api.request("POST", `actions/actions/${id(actionId)}/deploy`, {});
  }
  const currentBindings = await pages(
    api,
    "actions/triggers/post-login/bindings",
    "bindings",
  );
  const original = bindingRefs(inventory.bindings, actionIds);
  if (
    JSON.stringify(bindingRefs(currentBindings, actionIds)) !==
    JSON.stringify(original)
  )
    fail(
      "BINDINGS_CHANGED",
      "Another administrator changed the login flow. Rerun inspection before attaching Guteneo Actions.",
    );
  await api.request("PATCH", "actions/triggers/post-login/bindings", {
    bindings: [
      ...original,
      ...actionIds.map((value, index) => ({
        ref: currentBindings.some((binding) => binding.action?.id === value)
          ? {
              type: "binding_id",
              value: currentBindings.find(
                (binding) => binding.action?.id === value,
              ).id,
            }
          : { type: "action_id", value },
        display_name: ACTION_NAMES[index],
      })),
    ],
  });
  const verifiedBindings = await pages(
    api,
    "actions/triggers/post-login/bindings",
    "bindings",
  );
  const expectedIds = [
    ...inventory.bindings
      .filter((binding) => !actionIds.includes(binding.action?.id))
      .map((binding) => binding.action.id),
    ...actionIds,
  ];
  if (
    JSON.stringify(verifiedBindings.map((item) => item.action?.id)) !==
    JSON.stringify(expectedIds)
  )
    fail(
      "BINDINGS_UNVERIFIED",
      "Login flow order could not be verified; Cloudflare secrets were not uploaded.",
    );
  let credentials;
  const values = {};
  try {
    credentials = await api.request(
      "GET",
      `clients/${id(clientIds.browser)}?fields=client_id%2Cclient_secret&include_fields=true`,
    );
    if (
      credentials.client_id !== clientIds.browser ||
      typeof credentials.client_secret !== "string" ||
      credentials.client_secret.length < 16
    )
      fail(
        "SECRET_UNAVAILABLE",
        "The browser client secret could not be read securely. Check read:client_keys permission.",
      );
    Object.assign(values, {
      AUTH0_DOMAIN: TENANT,
      AUTH0_AUDIENCE: AUDIENCE,
      AUTH0_CLIENT_ID: clientIds.browser,
      AUTH0_CLIENT_SECRET: credentials.client_secret,
    });
    await writer(values, "wrangler.live.jsonc");
  } catch (error) {
    if (error instanceof SetupError) throw error;
    fail(
      "CLOUDFLARE_SECRET_UPLOAD_FAILED",
      "Auth0 configuration exists but Cloudflare secret import failed. Rerun after checking Cloudflare access; no secret was logged.",
    );
  } finally {
    if (credentials) delete credentials.client_secret;
    for (const key of Object.keys(values)) {
      values[key] = "";
      delete values[key];
    }
  }
  return {
    ...summary,
    blockers: [],
    configured: true,
    clientIds,
    connectionId: connection.id,
    actionIds,
    cloudflareSecretsUploaded: true,
    humanLoginVerified: false,
    assistantLoginVerified: false,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    let mode = "plan";
    const options = {};
    for (let i = 0; i < args.length; i++) {
      if (["--apply", "--inspect"].includes(args[i])) {
        if (mode !== "plan")
          fail("INVALID_ARGUMENTS", "Choose one setup mode.");
        mode = args[i].slice(2);
      } else if (args[i] === "--auth-policy") {
        if (options.authPolicy || !args[i + 1])
          fail("INVALID_ARGUMENTS", "Supply one auth policy.");
        options.authPolicy = args[++i];
        authPolicy(options);
      } else if (
        ["--chatgpt-callback", "--claude-callback"].includes(args[i])
      ) {
        const key =
          args[i] === "--chatgpt-callback"
            ? "chatgptCallback"
            : "claudeCallback";
        if (options[key] || !args[i + 1])
          fail("INVALID_ARGUMENTS", "Each callback requires one exact value.");
        options[key] = args[++i];
      } else
        fail(
          "INVALID_ARGUMENTS",
          "Supported arguments: --inspect, --apply, --auth-policy POLICY, --chatgpt-callback URL, --claude-callback URL.",
        );
    }
    console.log(JSON.stringify(await runSetup({ mode, options }), null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({
        code: error instanceof SetupError ? error.code : "SETUP_FAILED",
        message:
          error instanceof SetupError
            ? error.message
            : "Setup failed without exposing provider output.",
      }),
    );
    process.exitCode = 1;
  }
}
