import type { DocumentRecord } from "./api";
import type { PostalAddressPageProvenance } from "../../../packages/contracts/src/postal-address-page";
import "./postal-address-page.css";

export type PostalAddressMode = "document" | "generated_address_page";

export function PostalAddressChoice({
  mode,
  onChange,
  printMode,
}: {
  mode: PostalAddressMode;
  onChange: (mode: PostalAddressMode) => void;
  printMode: "simplex" | "duplex";
}) {
  return (
    <fieldset
      className="postal-address-choice"
      aria-describedby="postal-address-mode-help"
    >
      <legend>Adresse sur le courrier</legend>
      <label>
        <input
          type="radio"
          name="postal-address-mode"
          checked={mode === "document"}
          onChange={() => onChange("document")}
        />
        <span>Utiliser l’adresse du document</span>
      </label>
      <label>
        <input
          type="radio"
          name="postal-address-mode"
          checked={mode === "generated_address_page"}
          onChange={() => onChange("generated_address_page")}
        />
        <span>Ajouter une page d’adresse</span>
      </label>
      <p id="postal-address-mode-help" className="field-hint">
        {mode === "document"
          ? "Le PDF reste inchangé. Son adresse doit déjà correspondre au destinataire et apparaître dans la fenêtre de l’enveloppe."
          : "Les coordonnées du destinataire ci-dessous seront imprimées sur une nouvelle première page. La position est fixée pour la fenêtre de l’enveloppe. Votre PDF source est conservé."}
      </p>
      {mode === "generated_address_page" && (
        <p className="field-hint" role="status">
          {printMode === "duplex"
            ? "En recto verso, 2 pages PDF sont ajoutées : la page d’adresse et son verso blanc, soit 1 feuille supplémentaire. Les rectos et versos du document source restent appariés."
            : "En recto, 1 page PDF est ajoutée, soit 1 feuille supplémentaire."}{" "}
          Le prix du courrier complet sera confirmé après le devis Pingen.
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
        <strong>PDF final avec page d’adresse</strong>
        <br />
        {document.pages} {document.pages === 1 ? "page" : "pages"} PDF ·{" "}
        {sheets} {sheets === 1 ? "feuille" : "feuilles"} en{" "}
        {provenance.printMode === "duplex" ? "recto verso" : "recto"}. Dont{" "}
        {provenance.addedPages}{" "}
        {provenance.addedPages === 1 ? "page ajoutée" : "pages ajoutées"}
        {provenance.addedPages === 2 ? ", avec un verso blanc" : ""}.
      </p>
      <p className="field-hint">
        Parcourez toutes les pages de ce PDF final avant de poursuivre. Le devis
        porte sur ce fichier complet.
      </p>
      <a
        href={`#/app/documents?document=${encodeURIComponent(provenance.sourceDocumentId)}`}
      >
        Consulter le PDF source conservé
      </a>
    </div>
  );
}
