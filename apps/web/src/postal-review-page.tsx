import { msg } from "./messages";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowClockwise } from "@phosphor-icons/react";
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
    "Laissez vide le coin réservé aux marques de traitement postal.",
  ),
  POSTAL_POSTAGE_CONTENT: msg(
    "Un élément empiète sur la zone réservée à l’affranchissement.",
  ),
  POSTAL_EDGE_CONTENT: msg(
    "Éloignez le contenu des bords : une marge vide de 5 mm est nécessaire.",
  ),
  POSTAL_ADDRESS_EMPTY: msg(
    "Aucune adresse n’a été détectée dans la fenêtre de l’enveloppe.",
  ),
  POSTAL_ADDRESS_LINE_COUNT: msg(
    "Réorganisez l’adresse pour respecter le nombre de lignes autorisé.",
  ),
  POSTAL_ADDRESS_LINE_TOO_LONG: msg(
    "Raccourcissez une ligne d’adresse qui dépasse la longueur admise.",
  ),
  POSTAL_COUNTRY_LINE_REQUIRED: msg(
    "Ajoutez le pays en dernière ligne de l’adresse internationale.",
  ),
  POSTAL_CITY_UPPERCASE_REQUIRED: msg(
    "Écrivez le nom de la ville en majuscules.",
  ),
  POSTAL_POSTCODE_LINE_INVALID: msg(
    "Vérifiez la ligne du code postal et de la ville.",
  ),
  POSTAL_ANNOTATIONS_UNSUPPORTED: msg(
    "Supprimez ou aplatissez les annotations avant l’export.",
  ),
  POSTAL_ROTATION_UNSUPPORTED: msg(
    "Exportez les pages verticales sans rotation.",
  ),
  POSTAL_A4_REQUIRED: msg("Utilisez une page A4 verticale (210 × 297 mm)."),
  POSTAL_PDF_SIZE: msg("Le PDF doit peser au maximum 8 Mo."),
  POSTAL_PDF_INVALID: msg(
    "Le PDF ne peut pas être lu complètement. Exportez une nouvelle version.",
  ),
  POSTAL_FONT_NOT_EMBEDDED: msg(
    "Intégrez toutes les polices dans le PDF lors de l’export.",
  ),
  POSTAL_FONT_UNSUPPORTED: msg(
    "Une police ne peut pas être contrôlée. Réexportez le document avec des polices intégrées.",
  ),
  POSTAL_INTERACTIVE_FORM: msg(
    "Aplatissez les champs de formulaire avant l’export du PDF.",
  ),
  POSTAL_CROP_UNSUPPORTED: msg(
    "Le cadrage du PDF masque une partie de la page. Exportez la page A4 entière.",
  ),
  POSTAL_ADDRESS_TEXT_CLIPPED: msg(
    "Une partie de l’adresse dépasse la fenêtre de l’enveloppe.",
  ),
  POSTAL_ADDRESS_TEXT_OVERLAP: msg(
    "Des éléments se superposent dans la zone d’adresse.",
  ),
  POSTAL_ADDRESS_TEXT_GEOMETRY_REVIEW: msg(
    "La position du texte de l’adresse demande une vérification visuelle.",
  ),
  POSTAL_ADDRESS_MISMATCH: msg(
    "L’adresse du PDF ne correspond pas au destinataire indiqué.",
  ),
  POSTAL_RENDER_TIMEOUT: msg(
    "Le rendu n’a pas pu être terminé dans le délai prévu.",
  ),
  POSTAL_IMAGE_BUDGET: msg(
    "Une image du PDF est trop grande pour être contrôlée.",
  ),
  POSTAL_OPTIONAL_CONTENT_UNSUPPORTED: msg(
    "Les calques optionnels doivent être aplatis avant l’export.",
  ),
});

