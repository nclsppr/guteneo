import footer from "../../../packages/contracts/src/public-footer.json" with { type: "json" };
import {
  standaloneThemeAttributes,
  standaloneThemeMetadata,
  standaloneThemeStyles,
} from "./standalone-theme";
import type { SupportedLocale } from "../../../packages/contracts/src/locale";
import { requestedPublicLocale } from "../../../packages/contracts/src/public-locales";
import site from "../../../packages/contracts/src/public-site.json" with { type: "json" };

type ErrorCopy = readonly [title: string, description: string];
type LocaleCopy = {
  home: string;
  support: string;
  assistants: string;
  developers: string;
  status: string;
  navigation: string;
  recovery: string;
  pitch: string;
  fallback4: ErrorCopy;
  fallback5: ErrorCopy;
  errors: Record<number, ErrorCopy>;
};
const messages: Record<SupportedLocale, LocaleCopy> = {
  fr: {
    home: "Retour à l’accueil",
    support: "Contacter le support",
    assistants: "Assistants",
    developers: "Développeurs",
    status: "État du service",
    navigation: "Liens utiles",
    recovery: "Revenir sur Guteneo",
    pitch:
      "Préparez vos PDF, fax et courriers avec validation humaine. Les canaux disponibles dépendent de votre compte.",
    fallback4: [
      "Cette demande ne peut pas aboutir",
      "Cette adresse ne peut pas afficher la page demandée. Vous pouvez repartir de l’accueil.",
    ],
    fallback5: [
      "Le service est indisponible",
      "Un problème empêche l’affichage de cette page. Consultez l’état du service ou contactez le support.",
    ],
    errors: {
      400: [
        "Adresse ou demande invalide",
        "Cette demande n’a pas pu être comprise. Vérifiez l’adresse ou repartez de l’accueil.",
      ],
      401: [
        "Connexion nécessaire",
        "Cette page nécessite une authentification. Revenez à l’accueil pour vous connecter.",
      ],
      403: [
        "Accès refusé",
        "Vous n’avez pas l’autorisation d’afficher cette page.",
      ],
      404: [
        "Page introuvable",
        "Cette page n’existe pas ou a changé d’adresse. Vous pouvez retrouver votre chemin depuis l’accueil.",
      ],
      405: [
        "Méthode non autorisée",
        "Cette méthode de demande n’est pas disponible pour cette adresse.",
      ],
      408: [
        "Délai de la demande dépassé",
        "La demande n’a pas pu être reçue à temps. Vous pouvez réessayer depuis l’accueil.",
      ],
      410: [
        "Cette page a été retirée",
        "Cette adresse n’est plus disponible. Retrouvez les pages actuelles depuis l’accueil.",
      ],
      413: [
        "Demande trop volumineuse",
        "Cette demande dépasse la taille autorisée.",
      ],
      414: [
        "Adresse trop longue",
        "Cette adresse dépasse la longueur autorisée. Repartez d’un lien depuis l’accueil.",
      ],
      415: [
        "Format non pris en charge",
        "Le format de cette demande n’est pas pris en charge à cette adresse.",
      ],
      422: [
        "Demande impossible à traiter",
        "Certains éléments de cette demande n’ont pas pu être traités.",
      ],
      429: [
        "Trop de demandes",
        "Veuillez patienter avant de réessayer. L’état du service reste disponible ci-dessous.",
      ],
      500: [
        "Une erreur est survenue",
        "Une erreur empêche l’affichage de cette page. Consultez l’état du service ou contactez le support.",
      ],
      501: [
        "Fonction non prise en charge",
        "Le service ne prend pas en charge cette demande.",
      ],
      502: [
        "Réponse du service indisponible",
        "Le service n’a pas reçu de réponse valide pour afficher cette page.",
      ],
      503: [
        "Service temporairement indisponible",
        "Cette page ne peut pas être affichée pour le moment. Consultez l’état du service ou contactez le support.",
      ],
      504: [
        "Délai de réponse dépassé",
        "Le service n’a pas répondu à temps pour afficher cette page.",
      ],
    },
  },
  en: {
    home: "Back to home",
    support: "Contact support",
    assistants: "Assistants",
    developers: "Developers",
    status: "Service status",
    navigation: "Useful links",
    recovery: "Return to Guteneo",
    pitch:
      "Prepare PDFs, faxes and postal letters with human validation. Available channels depend on your account.",
    fallback4: [
      "This request cannot be completed",
      "This address cannot display the requested page. You can start again from the home page.",
    ],
    fallback5: [
      "The service is unavailable",
      "A problem is preventing this page from being displayed. Check service status or contact support.",
    ],
    errors: {
      400: [
        "Invalid address or request",
        "This request could not be understood. Check the address or start again from the home page.",
      ],
      401: [
        "Sign-in required",
        "This page requires authentication. Return to the home page to sign in.",
      ],
      403: ["Access denied", "You do not have permission to view this page."],
      404: [
        "Page not found",
        "This page does not exist or has moved. You can find your way back from the home page.",
      ],
      405: [
        "Method not allowed",
        "This request method is not available at this address.",
      ],
      408: [
        "Request timed out",
        "The request was not received in time. You can try again from the home page.",
      ],
      410: [
        "This page has been removed",
        "This address is no longer available. Find current pages from the home page.",
      ],
      413: ["Request too large", "This request exceeds the allowed size."],
      414: [
        "Address too long",
        "This address exceeds the allowed length. Start again from a link on the home page.",
      ],
      415: [
        "Unsupported format",
        "This request format is not supported at this address.",
      ],
      422: [
        "Request cannot be processed",
        "Some parts of this request could not be processed.",
      ],
      429: [
        "Too many requests",
        "Please wait before trying again. Service status remains available below.",
      ],
      500: [
        "An error occurred",
        "An error is preventing this page from being displayed. Check service status or contact support.",
      ],
      501: [
        "Function not supported",
        "The service does not support this request.",
      ],
      502: [
        "Service response unavailable",
        "The service did not receive a valid response to display this page.",
      ],
      503: [
        "Service temporarily unavailable",
        "This page cannot be displayed right now. Check service status or contact support.",
      ],
      504: [
        "Service response timed out",
        "The service did not respond in time to display this page.",
      ],
    },
  },
  de: {
    home: "Zur Startseite",
    support: "Support kontaktieren",
    assistants: "Assistenten",
    developers: "Entwickler",
    status: "Dienststatus",
    navigation: "Hilfreiche Links",
    recovery: "Zu Guteneo zurück",
    pitch:
      "Bereiten Sie PDFs, Faxe und Briefe mit menschlicher Freigabe vor. Die verfügbaren Kanäle hängen von Ihrem Konto ab.",
    fallback4: [
      "Diese Anfrage kann nicht abgeschlossen werden",
      "Diese Adresse kann die angeforderte Seite nicht anzeigen. Sie können auf der Startseite neu beginnen.",
    ],
    fallback5: [
      "Der Dienst ist nicht verfügbar",
      "Ein Problem verhindert die Anzeige dieser Seite. Prüfen Sie den Dienststatus oder kontaktieren Sie den Support.",
    ],
    errors: {
      400: [
        "Ungültige Adresse oder Anfrage",
        "Diese Anfrage konnte nicht verstanden werden. Prüfen Sie die Adresse oder beginnen Sie auf der Startseite neu.",
      ],
      401: [
        "Anmeldung erforderlich",
        "Für diese Seite ist eine Anmeldung erforderlich. Kehren Sie zur Startseite zurück, um sich anzumelden.",
      ],
      403: [
        "Zugriff verweigert",
        "Sie haben keine Berechtigung, diese Seite anzuzeigen.",
      ],
      404: [
        "Seite nicht gefunden",
        "Diese Seite existiert nicht oder wurde verschoben. Auf der Startseite finden Sie sich wieder zurecht.",
      ],
      405: [
        "Methode nicht erlaubt",
        "Diese Anfragemethode ist unter dieser Adresse nicht verfügbar.",
      ],
      408: [
        "Zeitüberschreitung der Anfrage",
        "Die Anfrage wurde nicht rechtzeitig empfangen. Sie können es von der Startseite aus erneut versuchen.",
      ],
      410: [
        "Diese Seite wurde entfernt",
        "Diese Adresse ist nicht mehr verfügbar. Aktuelle Seiten finden Sie auf der Startseite.",
      ],
      413: [
        "Anfrage zu groß",
        "Diese Anfrage überschreitet die zulässige Größe.",
      ],
      414: [
        "Adresse zu lang",
        "Diese Adresse überschreitet die zulässige Länge. Beginnen Sie erneut über einen Link auf der Startseite.",
      ],
      415: [
        "Format nicht unterstützt",
        "Dieses Anfrageformat wird unter dieser Adresse nicht unterstützt.",
      ],
      422: [
        "Anfrage kann nicht verarbeitet werden",
        "Einige Teile dieser Anfrage konnten nicht verarbeitet werden.",
      ],
      429: [
        "Zu viele Anfragen",
        "Bitte warten Sie, bevor Sie es erneut versuchen. Der Dienststatus ist unten weiterhin erreichbar.",
      ],
      500: [
        "Ein Fehler ist aufgetreten",
        "Ein Fehler verhindert die Anzeige dieser Seite. Prüfen Sie den Dienststatus oder kontaktieren Sie den Support.",
      ],
      501: [
        "Funktion nicht unterstützt",
        "Der Dienst unterstützt diese Anfrage nicht.",
      ],
      502: [
        "Dienstantwort nicht verfügbar",
        "Der Dienst hat keine gültige Antwort zur Anzeige dieser Seite erhalten.",
      ],
      503: [
        "Dienst vorübergehend nicht verfügbar",
        "Diese Seite kann derzeit nicht angezeigt werden. Prüfen Sie den Dienststatus oder kontaktieren Sie den Support.",
      ],
      504: [
        "Zeitüberschreitung der Dienstantwort",
        "Der Dienst hat nicht rechtzeitig geantwortet, um diese Seite anzuzeigen.",
      ],
    },
  },
  lb: {
    home: "Zréck op d’Startsäit",
    support: "De Support kontaktéieren",
    assistants: "Assistenten",
    developers: "Entwéckler",
    status: "Status vum Service",
    navigation: "Nëtzlech Linken",
    recovery: "Zréck op Guteneo",
    pitch:
      "Bereet PDFen, Faxen a Bréiwer mat mënschlecher Validatioun vir. Déi verfügbar Kanäl hänke vun Ärem Kont of.",
    fallback4: [
      "Dës Ufro kann net ofgeschloss ginn",
      "Dës Adress kann déi gefrote Säit net weisen. Dir kënnt op der Startsäit nei ufänken.",
    ],
    fallback5: [
      "De Service ass net verfügbar",
      "E Problem verhënnert, datt dës Säit ugewise gëtt. Kuckt de Status vum Service oder kontaktéiert de Support.",
    ],
    errors: {
      400: [
        "Ongëlteg Adress oder Ufro",
        "Dës Ufro konnt net verstan ginn. Kontrolléiert d’Adress oder fänkt op der Startsäit nei un.",
      ],
      401: [
        "Umeldung néideg",
        "Fir dës Säit musst Dir ugemellt sinn. Gitt op d’Startsäit zeréck, fir Iech unzemellen.",
      ],
      403: [
        "Zougang refuséiert",
        "Dir hutt net d’Erlaabnis, dës Säit ze weisen.",
      ],
      404: [
        "Säit net fonnt",
        "Dës Säit gëtt et net oder si huet eng nei Adress. Vun der Startsäit aus fannt Dir erëm Äre Wee.",
      ],
      405: [
        "Method net erlaabt",
        "Dës Ufromethod ass op dëser Adress net verfügbar.",
      ],
      408: [
        "Zäit fir d’Ufro iwwerschratt",
        "D’Ufro gouf net mat Zäit empfaangen. Dir kënnt et vun der Startsäit aus nach eng Kéier probéieren.",
      ],
      410: [
        "Dës Säit gouf ewechgeholl",
        "Dës Adress ass net méi verfügbar. Aktuell Säite fannt Dir op der Startsäit.",
      ],
      413: ["Ufro ze grouss", "Dës Ufro ass méi grouss wéi erlaabt."],
      414: [
        "Adress ze laang",
        "Dës Adress ass méi laang wéi erlaabt. Fänkt nei un iwwer e Link op der Startsäit.",
      ],
      415: [
        "Format net ënnerstëtzt",
        "Dëst Ufroformat gëtt op dëser Adress net ënnerstëtzt.",
      ],
      422: [
        "Ufro kann net verschafft ginn",
        "Verschidden Deeler vun dëser Ufro konnten net verschafft ginn.",
      ],
      429: [
        "Ze vill Ufroen",
        "Waart wgl., ier Dir et nach eng Kéier probéiert. De Status vum Service bleift hei drënner verfügbar.",
      ],
      500: [
        "E Feeler ass opgetrueden",
        "E Feeler verhënnert, datt dës Säit ugewise gëtt. Kuckt de Status vum Service oder kontaktéiert de Support.",
      ],
      501: [
        "Funktioun net ënnerstëtzt",
        "De Service ënnerstëtzt dës Ufro net.",
      ],
      502: [
        "Äntwert vum Service net verfügbar",
        "De Service huet keng gëlteg Äntwert kritt, fir dës Säit ze weisen.",
      ],
      503: [
        "Service zäitweileg net verfügbar",
        "Dës Säit kann de Moment net ugewise ginn. Kuckt de Status vum Service oder kontaktéiert de Support.",
      ],
      504: [
        "Zäit fir d’Äntwert iwwerschratt",
        "De Service huet net mat Zäit geäntwert, fir dës Säit ze weisen.",
      ],
    },
  },
};

