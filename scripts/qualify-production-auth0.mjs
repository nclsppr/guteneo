import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cliJson, TENANT } from "./setup-auth0.mjs";

const connectionName = "Guteneo-Accounts";
const callback = "https://guteneo.com/auth/callback";
const owner = "guteneo-setup-v1";
const scopes = [
  "read:connections",
  "read:clients",
  "read:actions",
  "read:guardian_factors",
];
const rows = (value, key) =>
  Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : [];
const ref = (value) => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value))
    throw new Error("INVALID_RESOURCE_REFERENCE");
  return encodeURIComponent(value);
};
const bool = (value) => (typeof value === "boolean" ? value : null);
const choice = (value, allowed) => (allowed.includes(value) ? value : null);
export function auth0QualificationPlan() {
  return {
    schema: 1,
    mode: "plan",
    tenant: TENANT,
    connectionName,
    operations: [
      "GET connections (metadata)",
      "GET exact connection",
      "GET clients (metadata)",
      "GET post-login bindings",
      "GET bound Guteneo actions",
      "GET Guardian factors and WebAuthn configuration",
    ],
    requiredReadScopes: [...scopes],
    credentialSources: [
      "existing Auth0 CLI profile for the exact tenant",
      "explicit CLI env mode with AUTH0_DOMAIN + AUTH0_API_TOKEN",
    ],
    noProvisioning: true,
    noUserReads: true,
    noSecretOutput: true,
    accountProvisioning:
      "Separate operator authorization and create:users privilege; never requested by this inspector",
    connectionUvRequiredSetter:
      "Not documented in ConnectionPasskeyOptions; do not invent a field",
    preferredCandidate:
      "Auth0 WebAuthn MFA platform, or roaming with userVerification=required, followed by a separate evidence Action",
    liveQualification: [
      "fresh actual method and timestamps",
      "UV-positive and UV-negative",
      "password/TOTP/recovery cannot mint strong evidence",
      "same issuer/subject/client/callback",
      "no automated human consent",
    ],
    ready: false,
  };
}

/** Read-only and tenant-bound. Provider responses (including Action code) are
 * held only in memory; the report is a closed projection of safe values. */
