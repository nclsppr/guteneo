export const PROTECTED_HOSTING_FEE_MINOR = 100;
export type ProtectedDocumentDescriptor = {
  hostingId: string;
  expiresAt: string;
  durationDays: 1 | 7 | 30;
  hostingFeeMinor: 0 | 100;
};
export type PreparedProtectedDocument = ProtectedDocumentDescriptor & {
  url: string;
  currency: "EUR";
};

/** Non-secret metadata only. A password never belongs in a dispatch or MCP result. */
export async function validateProtectedDocument(
  db: D1Database,
  organizationId: string,
  documentId: string,
  descriptor: ProtectedDocumentDescriptor,
  now = new Date().toISOString(),
  requireActive = false,
): Promise<boolean> {
  return Boolean(
    await db
      .prepare(
        "SELECT 1 FROM protected_document_hostings h JOIN documents d ON d.organization_id=h.organization_id AND d.id=h.document_id WHERE h.organization_id=? AND h.id=? AND h.document_id=? AND h.document_sha256=d.sha256 AND d.status='ready' AND h.status IN ('draft','active') AND h.expires_at>? AND h.expires_at=? AND h.duration_days=? AND ((h.status='draft' AND ?=100) OR (h.status='active' AND ? IN (0,100))) AND (?=0 OR (h.status='active' AND EXISTS(SELECT 1 FROM protected_hosting_charges c WHERE c.organization_id=h.organization_id AND c.hosting_id=h.id)))",
      )
      .bind(
        organizationId,
        descriptor.hostingId,
        documentId,
        now,
        descriptor.expiresAt,
        descriptor.durationDays,
        descriptor.hostingFeeMinor,
        descriptor.hostingFeeMinor,
        requireActive ? 1 : 0,
      )
      .first(),
  );
}
