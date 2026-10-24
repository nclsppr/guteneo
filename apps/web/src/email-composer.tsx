import { msg, msgIn } from "./messages";
import { Field } from "./components";

export function emailHtml(text: string, customHtml: string) {
  if (customHtml.trim()) return customHtml;
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
}: {
  text: string;
  html: string;
  onText: (value: string) => void;
  onHtml: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Field label={msg("Message")}>
        <textarea
          rows={6}
          value={text}
          onChange={(event) => onText(event.target.value)}
          maxLength={150000}
          required
          disabled={disabled}
        />
      </Field>
      <details className="email-advanced">
        <summary>{msg("Customise the HTML version (optional)")}</summary>
        <Field
          label={msg("HTML version")}
          hint={msg(
            "Without custom HTML, your message is formatted automatically. The message above remains the accessible plain-text version.",
          )}
        >
          <textarea
            rows={6}
            className="code-input"
            value={html}
            onChange={(event) => onHtml(event.target.value)}
            maxLength={150000}
            disabled={disabled}
          />
        </Field>
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
