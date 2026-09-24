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
): Response {
  const route = escape(path);
  const heading =
    state === "unavailable"
      ? "Ce document n’est plus accessible."
      : state === "unlocked"
        ? "Votre document est prêt."
        : "Un document vous attend.";
  const content =
    state === "unavailable"
      ? `<p>Ce lien est invalide, a expiré ou son accès a été révoqué.</p><p>Contactez l’expéditeur pour demander un nouveau lien.</p>`
      : state === "unlocked"
        ? `<p>Le mot de passe a été vérifié. Vous pouvez consulter ou télécharger votre PDF.</p><div class="actions"><a class="button primary" href="${route}/content?view=1" target="_blank" rel="noreferrer">Consulter le PDF <span aria-hidden="true">↗</span></a><a class="button secondary" href="${route}/content">Télécharger le PDF <span aria-hidden="true">↓</span></a></div><p class="hint">Votre accès reste ouvert jusqu’à quinze minutes, dans la limite de validité du lien. Ensuite, le mot de passe vous sera à nouveau demandé.</p><p class="hint">Le PDF téléchargé n’est pas protégé par ce mot de passe. Conservez-le dans un endroit sûr.</p>`
        : `<p>L’expéditeur vous a partagé un PDF protégé. Saisissez le mot de passe qu’il vous a communiqué séparément.</p><form action="${route}/unlock" method="post"><label for="password">Mot de passe du document</label><p id="password-help" class="hint">Aucun compte Guteneo n’est nécessaire.</p>${error ? `<p id="password-error" class="error" role="alert">${escape(error)}</p>` : ""}<input id="password" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required maxlength="128" aria-describedby="password-help${error ? " password-error" : ""}"${error ? ' aria-invalid="true" autofocus' : ""}><button class="button primary" type="submit">Ouvrir le document <span aria-hidden="true">→</span></button></form><p class="hint recovery">Vous n’avez pas le mot de passe ? Demandez-le directement à l’expéditeur.</p>`;
  return new Response(
    `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="color-scheme" content="light">
<title>${heading} — guteneo</title>
<style>
:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#181b22;background:#f6f5ef;font-synthesis:none;-webkit-font-smoothing:antialiased}
*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:4px}button,input{font:inherit}button,a,input{-webkit-tap-highlight-color:transparent}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #2450db;outline-offset:4px}
.site-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:24px clamp(24px,6vw,80px);border-bottom:1px solid #deded5}.brand{font:500 36px/1 Georgia,serif;letter-spacing:-1.5px;text-decoration:none;color:#2450db}.header-note{font-size:12px;color:#64666b;letter-spacing:.04em}.layout{max-width:660px;margin:clamp(40px,9vh,100px) auto;padding:0 24px}.eyebrow{color:#2450db;font-size:12px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;display:flex;align-items:center;gap:8px}h1{font:400 clamp(38px,7vw,58px)/1.05 Georgia,serif;letter-spacing:-1.5px;margin:24px 0;text-wrap:balance}p{font-size:17px;line-height:1.65;margin:0 0 20px;overflow-wrap:anywhere}form{margin:32px 0 0;padding:24px;background:#fffefa;border:1px solid #deded5}label{display:block;font-size:15px;font-weight:600}input{display:block;width:100%;min-height:48px;font-size:18px;padding:10px 12px;margin:16px 0 20px;border:1px solid #979992;border-radius:3px;background:white;color:#181b22}.button{display:inline-flex;align-items:center;justify-content:center;gap:24px;min-height:48px;padding:12px 20px;border:1px solid transparent;border-radius:3px;text-decoration:none;font-size:15px;font-weight:600;cursor:pointer;line-height:1.4}.primary{color:#fff;background:#2450db}.primary:hover{background:#1b3caa}.hint{font-size:14px;color:#64666b;line-height:1.6;margin-top:8px}.recovery{margin-top:20px}.error{padding:12px;border:1px solid #a12e27;border-radius:3px;color:#a12e27;font-size:15px;margin:16px 0 0}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0}.secondary{background:#fffefa;border-color:#deded5;color:#181b22}.secondary:hover{border-color:#2450db}.privacy{border-top:1px solid #deded5;margin-top:48px;padding:24px 0 40px}.privacy p{font-size:12px;color:#64666b;margin:0;line-height:1.6}svg{flex:none}@media(max-width:480px){.site-header{padding:20px 24px}.brand{font-size:31px}.header-note{font-size:11px}.layout{margin-top:40px}form{padding:20px}.button{width:100%}h1{letter-spacing:-1px}}
</style></head>
<body><header class="site-header"><a href="/" class="brand" aria-label="guteneo, accueil">guteneo</a><span class="header-note">Document privé</span></header>
<main class="layout"><div class="eyebrow"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/></svg>Partage protégé</div><h1>${heading}</h1>${content}
<footer class="privacy"><p>Le lien et le mot de passe sont réservés aux destinataires prévus. La consultation de ce document est gratuite.</p></footer></main></body></html>`,
    {
      status: state === "unavailable" ? 404 : 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
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
