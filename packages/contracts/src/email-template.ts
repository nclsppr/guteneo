import { renderEmailBrandImage } from "./email-branding";
import { deliveryExpiryDate, deliveryText } from "./delivery-messages";
import type { SupportedLocale } from "./locale";
import {
  escapeEmailText as escape,
  renderEmailAction,
  renderEmailFooter,
  renderEmailParagraphs,
  renderEmailNote,
  renderEmailSheet,
} from "./email-presentation";

export type ProtectedEmailDocument = { url: string; expiresAt: string };
export type AccountEmailDocument = { url: string; retentionDays: number };
function workspaceLabel(name: string, locale: SupportedLocale): string {
  return (
    name.replace(/[\s\x00-\x1f\x7f]+/g, " ").trim() ||
    deliveryText("Your workspace", locale)
  );
}
/** Only generated copy is normalized. A supplied subject/body is never rewritten here. */
export function documentEmailDefaults(
  workspaceName: string,
  mode: "attachment" | "protected_link" | "my_documents",
  locale: SupportedLocale,
): { subject: string; text: string } {
  const name = workspaceLabel(workspaceName, locale);
  const subject = deliveryText("Document from {0}", locale).replace(
    "{0}",
    () => name,
  );
  let boundedSubject = subject;
  if (subject.length > 250) {
    boundedSubject = "";
    for (const character of subject) {
      if (boundedSubject.length + character.length > 249) break;
      boundedSubject += character;
    }
    boundedSubject += "…";
  }
  return {
    subject: boundedSubject,
    text: deliveryText(
      mode === "my_documents"
        ? "{0} has sent you a document in Guteneo."
        : mode === "protected_link"
          ? "{0} has shared a protected document with you."
          : "{0} has sent you a document. You will find it attached to this email.",
      locale,
    ).replace("{0}", () => name),
  };
}
export function transactionalEmailText(input: {
  text: string;
  workspaceName: string;
  locale: SupportedLocale;
  documentTitle?: string;
}): string {
  const title = input.documentTitle?.trim()
    ? `${documentQuotation(input.documentTitle, input.locale)}\n\n`
    : "";
  return `guteneo · ${workspaceLabel(input.workspaceName, input.locale)}\n\n${title}${input.text}`;
}
function documentQuotation(title: string, locale: SupportedLocale): string {
  return locale === "fr" ? `« ${title} »` : `“${title}”`;
}
export function protectedEmailInstructions(
  expiresAt: string,
  locale: SupportedLocale,
): string {
  return deliveryText(
    "Ask the sender for the password through another channel. This link expires on {0}.",
    locale,
  ).replace("{0}", deliveryExpiryDate(expiresAt, locale));
}
/** Only the action href contains the server-created URL. */
export function renderProtectedEmailFooter(
  document: ProtectedEmailDocument,
  locale: SupportedLocale,
  includeLink = true,
): string {
  return `${includeLink ? renderDocumentEmailButton(document.url, deliveryText("View the protected document", locale)) : ""}${renderEmailNote(deliveryText("Password and expiry", locale), protectedEmailInstructions(document.expiresAt, locale))}`;
}
export function renderDocumentEmailButton(url: string, label: string): string {
  return renderEmailAction(url, label);
}
export function accountEmailInstructions(
  retentionDays: number,
  locale: SupportedLocale,
): string {
  return `${deliveryText("Sign in or create your Guteneo account with the address that received this email.", locale)}\n${deliveryText("Access for {0} days from sending.", locale).replace("{0}", String(retentionDays))}`;
}
export function renderAccountEmailFooter(
  document: AccountEmailDocument,
  locale: SupportedLocale,
  includeLink = true,
): string {
  return `${includeLink ? renderDocumentEmailButton(document.url, deliveryText("Open in My documents", locale)) : ""}${renderEmailNote(deliveryText("Access to your document", locale), accountEmailInstructions(document.retentionDays, locale))}`;
}
export function renderEmailServiceFooter(
  locale: SupportedLocale,
  preferencesUrl: string,
): string {
  return renderEmailFooter(
    `<p style="margin:0"><a style="display:inline-block;margin:0 16px 3px 0;color:#414855;text-decoration:underline" href="https://guteneo.com/?lang=${locale}">${escape(deliveryText("Discover guteneo", locale))}</a> <a href="${escape(preferencesUrl)}" style="display:inline-block;max-width:100%;color:#414855;text-decoration:underline">${escape(deliveryText("Unsubscribe or report this email", locale))}</a></p>`,
  );
}

/** Message-only mail uses the supplied subject, without document-specific copy. */
export function renderMessageEmail(input: {
  subject: string;
  text: string;
  workspaceName: string;
  locale: SupportedLocale;
}): string {
  return renderEmailSheet({
    title: input.subject,
    headerArtworkHtml: renderEmailBrandImage(),
    bodyHtml: renderEmailParagraphs(input.text),
  });
}
/** Shared draft/final presentation. Callers never pass arbitrary markup to this renderer. */
export function renderTransactionalEmail(input: {
  text: string;
  workspaceName: string;
  locale: SupportedLocale;
  protectedDocument?: ProtectedEmailDocument;
  accountDocument?: AccountEmailDocument;
  documentTitle?: string;
  preferencesUrl?: string;
}): string {
  const paragraphs = renderEmailParagraphs(input.text);
  const footer = input.accountDocument
    ? renderAccountEmailFooter(input.accountDocument, input.locale, false)
    : input.protectedDocument
      ? renderProtectedEmailFooter(input.protectedDocument, input.locale, false)
      : "";
  const actionUrl = input.accountDocument?.url ?? input.protectedDocument?.url;
  const action = actionUrl
    ? renderEmailAction(
        actionUrl,
        deliveryText(
          input.accountDocument
            ? "Open in My documents"
            : "View the protected document",
          input.locale,
        ),
        "before-message",
      )
    : "";
  const title = input.documentTitle?.trim()
    ? input.locale === "fr"
      ? `«\u202f${input.documentTitle}\u202f»`
      : documentQuotation(input.documentTitle, input.locale)
    : undefined;
  const sender = workspaceLabel(input.workspaceName, input.locale);
  const signature = input.text.includes(sender)
    ? ""
    : `<p style="margin:28px 0 0;color:#555963;font-family:Arial,Helvetica,sans-serif;font-size:13px">${escape(sender)}</p>`;
  const serviceFooter = input.preferencesUrl
    ? renderEmailServiceFooter(input.locale, input.preferencesUrl)
    : "";
  return (
    renderEmailSheet({
      title: title ?? deliveryText("Your document is ready.", input.locale),
      quoteTitle: Boolean(title),
      headerArtworkHtml: renderEmailBrandImage(),
      bodyHtml: `${action}${paragraphs}${signature}${footer}`,
    }) + serviceFooter
  );
}
