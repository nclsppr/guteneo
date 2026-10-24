import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  actionSources,
  AUDIENCE,
  makeAuth0Api,
  SCOPES,
  SetupError,
  TENANT,
} from "./setup-auth0.mjs";
import { CLAUDE_CLIENT_ID } from "./enable-claude-renewal.mjs";
import { OPENAI_REVIEW_CLIENT_ID } from "./enable-openai-review-renewal.mjs";

const OWNER = "guteneo-setup-v1";
const ACTION_NAMES = [
  "Guteneo - require verified identity",
  "Guteneo - verified identity claims",
];
const CLIENT_FIELDS =
  "client_id,name,client_metadata,app_type,token_endpoint_auth_method,callbacks,grant_types,refresh_token,jwt_configuration,is_first_party,oidc_conformant,third_party_security_mode";
const fail = (code, message) => {
  throw new SetupError(code, message);
};
const requireState = (condition) => {
  if (!condition)
    fail(
      "REGISTRATION_REQUIRES_REVIEW",
      "Unexpected Auth0 state. Inspect clients, API, connections, grants and both login Action versions before continuing; no mutation was retried.",
    );
};
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
const hash = (value) => createHash("sha256").update(value).digest("hex");
const same = (a, b) => canonical(a) === canonical(b);
const validId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const project = (value, fields) =>
  Object.fromEntries(fields.map((key) => [key, value[key]]));
