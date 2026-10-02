import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { cliJson, SetupError, TENANT } from "./setup-auth0.mjs";
import { startSecureSetup } from "./secure-setup.mjs";

const ENDPOINT = "emails/provider";
// Auth0 returns only name/enabled by default. Request the sender explicitly,
// never credentials/settings, so verification can confirm the installed sender.
const INSPECTION_ENDPOINT = `${ENDPOINT}?fields=name,enabled,default_from_address&include_fields=true`;
const GUTENEO_SENDER =
  /^[A-Za-z0-9](?:[A-Za-z0-9._+-]{0,62}[A-Za-z0-9])?@guteneo\.com$/;
const fail = (code, message) => {
  throw new SetupError(code, message);
};
const erase = (value) => {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    erase(value[key]);
    delete value[key];
  }
};

export function resendAuth0Plan() {
  return {
    mode: "plan",
    tenant: TENANT,
    provider: "resend",
    scope: "tenant-wide, including applications unrelated to Guteneo",
    enabled: false,
    fromDomain: "guteneo.com",
    keyPermission:
      "sending_access restricted to guteneo.com; separate from Worker key",
    managementScopes: [
      "read:email_provider",
      "create:email_provider",
      "update:email_provider",
    ],
    effects: [
      "No network request in plan mode",
      "Preparation never activates or sends",
      "Existing active or different providers are never replaced",
    ],
    authenticationEmailTraffic:
      "Independent of Guteneo LIVE_SENDS_ENABLED and RESEND_SENDS_ENABLED once separately activated",
  };
}

// Keep the shared provisioning API allowlist unchanged: this transport can only
// inspect or stage the native email provider, never invoke a send/test endpoint.
export function makeAuth0EmailApi(run = cliJson) {
  return {
    async request(method, path, body) {
      if (!(
        (method === "GET" &&
          path === INSPECTION_ENDPOINT &&
          body === undefined) ||
        (["POST", "PATCH"].includes(method) && path === ENDPOINT)
      ))
        fail("INVALID_ENDPOINT", "Unsupported email setup endpoint.");
      const tenants = await run(["tenants", "list", "--json"]);
      const active = Array.isArray(tenants)
        ? tenants.filter((item) => item.active === true)
        : [];
      if (active.length !== 1 || active[0].name !== TENANT)
        fail(
          "WRONG_TENANT",
          `Select ${TENANT} in the Auth0 CLI before continuing.`,
        );
      return run(["api", method.toLowerCase(), path], body);
    },
  };
}

export async function inspectAuth0Resend(
  api = makeAuth0EmailApi(),
  expectedFrom,
) {
  let current;
  try {
    current = await api.request("GET", INSPECTION_ENDPOINT);
    if (
      !current ||
      typeof current.enabled !== "boolean" ||
      typeof current.name !== "string" ||
      typeof current.default_from_address !== "string"
    )
      fail("INVALID_PROVIDER", "Auth0 did not return a valid email provider.");
    return {
      tenant: TENANT,
      nativeResend: current.name === "resend",
      enabled: current.enabled,
      guteneoSender: GUTENEO_SENDER.test(current.default_from_address),
      ...(expectedFrom === undefined
        ? {}
        : { senderMatches: current.default_from_address === expectedFrom }),
      tenantWide: true,
      deliveryVerified: false,
    };
  } finally {
    // API response fields, including any unexpected echoed credential, never
    // leave this function. JS cannot guarantee erasure of immutable strings.
    erase(current);
  }
}

