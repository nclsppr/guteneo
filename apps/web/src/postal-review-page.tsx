import { msg } from "./messages";
import { t } from "./locale";
import { RolePermissionNotice } from "./role-guide";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowClockwise } from "@phosphor-icons/react";
import { api } from "./api";
import {
  ErrorNotice,
  Loading,
  PageHeading,
  PdfPreview,
  useAction,
  useResource,
} from "./components";
import "./postal-review.css";
import type { PostalReview } from "../../../packages/contracts/src/postal-review";
import site from "../../../packages/contracts/src/public-site.json";
import { PostalAddressPageSummary } from "./postal-address-page";
import { usePostalQuote } from "./postal-quote-followup";
import { PostalCutoffNotice } from "./postal-cutoff-notice";

const getIssueLabels = (): Record<string, string> => ({
  POSTAL_CORNER_CONTENT: msg(
    "Leave the corner reserved for postal processing marks empty.",
  ),
  POSTAL_POSTAGE_CONTENT: msg(
    "An element overlaps the area reserved for postage.",
  ),
  POSTAL_EDGE_CONTENT: msg(
    "Keep content away from the edges: a blank 5 mm margin is required.",
  ),
  POSTAL_ADDRESS_EMPTY: msg(
    "No address was detected in the envelope window.",
  ),
  POSTAL_ADDRESS_LINE_COUNT: msg(
    "Rearrange the address to meet the allowed number of lines.",
  ),
  POSTAL_ADDRESS_LINE_TOO_LONG: msg(
    "Shorten an address line that exceeds the allowed length.",
  ),
  POSTAL_COUNTRY_LINE_REQUIRED: msg(
    "Add the country on the last line of the international address.",
  ),
  POSTAL_CITY_UPPERCASE_REQUIRED: msg(
    "Write the city name in capitals.",
  ),
  POSTAL_POSTCODE_LINE_INVALID: msg(
    "Check the postcode and city line.",
  ),
  POSTAL_ANNOTATIONS_UNSUPPORTED: msg(
    "Remove or flatten annotations before exporting.",
  ),
  POSTAL_ROTATION_UNSUPPORTED: msg(
    "Export portrait pages without rotation.",
  ),
  POSTAL_A4_REQUIRED: msg("Use an A4 portrait page (210 × 297 mm)."),
  POSTAL_PDF_SIZE: msg("The PDF must be no larger than 8 MB."),
  POSTAL_PDF_INVALID: msg(
    "The PDF cannot be read completely. Export a new version.",
  ),
  POSTAL_FONT_NOT_EMBEDDED: msg(
    "Embed all fonts in the PDF when exporting.",
  ),
  POSTAL_FONT_UNSUPPORTED: msg(
    "A font cannot be checked. Export the document again with embedded fonts.",
  ),
  POSTAL_INTERACTIVE_FORM: msg(
    "Flatten form fields before exporting the PDF.",
  ),
  POSTAL_CROP_UNSUPPORTED: msg(
    "The PDF crop hides part of the page. Export the entire A4 page.",
  ),
  POSTAL_ADDRESS_TEXT_CLIPPED: msg(
    "Part of the address extends beyond the envelope window.",
  ),
  POSTAL_ADDRESS_TEXT_OVERLAP: msg(
    "Elements overlap in the address area.",
  ),
  POSTAL_ADDRESS_TEXT_GEOMETRY_REVIEW: msg(
    "The position of the address text requires a visual check.",
  ),
  POSTAL_ADDRESS_MISMATCH: msg(
    "The PDF address does not match the specified recipient.",
  ),
  POSTAL_RENDER_TIMEOUT: msg(
    "Rendering could not be completed within the time limit.",
  ),
  POSTAL_IMAGE_BUDGET: msg(
    "An image in the PDF is too large to check.",
  ),
  POSTAL_OPTIONAL_CONTENT_UNSUPPORTED: msg(
    "Optional layers must be flattened before exporting.",
  ),
});

