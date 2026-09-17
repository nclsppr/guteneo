import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const BRANDING_TENANT = "pieper.eu.auth0.com";
const LOGO = "https://guteneo.com/favicon.svg";
export const BRANDING = {
  colors: { primary: "#2450db", page_background: "#f6f5ef" },
  logo_url: LOGO,
  favicon_url: LOGO,
};
export const THEME = {
  displayName: "Guteneo — atelier de correspondance",
  borders: {
    button_border_radius: 2,
    button_border_weight: 1,
    buttons_style: "rounded",
    input_border_radius: 2,
    input_border_weight: 1,
    inputs_style: "rounded",
    show_widget_shadow: false,
    widget_border_weight: 1,
    widget_corner_radius: 4,
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
    base_focus_color: "#2450db",
    base_hover_color: "#181b22",
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
    logo_height: 56,
    logo_url: LOGO,
    logo_position: "center",
    header_text_alignment: "center",
    social_buttons_layout: "bottom",
  },
};
export const TEXTS = {
  fr: {
    login: {
      title: "Bienvenue chez Guteneo",
      description: "Connectez-vous à votre atelier de correspondance.",
      logoAltText: "Guteneo",
    },
    "login-id": {
      title: "Bienvenue chez Guteneo",
      description: "Connectez-vous à votre atelier de correspondance.",
      logoAltText: "Guteneo",
    },
    "login-password": {
      title: "Votre mot de passe",
      description: "Retrouvez votre atelier Guteneo.",
      logoAltText: "Guteneo",
    },
    signup: {
      title: "Créez votre atelier",
      description:
        "Votre compte Guteneo, pour préparer et suivre votre correspondance.",
      logoAltText: "Guteneo",
    },
    "signup-id": {
      title: "Créez votre atelier",
      description:
        "Votre compte Guteneo, pour préparer et suivre votre correspondance.",
      logoAltText: "Guteneo",
    },
    "signup-password": {
      title: "Protégez votre atelier",
      description: "Choisissez un mot de passe pour votre compte Guteneo.",
      logoAltText: "Guteneo",
    },
  },
  en: {
    login: {
      title: "Welcome to Guteneo",
      description: "Sign in to your correspondence workspace.",
      logoAltText: "Guteneo",
    },
    "login-id": {
      title: "Welcome to Guteneo",
      description: "Sign in to your correspondence workspace.",
      logoAltText: "Guteneo",
    },
    "login-password": {
      title: "Your password",
      description: "Return to your Guteneo workspace.",
      logoAltText: "Guteneo",
    },
    signup: {
      title: "Create your workspace",
      description:
        "Your Guteneo account, to prepare and track your correspondence.",
      logoAltText: "Guteneo",
    },
    "signup-id": {
      title: "Create your workspace",
      description:
        "Your Guteneo account, to prepare and track your correspondence.",
      logoAltText: "Guteneo",
    },
    "signup-password": {
      title: "Protect your workspace",
      description: "Choose a password for your Guteneo account.",
      logoAltText: "Guteneo",
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
          /^prompts\/(login|login-id|login-password|signup|signup-id|signup-password)\/custom-text\/(fr|en)$/.test(
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
      ["fr", "en"].includes(value),
    ),
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
    if (before.theme)
      await api.request(
        "PATCH",
        `branding/themes/${before.theme.themeId}`,
        THEME,
      );
    else await api.request("POST", "branding/themes", THEME);
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
