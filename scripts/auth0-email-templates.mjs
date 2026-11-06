import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  renderEmailAction,
  renderEmailFooter,
  renderEmailSheet,
} from "../packages/contracts/src/email-presentation.ts";
import {
  EMAIL_BRAND_ASSET_URL,
  renderEmailBrandImage,
  resolveEmailBrandImage,
} from "../packages/contracts/src/email-branding.ts";

export const EMAIL_LOGO = EMAIL_BRAND_ASSET_URL;
export const EMAIL_FROM = "guteneo <no-reply@guteneo.com>";
export const TEMPLATE_NAMES = [
  "verify_email",
  "reset_email",
  "welcome_email",
  "blocked_account",
];
export const EMAIL_LOCALES = ["en", "fr", "de", "lb"];
export const EMAIL_COPY = JSON.parse(
  readFileSync(
    new URL(
      "../integrations/auth0/emails/locales/messages.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const managed = /guteneo-email-(?:brand|fallback)-v\d+:/;
const localeAssignment =
  "{% assign guteneo_email_language = request_language | default: 'en' | downcase | slice: 0, 2 %}";

export function renderEmail(name, language) {
  if (!TEMPLATE_NAMES.includes(name) || !EMAIL_LOCALES.includes(language))
    throw new Error("INVALID_EMAIL_TEMPLATE");
  const messages = EMAIL_COPY[language],
    copy = messages[name];
  const url =
    name === "welcome_email"
      ? "https://guteneo.com/auth/login"
      : "{{ url | escape }}";
  const sheet = renderEmailSheet({
    title: copy.title,
    headerArtworkHtml: resolveEmailBrandImage(renderEmailBrandImage()),
    bodyHtml: `<p style="margin:0 0 20px">${escape(copy.intro)}</p>${renderEmailAction(url, copy.action)}<p style="margin:26px 0 0;color:#545761;font-size:14px;line-height:22px">${escape(copy.note)}</p>`,
  });
  const footer = renderEmailFooter(
    `<p style="margin:0 0 8px">${escape(messages.linkHint)}</p><p style="margin:0 0 16px;word-break:break-all;overflow-wrap:anywhere">${url}</p>${name === "welcome_email" ? "" : `<p style="margin:0 0 8px">${escape(messages.privateLink)}</p>`}<p style="margin:0">${escape(messages.footer)}</p>`,
  );
  return `<!doctype html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(copy.subject)}</title>
<style>@media only screen and (max-width:480px){.email-outer{padding:12px 8px 0!important}.email-header{padding-top:16px!important;padding-bottom:16px!important}.email-content{padding-top:26px!important;padding-bottom:28px!important}h1{font-size:28px!important;line-height:34px!important}}</style></head>
<body style="margin:0;padding:0;width:100%;background-color:#f6f5ef;color:#181b22;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(copy.intro)}</div>
${sheet}${footer}</body></html>`;
}

export function localizedEmail(name) {
  if (!TEMPLATE_NAMES.includes(name)) throw new Error("INVALID_EMAIL_TEMPLATE");
  const localized = (render) =>
    localeAssignment +
    ["fr", "de", "lb"]
      .map(
        (language, i) =>
          `{% ${i ? "elsif" : "if"} guteneo_email_language == '${language}' %}${render(language)}`,
      )
      .join("") +
    `{% else %}${render("en")}{% endif %}`;
  return {
    body: localized((language) => renderEmail(name, language)),
    subject: localized((language) => EMAIL_COPY[language][name].subject),
    from: EMAIL_FROM,
  };
}

// A checksum detects edited managed wrappers. Unknown/legacy wrappers require
// operator reconciliation; silently nesting them could preserve stale scope.
function priorField(name, field, source) {
  if (!managed.test(source)) return source;
  const marker = source.match(
    new RegExp(
      `^\\{% comment %\\}guteneo-email-brand-v2:${name}:${field}:([a-f0-9]{64})\\{% endcomment %\\}`,
    ),
  );
  if (!marker) throw new Error("MANAGED_TEMPLATE_CONFLICT");
  const payload = source.slice(marker[0].length);
  const delimiter = `{% else %}{% comment %}guteneo-email-fallback-v2:${name}:${field}{% endcomment %}`;
  if (
    digest(payload) !== marker[1] ||
    !/^\{% if application\.clientID == '[A-Za-z0-9_-]{1,128}'(?: or application\.clientID == '[A-Za-z0-9_-]{1,128}')* %\}/.test(
      payload,
    ) ||
    !payload.endsWith("{% endif %}") ||
    payload.split(delimiter).length !== 2
  )
    throw new Error("MANAGED_TEMPLATE_CONFLICT");
  const fallback = payload.slice(
    payload.indexOf(delimiter) + delimiter.length,
    -"{% endif %}".length,
  );
  if (managed.test(fallback)) throw new Error("MANAGED_TEMPLATE_CONFLICT");
  return fallback;
}

export function scopeTemplate(name, clientIds, existing) {
  if (
    !Array.isArray(clientIds) ||
    !clientIds.length ||
    clientIds.length > 20 ||
    new Set(clientIds).size !== clientIds.length ||
    clientIds.some(
      (id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id),
    )
  )
    throw new Error("INVALID_CLIENT_SCOPE");
  if (
    !existing ||
    existing.syntax !== "liquid" ||
    ["body", "subject", "from"].some(
      (field) => typeof existing[field] !== "string" || !existing[field].trim(),
    )
  )
    throw new Error("EXISTING_TEMPLATE_REQUIRED");
  const condition = [...clientIds]
    .sort()
    .map((id) => `application.clientID == '${id}'`)
    .join(" or ");
  return Object.fromEntries(
    Object.entries(localizedEmail(name)).map(([field, candidate]) => {
      const fallback = priorField(name, field, existing[field]);
      const payload = `{% if ${condition} %}${candidate}{% else %}{% comment %}guteneo-email-fallback-v2:${name}:${field}{% endcomment %}${fallback}{% endif %}`;
      return [
        field,
        `{% comment %}guteneo-email-brand-v2:${name}:${field}:${digest(payload)}{% endcomment %}${payload}`,
      ];
    }),
  );
}