export const publicErrorHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
};

/** Eligibility is presentation-only: it never grants access or rewrites a private route. */
export function isPublicDocumentNavigation(
  request: Request,
  pathname: string,
): boolean {
  if (!["GET", "HEAD"].includes(request.method)) return false;
  if (request.headers.has("Range") || request.headers.has("If-Range"))
    return false;
  const destination = request.headers.get("Sec-Fetch-Dest");
  const mode = request.headers.get("Sec-Fetch-Mode");
  if (destination !== null && destination !== "document") return false;
  if (mode !== null && mode !== "navigate") return false;
  // For malformed URI400s, decode valid ASCII escapes only for this defensive
  // exclusion. The actual routing still uses its existing strict URI decoder.
  const lowerPath = pathname
    .replace(/%([0-9a-f]{2})/gi, (_escape, byte: string) =>
      String.fromCharCode(Number.parseInt(byte, 16)),
    )
    .toLowerCase();
  if (
    site.privatePrefixes.some((prefix) =>
      new RegExp(`^/+${prefix.replaceAll(".", "\\.")}(?:/|$)`).test(lowerPath),
    )
  )
    return false;
  if (
    /^\/+(app|invitation|assets|brand|videos|errors|integrations|review|editorial|social|guides)(\/|$)/.test(
      lowerPath,
    ) ||
    pathname.split("/").some((part) => part.startsWith("."))
  )
    return false;
  const last = pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (last.includes(".") && !last.toLowerCase().endsWith(".html")) return false;
  return (request.headers.get("Accept") ?? "").split(",").some((entry) => {
    const [type, ...parameters] = entry.toLowerCase().trim().split(";");
    if (type.trim() !== "text/html") return false;
    const quality = parameters.filter((value) => value.trim().startsWith("q="));
    if (quality.length === 0) return true;
    if (quality.length !== 1) return false;
    const value = quality[0].trim().slice(2);
    return (
      /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value) && Number(value) > 0
    );
  });
}

