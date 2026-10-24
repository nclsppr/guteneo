import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const BRANDING_TENANT = "pieper.eu.auth0.com";
// Universal Login supports French, English and German, but not Luxembourgish.
// Keep this presentation plan in sync with the BFF's ui_locales mapping. The
// tenant's enabled_locales are deliberately never changed by this script.
// https://auth0.com/docs/customize/internationalization-and-localization/universal-login-internationalization
export const LOCALE_FALLBACKS = { lb: "de" };
// The official lowercase, ink wordmark is live text in EB Garamond. There is no
// standalone wordmark asset to reuse in Auth0's image-only logo field, so retain
// the official transparent portrait rather than substituting a different mark.
const LOGO = "https://guteneo.com/brand/guteneo-portrait.png";
const FAVICON = "https://guteneo.com/favicon.svg?brand=20260917";
export const BRANDING = {
  colors: { primary: "#2450db", page_background: "#f6f5ef" },
  logo_url: LOGO,
  favicon_url: FAVICON,
};
export const THEME = {
  displayName: "Guteneo — connexion",
  borders: {
    button_border_radius: 6,
    button_border_weight: 1,
    buttons_style: "rounded",
    input_border_radius: 6,
    input_border_weight: 1,
    inputs_style: "rounded",
    show_widget_shadow: false,
    widget_border_weight: 1,
    widget_corner_radius: 12,
  },
  colors: {
    body_text: "#181b22",
    header: "#181b22",
    icons: "#545966",
    input_background: "#fffefa",
    input_border: "#747985",
    input_filled_text: "#181b22",
    input_labels_placeholders: "#545966",
    links_focused_components: "#2450db",
    primary_button: "#2450db",
    primary_button_label: "#fffefa",
    secondary_button_border: "#747985",
    secondary_button_label: "#181b22",
    widget_background: "#fffefa",
    widget_border: "#d9d9d2",
    error: "#b42318",
    success: "#196d49",
    base_focus_color: "#1b3caa",
    base_hover_color: "#17328f",
    read_only_background: "#f6f5ef",
  },
  fonts: {
    body_text: { bold: false, size: 100 },
    buttons_text: { bold: true, size: 100 },
    font_url: "",
    input_labels: { bold: false, size: 100 },
    links: { bold: false, size: 100 },
    links_style: "normal",
    reference_text_size: 16,
    subtitle: { bold: false, size: 100 },
    title: { bold: true, size: 150 },
  },
  page_background: {
    background_color: "#f6f5ef",
    background_image_url: "",
    page_layout: "center",
  },
  widget: {
    logo_height: 44,
    logo_url: LOGO,
    logo_position: "center",
    header_text_alignment: "center",
    social_buttons_layout: "bottom",
  },
};
export const TEXTS = {
  fr: {
    login: {
      title: "Se connecter à Guteneo",
      description: "Retrouvez vos documents et suivez vos envois.",
      footerText: "Première visite ?",
      footerLinkText: "Créer un accès",
      logoAltText: "guteneo",
    },
    "login-id": {
      title: "Se connecter à Guteneo",
      description: "Retrouvez vos documents et suivez vos envois.",
      footerText: "Première visite ?",
      footerLinkText: "Créer un accès",
      logoAltText: "guteneo",
    },
    "login-password": {
      title: "Votre mot de passe",
      description: "Après connexion, vous retrouverez la page demandée.",
      logoAltText: "guteneo",
    },
    signup: {
      title: "Bienvenue chez Guteneo",
      description: "Créez votre accès pour préparer et suivre vos envois.",
      footerText: "Déjà inscrit ?",
      footerLinkText: "Se connecter",
      logoAltText: "guteneo",
    },
    "signup-id": {
      title: "Bienvenue chez Guteneo",
      description: "Créez votre accès pour préparer et suivre vos envois.",
      footerText: "Déjà inscrit ?",
      footerLinkText: "Se connecter",
      logoAltText: "guteneo",
    },
    "signup-password": {
      title: "Choisir un mot de passe",
      description: "Protégez votre accès à Guteneo.",
      logoAltText: "guteneo",
    },
  },
  en: {
    login: {
      title: "Sign in to Guteneo",
      description: "Find your documents and track your deliveries.",
      footerText: "New here?",
      footerLinkText: "Get started",
      logoAltText: "guteneo",
    },
    "login-id": {
      title: "Sign in to Guteneo",
      description: "Find your documents and track your deliveries.",
      footerText: "New here?",
      footerLinkText: "Get started",
      logoAltText: "guteneo",
    },
    "login-password": {
      title: "Your password",
      description: "After signing in, you’ll return to the page you requested.",
      logoAltText: "guteneo",
    },
    signup: {
      title: "Welcome to Guteneo",
      description: "Create your account to prepare and track your deliveries.",
      footerText: "Already registered?",
      footerLinkText: "Sign in",
      logoAltText: "guteneo",
    },
    "signup-id": {
      title: "Welcome to Guteneo",
      description: "Create your account to prepare and track your deliveries.",
      footerText: "Already registered?",
      footerLinkText: "Sign in",
      logoAltText: "guteneo",
    },
    "signup-password": {
      title: "Choose a password",
      description: "Keep your access to Guteneo secure.",
      logoAltText: "guteneo",
    },
  },
  de: {
    login: {
      title: "Bei Guteneo anmelden",
      description:
        "Finden Sie Ihre Dokumente und verfolgen Sie Ihre Sendungen.",
      footerText: "Zum ersten Mal hier?",
      footerLinkText: "Zugang erstellen",
      logoAltText: "guteneo",
    },
    "login-id": {
      title: "Bei Guteneo anmelden",
      description:
        "Finden Sie Ihre Dokumente und verfolgen Sie Ihre Sendungen.",
      footerText: "Zum ersten Mal hier?",
      footerLinkText: "Zugang erstellen",
      logoAltText: "guteneo",
    },
    "login-password": {
      title: "Ihr Passwort",
      description:
        "Nach der Anmeldung kehren Sie zur gewünschten Seite zurück.",
      logoAltText: "guteneo",
    },
    signup: {
      title: "Willkommen bei Guteneo",
      description:
        "Erstellen Sie Ihren Zugang, um Ihre Sendungen vorzubereiten und zu verfolgen.",
      footerText: "Bereits registriert?",
      footerLinkText: "Anmelden",
      logoAltText: "guteneo",
    },
    "signup-id": {
      title: "Willkommen bei Guteneo",
      description:
        "Erstellen Sie Ihren Zugang, um Ihre Sendungen vorzubereiten und zu verfolgen.",
      footerText: "Bereits registriert?",
      footerLinkText: "Anmelden",
      logoAltText: "guteneo",
    },
    "signup-password": {
      title: "Passwort wählen",
      description: "Sichern Sie Ihren Zugang zu Guteneo.",
      logoAltText: "guteneo",
    },
  },
};

