import { SECURE_DISTRIBUTION_LIMITS } from "../../../packages/contracts/src/secure-distribution";

/** Public preparation hints; the domain still owns validation and final content. */
export const emailPreparationDescriptions = {
  subject:
    "Email subject. Required without a document; omitted or blank uses a localized subject naming the authenticated workspace only for an accessible ready PDF.",
  text: `Email body. Required without a document unless derived from HTML. Account document invitations accept at most ${SECURE_DISTRIBUTION_LIMITS.messageCharacters} characters of supplied text. When both text and custom HTML are omitted or blank, an accessible ready PDF uses a localized workspace message. Supplied custom HTML provides the derived text when text is absent. Document emails without custom HTML render the text in the branded template; message-only presentation is unchanged.`,
  html: `Optional custom email HTML with safe inline typography, colors, spacing, borders and table layout. Account document invitations accept at most ${SECURE_DISTRIBUTION_LIMITS.htmlCharacters} characters of supplied HTML. Scripts, remote resources and unsafe CSS are removed. Account invitations and legacy protected_link email accept an exact anchor href="{{document_url}}" to place the server-generated document link in the custom button. Without that marker, document-access delivery appends a styled button; a marker avoids a duplicate button while retaining access information. Actual link tokens and passwords are unsupported inputs. Final sanitized content is frozen before review.`,
} as const;

export const emailContentCapabilities = {
  documentDefaults: "localized_authenticated_workspace",
  messageOnlyRequires: ["subject", "text_or_html"],
  documentHtmlPresentation: "branded_template_unless_custom_html",
  customHtml: "safe_inline_email_css",
  protectedLinkPlaceholder: "{{document_url}}",
  protectedLinkPlaceholderContext: "exact_anchor_href_only",
  contentBinding: "final_sanitized_content_before_fingerprint",
  accountDelivery: {
    destination: "my_documents",
    authentication: "recipient_account_with_matching_verified_email",
    separateDocumentPassword: false,
    defaultFor: ["web_document_email", "mcp_document_email"],
    restPreparation: "/api/secure-distributions",
    mcpPreparation: "prepare_secure_distribution",
    htmlTemplate: "guteneo_v2",
    contentLimits: {
      textCharacters: SECURE_DISTRIBUTION_LIMITS.messageCharacters,
      htmlCharacters: SECURE_DISTRIBUTION_LIMITS.htmlCharacters,
    },
  },
} as const;
