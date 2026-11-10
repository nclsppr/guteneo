import { msg } from "./messages";
import { getCustomerPricing } from "./customer-pricing";
import { SavedRecipientPicker } from "./saved-recipient-picker";
import { useCurrentClientView } from "./client-write-recovery";
import { FileInput } from "./file-input";
import type { SupportedLocale } from "../../../packages/contracts/src/locale";
import {
  documentEmailDefaults,
  renderTransactionalEmail,
} from "../../../packages/contracts/src/email-template";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  FileText,
  ShieldCheck,
  Printer,
  EnvelopeSimple,
  Mailbox,
} from "@phosphor-icons/react";
import {
  api,
  EURO_INPUT_PATTERN,
  euroToMinor,
  FAX_INPUT_PATTERN,
  money,
  normalizeFaxNumber,
  isPublicPreview,
  type Channel,
  type Dispatch,
  type DocumentRecord,
  type Page,
  type Sender,
} from "./api";
import { EmailComposer, emailDraftHtml } from "./email-composer";
import {
  SecureSourceCopyNotice,
  secureSourceCopyLabel,
  useSecureSourceCopy,
} from "./secure-source-copy";
import {
  DocumentDeliveryChoice,
  type DocumentEmailMode,
} from "./document-delivery-choice";
import type { SecureDistributionView } from "../../../packages/contracts/src/secure-distribution";
import { t } from "./locale";
import type { PostalReview } from "../../../packages/contracts/src/postal-review";
import {
  PostalAddressChoice,
  PostalAddressPageSummary,
  type PostalAddressMode,
} from "./postal-address-page";
import type { PostalAddressPageResult } from "../../../packages/contracts/src/postal-address-page";
import { PostalSetupPanel } from "./postal-setup-panel";
import { PostalCutoffNotice } from "./postal-cutoff-notice";
import {
  PostalRecipientFields,
  postalDraftUsesAddressBlock,
  postalRecipientFromDraft,
  usePostalDestinationCatalogue,
} from "./postal-recipient-editor";
import {
  EmailPreview,
  ErrorNotice,
  Field,
  go,
  LoadMore,
  PageHeading,
  PdfPreview,
  useAction,
  useResource,
  useRoute,
} from "./components";
import { analysisOf, useDocumentFollowup } from "./document-followup";