function publicErrorFooter(locale: SupportedLocale): string {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  return `<footer><nav class="footer-navigation" aria-label="${escape(footer.navigationLabel[locale])}">${footer.groups
    .map(
      (group) =>
        `<section><h2>${escape(group.labels[locale])}</h2><ul>${group.links
          .map((link) => {
            const target = new URL(link.href, site.origin);
            if (
              target.origin === site.origin ||
              target.href === "https://status.guteneo.com/"
            )
              target.searchParams.set("lang", locale);
            return `<li><a href="${escape(target.href)}">${escape(link.labels[locale])}</a></li>`;
          })
          .join("")}</ul></section>`,
    )
    .join("")}</nav></footer>`;
}

function errorDocument(
  locale: SupportedLocale,
  status: number,
  request: Request,
): string {
  const message = messages[locale];
  const [title, description] =
    message.errors[status] ??
    (status >= 500 ? message.fallback5 : message.fallback4);
  const family =
    status === 401 || status === 403
      ? "access"
      : status === 429 || status >= 500
        ? "service"
        : "navigation";
  // Only checked-in copy, a bounded language and an HTTP status enter the HTML.
  // Never reflect a URL, query, browser header, upstream error or account data.
  return `<!doctype html>
<html lang="${locale}"${standaloneThemeAttributes(request)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
${standaloneThemeMetadata}
<title>${title} — guteneo</title>
<style>
${standaloneThemeStyles}
:root{font-family:system-ui,sans-serif;color:var(--ink);background:var(--paper)}*{box-sizing:border-box}body{margin:0;min-height:100svh;padding:clamp(24px,5vw,64px);display:flex;flex-direction:column}header,main,footer{width:100%;max-width:1160px;margin-inline:auto}a{color:inherit;text-underline-offset:.25em}a:focus-visible{outline:2px solid var(--focus);outline-offset:6px}.brand{display:inline-flex;align-items:center;gap:12px;text-decoration:none;color:#181b22;font-family:"EB Garamond",Georgia,serif;font-size:36px;line-height:1}.brand img{width:48px;height:48px}main{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);align-items:center;gap:clamp(32px,5vw,72px);padding:clamp(48px,8vw,96px) 0}p{line-height:1.65;font-size:17px}.code{font:500 14px ui-monospace,monospace;letter-spacing:.16em;color:var(--muted)}h1{font:400 clamp(36px,4.6vw,60px)/1.08 "EB Garamond",Georgia,serif;letter-spacing:-.025em;margin:18px 0 24px;overflow-wrap:break-word}.description{max-width:36em}nav{display:flex;align-items:center;flex-wrap:wrap;gap:16px 24px}nav a{min-height:44px;display:inline-flex;align-items:center;font-size:15px}.recovery{margin-top:28px}.home{padding:12px 18px;border:1px solid var(--ink);text-decoration:none}.home:hover{background:var(--surface)}.art img{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:contain;mix-blend-mode:normal}.art{position:relative;margin:0;max-width:420px;width:100%;justify-self:center}.birds{position:absolute;right:4%;top:-12px;display:flex;align-items:center;gap:20px;pointer-events:none}.bird{width:40px;aspect-ratio:1;background:url('/luxembourg-blue-swallow-sheet.webp') 0 0/200% 200% no-repeat}.bird+span{width:25px;transform:translateY(-18px)}footer{border-top:1px solid var(--line);padding:24px 0 8px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px 36px}footer p{font-size:14px;max-width:40em;margin:0}.domain{color:#181b22;font-family:"EB Garamond",Georgia,serif;font-size:21px;margin-top:8px;display:inline-block}footer nav{gap:8px 20px}.footer-navigation{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;width:100%}.footer-navigation h2{font:600 15px/1.4 system-ui,sans-serif;margin:0 0 12px}.footer-navigation ul{list-style:none;padding:0;margin:0}.footer-navigation a{font-size:14px;overflow-wrap:anywhere}.footer-navigation section{min-width:0}@media(max-width:760px){main{grid-template-columns:1fr;gap:36px}.art{max-width:420px}h1{font-size:clamp(36px,7vw,52px)}footer{display:block}footer nav{margin-top:12px}.footer-navigation{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:380px){.brand{font-size:32px}.recovery{align-items:flex-start;flex-direction:column;gap:8px}p{font-size:16px}}
</style>
</head>
<body>
<header><a class="brand" href="${site.origin}/?lang=${locale}"><img src="/brand/guteneo-portrait-128.webp" width="48" height="48" alt=""><span>guteneo</span></a></header>
<main>
<div><p class="code">HTTP ${status}</p><h1>${title}</h1><p class="description">${description}</p><nav class="recovery" aria-label="${message.recovery}"><a class="home" href="${site.origin}/?lang=${locale}">${message.home}</a><a href="${site.origin}/support/?lang=${locale}">${message.support}</a></nav></div>
<figure class="art"><img src="/errors/illustration-${family}-640.webp" srcset="/errors/illustration-${family}-640.webp 640w, /errors/illustration-${family}.webp 960w" sizes="(max-width:468px) calc(100vw - 48px), 420px" width="960" height="960" alt=""><div class="birds" aria-hidden="true"><span class="bird"></span><span class="bird"></span></div></figure>
</main>
${publicErrorFooter(locale)}
</body>
</html>`;
}

