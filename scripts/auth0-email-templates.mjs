import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const EMAIL_LOGO = "https://guteneo.com/brand/guteneo-stamp.png";
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
  return `<!doctype html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(copy.subject)}</title>
<style>@media only screen and (max-width:480px){.email-outer{padding:16px 8px!important}.email-content,.email-footer{padding:24px 20px!important}h1{font-size:28px!important;line-height:34px!important}}</style></head>
<body style="margin:0;padding:0;width:100%;background:#f6f5ef;color:#181b22;-webkit-text-size-adjust:100%">
${copy.intro ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(copy.intro)}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;table-layout:fixed;background:#f6f5ef"><tr><td align="center" class="email-outer" style="padding:40px 16px">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;background:#fffefa;border:1px solid #dedfdc;border-top:4px solid #2450db">
<tr><td class="email-content" style="padding:32px 40px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:36px;color:#181b22">guteneo</td><td align="right" width="72"><img src="${EMAIL_LOGO}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;border:0"></td></tr></table>
<h1 style="margin:32px 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:38px;font-weight:normal;overflow-wrap:break-word">${escape(copy.title)}</h1>
${copy.intro ? `<p style="margin:0 0 28px;font-size:16px;line-height:26px">${escape(copy.intro)}</p>` : ""}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width:100%"><tr><td align="center" bgcolor="#2450db" style="background:#2450db;border-radius:4px;mso-padding-alt:14px 18px"><a href="${url}" style="display:inline-block;padding:14px 18px;border:1px solid #2450db;border-radius:4px;font-size:16px;line-height:22px;font-weight:bold;color:#ffffff;text-decoration:none;overflow-wrap:break-word">${escape(copy.action)}</a></td></tr></table>
${copy.note ? `<p style="margin:28px 0 0;font-size:16px;line-height:26px">${escape(copy.note)}</p>` : ""}</td></tr>
<tr><td class="email-footer" style="padding:24px 40px;border-top:1px solid #dedfdc;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#545961">
<p style="margin:0 0 8px">${escape(messages.linkHint)}</p><p style="margin:0 0 16px;color:#2450db;word-break:break-all;overflow-wrap:anywhere">${url}</p>
${name === "welcome_email" ? "" : `<p style="margin:0 0 8px">${escape(messages.privateLink)}</p>`}
<p style="margin:0">${escape(messages.footer)}</p></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
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
