import { deliveryExpiryDate, deliveryText } from "./delivery-messages";
import type { SupportedLocale } from "./locale";

export type ProtectedEmailDocument = { url: string; expiresAt: string };
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
  mode: "attachment" | "protected_link",
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
      mode === "protected_link"
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
}): string {
  return `guteneo · ${workspaceLabel(input.workspaceName, input.locale)}\n\n${input.text}`;
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
  return `${includeLink ? `<p style="margin:24px 0"><a href="${escape(document.url)}" style="display:inline-block;background-color:#181b22;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.5;text-decoration:none;padding:12px 20px;border-radius:4px">${escape(deliveryText("View the protected document", locale))}</a></p>` : ""}<p style="margin:20px 0 0;color:#555963;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">${escape(protectedEmailInstructions(document.expiresAt, locale))}</p>`;
}
/** Shared draft/final presentation. Callers never pass arbitrary markup to this renderer. */
export function renderTransactionalEmail(input: {
  text: string;
  workspaceName: string;
  locale: SupportedLocale;
  protectedDocument?: ProtectedEmailDocument;
}): string {
  const paragraphs = input.text
    .split(/\n\s*\n/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 20px">${escape(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#f6f5ef"><tbody><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;border-collapse:collapse;background-color:#ffffff;border:1px solid #d8d5ca;border-top:3px solid #2450db"><tbody><tr><td style="padding:24px 28px;border-bottom:1px solid #d8d5ca"><p style="margin:0 0 12px;color:#181b22;font-family:Georgia,serif;font-size:32px;line-height:1.2">guteneo</p><p style="margin:0;color:#181b22;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.5">${escape(workspaceLabel(input.workspaceName, input.locale))}</p></td></tr><tr><td style="padding:28px;color:#181b22;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">${paragraphs}${input.protectedDocument ? renderProtectedEmailFooter(input.protectedDocument, input.locale) : ""}</td></tr></tbody></table></td></tr></tbody></table>`;
}
