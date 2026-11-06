import { deliveryExpiryDate, deliveryText } from "./delivery-messages";
import type { SupportedLocale } from "./locale";
import {
  escapeEmailText as escape,
  renderEmailAction,
  renderEmailFooter,
  renderEmailParagraphs,
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
/** A fixed, resource-free footer; only its href can contain the server-created URL. */
export function renderProtectedEmailFooter(
  document: ProtectedEmailDocument,
  locale: SupportedLocale,
  includeLink = true,
): string {
  return `${includeLink ? renderDocumentEmailButton(document.url, deliveryText("View the protected document", locale)) : ""}<p style="margin:20px 0 0;color:#555963;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">${escape(protectedEmailInstructions(document.expiresAt, locale))}</p>`;
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
  return `${includeLink ? renderDocumentEmailButton(document.url, deliveryText("Open in My documents", locale)) : ""}<p style="margin:24px 0 0;color:#555963;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">${escape(accountEmailInstructions(document.retentionDays, locale)).replace(/\n/g, "<br>")}</p>`;
}
export function renderEmailServiceFooter(
  locale: SupportedLocale,
  preferencesUrl: string,
): string {
  return renderEmailFooter(
    `<p style="margin:0 0 6px"><a href="https://guteneo.com/?lang=${locale}" style="color:#555963;text-decoration:underline">${escape(deliveryText("Discover guteneo", locale))}</a></p><p style="margin:0"><a href="${escape(preferencesUrl)}" style="color:#555963;text-decoration:underline">${escape(deliveryText("Unsubscribe or report this email", locale))}</a></p>`,
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
    ? renderAccountEmailFooter(input.accountDocument, input.locale)
    : input.protectedDocument
      ? renderProtectedEmailFooter(input.protectedDocument, input.locale)
      : "";
  const title = input.documentTitle?.trim()
    ? `<blockquote style="margin:0 0 28px;padding:0 0 24px;border-bottom:1px solid #deddd7;color:#181b22;font-family:Georgia,serif;font-size:23px;line-height:1.4;overflow-wrap:anywhere">${escape(documentQuotation(input.documentTitle, input.locale))}</blockquote>`
    : "";
  const sender = workspaceLabel(input.workspaceName, input.locale);
  const signature = input.text.includes(sender)
    ? ""
    : `<p style="margin:28px 0 0;color:#555963;font-family:Arial,Helvetica,sans-serif;font-size:13px">${escape(sender)}</p>`;
  const serviceFooter = input.preferencesUrl
    ? renderEmailServiceFooter(input.locale, input.preferencesUrl)
    : "";
  return (
    renderEmailSheet({
      title: deliveryText("Your document is ready.", input.locale),
      bodyHtml: `${title}${paragraphs}${footer}${signature}`,
    }) + serviceFooter
  );
}
