import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowClockwise } from "@phosphor-icons/react";
import { api, type Dispatch } from "./api";
import {
  ErrorNotice,
  Loading,
  PageHeading,
  PdfPreview,
  go,
  useAction,
  useResource,
} from "./components";
import "./postal-review.css";
import type { PostalReview } from "../../../packages/contracts/src/postal-review";

const issueLabels: Record<string, string> = {
  POSTAL_CORNER_CONTENT:
    "Laissez vide le coin réservé aux marques de traitement postal.",
  POSTAL_POSTAGE_CONTENT:
    "Un élément empiète sur la zone réservée à l’affranchissement.",
  POSTAL_EDGE_CONTENT:
    "Éloignez le contenu des bords : une marge vide de 5 mm est nécessaire.",
  POSTAL_ADDRESS_EMPTY:
    "Aucune adresse n’a été détectée dans la fenêtre de l’enveloppe.",
  POSTAL_ADDRESS_LINE_COUNT:
    "Réorganisez l’adresse pour respecter le nombre de lignes autorisé.",
  POSTAL_ADDRESS_LINE_TOO_LONG:
    "Raccourcissez une ligne d’adresse qui dépasse la longueur admise.",
  POSTAL_COUNTRY_LINE_REQUIRED:
    "Ajoutez le pays en dernière ligne de l’adresse internationale.",
  POSTAL_CITY_UPPERCASE_REQUIRED: "Écrivez le nom de la ville en majuscules.",
  POSTAL_POSTCODE_LINE_INVALID:
    "Vérifiez la ligne du code postal et de la ville.",
  POSTAL_ANNOTATIONS_UNSUPPORTED:
    "Supprimez ou aplatissez les annotations avant l’export.",
  POSTAL_ROTATION_UNSUPPORTED: "Exportez les pages verticales sans rotation.",
  POSTAL_A4_REQUIRED: "Utilisez une page A4 verticale (210 × 297 mm).",
  POSTAL_PDF_SIZE: "Le PDF doit peser au maximum 8 Mo.",
  POSTAL_PDF_INVALID:
    "Le PDF ne peut pas être lu complètement. Exportez une nouvelle version.",
  POSTAL_FONT_NOT_EMBEDDED:
    "Intégrez toutes les polices dans le PDF lors de l’export.",
  POSTAL_FONT_UNSUPPORTED:
    "Une police ne peut pas être contrôlée. Réexportez le document avec des polices intégrées.",
  POSTAL_INTERACTIVE_FORM:
    "Aplatissez les champs de formulaire avant l’export du PDF.",
  POSTAL_CROP_UNSUPPORTED:
    "Le cadrage du PDF masque une partie de la page. Exportez la page A4 entière.",
  POSTAL_ADDRESS_TEXT_CLIPPED:
    "Une partie de l’adresse dépasse la fenêtre de l’enveloppe.",
  POSTAL_ADDRESS_TEXT_OVERLAP:
    "Des éléments se superposent dans la zone d’adresse.",
  POSTAL_ADDRESS_TEXT_GEOMETRY_REVIEW:
    "La position du texte de l’adresse demande une vérification visuelle.",
  POSTAL_ADDRESS_MISMATCH:
    "L’adresse du PDF ne correspond pas au destinataire indiqué.",
  POSTAL_RENDER_TIMEOUT:
    "Le rendu n’a pas pu être terminé dans le délai prévu.",
  POSTAL_IMAGE_BUDGET: "Une image du PDF est trop grande pour être contrôlée.",
  POSTAL_OPTIONAL_CONTENT_UNSUPPORTED:
    "Les calques optionnels doivent être aplatis avant l’export.",
};

function statusLabel(review: PostalReview) {
  if (review.transferStatus === "unknown") return "Transfert à vérifier";
  if (review.transferStatus === "prepared") return "Brouillon créé chez Pingen";
  if (review.transferStatus === "preparing") return "Préparation du brouillon…";
  if (review.status === "processing") return "Vérification du PDF…";
  if (review.status === "blocked") return "Le PDF doit être corrigé";
  if (review.status === "failed") return "Le contrôle n’a pas abouti";
  return "Votre revue est nécessaire";
}

