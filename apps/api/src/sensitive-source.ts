import { DomainError } from "../../../packages/domain/src/index";

/** Legacy transforms and password links cannot preserve the sensitive source's
 * recipient, strong-session and revocation policy. Any historical reference,
 * including a failed or revoked distribution, keeps this boundary in force. */
export function legacySourceFence(organizationId: string, documentId: string) {
  return {
    condition:
      "NOT EXISTS(SELECT 1 FROM secure_distributions legacy_sensitive_source WHERE legacy_sensitive_source.organization_id=? AND legacy_sensitive_source.source_id=?) AND NOT EXISTS(SELECT 1 FROM audit_log legacy_secure_copy WHERE legacy_secure_copy.organization_id=? AND legacy_secure_copy.resource_id=? AND legacy_secure_copy.action='document.secure_copy_created')",
    values: [organizationId, documentId, organizationId, documentId],
  };
}

export async function assertLegacySourceAllowed(
  db: D1Database,
  organizationId: string,
  documentId: string,
): Promise<void> {
  const fence = legacySourceFence(organizationId, documentId);
  if (
    !(await db
      .prepare(`SELECT 1 WHERE ${fence.condition}`)
      .bind(...fence.values)
      .first())
  )
    throw new DomainError(
      "SENSITIVE_SOURCE_LEGACY_FORBIDDEN",
      "This sensitive document must be viewed and distributed through its secure workflow.",
      403,
    );
}