function statusLabel(review: PostalReview) {
  if (review.transferStatus === "unknown") return msg("Transfer needs checking");
  if (review.transferStatus === "prepared")
    return msg("Calculating the delivery price…");
  if (review.transferStatus === "preparing")
    return msg("Preparing the draft…");
  if (review.status === "processing") return msg("Checking the PDF…");
  if (review.status === "blocked") return msg("The PDF needs correction");
  if (review.status === "failed") return msg("The check did not complete");
  return msg("Check the document and address");
}

export function PostalReviewPage({
  id,
  canApprove = true,
  canPrepare = true,
}: {
  id: string;
  canApprove?: boolean;
  canPrepare?: boolean;
}) {
  const path = `/postal/preflights/${encodeURIComponent(id)}`;
  const resource = useResource<PostalReview>(path);
  const readReview = resource.refresh;
  const action = useAction();
  const [cropFailed, setCropFailed] = useState(false);
  const [cropLoaded, setCropLoaded] = useState(false);
  const [cropAttempt, setCropAttempt] = useState(0);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const refreshBaseline = useRef<{ previous: PostalReview | undefined } | null>(
    null,
  );
  const polls = useRef(0);
  const transferring = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const review = resource.data;
  const quote = usePostalQuote(
    path,
    canPrepare &&
      review?.transferStatus === "prepared" &&
      !needsReconciliation &&
      !resource.loading &&
      !resource.error,
  );
  const processing =
    review?.status === "processing" || review?.transferStatus === "preparing";

  function refreshReview() {
    if (action.pending || resource.loading || quote.pending) return;
    action.clear();
    setNeedsReconciliation(true);
    refreshBaseline.current = { previous: resource.data };
    setCropFailed(false);
    setCropLoaded(false);
    setCropAttempt((attempt) => attempt + 1);
    resource.refresh();
  }
  useEffect(() => {
    if (
      refreshBaseline.current &&
      review &&
      review !== refreshBaseline.current.previous &&
      !resource.loading &&
      !resource.error
    ) {
      refreshBaseline.current = null;
      setNeedsReconciliation(false);
    }
  }, [review, resource.loading, resource.error]);

  useEffect(() => {
    if (
      !processing ||
      resource.loading ||
      resource.error ||
      polls.current >= 12
    )
      return;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      readReview();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [processing, resource.loading, resource.error, readReview]);

  const cropPath = `/api${path}/address.png`;
  // The API returns the canonical absolute URL, including on an alternate host.
  // Accept only this exact endpoint and always load it through our current
  // authenticated origin; never use a response URL as the image's src.
  const trustedCropUrls = [
    cropPath,
    `${window.location.origin}${cropPath}`,
    `${site.origin}${cropPath}`,
  ];
  const hasCrop =
    !cropFailed && trustedCropUrls.includes(review?.address.cropUrl ?? "");
  const canTransfer =
    canApprove &&
    !resource.loading &&
    !resource.error &&
    !needsReconciliation &&
    !!review?.canTransfer &&
    review.status === "review_required" &&
    review.transferStatus === "not_started" &&
    review.checks.complete &&
    review.address.matches &&
    hasCrop &&
    cropLoaded;
  async function transfer(event: FormEvent) {
    event.preventDefault();
    if (!canTransfer || action.pending || transferring.current) return;
    transferring.current = true;
    setNeedsReconciliation(true);
    await action.run(async () => {
      const next = await api<PostalReview>(`${path}/transfer`, {
        method: "POST",
        body: { reviewed: true, consentToTransfer: true },
      });
      resource.setData(next);
      setNeedsReconciliation(false);
      polls.current = 0;
      resultHeading.current?.focus();
    });
    transferring.current = false;
  }

  return (
    <>
      <a className="back-link" href="#/app/dispatches">
        <ArrowLeft size={18} aria-hidden="true" />
        {t.nav.dispatches}
      </a>
      <PageHeading
        title={msg("Check your letter.")}
        intro={msg(
          "Review the PDF and check the address. The exact price will be shown before you approve sending.",
        )}
      />
      {!canApprove && <RolePermissionNotice />}
      <ErrorNotice error={resource.error} retry={refreshReview} />
      <ErrorNotice error={action.error} />
      <ErrorNotice error={quote.error} />
      {!review && resource.loading ? (
        <Loading />
      ) : (
        !resource.error &&
        review && (
          <div className="postal-review">
            <section
              className="postal-review-summary"
              aria-labelledby="postal-review-status"
            >
              <div className="section-toolbar">
                <div>
                  <h2
                    id="postal-review-status"
                    ref={resultHeading}
                    tabIndex={-1}
                  >
                    {statusLabel(review)}
                  </h2>
                </div>
                <button
                  className="button small"
                  type="button"
                  disabled={resource.loading || action.pending || quote.pending}
                  onClick={refreshReview}
                >
                  <ArrowClockwise size={17} aria-hidden="true" />
                  {msg("Refresh")}
                </button>
              </div>
              <p role="status">
                {processing
                  ? msg(
                      "Analysis is in progress. No letter has been sent.",
                    )
                  : msg("This check does not authorise sending.")}
              </p>
              {needsReconciliation && (
                <p className="notice info" role="status">
                  {msg(
                    "Refresh tracking to check the outcome before taking any other action. No transfer will be retried automatically.",
                  )}
                </p>
              )}
              {review.transferStatus === "unknown" && (
                <p className="notice warning" role="alert">
                  {msg(
                    "The transfer outcome is unconfirmed. Do not create another draft: contact the Guteneo team to check this one and avoid a duplicate.",
                  )}
                </p>
              )}
              {review.status === "failed" && (
                <p className="notice warning">
                  {msg(
                    "The document could not be fully checked. No transfer is possible from this review.",
                  )}
                </p>
              )}
              {!!review.checks.issues.length && (
                <ul className="postal-issues">
                  {review.checks.issues.map((issue, index) => (
                    <li key={`${issue.code}-${issue.page ?? 0}-${index}`}>
                      {issue.page ? (
                        <strong>
                          {msg("Page ")}
                          {issue.page} ·{" "}
                        </strong>
                      ) : null}
                      {getIssueLabels()[issue.code] ??
                        msg(
                          "A document check failed. Read the preparation guidelines and correct the PDF.",
                        )}
                      <small className="mono">{issue.code}</small>
                    </li>
                  ))}
                </ul>
              )}
              {canPrepare && ["blocked", "failed"].includes(review.status) && (
                <p>
                  <a className="button" href="#/app/documents">
                    {msg("Import a corrected PDF")}
                  </a>
                </p>
              )}
            </section>

            <div className="postal-review-grid">
              <section
                className="postal-review-document"
                aria-labelledby="postal-document-title"
              >
                <h2 id="postal-document-title">{msg("The PDF to print")}</h2>
                {review.addressPage && (
                  <PostalAddressPageSummary
                    document={review.document}
                    provenance={review.addressPage}
                  />
                )}
                <p className="postal-document-name">{review.document.name}</p>
                <PdfPreview id={review.document.id} />
                <p className="field-hint">
                  {review.checks.complete
                    ? msg(
                        "{0} page(s) checked at {1} dpi. Review every page to check its content.",
                        review.checks.pages.length,
                        review.checks.dpi,
                      )
                    : msg(
                        "Rendering of all pages is not yet confirmed.",
                      )}
                </p>
                <details className="postal-integrity">
                  <summary>{msg("Identify this PDF version")}</summary>
                  <p>
                    {msg("This fingerprint identifies the checked file.")}
                  </p>
                  <code>{review.document.sha256}</code>
                </details>
              </section>
              <section
                className="postal-review-address"
                aria-labelledby="postal-address-title"
              >
                <h2 id="postal-address-title">
                  {msg("The envelope window")}
                </h2>
                <p>
                  {review.addressPage
                    ? msg(
                        "The generated address page positions the recipient on the ",
                      )
                    : msg("The address must be printed in the PDF on the ")}
                  {review.options.addressPosition === "left"
                    ? msg("left")
                    : msg("right")}
                  {review.addressPage
                    ? msg(", at the fixed position of the envelope window.")
                    : msg(". Guteneo does not move it.")}
                </p>
                {hasCrop ? (
                  <figure className="postal-address-crop">
                    <img
                      key={cropAttempt}
                      src={cropPath}
                      alt={msg(
                        "First-page crop showing the address and the area reserved for postage",
                      )}
                      onError={() => setCropFailed(true)}
                      onLoad={() => setCropLoaded(true)}
                    />
                    <figcaption>
                      {msg("Crop of the rendering checked by Guteneo.")}
                    </figcaption>
                  </figure>
                ) : (
                  <p className="notice info">
                    {msg(
                      "The address-area crop is unavailable. Transfer remains blocked until it can be checked.",
                    )}
                  </p>
                )}
                <div className="postal-address-comparison">
                  <div>
                    <h3>{msg("Expected recipient")}</h3>
                    <address>
                      {review.address.expectedLines.map((line, index) => (
                        <span key={index}>{line}</span>
                      ))}
                    </address>
                  </div>
                  <div>
                    <h3>{msg("Text detected in the PDF")}</h3>
                    {review.address.extractedLines.length ? (
                      <p>
                        {review.address.extractedLines.map((line, index) => (
                          <span key={index}>{line}</span>
                        ))}
                      </p>
                    ) : (
                      <p>{msg("No address text recognised.")}</p>
                    )}
                  </div>
                </div>
                <p
                  className={
                    review.address.matches ? "field-hint" : "notice warning"
                  }
                >
                  {review.address.matches
                    ? msg(
                        "The text matches. Also check the image to ensure the address is visible, legible and complete.",
                      )
                    : msg(
                        "The addresses do not match. Correct the PDF or recipient before continuing.",
                      )}
                </p>
                <dl className="postal-print-options">
                  <div>
                    <dt>{msg("Printing")}</dt>
                    <dd>
                      {review.options.printSpectrum === "color"
                        ? msg("Colour")
                        : msg("Black and white")}{" "}
                      ·{" "}
                      {review.options.printMode === "duplex"
                        ? msg("Double-sided")
                        : msg("Single-sided")}
                    </dd>
                  </div>
                  <div>
                    <dt>{msg("Requested delivery")}</dt>
                    <dd>
                      {review.options.deliveryProduct === "fast"
                        ? msg("Priority")
                        : msg("Economy")}
                    </dd>
                  </div>
                </dl>
                <PostalCutoffNotice
                  country={review.recipient.country}
                  deliveryProduct={review.options.deliveryProduct}
                />
              </section>
            </div>

            {canPrepare && review.transferStatus === "prepared" ? (
              <section
                className="postal-consent"
                aria-labelledby="postal-draft-title"
              >
                <h2 id="postal-draft-title">
                  {quote.pending
                    ? msg("Fetching your quote…")
                    : msg("Your letter is awaiting its quote")}
                </h2>
                <p>
                  {quote.paused
                    ? msg(
                        "Analysis is taking longer than expected. You can resume fetching the price.",
                      )
                    : msg(
                        "You will automatically proceed to price approval when analysis is complete. No letter has been sent yet.",
                      )}
                </p>
                <button
                  className="button primary"
                  type="button"
                  disabled={
                    action.pending ||
                    quote.pending ||
                    resource.loading ||
                    !!resource.error ||
                    needsReconciliation
                  }
                  onClick={quote.retry}
                >
                  {quote.pending
                    ? msg("Calculating the quote…")
                    : msg("Resume quote")}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </section>
            ) : (
              canApprove &&
              review.transferStatus === "not_started" && (
                <form
                  className="postal-consent"
                  onSubmit={(event) => void transfer(event)}
                  aria-busy={action.pending}
                >
                  <h2>{msg("Get the delivery price")}</h2>
                  <p>
                    {msg(
                      "By clicking below, you confirm that you have checked every page, the address visible in the window and the return address. You authorise transferring this PDF and its address to our printing provider to prepare the quote.",
                    )}
                  </p>
                  <button
                    className="button primary"
                    disabled={!canTransfer || action.pending}
                    aria-describedby="postal-transfer-help"
                  >
                    {action.pending
                      ? msg("Preparing the draft…")
                      : msg("Confirm the document and get the price")}
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                  <p id="postal-transfer-help" className="field-hint">
                    {canTransfer
                      ? msg(
                          "This action does not send anything. You will decide after reviewing the exact price.",
                        )
                      : msg(
                          "Transfer remains unavailable until the PDF checks and service activation are complete.",
                        )}
                  </p>
                </form>
              )
            )}
          </div>
        )
      )}
    </>
  );
}
