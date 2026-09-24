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
      <Field label="Message">
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
        <summary>Personnaliser la version HTML (facultatif)</summary>
        <Field
          label="Version HTML"
          hint="Sans HTML personnalisé, votre message est mis en forme automatiquement. Le message ci-dessus reste la version texte accessible."
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
      <span className="eyebrow">Bientôt</span>
      <h3>Une liste, tous vos destinataires.</h3>
      <p>
        L’import de listes de destinataires dans tous les formats et la
        distribution de PDF, de fichiers Excel et d’autres documents sont
        prévus. Ces possibilités ne sont pas encore disponibles.
      </p>
      <p>
        Plus tard, chaque destinataire pourra retrouver ses documents dans son
        propre compte protégé par mot de passe.
      </p>
    </div>
  );
}