export class BrandingError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Credentials remain in the official CLI. Never echo its raw stdout/stderr,
// login automatically, or include response text in an exception.
export function brandingCli(args, payload, spawnChild = spawn) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnChild("auth0", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = [],
      err = [];
    let size = 0,
      done = false;
    const wipe = () => {
      for (const chunk of [...out, ...err]) chunk.fill(0);
    };
    const fail = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      wipe();
      reject(new BrandingError(code));
    };
    const timer = setTimeout(() => {
      child.kill();
      fail("CLI_TIMEOUT");
    }, 30_000);
    child.once("error", () => fail("CLI_UNAVAILABLE"));
    for (const [stream, chunks] of [
      [child.stdout, out],
      [child.stderr, err],
    ]) {
      stream.on("data", (bytes) => {
        if (done) return;
        size += bytes.length;
        if (size > 512 * 1024) {
          child.kill();
          fail("RESPONSE_TOO_LARGE");
          return;
        }
        chunks.push(Buffer.from(bytes));
      });
    }
    child.once("close", (exitCode) => {
      if (done) return;
      clearTimeout(timer);
      const stdout = Buffer.concat(out),
        stderr = Buffer.concat(err);
      try {
        if (exitCode !== 0) {
          const diagnostic = stderr.toString("utf8");
          if (/\b404\b/.test(diagnostic) && /not found/i.test(diagnostic))
            throw new BrandingError("NOT_FOUND");
          if (
            (/\b403\b/.test(diagnostic) && /forbidden/i.test(diagnostic)) ||
            /insufficient[_ ]scope/i.test(diagnostic)
          )
            throw new BrandingError("PERMISSION_REQUIRED");
          if (/\b400\b/.test(diagnostic))
            throw new BrandingError("INVALID_BRANDING_PAYLOAD");
          throw new BrandingError("CLI_REQUEST_FAILED");
        }
        const result = stdout.length ? JSON.parse(stdout.toString("utf8")) : {};
        if (object(result) && (result.error || result.statusCode >= 400))
          throw new BrandingError("API_REQUEST_FAILED");
        done = true;
        resolvePromise(result);
      } catch (error) {
        fail(error instanceof BrandingError ? error.code : "INVALID_RESPONSE");
      } finally {
        stdout.fill(0);
        stderr.fill(0);
        wipe();
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(
      payload === undefined ? undefined : JSON.stringify(payload),
    );
  });
}