/** Used only for errors already produced by the public fetch boundary. */
export function publicHttpError(
  request: Request,
  pathname: string,
  status: number,
  options: {
    allowDocument?: boolean;
    plainMessage?: string;
    protocolHeaders?: Headers;
  } = {},
): Response {
  const html =
    options.allowDocument !== false &&
    isPublicDocumentNavigation(request, pathname);
  const locale =
    requestedPublicLocale(new URL(request.url).searchParams) ?? "fr";
  const body = html
    ? errorDocument(locale, status, request)
    : (options.plainMessage ??
      (status === 404 ? "Not found" : "Public content unavailable"));
  const headers = new Headers(publicErrorHeaders);
  // Keep challenge, method and backoff semantics without reflecting them in HTML.
  for (const name of ["Retry-After", "Allow", "WWW-Authenticate"]) {
    const value = options.protocolHeaders?.get(name);
    if (value !== null && value !== undefined) headers.set(name, value);
  }
  headers.set(
    "Content-Type",
    html ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
  );
  headers.set(
    "Content-Length",
    String(new TextEncoder().encode(body).byteLength),
  );
  headers.set("Vary", "Accept, Sec-Fetch-Dest, Sec-Fetch-Mode, Cookie");
  if (html) headers.set("Content-Language", locale);
  return new Response(request.method === "HEAD" ? null : body, {
    status,
    headers,
  });
}
