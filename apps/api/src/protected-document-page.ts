import {
  standaloneThemeAttributes,
  standaloneThemeMetadata,
  standaloneThemeStyles,
} from "./standalone-theme";
import delivery from "../../../packages/contracts/src/delivery-messages.json" with { type: "json" };
import {
  supportedLocales,
  type SupportedLocale,
} from "../../../packages/contracts/src/locale";

const englishMessages: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(delivery).map(([fr, [en, de, lb]]) => [en, [fr, de, lb]]),
);

/** Translate only fixed interface copy. Document bytes, passwords and URLs are unchanged. */
export function protectedDocumentText(
  source: string,
  locale: SupportedLocale,
): string {
  if (locale === "en") return source;
  return englishMessages[source]?.[{ fr: 0, de: 1, lb: 2 }[locale]] ?? source;
}

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

/** A self-contained recipient page: no account, JavaScript, third-party assets or telemetry. */
export function protectedDocumentPage(
  path: string,
  state: "locked" | "unlocked" | "unavailable",
  error?: string,
  locale: SupportedLocale = "fr",
  request?: Request,
): Response {
  const copy = (source: string) =>
    escape(protectedDocumentText(source, locale));
  const route = escape(path);
  const heading =
    state === "unavailable"
      ? copy("This document is no longer accessible.")
      : state === "unlocked"
        ? copy("Your document is ready.")
        : copy("A document is waiting for you.");
  const content =
    state === "unavailable"
      ? `<p>${copy("This link is invalid, has expired or its access has been revoked.")}</p><p>${copy("Contact the sender to request a new link.")}</p>`
      : state === "unlocked"
        ? `<p>${copy("The password has been verified. You can view or download your PDF.")}</p><div class="actions"><a class="button primary" href="${route}/content?view=1&amp;lang=${locale}" target="_blank" rel="noreferrer">${copy("View the PDF")} <span aria-hidden="true">↗</span></a><a class="button secondary" href="${route}/content?lang=${locale}">${copy("Download the PDF")} <span aria-hidden="true">↓</span></a></div><p class="hint">${copy("Your access remains open for up to fifteen minutes, within the link’s validity period. Afterwards, you will be asked for the password again.")}</p><p class="hint">${copy("The downloaded PDF is not protected by this password. Keep it in a safe place.")}</p>`
        : `<p>${copy("The sender has shared a protected PDF with you. Enter the password they provided separately.")}</p><form action="${route}/unlock?lang=${locale}" method="post"><label for="password">${copy("Document password")}</label><p id="password-help" class="hint">${copy("No Guteneo account is needed.")}</p>${error ? `<p id="password-error" class="error" role="alert">${copy(error)}</p>` : ""}<input id="password" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required maxlength="128" aria-describedby="password-help${error ? " password-error" : ""}"${error ? ' aria-invalid="true" autofocus' : ""}><button class="button primary" type="submit">${copy("Open the document")} <span aria-hidden="true">→</span></button></form><p class="hint recovery">${copy("Don’t have the password? Ask the sender directly.")}</p>`;
  return new Response(
    `<!doctype html>
<html lang="${locale}"${standaloneThemeAttributes(request)}>
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
${standaloneThemeMetadata}
<title>${heading} — guteneo</title>
<style>
${standaloneThemeStyles}
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper);font-synthesis:none;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:4px}button,input{font:inherit}button,a,input{-webkit-tap-highlight-color:transparent}a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--focus);outline-offset:4px}
.site-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px;padding:24px clamp(24px,6vw,80px);border-bottom:1px solid var(--line)}.brand{font:500 36px/1 Georgia,serif;letter-spacing:-1.5px;text-decoration:none;color:#181b22}.header-note{font-size:12px;color:var(--muted);letter-spacing:.04em}.layout{max-width:660px;margin:clamp(40px,9vh,100px) auto;padding:0 24px}.eyebrow{color:var(--blue);font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;gap:8px}h1{font:400 clamp(38px,7vw,58px)/1.05 Georgia,serif;letter-spacing:-1.5px;margin:24px 0;text-wrap:balance}p{font-size:17px;line-height:1.65;margin:0 0 20px;overflow-wrap:anywhere}form{margin:32px 0 0;padding:24px;background:var(--surface);border:1px solid var(--line)}label{display:block;font-size:15px;font-weight:600}input{display:block;width:100%;min-height:48px;font-size:18px;padding:10px 12px;margin:16px 0 20px;border:1px solid var(--control-line);border-radius:3px;background:var(--surface);color:var(--ink)}.button{display:inline-flex;align-items:center;justify-content:center;gap:24px;min-height:48px;padding:12px 20px;border:1px solid transparent;border-radius:3px;text-decoration:none;font-size:15px;font-weight:600;cursor:pointer;line-height:1.4}.primary{color:#fff;background:#2450db}.primary:hover{background:#1b3caa}.hint{font-size:14px;color:var(--muted);line-height:1.6;margin-top:8px}.recovery{margin-top:20px}.error{padding:12px;border:1px solid var(--error);border-radius:3px;color:var(--error);font-size:15px;margin:16px 0 0}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0}.secondary{background:var(--surface);border-color:var(--line);color:var(--ink)}.secondary:hover{border-color:var(--blue)}.privacy{border-top:1px solid var(--line);margin-top:48px;padding:24px 0 40px}.privacy p{font-size:12px;color:var(--muted);margin:0;line-height:1.6}svg{flex:none}@media(max-width:480px){.site-header{padding:20px 24px}.brand{font-size:31px}.header-note{font-size:11px}.layout{margin-top:40px}form{padding:20px}.button{width:100%}h1{letter-spacing:-1px}}
</style></head>
<body><header class="site-header"><a href="/" class="brand" aria-label="${copy("guteneo, home")}">guteneo</a><span class="header-note">${copy("Private document")}</span><nav aria-label="${copy("Language")}">${supportedLocales.map((language) => `<a href="${route}?lang=${language}" lang="${language}"${language === locale ? ' aria-current="true"' : ""}>${{ fr: "Français", en: "English", de: "Deutsch", lb: "Lëtzebuergesch" }[language]}</a>`).join(" · ")}</nav></header>
<main class="layout"><div class="eyebrow"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/></svg>${copy("Protected sharing")}</div><h1>${heading}</h1>${content}
<footer class="privacy"><p>${copy("The link and password are reserved for the intended recipients. Viewing this document is free.")}</p></footer></main></body></html>`,
    {
      status: state === "unavailable" ? 404 : 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Language": locale,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}