export function makeBrandingApi(run = brandingCli) {
  return {
    async request(method, path, body) {
      const allowed =
        (method === "GET" &&
          [
            "branding",
            "branding/themes/default",
            "prompts",
            "tenants/settings",
          ].includes(path)) ||
        (method === "PATCH" && path === "branding") ||
        (method === "POST" && path === "branding/themes") ||
        (method === "PATCH" &&
          /^branding\/themes\/[A-Za-z0-9_-]{1,200}$/.test(path)) ||
        (["GET", "PUT"].includes(method) &&
          /^prompts\/(login|login-id|login-password|signup|signup-id|signup-password)\/custom-text\/(fr|en|de)$/.test(
            path,
          )) ||
        (method === "PATCH" &&
          path === "tenants/settings" &&
          JSON.stringify(body) === '{"friendly_name":"Guteneo"}');
      if (!allowed) throw new BrandingError("ENDPOINT_REFUSED");
      const tenants = await run(["tenants", "list", "--json"]);
      const active = Array.isArray(tenants)
        ? tenants.filter((tenant) => tenant.active === true)
        : [];
      if (active.length !== 1 || active[0].name !== BRANDING_TENANT)
        throw new BrandingError("WRONG_TENANT");
      try {
        return await run(["api", method.toLowerCase(), path], body);
      } catch (error) {
        if (error instanceof BrandingError) error.endpoint = path;
        throw error;
      }
    },
  };
}