export async function inspectAuth0Qualification(run = cliJson) {
  const available = {
    connections: false,
    clients: false,
    actions: false,
    guardian: false,
  };
  const failures = [];
  async function get(path, query = {}) {
    const tenants = rows(await run(["tenants", "list", "--json"]), "tenants");
    const active = tenants.filter((tenant) => tenant.active === true);
    if (active.length !== 1 || active[0].name !== TENANT)
      throw new Error("WRONG_TENANT");
    const args = ["api", "get", path];
    for (const [key, value] of Object.entries(query))
      args.push("--query", `${key}=${value}`);
    return run(args);
  }
  const result = {
    schema: 1,
    mode: "inspect",
    tenant: TENANT,
    observedAt: new Date().toISOString(),
    managementReads: available,
    connection: null,
    browserApplication: null,
    actions: [],
    guardianFactors: null,
    roamingUserVerification: null,
    failures,
    sourceEvidenceIsStaticOnly: true,
    liveMethodQualified: false,
    noMutations: true,
    noUserReads: true,
    ready: false,
  };
  let connection = null,
    browser = null;
  try {
    const candidates = rows(
      await get("connections", {
        strategy: "auth0",
        fields: "id,name,strategy",
        include_fields: "true",
        per_page: 100,
      }),
      "connections",
    );
    const matches = candidates.filter(
      (item) => item.name === connectionName && item.strategy === "auth0",
    );
    if (matches.length !== 1) throw new Error("CONNECTION_NOT_UNIQUE");
    connection = await get(`connections/${ref(matches[0].id)}`);
    const options = connection.options ?? {},
      passkey = options.passkey_options ?? {};
    result.connection = {
      name: connectionName,
      passkeyEnabled: bool(options.authentication_methods?.passkey?.enabled),
      passwordEnabled: bool(options.authentication_methods?.password?.enabled),
      challengeUi: choice(passkey.challenge_ui, ["both", "button", "autofill"]),
      progressiveEnrollment: bool(passkey.progressive_enrollment_enabled),
      localEnrollment: bool(passkey.local_enrollment_enabled),
      connectionUvRequiredSetterDocumented: false,
    };
    available.connections = true;
  } catch (error) {
    if (error.message === "WRONG_TENANT") throw error;
    failures.push({
      resource: "connection",
      code: "MANAGEMENT_READ_UNAVAILABLE",
      requiredScope: "read:connections",
    });
  }
  try {
    const clients = rows(
      await get("clients", {
        fields: "client_id,name,client_metadata,grant_types,callbacks",
        include_fields: "true",
        per_page: 100,
      }),
      "clients",
    );
    const matches = clients.filter(
      (client) =>
        client.name === "Guteneo - Browser" &&
        client.client_metadata?.guteneo_managed_by === owner,
    );
    if (matches.length !== 1) throw new Error("BROWSER_NOT_UNIQUE");
    browser = matches[0];
    result.browserApplication = {
      owned: true,
      callbackExpected: browser.callbacks?.includes(callback) === true,
      authorizationCode:
        browser.grant_types?.includes("authorization_code") === true,
      nativePasskeyGrant:
        browser.grant_types?.includes(
          "urn:okta:params:oauth:grant-type:webauthn",
        ) === true,
      nativePasskeyGrantRequiredForHostedRedirect: false,
      enabledOnConnection: Array.isArray(connection?.enabled_clients)
        ? connection.enabled_clients.includes(browser.client_id)
        : null,
    };
    available.clients = true;
  } catch (error) {
    if (error.message === "WRONG_TENANT") throw error;
    failures.push({
      resource: "application",
      code: "MANAGEMENT_READ_UNAVAILABLE",
      requiredScope: "read:clients",
    });
  }
  try {
    const bindings = rows(
      await get("actions/triggers/post-login/bindings", { per_page: 100 }),
      "bindings",
    );
    const owned = bindings.filter(
      (binding) =>
        typeof binding.action?.name === "string" &&
        binding.action.name.startsWith("Guteneo - "),
    );
    result.boundActionCount = bindings.length;
    result.uninspectedNonGuteneoBindingCount = bindings.length - owned.length;
    for (const binding of owned) {
      const action = await get(`actions/actions/${ref(binding.action.id)}`);
      const deployed = action.deployed_version;
      const code = typeof deployed?.code === "string" ? deployed.code : null;
      result.actions.push({
        // The label is controlled; arbitrary provider names never enter output.
        kind: /document|strong|webauthn/i.test(action.name ?? "")
          ? "guteneo_document_candidate"
          : "guteneo_identity",
        deployed: deployed?.deployed === true,
        deployedSourceRead: code !== null,
        sourceSha256:
          code === null
            ? null
            : createHash("sha256").update(code).digest("hex"),
        mentionsDocumentClaim:
          code === null ? null : /document_authentication/.test(code),
        mentionsDocumentPolicy:
          code === null ? null : /guteneo-sensitive-v[0-9]+/.test(code),
        mentionsWebauthn: code === null ? null : /webauthn|passkey/.test(code),
        mentionsMethodEvidence:
          code === null ? null : /authentication\??\.methods/.test(code),
        mentionsAuthenticationTime:
          code === null ? null : /auth_time|authenticated_at/.test(code),
        // A source substring is review assistance, never proof of assurance.
        methodQualified: false,
      });
    }
    available.actions = true;
  } catch (error) {
    if (error.message === "WRONG_TENANT") throw error;
    failures.push({
      resource: "actions",
      code: "MANAGEMENT_READ_UNAVAILABLE",
      requiredScope: "read:actions",
    });
  }
  try {
    const factors = rows(await get("guardian/factors"), "factors");
    const permitted = [
      "otp",
      "webauthn-platform",
      "webauthn-roaming",
      "recovery-code",
      "email",
      "sms",
      "phone",
      "push-notification",
      "duo",
    ];
    result.guardianFactors = factors
      .filter((factor) => permitted.includes(factor.name))
      .map((factor) => ({
        name: factor.name,
        enabled: bool(factor.enabled),
        trialExpired: bool(factor.trial_expired),
      }));
    available.guardian = true;
    if (
      result.guardianFactors.some(
        (factor) =>
          factor.name === "webauthn-roaming" && factor.enabled === true,
      )
    ) {
      // Management API uses camelCase. The similarly named Terraform option
      // user_verification is not the HTTP response property.
      const roaming = await get("guardian/factors/webauthn-roaming/settings");
      result.roamingUserVerification = choice(roaming.userVerification, [
        "required",
        "preferred",
        "discouraged",
      ]);
    }
  } catch (error) {
    if (error.message === "WRONG_TENANT") throw error;
    failures.push({
      resource: "guardian",
      code: "MANAGEMENT_READ_UNAVAILABLE",
      requiredScope: "read:guardian_factors",
    });
  }
  result.next =
    "Qualify Auth0 WebAuthn MFA entitlement, factor policy and sequenced Action evidence; no claim or configuration is changed by this report";
  return result;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--plan", "--inspect"].includes(args[0])) {
    console.error(
      JSON.stringify({
        code: "USAGE",
        message:
          "Choose --plan (no external I/O) or --inspect (GET-only existing Auth0 CLI profile).",
      }),
    );
    process.exitCode = 1;
  } else
    try {
      console.log(
        JSON.stringify(
          args[0] === "--plan"
            ? auth0QualificationPlan()
            : await inspectAuth0Qualification(),
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          code:
            error.message === "WRONG_TENANT"
              ? "WRONG_TENANT"
              : "INSPECTION_UNAVAILABLE",
          providerOutputWithheld: true,
        }),
      );
      process.exitCode = 1;
    }
}
