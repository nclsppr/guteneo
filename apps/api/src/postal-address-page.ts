import {
  ContentError,
  validateRecipient,
} from "../../../packages/contracts/src/content";
import {
  PINGEN_MAX_BYTES,
  pingenLayout,
} from "../../../packages/contracts/src/pingen-preflight";
import {
  POSTAL_ADDRESS_PAGE_VERSION,
  postalAddressPageInputSchema,
  type PostalAddressPageInput,
  type PostalAddressPageResult,
} from "../../../packages/contracts/src/postal-address-page";
import {
  canonicalJson,
  sha256,
  type DomainService,
} from "../../../packages/domain/src/index";
import type { Fetcher as ProviderFetcher } from "../../../packages/providers";
import {
  DocumentService,
  readLimited,
  reserveContentBudget,
} from "./documents";
import { PostalService } from "./postal";
import {
  addressPageForDocument,
  addressPageProvenance,
  type AddressPageRow,
} from "./postal-address-page-binding";
import type { PostalAuthority } from "./postal-authority";
import type { Env } from "./env";

const messages: Record<string, string> = {
  POSTAL_ADDRESS_PAGE_PROCESSING:
    "La page d’adresse est en cours de préparation. Réessayez dans quelques instants avec la même demande.",
  POSTAL_ADDRESS_PAGE_RETRY_EXHAUSTED:
    "La préparation n’a pas pu aboutir. Relancez une nouvelle demande depuis le PDF d’origine.",
  POSTAL_ADDRESS_PAGE_EXPIRED:
    "Cette préparation a expiré. Relancez une nouvelle demande depuis le PDF d’origine.",
  POSTAL_ADDRESS_PAGE_RECURSIVE:
    "Ce PDF contient déjà une page d’adresse créée par Guteneo. Choisissez le PDF d’origine pour en créer une nouvelle.",
  POSTAL_ADDRESS_PAGE_PROFILE_CHANGED:
    "Le profil postal a changé. Relancez une nouvelle préparation depuis le PDF d’origine.",
  POSTAL_ADDRESS_PAGE_SOURCE_UNSUPPORTED:
    "Le PDF d’origine ne convient pas à l’impression postale. Utilisez un PDF A4 sans protection ni contenu interactif.",
  POSTAL_ADDRESS_PAGE_PAGE_LIMIT:
    "Le document final dépasserait 100 pages. Réduisez le PDF d’origine ; la page d’adresse ajoute une page, ou deux en recto verso.",
  POSTAL_ADDRESS_PAGE_PDF_SIZE:
    "Le document final dépasserait la taille autorisée de 8 Mo. Réduisez le PDF d’origine.",
  POSTAL_ADDRESS_PAGE_GLYPH_UNSUPPORTED:
    "L’adresse contient un caractère qui ne peut pas être imprimé. Corrigez ce caractère avant de réessayer.",
  POSTAL_ADDRESS_PAGE_ADDRESS_TOO_LONG:
    "L’adresse est trop longue pour la fenêtre de l’enveloppe. Vérifiez la saisie sans retirer d’information nécessaire. Si elle ne tient pas, utilisez un PDF postal adapté.",
  POSTAL_ADDRESS_PAGE_ADDRESS_INVALID:
    "L’adresse n’est pas compatible avec les règles postales de cette destination. Vérifiez le nom, la rue, le code postal et la ville.",
  POSTAL_ADDRESS_PAGE_RENDER_TIMEOUT:
    "La création du PDF a pris trop de temps. Réessayez la même demande dans quelques instants.",
  POSTAL_ADDRESS_PAGE_RENDER_FAILED:
    "La création du PDF est momentanément indisponible. Réessayez la même demande dans quelques instants.",
  POSTAL_ADDRESS_PAGE_PROOF_INVALID:
    "Le PDF final n’a pas passé les contrôles d’intégrité. Aucun envoi n’a été préparé.",
};
function fail(code: string, status = 409): never {
  throw new ContentError(
    code,
    messages[code] ??
      "Cette préparation de page d’adresse ne peut pas être utilisée.",
    status,
  );
}
const now = () => new Date().toISOString();

