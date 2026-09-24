import { AuthError, authenticateBrowser } from "./auth";
import type { Env } from "./env";
import {
  DomainError,
  type DomainService,
} from "../../../packages/domain/src/index";

const escape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const statusLabels: Record<string, string> = {
  prepared: "À vérifier",
  queued: "En attente de traitement",
  submitting: "Transmission en cours",
  submission_unknown: "Résultat à vérifier : ne renvoyez pas cet envoi",
  accepted: "Accepté par le fournisseur",
  delivered: "Livré",
  failed: "Échec",
  cancelled: "Annulé",
  bounced: "Non distribué",
  complained: "Réclamation reçue",
  printed: "Imprimé",
  handed_to_post: "Remis au réseau postal",
};
function html(content: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vérifier l’envoi · guteneo</title><style>body{font-family:system-ui,sans-serif;background:#f6f5ef;color:#181b22;max-width:52rem;margin:0 auto;padding:24px;line-height:1.55}header{font-family:Georgia,serif;font-size:2rem;margin:16px 0 36px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.2}h1{font-size:2.2rem}h2{margin-top:32px}section{border-top:1px solid #d3d7e1;padding-top:12px}dl{display:grid;grid-template-columns:minmax(7rem,1fr) minmax(0,2fr);gap:8px 16px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}iframe{width:100%;height:65vh;border:1px solid #d3d7e1;border-radius:8px;background:#fffefa}.message{height:20rem}button,.button{display:inline-block;font:inherit;font-weight:600;border:0;border-radius:12px;background:#2450db;color:white;padding:14px 20px;min-height:48px;cursor:pointer;text-decoration:none}button.secondary{background:transparent;color:#181b22;border:1px solid #181b22}label{display:block;margin:20px 0}input[type=checkbox]{width:22px;height:22px;vertical-align:middle;margin-right:8px}.notice{padding:16px;border:1px solid #aa6842;border-radius:12px;background:#fff7ea}a{color:inherit;text-underline-offset:3px}code{overflow-wrap:anywhere;font-size:.8rem}footer{margin:36px 0;color:#5d6678}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #b36d49;outline-offset:4px}@media(max-width:480px){body{padding:20px}dl{grid-template-columns:1fr;gap:3px}dd{margin-bottom:10px}}</style></head><body><header aria-label="Guteneo">guteneo</header><main>${content}</main><footer>Cette page sert uniquement à vérifier cet envoi. Fermez-la pour revenir à l’application.</footer></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
function redirect(location: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
function safeFailure(error: unknown): string {
  const code =
    error instanceof DomainError || error instanceof AuthError
      ? error.code
      : "";
  if (
    [
      "QUOTA_EXCEEDED",
      "WELCOME_CREDIT_EXHAUSTED",
      "INSUFFICIENT_CREDIT",
      "CHANNEL_DISABLED",
    ].includes(code)
  )
    return "Cet envoi ne peut pas être confirmé actuellement. Aucun nouvel envoi n’a été déclenché. Vous pouvez conserver votre préparation et contacter l’assistance si nécessaire.";
  if (["LIVE_QUOTE_INVALID", "QUOTE_EXPIRED"].includes(code))
    return "Le devis n’est plus valable. Actualisez cette page pour consulter les possibilités de renouvellement, puis vérifiez la nouvelle proposition.";
  if (code === "FINGERPRINT_MISMATCH")
    return "La version affichée a changé. Actualisez cette page et relisez l’envoi avant de continuer.";
  if (["CSRF_REJECTED", "ORIGIN_REJECTED"].includes(code))
    return "La confirmation de sécurité n’est plus valide. Actualisez la page avant de continuer.";
  if (code === "RECIPIENT_REQUEST_REQUIRED")
    return "Confirmez que le destinataire a demandé cet e-mail avant de l’approuver.";
  if (code === "FAX_REVIEW_PREPARATION_ONLY")
    return "Ce devis est réservé à la consultation. Il ne peut être ni approuvé ni envoyé. Aucun montant n’est réservé ou débité.";
  return "L’opération n’a pas pu être confirmée. Actualisez le suivi avant de recommencer ; ne préparez pas un nouvel envoi pour remplacer un résultat incertain.";
}

/** Separate browser-only human review. A native credential never enters here. */
export async function handleMobileReview(
  request: Request,
  env: Env,
  domain: DomainService,
  afterConfirmation?: () => Promise<unknown>,
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/auth\/mobile\/review\/(dsp_[a-f0-9-]{36})$/.exec(
    url.pathname,
  );
  if (!match) return null;
  if (url.origin !== env.APP_ORIGIN)
    return redirect(new URL(url.pathname, env.APP_ORIGIN).href);
  if (!["GET", "POST"].includes(request.method))
    return html("<h1>Opération indisponible</h1>", 405);
  if (request.headers.has("Authorization"))
    return html(
      "<h1>Connexion navigateur requise</h1><p>Utilisez la connexion sécurisée dans votre navigateur pour vérifier cet envoi.</p>",
      403,
    );
  const login = new URL("/auth/login", env.APP_ORIGIN);
  login.searchParams.set("returnTo", url.pathname);
  let session;
  let form: FormData | undefined;
  try {
    const headers = new Headers(request.headers);
    if (request.method === "POST") {
      form = await request.formData();
      headers.set("X-CSRF-Token", String(form.get("csrf") ?? ""));
    }
    session = await authenticateBrowser(
      new Request(request.url, { method: request.method, headers }),
      env,
      request.method === "POST",
    );
  } catch (error) {
    if (
      request.method === "GET" &&
      error instanceof AuthError &&
      ["SESSION_EXPIRED", "AUTHENTICATION_REQUIRED"].includes(error.code)
    )
      return redirect(login.href);
    return html(
      `<h1>Reconnectez-vous pour continuer</h1><p>Votre session ou sa confirmation de sécurité n’est plus valide. L’opération n’a pas été effectuée.</p><a class="button" href="${escape(login.href)}">Connexion sécurisée</a>`,
      403,
    );
  }
  const id = match[1];
  let detail;
  try {
    detail = await domain.getDispatch(session.context, id);
  } catch {
    return html(
      "<h1>Envoi indisponible</h1><p>Vous ne pouvez pas consulter cet envoi depuis cet espace.</p>",
      404,
    );
  }
  const d = detail.dispatch;
  const reviewPreparationOnly =
    d.faxPricing?.executionScope === "review_prepare_only";
  const doc = d.document_id
    ? await domain.getDocument(session.context, d.document_id)
    : null;
  const documentReady = !doc || doc.status === "ready";
  let notice = "";
  let responseStatus = 200;
  if (form) {
    try {
      if (form.get("fingerprint") !== d.fingerprint)
        throw new DomainError("FINGERPRINT_MISMATCH", "", 409);
      const action = form.get("action");
      if (
        reviewPreparationOnly &&
        ["approve", "confirm"].includes(String(action))
      )
        throw new DomainError("FAX_REVIEW_PREPARATION_ONLY", "", 409);
      if (action === "renew") {
        if (
          d.channel !== "fax" ||
          d.status !== "prepared" ||
          !d.quote_expires_at ||
          d.quote_expires_at > new Date().toISOString() ||
          detail.attempts.length
        )
          throw new DomainError("FAX_QUOTE_RENEWAL_UNSAFE", "", 409);
        const renewed = await domain.renewFaxQuote(session.context, id);
        return redirect(
          `${env.APP_ORIGIN}/auth/mobile/review/${encodeURIComponent(renewed.id)}`,
        );
      } else if (action === "approve") {
        if (!documentReady || form.get("reviewed") !== "yes")
          throw new DomainError("REVIEW_REQUIRED", "", 409);
        await domain.approveDispatch(session.context, id, d.fingerprint, {
          recipientRequested: form.get("recipientRequested") === "yes",
        });
      } else if (action === "confirm") {
        if (!documentReady || form.get("sendConfirmed") !== "yes")
          throw new DomainError("REVIEW_REQUIRED", "", 409);
        if (
          detail.approval?.approval_kind !== "browser" ||
          detail.approval.fingerprint !== d.fingerprint
        )
          throw new DomainError("HUMAN_APPROVAL_REQUIRED", "", 403);
        await domain.confirmDispatch(
          session.context,
          id,
          `ios-browser-confirm:${id}`,
        );
        // Durable outbox remains authoritative if immediate publication fails.
        if (afterConfirmation) await afterConfirmation().catch(() => undefined);
      } else if (action === "cancel")
        await domain.cancelDispatch(session.context, id);
      else throw new DomainError("INVALID_ACTION", "", 400);
      return redirect(new URL(url.pathname, env.APP_ORIGIN).href);
    } catch (error) {
      notice = safeFailure(error);
      responseStatus = error instanceof DomainError ? error.status : 400;
    }
  }
  const money = (minor: number) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(minor / 100);
  const nanoMoney = (nano: number) =>
    `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: nano > 0 && nano < 100000 ? 9 : 4 }).format(nano / 1e9)} €`;
  const date = (value: string) =>
    `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} UTC`;
  const expired =
    !!d.quote_expires_at && d.quote_expires_at <= new Date().toISOString();
  const approved =
    detail.approval?.approval_kind === "browser" &&
    detail.approval.fingerprint === d.fingerprint &&
    detail.approval.expires_at > new Date().toISOString();
  const fields = `<input type="hidden" name="csrf" value="${escape(session.csrfToken)}"><input type="hidden" name="fingerprint" value="${escape(d.fingerprint)}">`;
  const recipient = JSON.parse(d.recipient_json) as Record<string, unknown>;
  const options = JSON.parse(d.options_json) as Record<string, unknown>;
  const optionNames: Record<string, string> = {
    printMode: "Impression",
    printSpectrum: "Couleur",
    deliveryProduct: "Acheminement",
    addressPosition: "Position de l’adresse",
    kind: "Type de message",
    paper: "Papier",
    paperType: "Papier",
    paperTypes: "Papier",
  };
  const optionValues: Record<string, string> = {
    simplex: "Recto",
    duplex: "Recto verso",
    grayscale: "Noir et blanc",
    color: "Couleur",
    cheap: "Économique",
    fast: "Rapide",
    left: "À gauche",
    right: "À droite",
    transactional: "Transactionnel",
    normal: "Standard",
  };
  const describe = (value: unknown): string => {
    if (typeof value === "boolean") return value ? "Oui" : "Non";
    if (value === null) return "Non défini";
    if (Array.isArray(value)) return value.map(describe).join(", ");
    if (typeof value === "object")
      return Object.entries(value as Record<string, unknown>)
        .map(
          ([name, item]) =>
            `${name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")} : ${describe(item)}`,
        )
        .join(" · ");
    return optionValues[String(value)] ?? String(value);
  };
  const optionDetails = Object.entries(options)
    .filter(([name]) => !["providerDraftId", "preparedLetterId"].includes(name))
    .map(
      ([name, value]) =>
        `<dt>${escape(optionNames[name] ?? name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " "))}</dt><dd>${escape(describe(value))}</dd>`,
    )
    .join("");
  const estimate = d.faxPricing
    ? `${nanoMoney(d.faxPricing.estimatedLowNanoeur)} à ${nanoMoney(d.faxPricing.estimatedHighNanoeur)}`
    : d.quote_customer_nanoeur != null
      ? nanoMoney(d.quote_customer_nanoeur)
      : money(d.estimated_minor);
  const emailPreview = d.html
    ? `<iframe class="message" title="Contenu final de l’e-mail" sandbox srcdoc="${escape(`<!doctype html><meta charset=utf-8><meta http-equiv=Content-Security-Policy content="default-src 'none'"><body>${d.html}</body>`)}"></iframe>`
    : `<pre>${escape(d.text)}</pre>`;
  const canAct =
    ["admin", "member"].includes(session.context.role) &&
    !reviewPreparationOnly &&
    d.status === "prepared" &&
    !expired &&
    documentReady;
  const canRenew =
    ["admin", "member"].includes(session.context.role) &&
    d.channel === "fax" &&
    d.status === "prepared" &&
    expired &&
    detail.attempts.length === 0;
  return html(
    `<h1>Vérifier l’envoi</h1><p>${escape(statusLabels[d.status] ?? "Suivi en cours")}</p>${d.mode === "simulation" ? '<p class="notice">Simulation : aucune communication réelle.</p>' : ""}${notice ? `<p class="notice" role="alert">${escape(notice)}</p>` : ""}
    <section><h2>Destinataire et coût</h2><dl><dt>Canal</dt><dd>${escape({ fax: "Fax", email: "E-mail", postal: "Courrier postal" }[d.channel])}</dd><dt>Destinataire</dt><dd>${Object.values(recipient).map(escape).join("<br>")}</dd><dt>Expéditeur</dt><dd>${escape(d.sender_address)}</dd>${d.subject ? `<dt>Objet</dt><dd>${escape(d.subject)}</dd>` : ""}<dt>Estimation${d.mode === "production" ? " HT" : ""}</dt><dd>${escape(estimate)}</dd><dt>Plafond ferme${d.mode === "production" ? " HT" : ""}</dt><dd>${escape(money(d.ceiling_minor))}</dd>${d.quote_expires_at ? `<dt>Devis valable jusqu’au</dt><dd>${escape(date(d.quote_expires_at))}</dd>` : ""}${optionDetails}</dl>
    ${reviewPreparationOnly ? '<p class="notice">Préparation de revue uniquement. Cette fourchette de référence HT utilise des tarifs réels et des hypothèses de durée ; elle exclut les ajustements conditionnels non qualifiés. Ce fax ne peut être ni approuvé ni envoyé, y compris en mode expert. Aucun montant n’est réservé ou débité. La capacité Local Calling reste non confirmée.</p>' : d.faxPricing ? `<p>Le coût de ce fax entier dépend de la durée de transmission. Le plafond est réservé à la confirmation. Le coût définitif est déterminé après vérification de l’usage et reste limité au plafond. Les fractions de centime sont cumulées entre les envois.</p>${d.faxPricing.routeQualification === "operator_authorized_test" ? '<p class="notice">Test Luxembourg autorisé par l’opérateur. La capacité Local Calling n’est pas confirmée ; le fournisseur peut refuser la transmission.</p>' : ""}` : ""}
    ${!reviewPreparationOnly && d.quote_customer_nanoeur != null ? "<p>Les fractions de centime sont cumulées entre les envois avant arrondi. Le plafond reste réservé jusqu’au résultat.</p>" : ""}</section>
    <section><h2>Contenu exact</h2>${doc ? `<p>${escape(doc.name)} · ${doc.pages} page${doc.pages > 1 ? "s" : ""}</p>${documentReady ? `<iframe title="PDF original exact" src="/api/documents/${encodeURIComponent(doc.id)}/content"></iframe><p><a href="/api/documents/${encodeURIComponent(doc.id)}/content" target="_blank" rel="noopener">Ouvrir le PDF original</a></p>` : '<p class="notice">Le PDF doit terminer sa vérification avant approbation.</p>'}<p>Empreinte SHA-256 : <code>${escape(doc.sha256)}</code></p>` : ""}${d.channel === "email" ? emailPreview : ""}</section>
    ${expired ? `<p class="notice">Le devis a expiré. ${canRenew ? "Renouvelez-le ci-dessous, puis vérifiez sa nouvelle version." : "Cet envoi ne peut pas être confirmé avec ce devis."}</p>` : ""}${canRenew ? `<form method="post" action="${escape(url.pathname)}">${fields}<input type="hidden" name="action" value="renew"><button type="submit">Renouveler le devis</button></form>` : ""}
    ${canAct && !approved ? `<section><h2>Votre validation</h2><form method="post" action="${escape(url.pathname)}">${fields}<input type="hidden" name="action" value="approve"><label><input type="checkbox" name="reviewed" value="yes" required>J’ai vérifié le contenu exact, le destinataire et les options. J’accepte le coût dans la limite de ${escape(money(d.ceiling_minor))}${d.mode === "production" ? " HT" : ""} pour cette version.</label>${d.channel === "email" && d.mode === "production" ? '<label><input type="checkbox" name="recipientRequested" value="yes" required>Ce destinataire a demandé cet e-mail et son contenu.</label>' : ""}<button type="submit">Valider cette version</button></form></section>` : ""}
    ${canAct && approved ? `<section><h2>Version validée</h2><p>La validation est enregistrée. Confirmez maintenant l’expédition de cette version au destinataire affiché.</p><form method="post" action="${escape(url.pathname)}">${fields}<input type="hidden" name="action" value="confirm"><label><input type="checkbox" name="sendConfirmed" value="yes" required>Je confirme ${d.mode === "production" ? "l’envoi réel" : "la simulation"} de cette version.</label><button type="submit">${d.mode === "production" ? "Confirmer l’envoi" : "Lancer la simulation"}</button></form></section>` : ""}
    ${["prepared", "queued"].includes(d.status) && session.context.role !== "viewer" ? `<form method="post" action="${escape(url.pathname)}"><p>${fields}<input type="hidden" name="action" value="cancel"><button class="secondary" type="submit">Annuler cet envoi</button></p></form>` : ""}<p><a href="${escape(url.pathname)}">Actualiser le suivi</a></p>`,
    responseStatus,
  );
}
