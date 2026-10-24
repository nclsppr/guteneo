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
      <legend>{msg("Address on the letter")}</legend>
      <label>
        <input
          type="radio"
          name="postal-address-mode"
          checked={mode === "document"}
          onChange={() => onChange("document")}
        />
        <span>{msg("Use the document’s address")}</span>
      </label>
      <label>
        <input
          type="radio"
          name="postal-address-mode"
          checked={mode === "generated_address_page"}
          onChange={() => onChange("generated_address_page")}
        />
        <span>{msg("Add an address page")}</span>
      </label>
      <p id="postal-address-mode-help" className="field-hint">
        {mode === "document"
          ? msg(
              "The PDF stays unchanged. Its address must already match the recipient and appear in the envelope window.",
            )
          : msg(
              "The recipient will be printed on a new first page, in the selected window. Your source PDF is preserved.",
            )}
      </p>
      <fieldset className="postal-window-choice">
        <legend>{msg("Envelope window")}</legend>
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
              {position === "left" ? msg("On the left") : msg("On the right")}
            </span>
          </label>
        ))}
      </fieldset>
      {mode === "generated_address_page" && (
        <p className="field-hint" role="status">
          {printMode === "duplex"
            ? msg(
                "For double-sided printing, 2 PDF pages are added: the address page and its blank reverse, making 1 additional sheet. The front and back pages of the source document stay paired.",
              )
            : msg(
                "For single-sided printing, 1 PDF page is added, making 1 additional sheet.",
              )}{" "}
          {msg(
            "The price of the complete letter will be shown before you approve sending.",
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
        <strong>{msg("Final PDF with address page")}</strong>
        <br />
        {document.pages} {document.pages === 1 ? msg("page") : msg("pages")}{" "}
        {msg(" PDF ·")} {sheets}{" "}
        {sheets === 1 ? msg("sheet") : msg("sheets")} {msg(" in")}{" "}
        {provenance.printMode === "duplex" ? msg("double-sided printing") : msg("single-sided printing")}
        {msg(". Including")} {provenance.addedPages}{" "}
        {provenance.addedPages === 1
          ? msg("added page")
          : msg("added pages")}
        {provenance.addedPages === 2 ? msg(", with a blank reverse") : ""}.
      </p>
      <p className="field-hint">
        {msg(
          "Review every page of this final PDF before continuing. The quote covers this complete file.",
        )}
      </p>
      <a
        href={`#/app/documents?document=${encodeURIComponent(provenance.sourceDocumentId)}`}
      >
        {msg("View the preserved source PDF")}
      </a>
    </div>
  );
}
