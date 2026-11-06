import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Liquid } from "liquidjs";
import {
  EMAIL_COPY,
  EMAIL_FROM,
  EMAIL_LOCALES,
  EMAIL_LOGO,
  TEMPLATE_NAMES,
  localizedEmail,
  scopeTemplate,
} from "../../scripts/auth0-email-templates.mjs";
import {
  applyEmailBranding,
  inspectEmailBranding,
  emailBrandingSummary,
  makeEmailBrandingApi,
} from "../../scripts/setup-auth0-email-branding.mjs";
import { BRANDING_TENANT } from "../../scripts/setup-auth0-branding.mjs";
import { OPENAI_REVIEW_CLIENT_ID } from "../../scripts/enable-openai-review-renewal.mjs";
import {
  buildBrandPreview,
  writeEmailTemplates,
} from "../../scripts/build-auth0-brand-preview.mjs";

const engine = new Liquid({ strictFilters: true });
const prior = (name) => ({
  template: name,
  syntax: "liquid",
  enabled: name !== "welcome_email",
  resultUrl: "https://example.invalid/original",
  urlLifetimeInSeconds: 3600,
  includeEmailInRedirect: false,
  extra: { retained: true },
  body: "\n{% if user.name %}<p>{{ user.name | escape }}</p>{% else %}Prior body{% endif %}\n",
  subject: "Original {{ application.name }}",
  from: "Original <prior@example.invalid>",
});
const client = (id = "owned_browser", component = "browser") => ({
  client_id: id,
  client_metadata: {
    guteneo_managed_by: "guteneo-setup-v1",
    guteneo_component: component,
    private: "hidden-metadata",
  },
});
const render = (source, data = {}) => engine.parseAndRender(source, data);

