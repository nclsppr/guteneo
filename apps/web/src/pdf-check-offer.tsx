import { ArrowRight, Check, ShieldCheck } from "@phosphor-icons/react";
import { isPublicPreview, money, type Session } from "./api";
import {
  ErrorNotice,
  Loading,
  PageHeading,
  RefreshButton,
  useResource,
} from "./components";
import type { PdfValidationPricing } from "../../../packages/contracts/src/pdf-validation";
import { msg } from "./messages";
import "./pdf-check.css";

export type { PdfValidationPricing };

export function PdfCheckBenefits() {
  return (
    <ul className="pdf-check-benefits">
      {[
        msg("PDF/UA-1 and PDF/UA-2 accessibility checks"),
        msg("PDF/A-1b, 2b, 3b and 4 archival validation"),
        msg("Exportable reports linked to the original PDF fingerprint"),
        msg("Human review guidance for the points automation cannot assess"),
      ].map((text) => (
        <li key={text}>
          <Check size={18} aria-hidden="true" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

export function PdfCheckCreditTerms() {
  return (
    <p className="pdf-check-limit">
      {msg(
        "Each check is paid from your available credit after your confirmation. There is no subscription or automatic renewal. Reading an existing report is free.",
      )}
    </p>
  );
}

export function PdfCheckPage({ session }: { session: Session }) {
  return (
    <>
      <PageHeading
        title={msg("PDF checks")}
        intro={msg(
          "Check a document’s technical accessibility or archival rules, when you need it.",
        )}
      />
      <PdfCheckAccount key={session.organization.id} />
    </>
  );
}

export function PdfCheckAccount() {
  const resource = useResource<PdfValidationPricing>("/pdf-validation/pricing");
  return (
    <>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? <Loading /> : null}
      {resource.data ? (
        <PdfCheckOffer
          pricing={resource.data}
          refresh={resource.refresh}
          loading={resource.loading}
        />
      ) : null}
    </>
  );
}

export function PdfCheckOffer({
  pricing,
  refresh,
  loading = false,
}: {
  pricing: PdfValidationPricing;
  refresh: () => void;
  loading?: boolean;
}) {
  const available = pricing.enabled && !isPublicPreview;
  return (
    <section
      className="pdf-check-offer"
      aria-labelledby="pdf-check-offer-title"
      aria-busy={loading}
    >
      <div className="section-toolbar">
        <h2 id="pdf-check-offer-title">{msg("Pay for the check you need")}</h2>
        <RefreshButton onClick={refresh} disabled={loading} />
      </div>
      <p className="pdf-check-price">
        <strong>{money(pricing.priceMinor, pricing.currency)}</strong>
        <span>{msg("excluding tax, per PDF and profile")}</span>
      </p>
      <p className="status" role="status">
        {available
          ? msg("Available in your workspace")
          : msg("PDF checks are currently unavailable")}
      </p>
      <PdfCheckCreditTerms />
      <p className="pdf-check-limit">
        {msg(
          "A completed technical report is charged even when issues are found. An interrupted check with no usable report is not charged.",
        )}
      </p>
      <PdfCheckBenefits />
      <p className="pdf-check-limit">
        {msg(
          "PDFs up to 10 MiB and 100 pages. Each profile is a separate check; the exact price is shown before you confirm.",
        )}
      </p>
      {pricing.evidence === "simulation" ? (
        <p className="notice info">
          {msg(
            "Simulation workspace: the displayed amounts and checks are fictional.",
          )}
        </p>
      ) : null}
      {pricing.creditAvailableMinor !== null ? (
        <p>
          {msg(
            "Available credit: {0}.",
            money(pricing.creditAvailableMinor, pricing.currency),
          )}
        </p>
      ) : null}
      <p>
        {msg(
          "Open a ready PDF in Documents to choose a profile and confirm one paid check. Only a browser administrator can confirm its payment.",
        )}
      </p>
      <a className="button" href="#/app/documents">
        {msg("Choose a PDF")}
        <ArrowRight size={18} aria-hidden="true" />
      </a>
      <p className="pdf-check-limit">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>
          {msg(
            "Automated checks provide technical guidance. They do not replace human review or certify legal compliance.",
          )}
        </span>
      </p>
    </section>
  );
}