function merge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch))
    result[key] = object(value)
      ? merge(object(base?.[key]) ? base[key] : {}, value)
      : value;
  return result;
}
function contains(actual, expected) {
  if (!object(expected)) return actual === expected;
  return (
    object(actual) &&
    Object.entries(expected).every(([key, value]) =>
      contains(actual[key], value),
    )
  );
}
export async function inspectBranding(api) {
  const prompts = await api.request("GET", "prompts");
  if (prompts.universal_login_experience !== "new")
    throw new BrandingError("NEW_UNIVERSAL_LOGIN_REQUIRED");
  const branding = await api.request("GET", "branding");
  const settings = await api.request("GET", "tenants/settings");
  let theme = null;
  try {
    theme = await api.request("GET", "branding/themes/default");
  } catch (error) {
    if (error.code !== "NOT_FOUND") throw error;
  }
  if (
    theme !== null &&
    (!object(theme) || !/^[A-Za-z0-9_-]{1,200}$/.test(theme.themeId ?? ""))
  )
    throw new BrandingError("INVALID_THEME_REFERENCE");
  const texts = {};
  for (const [language, screens] of Object.entries(TEXTS)) {
    texts[language] = {};
    for (const prompt of Object.keys(screens)) {
      const result = await api.request(
        "GET",
        `prompts/${prompt}/custom-text/${language}`,
      );
      if (!object(result)) throw new BrandingError("INVALID_PROMPT_RESPONSE");
      texts[language][prompt] = result;
    }
  }
  return { prompts, branding, settings, theme, texts };
}
export function brandingSummary(state) {
  return {
    tenant: BRANDING_TENANT,
    experience: state.prompts.universal_login_experience,
    friendlyNameMatches: state.settings.friendly_name === "Guteneo",
    enabledLocales: (state.settings.enabled_locales ?? []).filter((value) =>
      Object.hasOwn(TEXTS, value),
    ),
    missingEnabledLocales: Object.keys(TEXTS).filter(
      (language) => !(state.settings.enabled_locales ?? []).includes(language),
    ),
    localeFallbacks: LOCALE_FALLBACKS,
    brandingMatches: contains(state.branding, BRANDING),
    themePresent: state.theme !== null,
    themeMatches: contains(state.theme, THEME),
    textMatches: Object.fromEntries(
      Object.entries(TEXTS).map(([language, screens]) => [
        language,
        Object.fromEntries(
          Object.entries(screens).map(([prompt, fields]) => [
            prompt,
            contains(state.texts[language][prompt]?.[prompt], fields),
          ]),
        ),
      ]),
    ),
  };
}
export async function applyBranding(api) {
  const before = await inspectBranding(api);
  if (!contains(before.theme, THEME)) {
    if (before.theme) {
      // PATCH requires the complete theme. Carry optional presentation fields
      // and identifier settings through, without sending the read-only themeId.
      const current = Object.fromEntries(
        [
          "displayName",
          "borders",
          "colors",
          "fonts",
          "identifiers",
          "page_background",
          "widget",
        ]
          .filter((key) => Object.hasOwn(before.theme, key))
          .map((key) => [key, before.theme[key]]),
      );
      await api.request(
        "PATCH",
        `branding/themes/${before.theme.themeId}`,
        merge(current, THEME),
      );
    } else await api.request("POST", "branding/themes", THEME);
  }
  if (!contains(before.branding, BRANDING))
    await api.request("PATCH", "branding", BRANDING);
  if (before.settings.friendly_name !== "Guteneo")
    await api.request("PATCH", "tenants/settings", {
      friendly_name: "Guteneo",
    });
  for (const [language, screens] of Object.entries(TEXTS)) {
    for (const [prompt, fields] of Object.entries(screens)) {
      const current = before.texts[language][prompt];
      if (!contains(current[prompt], fields))
        await api.request(
          "PUT",
          `prompts/${prompt}/custom-text/${language}`,
          merge(current, { [prompt]: fields }),
        );
    }
  }
  const after = await inspectBranding(api);
  if (
    JSON.stringify(before.prompts) !== JSON.stringify(after.prompts) ||
    JSON.stringify(before.settings.enabled_locales) !==
      JSON.stringify(after.settings.enabled_locales)
  )
    throw new BrandingError("FUNCTIONAL_SETTINGS_CHANGED");
  const summary = brandingSummary(after);
  if (
    !summary.brandingMatches ||
    !summary.themeMatches ||
    !summary.friendlyNameMatches ||
    Object.values(summary.textMatches).some((group) =>
      Object.values(group).some((value) => !value),
    )
  )
    throw new BrandingError("READBACK_MISMATCH");
  return {
    ...summary,
    appliedAt: new Date().toISOString(),
    before: brandingSummary(before),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0)
      console.log(
        JSON.stringify(
          {
            mode: "offline-plan",
            tenant: BRANDING_TENANT,
            branding: BRANDING,
            theme: THEME,
            texts: TEXTS,
            localeFallbacks: LOCALE_FALLBACKS,
            enabledLocalesUnchanged: true,
          },
          null,
          2,
        ),
      );
    else if (args.length === 1 && ["--inspect", "--apply"].includes(args[0])) {
      const api = makeBrandingApi();
      const result =
        args[0] === "--apply"
          ? await applyBranding(api)
          : brandingSummary(await inspectBranding(api));
      console.log(JSON.stringify(result, null, 2));
    } else throw new BrandingError("INVALID_ARGUMENTS");
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof BrandingError ? error.code : "BRANDING_FAILED",
        endpoint: error instanceof BrandingError ? error.endpoint : undefined,
        providerOutputWithheld: true,
      }),
    );
    process.exitCode = 1;
  }
}