function fixture({
  clients = [client(), { client_id: "other", client_metadata: {} }],
  beforeRequest,
} = {}) {
  const state = {
    clients: structuredClone(clients),
    templates: Object.fromEntries(
      TEMPLATE_NAMES.map((name) => [name, prior(name)]),
    ),
  };
  const writes = [],
    reads = [];
  const api = {
    async request(method, path, body) {
      await beforeRequest?.({ method, path, body, state, writes });
      if (method === "GET") {
        reads.push(path);
        if (path.startsWith("clients?")) {
          const page = Number(new URLSearchParams(path.slice(8)).get("page"));
          return structuredClone({
            clients: state.clients.slice(page * 100, (page + 1) * 100),
            total: state.clients.length,
          });
        }
        if (path.startsWith("clients/"))
          return structuredClone(
            state.clients.find(
              (item) => item.client_id === path.split("/")[1].split("?")[0],
            ),
          );
        return structuredClone(state.templates[path.split("/")[1]]);
      }
      assert.equal(method, "PATCH");
      assert.match(path, /^email-templates\//);
      assert.deepEqual(Object.keys(body).sort(), ["body", "from", "subject"]);
      writes.push({ path, body: structuredClone(body) });
      Object.assign(state.templates[path.split("/")[1]], body);
      return {};
    },
  };
  return { api, state, writes, reads };
}

for (const name of TEMPLATE_NAMES) {
  test(`${name}: real Liquid selects four locales, normalizes hints and defaults to English`, async () => {
    const fields = localizedEmail(name);
    assert.equal(fields.from, EMAIL_FROM);
    assert.ok(fields.body.length < 30000);
    assert.doesNotMatch(
      fields.body,
      /<(?:script|form|iframe)\b|@import|user\.(?:email|name)/i,
    );
    for (const [hint, expected] of [
      [undefined, "en"],
      [null, "en"],
      ["", "en"],
      ["es-ES", "en"],
      ["EN-us", "en"],
      ["Fr-FR", "fr"],
      ["DE_de", "de"],
      ["LB-LU", "lb"],
    ]) {
      const context = {
        request_language: hint,
        url: "https://example.invalid/verify?a=1&b=\"<private>'",
      };
      const body = await render(fields.body, context);
      assert.match(body, new RegExp(`<html lang="${expected}">`));
      assert.equal(
        await render(fields.subject, context),
        EMAIL_COPY[expected][name].subject,
      );
      assert.ok(body.includes(EMAIL_LOGO));
      assert.match(
        body,
        /color:#181b22;font-family:Georgia,serif[^>]*>guteneo<\/p>/,
      );
      assert.match(body, /max-width:650px/);
      assert.match(body, /border-top:10px solid #2450db/);
      assert.match(body, /\[if mso\]><table role="presentation" width="650"/);
      assert.doesNotMatch(body, /\{%|\{\{|<private>|<a[^>]*b="/);
      if (name !== "welcome_email")
        assert.match(body, /&amp;b=(?:&quot;|&#34;)&lt;private&gt;&#39;/);
      else assert.ok(body.includes('href="https://guteneo.com/auth/login"'));
    }
  });
  test(`${name}: unknown and missing application preserve exact prior Liquid behavior`, async () => {
    const original = prior(name),
      scoped = scopeTemplate(name, ["owned_B", "owned_A"], original);
    assert.deepEqual(
      scopeTemplate(name, ["owned_A", "owned_B"], { ...original, ...scoped }),
      scoped,
    );
    for (const application of [
      undefined,
      {},
      { clientID: "other", name: "Different service" },
    ]) {
      const data = {
        application,
        request_language: "fr",
        user: { name: "Synthetic <recipient>" },
      };
      for (const field of ["body", "subject", "from"]) {
        assert.ok(scoped[field].endsWith(original[field] + "{% endif %}"));
        assert.equal(
          await render(scoped[field], data),
          await render(original[field], data),
        );
      }
    }
    const changed = scopeTemplate(name, ["owned_C"], {
      ...original,
      ...scoped,
    });
    for (const field of ["body", "subject", "from"]) {
      assert.equal(
        await render(changed[field], { application: { clientID: "owned_A" } }),
        await render(original[field], { application: { clientID: "owned_A" } }),
      );
      assert.equal(
        await render(changed[field], {
          application: { clientID: "owned_C" },
          url: "https://example.invalid",
        }),
        await render(localizedEmail(name)[field], {
          url: "https://example.invalid",
        }),
      );
    }
  });
}

test("refuses unsafe scope, unreadable templates and edited or legacy managed wrappers", () => {
  for (const ids of [
    [],
    ["x", "x"],
    ["x' or true"],
    [null],
    Array.from({ length: 21 }, (_, i) => `x${i}`),
  ])
    assert.throws(
      () => scopeTemplate("verify_email", ids, prior("verify_email")),
      /INVALID_CLIENT_SCOPE/,
    );
  for (const original of [
    null,
    { ...prior("verify_email"), syntax: "handlebars" },
    { ...prior("verify_email"), body: "" },
  ])
    assert.throws(
      () => scopeTemplate("verify_email", ["x"], original),
      /EXISTING_TEMPLATE_REQUIRED/,
    );
  const scoped = scopeTemplate("verify_email", ["x"], prior("verify_email"));
  for (const body of [
    scoped.body.slice(0, -3),
    scoped.body.replace("guteneo</p>", "changed</p>"),
    scoped.body + "extra",
    "{% comment %}guteneo-email-brand-v1:verify_email{% endcomment %}old",
    scoped.body.replace("guteneo-email-brand-v2", "guteneo-email-brand-v3"),
  ])
    assert.throws(
      () =>
        scopeTemplate("verify_email", ["x"], {
          ...prior("verify_email"),
          ...scoped,
          body,
        }),
      /MANAGED_TEMPLATE_CONFLICT/,
    );
});

test("applies only three display fields, checks ownership first and reruns without writes", async () => {
  const f = fixture();
  const original = structuredClone(f.state.templates);
  const result = await applyEmailBranding(f.api);
  assert.equal(result.writes, 4);
  assert.equal(result.sendsPerformed, 0);
  assert.equal(result.liveRenderingVerified, false);
  for (const name of TEMPLATE_NAMES) {
    assert.equal(result.templates[name].matches, true);
    for (const field of Object.keys(original[name]).filter(
      (key) => !["body", "subject", "from"].includes(key),
    ))
      assert.deepEqual(f.state.templates[name][field], original[name][field]);
  }
  assert.equal((await applyEmailBranding(f.api)).writes, 0);
  assert.equal(f.writes.length, 4);
  assert.deepEqual(f.state.clients[0], client());
});

test("ownership loss before the first write or between templates stops remaining mutations", async () => {
  for (const limit of [0, 1]) {
    const f = fixture({
      beforeRequest({ path, writes, state }) {
        if (path.startsWith("clients/") && writes.length === limit)
          state.clients[0].client_metadata.guteneo_managed_by = "other";
      },
    });
    await assert.rejects(
      applyEmailBranding(f.api),
      (error) =>
        error.code === "CLIENT_OWNERSHIP_CHANGED" &&
        error.writesAcknowledged === limit,
    );
    assert.equal(f.writes.length, limit);
  }
});

test("recognizes exact maintained owners, including only the marked known reviewer", async () => {
  const clients = [
    client(),
    client("unknown_component", "other"),
    {
      client_id: "forged",
      client_metadata: {
        guteneo_managed_by: "guteneo-openai-review-v1",
        guteneo_component: "openai-review",
      },
    },
    {
      client_id: OPENAI_REVIEW_CLIENT_ID,
      client_metadata: {
        guteneo_managed_by: "guteneo-openai-review-v1",
        guteneo_component: "openai-review",
      },
    },
  ];
  const state = await inspectEmailBranding(fixture({ clients }).api);
  assert.deepEqual(
    state.clients.map((item) => item.client_id).sort(),
    [OPENAI_REVIEW_CLIENT_ID, "owned_browser"].sort(),
  );
  assert.doesNotMatch(
    state.candidates.verify_email.body,
    /clientID == '(?:forged|unknown_component)'/,
  );
});

test("reads complete client pages and rejects unstable, duplicate or incomplete inventories", async () => {
  const clients = Array.from({ length: 104 }, (_, i) => ({
    client_id: `other_${i}`,
    client_metadata: {},
  }));
  clients.push(client());
  const f = fixture({ clients });
  assert.equal((await inspectEmailBranding(f.api)).clients.length, 1);
  assert.equal(f.reads.filter((path) => path.startsWith("clients?")).length, 2);
  for (const result of [
    { clients: [client(), client()], total: 2 },
    { clients: [], total: 1 },
    { clients: [client()], total: -1 },
    { clients: [client()], total: 101 },
    { clients: [client()], total: 0 },
  ])
    await assert.rejects(
      inspectEmailBranding({ request: async () => result }),
      (error) => error.code === "INVALID_CLIENT_RESPONSE",
    );
  await assert.rejects(
    inspectEmailBranding({
      request: async (_method, path) =>
        path.includes("page=0")
          ? { clients: clients.slice(0, 100), total: 105 }
          : { clients: clients.slice(100), total: 106 },
    }),
    (error) => error.code === "INVALID_CLIENT_RESPONSE",
  );
});

test("unreadable templates and concurrent operator edits fail before the affected write", async () => {
  const missing = fixture();
  delete missing.state.templates.verify_email;
  await assert.rejects(
    applyEmailBranding(missing.api),
    (error) => error.code === "TEMPLATE_NOT_PRESERVABLE",
  );
  assert.equal(missing.writes.length, 0);
  let reads = 0;
  const f = fixture({
    beforeRequest({ method, path, state }) {
      if (
        method === "GET" &&
        path === "email-templates/verify_email" &&
        ++reads === 2
      )
        state.templates.verify_email.body = "Operator edit";
    },
  });
  await assert.rejects(
    applyEmailBranding(f.api),
    (error) => error.code === "CONCURRENT_TEMPLATE_CHANGE",
  );
  assert.equal(f.writes.length, 0);
});

test("readback guards functional fields and reports partial or unknown outcomes without retry", async () => {
  let changed = false;
  const f = fixture({
    beforeRequest({ method, path, state, writes }) {
      if (
        !changed &&
        method === "GET" &&
        path === "email-templates/verify_email" &&
        writes.length
      ) {
        changed = true;
        state.templates.verify_email.enabled = false;
      }
    },
  });
  await assert.rejects(
    applyEmailBranding(f.api),
    (error) =>
      error.code === "TEMPLATE_READBACK_MISMATCH" &&
      error.writesAcknowledged === 1 &&
      error.unverifiedTemplate === "verify_email",
  );
  assert.equal(f.writes.length, 1);
  const unknown = fixture();
  let attempts = 0;
  const api = {
    async request(method, path, body) {
      const value = await unknown.api.request(method, path, body);
      if (method === "PATCH" && ++attempts === 2)
        throw new Error("private-provider-response");
      return value;
    },
  };
  await assert.rejects(
    applyEmailBranding(api),
    (error) =>
      error.code === "EMAIL_BRANDING_FAILED" &&
      error.writesAcknowledged === 1 &&
      error.unverifiedTemplate === "reset_email" &&
      !JSON.stringify(error).includes("private-provider"),
  );
  assert.equal(attempts, 2);
  assert.equal((await applyEmailBranding(unknown.api)).writes, 2);
});

test("API allowlist excludes client logos, send jobs, provider and functional configuration", async () => {
  let calls = 0;
  const api = makeEmailBrandingApi(async (args) => {
    calls++;
    return args[0] === "tenants"
      ? [{ name: BRANDING_TENANT, active: true }]
      : {};
  });
  for (const [method, path, body] of [
    ["PATCH", "clients/owned_browser", { logo_uri: EMAIL_LOGO }],
    ["POST", "jobs/verification-email", {}],
    ["PATCH", "emails/provider", {}],
    ["PATCH", "email-templates/verify_email", { enabled: true }],
    [
      "PATCH",
      "email-templates/verify_email",
      {
        body: "b",
        subject: "s",
        from: "f",
        resultUrl: "https://example.invalid",
      },
    ],
    ["POST", "email-templates", {}],
    ["GET", "clients/owned_browser?fields=client_secret&include_fields=true"],
    ["GET", "email-templates/verify_email", {}],
  ])
    await assert.rejects(
      api.request(method, path, body),
      (error) => error.code === "ENDPOINT_REFUSED",
    );
  assert.equal(calls, 0);
  await api.request("GET", "email-templates/verify_email");
  await api.request("PATCH", "email-templates/verify_email", {
    body: "b",
    subject: "s",
    from: "f",
  });
  assert.equal(calls, 4);
  for (const tenants of [
    [],
    [{ name: "other", active: true }],
    [
      { name: BRANDING_TENANT, active: true },
      { name: "other", active: true },
    ],
  ])
    await assert.rejects(
      makeEmailBrandingApi(async () => tenants).request(
        "GET",
        "email-templates/verify_email",
      ),
      (error) => error.code === "WRONG_TENANT",
    );
});

test("summary and offline CLI disclose no provider content or client metadata", async () => {
  const summary = JSON.stringify(
    emailBrandingSummary(await inspectEmailBranding(fixture().api)),
  );
  assert.doesNotMatch(
    summary,
    /hidden-metadata|Prior body|prior@example|owned_browser|resultUrl/,
  );
  const plan = JSON.parse(
    execFileSync(process.execPath, ["scripts/setup-auth0-email-branding.mjs"], {
      encoding: "utf8",
    }),
  );
  assert.equal(plan.mode, "offline-plan");
  assert.deepEqual(plan.locales, EMAIL_LOCALES);
  assert.doesNotMatch(JSON.stringify(plan), /update:clients/);
});

test("generated candidates are current and previews render offline without live image URLs", async () => {
  await writeEmailTemplates({ check: true });
  const temp = await mkdtemp(join(tmpdir(), "guteneo-auth0-email-"));
  try {
    await writeEmailTemplates({ output: join(temp, "generated") });
    await writeFile(join(temp, "generated/verify_email.html.liquid"), "stale");
    await assert.rejects(
      writeEmailTemplates({ check: true, output: join(temp, "generated") }),
      /STALE_EMAIL_TEMPLATE/,
    );
    assert.equal((await buildBrandPreview(join(temp, "previews"))).pages, 16);
    for (const name of TEMPLATE_NAMES)
      for (const language of EMAIL_LOCALES) {
        const html = await readFile(
          join(temp, `previews/${name}-${language}.html`),
          "utf8",
        );
        assert.doesNotMatch(html, /\{%|\{\{|src="https:/);
        assert.match(html, /src="\.\/guteneo-stamp\.png"/);
      }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
