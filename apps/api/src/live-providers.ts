import { validateProtectedDocument } from "../../../packages/domain/src/protected-documents";
import {
  emailProvider,
  resendIdentity,
  assertResendSender,
} from "./resend-environment";
import { submitResendWithLimits } from "./resend-send-limits";
import { assertFaxDispatchSendable } from "../../../packages/domain/src/live-fax-usage";
import { submitSesWithLimits } from "./ses-send-limits";
import { sesTransportSandbox } from "./ses-environment";
import { z } from "zod";
import {
  validateRecipient,
  LIMITS,
} from "../../../packages/contracts/src/content";
import {
  canonicalJson,
  DomainError,
  sha256,
  validateLiveFaxQuote,
  validateLiveDeliveryQuote,
  type LiveDeliveryIdentities,
  type PostalQuoteResolver,
  type ActorContext,
  type Channel,
  type Dispatch,
  type DocumentRecord,
  type DomainService,
  type ProviderHook,
} from "../../../packages/domain/src/index";
import {
  PingenPostalProvider,
  SesEmailProvider,
  ResendEmailProvider,
  TelnyxFaxProvider,
  type Fetcher,
  type ProviderResult,
} from "../../../packages/providers";
import type { Env } from "./env";
import { PINGEN_PREFLIGHT_VERSION } from "../../../packages/contracts/src/pingen-preflight";
import type { PostalAuthority } from "./postal-authority";

export type LiveProviderEnv = Env & {
  TELNYX_ALLOWED_PREFIXES?: string;
  AWS_SESSION_TOKEN?: string;
  SES_SANDBOX?: string;
  SES_ACCOUNT_ID?: string;
  PINGEN_DEFAULT_COUNTRY?: string;
  PINGEN_SANDBOX?: string;
  PINGEN_UPLOAD_ORIGINS?: string;
};
type Dependencies = {
  fetcher?: Fetcher;
  now?: () => number;
  beforeTransfer?: () => Promise<void>;
  /** Server-created credential closure. Never populated from a tool/request body. */
  transferAuthority?: PostalAuthority;
};
const providerNames = {
  fax: "telnyx",
  email: "ses",
  postal: "pingen",
} as const;
const postalOptionsSchema = z
  .object({
    addressPosition: z.enum(["left", "right"]),
    deliveryProduct: z.enum(["fast", "cheap"]),
    printMode: z.enum(["simplex", "duplex"]),
    printSpectrum: z.enum(["color", "grayscale"]),
  })
  .strict();