function statusLabel(review: PostalReview) {
  if (review.transferStatus === "unknown") return msg("Transfert à vérifier");
  if (review.transferStatus === "prepared")
    return msg("Calcul du prix de l’envoi…");
  if (review.transferStatus === "preparing")
    return msg("Préparation du brouillon…");
  if (review.status === "processing") return msg("Vérification du PDF…");
  if (review.status === "blocked") return msg("Le PDF doit être corrigé");
  if (review.status === "failed") return msg("Le contrôle n’a pas abouti");
  return msg("Vérifiez le document et l’adresse");
}

export function PostalReviewPage({ id }: { id: string }) {
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
      <PageHeading
        title={msg("Vérifiez votre courrier.")}
        intro={msg(
          "Parcourez le PDF et vérifiez l’adresse. Le prix exact sera affiché avant votre accord d’envoi.",
        )}
      />
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
                  {msg("Actualiser")}
                </button>
              </div>
              <p role="status">
                {processing
                  ? msg(
                      "L’analyse est en cours. Aucun courrier n’a été expédié.",
                    )
                  : msg("Ce contrôle n’autorise aucune expédition.")}
              </p>
              {needsReconciliation && (
                <p className="notice info" role="status">
                  {msg(
                    "Actualisez le suivi pour vérifier le résultat avant toute autre action. Aucun transfert ne sera relancé automatiquement.",
                  )}
                </p>
              )}
              {review.transferStatus === "unknown" && (
                <p className="notice warning" role="alert">
                  {msg(
                    "Le résultat du transfert n’est pas confirmé. Ne recréez pas de brouillon : contactez l’équipe Guteneo pour vérifier celui-ci et éviter un doublon.",
                  )}
                </p>
              )}
              {review.status === "failed" && (
                <p className="notice warning">
                  {msg(
                    "Le document n’a pas pu être contrôlé entièrement. Aucun transfert n’est possible depuis cette revue.",
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
                          "Un contrôle du document a échoué. Consultez les règles de préparation et corrigez le PDF.",
                        )}
                      <small className="mono">{issue.code}</small>
                    </li>
                  ))}
                </ul>
              )}
              {["blocked", "failed"].includes(review.status) && (
                <p>
                  <a className="button" href="#/app/documents">
                    {msg("Importer un PDF corrigé")}
                  </a>
                </p>
              )}
            </section>

            <div className="postal-review-grid">
              <section
                className="postal-review-document"
                aria-labelledby="postal-document-title"
              >
                <h2 id="postal-document-title">{msg("Le PDF à imprimer")}</h2>
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
                        "{0} page(s) contrôlée(s) à {1} dpi. Parcourez toutes les pages pour vérifier leur contenu.",
                        review.checks.pages.length,
                        review.checks.dpi,
                      )
                    : msg(
                        "Le rendu de toutes les pages n’est pas encore confirmé.",
                      )}
                </p>
                <details className="postal-integrity">
                  <summary>{msg("Identifier cette version du PDF")}</summary>
                  <p>
                    {msg("Cette empreinte correspond au fichier contrôlé.")}
                  </p>
                  <code>{review.document.sha256}</code>
                </details>
              </section>
              <section
                className="postal-review-address"
                aria-labelledby="postal-address-title"
              >
                <h2 id="postal-address-title">
                  {msg("La fenêtre de l’enveloppe")}
                </h2>
                <p>
                  {review.addressPage
                    ? msg(
                        "La page d’adresse générée place le destinataire côté ",
                      )
                    : msg("L’adresse doit être imprimée dans le PDF, côté ")}
                  {review.options.addressPosition === "left"
                    ? msg("gauche")
                    : msg("droit")}
                  {review.addressPage
                    ? msg(", à la position fixe de la fenêtre de l’enveloppe.")
                    : msg(". Guteneo ne la déplace pas.")}
                </p>
                {hasCrop ? (
                  <figure className="postal-address-crop">
                    <img
                      key={cropAttempt}
                      src={cropPath}
                      alt={msg(
                        "Extrait de la première page montrant l’adresse et la zone réservée à l’affranchissement",
                      )}
                      onError={() => setCropFailed(true)}
                      onLoad={() => setCropLoaded(true)}
                    />
                    <figcaption>
                      {msg("Extrait du rendu contrôlé par Guteneo.")}
                    </figcaption>
                  </figure>
                ) : (
                  <p className="notice info">
                    {msg(
                      "L’extrait de la zone d’adresse est indisponible. Le transfert reste bloqué tant qu’il ne peut pas être vérifié.",
                    )}
                  </p>
                )}
                <div className="postal-address-comparison">
                  <div>
                    <h3>{msg("Destinataire attendu")}</h3>
                    <address>
                      {review.address.expectedLines.map((line, index) => (
                        <span key={index}>{line}</span>
                      ))}
                    </address>
                  </div>
                  <div>
                    <h3>{msg("Texte détecté dans le PDF")}</h3>
                    {review.address.extractedLines.length ? (
                      <p>
                        {review.address.extractedLines.map((line, index) => (
                          <span key={index}>{line}</span>
                        ))}
                      </p>
                    ) : (
                      <p>{msg("Aucun texte d’adresse reconnu.")}</p>
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
                        "Les textes correspondent. Vérifiez aussi dans l’image que l’adresse est visible, lisible et complète.",
                      )
                    : msg(
                        "Les adresses ne correspondent pas. Corrigez le PDF ou le destinataire avant de continuer.",
                      )}
                </p>
                <dl className="postal-print-options">
                  <div>
                    <dt>{msg("Impression")}</dt>
                    <dd>
                      {review.options.printSpectrum === "color"
                        ? msg("Couleur")
                        : msg("Noir et blanc")}{" "}
                      ·{" "}
                      {review.options.printMode === "duplex"
                        ? msg("Recto verso")
                        : msg("Recto")}
                    </dd>
                  </div>
                  <div>
                    <dt>{msg("Distribution demandée")}</dt>
                    <dd>
                      {review.options.deliveryProduct === "fast"
                        ? msg("Rapide")
                        : msg("Économique")}
                    </dd>
                  </div>
                </dl>
                <PostalCutoffNotice
                  country={review.recipient.country}
                  deliveryProduct={review.options.deliveryProduct}
                />
              </section>
            </div>

            {review.transferStatus === "prepared" ? (
              <section
                className="postal-consent"
                aria-labelledby="postal-draft-title"
              >
                <h2 id="postal-draft-title">
                  {quote.pending
                    ? msg("Nous récupérons votre devis…")
                    : msg("Votre courrier attend son devis")}
                </h2>
                <p>
                  {quote.paused
                    ? msg(
                        "L’analyse prend plus de temps que prévu. Vous pouvez reprendre la recherche du prix.",
                      )
                    : msg(
                        "Vous passerez automatiquement à la validation du prix dès que l’analyse sera terminée. Aucun courrier n’est encore expédié.",
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
                    ? msg("Calcul du devis…")
                    : msg("Reprendre le devis")}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </section>
            ) : (
              review.transferStatus === "not_started" && (
                <form
                  className="postal-consent"
                  onSubmit={(event) => void transfer(event)}
                  aria-busy={action.pending}
                >
                  <h2>{msg("Obtenir le prix de l’envoi")}</h2>
                  <p>
                    {msg(
                      "En cliquant ci-dessous, vous confirmez avoir vérifié toutes les pages, l’adresse visible dans la fenêtre et l’adresse de retour. Vous autorisez le transfert de ce PDF et de son adresse à notre prestataire d’impression pour établir le devis.",
                    )}
                  </p>
                  <button
                    className="button primary"
                    disabled={!canTransfer || action.pending}
                    aria-describedby="postal-transfer-help"
                  >
                    {action.pending
                      ? msg("Préparation du brouillon…")
                      : msg("Valider le document et obtenir le prix")}
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                  <p id="postal-transfer-help" className="field-hint">
                    {canTransfer
                      ? msg(
                          "Cette action ne déclenche aucun envoi. Vous déciderez après lecture du prix exact.",
                        )
                      : msg(
                          "Le transfert reste indisponible tant que les contrôles du PDF et l’activation du service ne sont pas terminés.",
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
