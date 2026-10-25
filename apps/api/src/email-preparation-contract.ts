/** Public preparation hints; the domain still owns validation and final content. */
export const emailPreparationDescriptions = {
  subject:
    "Email subject. Required without a document; omitted or blank uses a localized subject naming the authenticated workspace only for an accessible ready PDF.",
  text: "Email body. Required without a document unless derived from HTML. When both text and custom HTML are omitted or blank, an accessible ready PDF uses a localized workspace message. Supplied custom HTML provides the derived text when text is absent. Document emails without custom HTML render the text in the branded template; message-only presentation is unchanged.",
  html: 'Optional custom email HTML with safe inline typography, colors, spacing, borders and table layout. Scripts, remote resources and unsafe CSS are removed. In protected_link mode only, an exact anchor href="{{document_url}}" places the server-generated private link in the custom button. Without that marker, protected delivery appends a styled button; a marker avoids a duplicate button while retaining access instructions. Never supply an actual link token or password. Final sanitized content is frozen before review.',
} as const;

export const emailContentCapabilities = {
  documentDefaults: "localized_authenticated_workspace",
  messageOnlyRequires: ["subject", "text_or_html"],
  documentHtmlPresentation: "branded_template_unless_custom_html",
  customHtml: "safe_inline_email_css",
  protectedLinkPlaceholder: "{{document_url}}",
  protectedLinkPlaceholderContext: "exact_anchor_href_only",
  contentBinding: "final_sanitized_content_before_fingerprint",
} as const;
