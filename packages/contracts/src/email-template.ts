import { deliveryExpiryDate, deliveryText } from "./delivery-messages";
import type { SupportedLocale } from "./locale";

export type ProtectedEmailDocument = { url: string; expiresAt: string };
export type AccountEmailDocument = { url: string; retentionDays: number };
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
  return `<p style="margin:28px 0"><a href="${escape(url)}" style="display:inline-block;background-color:#2450db;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;line-height:1.5;text-decoration:none;padding:14px 24px;border:1px solid #2450db;border-radius:7px">${escape(label)}</a></p>`;
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
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f6f5ef;border-collapse:collapse"><tbody><tr><td align="center" style="padding:0 16px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#555963"><a href="https://guteneo.com/?lang=${locale}" style="color:#555963;text-decoration:underline">${escape(deliveryText("Discover guteneo", locale))}</a><br><a href="${escape(preferencesUrl)}" style="color:#555963;text-decoration:underline">${escape(deliveryText("Unsubscribe or report this email", locale))}</a></td></tr></tbody></table>`;
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
  const paragraphs = input.text
    .split(/\n\s*\n/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px">${escape(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const footer = input.accountDocument
    ? renderAccountEmailFooter(input.accountDocument, input.locale)
    : input.protectedDocument
      ? renderProtectedEmailFooter(input.protectedDocument, input.locale)
      : "";
  const title = input.documentTitle?.trim()
    ? `<blockquote style="margin:0 0 24px;padding:12px 18px;border-left:3px solid #2450db;color:#181b22;font-family:Georgia,serif;font-size:23px;line-height:1.4;overflow-wrap:anywhere">${escape(documentQuotation(input.documentTitle, input.locale))}</blockquote>`
    : "";
  const sender = workspaceLabel(input.workspaceName, input.locale);
  const signature = input.text.includes(sender)
    ? ""
    : `<p style="margin:28px 0 0;color:#555963;font-family:Arial,Helvetica,sans-serif;font-size:13px">${escape(sender)}</p>`;
  const serviceFooter = input.preferencesUrl
    ? renderEmailServiceFooter(input.locale, input.preferencesUrl)
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#f6f5ef"><tbody><tr><td align="center" style="padding:36px 16px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0"><tbody><tr><td style="padding:0 8px 24px"><p style="margin:0;color:#181b22;font-family:Georgia,serif;font-size:34px;font-weight:500;line-height:1.2">guteneo</p></td></tr><tr><td style="padding:32px 28px;background-color:#ffffff;border:1px solid #deddd7;border-radius:10px;color:#181b22;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65"><h1 style="margin:0 0 24px;color:#181b22;font-family:Georgia,serif;font-size:36px;font-weight:400;line-height:1.15">${escape(deliveryText("Your document is ready.", input.locale))}</h1>${title}${paragraphs}${footer}${signature}</td></tr></tbody></table></td></tr></tbody></table>${serviceFooter}`;
}
