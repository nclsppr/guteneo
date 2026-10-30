import { assertFaxDispatchSendable } from "../../../packages/domain/src/live-fax-usage";
import type { DocumentService } from "./documents";
import { customerFaxPricing } from "../../../packages/contracts/src/fax-pricing";
import {
  DomainError,
  type Channel,
  type DomainService,
  type ExpertDispatchAuthority,
  type DocumentRecord,
} from "../../../packages/domain/src/index";
import {
  auth0Issuer,
  hashSecret,
  requireScope,
  type AuthEnv,
  type McpIdentity,
} from "./auth";
import { postalMcpAuthority, type PostalAuthority } from "./postal-authority";

type Policy = {
  connection_id: string;
  revision: number;
  channels_json: string;
  max_per_dispatch_minor: number;
  max_daily_minor: number;
  max_daily_count: number;
  expires_at: string;
  connection_updated_at: string;
};
function denied(
  code = "EXPERT_OPT_IN_REQUIRED",
  message = "Enable expert delegation for this assistant in My account.",
): never {
  throw new DomainError(code, message, 403);
}

/** The browser grants authority; an LLM never manufactures a human-consent flag. */
export async function expertAuthority(identity: McpIdentity, env: AuthEnv) {
  requireScope(identity, "dispatches:send");
  if (identity.context.role !== "admin") denied();
  const base = await postalMcpAuthority(identity, env, "dispatches:send");
  const dev = identity.token.startsWith("gtn_dev_");
  const policy = await env.DB.prepare(
    `SELECT * FROM active_expert_approval_policies WHERE organization_id=? AND user_id=? AND client_id=? ${dev ? "" : "AND issuer=?"}`,
  )
    .bind(
      identity.context.organizationId,
      identity.context.userId,
      identity.clientId,
      ...(dev ? [] : [auth0Issuer(env)]),
    )
    .first<Policy>();
  if (!policy) denied();
  const authority: PostalAuthority = {
    context: base.context,
    sql() {
      const fence = base.sql();
      return {
        condition: `(${fence.condition}) AND EXISTS(SELECT 1 FROM active_expert_approval_policies WHERE connection_id=? AND revision=? AND connection_updated_at=?)`,
        values: [
          ...fence.values,
          policy.connection_id,
          policy.revision,
          policy.connection_updated_at,
        ],
      };
    },
    async assertCurrent() {
      await base.assertCurrent();
      const fence = authority.sql();
      if (
        !(await env.DB.prepare(`SELECT 1 WHERE ${fence.condition}`)
          .bind(...fence.values)
          .first())
      )
        denied(
          "EXPERT_AUTHORITY_CHANGED",
          "The delegation has expired or changed. Check the status before trying again.",
        );
    },
  };
  await authority.assertCurrent();
  return { authority, policy };
}
function allowed(policy: Policy, channel: Channel, ceiling: number) {
  if (!(JSON.parse(policy.channels_json) as string[]).includes(channel))
    denied(
      "EXPERT_CHANNEL_DISABLED",
      "This channel is not authorized by the delegation.",
    );
  if (ceiling > policy.max_per_dispatch_minor)
    denied(
      "EXPERT_LIMIT_EXCEEDED",
      "This dispatch's ceiling exceeds the delegation.",
    );
}
function randomReview() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
/** Server-produced evidence only. No MCP input can supply this proof. */
export type ExpertPageEvidence = {
  document: DocumentRecord;
  connectionId: string;
  policyRevision: number;
  connectionUpdatedAt: string;
  condition: string;
  values: Array<string | number>;
};
export async function reviewExpertDispatch(
  identity: McpIdentity,
  env: AuthEnv,
  domain: DomainService,
  dispatchId: string,
  readDocument?: DocumentService["getReviewContent"],
  pageEvidence?: ExpertPageEvidence,
) {
  requireScope(identity, "dispatches:read");
  requireScope(identity, "documents:read");
  const { dispatch } = await domain.getDispatch(identity.context, dispatchId);
  await assertFaxDispatchSendable(env.DB, dispatch);
  const { authority, policy } = await expertAuthority(identity, env);
  if (dispatch.status !== "prepared")
    throw new DomainError(
      "INVALID_STATE",
      "Check this dispatch's status; do not send it again.",
      409,
    );
  allowed(policy, dispatch.channel, dispatch.ceiling_minor);
  const document = dispatch.document_id
    ? await domain.getDocument(
        identity.context,
        dispatch.document_id,
        dispatchId,
      )
    : null;
  let documentResource:
    { uri: string; mimeType: "application/pdf"; blob: string } | undefined;
  if (document && pageEvidence) {
    if (
      pageEvidence.document.id !== document.id ||
      pageEvidence.document.sha256 !== document.sha256 ||
      pageEvidence.document.size !== document.size ||
      pageEvidence.document.pages !== document.pages ||
      pageEvidence.document.storage_key !== document.storage_key ||
      pageEvidence.connectionId !== policy.connection_id ||
      pageEvidence.policyRevision !== policy.revision ||
      pageEvidence.connectionUpdatedAt !== policy.connection_updated_at
    )
      denied(
        "EXPERT_AUTHORITY_CHANGED",
        "The review has changed. Resume reading the same dispatch from its first page.",
      );
  } else if (document) {
    if (!readDocument)
      throw new DomainError(
        "EXPERT_DOCUMENT_UNAVAILABLE",
        "This connector does not provide the exact PDF for expert review. Human review in Guteneo remains an alternative.",
        409,
      );
    const exact = await readDocument(identity.context, document.id, dispatchId);
    if (
      exact.document.id !== document.id ||
      exact.document.sha256 !== document.sha256 ||
      exact.document.size !== document.size ||
      exact.document.storage_key !== document.storage_key
    )
      throw new DomainError(
        "DOCUMENT_INTEGRITY_ERROR",
        "The PDF has changed: review has stopped. Integrity must be restored before any approval.",
        423,
      );
    // No async I/O after this conversion before the current authority/proof fences.
    let binary = "";
    for (let offset = 0; offset < exact.bytes.length; offset += 8192)
      binary += String.fromCharCode(
        ...exact.bytes.subarray(offset, offset + 8192),
      );
    documentResource = {
      uri: `guteneo-document:///${encodeURIComponent(document.id)}/${document.sha256}.pdf`,
      mimeType: "application/pdf",
      blob: btoa(binary),
    };
  }
  const reviewToken = randomReview();
  const reviewHash = await hashSecret(reviewToken);
  const expiresAt = new Date(
    Math.min(
      Date.now() + 5 * 60_000,
      Date.parse(policy.expires_at),
      identity.expiresAt * 1000,
      dispatch.quote_expires_at
        ? Date.parse(dispatch.quote_expires_at)
        : Infinity,
    ),
  ).toISOString();
  if (expiresAt <= new Date().toISOString())
    denied(
      "EXPERT_REVIEW_EXPIRED",
      "The quote or connection has expired. Check the same dispatch's status before resuming its review.",
    );
  await authority.assertCurrent();
  const fence = authority.sql();
  const documentFence = document
    ? "AND EXISTS(SELECT 1 FROM documents WHERE organization_id=? AND id=? AND sha256=? AND size=? AND pages=? AND storage_key=? AND status='ready') AND (?=1 OR EXISTS(SELECT 1 FROM audit_log WHERE organization_id=? AND action='document.scan_verified' AND resource_id=?))"
    : "";
  const result = await env.DB.prepare(
    `INSERT INTO expert_dispatch_reviews(token_hash,organization_id,dispatch_id,user_id,connection_id,policy_revision,connection_updated_at,fingerprint,ceiling_minor,expires_at,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${fence.condition} AND EXISTS(SELECT 1 FROM dispatches WHERE organization_id=? AND id=? AND fingerprint=? AND status='prepared') ${documentFence} ${pageEvidence ? `AND (${pageEvidence.condition})` : ""}
    ON CONFLICT(organization_id,dispatch_id,connection_id) DO UPDATE SET token_hash=excluded.token_hash,policy_revision=excluded.policy_revision,connection_updated_at=excluded.connection_updated_at,fingerprint=excluded.fingerprint,ceiling_minor=excluded.ceiling_minor,expires_at=excluded.expires_at,created_at=excluded.created_at`,
  )
    .bind(
      reviewHash,
      identity.context.organizationId,
      dispatchId,
      identity.context.userId,
      policy.connection_id,
      policy.revision,
      policy.connection_updated_at,
      dispatch.fingerprint,
      dispatch.ceiling_minor,
      expiresAt,
      new Date().toISOString(),
      ...fence.values,
      identity.context.organizationId,
      dispatchId,
      dispatch.fingerprint,
      ...(document
        ? [
            identity.context.organizationId,
            document.id,
            document.sha256,
            document.size,
            document.pages,
            document.storage_key,
            Number(env.ENVIRONMENT === "local" && env.MODE === "simulation"),
            identity.context.organizationId,
            document.sha256,
          ]
        : []),
      ...(pageEvidence?.values ?? []),
    )
    .run();
  if (result.meta.changes !== 1) denied("EXPERT_AUTHORITY_CHANGED");
  return {
    documentResource,
    authority: "delegated" as const,
    reviewToken,
    expiresAt,
    policyRevision: policy.revision,
    dispatchId,
    fingerprint: dispatch.fingerprint,
    channel: dispatch.channel,
    mode: dispatch.mode,
    document: document
      ? {
          id: document.id,
          name: document.name,
          sha256: document.sha256,
          pages: document.pages,
          status: document.status,
        }
      : null,
    recipient: JSON.parse(dispatch.recipient_json),
    sender: dispatch.sender_address,
    subject: dispatch.subject,
    html: dispatch.html,
    text: dispatch.text,
    options: JSON.parse(dispatch.options_json),
    estimatedMinor: dispatch.estimated_minor,
    ceilingMinor: dispatch.ceiling_minor,
    currency: dispatch.currency,
    quote: {
      fingerprint: dispatch.quote_fingerprint ?? null,
      expiresAt: dispatch.quote_expires_at ?? null,
      customerNanoeur: dispatch.quote_customer_nanoeur ?? null,
      pricingBasis: dispatch.quote_pricing_basis ?? null,
      fx: dispatch.quote_fx
        ? {
            numerator: dispatch.quote_fx.numerator,
            denominator: dispatch.quote_fx.denominator,
            date: dispatch.quote_fx.date,
            source: dispatch.quote_fx.source,
          }
        : null,
    },
    ...(dispatch.faxPricing
      ? { faxPricing: customerFaxPricing(dispatch.faxPricing) }
      : {}),
    approvalUrl: `${env.APP_ORIGIN}/#/app/dispatch/${encodeURIComponent(dispatchId)}`,
    instructions:
      (pageEvidence
        ? "Read every page image returned during this review; extracted text assists reading but does not replace the images. If any page is unreadable or missing in the host, do not approve. Progress and the token attest availability, never model comprehension. "
        : document
          ? "Read the exact embedded PDF resource; if the host cannot open it, do not approve, explain the limitation in the conversation and offer approvalUrl as an alternative without opening the site automatically. A token does not prove that the model read or understood the file. "
          : "Read the exact returned text and HTML; this dispatch contains no PDF. ") +
      "Present the document's name and page count, the recipient, options and cost. Keep technical identifiers and hashes in tool calls unless integrity verification is explicitly requested. For a v3 fax, present faxPricing.display.estimate (range excluding tax and credit euros), followed by the separate ceiling and display.explanation; estimatedMinor is only the rounded upper bound, never a fixed price or charge. Respect host confirmation. The token authorizes only this dispatch under the prior delegation; it does not prove fresh human consent.",
  };
}
export type ExpertAcceptanceInput = {
  dispatchId: string;
  fingerprint: string;
  ceilingMinor: number;
  reviewToken: string;
  idempotencyKey: string;
  recipientRequested?: boolean;
};
export async function acceptExpertDispatch(
  identity: McpIdentity,
  env: AuthEnv,
  domain: DomainService,
  input: ExpertAcceptanceInput,
) {
  const current = (await domain.getDispatch(identity.context, input.dispatchId))
    .dispatch;
  await assertFaxDispatchSendable(env.DB, current);
  const { authority, policy } = await expertAuthority(identity, env);
  const reviewHash = await hashSecret(input.reviewToken);
  const review = await env.DB.prepare(
    "SELECT 1 FROM valid_expert_dispatch_reviews WHERE token_hash=? AND organization_id=? AND user_id=? AND connection_id=? AND dispatch_id=? AND fingerprint=? AND ceiling_minor=?",
  )
    .bind(
      reviewHash,
      identity.context.organizationId,
      identity.context.userId,
      policy.connection_id,
      input.dispatchId,
      input.fingerprint,
      input.ceilingMinor,
    )
    .first();
  if (!review)
    denied(
      "EXPERT_REVIEW_INVALID",
      "The exact review has expired or changed. Check the status, then reread the dispatch.",
    );
  if (current.status === "prepared") {
    const proof: ExpertDispatchAuthority = {
      ...authority.sql(),
      reviewHash,
      connectionId: policy.connection_id,
    };
    await domain.approveExpertDispatch(
      identity.context,
      input.dispatchId,
      input.fingerprint,
      proof,
      { recipientRequested: input.recipientRequested },
    );
  } else {
    // Only the same accepted delegation may retry; never reinterpret a browser/other-client send.
    const accepted = await env.DB.prepare(
      "SELECT 1 FROM expert_approval_acceptances WHERE organization_id=? AND dispatch_id=? AND connection_id=? AND policy_revision=?",
    )
      .bind(
        identity.context.organizationId,
        input.dispatchId,
        policy.connection_id,
        policy.revision,
      )
      .first();
    if (!accepted) denied("EXPERT_REVIEW_INVALID");
  }
  await authority.assertCurrent();
  return domain.confirmDispatch(
    identity.context,
    input.dispatchId,
    input.idempotencyKey,
    { ...authority.sql(), reviewHash, connectionId: policy.connection_id },
  );
}

