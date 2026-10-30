import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight } from "@phosphor-icons/react";
import {
  api,
  ApiError,
  date,
  isPublicPreview,
  money,
  type DocumentRecord,
} from "./api";
import {
  DateTimezone,
  ErrorNotice,
  Field,
  Loading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import type { PdfValidationPricing } from "./pdf-check-offer";
import { msg, msgIn } from "./messages";
import "./pdf-check.css";
import {
  pdfValidationProfiles,
  type PdfValidationProfile,
  type PdfValidationReport,
} from "../../../packages/contracts/src/pdf-validation";

export const PDF_VALIDATION_PROFILES = pdfValidationProfiles;
export type { PdfValidationProfile, PdfValidationReport };
export const PDF_PROFILE_NAMES: Record<PdfValidationProfile, string> = {
  ua1: "PDF/UA-1",
  ua2: "PDF/UA-2",
  "1b": "PDF/A-1b",
  "2b": "PDF/A-2b",
  "3b": "PDF/A-3b",
  "4": "PDF/A-4",
};
export function pdfManualCheckLabel(
  id: PdfValidationReport["manualChecks"][number]["id"],
) {
  return {
    reading_order: msg("Check reading order with a screen reader"),
    alternative_text: msg("Check that alternative text is meaningful"),
    visual_contrast: msg("Check contrast and readability"),
    keyboard_navigation: msg("Check keyboard navigation and forms"),
  }[id];
}

export function exportPdfValidationReport(report: PdfValidationReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `guteneo-${report.profile}-${report.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PdfValidation({
  document,
  canValidate,
}: {
  document: DocumentRecord;
  canValidate: boolean;
}) {
  const id = useId();
  const pricing = useResource<PdfValidationPricing>("/pdf-validation/pricing");
  // Reports are tenant-scoped history. Reading them never starts a validator.
  const reports = useResource<{ items: PdfValidationReport[] }>(
    isPublicPreview
      ? null
      : `/documents/${encodeURIComponent(document.id)}/validation`,
  );
  const action = useAction();
  const [profile, setProfile] = useState<PdfValidationProfile>("ua1");
  const [result, setResult] = useState<PdfValidationReport>();
  const requestKey = useRef<{
    purchaseKey: string;
    key: string;
  } | null>(null);
  const [consentKey, setConsentKey] = useState<string>();
  const enabled = pricing.data?.enabled === true && !isPublicPreview;
  const ready = document.status === "ready";
  const canPrepare =
    enabled && ready && canValidate && pricing.data?.purchaseAllowed === true;
  const enoughCredit =
    pricing.data?.creditAvailableMinor !== null &&
    pricing.data?.creditAvailableMinor !== undefined &&
    pricing.data.creditAvailableMinor >= pricing.data.priceMinor;
  const purchaseKey = pricing.data
    ? `${document.id}:${document.sha256}:${profile}:${pricing.data.priceMinor}:${pricing.data.currency}:${pricing.data.termsVersion}`
    : "";
  const consent = Boolean(purchaseKey) && consentKey === purchaseKey;
  const canRun = canPrepare && enoughCredit && consent;
  const amount = pricing.data
    ? money(pricing.data.priceMinor, pricing.data.currency)
    : "";
  const items = result
    ? [
        result,
        ...(reports.data?.items ?? []).filter((item) => item.id !== result.id),
      ]
    : (reports.data?.items ?? []);
  async function validate(event: FormEvent) {
    event.preventDefault();
    if (!canRun || !pricing.data || action.pending) return;
    const quote = pricing.data;
    await action.run(async () => {
      if (!requestKey.current || requestKey.current.purchaseKey !== purchaseKey)
        requestKey.current = { purchaseKey, key: crypto.randomUUID() };
      let report: PdfValidationReport;
      try {
        report = await api<PdfValidationReport>(
          `/documents/${encodeURIComponent(document.id)}/validation`,
          {
            method: "POST",
            key: requestKey.current.key,
            body: {
              profile,
              purchase: {
                confirmed: true,
                documentSha256: document.sha256,
                priceMinor: quote.priceMinor,
                currency: quote.currency,
                termsVersion: quote.termsVersion,
              },
            },
          },
        );
      } catch (error) {
        // A known terminal failure may be checked again on an explicit action.
        // Network uncertainty keeps the key so that replay cannot double-run.
        if (error instanceof ApiError && error.code === "PDF_VALIDATION_FAILED")
          requestKey.current = null;
        if (
          error instanceof ApiError &&
          error.code === "PDF_VALIDATION_PRICE_CHANGED"
        ) {
          requestKey.current = null;
          setConsentKey(undefined);
          pricing.refresh();
        }
        throw error;
      }
      requestKey.current = null;
      setResult(report);
      setConsentKey(undefined);
      pricing.refresh();
      reports.refresh();
    });
  }
  return (
    <section
      className="pdf-validation"
      aria-labelledby={`${id}-title`}
      aria-busy={action.pending}
    >
      <div className="section-toolbar">
        <h3 id={`${id}-title`}>{msg("PDF accessibility and archiving")}</h3>
        <RefreshButton
          onClick={() => {
            pricing.refresh();
            reports.refresh();
          }}
          disabled={action.pending || reports.loading}
        />
      </div>
      <p>
        {msg(
          "PDF/UA checks technical accessibility rules. PDF/A checks long-term preservation: a PDF/A is not necessarily accessible.",
        )}
      </p>
      <p>
        {msg(
          "The check uses the original PDF and retains its fingerprint. It does not change the document or automatically fix errors.",
        )}
      </p>
      <ErrorNotice error={pricing.error ?? reports.error ?? action.error} />
      {pricing.loading && !pricing.data && <Loading />}
      {pricing.data ? (
        <p className="pdf-check-unit-price">
          {msg(
            "{0} excluding tax per PDF and profile, deducted from available credit after confirmation.",
            amount,
          )}
        </p>
      ) : null}
      {pricing.data && !enabled ? (
        <p className="notice info">
          {msg(
            "PDF checks are currently unavailable. Existing reports remain readable.",
          )}
        </p>
      ) : null}
      {enabled && !ready ? (
        <p className="notice info">
          {msg(
            "The PDF must first finish its security check before accessibility or archival validation.",
          )}
        </p>
      ) : null}
      {enabled && (!canValidate || !pricing.data?.purchaseAllowed) ? (
        <p>
          {msg(
            "You can read existing reports. Only a browser administrator can confirm a paid check.",
          )}
        </p>
      ) : null}
      {!canPrepare ? (
        <a className="text-link" href="#/app/pdf-checks">
          {msg("Explore PDF checks")}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      ) : null}
      {canPrepare && (
        <form
          onSubmit={(event) => void validate(event)}
          className="pdf-validation-form pdf-check-consent"
        >
          <Field
            label={msg("Validation profile")}
            hint={msg("Choose the standard required for your document.")}
          >
            <select
              value={profile}
              onChange={(event) => {
                setProfile(event.target.value as PdfValidationProfile);
                setConsentKey(undefined);
              }}
              disabled={action.pending}
            >
              {PDF_VALIDATION_PROFILES.map((value) => (
                <option key={value} value={value}>
                  {PDF_PROFILE_NAMES[value]}
                </option>
              ))}
            </select>
          </Field>
          <p>
            {msg(
              "One check of {0} using {1} costs {2} excluding tax.",
              document.name,
              PDF_PROFILE_NAMES[profile],
              amount,
            )}
          </p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={consent}
              disabled={action.pending || pricing.loading || !enoughCredit}
              onChange={(event) =>
                setConsentKey(event.target.checked ? purchaseKey : undefined)
              }
              aria-describedby={`${id}-purchase-help`}
            />
            <span>
              {msg(
                "I confirm this single check at {0} excluding tax, paid from my available credit.",
                amount,
              )}
            </span>
          </label>
          <p id={`${id}-purchase-help`}>
            {msg(
              "No subscription or automatic renewal. Choosing another profile requires a new confirmation.",
            )}
          </p>
          <p>
            {msg(
              "A completed technical report is charged even when issues are found. An interrupted check with no usable report is not charged.",
            )}
          </p>
          {!enoughCredit ? (
            <p className="notice info">
              {msg(
                "Your available credit is insufficient for this check. No check has been started.",
              )}
            </p>
          ) : null}
          {pricing.data?.evidence === "simulation" ? (
            <p className="notice info">
              {msg(
                "Simulation workspace: the displayed amounts and checks are fictional.",
              )}
            </p>
          ) : null}
          <button
            className="button primary"
            disabled={!canRun || action.pending || pricing.loading}
          >
            {action.pending
              ? msgIn("postal-preflight", "Checking…")
              : msg("Pay {0} excluding tax and check this PDF", amount)}
          </button>
          <p id={`${id}-progress`} role="status">
            {action.pending
              ? msg(
                  "The check is running. The result will apply only to this PDF and profile.",
                )
              : msg(
                  "The automated result must be supplemented by human review.",
                )}
          </p>
        </form>
      )}
      {!reports.loading && reports.data && !items.length && (
        <p className="pdf-check-limit">
          {msg("No validation report for this PDF.")}
        </p>
      )}
      <div className="pdf-validation-reports" aria-live="polite">
        {items.map((report) => (
          <PdfReport key={report.id} report={report} document={document} />
        ))}
      </div>
    </section>
  );
}

export function PdfReport({
  report,
  document,
}: {
  report: PdfValidationReport;
  document: Pick<DocumentRecord, "id" | "sha256">;
}) {
  // Never display evidence for a different source as this document's result.
  if (report.documentId !== document.id || report.sha256 !== document.sha256)
    return (
      <p className="notice error" role="alert">
        {msg(
          "This report does not match the displayed document’s fingerprint. Refresh the reports.",
        )}
      </p>
    );
  const passing = report.compliant && report.status === "passed";
  return (
    <article className="pdf-validation-report">
      <div className="section-toolbar">
        <h4>{PDF_PROFILE_NAMES[report.profile]}</h4>
        <span
          className={`status ${passing ? "status-document-ready" : "status-document-blocked"}`}
        >
          {passing
            ? msg("Automated checks passed")
            : msg("Technical issues found")}
        </span>
      </div>
      <p>
        {date(report.createdAt)} · {report.engine.name} {report.engine.version}
      </p>
      <DateTimezone />
      {report.evidence === "simulation" && (
        <p className="notice info">
          {msg("Simulation report: it does not prove PDF compliance.")}
        </p>
      )}
      <dl className="pdf-report-counts">
        <div>
          <dt>{msg("Passed rules")}</dt>
          <dd>{report.passedRules}</dd>
        </div>
        <div>
          <dt>{msg("Failed rules")}</dt>
          <dd>{report.failedRules}</dd>
        </div>
        <div>
          <dt>{msg("Failed checks")}</dt>
          <dd>{report.failedChecks}</dd>
        </div>
      </dl>
      {report.findings.length > 0 && (
        <div
          className="table-scroll"
          role="region"
          aria-label={msg("References for rules to fix")}
          tabIndex={0}
        >
          <table>
            <caption>{msg("References for rules to fix")}</caption>
            <thead>
              <tr>
                <th scope="col">{msg("Specification")}</th>
                <th scope="col">{msg("Clause / test")}</th>
                <th scope="col">{msg("Failed checks")}</th>
              </tr>
            </thead>
            <tbody>
              {report.findings.map((finding, index) => (
                <tr
                  key={`${finding.specification}-${finding.clause}-${finding.testNumber}-${index}`}
                >
                  <td>{finding.specification}</td>
                  <td>
                    {finding.clause} / {finding.testNumber}
                  </td>
                  <td>{finding.failedChecks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report.truncated && (
        <p>
          {msg(
            "The displayed list is limited. The report still shows the total failure count.",
          )}
        </p>
      )}
      <details>
        <summary>{msg("Human review still required")}</summary>
        <p>
          {msg(
            "These points still need manual review. Guteneo does not record a human review attestation here.",
          )}
        </p>
        <ul>
          {report.manualChecks.map((check) => (
            <li key={check.id}>{pdfManualCheckLabel(check.id)}</li>
          ))}
        </ul>
      </details>
      <p className="pdf-check-limit">
        {msg(
          "A passing technical result is neither an accessibility certification nor a guarantee of legal compliance.",
        )}
      </p>
      <p className="pdf-report-hash">
        <span>SHA-256</span>
        <code>{report.sha256}</code>
      </p>
      <button
        className="button small"
        type="button"
        onClick={() => exportPdfValidationReport(report)}
      >
        {msg("Export JSON report")}
        <ArrowDown size={17} aria-hidden="true" />
      </button>
    </article>
  );
}
