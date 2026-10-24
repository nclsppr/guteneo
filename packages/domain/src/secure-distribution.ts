import type { SecureDistributionDescriptor } from "../../contracts/src/secure-distribution";

/** Validate the server-prepared snapshot, not arbitrary options supplied by a
 * client. Source bytes, policy, price and render are bound before approval. */
export async function validateSecureDistribution(
  db: D1Database,
  organizationId: string,
  descriptor: SecureDistributionDescriptor,
  recipientEmail: string,
  now: string,
  dispatchId?: string,
) {
  if (!descriptor || typeof descriptor !== "object") return false;
  return Boolean(
    await db
      .prepare(
        `SELECT 1 FROM secure_distributions s JOIN documents d ON d.organization_id=s.organization_id AND d.id=s.source_id
     WHERE s.organization_id=? AND s.id=? AND s.source_id=? AND s.source_sha256=? AND d.sha256=s.source_sha256 AND d.status='ready'
     AND s.manifest_sha256=? AND s.policy_json=? AND s.service_fee_minor=? AND s.price_version=?
     AND s.recipient_address=? AND s.status IN ('prepared','active')
     AND ((s.status='prepared' AND s.prepared_expires_at>?) OR (s.status='active' AND s.expires_at>?))
     AND (? IS NULL OR s.dispatch_id=?)
     AND (SELECT count(*) FROM secure_distribution_pages p WHERE p.organization_id=s.organization_id AND p.distribution_id=s.id)=s.source_pages`,
      )
      .bind(
        organizationId,
        descriptor.distributionId,
        descriptor.sourceId,
        descriptor.sourceSha256,
        descriptor.manifestSha256,
        JSON.stringify(
          Object.fromEntries(
            Object.keys(descriptor.policy)
              .sort()
              .map((key) => [
                key,
                descriptor.policy[key as keyof typeof descriptor.policy],
              ]),
          ),
        ),
        descriptor.serviceFeeMinor,
        descriptor.priceVersion,
        recipientEmail.toLowerCase(),
        now,
        now,
        dispatchId ?? null,
        dispatchId ?? null,
      )
      .first(),
  );
}