export async function expertPostalAuthority(
  identity: McpIdentity,
  env: AuthEnv,
  preflightId: string,
  fingerprint: string,
): Promise<PostalAuthority> {
  requireScope(identity, "documents:write");
  requireScope(identity, "dispatches:prepare");
  const { authority: base, policy } = await expertAuthority(identity, env);
  allowed(policy, "postal", 0);
  const authority: PostalAuthority = {
    context: base.context,
    expert: {
      connectionId: policy.connection_id,
      policyRevision: policy.revision,
    },
    sql() {
      const fence = base.sql();
      return {
        condition: `(${fence.condition}) AND EXISTS(SELECT 1 FROM postal_preflights WHERE organization_id=? AND user_id=? AND id=? AND request_hash=? AND ceiling_minor<=? AND expires_at>?)`,
        values: [
          ...fence.values,
          identity.context.organizationId,
          identity.context.userId,
          preflightId,
          fingerprint,
          policy.max_per_dispatch_minor,
          new Date().toISOString(),
        ],
      };
    },
    async assertCurrent() {
      await base.assertCurrent();
      const fence = authority.sql();
      if (
        !(await env.DB.prepare(`SELECT 1 WHERE ${fence.condition}`)
          .bind(...fence.values)
          .first())
      )
        denied("EXPERT_REVIEW_INVALID");
    },
  };
  await authority.assertCurrent();
  return Object.freeze(authority);
}
