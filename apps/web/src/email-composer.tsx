import { msg, msgIn } from "./messages";
import { Field } from "./components";
import { useId, useRef } from "react";

export function emailDraftHtml(text: string, customHtml: string) {
  // The real protected URL exists only after server preparation. Keep this
  // authoring preview local without changing the markup submitted for review.
  if (customHtml.trim()) return customHtml.replaceAll("{{document_url}}", "#");
  return `<p>${text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\n", "<br>")}</p>`;
}

export function EmailComposer({
  text,
  html,
  onText,
  onHtml,
  disabled,
  documentEmail = false,
  protectedLink = false,
}: {
  text: string;
  html: string;
  onText: (value: string) => void;
  onHtml: (value: string) => void;
  disabled?: boolean;
  documentEmail?: boolean;
  protectedLink?: boolean;
}) {
  const linkHintId = useId();
  const htmlInput = useRef<HTMLTextAreaElement>(null);
  function insertDocumentButton() {
    const initialHtml = html.trim()
      ? html
      : text.trim()
        ? emailDraftHtml(text, "")
        : "";
    const button = `<p><a href="{{document_url}}" style="display: inline-block; background-color: #2450db; color: #ffffff; padding: 14px 22px; border-radius: 7px; text-decoration: none; font-weight: 600;">${msg("View the document")}</a></p>`;
    onHtml(`${initialHtml ? `${initialHtml}\n\n` : ""}${button}`);
    htmlInput.current?.focus();
  }
  return (
    <>
      <Field label={documentEmail ? msg("Message (optional)") : msg("Message")}>
        <textarea
          rows={6}
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={150000}
          required={!documentEmail}
          placeholder={
            documentEmail
              ? msg(
                  "Your workspace and document will be introduced automatically.",
                )
              : undefined
          }
          disabled={disabled}
        />
      </Field>
      <details className="email-advanced">
        <summary>{msg("Customise the HTML version (optional)")}</summary>
        <Field
          label={msg("HTML version")}
          hint={
            documentEmail
              ? msg(
                  "Leave empty to use the Guteneo email template. Custom HTML keeps its supported styles.",
                )
              : msg(
                  "Without custom HTML, your message is formatted automatically. The message above remains the accessible plain-text version.",
                )
          }
        >
          <textarea
            rows={6}
            ref={htmlInput}
            className="code-input"
            value={html}
            onChange={(event) => onHtml(event.target.value)}
            maxLength={150000}
            disabled={disabled}
            aria-describedby={protectedLink ? linkHintId : undefined}
          />
        </Field>
        {protectedLink && (
          <div className="email-document-link">
            <p className="field-hint" id={linkHintId}>
              {msg(
                "Use {{document_url}} as a link address to position your document button. If omitted, Guteneo adds a button.",
              )}
            </p>
            <button
              type="button"
              className="button"
              disabled={disabled || html.includes("{{document_url}}")}
              onClick={insertDocumentButton}
            >
              {msg("Insert a document button")}
            </button>
          </div>
        )}
      </details>
    </>
  );
}

export function DistributionRoadmap() {
  return (
    <div className="distribution-roadmap">
      <span className="eyebrow">{msgIn("short-status", "Coming soon")}</span>
      <h3>{msg("One list, all your recipients.")}</h3>
      <p>
        {msg(
          "Importing recipient lists in all formats and distributing PDFs, Excel files and other documents are planned. These features are not yet available.",
        )}
      </p>
      <p>
        {msg(
          "Later, each recipient will be able to find their documents in their own password-protected account.",
        )}
      </p>
    </div>
  );
}
