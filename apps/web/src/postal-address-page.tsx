import { msg } from "./messages";
import type { DocumentRecord } from "./api";
import type { PostalAddressPageProvenance } from "../../../packages/contracts/src/postal-address-page";
import "./postal-address-page.css";

export type PostalAddressMode = "document" | "generated_address_page";

export function PostalAddressChoice({
  mode,
  onChange,
  printMode,
  addressPosition,
  positions,
  onPositionChange,
}: {
  mode: PostalAddressMode;
  onChange: (mode: PostalAddressMode) => void;
  printMode: "simplex" | "duplex";
  addressPosition: "left" | "right";
  positions: ("left" | "right")[];
  onPositionChange: (position: "left" | "right") => void;
}) {
  return (
    <fieldset
      className="postal-address-choice"
      aria-describedby="postal-address-mode-help"
    >
      <legend>{msg("Adresse sur le courrier")}</legend>
      <label>
        <input
          type="radio"
          name="postal-address-mode"
          checked={mode === "document"}
          onChange={() => onChange("document")}
        />
        <span>{msg("Utiliser l’adresse du document")}</span>
      </label>
      <label>
        <input
          type="radio"
          name="postal-address-mode"
          checked={mode === "generated_address_page"}
          onChange={() => onChange("generated_address_page")}
        />
        <span>{msg("Ajouter une page d’adresse")}</span>
      </label>
      <p id="postal-address-mode-help" className="field-hint">
        {mode === "document"
          ? msg(
              "Le PDF reste inchangé. Son adresse doit déjà correspondre au destinataire et apparaître dans la fenêtre de l’enveloppe.",
            )
          : msg(
              "Le destinataire sera imprimé sur une nouvelle première page, dans la fenêtre choisie. Votre PDF source est conservé.",
            )}
      </p>
      <fieldset className="postal-window-choice">
        <legend>{msg("Fenêtre de l’enveloppe")}</legend>
        {positions.map((position) => (
          <label key={position}>
            <input
              type="radio"
              name="postal-window"
              value={position}
              checked={addressPosition === position}
              onChange={() => onPositionChange(position)}
            />
            <span>
              {position === "left" ? msg("À gauche") : msg("À droite")}
            </span>
          </label>
        ))}
      </fieldset>
      {mode === "generated_address_page" && (
        <p className="field-hint" role="status">
          {printMode === "duplex"
            ? msg(
                "En recto verso, 2 pages PDF sont ajoutées : la page d’adresse et son verso blanc, soit 1 feuille supplémentaire. Les rectos et versos du document source restent appariés.",
              )
            : msg(
                "En recto, 1 page PDF est ajoutée, soit 1 feuille supplémentaire.",
              )}{" "}
          {msg(
            "Le prix du courrier complet sera affiché avant votre accord d’envoi.",
          )}
        </p>
      )}
    </fieldset>
  );
}

export function PostalAddressPageSummary({
  document,
  provenance,
}: {
  document: Pick<DocumentRecord, "pages">;
  provenance: PostalAddressPageProvenance;
}) {
  const sheets =
    provenance.printMode === "duplex"
      ? Math.ceil(document.pages / 2)
      : document.pages;
  return (
    <div className="postal-generated-summary">
      <p>
        <strong>{msg("PDF final avec page d’adresse")}</strong>
        <br />
        {document.pages} {document.pages === 1 ? msg("page") : msg("pages")}{" "}
        {msg(" PDF ·")} {sheets}{" "}
        {sheets === 1 ? msg("feuille") : msg("feuilles")} {msg(" en")}{" "}
        {provenance.printMode === "duplex" ? msg("recto verso") : msg("recto")}
        {msg(". Dont")} {provenance.addedPages}{" "}
        {provenance.addedPages === 1
          ? msg("page ajoutée")
          : msg("pages ajoutées")}
        {provenance.addedPages === 2 ? msg(", avec un verso blanc") : ""}.
      </p>
      <p className="field-hint">
        {msg(
          "Parcourez toutes les pages de ce PDF final avant de poursuivre. Le devis porte sur ce fichier complet.",
        )}
      </p>
      <a
        href={`#/app/documents?document=${encodeURIComponent(provenance.sourceDocumentId)}`}
      >
        {msg("Consulter le PDF source conservé")}
      </a>
    </div>
  );
}