export function PrepareDispatch({
  initialDocument,
  simulation,
  workspaceName,
  emailLocale,
  identity,
}: {
  initialDocument: string;
  simulation: boolean;
  workspaceName: string;
  emailLocale: SupportedLocale;
  identity: string;
}) {
  const currentView = useCurrentClientView(identity);
  const documents = useResource<Page<DocumentRecord>>("/documents");
  const initial = useResource<DocumentRecord>(
    initialDocument && !isPublicPreview
      ? `/documents/${encodeURIComponent(initialDocument)}`
      : null,
  );
  const senders = useResource<{ items: Sender[] }>("/senders");
  const action = useAction();
  const route = useRoute();
  const key = useRef(crypto.randomUUID());
  const [validationError, setValidationError] = useState<string>();
  const invalidControl = useRef<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined
  >(undefined);
  const customerPricing = getCustomerPricing();
  const [channel, setChannel] = useState<Channel>(() =>
    ["postal", "email"].includes(
      new URLSearchParams(route.split("?")[1]).get("channel") ?? "",
    )
      ? (new URLSearchParams(route.split("?")[1]).get("channel") as Channel)
      : lastChannel(),
  );
  const [documentId, setDocumentId] = useState(initialDocument);
  const [emailDeliveryMode, setEmailDeliveryMode] = useState<DocumentEmailMode>(
    isPublicPreview ? "attachment" : "my_documents",
  );
  const [retentionDays, setRetentionDays] = useState<7 | 30 | 90 | 365>(7);
  const [allowOriginalDownload, setAllowOriginalDownload] = useState(true);
  const [uploaded, setUploaded] = useState<DocumentRecord>();
  const [copiedDocument, setCopiedDocument] = useState<DocumentRecord>();
  const sourceCopy = useSecureSourceCopy(
    documentId,
    (document) => {
      setCopiedDocument(document);
      setDocumentId(document.id);
      key.current = crypto.randomUUID();
      action.clear();
    },
    channel === "email" && emailDeliveryMode === "my_documents",
    identity,
  );
  const uploadFollowup = useDocumentFollowup(uploaded?.id ?? null);
  const uploadedDocument = uploadFollowup.document ?? uploaded;
  const [senderId, setSenderId] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  // One budget in euros for every channel; the API receives integer cents.
  const [budget, setBudget] = useState("5");
  const ceilingMinor = euroToMinor(budget);
  const [printMode, setPrintMode] = useState<"simplex" | "duplex">("simplex");
  const [printSpectrum, setPrintSpectrum] = useState<"grayscale" | "color">(
    "grayscale",
  );
  const [deliveryProduct, setDeliveryProduct] = useState<"cheap" | "fast">(
    "cheap",
  );
  const [recipient, setRecipient] = useState<Record<string, string>>({
    country: "FR",
  });
  const [postalBlockFormat, setPostalBlockFormat] = useState(false);
  const usesAddressBlock = postalDraftUsesAddressBlock(
    recipient,
    postalBlockFormat,
  );
  const destinations = usePostalDestinationCatalogue(
    channel === "postal" && !simulation,
  );
  const postalCatalogueUnavailable =
    channel === "postal" &&
    !simulation &&
    (destinations.loading || !!destinations.error || !destinations.data);
  const postalDestinationUnavailable =
    channel === "postal" &&
    !simulation &&
    destinations.data?.unavailableCountries.some(
      (country) => country === (recipient.country ?? "FR"),
    );
  const [addressMode, setAddressMode] = useState<PostalAddressMode>("document");
  const [addressPosition, setAddressPosition] = useState<"left" | "right">();
  const requirements = useResource<{
    profile: {
      addressPosition: "left" | "right";
      addressPositions: ("left" | "right")[];
      defaultCountry: string;
    };
  }>(
    channel === "postal" && !simulation
      ? `/postal/requirements?country=${encodeURIComponent(recipient.country ?? "FR")}${usesAddressBlock ? "&addressFormat=address_block" : ""}`
      : null,
  );
  const positions = requirements.data?.profile.addressPositions ?? [];
  const selectedPosition =
    addressPosition && positions.includes(addressPosition)
      ? addressPosition
      : requirements.data?.profile.addressPosition;
  const [generated, setGenerated] = useState<PostalAddressPageResult>();
  const [generationAttempted, setGenerationAttempted] = useState(false);
  const [continueGenerated, setContinueGenerated] = useState(false);
  const generationKey = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const addsAddressPage =
    channel === "postal" &&
    !simulation &&
    addressMode === "generated_address_page";
  const generatedFollowup = useDocumentFollowup(
    addsAddressPage ? (generated?.document.id ?? null) : null,
  );
  const finalDocument = generatedFollowup.document ?? generated?.document;
  const generatedAnalysis = finalDocument
    ? analysisOf(finalDocument)
    : undefined;
  const generatedReady =
    !!finalDocument &&
    finalDocument.status === "ready" &&
    generatedAnalysis?.state === "ready" &&
    !generatedFollowup.issue;
  const candidates = new Map(
    (documents.data?.items ?? []).map((item) => [item.id, item]),
  );
  if (initial.data?.id === initialDocument)
    candidates.set(initial.data.id, initial.data);
  if (uploadedDocument) candidates.set(uploadedDocument.id, uploadedDocument);
  if (copiedDocument) candidates.set(copiedDocument.id, copiedDocument);
  const available = [...candidates.values()].filter(
    (item) => item.status === "ready",
  );
  const documentUnavailable =
    !!documentId && !available.some((item) => item.id === documentId);
  const matchingSenders =
    senders.data?.items.filter((s) => s.channel === channel) ?? [];
  const selectedSender =
    matchingSenders.find((s) => s.id === senderId)?.id ??
    matchingSenders[0]?.id;
  const handlePostalSetupStatus = useCallback(() => {}, []);
  const setAddress = (field: string, value: string) => {
    setRecipient((r) => ({ ...r, [field]: value }));
    key.current = crypto.randomUUID();
  };
  async function importForDispatch(file: File | undefined) {
    if (!file) return;
    const isCurrent = currentView();
    await action.run(async (view) => {
      const form = new FormData();
      form.append("file", file);
      const imported = await view.wait(
        api<DocumentRecord>("/documents", {
          method: "POST",
          body: form,
        }),
        (receipt) => ({
          kind: "saved",
          resourceId: receipt.id,
          route: "/app/documents",
        }),
      );
      if (!isCurrent()) return;
      setUploaded(imported);
      setDocumentId(imported.id);
      documents.refresh();
    });
  }
  async function prepare() {
    if (submitting.current || sourceCopy.pending) return;
    const isCurrent = currentView();
    submitting.current = true;
    try {
      await action.run(async (view) => {
        try {
          if (documentUnavailable)
            throw new Error(
              msg("Check the PDF before preparing the delivery."),
            );
          if (ceilingMinor === null) throw new Error(t.dispatch.ceilingInvalid);
          const target =
            channel === "fax"
              ? { phone: normalizeFaxNumber(recipient.phone ?? "") }
              : channel === "email"
                ? { email: recipient.email ?? "" }
                : postalRecipientFromDraft(recipient, usesAddressBlock);
          if (channel === "postal" && !simulation) {
            if (
              destinations.loading ||
              destinations.error ||
              !destinations.data
            )
              throw new Error(
                msg(
                  "Postal destination availability could not be checked. Try again before preparing the letter.",
                ),
              );
            if (postalDestinationUnavailable)
              throw new Error(
                msg(
                  "Postal delivery to this country is currently unavailable.",
                ),
              );
            if (requirements.loading || requirements.error || !selectedPosition)
              throw new Error(
                msg(
                  "Letter options are not available yet. Try loading them again.",
                ),
              );
            if (addsAddressPage && !generated) {
              setGenerationAttempted(true);
              const result = await view.wait(
                api<PostalAddressPageResult>("/postal/address-pages", {
                  method: "POST",
                  key: generationKey.current,
                  body: {
                    documentId,
                    recipient: target,
                    printMode,
                    addressPosition: selectedPosition,
                  },
                }),
              );
              if (!isCurrent()) return;
              setGenerated(result);
              setContinueGenerated(true);
              return;
            }
            if (addsAddressPage && !generatedReady)
              throw new Error(
                msg(
                  "Wait for the final PDF to be verified before the postal check.",
                ),
              );
            const review = await view.wait(
              api<PostalReview>("/postal/preflights", {
                method: "POST",
                key: key.current,
                body: {
                  documentId: addsAddressPage ? finalDocument!.id : documentId,
                  senderId: selectedSender,
                  recipient: target,
                  options: {
                    printMode,
                    printSpectrum,
                    deliveryProduct,
                    addressPosition: selectedPosition,
                  },
                  ceilingMinor,
                },
              }),
              (receipt) => ({
                kind: "saved",
                resourceId: receipt.id,
                route: `/app/postal/${encodeURIComponent(receipt.id)}`,
              }),
            );
            if (!isCurrent()) return;
            go(`/app/postal/${encodeURIComponent(review.id)}`);
            return;
          }
          if (
            channel === "email" &&
            documentId &&
            emailDeliveryMode === "my_documents"
          ) {
            let distribution: SecureDistributionView;
            try {
              distribution = await view.wait(
                api<SecureDistributionView>("/secure-distributions", {
                  method: "POST",
                  key: key.current,
                  body: {
                    documentId,
                    senderId: selectedSender,
                    recipient: { address: recipient.email },
                    retentionDays,
                    allowOriginalDownload,
                    recipientBinding: "verified_email",
                    ...(subject.trim() ? { subject } : {}),
                    ...(text.trim() ? { message: text } : {}),
                    ...(html.trim() ? { html } : {}),
                    notificationLocale: emailLocale,
                    costCeilingMinor: ceilingMinor,
                  },
                }),
                (receipt) => ({
                  kind: "saved",
                  resourceId: receipt.id,
                  route: `/app/secure-distribution/${encodeURIComponent(receipt.id)}`,
                }),
              );
            } catch (error) {
              view.checkpoint();
              if (!isCurrent()) return;
              if (sourceCopy.offer(error, documentId)) return;
              throw error;
            }
            if (!isCurrent()) return;
            go(
              `/app/secure-distribution/${encodeURIComponent(distribution.id)}`,
            );
            return;
          }
          const dispatch = await view.wait(
            api<Dispatch>("/dispatches", {
              method: "POST",
              key: key.current,
              body: {
                channel,
                recipient: target,
                documentId: documentId || undefined,
                senderId: selectedSender,
                subject:
                  channel === "email" && subject.trim() ? subject : undefined,
                html: channel === "email" && html.trim() ? html : undefined,
                text: channel === "email" && text.trim() ? text : undefined,
                options:
                  channel === "email" && documentId
                    ? { emailDeliveryMode: "attachment" }
                    : undefined,
                ceilingMinor,
              },
            }),
            (receipt) => ({
              kind: "dispatch_prepared",
              resourceId: receipt.id,
              route: `/app/dispatch/${encodeURIComponent(receipt.id)}`,
            }),
          );
          if (!isCurrent()) return;
          go(`/app/dispatch/${dispatch.id}`);
        } finally {
          // Release before useAction publishes pending=false. A verified final
          // PDF may already be ready when that render resumes the same intent.
          submitting.current = false;
        }
      });
    } finally {
      // The action can refuse before invoking its callback on a stale visit.
      submitting.current = false;
    }
  }
  useEffect(() => {
    if (
      !continueGenerated ||
      !addsAddressPage ||
      !generatedReady ||
      action.pending
    )
      return;
    // The user's preparation request continues after the final PDF scan. It
    // still stops at the exact-document review, before any external transfer.
    setContinueGenerated(false);
    void prepare();
    // Runs on these transitions only; `prepare` is this render's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueGenerated, addsAddressPage, generatedReady, action.pending]);
  const changed = () => {
    key.current = crypto.randomUUID();
    generationKey.current = crypto.randomUUID();
    setGenerated(undefined);
    setGenerationAttempted(false);
    setContinueGenerated(false);
    action.clear();
  };
  return (
    <>
      <PageHeading title={t.dispatch.new} />
      <ErrorNotice
        error={
          documents.error ?? initial.error ?? senders.error ?? action.error
        }
      />
      <SecureSourceCopyNotice copy={sourceCopy} />
      {channel === "postal" && !simulation && (
        <ErrorNotice error={requirements.error} retry={requirements.refresh} />
      )}
      {channel === "postal" &&
        !simulation &&
        !senders.loading &&
        !senders.error &&
        !selectedSender && (
          <PostalSetupPanel
            onUpdated={senders.refresh}
            onStatus={handlePostalSetupStatus}
          />
        )}
      <form
        className="prepare-layout"
        noValidate
        // Let the target's controlled onChange capture its new value before
        // clearing an earlier validation error triggers another render.
        onChange={() => {
          invalidControl.current?.removeAttribute("aria-invalid");
          invalidControl.current?.removeAttribute("aria-errormessage");
          invalidControl.current = undefined;
          setValidationError(undefined);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          let invalid:
            | HTMLInputElement
            | HTMLSelectElement
            | HTMLTextAreaElement
            | undefined;
          for (const control of Array.from(event.currentTarget.elements)) {
            if (
              (control instanceof HTMLInputElement ||
                control instanceof HTMLSelectElement ||
                control instanceof HTMLTextAreaElement) &&
              control.willValidate &&
              !control.validity.valid
            ) {
              invalid = control;
              break;
            }
          }
          if (invalid) {
            invalidControl.current?.removeAttribute("aria-invalid");
            invalidControl.current?.removeAttribute("aria-errormessage");
            invalidControl.current = invalid;
            invalid.setAttribute("aria-invalid", "true");
            invalid.setAttribute(
              "aria-errormessage",
              "prepare-validation-error",
            );
            const label = invalid.labels?.[0]?.textContent?.trim();
            const message = invalid.validity.valueMissing
              ? msg("Fill in this field.")
              : invalid instanceof HTMLInputElement && invalid.type === "email"
                ? msg("Enter a valid email address.")
                : invalid.getAttribute("title") || msg("Check this field.");
            setValidationError([label, message].filter(Boolean).join(": "));
            invalid.focus();
            return;
          }
          setValidationError(undefined);
          void prepare();
        }}
        aria-busy={action.pending || sourceCopy.pending}
      >
        <fieldset
          className="prepare-fields"
          disabled={action.pending || sourceCopy.pending}
          onChange={changed}
        >
          <legend className="sr-only">{msg("Delivery preparation")}</legend>
          {validationError && (
            <p
              id="prepare-validation-error"
              className="notice warning"
              role="alert"
            >
              {validationError}
            </p>
          )}
          <fieldset className="channel-selector">
            <legend>{t.channel}</legend>
            {(["fax", "email", "postal"] as const).map((c) => (
              <label key={c}>
                <input
                  type="radio"
                  name="channel"
                  aria-label={t.channels[c]}
                  aria-describedby={`prepare-channel-${c}-price`}
                  value={c}
                  checked={channel === c}
                  onChange={() => {
                    setChannel(c);
                    rememberChannel(c);
                    setSenderId("");
                  }}
                />
                <span>
                  {c === "fax" ? (
                    <Printer size={22} weight="light" aria-hidden="true" />
                  ) : c === "email" ? (
                    <EnvelopeSimple
                      size={22}
                      weight="light"
                      aria-hidden="true"
                    />
                  ) : (
                    <Mailbox size={22} weight="light" aria-hidden="true" />
                  )}
                  {t.channels[c]}
                  <small
                    className="channel-price"
                    id={`prepare-channel-${c}-price`}
                  >
                    {
                      customerPricing.rates.find((rate) => rate.id === c)
                        ?.prices[0]?.amount
                    }{" "}
                    {
                      customerPricing.rates.find((rate) => rate.id === c)
                        ?.prices[0]?.unit
                    }
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          <Field
            label={channel === "email" ? t.dispatch.attachment : t.document}
          >
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              required={channel !== "email"}
            >
              <option value="">
                {channel === "email"
                  ? t.dispatch.none
                  : t.dispatch.chooseDocument}
              </option>
              {initialDocument &&
                !available.some((d) => d.id === initialDocument) && (
                  <option value={initialDocument} disabled>
                    {initial.loading
                      ? msg("Loading PDF…")
                      : msg("PDF needs checking")}
                  </option>
                )}
              {uploadedDocument && uploadedDocument.status !== "ready" && (
                <option value={uploadedDocument.id} disabled>
                  {uploadedDocument.name} · vérification en cours
                </option>
              )}
              {available.map((d) => (
                <option value={d.id} key={d.id}>
                  {secureSourceCopyLabel(d)} · {d.pages} {msg(" pp.")}
                </option>
              ))}
            </select>
          </Field>
          {!isPublicPreview && (
            <Field label={msg("Or import a PDF")}>
              <FileInput
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  void importForDispatch(event.target.files?.[0])
                }
              />
            </Field>
          )}
          {documentUnavailable && !initial.loading && (
            <p
              className="field-hint"
              id="prepare-document-unavailable"
              role="status"
            >
              {uploadedDocument?.id === documentId
                ? msg(analysisOf(uploadedDocument).message)
                : msg(
                    "This PDF must be verified before preparing the delivery.",
                  )}{" "}
              <a
                href={`#/app/documents?document=${encodeURIComponent(documentId)}`}
              >
                {msg("View PDF status")}
              </a>
            </p>
          )}
          <LoadMore
            path="/documents"
            data={documents.data}
            onLoaded={documents.setData}
          />
          {!available.length && channel !== "email" && (
            <p className="field-hint">
              {t.dispatch.noDocument}{" "}
              <a href="#/app/documents">{t.documents.import}</a>
            </p>
          )}
          {channel === "email" && documentId && !documentUnavailable && (
            <DocumentDeliveryChoice
              mode={emailDeliveryMode}
              days={retentionDays}
              allowDownload={allowOriginalDownload}
              onMode={(value) => {
                setEmailDeliveryMode(value);
                changed();
              }}
              onDays={(value) => {
                setRetentionDays(value);
                changed();
              }}
              onDownload={(value) => {
                setAllowOriginalDownload(value);
                changed();
              }}
              preview={isPublicPreview}
            />
          )}
          <Field label={t.dispatch.sender}>
            <select
              value={selectedSender ?? ""}
              onChange={(e) => setSenderId(e.target.value)}
            >
              {matchingSenders.length ? (
                matchingSenders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? s.address ?? s.id}
                  </option>
                ))
              ) : (
                <option value="">
                  {simulation
                    ? t.dispatch.defaultSender
                    : msg("No verified sender for this channel")}
                </option>
              )}
            </select>
          </Field>
          {channel === "email" && !simulation && selectedSender && (
            <p className="field-hint">
              {msg(
                "Sent by Guteneo. Recipient replies arrive at your verified email address.",
              )}
            </p>
          )}
          <div className="form-divider" />
          {!isPublicPreview && (
            <SavedRecipientPicker
              channel={channel}
              onChoose={(saved) => {
                if (saved.channel !== channel) return;
                if (
                  saved.channel === "postal" &&
                  "addressLines" in saved.recipient
                ) {
                  setRecipient({
                    country: saved.recipient.country,
                    addressLines: saved.recipient.addressLines.join("\n"),
                  });
                  setPostalBlockFormat(true);
                } else {
                  setRecipient({ ...saved.recipient } as Record<
                    string,
                    string
                  >);
                  if (saved.channel === "postal") setPostalBlockFormat(false);
                }
                key.current = crypto.randomUUID();
                changed();
              }}
            />
          )}
          {channel === "postal" && !simulation && (
            <PostalAddressChoice
              mode={addressMode}
              onChange={setAddressMode}
              printMode={printMode}
              addressPosition={selectedPosition ?? "left"}
              positions={positions}
              onPositionChange={setAddressPosition}
            />
          )}
          {channel === "fax" ? (
            <Field
              label={t.dispatch.phone}
              hint={msg(
                "International format: + followed by the country code and number (e.g. +352 …), without the national 0. Spaces, dots and dashes are removed during preparation.",
              )}
            >
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                pattern={FAX_INPUT_PATTERN}
                placeholder={t.dispatch.phonePlaceholder}
                value={recipient.phone ?? ""}
                onChange={(e) => setAddress("phone", e.target.value)}
                required
              />
            </Field>
          ) : channel === "email" ? (
            <>
              <Field label={t.dispatch.email}>
                <input
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t.dispatch.emailPlaceholder}
                  value={recipient.email ?? ""}
                  onChange={(e) => setAddress("email", e.target.value)}
                  required
                />
              </Field>
              <Field
                label={
                  documentId ? msg("Subject (optional)") : t.dispatch.subject
                }
              >
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required={!documentId}
                  placeholder={
                    documentId ? msg("Automatic subject") : undefined
                  }
                  maxLength={200}
                />
              </Field>
              <EmailComposer
                text={text}
                html={html}
                onText={setText}
                onHtml={(value) => {
                  setHtml(value);
                  changed();
                }}
                documentEmail={!!documentId}
                textLimit={
                  documentId && emailDeliveryMode === "my_documents"
                    ? 16000
                    : 150000
                }
                documentLink={
                  !!documentId && emailDeliveryMode === "my_documents"
                }
                notificationLocale={emailLocale}
              />
            </>
          ) : (
            <>
              <PostalRecipientFields
                value={recipient}
                onChange={setAddress}
                block={usesAddressBlock}
                onBlockChange={setPostalBlockFormat}
                defaultCountry={requirements.data?.profile.defaultCountry}
                catalogue={destinations.data}
                catalogueLoading={!simulation && destinations.loading}
                catalogueError={!simulation && !!destinations.error}
                onCatalogueRetry={destinations.refresh}
                simulated={simulation}
              />
              {!simulation && (
                <PostalCutoffNotice
                  country={recipient.country}
                  deliveryProduct={deliveryProduct}
                />
              )}
            </>
          )}
          {channel === "postal" && !simulation && (
            <fieldset className="postal-form-options">
              <legend>{msg("Printing and delivery")}</legend>
              <Field label={msg("Printed sides")}>
                <select
                  value={printMode}
                  onChange={(event) =>
                    setPrintMode(event.target.value as "simplex" | "duplex")
                  }
                >
                  <option value="simplex">{msg("Single-sided")}</option>
                  <option value="duplex">{msg("Double-sided")}</option>
                </select>
              </Field>
              <Field label={msg("Colours")}>
                <select
                  value={printSpectrum}
                  onChange={(event) =>
                    setPrintSpectrum(
                      event.target.value as "grayscale" | "color",
                    )
                  }
                >
                  <option value="grayscale">{msg("Black and white")}</option>
                  <option value="color">{msg("Colour")}</option>
                </select>
              </Field>
              <Field
                label={msg("Preferred delivery")}
                hint={msg(
                  "Availability and price will be confirmed by the quote.",
                )}
              >
                <select
                  value={deliveryProduct}
                  onChange={(event) =>
                    setDeliveryProduct(event.target.value as "cheap" | "fast")
                  }
                >
                  <option value="cheap">{msg("Economy")}</option>
                  <option value="fast">{msg("Priority")}</option>
                </select>
              </Field>
              <p className="field-hint">
                {msg(
                  "You will check the document and its address before requesting the delivery price.",
                )}
              </p>
            </fieldset>
          )}
          <details className="prepare-price-indication">
            <summary>
              {msg("Indicative price")}
              {": "}
              {
                customerPricing.rates.find((rate) => rate.id === channel)
                  ?.prices[0]?.amount
              }{" "}
              {
                customerPricing.rates.find((rate) => rate.id === channel)
                  ?.prices[0]?.unit
              }
            </summary>
            {customerPricing.rates
              .filter((rate) => rate.id === channel)
              .map((rate) => (
                <div key={rate.id}>
                  {rate.prices.map((price) => (
                    <p key={price.unit}>
                      <strong>{price.amount}</strong> {price.unit}
                    </p>
                  ))}
                  <p className="field-hint">{rate.supplement}</p>
                </div>
              ))}
            <p className="field-hint">{customerPricing.note}</p>
          </details>
          {channel === "postal" && !simulation ? (
            <details className="postal-budget">
              <summary>
                {msg("Maximum budget: ")}
                {ceilingMinor === null
                  ? msg("to be specified")
                  : money(ceilingMinor)}
              </summary>
              <Field
                label={msg("Maximum budget in euros")}
                hint={msg("The exact price will be shown before sending.")}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  pattern={EURO_INPUT_PATTERN}
                  title={t.dispatch.ceilingFormat}
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  required
                />
              </Field>
            </details>
          ) : (
            <Field label={t.dispatch.ceiling} hint={t.dispatch.ceilingHelp}>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                pattern={EURO_INPUT_PATTERN}
                title={t.dispatch.ceilingFormat}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                required
              />
            </Field>
          )}
          <button
            className="button primary full"
            disabled={
              action.pending ||
              postalCatalogueUnavailable ||
              postalDestinationUnavailable ||
              (channel === "postal" &&
                !simulation &&
                (requirements.loading ||
                  !!requirements.error ||
                  !selectedPosition)) ||
              (addsAddressPage && !!generated && !generatedReady) ||
              documentUnavailable ||
              (channel !== "email" && !documentId) ||
              (!simulation && !selectedSender)
            }
            aria-describedby={
              [
                channel !== "email" && !documentId
                  ? "prepare-document-required"
                  : "",
                documentUnavailable ? "prepare-document-unavailable" : "",
                !simulation && !selectedSender ? "prepare-sender-required" : "",
                addsAddressPage && generated && !generatedReady
                  ? "postal-generated-status"
                  : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          >
            {action.pending
              ? addsAddressPage && !generated
                ? msg("Creating the final PDF…")
                : t.dispatch.preparing
              : addsAddressPage && !generated
                ? generationAttempted
                  ? msg("Retry PDF creation")
                  : msg("Prepare the letter")
                : addsAddressPage && !generatedReady
                  ? msg("Verifying the final PDF…")
                  : channel === "postal" && !simulation
                    ? msg("Prepare the letter")
                    : t.dispatch.prepare}
            <ArrowRight size={18} />
          </button>
          {addsAddressPage &&
            generationAttempted &&
            !generated &&
            !action.pending && (
              <p className="field-hint">
                {msg(
                  "Try again without changing the fields to retrieve the same creation and avoid a duplicate.",
                )}
              </p>
            )}
          {channel !== "email" && !documentId && (
            <p id="prepare-document-required" className="field-hint">
              {msg("Choose a document to prepare this delivery.")}
            </p>
          )}
          {!simulation && !selectedSender && (
            <p id="prepare-sender-required" className="field-hint">
              {channel === "postal"
                ? t.postalSetup.required
                : msg(
                    "A sender must be verified for this channel before preparation.",
                  )}{" "}
              <a href="#/app/senders">
                {channel === "postal"
                  ? t.postalSetup.setupLink
                  : msg("View senders")}
              </a>
              .
            </p>
          )}
        </fieldset>
        <aside className="prepare-preview">
          {addsAddressPage ? (
            generated && finalDocument && generatedAnalysis ? (
              <>
                <div
                  id="postal-generated-status"
                  className="postal-generated-status"
                  role="status"
                  aria-live="polite"
                >
                  <h2>{msg(generatedAnalysis.title)}</h2>
                  <p>{msg(generatedAnalysis.message)}</p>
                  {generatedFollowup.issue && (
                    <p>
                      {generatedFollowup.issue === "network"
                        ? t.documents.followupUnavailable
                        : t.documents.followupPaused}
                    </p>
                  )}
                  {(!generatedReady || generatedFollowup.issue) && (
                    <button
                      className="button small"
                      type="button"
                      onClick={generatedFollowup.refresh}
                      disabled={generatedFollowup.loading}
                    >
                      {msg("Refresh verification")}
                    </button>
                  )}
                  {(generatedAnalysis.state === "retryable" ||
                    generatedAnalysis.state === "blocked") && (
                    <p>
                      <a
                        href={`#/app/documents?document=${encodeURIComponent(finalDocument.id)}`}
                      >
                        {msg("Resume tracking this PDF")}
                      </a>
                    </p>
                  )}
                </div>
                {generatedReady && (
                  <>
                    <PostalAddressPageSummary
                      document={finalDocument}
                      provenance={generated.provenance}
                    />
                    <PdfPreview id={finalDocument.id} />
                  </>
                )}
              </>
            ) : (
              <div className="preview-empty postal-generated-empty">
                <FileText size={54} weight="light" aria-hidden="true" />
                <p>
                  {msg(
                    "Create the PDF with the address page to display the exact preview of the complete letter.",
                  )}
                </p>
              </div>
            )
          ) : channel === "email" && (documentId || text || html) ? (
            <>
              <h2>{t.dispatch.htmlPreview}</h2>
              <EmailPreview
                html={
                  documentId && !html.trim()
                    ? renderTransactionalEmail({
                        text: text.trim()
                          ? text
                          : documentEmailDefaults(
                              workspaceName,
                              emailDeliveryMode,
                              emailLocale,
                            ).text,
                        workspaceName,
                        documentTitle: candidates.get(documentId)?.name,
                        preferencesUrl: "#",
                        locale: emailLocale,
                        ...(emailDeliveryMode === "my_documents"
                          ? { accountDocument: { url: "#", retentionDays } }
                          : {}),
                      })
                    : emailDraftHtml(text, html)
                }
              />
            </>
          ) : documentId && !documentUnavailable ? (
            <PdfPreview id={documentId} />
          ) : (
            <div className="preview-empty">
              <FileText size={54} weight="light" />
              <p>{t.dispatch.chooseDocument}</p>
            </div>
          )}
          <div className="approval-explainer">
            <ShieldCheck size={25} weight="light" />
            <p>{t.dispatch.approvalExplain}</p>
          </div>
        </aside>
      </form>
    </>
  );
}

// The last channel a person chose opens first next time; it names no content.
const LAST_CHANNEL_KEY = "guteneo.prepare.channel";
function lastChannel(): Channel {
  try {
    const stored = window.localStorage.getItem(LAST_CHANNEL_KEY);
    return stored === "email" || stored === "postal" ? stored : "fax";
  } catch {
    return "fax";
  }
}
function rememberChannel(channel: Channel) {
  try {
    window.localStorage.setItem(LAST_CHANNEL_KEY, channel);
  } catch {
    // Storage can be unavailable; the default channel then applies.
  }
}