export function PostalReviewPage({ id }: { id: string }) {
  const path = `/postal/preflights/${encodeURIComponent(id)}`;
  const resource = useResource<PostalReview>(path);
  const action = useAction();
  const [reviewed, setReviewed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [cropFailed, setCropFailed] = useState(false);
  const [cropLoaded, setCropLoaded] = useState(false);
  const [cropAttempt, setCropAttempt] = useState(0);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const refreshBaseline = useRef<{ previous: PostalReview | undefined } | null>(
    null,
  );
  const polls = useRef(0);
  const quoteKey = useRef(crypto.randomUUID());
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const review = resource.data;
  const processing =
    review?.status === "processing" || review?.transferStatus === "preparing";

  function refreshReview() {
    if (action.pending || resource.loading) return;
    action.clear();
    setReviewed(false);
    setConsent(false);
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
      resource.refresh();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [processing, resource.loading, resource.error, resource.refresh]);

  const cropPath = `/api${path}/address.png`;
  // Only our authenticated endpoint may supply the private crop; a provider URL
  // or data URL in a response must never become a third-party image request.
  const hasCrop = review?.address.cropUrl === cropPath && !cropFailed;
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
    if (!canTransfer || !reviewed || !consent || action.pending) return;
    setReviewed(false);
    setConsent(false);
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
  }
  async function quote() {
    if (
      review?.transferStatus !== "prepared" ||
      action.pending ||
      resource.loading ||
      resource.error ||
      needsReconciliation
    )
      return;
    await action.run(async () => {
      const dispatch = await api<Dispatch>(`${path}/quote`, {
        method: "POST",
        key: quoteKey.current,
      });
      go(`/app/dispatch/${encodeURIComponent(dispatch.id)}`);
    });
  }

  return (
    <>
      <PageHeading
        title="Le courrier, à la bonne adresse."
        intro="Vérifiez le document avant de le confier à Pingen pour analyse. Vous approuverez l’expédition après le devis."
      />
      <ErrorNotice error={resource.error} retry={refreshReview} />
      <ErrorNotice error={action.error} />
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
                  <p className="eyebrow">Contrôle avant impression</p>
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
                  disabled={resource.loading || action.pending}
                  onClick={refreshReview}
                >
                  <ArrowClockwise size={17} aria-hidden="true" />
                  Actualiser
                </button>
              </div>
              <p role="status">
                {processing
                  ? "L’analyse est en cours. Aucun courrier n’a été expédié."
                  : "Ce contrôle n’autorise aucune expédition."}
              </p>
              {needsReconciliation && (
                <p className="notice info" role="status">
                  Actualisez le suivi pour vérifier le résultat avant toute
                  autre action. Aucun transfert ne sera relancé automatiquement.
                </p>
              )}
              {review.transferStatus === "unknown" && (
                <p className="notice warning" role="alert">
                  Le résultat du transfert n’est pas confirmé. Ne recréez pas de
                  brouillon : contactez l’équipe Guteneo pour vérifier celui-ci
                  et éviter un doublon.
                </p>
              )}
              {review.status === "failed" && (
                <p className="notice warning">
                  Le document n’a pas pu être contrôlé entièrement. Aucun
                  transfert n’est possible depuis cette revue.
                </p>
              )}
              {!!review.checks.issues.length && (
                <ul className="postal-issues">
                  {review.checks.issues.map((issue, index) => (
                    <li key={`${issue.code}-${issue.page ?? 0}-${index}`}>
                      {issue.page ? (
                        <strong>Page {issue.page} · </strong>
                      ) : null}
                      {issueLabels[issue.code] ??
                        "Un contrôle du document a échoué. Consultez les règles de préparation et corrigez le PDF."}
                      <small className="mono">{issue.code}</small>
                    </li>
                  ))}
                </ul>
              )}
              {["blocked", "failed"].includes(review.status) && (
                <p>
                  <a className="button" href="#/app/documents">
                    Importer un PDF corrigé
                  </a>
                </p>
              )}
            </section>

            <div className="postal-review-grid">
              <section
                className="postal-review-document"
                aria-labelledby="postal-document-title"
              >
                <h2 id="postal-document-title">Le PDF à imprimer</h2>
                <p className="postal-document-name">{review.document.name}</p>
                <PdfPreview id={review.document.id} />
                <p className="field-hint">
                  {review.checks.complete
                    ? `${review.checks.pages.length} page(s) contrôlée(s) à ${review.checks.dpi} dpi. Parcourez toutes les pages pour vérifier leur contenu.`
                    : "Le rendu de toutes les pages n’est pas encore confirmé."}
                </p>
                <details className="postal-integrity">
                  <summary>Identifier cette version du PDF</summary>
                  <p>Cette empreinte correspond au fichier contrôlé.</p>
                  <code>{review.document.sha256}</code>
                </details>
              </section>
              <section
                className="postal-review-address"
                aria-labelledby="postal-address-title"
              >
                <h2 id="postal-address-title">La fenêtre de l’enveloppe</h2>
                <p>
                  L’adresse doit être imprimée dans le PDF, côté{" "}
                  {review.options.addressPosition === "left"
                    ? "gauche"
                    : "droit"}
                  . Guteneo ne la déplace pas.
                </p>
                {hasCrop ? (
                  <figure className="postal-address-crop">
                    <img
                      key={cropAttempt}
                      src={cropPath}
                      alt="Extrait de la première page montrant l’adresse et la zone réservée à l’affranchissement"
                      onError={() => setCropFailed(true)}
                      onLoad={() => setCropLoaded(true)}
                    />
                    <figcaption>
                      Extrait du rendu contrôlé par Guteneo.
                    </figcaption>
                  </figure>
                ) : (
                  <p className="notice info">
                    L’extrait de la zone d’adresse est indisponible. Le
                    transfert reste bloqué tant qu’il ne peut pas être vérifié.
                  </p>
                )}
                <div className="postal-address-comparison">
                  <div>
                    <h3>Destinataire attendu</h3>
                    <address>
                      {review.address.expectedLines.map((line, index) => (
                        <span key={index}>{line}</span>
                      ))}
                    </address>
                  </div>
                  <div>
                    <h3>Texte détecté dans le PDF</h3>
                    {review.address.extractedLines.length ? (
                      <p>
                        {review.address.extractedLines.map((line, index) => (
                          <span key={index}>{line}</span>
                        ))}
                      </p>
                    ) : (
                      <p>Aucun texte d’adresse reconnu.</p>
                    )}
                  </div>
                </div>
                <p
                  className={
                    review.address.matches ? "field-hint" : "notice warning"
                  }
                >
                  {review.address.matches
                    ? "Les textes correspondent. Vérifiez aussi dans l’image que l’adresse est visible, lisible et complète."
                    : "Les adresses ne correspondent pas. Corrigez le PDF ou le destinataire avant de continuer."}
                </p>
                <dl className="postal-print-options">
                  <div>
                    <dt>Impression</dt>
                    <dd>
                      {review.options.printSpectrum === "color"
                        ? "Couleur"
                        : "Noir et blanc"}{" "}
                      ·{" "}
                      {review.options.printMode === "duplex"
                        ? "Recto verso"
                        : "Recto"}
                    </dd>
                  </div>
                  <div>
                    <dt>Distribution demandée</dt>
                    <dd>
                      {review.options.deliveryProduct === "fast"
                        ? "Rapide"
                        : "Économique"}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            {review.transferStatus === "prepared" ? (
              <section
                className="postal-consent"
                aria-labelledby="postal-draft-title"
              >
                <h2 id="postal-draft-title">
                  Le PDF est déposé, le courrier n’est pas envoyé.
                </h2>
                <p>
                  Pingen doit terminer son analyse avant de fournir un devis. Le
                  prix, le destinataire et le contenu seront ensuite présentés
                  pour votre accord.
                </p>
                <button
                  className="button primary"
                  type="button"
                  disabled={
                    action.pending ||
                    resource.loading ||
                    !!resource.error ||
                    needsReconciliation
                  }
                  onClick={() => void quote()}
                >
                  {action.pending ? "Calcul du devis…" : "Obtenir le devis"}
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
                  <h2>Confier ce document à Pingen</h2>
                  <p>
                    Le PDF et son adresse seront transmis à Pingen pour créer un
                    brouillon et obtenir son analyse. Cette étape n’autorise ni
                    l’impression ni l’expédition.
                  </p>
                  <label className="postal-check">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      disabled={!canTransfer || action.pending}
                      onChange={(event) => setReviewed(event.target.checked)}
                    />
                    <span>
                      J’ai parcouru toutes les pages, vérifié l’adresse visible
                      dans la fenêtre et l’adresse de retour.
                    </span>
                  </label>
                  <label className="postal-check">
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={!canTransfer || action.pending}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    <span>
                      J’autorise le transfert de ce PDF à Pingen pour préparer
                      le brouillon et le devis.
                    </span>
                  </label>
                  <button
                    className="button primary"
                    disabled={
                      !canTransfer || !reviewed || !consent || action.pending
                    }
                    aria-describedby="postal-transfer-help"
                  >
                    {action.pending
                      ? "Préparation du brouillon…"
                      : "Transmettre pour analyse"}
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                  <p id="postal-transfer-help" className="field-hint">
                    {canTransfer
                      ? "Les deux confirmations sont nécessaires. Vous approuverez l’envoi à l’étape suivante, après lecture du devis."
                      : "Le transfert reste indisponible tant que les contrôles du PDF et l’activation du service ne sont pas terminés."}
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
