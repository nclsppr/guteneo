import { DomainError } from "../../../packages/domain/src/index";

/** Legacy transforms and password links cannot preserve the sensitive source's
 * recipient, strong-session and revocation policy. Any historical reference,
 * including a failed or revoked distribution, keeps this boundary in force. */
export function legacySourceFence(organizationId: string, documentId: string) {
  return {
    condition:
      "NOT EXISTS(SELECT 1 FROM secure_distributions legacy_sensitive_source WHERE legacy_sensitive_source.organization_id=? AND legacy_sensitive_source.source_id=?)",
    values: [organizationId, documentId],
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
      "Ce document sensible doit être consulté et distribué dans son parcours sécurisé.",
      403,
    );
}
