import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { startSecureSetup } from "../../scripts/secure-setup.mjs";
import {
  inspectAuth0Resend,
  makeAuth0EmailApi,
  prepareAuth0Resend,
  resendAuth0Plan,
  startAuth0ResendSetup,
} from "../../scripts/setup-auth0-resend.mjs";
import { TENANT } from "../../scripts/setup-auth0.mjs";

const key = "re_" + "fictional_resend_key_".repeat(2);
const providerInspection =
  "emails/provider?fields=name,enabled,default_from_address&include_fields=true";
const appFixture = {
  RESEND_API_KEY: key,
  RESEND_ACCOUNT_ID: "fictional-guteneo-team",
  RESEND_DOMAIN_ID: "00000000-0000-4000-8000-000000000001",
  RESEND_VERIFIED_DOMAIN: "guteneo.com",
  RESEND_WEBHOOK_SECRET:
    "whsec_" +
    Buffer.from("fictional-webhook-secret-32-bytes").toString("base64"),
};
const authFixture = () => ({
  RESEND_AUTH0_API_KEY: key,
  RESEND_AUTH0_FROM: "no-reply@guteneo.com",
});

test("Resend key-only handoff writes only the key, without fabricated account identity or send flags", async () => {
  let written;
  let held;
  const setup = await startSecureSetup({
    profile: "resend-key",
    writer: async (values) => {
      written = { ...values };
      held = values;
    },
  });
  try {
    const html = await (await fetch(setup.url)).text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    assert.match(html, /name="RESEND_API_KEY" type="password"/);
    assert.doesNotMatch(
      html,
      /name="RESEND_ACCOUNT_ID"|name="RESEND_DOMAIN_ID"/,
    );
    const submit = (fields) =>
      fetch(setup.url, {
        method: "POST",
        headers: { origin: new URL(setup.url).origin },
        body: new URLSearchParams({ csrf, RESEND_API_KEY: key, ...fields }),
      });
    for (const fields of [
      { RESEND_API_KEY: "invalid" },
      { RESEND_ACCOUNT_ID: "invented" },
      { RESEND_SENDS_ENABLED: "true" },
      { LIVE_SENDS_ENABLED: "true" },
      { EMAIL_PROVIDER: "resend" },
    ]) {
      assert.equal((await submit(fields)).status, 400);
      assert.equal(written, undefined);
    }
    const result = await submit({});
    assert.equal(result.status, 200);
    assert.deepEqual(written, { RESEND_API_KEY: key });
    assert.deepEqual(held, { RESEND_API_KEY: "" });
    assert.doesNotMatch(await result.text(), /fictional_resend_key|<input/);
  } finally {
    await setup.close();
  }
});
function providerFixture(current) {
  let saved = current;
  const calls = [];
  const held = [];
  const api = {
    async request(method, path, body) {
      calls.push({ method, path, body: structuredClone(body) });
      if (path !== (method === "GET" ? providerInspection : "emails/provider"))
        throw new Error("Wrong endpoint");
      if (method === "POST" && saved)
        throw new Error("Provider exists: " + key);
      if (method !== "GET") saved = structuredClone(body);
      if (!saved) throw new Error("Provider absent");
      const response = structuredClone(saved);
      held.push(response);
      return response;
    },
  };
  return { calls, api, held };
}

test("Resend form validates scoped metadata and cannot switch or activate either email provider", async () => {
  let written;
  let held;
  const setup = await startSecureSetup({
    profile: "resend",
    writer: async (values) => {
      written = { ...values };
      held = values;
    },
  });
  try {
    const page = await fetch(setup.url);
    assert.equal(page.headers.get("cache-control"), "no-store");
    const html = await page.text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    assert.match(html, /Sending access/);
    for (const field of Object.keys(appFixture))
      assert.match(html, new RegExp(`name="${field}" type="password"`));
    const submit = (overrides) =>
      fetch(setup.url, {
        method: "POST",
        headers: { origin: new URL(setup.url).origin },
        body: new URLSearchParams({ csrf, ...appFixture, ...overrides }),
      });
    for (const invalid of [
      { LIVE_SENDS_ENABLED: "true" },
      { EMAIL_PROVIDER: "resend" },
      { RESEND_SENDS_ENABLED: "true" },
      { RESEND_AUTH0_API_KEY: key },
      { RESEND_API_KEY: "invalid" },
      { RESEND_DOMAIN_ID: "not-a-domain-id" },
      { RESEND_ACCOUNT_ID: "invalid/path" },
      { RESEND_VERIFIED_DOMAIN: "other.example" },
      { RESEND_VERIFIED_DOMAIN: "guteneo.com.attacker.invalid" },
      { RESEND_WEBHOOK_SECRET: "invalid" },
    ]) {
      const result = await submit(invalid);
      assert.equal(result.status, 400);
      assert.doesNotMatch(await result.text(), /fictional_resend_key/);
      assert.equal(written, undefined);
    }
    const success = await submit({});
    assert.equal(success.status, 200);
    assert.deepEqual(written, appFixture);
    assert.ok(Object.values(held).every((value) => value === ""));
    assert.doesNotMatch(await success.text(), /fictional_resend_key|<input/);
    assert.equal((await submit({})).status, 410);
  } finally {
    await setup.close();
  }
});

