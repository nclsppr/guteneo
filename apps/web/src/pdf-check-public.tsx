import { Plus } from "@phosphor-icons/react";
import { PdfCheckBenefits, PdfCheckCreditTerms } from "./pdf-check-offer";
import { PDF_VALIDATION_PRICE_MINOR } from "../../../packages/contracts/src/pdf-validation";
import { money } from "./api";
import { msg } from "./messages";
import { workspaceEntryHref } from "./auth-navigation";

export type PublicCapabilities = {
  mode?: string;
  pdfValidation?: { available?: boolean };
};
export type PdfCheckPublicAvailability = {
  state: "available" | "closed" | "unknown";
  loading: boolean;
};
export function pdfCheckPublicAvailability(
  capabilities: PublicCapabilities | undefined,
  loading: boolean,
): PdfCheckPublicAvailability {
  const state = loading
    ? "unknown"
    : capabilities?.mode === "production" &&
        capabilities.pdfValidation?.available === true
      ? "available"
      : capabilities?.pdfValidation?.available === false
        ? "closed"
        : "unknown";
  return { state, loading };
}
const unknownAvailability: PdfCheckPublicAvailability = {
  state: "unknown",
  loading: false,
};

export function PdfCheckPublicOffer({
  availability = unknownAvailability,
}: {
  availability?: PdfCheckPublicAvailability;
}) {
  const { state, loading } = availability;
  return (
    <section
      className="pdf-check-public"
      id="pdf-checks"
      tabIndex={-1}
      aria-labelledby="pdf-check-public-title"
      aria-busy={loading}
    >
      <div>
        <h3 id="pdf-check-public-title">{msg("PDF accessibility checks")}</h3>
        <p className="pdf-check-price">
          <strong>{money(PDF_VALIDATION_PRICE_MINOR, "EUR")}</strong>
          <span>{msg("excluding tax, per PDF and profile")}</span>
        </p>
        <p>{msg("Find barriers in your PDFs before sharing them.")}</p>
        <p>
          {msg(
            "Choose PDF/UA accessibility or PDF/A archiving. Pay only for the check you confirm, with no monthly subscription.",
          )}
        </p>
      </div>
      <div>
        <PdfCheckBenefits />
        <p className="pdf-check-limit">
          {msg(
            "PDFs up to 10 MiB and 100 pages. Each profile is a separate check; the exact price is shown before you confirm.",
          )}
        </p>
        <p className="pdf-check-limit" role="status">
          {state === "available"
            ? msg("Available in your workspace")
            : state === "closed"
              ? msg("PDF checks are currently unavailable")
              : msg(
                  "Service availability is confirmed in your workspace before you purchase a check.",
                )}
        </p>
        <PdfCheckCreditTerms />
        <a className="text-link" href={workspaceEntryHref("/app/pdf-checks")}>
          {msg("Explore PDF checks")}
        </a>
      </div>
    </section>
  );
}

export function PdfCheckFaq({
  availability = unknownAvailability,
}: {
  availability?: PdfCheckPublicAvailability;
}) {
  void availability;
  return (
    <>
      <details>
        <summary>
          {msg("Does European law require accessible PDFs?")}
          <Plus size={19} aria-hidden="true" />
        </summary>
        <p>
          {msg(
            "The European Accessibility Act, Directive (EU) 2019/882, has applied since 28 June 2025 to certain consumer products and services, including e-commerce. Its scope has exceptions, including microenterprises providing services. It does not impose a universal requirement on every PDF.",
          )}
        </p>
        <p>
          {msg(
            "Directive (EU) 2016/2102 also covers public-sector websites and mobile apps. Exact duties depend on the service, document, exceptions and national implementation.",
          )}
        </p>
        <p>
          <a href="https://eur-lex.europa.eu/EN/legal-content/summary/accessibility-of-products-and-services.html">
            {msg("Read the European accessibility summary")}
          </a>
          {" · "}
          <a href="https://eur-lex.europa.eu/legal-content/en/LSU/?uri=CELEX%3A32016L2102">
            {msg("Read the public-sector rules")}
          </a>
        </p>
      </details>
      <details>
        <summary>
          {msg("Does PDF/A or a PDF/UA check prove accessibility?")}
          <Plus size={19} aria-hidden="true" />
        </summary>
        <p>
          {msg(
            "PDF/A is for long-term preservation; PDF/UA concerns accessibility. These are distinct goals. veraPDF checks rules that can be automated, but reading order, meaningful alternatives and the real experience require human review. A passing report does not certify legal compliance.",
          )}
        </p>
        <p>
          <a href="https://docs.verapdf.org/validation/">
            {msg("Read the veraPDF documentation")}
          </a>
        </p>
      </details>
    </>
  );
}