export async function prepareAuth0Resend({
  values,
  operation = "create",
  acknowledgeTenantWide = false,
  api = makeAuth0EmailApi(),
} = {}) {
  let body;
  let response;
  try {
    if (acknowledgeTenantWide !== true)
      fail(
        "TENANT_SCOPE_REQUIRED",
        "Explicit tenant-wide email-provider review is required.",
      );
    if (!["create", "update-disabled"].includes(operation))
      fail("INVALID_OPERATION", "Choose create or update-disabled.");
    if (
      !values ||
      Object.keys(values).sort().join(",") !==
        "RESEND_AUTH0_API_KEY,RESEND_AUTH0_FROM" ||
      !/^re_[A-Za-z0-9_-]{20,200}$/.test(values.RESEND_AUTH0_API_KEY) ||
      !GUTENEO_SENDER.test(values.RESEND_AUTH0_FROM)
    )
      fail(
        "INVALID_INPUT",
        "Use a dedicated Resend key and a plain guteneo.com sender address.",
      );
    if (operation === "update-disabled") {
      const current = await inspectAuth0Resend(api);
      if (current.enabled || !current.nativeResend || !current.guteneoSender)
        fail(
          "PROVIDER_CONFLICT",
          "Only an existing disabled Guteneo Resend provider can be updated.",
        );
    }
    body = {
      name: "resend",
      enabled: false,
      default_from_address: values.RESEND_AUTH0_FROM,
      credentials: { api_key: values.RESEND_AUTH0_API_KEY },
    };
    // POST cannot overwrite an existing provider. Do not infer absence from a
    // failed GET, and never retry a write after an uncertain provider outcome.
    response = await api.request(
      operation === "create" ? "POST" : "PATCH",
      ENDPOINT,
      body,
    );
    const verified = await inspectAuth0Resend(api, values.RESEND_AUTH0_FROM);
    if (
      !verified.nativeResend ||
      verified.enabled ||
      !verified.guteneoSender ||
      !verified.senderMatches
    )
      fail(
        "PROVIDER_VERIFICATION_FAILED",
        "Reread did not confirm a disabled Guteneo Resend provider; inspect before another action.",
      );
    return { ...verified, prepared: true, emailSent: false };
  } catch (error) {
    if (error instanceof SetupError) throw error;
    fail(
      "PREPARATION_FAILED",
      "Auth0 preparation was not confirmed. Inspect the provider before another action; private output was withheld.",
    );
  } finally {
    erase(body);
    erase(response);
    if (values && typeof values === "object")
      for (const key of Object.keys(values)) values[key] = "";
  }
}

export async function startAuth0ResendSetup({
  operation = "create",
  acknowledgeTenantWide = false,
  api = makeAuth0EmailApi(),
} = {}) {
  if (acknowledgeTenantWide !== true)
    fail(
      "TENANT_SCOPE_REQUIRED",
      "Review the shared Auth0 tenant and explicitly acknowledge its scope before preparation.",
    );
  if (!["create", "update-disabled"].includes(operation))
    fail("INVALID_OPERATION", "Choose create or update-disabled.");
  return startSecureSetup({
    profile: "auth0-resend",
    writer: (values) =>
      prepareAuth0Resend({ values, operation, acknowledgeTenantWide, api }),
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    const allowed = new Set([
      "--inspect",
      "--prepare",
      "--update-disabled",
      "--acknowledge-tenant-wide",
    ]);
    if (
      args.some((arg) => !allowed.has(arg)) ||
      new Set(args).size !== args.length ||
      (args.includes("--inspect") && args.length > 1) ||
      (!args.includes("--prepare") && args.some((arg) => arg !== "--inspect"))
    )
      fail(
        "INVALID_ARGUMENT",
        "Use no arguments for the plan, --inspect, or --prepare with --acknowledge-tenant-wide and optionally --update-disabled. Never pass a secret as an argument.",
      );
    if (args.includes("--prepare")) {
      const setup = await startAuth0ResendSetup({
        operation: args.includes("--update-disabled")
          ? "update-disabled"
          : "create",
        acknowledgeTenantWide: args.includes("--acknowledge-tenant-wide"),
      });
      console.log(
        `Préparation privée Auth0, sans activation, pendant 30 minutes : ${setup.url}`,
      );
    } else {
      console.log(
        JSON.stringify(
          args.includes("--inspect")
            ? await inspectAuth0Resend()
            : resendAuth0Plan(),
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(
      error instanceof SetupError
        ? `${error.code}: ${error.message}`
        : "Auth0 inspection unavailable; private output was withheld.",
    );
    process.exitCode = 1;
  }
}