test("Resend failed secret import clears memory references and suppresses writer details", async () => {
  let held;
  const setup = await startSecureSetup({
    profile: "resend",
    writer: async (values) => {
      held = values;
      throw new Error(key);
    },
  });
  try {
    const csrf = (await (await fetch(setup.url)).text()).match(
      /name="csrf" value="([^"]+)"/,
    )[1];
    const result = await fetch(setup.url, {
      method: "POST",
      headers: { origin: new URL(setup.url).origin },
      body: new URLSearchParams({ csrf, ...appFixture }),
    });
    assert.equal(result.status, 503);
    assert.ok(Object.values(held).every((value) => value === ""));
    assert.doesNotMatch(await result.text(), /fictional_resend_key/);
  } finally {
    await setup.close();
  }
});

test("Auth0 Resend plan is offline, tenant-wide, disabled and distinct from business email gates", async () => {
  const plan = resendAuth0Plan();
  assert.equal(plan.enabled, false);
  assert.equal(plan.tenant, TENANT);
  assert.match(plan.scope, /tenant-wide/);
  assert.match(plan.authenticationEmailTraffic, /Independent/);
  await assert.rejects(
    startSecureSetup({ profile: "auth0-resend" }),
    /dedicated Auth0/,
  );
  await assert.rejects(startAuth0ResendSetup(), {
    code: "TENANT_SCOPE_REQUIRED",
  });
});

test("Auth0 Resend preparation refuses unreviewed scope, unknown modes and secret/enable injection before network", async () => {
  let calls = 0;
  const api = {
    request() {
      calls++;
      throw new Error("Should not request");
    },
  };
  for (const options of [
    {},
    { acknowledgeTenantWide: "true" },
    { acknowledgeTenantWide: true, operation: "enable" },
    {
      acknowledgeTenantWide: true,
      values: { ...authFixture(), enabled: true },
    },
    {
      acknowledgeTenantWide: true,
      values: {
        ...authFixture(),
        RESEND_AUTH0_FROM: "a@guteneo.com.attacker.invalid",
      },
    },
    {
      acknowledgeTenantWide: true,
      values: {
        ...authFixture(),
        RESEND_AUTH0_FROM: "a@guteneo.com\r\nBcc: a@evil.example",
      },
    },
  ]) {
    const values = authFixture();
    await assert.rejects(prepareAuth0Resend({ api, values, ...options }));
  }
  assert.equal(calls, 0);
});

test("Auth0 native Resend create stages disabled via POST and proves exact sender without exposing credentials", async () => {
  const f = providerFixture();
  const values = authFixture();
  const result = await prepareAuth0Resend({
    values,
    acknowledgeTenantWide: true,
    api: f.api,
  });
  assert.deepEqual(
    f.calls.map((call) => call.method),
    ["POST", "GET"],
  );
  assert.deepEqual(f.calls[0].body, {
    name: "resend",
    enabled: false,
    default_from_address: "no-reply@guteneo.com",
    credentials: { api_key: key },
  });
  assert.equal(result.prepared, true);
  assert.equal(result.enabled, false);
  assert.equal(result.deliveryVerified, false);
  assert.equal(result.emailSent, false);
  assert.deepEqual(values, { RESEND_AUTH0_API_KEY: "", RESEND_AUTH0_FROM: "" });
  assert.ok(f.held.every((value) => Object.keys(value).length === 0));
  assert.doesNotMatch(JSON.stringify(result), /fictional_resend_key|no-reply/);
});

