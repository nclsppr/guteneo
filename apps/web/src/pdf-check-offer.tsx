import { ArrowRight, Check, ShieldCheck } from "@phosphor-icons/react";
import { date, isPublicPreview, money, type Session } from "./api";
import {
  Disclosure,
  EmptyState,
  ErrorNotice,
  LoadMore,
  Loading,
  PageHeading,
  RefreshButton,
  useResource,
} from "./components";
import { DataTable, tableTimestamp } from "./data-table";
import type {
  PdfValidationHistory,
  PdfValidationHistoryItem,
} from "../../../packages/contracts/src/pdf-validation";
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
      <PageHeading title={msg("PDF checks")} />
      <PdfCheckAccount key={session.organization.id} />
      <PdfCheckHistory key={`history:${session.organization.id}`} />
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
      <a className="button" href="#/app/documents">
        {msg("Choose a PDF")}
        <ArrowRight size={18} aria-hidden="true" />
      </a>
      <Disclosure label={msg("Conditions and limits")}>
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
        <p className="pdf-check-limit">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            {msg(
              "Automated checks provide technical guidance. They do not replace human review or certify legal compliance.",
            )}
          </span>
        </p>
      </Disclosure>
    </section>
  );
}

function historyStatus(item: PdfValidationHistoryItem) {
  return item.status === "passed"
    ? msg("Technical checks passed")
    : item.status === "failed"
      ? msg("Issues found")
      : item.status === "processing"
        ? msg("Checking…")
        : msg("Check interrupted");
}
function profileName(profile: PdfValidationHistoryItem["profile"]) {
  return profile.startsWith("ua")
    ? `PDF/UA-${profile.slice(2)}`
    : `PDF/A-${profile}`;
}
function PdfCheckHistory() {
  const history = useResource<PdfValidationHistory>(
    "/pdf-validation/history?limit=30",
  );
  return (
    <section
      className="pdf-check-history"
      aria-labelledby="pdf-check-history-title"
    >
      <h2 id="pdf-check-history-title">{msg("Past checks")}</h2>
      <ErrorNotice error={history.error} retry={history.refresh} />
      {history.loading && !history.data ? (
        <Loading shape="table" />
      ) : history.data?.items.length ? (
        <>
          <DataTable
            viewId="pdf-check-history"
            label={msg("Past checks")}
            items={history.data.items}
            getRowKey={(item) => item.id}
            columns={[
              {
                id: "document",
                label: msg("Document"),
                value: (item) => item.documentName,
                render: (item) => (
                  <a
                    className="row-link"
                    href={`#/app/documents?document=${encodeURIComponent(item.documentId)}`}
                  >
                    {item.documentName}
                  </a>
                ),
              },
              {
                id: "profile",
                label: msg("Profile"),
                value: (item) => profileName(item.profile),
              },
              {
                id: "status",
                label: msg("Status"),
                value: historyStatus,
                render: (item) => (
                  <>
                    <span>{historyStatus(item)}</span>
                    {item.evidence === "simulation" && (
                      <small className="sub-label">{msg("Simulation")}</small>
                    )}
                  </>
                ),
              },
              {
                id: "created",
                label: msg("Created"),
                value: (item) => tableTimestamp(item.createdAt),
                render: (item) => date(item.createdAt),
                className: "date-cell",
              },
            ]}
          />
          <LoadMore
            path="/pdf-validation/history?limit=30"
            data={history.data}
            onLoaded={history.setData}
          />
        </>
      ) : (
        !history.error && <EmptyState title={msg("No PDF checks yet")} />
      )}
    </section>
  );
}