/** Explicit document derivation only. Provider access reads the account profile;
 * no upload to Pingen, postal draft, quote, approval or send is performed. */
export class PostalAddressPageService {
  constructor(
    private env: Env,
    private domain: DomainService,
    private dependencies: {
      fetcher?: ProviderFetcher;
      deadlineMs?: number;
    } = {},
  ) {}
  private row(organizationId: string, key: string) {
    return this.env.DB.prepare(
      "SELECT * FROM postal_address_pages WHERE organization_id=? AND idempotency_key=?",
    )
      .bind(organizationId, key)
      .first<AddressPageRow>();
  }
  private async result(
    authority: PostalAuthority,
    row: AddressPageRow,
  ): Promise<PostalAddressPageResult> {
    await authority.assertCurrent();
    const provenance = addressPageProvenance(row);
    const document = await new DocumentService(this.env, this.domain).get(
      authority.context,
      provenance.generatedDocumentId,
    );
    if (
      document.sha256 !== provenance.generatedSha256 ||
      document.status === "purged" ||
      (document.status === "ready" &&
        document.pages !== row.source_pages + row.added_pages)
    )
      fail("POSTAL_ADDRESS_PAGE_PROOF_INVALID");
    await authority.assertCurrent();
    return {
      document: {
        id: document.id,
        name: document.name,
        sha256: document.sha256,
        size: document.size,
        pages: document.pages,
        status: document.status,
        source: document.source,
        created_at: document.created_at,
        analysis: document.analysis,
      },
      provenance,
      canSend: false,
    };
  }
  async generate(
    authority: PostalAuthority,
    raw: PostalAddressPageInput,
    idempotencyKey: string,
  ): Promise<PostalAddressPageResult> {
    await authority.assertCurrent();
    await this.domain.authorizeWrite(authority.context);
    const input = postalAddressPageInputSchema.parse(raw);
    input.recipient = postalAddressPageInputSchema.shape.recipient.parse(
      validateRecipient("postal", input.recipient),
    );
    if (
      !idempotencyKey ||
      idempotencyKey.length > 200 ||
      /[\r\n\0]/.test(idempotencyKey)
    )
      throw new ContentError(
        "INVALID_IDEMPOTENCY_KEY",
        "Une clé de reprise valide est requise.",
        400,
      );
    const org = authority.context.organizationId,
      inputHash = await sha256(canonicalJson(input));
    let row = await this.row(org, idempotencyKey);
    if (row && row.input_hash !== inputHash)
      throw new ContentError(
        "IDEMPOTENCY_CONFLICT",
        "Cette clé de reprise correspond à une autre préparation.",
        409,
      );
    if (row?.generated_document_id) return this.result(authority, row);
    if (!this.env.DOCUMENT_RENDERER)
      fail("POSTAL_ADDRESS_PAGE_RENDER_FAILED", 503);
    const postal = new PostalService(this.env, this.domain, this.dependencies);
    // Source scope, scan proof and exact bytes are checked again on every unfinished retry.
    await this.domain.getDocument(authority.context, input.documentId);
    if (await addressPageForDocument(this.env.DB, org, input.documentId))
      fail("POSTAL_ADDRESS_PAGE_RECURSIVE");
    const source = await postal.exactDocument(org, input.documentId);
    const profile = await postal.qualifiedProfile(input.addressPosition);
    try {
      pingenLayout({
        defaultCountry: profile.defaultCountry,
        addressPosition: profile.addressPosition,
        country: input.recipient.country,
        printMode: input.printMode,
        printSpectrum: "grayscale",
        deliveryProduct: "cheap",
      });
    } catch {
      fail("POSTAL_ADDRESS_PAGE_ADDRESS_INVALID", 422);
    }
    const addedPages = input.printMode === "duplex" ? 2 : 1;
    if (source.document.pages + addedPages > 100)
      fail("POSTAL_ADDRESS_PAGE_PAGE_LIMIT", 422);
    if (
      row &&
      (row.profile_json !== canonicalJson(profile) ||
        row.source_sha256 !== source.document.sha256)
    )
      fail("POSTAL_ADDRESS_PAGE_PROFILE_CHANGED");
    const leaseToken = crypto.randomUUID(),
      timestamp = now(),
      leaseUntil = new Date(Date.now() + 120_000).toISOString();
    const fence = authority.sql();
    if (!row) {
      const identity = await sha256(canonicalJson({ org, idempotencyKey }));
      const id = `pap_${identity}`,
        planned = `doc_pap_${identity}`;
      try {
        await this.env.DB.prepare(
          `INSERT INTO postal_address_pages(id,organization_id,user_id,idempotency_key,input_hash,source_document_id,source_sha256,source_pages,recipient_json,print_mode,profile_json,version,added_pages,planned_document_id,artifact_key,lease_token,lease_until,attempts,expires_at,budget_day,created_at)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,? WHERE ${fence.condition} AND NOT EXISTS(SELECT 1 FROM postal_address_pages WHERE organization_id=? AND idempotency_key=?)`,
        )
          .bind(
            id,
            org,
            authority.context.userId,
            idempotencyKey,
            inputHash,
            source.document.id,
            source.document.sha256,
            source.document.pages,
            canonicalJson(input.recipient),
            input.printMode,
            canonicalJson(profile),
            POSTAL_ADDRESS_PAGE_VERSION,
            addedPages,
            planned,
            `${org}/postal-address-pages/${id}.pdf`,
            leaseToken,
            leaseUntil,
            new Date(Date.now() + 3600_000).toISOString(),
            timestamp.slice(0, 10),
            timestamp,
            ...fence.values,
            org,
            idempotencyKey,
          )
          .run();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("postal_render_quota_exceeded")
        )
          throw new ContentError(
            "CONTENT_QUOTA_EXCEEDED",
            "La limite quotidienne de création de PDF est atteinte.",
            429,
          );
        throw error;
      }
      row = await this.row(org, idempotencyKey);
      if (!row) {
        await authority.assertCurrent();
        fail("POSTAL_ADDRESS_PAGE_PROCESSING");
      }
      if (row.input_hash !== inputHash)
        throw new ContentError(
          "IDEMPOTENCY_CONFLICT",
          "Cette clé de reprise correspond à une autre préparation.",
          409,
        );
    }
    if (row.generated_document_id) return this.result(authority, row);
    if (row.lease_token !== leaseToken) {
      if (row.expires_at <= timestamp) fail("POSTAL_ADDRESS_PAGE_EXPIRED");
      if (row.lease_until > timestamp) fail("POSTAL_ADDRESS_PAGE_PROCESSING");
      if (row.attempts >= 3) fail("POSTAL_ADDRESS_PAGE_RETRY_EXHAUSTED");
      const claimed = await this.env.DB.prepare(
        `UPDATE postal_address_pages SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE organization_id=? AND id=? AND generated_document_id IS NULL AND lease_until<=? AND expires_at>? AND attempts<3 AND ${fence.condition}`,
      )
        .bind(
          leaseToken,
          leaseUntil,
          org,
          row.id,
          timestamp,
          timestamp,
          ...fence.values,
        )
        .run();
      if (claimed.meta.changes !== 1) {
        await authority.assertCurrent();
        fail("POSTAL_ADDRESS_PAGE_PROCESSING");
      }
      row = {
        ...row,
        lease_token: leaseToken,
        lease_until: leaseUntil,
        attempts: row.attempts + 1,
      };
    }
    const activeRow = row;
    const activeAuthority: PostalAuthority = {
      context: authority.context,
      assertCurrent: async () => {
        await authority.assertCurrent();
        if (
          !(await this.env.DB.prepare(
            "SELECT 1 FROM postal_address_pages p JOIN documents d ON d.organization_id=p.organization_id AND d.id=p.source_document_id WHERE p.organization_id=? AND p.id=? AND p.lease_token=? AND p.lease_until>? AND p.generated_document_id IS NULL AND d.status='ready' AND d.sha256=p.source_sha256",
          )
            .bind(org, activeRow.id, leaseToken, now())
            .first())
        )
          fail("POSTAL_ADDRESS_PAGE_PROCESSING");
      },
      sql: () => {
        const current = authority.sql();
        return {
          condition: `(${current.condition}) AND EXISTS(SELECT 1 FROM postal_address_pages p WHERE p.organization_id=? AND p.id=? AND p.lease_token=? AND p.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND p.generated_document_id IS NULL AND EXISTS(SELECT 1 FROM documents d WHERE d.organization_id=p.organization_id AND d.id=p.source_document_id AND d.status='ready' AND d.sha256=p.source_sha256))`,
          values: [...current.values, org, activeRow.id, leaseToken],
        };
      },
    };
    try {
      await activeAuthority.assertCurrent();
      let artifact = await this.env.DOCUMENTS.get(row.artifact_key);
      if (!artifact) {
        if (row.generated_sha256) fail("POSTAL_ADDRESS_PAGE_PROOF_INVALID");
        if (row.attempts > 1)
          await reserveContentBudget(this.env.DB, org, 0, true);
        const signal = AbortSignal.timeout(
          this.dependencies.deadlineMs ?? 30_000,
        );
        const rendered = await (async () => {
          const operation = (async () => {
            const response = await this.env.DOCUMENT_RENDERER!.fetch(
              new Request("https://documents.internal/postal-address-page", {
                method: "POST",
                redirect: "manual",
                signal,
                headers: {
                  "Content-Type": "application/pdf",
                  "X-Guteneo-Source-Sha256": source.document.sha256,
                  "X-Guteneo-Scan-Sha256": source.document.sha256,
                  "X-Guteneo-Postal-Address-Page": encodeURIComponent(
                    JSON.stringify({
                      recipient: input.recipient,
                      defaultCountry: profile.defaultCountry,
                      addressPosition: profile.addressPosition,
                      printMode: input.printMode,
                    }),
                  ),
                },
                body: source.bytes as Uint8Array<ArrayBuffer>,
              }),
            );
            if (response.status !== 200) {
              let code = "POSTAL_ADDRESS_PAGE_RENDER_FAILED";
              try {
                const body = JSON.parse(
                  new TextDecoder().decode(
                    await readLimited(
                      new Response(response.body),
                      4096,
                      signal,
                    ),
                  ),
                );
                if (
                  typeof body?.error?.code === "string" &&
                  messages[body.error.code]
                )
                  code = body.error.code;
              } catch {
                /* Do not expose renderer details. */
              }
              fail(code, 422);
            }
            const bytes = await readLimited(response, PINGEN_MAX_BYTES, signal),
              hash = await sha256(bytes);
            if (
              response.headers.get("Content-Type")?.split(";")[0] !==
                "application/pdf" ||
              response.headers.get("X-Guteneo-Source-Sha256") !==
                source.document.sha256 ||
              response.headers.get("X-Guteneo-Document-Sha256") !== hash ||
              response.headers.get("X-Guteneo-Document-Pages") !==
                String(source.document.pages + addedPages) ||
              response.headers.get("X-Guteneo-Added-Pages") !==
                String(addedPages) ||
              response.headers.get("X-Guteneo-Postal-Address-Page-Version") !==
                POSTAL_ADDRESS_PAGE_VERSION ||
              hash === source.document.sha256
            )
              fail("POSTAL_ADDRESS_PAGE_PROOF_INVALID");
            return { bytes, hash };
          })();
          let stop: (() => void) | undefined;
          try {
            return await Promise.race([
              operation,
              new Promise<never>((_, reject) => {
                stop = () =>
                  reject(
                    new ContentError(
                      "POSTAL_ADDRESS_PAGE_RENDER_TIMEOUT",
                      messages.POSTAL_ADDRESS_PAGE_RENDER_TIMEOUT,
                      504,
                    ),
                  );
                signal.addEventListener("abort", stop, { once: true });
                if (signal.aborted) stop();
              }),
            ]);
          } finally {
            if (stop) signal.removeEventListener("abort", stop);
          }
        })();
        await activeAuthority.assertCurrent();
        await this.env.DOCUMENTS.put(row.artifact_key, rendered.bytes, {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: "application/pdf" },
          customMetadata: {
            sha256: rendered.hash,
            sourceSha256: row.source_sha256,
            pages: String(row.source_pages + row.added_pages),
            version: row.version,
          },
        });
        artifact = await this.env.DOCUMENTS.get(row.artifact_key);
      }
      if (!artifact) fail("POSTAL_ADDRESS_PAGE_PROOF_INVALID");
      const finalBytes = await readLimited(
          new Response(artifact.body),
          PINGEN_MAX_BYTES,
        ),
        finalHash = await sha256(finalBytes);
      if (
        artifact.customMetadata?.sha256 !== finalHash ||
        artifact.customMetadata.sourceSha256 !== row.source_sha256 ||
        artifact.customMetadata.pages !==
          String(row.source_pages + row.added_pages) ||
        artifact.customMetadata.version !== row.version ||
        (row.generated_sha256 && row.generated_sha256 !== finalHash)
      )
        fail("POSTAL_ADDRESS_PAGE_PROOF_INVALID");
      const activeFence = activeAuthority.sql();
      const saved = await this.env.DB.prepare(
        `UPDATE postal_address_pages SET generated_sha256=?,generated_size=? WHERE organization_id=? AND id=? AND ${activeFence.condition}`,
      )
        .bind(finalHash, finalBytes.length, org, row.id, ...activeFence.values)
        .run();
      if (saved.meta.changes !== 1) {
        await activeAuthority.assertCurrent();
        fail("POSTAL_ADDRESS_PAGE_PROCESSING");
      }
      const document = await new DocumentService(this.env, this.domain).upload(
        authority.context,
        {
          name: `${source.document.name.replace(/\.pdf$/i, "").slice(0, 140)} — adresse.pdf`,
          bytes: finalBytes,
        },
        "render",
        { documentId: row.planned_document_id, authority: activeAuthority },
      );
      if (
        document.sha256 !== finalHash ||
        document.id === source.document.id ||
        (document.status === "ready" &&
          document.pages !== source.document.pages + addedPages)
      )
        fail("POSTAL_ADDRESS_PAGE_PROOF_INVALID");
      const completed = await this.env.DB.prepare(
        `UPDATE postal_address_pages SET generated_document_id=? WHERE organization_id=? AND id=? AND ${activeFence.condition}`,
      )
        .bind(document.id, org, row.id, ...activeFence.values)
        .run();
      if (completed.meta.changes !== 1) {
        await activeAuthority.assertCurrent();
        fail("POSTAL_ADDRESS_PAGE_PROCESSING");
      }
      // A failed cleanup is safely handled by the existing bounded orphan sweep after 24h.
      try {
        await this.env.DOCUMENTS.delete(row.artifact_key);
      } catch {
        /* No final-document deletion. */
      }
      return this.result(authority, {
        ...row,
        generated_document_id: document.id,
        generated_sha256: finalHash,
        generated_size: finalBytes.length,
      });
    } catch (error) {
      await this.env.DB.prepare(
        "UPDATE postal_address_pages SET lease_until=? WHERE organization_id=? AND id=? AND lease_token=? AND generated_document_id IS NULL",
      )
        .bind(now(), org, row.id, leaseToken)
        .run();
      throw error;
    }
  }
}