test("Auth0 provider update preserves active and unrelated providers and first-create never converts to overwrite", async () => {
  for (const current of [
    {
      name: "resend",
      enabled: true,
      default_from_address: "no-reply@guteneo.com",
    },
    {
      name: "ses",
      enabled: false,
      default_from_address: "no-reply@guteneo.com",
    },
    {
      name: "resend",
      enabled: false,
      default_from_address: "no-reply@other.example",
    },
  ]) {
    const f = providerFixture(current);
    await assert.rejects(
      prepareAuth0Resend({
        values: authFixture(),
        operation: "update-disabled",
        acknowledgeTenantWide: true,
        api: f.api,
      }),
      { code: "PROVIDER_CONFLICT" },
    );
    assert.ok(f.calls.every((call) => call.method === "GET"));
    const create = providerFixture(current);
    await assert.rejects(
      prepareAuth0Resend({
        values: authFixture(),
        acknowledgeTenantWide: true,
        api: create.api,
      }),
      (error) =>
        error.code === "PREPARATION_FAILED" && !String(error).includes(key),
    );
    assert.deepEqual(
      create.calls.map((call) => call.method),
      ["POST"],
    );
  }
});

test("Auth0 disabled Guteneo Resend can be updated, with no Action, send, activation or template mutation", async () => {
  const f = providerFixture({
    name: "resend",
    enabled: false,
    default_from_address: "old@guteneo.com",
  });
  await prepareAuth0Resend({
    values: authFixture(),
    operation: "update-disabled",
    acknowledgeTenantWide: true,
    api: f.api,
  });
  assert.deepEqual(
    f.calls.map((call) => call.method),
    ["GET", "PATCH", "GET"],
  );
  assert.ok(
    f.calls.every(
      (call) =>
        call.path ===
        (call.method === "GET" ? providerInspection : "emails/provider"),
    ),
  );
  assert.equal(f.calls[1].body.enabled, false);
});

test("Auth0 uncertain writes and mismatched rereads never auto-retry or claim preparation", async () => {
  for (const failure of ["write", "enabled", "sender", "read"]) {
    const calls = [];
    const values = authFixture();
    const api = {
      async request(method) {
        calls.push(method);
        if (method === "POST" && failure === "write") throw new Error(key);
        if (method === "GET" && failure === "read") throw new Error(key);
        return {
          name: "resend",
          enabled: failure === "enabled",
          default_from_address:
            failure === "sender" ? "wrong@guteneo.com" : "no-reply@guteneo.com",
          credentials: { api_key: key },
        };
      },
    };
    await assert.rejects(
      prepareAuth0Resend({ values, acknowledgeTenantWide: true, api }),
      (error) => !String(error).includes(key),
    );
    assert.equal(calls.filter((method) => method === "POST").length, 1);
    assert.ok(Object.values(values).every((value) => value === ""));
  }
});

test("Auth0 email API pins active tenant and exact endpoint before submitting private data over stdin transport", async () => {
  const calls = [];
  const run = async (args, body) => {
    calls.push({ args, body });
    return args[0] === "tenants" ? [{ name: TENANT, active: true }] : {};
  };
  const api = makeAuth0EmailApi(run);
  for (const [method, path] of [
    ["POST", "jobs/verification-email"],
    ["DELETE", "emails/provider"],
    ["POST", "https://evil.invalid"],
    ["GET", "emails/provider"],
    ["GET", "emails/provider?fields=credentials&include_fields=true"],
    [
      "GET",
      "emails/provider?fields=name,enabled,default_from_address&include_fields=false",
    ],
    ["POST", providerInspection],
  ])
    await assert.rejects(api.request(method, path), {
      code: "INVALID_ENDPOINT",
    });
  assert.equal(calls.length, 0);
  await api.request("POST", "emails/provider", {
    credentials: { api_key: key },
  });
  assert.doesNotMatch(
    JSON.stringify(calls.map((call) => call.args)),
    /fictional_resend_key/,
  );
  assert.equal(calls[1].body.credentials.api_key, key);
  await assert.rejects(
    makeAuth0EmailApi(async () => [
      { name: "other.auth0.com", active: true },
    ]).request("GET", providerInspection),
    { code: "WRONG_TENANT" },
  );
});

test("Auth0 inspection exposes only readiness booleans and erases unexpected secret fields", async () => {
  const f = providerFixture({
    name: "resend",
    enabled: false,
    default_from_address: "no-reply@guteneo.com",
    credentials: { api_key: key },
  });
  const result = await inspectAuth0Resend(f.api);
  assert.equal(result.nativeResend, true);
  assert.doesNotMatch(JSON.stringify(result), /fictional_resend_key|no-reply/);
  assert.deepEqual(f.held, [{}]);
});

