import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  applyBranding,
  brandingCli,
  brandingSummary,
  inspectBranding,
  makeBrandingApi,
  BRANDING,
  THEME,
  TEXTS,
  BrandingError,
} from "../../scripts/setup-auth0-branding.mjs";

function failedCli(diagnostic) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    queueMicrotask(() => {
      child.stderr.write(diagnostic);
      child.emit("close", 1);
    });
    return child;
  };
}

test("projects multiline CLI errors without returning raw provider output", async () => {
  for (const [diagnostic, expected] of [
    [
      'Error! HTTP 404: {"error":"Not Found","message":"private-marker"}',
      "NOT_FOUND",
    ],
    [
      'Error! HTTP 403: {"error":"Forbidden","message":"private-marker"}',
      "PERMISSION_REQUIRED",
    ],
    [
      'Error! HTTP 400: {"error":"Bad Request","message":"private-marker"}',
      "INVALID_BRANDING_PAYLOAD",
    ],
  ]) {
    await assert.rejects(
      brandingCli(
        ["api", "get", "branding/themes/default"],
        undefined,
        failedCli(diagnostic),
      ),
      (error) =>
        error.code === expected &&
        !JSON.stringify(error).includes("private-marker"),
    );
  }
});

function fixture(overrides = {}) {
  let state = {
    branding: {},
    theme: null,
    prompts: { universal_login_experience: "new", identifier_first: false },
    settings: {
      friendly_name: "Old product",
      enabled_locales: ["fr", "en"],
      session_lifetime: 1,
    },
    texts: {},
    ...overrides,
  };
  const mutations = [];
  const api = {
    async request(method, path, body) {
      if (method === "GET") {
        if (path === "prompts") return structuredClone(state.prompts);
        if (path === "branding") return structuredClone(state.branding);
        if (path === "tenants/settings") return structuredClone(state.settings);
        if (path === "branding/themes/default") {
          if (!state.theme) throw new BrandingError("NOT_FOUND");
          return structuredClone(state.theme);
        }
        return structuredClone(state.texts[path] ?? {});
      }
      mutations.push({ method, path, body: structuredClone(body) });
      if (path === "branding/themes" || path.startsWith("branding/themes/"))
        state.theme = { ...body, themeId: "theme_fixture" };
      else if (path === "branding")
        state.branding = { ...state.branding, ...body };
      else if (path === "tenants/settings") Object.assign(state.settings, body);
      else state.texts[path] = structuredClone(body);
      return {};
    },
  };
  return { api, state, mutations };
}

test("applies only branded presentation, preserves prompt dictionaries and is idempotent", async () => {
  const f = fixture({
    texts: {
      "prompts/login/custom-text/fr": {
        login: { forgotPasswordText: "Mot de passe oublié ?", title: "Old" },
        "other-screen": { description: "Keep" },
      },
    },
  });
  const result = await applyBranding(f.api);
  assert.equal(result.brandingMatches, true);
  assert.equal(result.themeMatches, true);
  assert.equal(result.friendlyNameMatches, true);
  assert.equal(
    f.state.texts["prompts/login/custom-text/fr"].login.forgotPasswordText,
    "Mot de passe oublié ?",
  );
  assert.equal(
    f.state.texts["prompts/login/custom-text/fr"]["other-screen"].description,
    "Keep",
  );
  assert.deepEqual(f.state.prompts, {
    universal_login_experience: "new",
    identifier_first: false,
  });
  assert.equal(f.state.settings.session_lifetime, 1);
  assert.equal(f.mutations.length, 15);
  const count = f.mutations.length;
  await applyBranding(f.api);
  assert.equal(f.mutations.length, count);
});

test("refuses Classic or missing access without enabling another login mode", async () => {
  const f = fixture({ prompts: { universal_login_experience: "classic" } });
  await assert.rejects(applyBranding(f.api), {
    code: "NEW_UNIVERSAL_LOGIN_REQUIRED",
  });
  assert.equal(f.mutations.length, 0);
  const denied = {
    request: async (method, path) => {
      if (path === "branding/themes/default")
        throw new BrandingError("PERMISSION_REQUIRED");
      return path === "prompts" ? { universal_login_experience: "new" } : {};
    },
  };
  await assert.rejects(inspectBranding(denied), {
    code: "PERMISSION_REQUIRED",
  });
});

test("refuses functional, subscription, credential, template and cross-tenant operations", async () => {
  let calls = 0;
  const api = makeBrandingApi(async () => {
    calls++;
    return [{ name: "pieper.eu.auth0.com", active: true }];
  });
  for (const [method, path, body] of [
    ["PATCH", "prompts", { universal_login_experience: "classic" }],
    [
      "PATCH",
      "tenants/settings",
      { friendly_name: "Guteneo", enabled_locales: ["en"] },
    ],
    ["PUT", "branding/templates/universal-login", {}],
    ["POST", "clients", {}],
    ["PATCH", "branding/themes/../clients", {}],
    ["PUT", "prompts/mfa/custom-text/fr", {}],
  ])
    await assert.rejects(api.request(method, path, body), {
      code: "ENDPOINT_REFUSED",
    });
  assert.equal(calls, 0);
  const wrong = makeBrandingApi(async () => [
    { name: "other.eu.auth0.com", active: true },
  ]);
  await assert.rejects(wrong.request("PATCH", "branding", BRANDING), {
    code: "WRONG_TENANT",
  });
});

test("rechecks the selected tenant immediately before every API call", async () => {
  const calls = [];
  const api = makeBrandingApi(async (args) => {
    calls.push(args);
    return args[0] === "tenants"
      ? [{ name: "pieper.eu.auth0.com", active: true }]
      : {};
  });
  await api.request("GET", "branding");
  await api.request("PATCH", "tenants/settings", { friendly_name: "Guteneo" });
  assert.deepEqual(
    calls.map((args) => args[0]),
    ["tenants", "api", "tenants", "api"],
  );
});

test("summary never exports unknown strings, secrets or signed URLs", async () => {
  const f = fixture({
    branding: { logo_url: "https://example.com/?token=secret" },
    settings: {
      friendly_name: "secret",
      enabled_locales: ["fr", "en", "secret"],
    },
    texts: {
      "prompts/login/custom-text/fr": { login: { description: "private" } },
    },
  });
  const summary = JSON.stringify(brandingSummary(await inspectBranding(f.api)));
  assert.doesNotMatch(summary, /secret|private|example/);
  assert.deepEqual(THEME.colors.widget_background, "#fffefa");
  assert.deepEqual(THEME.page_background.background_color, "#f6f5ef");
  assert.deepEqual(THEME.colors.body_text, "#181b22");
  assert.deepEqual(THEME.colors.primary_button, "#2450db");
  assert.deepEqual(Object.keys(TEXTS), ["fr", "en"]);
});
