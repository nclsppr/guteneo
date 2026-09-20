import { ContentError } from "../../../packages/contracts/src/content";
import {
  POSTAL_ADDRESS_PAGE_VERSION,
  type PostalAddressPageProvenance,
  type PostalAddressPageInput,
} from "../../../packages/contracts/src/postal-address-page";
import { canonicalJson } from "../../../packages/domain/src/index";

export type AddressPageRow = {
  id: string;
  organization_id: string;
  user_id: string;
  idempotency_key: string;
  input_hash: string;
  source_document_id: string;
  source_sha256: string;
  source_pages: number;
  recipient_json: string;
  print_mode: "simplex" | "duplex";
  profile_json: string;
  version: string;
  added_pages: 1 | 2;
  planned_document_id: string;
  artifact_key: string;
  generated_document_id: string | null;
  generated_sha256: string | null;
  generated_size: number | null;
  lease_token: string;
  lease_until: string;
  attempts: number;
  expires_at: string;
  budget_day: string;
  created_at: string;
};
export function addressPageProvenance(
  row: AddressPageRow,
): PostalAddressPageProvenance {
  if (
    !row.generated_document_id ||
    !row.generated_sha256 ||
    row.version !== POSTAL_ADDRESS_PAGE_VERSION
  )
    throw new ContentError(
      "POSTAL_ADDRESS_PAGE_PROCESSING",
      "La page d’adresse est en cours de préparation. Réessayez dans quelques instants avec la même demande.",
      409,
    );
  const profile = JSON.parse(row.profile_json);
  return {
    id: row.id,
    version: POSTAL_ADDRESS_PAGE_VERSION,
    sourceDocumentId: row.source_document_id,
    sourceSha256: row.source_sha256,
    generatedDocumentId: row.generated_document_id,
    generatedSha256: row.generated_sha256,
    addressMode: "generated_address_page",
    recipient: JSON.parse(row.recipient_json),
    printMode: row.print_mode,
    profile: {
      defaultCountry: profile.defaultCountry,
      addressPosition: profile.addressPosition,
      version: profile.version,
    },
    addedPages: row.added_pages,
  };
}
export async function addressPageForDocument(
  db: D1Database,
  organizationId: string,
  documentId: string,
) {
  return db
    .prepare(
      "SELECT * FROM postal_address_pages WHERE organization_id=? AND (generated_document_id=? OR planned_document_id=?) ORDER BY generated_document_id IS NULL LIMIT 1",
    )
    .bind(organizationId, documentId, documentId)
    .first<AddressPageRow>();
}
export async function assertAddressPageBinding(
  db: D1Database,
  input: {
    organizationId: string;
    documentId: string;
    sha256: string;
    recipient: PostalAddressPageInput["recipient"];
    printMode: string;
    profile: unknown;
  },
) {
  const row = await addressPageForDocument(
    db,
    input.organizationId,
    input.documentId,
  );
  if (!row) return;
  const document = await db
    .prepare("SELECT pages FROM documents WHERE organization_id=? AND id=?")
    .bind(input.organizationId, input.documentId)
    .first<{ pages: number }>();
  if (
    document?.pages !== row.source_pages + row.added_pages ||
    row.generated_document_id !== input.documentId ||
    row.generated_sha256 !== input.sha256 ||
    row.version !== POSTAL_ADDRESS_PAGE_VERSION ||
    row.recipient_json !== canonicalJson(input.recipient) ||
    row.print_mode !== input.printMode ||
    row.profile_json !== canonicalJson(input.profile)
  )
    throw new ContentError(
      "POSTAL_ADDRESS_PAGE_BINDING_CHANGED",
      "L’adresse, le mode d’impression ou le profil postal a changé. Recréez la page d’adresse depuis votre PDF d’origine.",
      409,
    );
}
