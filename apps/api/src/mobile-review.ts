import {
  standaloneThemeAttributes,
  standaloneThemeMetadata,
  standaloneThemeStyles,
} from "./standalone-theme";
import { workspacePermissions } from "../../../packages/contracts/src/roles";
import { AuthError, authenticateBrowser } from "./auth";
import { mobileText } from "./mobile-locale";
import {
  localeFromAcceptLanguage,
  normalizeLocale,
  type SupportedLocale,
} from "../../../packages/contracts/src/locale";
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
  prepared: "Needs verification",
  queued: "Awaiting processing",
  submitting: "Transmission in progress",
  submission_unknown: "Outcome unconfirmed: do not send this dispatch again",
  accepted: "Accepted by provider",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
  bounced: "Not delivered",
  complained: "Complaint received",
  printed: "Printed",
  handed_to_post: "Handed to the postal network",
};
function html(
  locale: SupportedLocale,
  content: string,
  status = 200,
  request?: Request,
) {
  const t = (key: string) => mobileText(key, locale);
  return new Response(
    `<!doctype html><html lang="${locale}"${standaloneThemeAttributes(request)}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${standaloneThemeMetadata}<title>${t("Review dispatch")} · guteneo</title><style>${standaloneThemeStyles}body{font-family:system-ui,sans-serif;background:var(--paper);color:var(--ink);max-width:52rem;margin:0 auto;padding:24px;line-height:1.55}header{font-family:Georgia,serif;font-size:2rem;margin:16px 0 36px}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.2}h1{font-size:2.2rem}h2{margin-top:32px}section{border-top:1px solid var(--line);padding-top:12px}dl{display:grid;grid-template-columns:minmax(7rem,1fr) minmax(0,2fr);gap:8px 16px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}iframe{width:100%;height:65vh;border:1px solid var(--line);border-radius:8px;background:#fff;color-scheme:light}.message{height:20rem}button,.button{display:inline-block;font:inherit;font-weight:600;border:0;border-radius:12px;background:#2450db;color:white;padding:14px 20px;min-height:48px;cursor:pointer;text-decoration:none}button.secondary{background:transparent;color:var(--ink);border:1px solid var(--ink)}label{display:block;margin:20px 0}input[type=checkbox]{width:22px;height:22px;vertical-align:middle;margin-right:8px}.notice{padding:16px;border:1px solid var(--warning);border-radius:12px;background:var(--warning-tint)}a{color:inherit;text-underline-offset:3px}code{overflow-wrap:anywhere;font-size:.8rem}footer{margin:36px 0;color:var(--muted)}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--focus);outline-offset:4px}@media(max-width:480px){body{padding:20px}dl{grid-template-columns:1fr;gap:3px}dd{margin-bottom:10px}}</style></head><body><header aria-label="Guteneo"><span class="brand">guteneo</span></header><main>${content}</main><footer>${t("This page is only for reviewing this dispatch. Close it to return to the app.")}</footer></body></html>`,
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
    return "This dispatch cannot be confirmed right now. No new dispatch was triggered. You can keep your preparation and contact support if needed.";
  if (["LIVE_QUOTE_INVALID", "QUOTE_EXPIRED"].includes(code))
    return "The quote is no longer valid. Refresh this page to check renewal options, then review the new quote.";
  if (code === "FINGERPRINT_MISMATCH")
    return "The displayed version has changed. Refresh this page and review the dispatch before continuing.";
  if (["CSRF_REJECTED", "ORIGIN_REJECTED"].includes(code))
    return "The security confirmation is no longer valid. Refresh the page before continuing.";
  if (code === "RECIPIENT_REQUEST_REQUIRED")
    return "Confirm that the recipient requested this email before approving it.";
  if (code === "FAX_REVIEW_PREPARATION_ONLY")
    return "This quote is for viewing only. It cannot be approved or sent. No amount is reserved or charged.";
  return "The operation could not be confirmed. Refresh tracking before trying again; do not prepare a new dispatch to replace an uncertain outcome.";
}

/** Separate browser-only human review. A native credential never enters here. */
export async function handleMobileReview(
  request: Request,
  env: Env,
  domain: DomainService,
  afterConfirmation?: () => Promise<unknown>,
): Promise<Response | null> {
  const url = new URL(request.url);
  let locale: SupportedLocale =
    normalizeLocale(url.searchParams.get("locale")) ??
    localeFromAcceptLanguage(request.headers.get("Accept-Language"));
  const t = (key: string) => mobileText(key, locale);
  const render = (content: string, status = 200) =>
    html(locale, content, status, request);
  const match = /^\/auth\/mobile\/review\/(dsp_[a-f0-9-]{36})$/.exec(
    url.pathname,
  );
  if (!match) return null;
  if (url.origin !== env.APP_ORIGIN)
    return redirect(new URL(url.pathname + url.search, env.APP_ORIGIN).href);
  if (!["GET", "POST"].includes(request.method))
    return render(`<h1>${t("Operation unavailable")}</h1>`, 405);
  if (request.headers.has("Authorization"))
    return render(
      `<h1>${t("Browser sign-in required")}</h1><p>${t("Use secure sign-in in your browser to review this dispatch.")}</p>`,
      403,
    );
  const login = new URL("/auth/login", env.APP_ORIGIN);
  login.searchParams.set("returnTo", url.pathname + url.search);
  login.searchParams.set("locale", locale);
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
    return render(
      `<h1>${t("Sign in again to continue")}</h1><p>${t("Your session or its security confirmation is no longer valid. The operation was not performed.")}</p><a class="button" href="${escape(login.href)}">${t("Secure sign-in")}</a>`,
      403,
    );
  }
  const preferred = await env.DB.prepare(
    "SELECT preferred_locale FROM users WHERE id=?",
  )
    .bind(session.context.userId)
    .first<{ preferred_locale: string | null }>();
  locale = normalizeLocale(preferred?.preferred_locale) ?? locale;
  const reviewPath = `${url.pathname}?locale=${locale}`;
  const id = match[1];
  let detail;
  try {
    detail = await domain.getDispatch(session.context, id);
  } catch {
    return render(
      `<h1>${t("Dispatch unavailable")}</h1><p>${t("You cannot view this dispatch from this workspace.")}</p>`,
      404,
    );
  }
  const d = detail.dispatch;
  const reviewPreparationOnly =
    d.faxPricing?.executionScope === "review_prepare_only";
  const doc = d.document_id
    ? await domain.getDocument(session.context, d.document_id, d.id)
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
          `${env.APP_ORIGIN}/auth/mobile/review/${encodeURIComponent(renewed.id)}?locale=${locale}`,
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
      return redirect(new URL(url.pathname + url.search, env.APP_ORIGIN).href);
    } catch (error) {
      notice = t(safeFailure(error));
      responseStatus = error instanceof DomainError ? error.status : 400;
    }
  }
  const money = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(minor / 100);
  const nanoMoney = (nano: number) =>
    `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: nano > 0 && nano < 100000 ? 9 : 4 }).format(nano / 1e9)} €`;
  const date = (value: string) =>
    `${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} UTC`;
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
    printMode: "Printing",
    printSpectrum: "Colour",
    deliveryProduct: "Delivery service",
    addressPosition: "Address position",
    kind: "Message type",
    paper: "Paper",
    paperType: "Paper",
    paperTypes: "Paper",
  };
  const optionValues: Record<string, string> = {
    simplex: "Single-sided",
    duplex: "Double-sided",
    grayscale: "Black and white",
    color: "Colour",
    cheap: "Economy",
    fast: "Fast",
    left: "Left",
    right: "Right",
    transactional: "Transactional",
    normal: "Standard",
  };
  const describe = (value: unknown): string => {
    if (typeof value === "boolean") return t(value ? "Yes" : "No");
    if (value === null) return t("Not set");
    if (Array.isArray(value)) return value.map(describe).join(", ");
    if (typeof value === "object")
      return Object.entries(value as Record<string, unknown>)
        .map(
          ([name, item]) =>
            `${name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")} : ${describe(item)}`,
        )
        .join(" · ");
    return optionValues[String(value)]
      ? t(optionValues[String(value)])
      : String(value);
  };
  const optionDetails = Object.entries(options)
    .filter(([name]) => !["providerDraftId", "preparedLetterId"].includes(name))
    .map(
      ([name, value]) =>
        `<dt>${escape(optionNames[name] ? t(optionNames[name]) : name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " "))}</dt><dd>${escape(describe(value))}</dd>`,
    )
    .join("");
  const estimate = d.faxPricing
    ? t("{low} to {high}")
        .replace("{low}", nanoMoney(d.faxPricing.estimatedLowNanoeur))
        .replace("{high}", nanoMoney(d.faxPricing.estimatedHighNanoeur))
    : d.quote_customer_nanoeur != null
      ? nanoMoney(d.quote_customer_nanoeur)
      : money(d.estimated_minor);
  const emailPreview = d.html
    ? `<iframe class="message" title="${t("Final email content")}" sandbox srcdoc="${escape(`<!doctype html><meta charset=utf-8><meta http-equiv=Content-Security-Policy content="default-src 'none'"><body>${d.html}</body>`)}"></iframe>`
    : `<pre>${escape(d.text)}</pre>`;
  const permissions = workspacePermissions(session.context.role, {
    canApprove: session.context.supervisorCanApprove,
    canReport: session.context.supervisorCanReport,
  });
  const canAct =
    permissions.approveDispatches &&
    !reviewPreparationOnly &&
    d.status === "prepared" &&
    !expired &&
    documentReady;
  const canRenew =
    permissions.prepareDispatches &&
    d.channel === "fax" &&
    d.status === "prepared" &&
    expired &&
    detail.attempts.length === 0;
  return render(
    `<h1>${t("Review dispatch")}</h1><p>${escape(t(statusLabels[d.status] ?? "Tracking in progress"))}</p>${d.mode === "simulation" ? `<p class="notice">${t("Simulation: no real communication.")}</p>` : ""}${notice ? `<p class="notice" role="alert">${escape(notice)}</p>` : ""}
    <section><h2>${t("Recipient and cost")}</h2><dl><dt>${t("Channel")}</dt><dd>${escape(t({ fax: "Fax", email: "Email", postal: "Postal letter" }[d.channel]))}</dd><dt>${t("Recipient")}</dt><dd>${Object.values(recipient).map(escape).join("<br>")}</dd><dt>${t("Sender")}</dt><dd>${escape(d.sender_address)}</dd>${d.subject ? `<dt>${t("Subject")}</dt><dd>${escape(d.subject)}</dd>` : ""}<dt>${t("Estimate")}${d.mode === "production" ? t(" excl. tax") : ""}</dt><dd>${escape(estimate)}</dd><dt>${t("Firm limit")}${d.mode === "production" ? t(" excl. tax") : ""}</dt><dd>${escape(money(d.ceiling_minor))}</dd>${d.quote_expires_at ? `<dt>${t("Quote valid until")}</dt><dd>${escape(date(d.quote_expires_at))}</dd>` : ""}${optionDetails}</dl>
    ${reviewPreparationOnly ? `<p class="notice">${t("For review preparation only. This reference range excluding tax uses real rates and duration assumptions; it excludes unqualified conditional adjustments. This fax cannot be approved or sent, including in expert mode. No amount is reserved or charged. Local Calling capability remains unconfirmed.")}</p>` : d.faxPricing ? `<p>${t("The cost of this entire fax depends on transmission duration. The limit is reserved when you confirm. The final cost is determined after usage verification and cannot exceed the limit. Fractions of a cent are accumulated across dispatches.")}</p>${d.faxPricing.routeQualification === "operator_authorized_test" ? `<p class="notice">${t("Luxembourg test authorised by the operator. Local Calling capability is unconfirmed; the provider may reject transmission.")}</p>` : ""}` : ""}
    ${!reviewPreparationOnly && d.quote_customer_nanoeur != null ? `<p>${t("Fractions of a cent are accumulated across dispatches before rounding. The limit remains reserved until the outcome is known.")}</p>` : ""}</section>
    <section><h2>${t("Exact content")}</h2>${doc ? `<p>${escape(doc.name)} · ${doc.pages} ${t(doc.pages > 1 ? "pages" : "page")}</p>${documentReady ? `<iframe title="${t("Exact original PDF")}" src="/api/documents/${encodeURIComponent(doc.id)}/content?dispatchId=${encodeURIComponent(d.id)}"></iframe><p><a href="/api/documents/${encodeURIComponent(doc.id)}/content?dispatchId=${encodeURIComponent(d.id)}" target="_blank" rel="noopener">${t("Open original PDF")}</a></p>` : `<p class="notice">${t("PDF verification must finish before approval.")}</p>`}<p>${t("SHA-256 fingerprint")} : <code>${escape(doc.sha256)}</code></p>` : ""}${d.channel === "email" ? emailPreview : ""}</section>
    ${expired ? `<p class="notice">${t("The quote has expired.")} ${t(canRenew ? "Renew it below, then review the new version." : "This dispatch cannot be confirmed using this quote.")}</p>` : ""}${canRenew ? `<form method="post" action="${escape(reviewPath)}">${fields}<input type="hidden" name="action" value="renew"><button type="submit">${t("Renew quote")}</button></form>` : ""}
    ${canAct && !approved ? `<section><h2>${t("Your approval")}</h2><form method="post" action="${escape(reviewPath)}">${fields}<input type="hidden" name="action" value="approve"><label><input type="checkbox" name="reviewed" value="yes" required>${escape(t("I have reviewed the exact content, recipient and options. I accept the cost up to {amount} for this version.").replace("{amount}", money(d.ceiling_minor) + (d.mode === "production" ? t(" excl. tax") : "")))}</label>${d.channel === "email" && d.mode === "production" ? `<label><input type="checkbox" name="recipientRequested" value="yes" required>${t("This recipient requested this email and its content.")}</label>` : ""}<button type="submit">${t("Approve this version")}</button></form></section>` : ""}
    ${canAct && approved ? `<section><h2>${t("Version approved")}</h2><p>${t("Your approval is recorded. Now confirm sending this version to the displayed recipient.")}</p><form method="post" action="${escape(reviewPath)}">${fields}<input type="hidden" name="action" value="confirm"><label><input type="checkbox" name="sendConfirmed" value="yes" required>${t(d.mode === "production" ? "I confirm the real sending of this version." : "I confirm the simulation of this version.")}</label><button type="submit">${t(d.mode === "production" ? "Confirm sending" : "Run simulation")}</button></form></section>` : ""}
    ${["prepared", "queued"].includes(d.status) && permissions.approveDispatches ? `<form method="post" action="${escape(reviewPath)}"><p>${fields}<input type="hidden" name="action" value="cancel"><button class="secondary" type="submit">${t("Cancel this dispatch")}</button></p></form>` : ""}<p><a href="${escape(reviewPath)}">${t("Refresh tracking")}</a></p>`,
    responseStatus,
  );
}