function one(rows, predicate) {
  const matches = rows.filter(predicate);
  requireState(matches.length === 1 && validId(matches[0].id));
  return matches[0];
}
async function pages(api, path, key, extra = "") {
  const rows = [];
  for (let page = 0; page < 100; page++) {
    const response = await api.request(
      "GET",
      `${path}?per_page=100&page=${page}${extra}`,
    );
    const part = key ? response?.[key] : response;
    requireState(Array.isArray(part));
    rows.push(...part);
    if (part.length < 100) return rows;
  }
  fail(
    "INVENTORY_LIMIT",
    "Auth0 inventory exceeded the bounded inspection limit.",
  );
}
async function enabledClients(api, connectionId) {
  const ids = [];
  const visited = new Set();
  let next;
  for (let page = 0; page < 100; page++) {
    const value = await api.request(
      "GET",
      `connections/${connectionId}/clients?take=100${next ? `&from=${encodeURIComponent(next)}` : ""}`,
    );
    requireState(
      Array.isArray(value?.clients) &&
        value.clients.every((item) => validId(item.client_id)),
    );
    ids.push(...value.clients.map((item) => item.client_id));
    if (!value.next) {
      requireState(new Set(ids).size === ids.length);
      return ids.sort();
    }
    requireState(
      typeof value.next === "string" &&
        value.next.length <= 2000 &&
        !visited.has(value.next),
    );
    visited.add(value.next);
    next = value.next;
  }
  fail(
    "INVENTORY_LIMIT",
    "Auth0 connection inventory exceeded the bounded inspection limit.",
  );
}
function sourceList(code, name, allowEmpty = false) {
  const prefix = `const ${name} = `;
  const matches =
    typeof code === "string" &&
    code.match(new RegExp(`const ${name} = (\\[[^\\n]*\\]);`, "g"));
  requireState(matches?.length === 1);
  let ids;
  try {
    ids = JSON.parse(matches[0].slice(prefix.length, -1));
  } catch {
    requireState(false);
  }
  requireState(
    Array.isArray(ids) &&
      (allowEmpty || ids.length > 0) &&
      ids.every(validId) &&
      new Set(ids).size === ids.length,
  );
  return ids;
}
// The historical reviewer renderer deliberately retains its initial ownClients
// list separately from refreshClients. Never union or replace either list here.
function render(lists, connectionId, nativeMcpRegistration) {
  return actionSources(
    lists.clients,
    connectionId,
    "verified_email",
    lists.refresh,
    { nativeMcpRegistration },
  ).map((code) =>
    code.replace(
      /const ownClients = \[[^\n]*\];/,
      `const ownClients = ${JSON.stringify(lists.clients)};`,
    ),
  );
}
function sourcePolicy(code, index, connectionId, clients) {
  const lists = {
    clients: sourceList(code, "ownClients"),
    refresh: sourceList(code, "refreshClients", true),
  };
  requireState(
    lists.clients.every((id) =>
      clients.some(
        (item) =>
          item.client_id === id &&
          item.client_metadata?.guteneo_managed_by === OWNER,
      ),
    ),
  );
  requireState(
    lists.refresh.every(
      (id) =>
        [CLAUDE_CLIENT_ID, OPENAI_REVIEW_CLIENT_ID].includes(id) &&
        clients.some(
          (item) =>
            item.client_id === id &&
            item.client_metadata?.guteneo_managed_by ===
              (id === OPENAI_REVIEW_CLIENT_ID
                ? "guteneo-openai-review-v1"
                : OWNER),
        ),
    ),
  );
  requireState(
    [false, true].some(
      (enabled) => code === render(lists, connectionId, enabled)[index],
    ),
  );
  return lists;
}
function actionGuard(action) {
  requireState(
    validId(action.id) &&
      action.status === "built" &&
      action.runtime === "node22" &&
      action.secrets?.length === 0 &&
      action.dependencies?.length === 0 &&
      action.supported_triggers?.length === 1 &&
      action.supported_triggers[0].id === "post-login" &&
      action.supported_triggers[0].version === "v3" &&
      typeof action.all_changes_deployed === "boolean",
  );
}
function exactGrant(grant) {
  return (
    grant.default_for === "third_party_clients" &&
    grant.audience === AUDIENCE &&
    grant.subject_type === "user" &&
    grant.client_id === undefined &&
    [undefined, false].includes(grant.allow_all_scopes) &&
    Array.isArray(grant.scope) &&
    grant.scope.length === SCOPES.length &&
    same([...grant.scope].sort(), [...SCOPES].sort()) &&
    [undefined, false].includes(grant.allow_any_organization) &&
    !grant.organization_usage
  );
}
function grantBody() {
  return {
    default_for: "third_party_clients",
    audience: AUDIENCE,
    subject_type: "user",
    scope: [...SCOPES],
  };
}
async function inspectMcpRegistration(api) {
  const settings = await api.request("GET", "tenants/settings");
  requireState(
    settings?.flags &&
      typeof settings.flags === "object" &&
      !Array.isArray(settings.flags) &&
      [undefined, false, true].includes(
        settings.flags.enable_dynamic_client_registration,
      ) &&
      [undefined, "strict", "permissive"].includes(
        settings.dynamic_client_registration_security_mode,
      ),
  );
  requireState(
    settings.resource_parameter_profile === "compatibility" &&
      settings.flags.universal_login === true,
  );
  const clients = await pages(
    api,
    "clients",
    undefined,
    `&fields=${CLIENT_FIELDS}&include_fields=true`,
  );
  requireState(
    clients.every((item) => validId(item.client_id)) &&
      new Set(clients.map((item) => item.client_id)).size === clients.length,
  );
  const resources = await pages(api, "resource-servers");
  requireState(
    resources.every((item) =>
      [AUDIENCE, `https://${TENANT}/api/v2/`].includes(item.identifier),
    ),
  );
  const resource = one(resources, (item) => item.identifier === AUDIENCE);
  requireState(
    resource.name === "Guteneo MCP" &&
      resource.signing_alg === "RS256" &&
      resource.token_dialect === "access_token" &&
      resource.allow_offline_access === true &&
      resource.skip_consent_for_verifiable_first_party_clients === false &&
      [resource.token_lifetime, resource.token_lifetime_for_web].every(
        (n) => Number.isInteger(n) && n > 0 && n <= 3600,
      ) &&
      same(
        resource.scopes?.map((item) => item.value).sort(),
        [...SCOPES].sort(),
      ) &&
      resource.subject_type_authorization?.user?.policy === "allow_all" &&
      resource.subject_type_authorization?.client?.policy ===
        "require_client_grant",
  );
  const connections = await pages(api, "connections");
  requireState(
    connections.every(
      (item) =>
        validId(item.id) && typeof item.is_domain_connection === "boolean",
    ),
  );
  const connection = one(
    connections,
    (item) => item.name === "Guteneo-Accounts",
  );
  requireState(
    connection.strategy === "auth0" &&
      connection.metadata?.guteneo_managed_by === OWNER &&
      connections.every(
        (item) =>
          item.id === connection.id || item.is_domain_connection === false,
      ),
  );
  const connectionState = [];
  for (const item of connections)
    connectionState.push({
      ...project(item, [
        "id",
        "name",
        "strategy",
        "metadata",
        "options",
        "is_domain_connection",
      ]),
      enabled: await enabledClients(api, item.id),
    });
  const grants = await pages(api, "client-grants");
  requireState(grants.every((item) => validId(item.id)));
  const defaults = grants.filter((item) => item.default_for !== undefined);
  requireState(defaults.length <= 1 && defaults.every(exactGrant));
  // Do not inherit a per-app override that could exceed the reviewed baseline.
  requireState(
    grants.every(
      (item) => exactGrant(item) || !item.client_id?.startsWith("tpc_"),
    ),
  );
  const rules = await pages(api, "rules", undefined, "&enabled=true");
  const blockers = rules.length ? ["active_rules_require_manual_review"] : [];
  let hooks;
  try {
    hooks = await pages(api, "hooks");
  } catch (error) {
    if (error instanceof SetupError && error.code === "INVENTORY_LIMIT")
      throw error;
    // Missing legacy-hook read access is not evidence that no hooks exist. Do
    // not request broader scopes or hide the gap behind a successful plan.
    blockers.push("hooks_inventory_unverified_manual_review_required");
  }
  if (hooks?.length) blockers.push("hooks_require_manual_review");
  // The operator verified this tenant's Free plan on 24 October 2026. Auth0's
  // documented Free entity limit is 10 applications. Open registration with
  // only one slot left is not a durable rollout; do not delete apps or upgrade.
  // https://auth0.com/docs/troubleshoot/customer-support/operational-policies/entity-limit-policy
  if (clients.length >= 9) blockers.push("capacity_requires_review");
  const inventory = await pages(api, "actions/actions", "actions");
  const actions = [];
  const deployedSources = [];
  let lists;
  for (const [index, name] of ACTION_NAMES.entries()) {
    const listed = one(inventory, (item) => item.name === name);
    const action = await api.request("GET", `actions/actions/${listed.id}`);
    requireState(action?.id === listed.id && action.name === name);
    actionGuard(action);
    const ownLists = sourcePolicy(action.code, index, connection.id, clients);
    lists ??= ownLists;
    requireState(same(lists, ownLists));
    const versionId = action.deployed_version?.id;
    requireState(validId(versionId));
    const version = await api.request(
      "GET",
      `actions/actions/${action.id}/versions/${versionId}`,
    );
    requireState(
      version?.id === versionId &&
        same(sourcePolicy(version.code, index, connection.id, clients), lists),
    );
    const target = render(lists, connection.id, true)[index];
    requireState(
      action.all_changes_deployed
        ? action.code === version.code
        : action.code === target,
    );
    actions.push(action);
    deployedSources.push(version.code);
  }
  const sources = render(lists, connection.id, true);
  const refreshClients = clients.filter(
    (item) =>
      [OWNER, "guteneo-openai-review-v1"].includes(
        item.client_metadata?.guteneo_managed_by,
      ) && item.grant_types?.includes("refresh_token"),
  );
  requireState(
    refreshClients.every((item) => lists.refresh.includes(item.client_id)),
  );
  const bindings = await pages(
    api,
    "actions/triggers/post-login/bindings",
    "bindings",
  );
  requireState(
    bindings.length === 2 &&
      bindings.every(
        (item, index) =>
          validId(item.id) && item.action?.id === actions[index].id,
      ) &&
      new Set(bindings.map((item) => item.id)).size === bindings.length,
  );
  const enabled = settings.flags.enable_dynamic_client_registration === true;
  const ready =
    actions.every(
      (action, index) =>
        action.code === sources[index] &&
        deployedSources[index] === sources[index] &&
        action.all_changes_deployed,
    ) &&
    connection.is_domain_connection &&
    defaults.length === 1;
  if (
    enabled &&
    (!ready || settings.dynamic_client_registration_security_mode !== "strict")
  )
    blockers.push("enabled_registration_requires_manual_review");
  const state = {
    settings,
    clients: clients.sort((a, b) => a.client_id.localeCompare(b.client_id)),
    resources: resources.sort((a, b) => a.id.localeCompare(b.id)),
    connections: connectionState.sort((a, b) => a.id.localeCompare(b.id)),
    grants: grants.sort((a, b) => a.id.localeCompare(b.id)),
    rules,
    hooks: hooks ?? null,
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
    otherActionsSha256: hash(
      canonical(
        inventory.filter(
          (item) => !actions.some((action) => action.id === item.id),
        ),
      ),
    ),
    // Binding responses embed derived Action build/version metadata. That is
    // verified above from the exact Action and deployed version; retain binding
    // identity/configuration without treating our own deploy as a flow edit.
    bindings: bindings.map((binding) => ({
      ...binding,
      action: { id: binding.action.id },
    })),
  };
  const changes = [
    ...actions.flatMap((action, index) =>
      action.code === sources[index] && action.all_changes_deployed
        ? []
        : [{ operation: "deploy_native_mcp_action", action: index + 1 }],
    ),
    ...(!connection.is_domain_connection
      ? [{ operation: "promote_guteneo_account_connection" }]
      : []),
    ...(!defaults.length
      ? [{ operation: "create_mcp_user_default_grant", scopes: [...SCOPES] }]
      : []),
    ...(!enabled ||
    settings.dynamic_client_registration_security_mode !== "strict"
      ? [{ operation: "enable_strict_native_registration_last" }]
      : []),
  ];
  return {
    state,
    sources,
    actions,
    connection,
    defaults,
    summary: {
      tenant: TENANT,
      audience: AUDIENCE,
      fingerprint: hash(canonical({ state, sources })),
      blockers,
      changes,
      configured: enabled && ready && blockers.length === 0,
      proposedNativeSecurityMode: "strict",
      observedNativeSecurityMode:
        settings.dynamic_client_registration_security_mode ?? null,
      currentClientCount: clients.length,
      proposedOpenRegistration: true,
      observedOpenRegistration: enabled,
      currentFreePlanPolicyLimit: 10,
      userConsentRequired: true,
      pkceRequired: true,
      existingClientsChanged: false,
      existingStaticAllowlistsPreserved: true,
      newClientRefreshPolicy:
        "Auth0 requires finite absolute and idle expiry; concrete policy and host refresh remain unqualified.",
      hostQualification: "pending",
      registrationPerformed: false,
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
    "Action build or deployment is pending. Inspect again; no mutation was retried.",
  );
}
export async function runMcpRegistration({
  mode = "inspect",
  expect,
  api = makeAuth0Api(),
  pause = (ms) => new Promise((done) => setTimeout(done, ms)),
} = {}) {
  try {
    if (
      !["inspect", "apply"].includes(mode) ||
      (mode === "apply"
        ? !/^[a-f0-9]{64}$/.test(expect ?? "")
        : expect !== undefined)
    )
      fail(
        "INVALID_ARGUMENTS",
        "Inspect first; apply requires --apply --expect REVIEWED_FINGERPRINT.",
      );
    let current = await inspectMcpRegistration(api);
    if (mode === "inspect") return { mode, ...current.summary };
    if (current.summary.fingerprint !== expect)
      fail(
        "STATE_CHANGED",
        "Auth0 changed since review. No changes were made; inspect again.",
      );
    if (current.summary.blockers.length)
      fail(
        "REGISTRATION_BLOCKED",
        "Provider inspection is incomplete or incompatible. Resolve the reported blockers before applying; no changes were made.",
      );
    const fresh = async () => {
      const next = await inspectMcpRegistration(api);
      requireState(
        same(current.state, next.state) && next.summary.blockers.length === 0,
      );
      current = next;
    };
    for (let index = 0; index < 2; index++) {
      const action = current.actions[index];
      if (action.code === current.sources[index] && action.all_changes_deployed)
        continue;
      await fresh();
      const before = current;
      if (action.code !== current.sources[index])
        await api.request("PATCH", `actions/actions/${action.id}`, {
          code: current.sources[index],
        });
      await waitForAction(api, action.id, current.sources[index], false, pause);
      // Re-read before deployment as well: an administrator may have changed
      // the live version or flow while our build was running. Never overwrite
      // that version merely because our draft still has the expected bytes.
      const staged = await inspectMcpRegistration(api);
      const expectedStaged = structuredClone(before.state);
      expectedStaged.actions[index] = {
        ...expectedStaged.actions[index],
        code: hash(before.sources[index]),
        all_changes_deployed: staged.state.actions[index].all_changes_deployed,
        updated_at: staged.state.actions[index].updated_at,
      };
      requireState(
        same(expectedStaged, staged.state) &&
          staged.summary.blockers.length === 0,
      );
      await api.request("POST", `actions/actions/${action.id}/deploy`, {});
      await waitForAction(api, action.id, current.sources[index], true, pause);
      const after = await inspectMcpRegistration(api);
      const expected = structuredClone(before.state);
      expected.actions[index] = after.state.actions[index];
      requireState(
        same(expected, after.state) &&
          after.actions[index].code === before.sources[index] &&
          after.actions[index].all_changes_deployed &&
          after.state.actions[index].deployed_code ===
            hash(before.sources[index]),
      );
      current = after;
    }
    if (!current.connection.is_domain_connection) {
      await fresh();
      const expected = structuredClone(current.state);
      expected.connections.find(
        (item) => item.id === current.connection.id,
      ).is_domain_connection = true;
      await api.request("PATCH", `connections/${current.connection.id}`, {
        is_domain_connection: true,
      });
      const after = await inspectMcpRegistration(api);
      requireState(same(expected, after.state));
      current = after;
    }
    if (!current.defaults.length) {
      await fresh();
      const before = current;
      await api.request("POST", "client-grants", grantBody());
      const after = await inspectMcpRegistration(api);
      requireState(
        after.defaults.length === 1 &&
          !before.state.grants.some((item) => item.id === after.defaults[0].id),
      );
      requireState(
        same(before.state, {
          ...after.state,
          grants: after.state.grants.filter(
            (item) => item.id !== after.defaults[0].id,
          ),
        }),
      );
      current = after;
    }
    if (
      current.state.settings.flags.enable_dynamic_client_registration !==
        true ||
      current.state.settings.dynamic_client_registration_security_mode !==
        "strict"
    ) {
      await fresh();
      const expected = structuredClone(current.state);
      expected.settings.flags.enable_dynamic_client_registration = true;
      expected.settings.dynamic_client_registration_security_mode = "strict";
      await api.request("PATCH", "tenants/settings", {
        dynamic_client_registration_security_mode: "strict",
        flags: {
          ...current.state.settings.flags,
          enable_dynamic_client_registration: true,
        },
      });
      const after = await inspectMcpRegistration(api);
      requireState(same(expected, after.state));
      current = after;
    }
    requireState(
      current.summary.configured && current.summary.changes.length === 0,
    );
    return { mode, ...current.summary };
  } catch (error) {
    if (
      error instanceof SetupError &&
      [
        "INVALID_ARGUMENTS",
        "REGISTRATION_REQUIRES_REVIEW",
        "STATE_CHANGED",
        "REGISTRATION_BLOCKED",
        "INVENTORY_LIMIT",
        "ACTION_PENDING",
      ].includes(error.code)
    )
      throw error;
    fail(
      "REGISTRATION_FAILED",
      "MCP registration configuration failed. Provider output was withheld and no mutation was retried; inspect fresh state before continuing.",
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
      args.length === 0 || (args.length === 1 && args[0] === "--inspect");
    const apply =
      args.length === 3 && args[0] === "--apply" && args[1] === "--expect";
    if (!inspect && !apply)
      fail(
        "INVALID_ARGUMENTS",
        "Use --inspect or --apply --expect REVIEWED_FINGERPRINT.",
      );
    console.log(
      JSON.stringify(
        await runMcpRegistration({
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
        code: error instanceof SetupError ? error.code : "REGISTRATION_FAILED",
        message:
          error instanceof SetupError
            ? error.message
            : "Provider output was withheld.",
      }),
    );
    process.exitCode = 1;
  }
}