type PostalOptions = z.infer<typeof postalOptionsSchema>;
type Draft = {
  id: string;
  organization_id: string;
  document_id: string;
  document_sha256: string;
  sender_id: string;
  sender_address: string;
  provider_id: string | null;
  recipient_json: string;
  expected_address: string;
  options_json: string;
  ceiling_minor: number;
  currency: string;
  status: "preparing" | "prepared" | "unknown";
  provider_status: string | null;
  request_hash: string;
  claimed_dispatch_id: string | null;
};
function blocked(code: string): never {
  throw new DomainError(code, code, 409);
}
function hostedProductionGate(env: LiveProviderEnv): void {
  if (
    !["staging", "production"].includes(env.ENVIRONMENT) ||
    env.MODE !== "production"
  )
    blocked("LIVE_TRANSPORT_DISABLED");
  let url: URL;
  try {
    url = new URL(env.APP_ORIGIN);
  } catch {
    blocked("LIVE_ORIGIN_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    blocked("LIVE_ORIGIN_INVALID");
}
function liveGate(env: LiveProviderEnv, channel?: Channel): void {
  hostedProductionGate(env);
  if (env.LIVE_SENDS_ENABLED !== "true") blocked("LIVE_TRANSPORT_DISABLED");
  if (
    channel === "email" &&
    emailProvider(env) === "resend" &&
    env.RESEND_SENDS_ENABLED !== "true"
  )
    blocked("RESEND_TRANSPORT_DISABLED");
  // Omission preserves the pre-allowlist configuration contract. A configured
  // empty/invalid list authorizes nothing, never an implicit fallback to all.
  const channels =
    env.LIVE_SEND_CHANNELS === undefined
      ? ["fax", "email", "postal"]
      : env.LIVE_SEND_CHANNELS.split(",").map((value) => value.trim());
  if (
    !channels.length ||
    channels.some((value) => !["fax", "email", "postal"].includes(value)) ||
    (channel !== undefined && !channels.includes(channel))
  )
    blocked("LIVE_TRANSPORT_DISABLED");
}
/** Reports the transport switch; per-dispatch qualification remains mandatory. */
export function liveSendingEnabled(
  env: LiveProviderEnv,
  channel?: Channel,
): boolean {
  if (channel === undefined)
    return (["fax", "email", "postal"] as const).some((item) =>
      liveSendingEnabled(env, item),
    );
  try {
    liveGate(env, channel);
    return true;
  } catch {
    return false;
  }
}
function postalPreparationGate(env: LiveProviderEnv): void {
  hostedProductionGate(env);
  if (env.POSTAL_DRAFTS_ENABLED !== "true")
    blocked("POSTAL_DRAFT_TRANSFER_DISABLED");
}
function required(value: string | undefined, code: string): string {
  if (!value || /[\r\n\0]/.test(value)) blocked(code);
  return value;
}
function sandbox(
  value: string | undefined,
  environment: string,
  code: string,
): boolean {
  if (!["true", "false"].includes(value ?? "")) blocked(code);
  if (environment === "production" && value !== "false")
    blocked("PRODUCTION_SANDBOX_FORBIDDEN");
  return value === "true";
}
function pingen(env: LiveProviderEnv, fetcher: Fetcher): PingenPostalProvider {
  return new PingenPostalProvider(
    {
      clientId: required(env.PINGEN_CLIENT_ID, "PINGEN_NOT_CONFIGURED"),
      clientSecret: required(env.PINGEN_CLIENT_SECRET, "PINGEN_NOT_CONFIGURED"),
      organisationId: required(
        env.PINGEN_ORGANIZATION_ID,
        "PINGEN_NOT_CONFIGURED",
      ),
      sandbox: sandbox(
        env.PINGEN_SANDBOX,
        env.ENVIRONMENT,
        "PINGEN_MODE_REQUIRED",
      ),
      uploadOrigins: required(
        env.PINGEN_UPLOAD_ORIGINS,
        "PINGEN_UPLOAD_ORIGINS_REQUIRED",
      )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
    fetcher,
  );
}

async function exactDocument(
  env: LiveProviderEnv,
  organizationId: string,
  documentId: string,
): Promise<{ document: DocumentRecord; bytes: Uint8Array<ArrayBuffer> }> {
  const document = await env.DB.prepare(
    "SELECT * FROM documents WHERE organization_id=? AND id=? AND status='ready'",
  )
    .bind(organizationId, documentId)
    .first<DocumentRecord>();
  if (
    !document ||
    document.size > LIMITS.pdfBytes ||
    document.size < 5 ||
    document.pages < 1
  )
    blocked("DOCUMENT_NOT_READY");
  const scan = await env.DB.prepare(
    "SELECT 1 FROM audit_log WHERE organization_id=? AND action='document.scan_verified' AND resource_id=? LIMIT 1",
  )
    .bind(organizationId, document.sha256)
    .first();
  if (!scan) blocked("VERIFIED_SCAN_REQUIRED");
  const object = await env.DOCUMENTS.get(document.storage_key);
  if (!object || object.size !== document.size)
    blocked("DOCUMENT_INTEGRITY_MISMATCH");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (
    bytes.length !== document.size ||
    (await sha256(bytes)) !== document.sha256
  )
    blocked("DOCUMENT_INTEGRITY_MISMATCH");
  return { document, bytes };
}
function expectedPostalAddress(
  recipient: Record<string, string>,
  defaultCountry?: string,
): string {
  if (!defaultCountry || !/^[A-Z]{2}$/.test(defaultCountry))
    blocked("PINGEN_COUNTRY_NOT_CONFIGURED");
  const lines = [
    recipient.name,
    recipient.line1,
    `${recipient.postalCode} ${recipient.city}`,
  ];
  if (recipient.country !== defaultCountry)
    lines.push(
      (
        { FR: "FRANCE", DE: "GERMANY", LU: "LUXEMBOURG" } as Record<
          string,
          string
        >
      )[recipient.country],
    );
  return lines.join("\n");
}
function postalOptions(options: Record<string, unknown>): PostalOptions {
  const result = postalOptionsSchema.safeParse({
    addressPosition: options.addressPosition,
    deliveryProduct: options.deliveryProduct,
    printMode: options.printMode,
    printSpectrum: options.printSpectrum,
  });
  if (!result.success) blocked("POSTAL_OPTIONS_REQUIRE_APPROVAL");
  return result.data;
}
async function requirePostalReview(
  env: LiveProviderEnv,
  organizationId: string,
  draftId: string,
) {
  const proof = await env.DB.prepare(
    "SELECT 1 FROM valid_postal_draft_reviews WHERE organization_id=? AND provider_draft_id=? AND json_extract(profile_json,'$.accountId')=? AND json_extract(profile_json,'$.defaultCountry')=? AND json_extract(profile_json,'$.environment')=? AND json_extract(profile_json,'$.version')=?",
  )
    .bind(
      organizationId,
      draftId,
      env.PINGEN_ORGANIZATION_ID ?? "",
      env.PINGEN_DEFAULT_COUNTRY ?? "",
      env.PINGEN_SANDBOX === "true" ? "sandbox" : "production",
      PINGEN_PREFLIGHT_VERSION,
    )
    .first();
  if (!proof) blocked("POSTAL_PREFLIGHT_REQUIRED");
}
async function checkActiveDispatch(
  env: LiveProviderEnv,
  input: Dispatch,
  provider: string,
): Promise<Dispatch> {
  if (input.mode !== "production") blocked("LIVE_MODE_MISMATCH");
  const row = await env.DB.prepare(
    `SELECT d.* FROM dispatches d
    JOIN attempts a ON a.id=d.active_attempt_id AND a.dispatch_id=d.id AND a.organization_id=d.organization_id
    JOIN approvals p ON p.organization_id=d.organization_id AND p.dispatch_id=d.id AND p.fingerprint=d.fingerprint
    JOIN reservations r ON r.organization_id=d.organization_id AND r.dispatch_id=d.id AND r.status='reserved' AND r.amount_minor=d.ceiling_minor-COALESCE(json_extract(d.options_json,'$.protectedDocument.hostingFeeMinor'),0)
    JOIN channel_controls c ON c.organization_id=d.organization_id AND c.channel=d.channel AND c.enabled=1
    JOIN senders s ON s.organization_id=d.organization_id AND s.id=d.sender_id AND s.address=d.sender_address AND s.channel=d.channel AND s.status='verified' AND s.mode='production'
    WHERE d.organization_id=? AND d.id=? AND d.status='submitting' AND d.mode='production' AND d.provider=? AND a.provider=? AND a.status='started'`,
  )
    .bind(input.organization_id, input.id, provider, provider)
    .first<Dispatch>();
  if (!row || canonicalJson(row) !== canonicalJson(input))
    blocked("ACTIVE_APPROVED_ATTEMPT_REQUIRED");
  if (
    !Number.isSafeInteger(row.ceiling_minor) ||
    row.ceiling_minor < row.estimated_minor ||
    row.currency !== "EUR"
  )
    blocked("COST_APPROVAL_INVALID");
  return row;
}
async function verifyFrozenContent(
  row: Dispatch,
  document: DocumentRecord | undefined,
  pricingDisclosure: Record<string, unknown> = {},
): Promise<{
  recipient: Record<string, string>;
  options: Record<string, unknown>;
}> {
  const recipient = validateRecipient(
    row.channel,
    JSON.parse(row.recipient_json),
  );
  if (canonicalJson(recipient) !== row.recipient_json)
    blocked("RECIPIENT_NOT_NORMALIZED");
  const options = JSON.parse(row.options_json) as Record<string, unknown>;
  const fingerprint = await sha256(
    canonicalJson({
      channel: row.channel,
      recipient,
      documentId: document?.id ?? null,
      documentSha256: document?.sha256 ?? null,
      senderId: row.sender_id,
      senderAddress: row.sender_address,
      subject: row.subject,
      html: row.html,
      text: row.text,
      options,
      campaignId: row.campaign_id,
      estimatedMinor: row.estimated_minor,
      ceilingMinor: row.ceiling_minor,
      currency: row.currency,
      mode: row.mode,
      ...pricingDisclosure,
      ...(row.quote_fingerprint
        ? { quoteFingerprint: row.quote_fingerprint }
        : {}),
    }),
  );
  if (fingerprint !== row.fingerprint) blocked("APPROVED_CONTENT_MISMATCH");
  return { recipient, options };
}
async function claimAttempt(
  env: LiveProviderEnv,
  dispatch: Dispatch,
  now: number,
): Promise<boolean> {
  const result = await env.DB.prepare(
    "UPDATE attempts SET bridge_claimed_at=? WHERE id=? AND dispatch_id=? AND organization_id=? AND status='started' AND bridge_claimed_at IS NULL",
  )
    .bind(
      new Date(now).toISOString(),
      dispatch.active_attempt_id,
      dispatch.id,
      dispatch.organization_id,
    )
    .run();
  return result.meta.changes === 1;
}
async function grantFaxMedia(
  env: LiveProviderEnv,
  row: Dispatch,
  document: DocumentRecord,
  now: number,
): Promise<{ url: string; expiresAt: string }> {
  const token = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const expiresAt = new Date(now + 45 * 60_000).toISOString();
  await env.DB.prepare(
    "INSERT INTO document_access_grants(token_hash,document_id,dispatch_id,expires_at,created_at,organization_id,provider,attempt_id,document_sha256) VALUES(?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      await sha256(token),
      document.id,
      row.id,
      expiresAt,
      new Date(now).toISOString(),
      row.organization_id,
      "telnyx",
      row.active_attempt_id,
      document.sha256,
    )
    .run();
  return { url: new URL(`/media/${token}`, env.APP_ORIGIN).href, expiresAt };
}

/** Adapts providers to the durable attempt path, preserving qualified quote checks. */
export function createLiveProviderHook(
  env: LiveProviderEnv,
  channel: Channel,
  dependencies: Dependencies = {},
): ProviderHook {
  const provider =
    channel === "email" ? emailProvider(env) : providerNames[channel];
  const fetcher = dependencies.fetcher ?? fetch;
  const clock = dependencies.now ?? Date.now;
  const liveFaxIdentity =
    channel === "fax" && env.TELNYX_ACCOUNT_ID && env.TELNYX_CONNECTION_ID
      ? {
          accountId: env.TELNYX_ACCOUNT_ID,
          connectionId: env.TELNYX_CONNECTION_ID,
          outboundProfileId: env.TELNYX_OUTBOUND_VOICE_PROFILE_ID,
        }
      : undefined;
  const { liveDeliveryIdentity } = createLiveDeliveryQuoteConfig(
    env,
    dependencies,
  );
  return {
    name: provider,
    liveFaxIdentity,
    liveDeliveryIdentity,
    async submit(input) {
      let providerCallStarted = false;
      try {
        if (channel === "fax") await assertFaxDispatchSendable(env.DB, input);
        liveGate(env, channel);
        if (input.channel !== channel) blocked("PROVIDER_CHANNEL_MISMATCH");
        const row = await checkActiveDispatch(env, input, provider);
        const loaded = row.document_id
          ? await exactDocument(env, row.organization_id, row.document_id)
          : undefined;
        if (channel !== "email" && !loaded) blocked("DOCUMENT_REQUIRED");
        // Rebuild public price terms only from the validated immutable quote.
        // They are part of the approved fingerprint, including postal EUR
        // quotes that have no currency conversion.
        let pricingDisclosure: Record<string, unknown> = {};
        if (channel !== "fax") {
          const quote = await validateLiveDeliveryQuote(
            env.DB,
            row,
            liveDeliveryIdentity[channel],
            new Date(clock()).toISOString(),
          );
          if (quote.fiscal_basis === "public_list_price_ex_tax") {
            const quotedInput = JSON.parse(quote.input_json) as Record<
              string,
              unknown
            >;
            pricingDisclosure = {
              pricingBasis: quote.fiscal_basis,
              ...(channel === "email" ? { fx: quotedInput.fx } : {}),
            };
          }
        }
        const { recipient, options } = await verifyFrozenContent(
          row,
          loaded?.document,
          pricingDisclosure,
        );
        if (options.kind === "marketing") blocked("MARKETING_NOT_ENABLED");
        let submit: () => Promise<ProviderResult>;
        if (channel === "fax") {
          if (row.sender_address !== env.TELNYX_FROM)
            blocked("FAX_SENDER_CONFIG_MISMATCH");
          const prefixes = required(
            env.TELNYX_ALLOWED_PREFIXES,
            "FAX_DESTINATIONS_NOT_CONFIGURED",
          )
            .split(",")
            .map((value) => value.trim());
          if (prefixes.some((value) => !["+33", "+352", "+49"].includes(value)))
            blocked("FAX_DESTINATIONS_NOT_CONFIGURED");
          const connector = new TelnyxFaxProvider(
            {
              apiKey: required(env.TELNYX_API_KEY, "TELNYX_NOT_CONFIGURED"),
              connectionId: required(
                env.TELNYX_CONNECTION_ID,
                "TELNYX_NOT_CONFIGURED",
              ),
              from: row.sender_address,
              webhookUrl: new URL("/webhooks/telnyx", env.APP_ORIGIN).href,
              mediaOrigins: [new URL(env.APP_ORIGIN).origin],
              allowedDestinationPrefixes: prefixes,
            },
            fetcher,
          );
          if (!prefixes.some((prefix) => recipient.phone.startsWith(prefix)))
            blocked("FAX_DESTINATION_NOT_ALLOWED");
          submit = async () => {
            const media = await grantFaxMedia(
              env,
              row,
              loaded!.document,
              clock(),
            );
            await validateLiveFaxQuote(
              env.DB,
              row,
              liveFaxIdentity,
              new Date(clock()).toISOString(),
            );
            providerCallStarted = true;
            return connector.submit({
              dispatchId: row.id,
              to: recipient.phone,
              mediaUrl: media.url,
              mediaExpiresAt: media.expiresAt,
              pages: loaded!.document.pages,
              sizeBytes: loaded!.document.size,
            });
          };
        } else if (channel === "email") {
          if (!row.subject || !row.html || !row.text)
            blocked("EMAIL_CONTENT_REQUIRED");
          if (
            await env.DB.prepare(
              "SELECT 1 FROM suppressions WHERE organization_id=? AND email=?",
            )
              .bind(row.organization_id, recipient.email)
              .first()
          )
            blocked("RECIPIENT_SUPPRESSED");
          if (
            options.emailDeliveryMode === "protected_link" &&
            (!row.document_id ||
              !(await validateProtectedDocument(
                env.DB,
                row.organization_id,
                row.document_id,
                options.protectedDocument as import("../../../packages/domain/src/protected-documents").ProtectedDocumentDescriptor,
                new Date(clock()).toISOString(),
              )))
          )
            blocked("PROTECTED_DOCUMENT_UNAVAILABLE");
          if (provider === "resend")
            assertResendSender(env, row.sender_address);
          const connector =
            provider === "resend"
              ? new ResendEmailProvider(
                  {
                    apiKey: required(
                      env.RESEND_API_KEY,
                      "RESEND_NOT_CONFIGURED",
                    ),
                    verifiedDomain: required(
                      env.RESEND_VERIFIED_DOMAIN,
                      "RESEND_NOT_CONFIGURED",
                    ),
                    authorizedSenders: [row.sender_address],
                    sandbox: false,
                  },
                  fetcher,
                )
              : new SesEmailProvider(
                  {
                    accessKeyId: required(
                      env.AWS_ACCESS_KEY_ID,
                      "SES_NOT_CONFIGURED",
                    ),
                    secretAccessKey: required(
                      env.AWS_SECRET_ACCESS_KEY,
                      "SES_NOT_CONFIGURED",
                    ),
                    sessionToken: env.AWS_SESSION_TOKEN,
                    region: required(env.AWS_REGION, "SES_NOT_CONFIGURED"),
                    configurationSet: required(
                      env.SES_CONFIGURATION_SET,
                      "SES_NOT_CONFIGURED",
                    ),
                    authorizedSenders: [row.sender_address],
                    sandbox: sesTransportSandbox(env, recipient.email),
                  },
                  fetcher,
                );
          const email = {
            dispatchId: row.id,
            from: row.sender_address,
            to: recipient.email,
            subject: row.subject,
            html: row.html,
            text: row.text,
            purpose: "transactional" as const,
            ...(typeof options.replyTo === "string"
              ? { replyTo: options.replyTo }
              : {}),
            attachments:
              loaded && options.emailDeliveryMode !== "protected_link"
                ? [
                    {
                      filename: loaded.document.name,
                      contentType: "application/pdf" as const,
                      bytes: loaded.bytes,
                    },
                  ]
                : undefined,
          };
          const errors = connector.validate(email);
          if (errors.length) blocked(errors[0]);
          const send = async (): Promise<ProviderResult> => {
            try {
              await checkActiveDispatch(env, row, provider);
              await validateLiveDeliveryQuote(
                env.DB,
                row,
                liveDeliveryIdentity.email,
                new Date(clock()).toISOString(),
              );
              if (
                options.emailDeliveryMode === "protected_link" &&
                (!row.document_id ||
                  !(await validateProtectedDocument(
                    env.DB,
                    row.organization_id,
                    row.document_id,
                    options.protectedDocument as import("../../../packages/domain/src/protected-documents").ProtectedDocumentDescriptor,
                    new Date(clock()).toISOString(),
                    true,
                  )))
              )
                return {
                  status: "rejected",
                  errorCode: "PROTECTED_DOCUMENT_UNAVAILABLE",
                  retryable: false,
                };
            } catch {
              return { status: "rejected", errorCode: "LIVE_QUOTE_INVALID" };
            }
            providerCallStarted = true;
            return connector.submit(email);
          };
          submit =
            provider === "resend"
              ? () =>
                  submitResendWithLimits(
                    env.DB,
                    {
                      accountId: required(
                        env.RESEND_ACCOUNT_ID,
                        "RESEND_NOT_CONFIGURED",
                      ),
                      organizationId: row.organization_id,
                      dispatchId: row.id,
                      attemptId: row.active_attempt_id!,
                    },
                    send,
                    { now: clock },
                  )
              : () =>
                  submitSesWithLimits(
                    env.DB,
                    {
                      accountId: required(
                        env.SES_ACCOUNT_ID,
                        "SES_ACCOUNT_REQUIRED",
                      ),
                      region: required(env.AWS_REGION, "SES_NOT_CONFIGURED"),
                      sandbox: sesTransportSandbox(env, recipient.email),
                      organizationId: row.organization_id,
                      dispatchId: row.id,
                      attemptId: row.active_attempt_id!,
                    },
                    send,
                    { now: clock },
                  );
        } else {
          const approvedOptions = postalOptions(options);
          const draftId = z
            .string()
            .max(200)
            .safeParse(options.providerDraftId);
          const letterId = z
            .string()
            .max(200)
            .safeParse(options.preparedLetterId);
          if (!draftId.success || !letterId.success)
            blocked("POSTAL_PREPARED_DRAFT_REQUIRED");
          const draft = await env.DB.prepare(
            "SELECT * FROM provider_drafts WHERE organization_id=? AND id=? AND provider='pingen' AND status='prepared'",
          )
            .bind(row.organization_id, draftId.data)
            .first<Draft>();
          const expectedAddress = expectedPostalAddress(
            recipient,
            env.PINGEN_DEFAULT_COUNTRY,
          );
          if (
            !draft ||
            draft.provider_id !== letterId.data ||
            draft.document_id !== loaded!.document.id ||
            draft.document_sha256 !== loaded!.document.sha256 ||
            draft.sender_id !== row.sender_id ||
            draft.sender_address !== row.sender_address ||
            draft.recipient_json !== row.recipient_json ||
            draft.expected_address !== expectedAddress ||
            options.expectedAddress !== expectedAddress ||
            draft.options_json !== canonicalJson(approvedOptions) ||
            draft.ceiling_minor !== row.ceiling_minor ||
            draft.currency !== row.currency
          )
            blocked("POSTAL_DRAFT_APPROVAL_MISMATCH");
          if (draft.claimed_dispatch_id && draft.claimed_dispatch_id !== row.id)
            blocked("POSTAL_DRAFT_ALREADY_USED");
          await requirePostalReview(env, row.organization_id, draft.id);
          const connector = pingen(env, fetcher);
          submit = async () => {
            const claim = await env.DB.prepare(
              "UPDATE provider_drafts SET claimed_dispatch_id=? WHERE organization_id=? AND id=? AND status='prepared' AND (claimed_dispatch_id IS NULL OR claimed_dispatch_id=?)",
            )
              .bind(row.id, row.organization_id, draft.id, row.id)
              .run();
            if (claim.meta.changes !== 1) blocked("POSTAL_DRAFT_ALREADY_USED");
            const quote = await validateLiveDeliveryQuote(
              env.DB,
              row,
              liveDeliveryIdentity.postal,
              new Date(clock()).toISOString(),
            );
            return connector.submit({
              ...approvedOptions,
              beforeSend: async () => {
                await checkActiveDispatch(env, row, provider);
                await requirePostalReview(env, row.organization_id, draft.id);
                await validateLiveDeliveryQuote(
                  env.DB,
                  row,
                  liveDeliveryIdentity.postal,
                  new Date(clock()).toISOString(),
                );
                providerCallStarted = true;
              },
              expectedCost: {
                currency: "EUR",
                minor: quote.supplier_nanoeur / 10_000_000,
              },
              expectedQuoteSha256: quote.evidence_sha256,
              preparedLetterId: draft.provider_id!,
              expectedAddress,
              country: recipient.country as "FR" | "LU" | "DE",
              maxCost: { currency: row.currency, minor: row.ceiling_minor },
              idempotencyKey: row.id,
            });
          };
        }
        if (channel === "fax")
          await validateLiveFaxQuote(
            env.DB,
            row,
            liveFaxIdentity,
            new Date(clock()).toISOString(),
          );
        if (channel !== "fax")
          await validateLiveDeliveryQuote(
            env.DB,
            row,
            liveDeliveryIdentity[channel],
            new Date(clock()).toISOString(),
          );
        if (!(await claimAttempt(env, row, clock())))
          return {
            status: "submission_unknown",
            errorCode: "ATTEMPT_ALREADY_INVOKED",
          };
        return await submit();
      } catch (error) {
        return {
          status: providerCallStarted ? "submission_unknown" : "rejected",
          errorCode:
            error instanceof DomainError
              ? error.code
              : providerCallStarted
                ? "TRANSPORT_OUTCOME_UNKNOWN"
                : "LIVE_PREFLIGHT_FAILED",
        };
      }
    },
  };
}

/** Private dependency injection for trusted quote preparation. Prices never come
 * from the browser or an assistant, and the calculator cannot send a letter. */
export function createLiveDeliveryQuoteConfig(
  env: LiveProviderEnv,
  dependencies: Dependencies = {},
): {
  liveDeliveryIdentity: LiveDeliveryIdentities;
  postalQuote: PostalQuoteResolver;
} {
  const liveDeliveryIdentity: LiveDeliveryIdentities = {
    ...(emailProvider(env) === "resend"
      ? resendIdentity(env)
        ? { email: resendIdentity(env)! }
        : {}
      : env.SES_ACCOUNT_ID &&
          env.AWS_REGION &&
          env.SES_CONFIGURATION_SET &&
          (env.SES_SANDBOX === "true" || env.SES_SANDBOX === "false")
        ? {
            email: {
              accountId: env.SES_ACCOUNT_ID,
              routeId: `${env.AWS_REGION}:${env.SES_CONFIGURATION_SET}:${env.SES_SANDBOX}`,
            },
          }
        : {}),
    ...(env.PINGEN_ORGANIZATION_ID
      ? {
          postal: {
            accountId: env.PINGEN_ORGANIZATION_ID,
            routeId: env.PINGEN_ORGANIZATION_ID,
          },
        }
      : {}),
  };
  return {
    liveDeliveryIdentity,
    postalQuote: async (request) => {
      postalPreparationGate(env);
      if (
        request.identity.accountId !== env.PINGEN_ORGANIZATION_ID ||
        request.identity.routeId !== env.PINGEN_ORGANIZATION_ID
      )
        blocked("POSTAL_ACCOUNT_MISMATCH");
      const draftId = request.options.providerDraftId;
      if (typeof draftId !== "string")
        blocked("POSTAL_PREPARED_DRAFT_REQUIRED");
      const draft = await env.DB.prepare(
        "SELECT * FROM provider_drafts WHERE organization_id=? AND id=? AND provider='pingen' AND status='prepared'",
      )
        .bind(request.organizationId, draftId)
        .first<Draft>();
      const options = postalOptions(request.options),
        expectedAddress = expectedPostalAddress(
          request.recipient,
          env.PINGEN_DEFAULT_COUNTRY,
        );
      if (
        !draft ||
        !draft.provider_id ||
        draft.provider_id !== request.options.preparedLetterId ||
        draft.document_id !== request.documentId ||
        draft.document_sha256 !== request.documentSha256 ||
        draft.sender_id !== request.senderId ||
        draft.recipient_json !== canonicalJson(request.recipient) ||
        draft.expected_address !== expectedAddress ||
        request.options.expectedAddress !== expectedAddress ||
        draft.options_json !== canonicalJson(options) ||
        draft.claimed_dispatch_id
      )
        blocked("POSTAL_DRAFT_APPROVAL_MISMATCH");
      await requirePostalReview(env, request.organizationId, draft.id);
      const priced = await pingen(
        env,
        dependencies.fetcher ?? fetch,
      ).quotePrepared({
        ...options,
        preparedLetterId: draft.provider_id,
        expectedAddress,
        country: request.recipient.country as "FR" | "LU" | "DE",
      });
      await requirePostalReview(env, request.organizationId, draft.id);
      return {
        supplierMinor: priced.amount.minor,
        currency: "EUR",
        providerDraftId: draft.id,
        preparedLetterId: draft.provider_id,
        evidenceSha256: priced.evidenceSha256,
      };
    },
  };
}

/** Opaque capability: private origin route, no cookies or guessed document IDs, no token logging. */
export async function serveProviderMedia(
  env: LiveProviderEnv,
  request: Request,
  token: string,
  dependencies: Pick<Dependencies, "now"> = {},
): Promise<Response> {
  const headers = {
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  };
  const deny = () => new Response("Not found", { status: 404, headers });
  try {
    liveGate(env, "fax");
    if (request.method !== "GET" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      return deny();
    const now = new Date((dependencies.now ?? Date.now)()).toISOString();
    const grant = await env.DB.prepare(
      `SELECT g.organization_id,g.document_id,g.document_sha256 FROM document_access_grants g
      JOIN dispatches d ON d.organization_id=g.organization_id AND d.id=g.dispatch_id AND d.document_id=g.document_id AND d.active_attempt_id=g.attempt_id AND d.provider=g.provider
      JOIN attempts a ON a.organization_id=g.organization_id AND a.dispatch_id=d.id AND a.id=g.attempt_id AND a.provider=g.provider
      WHERE g.token_hash=? AND g.expires_at>? AND g.provider='telnyx' AND d.mode='production' AND d.channel='fax'
      AND d.status IN ('submitting','submission_unknown','accepted') AND a.status IN ('started','unknown','accepted')`,
    )
      .bind(await sha256(token), now)
      .first<{
        organization_id: string;
        document_id: string;
        document_sha256: string;
      }>();
    if (!grant) return deny();
    const loaded = await exactDocument(
      env,
      grant.organization_id,
      grant.document_id,
    );
    if (loaded.document.sha256 !== grant.document_sha256) return deny();
    return new Response(loaded.bytes, {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="document.pdf"',
        "Content-Length": String(loaded.bytes.length),
      },
    });
  } catch {
    return deny();
  }
}

export type PreparePostalDraftInput = {
  documentId: string;
  senderId: string;
  recipient: Record<string, unknown>;
  options: PostalOptions;
  ceilingMinor: number;
  idempotencyKey: string;
  preflightId?: string;
};
export async function preparePostalDraft(
  env: LiveProviderEnv,
  domain: DomainService,
  ctx: ActorContext,
  input: PreparePostalDraftInput,
  dependencies: Dependencies = {},
) {
  postalPreparationGate(env);
  await domain.authorizeWrite(ctx);
  const expertAuthority =
    ctx.actor === "mcp" ? dependencies.transferAuthority : undefined;
  if (
    ctx.actor !== "browser" &&
    !(
      ctx.actor === "mcp" &&
      ctx.role === "admin" &&
      expertAuthority?.expert &&
      expertAuthority.context.actor === "mcp" &&
      expertAuthority.context.role === "admin" &&
      expertAuthority.context.organizationId === ctx.organizationId &&
      expertAuthority.context.userId === ctx.userId
    )
  )
    blocked("HUMAN_DOCUMENT_TRANSFER_REQUIRED");
  if (
    !/^[a-zA-Z0-9_.:-]{1,200}$/.test(input.idempotencyKey) ||
    !Number.isSafeInteger(input.ceilingMinor) ||
    input.ceilingMinor < 0
  )
    blocked("POSTAL_DRAFT_INPUT_INVALID");
  if (!dependencies.beforeTransfer || !input.preflightId)
    blocked("POSTAL_PREFLIGHT_REQUIRED");
  const assertConsent = async () => {
    await expertAuthority?.assertCurrent();
    const fence = expertAuthority?.sql();
    const expert = expertAuthority?.expert;
    const consent = await env.DB.prepare(
      `SELECT p.id FROM postal_preflights p JOIN postal_transfer_consents c ON c.organization_id=p.organization_id AND c.preflight_id=p.id AND c.fingerprint=p.request_hash
       WHERE p.organization_id=? AND p.id=? AND p.status='review_required' AND p.transfer_status='preparing' AND p.document_id=? AND p.sender_id=? AND c.user_id=?
       AND ${expert ? `c.consent_kind='expert' AND c.expert_connection_id=? AND c.expert_policy_revision=? AND EXISTS(SELECT 1 FROM active_expert_approval_policies a WHERE a.connection_id=c.expert_connection_id AND a.revision=c.expert_policy_revision AND a.organization_id=p.organization_id AND a.user_id=c.user_id AND p.ceiling_minor<=a.max_per_dispatch_minor AND EXISTS(SELECT 1 FROM json_each(a.channels_json) WHERE value='postal'))` : "c.consent_kind='browser'"}
       AND (${fence?.condition ?? "1=1"})`,
    )
      .bind(
        ctx.organizationId,
        input.preflightId,
        input.documentId,
        input.senderId,
        ctx.userId,
        ...(expert ? [expert.connectionId, expert.policyRevision] : []),
        ...(fence?.values ?? []),
      )
      .first();
    if (!consent) blocked("POSTAL_PREFLIGHT_REQUIRED");
  };
  const beforeTransfer = async () => {
    await assertConsent();
    await dependencies.beforeTransfer!();
    // The profile/document check above may await a provider read. Recheck the
    // delegated credential and grant before any subsequent content transfer.
    if (expertAuthority) await assertConsent();
  };
  await beforeTransfer();
  const recipient = validateRecipient("postal", input.recipient);
  const options = postalOptionsSchema.parse(input.options);
  const expectedAddress = expectedPostalAddress(
    recipient,
    env.PINGEN_DEFAULT_COUNTRY,
  );
  const sender = await env.DB.prepare(
    "SELECT address FROM senders WHERE organization_id=? AND id=? AND channel='postal' AND status='verified' AND mode='production'",
  )
    .bind(ctx.organizationId, input.senderId)
    .first<{ address: string }>();
  if (!sender) blocked("SENDER_NOT_CONFIGURED");
  const loaded = await exactDocument(env, ctx.organizationId, input.documentId);
  const hash = await sha256(
    canonicalJson({
      documentId: loaded.document.id,
      documentSha256: loaded.document.sha256,
      senderId: input.senderId,
      senderAddress: sender.address,
      recipient,
      options,
      ceilingMinor: input.ceilingMinor,
    }),
  );
  const now = () => new Date((dependencies.now ?? Date.now)()).toISOString();
  const providerFetch = dependencies.fetcher ?? fetch;
  const connector = pingen(
    env,
    expertAuthority
      ? async (url, init) => {
          // Includes OAuth and upload-location reads, not just PUT/letter creation.
          await assertConsent();
          return providerFetch(url, init);
        }
      : providerFetch,
  );
  const id = `pd_${crypto.randomUUID()}`;
  const inserted = await env.DB.prepare(
    "INSERT INTO provider_drafts(id,organization_id,document_id,document_sha256,sender_id,sender_address,provider,recipient_json,expected_address,options_json,ceiling_minor,currency,status,request_hash,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,'pingen',?,?,?,?,'EUR','preparing',?,?,?,?) ON CONFLICT(organization_id,idempotency_key) DO NOTHING",
  )
    .bind(
      id,
      ctx.organizationId,
      loaded.document.id,
      loaded.document.sha256,
      input.senderId,
      sender.address,
      canonicalJson(recipient),
      expectedAddress,
      canonicalJson(options),
      input.ceilingMinor,
      hash,
      input.idempotencyKey,
      now(),
      now(),
    )
    .run();
  const row = await env.DB.prepare(
    "SELECT * FROM provider_drafts WHERE organization_id=? AND idempotency_key=?",
  )
    .bind(ctx.organizationId, input.idempotencyKey)
    .first<Draft>();
  if (!row || row.request_hash !== hash) blocked("IDEMPOTENCY_CONFLICT");
  if (inserted.meta.changes !== 1) {
    if (row.status !== "prepared")
      blocked("POSTAL_DRAFT_RECONCILIATION_REQUIRED");
    return {
      providerDraftId: row.id,
      preparedLetterId: row.provider_id!,
      expectedAddress,
      documentSha256: row.document_sha256,
      options,
      ceilingMinor: row.ceiling_minor,
      providerStatus: row.provider_status,
    };
  }
  try {
    const prepared = await connector.prepareDocument({
      bytes: loaded.bytes,
      filename: loaded.document.name,
      addressPosition: options.addressPosition,
      idempotencyKey: id,
      beforeTransfer,
    });
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE provider_drafts SET provider_id=?,provider_status=?,status='prepared',updated_at=? WHERE organization_id=? AND id=? AND status='preparing'",
      ).bind(
        prepared.providerId,
        prepared.providerStatus,
        now(),
        ctx.organizationId,
        id,
      ),
      env.DB.prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        `audit_${crypto.randomUUID()}`,
        ctx.organizationId,
        ctx.userId,
        "postal.document_transferred",
        id,
        canonicalJson({
          documentId: loaded.document.id,
          sha256: loaded.document.sha256,
          provider: "pingen",
          autoSend: false,
        }),
        now(),
      ),
    ]);
    return {
      providerDraftId: id,
      preparedLetterId: prepared.providerId,
      expectedAddress,
      documentSha256: loaded.document.sha256,
      options,
      ceilingMinor: input.ceilingMinor,
      providerStatus: prepared.providerStatus,
    };
  } catch {
    await env.DB.prepare(
      "UPDATE provider_drafts SET status='unknown',updated_at=? WHERE organization_id=? AND id=? AND status='preparing'",
    )
      .bind(now(), ctx.organizationId, id)
      .run();
    blocked("POSTAL_DRAFT_RECONCILIATION_REQUIRED");
  }
}
