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
  LOCALE_FALLBACKS,
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
      enabled_locales: ["fr", "en", "de"],
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
  const nativeLogin = {
    forgotPasswordText: "Mot de passe oublié ?",
    passwordPlaceholder: "Mot de passe",
    buttonText: "Continuer",
    federatedConnectionButtonText: "Continuer avec ${connectionName}",
  };
  const nativePassword = {
    forgotPasswordText: "Mot de passe oublié ?",
    passwordPlaceholder: "Mot de passe",
    buttonText: "Continuer",
  };
  const f = fixture({
    texts: {
      "prompts/login/custom-text/fr": {
        login: { ...nativeLogin, title: "Old" },
        "other-screen": { description: "Keep" },
      },
      "prompts/login-password/custom-text/fr": {
        "login-password": { ...nativePassword, title: "Old" },
        "other-screen": { description: "Keep" },
      },
    },
  });
  const result = await applyBranding(f.api);
  assert.equal(result.brandingMatches, true);
  assert.equal(result.themeMatches, true);
  assert.equal(result.friendlyNameMatches, true);
  for (const [prompt, native] of [
    ["login", nativeLogin],
    ["login-password", nativePassword],
  ])
    for (const [field, value] of Object.entries(native))
      assert.equal(
        f.state.texts[`prompts/${prompt}/custom-text/fr`][prompt][field],
        value,
      );
  for (const [language, screens] of Object.entries(TEXTS))
    for (const prompt of ["login", "login-id", "signup", "signup-id"]) {
      const fields = screens[prompt];
      assert.ok(
        fields.footerText.trim(),
        `${language}/${prompt} footer prompt`,
      );
      assert.ok(
        fields.footerLinkText.trim(),
        `${language}/${prompt} footer link`,
      );
      assert.equal(
        f.state.texts[`prompts/${prompt}/custom-text/${language}`][prompt]
          .footerLinkText,
        fields.footerLinkText,
      );
    }
  assert.equal(
    f.state.texts["prompts/login/custom-text/fr"]["other-screen"].description,
    "Keep",
  );
  assert.deepEqual(f.state.prompts, {
    universal_login_experience: "new",
    identifier_first: false,
  });
  assert.equal(f.state.settings.session_lifetime, 1);
  assert.equal(f.mutations.length, 21);
  const count = f.mutations.length;
  await applyBranding(f.api);
  assert.equal(f.mutations.length, count);
});

test("updates the full default theme while preserving optional identifier and captcha settings", async () => {
  const identifiers = {
    login_display: "unified",
    otp_autocomplete: false,
    phone_display: { formatting: "international", masking: "show_all" },
  };
  const f = fixture({
    theme: {
      ...structuredClone(THEME),
      themeId: "existing_theme",
      colors: {
        ...THEME.colors,
        primary_button: "#000000",
        captcha_widget_theme: "dark",
      },
      identifiers,
      providerReadOnlyMetadata: "private-marker",
    },
  });
  await applyBranding(f.api);
  const update = f.mutations.find(
    ({ path }) => path === "branding/themes/existing_theme",
  );
  assert.equal(update.method, "PATCH");
  assert.deepEqual(update.body.identifiers, identifiers);
  assert.equal(update.body.colors.captcha_widget_theme, "dark");
  assert.equal(update.body.themeId, undefined);
  assert.equal(update.body.providerReadOnlyMetadata, undefined);
  assert.equal(
    f.mutations.some(({ method }) => method === "POST"),
    false,
  );
  const count = f.mutations.length;
  await applyBranding(f.api);
  assert.equal(f.mutations.length, count);
});

test("does not report success when the provider readback ignores a branding update", async () => {
  const f = fixture();
  const api = {
    request(method, path, body) {
      if (method === "PATCH" && path === "branding") return {};
      return f.api.request(method, path, body);
    },
  };
  await assert.rejects(applyBranding(api), { code: "READBACK_MISMATCH" });
});

test("prepares German copy without enabling locales or sending unsupported Luxembourgish requests", async () => {
  const f = fixture({
    settings: { friendly_name: "Guteneo", enabled_locales: ["fr", "en"] },
    texts: {
      "prompts/signup/custom-text/de": {
        signup: { buttonText: "Registrieren" },
        "other-screen": { description: "Keep" },
      },
    },
  });
  const result = await applyBranding(f.api);
  assert.deepEqual(f.state.settings.enabled_locales, ["fr", "en"]);
  assert.deepEqual(result.missingEnabledLocales, ["de"]);
  assert.deepEqual(result.localeFallbacks, { lb: "de" });
  assert.equal(
    f.state.texts["prompts/signup/custom-text/de"].signup.buttonText,
    "Registrieren",
  );
  assert.equal(
    f.state.texts["prompts/signup/custom-text/de"]["other-screen"].description,
    "Keep",
  );
  assert.equal(
    f.mutations.some(
      ({ path }) => path === "tenants/settings" || path.endsWith("/lb"),
    ),
    false,
  );
  assert.deepEqual(Object.keys(TEXTS), ["fr", "en", "de"]);
  assert.deepEqual(LOCALE_FALLBACKS, { lb: "de" });
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
    ["PUT", "prompts/login/custom-text/lb", {}],
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
      enabled_locales: ["fr", "en", "de", "secret"],
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
  assert.deepEqual(Object.keys(TEXTS), ["fr", "en", "de"]);
});