test("Auth0 inspection requests sender metadata explicitly without requesting credentials", async () => {
  const calls = [];
  const api = makeAuth0EmailApi(async (args) => {
    calls.push(args);
    if (args[0] === "tenants") return [{ name: TENANT, active: true }];
    // Reproduce Auth0's real default field projection: a bare GET cannot prove
    // the sender, even after the preceding create already succeeded.
    return {
      name: "resend",
      enabled: false,
      ...(args[2] === providerInspection
        ? { default_from_address: "no-reply@guteneo.com" }
        : {}),
    };
  });
  const result = await inspectAuth0Resend(api, "no-reply@guteneo.com");
  assert.equal(result.guteneoSender, true);
  assert.equal(result.senderMatches, true);
  assert.equal(result.enabled, false);
  assert.deepEqual(calls[1], ["api", "get", providerInspection]);
  assert.doesNotMatch(JSON.stringify(calls), /credentials|settings/);
  assert.doesNotMatch(JSON.stringify(result), /no-reply/);
});

test("Auth0 sender verification refuses missing metadata or header injection", async () => {
  await assert.rejects(
    inspectAuth0Resend({
      request: async () => ({ name: "resend", enabled: false }),
    }),
    { code: "INVALID_PROVIDER" },
  );
  const result = await inspectAuth0Resend({
    request: async () => ({
      name: "resend",
      enabled: false,
      default_from_address: "other@evil.invalid\r\nno-reply@guteneo.com",
    }),
  });
  assert.equal(result.guteneoSender, false);
  assert.doesNotMatch(JSON.stringify(result), /evil|no-reply/);
});

test("real browser Auth0 preparation masks the key and never activates or echoes it", async () => {
  const f = providerFixture();
  const setup = await startAuth0ResendSetup({
    acknowledgeTenantWide: true,
    api: f.api,
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(setup.url);
    for (const [field, value] of Object.entries(authFixture())) {
      const input = page.locator(`input[name="${field}"]`);
      assert.equal(await input.getAttribute("type"), "password");
      await input.fill(value);
    }
    await page
      .getByRole("button", { name: "Préparer dans Auth0, sans activation" })
      .click();
    await page
      .getByText(
        "Fournisseur préparé dans Auth0 et relu désactivé. Aucun email envoyé.",
        { exact: true },
      )
      .waitFor();
    assert.doesNotMatch(await page.content(), /fictional_resend_key|<input/);
    assert.deepEqual(
      f.calls.map((call) => call.method),
      ["POST", "GET"],
    );
    assert.equal(f.calls[0].body.enabled, false);
  } finally {
    await browser.close();
    await setup.close();
  }
});

test("webhook-only handoff preserves the sending key and erases the signing secret after transfer", async () => {
  let written;
  let held;
  const setup = await startSecureSetup({
    profile: "resend-webhook",
    writer: async (values) => {
      written = { ...values };
      held = values;
    },
  });
  try {
    const html = await (await fetch(setup.url)).text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    assert.match(html, /name="RESEND_WEBHOOK_SECRET" type="password"/);
    assert.doesNotMatch(html, /name="RESEND_API_KEY"/);
    const submit = (fields) =>
      fetch(setup.url, {
        method: "POST",
        headers: { origin: new URL(setup.url).origin },
        body: new URLSearchParams({ csrf, ...fields }),
      });
    assert.equal(
      (await submit({ RESEND_WEBHOOK_SECRET: "invalid" })).status,
      400,
    );
    assert.equal(
      (
        await submit({
          RESEND_WEBHOOK_SECRET: appFixture.RESEND_WEBHOOK_SECRET,
          RESEND_API_KEY: key,
        })
      ).status,
      400,
    );
    assert.equal(written, undefined);
    const response = await submit({
      RESEND_WEBHOOK_SECRET: appFixture.RESEND_WEBHOOK_SECRET,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(written, {
      RESEND_WEBHOOK_SECRET: appFixture.RESEND_WEBHOOK_SECRET,
    });
    assert.deepEqual(held, { RESEND_WEBHOOK_SECRET: "" });
    assert.doesNotMatch(await response.text(), /whsec_|<input/);
  } finally {
    await setup.close();
  }
});
