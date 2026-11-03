import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  brandingCli,
  BrandingError,
  BRANDING_TENANT,
} from "./setup-auth0-branding.mjs";
import { OPENAI_REVIEW_CLIENT_ID } from "./enable-openai-review-renewal.mjs";
import {
  EMAIL_LOCALES,
  TEMPLATE_NAMES,
  scopeTemplate,
} from "./auth0-email-templates.mjs";

const fields = "client_id,client_metadata";
const displayFields = ["body", "subject", "from"];
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const hash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const safeId = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const owned = (client) =>
  client &&
  ((client.client_metadata?.guteneo_managed_by === "guteneo-setup-v1" &&
    ["browser", "claudeCode", "cursor", "chatgpt", "claudeHosted"].includes(
      client.client_metadata?.guteneo_component,
    )) ||
    (client.client_id === OPENAI_REVIEW_CLIENT_ID &&
      client.client_metadata?.guteneo_managed_by ===
        "guteneo-openai-review-v1" &&
      client.client_metadata?.guteneo_component === "openai-review"));
const functionalFields = (template) =>
  Object.fromEntries(
    Object.entries(template).filter(([key]) => !displayFields.includes(key)),
  );

export function makeEmailBrandingApi(run = brandingCli) {
  return {
    async request(method, path, body) {
      const clientRead = new RegExp(
        `^clients(?:\\?page=\\d{1,2}&per_page=100&include_totals=true&fields=${fields}&include_fields=true|/[A-Za-z0-9_-]{1,128}\\?fields=${fields}&include_fields=true)$`,
      ).test(path);
      const template =
        /^email-templates\/(verify_email|reset_email|welcome_email|blocked_account)$/.test(
          path,
        );
      if (!(
        (method === "GET" && (clientRead || template) && body === undefined) ||
        (method === "PATCH" &&
          template &&
          body &&
          !Array.isArray(body) &&
          Object.keys(body).sort().join(",") === "body,from,subject" &&
          Object.values(body).every(
            (value) => typeof value === "string" && value.trim(),
          ))
      ))
        throw new BrandingError("ENDPOINT_REFUSED");
      const tenants = await run(["tenants", "list", "--json"]);
      const active = Array.isArray(tenants)
        ? tenants.filter((item) => item.active === true)
        : [];
      if (active.length !== 1 || active[0].name !== BRANDING_TENANT)
        throw new BrandingError("WRONG_TENANT");
      return run(["api", method.toLowerCase(), path], body);
    },
  };
}

async function ownedClients(api) {
  const clients = [],
    seen = new Set();
  let total;
  for (let page = 0; page < 100; page++) {
    const result = await api.request(
      "GET",
      `clients?page=${page}&per_page=100&include_totals=true&fields=${fields}&include_fields=true`,
    );
    if (
      !result ||
      !Array.isArray(result.clients) ||
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      result.total > 10000 ||
      result.clients.length > 100 ||
      (total !== undefined && total !== result.total)
    )
      throw new BrandingError("INVALID_CLIENT_RESPONSE");
    total = result.total;
    for (const client of result.clients) {
      if (!client || !safeId(client.client_id) || seen.has(client.client_id))
        throw new BrandingError("INVALID_CLIENT_RESPONSE");
      seen.add(client.client_id);
      clients.push(client);
    }
    if (
      clients.length > total ||
      (!result.clients.length && clients.length < total)
    )
      throw new BrandingError("INVALID_CLIENT_RESPONSE");
    if (clients.length === total) {
      const selected = clients.filter(owned);
      if (!selected.length || selected.length > 20)
        throw new BrandingError("INVALID_CLIENT_SCOPE");
      return selected.sort((a, b) => (a.client_id < b.client_id ? -1 : 1));
    }
    if (result.clients.length !== 100)
      throw new BrandingError("INVALID_CLIENT_RESPONSE");
  }
  throw new BrandingError("CLIENT_LIST_LIMIT");
}

export async function inspectEmailBranding(api = makeEmailBrandingApi()) {
  const clients = await ownedClients(api);
  const templates = Object.fromEntries(
    await Promise.all(
      TEMPLATE_NAMES.map(async (name) => [
        name,
        await api.request("GET", `email-templates/${name}`),
      ]),
    ),
  );
  let candidates;
  try {
    candidates = Object.fromEntries(
      TEMPLATE_NAMES.map((name) => [
        name,
        scopeTemplate(
          name,
          clients.map((client) => client.client_id),
          templates[name],
        ),
      ]),
    );
  } catch {
    throw new BrandingError("TEMPLATE_NOT_PRESERVABLE");
  }
  return { clients, templates, candidates };
}

export function emailBrandingSummary(state) {
  return {
    tenant: BRANDING_TENANT,
    ownedClients: state.clients.length,
    templates: Object.fromEntries(
      TEMPLATE_NAMES.map((name) => [
        name,
        {
          matches: displayFields.every(
            (field) =>
              state.templates[name][field] === state.candidates[name][field],
          ),
          enabled: state.templates[name].enabled === true,
          candidateHash: hash(state.candidates[name]),
          existingHash: hash(state.templates[name]),
        },
      ]),
    ),
    sendsPerformed: 0,
    liveRenderingVerified: false,
  };
}

async function verifyOwnership(api, clients) {
  const current = await Promise.all(
    clients.map((client) =>
      api.request(
        "GET",
        `clients/${client.client_id}?fields=${fields}&include_fields=true`,
      ),
    ),
  );
  if (
    current.some(
      (client, i) =>
        !owned(client) ||
        client.client_id !== clients[i].client_id ||
        client.client_metadata.guteneo_managed_by !==
          clients[i].client_metadata.guteneo_managed_by ||
        client.client_metadata.guteneo_component !==
          clients[i].client_metadata.guteneo_component,
    )
  )
    throw new BrandingError("CLIENT_OWNERSHIP_CHANGED");
}

export async function applyEmailBranding(api = makeEmailBrandingApi()) {
  const before = await inspectEmailBranding(api);
  let writes = 0,
    pendingTemplate = null;
  try {
    for (const name of TEMPLATE_NAMES) {
      // Ownership is fresh before every potential write, not just after applying.
      await verifyOwnership(api, before.clients);
      const current = await api.request("GET", `email-templates/${name}`);
      if (hash(current) !== hash(before.templates[name]))
        throw new BrandingError("CONCURRENT_TEMPLATE_CHANGE");
      const candidate = before.candidates[name];
      if (displayFields.some((field) => current[field] !== candidate[field])) {
        pendingTemplate = name;
        await api.request("PATCH", `email-templates/${name}`, candidate);
        writes++;
      }
      const verified = await api.request("GET", `email-templates/${name}`);
      if (
        displayFields.some((field) => verified[field] !== candidate[field]) ||
        hash(functionalFields(current)) !== hash(functionalFields(verified))
      )
        throw new BrandingError("TEMPLATE_READBACK_MISMATCH");
      pendingTemplate = null;
    }
    await verifyOwnership(api, before.clients);
    const after = await inspectEmailBranding(api);
    if (
      hash(after.clients.map((client) => client.client_id)) !==
        hash(before.clients.map((client) => client.client_id)) ||
      TEMPLATE_NAMES.some(
        (name) =>
          displayFields.some(
            (field) =>
              after.templates[name][field] !== before.candidates[name][field],
          ) ||
          hash(functionalFields(after.templates[name])) !==
            hash(functionalFields(before.templates[name])),
      )
    )
      throw new BrandingError("FINAL_STATE_CHANGED");
    return { ...emailBrandingSummary(after), writes };
  } catch (error) {
    // A transport failure may have committed. Never retry or roll back blindly.
    const failure = new BrandingError(
      error instanceof BrandingError ? error.code : "EMAIL_BRANDING_FAILED",
    );
    failure.writesAcknowledged = writes;
    failure.unverifiedTemplate = pendingTemplate;
    throw failure;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (!args.length)
      console.log(
        JSON.stringify(
          {
            mode: "offline-plan",
            tenant: BRANDING_TENANT,
            templates: TEMPLATE_NAMES,
            locales: EMAIL_LOCALES,
            scope:
              "Currently owned setup clients and the marked known reviewer client; exact prior fields retained for other or missing application.clientID",
            writes: "Existing template body, subject and from only",
            preserves: [
              "enabled",
              "syntax",
              "resultUrl",
              "urlLifetimeInSeconds",
              "includeEmailInRedirect",
              "other applications",
            ],
            requires: [
              "readable existing Liquid templates",
              "read:clients, read:email_templates, update:email_templates",
              "operator authorization before --apply",
            ],
            sendsPerformed: 0,
            liveRenderingVerified: false,
          },
          null,
          2,
        ),
      );
    else if (args.length === 1 && ["--inspect", "--apply"].includes(args[0]))
      console.log(
        JSON.stringify(
          args[0] === "--inspect"
            ? emailBrandingSummary(await inspectEmailBranding())
            : await applyEmailBranding(),
          null,
          2,
        ),
      );
    else throw new BrandingError("INVALID_ARGUMENTS");
  } catch (error) {
    console.error(
      JSON.stringify({
        error:
          error instanceof BrandingError ? error.code : "EMAIL_BRANDING_FAILED",
        writesAcknowledged:
          Number.isInteger(error?.writesAcknowledged) &&
          error.writesAcknowledged >= 0 &&
          error.writesAcknowledged <= TEMPLATE_NAMES.length
            ? error.writesAcknowledged
            : 0,
        unverifiedTemplate: TEMPLATE_NAMES.includes(error?.unverifiedTemplate)
          ? error.unverifiedTemplate
          : null,
        providerOutputWithheld: true,
      }),
    );
    process.exitCode = 1;
  }
}
